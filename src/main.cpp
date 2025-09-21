#include <windows.h>
#include <string>
#include <filesystem>
#include <fstream>
#include <streambuf>
#include <functional>
#include <debugapi.h>
#include <functional>
#include "resources.h" // 由CMake生成
#include <shlobj.h> // For SHGetFolderPath
#include <shlwapi.h>
#pragma comment(lib, "shlwapi.lib")

#include <dwmapi.h>
#pragma comment(lib, "dwmapi.lib")
#include "nlohmann/json.hpp"

#include <ShellScalingApi.h>
#include <WebView2EnvironmentOptions.h>
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


// Helper to convert string to wstring
inline std::wstring string_to_wstring(const std::string& str) {
    if (str.empty()) return std::wstring();
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}


// 根据文件扩展名获取MIME类型
std::wstring GetMimeType(const std::wstring& path) {
    const wchar_t* ext = PathFindExtensionW(path.c_str());
    if (ext == nullptr) return L"application/octet-stream";

    if (_wcsicmp(ext, L".html") == 0) return L"text/html; charset=utf-8";
    if (_wcsicmp(ext, L".css") == 0) return L"text/css; charset=utf-8";
    if (_wcsicmp(ext, L".js") == 0) return L"application/javascript; charset=utf-8";
    if (_wcsicmp(ext, L".json") == 0) return L"application/json; charset=utf-8";
    if (_wcsicmp(ext, L".png") == 0) return L"image/png";
    if (_wcsicmp(ext, L".jpg") == 0 || _wcsicmp(ext, L".jpeg") == 0) return L"image/jpeg";
    if (_wcsicmp(ext, L".gif") == 0) return L"image/gif";
    if (_wcsicmp(ext, L".svg") == 0) return L"image/svg+xml";
    if (_wcsicmp(ext, L".woff2") == 0) return L"font/woff2";

    return L"application/octet-stream";
}

