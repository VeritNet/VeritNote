#include <iostream>
#include <codecvt>
#include <locale>
#include <vector>
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

        std::string log_msg = "C++ [Backend]: Received action '" + message + "'";
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

        // File IO
        else if (action == "loadFile") {
            LoadFile(payload);
        }
        else if (action == "saveFile") {
            SaveFile(payload);
		}

        else if (action == "exportPageAsHtml") {
            ExportPageAsHtml(payload);
        }
        else if (action == "exportDatabaseAsJs") {
            ExportDatabaseAsJs(payload);
        }
        else if (action == "createItem") {
            CreateItem(payload);
        }
        else if (action == "deleteItem") {
            DeleteItem(payload);
        }
        else if (action == "openFileDialog") {
            OpenFileDialog(payload);
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
        else if (action == "fetchDataContent") {
            FetchDataContent(payload);
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
		LOG_DEBUG(std::string("Error exporting page as HTML: " + std::string(e.what())).c_str());
    }
}

void Backend::ExportDatabaseAsJs(const json& payload) {
    try {
        std::string sourcePathStr = payload.value("path", "");
        std::string jsContent = payload.value("js", "");

        std::filesystem::path sourcePath(sourcePathStr);
        std::filesystem::path workspacePath(m_workspaceRoot);
        std::filesystem::path buildPath = workspacePath / "build";

        // 计算相对路径
        std::filesystem::path relativePath = std::filesystem::relative(sourcePath, workspacePath);

        // 构建目标路径
        std::filesystem::path targetPath = buildPath / relativePath;
        targetPath.replace_extension(".js");

        // 如果需要，创建父目录
        if (targetPath.has_parent_path()) {
            std::filesystem::create_directories(targetPath.parent_path());
        }

        // 写入文件
        std::ofstream file(targetPath);
        file << jsContent;
        file.close();
    }
    catch (const std::exception& e) {
        LOG_DEBUG(std::string("Error exporting database as JS: " + std::string(e.what())).c_str());
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
            L"/components/blocks/media/image.css",
            L"/components/blocks/media/video.css",
            L"/components/blocks/media/audio.css",
            L"/components/blocks/link-button/link-button.css",
            L"/components/blocks/list-items/list-item-shared.css",
            L"/components/blocks/quote/quote.css",
            L"/components/blocks/table/table.css",
            L"/components/blocks/data/table-view.css",
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
            std::string localFileAppPrefix = "http://veritnote.localhost/local-file/";
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

void Backend::LoadFile(const json& payload) {
    std::string path_str = payload.value("path", "");
    std::wstring path = this->string_to_wstring(path_str);

    // 通用透传上下文（解耦前端的特殊需求，如 blockIdToFocus）
    json context = payload.value("context", json::object());

    json response;
    response["action"] = "fileLoaded";
    response["payload"]["path"] = path_str;
    response["payload"]["context"] = context;

    std::string contentStr = ReadFileContent(path);
    if (!contentStr.empty()) {
        try {
            json fileJson = json::parse(contentStr);
            response["payload"]["config"] = fileJson.value("config", json::object());

            // 格式统一化
            if (fileJson.contains("content")) {
                response["payload"]["content"] = fileJson["content"];
            }
        }
        catch (const std::exception& e) {
            response["error"] = std::string("JSON Parse Error: ") + e.what();
        }
    }
    else {
        // 空文件默认结构
        response["payload"]["config"] = json::object();
        response["payload"]["content"] = json::object(); // 前端再根据具体编辑器自行决定空状态
    }
    SendMessageToJS(response);
}

void Backend::SaveFile(const json& payload) {
    std::string path_str = payload.value("path", "");
    std::wstring path = this->string_to_wstring(path_str);

    // 格式统一化
    json config = payload.value("config", json::object());
    json content = payload.value("content", json::object()); // 数组也会被解析为json对象的一种

    json fileContent;
    fileContent["config"] = config;
    fileContent["content"] = content;

    bool success = WriteFileContent(path, fileContent.dump(2));

    json response;
    response["action"] = "fileSaved";
    response["payload"]["path"] = path_str;
    response["payload"]["success"] = success;
    if (!success) response["error"] = "Failed to write file.";

    SendMessageToJS(response);
}

void Backend::FetchQuoteContent(const json& payload) {
    json response;
    response["action"] = "quoteContentFetched";

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

        std::string content = ReadFileContent(this->string_to_wstring(filePathStr));

        json pageJson = json::parse(content); // This can be an array (old) or an object (new)

        // --- START OF FIX ---

        json blocksArray;
        // Determine where the array of blocks is located
        if (pageJson.contains("content")) {
            if (pageJson["content"].contains("blocks")) {
                blocksArray = pageJson["content"]["blocks"];
            }
            else {
				blocksArray = json::array(); // No blocks found, treat as empty
            }
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

void Backend::FetchDataContent(const json& payload) {
    std::string path_str = payload.value("path", "");
    std::string dataBlockId = payload.value("dataBlockId", "");

    json response;
    response["action"] = "dataContentFetched";
    response["payload"]["path"] = path_str;
    response["payload"]["dataBlockId"] = dataBlockId;

    // 读取前端传来的绝对路径文件
    std::string file_content = ReadFileContent(this->string_to_wstring(path_str));

    try {
        json fullJson = json::parse(file_content);
        json filteredJson;

        // 仅提取 data 节点
        if (fullJson.contains("content")) {
            if (fullJson["content"].contains("data")) {
                filteredJson["data"] = fullJson["content"]["data"];
            }
            else {
                filteredJson["data"] = json::object();
            }

            // 仅提取 presets 节点
            if (fullJson["content"].contains("presets")) {
                filteredJson["presets"] = fullJson["content"]["presets"];
            }
            else {
                filteredJson["presets"] = json::array();
            }
        }
        else {
            filteredJson["data"] = json::object();
            filteredJson["presets"] = json::array();
        }

        // 作为 JSON Object 下发给前端
        response["payload"]["content"] = filteredJson;
    }
    catch (const std::exception& e) {
        // 如果文件不存在或解析失败，发送空骨架防止前端崩溃
        response["payload"]["error"] = "Failed to parse database file: " + std::string(e.what());
        response["payload"]["content"] = json::object({ {"data", json::object()}, {"presets", json::array()} });
    }

    SendMessageToJS(response);
}


void Backend::OpenWorkspace(const json& payload) {
    std::string path = payload.value("path", "");
    if (path.empty()) return;

    m_workspaceRoot = this->string_to_wstring(path); // 设置工作区路径

    // 告诉平台去导航
    NavigateTo(L"http://veritnote.localhost/index.html");
}

void Backend::GoToDashboard() {
    NavigateTo(L"http://veritnote.localhost/dashboard.html");
}


void Backend::ReadConfigFile(const json& payload) {
    std::string pathStr = payload.value("path", "");

    json response;
    response["action"] = "configFileRead";
    std::wstring identifier = this->string_to_wstring(pathStr);
    response["payload"]["path"] = pathStr;
    response["payload"]["data"] = ReadJsonFile(identifier);

    SendMessageToJS(response);
}

void Backend::WriteConfigFile(const json& payload) {
    std::string pathStr = payload.value("path", "");
    json data = payload.value("data", json::object());
    std::wstring identifier = this->string_to_wstring(pathStr);
    WriteJsonFile(identifier, data);
    // Optionally send a success message
}

void Backend::ResolveFileConfiguration(const json& payload) {
    std::string filePathStr = payload.value("path", "");

    json finalConfig = json::object();
    // 'identifier' can be a file path on Windows or a content URI on Android.
    std::wstring currentFileIdentifier = this->string_to_wstring(filePathStr);

    // Step 1: Read the file's own embedded config using a virtual method.
    json fileContent = this->ReadJsonFile(currentFileIdentifier);
    if (fileContent.is_object() && fileContent.contains("config")) {
        finalConfig = fileContent["config"];
    }

    // Step 2: Walk up the directory tree, merging folder configs.
    // Use the virtual method to get the first parent identifier.
    std::wstring currentParentIdentifier = this->GetParentIdentifier(currentFileIdentifier);

    // Loop until we can't get a parent or we are above the workspace root.
    // The length check is a simple but effective way to stop traversal.
    while (!currentParentIdentifier.empty() && currentParentIdentifier.length() >= m_workspaceRoot.length()) {

        // Use a virtual method to correctly combine the parent identifier (a directory)
        // with the config filename. This handles path separators vs. URI segments.
        std::wstring configIdentifier = this->CombineIdentifier(currentParentIdentifier, L"veritnoteconfig");

        // Read the folder's config file using the virtual method.
        json folderConfig = this->ReadJsonFile(configIdentifier);

        // Merge folderConfig into finalConfig, but only for keys that are "inherit" or missing in finalConfig.
        // This merging logic is platform-agnostic.
        for (auto const& [category, catConfig] : folderConfig.items()) {
            if (!catConfig.is_object()) continue; // Ensure category config is an object

            if (!finalConfig.contains(category)) {
                finalConfig[category] = json::object();
            }
            for (auto const& [key, value] : catConfig.items()) {
                if (!finalConfig[category].contains(key) || finalConfig[category][key] == "inherit") {
                    finalConfig[category][key] = value;
                }
            }
        }

        // Stop after processing the workspace root directory itself.
        if (currentParentIdentifier == m_workspaceRoot) {
            break;
        }

        // Get the next parent up the chain for the next iteration.
        currentParentIdentifier = this->GetParentIdentifier(currentParentIdentifier);
    }

    json response;
    response["action"] = "fileConfigurationResolved";
    response["payload"]["path"] = filePathStr;
    response["payload"]["config"] = finalConfig;

    SendMessageToJS(response);
}