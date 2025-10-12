#include "Android_Backend.h"
#include <string>
#include <codecvt>
#include <locale>
#include <sstream>
#include <iomanip>
#include <android/log.h>
#include "include/Platform.h"
#include "resources.h" // For g_resource_map
#include <android/asset_manager_jni.h>

// 全局 JavaVM 指针，由 JNI_Bridge.cpp 设置
extern JavaVM* g_jvm;

// 辅助函数，用于获取当前线程的 JNIEnv*
JNIEnv* GetJNIEnv() {
    JNIEnv* env = nullptr;
    if (g_jvm->GetEnv(reinterpret_cast<void**>(&env), JNI_VERSION_1_6) != JNI_OK) {
        // 如果当前线程未附加到 JVM，则附加
        if (g_jvm->AttachCurrentThread(&env, nullptr) != JNI_OK) {
            return nullptr; // 附加失败
        }
    }
    return env;
}



/**
 * [NEW] 向 Kotlin 发起一个通用的平台服务请求
 */
void AndroidBackend::RequestPlatformService(const json& request, std::function<void(const json&)> callback) {
    if (!m_mainActivityInstance) return;

    JNIEnv* env = GetJNIEnv();
    if (!env) return;

    // 1. 分配并存储回调
    int callbackId = m_nextServiceCallbackId++;
    m_serviceCallbacks[callbackId] = callback;

    // 2. 将 callbackId 添加到请求中
    json request_with_id = request;
    request_with_id["callbackId"] = callbackId;

    // 3. JNI 调用
    jclass mainActivityClass = env->GetObjectClass(m_mainActivityInstance);
    if (!mainActivityClass) return;

    jmethodID requestMethodID = env->GetMethodID(mainActivityClass, "requestPlatformService", "(Ljava/lang/String;)V");
    if (!requestMethodID) {
        LOG_DEBUG("Failed to find method requestPlatformService.");
        env->DeleteLocalRef(mainActivityClass);
        m_serviceCallbacks.erase(callbackId); // 清理回调
        return;
    }

    std::string request_str = request_with_id.dump();
    jstring requestJString = env->NewStringUTF(request_str.c_str());

    env->CallVoidMethod(m_mainActivityInstance, requestMethodID, requestJString);

    env->DeleteLocalRef(requestJString);
    env->DeleteLocalRef(mainActivityClass);
}

/**
 * [NEW] 当 Kotlin 完成服务后，此函数被 JNI Bridge 调用
 */
void AndroidBackend::OnPlatformServiceResult(const std::string& resultJson) {
    try {
        json result = json::parse(resultJson);
        int callbackId = result.value("callbackId", -1);

        LOG_DEBUG("AndroidBackend::OnPlatformServiceResult: " + callbackId);

        auto it = m_serviceCallbacks.find(callbackId);
        if (it != m_serviceCallbacks.end()) {
            // 找到回调并执行
            it->second(result);
            // 执行后移除
            m_serviceCallbacks.erase(it);
        }
        else {
            LOG_DEBUG("Failed to find platform service function.");
        }
    }
    catch (const json::parse_error& e) {
        LOG_DEBUG("Failed to parse platform service result JSON.");
    }
}


// --- 构造函数与初始化 ---
AndroidBackend::AndroidBackend() : m_mainActivityInstance(nullptr) {}

void AndroidBackend::SetMainActivityInstance(jobject mainActivityInstance) {
    m_mainActivityInstance = mainActivityInstance;
}

void AndroidBackend::onUiReady() {
    this->GoToDashboard();
}

// --- 核心功能实现 ---

/**
 * [已实现] 通过 JNI 调用 MainActivity 的 postMessageToJs 方法，将消息发送到 WebView
 */
void AndroidBackend::SendMessageToJS(const json& message) {
    LOG_DEBUG("AndroidBackend::SendMessageToJS");
    if (!m_mainActivityInstance) return;

    JNIEnv* env = GetJNIEnv();
    if (!env) return;

    jclass mainActivityClass = env->GetObjectClass(m_mainActivityInstance);
    if (!mainActivityClass) return;

    jmethodID postMessageMethodID = env->GetMethodID(mainActivityClass, "postMessageToJs", "(Ljava/lang/String;)V");
    if (!postMessageMethodID) {
        LOG_DEBUG("AndroidBackend::SendMessageToJS(const json& message): Failed to find method postMessageToJs.");
        env->DeleteLocalRef(mainActivityClass);
        return;
    }

    std::string json_str = message.dump();
    jstring jsonJString = env->NewStringUTF(json_str.c_str());

    LOG_DEBUG("AndroidBackend::SendMessageToJS(const json& message): Sending");
    LOG_DEBUG(json_str.c_str());

    env->CallVoidMethod(m_mainActivityInstance, postMessageMethodID, jsonJString);

    env->DeleteLocalRef(jsonJString);
    env->DeleteLocalRef(mainActivityClass);
}