// 从资源中加载数据并创建IStream
wil::com_ptr<IStream> StreamFromResource(int resource_id) {
    HRSRC hRes = FindResource(nullptr, MAKEINTRESOURCE(resource_id), RT_RCDATA);
    if (!hRes) return nullptr;

    HGLOBAL hGlob = LoadResource(nullptr, hRes);
    if (!hGlob) return nullptr;

    void* pData = LockResource(hGlob);
    if (!pData) return nullptr;

    DWORD dwSize = SizeofResource(nullptr, hRes);
    if (dwSize == 0) return nullptr;

    return wil::com_ptr<IStream>(SHCreateMemStream(static_cast<const BYTE*>(pData), dwSize));
}


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

    CreateCoreWebView2EnvironmentWithOptions(nullptr, nullptr, nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [hWnd](HRESULT result, ICoreWebView2Environment* env) -> HRESULT {

                env->CreateCoreWebView2Controller(hWnd, Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                    [hWnd, env](HRESULT result, ICoreWebView2Controller* controller) -> HRESULT {
                        if (controller != nullptr) {
                            webviewController = controller;
                            webviewController->get_CoreWebView2(&webview);
                        }

                        ICoreWebView2Settings* settings;
                        webview->get_Settings(&settings);
                        settings->put_IsScriptEnabled(TRUE);
                        settings->put_AreDefaultContextMenusEnabled(FALSE);
                        settings->put_IsZoomControlEnabled(FALSE);
#ifdef _DEBUG
                        settings->put_AreDevToolsEnabled(TRUE);
#else
                        settings->put_AreDevToolsEnabled(FALSE);
#endif

                        RECT bounds;
                        GetClientRect(hWnd, &bounds);
                        webviewController->put_Bounds(bounds);

                        // +++ 设置Web资源请求过滤器 +++
                        webview->AddWebResourceRequestedFilter(L"https://veritnote.app/*", COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);

                        EventRegistrationToken webResourceToken;
                        webview->add_WebResourceRequested(Callback<ICoreWebView2WebResourceRequestedEventHandler>(
                            [env](ICoreWebView2* sender, ICoreWebView2WebResourceRequestedEventArgs* args) -> HRESULT {
                                wil::com_ptr<ICoreWebView2WebResourceRequest> request;
                                args->get_Request(&request);

                                LPWSTR uri_ptr;
                                request->get_Uri(&uri_ptr);
                                std::wstring uri(uri_ptr);
                                CoTaskMemFree(uri_ptr);

                                std::wstring VIRTUAL_DOMAIN = L"https://veritnote.app";

                                if (uri.rfind(VIRTUAL_DOMAIN, 0) == 0) {
                                    std::wstring path = uri.substr(VIRTUAL_DOMAIN.length());

                                    // --- 核心修改：检查是否是我们的特殊本地文件路径 ---
                                    std::wstring local_file_prefix = L"/local-file/";
                                    if (path.rfind(local_file_prefix, 0) == 0) {
                                        // 是本地文件请求！
                                        std::wstring encoded_path = path.substr(local_file_prefix.length());

                                        // URL解码
                                        std::string encoded_path_str = wstring_to_string_main(encoded_path);
                                        char decoded_path_cstr[MAX_PATH];
                                        DWORD decoded_len = MAX_PATH;

                                        if (UrlUnescapeA((char*)encoded_path_str.c_str(), decoded_path_cstr, &decoded_len, 0) == S_OK) {
                                            std::wstring localPath = string_to_wstring(std::string(decoded_path_cstr, decoded_len));

                                            // 现在我们有了真正的本地路径，从文件创建流
                                            if (PathFileExistsW(localPath.c_str())) {
                                                wil::com_ptr<IStream> stream;
                                                if (SUCCEEDED(SHCreateStreamOnFileEx(localPath.c_str(), STGM_READ | STGM_SHARE_DENY_WRITE, 0, FALSE, nullptr, &stream))) {
                                                    wil::com_ptr<ICoreWebView2WebResourceResponse> response;
                                                    env->CreateWebResourceResponse(
                                                        stream.get(), 200, L"OK",
                                                        (L"Content-Type: " + GetMimeType(localPath)).c_str(),
                                                        &response);
                                                    args->put_Response(response.get());
                                                    return S_OK;
                                                }
                                            }
                                        }
                                    }
                                    else {
                                        // --- 不是本地文件请求，是我们自己的内部资源 ---
                                        auto it = g_resource_map.find(path);
                                        if (it != g_resource_map.end()) {
                                            auto stream = StreamFromResource(it->second);
                                            if (stream) {
                                                wil::com_ptr<ICoreWebView2WebResourceResponse> response;
                                                env->CreateWebResourceResponse(
                                                    stream.get(), 200, L"OK",
                                                    (L"Content-Type: " + GetMimeType(path)).c_str(),
                                                    &response);
                                                args->put_Response(response.get());
                                                return S_OK;
                                            }
                                        }
                                    }
                                }

                                // 所有处理都失败了，返回 404
                                wil::com_ptr<ICoreWebView2WebResourceResponse> response;
                                env->CreateWebResourceResponse(nullptr, 404, L"Not Found", L"", &response);
                                args->put_Response(response.get());
                                return S_OK;
                            }).Get(), &webResourceToken);

                        // --- 初始导航 ---
                        std::wstring htmlPath = L"https://veritnote.app/dashboard.html";
                        webview->Navigate(htmlPath.c_str());

                        // ... 后续的 NavigationCompleted, WebMessageReceived, NavigationStarting 逻辑保持原样 ...
                        // (这些部分的代码不需要修改)

                        EventRegistrationToken navigationToken;
                        webview->add_NavigationCompleted(Callback<ICoreWebView2NavigationCompletedEventHandler>(
                            [](ICoreWebView2* sender, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                                BOOL success;
                                args->get_IsSuccess(&success);

                                if (success && !g_nextWorkspacePath.empty()) {
                                    std::wstring escapedPath;
                                    for (wchar_t c : g_nextWorkspacePath) {
                                        if (c == L'\\') escapedPath += L"\\\\";
                                        else if (c == L'"') escapedPath += L"\\\"";
                                        else escapedPath += c;
                                    }
                                    std::wstring script = L"window.initializeWorkspace(\"" + escapedPath + L"\");";
                                    sender->ExecuteScript(script.c_str(), nullptr);
                                    g_nextWorkspacePath.clear();
                                }
                                return S_OK;
                            }).Get(), &navigationToken);

                        EventRegistrationToken token;
                        webview->add_WebMessageReceived(Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                            [](ICoreWebView2* webview, ICoreWebView2WebMessageReceivedEventArgs* args) -> HRESULT {
                                LPWSTR message_ptr = nullptr;
                                args->get_WebMessageAsJson(&message_ptr);
                                if (message_ptr) {
                                    std::wstring message(message_ptr);
                                    CoTaskMemFree(message_ptr);
                                    backend.HandleWebMessage(message);
                                }
                                return S_OK;
                            }).Get(), &token);

                        backend.SetWebView(webview.get());
                        backend.SetMainWindowHandle(hWnd);

                        EventRegistrationToken navigationStartingToken;
                        webview->add_NavigationStarting(Callback<ICoreWebView2NavigationStartingEventHandler>(
                            [](ICoreWebView2* sender, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
                                LPWSTR uri_ptr;
                                args->get_Uri(&uri_ptr);
                                std::wstring uri(uri_ptr);
                                CoTaskMemFree(uri_ptr);

                                if (uri.rfind(L"https://veritnote.app", 0) == 0) {
                                    return S_OK;
                                }

                                args->put_Cancel(TRUE);
                                backend.OpenExternalLink(uri);

                                return S_OK;
                            }).Get(), &navigationStartingToken);


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