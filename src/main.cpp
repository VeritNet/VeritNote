#include <windows.h>
#include <string>
#include <filesystem>
#include <fstream>
#include <streambuf>
#include <functional>
#include <debugapi.h>
#include <functional>
#include <shlobj.h> // For SHGetFolderPath

#include <dwmapi.h>
#pragma comment(lib, "dwmapi.lib")
#include "nlohmann/json.hpp"

#include <ShellScalingApi.h>
#include <windowsx.h>
#pragma comment(lib, "Shcore.lib")

#include "Backend.h"
using namespace Microsoft::WRL;

// 全局变量
static wil::com_ptr<ICoreWebView2Controller> webviewController;
static wil::com_ptr<ICoreWebView2> webview;
static Backend backend; // 我们的后端逻辑处理实例
static HWND global_hWnd;
extern std::wstring g_nextWorkspacePath;

static RECT g_border_thickness;


std::string wstring_to_string_main(const std::wstring& wstr) {
    if (wstr.empty()) return std::string();
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}


// 函数声明
LRESULT CALLBACK WndProc(HWND, UINT, WPARAM, LPARAM);
std::wstring GetExePath();
std::wstring OpenWorkspaceFolderDialog(HWND hWnd);


// WinMain: Windows应用程序入口
int APIENTRY wWinMain(_In_ HINSTANCE hInstance,
    _In_opt_ HINSTANCE hPrevInstance,
    _In_ LPWSTR    lpCmdLine,
    _In_ int       nCmdShow)
{
    // 高 DPI 感知
    SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE);

    // 注册窗口类
    WNDCLASSEXW wcex = {};
    wcex.cbSize = sizeof(WNDCLASSEX);
    wcex.style = CS_HREDRAW | CS_VREDRAW;
    wcex.lpfnWndProc = WndProc;
    wcex.hInstance = hInstance;
    wcex.hIcon = LoadIcon(nullptr, IDI_APPLICATION);
    wcex.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wcex.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wcex.lpszClassName = L"VeritNoteWindowClass";
    RegisterClassExW(&wcex);

    // 创建窗口
    HWND hWnd = CreateWindowExW(
        0, L"VeritNoteWindowClass", L"VeritNote",
        WS_OVERLAPPEDWINDOW, // 这个样式包含了启用动画所需的一切
        CW_USEDEFAULT, 0, 1280, 800,
        nullptr, nullptr, hInstance, nullptr);

    if (!hWnd)
    {
        return FALSE;
    }

    global_hWnd = hWnd;

    BOOL useDarkMode = TRUE;
    DwmSetWindowAttribute(
        hWnd, DWMWA_USE_IMMERSIVE_DARK_MODE,
        &useDarkMode, sizeof(useDarkMode)
    );

    ShowWindow(hWnd, nCmdShow);
    UpdateWindow(hWnd);

    // --- WebView2 初始化 ---
    // 设置 WebView2 环境，完成后创建 WebView2 控件
    CreateCoreWebView2EnvironmentWithOptions(nullptr, nullptr, nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [hWnd](HRESULT result, ICoreWebView2Environment* env) -> HRESULT {

                // 从环境创建 WebView2 Controller
                env->CreateCoreWebView2Controller(hWnd, Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                    [hWnd](HRESULT result, ICoreWebView2Controller* controller) -> HRESULT {
                        if (controller != nullptr) {
                            webviewController = controller;
                            webviewController->get_CoreWebView2(&webview);
                        }

                        // 设置 WebView2 的默认设置
                        ICoreWebView2Settings* settings;
                        webview->get_Settings(&settings);
                        settings->put_IsScriptEnabled(TRUE);
                        settings->put_AreDefaultContextMenusEnabled(FALSE); // 可选：禁用默认右键菜单
                        settings->put_IsZoomControlEnabled(FALSE); // 可选：禁用缩放
#ifdef _DEBUG
                        settings->put_AreDevToolsEnabled(TRUE); // 调试模式下开启 F12 开发者工具
#else
                        settings->put_AreDevToolsEnabled(FALSE);
#endif

                        // 将 WebView2 控件的大小设置为与父窗口相同
                        RECT bounds;
                        GetClientRect(hWnd, &bounds);
                        webviewController->put_Bounds(bounds);

                        // 获取可执行文件所在目录，并构建前端 html 的路径
                        std::wstring exePath = GetExePath();
                        std::wstring htmlPath = exePath + L"\\webview_ui\\dashboard.html";

                        // WebView2 导航到我们的本地 HTML 文件
                        webview->Navigate(htmlPath.c_str());


                        EventRegistrationToken navigationToken;
                        webview->add_NavigationCompleted(Callback<ICoreWebView2NavigationCompletedEventHandler>(
                            [](ICoreWebView2* sender, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                                BOOL success;
                                args->get_IsSuccess(&success);

                                if (success && !g_nextWorkspacePath.empty()) {
                                    // Navigation to a new page (likely index.html) is complete.
                                    // Now, inject the workspace path.

                                    // Escape the path for JavaScript string
                                    std::wstring escapedPath;
                                    for (wchar_t c : g_nextWorkspacePath) {
                                        if (c == L'\\') {
                                            escapedPath += L"\\\\";
                                        }
                                        else if (c == L'"') {
                                            escapedPath += L"\\\"";
                                        }
                                        else {
                                            escapedPath += c;
                                        }
                                    }

                                    // Call a global JS function to initialize the workspace
                                    std::wstring script = L"window.initializeWorkspace(\"" + escapedPath + L"\");";
                                    sender->ExecuteScript(script.c_str(), nullptr);

                                    // Clear the path so it's not reused on next navigation
                                    g_nextWorkspacePath.clear();
                                }
                                return S_OK;
                            }).Get(), &navigationToken);


                        // --- 关键：设置 WebMessageReceived 事件处理器 ---
                        // 这是前端 JS 向后端 C++ 发送消息的通道
                        EventRegistrationToken token;
                        webview->add_WebMessageReceived(Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                            [](ICoreWebView2* webview, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
                                LPWSTR message_ptr = nullptr; // 使用标准的 LPWSTR 并初始化为 nullptr
                                args->get_WebMessageAsJson(&message_ptr);
                                if (message_ptr) { // 增加一个空指针检查，更安全
                                    std::wstring message(message_ptr);
                                    CoTaskMemFree(message_ptr); // 释放内存

                                    // 将消息交给我们的 Backend 类处理
                                    backend.HandleWebMessage(message);
                                }

                                return S_OK;
                            }).Get(), &token);

                        // 将 webview 实例传递给 backend，以便后端可以向前端发送消息
                        backend.SetWebView(webview.get());
                        backend.SetMainWindowHandle(hWnd);


                        return S_OK;
                    }).Get());
                return S_OK;
            }).Get());


    // 主消息循环
    MSG msg;
    while (GetMessage(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    return (int)msg.wParam;
}

// 窗口过程函数，处理窗口消息
LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
    // 你的方案：根据全屏状态动态决定要使用的边框厚度
    RECT current_border_thickness = { 0, 0, 0, 0 };
    if (!backend.IsFullscreen()) {
        current_border_thickness = g_border_thickness;
    }

    switch (message) {
    case WM_CREATE:
    {
        global_hWnd = hWnd;
        backend.SetMainWindowHandle(hWnd);

        // 计算并缓存初始的边框厚度
        SetRectEmpty(&g_border_thickness);
        AdjustWindowRectEx(&g_border_thickness, GetWindowLongPtr(hWnd, GWL_STYLE) & ~WS_CAPTION, FALSE, 0);
        g_border_thickness.left *= -1;
        g_border_thickness.top *= -1;

        MARGINS margins = { -1 };
        DwmExtendFrameIntoClientArea(hWnd, &margins);

        SetWindowPos(hWnd, NULL, 0, 0, 0, 0, SWP_SHOWWINDOW | SWP_NOMOVE | SWP_NOSIZE | SWP_FRAMECHANGED);
        break;
    }

    case WM_NCCALCSIZE:
    {
        if (wParam == TRUE && lParam) {
            auto& params = *reinterpret_cast<NCCALCSIZE_PARAMS*>(lParam);

            // 使用动态计算的边框厚度
            params.rgrc[0].left += current_border_thickness.left;
            params.rgrc[0].right -= current_border_thickness.right;
            params.rgrc[0].bottom -= current_border_thickness.bottom;

            return 0;
        }
        break;
    }

    case WM_NCHITTEST:
    {
        // 我们不再需要在这里单独检查全屏，因为 current_border_thickness 已经是 0 了
        // 这会让所有的命中测试都失败，最终返回 HTCLIENT，这正是全屏时想要的效果

        LRESULT result;
        if (DwmDefWindowProc(hWnd, message, wParam, lParam, &result)) {
            return result;
        }

        POINT pt = { GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam) };
        ScreenToClient(hWnd, &pt);
        RECT rc;
        GetClientRect(hWnd, &rc);

        // 只在非最大化时允许缩放
        if (!IsZoomed(hWnd)) {
            // 使用动态计算的边框厚度
            bool on_left = pt.x < current_border_thickness.left;
            bool on_right = pt.x >= rc.right - current_border_thickness.right;
            bool on_top = pt.y < current_border_thickness.top;
            bool on_bottom = pt.y >= rc.bottom - current_border_thickness.bottom;

            if (on_top && on_left) return HTTOPLEFT;
            if (on_top && on_right) return HTTOPRIGHT;
            if (on_bottom && on_left) return HTBOTTOMLEFT;
            if (on_bottom && on_right) return HTBOTTOMRIGHT;
            if (on_left) return HTLEFT;
            if (on_right) return HTRIGHT;
            if (on_top) return HTTOP;
            if (on_bottom) return HTBOTTOM;
        }

        return HTCLIENT;
    }

    case WM_SIZE:
        if (webviewController != nullptr) {
            RECT bounds;
            GetClientRect(hWnd, &bounds);
            webviewController->put_Bounds(bounds);
        }
        if (wParam != SIZE_MINIMIZED) {
            backend.CheckWindowState();
        }
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }

    return DefWindowProc(hWnd, message, wParam, lParam);
}

// 弹出选择文件夹对话框
std::wstring OpenWorkspaceFolderDialog(HWND hWnd) {
    IFileOpenDialog* pfd;
    std::wstring selectedPath = L"";

    if (SUCCEEDED(CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE))) {
        if (SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog, NULL, CLSCTX_ALL, IID_IFileOpenDialog, reinterpret_cast<void**>(&pfd)))) {
            DWORD dwOptions;
            if (SUCCEEDED(pfd->GetOptions(&dwOptions))) {
                pfd->SetOptions(dwOptions | FOS_PICKFOLDERS);
            }
            pfd->SetTitle(L"请选择 VeritNote 工作区文件夹");

            if (SUCCEEDED(pfd->Show(hWnd))) {
                IShellItem* psi;
                if (SUCCEEDED(pfd->GetResult(&psi))) {
                    PWSTR pszFilePath = NULL;
                    if (SUCCEEDED(psi->GetDisplayName(SIGDN_FILESYSPATH, &pszFilePath))) {
                        selectedPath = pszFilePath;
                        CoTaskMemFree(pszFilePath);
                    }
                    psi->Release();
                }
            }
            pfd->Release();
        }
        CoUninitialize();
    }
    return selectedPath;
}