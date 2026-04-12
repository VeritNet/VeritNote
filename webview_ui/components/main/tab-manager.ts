import { Editor } from '../editor.js';

import { PageEditor } from '../page-editor/page-editor.js';
import { DatabaseEditor } from '../database-editor/database-editor.js';

import { ipc } from './ipc.js';

import { FileType } from '../types.js';



function getFileNameFromPath(path: string) {
    if (window.currentOS === 'android') {
        // Android URI: "content://.../MyFolder%2FMyPage.veritnote" -> "MyPage.veritnote"
        // 解码 URI 组件以处理像 %2F 这样的编码
        const decodedPath = decodeURIComponent(path);
        return decodedPath.substring(decodedPath.lastIndexOf('/') + 1);
    }
    else {
        // Windows 路径
        return path.substring(path.lastIndexOf('\\') + 1);
    }
}


interface TabInfo {
    id: string;
    path: string;
    name: string;
    isUnsaved: boolean;
    instance: Editor;
    dom: {
        wrapper: HTMLDivElement;
        tabItem: HTMLElement | null;
    };
    computedConfig: Record<string, any>;
};


// --- Tab Management ---
export class TabManager {
    tabs: Map<string, TabInfo>;
    tabOrder: string[];
    activeTabPath: string | null;
    draggedElement: HTMLElement | null;
    dynamicTabsContainer: HTMLElement;

    updateSidebarActiveState: Function;
    constructor(updateSidebarActiveState: Function) {
        this.tabs = new Map();
        this.tabOrder = [];
        this.activeTabPath = null;
        this.draggedElement = null;
        this.dynamicTabsContainer = document.getElementById('dynamic-tabs-container') as HTMLDivElement;
        this.updateSidebarActiveState = updateSidebarActiveState;
    }

    getActiveTab() {
        return this.tabs.get(this.activeTabPath as string);
    }

    async openTab(path: string, context: any = {}, type: FileType) {
        // 如果标签页已存在，直接切换过去
        if (this.tabs.has(path)) {
            const existingTab = this.tabs.get(path);

            this.switchTab(path);
            if (context) {
                if (context.blockIdToFocus) {
                    const activeTab = this.getActiveTab();
                    if (activeTab && activeTab.instance instanceof PageEditor) {
                        activeTab.instance.PageSelectionManager.highlightBlock(context.blockIdToFocus);
                    }
                }
            }

            return;
        }

        // 如果标签页不存在，创建新的标签页
        const fileName = getFileNameFromPath(path);

        const tabId = `tab-${Date.now()}-${Math.random()}`;

        const wrapper = document.createElement('div');
        wrapper.className = 'editor-instance-wrapper';
        wrapper.id = `wrapper-${tabId}`;
        wrapper.style.display = 'none';

        const tabContentContainer = document.getElementById('tab-content-container') as HTMLDivElement;
        tabContentContainer.appendChild(wrapper);

        let tabInstance = null;

        if (type === FileType.Page) {
            tabInstance = new PageEditor(wrapper, path, this, context);
        }
        else if (type === FileType.Graph) {
            //tabInstance = new GraphEditor(wrapper, path, this, context);
        }
        else if (type === FileType.Database) {
            tabInstance = new DatabaseEditor(wrapper, path, this, context);
        }
        if (!tabInstance)
            return;

        const newTab: TabInfo = {
            id: tabId,
            path: path,
            name: fileName,
            isUnsaved: false,
            instance: tabInstance,
            dom: { wrapper, tabItem: null as HTMLElement | null },
            computedConfig: null
        };

        this.tabs.set(path, newTab);
        this.tabOrder.push(path);
        tabInstance.load();
        this.switchTab(path);
    }

