#include "Win_Backend.h"
#include "resources.h" // For g_resource_map
#include <ShlObj.h>
#include <Shlwapi.h>
#pragma comment(lib, "shlwapi.lib")
#include <shellapi.h>
#include <urlmon.h>
#include <fstream>
#include <sstream>
#include <include/Platform.h>

#pragma comment(lib, "urlmon.lib")

// Helper to convert  wstring <--> string
std::string WinBackend::wstring_to_string(const std::wstring& wstr) const {
    if (wstr.empty()) return std::string();
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

std::wstring WinBackend::string_to_wstring(const std::string& str) const {
    if (str.empty()) return std::wstring();
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}

bool WinBackend::UrlDecode(const std::string& encoded, std::string& decoded) const {
    char decoded_buffer[MAX_PATH]; // MAX_PATH 在这里是合法的
    DWORD decoded_len = MAX_PATH;

    // 使用 const_cast 是因为 UrlUnescapeA 的第一个参数不是 const char*
    if (UrlUnescapeA(const_cast<char*>(encoded.c_str()), decoded_buffer, &decoded_len, 0) == S_OK) {
        decoded.assign(decoded_buffer, decoded_len);
        return true;
    }
    return false;
}


static std::wstring GetMimeType_Backend(const std::wstring& path) {
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

// 获取可执行文件所在的目录
static std::wstring GetExePath() {
    wchar_t path[MAX_PATH] = { 0 };
    GetModuleFileNameW(NULL, path, MAX_PATH);
    *wcsrchr(path, L'\\') = L'\0';
    return path;
}

WinBackend::WinBackend() {}

bool WinBackend::LoadResourceData(int resource_id, void*& pData, DWORD& dwSize) {
    HRSRC hRes = FindResource(nullptr, MAKEINTRESOURCE(resource_id), RT_RCDATA);
    if (!hRes) return false;

    HGLOBAL hGlob = LoadResource(nullptr, hRes);
    if (!hGlob) return false;

    pData = LockResource(hGlob);
    if (!pData) return false;

    dwSize = SizeofResource(nullptr, hRes);
    return dwSize > 0;
}

void WinBackend::SetWebView(ICoreWebView2* webview) {
    m_webview = webview;
}

void WinBackend::SetMainWindowHandle(HWND hWnd) {
    m_hWnd = hWnd;
}

std::wstring WinBackend::GetNextWorkspacePath() const {
    return m_nextWorkspacePath;
}

void WinBackend::ClearNextWorkspacePath() {
    m_nextWorkspacePath.clear();
}

void WinBackend::SendMessageToJS(const json& message) {
    if (m_webview) {
        std::string json_str = message.dump();
        m_webview->PostWebMessageAsJson(this->string_to_wstring(json_str).c_str());
    }
}

void WinBackend::NavigateTo(const std::wstring& url) {
    if (m_webview) {
        m_webview->Navigate(url.c_str());
    }
}

void WinBackend::OpenFileDialog() {
    // 这部分代码与旧 Backend.cpp 中的实现完全相同
    IFileOpenDialog* pfd;
    std::wstring selectedPath = L"";

    if (SUCCEEDED(CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE))) {
        if (SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog, NULL, CLSCTX_ALL, IID_IFileOpenDialog, reinterpret_cast<void**>(&pfd)))) {
            COMDLG_FILTERSPEC fileTypes[] = {
                { L"Image Files", L"*.jpg;*.jpeg;*.png;*.gif;*.bmp;*.webp" },
                { L"All Files", L"*. *" }
            };
            pfd->SetFileTypes(ARRAYSIZE(fileTypes), fileTypes);
            pfd->SetTitle(L"选择图片文件");

            if (SUCCEEDED(pfd->Show(m_hWnd))) {
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

    std::filesystem::path imagePath(selectedPath);
    std::filesystem::path workspacePath(m_workspaceRoot);
    std::string finalPathStr;

    if (!m_workspaceRoot.empty() && imagePath.wstring().find(workspacePath.wstring()) == 0) {
        finalPathStr = std::filesystem::relative(imagePath, workspacePath).string();
        std::replace(finalPathStr.begin(), finalPathStr.end(), '\\', '/');
    }
    else {
        std::string path_utf8 = this->wstring_to_string(selectedPath);
        std::ostringstream encoded;
        encoded << std::hex;
        for (char c : path_utf8) {
            if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~' || c == '/' || c == ':') {
                encoded << c;
            }
            else {
                encoded << '%' << std::setw(2) << std::setfill('0') << (int)(unsigned char)c;
            }
        }
        finalPathStr = "https://veritnote.app/local-file/" + encoded.str();
    }

    SendMessageToJS({ {"action", "fileDialogClosed"}, {"payload", {{"path", finalPathStr}}} });
}


void WinBackend::OpenWorkspace(const json& payload) {
    // 1. 从 payload 中提取路径
    std::string path = payload.value("path", "");
    if (path.empty()) return;

    // 2. 【核心】将路径保存到 m_nextWorkspacePath，以便在导航完成后注入
    m_nextWorkspacePath = this->string_to_wstring(path);

    // 3. 调用基类的 OpenWorkspace 实现来处理通用逻辑
    //    (这会设置 m_workspaceRoot 并调用 NavigateTo)
    Backend::OpenWorkspace(payload);
}


void WinBackend::OpenWorkspaceDialog() {
    IFileOpenDialog* pfd;
    if (SUCCEEDED(CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE))) {
        if (SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog, NULL, CLSCTX_ALL, IID_IFileOpenDialog, reinterpret_cast<void**>(&pfd)))) {
            DWORD dwOptions;
            if (SUCCEEDED(pfd->GetOptions(&dwOptions))) {
                pfd->SetOptions(dwOptions | FOS_PICKFOLDERS);
            }
            // pfd->SetTitle(...)  <-- 这行可以保留，也可以删除，不影响功能

            // 只在用户点击 "OK" (S_OK) 时才继续
            if (SUCCEEDED(pfd->Show(m_hWnd))) {
                IShellItem* psi;
                if (SUCCEEDED(pfd->GetResult(&psi))) {
                    PWSTR pszFilePath = NULL;
                    if (SUCCEEDED(psi->GetDisplayName(SIGDN_FILESYSPATH, &pszFilePath))) {
                        json payload;
                        payload["path"] = this->wstring_to_string(std::wstring(pszFilePath));

                        json message;
                        message["action"] = "workspaceDialogClosed";
                        message["payload"] = payload;

                        SendMessageToJS(message);

                        CoTaskMemFree(pszFilePath);
                    }
                    psi->Release();
                }
            }
            // 如果用户取消对话框 (pfd->Show 返回 S_FALSE)，我们什么都不做。
            pfd->Release();
        }
        CoUninitialize();
    }
}


