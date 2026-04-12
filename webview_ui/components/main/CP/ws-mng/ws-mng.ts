import { FileType } from '../../../types.js';
import { ipc } from '../../ipc.js';
import { TabManager } from '../../tab-manager.js';


const FOLDER_STATE_KEY = 'veritnote_folder_states';


let WorkspaceData_ptr: (() => WorkspaceTreeNode) | null = null;
let TabManager_ptr: TabManager = null; // 用于文件大纲项高亮逻辑


/**
 * 文件大纲
 */
// --- 辅助函数：从 localStorage 获取文件夹展开状态 ---
function getFolderOpenState(path: string) {
    try {
        const states = JSON.parse(window.localStorage.getItem(FOLDER_STATE_KEY) || '{}');
        return states[path] === true; // 默认返回 false (折叠)
    } catch (e) { return false; }
}


function filterWorkspaceTree(node: WorkspaceTreeNode, query: string, useCase: boolean, useWord: boolean, useRegex: boolean): WorkspaceTreeNode | null {
    if (!node) return null;

    let isMatch = false;
    if (query) {
        try {
            let regexStr = query;
            if (!useRegex) regexStr = regexStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // 转义
            if (useWord) regexStr = `\\b${regexStr}\\b`;
            const flags = useCase ? '' : 'i';
            const regex = new RegExp(regexStr, flags);
            isMatch = regex.test(node.name);
        } catch (e) {
            const targetName = useCase ? node.name : node.name.toLowerCase();
            const targetQuery = useCase ? query : query.toLowerCase();
            isMatch = targetName.includes(targetQuery);
        }
    } else {
        isMatch = true;
    }

    if (node.type !== FileType.Folder) return isMatch ? { ...node } : null;

    let filteredChildren: any[] = [];
    if (node.children) {
        for (const child of node.children) {
            const filteredChild = filterWorkspaceTree(child, query, useCase, useWord, useRegex);
            if (filteredChild) filteredChildren.push(filteredChild);
        }
    }

    if (isMatch || filteredChildren.length > 0) return { ...node, children: filteredChildren };
    return null;
}

function findNodeByPath(node: WorkspaceTreeNode, path: string): WorkspaceTreeNode | null {
    if (!node) return null;
    if (node.path === path) return node;
    if (node.children) {
        for (const child of node.children) {
            const res = findNodeByPath(child, path);
            if (res) return res;
        }
    }
    return null;
}

function setFolderStateRecursive(node: WorkspaceTreeNode, isOpen: boolean) {
    if (!node) return;
    if (node.type === FileType.Folder) {
        window.toggleFolderStateInStorage(node.path, isOpen);
        if (node.children) node.children.forEach((child: WorkspaceTreeNode) => setFolderStateRecursive(child, isOpen));
    }
}


function renderWorkspaceTree(node: WorkspaceTreeNode, forceOpenAll: boolean = false) {
    if (!node) return '';
    let html = '';

    // 新版设置按钮 SVG
    const settingsIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

    // 统一的 Settings 按钮模板 (基于 ui-lib 类)
    const renderSettingsBtn = (type: FileType) => `<button class="btn bl sq item-settings-btn" bg="none" tc="3" hv-tc="1" hv-bg="2" data-type="${type}" title="${type} Settings">${settingsIconSvg}</button>`;

    if (node.type === FileType.Folder) {
        const isOpen = forceOpenAll ? true : getFolderOpenState(node.path); // 强制展开模式下返回 true，但不影响原本 localStorage 中的值
        const chevronSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"></path></svg>`;
        const folderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path></svg>`;

        html += `<div class="tree-item folder" data-path="${node.path}" data-type="${node.type}" open="${isOpen}">
                <div class="icon chevron">${chevronSvg}</div>
                <div class="type-icon">${folderSvg}</div>
                <span class="name">${node.name}</span>
                ${renderSettingsBtn(FileType.Folder)}
             </div>`;

        if (node.children && node.children.length > 0) {
            // 嵌套容器，缩进匹配 ui-lib
            html += `<div class="tree-node-children" style="display: ${isOpen ? 'block' : 'none'}; padding-left: 20px;">`;
            node.children.forEach((child: WorkspaceTreeNode) => {
                html += renderWorkspaceTree(child, forceOpenAll);
            });
            html += '</div>';
        }
    } else if (node.type === FileType.Page) {
        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path><path d="M14 2v5a1 1 0 0 0 1 1h5"></path><path d="M10 9H8"></path><path d="M16 13H8"></path><path d="M16 17H8"></path></svg>`;
        html += `<div class="tree-item page" data-path="${node.path}" data-type="${node.type}">
                ${iconSvg}
                <span class="name">${node.name.replace('.veritnote', '')}</span>
                ${renderSettingsBtn(FileType.Page)}
             </div>`;
    } else if (node.type === FileType.Graph) {
        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L7 10h10l-5-8z"/><circle cx="7" cy="17" r="4"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>`;
        html += `<div class="tree-item graph" data-path="${node.path}" data-type="${node.type}">
                ${iconSvg}
                <span class="name">${node.name.replace('.veritnotegraph', '')}</span>
                ${renderSettingsBtn(FileType.Graph)}
            </div>`;
    } else if (node.type === FileType.Database) {
        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M3 5V19A9 3 0 0 0 21 19V5"></path><path d="M3 12A9 3 0 0 0 21 12"></path></svg>`;
        html += `<div class="tree-item database" data-path="${node.path}" data-type="${node.type}">
                ${iconSvg}
                <span class="name">${node.name.replace('.veritnotedb', '')}</span> 
                ${renderSettingsBtn(FileType.Database)}
             </div>`;
    }
    return html;
}

