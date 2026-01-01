// components/main/main.js

window.initializeMainComponent = () => {
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
        
        async openTab(path, blockIdToFocus = null, computedConfig) {
            let finalConfig = computedConfig;

            // If computedConfig was not provided (e.g., called from a link), we must resolve it now.
            if (!finalConfig) {
                try {
                    const resolved = await ipc.resolveFileConfiguration(path);
                    if (resolved && resolved.config) {
                        finalConfig = window.computeFinalConfig(resolved.config);
                    } else {
                        // Fallback to default if resolution fails
                        console.warn(`Could not resolve configuration for ${path}. Using defaults.`);
                        finalConfig = window.computeFinalConfig({});
                    }
                } catch (error) {
                    console.error(`Error resolving configuration for ${path}:`, error);
                    // Fallback in case of error
                    finalConfig = window.computeFinalConfig({});
                }
            }

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
                if (blockIdToFocus && this.getActiveTab().instance.focusBlock) {
                    this.getActiveTab().instance.focusBlock(blockIdToFocus);
                }
                return;
            }
            
            let editorType = 'default';
            if (path.endsWith('.veritnote')) {
                editorType = 'pageEditor';
            } else if (path.endsWith('.veritnotegraph')) {
                editorType = 'graphEditor';
            }

            if (editorType === 'default') {
                alert(`No editor available for file type: ${path}`);
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
            if (editorType === 'pageEditor') {
                tabInstance = new PageEditor(wrapper, path, this, finalConfig);
            } else if (editorType === 'graphEditor') {
                tabInstance = new GraphEditor(wrapper, path, this, finalConfig);
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
            
            tabInstance.load(blockIdToFocus);
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
                tabItem.dataset.path = path;
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
        handleDrop(e, path) { e.preventDefault(); const newOrder = []; dynamicTabsContainer.querySelectorAll('.tab-item').forEach(item => newOrder.push(item.dataset.path)); this.tabOrder = newOrder; }
        handleDragEnd(e) { if (this.draggedElement) { this.draggedElement.classList.remove('dragging'); } this.draggedElement = null; this.render(); }
    }

    const tabManager = new TabManager();
    window.tabManager = tabManager; // Make it globally accessible if needed by editors

    // --- UI Update Functions (for Main component) ---
    function updateSidebarActiveState() {
        sidebar.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
        if (tabManager.activeTabPath) {
            const pathForQuery = tabManager.activeTabPath.replace(/\\/g, '\\\\');
            const targetNode = sidebar.querySelector(`.tree-node.page[data-path="${pathForQuery}"]`);
            if (targetNode) { targetNode.classList.add('active'); }
        }
    }

    // --- C++ message listeners (for Main component) ---
    window.addEventListener('workspaceListed', (e) => {
        const workspaceData = e.detail.payload;
        if (workspaceData && workspaceData.path) {
            window.workspaceRootPath = workspaceData.path;
        }
        sidebar.dataset.workspaceData = JSON.stringify(workspaceData);
        if (workspaceData && workspaceData.children && workspaceData.children.length > 0) {
            sidebar.innerHTML = renderWorkspaceTree(workspaceData);
        } else {
            sidebar.innerHTML = `<div class="empty-workspace">Workspace is empty.<br>Right-click to create a file.</div>`;
        }
        updateSidebarActiveState();
    });
    
    // This listener now dispatches events to the relevant tab.
    window.addEventListener('pageLoaded', (e) => {
        const pageData = e.detail.payload;
        if (e.detail.error) {
            alert(`Error loading page: ${e.detail.error}`);
            tabManager.closeTab(pageData.path);
            return;
        }
        const tab = tabManager.tabs.get(pageData.path);
        if (tab && tab.instance.onPageContentLoaded) {
            tab.instance.onPageContentLoaded(pageData); 
        }
    });

    window.addEventListener('workspaceUpdated', (e) => {
        const payload = e.detail.payload || e.detail;
        if (!payload) { console.error("Received workspaceUpdated event with no data."); return; }
        const { path, eventType } = payload;
        if (eventType === 'delete' && tabManager.tabs.has(path)) {
            const tabToClose = tabManager.tabs.get(path);
            tabToClose.isUnsaved = false;
            tabManager.closeTab(path);
        }
        ipc.listWorkspace();
        // ipc.requestNoteList(); // This should be triggered by editors that need it.
    });
    
    // --- Event Listeners (for Main component) ---
    sidebar.addEventListener('click', async (e) => { // async
        const settingsBtn = e.target.closest('.item-settings-btn');
        if (settingsBtn) {
            const parentNode = settingsBtn.closest('.tree-node');
            const path = parentNode.dataset.path;
            const type = settingsBtn.dataset.type;
            openConfigModal(type, path);
            return;
        }

        const target = e.target.closest('.tree-node');
        if (!target) return;
        const path = target.dataset.path;
        
        if (target.classList.contains('folder')) {
            target.classList.toggle('open');
            const children = target.nextElementSibling;
            if (children && children.classList.contains('tree-node-children')) {
                children.style.display = target.classList.contains('open') ? 'block' : 'none';
            }
        } else if (target.classList.contains('page')) {
            // --- CONFIG RESOLUTION STEP ---
            const resolved = await ipc.resolveFileConfiguration(path);
            const computedConfig = computeFinalConfig(resolved.config);
            await tabManager.openTab(path, null, computedConfig); // Pass config to tab manager
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
            const rawConfig = await ipc.readConfigFile(configPath);
            configData = rawConfig.data;
            availableSettings = window.DEFAULT_CONFIG; 
        } else { // 'page'
            configPath = path;
            const tab = tabManager.tabs.get(path);
            if (!tab || !tab.instance) {
                alert("Open the file before changing its settings.");
                return;
            }
            configData = tab.instance.fileConfig;
            availableSettings = { page: window.DEFAULT_CONFIG.page };
        }
        
        activeConfigModal = new ConfigModal({
            title: `Settings for ${path.substring(path.lastIndexOf('\\') + 1)}`,
            configData: configData,
            defaults: availableSettings,
            onSave: async (newConfig) => {
                if (type === 'folder') {
                    await ipc.writeConfigFile(configPath, newConfig);
                    // --- START OF FIX: Broadcast the change ---
                    // The path is the folder path, not the config file path.
                    broadcastConfigurationChange(path); 
                    // --- END OF FIX ---
                } else { // page
                    const tab = tabManager.tabs.get(path);
                    if (tab && tab.instance) { 
                        tab.instance.setFileConfig(newConfig);
                    }
                }
                
                // This part is for updating the currently selected item's config if it's open.
                // It's still useful for page configs or if the folder itself was represented as a tab.
                const tabToUpdate = tabManager.tabs.get(path);
                if (tabToUpdate && tabToUpdate.instance) {
                     const resolved = await ipc.resolveFileConfiguration(path);
                     const computedConfig = window.computeFinalConfig(resolved.config);
                     tabToUpdate.computedConfig = computedConfig;
                     tabToUpdate.instance.applyConfiguration(computedConfig);
                }

                activeConfigModal = null;
            },
            onClose: () => {
                activeConfigModal = null;
            }
        });
    }

    window.computeFinalConfig = function(resolvedConfig) {
        const finalConfig = {};
        const fileType = 'page'; // Hardcoded for now
    
        if (!window.DEFAULT_CONFIG[fileType]) return {};
    
        for (const key in window.DEFAULT_CONFIG[fileType]) {
            const categoryConfig = resolvedConfig[fileType] || {};
            const value = categoryConfig[key];
    
            if (value && value !== INHERIT_VALUE) {
                finalConfig[key] = value;
            } else {
                finalConfig[key] = window.DEFAULT_CONFIG[fileType][key];
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
    function renderWorkspaceTree(node) {
        if (!node) return '';
        let html = '';
        const settingsIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

        if (node.type === 'folder') {
            html += `<div class="tree-node folder" data-path="${node.path}">
                <span class="icon"></span>
                <span class="name">${node.name}</span>
                <button class="item-settings-btn" data-type="folder" title="Folder Settings">${settingsIconSvg}</button>
             </div>`;
            if (node.children && node.children.length > 0) {
                html += '<div class="tree-node-children" style="display: none;">';
                node.children.forEach(child => { html += renderWorkspaceTree(child); });
                html += '</div>';
            }
        } else if (node.type === 'page') {
            html += `<div class="tree-node page" data-path="${node.path}">
                <span class="icon"></span>
                <span class="name">${node.name.replace('.veritnote','')}</span>
                <button class="item-settings-btn" data-type="page" title="Page Settings">${settingsIconSvg}</button>
             </div>`;
        } else if (node.type === 'graph') {
            html += `<div class="tree-node page" data-path="${node.path}">
                <span class="icon graph-icon"></span>
                <span class="name">${node.name.replace('.veritnotegraph','')}</span>
                <button class="item-settings-btn" data-type="graph" title="Graph Settings">${settingsIconSvg}</button>
            </div>`;
        }
        return html;
    }
    function hideContextMenu() {
        if (contextMenu) {
            contextMenu.style.display = 'none';
        }
    }
    sidebar.addEventListener('contextmenu', (e) => { e.preventDefault(); contextMenuTarget = e.target.closest('.tree-node, #workspace-tree'); if (!contextMenuTarget) return; contextMenu.style.top = `${e.clientY}px`; contextMenu.style.left = `${e.clientX}px`; contextMenu.style.display = 'block'; });

    document.addEventListener('mousedown', (e) => {
        // Only handles closing the context menu now.
        if (!e.target.closest('#context-menu')) {
            hideContextMenu();
        }
    });

    contextMenu.addEventListener('click', (e) => {
        if (!contextMenuTarget) return;
        const action = e.target.dataset.action;
        let targetPath = contextMenuTarget.dataset.path || '';
        let parentPath = '';
        if (contextMenuTarget.id === 'workspace-tree') { parentPath = JSON.parse(sidebar.dataset.workspaceData || '{}').path || ''; } else if (contextMenuTarget.classList.contains('folder')) { parentPath = targetPath; } else { parentPath = targetPath.substring(0, targetPath.lastIndexOf('\\')); }
        if (!parentPath && sidebar.dataset.workspaceData) { parentPath = JSON.parse(sidebar.dataset.workspaceData).path; }
        switch (action) {
            case 'newPage': { const name = prompt("Page Name", "MyPage"); if (name) { ipc.createItem(parentPath, name, 'page'); } break; }
            case 'newGraph': { const name = prompt("Graph Name", "MyGraph"); if (name) { ipc.createItem(parentPath, name, 'graph'); } break; }
            case 'newFolder': { const name = prompt("Folder Name", "MyFolder"); if (name) { ipc.createItem(parentPath, name, 'folder'); } break; }
            case 'delete': { if (confirm(`Delete "${targetPath}"?`)) { ipc.deleteItem(targetPath); } break; }
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
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = sidebarContainer.offsetWidth;
    
        function onMouseMove(moveEvent) {
            applySidebarWidth(startWidth + (moveEvent.clientX - startX));
        }
    
        function onMouseUp() {
            localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarContainer.style.width);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
        sidebarContainer.style.width = savedWidth;
    }
    
    function setSidebarCollapsed(collapsed) {
        const buttonText = sidebarToggleBtn.querySelector('span');
        const buttonSvg = sidebarToggleBtn.querySelector('svg');
        if (collapsed) {
            appContainer.classList.add('sidebar-collapsed');
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
            sidebarContainer.style.width = '';
            if (buttonText) buttonText.textContent = 'Expand';
            sidebarToggleBtn.title = 'Expand sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>`;
        } else {
            appContainer.classList.remove('sidebar-collapsed');
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false');
            sidebarContainer.style.width = localStorage.getItem(SIDEBAR_WIDTH_KEY) || '260px';
            if (buttonText) buttonText.textContent = 'Collapse';
            sidebarToggleBtn.title = 'Collapse sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>`;
        }
    }
    sidebarToggleBtn.addEventListener('click', () => {
        appContainer.classList.remove('sidebar-peek');
        setSidebarCollapsed(!appContainer.classList.contains('sidebar-collapsed'));
    });
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
    document.getElementById('sidebar-peek-trigger').addEventListener('mouseenter', () => {
        if (appContainer.classList.contains('sidebar-collapsed')) appContainer.classList.add('sidebar-peek');
    });
    sidebarContainer.addEventListener('mouseleave', () => {
        if (appContainer.classList.contains('sidebar-peek')) appContainer.classList.remove('sidebar-peek');
    });
    
    // --- Helper Functions for Path resolution (Global) ---
    // Unchanged
    window.makePathRelativeToWorkspace = function(absolutePath) { if (!workspaceRootPath || !absolutePath || !absolutePath.startsWith(workspaceRootPath)) { return absolutePath; } let relative = absolutePath.substring(workspaceRootPath.length); if (relative.startsWith('\\') || relative.startsWith('/')) { relative = relative.substring(1); } return relative; }
    window.resolveWorkspacePath = function(path) { if (!path || !window.workspaceRootPath) { return path; } if (/^([a-zA-Z]:\\|\\\\|\/|https?:\/\/|file:\/\/\/)/.test(path)) { return path; } return [window.workspaceRootPath, path.replace(/\//g, '\\')].join('\\'); };
    
    // --- Export Logic (Initiation part remains in Main) ---
    // Unchanged for now, but the call to `getSanitizedHtml` will be delegated to the editor instance.
    let isExportCancelled = false;
    exportBtn.addEventListener('click', () => cookSettingsModal.style.display = 'flex');
    cancelCookBtn.addEventListener('click', () => cookSettingsModal.style.display = 'none');
    startCookBtn.addEventListener('click', () => {
        const options = {
            copyLocal: document.getElementById('copy-local-images').checked,
            downloadOnline: document.getElementById('download-online-images').checked,
            disableDrag: document.getElementById('disable-drag-export').checked
        };
        cookSettingsModal.style.display = 'none';
        const workspaceData = JSON.parse(sidebar.dataset.workspaceData || '{}');
        const allFilesToExport = [];
        const getAllFiles = (node, list) => {
            if (node.type === 'page') list.push(node.path);
            else if (node.type === 'folder' && node.children) node.children.forEach(child => getAllFiles(child, list));
        };
        getAllFiles(workspaceData, allFilesToExport);
        if (allFilesToExport.length === 0) return alert('No pages to export.');
        showExportOverlay();
        runExportProcess(options, allFilesToExport); 
    });
    
    // --- Unchanged Export functions ---
    function showExportOverlay() {
        isExportCancelled = false;
        exportOverlay.style.display = 'flex';
        progressBar.style.width = '0%';
        if (!document.getElementById('cancel-export-btn')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancel-export-btn'; cancelBtn.textContent = 'Cancel'; cancelBtn.style.marginTop = '16px';
            cancelBtn.onclick = () => { isExportCancelled = true; exportStatus.textContent = 'Cancelling...'; ipc.send('cancelExport'); };
            exportOverlay.querySelector('.export-modal').appendChild(cancelBtn);
        }
    }

    function hideExportOverlay() {
        exportOverlay.style.display = 'none';
        document.getElementById('cancel-export-btn')?.remove();
    }

    window.registerAllBlocks = (editorInstance) => {
        editorInstance._registerAllBlocks();
    };

    window.addEventListener('exportCancelled', () => {
        exportStatus.textContent = 'Cancelled.'; setTimeout(hideExportOverlay, 1000); 
    });
    window.addEventListener('exportImageProgress', e => {
        const { originalSrc, percentage } = e.detail.payload; exportStatus.textContent = `Downloading ${originalSrc.substring(originalSrc.lastIndexOf('/') + 1)} (${percentage}%)`; 
    });


    function findImageSourcesRecursive(blocks, pagePath, imageTasks) {
        if (!blocks) return;
        blocks.forEach(block => {
            if (block.type === 'image' && block.properties.src) {
                imageTasks.push({ originalSrc: block.properties.src, pagePath: pagePath });
            }
            if (block.children) {
                findImageSourcesRecursive(block.children, pagePath, imageTasks);
            }
        });
    }

    async function runExportProcess(options, allFilesToExport) {
        exportStatus.textContent = 'Collecting file information...';
        progressBar.style.width = '5%';

        // Create one editor instance just to access the block registry for collecting libraries.
        const tempEditorForRegistry = new PageEditor(document.createElement('div'));
        window.registerAllBlocks(tempEditorForRegistry);
    
        const workspaceData = JSON.parse(sidebar.dataset.workspaceData || '{}');
        const allPagesContent = [];
    
        // A recursive helper to find all unique block types used in a page's content.
        const findBlockTypesRecursive = (blocks, typesSet) => {
            if (!blocks) return;
            blocks.forEach(block => {
                typesSet.add(block.type);
                if (block.children) {
                    findBlockTypesRecursive(block.children, typesSet);
                }
            });
        };
    
        // Step 1: Collect content for all pages asynchronously.
        for (const path of allFilesToExport) {
            if (isExportCancelled) return;
            const pageData = await new Promise(resolve => {
                const handler = (e) => {
                    // Ensure we are getting the correct page data.
                    if (e.detail.payload && e.detail.payload.path === path) {
                        window.removeEventListener('pageLoaded', handler);
                        resolve(e.detail.payload);
                    }
                };
                window.addEventListener('pageLoaded', handler);
                ipc.loadPage(path);
            });
            allPagesContent.push(pageData);
        }

        if (isExportCancelled) return;

        // Step 2: Pre-load and cache content for all QuoteBlocks across all pages.
        exportStatus.textContent = 'Resolving references...';
        progressBar.style.width = '12%';
        const quoteContentCache = new Map();

        for (const pageData of allPagesContent) {
            if (isExportCancelled) return;
            const quoteLinksToFetch = new Set();
            const findQuotesRecursive = (blocks) => {
                if (!blocks) return;
                blocks.forEach(block => {
                    if (block.type === 'quote' && block.properties?.referenceLink) {
                        const link = block.properties.referenceLink;
                        // Only fetch if not already in the cache.
                        if (!quoteContentCache.has(link)) {
                            quoteLinksToFetch.add(link);
                        }
                    }
                    if (block.children) findQuotesRecursive(block.children);
                });
            };
            findQuotesRecursive(pageData.content);

            // Now resolve the links found in this page.
            for (const link of quoteLinksToFetch) {
                const [filePath, blockId] = link.split('#');
                const absoluteFilePath = window.resolveWorkspacePath(filePath);
                
                // Find the already-loaded content for the referenced page.
                const sourcePageData = allPagesContent.find(p => p.path === absoluteFilePath);
                if (sourcePageData) {
                    let contentToCache = sourcePageData.content;
                    if (blockId) {
                        // If referencing a specific block, find it recursively.
                        const findBlockById = (blocks, id) => {
                            for (const block of blocks) {
                                if (block.id === id) return block;
                                if (block.children) {
                                    const found = findBlockById(block.children, id);
                                    if (found) return found;
                                }
                            }
                            return null;
                        };
                        const foundBlock = findBlockById(sourcePageData.content, blockId);
                        contentToCache = foundBlock ? [foundBlock] : null;
                    }
                    quoteContentCache.set(link, contentToCache);
                }
            }
        }
        
        if (isExportCancelled) return;
    
        // Step 3: Prepare the build environment and copy libraries FIRST.
        exportStatus.textContent = 'Preparing environment...';
        progressBar.style.width = '10%';
    
        const requiredLibs = new Set();
        const blockClassMap = new Map();
        tempEditorForRegistry.blockRegistry.forEach((BlockClass, type) => {
            blockClassMap.set(type, BlockClass);
        });
    
        allPagesContent.forEach(pageData => {
            const blockTypesInPage = new Set();
            findBlockTypesRecursive(pageData.content, blockTypesInPage);
            blockTypesInPage.forEach(type => {
                const BlockClass = blockClassMap.get(type);
                if (BlockClass && BlockClass.requiredExportLibs.length > 0) {
                    BlockClass.requiredExportLibs.forEach(libPath => requiredLibs.add(libPath));
                }
            });
        });
    
        ipc.prepareExportLibs(Array.from(requiredLibs));
        
        await new Promise(resolve => window.addEventListener('exportLibsReady', resolve, { once: true }));
        
        if (isExportCancelled) return;
    

        // Step 4: Scan for and process images.
        let imageSrcMap = {};
        if (options.copyLocal || options.downloadOnline) {
            exportStatus.textContent = 'Processing images...';
            progressBar.style.width = '15%';
            
            const imageTasks = [];
            
            for (const pageData of allPagesContent) {
                // Scan block content for images
                findImageSourcesRecursive(pageData.content, pageData.path, imageTasks);
        
                // --- NEW: Scan page configuration for images ---
                const pageConfig = pageData.config?.page || {};
                if (pageConfig.background?.type === 'image' && pageConfig.background.value) {
                    imageTasks.push({ originalSrc: pageConfig.background.value, pagePath: pageData.path });
                }
            }
        
            // Deduplicate tasks based on originalSrc to avoid downloading/copying the same image multiple times
            const uniqueImageTasks = Array.from(new Map(imageTasks.map(task => [task.originalSrc, task])).values());
        
            if (uniqueImageTasks.length > 0) {
                ipc.processExportImages(uniqueImageTasks);
                if (isExportCancelled) return;
                imageSrcMap = await new Promise(resolve => {
                    window.addEventListener('exportImagesProcessed', (e) => resolve(e.detail.payload.srcMap), { once: true });
                });
            }
        }

    
        if (isExportCancelled) return;
        
        exportStatus.textContent = 'Generating HTML pages...';
    
        // Step 5: Generate and export HTML for each page using its own temporary editor instance.
        for (let i = 0; i < allPagesContent.length; i++) {
            if (isExportCancelled) return;
            const pageData = allPagesContent[i];
            const path = pageData.path;
            const progress = 20 + ((i + 1) / allPagesContent.length) * 80;
    
            exportStatus.textContent = `Cooking: ${path.substring(path.lastIndexOf('\\') + 1)}`;
            
            // --- CORE FIX: Create a new, isolated editor for each page ---
            const tempEditorContainer = document.createElement('div');
            const tempEditor = new PageEditor(tempEditorContainer, path, null); // Provide path for context
            // Manually perform the essential parts of loading without touching the live DOM
            await tempEditor.loadContentForRender(pageData.content);
            
            // Calculate relative path prefixes for assets (CSS, JS, images)
            const sourcePath = path;
            const workspacePath = workspaceData.path;
            const relativePathStr = sourcePath.substring(workspacePath.length + 1);
            const depth = (relativePathStr.match(/\\/g) || []).length;
            const pathPrefix = depth > 0 ? '../'.repeat(depth) : './';

            // --- CORE FIX: Call getSanitizedHtml on the correctly prepared instance ---
            const exportContext = {
                options,
                imageSrcMap,
                quoteContentCache,
                pathPrefix
            };
            const mainContentHtml = await tempEditor.getSanitizedHtml(true, exportContext);
    
            const cssRelativePath = `${pathPrefix}style.css`;
            
            let libIncludes = '';
            const blockTypesInThisPage = new Set();
            findBlockTypesRecursive(pageData.content, blockTypesInThisPage);
            const requiredLibsForThisPage = new Set();
            blockTypesInThisPage.forEach(type => {
                 const BlockClass = blockClassMap.get(type);
                if (BlockClass && BlockClass.requiredExportLibs.length > 0) {
                    BlockClass.requiredExportLibs.forEach(libPath => requiredLibsForThisPage.add(libPath));
                }
            });
    
            requiredLibsForThisPage.forEach(libPath => {
                const libRelativePath = `${pathPrefix}${libPath}`;
                if (libPath.endsWith('.css')) {
                    libIncludes += `    <link rel="stylesheet" href="${libRelativePath}">\n`;
                } else if (libPath.endsWith('.js')) {
                    libIncludes += `    <script src="${libRelativePath}"><\/script>\n`;
                }
            });
    
            const filteredWorkspaceData = { ...workspaceData };
            if (filteredWorkspaceData.children) {
                // Don't show the 'build' folder in the exported sidebar
                filteredWorkspaceData.children = filteredWorkspaceData.children.filter(child => child.name !== 'build');
            }

            // The sidebar generation logic is complex but appears correct. No changes needed here.
            function generateSidebarHtml(node, currentPath) {
                // ... (This function remains unchanged)
                let html = '';
                if (node.type === 'folder') {
                    const containsActivePage = (folderNode) => {
                        if (!folderNode.children) return false;
                        return folderNode.children.some(child => {
                            if (child.path === currentPath) return true;
                            if (child.type === 'folder') return containsActivePage(child);
                            return false;
                        });
                    };
                    const isOpen = containsActivePage(node);
                    
                    html += `<div class="tree-node folder ${isOpen ? 'open' : ''}" data-path="${node.path}"><span class="icon"></span><span class="name">${node.name}</span></div>`;
                    if (node.children && node.children.length > 0) {
                        html += `<div class="tree-node-children" style="${isOpen ? 'display: block;' : 'display: none;'}">`;
                        node.children.forEach(child => {
                            html += generateSidebarHtml(child, currentPath);
                        });
                        html += '</div>';
                    }
                } else if (node.type === 'page') {
                    const relativePath = node.path.substring(JSON.parse(sidebar.dataset.workspaceData).path.length + 1).replace(/\\/g, '/').replace('.veritnote', '.html');
                    const isActive = (node.path === currentPath);
                    html += `<div class="tree-node page ${isActive ? 'active' : ''}" data-path="${node.path}" data-href="${pathPrefix}${relativePath}"><span class="icon"></span><span class="name">${node.name.replace('.veritnote','')}</span></div>`;
                }
                return html;
            }

            const sidebarHtml = `
                <aside id="sidebar">
                    <div class="workspace-tree">
                        ${generateSidebarHtml(filteredWorkspaceData, path)}
                    </div>
                    <div class="sidebar-footer">
                        <button id="sidebar-toggle-btn" class="sidebar-footer-btn" title="Collapse sidebar">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                            <span>Collapse</span>
                        </button>
                    </div>
                </aside>
            `;



            // --- Style Generation for Export ---
            // 1. Get config (same as before)
            const resolved = await ipc.resolveFileConfiguration(path);
            const computedConfig = computeFinalConfig(resolved.config);

            // 2. Potentially update image paths in the config 
            if (computedConfig.background?.type === 'image' && computedConfig.background.value) {
                const originalSrc = computedConfig.background.value;
                if (imageSrcMap[originalSrc]) {
                    // The path from imageSrcMap is relative to the exported page's *directory*
                    computedConfig.background.value = pathPrefix + imageSrcMap[originalSrc];
                }
            }
            
            // 3. Generate CSS override rules
            let customStyleContent = '';
            let backgroundStyleContent = ''; // Separate styles for the background
            
            for (const key in computedConfig) {
                // We compare with default, but also handle the 'background' object case
                if (JSON.stringify(computedConfig[key]) !== JSON.stringify(window.DEFAULT_CONFIG.page[key])) {
                    const value = computedConfig[key];
                    
                    if (key === 'background' && typeof value === 'object') {
                        // This logic now mirrors applyConfiguration
                        const bgColor = (value.type === 'color') ? value.value : 'transparent';
                        const bgImage = (value.type === 'image' && value.value) ? `url('${value.value.replace(/\\/g, '/')}')` : 'none';
                        backgroundStyleContent += `    background-color: ${bgColor};\n`;
                        backgroundStyleContent += `    background-image: ${bgImage};\n`;
                    } else {
                        // All other variables go into the .editor-view rule
                        const cssVarName = `--page-${key}`;
                        customStyleContent += `    ${cssVarName}: ${value};\n`;
                    }
                }
            }
            
            // 4. Wrap in style tag with CORRECT, SEPARATE rules
            let customStyleTag = '';
            let styleRules = [];
            if (backgroundStyleContent) {
                styleRules.push(`.page-background-container {\n${backgroundStyleContent}}`);
            }
            if (customStyleContent) {
                styleRules.push(`.editor-view {\n${customStyleContent}}`);
            }
            
            if (styleRules.length > 0) {
                customStyleTag = `
                    <style id="veritnote-custom-styles">
                        /* Page-specific overrides */
                        ${styleRules.join('\n\n    ')}
                    </style>
                `;
            }
    
            const exportStyleOverrides = `
    <style>
        body {
            overflow: hidden !important; /* 1. 禁止 body 滚动 */
        }
        .app-container {
            height: 100vh; /* 2. 让主容器占满整个视口高度 */
        }
        #main-content {
            overflow-y: auto !important; /* 3. 让主内容区自己负责滚动 */
            height: 100vh; /* 4. 必须给一个明确的高度，滚动才会生效 */
        }
    </style>
            `;

            const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${path.substring(path.lastIndexOf('\\') + 1).replace('.veritnote', '')}</title>
    <link rel="stylesheet" href="${cssRelativePath}">
    ${customStyleTag}
    ${exportStyleOverrides}
    ${libIncludes}
</head>
<body>
    <div class="app-container page-theme-container">
        <div id="sidebar-peek-trigger"></div>
        ${sidebarHtml}
        <main id="main-content">
            <div class="page-background-container">
                 <div class="editor-view">${mainContentHtml}</div>
            </div>
        </main>
    </div>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const SIDEBAR_COLLAPSED_KEY = 'veritnote_exported_sidebar_collapsed';
            const appContainer = document.querySelector('.app-container');
            const sidebar = document.getElementById('sidebar');
            const peekTrigger = document.getElementById('sidebar-peek-trigger');
            const toggleBtn = document.getElementById('sidebar-toggle-btn');
            const toggleBtnSpan = toggleBtn.querySelector('span');
            const toggleBtnSvg = toggleBtn.querySelector('svg');

            // --- No-flicker initial state setup ---
            const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
            
            // --- 修复点 2.1: 接收方 ---
            // 页面加载时，解析 URL 参数
            const urlParams = new URLSearchParams(window.location.search);
            const isPeekingOnLoad = urlParams.get('peek') === 'true';

            if (isCollapsed) {
                appContainer.classList.add('sidebar-collapsed');
                if (toggleBtnSpan) toggleBtnSpan.textContent = 'Expand';
                if (toggleBtnSvg) toggleBtnSvg.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>';
            
                // 如果需要窥探，则在加载时就添加 peek 类
                if (isPeekingOnLoad) {
                    appContainer.classList.add('sidebar-peek');
                }
            }


            // Folder expand/collapse logic
            sidebar.querySelectorAll('.tree-node.folder').forEach(folder => {
                folder.addEventListener('click', (e) => {
                    if (e.target.closest('.tree-node.page')) return;
                    e.stopPropagation();
                    folder.classList.toggle('open');
                    const children = folder.nextElementSibling;
                    if (children && children.classList.contains('tree-node-children')) {
                        children.style.display = folder.classList.contains('open') ? 'block' : 'none';
                    }
                });
            });

            // Sidebar collapse/expand main logic
            function setSidebarCollapsed(collapsed) {
                if (collapsed) {
                    appContainer.classList.add('sidebar-collapsed');
                    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
                    sidebar.style.width = '';
                    if (toggleBtnSpan) toggleBtnSpan.textContent = 'Expand';
                    if (toggleBtnSvg) toggleBtnSvg.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>';

                } else {
                    appContainer.classList.remove('sidebar-collapsed');
                    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false');
                    if (toggleBtnSpan) toggleBtnSpan.textContent = 'Collapse';
                    if (toggleBtnSvg) toggleBtnSvg.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>';
                }
            }

            toggleBtn.addEventListener('click', () => {
                appContainer.classList.remove('sidebar-peek');
                setSidebarCollapsed(!appContainer.classList.contains('sidebar-collapsed'));
            });

            peekTrigger.addEventListener('mouseenter', () => {
                if (appContainer.classList.contains('sidebar-collapsed')) {
                    appContainer.classList.add('sidebar-peek');
                }
            });

            sidebar.addEventListener('mouseleave', () => {
                if (appContainer.classList.contains('sidebar-peek')) {
                    appContainer.classList.remove('sidebar-peek');
                }
            });

            // Navigation logic
             sidebar.querySelectorAll('.tree-node.page').forEach(pageNode => {
                pageNode.addEventListener('click', () => {
                    let href = pageNode.dataset.href;
                    if(href) {
                        // --- 修复点 2.2: 发送方 ---
                        // 如果当前处于 peek 状态，则给 URL 添加参数
                        if (appContainer.classList.contains('sidebar-peek')) {
                            href += '?peek=true';
                        }
                        window.location.href = href;
                    }
                });
            });

        });
    <\/script>
</body>
</html>`;
            
            ipc.exportPageAsHtml(path, finalHtml);
            progressBar.style.width = `${progress}%`;
        }
    
        if (isExportCancelled) return;
    
        exportStatus.textContent = 'Done!';
        setTimeout(hideExportOverlay, 1500);
    }




    // --- Window State & Dragging (Main component concern) ---
    window.addEventListener('windowStateChanged', (e) => { const { state } = e.detail.payload; if (state === 'fullscreen') { document.body.classList.add('is-fullscreen'); } else { document.body.classList.remove('is-fullscreen'); } });
    minimizeBtn.addEventListener('click', () => ipc.minimizeWindow());
    maximizeBtn.addEventListener('click', () => ipc.maximizeWindow());
    closeBtn.addEventListener('click', () => ipc.closeWindow());
    fullscreenBtnWC.addEventListener('click', () => ipc.toggleFullscreen());
    tabBar.addEventListener('mousedown', (e) => { if (e.target === tabBar && !document.body.classList.contains('is-fullscreen')) { ipc.startWindowDrag(); } });

    // --- Initial State ---
    const startWorkspaceLoad = function(workspacePath) {
        if (workspacePath) {
            // This is the logic from the old window.initializeWorkspace
            ipc.send('setWorkspace', { path: workspacePath });
            ipc.send('listWorkspace');
            ipc.checkWindowState();
            ipc.ensureWorkspaceConfigs();
        } else {
            alert("Error: Workspace path was not provided.");
            ipc.send('goToDashboard');
        }
    };

    // Define a handler function.
    const onWorkspacePathReady = () => {
        if (window.pendingWorkspacePath) {
            startWorkspaceLoad(window.pendingWorkspacePath);
            // Clean up the global variable after use.
            delete window.pendingWorkspacePath; 
        }
    };

    // Check if the path is ALREADY available (if C++ was faster than the fetch).
    if (window.pendingWorkspacePath) {
        onWorkspacePathReady();
    } else {
        // If not, listen for the event that C++ will dispatch.
        window.addEventListener('workspacePathReady', onWorkspacePathReady, { once: true });
    }
};