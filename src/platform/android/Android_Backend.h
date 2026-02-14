#pragma once

#include <jni.h>
#include "include/Backend.h"

class AndroidBackend : public Backend {
public:
    AndroidBackend();
    void onUiReady();

    // --- 实现 Backend 的纯虚函数 ---
    void SendMessageToJS(const json& message) override;
    void NavigateTo(const std::wstring& url) override;
    void OpenWorkspaceDialog() override;
    void OpenWorkspace(const json& payload) override;

    // [新增] 从 JNI Bridge 调用的回调函数
    void OnPlatformServiceResult(const std::string& resultJson);

    // --- 平台相关的转换函数 ---
    std::wstring string_to_wstring(const std::string& str) const override;
    std::string wstring_to_string(const std::wstring& wstr) const override;
    bool UrlDecode(const std::string& encoded, std::string& decoded) const override;

    void ListWorkspace(const json& payload) override;

    std::string ReadFileContent(const std::wstring& path) override;
    bool WriteFileContent(const std::wstring& path, const std::string& content) override;

    void CreateItem(const json& payload) override;
    void DeleteItem(const json& payload) override;

    void EnsureWorkspaceConfigs(const json& payload) override;

    json ReadJsonFile(const std::wstring& identifier) override;
    void WriteJsonFile(const std::wstring& identifier, const json& data) override;
    std::wstring GetParentIdentifier(const std::wstring& identifier) override;
    std::wstring CombineIdentifier(const std::wstring& parent, const std::wstring& childFilename) override;

    void SetMainActivityInstance(jobject mainActivityInstance);
    void OpenFileDialog() override;
    void ToggleFullscreen() override;
    void MinimizeWindow() override;
    void MaximizeWindow() override;
    void CloseWindow() override;
    void StartWindowDrag() override;
    void CheckWindowState() override;
    bool IsFullscreen() const override;
    bool DownloadFile(const std::wstring& url, const std::filesystem::path& destination, std::function<void(int)> onProgress) override;
    bool LoadResourceData(int resource_id, void*& pData, DWORD& dwSize) override;

    // Android
    void OpenExternalLink(const std::wstring& url);
    std::wstring GetNextWorkspacePath() const;
    void ClearNextWorkspacePath();


private:
    // [NEW] 异步服务请求机制
    void RequestPlatformService(const json& request, std::function<void(const json&)> callback);

    jobject m_mainActivityInstance;
    int m_nextServiceCallbackId = 0;
    std::map<int, std::function<void(const json&)>> m_serviceCallbacks;

    std::wstring m_nextWorkspacePath;
};