void WinBackend::ListWorkspace(const json& payload) {
    json response;
    response["action"] = "workspaceListed";

    std::function<json(const std::filesystem::path&)> scan_dir =
        [&](const std::filesystem::path& dir_path) -> json {
        json tree_node;
        tree_node["name"] = dir_path.filename().string();
        tree_node["path"] = dir_path.string();
        tree_node["type"] = "folder";
        tree_node["children"] = json::array();

        for (const auto& entry : std::filesystem::directory_iterator(dir_path)) {
            if (entry.is_directory()) {
                if (entry.path().filename() == "build") {
                    continue;
                }
                tree_node["children"].push_back(scan_dir(entry.path()));
            }
            else if (entry.is_regular_file() && entry.path().extension() == ".veritnote") {
                json file_node;
                file_node["name"] = entry.path().stem().string();
                file_node["path"] = entry.path().string();
                file_node["type"] = "page";
                tree_node["children"].push_back(file_node);
            }
        }
        return tree_node;
        };

    try {
        if (!m_workspaceRoot.empty()) {
            response["payload"] = scan_dir(m_workspaceRoot);

            // 【核心修改】检查工作区是否为空
            if (response["payload"]["children"].empty()) {
                // 如果为空，从资源中提取示例文件
                std::filesystem::path destFilePath = std::filesystem::path(m_workspaceRoot) / "welcome.veritnote";

                // v--- 使用新的正确方法 ---v
                // 我们调用 ExtractResourceToFile，它会从EXE内部找到资源并写入到目标路径
                if (ExtractResourceToFile(L"/welcome.veritnote", destFilePath)) {
                    // 【关键】提取成功后，重新扫描工作区以包含新文件
                    response["payload"] = scan_dir(m_workspaceRoot);
                }
                // 如果提取失败，我们就不再重新扫描，前端会看到一个空的工作区，这也是合理的行为
            }
        }
        else {
            response["error"] = "Workspace root not set.";
        }
    }
    catch (const std::exception& e) {
        response["error"] = e.what();
    }

    // ... 后续的 Debug 输出和 SendMessageToJS 保持不变 ...
    std::string debug_json_string = response.dump(2);
    LOG_DEBUG("--- C++ Backend --- \n");
    LOG_DEBUG("Sending to JS: \n");
    LOG_DEBUG(debug_json_string.c_str());
    LOG_DEBUG("\n---------------------\n");

    SendMessageToJS(response);
}