function showContextMenu(contextMenu: HTMLElement, x: number, y: number) {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';
}
function hideContextMenu(contextMenu: HTMLElement) {
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

function onContextMenuAction(action: string, targetPath: string, parentPath: string, currentData?: WorkspaceTreeNode) {
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
        case 'expandAll':
        case 'collapseAll': {
            if (currentData) {
                const targetNode = findNodeByPath(currentData, targetPath);
                if (targetNode && targetNode.type === FileType.Folder) {
                    setFolderStateRecursive(targetNode, action === 'expandAll');
                    updateWorkspaceUI(); // 刷新树结构以反映改动
                }
            } break;
        }
        case 'delete': {
            if (confirm(`Delete "${targetPath}"?`)) {
                ipc.deleteItem(targetPath);
            } break;
        }
    }
}



export function updateWorkspaceUI() {
    const data = WorkspaceData_ptr?.();
    const treeContainer = document.getElementById('workspace-tree');
    const nameEl = document.getElementById('workspace-name');

    // 1. 更新名称显示
    if (data && data.path && nameEl) {
        const pathParts = data.path.split(/[\\/]/);
        nameEl.textContent = pathParts.filter(Boolean).pop() || data.path;
    }

    // 2. 渲染树结构
    if (treeContainer) {
        const searchInput = document.getElementById('ws-search-input') as HTMLInputElement;
        const searchPanel = document.getElementById('ws-search-panel');
        const isSearchVisible = searchPanel && searchPanel.classList.contains('search-panel-expanded');
        const query = searchInput?.value || '';

        let renderData = data;
        let forceOpenAll = false;

        if (isSearchVisible && query.trim() !== '') {
            const useCase = (document.getElementById('ws-search-opt-case') as HTMLInputElement)?.checked || false;
            const useWord = (document.getElementById('ws-search-opt-word') as HTMLInputElement)?.checked || false;
            const useRegex = (document.getElementById('ws-search-opt-regex') as HTMLInputElement)?.checked || false;
            renderData = filterWorkspaceTree(data, query.trim(), useCase, useWord, useRegex);
            forceOpenAll = true;
        }

        if (renderData && renderData.children && renderData.children.length > 0) {
            let html = '';
            renderData.children.forEach((child: any) => { html += renderWorkspaceTree(child, forceOpenAll); });
            treeContainer.innerHTML = html;
        } else {
            treeContainer.innerHTML = `<div tc="2" pd="s" style="font-style: italic; font-size: 13px;">${(isSearchVisible && query) ? 'No matches found.' : 'Workspace is empty.'}</div>`;
        }
    }
}


// 总初始化入口，由 main 传入容器、tabManager 及数据闭包
export async function initWorkspaceMng(workspaceMng: HTMLDivElement, tabManager: TabManager, getWorkspaceData: () => any) {
    WorkspaceData_ptr = getWorkspaceData;
    TabManager_ptr = tabManager;
    if (!workspaceMng) return;

    // 异步获取 HTML 片段并注入容器
    const res = await fetch('components/main/CP/ws-mng/ws-mng.html');
    workspaceMng.innerHTML = await res.text();

    // 将全局原本挂载的 toggle 方法转移到这里
    window.toggleFolderStateInStorage = function (path: string, isOpen: boolean) {
        try {
            const states = JSON.parse(window.localStorage.getItem(FOLDER_STATE_KEY) || '{}');
            states[path] = isOpen;
            window.localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(states));
        } catch (e) { }
    }

    // 分发给各子区域绑定事件
    initHeaderModule(tabManager);
    initToolsModule();
    initTreeModule(tabManager, getWorkspaceData);
}

// 子功能 1：Header 按钮事件绑定 (从上次正确回答中迁移)
function initHeaderModule(tabManager: TabManager) {
    const btnBack = document.getElementById('back-to-dashboard-btn') as HTMLButtonElement;
    const btnSet = document.getElementById('workspace-settings-btn') as HTMLButtonElement;

    btnBack?.addEventListener('click', () => {
        let unsavedFiles: string[] = [];
        tabManager.tabs.forEach(tab => { if (tab.isUnsaved) unsavedFiles.push(tab.name); });
        if (unsavedFiles.length > 0 && !confirm(`You have unsaved changes in: ${unsavedFiles.join(', ')}.\n\nLeave without saving?`)) return;
        ipc.goToDashboard();
    });

    btnSet?.addEventListener('click', () => {
        if (window.workspaceRootPath) window.openConfigModal(FileType.Folder, window.workspaceRootPath);
    });
}

