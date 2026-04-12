import { FileType } from '../../types.js';
import { ipc } from '../ipc.js';
import { TabManager } from '../tab-manager.js';


const FOLDER_STATE_KEY = 'veritnote_folder_states';


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

export function renderWorkspaceTree(node: WorkspaceTreeNode) {
    if (!node) return '';
    let html = '';

    // 新版设置按钮 SVG
    const settingsIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;

    // 统一的 Settings 按钮模板 (基于 ui-lib 类)
    const renderSettingsBtn = (type: FileType) => `<button class="btn bl sq item-settings-btn" bg="none" tc="3" hv-tc="1" hv-bg="2" data-type="${type}" title="${type} Settings">${settingsIconSvg}</button>`;

    if (node.type === FileType.Folder) {
        const isOpen = getFolderOpenState(node.path);
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
            node.children.forEach(child => { html += renderWorkspaceTree(child); });
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

function onContextMenuAction(action: string, targetPath: string, parentPath: string) {
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
}


export function initWorkspaceTree(sidebar: HTMLElement, contextMenu: HTMLElement, tabManager: TabManager, workspaceSettingsBtn: HTMLElement) {
    let contextMenuTarget: (HTMLElement | null) = null;

    // --- 辅助函数：从 localStorage 保存文件夹展开状态 ---
    window.toggleFolderStateInStorage = function (path: string, isOpen: boolean) {
        try {
            const states = JSON.parse(window.localStorage.getItem(FOLDER_STATE_KEY) || '{}');
            states[path] = isOpen;
            window.localStorage.setItem(FOLDER_STATE_KEY, JSON.stringify(states));
        } catch (e) { }
    }

    sidebar.addEventListener('contextmenu', (e: any) => {
        e.preventDefault();
        contextMenuTarget = e.target.closest('.tree-item, #workspace-tree');
        if (!contextMenuTarget) return;
        showContextMenu(contextMenu, e.clientX, e.clientY);
    });

    document.addEventListener('mousedown', (e: any) => {
        // Only handles closing the context menu now.
        if (!e.target.closest('#context-menu')) {
            hideContextMenu(contextMenu);
        }
    });

    contextMenu.addEventListener('click', (e: any) => {
        if (!contextMenuTarget) return;
        let parentPath = '';
        let targetPath = contextMenuTarget.dataset['path'] || '';
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
        onContextMenuAction(e.target.dataset['action'], targetPath, parentPath);
        hideContextMenu(contextMenu);
    });


    sidebar.addEventListener('click', async (e: any) => { // async
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
}