/**
 * [已实现] 打开文件夹选择器
 */
void AndroidBackend::OpenWorkspaceDialog() {
    json request;
    request["action"] = "openWorkspaceDialog";

    RequestPlatformService(request, [this](const json& result) {
        // 这是从 Kotlin 返回时的回调逻辑
        if (result.value("success", false)) {
            LOG_DEBUG("AndroidBackend::OpenWorkspaceDialog(): result.value('success', false) == true");
            json payload;
            // [CRITICAL CHANGE] "path" 现在是 content:// URI 字符串
            payload["path"] = result["data"].value("uri", "");

            LOG_DEBUG(result["data"].value("uri", "").c_str());

            json message;
            message["action"] = "workspaceDialogClosed";
            message["payload"] = payload;
            SendMessageToJS(message);
        }
        else {
            LOG_DEBUG("AndroidBackend::OpenWorkspaceDialog(): result.value('success', false) == false");
        }
        });
}


// [NEW] Android-specific implementation of ListWorkspace
void AndroidBackend::ListWorkspace(const json& payload) {
    LOG_DEBUG("AndroidBackend::ListWorkspace");
    if (m_workspaceRoot.empty()) {
        json response;
        response["action"] = "workspaceListed";
        response["error"] = "Workspace root (URI) not set.";
        SendMessageToJS(response);
        return;
    }

    json request;
    request["action"] = "listDirectory";
    request["payload"]["uri"] = wstring_to_string(m_workspaceRoot);

    RequestPlatformService(request, [this](const json& result) {
        json response;
        response["action"] = "workspaceListed";
        if (result.value("success", false)) {
            // 将 Kotlin 返回的文件列表转换为前端需要的树状结构
            json tree_node;
            tree_node["name"] = "root"; // The name can be derived differently if needed
            tree_node["path"] = wstring_to_string(m_workspaceRoot); // Use the root URI
            tree_node["type"] = "folder";
            tree_node["children"] = json::array();

            const auto& files = result["data"]["files"];

            for (const auto& file_item : files) {
                // TODO: This is a flat list. For nested structure, a recursive
                // platform service request would be needed. Let's start with flat.
                json file_node;
                std::string name = file_item.value("name", "");
                // Remove extension for display name if it's a veritnote file
                std::string ext = ".veritnote";
                if (name.size() > ext.size() && name.substr(name.size() - ext.size()) == ext) {
                    file_node["name"] = name.substr(0, name.size() - ext.size());
                    file_node["type"] = "page";
                }
                else {
                    file_node["name"] = name;
                    file_node["type"] = file_item.value("isDirectory", false) ? "folder" : "unknown";
                }

                file_node["path"] = file_item.value("uri", ""); // Use the URI as the path

                // Only add folders and veritnote files
                if (file_node["type"] == "page" || file_node["type"] == "folder") {
                    if (file_node["type"] == "folder") {
                        // For now, folders are empty shells. Recursive loading can be a future feature.
                        file_node["children"] = json::array();
                    }
                    tree_node["children"].push_back(file_node);
                }
            }

            response["payload"] = tree_node;

            if (tree_node["children"].empty()) {
                std::filesystem::path destFilePath = "welcome.veritnote"; // Filename only

                // For Android, we cannot use filesystem::path. We need to create it in the URI.
                // We use a simplified version of ExtractResourceToFile's logic here.
                auto it = g_resource_map.find(L"/welcome.veritnote");
                if (it != g_resource_map.end()) {
                    void* pData = nullptr;
                    DWORD dwSize = 0;
                    if (this->LoadResourceData(it->second, pData, dwSize)) {
                        std::string content(static_cast<char*>(pData), dwSize);
                        delete[] static_cast<char*>(pData); // Release memory from LoadResourceData

                        json create_request;
                        create_request["action"] = "createItem";
                        create_request["payload"]["parentUri"] = wstring_to_string(m_workspaceRoot);
                        create_request["payload"]["name"] = "welcome.veritnote";
                        create_request["payload"]["isDirectory"] = false;

                        RequestPlatformService(create_request, [this, content](const json& create_result) {
                            if (create_result.value("success", false)) {
                                std::string new_file_uri = create_result["data"].value("uri", "");
                                json write_request;
                                write_request["action"] = "writeFile";
                                write_request["payload"]["uri"] = new_file_uri;
                                write_request["payload"]["content"] = content;
                                RequestPlatformService(write_request, [this](const json& write_result) {
                                    // After writing, re-list the workspace to show the new file
                                    this->ListWorkspace(json::object());
                                    });
                            }
                            });
                        // IMPORTANT: We return here because the final response will be sent
                        // asynchronously after the file is created and the workspace is re-listed.
                        return;
                    }
                }
            }
        }
        else {
            response["error"] = result.value("error", "Failed to list directory.");
        }
        SendMessageToJS(response);
        });
}