    closeTab(path: string) {
        const tabToClose = this.tabs.get(path);
        if (!tabToClose)
            return;

        if (tabToClose.isUnsaved) {
            if (!confirm(`"${tabToClose.name}" has unsaved changes. Are you sure you want to close it?`)) {
                return;
            }

            // 如果标签页未保存被关闭，通知其引用管理器恢复相关引用到“已保存”状态
            if (tabToClose.instance && tabToClose.instance instanceof PageEditor) {
                tabToClose.instance.PageReferenceManager.handleRevertReferences(path);
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

    switchTab(path: string | null) {
        if (this.activeTabPath === path && path !== null)
            return;

        const oldTab = this.getActiveTab();
        if (oldTab) {
            oldTab.dom.wrapper.style.display = 'none';
        }

        this.activeTabPath = path;
        const newTab = this.getActiveTab();
        const noFileMessage = document.getElementById('no-file-message')!;

        if (newTab) {
            noFileMessage.style.display = 'none';
            newTab.dom.wrapper.style.display = 'flex';
            newTab.instance.onFocus(); // Notify editor it's active
        }
        else {
            noFileMessage.style.display = 'flex';
        }

        this.render();
        this.updateSidebarActiveState();
    }

    setUnsavedStatus(path: string, isUnsaved: boolean) {
        const tab = this.tabs.get(path);
        if (tab && tab.isUnsaved !== isUnsaved) {
            tab.isUnsaved = isUnsaved;
            this.render();
            if (tab.instance instanceof PageEditor) {
                tab.instance.updateToolbarState();
            }
        }
    }

    render() {
        this.dynamicTabsContainer.innerHTML = '';
        this.tabOrder.forEach(path => {
            const tab = this.tabs.get(path);
            if (tab) {
                const tabItem = document.createElement('div');
                tabItem.className = 'tab-item';
                tabItem.dataset['path'] = path;
                tabItem.title = path;
                if (path === this.activeTabPath) {
                    tabItem.classList.add('active');
                }
                if (tab.isUnsaved) {
                    tabItem.classList.add('unsaved');
                }
                tabItem.innerHTML = `<span class="unsaved-dot"></span><span class="tab-name">${tab.name.replace('.veritnote', '')}</span><button class="tab-close-btn">&times;</button>`;
                tabItem.addEventListener('mousedown', (e: any) => {
                    if (e.button === 1) {
                        this.closeTab(path);
                        return;
                    }
                    if (!e.target.classList.contains('tab-close-btn')) {
                        this.switchTab(path);
                    }
                });
                tabItem.querySelector('.tab-close-btn')?.addEventListener('click', () => this.closeTab(path));
                // Drag and drop logic for tabs is unchanged
                tabItem.draggable = true;
                tabItem.addEventListener('dragstart', e => this.handleDragStart(e, path));
                tabItem.addEventListener('dragover', e => this.handleDragOver(e, path));
                tabItem.addEventListener('drop', e => this.handleDrop(e, path));
                tabItem.addEventListener('dragend', e => this.handleDragEnd(e));
                this.dynamicTabsContainer.appendChild(tabItem);
                tab.dom.tabItem = tabItem;
            }
        });
    }

    handleDragStart(e: any, path: string) {
        e.dataTransfer.setData('text/plain', path);
        this.draggedElement = e.target as HTMLElement;
        setTimeout(() => this.draggedElement!.classList.add('dragging'), 0);
    }

    handleDragOver(e: any, targetPath: string) {
        e.preventDefault();
        const draggingElem = this.draggedElement;

        if (!draggingElem || draggingElem === e.currentTarget)
            return;

        const targetElem = e.currentTarget as HTMLElement;
        const rect = targetElem.getBoundingClientRect();
        const isAfter = e.clientX > rect.left + rect.width / 2;

        if (isAfter) {
            this.dynamicTabsContainer.insertBefore(draggingElem, targetElem.nextSibling);
        }
        else {
            this.dynamicTabsContainer.insertBefore(draggingElem, targetElem);
        }
    }

    handleDrop(e: any, path: string) {
        e.preventDefault();

        const newOrder: string[] = [];
        this.dynamicTabsContainer.querySelectorAll('.tab-item').forEach((item: any) => newOrder.push((item as HTMLElement).dataset['path'] as string));
        this.tabOrder = newOrder;
    }

    handleDragEnd(e: any) {
        if (this.draggedElement) {
            this.draggedElement.classList.remove('dragging');
        }
        this.draggedElement = null;
        this.render();
    }
}
