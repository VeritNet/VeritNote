#pragma once

#include <string>
#include <filesystem>
#include "nlohmann/json.hpp"

#if defined(WIN32) || defined(_WIN32)
#include <windows.h> // 在 Windows 上，直接包含 windows.h 来获取 DWORD
#elif defined(__ANDROID__)
#include <cstdint>
typedef uint32_t DWORD;
#else 
// 为其他未来平台提供一个默认定义
#include <cstdint>
typedef uint32_t DWORD;
#endif

using json = nlohmann::json;

// 这是一个抽象基类，定义了所有平台后端都需要提供的功能。
class Backend {
public:
    // 虚析构函数对于基类是必须的
    Backend() = default;
    virtual ~Backend() = default;

    // --- 平台无关的核心逻辑 ---
    // 这个方法负责解析来自JS的消息，并分发到下面的各个处理函数。
    // 它的实现是所有平台共享的，所以它不是纯虚函数。
    void HandleWebMessage(const std::string& message);

protected:
    // --- 平台相关的抽象接口 (纯虚函数) ---
    // 这些函数必须由特定平台的子类（如 WinBackend, AndroidBackend）来实现。
    virtual void SendMessageToJS(const json& message) = 0;
    virtual void OpenFileDialog() = 0;
    virtual void OpenWorkspace(const json& payload);
    virtual void OpenWorkspaceDialog() = 0;
    virtual void NavigateTo(const std::wstring& url) = 0;
    virtual void ToggleFullscreen() = 0;
    virtual void MinimizeWindow() = 0;
    virtual void MaximizeWindow() = 0;
    virtual void CloseWindow() = 0;
    virtual void StartWindowDrag() = 0;
    virtual void CheckWindowState() = 0;
    virtual bool IsFullscreen() const = 0;
    virtual bool DownloadFile(const std::wstring& url, const std::filesystem::path& destination, std::function<void(int)> onProgress) = 0;
    virtual bool LoadResourceData(int resource_id, void*& pData, DWORD& dwSize) = 0;
    virtual std::wstring string_to_wstring(const std::string& str) const = 0;
    virtual std::string wstring_to_string(const std::wstring& wstr) const = 0;
    virtual bool UrlDecode(const std::string& encoded, std::string& decoded) const = 0;

    virtual void ListWorkspace(const json& payload) = 0;
    virtual void LoadPage(const json& payload) = 0;
    virtual void SavePage(const json& payload) = 0;
    virtual void CreateItem(const json& payload) = 0;
    virtual void DeleteItem(const json& payload) = 0;

    virtual void EnsureWorkspaceConfigs(const json& payload) = 0;

    virtual json ReadJsonFile(const std::wstring& identifier) = 0;
    virtual void WriteJsonFile(const std::wstring& identifier, const json& data) = 0;
    virtual std::wstring GetParentIdentifier(const std::wstring& identifier) = 0;
    virtual std::wstring CombineIdentifier(const std::wstring& parent, const std::wstring& childFilename) = 0;

    // --- 业务逻辑处理函数 (平台无关) ---
    // 这些函数的实现放在 Backend.cpp 中，因为它们不直接依赖任何平台API。
    void ExportPageAsHtml(const json& payload);
    void RequestNoteList();
    void PrepareExportLibs(const json& payload);
    void ProcessExportImages(const json& payload);
    void FetchQuoteContent(const json& payload);
    void GoToDashboard();
    void CancelExport();
    void ReadConfigFile(const json& payload);
    void WriteConfigFile(const json& payload);
    void ResolveFileConfiguration(const json& payload);

    bool ExtractResourceToFile(const std::wstring& resourceUrlPath, const std::filesystem::path& destinationPath);

protected:
    // 工作区根目录是所有后端都需要维护的状态，所以放在基类里。
    std::wstring m_workspaceRoot;
};