void AndroidBackend::CreateItem(const json& payload) {
    std::string parentPathUri = payload.value("parentPath", "");
    std::string name = payload.value("name", "");
    std::string type = payload.value("type", "");

    if (parentPathUri.empty() || name.empty() || type.empty()) return;

    bool isDirectory = (type == "folder");
    std::string finalName = isDirectory ? name : name + ".veritnote";

    json request;
    request["action"] = "createItem";
    request["payload"]["parentUri"] = parentPathUri;
    request["payload"]["name"] = finalName;
    request["payload"]["isDirectory"] = isDirectory;

    RequestPlatformService(request, [this, isDirectory](const json& result) {
        if (result.value("success", false) && !isDirectory) {
            // If we created a file, write initial empty content to it.
            std::string new_file_uri = result["data"].value("uri", "");
            json newPageContent;
            newPageContent["config"] = json::object({ {"page", json::object()} });
            newPageContent["blocks"] = json::array();

            json write_request;
            write_request["action"] = "writeFile";
            write_request["payload"]["uri"] = new_file_uri;
            write_request["payload"]["content"] = newPageContent.dump(2);
            RequestPlatformService(write_request, [this](const json&) {
                SendMessageToJS({ {"action", "workspaceUpdated"} });
                });
        }
        else {
            // For folders, or if creation failed, just update.
            SendMessageToJS({ {"action", "workspaceUpdated"} });
        }
        });
}

void AndroidBackend::DeleteItem(const json& payload) {
    std::string pathUri = payload.value("path", "");
    if (pathUri.empty()) return;

    json request;
    request["action"] = "deleteItem";
    request["payload"]["uri"] = pathUri;

    RequestPlatformService(request, [this](const json& result) {
        // Regardless of success or failure, we tell the frontend to update its tree.
        SendMessageToJS({ {"action", "workspaceUpdated"} });
        });
}

// [NEW - REWRITTEN] Android-specific implementation of EnsureWorkspaceConfigs
void AndroidBackend::EnsureWorkspaceConfigs(const json& payload) {
    if (m_workspaceRoot.empty()) return;

    // 1. 请求平台服务递归地列出所有子目录
    json request;
    request["action"] = "listAllSubdirectories";
    request["payload"]["rootUri"] = wstring_to_string(m_workspaceRoot);

    RequestPlatformService(request, [this](const json& result) {
        if (!result.value("success", false)) {
            LOG_DEBUG("Failed to list subdirectories for EnsureWorkspaceConfigs.");
            return;
        }

        // 2. C++ 接收到所有目录的 URI 列表
        auto allDirs = result["data"].value("directories", json::array());

        // 确保根目录本身也被处理
        allDirs.push_back(wstring_to_string(m_workspaceRoot));

        // 3. C++ 循环列表，为每个目录创建配置文件
        for (const auto& dirUri_json : allDirs) {
            std::string dirUri = dirUri_json.get<std::string>();

            json create_req;
            const std::string config_name = "veritnoteconfig";
            create_req["action"] = "createItem";
            create_req["payload"]["parentUri"] = dirUri;
            create_req["payload"]["name"] = config_name;
            create_req["payload"]["isDirectory"] = false;

            // 调用创建服务。这是一个“尝试创建”的操作，如果文件已存在，
            // Kotlin 端的 createItem 会失败，这是我们期望的行为。
            RequestPlatformService(create_req, [this](const json& create_result) {
                if (create_result.value("success", false)) {
                    // 如果文件是新创建的，我们需要写入默认内容
                    std::string new_file_uri = create_result["data"].value("uri", "");

                    json defaultConfig = { {"page", json::object()} };

                    json write_req;
                    write_req["action"] = "writeFile";
                    write_req["payload"]["uri"] = new_file_uri;
                    write_req["payload"]["content"] = defaultConfig.dump(2);

                    // 发起写入请求，这是一个 fire-and-forget 操作
                    RequestPlatformService(write_req, [](const json&) {});
                }
                // 如果创建失败（比如文件已存在），我们什么都不做，继续处理下一个目录。
                });
        }
        });
}