// 子功能 2：动态搜索工具栏逻辑 (你已确认正确的逻辑)
function initToolsModule() {
    const searchBtn = document.getElementById('ws-search-btn') as HTMLButtonElement;
    const searchPanel = document.getElementById('ws-search-panel') as HTMLDivElement;
    const searchInput = document.getElementById('ws-search-input') as HTMLInputElement;
    const searchClearBtn = document.getElementById('ws-search-clear-btn') as HTMLButtonElement;

    const optCase = document.getElementById('ws-search-opt-case') as HTMLInputElement;
    const optWord = document.getElementById('ws-search-opt-word') as HTMLInputElement;
    const optRegex = document.getElementById('ws-search-opt-regex') as HTMLInputElement;

    const triggerSearch = () => {
        searchClearBtn.style.display = searchInput.value.trim() !== '' ? 'flex' : 'none';
        updateWorkspaceUI();
    };

    searchInput?.addEventListener('input', triggerSearch);
    [optCase, optWord, optRegex].forEach(opt => opt?.addEventListener('change', triggerSearch));

    searchClearBtn?.addEventListener('click', () => {
        searchInput.value = '';
        triggerSearch();
        searchInput.focus();
    });

    searchBtn?.addEventListener('click', () => {
        if (searchPanel.classList.contains('search-panel-collapsed')) {
            searchPanel.classList.remove('search-panel-collapsed');
            searchPanel.classList.add('search-panel-expanded');
            setTimeout(() => {
                searchInput.focus();
                if (searchInput.value.trim() !== '') updateWorkspaceUI();
            }, 100);
        } else {
            closeSearchPanel();
        }
    });

    // 焦点离开整个搜索面板时才自动关闭 (兼容点击其他过滤选项)
    searchPanel?.addEventListener('focusout', () => {
        setTimeout(() => {
            if (searchInput.value.trim() === '' && !searchPanel.contains(document.activeElement)) {
                closeSearchPanel();
            }
        }, 150);
    });

    function closeSearchPanel() {
        searchPanel.classList.remove('search-panel-expanded');
        searchPanel.classList.add('search-panel-collapsed');
        updateWorkspaceUI(); // 恢复完整树
    }
}

// 子功能 3：Tree 自身事件和 Context Menu
function initTreeModule(tabManager: TabManager, getWorkspaceData: () => WorkspaceTreeNode) {
    const treeDiv = document.getElementById('workspace-tree') as HTMLElement;
    const contextMenu = document.getElementById('context-menu') as HTMLElement;
    let contextMenuTarget: HTMLElement | null = null;

    treeDiv?.addEventListener('click', (e: any) => {
        const settingsBtn = e.target.closest('.item-settings-btn');
        if (settingsBtn) {
            const parentNode = settingsBtn.closest('.tree-item');
            window.openConfigModal(settingsBtn.dataset['type'], parentNode.dataset['path']);
            return;
        }

        const target = e.target.closest('.tree-item');
        if (!target) return;

        const path = target.dataset['path'];
        const type = target.dataset['type'];

        if (type == 'folder') {
            const isCurrentlyOpen = target.getAttribute('open') === 'true';
            const willBeOpen = !isCurrentlyOpen;
            target.setAttribute('open', willBeOpen.toString());
            window.toggleFolderStateInStorage(path, willBeOpen);

            const children = target.nextElementSibling;
            if (children && children.classList.contains('tree-node-children')) {
                children.style.display = willBeOpen ? 'block' : 'none';
            }
        } else {
            tabManager.openTab(path, null, type);
        }
    });

    treeDiv?.addEventListener('contextmenu', (e: any) => {
        e.preventDefault();
        contextMenuTarget = e.target.closest('.tree-item, #workspace-tree');
        if (!contextMenuTarget) return;

        // 判断显隐一键展开和一键折叠选项
        const isFolder = contextMenuTarget.classList.contains('folder');
        (contextMenu.querySelector('[data-action="expandAll"]') as HTMLElement).style.display = isFolder ? 'block' : 'none';
        (contextMenu.querySelector('[data-action="collapseAll"]') as HTMLElement).style.display = isFolder ? 'block' : 'none';

        showContextMenu(contextMenu, e.clientX, e.clientY);
    });

    document.addEventListener('mousedown', (e: any) => {
        if (!e.target.closest('#context-menu')) hideContextMenu(contextMenu);
    });

    contextMenu?.addEventListener('click', (e: any) => {
        if (!contextMenuTarget) return;
        let parentPath = '';
        let targetPath = contextMenuTarget.dataset['path'] || '';
        const currentData = getWorkspaceData();

        if (contextMenuTarget.id === 'workspace-tree') {
            parentPath = currentData ? currentData.path : '';
        } else if (contextMenuTarget.classList.contains('folder')) {
            parentPath = targetPath;
        } else {
            parentPath = targetPath.substring(0, targetPath.lastIndexOf('\\'));
        }
        if (!parentPath && currentData) parentPath = currentData.path;

        onContextMenuAction(e.target.dataset['action'], targetPath, parentPath, currentData);
        hideContextMenu(contextMenu);
    });
}