#include <iostream>
#include <codecvt>
#include <locale>
#include <filesystem>
#include <fstream>

#include "Backend.h"
#include <ShlObj.h>

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

        if (action == "setWorkspace") {
            // 只设置路径，不立即扫描！
            std::string path_str = payload.value("path", "");
            m_workspaceRoot = string_to_wstring(path_str);
        }
        else if (action == "jsReady") {
            // 收到 JS 准备好的信号后，才开始扫描并发送工作区列表
            if (!m_workspaceRoot.empty()) {
                ListWorkspace(json::object()); // 传入一个空的 payload 即可
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

    json response;
    response["action"] = "pageLoaded";
    response["payload"]["path"] = path_str;
    response["payload"]["fromPreview"] = fromPreview;

    try {
        std::ifstream file(pagePath);
        if (file.is_open()) {
            std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
            if (content.empty()) {
                // 如果文件是空的，返回一个默认的段落 block
                response["payload"]["content"] = json::array({
                    {{"id", "start-block"}, {"type", "paragraph"}, {"content", ""}, {"children", json::array()}}
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
    try {
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
    }
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