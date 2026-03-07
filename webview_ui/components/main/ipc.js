// Inter-Process Communication: JS <-> C++
const ipc = {
    // 向 C++ 后端发送消息
    send: (action, payload = {}) => {
        console.log("IPC: Sending message to C++:", { action, payload });
        if (window.AndroidBridge && window.AndroidBridge.postMessage) {
            window.AndroidBridge.postMessage(JSON.stringify({ "action": action, "payload": payload }));
        } else if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage({ "action": action, "payload": payload });
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
                console.log("IPC: Received message from C++:" + message);
                ipc.messageHandler(message);
            } catch (e) {
                console.error("Failed to parse message from C++:", jsonString, e);
            }
        };
    },
    // 统一的消息处理逻辑
    messageHandler: (message) => {
        const customEvent = new CustomEvent(message.action, { detail: message });
        window.dispatchEvent(customEvent);
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
        ipc.send('savePage', { 'path': path, 'blocks': blocks, 'config': config });
    },

    // Data
    loadDatabase: (path) => {
        ipc.send('loadDatabase', { 'path': path });
    },
    saveDatabase: (path, content) => {
        ipc.send('saveDatabase', { 'path': path, 'content': content });
    },

    readCSV: (requestIdentifier, path) => {
        ipc.send('readCSV', { 'requestIdentifier': requestIdentifier, 'path': path });
    },


    startExport: () => {
        ipc.send('exportPages');
    },
    exportPageAsHtml: (path, html) => {
        ipc.send('exportPageAsHtml', { 'path': path, 'html': html });
    },
    cancelExport: () => {
        ipc.send('cancelExport');
    },
    createItem: (parentPath, name, type) => {
        ipc.send('createItem', { 'parentPath': parentPath, 'name': name, 'type': type });
    },
    deleteItem: (path) => {
        ipc.send('deleteItem', { 'path': path });
    },

    openFileDialog: (type) => {
        ipc.send('openFileDialog', { 'type': type });
    },

    prepareExportLibs: (libPaths) => {
        ipc.send('prepareExportLibs', { 'paths': libPaths });
    },

    processExportImages: (tasks) => {
        ipc.send('processExportImages', { 'tasks': tasks });
    },

    fetchQuoteContent: (requestIdentifier, referenceLink) => {
        ipc.send('fetchQuoteContent', { 'quoteBlockId': requestIdentifier, 'referenceLink': referenceLink });
    },

    fetchDataContent: (requestIdentifier, path) => {
        ipc.send('fetchDataContent', { 'dataBlockId': requestIdentifier, 'path': path });
    },

    openWorkspaceDialog: () => {
        return new Promise((resolve) => {
            const handleDialogClose = (event) => {
                window.removeEventListener('workspaceDialogClosed', handleDialogClose);
                resolve(event.detail['payload']['path']); // 返回选择的路径
            };
            
            window.addEventListener('workspaceDialogClosed', handleDialogClose, { once: true });
            
            ipc.send('openWorkspaceDialog');
        });
    },
    openWorkspace: (path) => ipc.send('openWorkspace', { 'path': path }),
    goToDashboard: () => ipc.send('goToDashboard'),
    toggleFullscreen: () => ipc.send('toggleFullscreen'),
    setWorkspace: (path) => ipc.send('setWorkspace', { 'path': path }),

    minimizeWindow: () => ipc.send('minimizeWindow'),
    maximizeWindow: () => ipc.send('maximizeWindow'),
    closeWindow: () => ipc.send('closeWindow'),
    startWindowDrag: () => ipc.send('startWindowDrag'),
    checkWindowState: () => ipc.send('checkWindowState'),

    ensureWorkspaceConfigs: () => ipc.send('ensureWorkspaceConfigs'),
    readConfigFile: (path) => ipc.send('readConfigFile', { 'path': path }),
    writeConfigFile: (path, data) => ipc.send('writeConfigFile', { 'path': path, 'data': data }),
    resolveFileConfiguration: (path) => ipc.send('resolveFileConfiguration', { 'path': path }),
};

// 立即初始化监听器
ipc.init();


// --- Block API from IPC (BAPI_IPC)
window['BAPI_IPC'] = {
    // IPC Functions
    ['fetchQuoteContent']: (requestIdentifier, referenceLink) => {
        return ipc.fetchQuoteContent(requestIdentifier, referenceLink);
    },
    ['fetchDataContent']: (requestIdentifier, path) => {
        return ipc.fetchDataContent(requestIdentifier, path);
    },
    ['readCSV']: (requestIdentifier, path) => {
        return ipc.readCSV(requestIdentifier, path);
    }
};