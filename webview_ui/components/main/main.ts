// components/main/main.js


import { initializeDashboardComponent } from '../dashboard/dashboard.js';
window['initializeDashboardComponent'] = initializeDashboardComponent;

import { ipc } from './ipc.js';

import { initGlobalState } from './global-state.js';
initGlobalState();

import { TabManager } from './tab-manager.js';

import { ExportManager } from './export-manager.js';

import { DEFAULT_CONFIG } from './default-config.js';

import { ConfigModal } from './ConfigModal.js';

import * as WorkspaceTree from './CP/workspace-tree.js';

import { initUiLib, UiTools, KvFormItem } from '../ui-lib/ui-lib.js';

import { init_error_handle } from './error.js';

import { FileType } from '../types.js';
import * as file from './file-helper.js';


// ==================================================================

window.blockRegistry = new Map<string, typeof Block>();
/**
 * Registers a Block class so the editor knows how to create it.
 */
window['registerBlock'] = function (blockClass: typeof Block) {
    if (blockClass.type) {
        window.blockRegistry.set(blockClass.type, blockClass);
    } else {
        console.error("Block class is missing a static 'type' property and cannot be registered.", blockClass);
    }
};

// ==================================================================

// ==================================================================
// Block API from Window (BAPI_WD)
window['BAPI_WD'] = {
    // Window Functions
    ['resolveWorkspacePath']: (path: string) => {
        return file.resolveWorkspacePath(path);
    },
    ['UiTools']: {
        ['createKvForm']: (config: KvFormItem[], onChangeCallback?: () => void) => {
            let returns = UiTools.createKvForm(config, onChangeCallback);
            return {
                ['dom']: returns.dom,
                ['getValue']: returns.getValue,
                ['destroy']: returns.destroy
            };
        }
    },
    ['blockRegistry']: window.blockRegistry
};
// ==================================================================


