// components/main/main.js


import { initializeDashboardComponent } from '../dashboard/dashboard.js';
window['initializeDashboardComponent'] = initializeDashboardComponent;

import { PageEditor } from '../page-editor/page-editor.js';
import { DatabaseEditor } from '../database-editor/database-editor.js';

import { ipc } from './ipc.js';

import { initGlobalState } from './global-state.js';
initGlobalState();

import { ExportManager } from './export-manager.js';

import { DEFAULT_CONFIG } from './default-config.js';
import { INHERIT_VALUE } from './default-config.js';

import { ConfigModal } from './ConfigModal.js';

import { initUiLib, UiTools } from '../ui-lib/ui-lib.js';

import { init_error_handle } from './error.js';


// ==================================================================

window['blockRegistry'] = new Map();
/**
 * Registers a Block class so the editor knows how to create it.
 */
window['registerBlock'] = function (blockClass) {
    if (blockClass.type) {
        window['blockRegistry'].set(blockClass.type, blockClass);
    } else {
        console.error("Block class is missing a static 'type' property and cannot be registered.", blockClass);
    }
};
// ==================================================================

// ==================================================================
// Block API from Window (BAPI_WD)
window['BAPI_WD'] = {
    // Window Functions
    ['resolveWorkspacePath']: (path) => {
        return window.resolveWorkspacePath(path);
    },
    ['UiTools']: {
        ['createKvForm']: (config, onChangeCallback) => {
            let returns = UiTools.createKvForm(config, onChangeCallback);
            return {
                ['dom']: returns.dom,
                ['getValue']: returns.getValue,
                ['destroy']: returns.destroy
            };
        }
    }
};
// ==================================================================