void WinBackend::LoadPage(const json& payload) {
    std::string path_str = payload.value("path", "");
    std::filesystem::path pagePath(path_str);

    bool fromPreview = payload.value("fromPreview", false);

    // ** THE CORE FIX: A safer way to extract an optional string value **
    std::string blockIdToFocus = ""; // Initialize with a default empty string
    if (payload.contains("blockIdToFocus") && payload["blockIdToFocus"].is_string()) {
        blockIdToFocus = payload["blockIdToFocus"].get<std::string>();
    }

    json response;
    response["action"] = "pageLoaded";
    response["payload"]["path"] = path_str;
    response["payload"]["fromPreview"] = fromPreview;

    if (!blockIdToFocus.empty()) {
        response["payload"]["blockIdToFocus"] = blockIdToFocus;
    }

    try {
        std::ifstream file(pagePath);
        if (file.is_open()) {
            json pageJson = json::parse(file);

            if (pageJson.is_array()) { // Handle old format for backward compatibility
                response["payload"]["content"] = pageJson;
                response["payload"]["config"] = json::object(); // No config in old format
            }
            else { // New object format
                response["payload"]["content"] = pageJson.value("blocks", json::array());
                response["payload"]["config"] = pageJson.value("config", json::object());
            }

        }
        else {
            response["error"] = "Failed to open file.";
        }
    }
    catch (const std::exception& e) {
        response["error"] = e.what();
    }

    SendMessageToJS(response);
}

void WinBackend::SavePage(const json& payload) {
    std::string path_str = payload.value("path", "");
    json blocks = payload.value("blocks", json::array());
    json config = payload.value("config", json::object());

    json fileContent;
    fileContent["config"] = config;
    fileContent["blocks"] = blocks;

    std::filesystem::path pagePath(path_str);

    json response;
    response["action"] = "pageSaved";
    response["payload"]["path"] = path_str;

    try {
        std::ofstream file(pagePath);
        if (file.is_open()) {
            // 使用 dump(2) 进行格式化输出，美观
            file << fileContent.dump(2);
            response["payload"]["success"] = true;
        }
        else {
            response["error"] = "Failed to open file for writing.";
            response["payload"]["success"] = false;
        }
    }
    catch (const std::exception& e) {
        response["error"] = e.what();
        response["payload"]["success"] = false;
    }

    SendMessageToJS(response);
}


void WinBackend::CreateItem(const json& payload) {
    try {
        std::string parentPathStr = payload.value("parentPath", "");
        std::string name = payload.value("name", "");
        std::string type = payload.value("type", "");

        std::filesystem::path fullPath = std::filesystem::path(parentPathStr) / name;

        if (type == "folder") {
            fullPath.replace_extension(""); // 确保没有扩展名
            std::filesystem::create_directory(fullPath);
        }
        else { // page
            fullPath.replace_extension(".veritnote");
            // 创建一个符合新格式的 JSON 对象
            json newPageContent;
            newPageContent["config"] = json::object({
                {"page", json::object()} // 可以创建一个空的 page config
                });
            newPageContent["blocks"] = json::array();

            std::ofstream file(fullPath);
            // 使用 dump(2) 写入格式化的 JSON
            file << newPageContent.dump(2);
            file.close();
        }
        // 通知前端更新文件树
        SendMessageToJS({ {"action", "workspaceUpdated"} });
    }
    catch (const std::exception& e) {
        // 错误处理
    }
}

void WinBackend::DeleteItem(const json& payload) {
    try {
        std::string pathStr = payload.value("path", "");
        std::filesystem::path fullPath(pathStr);
        if (std::filesystem::exists(fullPath)) {
            std::filesystem::remove_all(fullPath); // 对文件和文件夹都有效
        }
        // 通知前端更新文件树
        SendMessageToJS({ {"action", "workspaceUpdated"} });
    }
    catch (const std::exception& e) {
        // 错误处理
    }
}

json WinBackend::ReadJsonFile(const std::wstring& identifier) {
    std::filesystem::path path(identifier);
    if (!std::filesystem::exists(path)) return json::object();
    try {
        std::ifstream file(path);
        if (!file.is_open()) return json::object();
        return json::parse(file);
    }
    catch (...) {
        return json::object();
    }
}

