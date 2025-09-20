#include <iostream>
#include <codecvt>
#include <locale>
#include <vector>
#include <filesystem>
#include <fstream>
#include <urlmon.h>
#pragma comment(lib, "urlmon.lib")

#include <shellapi.h>

#include "Backend.h"
#include <ShlObj.h>


// We need to store the next workspace path temporarily
std::wstring g_nextWorkspacePath = L"";

// Helper to convert wstring to string
std::string wstring_to_string(const std::wstring& wstr) {
    if (wstr.empty()) return std::string();
    int size_needed = WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), NULL, 0, NULL, NULL);
    std::string strTo(size_needed, 0);
    WideCharToMultiByte(CP_UTF8, 0, &wstr[0], (int)wstr.size(), &strTo[0], size_needed, NULL, NULL);
    return strTo;
}

// Helper to convert string to wstring
std::wstring string_to_wstring(const std::string& str) {
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
        else if (action == "exportPages") {
            StartExport(payload);
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
                // 如果为空，复制示例文件
                std::filesystem::path exeDir = GetExePath();
                std::filesystem::path exampleFilePath = exeDir / "webview_ui" / "welcome.veritnote";

                // 设置目标文件名
                std::filesystem::path destFilePath = std::filesystem::path(m_workspaceRoot) / "welcome.veritnote";

                if (std::filesystem::exists(exampleFilePath)) {
                    std::filesystem::copy_file(exampleFilePath, destFilePath);

                    // 【关键】复制完成后，重新扫描工作区
                    response["payload"] = scan_dir(m_workspaceRoot);
                }
            }
        }
        else {
            response["error"] = "Workspace root not set.";
        }
    }
    catch (const std::exception& e) {
        response["error"] = e.what();
    }

    std::string debug_json_string = response.dump(2); // dump(2) for pretty print
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
            std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
            if (content.empty()) {
                response["payload"]["content"] = json::array({
                    {{"type", "paragraph"}, {"content", ""}}
                    });
            }
            else {
                response["payload"]["content"] = json::parse(content);
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
    json content = payload.value("content", json::array());
    std::filesystem::path pagePath(path_str);

    json response;
    response["action"] = "pageSaved";
    response["payload"]["path"] = path_str;

    try {
        std::ofstream file(pagePath);
        if (file.is_open()) {
            // 使用 dump(2) 进行格式化输出，美观
            file << content.dump(2);
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

void Backend::StartExport(const json& payload) {
    /*try {
        std::filesystem::path buildPath = m_workspaceRoot;
        buildPath /= "build";

        // 清空并创建 build 文件夹
        if (std::filesystem::exists(buildPath)) {
            std::filesystem::remove_all(buildPath);
        }
        std::filesystem::create_directory(buildPath);

        // 导出css
        std::filesystem::path exeDir = GetExePath();
        std::filesystem::path sourceCssPath = exeDir / "webview_ui" / "css" / "style.css";
        std::filesystem::path destCssPath = buildPath / "style.css";

        if (std::filesystem::exists(sourceCssPath)) {
            std::filesystem::copy_file(sourceCssPath, destCssPath);
        }

        // 通知前端可以开始逐个发送文件了
        SendMessageToJS({ {"action", "exportReady"} });
    }
    catch (const std::exception& e) {
        SendMessageToJS({ {"action", "exportError"}, {"error", e.what()} });
    }*/
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
            std::ofstream file(fullPath);
            file << "[]"; // 创建一个空的 JSON 数组作为初始内容
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
    if (imagePath.string().find(workspacePath.string()) == 0) {
        // 是，则使用相对路径
        finalPathStr = std::filesystem::relative(imagePath, workspacePath).string();
    }
    else {
        // 否，则使用绝对路径，并转换为 file:/// 协议
        finalPathStr = "file:///" + wstring_to_string(selectedPath);
    }
    // 替换反斜杠
    std::replace(finalPathStr.begin(), finalPathStr.end(), '\\', '/');

    SendMessageToJS({ {"action", "fileDialogClosed"}, {"payload", {{"path", finalPathStr}}} });
}



void Backend::PrepareExportLibs(const json& payload) {
    try {
        // --- START OF MOVED LOGIC ---
        // This logic was moved from the old StartExport function.
        // It's the first step of any export process.
        std::filesystem::path buildPath = std::filesystem::path(m_workspaceRoot).append(L"build");

        // Clear and create the build folder
        if (std::filesystem::exists(buildPath)) {
            std::filesystem::remove_all(buildPath);
        }
        std::filesystem::create_directory(buildPath);

        // Export the main style.css
        std::filesystem::path exeDir = GetExePath();
        std::filesystem::path sourceCssPath = exeDir / "webview_ui" / "css" / "style.css";
        std::filesystem::path destCssPath = buildPath / "style.css";

        if (std::filesystem::exists(sourceCssPath)) {
            std::filesystem::copy_file(sourceCssPath, destCssPath);
        }
        // --- END OF MOVED LOGIC ---


        // The original logic for preparing libraries continues here...
        std::filesystem::path vendorBuildPath = buildPath / "vendor";

        // Get the source directory of our UI files
        // std::filesystem::path exeDir = GetExePath(); // Already got this above
        std::filesystem::path sourceUiPath = exeDir / "webview_ui";

        // Ensure the build/vendor directory exists
        if (!std::filesystem::exists(vendorBuildPath)) {
            std::filesystem::create_directories(vendorBuildPath);
        }

        // The payload contains an array of relative paths
        if (payload.contains("paths") && payload["paths"].is_array()) {
            for (const auto& item : payload["paths"]) {
                if (item.is_string()) {
                    std::string libPathStr = item.get<std::string>();

                    // Construct source and destination paths
                    std::filesystem::path sourceLibPath = sourceUiPath / libPathStr;
                    std::filesystem::path destLibPath = buildPath / libPathStr;

                    // Create parent directories for the destination if they don't exist
                    if (destLibPath.has_parent_path() && !std::filesystem::exists(destLibPath.parent_path())) {
                        std::filesystem::create_directories(destLibPath.parent_path());
                    }

                    // Copy the file if it exists
                    if (std::filesystem::exists(sourceLibPath)) {
                        std::filesystem::copy_file(sourceLibPath, destLibPath, std::filesystem::copy_options::overwrite_existing);
                    }
                }
            }
        }

        // After copying all files, notify the frontend that it can proceed
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

            // 1. Determine the target 'src' directory for this page
            std::filesystem::path relativePagePath = std::filesystem::relative(pagePath, workspacePath);
            std::filesystem::path targetHtmlPath = buildPath / relativePagePath;
            targetHtmlPath.replace_extension(".html");
            std::filesystem::path targetSrcDir = targetHtmlPath.parent_path() / "src";

            // 2. Create the 'src' directory if it doesn't exist
            if (!std::filesystem::exists(targetSrcDir)) {
                std::filesystem::create_directories(targetSrcDir);
            }

            std::wstring newRelativePathStr;
            std::wstring sourcePathW = string_to_wstring(originalSrc);

            std::string fileUriPrefix = "file:///";
            if (originalSrc.rfind(fileUriPrefix, 0) == 0) {
                // It's a file URI. Strip the prefix and convert slashes.
                sourcePathW = sourcePathW.substr(fileUriPrefix.length());
                std::replace(sourcePathW.begin(), sourcePathW.end(), L'/', L'\\');
            }
            std::filesystem::path sourcePath(sourcePathW);

            // 3. Check if it's a local file or an online URL
            if (originalSrc.rfind("http", 0) == 0) {
                // It's an online URL, download it
                std::wstring originalSrcW = string_to_wstring(originalSrc);

                // Generate a unique filename to avoid collisions
                size_t hash = std::hash<std::string>{}(originalSrc);
                std::wstring extension = sourcePath.extension().wstring();
                std::wstring uniqueFilename = std::to_wstring(hash) + extension;

                std::filesystem::path destPath = targetSrcDir / uniqueFilename;

                // --- NEW: Use IBindStatusCallback for progress ---
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
                auto onComplete = [&](HRESULT hr) {
                    downloadResult = hr;
                    };

                // Create the callback object
                DownloadProgressCallback* callback = new DownloadProgressCallback(onProgress, onComplete);

                // Download the file with the callback
                HRESULT hr = URLDownloadToFileW(NULL, originalSrcW.c_str(), destPath.c_str(), 0, callback);
                callback->Release(); // Release reference

                if (SUCCEEDED(hr)) {
                    newRelativePathStr = L"src/" + uniqueFilename;
                }
                else {
                    // Could not download, skip this image
                    continue;
                }
            }
            else {
                // It's a local file, copy it
                if (std::filesystem::exists(sourcePath)) {
                    std::wstring filename = sourcePath.filename().wstring();
                    std::filesystem::path destPath = targetSrcDir / filename;
                    std::filesystem::copy_file(sourcePath, destPath, std::filesystem::copy_options::overwrite_existing);
                    newRelativePathStr = L"src/" + filename;
                }
                else {
                    // Source file doesn't exist, skip it
                    continue;
                }
            }

            // 4. Add the mapping to our map
            // The new path needs to use forward slashes for HTML
            std::string finalRelativePath = wstring_to_string(newRelativePathStr);
            std::replace(finalRelativePath.begin(), finalRelativePath.end(), '\\', '/');
            srcMap[originalSrc] = finalRelativePath;
        }

        response["payload"]["srcMap"] = srcMap;
    }
    catch (const std::exception& e) {
        response["error"] = e.what();
        response["payload"]["srcMap"] = json::object(); // Send empty map on error
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
        // 1. Extract data from the frontend's request
        std::string quoteBlockId = payload.at("quoteBlockId").get<std::string>();
        std::string referenceLink = payload.at("referenceLink").get<std::string>();
        response["payload"]["quoteBlockId"] = quoteBlockId;

        // 2. Parse the reference link into file path and an optional block ID
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

        // 3. Read and parse the source .veritnote file
        std::ifstream file(filePath);
        if (!file.is_open()) {
            throw std::runtime_error("Referenced file not found: " + filePathStr);
        }

        std::string contentStr((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
        if (contentStr.empty()) {
            // If the source file is empty, return an empty array
            response["payload"]["content"] = json::array();
            SendMessageToJS(response);
            return;
        }

        json pageContent = json::parse(contentStr);

        // 4. Find the specific content to send back
        if (blockId.empty()) {
            // Case A: No block ID, reference is to the whole page.
            // The content is the entire JSON array from the file.
            response["payload"]["content"] = pageContent;
        }
        else {
            // Case B: A specific block ID is provided.
            // We need to search for it recursively.
            json foundBlock = nullptr;

            std::function<void(const json&)> find_block =
                [&](const json& current_blocks) {
                if (!current_blocks.is_array()) return;

                for (const auto& block : current_blocks) {
                    if (foundBlock != nullptr) return; // Stop searching once found

                    if (block.value("id", "") == blockId) {
                        foundBlock = block;
                        return;
                    }
                    if (block.contains("children")) {
                        find_block(block["children"]);
                    }
                }
                };

            find_block(pageContent);

            if (foundBlock != nullptr) {
                // If found, send it back as an array containing just that one block
                response["payload"]["content"] = json::array({ foundBlock });
            }
            else {
                // If not found, send an empty array
                response["payload"]["content"] = json::array();
            }
        }
    }
    catch (const std::exception& e) {
        // If any error occurs (file not found, JSON parse error, etc.)
        // send an error message back to the frontend.
        response["payload"]["error"] = e.what();
    }

    // 5. Send the final response to the frontend
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
    std::wstring editorPath = exePath + L"\\webview_ui\\index.html";
    m_webview->Navigate(editorPath.c_str());
}

void Backend::GoToDashboard() {
    std::wstring exePath = GetExePath();
    std::wstring dashboardPath = exePath + L"\\webview_ui\\dashboard.html";
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