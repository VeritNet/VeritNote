// Inter-Process Communication: JS <-> C++
const ipc = {
    // 向 C++ 后端发送消息
    send: (action, payload = {}) => {
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({ action, payload });
        } else {
            console.warn("WebView environment not detected. Message not sent:", { action, payload });
        }
    },

    // 初始化，监听来自 C++ 的消息
    init: () => {
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.addEventListener('message', event => {
                const message = event.data;
                console.log("Received from C++:", message);

                // 使用 CustomEvent 将消息分发给应用的其他部分
                // 这样可以解耦 ipc 层和业务逻辑层
                const customEvent = new CustomEvent(message.action, { detail: message });
                window.dispatchEvent(customEvent);
            });
        }
    },

    // --- 封装的API ---
    listWorkspace: () => {
        ipc.send('listWorkspace');
    },

    loadPage: (path, fromPreview = false) => {
        ipc.send('loadPage', { path, fromPreview });
    },

    savePage: (path, content) => {
        ipc.send('savePage', { path, content });
    },

    startExport: () => {
        ipc.send('exportPages');
    },
    exportPageAsHtml: (path, html) => {
        ipc.send('exportPageAsHtml', { path, html });
    },
    createItem: (parentPath, name, type) => {
        ipc.send('createItem', { parentPath, name, type });
    },
    deleteItem: (path) => {
        ipc.send('deleteItem', { path });
    },

    requestNoteList: () => {
        ipc.send('requestNoteList');
    },

    openFileDialog: () => {
        ipc.send('openFileDialog');
    },

    prepareExportLibs: (libPaths) => {
        ipc.send('prepareExportLibs', { paths: libPaths });
    },

    openWorkspaceDialog: () => ipc.send('openWorkspaceDialog'),
    openWorkspace: (path) => ipc.send('openWorkspace', path),
    goToDashboard: () => ipc.send('goToDashboard'),
    toggleFullscreen: () => ipc.send('toggleFullscreen'),
    setWorkspace: (path) => ipc.send('setWorkspace', path),
};

// 立即初始化监听器
ipc.init();