#pragma once

#include "include/Backend.h"
#include <windows.h>
#include <wrl.h>
#include <wil/com.h>
#include <WebView2.h>

// WinBackend 继承自通用的 Backend 接口，
// 并提供了所有与 Windows 平台相关的具体实现。
class WinBackend : public Backend {
public:
    WinBackend();

    // --- 实现 Backend 的纯虚函数 ---
    void SendMessageToJS(const json& message) override;
    void OpenFileDialog() override;
    void OpenWorkspace(const json& payload) override;
    void OpenWorkspaceDialog() override;
    void NavigateTo(const std::wstring& url) override;
    void ToggleFullscreen() override;
    void MinimizeWindow() override;
    void MaximizeWindow() override;
    void CloseWindow() override;
    void StartWindowDrag() override;
    void CheckWindowState() override;
    bool IsFullscreen() const override;
    bool DownloadFile(const std::wstring& url, const std::filesystem::path& destination, std::function<void(int)> onProgress) override;
    bool LoadResourceData(int resource_id, void*& pData, DWORD& dwSize) override;
    std::wstring string_to_wstring(const std::string& str) const override;
    std::string wstring_to_string(const std::wstring& wstr) const override;
    bool UrlDecode(const std::string& encoded, std::string& decoded) const override;

    void ListWorkspace(const json& payload) override;
    void LoadPage(const json& payload) override;
    void SavePage(const json& payload) override;
    void CreateItem(const json& payload) override;
    void DeleteItem(const json& payload) override;

    json ReadJsonFile(const std::wstring& identifier) override;
    void WriteJsonFile(const std::wstring& identifier, const json& data) override;
    std::wstring GetParentIdentifier(const std::wstring& identifier) override;
    std::wstring CombineIdentifier(const std::wstring& parent, const std::wstring& childFilename) override;

    void EnsureWorkspaceConfigs(const json& payload) override;

    // --- Windows 平台特有的方法 ---
    void OpenExternalLink(const std::wstring& url);
    void SetWebView(ICoreWebView2* webview);
    void SetMainWindowHandle(HWND hWnd);
    std::wstring GetNextWorkspacePath() const;
    void ClearNextWorkspacePath();


private:
    // --- Windows 平台特有的成员变量 ---
    wil::com_ptr<ICoreWebView2> m_webview;
    HWND m_hWnd;
    bool m_isFullscreen = false;
    WINDOWPLACEMENT m_wpPrev = { sizeof(m_wpPrev) };
    std::wstring m_nextWorkspacePath; // 用于在导航后注入路径
};