window['initializeMainComponent'] = () => {
    init_error_handle();

    initUiLib();

    console.log("initializeMainComponent");
    window.workspaceRootPath = '';

    // --- Element acquisition for MAIN component ---
    // 侧边栏及树视图相关
    const sidebar = document.getElementById('workspace-tree') as HTMLElement;
    const sidebarContainer = document.getElementById('sidebar') as HTMLElement;
    const sidebarResizer = document.getElementById('sidebar-resizer') as HTMLElement;
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn') as HTMLButtonElement;
    const workspaceName = document.getElementById('workspace-name') as HTMLElement;

    // 按钮与操作
    const exportBtn = document.getElementById('export-btn') as HTMLButtonElement;
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn') as HTMLButtonElement;
    const workspaceSettingsBtn = document.getElementById('workspace-settings-btn') as HTMLButtonElement;
    const startCookBtn = document.getElementById('start-cook-btn') as HTMLButtonElement;
    const cancelCookBtn = document.getElementById('cancel-cook-btn') as HTMLButtonElement;

    // 弹窗与 UI 状态
    const contextMenu = document.getElementById('context-menu') as HTMLElement;
    const exportOverlay = document.getElementById('export-overlay') as HTMLElement;
    const cookSettingsModal = document.getElementById('cook-settings-modal') as HTMLElement;
    const progressBar = document.getElementById('progress-bar') as HTMLElement;
    const exportStatus = document.getElementById('export-status') as HTMLElement;
    const appContainer = document.querySelector('.app-container') as HTMLElement;

    // 窗口控制
    const windowControls = document.getElementById('window-controls') as HTMLElement;
    const minimizeBtn = document.getElementById('minimize-btn') as HTMLButtonElement;
    const maximizeBtn = document.getElementById('maximize-btn') as HTMLButtonElement;
    const closeBtn = document.getElementById('close-btn') as HTMLButtonElement;
    const fullscreenBtnWC = document.getElementById('toggle-fullscreen-btn-wc') as HTMLButtonElement;

    // 布局区域
    const tabBar = document.getElementById('tab-bar') as HTMLElement;
    const mainContent = document.getElementById('main-content') as HTMLElement;


    let activeConfigModal:(ConfigModal | null) = null;

    const tabManager = new TabManager(updateSidebarActiveState);
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

    WorkspaceTree.initWorkspaceTree(sidebar, contextMenu, tabManager, workspaceSettingsBtn);

    // --- C++ message listeners (for Main component) ---
    window.addEventListener('workspaceListed', (e:any) => {
        console.log('workspaceListed');
        const workspaceData = e['detail']['payload'] as WorkspaceTreeNode;
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
                childrenHtml += WorkspaceTree.renderWorkspaceTree(child);
            });
            sidebar.innerHTML = childrenHtml;
        } else {
            sidebar.innerHTML = `<div tc="2" pd="s" style="font-style: italic; font-size: 13px;">Workspace is empty.<br>Right-click to create a file.</div>`;
        }
        updateSidebarActiveState();
    });


    // This listener now dispatches events to the relevant tab.
    window.addEventListener('fileLoaded', (e:any) => {
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

    window.addEventListener('fileSaved', (e: any) => {
        const payload = e['detail']['payload'];
        const tab = tabManager.tabs.get(payload.path);
        if (tab && tab.instance && typeof tab.instance.onFileSaved === 'function') {
            tab.instance.onFileSaved(payload);
        }
    });


    window.addEventListener('workspaceUpdated', (e:any) => {
        const payload = e['detail']['payload'] || e.detail;
        if (!payload) { console.error("Received workspaceUpdated event with no data."); return; }
        const { path, eventType } = payload;
        if (eventType === 'delete' && tabManager.tabs.has(path)) {
            const tabToClose = tabManager.tabs.get(path);
            if (tabToClose) {
                tabToClose.isUnsaved = false;
                tabManager.closeTab(path);
            }
        }
        ipc.listWorkspace();
    });
    
    // --- Event Listeners (for Main component) ---

    /**
     * Iterates through all open tabs and notifies any that are descendants of the
     * changed folder path to update their configuration.
     * @param {string} folderPath The path of the folder whose config was just updated.
     */
    function broadcastConfigurationChange(folderPath: string) {
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
    window.openConfigModal = async function(type: FileType, path: string) {
        if (activeConfigModal) return;
    
        let configPath: string;
        let configData: Record<string, any>;
        let availableSettings: Partial<Record<FileType, Record<string, any>>>;
    
        if (type === FileType.Folder) {
            configPath = path + '\\veritnoteconfig';
            ipc.readConfigFile(configPath);
            const configFileReadHandler = (e: any) => {
                const payload = e['detail']['payload'];
                if (payload.path === configPath) {
                    const configData = payload.data || {};
                    availableSettings = DEFAULT_CONFIG;
                    activeConfigModalWithConfig(configData, availableSettings);
                    window.removeEventListener('configFileRead', configFileReadHandler); // 移除监听器，防止多次触发
                }
            };
            window.addEventListener('configFileRead', configFileReadHandler);
        } else {
            configPath = path;
            ipc.readFileConfig(configPath);
            const fileConfigReadHandler = (e: any) => {
                const payload = e['detail']['payload'];
                if (payload.path === configPath) {
                    const configData = payload.config || {};
                    availableSettings = { [type]: DEFAULT_CONFIG[type] };
                    activeConfigModalWithConfig(configData, availableSettings);
                    window.removeEventListener('fileConfigRead', fileConfigReadHandler); // 防止内存泄漏和多次触发
                }
            };
            window.addEventListener('fileConfigRead', fileConfigReadHandler);
        }

        function activeConfigModalWithConfig(configData: Record<string, any>, availableSettings: Partial<Record<FileType, Record<string, any>>>) {
            activeConfigModal = new ConfigModal(
                `Settings for ${path.substring(path.lastIndexOf('\\') + 1)}`,
                configData,
                availableSettings,
                async (newConfig: Record<string, any>) => {
                    if (type === FileType.Folder) {
                        ipc.writeConfigFile(configPath, newConfig);
                        // The path is the folder path, not the config file path.
                        broadcastConfigurationChange(path);
                    } else {
                        // 1. 调用新 IPC 接口直接在后台写入文件的 config 部分
                        ipc.writeFileConfig(configPath, newConfig);

                        // 2. 如果文件恰好处于打开状态，同步内存配置并应用，但无需触发完整保存
                        const tab = tabManager.tabs.get(path);
                        if (tab && tab.instance) {
                            tab.instance.fileConfig = newConfig;
                            tab.instance.onConfigurationChanged();
                        }
                    }

                    activeConfigModal = null;
                },
                () => {
                    activeConfigModal = null;
                }
            );
        }
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
        let unsavedFiles: string[] = [];
        tabManager.tabs.forEach(tab => {
            if (tab.isUnsaved) {
                unsavedFiles.push(tab.name);
            }
        });
        if (unsavedFiles.length > 0) {
            if (!confirm(`You have unsaved changes in: ${unsavedFiles.join(', ')}.\n\nLeave without saving?`)) {
                return;
            }
        }
        ipc.goToDashboard();
    });



    /**
     * 获取当前工作区的所有 Page (.veritnote) 文件
     * @returns {Array<{name: string, path: string}>}
     */
    window.getAllPageFiles = function () {
        const workspaceDataStr = sidebar.dataset['workspaceData'];
        if (!workspaceDataStr) return [];

        try {
            const rootNode = JSON.parse(workspaceDataStr);
            const results: { name: string, path: string }[] = [];
            file.collectFilesByType(rootNode, FileType.Page, results);
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
            const results: { name: string, path: string }[] = [];
            file.collectFilesByType(rootNode, FileType.Database, results);
            return results;
        } catch (e) {
            console.error("Failed to parse workspace tree for database search:", e);
            return [];
        }
    };



    // --- Sidebar Resizing & Collapse ---
    // Unchanged, as this is part of the Main component.
    const SIDEBAR_WIDTH_KEY = 'veritnote_sidebar_width';
    const SIDEBAR_COLLAPSED_KEY = 'veritnote_sidebar_collapsed';
    
    function applySidebarWidth(width: number) {
        const min = parseFloat(getComputedStyle(sidebarContainer).minWidth);
        const max = parseFloat(getComputedStyle(sidebarContainer).maxWidth);
        sidebarContainer.style.width = `${Math.max(min, Math.min(width, max))}px`;
    }
    sidebarResizer.addEventListener('mousedown', (e: MouseEvent) => {
        // 如果处于折叠状态（包含Peek），禁止触发缩放
        if (appContainer.classList.contains('sidebar-collapsed')) return; 

        e.preventDefault();
        const startX = e.clientX;
        const startWidth = sidebarContainer.offsetWidth;
    
        function onMouseMove(moveEvent: MouseEvent) {
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
    
    function setSidebarCollapsed(collapsed: boolean) {
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
    (document.getElementById('sidebar-peek-trigger') as HTMLDivElement).addEventListener('mouseenter', () => {
        if (appContainer.classList.contains('sidebar-collapsed')) appContainer.classList.add('sidebar-peek');
    });
    sidebarContainer.addEventListener('mouseleave', () => {
        if (appContainer.classList.contains('sidebar-peek')) appContainer.classList.remove('sidebar-peek');
    });



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
            (exportOverlay.querySelector('.export-modal') as HTMLDivElement).appendChild(cancelBtn);
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
            copyLocal: (document.getElementById('copy-local-images') as HTMLInputElement).checked,
            downloadOnline: (document.getElementById('download-online-images') as HTMLInputElement).checked,
            disableDrag: (document.getElementById('disable-drag-export') as HTMLInputElement).checked
        };
        cookSettingsModal.style.display = 'none';

        const workspaceData = JSON.parse(sidebar.dataset['workspaceData'] || '{}');
        const allFilesToExport: string[] = [];
        const getAllFiles = (node: WorkspaceTreeNode, list: string[]) => {
            if (node.type === FileType.Folder && node.children) {
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
    window.addEventListener('windowStateChanged', (e: any) => {
        const { state } = e['detail']['payload'];
        if (state === 'fullscreen') {
            document.body.classList.add('is-fullscreen');
        } else {
            document.body.classList.remove('is-fullscreen');
        }
    });
    minimizeBtn.addEventListener('click', () => ipc.minimizeWindow());
    maximizeBtn.addEventListener('click', () => ipc.maximizeWindow());
    closeBtn.addEventListener('click', () => ipc.closeWindow());
    fullscreenBtnWC.addEventListener('click', () => ipc.toggleFullscreen());
    tabBar.addEventListener('mousedown', (e) => {
        if (e.target === tabBar && !document.body.classList.contains('is-fullscreen')) {
            ipc.startWindowDrag();
        }
    });

    // --- Initial State ---
    const startWorkspaceLoad = function (workspacePath: string) {
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