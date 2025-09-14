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
        if (window.chrome && window.chrome.webview) { // Corrected: should be window.chrome.webview
            console.log('DEBUG: ipc.js - Initializing message listener...');
            window.chrome.webview.addEventListener('message', event => {
                const message = event.data;
                
                // ** DEBUG: Log EVERY single message received **
                console.group(`--- DEBUG: ipc.js received a message @ ${new Date().toLocaleTimeString()} ---`);
                console.log('Raw message data:', message);
                console.log('Type of message:', typeof message);
                
                // Check if it's our specific message from the preview
                // We check for `source` to be absolutely sure.
                if (message && typeof message === 'object' && message.source === 'preview-link-click') {
                    console.log('Action: Identified as a preview link click.');
                    
                    console.groupEnd();
                    return; // Stop further processing
                }

                // If it's not our custom message, assume it's from C++
                console.log('Action: Treating as a message from C++. Dispatching as CustomEvent:', message.action);
                const customEvent = new CustomEvent(message.action, { detail: message });
                window.dispatchEvent(customEvent);
                console.groupEnd();
            });
            console.log('DEBUG: ipc.js - Message listener attached successfully.');
        } else {
            console.error('DEBUG: ipc.js - ERROR: window.chrome.webview not found! IPC will not work.');
        }
    },

    // --- 封装的API ---
    listWorkspace: () => {
        ipc.send('listWorkspace');
    },

    loadPage: (path, blockIdToFocus = null, fromPreview = false) => {
        ipc.send('loadPage', { path, fromPreview, blockIdToFocus });
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

    processExportImages: (tasks) => {
        ipc.send('processExportImages', { tasks });
    },

    openWorkspaceDialog: () => ipc.send('openWorkspaceDialog'),
    openWorkspace: (path) => ipc.send('openWorkspace', path),
    goToDashboard: () => ipc.send('goToDashboard'),
    toggleFullscreen: () => ipc.send('toggleFullscreen'),
    setWorkspace: (path) => ipc.send('setWorkspace', path),

    minimizeWindow: () => ipc.send('minimizeWindow'),
    maximizeWindow: () => ipc.send('maximizeWindow'),
    closeWindow: () => ipc.send('closeWindow'),
    startWindowDrag: () => ipc.send('startWindowDrag'),
    checkWindowState: () => ipc.send('checkWindowState'),
};

// 立即初始化监听器
ipc.init();