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

// ��ȡ��ִ���ļ����ڵ�Ŀ¼
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
        // WebView2 �������� JSON �ַ������Ƚ���
        auto json_msg = json::parse(wstring_to_string(message));
        std::string action = json_msg.value("action", "");
        json payload = json_msg.value("payload", json::object());

        if (action == "setWorkspace") {
            // ֻ����·����������ɨ�裡
            std::string path_str = payload.value("path", "");
            m_workspaceRoot = string_to_wstring(path_str);
        }
        else if (action == "jsReady") {
            // �յ� JS ׼���õ��źź󣬲ſ�ʼɨ�貢���͹������б�
            if (!m_workspaceRoot.empty()) {
                ListWorkspace(json::object()); // ����һ���յ� payload ����
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
        // JSON ����ʧ��
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

            // �������޸ġ���鹤�����Ƿ�Ϊ��
            if (response["payload"]["children"].empty()) {
                // ���Ϊ�գ�����ʾ���ļ�
                std::filesystem::path exeDir = GetExePath();
                std::filesystem::path exampleFilePath = exeDir / "webview_ui" / "welcome.veritnote";

                // ����Ŀ���ļ���
                std::filesystem::path destFilePath = std::filesystem::path(m_workspaceRoot) / "welcome.veritnote";

                if (std::filesystem::exists(exampleFilePath)) {
                    std::filesystem::copy_file(exampleFilePath, destFilePath);

                    // ���ؼ���������ɺ�����ɨ�蹤����
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
                // ����ļ��ǿյģ�����һ��Ĭ�ϵĶ��� block
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
            // ʹ�� dump(2) ���и�ʽ�����������
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

        // ��ղ����� build �ļ���
        if (std::filesystem::exists(buildPath)) {
            std::filesystem::remove_all(buildPath);
        }
        std::filesystem::create_directory(buildPath);

        // ����css
        std::filesystem::path exeDir = GetExePath();
        std::filesystem::path sourceCssPath = exeDir / "webview_ui" / "css" / "style.css";
        std::filesystem::path destCssPath = buildPath / "style.css";

        if (std::filesystem::exists(sourceCssPath)) {
            std::filesystem::copy_file(sourceCssPath, destCssPath);
        }

        // ֪ͨǰ�˿��Կ�ʼ��������ļ���
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

        // �������·��
        std::filesystem::path relativePath = std::filesystem::relative(sourcePath, workspacePath);

        // ����Ŀ��·��
        std::filesystem::path targetPath = buildPath / relativePath;
        targetPath.replace_extension(".html");

        // �����Ҫ��������Ŀ¼
        if (targetPath.has_parent_path()) {
            std::filesystem::create_directories(targetPath.parent_path());
        }

        // д���ļ�
        std::ofstream file(targetPath);
        file << htmlContent;
        file.close();

    }
    catch (const std::exception& e) {
        // ����ѡ���Ե���ǰ�˱������
    }
}

void Backend::CreateItem(const json& payload) {
    try {
        std::string parentPathStr = payload.value("parentPath", "");
        std::string name = payload.value("name", "");
        std::string type = payload.value("type", "");

        std::filesystem::path fullPath = std::filesystem::path(parentPathStr) / name;

        if (type == "folder") {
            fullPath.replace_extension(""); // ȷ��û����չ��
            std::filesystem::create_directory(fullPath);
        }
        else { // page
            fullPath.replace_extension(".veritnote");
            std::ofstream file(fullPath);
            file << "[]"; // ����һ���յ� JSON ������Ϊ��ʼ����
            file.close();
        }
        // ֪ͨǰ�˸����ļ���
        SendMessageToJS({ {"action", "workspaceUpdated"} });
    }
    catch (const std::exception& e) {
        // ������
    }
}

void Backend::DeleteItem(const json& payload) {
    try {
        std::string pathStr = payload.value("path", "");
        std::filesystem::path fullPath(pathStr);
        if (std::filesystem::exists(fullPath)) {
            std::filesystem::remove_all(fullPath); // ���ļ����ļ��ж���Ч
        }
        // ֪ͨǰ�˸����ļ���
        SendMessageToJS({ {"action", "workspaceUpdated"} });
    }
    catch (const std::exception& e) {
        // ������
    }
}

void Backend::RequestNoteList() {
    json noteList = json::array();

    // �ݹ�ɨ�躯��
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
    // ���������Ҫ�����ھ�������ǿ��԰����洢����
    // �� wWinMain �������ں󣬿��Ե���һ�� backend.SetMainWindow(hWnd)
    // Ϊ������������ȼ����ܻ�ȡ������������ NULL
    HWND hWnd = NULL; // ���������Ӧ�ñ��������ھ��

    IFileOpenDialog* pfd;
    std::wstring selectedPath = L"";

    if (SUCCEEDED(CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE))) {
        if (SUCCEEDED(CoCreateInstance(CLSID_FileOpenDialog, NULL, CLSCTX_ALL, IID_IFileOpenDialog, reinterpret_cast<void**>(&pfd)))) {
            // �����ļ����͹�����
            COMDLG_FILTERSPEC fileTypes[] = {
                { L"Image Files", L"*.jpg;*.jpeg;*.png;*.gif;*.bmp;*.webp" },
                { L"All Files", L"*. *" }
            };
            pfd->SetFileTypes(ARRAYSIZE(fileTypes), fileTypes);
            pfd->SetTitle(L"ѡ��ͼƬ�ļ�");

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

    // �������·��
    std::filesystem::path imagePath(selectedPath);
    std::filesystem::path workspacePath(m_workspaceRoot);
    std::string finalPathStr;

    // ���ͼƬ�Ƿ��ڹ�������
    if (imagePath.string().find(workspacePath.string()) == 0) {
        // �ǣ���ʹ�����·��
        finalPathStr = std::filesystem::relative(imagePath, workspacePath).string();
    }
    else {
        // ����ʹ�þ���·������ת��Ϊ file:/// Э��
        finalPathStr = "file:///" + wstring_to_string(selectedPath);
    }
    // �滻��б��
    std::replace(finalPathStr.begin(), finalPathStr.end(), '\\', '/');

    SendMessageToJS({ {"action", "fileDialogClosed"}, {"payload", {{"path", finalPathStr}}} });
}