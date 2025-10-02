#include <iostream>
#include <codecvt>
#include <locale>
#include <vector>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <urlmon.h>
#include <string>
#pragma comment(lib, "urlmon.lib")

#include <shellapi.h>

#include "Backend.h"
#include <ShlObj.h>
#include <Shlwapi.h>
#include <resources.h>


// 根据文件扩展名获取MIME类型
std::wstring GetMimeType_Backend(const std::wstring& path) {
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

// 从资源中加载数据 (返回数据指针和大小)
bool LoadResourceData(int resource_id, void*& pData, DWORD& dwSize) {
    HRSRC hRes = FindResource(nullptr, MAKEINTRESOURCE(resource_id), RT_RCDATA);
    if (!hRes) return false;

    HGLOBAL hGlob = LoadResource(nullptr, hRes);
    if (!hGlob) return false;

    pData = LockResource(hGlob);
    if (!pData) return false;

    dwSize = SizeofResource(nullptr, hRes);
    return dwSize > 0;
}

// --- 新增：将嵌入式资源提取到文件的核心函数 ---
bool ExtractResourceToFile(const std::wstring& resourceUrlPath, const std::filesystem::path& destinationPath) {
    // 1. 在我们的资源map中查找路径
    auto it = g_resource_map.find(resourceUrlPath);
    if (it == g_resource_map.end()) {
        return false; // 资源未在map中找到
    }

    // 2. 从EXE加载资源数据
    void* pData = nullptr;
    DWORD dwSize = 0;
    if (!LoadResourceData(it->second, pData, dwSize)) {
        return false; // 加载资源失败
    }

    // 3. 将数据写入目标文件
    try {
        // 确保目标目录存在
        if (destinationPath.has_parent_path()) {
            std::filesystem::create_directories(destinationPath.parent_path());
        }
        std::ofstream file(destinationPath, std::ios::binary);
        if (!file.is_open()) {
            return false;
        }
        file.write(static_cast<const char*>(pData), dwSize);
        file.close();
    }
    catch (const std::exception&) {
        return false; // 写入文件时发生异常
    }

    return true;
}


// We need to store the next workspace path temporarily
std::wstring g_nextWorkspacePath = L"";

// Helper to convert wstring to string
inline std::string wstring_to_string(const std::wstring& wstr) {
    if (wstr.empty()) return std::string();
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

// Helper to convert string to wstring
inline std::wstring string_to_wstring(const std::string& str) {
    if (str.empty()) return std::wstring();
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}

// 获取可执行文件所在的目录
std::wstring GetExePath() {
    wchar_t path[MAX_PATH] = { 0 };
    GetModuleFileNameW(NULL, path, MAX_PATH);
    *wcsrchr(path, L'\\') = L'\0';
    return path;
}


Backend::Backend() {}

void Backend::SetWebView(ICoreWebView2* webview) {
    m_webview = webview;
}

void Backend::HandleWebMessage(const std::wstring& message) {
    try {
        // WebView2 发来的是 JSON 字符串，先解析
        auto json_msg = json::parse(wstring_to_string(message));
        std::string action = json_msg.value("action", "");
        json payload = json_msg.value("payload", json::object());

        std::string action_log = action + "\n";

        OutputDebugStringA(action_log.c_str());

        if (action == "setWorkspace") {
            std::string path_str = payload.value("path", "");
            m_workspaceRoot = string_to_wstring(path_str);
        }
        else if (action == "jsReady") {
            // JS in index.html is ready and has already sent its workspace path.
            // So we can now list the files.
            if (!m_workspaceRoot.empty()) {
                // If the JS context is the editor, list the workspace.
                // We might need a way to know which page is ready.
                // For now, this is okay.
                ListWorkspace(json::object());
            }
        }
        else if (action == "listWorkspace") {
            ListWorkspace(payload);
        }
        else if (action == "loadPage") {
            LoadPage(payload);
        }
        else if (action == "savePage") {
            SavePage(payload);
        }
        else if (action == "exportPageAsHtml") {
            ExportPageAsHtml(payload);
        }
        else if (action == "createItem") {
            CreateItem(payload);
        }
        else if (action == "deleteItem") {
            DeleteItem(payload);
        }
        else if (action == "requestNoteList") {
            RequestNoteList();
        }
        else if (action == "openFileDialog") {
            OpenFileDialog();
        }
        else if (action == "prepareExportLibs") {
            PrepareExportLibs(payload);
        }
        else if (action == "processExportImages") {
            ProcessExportImages(payload);
        }
        else if (action == "cancelExport") {
            CancelExport();
        }
        else if (action == "openWorkspaceDialog") {
            OpenWorkspaceDialog();
        }
        else if (action == "openWorkspace") {
            OpenWorkspace(payload);
        }
        else if (action == "goToDashboard") {
            GoToDashboard();
        }
        else if (action == "toggleFullscreen") {
            ToggleFullscreen();
        }
        else if (action == "minimizeWindow") {
            MinimizeWindow();
        }
        else if (action == "maximizeWindow") {
            MaximizeWindow();
        }
        else if (action == "closeWindow") {
            CloseWindow();
        }
        else if (action == "startWindowDrag") {
            StartWindowDrag();
        }
        else if (action == "checkWindowState") {
            CheckWindowState();
        }
        else if (action == "fetchQuoteContent") {
            FetchQuoteContent(payload);
        }
        else if (action == "ensureWorkspaceConfigs") {
            EnsureWorkspaceConfigs(payload);
        }
        else if (action == "readConfigFile") {
            ReadConfigFile(payload);
        }
        else if (action == "writeConfigFile") {
            WriteConfigFile(payload);
        }
        else if (action == "resolveFileConfiguration") {
            ResolveFileConfiguration(payload);
        }
        else {
            std::cout << "Unknown Action: " + action << std::endl;
        }
    }
    catch (const json::parse_error& e) {
        // JSON 解析失败
    }
}

void Backend::SendMessageToJS(const json& message) {
    if (m_webview) {
        std::string json_str = message.dump();
        m_webview->PostWebMessageAsJson(string_to_wstring(json_str).c_str());
    }
}

void Backend::ListWorkspace(const json& payload) {
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
    OutputDebugStringA("--- C++ Backend --- \n");
    OutputDebugStringA("Sending to JS: \n");
    OutputDebugStringA(debug_json_string.c_str());
    OutputDebugStringA("\n---------------------\n");

    SendMessageToJS(response);
}

void Backend::LoadPage(const json& payload) {
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

void Backend::SavePage(const json& payload) {
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

void Backend::ExportPageAsHtml(const json& payload) {
    try {
        std::string sourcePathStr = payload.value("path", "");
        std::string htmlContent = payload.value("html", "");

        std::filesystem::path sourcePath(sourcePathStr);
        std::filesystem::path workspacePath(m_workspaceRoot);
        std::filesystem::path buildPath = workspacePath / "build";

        // 计算相对路径
        std::filesystem::path relativePath = std::filesystem::relative(sourcePath, workspacePath);

        // 构建目标路径
        std::filesystem::path targetPath = buildPath / relativePath;
        targetPath.replace_extension(".html");

        // 如果需要，创建父目录
        if (targetPath.has_parent_path()) {
            std::filesystem::create_directories(targetPath.parent_path());
        }

        // 写入文件
        std::ofstream file(targetPath);
        file << htmlContent;
        file.close();

    }
    catch (const std::exception& e) {
        // 可以选择性地向前端报告错误
    }
}

void Backend::CreateItem(const json& payload) {
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

void Backend::DeleteItem(const json& payload) {
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

void Backend::RequestNoteList() {
    json noteList = json::array();

    // 递归扫描函数
    std::function<void(const std::filesystem::path&)> scan =
        [&](const std::filesystem::path& dir_path) {
        for (const auto& entry : std::filesystem::directory_iterator(dir_path)) {
            if (entry.is_directory()) {
                scan(entry.path());
            }
            else if (entry.is_regular_file() && entry.path().extension() == ".veritnote") {
                noteList.push_back({
                    {"name", entry.path().stem().string()},
                    {"path", entry.path().string()}
                    });
            }
        }
        };

    try {
        if (!m_workspaceRoot.empty()) {
            scan(m_workspaceRoot);
        }
        SendMessageToJS({ {"action", "noteListReceived"}, {"payload", noteList} });
    }
    catch (const std::exception& e) {
        // Error handling
    }
}


void Backend::OpenFileDialog() {
    // 这个函数需要主窗口句柄，我们可以把它存储起来
    // 在 wWinMain 创建窗口后，可以调用一个 backend.SetMainWindow(hWnd)
    // 为简单起见，我们先假设能获取到它，或者用 NULL
    HWND hWnd = NULL; // 理想情况下应该保存主窗口句柄

    IFileOpenDialog* pfd;
    std::wstring selectedPath = L"";

    if (SUCCEEDED(CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE))) {
        if (SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog, NULL, CLSCTX_ALL, IID_IFileOpenDialog, reinterpret_cast<void**>(&pfd)))) {
            // 设置文件类型过滤器
            COMDLG_FILTERSPEC fileTypes[] = {
                { L"Image Files", L"*.jpg;*.jpeg;*.png;*.gif;*.bmp;*.webp" },
                { L"All Files", L"*. *" }
            };
            pfd->SetFileTypes(ARRAYSIZE(fileTypes), fileTypes);
            pfd->SetTitle(L"选择图片文件");

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

    // 计算相对路径
    std::filesystem::path imagePath(selectedPath);
    std::filesystem::path workspacePath(m_workspaceRoot);
    std::string finalPathStr;

    // 检查图片是否在工作区内
    if (!m_workspaceRoot.empty() && imagePath.wstring().find(workspacePath.wstring()) == 0) {
        // 是，则使用相对路径 (这部分逻辑是好的，保持)
        finalPathStr = std::filesystem::relative(imagePath, workspacePath).string();
        std::replace(finalPathStr.begin(), finalPathStr.end(), '\\', '/');
    }
    else {
        // 否，则构造一个特殊的虚拟路径
        // finalPathStr = "file:///" + wstring_to_string(selectedPath); // <--- 旧的错误做法

        // v--- 新的正确做法 ---v
        // 我们需要对路径进行URL编码，以防路径中包含特殊字符（如 #, ?, &）
        std::string path_utf8 = wstring_to_string(selectedPath);

        // 手动进行一个简化版的URL编码（只编码关键字符，更完整的库会更好，但这对路径足够了）
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

        // 最终格式: https://veritnote.app/local-file/ENCODED_ABSOLUTE_PATH
        finalPathStr = "https://veritnote.app/local-file/" + encoded.str();
    }

    SendMessageToJS({ {"action", "fileDialogClosed"}, {"payload", {{"path", finalPathStr}}} });
}



void Backend::PrepareExportLibs(const json& payload) {
    try {
        std::filesystem::path buildPath = std::filesystem::path(m_workspaceRoot).append(L"build");

        if (std::filesystem::exists(buildPath)) {
            std::filesystem::remove_all(buildPath);
        }
        std::filesystem::create_directory(buildPath);

        std::vector<std::wstring> css_resource_paths = {
            L"/components/main/theme.css",
            L"/page-theme.css",
            L"/components/main/main.css",
            L"/components/page-editor/page-editor.css",
            L"/components/blocks/_shared/block-core.css",
            L"/components/blocks/callout/callout.css",
            L"/components/blocks/code/code.css",
            L"/components/blocks/columns/columns.css",
            L"/components/blocks/heading/heading.css",
            L"/components/blocks/image/image.css",
            L"/components/blocks/link-button/link-button.css",
            L"/components/blocks/list-items/list-item-shared.css",
            L"/components/blocks/quote/quote.css",
            L"/components/blocks/table/table.css"
        };

        std::filesystem::path styleCssPath = buildPath / "style.css";
        std::ofstream styleCssFile(styleCssPath, std::ios::binary);

        for (const auto& resource_path : css_resource_paths) {
            auto it = g_resource_map.find(resource_path);
            if (it != g_resource_map.end()) {
                void* pData = nullptr;
                DWORD dwSize = 0;
                if (LoadResourceData(it->second, pData, dwSize)) {

                    // --- 新增的BOM检查逻辑 ---
                    const char* data_ptr = static_cast<const char*>(pData);
                    DWORD data_size = dwSize;

                    // 检查是否存在 UTF-8 BOM (0xEF, 0xBB, 0xBF)
                    if (data_size >= 3 &&
                        static_cast<unsigned char>(data_ptr[0]) == 0xEF &&
                        static_cast<unsigned char>(data_ptr[1]) == 0xBB &&
                        static_cast<unsigned char>(data_ptr[2]) == 0xBF)
                    {
                        // 如果存在，则跳过这3个字节
                        data_ptr += 3;
                        data_size -= 3;
                    }

                    // 写入处理过的数据
                    styleCssFile.write(data_ptr, data_size);
                    styleCssFile << "\n\n";
                }
            }
        }
        styleCssFile.close();

        // Step 2: Copy JavaScript libraries as requested by the frontend
        if (payload.contains("paths") && payload["paths"].is_array()) {
            for (const auto& item : payload["paths"]) {
                if (item.is_string()) {
                    std::string libPathStr = item.get<std::string>();
                    std::replace(libPathStr.begin(), libPathStr.end(), '\\', '/');
                    std::wstring resourceUrlPath = string_to_wstring("/" + libPathStr);
                    std::filesystem::path destLibPath = buildPath / libPathStr;

                    if (!ExtractResourceToFile(resourceUrlPath, destLibPath)) {
                        throw std::runtime_error("Failed to extract library: " + libPathStr);
                    }
                }
            }
        }

        SendMessageToJS({ {"action", "exportLibsReady"} });
    }
    catch (const std::exception& e) {
        SendMessageToJS({ {"action", "exportError"}, {"error", e.what()} });
    }
}


// --- Implementation of the image processing function ---
void Backend::ProcessExportImages(const json& payload) {
    json response;
    response["action"] = "exportImagesProcessed";
    json srcMap = json::object();

    try {
        const auto& tasks = payload.at("tasks");
        if (!tasks.is_array()) {
            throw std::runtime_error("Image processing tasks must be an array.");
        }

        std::filesystem::path buildPath = std::filesystem::path(m_workspaceRoot).append(L"build");
        std::filesystem::path workspacePath(m_workspaceRoot);

        for (const auto& task : tasks) {
            std::string originalSrc = task.at("originalSrc").get<std::string>();
            std::string pagePathStr = task.at("pagePath").get<std::string>();
            std::filesystem::path pagePath(pagePathStr);

            std::filesystem::path relativePagePath = std::filesystem::relative(pagePath, workspacePath);
            std::filesystem::path targetHtmlPath = buildPath / relativePagePath;
            targetHtmlPath.replace_extension(".html");
            std::filesystem::path targetSrcDir = targetHtmlPath.parent_path() / "src";

            if (!std::filesystem::exists(targetSrcDir)) {
                std::filesystem::create_directories(targetSrcDir);
            }

            std::wstring newRelativePathStr;
            std::filesystem::path sourcePath;

            // Check for the special local file URI scheme first.
            std::string localFileAppPrefix = "https://veritnote.app/local-file/";
            if (originalSrc.rfind(localFileAppPrefix, 0) == 0) {
                std::string encoded_path_str = originalSrc.substr(localFileAppPrefix.length());

                // URL Decode the path
                char decoded_path_cstr[MAX_PATH];
                DWORD decoded_len = MAX_PATH;
                if (UrlUnescapeA((char*)encoded_path_str.c_str(), decoded_path_cstr, &decoded_len, 0) == S_OK) {
                    sourcePath = string_to_wstring(std::string(decoded_path_cstr, decoded_len));
                }
                else {
                    continue; // Skip if decoding fails
                }
            }
            else if (originalSrc.rfind("http", 0) == 0) {
                // It's an online URL, download it
                std::wstring originalSrcW = string_to_wstring(originalSrc);
                std::filesystem::path onlinePath(originalSrcW);

                size_t hash = std::hash<std::string>{}(originalSrc);
                std::wstring extension = onlinePath.extension().wstring();
                std::wstring uniqueFilename = std::to_wstring(hash) + extension;
                std::filesystem::path destPath = targetSrcDir / uniqueFilename;

                int lastPercentage = -1;
                auto onProgress = [&](ULONG progress, ULONG max) {
                    int percentage = (int)(((float)progress / max) * 100);
                    if (percentage != lastPercentage) {
                        lastPercentage = percentage;
                        SendMessageToJS({
                            {"action", "exportImageProgress"},
                            {"payload", {
                                {"originalSrc", originalSrc},
                                {"percentage", percentage}
                            }}
                            });
                    }
                    };

                HRESULT downloadResult = E_FAIL;
                auto onComplete = [&](HRESULT hr) { downloadResult = hr; };
                DownloadProgressCallback* callback = new DownloadProgressCallback(onProgress, onComplete);
                HRESULT hr = URLDownloadToFileW(NULL, originalSrcW.c_str(), destPath.c_str(), 0, callback);
                callback->Release();

                if (SUCCEEDED(hr)) {
                    newRelativePathStr = L"src/" + uniqueFilename;
                }
                else {
                    continue;
                }
            }
            else {
                // It's a regular local file (e.g., from an old relative path)
                sourcePath = string_to_wstring(originalSrc);
            }

            // --- Unified Copy Logic ---
            // This part now works for both decoded special URIs and regular local paths.
            if (!newRelativePathStr.empty()) {
                // This was an online file, already processed.
            }
            else if (std::filesystem::exists(sourcePath)) {
                std::wstring filename = sourcePath.filename().wstring();
                std::filesystem::path destPath = targetSrcDir / filename;
                std::filesystem::copy_file(sourcePath, destPath, std::filesystem::copy_options::overwrite_existing);
                newRelativePathStr = L"src/" + filename;
            }
            else {
                continue; // Source file doesn't exist, skip.
            }

            std::string finalRelativePath = wstring_to_string(newRelativePathStr);
            std::replace(finalRelativePath.begin(), finalRelativePath.end(), '\\', '/');
            srcMap[originalSrc] = finalRelativePath;
        }

        response["payload"]["srcMap"] = srcMap;
    }
    catch (const std::exception& e) {
        response["error"] = e.what();
        response["payload"]["srcMap"] = json::object();
    }

    SendMessageToJS(response);
}

void Backend::CancelExport() {
    try {
        std::filesystem::path buildPath = std::filesystem::path(m_workspaceRoot).append(L"build");
        if (std::filesystem::exists(buildPath)) {
            std::filesystem::remove_all(buildPath);
        }
        SendMessageToJS({ {"action", "exportCancelled"} });
    }
    catch (const std::exception& e) {
        // Even if cleanup fails, notify frontend
        SendMessageToJS({ {"action", "exportCancelled"} });
    }
}


void Backend::FetchQuoteContent(const json& payload) {
    json response;
    response["action"] = "quoteContentLoaded";

    try {
        std::string quoteBlockId = payload.at("quoteBlockId").get<std::string>();
        std::string referenceLink = payload.at("referenceLink").get<std::string>();
        response["payload"]["quoteBlockId"] = quoteBlockId;

        std::string filePathStr;
        std::string blockId;
        size_t hashPos = referenceLink.find('#');

        if (hashPos != std::string::npos) {
            filePathStr = referenceLink.substr(0, hashPos);
            blockId = referenceLink.substr(hashPos + 1);
        }
        else {
            filePathStr = referenceLink;
        }

        std::filesystem::path filePath(filePathStr);
        std::ifstream file(filePath);
        if (!file.is_open()) {
            throw std::runtime_error("Referenced file not found: " + filePathStr);
        }

        json pageJson = json::parse(file); // This can be an array (old) or an object (new)

        // --- START OF FIX ---

        json blocksArray;
        // Determine where the array of blocks is located
        if (pageJson.is_array()) {
            blocksArray = pageJson; // Old format, the whole file is the array
        }
        else if (pageJson.is_object() && pageJson.contains("blocks")) {
            blocksArray = pageJson["blocks"]; // New format, it's in the "blocks" key
        }
        else {
            blocksArray = json::array(); // Not a valid format, treat as empty
        }

        if (blockId.empty()) {
            // Case A: Reference is to the whole page.
            // Send the extracted array of blocks.
            response["payload"]["content"] = blocksArray;
        }
        else {
            // Case B: A specific block ID is provided.
            json foundBlock = nullptr;

            std::function<void(const json&)> find_block =
                [&](const json& current_blocks) {
                if (!current_blocks.is_array()) return;
                for (const auto& block : current_blocks) {
                    if (foundBlock != nullptr) return;
                    if (block.value("id", "") == blockId) {
                        foundBlock = block;
                        return;
                    }
                    if (block.contains("children")) {
                        find_block(block["children"]);
                    }
                }
                };

            // Search in the extracted blocksArray
            find_block(blocksArray);

            if (foundBlock != nullptr) {
                response["payload"]["content"] = json::array({ foundBlock });
            }
            else {
                response["payload"]["content"] = json::array();
            }
        }
        // --- END OF FIX ---
    }
    catch (const std::exception& e) {
        response["payload"]["error"] = e.what();
    }

    SendMessageToJS(response);
}


void Backend::SetMainWindowHandle(HWND hWnd) {
    m_hWnd = hWnd;
}


void Backend::OpenWorkspaceDialog() {
    IFileOpenDialog* pfd;
    if (SUCCEEDED(CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE))) {
        if (SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog, NULL, CLSCTX_ALL, IID_IFileOpenDialog, reinterpret_cast<void**>(&pfd)))) {
            DWORD dwOptions;
            if (SUCCEEDED(pfd->GetOptions(&dwOptions))) {
                pfd->SetOptions(dwOptions | FOS_PICKFOLDERS);
            }
            if (SUCCEEDED(pfd->Show(m_hWnd))) {
                IShellItem* psi;
                if (SUCCEEDED(pfd->GetResult(&psi))) {
                    PWSTR pszFilePath = NULL;
                    if (SUCCEEDED(psi->GetDisplayName(SIGDN_FILESYSPATH, &pszFilePath))) {
                        json payload = { {"path", wstring_to_string(pszFilePath)} };
                        OpenWorkspace(payload);
                        CoTaskMemFree(pszFilePath);
                    }
                    psi->Release();
                }
            }
            pfd->Release();
        }
        CoUninitialize();
    }
}

void Backend::OpenWorkspace(const json& payload) {
    std::string path = payload.value("path", "");
    if (path.empty()) return;

    // --- Step 1: Store the workspace path for later injection ---
    g_nextWorkspacePath = string_to_wstring(path);

    // --- Step 2: Tell the dashboard to add this to its recent list (same as before) ---
    std::string escaped_path = "";
    for (char c : path) {
        if (c == '\\') {
            escaped_path += "\\\\";
        }
        else {
            escaped_path += c;
        }
    }
    std::wstring script = L"window.addRecentWorkspace(\"" + string_to_wstring(escaped_path) + L"\")";
    m_webview->ExecuteScript(script.c_str(), nullptr);

    // --- Step 3: Navigate to index.html WITHOUT any query parameters ---
    std::wstring exePath = GetExePath();
    std::wstring editorPath = L"https://veritnote.app/index.html";
    m_webview->Navigate(editorPath.c_str());
}

void Backend::GoToDashboard() {
    std::wstring exePath = GetExePath();
    std::wstring dashboardPath = L"https://veritnote.app/dashboard.html";
    m_webview->Navigate(dashboardPath.c_str());
}

void Backend::ToggleFullscreen() {
    if (!m_hWnd) return;
    DWORD style = GetWindowLong(m_hWnd, GWL_STYLE);
    if (style & WS_OVERLAPPEDWINDOW) {
        // --- 进入全屏 ---
        m_isFullscreen = true;

        // 保存进入全屏前的窗口位置和大小
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
        // --- 退出全屏 ---
        m_isFullscreen = false;
        SetWindowLong(m_hWnd, GWL_STYLE, style | WS_OVERLAPPEDWINDOW);

        // 检查之前是否是最大化状态
        if (m_wpPrev.showCmd == SW_SHOWMAXIMIZED) {
            // 如果是，则直接恢复到最大化
            SetWindowPlacement(m_hWnd, &m_wpPrev);
        }
        else {
            // 如果不是，恢复到之前的位置，但可以调整一下大小
            RECT rc = m_wpPrev.rcNormalPosition;
            int width = rc.right - rc.left;
            int height = rc.bottom - rc.top;

            // 获取显示器大小
            MONITORINFO mi = { sizeof(mi) };
            GetMonitorInfo(MonitorFromWindow(m_hWnd, MONITOR_DEFAULTTOPRIMARY), &mi);
            int screenWidth = mi.rcMonitor.right - mi.rcMonitor.left;
            int screenHeight = mi.rcMonitor.bottom - mi.rcMonitor.top;

            // 如果恢复后的窗口尺寸过大（例如超过屏幕的95%），则将其缩小
            if (width >= screenWidth * 0.95 || height >= screenHeight * 0.95) {
                width = screenWidth * 0.8;
                height = screenHeight * 0.8;
                // 居中窗口
                int x = (screenWidth - width) / 2;
                int y = (screenHeight - height) / 2;
                SetWindowPos(m_hWnd, NULL, x, y, width, height, SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
            }
            else {
                // 否则，直接恢复到之前的位置和大小
                SetWindowPlacement(m_hWnd, &m_wpPrev);
            }
        }

        SendMessageToJS({ {"action", "windowStateChanged"}, {"payload", {{"state", "restored_from_fullscreen"}}} });
        CheckWindowState();
    }
}



void Backend::MinimizeWindow() {
    if (m_hWnd) {
        ShowWindow(m_hWnd, SW_MINIMIZE);
    }
}

void Backend::MaximizeWindow() {
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

bool Backend::IsFullscreen() const {
    return m_isFullscreen;
}

void Backend::CloseWindow() {
    if (m_hWnd) {
        PostMessage(m_hWnd, WM_CLOSE, 0, 0);
    }
}

void Backend::StartWindowDrag() {
    if (m_hWnd) {
        // 释放鼠标捕获，然后向窗口发送一个伪造的“在标题栏上按下鼠标左键”的消息
        // Windows 将接管并开始标准的窗口拖动操作
        ReleaseCapture();
        SendMessage(m_hWnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
    }
}

void Backend::CheckWindowState() {
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

void Backend::OpenExternalLink(const std::wstring& url) {
    // ShellExecute is the standard Windows API to open files/URLs with their default handler.
    // We pass the main window handle, the "open" verb, the URL, and default parameters.
    ShellExecuteW(m_hWnd, L"open", url.c_str(), NULL, NULL, SW_SHOWNORMAL);
}



// Helper to read a JSON file, returns empty object on failure
json Backend::ReadJsonFile(const std::filesystem::path& path) {
    if (!std::filesystem::exists(path)) return json::object();
    try {
        std::ifstream file(path);
        return json::parse(file);
    }
    catch (...) {
        return json::object();
    }
}

// Helper to write a JSON file
void Backend::WriteJsonFile(const std::filesystem::path& path, const json& data) {
    try {
        std::ofstream file(path);
        file << data.dump(2);
    }
    catch (...) {
        // Handle error
    }
}

// Safely extracts a value that could be a string or a number and returns it as a string.
std::string get_callback_id(const json& payload) {
    if (payload.contains("callbackId")) {
        const auto& id_val = payload["callbackId"];
        if (id_val.is_string()) {
            return id_val.get<std::string>();
        }
        if (id_val.is_number()) {
            // This ensures it's always a string
            return std::to_string(id_val.get<long long>());
        }
    }
    return "";
}



void Backend::EnsureWorkspaceConfigs(const json& payload) {
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

void Backend::ReadConfigFile(const json& payload) {
    std::string pathStr = payload.value("path", "");
    std::string callbackId = get_callback_id(payload);

    json response;
    response["action"] = "configFileRead";
    response["payload"]["callbackId"] = callbackId;
    response["payload"]["data"] = ReadJsonFile(pathStr);

    SendMessageToJS(response);
}

void Backend::WriteConfigFile(const json& payload) {
    std::string pathStr = payload.value("path", "");
    json data = payload.value("data", json::object());
    WriteJsonFile(pathStr, data);
    // Optionally send a success message
}

void Backend::ResolveFileConfiguration(const json& payload) {
    std::string filePathStr = payload.value("path", "");
    std::string callbackId = get_callback_id(payload);

    json finalConfig = json::object();
    std::filesystem::path currentPath(filePathStr);

    // Step 1: Read the file's own embedded config
    json fileContent = ReadJsonFile(currentPath);
    // 在访问键之前，检查它是否是一个对象
    if (fileContent.is_object() && fileContent.contains("config")) {
        finalConfig = fileContent["config"];
    }

    // Step 2: Walk up the directory tree, merging folder configs
    std::filesystem::path dirPath = currentPath.parent_path();
    std::filesystem::path workspacePath(m_workspaceRoot);

    while (true) {
        if (dirPath.wstring().length() < workspacePath.wstring().length()) {
            break; // Stop if we go above the workspace root
        }

        json folderConfig = ReadJsonFile(dirPath / "veritnoteconfig");

        // Merge folderConfig into finalConfig, but only for keys that are "inherit" or missing in finalConfig
        for (auto const& [category, catConfig] : folderConfig.items()) {
            if (!finalConfig.contains(category)) {
                finalConfig[category] = json::object();
            }
            for (auto const& [key, value] : catConfig.items()) {
                if (!finalConfig[category].contains(key) || finalConfig[category][key] == "inherit") {
                    finalConfig[category][key] = value;
                }
            }
        }

        if (dirPath == workspacePath) {
            break; // Stop after processing the root
        }
        dirPath = dirPath.parent_path();
    }

    json response;
    response["action"] = "fileConfigurationResolved";
    response["payload"]["callbackId"] = callbackId;
    response["payload"]["config"] = finalConfig;

    SendMessageToJS(response);
}