void WinBackend::WriteJsonFile(const std::wstring& identifier, const json& data) {
    try {
        std::filesystem::path path(identifier);
        std::ofstream file(path);
        file << data.dump(2);
    }
    catch (...) {
        // Handle error
    }
}

std::wstring WinBackend::GetParentIdentifier(const std::wstring& identifier) {
    return std::filesystem::path(identifier).parent_path().wstring();
}

std::wstring WinBackend::CombineIdentifier(const std::wstring& parent, const std::wstring& childFilename) {
    return (std::filesystem::path(parent) / childFilename).wstring();
}

void WinBackend::EnsureWorkspaceConfigs(const json& payload) {
    if (m_workspaceRoot.empty()) return;

    // Define the default structure for a new veritnoteconfig file
    json defaultConfig = {
        {"page", json::object()}
        // Future: {"graph", json::object()}
    };

    // Add one for the root directory itself
    std::filesystem::path rootConfigPath = std::filesystem::path(m_workspaceRoot) / "veritnoteconfig";
    if (!std::filesystem::exists(rootConfigPath)) {
        WriteJsonFile(rootConfigPath, defaultConfig);
    }

    // Recursively iterate through all subdirectories
    for (const auto& entry : std::filesystem::recursive_directory_iterator(m_workspaceRoot)) {
        if (entry.is_directory()) {
            std::filesystem::path configPath = entry.path() / "veritnoteconfig";
            if (!std::filesystem::exists(configPath)) {
                WriteJsonFile(configPath, defaultConfig);
            }
        }
    }
    // Optionally, send a message back to JS confirming completion
}

void WinBackend::OpenExternalLink(const std::wstring& url) {
    ShellExecuteW(m_hWnd, L"open", url.c_str(), NULL, NULL, SW_SHOWNORMAL);
}