// [NEW] Implementation of the path injection mechanism
std::wstring AndroidBackend::GetNextWorkspacePath() const {
    return m_nextWorkspacePath;
}

void AndroidBackend::ClearNextWorkspacePath() {
    m_nextWorkspacePath.clear();
}

// [NEW] Override OpenWorkspace to store the path before navigating
void AndroidBackend::OpenWorkspace(const json& payload) {
    std::string path = payload.value("path", "");
    if (path.empty()) return;

    // 1. Store the path (URI string) for later injection
    m_nextWorkspacePath = this->string_to_wstring(path);

    // 2. Call the base class implementation which sets m_workspaceRoot
    //    and calls NavigateTo.
    Backend::OpenWorkspace(payload);
}

// [NEW] Android-specific implementation of LoadPage
void AndroidBackend::LoadPage(const json& payload) {
    std::string path_uri_str = payload.value("path", "");
    if (path_uri_str.empty()) return;

    json request;
    request["action"] = "readFile";
    request["payload"]["uri"] = path_uri_str;

    RequestPlatformService(request, [this, payload](const json& result) {
        json response;
        response["action"] = "pageLoaded";
        response["payload"] = payload; // Echo the original payload

        if (result.value("success", false)) {
            std::string content_str = result["data"].value("content", "[]");
            try {
                json pageJson = json::parse(content_str);
                if (pageJson.is_array()) {
                    response["payload"]["content"] = pageJson;
                    response["payload"]["config"] = json::object();
                }
                else {
                    response["payload"]["content"] = pageJson.value("blocks", json::array());
                    response["payload"]["config"] = pageJson.value("config", json::object());
                }
            }
            catch (const json::parse_error& e) {
                response["error"] = "Failed to parse file content.";
            }
        }
        else {
            response["error"] = result.value("error", "Failed to read file.");
        }
        SendMessageToJS(response);
        });
}

// [NEW] Android-specific implementation of SavePage
void AndroidBackend::SavePage(const json& payload) {
    std::string path_uri_str = payload.value("path", "");
    if (path_uri_str.empty()) return;

    json blocks = payload.value("blocks", json::array());
    json config = payload.value("config", json::object());

    json fileContent;
    fileContent["config"] = config;
    fileContent["blocks"] = blocks;
    std::string content_to_write = fileContent.dump(2);

    json request;
    request["action"] = "writeFile";
    request["payload"]["uri"] = path_uri_str;
    request["payload"]["content"] = content_to_write;

    RequestPlatformService(request, [this, path_uri_str](const json& result) {
        json response;
        response["action"] = "pageSaved";
        response["payload"]["path"] = path_uri_str;
        response["payload"]["success"] = result.value("success", false);
        if (!result.value("success", false)) {
            response["error"] = result.value("error", "Failed to write file.");
        }
        SendMessageToJS(response);
        });
}


void AndroidBackend::NavigateTo(const std::wstring& url) {
    if (!m_mainActivityInstance) {
        LOG_DEBUG("MainActivity instance is null, cannot navigate.");
        return;
    }

    JNIEnv* env = GetJNIEnv();
    if (!env) {
        LOG_DEBUG("Failed to get JNIEnv.");
        return;
    }

    jclass mainActivityClass = env->GetObjectClass(m_mainActivityInstance);
    if (!mainActivityClass) {
        LOG_DEBUG("Failed to find MainActivity class.");
        return;
    }

    jmethodID navigateMethodID = env->GetMethodID(mainActivityClass, "navigateToUrl", "(Ljava/lang/String;)V");
    if (!navigateMethodID) {
        LOG_DEBUG("Failed to find method navigateToUrl.");
        return;
    }

    std::string url_utf8 = this->wstring_to_string(url);
    jstring urlJString = env->NewStringUTF(url_utf8.c_str());

    env->CallVoidMethod(m_mainActivityInstance, navigateMethodID, urlJString);

    env->DeleteLocalRef(urlJString);
    env->DeleteLocalRef(mainActivityClass);
}


