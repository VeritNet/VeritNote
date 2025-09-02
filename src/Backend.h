#pragma once

#include <string>
#include <wrl.h>
#include <wil/com.h>
#include <WebView2.h>
#include "nlohmann/json.hpp"

using json = nlohmann::json;

class Backend {
public:
    Backend();
    void SetWebView(ICoreWebView2* webview);
    void HandleWebMessage(const std::wstring& message);

private:
    void SendMessageToJS(const json& message);

    // --- Action Handlers ---
    void ListWorkspace(const json& payload);
    void LoadPage(const json& payload);
    void SavePage(const json& payload);
    void StartExport(const json& payload);
    void ExportPageAsHtml(const json& payload);
    void CreateItem(const json& payload);
    void DeleteItem(const json& payload);
    void RequestNoteList();
    void OpenFileDialog();


    // --- Private Members ---
    wil::com_ptr<ICoreWebView2> m_webview;
    std::wstring m_workspaceRoot;
};