window['initializeMainComponent'] = () => {
    init_error_handle();

    initUiLib();

    console.log("initializeMainComponent");
    window.workspaceRootPath = '';

    // --- Element acquisition for MAIN component ---
    const sidebar = document.getElementById('workspace-tree');
    const tabContentContainer = document.getElementById('tab-content-container');
    const noFileMessage = document.getElementById('no-file-message');
    const exportBtn = document.getElementById('export-btn');
    const contextMenu = document.getElementById('context-menu');
    const exportOverlay = document.getElementById('export-overlay');
    const progressBar = document.getElementById('progress-bar');
    const exportStatus = document.getElementById('export-status');
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    const workspaceName = document.getElementById('workspace-name');
    const workspaceSettingsBtn = document.getElementById('workspace-settings-btn');
    const appContainer = document.querySelector('.app-container');
    const sidebarContainer = document.getElementById('sidebar');
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const cookSettingsModal = document.getElementById('cook-settings-modal');
    const startCookBtn = document.getElementById('start-cook-btn');
    const cancelCookBtn = document.getElementById('cancel-cook-btn');
    const tabBar = document.getElementById('tab-bar');
    const dynamicTabsContainer = document.getElementById('dynamic-tabs-container');
    const mainContent = document.getElementById('main-content');
    const windowControls = document.getElementById('window-controls');
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    const fullscreenBtnWC = document.getElementById('toggle-fullscreen-btn-wc');


    let activeConfigModal = null;
    

    let contextMenuTarget = null;

    // --- 辅助函数: 从路径/URI中获取文件名 (主应用范围) ---
    function getFileNameFromPath(path) {
        if (window.currentOS === 'android') {
            // Android URI: "content://.../MyFolder%2FMyPage.veritnote" -> "MyPage.veritnote"
            // 解码 URI 组件以处理像 %2F 这样的编码
            const decodedPath = decodeURIComponent(path);
            return decodedPath.substring(decodedPath.lastIndexOf('/') + 1);
        } else {
            // Windows 路径
            return path.substring(path.lastIndexOf('\\') + 1);
        }
    }

    // --- Tab Management ---
    // This is the core of the new architecture. It manages different types of tabs.
    class TabManager {
        constructor() {
            this.tabs = new Map();
            this.tabOrder = [];
            this.activeTabPath = null;
        }

        getActiveTab() {
            return this.tabs.get(this.activeTabPath);
        }
        
        async openTab(path, context = {}, type) {
            const finalConfig = await new Promise((resolve) => {
                const fileConfigurationResolvedHandler = (e) => {
                    const payload = e['detail']['payload'];
                    if (payload.path === path) {
                        window.removeEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler);
                        // 计算并返回配置
                        const config = window.computeFinalConfig(payload.config || {}, type);
                        resolve(config);
                    }
                };
                window.addEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler);
                ipc.resolveFileConfiguration(path);
            });

            if (this.tabs.has(path)) {
                const existingTab = this.tabs.get(path);

                // --- FIX: Update the existing tab's configuration if it has changed ---
                // This is useful if the config was changed while the tab was open but inactive.
                if (JSON.stringify(existingTab.computedConfig) !== JSON.stringify(finalConfig)) {
                    existingTab.computedConfig = finalConfig;
                    if (existingTab.instance && typeof existingTab.instance.applyConfiguration === 'function') {
                        existingTab.instance.applyConfiguration(finalConfig);
                    }
                }

                this.switchTab(path);
                if (context.blockIdToFocus) {
                    this.getActiveTab().instance.PageSelectionManager.highlightBlock(context.blockIdToFocus);
                }
                return;
            }
            

            const fileName = getFileNameFromPath(path);
            const tabId = `tab-${Date.now()}-${Math.random()}`;
            const wrapper = document.createElement('div');
            wrapper.className = 'editor-instance-wrapper';
            wrapper.id = `wrapper-${tabId}`;
            wrapper.style.display = 'none';
            tabContentContainer.appendChild(wrapper);

            let tabInstance = null;

            if (type === 'page') {
                tabInstance = new PageEditor(wrapper, path, this, finalConfig, context);
            } else if (type === 'graph') {
                //tabInstance = new GraphEditor(wrapper, path, this, finalConfig, context);
            } else if (type === 'database') {
                tabInstance = new DatabaseEditor(wrapper, path, this, finalConfig, context);
            }
            
            if (!tabInstance) return;

            const newTab = {
                id: tabId,
                path: path,
                name: fileName,
                isUnsaved: false,
                instance: tabInstance,
                dom: { wrapper, tabItem: null },
                computedConfig: finalConfig // Store the config with the tab data
            };

            this.tabs.set(path, newTab);
            this.tabOrder.push(path);
            
            tabInstance.load();
            this.switchTab(path);
        }

        closeTab(path) {
            const tabToClose = this.tabs.get(path);
            if (!tabToClose) return;

            if (tabToClose.isUnsaved) {
                if (!confirm(`"${tabToClose.name}" has unsaved changes. Are you sure you want to close it?`)) {
                    return;
                }
                // 如果标签页未保存被关闭，通知其引用管理器恢复相关引用到“已保存”状态
                if (tabToClose.instance && tabToClose.instance.referenceManager) {
                    tabToClose.instance.referenceManager.handleRevertReferences(path);
                }
            }
            
            tabToClose.instance.destroy(); // Give the editor a chance to clean up
            tabToClose.dom.wrapper.remove();
            this.tabs.delete(path);
            this.tabOrder = this.tabOrder.filter(p => p !== path);

            if (this.activeTabPath === path) {
                const newActivePath = this.tabOrder[this.tabOrder.length - 1] || null;
                this.activeTabPath = null;
                this.switchTab(newActivePath);
            }
            
            this.render();
        }

        switchTab(path) {
            if (this.activeTabPath === path && path !== null) return;
            const oldTab = this.getActiveTab();
            if (oldTab) { oldTab.dom.wrapper.style.display = 'none'; }
            this.activeTabPath = path;
            const newTab = this.getActiveTab();
            if (newTab) {
                noFileMessage.style.display = 'none';
                newTab.dom.wrapper.style.display = 'flex';
                newTab.instance.onFocus(); // Notify editor it's active
            } else {
                noFileMessage.style.display = 'flex';
            }
            this.render();
            updateSidebarActiveState();
        }

        setUnsavedStatus(path, isUnsaved) {
            const tab = this.tabs.get(path);
            if (tab && tab.isUnsaved !== isUnsaved) {
                tab.isUnsaved = isUnsaved;
                this.render();
                if (tab.instance.updateToolbarState) {
                    tab.instance.updateToolbarState();
                }
            }
        }

        render() {
            dynamicTabsContainer.innerHTML = '';
            this.tabOrder.forEach(path => {
                const tab = this.tabs.get(path);
                const tabItem = document.createElement('div');
                tabItem.className = 'tab-item';
                tabItem.dataset['path'] = path;
                tabItem.title = path;
                if (path === this.activeTabPath) { tabItem.classList.add('active'); }
                if (tab.isUnsaved) { tabItem.classList.add('unsaved'); }
                tabItem.innerHTML = `<span class="unsaved-dot"></span><span class="tab-name">${tab.name.replace('.veritnote','')}</span><button class="tab-close-btn">&times;</button>`;
                tabItem.addEventListener('mousedown', (e) => {
                    if (e.button === 1) { this.closeTab(path); return; }
                    if (!e.target.classList.contains('tab-close-btn')) { this.switchTab(path); }
                });
                tabItem.querySelector('.tab-close-btn').addEventListener('click', () => this.closeTab(path));
                // Drag and drop logic for tabs is unchanged
                tabItem.draggable = true;
                tabItem.addEventListener('dragstart', e => this.handleDragStart(e, path));
                tabItem.addEventListener('dragover', e => this.handleDragOver(e, path));
                tabItem.addEventListener('drop', e => this.handleDrop(e, path));
                tabItem.addEventListener('dragend', e => this.handleDragEnd(e));
                dynamicTabsContainer.appendChild(tabItem);
                tab.dom.tabItem = tabItem;
            });
        }
        handleDragStart(e, path) { e.dataTransfer.setData('text/plain', path); this.draggedElement = e.target; setTimeout(() => this.draggedElement.classList.add('dragging'), 0); }
        handleDragOver(e, targetPath) { e.preventDefault(); const draggingElem = this.draggedElement; if (!draggingElem || draggingElem === e.currentTarget) return; const targetElem = e.currentTarget; const rect = targetElem.getBoundingClientRect(); const isAfter = e.clientX > rect.left + rect.width / 2; if (isAfter) { dynamicTabsContainer.insertBefore(draggingElem, targetElem.nextSibling); } else { dynamicTabsContainer.insertBefore(draggingElem, targetElem); } }
        handleDrop(e, path) { e.preventDefault(); const newOrder = []; dynamicTabsContainer.querySelectorAll('.tab-item').forEach(item => newOrder.push(item.dataset['path'])); this.tabOrder = newOrder; }
        handleDragEnd(e) { if (this.draggedElement) { this.draggedElement.classList.remove('dragging'); } this.draggedElement = null; this.render(); }
    }

    const tabManager = new TabManager();
    window.tabManager = tabManager; // Make it globally accessible if needed by editors

    // --- UI Update Functions (for Main component) ---
    function updateSidebarActiveState() {
        // 清理旧的高亮
        sidebar.querySelectorAll('.tree-item[act="true"]').forEach(n => n.removeAttribute('act'));
        if (tabManager.activeTabPath) {
            const pathForQuery = tabManager.activeTabPath.replace(/\\/g, '\\\\');
            // 找到对应的节点并加上 act="true"
            const targetNode = sidebar.querySelector(`.tree-item.page[data-path="${pathForQuery}"]`);
            if (targetNode) { targetNode.setAttribute('act', 'true'); }
        }
    }

    // --- C++ message listeners (for Main component) ---
    window.addEventListener('workspaceListed', (e) => {
        console.log('workspaceListed');
        const workspaceData = e['detail']['payload'];
        if (workspaceData && workspaceData.path) {
            window.workspaceRootPath = workspaceData.path;
            
            // --- 更新工作区名称显示 ---
            if (workspaceName) {
                // 从路径中提取最后一个文件夹名称
                const pathParts = workspaceData.path.split(/[\\/]/);
                workspaceName.textContent = pathParts.filter(Boolean).pop() || workspaceData.path;
            }
        }
        sidebar.dataset['workspaceData'] = JSON.stringify(workspaceData);
        if (workspaceData && workspaceData.children && workspaceData.children.length > 0) {
            // 不渲染根节点本身，而是直接循环渲染它内部的子节点
            let childrenHtml = '';
            workspaceData.children.forEach(child => {
                childrenHtml += renderWorkspaceTree(child);
            });
            sidebar.innerHTML = childrenHtml;
        } else {
            sidebar.innerHTML = `<div tc="2" pd="s" style="font-style: italic; font-size: 13px;">Workspace is empty.<br>Right-click to create a file.</div>`;
        }
        updateSidebarActiveState();
    });


    // This listener now dispatches events to the relevant tab.
    window.addEventListener('fileLoaded', (e) => {
        const payload = e['detail']['payload'];
        if (e.detail.error) {
            alert(`Error loading file: ${e.detail.error}`);
            tabManager.closeTab(payload.path);
            return;
        }
        const tab = tabManager.tabs.get(payload.path);
        if (tab && tab.instance && typeof tab.instance.onFileLoaded === 'function') {
            tab.instance.onFileLoaded(payload);
        }
    });

    window.addEventListener('fileSaved', (e) => {
        const payload = e['detail']['payload'];
        const tab = tabManager.tabs.get(payload.path);
        if (tab && tab.instance && typeof tab.instance.onFileSaved === 'function') {
            tab.instance.onFileSaved(payload);
        }
    });


    window.addEventListener('workspaceUpdated', (e) => {
        const payload = e['detail']['payload'] || e.detail;
        if (!payload) { console.error("Received workspaceUpdated event with no data."); return; }
        const { path, eventType } = payload;
        if (eventType === 'delete' && tabManager.tabs.has(path)) {
            const tabToClose = tabManager.tabs.get(path);
            tabToClose.isUnsaved = false;
            tabManager.closeTab(path);
        }
        ipc.listWorkspace();
    });
    
    // --- Event Listeners (for Main component) ---
    sidebar.addEventListener('click', async (e) => { // async
        const settingsBtn = e.target.closest('.item-settings-btn');
        if (settingsBtn) {
            const parentNode = settingsBtn.closest('.tree-item');
            const path = parentNode.dataset['path'];
            const type = settingsBtn.dataset['type'];
            window.openConfigModal(type, path);
            return;
        }

        const target = e.target.closest('.tree-item');
        if (!target) return;

        const path = target.dataset['path'];
        const type = target.dataset['type'];
        
        if (type == 'folder') {
            // 读取当前属性状态
            const isCurrentlyOpen = target.getAttribute('open') === 'true';
            const willBeOpen = !isCurrentlyOpen;
            // 设置新的属性触发旋转动画
            target.setAttribute('open', willBeOpen.toString());
            // 存入 localStorage 以供下次渲染读取
            window.toggleFolderStateInStorage(path, willBeOpen);

            const children = target.nextElementSibling;
            if (children && children.classList.contains('tree-node-children')) {
                children.style.display = willBeOpen ? 'block' : 'none';
            }
        } else {
            tabManager.openTab(path, null, type);
        }
    });

    // --- 工作区设置按钮监听 ---
    workspaceSettingsBtn.addEventListener('click', () => {
        if (window.workspaceRootPath) {
            window.openConfigModal('folder', window.workspaceRootPath);
        }
    });


    /**
     * Iterates through all open tabs and notifies any that are descendants of the
     * changed folder path to update their configuration.
     * @param {string} folderPath The path of the folder whose config was just updated.
     */
    function broadcastConfigurationChange(folderPath) {
        // Ensure folderPath ends with a separator to avoid false positives 
        // (e.g., matching "/folder" with "/folder-2").
        const prefix = folderPath.endsWith('\\') ? folderPath : folderPath + '\\';

        tabManager.tabs.forEach(tab => {
            // Check if the tab's path is a child of the folder and if its instance
            // implements the onConfigurationChanged interface method.
            if (tab.path.startsWith(prefix) && tab.instance && typeof tab.instance.onConfigurationChanged === 'function') {
                // This is the "interface" call. Main doesn't know or care what kind of
                // editor it is, only that it can respond to this event.
                tab.instance.onConfigurationChanged();
            }
        });
    }


    // Function to open the configuration modal
    window.openConfigModal = async function(type, path) {
        if (activeConfigModal) return;
    
        let configPath, configData, availableSettings;
    
        if (type === 'folder') {
            configPath = path + '\\veritnoteconfig';
            ipc.readConfigFile(configPath);
            const configFileReadHandler = (e) => {
                const payload = e['detail']['payload'];
                if (payload.path === configPath) {
                    const configData = payload.data || {};
                    availableSettings = DEFAULT_CONFIG;
                    activeConfigModalWithConfig(configData, availableSettings);
                    window.removeEventListener('configFileRead', configFileReadHandler); // 移除监听器，防止多次触发
                }
            };
            window.addEventListener('configFileRead', configFileReadHandler);
        } else if (type === 'page') {
            configPath = path;
            const tab = tabManager.tabs.get(path);
            if (!tab || !tab.instance) {
                alert("Open the file before changing its settings.");
                return;
            }
            configData = tab.instance.fileConfig;
            availableSettings = { page: DEFAULT_CONFIG.page };
            activeConfigModalWithConfig(configData, availableSettings);
        } else if (type === 'database') {
            /*configPath = path;
            const tab = tabManager.tabs.get(path);
            if (!tab || !tab.instance) {
                alert("Open the file before changing its settings.");
                return;
            }
            // configData = tab.instance.fileConfig; // Database Editor fileConfig 待实现
            availableSettings = { database: DEFAULT_CONFIG.database };
            activeConfigModalWithConfig(configData, availableSettings);*/
        }

        function activeConfigModalWithConfig(configData, availableSettings) {
            activeConfigModal = new ConfigModal({
                title: `Settings for ${path.substring(path.lastIndexOf('\\') + 1)}`,
                configData: configData,
                defaults: availableSettings,
                onSave: async (newConfig) => {
                    if (type === 'folder') {
                        ipc.writeConfigFile(configPath, newConfig);
                        // The path is the folder path, not the config file path.
                        broadcastConfigurationChange(path);
                    } else if (type === 'page') { // page
                        const tab = tabManager.tabs.get(path);
                        if (tab && tab.instance) {
                            tab.instance.setFileConfig(newConfig);
                        }
                    } else if (type === 'database') {
                        // !!!do something...!!!
                    }

                    // This part is for updating the currently selected item's config if it's open.
                    // It's still useful for page configs or if the folder itself was represented as a tab.
                    const tabToUpdate = tabManager.tabs.get(path);
                    if (tabToUpdate && tabToUpdate.instance) {
                        ipc.resolveFileConfiguration(path);
                        const fileConfigurationResolvedHandler = (e) => {
                            const payload = e['detail']['payload'];
                            if (payload.path === path) {
                                const computedConfig = window.computeFinalConfig(payload.config, type);
                                tabToUpdate.computedConfig = computedConfig;
                                tabToUpdate.instance.applyConfiguration(computedConfig);
                                window.removeEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler); // 移除监听器，防止多次触发
                            }
                        };
                        window.addEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler);
                    }

                    activeConfigModal = null;
                },
                onClose: () => {
                    activeConfigModal = null;
                }
            });
        }
    }

    window.computeFinalConfig = function (resolvedConfig, fileType) {
        const finalConfig = {};
    
        if (!DEFAULT_CONFIG[fileType]) return {};
    
        for (const key in DEFAULT_CONFIG[fileType]) {
            const categoryConfig = resolvedConfig[fileType] || {};
            const value = categoryConfig[key];
    
            if (value && value !== INHERIT_VALUE) {
                finalConfig[key] = value;
            } else {
                finalConfig[key] = DEFAULT_CONFIG[fileType][key];
            }
        }
        return finalConfig;
    }

    document.addEventListener('keydown', (e) => {
        const activeTab = tabManager.getActiveTab();
        if (!activeTab) return;
    
        // Global shortcuts
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
            e.preventDefault();
            tabManager.closeTab(activeTab.path);
            return;
        }

        // Pass other shortcuts down to the active editor instance
        if (activeTab.instance && activeTab.instance.onKeyDown) {
            activeTab.instance.onKeyDown(e);
        }
    });

    backToDashboardBtn.addEventListener('click', () => {
        let unsavedFiles = [];
        tabManager.tabs.forEach(tab => { if (tab.isUnsaved) { unsavedFiles.push(tab.name); } });
        if (unsavedFiles.length > 0) { if (!confirm(`You have unsaved changes in: ${unsavedFiles.join(', ')}.\n\nLeave without saving?`)) { return; } }
        ipc.goToDashboard();
    });

    // --- Helper Functions, Context Menu (for Main component) ---

    /**
     * 递归遍历树节点，收集指定类型的所有文件
     */
    function collectFilesByType(node, type, collection) {
        if (!node) return;

        // 如果当前节点匹配类型，加入列表
        // 注意：我们的树节点结构是 { name, path, type, children? }
        if (node.type === type) {
            collection.push({
                name: node.name,
                path: node.path
            });
        }

        // 如果有子节点，递归查找
        if (node.children && node.children.length > 0) {
            node.children.forEach(child => collectFilesByType(child, type, collection));
        }
    }

    /**
     * 获取当前工作区的所有 Page (.veritnote) 文件
     * @returns {Array<{name: string, path: string}>}
     */
    window.getAllPageFiles = function () {
        const workspaceDataStr = sidebar.dataset['workspaceData'];
        if (!workspaceDataStr) return [];

        try {
            const rootNode = JSON.parse(workspaceDataStr);
            const results = [];
            collectFilesByType(rootNode, 'page', results);
            return results;
        } catch (e) {
            console.error("Failed to parse workspace tree for page search:", e);
            return [];
        }
    };

    /**
     * 获取当前工作区的所有 Database (.veritnotedb) 文件
     * @returns {Array<{name: string, path: string}>}
     */
    window.getAllDatabaseFiles = function () {
        const workspaceDataStr = sidebar.dataset['workspaceData'];
        if (!workspaceDataStr) return [];

        try {
            const rootNode = JSON.parse(workspaceDataStr);
            const results = [];
            collectFilesByType(rootNode, 'database', results);
            return results;
        } catch (e) {
            console.error("Failed to parse workspace tree for database search:", e);
            return [];
        }
    };


    /**
     * 文件大纲
     */
    // --- 辅助函数：从 localStorage 获取/保存文件夹展开状态 ---
    const FOLDER_STATE_KEY = 'veritnote_folder_states';
    function getFolderOpenState(path) {
        try {
            const states = JSON.parse(window.localStorage.getItem(FOLDER_STATE_KEY) || '{}');
            return states[path] === true; // 默认返回 false (折叠)
        } catch (e) { return false; }
    }
    window.toggleFolderStateInStorage = function (path, isOpen) {
        try {
            const states = JSON.parse(window.localStorage.getItem(FOLDER_STATE_KEY) || '{}');
            states[path] = isOpen;
            window.localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(states));
        } catch (e) { }
    }

    function renderWorkspaceTree(node) {
        if (!node) return '';
        let html = '';

        // 新版设置按钮 SVG
        const settingsIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

        // 统一的 Settings 按钮模板 (基于 ui-lib 类)
        const renderSettingsBtn = (type) => `<button class="btn bl sq item-settings-btn" bg="none" tc="3" hv-tc="1" hv-bg="2" data-type="${type}" title="${type} Settings">${settingsIconSvg}</button>`;

        if (node.type === 'folder') {
            const isOpen = getFolderOpenState(node.path);
            const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>`;
            const folderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>`;

            html += `<div class="tree-item folder" data-path="${node.path}" data-type="${node.type}" open="${isOpen}">
                <div class="icon chevron">${chevronSvg}</div>
                <div class="type-icon">${folderSvg}</div>
                <span class="name">${node.name}</span>
                ${renderSettingsBtn('folder')}
             </div>`;

            if (node.children && node.children.length > 0) {
                // 嵌套容器，缩进匹配 ui-lib
                html += `<div class="tree-node-children" style="display: ${isOpen ? 'block' : 'none'}; padding-left: 20px;">`;
                node.children.forEach(child => { html += renderWorkspaceTree(child); });
                html += '</div>';
            }
        } else if (node.type === 'page') {
            const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path><path d="M14 2v5a1 1 0 0 0 1 1h5"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>`;
            html += `<div class="tree-item page" data-path="${node.path}" data-type="${node.type}">
                ${iconSvg}
                <span class="name">${node.name.replace('.veritnote', '')}</span>
                ${renderSettingsBtn('page')}
             </div>`;
        } else if (node.type === 'graph') {
            const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L7 10h10l-5-8z"/><circle cx="7" cy="17" r="4"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>`;
            html += `<div class="tree-item graph" data-path="${node.path}" data-type="${node.type}">
                ${iconSvg}
                <span class="name">${node.name.replace('.veritnotegraph', '')}</span>
                ${renderSettingsBtn('graph')}
            </div>`;
        } else if (node.type === 'database') {
            const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5V19A9 3 0 0 0 21 19V5"></path><path d="M3 12A9 3 0 0 0 21 12"></path></svg>`;
            html += `<div class="tree-item database" data-path="${node.path}" data-type="${node.type}">
                ${iconSvg}
                <span class="name">${node.name.replace('.veritnotedb', '')}</span> 
                ${renderSettingsBtn('database')}
             </div>`;
        }
        return html;
    }
    function hideContextMenu() {
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
    }
    sidebar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenuTarget = e.target.closest('.tree-item, #workspace-tree');
        if (!contextMenuTarget) return;
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.display = 'block';
    });

    document.addEventListener('mousedown', (e) => {
        // Only handles closing the context menu now.
        if (!e.target.closest('#context-menu')) {
            hideContextMenu();
        }
    });

    contextMenu.addEventListener('click', (e) => {
        if (!contextMenuTarget) return;
        const action = e.target.dataset['action'];
        let targetPath = contextMenuTarget.dataset['path'] || '';
        let parentPath = '';
        if (contextMenuTarget.id === 'workspace-tree') {
            parentPath = JSON.parse(sidebar.dataset['workspaceData'] || '{}').path || '';
        } else if (contextMenuTarget.classList.contains('folder')) {
            parentPath = targetPath;
        } else {
            parentPath = targetPath.substring(0, targetPath.lastIndexOf('\\'));
        }
        if (!parentPath && sidebar.dataset['workspaceData']) {
            parentPath = JSON.parse(sidebar.dataset['workspaceData']).path;
        }
        switch (action) {
            case 'newPage': {
                const name = prompt("Page Name", "MyPage");
                if (name) {
                    ipc.createItem(parentPath, name, 'page');
                } break;
            }
            case 'newGraph': {
                const name = prompt("Graph Name", "MyGraph");
                if (name) {
                    ipc.createItem(parentPath, name, 'graph');
                } break;
            }
            case 'newDatabase': {
                const name = prompt("Database Name", "MyDatabase");
                if (name) {
                    ipc.createItem(parentPath, name, 'database');
                } break;
            }
            case 'newFolder': {
                const name = prompt("Folder Name", "MyFolder");
                if (name) {
                    ipc.createItem(parentPath, name, 'folder');
                } break;
            }
            case 'delete': {
                if (confirm(`Delete "${targetPath}"?`)) {
                    ipc.deleteItem(targetPath);
                } break;
            }
        }
        hideContextMenu();
    });

    // --- Sidebar Resizing & Collapse ---
    // Unchanged, as this is part of the Main component.
    const SIDEBAR_WIDTH_KEY = 'veritnote_sidebar_width';
    const SIDEBAR_COLLAPSED_KEY = 'veritnote_sidebar_collapsed';
    
    function applySidebarWidth(width) {
        const min = parseFloat(getComputedStyle(sidebarContainer).minWidth);
        const max = parseFloat(getComputedStyle(sidebarContainer).maxWidth);
        sidebarContainer.style.width = `${Math.max(min, Math.min(width, max))}px`;
    }
    sidebarResizer.addEventListener('mousedown', (e) => {
        // 如果处于折叠状态（包含Peek），禁止触发缩放
        if (appContainer.classList.contains('sidebar-collapsed')) return; 

        e.preventDefault();
        const startX = e.clientX;
        const startWidth = sidebarContainer.offsetWidth;
    
        function onMouseMove(moveEvent) {
            applySidebarWidth(startWidth + (moveEvent.clientX - startX));
        }
    
        function onMouseUp() {
            window.localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarContainer.style.width);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    const savedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
        sidebarContainer.style.width = savedWidth;
    }
    
    function setSidebarCollapsed(collapsed) {
        const buttonText = sidebarToggleBtn.querySelector('span');
        const buttonSvg = sidebarToggleBtn.querySelector('svg');
        if (collapsed) {
            appContainer.classList.add('sidebar-collapsed');
            window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
            sidebarContainer.style.width = '';
            if (buttonText) buttonText.textContent = 'Expand';
            sidebarToggleBtn.title = 'Expand sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>`;
        } else {
            appContainer.classList.remove('sidebar-collapsed');
            window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false');
            sidebarContainer.style.width = window.localStorage.getItem(SIDEBAR_WIDTH_KEY) || '260px';
            if (buttonText) buttonText.textContent = 'Collapse';
            sidebarToggleBtn.title = 'Collapse sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>`;
        }
    }
    sidebarToggleBtn.addEventListener('click', () => {
        appContainer.classList.remove('sidebar-peek');
        setSidebarCollapsed(!appContainer.classList.contains('sidebar-collapsed'));
    });
    setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
    document.getElementById('sidebar-peek-trigger').addEventListener('mouseenter', () => {
        if (appContainer.classList.contains('sidebar-collapsed')) appContainer.classList.add('sidebar-peek');
    });
    sidebarContainer.addEventListener('mouseleave', () => {
        if (appContainer.classList.contains('sidebar-peek')) appContainer.classList.remove('sidebar-peek');
    });
    
    // --- Helper Functions for Path resolution (Global) ---
    // Unchanged
    window.makePathRelativeToWorkspace = function (absolutePath) { if (!window.workspaceRootPath || !absolutePath || !absolutePath.startsWith(window.workspaceRootPath)) { return absolutePath; } let relative = absolutePath.substring(window.workspaceRootPath.length); if (relative.startsWith('\\') || relative.startsWith('/')) { relative = relative.substring(1); } return relative; }
    window.resolveWorkspacePath = function(path) { if (!path || !window.workspaceRootPath) { return path; } if (/^([a-zA-Z]:\\|\\\\|\/|https?:\/\/|file:\/\/\/)/.test(path)) { return path; } return [window.workspaceRootPath, path.replace(/\//g, '\\')].join('\\'); };



    // --- Export Logic ---
    window.isExportCancelled = false;

    // 让导出覆盖层的显示/隐藏函数支持全局调用
    window.showExportOverlay = function () {
        window.isExportCancelled = false;
        exportOverlay.style.display = 'flex';
        progressBar.style.width = '0%';
        if (!document.getElementById('cancel-export-btn')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancel-export-btn'; cancelBtn.textContent = 'Cancel'; cancelBtn.style.marginTop = '16px';
            cancelBtn.onclick = () => {
                window.isExportCancelled = true;
                exportStatus.textContent = 'Cancelling...';
                ipc.cancelExport();
            };
            exportOverlay.querySelector('.export-modal').appendChild(cancelBtn);
        }
    }

    window.hideExportOverlay = function () {
        exportOverlay.style.display = 'none';
        document.getElementById('cancel-export-btn')?.remove();
    }

    exportBtn.addEventListener('click', () => cookSettingsModal.style.display = 'flex');
    cancelCookBtn.addEventListener('click', () => cookSettingsModal.style.display = 'none');

    startCookBtn.addEventListener('click', () => {
        const options = {
            copyLocal: document.getElementById('copy-local-images').checked,
            downloadOnline: document.getElementById('download-online-images').checked,
            disableDrag: document.getElementById('disable-drag-export').checked
        };
        cookSettingsModal.style.display = 'none';

        const workspaceData = JSON.parse(sidebar.dataset['workspaceData'] || '{}');
        const allFilesToExport = [];
        const getAllFiles = (node, list) => {
            if (node.type === 'folder' && node.children) {
                node.children.forEach(child => getAllFiles(child, list));
            } else {
                list.push(node.path);
            }
        };
        getAllFiles(workspaceData, allFilesToExport);

        if (allFilesToExport.length === 0) return alert('No pages to export.');

        window.showExportOverlay();

        // --- 唤起导出流程 ---
        ExportManager.runExportProcess({
            options,
            allFilesToExport,
            workspaceData,
            ui: { exportStatus, progressBar }
        });
    });

    window.addEventListener('exportCancelled', () => {
        exportStatus.textContent = 'Cancelled.';
        setTimeout(window.hideExportOverlay, 1000);
    });



    // --- Window State & Dragging (Main component concern) ---
    window.addEventListener('windowStateChanged', (e) => { const { state } = e['detail']['payload']; if (state === 'fullscreen') { document.body.classList.add('is-fullscreen'); } else { document.body.classList.remove('is-fullscreen'); } });
    minimizeBtn.addEventListener('click', () => ipc.minimizeWindow());
    maximizeBtn.addEventListener('click', () => ipc.maximizeWindow());
    closeBtn.addEventListener('click', () => ipc.closeWindow());
    fullscreenBtnWC.addEventListener('click', () => ipc.toggleFullscreen());
    tabBar.addEventListener('mousedown', (e) => { if (e.target === tabBar && !document.body.classList.contains('is-fullscreen')) { ipc.startWindowDrag(); } });

    // --- Initial State ---
    const startWorkspaceLoad = function (workspacePath) {
        console.log("Starting workspace load:", workspacePath);
        if (workspacePath) {
            // This is the logic from the old window.initializeWorkspace
            ipc.setWorkspace(workspacePath);
            ipc.listWorkspace();
            ipc.checkWindowState();
            ipc.ensureWorkspaceConfigs();
        } else {
            alert("Error: Workspace path was not provided.");
            ipc.goToDashboard();
        }
    };

    // Define a handler function.
    const onWorkspacePathReady = () => {
        if (window['pendingWorkspacePath']) {
            console.log("WorkspacePathReady");
            startWorkspaceLoad(window['pendingWorkspacePath']);
            // Clean up the global variable after use.
            delete window['pendingWorkspacePath']; 
        }
    };

    // Check if the path is ALREADY available (if C++ was faster than the fetch).
    if (window['pendingWorkspacePath']) {
        console.log("Workspace path was available on load:", window['pendingWorkspacePath']);
        onWorkspacePathReady();
    } else {
        // If not, listen for the event that C++ will dispatch.
        window.addEventListener('workspacePathReady', onWorkspacePathReady, { once: true });
    }
};