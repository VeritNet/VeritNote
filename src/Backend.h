#pragma once

#include <string>
#include <wrl.h>
#include <wil/com.h>
#include <WebView2.h>
#include "nlohmann/json.hpp"

using json = nlohmann::json;


class DownloadProgressCallback : public IBindStatusCallback {
public:
    DownloadProgressCallback(std::function<void(ULONG, ULONG)> onProgress, std::function<void(HRESULT)> onComplete)
        : m_ref(1), m_onProgress(onProgress), m_onComplete(onComplete) {
    }

    // IUnknown
    STDMETHODIMP QueryInterface(REFIID riid, void** ppvObject) override {
        if (IsEqualIID(riid, IID_IUnknown) || IsEqualIID(riid, IID_IBindStatusCallback)) {
            *ppvObject = static_cast<IBindStatusCallback*>(this);
            AddRef();
            return S_OK;
        }
        *ppvObject = NULL;
        return E_NOINTERFACE;
    }
    STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&m_ref); }
    STDMETHODIMP_(ULONG) Release() override {
        ULONG ulRef = InterlockedDecrement(&m_ref);
        if (ulRef == 0) delete this;
        return ulRef;
    }

    // IBindStatusCallback
    STDMETHODIMP OnStartBinding(DWORD, IBinding*) override { return S_OK; }
    STDMETHODIMP GetPriority(LONG*) override { return S_OK; }
    STDMETHODIMP OnLowResource(DWORD) override { return S_OK; }
    STDMETHODIMP OnProgress(ULONG ulProgress, ULONG ulProgressMax, ULONG, LPCWSTR) override {
        if (m_onProgress && ulProgressMax > 0) {
            m_onProgress(ulProgress, ulProgressMax);
        }
        return S_OK;
    }
    STDMETHODIMP OnStopBinding(HRESULT hresult, LPCWSTR) override {
        if (m_onComplete) m_onComplete(hresult);
        return S_OK;
    }
    STDMETHODIMP GetBindInfo(DWORD*, BINDINFO*) override { return E_NOTIMPL; }
    STDMETHODIMP OnDataAvailable(DWORD, DWORD, FORMATETC*, STGMEDIUM*) override { return E_NOTIMPL; }
    STDMETHODIMP OnObjectAvailable(REFIID, IUnknown*) override { return E_NOTIMPL; }

private:
    ULONG m_ref;
    std::function<void(ULONG, ULONG)> m_onProgress;
    std::function<void(HRESULT)> m_onComplete;
};



class Backend {
public:
    Backend();
    void SetWebView(ICoreWebView2* webview);
    void SetMainWindowHandle(HWND hWnd);
    void HandleWebMessage(const std::wstring& message);
    bool IsFullscreen() const;
    void CheckWindowState();
    void OpenExternalLink(const std::wstring& url);

private:
    void SendMessageToJS(const json& message);

    // --- Action Handlers ---
    void ListWorkspace(const json& payload);
    void LoadPage(const json& payload);
    void SavePage(const json& payload);
    void ExportPageAsHtml(const json& payload);
    void CreateItem(const json& payload);
    void DeleteItem(const json& payload);
    void RequestNoteList();
    void OpenFileDialog();
    void PrepareExportLibs(const json& payload);
    void ProcessExportImages(const json& payload);
    void FetchQuoteContent(const json& payload);
    void OpenWorkspaceDialog();
    void OpenWorkspace(const json& payload);
    void GoToDashboard();
    void ToggleFullscreen();
    void CancelExport();

    void MinimizeWindow();
    void MaximizeWindow();
    void CloseWindow();
    void StartWindowDrag();

    // --- Configuration System ---
    void EnsureWorkspaceConfigs(const json& payload);
    void ReadConfigFile(const json& payload);
    void WriteConfigFile(const json& payload);
    void ResolveFileConfiguration(const json& payload);

    // Helper
    json ReadJsonFile(const std::filesystem::path& path);
    void WriteJsonFile(const std::filesystem::path& path, const json& data);


    // --- Private Members ---
    wil::com_ptr<ICoreWebView2> m_webview;
    std::wstring m_workspaceRoot;
    HWND m_hWnd;
    bool m_isFullscreen = false;
    WINDOWPLACEMENT m_wpPrev = { sizeof(m_wpPrev) };
};