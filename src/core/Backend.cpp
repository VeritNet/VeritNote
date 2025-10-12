#include <iostream>
#include <codecvt>
#include <locale>
#include <vector>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>


#include "include/Backend.h"
#include "include/Platform.h"
#include <resources.h>

#ifdef _WIN32
#include <Shlwapi.h>
#include <ShlObj.h>
#endif



// --- 新增：将嵌入式资源提取到文件的核心函数 ---
bool Backend::ExtractResourceToFile(const std::wstring& resourceUrlPath, const std::filesystem::path& destinationPath) {
    auto it = g_resource_map.find(resourceUrlPath);
    if (it == g_resource_map.end()) {
        return false;
    }

    void* pData = nullptr;
    DWORD dwSize = 0;
    // 【核心】通过虚函数调用特定平台的实现
    if (!this->LoadResourceData(it->second, pData, dwSize)) {
        return false;
    }

    // 后续逻辑是平台无关的
    try {
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
        return false;
    }

    return true;
}


// We need to store the next workspace path temporarily
std::wstring g_nextWorkspacePath = L"";



void Backend::HandleWebMessage(const std::string& message) {
    try {
        // WebView2 发来的是 JSON 字符串，先解析
        auto json_msg = json::parse(message);
        std::string action = json_msg.value("action", "");
        json payload = json_msg.value("payload", json::object());

        std::string log_msg = "C++ [Backend]: Received action '" + action + "'";
        LOG_DEBUG(log_msg.c_str());

        if (action == "setWorkspace") {
            std::string path_str = payload.value("path", "");
            m_workspaceRoot = this->string_to_wstring(path_str);
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
            L"/components/blocks/shared/block-core.css",
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
                    std::wstring resourceUrlPath = this->string_to_wstring("/" + libPathStr);
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
                std::string decoded_path;
                if (this->UrlDecode(encoded_path_str, decoded_path)) {
                    sourcePath = this->string_to_wstring(decoded_path);
                }
                else {
                    continue; // Skip if decoding fails
                }
            }
            else if (originalSrc.rfind("http", 0) == 0) {
                // It's an online URL, download it
                std::wstring originalSrcW = this->string_to_wstring(originalSrc);
                std::filesystem::path onlinePath(originalSrcW);

                size_t hash = std::hash<std::string>{}(originalSrc);
                std::wstring extension = onlinePath.extension().wstring();
                std::wstring uniqueFilename = std::to_wstring(hash) + extension;
                std::filesystem::path destPath = targetSrcDir / uniqueFilename;

                auto onProgressCallback = [&](int percentage) {
                    SendMessageToJS({
                        {"action", "exportImageProgress"},
                        {"payload", {
                            {"originalSrc", originalSrc},
                            {"percentage", percentage}
                        }}
                        });
                    };

                if (DownloadFile(originalSrcW, destPath, onProgressCallback)) {
                    newRelativePathStr = L"src/" + uniqueFilename;
                }
                else {
                    continue; // 下载失败，跳过这个文件
                }
            }
            else {
                // It's a regular local file (e.g., from an old relative path)
                sourcePath = this->string_to_wstring(originalSrc);
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

            std::string finalRelativePath = this->wstring_to_string(newRelativePathStr);
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


void Backend::OpenWorkspace(const json& payload) {
    std::string path = payload.value("path", "");
    if (path.empty()) return;

    m_workspaceRoot = this->string_to_wstring(path); // 设置工作区路径

    // 告诉平台去导航
    NavigateTo(L"https://veritnote.app/index.html");
}

void Backend::GoToDashboard() {
    NavigateTo(L"https://veritnote.app/dashboard.html");
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