void WinBackend::ToggleFullscreen() {
    // 这部分代码与旧 Backend.cpp 中的实现完全相同
    if (!m_hWnd) return;
    DWORD style = GetWindowLong(m_hWnd, GWL_STYLE);
    if (style & WS_OVERLAPPEDWINDOW) {
        m_isFullscreen = true;
        GetWindowPlacement(m_hWnd, &m_wpPrev);
        MONITORINFO mi = { sizeof(mi) };
        if (GetMonitorInfo(MonitorFromWindow(m_hWnd, MONITOR_DEFAULTTOPRIMARY), &mi)) {
            SetWindowLong(m_hWnd, GWL_STYLE, style & ~WS_OVERLAPPEDWINDOW);
            SetWindowPos(m_hWnd, HWND_TOP, mi.rcMonitor.left, mi.rcMonitor.top,
                mi.rcMonitor.right - mi.rcMonitor.left,
                mi.rcMonitor.bottom - mi.rcMonitor.top,
                SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
        }
        SendMessageToJS({ {"action", "windowStateChanged"}, {"payload", {{"state", "fullscreen"}}} });
    }
    else {
        m_isFullscreen = false;
        SetWindowLong(m_hWnd, GWL_STYLE, style | WS_OVERLAPPEDWINDOW);
        if (m_wpPrev.showCmd == SW_SHOWMAXIMIZED) {
            SetWindowPlacement(m_hWnd, &m_wpPrev);
        }
        else {
            RECT rc = m_wpPrev.rcNormalPosition;
            int width = rc.right - rc.left;
            int height = rc.bottom - rc.top;
            MONITORINFO mi = { sizeof(mi) };
            GetMonitorInfo(MonitorFromWindow(m_hWnd, MONITOR_DEFAULTTOPRIMARY), &mi);
            int screenWidth = mi.rcMonitor.right - mi.rcMonitor.left;
            int screenHeight = mi.rcMonitor.bottom - mi.rcMonitor.top;
            if (width >= screenWidth * 0.95 || height >= screenHeight * 0.95) {
                width = screenWidth * 0.8;
                height = screenHeight * 0.8;
                int x = (screenWidth - width) / 2;
                int y = (screenHeight - height) / 2;
                SetWindowPos(m_hWnd, NULL, x, y, width, height, SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
            }
            else {
                SetWindowPlacement(m_hWnd, &m_wpPrev);
            }
        }
        SendMessageToJS({ {"action", "windowStateChanged"}, {"payload", {{"state", "restored_from_fullscreen"}}} });
        CheckWindowState();
    }
}

void WinBackend::MinimizeWindow() {
    if (m_hWnd) ShowWindow(m_hWnd, SW_MINIMIZE);
}

void WinBackend::MaximizeWindow() {
    if (m_hWnd) {
        WINDOWPLACEMENT wp = { sizeof(WINDOWPLACEMENT) };
        GetWindowPlacement(m_hWnd, &wp);
        if (wp.showCmd == SW_MAXIMIZE) {
            ShowWindow(m_hWnd, SW_RESTORE);
            SendMessageToJS({ {"action", "windowStateChanged"}, {"payload", {{"state", "restored"}}} });
        }
        else {
            ShowWindow(m_hWnd, SW_MAXIMIZE);
            SendMessageToJS({ {"action", "windowStateChanged"}, {"payload", {{"state", "maximized"}}} });
        }
    }
}

bool WinBackend::IsFullscreen() const {
    return m_isFullscreen;
}

void WinBackend::CloseWindow() {
    if (m_hWnd) PostMessage(m_hWnd, WM_CLOSE, 0, 0);
}

void WinBackend::StartWindowDrag() {
    if (m_hWnd) {
        ReleaseCapture();
        SendMessage(m_hWnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
    }
}

void WinBackend::CheckWindowState() {
    if (m_hWnd) {
        WINDOWPLACEMENT wp = { sizeof(WINDOWPLACEMENT) };
        GetWindowPlacement(m_hWnd, &wp);
        if (wp.showCmd == SW_MAXIMIZE) {
            SendMessageToJS({ {"action", "windowStateChanged"}, {"payload", {{"state", "maximized"}}} });
        }
        else {
            SendMessageToJS({ {"action", "windowStateChanged"}, {"payload", {{"state", "restored"}}} });
        }
    }
}


class DownloadProgressCallback : public IBindStatusCallback {
public:
    DownloadProgressCallback(std::function<void(ULONG, ULONG)> onProgress, std::function<void(HRESULT)> onComplete)
        : m_ref(1), m_onProgress(onProgress), m_onComplete(onComplete) {
    }

    // IUnknown
    STDMETHODIMP QueryInterface(REFIID riid, void** ppvObject) override {
        if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_IBindStatusCallback)) {
            *ppvObject = static_cast<IBindStatusCallback*>(this);
            AddRef();
            return S_OK;
        }
        *ppvObject = NULL;
        return E_NOINTERFACE;
    }
    STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&m_ref); }
    STDMETHODIMP_(ULONG) Release() override {
        ULONG ulRef = InterlockedDecrement(&m_ref);
        if (ulRef == 0) delete this;
        return ulRef;
    }

    // IBindStatusCallback
    STDMETHODIMP OnStartBinding(DWORD, IBinding*) override { return S_OK; }
    STDMETHODIMP GetPriority(LONG*) override { return S_OK; }
    STDMETHODIMP OnLowResource(DWORD) override { return S_OK; }
    STDMETHODIMP OnProgress(ULONG ulProgress, ULONG ulProgressMax, ULONG, LPCWSTR) override {
        if (m_onProgress && ulProgressMax > 0) {
            m_onProgress(ulProgress, ulProgressMax);
        }
        return S_OK;
    }
    STDMETHODIMP OnStopBinding(HRESULT hresult, LPCWSTR) override {
        if (m_onComplete) m_onComplete(hresult);
        return S_OK;
    }
    STDMETHODIMP GetBindInfo(DWORD*, BINDINFO*) override { return E_NOTIMPL; }
    STDMETHODIMP OnDataAvailable(DWORD, DWORD, FORMATETC*, STGMEDIUM*) override { return E_NOTIMPL; }
    STDMETHODIMP OnObjectAvailable(REFIID, IUnknown*) override { return E_NOTIMPL; }

private:
    ULONG m_ref;
    std::function<void(ULONG, ULONG)> m_onProgress;
    std::function<void(HRESULT)> m_onComplete;
};

bool WinBackend::DownloadFile(const std::wstring& url, const std::filesystem::path& destination, std::function<void(int)> onProgress) {
    int lastPercentage = -1;
    auto onProgressInternal = [&](ULONG progress, ULONG max) {
        if (onProgress) {
            int percentage = (int)(((float)progress / max) * 100);
            if (percentage != lastPercentage) {
                lastPercentage = percentage;
                onProgress(percentage);
            }
        }
        };

    HRESULT downloadResult = E_FAIL;
    auto onComplete = [&](HRESULT hr) { downloadResult = hr; };

    DownloadProgressCallback* callback = new DownloadProgressCallback(onProgressInternal, onComplete);
    HRESULT hr = URLDownloadToFileW(NULL, url.c_str(), destination.c_str(), 0, callback);
    callback->Release();

    return SUCCEEDED(hr);
}