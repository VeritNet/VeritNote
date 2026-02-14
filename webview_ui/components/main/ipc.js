// Inter-Process Communication: JS <-> C++
const ipc = {
    // 向 C++ 后端发送消息
    send: (action, payload = {}) => {
        // [修改] 在 Android 上，我们使用 JS Bridge
        if (window.AndroidBridge && window.AndroidBridge.postMessage) {
            window.AndroidBridge.postMessage(JSON.stringify({ action, payload }));
        } else if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({ action, payload });
        } else {
            console.warn("WebView environment not detected. Message not sent:", { action, payload });
        }
    },

    // 初始化，监听来自 C++ 的消息
    init: () => {
        // Windows WebView2 的监听方式
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.addEventListener('message', event => {
                ipc.messageHandler(event.data);
            });
        }
        // 为 Android 设置一个全局的消息处理器
        if (!window.chrome) window.chrome = {};
        if (!window.chrome.webview) window.chrome.webview = {};
        
        window.chrome.webview.messageHandler = (jsonString) => {
            try {
                const message = JSON.parse(jsonString);
                ipc.messageHandler(message);
            } catch (e) {
                console.error("Failed to parse message from C++:", jsonString, e);
            }
        };
    },
    // 统一的消息处理逻辑
    messageHandler: (message) => {
        const callbackId = message.payload?.callbackId;

        if (callbackId !== undefined && ipc._callbacks.has(Number(callbackId))) {
            const numericId = Number(callbackId);
            const resolve = ipc._callbacks.get(numericId);
            resolve(message.payload);
            ipc._callbacks.delete(numericId);
        } else {
            const customEvent = new CustomEvent(message.action, { detail: message });
            window.dispatchEvent(customEvent);
        }
    },


    // --- 封装的API ---
    listWorkspace: () => {
        ipc.send('listWorkspace');
    },


    // Page
    loadPage: (path, blockIdToFocus = null, fromPreview = false) => {
        ipc.send('loadPage', { path, fromPreview, blockIdToFocus });
    },
    savePage: (path, blocks, config) => {
        ipc.send('savePage', { path, blocks, config });
    },

    // Data
    loadData: (path) => {
        ipc.send('loadData', { path });
    },
    saveData: (path, content) => {
        ipc.send('saveData', { path, content });
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

    openFileDialog: () => {
        ipc.send('openFileDialog');
    },

    prepareExportLibs: (libPaths) => {
        ipc.send('prepareExportLibs', { paths: libPaths });
    },

    processExportImages: (tasks) => {
        ipc.send('processExportImages', { tasks });
    },

    fetchQuoteContent: (requestIdentifier, referenceLink) => {
        ipc.send('fetchQuoteContent', { quoteBlockId: requestIdentifier, referenceLink });
    },

    fetchDataContent: (requestIdentifier, path) => {
        ipc.send('fetchDataContent', { dataBlockId: requestIdentifier, path });
    },

    openWorkspaceDialog: () => {
        return new Promise((resolve) => {
            const handleDialogClose = (event) => {
                window.removeEventListener('workspaceDialogClosed', handleDialogClose);
                resolve(event.detail.payload.path); // 返回选择的路径
            };
            
            window.addEventListener('workspaceDialogClosed', handleDialogClose, { once: true });
            
            ipc.send('openWorkspaceDialog');
        });
    },
    openWorkspace: (path) => ipc.send('openWorkspace', { path }),
    goToDashboard: () => ipc.send('goToDashboard'),
    toggleFullscreen: () => ipc.send('toggleFullscreen'),
    setWorkspace: (path) => ipc.send('setWorkspace', path),

    minimizeWindow: () => ipc.send('minimizeWindow'),
    maximizeWindow: () => ipc.send('maximizeWindow'),
    closeWindow: () => ipc.send('closeWindow'),
    startWindowDrag: () => ipc.send('startWindowDrag'),
    checkWindowState: () => ipc.send('checkWindowState'),

    // --- NEW: Promise-based wrappers for new C++ functions ---
    _callbacks: new Map(),
    _nextCallbackId: 0,

    _sendRequest: function(action, payload) {
        return new Promise((resolve) => {
            const callbackId = this._nextCallbackId++;
            this._callbacks.set(callbackId, resolve);
            this.send(action, { ...payload, callbackId });
        });
    },

    ensureWorkspaceConfigs: () => ipc.send('ensureWorkspaceConfigs'),
    readConfigFile: (path) => ipc._sendRequest('readConfigFile', { path }),
    writeConfigFile: (path, data) => ipc.send('writeConfigFile', { path, data }),
    resolveFileConfiguration: (path) => ipc._sendRequest('resolveFileConfiguration', { path }),
};

// 立即初始化监听器
ipc.init();