// --- 平台相关的转换函数 ---
std::string AndroidBackend::wstring_to_string(const std::wstring& wstr) const {
    std::wstring_convert<std::codecvt_utf8<wchar_t>, wchar_t> converter;
    return converter.to_bytes(wstr);
}

std::wstring AndroidBackend::string_to_wstring(const std::string& str) const {
    std::wstring_convert<std::codecvt_utf8<wchar_t>, wchar_t> converter;
    return converter.from_bytes(str);
}

bool AndroidBackend::UrlDecode(const std::string& encoded, std::string& decoded) const {
    std::ostringstream result_stream;
    result_stream.fill('0');

    for (size_t i = 0; i < encoded.length(); ++i) {
        char c = encoded[i];
        if (c == '%') {
            if (i + 2 < encoded.length()) {
                std::string hex = encoded.substr(i + 1, 2);
                try {
                    int decoded_char = std::stoi(hex, nullptr, 16);
                    result_stream << static_cast<char>(decoded_char);
                    i += 2;
                }
                catch (const std::invalid_argument& e) { return false; }
            }
            else { return false; }
        }
        else if (c == '+') {
            result_stream << ' ';
        }
        else {
            result_stream << c;
        }
    }
    decoded = result_stream.str();
    return true;
}

// --- 待实现的空桩函数 ---
bool AndroidBackend::LoadResourceData(int resource_id, void*& pData, DWORD& dwSize) {
    // 1. 从 resource_id 反向查找路径
    std::wstring resourceUrlPath;
    for (const auto& pair : g_resource_map) {
        if (pair.second == resource_id) {
            resourceUrlPath = pair.first;
            break;
        }
    }
    if (resourceUrlPath.empty()) return false;

    // 2. 通过 JNI 获取 AssetManager
    JNIEnv* env = GetJNIEnv();
    if (!env || !m_mainActivityInstance) return false;

    jclass activityClass = env->GetObjectClass(m_mainActivityInstance);
    jmethodID getAssetsMethod = env->GetMethodID(activityClass, "getAssets", "()Landroid/content/res/AssetManager;");
    jobject assetManagerObj = env->CallObjectMethod(m_mainActivityInstance, getAssetsMethod);
    AAssetManager* assetManager = AAssetManager_fromJava(env, assetManagerObj);
    env->DeleteLocalRef(activityClass);
    env->DeleteLocalRef(assetManagerObj);
    if (!assetManager) return false;

    // 3. 打开 Asset
    // resourceUrlPath starts with '/', we need to remove it.
    std::string assetPath = wstring_to_string(resourceUrlPath.substr(1));
    AAsset* asset = AAssetManager_open(assetManager, assetPath.c_str(), AASSET_MODE_BUFFER);
    if (!asset) {
        LOG_DEBUG(("Failed to open asset: " + assetPath).c_str());
        return false;
    }

    // 4. 读取数据
    dwSize = AAsset_getLength(asset);
    // 我们需要自己分配内存，因为资源数据在 C++ 这边没有静态内存
    pData = new char[dwSize];
    memcpy(pData, AAsset_getBuffer(asset), dwSize);

    AAsset_close(asset);

    // 注意：这里的 pData 是 new 出来的，调用者（如 ExtractResourceToFile）用完后
    // 理论上需要释放。但由于 Windows 版的 LockResource 不需要释放，为了接口一致，
    // 我们暂时接受这个微小的内存泄漏。更好的方案是修改接口，返回智能指针或让调用者负责释放。
    // 对于只在启动时调用一次的 welcome.veritnote 来说，影响可以忽略。
    return true;
}

void AndroidBackend::OpenFileDialog() {}
void AndroidBackend::OpenExternalLink(const std::wstring& url) {}
void AndroidBackend::ToggleFullscreen() {}
void AndroidBackend::MinimizeWindow() {}
void AndroidBackend::MaximizeWindow() {}
void AndroidBackend::CloseWindow() {}
void AndroidBackend::StartWindowDrag() {}
void AndroidBackend::CheckWindowState() {}
bool AndroidBackend::IsFullscreen() const { return false; }
bool AndroidBackend::DownloadFile(const std::wstring& url, const std::filesystem::path& destination, std::function<void(int)> onProgress) { return false; }