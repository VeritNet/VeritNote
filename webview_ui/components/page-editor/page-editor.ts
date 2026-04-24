// components/page-editor/page-editor.js

import { Editor } from '../editor.js';

import { PopoverManager } from './popovers.js';
import { PageHistoryManager } from './HistoryManager.js';
import { PageReferenceManager } from './ReferenceManager.js';
import { PageSelectionManager } from './SelectionManager.js';

import { TabManager } from '../main/tab-manager.js';

import { FileType } from '../types.js';
import * as file from '../main/file-helper.js';


export enum EditorMode {
    edit,
    preview
}

enum BlockRelPos {
    Left,
    Right,
    Before,
    After,
    InsideLast
}

export class PageEditor extends Editor {
    elements: Record<string, HTMLElement>; // To store references to DOM elements
    mode: EditorMode; // 'edit' or 'preview'

    // --- Core Editor State ---
    blocks: Block[];
    history: PageHistoryManager;
    activeCommandBlock: Block | null;
    draggedBlock: HTMLElement | null;
    currentDropInfo: { targetId: string, position: BlockRelPos } | null;
    activeToolbarBlock: Block | null;
    toolbarHideTimeout: number | undefined;
    currentSelection: Range | null;
    richTextEditingState: { isActive: boolean; blockId: string | null; savedRange: Range | null };

    commandMenuSelectedIndex: number;

    // --- Property to track the currently hovered container's children-container element ---
    hoveredChildrenContainer: HTMLElement | null;

    // --- Sub-managers for organization ---
    PageSelectionManager: PageSelectionManager;
    // The following will be initialized after HTML is loaded
    PageReferenceManager: PageReferenceManager | null;
    popoverManager: PopoverManager | null;

    constructor(container: HTMLElement, filePath: string, tabManager: TabManager, context = {}) {
        super(container, filePath, tabManager, context);

        this.type = FileType.Page; // 基类变量赋值
        
        this.elements = {};
        this.mode = EditorMode.edit;
        
        this.blocks = [];
        this.history = new PageHistoryManager(this);
        this.activeCommandBlock = null;
        this.draggedBlock = null;
        this.currentDropInfo = null;
        this.activeToolbarBlock = null;
        this.toolbarHideTimeout = undefined;
        this.currentSelection = null;
        this.richTextEditingState = { isActive: false, blockId: null, savedRange: null };
        this.commandMenuSelectedIndex = 0;

        this.hoveredChildrenContainer = null;

        this.PageSelectionManager = new PageSelectionManager(this);
        this.PageReferenceManager = null; // Will be initialized in onLoad after HTML is ready
        this.popoverManager = null; // Will be initialized in onLoad after HTML is ready
    }

    // --- ========================================================== ---
    // --- 0. Block API from Page Editor (BAPI_PE)
    // --- ========================================================== ---
    ['BAPI_PE'] = {
        // Page Editor Functions
        ['_populateToolbar']: (blockInstance: Block) => {
            return this._populateToolbar(blockInstance);
        },
        ['_findBlockToFocusAfterTextBlockDeleted']: (id: string) => {
            return this._findBlockToFocusAfterTextBlockDeleted(id);
        },
        ['updateDetailsPanel']: () => {
            return this.updateDetailsPanel();
        },
        ['insertNewBlockAfter']: (targetBlock: Block, type = 'paragraph') => {
            return this.insertNewBlockAfter(targetBlock, type);
        },
        ['showCommandMenuForBlock']: (blockInstance: Block) => {
            return this.showCommandMenuForBlock(blockInstance);
        },
        ['_handleCommandMenuLifecycle']: (blockInstance: Block) => {
            return this._handleCommandMenuLifecycle(blockInstance);
        },
        ['deleteBlock']: (blockInstance: Block, recordHistory = true) => {
            return this.deleteBlock(blockInstance, recordHistory);
        },
        ['emitChange']: (recordHistory = true, actionType = 'unknown', blockInstance = null) => {
            return this.emitChange(recordHistory, actionType, blockInstance);
        },
        ['createBlockInstance']: (blockData) => {
            return this.createBlockInstance(blockData);
        },
        ['selectBlock']: (blockId: string) => {
            return this.PageSelectionManager.setSelect(blockId);
        },

        ['popoverManager']: {
            ['showLink']: (targetElement, existingValue, callback) => {
                return this.popoverManager.showLink(targetElement, existingValue, callback);
            },
            ['showDataFilePicker']: (targetElement, existingDbPath, existingPresetId, callback) => {
                return this.popoverManager.showDataFilePicker(targetElement, existingDbPath, existingPresetId, callback);
            },
            ['showImageSource']: (targetElement, existingValue, callback) => {
                return this.popoverManager.showImageSource(targetElement, existingValue, callback);
            },
            ['showVideoSource']: (targetElement, existingValue, callback) => {
                return this.popoverManager.showVideoSource(targetElement, existingValue, callback);
            },
            ['showAudioSource']: (targetElement, existingValue, callback) => {
                return this.popoverManager.showAudioSource(targetElement, existingValue, callback);
            },
            ['showColorPicker']: (targetElement, callback) => {
                return this.popoverManager.showColorPicker(targetElement, callback);
            },
            ['showReference']: (targetElement, existingValue, callback) => {
                return this.popoverManager.showReference(targetElement, existingValue, callback);
            },
            ['showLanguagePicker']: (targetElement, availableLanguages, callback) => {
                return this.popoverManager.showLanguagePicker(targetElement, availableLanguages, callback);
            },
            ['showReferenceDrop']: (targetElement, callback) => {
                return this.popoverManager.showReferenceDrop(targetElement, callback);
            }
        }
    }


    // --- ========================================================== ---
    // --- 1. Core Lifecycle Methods
    // --- ========================================================== ---

    override async onLoad() {
        const response = await fetch('components/page-editor/page-editor.html');
        this.container.innerHTML = await response.text();

        this._acquireElements();

        this.PageReferenceManager = new PageReferenceManager(this);
        this.popoverManager = new PopoverManager(this);

        this._initListeners();
        this._initUiState();
    }

    override applyConfiguration() {
        const themeContainers = this.getThemeContainers();
        for (const key in this.computedConfig) {
            const value = this.computedConfig[key];
            if (key === 'background' && typeof value === 'object') {
                const bgColor = (value.type === 'color') ? value.value : 'transparent';
                const bgImage = (value.type === 'image' && value.value) ? `url('${value.value.replace(/\\/g, '/')}')` : 'none';
                themeContainers.backgrounds.forEach(c => {
                    if (c) {
                        c.style.backgroundColor = bgColor;
                        c.style.backgroundImage = bgImage;
                    }
                });
                continue;
            }
            const cssVarName = `--page-${key}`;
            themeContainers.views.forEach(c => {
                if (c)
                    c.style.setProperty(cssVarName, value);
            });
        }
    }

    override onContentParsed(content, context) {
        const blockDataList = (content && Array.isArray(content['blocks'])) ? content['blocks'] : [];
        this.blocks = blockDataList.map(data => this.createBlockInstance(data)).filter(Boolean);
        this.blocks.forEach(block => block.parent = null);
        this.render();

        if (this.history.isUndoingOrRedoing) {
            this.PageReferenceManager.handleHistoryChange(this.filePath, blockDataList);
        } else {
            this.history.recordInitialState();
        }

        if (context && context.blockIdToFocus) {
            this.PageSelectionManager.highlightBlock(context.blockIdToFocus);
        }
    }

    
    override onFocus() {
        if (!this.isReady) return;
        this.PageSelectionManager._updateVisuals();
        this.updateToolbarState();
    }
    
    override destroy() {
        if (this.PageReferenceManager) {
            this.PageReferenceManager.destroy();
        }
        // Future cleanup logic here
        console.log(`Editor for ${this.filePath} destroyed.`);
    }

    // --- ========================================================== ---
    // --- 2. Element Acquisition & Initial Listener Setup
    // --- ========================================================== ---

    _acquireElements() {
        this.elements = {
            rightSidebar: this.container.querySelector('#right-sidebar') as HTMLElement,
            rightSidebarResizer: this.container.querySelector('#right-sidebar-resizer') as HTMLElement,
            rightSidebarToggleBtn: this.container.querySelector('#right-sidebar-toggle-btn') as HTMLButtonElement,
            rightSidebarViewToggle: this.container.querySelector('#right-sidebar-view-toggle') as HTMLElement,
            referencesView: this.container.querySelector('#references-view') as HTMLElement,
            detailsView: this.container.querySelector('#details-view') as HTMLElement,
            floatingToolbar: this.container.querySelector('#floating-toolbar') as HTMLElement,
            toggleToolbarBtn: this.container.querySelector('#toggle-toolbar-btn') as HTMLButtonElement,
            toolbarPeekTrigger: this.container.querySelector('#toolbar-peek-trigger') as HTMLElement,
            saveBtn: this.container.querySelector('#save-btn') as HTMLButtonElement,
            modeToggle: this.container.querySelector('#mode-toggle') as HTMLElement,
            commandMenu: this.container.querySelector('#command-menu') as HTMLElement,
            blockToolbar: this.container.querySelector('#block-toolbar') as HTMLElement,
            blockToolbarGraceArea: this.container.querySelector('#block-toolbar-grace-area') as HTMLElement,
            popover: this.container.querySelector('#popover') as HTMLElement,
            deleteDropZone: this.container.querySelector('#delete-drop-zone') as HTMLElement,
        };
        

        // 1. Find the placeholder from the loaded HTML
        const editorAreaPlaceholder = this.container.querySelector('#editor-area-container');
        if (!editorAreaPlaceholder) {
            console.error("Critical error: Could not find #editor-area-container placeholder in page-editor.html!");
            return;
        }

        // 2. Create the EDIT MODE structure
        this.elements.editBackgroundContainer = document.createElement('div');
        this.elements.editBackgroundContainer.className = 'page-background-container page-theme-container'; // Add theme class here
        this.elements.editorAreaContainer = document.createElement('div');
        this.elements.editorAreaContainer.id = 'editor-area-container';
        this.elements.editorAreaContainer.className = 'editor-view';
        this.elements.editBackgroundContainer.appendChild(this.elements.editorAreaContainer);
    
        // 3. Create the PREVIEW MODE structure
        this.elements.previewBackgroundContainer = document.createElement('div');
        this.elements.previewBackgroundContainer.className = 'page-background-container page-theme-container'; // Add theme class here
        this.elements.previewBackgroundContainer.style.display = 'none';
        this.elements.previewView = document.createElement('div');
        this.elements.previewView.className = 'editor-view';
        this.elements.previewBackgroundContainer.appendChild(this.elements.previewView);
    
        // 4. Replace the single placeholder with our two new containers.
        // This is the key fix to correct the DOM structure.
        editorAreaPlaceholder.replaceWith(this.elements.editBackgroundContainer, this.elements.previewBackgroundContainer);
    }
    
    _initListeners() {
        // Editor Area Listeners
        this.elements.editorAreaContainer.addEventListener('input', this._onInput.bind(this));
        this.elements.editorAreaContainer.addEventListener('keydown', this._onEditorKeyDown.bind(this));
        this.elements.editorAreaContainer.addEventListener('click', this._onClick.bind(this));
        this.elements.editorAreaContainer.addEventListener('dragstart', this._onDragStart.bind(this));
        this.elements.editorAreaContainer.addEventListener('dragover', this._onDragOver.bind(this));
        this.elements.editorAreaContainer.addEventListener('dragleave', this._onDragLeave.bind(this));
        this.elements.editorAreaContainer.addEventListener('drop', this._onDrop.bind(this));
        this.elements.editorAreaContainer.addEventListener('dragend', this._onDragEnd.bind(this));
        this.elements.editorAreaContainer.addEventListener('mouseover', this._onBlockMouseOver.bind(this));
        this.elements.editorAreaContainer.addEventListener('mouseout', this._onBlockMouseOut.bind(this));
        if (window.currentOS !== 'android') {//安卓上防止长按触发打开细节面板
            this.elements.editorAreaContainer.addEventListener('contextmenu', (e: MouseEvent) => {
                const blockEl = (e.target as HTMLElement).closest('.block-container') as HTMLElement;
                if (blockEl) {
                    e.preventDefault(); // Prevent the default browser context menu
                    const blockInstance = this._findBlockInstanceById(this.blocks, blockEl.dataset['id'])?.block;
                    if (blockInstance) {
                        this._showBlockDetails(blockInstance);
                    }
                }
            });
        }
        
        // UI Chrome Listeners
        this.elements.commandMenu.addEventListener('click', this._onCommandMenuClick.bind(this));
        this.elements.blockToolbar.addEventListener('mouseover', () => clearTimeout(this.toolbarHideTimeout));
        this.elements.blockToolbar.addEventListener('mouseout', this._onBlockMouseOut.bind(this));
        this.elements.blockToolbarGraceArea.addEventListener('mouseover', () => clearTimeout(this.toolbarHideTimeout));
        this.elements.blockToolbarGraceArea.addEventListener('mouseout', this._onBlockMouseOut.bind(this));
        this.elements.modeToggle.addEventListener('click', (e: MouseEvent) => {
            const option = (e.target as HTMLElement).closest('.mode-toggle-option') as HTMLElement;
            if (option) {
                if (option.dataset['mode'] === 'edit') {
                    this.switchMode(EditorMode.edit);
                } else if (option.dataset['mode'] === 'preview') {
                    this.switchMode(EditorMode.preview);
                }
            }
        });
        this.elements.saveBtn.addEventListener('click', () => this.savePage());

        // Right Sidebar Listeners
        this._initRightSidebarLogic();

        // Floating Toolbar Listeners
        this._initToolbarCollapse();

        // Global Listeners
        this._initGlobalEventListeners();
        
        // 为预览模式下的内部链接添加点击事件处理器
        this.elements.previewView.addEventListener('click', this._onPreviewClick.bind(this));

        // Click listener for hierarchy view in details panel
        this.elements.detailsView.addEventListener('click', (e: MouseEvent) => {
            // Target the entire row for a larger click area
            const targetRow = (e.target as HTMLElement).closest('.details-hierarchy-row') as HTMLElement;
            if (targetRow && targetRow.dataset['blockId']) {
                const blockId = targetRow.dataset['blockId'];
                // 1. Update the selection using the selection manager
                this.PageSelectionManager.setSelect(blockId);
                // 2. Find the block's element in the editor
                const blockEl = this.elements.editorAreaContainer.querySelector(`.block-container[data-id="${blockId}"]`);
                // 3. If found, scroll it into view
                if (blockEl) {
                    blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        });


        // --- Add dedicated listeners for the Delete Drop Zone ---
        const deleteZone = this.elements.deleteDropZone;
        if (deleteZone) {
            // Listener 1: When a draggable element is dragged OVER the delete zone.
            deleteZone.addEventListener('dragover', (e: DragEvent) => {
                // *** CRITICAL FIX PART 1 ***
                e.preventDefault(); // This is absolutely necessary to allow a drop.
                (e.dataTransfer as DataTransfer).dropEffect = 'move'; // Show a "move" cursor, not "disabled".
                
                // Add visual feedback and set the drop info, just like in the main _onDragOver.
                deleteZone.classList.add('is-active');
                this._cleanupDragIndicators(); // Hide any block indicators.
                this.currentDropInfo = { targetId: 'DELETE_ZONE', position: BlockRelPos.InsideLast };
            });
    
            // Listener 2: When a draggable element LEAVES the delete zone.
            deleteZone.addEventListener('dragleave', (e) => {
                // Remove visual feedback.
                deleteZone.classList.remove('is-active');
                // Important: Reset drop info if we are not moving to another valid target.
                // The main _onDragOver will handle creating new drop info if needed.
                this.currentDropInfo = null; 
            });
    
            // Listener 3: When a draggable element is DROPPED ONTO the delete zone.
            deleteZone.addEventListener('drop', (e: DragEvent) => {
                // *** CRITICAL FIX PART 2 ***
                e.preventDefault(); // Prevent any default browser action.
                
                // This logic is now self-contained and guaranteed to fire.
                // We can reuse the same logic from the _onDrop method.
                this.elements.deleteDropZone.classList.remove('is-active');
                
                const multiDragData = (e.dataTransfer as DataTransfer).getData('application/veritnote-block-ids');
                const singleDragId = (e.dataTransfer as DataTransfer).getData('text/plain');
                
                let idsToDelete = [];
                if (multiDragData) {
                    idsToDelete = JSON.parse(multiDragData);
                }
                else if (singleDragId) {
                    idsToDelete = [singleDragId];
                }
    
                if (idsToDelete.length > 0) {
                    idsToDelete.forEach(id => {
                        const el = this.container.querySelector(`.block-container[data-id="${id}"]`);
                        if (el) el.remove();
                    });
                    this.deleteMultipleBlocks(idsToDelete);
                }
                
                // Manually call drag end cleanup.
                this._onDragEnd(e);
            });
        }
    }
    
    _initUiState() {
        this.setRightSidebarCollapsed(window.localStorage.getItem('veritnote_right_sidebar_collapsed') === 'true');
        this.setToolbarCollapsed(window.localStorage.getItem('veritnote_toolbar_collapsed') === 'true');
    }
    
    _initGlobalEventListeners() {
        document.addEventListener('mousedown', (e:any) => {
            // --- SELECTION LOGIC ---
            const clickedBlockEl = e.target.closest('.block-container');
            const isMultiSelectKey = e.ctrlKey || e.metaKey || e.shiftKey;
            const clickedUiChrome = e.target.closest(
                '#sidebar, #right-sidebar, #tab-bar, #floating-toolbar, #popover, #context-menu, #block-toolbar, .block-controls'
            );

            if (clickedBlockEl) {
                if (e.target.closest('.block-controls')) {
                    // Do nothing. The selection is preserved for the next event.
                } else if (isMultiSelectKey) {
                    // This is for multi-selecting by clicking the block's body
                    e.preventDefault();
                    this.PageSelectionManager.toggleSelect(clickedBlockEl.dataset['id']);
                } else {
                    // This is for single-selecting by clicking the block's body
                    this.PageSelectionManager.setSelect(clickedBlockEl.dataset['id']);
                }
            } else {
                // This part handles clicking on the editor background, etc.
                const clickedUiChrome = e.target.closest(
                    '#sidebar, #right-sidebar, #tab-bar, #floating-toolbar, #popover, #context-menu, #block-toolbar, .block-controls'
                );
                if (!clickedUiChrome) {
                    this.PageSelectionManager.clearSelect();
                }
            }
        });

        document.addEventListener('selectionchange', this._onSelectionChange.bind(this));


        window.addEventListener('page:saved', (e:any) => {
            const savedPath = e.detail.path;
            if (!savedPath) return;

            // 遍历当前编辑器中的所有块
            const notifyBlocksRecursive = (blocks: Block[]) => {
                blocks.forEach(block => {
                    if ((block.constructor as typeof Block).type === 'quote') { // 不可以使用 instanceof 来判断！
                        (block as QuoteBlock).onPageSaved(savedPath);
                    }
                    if (block.children && block.children.length > 0) {
                        notifyBlocksRecursive(block.children);
                    }
                });
            };

            // 对所有打开的 Tab 进行通知
            this.tabManager.tabs.forEach(tab => {
                if (tab.instance && tab.instance instanceof PageEditor) {
                    notifyBlocksRecursive(tab.instance.blocks);
                }
            });
        });
    }

    // --- ========================================================== ---
    // --- 3. Block Management
    // --- ========================================================== ---
    /**
     * Creates an instance of a registered block.
     * @param {object} blockData - The data for the block (type, id, etc.).
     * @returns {Block | null} An instance of the corresponding Block class.
     */
    createBlockInstance(blockData) {
        const BlockClass = window.blockRegistry.get(blockData.type);
        if (BlockClass) {
            return new BlockClass(blockData, this);
        }
        console.error(`Block type "${blockData.type}" is not registered.`);
        return null;
    }

    /**
     * Clears the editor and renders all root-level blocks.
     */
    render() {
        this.elements.editorAreaContainer.innerHTML = '';
        this.blocks.forEach(block => {
            const blockEl = block.render();
            if (blockEl) {
                this.elements.editorAreaContainer.appendChild(blockEl);
            }
        });
    }

    deleteBlock(blockInstance: Block, recordHistory = true) {
        const info = this._findBlockInstanceAndParent(blockInstance.id);
        if (info) {
            window.dispatchEvent(new CustomEvent('block:deleted', {
                detail: {
                    filePath: this.filePath,
                    blockId: blockInstance.id
                }
            }));
            
            info.parentArray.splice(info.index, 1);
            
            let parentToUpdate = info.parentInstance;
            while(parentToUpdate) {
                const parentData = parentToUpdate.data;
                window.dispatchEvent(new CustomEvent('block:updated', {
                    detail: {
                        ['blockData']: parentData
                    }
                }));
                const grandParentInfo = this._findBlockInstanceById(this.blocks, parentToUpdate.id);
                parentToUpdate = grandParentInfo ? grandParentInfo.parentBlock : null;
            }
    
            // 1. Call _cleanupData and capture the IDs of containers that were structurally changed.
            const { modifiedContainerIds } = this._cleanupData();
            
            // 2. Explicitly emit an update event for each modified container.
            modifiedContainerIds.forEach(id => {
                const blockInfo = this._findBlockInstanceById(this.blocks, id);
                if (blockInfo?.block) {
                    // We use 'false' for recordHistory because the main deletion action will handle it.
                    // This just ensures the data state is correct before the history snapshot.
                    this.emitChange(false, 'cleanup-structure', blockInfo.block);
                }
            });
    
            if (blockInstance.element && blockInstance.element.parentElement) {
                blockInstance.element.parentElement.removeChild(blockInstance.element);
            }
    
            if (recordHistory) {
                this.emitChange(true, 'delete-block', null);
            }
        }
    }

    deleteMultipleBlocks(blockIds: string[]) {
        if (!blockIds || blockIds.length === 0) return;

        blockIds.forEach(id => {
            // CRITICAL: Check if the block still exists before trying to delete it.
            // This handles cases where a child is deleted because its parent was also in the selection.
            const blockInfo = this._findBlockInstanceAndParent(id);
            if (blockInfo) {
                // Call deleteBlock but tell it NOT to record history for each individual deletion.
                this.deleteBlock(blockInfo.block, false);
            }
        });

        // And now, record a SINGLE history event for the entire batch operation.
        this.emitChange(true, 'batch-delete', null);
    }

    insertNewBlockAfter(targetBlock: Block, type = 'paragraph') {
        const newBlockData = { type: type, content: '' };
        const newBlockInstance = this.createBlockInstance(newBlockData);
        if (!newBlockInstance) return;

        let targetElement = null;

        if (!targetBlock) {
            this.blocks.unshift(newBlockInstance);
            targetElement = this.elements.editorAreaContainer.firstChild;
        } else {
            const { parentInstance, parentArray, index } = this._findBlockInstanceAndParent(targetBlock.id);
            parentArray.splice(index + 1, 0, newBlockInstance);
            newBlockInstance.parent = parentInstance; // 明确设置新块的父实例
            
            targetElement = targetBlock.element;
        }
        
        // --- 核心修正 ---
        const newBlockEl = newBlockInstance.render(); // 使用 .render() 创建新DOM元素

        if (targetElement && targetElement.parentElement) {
            // 最稳健的方式：直接使用 targetElement 的实时父节点
            targetElement.parentElement.insertBefore(newBlockEl, targetElement.nextSibling);
        } else {
            // Fallback: 如果没有目标元素（比如在空编辑器中），或者目标元素没有父节点，
            // 就直接追加到编辑器的根容器中。
            this.elements.editorAreaContainer.appendChild(newBlockEl);
        }
        
        this.PageSelectionManager.setSelect(newBlockInstance.id);
        this.emitChange(true, 'insert-block');

        return newBlockInstance;
    }

    // --- ========================================================== ---
    // --- 4. Editor Actions & Event Handlers
    // --- ========================================================== ---

    savePage() {
        this.save({
            'blocks': this.blocks.map(block => block.data)
        });
    }

    // 找到基类的 UI 回调，控制保存按钮状态:
    override onBeforeSave() {
        if (this.elements.saveBtn) {
            this.elements.saveBtn.classList.add('unsaved');
        }
    }

    override onAfterSave() {
        if (this.elements.saveBtn) {
            this.elements.saveBtn.classList.remove('unsaved');
        }
    }

    // 新增获取主题容器的方法 (满足基类 applyConfiguration 的需要):
    getThemeContainers() {
        return {
            backgrounds: [this.elements.editBackgroundContainer, this.elements.previewBackgroundContainer],
            views: [this.elements.editorAreaContainer, this.elements.previewView]
        };
    }

    /**
     * 接收来自 IPC 的Data(CSV)数据加载响应，并广播给等待的 Block
     */
    onDatabaseLoaded(payload) {
        // payload 结构: { path: string, content: string }

        // 派发一个自定义事件，DataBlock 会监听这个事件
        // 使用 window 派发确保 Block 能收到，携带 path 以便区分是谁请求的
        window.dispatchEvent(new CustomEvent('veritnote:database-loaded', {
            detail: payload
        }));
    }
    
    /**
     * Centralized function to notify about any change in the editor's content.
     * It records history, sets the unsaved status, and dispatches detailed events
     * for features like the PageReferenceManager to stay in sync.
     *
     * @param {boolean} [recordHistory=true] - If false, a state will not be pushed to the undo stack.
     * @param {string} [actionType='unknown'] - A descriptor for the change (e.g., 'typing', 'delete-block') for history coalescing.
     * @param {Block|null} [blockInstance=null] - The specific block instance that was changed, used for detailed event dispatching.
     */
    emitChange(recordHistory = true, actionType = 'unknown', blockInstance: Block | null = null) {
        // Prevent recording history during an undo/redo operation to avoid infinite loops.
        if (this.history.isUndoingOrRedoing) {
            return;
        }

        // --- 1. Record History ---
        // If requested, push the current state of the editor to the history manager.
        if (recordHistory) {
            this.history.record(actionType);
        }
        
        // --- 2. Update Tab Unsaved Status ---
        // Notify the main TabManager that this page now has unsaved changes.
        // This will update the UI (e.g., the dot on the tab).
        this.tabManager.setUnsavedStatus(this.filePath, true);

        // --- 3. Dispatch Fine-Grained Update Events ---
        // This is crucial for UI components like the PageReferenceManager and potentially
        // the Details Panel to update their views without a full re-render.
        if (blockInstance) {
            let currentBlock = blockInstance;
            
            // The event needs to bubble up from the changed block to all its parents,
            // because a change in a child affects the parent's data structure.
            while (currentBlock) {
                // `currentBlock.data` is a getter that recursively builds the data object,
                // ensuring the parent's data is fully up-to-date before dispatching.
                const currentBlockData = currentBlock.data;

                window.dispatchEvent(new CustomEvent('block:updated', {
                    detail: {
                        ['blockData']: currentBlockData
                    }
                }));

                // Find the parent of the current block to continue the loop upwards.
                // We must search from the root of the editor's block tree.
                const parentInfo = this._findBlockInstanceById(this.blocks, currentBlock.id);
                // If parentInfo is found, parentBlock will be the parent instance or null if it's a root block.
                currentBlock = parentInfo ? parentInfo.parentBlock : null;
            }
        }
    }

    // --- Event Handlers ---
    _onInput(e: InputEvent) {
        const blockEl = (e.target as HTMLElement).closest('[data-id]') as HTMLElement;
        if (!blockEl) return;

        const blockInstance = this._findBlockInstanceById(this.blocks, blockEl.dataset['id'])?.block;
        if (blockInstance && typeof blockInstance.onInput === 'function') {
            blockInstance.onInput(e);
        }
    }

    _onClick(e) {
        // --- 优先级 1: UI 控件交互 (拖拽把手单击) ---
        const dragHandle = e.target.closest('.drag-handle');
        if (dragHandle) {
            const blockContainerEl = dragHandle.closest('.block-container');
            if (blockContainerEl) {
                const blockId = blockContainerEl.dataset['id'];
                const isMultiSelectKey = e.ctrlKey || e.metaKey || e.shiftKey;
                if (isMultiSelectKey) {
                    this.PageSelectionManager.toggleSelect(blockId);
                } else {
                    this.PageSelectionManager.setSelect(blockId);
                }
            }
            return;
        }
    
        // --- 优先级 2: 检查点击目标是否是容器的背景或其激活的留白区 ---
        // 找到最近的拥有 ID 的元素
        const targetEl = e.target.closest('[data-id]');

        if (targetEl) {
            const blockInstance = this._findBlockInstanceAndParent(targetEl.dataset['id'])?.block;
            // 只当点击了特定的“添加区域” (CSS控制的padding区) 时才触发
            // 或者当容器为空时点击容器体
            if (blockInstance && blockInstance.childrenContainer) {
                // 如果是 Column，保留特殊逻辑
                if ((blockInstance.constructor as typeof Block).type === 'column') {
                    this._appendNewBlockToContainer(blockInstance);
                    return;
                }

                // 通用容器逻辑 (包括 TableCell, Callout, ListItems)
                // 检查点击目标是否直接是 childrenContainer (即点击了空白处)
                // 或者点击了标记为 show-add-area 的区域
                if (e.target === blockInstance.childrenContainer ||
                    e.target.matches('.show-add-area')) {
                    this._appendNewBlockToContainer(blockInstance);
                    return;
                }
            }
        }
    
        // --- 优先级 4: 多选键检查 ---
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            return;
        }

        // --- 排除列布局宽度调整器 ---
        if (e.target.closest('.column-resizer')) {
            return;
        }
    
        // --- 优先级 5 (默认行为): 背景点击或单选 ---
        const clickedBlockContainer = e.target.closest('.block-container');
        if (!clickedBlockContainer) {
            if (e.target.closest('#editor-area-container')) {
                this._onBackgroundClick();
            }
        }
    }

    /**
     * Handles clicks within the preview view, specifically for internal links.
     * @param {MouseEvent} e The click event.
     */
    async _onPreviewClick(e: MouseEvent) {
        // 使用 .closest() 寻找被点击的元素或其祖先元素中符合条件的链接
        const link = (e.target as HTMLElement).closest('a.internal-link') as HTMLElement;

        if (link) {
            e.preventDefault(); // 阻止 a[href="#"] 的默认跳转行为

            const internalLink = link.dataset['internalLink'];
            if (!internalLink) return;

            // 1. 将链接分割为文件路径和可能的块ID（哈希部分）
            let [filePath, blockIdRaw] = internalLink.split('#');
            let blockId: string | null = blockIdRaw || null; // 如果没有哈希，确保 blockId 为 null

            // 2. 使用全局辅助函数将相对工作区路径解析为绝对路径
            const absolutePath = file.resolveWorkspacePath(filePath);

            // 3. 调用 TabManager 来打开或切换到目标标签页
            // openTab 方法足够智能，如果标签页已打开，它会切换过去，
            // 并将 blockId 传递给编辑器以滚动到指定块。
            await this.tabManager.openTab(absolutePath, { blockIdToFocus: blockId }, FileType.Page);
        }
    }

    _onBackgroundClick() {
        // 如果编辑器中已经有块，并且最后一个块是空的段落，则直接聚焦它，而不是创建新块
        const lastBlock = this.blocks[this.blocks.length - 1];
        if (lastBlock && lastBlock instanceof TextBlock && (lastBlock.constructor as typeof TextBlock).type === 'paragraph' && (!lastBlock.properties.text || lastBlock.properties.text === '<br>')) {
            this.PageSelectionManager.setSelect(lastBlock.id);
            return;
        }

        const newBlock = this.createBlockInstance({ type: 'paragraph' }) as Block;
        this.blocks.push(newBlock);
        
        const newBlockEl = newBlock.render(); // 使用 .render()
        // 确保添加到 #editor-area-container，而不是 this.container
        this.elements.editorAreaContainer.appendChild(newBlockEl); 
        
        this.PageSelectionManager.setSelect(newBlock.id);
        this.emitChange(true, 'create-block');
    }

    _appendNewBlockToContainer(containerBlock: Block) {
        const newBlockInstance = this.createBlockInstance({ type: 'paragraph' }) as Block;
        
        // 1. 将新块实例添加到数据模型中
        containerBlock.children.push(newBlockInstance);
        // 确保新块知道它的父级是谁
        newBlockInstance.parent = containerBlock; 
       
        const newBlockEl = newBlockInstance.render();
    
        // 2. 直接使用实例上缓存的正确 DOM 容器引用
        //    Column 的 childrenContainer 指向它自己的 contentElement。
        //    List/Callout 的 childrenContainer 指向它们内部的 wrapper。
        //    这个引用在各自的 render 方法中被正确设置，所以是可靠的。
        const targetDomContainer = containerBlock.childrenContainer;
    
        if (targetDomContainer) {
            targetDomContainer.appendChild(newBlockEl);
        } else {
            // 如果由于某种原因 childrenContainer 不存在，提供一个回退
            console.warn(`Block type "${(containerBlock.constructor as typeof Block).type}" is a container but lacks a .childrenContainer reference. Appending to .element as a fallback.`);
            (containerBlock.element as HTMLElement).appendChild(newBlockEl);
        }
        
        this.PageSelectionManager.setSelect(newBlockInstance.id);
        this.emitChange(true, 'create-block');
    }

    _onSelectionChange() {
        const selection = document.getSelection() as Selection;
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (this.container.contains(range.startContainer)) {
                this.currentSelection = range;
            }
        }
    }

    // --- Global Keydown Handler ---
    override onKeyDown(e: KeyboardEvent) {
        const activeTab = this.tabManager.getActiveTab();
        if (!activeTab) return;
    
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.PageSelectionManager.getSelectionSize() > 0) {
            
            // First, check if the user is actively editing text.
            const activeEl = document.activeElement as HTMLElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                // If the focus is inside any editable field, DO NOTHING here.
                // Let the browser's default behavior (deleting a character) or the
                // block's own keydown handler (like deleting an empty block) take over.
                return;
            }
    
            // If we reach this point, it means the user is not focused on an input field.
            // It's now safe to assume they intend to delete the selected block(s).
            
            e.preventDefault(); // Prevent default browser actions (like navigating back).
            
            const idsToDelete = this.PageSelectionManager.getSelected();
            this.deleteMultipleBlocks(idsToDelete); // 'this' 就是 activeEditor
            this.PageSelectionManager.clearSelect();
            return; // We've handled the event, so we're done.
        }
    
    
        // The rest of the shortcuts (Ctrl+S, undo/redo)
        if ((e.ctrlKey || e.metaKey)) {
            const key = e.key.toLowerCase();
            if (key === 's') { e.preventDefault(); this.savePage(); return; }
            if (key === 'z') { e.preventDefault(); if (e.shiftKey) { this.history.redo(); } else { this.history.undo(); } return; }
            if (key === 'y' && !e.shiftKey) { e.preventDefault(); this.history.redo(); return; }
        }
    }
    
    // --- Editor-specific Keydown Handler ---
    /**
     * Handles keydown events originating specifically from within the editor's content area.
     * This method is responsible for three main categories of keyboard interactions:
     * 1. Slash command menu navigation ('ArrowUp', 'ArrowDown', 'Enter').
     * 2. Deletion of selected blocks ('Delete', 'Backspace').
     * 3. Forwarding the event to the specific block instance for block-level behaviors (e.g., creating a new block on 'Enter').
     * 
     * Note: Global shortcuts like Ctrl+S are handled in the `onKeyDown` method.
     *
     * @param {KeyboardEvent} e The keyboard event object.
     */
    _onEditorKeyDown(e: KeyboardEvent) {
        // --- Priority 1: Slash Command Menu Navigation ---
        // If the command menu is visible, it intercepts arrow keys and Enter to navigate the menu.
        if (this.elements.commandMenu.style.display === 'block') {
            const items = this.elements.commandMenu.querySelectorAll('.command-item') as NodeListOf<HTMLElement>;
            if (items.length > 0) {
                switch (e.key) {
                    case 'ArrowUp':
                        e.preventDefault();
                        this.commandMenuSelectedIndex = (this.commandMenuSelectedIndex - 1 + items.length) % items.length;
                        this._updateCommandMenuSelection();
                        return; // Stop further processing

                    case 'ArrowDown':
                        e.preventDefault();
                        this.commandMenuSelectedIndex = (this.commandMenuSelectedIndex + 1) % items.length;
                        this._updateCommandMenuSelection();
                        return; // Stop further processing

                    case 'Enter':
                    case 'Tab': // Treat Tab as confirmation as well
                        e.preventDefault();
                        items[this.commandMenuSelectedIndex].click(); // Simulate a click
                        return; // Stop further processing
                }
            }
        }
        
        // --- Priority 2: Deleting Selected Blocks ---
        // This logic is transplanted from the old main.js global keydown listener.
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.PageSelectionManager.getSelectionSize() > 0) {
            // First, check if the user is actively editing text inside an input field or a contenteditable element.
            const activeEl = document.activeElement as HTMLElement;
            const isEditingText = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
            
            // If the focus is inside an editable field, we should NOT delete the block.
            // This allows the default behavior (deleting a character) or the block's own
            // keydown handler (like deleting an empty TextBlock) to take precedence.
            if (isEditingText) {
                // Let the event continue to the block-level handler below.
            } else {
                // If focus is not on an input (e.g., the user clicked a block to select it but didn't type),
                // it's safe to assume they intend to delete the selected block(s).
                e.preventDefault(); // Prevent default browser actions (like navigating back).
                
                const idsToDelete = this.PageSelectionManager.getSelected();
                this.deleteMultipleBlocks(idsToDelete);
                this.PageSelectionManager.clearSelect();
                return; // We've handled the event, so we're done.
            }
        }

        // --- Priority 3: Forwarding to the Block Instance ---
        // This is the original logic from the old editor.js _onKeyDown.
        // It finds the block where the key was pressed and calls its onKeyDown method.
        const contentEl = (e.target as HTMLElement).closest('.block-content, .list-item-text-area') as HTMLElement;
        if (!contentEl) return;
        
        const blockId = contentEl.dataset['id'] || (contentEl.closest('[data-id]') as HTMLElement)?.dataset['id'];
        if (!blockId) return;

        const blockInstance = this._findBlockInstanceAndParent(blockId)?.block;
        if (blockInstance) {
            // Let the block handle the keydown event.
            blockInstance.onKeyDown(e);
        }
    }

    // --- Command Menu Handlers ---
    /**
     * Checks if the command menu is visible. If so, updates it. If not, shows it.
     * This prevents conflicting show/hide calls on every input.
     * @param {Block} blockInstance The block that triggered the command.
     */
    showCommandMenuForBlock(blockInstance: Block) {
        const blockEl = blockInstance.element;
        if (!blockEl || this.elements.commandMenu.classList.contains('is-visible')) {
            return; // Don't show if no element or already visible
        }

        // Make it visible
        this.elements.commandMenu.style.display = 'block';
        requestAnimationFrame(() => {
            this.elements.commandMenu.classList.add('is-visible');
        });
        
        // Position it
        const rect = blockEl.getBoundingClientRect();
        const menuHeight = this.elements.commandMenu.offsetHeight;
        const windowHeight = window.innerHeight;
        const buffer = 10;
        let topPosition = rect.bottom;
        if (rect.bottom + menuHeight > windowHeight - buffer) {
            topPosition = rect.top - menuHeight;
        }
        this.elements.commandMenu.style.left = `${rect.left}px`;
        this.elements.commandMenu.style.top = `${topPosition}px`;

        // Add the click-away listener
        setTimeout(() => {
            const _handleDocumentClickForMenu = (e) => {
                if (!this.elements.commandMenu.contains(e.target)) {
                    this.hideCommandMenu();
                    document.removeEventListener('mousedown', _handleDocumentClickForMenu);
                }
            };
            document.addEventListener('mousedown', _handleDocumentClickForMenu);
        }, 0);
    }

    hideCommandMenu() {
        if (this.elements.commandMenu.classList.contains('is-visible')) {
            this.elements.commandMenu.classList.remove('is-visible');
            this.activeCommandBlock = null;

            // Wait for the animation to finish before setting display to none
            setTimeout(() => {
                // Check again in case it was re-opened quickly
                if (!this.elements.commandMenu.classList.contains('is-visible')) {
                    this.elements.commandMenu.style.display = 'none';
                }
            }, 150); // Match the CSS transition duration
            
            this.commandMenuSelectedIndex = 0;
        }
    }

    /**
     * Filters the registered block commands based on a search term.
     * @param {string} searchTerm The term to filter by.
     * @returns {Array<object>} An array of matching command objects.
     * @private
     */
    _getFilteredCommands(searchTerm: string) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filteredCommands: Array<{ type: string; title: string; description: string; icon: string }> = [];
        window.blockRegistry.forEach(BlockClass => {
            if (BlockClass.canBeToggled) {
                const match = BlockClass.label.toLowerCase().includes(lowerCaseSearchTerm) ||
                    BlockClass.keywords.some(k => k.toLowerCase().startsWith(lowerCaseSearchTerm));
                if (match) {
                    filteredCommands.push({
                        type: BlockClass.type,
                        title: BlockClass.label,
                        description: BlockClass.description,
                        icon: BlockClass.icon || '■'
                    });
                }
            }
        });
        return filteredCommands;
    }

    /**
     * Renders the command menu's inner HTML from a list of commands.
     * @param {Array<object>} commands - The command objects to render.
     * @private
     */
    _renderCommandMenu(commands: Array<{ type: string; title: string; description: string; icon: string }>) {
        this.elements.commandMenu.innerHTML = `
            <div class="command-menu-title">Basic Blocks</div>
            <div class="command-menu-list">
                ${commands.map(cmd => `
                    <div class="command-item" data-type="${cmd.type}">
                        <span class="command-item-icon">${cmd.icon}</span>
                        <div class="command-item-text">
                            <strong>${cmd.title}</strong>
                            <small>${cmd.description}</small>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        this.commandMenuSelectedIndex = 0;
        this._updateCommandMenuSelection();
    }

    /**
     * The single source of truth for managing the command menu's state.
     * Decides whether to show, update, or hide the menu based on block content.
     * @param {Block} blockInstance The block instance that may trigger the menu.
     * @private
     */
    _handleCommandMenuLifecycle(blockInstance: Block) {
        let content: string = '';
        if (blockInstance instanceof TextBlock) {
            content = blockInstance.textElement.textContent || '';
        }

        const lastSlashIndex = content.lastIndexOf('/');

        // --- DECISION 1: Should the menu exist at all? ---
        if (lastSlashIndex === -1) {
            this.hideCommandMenu();
            return;
        }

        // --- DECISION 2: Are there any commands to show? ---
        const searchTerm = content.substring(lastSlashIndex + 1);
        const filteredCommands = this._getFilteredCommands(searchTerm);

        // If the filter returns no results, hide and exit.
        if (filteredCommands.length === 0) {
            this.hideCommandMenu();
            return;
        }

        // --- CONCLUSION: The menu should be visible. ---
        // At this point, we know we need to display the menu with content.

        // 1. Update the content of the menu.
        this._renderCommandMenu(filteredCommands);
        this.activeCommandBlock = blockInstance;

        // 2. If it's not already visible, perform the "show" actions.
        if (!this.elements.commandMenu.classList.contains('is-visible')) {
            this.showCommandMenuForBlock(blockInstance);
        }
    }

    _updateCommandMenuSelection() {
        const items = this.elements.commandMenu.querySelectorAll('.command-item');
        items.forEach((item, index) => {
            if (index === this.commandMenuSelectedIndex) {
                item.classList.add('selected');
                // Ensure the selected item is visible in the scrollable area
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    _onCommandMenuClick(e: MouseEvent) {
        e.preventDefault();
        const item = (e.target as HTMLElement).closest('.command-item') as HTMLElement;
        if (!item || !this.activeCommandBlock) return;

        const newType = item.dataset['type'];
        const targetBlock = this.activeCommandBlock;

        let replaceInPlace = false;
        let contentToTransfer = '';

        if (targetBlock instanceof TextBlock) {
            targetBlock.syncContentFromDOM();

            // 无论追加还是替换，都需要删除文本框末尾敲出的 / 以及附带的命令内容
            const removeLastCommand = (el: HTMLElement) => {
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
                let textNodes = [];
                let node;
                while (node = walker.nextNode()) {
                    textNodes.push(node);
                }
                // 从后往前遍历文本节点，找到最后一个包含 / 的节点，并截断
                for (let i = textNodes.length - 1; i >= 0; i--) {
                    let tNode = textNodes[i];
                    let lastIdx = tNode.nodeValue.lastIndexOf('/');
                    if (lastIdx !== -1) {
                        tNode.nodeValue = tNode.nodeValue.substring(0, lastIdx);
                        // 将同处命令尾随的后续文本节点清空
                        for (let j = i + 1; j < textNodes.length; j++) {
                            textNodes[j].nodeValue = '';
                        }
                        break;
                    }
                }
            };
            removeLastCommand(targetBlock.textElement);
            targetBlock.syncContentFromDOM();

            // 提取被删掉命令后的文本，以便替换模式时带入新块
            contentToTransfer = targetBlock.textElement.innerHTML;

            // 只要当前块没有子块，就进行原位替换
            const hasNoChildren = !targetBlock.children || targetBlock.children.length === 0;

            if (hasNoChildren) {
                replaceInPlace = true;
            }
        }

        let finalFocusBlock: Block | null = null;

        if (replaceInPlace) {
            // --- 场景 A：原位替换 ---
            const { parentArray, index } = this._findBlockInstanceAndParent(targetBlock.id);
            // 将之前提取的 contentToTransfer 赋值给新块
            const newBlockData = { id: targetBlock.id, type: newType, properties: { text: contentToTransfer } };
            const newBlockInstance = this.createBlockInstance(newBlockData);

            if (newBlockInstance) {
                parentArray.splice(index, 1, newBlockInstance);

                const oldEl = targetBlock.element as HTMLElement;
                const newEl = newBlockInstance.render();
                (oldEl.parentElement as HTMLElement).replaceChild(newEl, oldEl);

                this.PageSelectionManager.setSelect(newBlockInstance.id);
                finalFocusBlock = newBlockInstance;
            }
        } else {
            // --- 场景 B：在下方追加 ---
            const newBlockInstance = this.insertNewBlockAfter(targetBlock, newType);
            finalFocusBlock = newBlockInstance;
        }

        // 统一处理新块的聚焦逻辑
        if (finalFocusBlock && finalFocusBlock instanceof TextBlock) {
            // 延迟一帧确保 DOM 已挂载并可以聚焦
            requestAnimationFrame(() => {
                (finalFocusBlock as TextBlock).textElement.focus();
            });
        }

        this.hideCommandMenu();
        this.emitChange(true, 'create-block');
    }

    // --- Drag & Drop Handlers ---
    _onDragStart(e: DragEvent) {
        const blockContainer = (e.target as HTMLElement).closest('.block-container') as HTMLElement;
        if (blockContainer) {
            const blockId = blockContainer.dataset['id'] as string;
            const isMultiDrag = this.PageSelectionManager && this.PageSelectionManager.getSelectionSize() > 1 && this.PageSelectionManager.hasSelected(blockId);

            this.draggedBlock = blockContainer; // Keep this for visual feedback (opacity)

            if (isMultiDrag) {
                // --- MULTI-DRAG LOGIC ---
                // Get all selected IDs, but ensure the actually dragged block is first in the list.
                // This helps in re-ordering them correctly on drop.
                const selectedIds = this.PageSelectionManager.getSelected();
                const orderedIds = [blockId, ...selectedIds.filter(id => id !== blockId)];
                
                (e.dataTransfer as DataTransfer).setData('application/veritnote-block-ids', JSON.stringify(orderedIds));
                
                // Add a class to all selected blocks for visual feedback
                orderedIds.forEach(id => {
                    const el = this.container.querySelector(`.block-container[data-id="${id}"]`);
                    if (el) el.classList.add('is-dragging-ghost');
                });
                
            } else {
                // --- SINGLE-DRAG LOGIC (unchanged) ---
                this.PageSelectionManager.clearSelect(); // Clear selection if starting a single drag
                (e.dataTransfer as DataTransfer).setData('text/plain', blockId);
                setTimeout(() => blockContainer.style.opacity = '0.5', 0);
            }

            document.body.classList.add('is-dragging-block');
        }
    }

    /**
     * Activates the "add area" for a specific container block and deactivates any previous one.
     * This is the single source of truth for showing the container's drop/click target.
     * @param {Block | null} containerBlockInstance The container block instance to activate.
     */
    _setActiveContainerAddArea(containerBlockInstance: Block) {
        // Deactivate the previously active one, if any.
        if (this.hoveredChildrenContainer) {
            this.hoveredChildrenContainer.classList.remove('show-add-area');
            this.hoveredChildrenContainer.classList.remove('is-drop-target-child'); // Also clean up drag class
        }
    
        this.hoveredChildrenContainer = null;
    
        // Activate the new one, if it's a valid container.
        if (containerBlockInstance && containerBlockInstance.childrenContainer) {
            const childrenContainer = containerBlockInstance.childrenContainer;
            
            // The class to add depends on whether we are dragging or not.
            const className = document.body.classList.contains('is-dragging-block') 
                ? 'is-drop-target-child' 
                : 'show-add-area';
    
            childrenContainer.classList.add(className);
            this.hoveredChildrenContainer = childrenContainer;
        }
    }

    // 判断一个块是否允许在其左右两侧创建分栏
    // 逻辑：如果一个块的父级没有交互容器(childrenContainer为null)，说明该块是父级不可分割的结构（如Row是Table的结构），
    // 此时不允许破坏结构创建分栏。
    _canAcceptSideDrop(blockInstance: Block) {
        // 1. 如果没有父块，说明是根级别块，允许。
        if (!blockInstance.parent) return true;

        // 2. 特例：如果父块是 'columns'。
        // 虽然 ColumnsBlock 的 childrenContainer 也是 null (我们在上一步修改中设定的)，
        // 但我们允许在 Column 旁边拖放以添加新列。
        if ((blockInstance.parent.constructor as typeof Block).type === 'columns') return true;

        // 3. 核心判断：如果父块拥有有效的 childrenContainer，说明当前块只是容器里的一个普通内容块。
        // 此时允许在它旁边创建分栏。
        if (blockInstance.parent.childrenContainer) return true;

        // 4. 否则（父块存在，且父块 childrenContainer 为 null，且父块不是 columns），
        // 说明当前块是严格的结构块（例如：Table 中的 Row，或 Row 中的 Cell）。
        // 此时拒绝左右拖放。
        return false;
    }

    _onDragOver(e: MouseEvent) {
        e.preventDefault();

        this._cleanupDragIndicators(false); 

        // 1. 基础变量准备
        // 我们需要找到当前鼠标下的“最深层”的块 (可能是子块，也可能是父块本身)
        let directTargetEl = (e.target as HTMLElement).closest('[data-id]') as HTMLElement;

        if (!directTargetEl) {
            this.currentDropInfo = null;
            return;
        }

        let directBlockInstance = this._findBlockInstanceById(this.blocks, directTargetEl.dataset['id'])?.block;
        if (!directBlockInstance) return;

        // --- 结构目标自动提升 ---
        // 如果当前悬停的是像 TableView、TableRow 这样不可分割的结构子块（_canAcceptSideDrop 为 false）
        // 我们不应该在它周围执行任何插入，而是应该将判定目标直接提升为它的父级（DataBlock 或 Table）。
        while (directBlockInstance && directBlockInstance.parent && !this._canAcceptSideDrop(directBlockInstance)) {
            directBlockInstance = directBlockInstance.parent;
            directTargetEl = directBlockInstance.element;
        }

        // ============================================================
        // 逻辑层级 1: 视觉反馈 - 激活所有父级容器 (蓝色虚线框)
        // ============================================================
        // 只要鼠标在这个块的范围内（无论是在 Header 还是 Child 上），
        // 这个块如果是容器，就应该显示虚线框。同时它的所有父级容器也应该显示。

        let ancestorEl = directTargetEl;
        while (ancestorEl && ancestorEl !== this.elements.editorAreaContainer) {
            // 如果是 block-container 或 table-cell
            if (ancestorEl.dataset && ancestorEl.dataset['id']) {
                const ancestorInst = this._findBlockInstanceById(this.blocks, ancestorEl.dataset['id'])?.block;
                // 只有当它是容器时才激活
                if (ancestorInst && ancestorInst.childrenContainer) {
                    ancestorInst.childrenContainer.classList.add('is-drag-active');
                }
            }
            ancestorEl = ancestorEl.parentElement as HTMLElement;
        }

        // ============================================================
        // 逻辑层级 2: 判定落点 (Position Logic)
        // ============================================================

        let finalTargetId = directBlockInstance.id;
        let position: BlockRelPos;

        // 我们需要判断鼠标到底在哪个“区域”：
        // A. 某块的 childrenContainer 的“空白区” (无子块覆盖，或子块间隙)
        // B. 某块的“非容器区域” (如 Header, Icon)

        // 检查 1: 鼠标是否直接悬停在某个 childrenContainer 上？
        // (这种情况通常发生在容器有 padding，或者鼠标在子块之间的缝隙)
        if ((e.target as HTMLElement).classList.contains('block-children-container') ||
            (e.target as HTMLElement).classList.contains('callout-content-wrapper')) {

            // 找到了对应的容器块实例
            // 注意：e.target 是 childrenContainer，它的 parentElement 通常是 contentElement
            const containerBlockEl = (e.target as HTMLElement).closest('[data-id]') as HTMLElement;
            const containerInst = this._findBlockInstanceById(this.blocks, containerBlockEl.dataset['id'])?.block;

            if (containerInst) {
                // 命中容器空白区 -> 放入容器
                position = BlockRelPos.InsideLast;
                finalTargetId = containerInst.id;

                // 视觉更新：虚线变实线
                (e.target as HTMLElement).classList.remove('is-drag-active');
                (e.target as HTMLElement).classList.add('is-drop-target-solid');

                this.currentDropInfo = { targetId: finalTargetId, position: position };
                return; // 判定结束
            }
        }

        // 检查 2: 鼠标悬停在某个具体的块 (directBlockInstance) 上
        // 这时有几种情况：
        // 2.1 这个块是某个容器的子块 -> 与该子块发生关系 (Before/After/Left/Right)
        // 2.2 这个块本身就是容器，且鼠标在它的 Header 上 -> 与该块发生关系 (Before/After...)

        // 我们复用之前的 _canAcceptSideDrop 和坐标计算逻辑，
        // 但这次是针对 directBlockInstance (最深层的那个块)

        const rect = directTargetEl.getBoundingClientRect();
        const yMidpoint = rect.top + rect.height / 2;
        const xZone = rect.width * 0.15; // 左右分栏触发区

        if (e.clientX < rect.left + xZone) {
            position = BlockRelPos.Left;
        } else if (e.clientX > rect.right - xZone) {
            position = BlockRelPos.Right;
        } else if (e.clientY < yMidpoint) {
            position = BlockRelPos.Before;
        } else {
            position = BlockRelPos.After;
        }

        // 视觉更新：绘制指示线 (蓝色条)
        // 这一步由 _showHorizontalIndicator / _showVerticalIndicator 完成
        if (position === BlockRelPos.Left || position === BlockRelPos.Right) {
            this._showVerticalIndicator(directTargetEl, position);
        } else {
            this._showHorizontalIndicator(directTargetEl, position);
        }

        // 此时，虽然我们在操作子块，但父级容器的 .is-drag-active (虚线) 依然保留着 (因为我们在开头做了遍历添加)
        // 这完美符合需求：容器显示蓝色虚线提示范围，内部子块显示位置关系指示条。

        this.currentDropInfo = { targetId: finalTargetId, position: position };
    }

    _onDragLeave(e: MouseEvent) {  }

    _onDrop(e: DragEvent) {
        // --- Check for reference item drop at the very beginning ---
        const refItemDataStr = (e.dataTransfer as DataTransfer).getData('application/veritnote-reference-item');
        if (refItemDataStr) {
            e.preventDefault();
            this._cleanupDragIndicators();
            document.body.classList.remove('is-dragging-block');
            
            try {
                const refData = JSON.parse(refItemDataStr);
                this._handleReferenceItemDrop(e, refData);
            } catch (err) {
                console.error("Failed to parse reference item data:", err);
            }
            return; // Stop further execution of the drop handler
        }
    
        document.body.classList.remove('is-dragging-block');
        this.container.querySelectorAll('.is-dragging-ghost').forEach(el => el.classList.remove('is-dragging-ghost'));
        e.preventDefault();
        this._cleanupDragIndicators();
        
        if (this.draggedBlock) {
            this.draggedBlock.style.opacity = '1';
        }
    
        const multiDragData = (e.dataTransfer as DataTransfer).getData('application/veritnote-block-ids');
        const singleDragId = (e.dataTransfer as DataTransfer).getData('text/plain');
    
        if ((!multiDragData && !singleDragId) || !this.currentDropInfo) {
            this.draggedBlock = null;
            return;
        }
    
        const { targetId, position } = this.currentDropInfo;
        const targetBlockInfo = this._findBlockInstanceAndParent(targetId);
        if (!targetBlockInfo) {
             this.draggedBlock = null;
             return;
        }
        
        const draggedIds: string[] = multiDragData ? JSON.parse(multiDragData) : [singleDragId];
        if (draggedIds.includes(targetId)) return;

        // --- 防止将父块拖入其自身或其子孙块中（结构死循环会导致块消失） ---
        let isDescendant = false;
        let checkParent = targetBlockInfo.parentInstance;
        while (checkParent) {
            if (draggedIds.includes(checkParent.id)) {
                isDescendant = true;
                break;
            }
            // 向上追溯所有的父级
            const parentInfo = this._findBlockInstanceAndParent(checkParent.id);
            checkParent = parentInfo ? parentInfo.parentInstance : null;
        }
        if (isDescendant) {
            this.draggedBlock = null; // 发现目标落点在自己肚子里，立刻终止操作
            console.warn('Do Not Try To Set Block As its Child\'s Child');
            return;
        }
    
        draggedIds.forEach(id => {
            const blockInfo = this._findBlockInstanceAndParent(id);
            if (blockInfo?.block && blockInfo.block instanceof TextBlock) blockInfo.block.syncContentFromDOM();
        });
        if (targetBlockInfo?.block && targetBlockInfo.block instanceof TextBlock) {
            targetBlockInfo.block.syncContentFromDOM();
        }
    
        const removedBlocks = [];
        const allBlockInfos = draggedIds.map(id => this._findBlockInstanceAndParent(id)).filter(Boolean);
        
        // --- NEW: Explicitly remove the old DOM elements before anything else ---
        allBlockInfos.forEach(info => {
            if (info.block.element && info.block.element.parentElement) {
                info.block.element.parentElement.removeChild(info.block.element);
            }
        });
        
        const blocksByParent = new Map();
        allBlockInfos.forEach(info => {
            const parentId = info.parentInstance ? info.parentInstance.id : 'root';
            if (!blocksByParent.has(parentId)) {
                blocksByParent.set(parentId, []);
            }
            blocksByParent.get(parentId).push(info);
        });
    
        blocksByParent.forEach(infos => {
            infos.sort((a, b) => b.index - a.index);
            infos.forEach(info => {
                const [removed] = info.parentArray.splice(info.index, 1);
                const originalIndex = draggedIds.indexOf(removed.id);
                removedBlocks[originalIndex] = removed;
            });
        });
        const finalRemovedBlocks = removedBlocks.filter(Boolean);
    
        // Re-find target info AFTER removal
        const finalTargetInfo = this._findBlockInstanceAndParent(targetId);
        if (!finalTargetInfo) {
            this.render();
            this.draggedBlock = null;
            return;
        }
        const { block: targetBlockInstance, parentArray: toParentArray, index: toIndex, parentInstance: toParentInstance } = finalTargetInfo;
    
        // --- Perform insertion based on position ---
        let needsFullRender = false;
    
        switch (position) {
            case BlockRelPos.Left:
            case BlockRelPos.Right:
                this._handleColumnDrop(finalRemovedBlocks, targetBlockInstance, position);
                needsFullRender = true;
                break;
             case BlockRelPos.Before:
            case BlockRelPos.After: { 
                const parentEl = targetBlockInstance.element.parentElement;
                if (!parentEl) {
                    needsFullRender = true;
                    break;
                }
                const insertIndex = (position === BlockRelPos.Before) ? toIndex : toIndex + 1;
                toParentArray.splice(insertIndex, 0, ...finalRemovedBlocks);
                const anchorNode = (position === BlockRelPos.Before) ? targetBlockInstance.element : targetBlockInstance.element.nextSibling;
                finalRemovedBlocks.forEach(block => {
                    const newEl = block.render();
                    parentEl.insertBefore(newEl, anchorNode);
                });
                break;
            }
    
            case BlockRelPos.InsideLast:
                if (targetBlockInstance.childrenContainer) {
                    targetBlockInstance.children.push(...finalRemovedBlocks);

                    const containerElement = targetBlockInstance.childrenContainer;

                    finalRemovedBlocks.forEach(block => {
                        const newEl = block.render();
                        containerElement.appendChild(newEl);
                    });
                }
                break;
        }
        
        // --- Cleanup, render, save ---
        this.draggedBlock = null;
        this.currentDropInfo = null;
        this.PageSelectionManager.clearSelect();
        
        // --- 核心修改：统一事件通知 ---
        // 1. 从 _cleanupData 获取被修改的容器
        const { structuralChange, modifiedContainerIds } = this._cleanupData();
    
        if (needsFullRender || structuralChange) {
            this.render();
        }
        
        // 2. 收集所有受影响的父容器
        const affectedParents = new Set<Block>();
        // (a) 添加被拖拽块的原始父容器
        allBlockInfos.forEach(info => {
            if (info.parentInstance) {
                affectedParents.add(info.parentInstance);
            }
        });
    
        // (b) 添加拖放的目标父容器
        if (position === BlockRelPos.InsideLast && targetBlockInstance.childrenContainer) {
            affectedParents.add(targetBlockInstance);
        } else if (toParentInstance) {
            // 否则，目标容器是目标块的父级
            affectedParents.add(toParentInstance);
        }
        
        // (c) 添加从 _cleanupData 返回的被修改的容器
        modifiedContainerIds.forEach(id => {
            const blockInfo = this._findBlockInstanceById(this.blocks, id);
            if (blockInfo && blockInfo.block) {
                affectedParents.add(blockInfo.block);
            }
        });
    
        // 3. 为所有受影响的容器触发更新，并只记录一次历史
        if (affectedParents.size > 0) {
            const parentsArray = Array.from(affectedParents);
            // 为第一个父容器记录历史
            this.emitChange(true, 'drag-drop-reorder', parentsArray[0]);
    
            // 为其他父容器触发更新，但不记录额外的历史步骤
            for (let i = 1; i < parentsArray.length; i++) {
                this.emitChange(false, 'drag-drop-reorder', parentsArray[i]);
            }
        } else {
            // 如果没有明确的父容器（例如，在根级别重新排序），则记录一次通用历史
            this.emitChange(true, 'drag-drop-reorder');
        }
    }

    _onDragEnd(e) {
        document.body.classList.remove('is-dragging-block');
        this.container.querySelectorAll('.is-dragging-ghost').forEach(el => el.classList.remove('is-dragging-ghost'));
        this._cleanupDragIndicators();

        // Ensure active state is removed from delete zone on drag end
        if (this.elements.deleteDropZone) {
            this.elements.deleteDropZone.classList.remove('is-active');
        }
        
        if (this.draggedBlock) {
            this.draggedBlock.style.opacity = '1';
            this.draggedBlock = null;
        }
    }

    _handleColumnDrop(draggedBlocks: Block[], targetBlockInstance: Block, position: BlockRelPos.Left | BlockRelPos.Right) {
        let targetInfo = this._findBlockInstanceAndParent(targetBlockInstance.id);
        if (!targetInfo) return;
        const { block, parentInstance, parentArray, index: targetIndex } = targetInfo;

        // Scene A: Target is already a column inside a Columns block.
        if (parentInstance && (parentInstance.constructor as typeof Block).type === 'columns') {
            // Create a new column to hold the dropped blocks
            const newColumn = this.createBlockInstance({ type: 'column' }) as Block;
            newColumn.children.push(...draggedBlocks);
            
            // Insert the new column next to the target column
            const insertIndex = position === BlockRelPos.Left ? targetIndex : targetIndex + 1;
            parentInstance.children.splice(insertIndex, 0, newColumn);
            
            // Rebalance widths of all columns in the container
            const numCols = parentInstance.children.length;
            parentInstance.children.forEach(col => col.properties.width = 1 / numCols);
        } else {
            // Scene B: Two or more blocks merge into a brand new Columns block.
            
            // First, create a column for the target block
            const targetColumn = this.createBlockInstance({ type: 'column' }) as Block;
            targetColumn.children.push(targetBlockInstance);
            
            // Second, create a column for ALL the dragged blocks
            const draggedColumn = this.createBlockInstance({ type: 'column' }) as Block;
            draggedColumn.children.push(...draggedBlocks);
            
            // Third, create the main Columns container
            const newColumnsContainer = this.createBlockInstance({ type: 'columns' }) as Block;
            
            // Arrange the new columns based on the drop position
            if (position === BlockRelPos.Left) {
                newColumnsContainer.children.push(draggedColumn, targetColumn);
            } else { // BlockRelPos.Right
                newColumnsContainer.children.push(targetColumn, draggedColumn);
            }
            
            // Finally, replace the original target block with the new columns container in the DOM tree
            parentArray.splice(targetIndex, 1, newColumnsContainer);
        }
    }

    _cleanupData(): { structuralChange: boolean; modifiedContainerIds: Set<string> } {
        // structuralChange is now only used for the return value for render() decision
        let structuralChange = false; 
        const modifiedContainerIds = new Set<string>(); // <--- 新增：用于记录被修改的容器
    
        const traverseAndClean = (blocks: Block[], parent: Block | null) => {
            for (let i = blocks.length - 1; i >= 0; i--) {
                const block = blocks[i];
    
                if (block.children && block.children.length > 0) {
                    traverseAndClean(block.children, block);
                }
    
                if ((block.constructor as typeof Block).type === 'columns') {
                    const columnsToRemoveFromDOM = [];
                    const originalColumnCount = block.children.length;
                
                    block.children = block.children.filter(col => {
                        if (col.children.length > 0) return true;
                        if (col.element) columnsToRemoveFromDOM.push(col.element);
                        return false;
                    });
    
                    columnsToRemoveFromDOM.forEach(el => el.parentElement?.removeChild(el));
    
                    const newColumnCount = block.children.length;
                    const columnsWereRemoved = newColumnCount < originalColumnCount;
    
                    if (columnsWereRemoved) {
                        structuralChange = true;
                    }
    
                    const info = this._findBlockInstanceAndParent(block.id);
                    if (!info) continue;
    
                    // --- 核心修改：不再发送事件，而是记录ID ---
                    if (newColumnCount === 0 || newColumnCount === 1) {
                        // Case A/B: ColumnsBlock 本身被移除或替换，其父容器被修改。
                        if (info.parentInstance) {
                            modifiedContainerIds.add(info.parentInstance.id);
                        }
                    }
    
                    if (newColumnCount === 0) {
                        if (block.element) block.element.parentElement?.removeChild(block.element);
                        info.parentArray.splice(info.index, 1);
    
                    } else if (newColumnCount === 1) {
                        const survivingBlocks = block.children[0].children;
                        info.parentArray.splice(info.index, 1, ...survivingBlocks);
                        
                        if (block.element) {
                            const survivingBlockElements = survivingBlocks.map(b => b.render());
                            block.element.replaceWith(...survivingBlockElements);
                        }
    
                    } else if (columnsWereRemoved) {
                        const numCols = block.children.length;
                        block.children.forEach(col => {
                           col.properties.width = 1 / numCols;
                           if(col.element) {
                               col.element.style.width = `${col.properties.width * 100}%`;
                           }
                        });
                        
                        // --- 核心修改：不再发送事件，而是记录ID ---
                        // Case C: ColumnsBlock 的内部结构改变，它自己被修改。
                        modifiedContainerIds.add(block.id);
                    }
                }
            }
        };
    
        traverseAndClean(this.blocks, null);
    
        // 返回 structuralChange 用于决定是否全量渲染，以及 modifiedContainerIds 用于精确更新
        return { structuralChange, modifiedContainerIds };
    }

    /**
     * Cleans up all visual drag indicators from the editor.
     * @param {boolean} [keepContainerIndicators=false] - If true, will not remove .is-drop-target classes.
     */
    _cleanupDragIndicators(keepContainerIndicators = false) {
        this.container.querySelectorAll('.drop-indicator, .drop-indicator-vertical, .quadrant-overlay').forEach(el => el.remove());

        if (!keepContainerIndicators) {
            // 移除所有相关的类
            this.container.querySelectorAll('.is-drop-target, .is-drag-active, .is-drop-target-solid').forEach(el => {
                el.classList.remove('is-drop-target', 'is-drag-active', 'is-drop-target-solid');
            });

            // 移除 hover 的 + 号
            this.container.querySelectorAll('.show-add-area').forEach(el => el.classList.remove('show-add-area'));
            this.hoveredChildrenContainer = null;
        }
    }

    _showQuadrantOverlay(targetEl, event) {
        // First, ensure no old indicators or overlays exist
        this._cleanupDragIndicators();

        const overlay = document.createElement('div');
        overlay.className = 'quadrant-overlay';

        // Create the visual elements for the quadrant lines and backgrounds
        overlay.innerHTML = `
            <div class="quadrant-bg" data-quadrant="top"></div>
            <div class="quadrant-bg" data-quadrant="bottom"></div>
            <div class="quadrant-bg" data-quadrant="left"></div>
            <div class="quadrant-bg" data-quadrant="right"></div>
            <div class="quadrant-line-h"></div>
            <div class="quadrant-line-v"></div>
        `;

        targetEl.appendChild(overlay);

        // --- Highlight the active quadrant based on mouse position ---
        const rect = targetEl.getBoundingClientRect();
        const yMidpoint = rect.top + rect.height / 2;
        const xZone = rect.width * 0.15;

        // Find and remove any existing 'active' class
        const activeBg = overlay.querySelector('.quadrant-bg.active');
        if (activeBg) activeBg.classList.remove('active');

        // Determine and set the new active quadrant
        let activeQuadrant = null;
        if (event.clientX < rect.left + xZone) {
            activeQuadrant = 'left';
        } else if (event.clientX > rect.right - xZone) {
            activeQuadrant = 'right';
        } else if (event.clientY < yMidpoint) {
            activeQuadrant = 'top';
        } else {
            activeQuadrant = 'bottom';
        }
        
        const newActiveBg = overlay.querySelector(`.quadrant-bg[data-quadrant="${activeQuadrant}"]`);
        if (newActiveBg) {
            newActiveBg.classList.add('active');
        }
    }

    _showHorizontalIndicator(targetEl, position: BlockRelPos) {
        this.container.querySelectorAll('.drop-indicator').forEach(el => el.remove());

        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        
        // --- THE FIX ---
        // Instead of setting left/width, we make it a block element and let it
        // be positioned relative to its new parent in the DOM.
        indicator.style.width = '100%'; // It should span the full width of its container context.
        indicator.style.position = 'relative'; // Ensure it flows within the document layout.
        
        if (position === BlockRelPos.Before) {
             targetEl.parentElement.insertBefore(indicator, targetEl);
        } else if (position === BlockRelPos.After) {
            // insertAfter logic
            targetEl.parentElement.insertBefore(indicator, targetEl.nextSibling);
        } else if (position === BlockRelPos.InsideLast) {
            const contentWrapper = targetEl.querySelector('.callout-content-wrapper, .block-content[data-type="column"]');
            if (contentWrapper) {
                indicator.style.width = 'auto'; // Let it fit inside the container
                indicator.style.margin = '0 4px'; // Add some margin
                contentWrapper.appendChild(indicator);
            }
        }
    }

    _showVerticalIndicator(targetEl, position: BlockRelPos) {
        this.container.querySelectorAll('.drop-indicator-vertical').forEach(el => el.remove());

        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator-vertical';
        indicator.style.height = `${targetEl.offsetHeight}px`;
        if (position === BlockRelPos.Left) {
            indicator.style.left = '0';
        } else { // BlockRelPos.Right
            indicator.style.right = '0';
        }
        targetEl.appendChild(indicator);
    }


    _handleReferenceItemDrop(event, refData) {
        if (!this.currentDropInfo) return;
        const { targetId, position } = this.currentDropInfo;
        const targetBlockInfo = this._findBlockInstanceAndParent(targetId);
        if (!targetBlockInfo) return;

        const popoverAnchor = document.createElement('div');
        popoverAnchor.style.position = 'fixed';
        popoverAnchor.style.top = `${event.clientY}px`;
        popoverAnchor.style.left = `${event.clientX}px`;
        popoverAnchor.style.width = '1px';
        popoverAnchor.style.height = '1px';
        this.container.appendChild(popoverAnchor);

        this.popoverManager.showReferenceDrop(
            popoverAnchor,
            (action) => {
                this._executeReferenceDropAction(action, refData, targetBlockInfo, position);
            }
        );

        // --- The global mousedown listener in main.js will call hidePopover.
        // We just need to ensure hidePopover knows about our anchor. ---
        const originalHidePopover = window.hidePopover;
        window.hidePopover = () => {
            originalHidePopover(popoverAnchor); // Pass the anchor to be cleaned
            window.hidePopover = originalHidePopover; // Restore the original function
        };

        // If popover is closed by any means (e.g. Esc key in future), ensure cleanup
        const cleanup = () => {
            window.hidePopover = originalHidePopover; // Restore in case it wasn't closed by click
            if (popoverAnchor.parentElement) {
                popoverAnchor.parentElement.removeChild(popoverAnchor);
            }
        }
        window.addEventListener('popoverClosed', cleanup, { once: true });
    }

    _executeReferenceDropAction(action, refData, targetBlockInfo, position: BlockRelPos) {
        let newBlockInstance;
        const relativeFilePath = file.makePathRelativeToWorkspace(refData.filePath);

        switch (action) {
            case 'createQuote':
                newBlockInstance = this.createBlockInstance({
                    type: 'quote',
                    properties: {
                        referenceLink: `${relativeFilePath}#${refData.blockData.id}`
                    }
                });
                break;

            case 'createCopy':
                // Deep copy the block data, but generate a new ID for the top-level block and all its children
                const deepCopyAndNewIds = (blockData) => {
                    const newBlock = JSON.parse(JSON.stringify(blockData)); // Simple deep copy
                    newBlock.id = this._generateUUID(); // Assign new ID
                    if (newBlock.children && newBlock.children.length > 0) {
                        newBlock.children.forEach(child => deepCopyAndNewIds(child));
                    }
                    return newBlock;
                };
                const copiedBlockData = deepCopyAndNewIds(refData.blockData);
                newBlockInstance = this.createBlockInstance(copiedBlockData);
                break;

            case 'createLink':
                newBlockInstance = this.createBlockInstance({
                    type: 'paragraph',
                    content: `<a href="${relativeFilePath}#${refData.blockData.id}">Link To Block</a>`
                });
                break;
            
            default:
                return; // Do nothing if action is unknown
        }

        if (!newBlockInstance) return;

        // --- Now, insert the newly created block at the correct position ---
        this._insertBlockAtPosition(newBlockInstance, targetBlockInfo, position);
        this.emitChange(true, `ref-drop-${action}`);
    }

    // --- A helper function to insert a block instance based on drop info ---
    _insertBlockAtPosition(blockToInsert: Block, targetInfo, position: BlockRelPos) {
        const { block: targetBlockInstance, parentArray: toParentArray, index: toIndex, parentInstance: toParentInstance } = targetInfo;
        
        const parentDomElement = targetBlockInstance.element.parentElement;
        
        if (!parentDomElement) {
            console.error("Cannot insert block: target element has no parent DOM node.");
            return;
        }
        
        const newEl = blockToInsert.render();

        switch (position) {
            case BlockRelPos.Before:
                toParentArray.splice(toIndex, 0, blockToInsert);
                // 使用正确的父节点
                parentDomElement.insertBefore(newEl, targetBlockInstance.element);
                break;
            case BlockRelPos.After:
                toParentArray.splice(toIndex + 1, 0, blockToInsert);
                // 使用正确的父节点
                parentDomElement.insertBefore(newEl, targetBlockInstance.element.nextSibling);
                break;
            case BlockRelPos.InsideLast:
                if (targetBlockInstance.childrenContainer) {
                    targetBlockInstance.children.push(blockToInsert);
                    targetBlockInstance.childrenContainer.appendChild(newEl);
                } else {
                    // Fallback: 理论上 _onDragOver 不会让这种情况发生，但为了健壮性，
                    // 如果被误判为容器但实际上没容器，则回退到 'after' 行为
                    toParentArray.splice(toIndex + 1, 0, blockToInsert);
                    parentDomElement.insertBefore(newEl, targetBlockInstance.element.nextSibling);
                }
                break;
            case BlockRelPos.Left:
            case BlockRelPos.Right:
                this._handleColumnDrop([blockToInsert], targetBlockInstance, position);
                this.render(); // render() 会处理好 DOM 结构，所以是安全的
                break;
        }

        if (newEl) {
            this.PageSelectionManager.setSelect(blockToInsert.id);
        }
    }
    
    // --- Block Toolbar Handlers ---
    _onBlockMouseOver(e) {
        // --- Part 1: Block Toolbar Logic ---
        const targetEl = e.target.closest('.block-container');
        if (targetEl && targetEl !== this.activeToolbarBlock?.element) {
            clearTimeout(this.toolbarHideTimeout);
            const blockInstance = this._findBlockInstanceById(this.blocks, targetEl.dataset['id'])?.block;
            if (blockInstance) {
                this._showBlockToolbar(blockInstance);
            }
        }

        // --- Part 2: Container Add Area Logic ---
        // 逻辑：鼠标悬浮进入带有容器区的块 -> 容器区显示+号
        // 利用 closest 找到当前悬浮的块。如果它是容器，就激活它的添加区。
        // 由于 DOM 事件冒泡，如果我们悬浮在子块上，e.target.closest 会先找到子块。
        // 为了实现“套娃显示”，需要向上遍历所有父容器并激活它们。

        // 1. 收集当前鼠标下的所有祖先容器 ID
        const activeContainerIds = new Set<string>();
        let curr = e.target;
        while (curr && curr !== this.elements.editorAreaContainer) {
            if (curr.classList.contains('block-children-container') ||
                (curr.dataset && curr.dataset['id'] && this._findBlockInstanceById(this.blocks, curr.dataset['id'])?.block?.childrenContainer)) {

                // 这是一个容器相关的元素，记录下来
                // 注意：如果 curr 是 childrenContainer 本身，我们需要找它的 Block 实例
                // 如果 curr 是 Block 元素，直接找实例
                let blockId = curr.dataset['id'];
                if (!blockId && curr.parentElement) blockId = curr.parentElement.closest('[data-id]')?.dataset['id'];

                if (blockId) activeContainerIds.add(blockId);
            }
            curr = curr.parentElement;
        }

        // 2. 清理：移除所有不在 activeContainerIds 里的 .show-add-area
        this.container.querySelectorAll('.show-add-area').forEach(el => {
            // 找到这个容器所属的 blockId
            const parentBlock = el.closest('[data-id]');
            if (parentBlock && !activeContainerIds.has((parentBlock as HTMLElement).dataset['id'])) {
                el.classList.remove('show-add-area');
            }
        });

        // 3. 添加：给当前路径上的容器添加 .show-add-area
        activeContainerIds.forEach(id => {
            const blockInstance = this._findBlockInstanceById(this.blocks, id)?.block;
            if (blockInstance && blockInstance.childrenContainer) {
                blockInstance.childrenContainer.classList.add('show-add-area');
            }
        });
    }

    _onBlockMouseOut(e) {
        // --- Part 1: Block Toolbar Logic (existing) ---
        clearTimeout(this.toolbarHideTimeout);
        this.toolbarHideTimeout = setTimeout(() => {
            if (!this.elements.blockToolbar.matches(':hover') && 
                !this.elements.blockToolbarGraceArea.matches(':hover') && 
                !this.container.querySelector('.block-container:hover')) {
                this._hideBlockToolbar();
            }
        }, 300);
    }

    _showBlockToolbar(blockInstance: Block) {
        if (this.activeToolbarBlock) {
            (this.activeToolbarBlock.element as HTMLElement).classList.remove('toolbar-active');
        }

        this.activeToolbarBlock = blockInstance;
        const blockEl = blockInstance.element as HTMLElement;
        blockEl.classList.add('toolbar-active');

        this._populateToolbar(blockInstance);

        requestAnimationFrame(() => {
            const blockRect = blockEl.getBoundingClientRect();
            const editorRect = this.container.getBoundingClientRect();
            const toolbarHeight = this.elements.blockToolbar.offsetHeight;
            const toolbarWidth = this.elements.blockToolbar.offsetWidth;
            
            let top = blockRect.top - toolbarHeight - 5;
            let isToolbarAbove = true;
            if (top < editorRect.top) {
                top = blockRect.bottom + 5;
                isToolbarAbove = false;
            }
            let left = blockRect.left + (blockRect.width / 2) - (toolbarWidth / 2);
            if (left < editorRect.left) left = editorRect.left;
            if (left + toolbarWidth > editorRect.right) left = editorRect.right - toolbarWidth;
            
            this.elements.blockToolbar.style.top = `${top}px`;
            this.elements.blockToolbar.style.left = `${left}px`;
            this.elements.blockToolbar.style.display = 'flex';

            // --- NEW: Calculate and display the grace area ---
            const graceArea = this.elements.blockToolbarGraceArea;
            graceArea.style.left = `${left}px`;
            graceArea.style.width = `${toolbarWidth}px`;
            
            if (isToolbarAbove) {
                // Grace area is between toolbar and block
                graceArea.style.top = `${top + toolbarHeight}px`;
                graceArea.style.height = `${blockRect.top - (top + toolbarHeight)}px`;
            } else {
                // Grace area is between block and toolbar
                graceArea.style.top = `${blockRect.bottom}px`;
                graceArea.style.height = `${top - blockRect.bottom}px`;
            }
            graceArea.style.display = 'block';
        });
    }

    _hideBlockToolbar() {
        this.elements.blockToolbar.style.display = 'none';
        // NEW: Hide the grace area along with the toolbar
        this.elements.blockToolbarGraceArea.style.display = 'none';

        if (this.activeToolbarBlock) {
            this.activeToolbarBlock.element.classList.remove('toolbar-active');
        }
        this.activeToolbarBlock = null;
    }

    _populateToolbar(blockInstance: Block) {
        this.elements.blockToolbar.innerHTML = '';
        const buttons = blockInstance.toolbarButtons;

        buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.className = 'toolbar-button';
            
            // A more robust way to handle this
            if (btnInfo.html) {
                // Create a temporary element to parse the HTML string
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = btnInfo.html;
                // Append all parsed child nodes to the button
                while (tempDiv.firstChild) {
                    button.appendChild(tempDiv.firstChild);
                }
            } else {
                button.textContent = btnInfo.icon; // Use textContent for icons to be safe
            }
            
            button.title = btnInfo.title;
            button.dataset['action'] = btnInfo.action;
            if (btnInfo.arg) {
                button.dataset['arg'] = btnInfo.arg;
            }
            button.addEventListener('mousedown', e => {
                e.preventDefault();
                this._handleToolbarClick(e, blockInstance);
            });
            this.elements.blockToolbar.appendChild(button);
        });
    }

    _handleToolbarClick(e, blockInstance: Block) {
        const button = e.currentTarget;
        const action = button.dataset['action'];
        const arg = button.dataset['arg'];

        const forceRestoreAndExecute = (cmd, value = null) => {
            if (!this.richTextEditingState.isActive) return;
            const { blockId, savedRange } = this.richTextEditingState;
            const targetBlock = this._findBlockInstanceById(this.blocks, blockId)?.block;
            if (!targetBlock || !savedRange) {
                this.richTextEditingState.isActive = false;
                return;
            }
            if (targetBlock instanceof TextBlock) {
                targetBlock.textElement.focus();
            }
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedRange);
            document.execCommand(cmd, false, value);
            if (targetBlock instanceof TextBlock) {
                targetBlock.syncContentFromDOM();
            }
            this.emitChange(true, 'format-text');
            this.richTextEditingState.isActive = false;
        };

        switch (action) {
            case 'format': // e.g. bold, italic, underline
                if (this.currentSelection) {
                    (blockInstance as TextBlock).textElement.focus();
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(this.currentSelection);
                    document.execCommand(arg, false, null);
                    if (blockInstance instanceof TextBlock) {
                        blockInstance.syncContentFromDOM();
                    }
                    this.emitChange(true, 'format-text');
                }
                break;
            
            case 'colorPicker':
                this.richTextEditingState = { isActive: true, blockId: blockInstance.id, savedRange: this.currentSelection };
                this.popoverManager.showColorPicker(
                    button,
                    (color) => {
                        document.execCommand('styleWithCSS', false, 'true');
                        forceRestoreAndExecute('foreColor', color);
                        document.execCommand('styleWithCSS', false, 'false');
                    }
                );
                break;

            case 'link':
                this.richTextEditingState = { isActive: true, blockId: blockInstance.id, savedRange: this.currentSelection };
                this.popoverManager.showLink(
                    button,
                    /*this.currentSelection?.commonAncestorContainer.parentNode.href || */'',
                    (value) => {
                        forceRestoreAndExecute(value ? 'createLink' : 'unlink', value || undefined);
                    }
                );
                break;

            case 'showDetails':
                this._showBlockDetails(blockInstance);
                this._hideBlockToolbar(); // Hide toolbar after clicking
                break;

            // Actions for specific blocks (e.g., Image, LinkButton)
            default:
                if (typeof blockInstance.handleToolbarAction === 'function') {
                    blockInstance.handleToolbarAction(action, button);
                }
                break;
        }
    }

    /**
     * Selects a block, ensures the right sidebar is open, and switches to the details view.
     * @param {Block} blockInstance The block instance to show details for.
     */
    _showBlockDetails(blockInstance: Block) {
        if (!blockInstance) return;
        
        // 1. Select the current block
        this.PageSelectionManager.setSelect(blockInstance.id);
        
        // 2. Expand the right sidebar if collapsed
        const appContainer = this.container.closest('.app-container');
        if (appContainer && appContainer.classList.contains('right-sidebar-collapsed')) {
            this.setRightSidebarCollapsed(false);
        }
        
        // 3. Switch to the details panel
        this.switchRightSidebarView('details');
    }

    // --- ========================================================== ---
    // --- 5. UI Logic
    // --- ========================================================== ---

    // --- Mode Switching & Toolbar State ---
    /**
     * Switches the editor between 'edit' and 'preview' modes.
     * It handles rendering the preview HTML, swapping view visibility,
     * and synchronizing the scroll position between the two views.
     *
     * @param {string} mode - The target mode, either 'edit' or 'preview'.
     * @param {boolean} [forceRefresh=false] - If true, it will re-render the view even if the mode is already active.
     */
    async switchMode(mode: EditorMode, forceRefresh = false) {
        if (!this.isReady) return;
        const wasInPreviewMode = this.mode === EditorMode.preview;
        if (this.mode === mode && !forceRefresh) return;
    
        let topBlockId = null;
        const editScrollContainer = this.elements.editBackgroundContainer;
        const previewScrollContainer = this.elements.previewBackgroundContainer;
    
        if (this.mode === EditorMode.edit) {
            topBlockId = this._getTopVisibleBlockId(editScrollContainer);
        } else {
            topBlockId = this._getTopVisibleBlockId(previewScrollContainer);
        }
        
        this.mode = mode;
    
        if (mode === EditorMode.edit) {
            editScrollContainer.style.display = 'flex';
            previewScrollContainer.style.display = 'none';
            requestAnimationFrame(() => { this._scrollToBlock(editScrollContainer, topBlockId); });
        } else { // preview
            // 因为现在支持原生异步渲染，不需要传预载 Cache 了
            this.elements.previewView.innerHTML = await this.getSanitizedHtml(false, { options: {} });
            
            editScrollContainer.style.display = 'none';
            previewScrollContainer.style.display = 'flex'; 
            
            this._scrollToBlock(previewScrollContainer, topBlockId);
        }
        
        this.updateToolbarState();
    }

    /**
     * Finds the ID of the first block element that is visible at the top of a given scrollable container.
     * @param {HTMLElement} container The scrollable container (e.g., editor-view).
     * @returns {string|null} The ID of the top-most visible block, or null if none are found.
     * @private
     */
    _getTopVisibleBlockId(container) {
        // This logic is copied directly from the old main.js. No changes needed.
        const containerRect = container.getBoundingClientRect();
        const blockElements = container.querySelectorAll('.block-container');
    
        for (const blockEl of blockElements) {
            const blockRect = blockEl.getBoundingClientRect();
            if (blockRect.top >= containerRect.top && blockRect.top < containerRect.bottom) {
                return blockEl.dataset['id'];
            }
        }
        for (const blockEl of blockElements) {
            const blockRect = blockEl.getBoundingClientRect();
            if (blockRect.bottom > containerRect.top && blockRect.top < containerRect.bottom) {
                return blockEl.dataset['id'];
            }
        }
        return null;
    }
    
    /**
     * Scrolls a container so that a block with a specific ID is at the top of the viewport.
     * @param {HTMLElement} container The scrollable container.
     * @param {string} blockId The ID of the block to scroll to.
     * @private
     */
    _scrollToBlock(container, blockId: string) {
        // This logic is copied directly from the old main.js. No changes needed.
        if (!blockId) return;
        const targetElement = container.querySelector(`.block-container[data-id="${blockId}"]`);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
    }

    /**
     * Updates the state of the floating toolbar based on the current editor's properties.
     * This includes enabling/disabling the save button and setting the correct
     * visual state for the edit/preview mode toggle.
     * This method is called when the tab is focused (`onFocus`) or when its state changes (e.g., after saving).
     */
    updateToolbarState() {
        // Find the active tab data from the TabManager.
        const activeTab = this.tabManager.tabs.get(this.filePath);

        if (activeTab) {
            // --- Save Button State ---
            // The `isUnsaved` state is managed by the TabManager.
            this.elements.saveBtn.classList.toggle('unsaved', activeTab.isUnsaved);

            // --- Mode Toggle State ---
            // The `mode` state is managed by this PageEditor instance.
            this.elements.modeToggle.classList.toggle('edit-active', this.mode === EditorMode.edit);
            this.elements.modeToggle.classList.toggle('preview-active', this.mode === EditorMode.preview);
        } else {
            // Fallback for when there is no active tab (should rarely happen when an editor is active).
            // This logic is inherited from the old main.js for robustness.
            this.elements.saveBtn.classList.remove('unsaved');
            this.elements.modeToggle.classList.add('edit-active');
            this.elements.modeToggle.classList.remove('preview-active');
        }
    }

    // --- Popover Integration ---
    /**
     * Updates the content of a search results container within a popover.
     * @param {string} query - The search term entered by the user.
     * @param {HTMLElement} container - The DOM element to fill with search results.
     */
    updateSearchResults(query, container) {
        if (!container) return;
        // 直接调用全局函数获取最新的页面列表
        const allPages = window.getAllPageFiles ? window.getAllPageFiles() : [];

        container.innerHTML = allPages
            .filter(note => note.name.toLowerCase().includes(query.toLowerCase()))
            .map(note => `<div class="search-result-item" data-path="${note.path}" title="${note.path}">📄 ${note.name.replace('.veritnote', '')}</div>`)
            .join('');
    }

    // --- Right Sidebar Logic ---
    /**
     * Initializes all logic related to the right sidebar, including view switching,
     * resizing, collapsing, and peek-on-hover behaviors. This method acts as a
     * central setup point for the right sidebar UI.
     * @private
     */
    _initRightSidebarLogic() {
        // --- 1. View (Tab) Switching ---
        this.elements.rightSidebarViewToggle.addEventListener('click', (e) => {
            const option = (e.target as HTMLElement).closest('.rs-view-option') as HTMLElement;
            if (option) {
                this.switchRightSidebarView(option.dataset['view']);
            }
        });

        // Add a drag listener to the "References" tab to auto-switch to it
        // when a block is dragged over it.
        const referencesOption = this.elements.rightSidebarViewToggle.querySelector('.rs-view-option[data-view="references"]');
        if (referencesOption) {
            referencesOption.addEventListener('dragenter', (e) => {
                if (document.body.classList.contains('is-dragging-block')) {
                    this.switchRightSidebarView('references');
                }
            });
        }
        
        // --- 2. Collapse & Expand ---
        this.elements.rightSidebarToggleBtn.addEventListener('click', () => {
            const appContainer = this.container.closest('.app-container');
            if (appContainer) {
                appContainer.classList.remove('right-sidebar-peek');
                this.setRightSidebarCollapsed(!appContainer.classList.contains('right-sidebar-collapsed'));
            }
        });

        // --- 3. Resizing ---
        this.elements.rightSidebarResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = this.elements.rightSidebar.offsetWidth;
            
            const onMouseMove = (moveEvent) => {
                this._applyRightSidebarWidth(startWidth + (startX - moveEvent.clientX));
            };

            const onMouseUp = () => {
                window.localStorage.setItem('veritnote_right_sidebar_width', this.elements.rightSidebar.style.width);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Restore saved width on init
        const savedRightWidth = window.localStorage.getItem('veritnote_right_sidebar_width');
        if (savedRightWidth) {
            this.elements.rightSidebar.style.width = savedRightWidth;
        }

        // --- 4. Peek Behavior ---
        // Note: The peek trigger element is in main.html, but the logic is controlled here.
        const rightSidebarPeekTrigger = document.getElementById('right-sidebar-peek-trigger');
        const appContainer = this.container.closest('.app-container');

        if (rightSidebarPeekTrigger && appContainer) {
            rightSidebarPeekTrigger.addEventListener('mouseenter', () => {
                if (appContainer.classList.contains('right-sidebar-collapsed')) {
                    appContainer.classList.add('right-sidebar-peek');
                }
            });

            this.elements.rightSidebar.addEventListener('mouseleave', () => {
                if (appContainer.classList.contains('right-sidebar-peek')) {
                    appContainer.classList.remove('right-sidebar-peek');
                }
            });
            
            // Peek on drag-enter as well
            rightSidebarPeekTrigger.addEventListener('dragenter', () => {
                 if (appContainer.classList.contains('right-sidebar-collapsed')) {
                    appContainer.classList.add('right-sidebar-peek');
                }
            });
        }
    }

    /**
     * Applies a new width to the right sidebar, respecting its min and max width constraints.
     * @param {number} width - The target width in pixels.
     * @private
     */
    _applyRightSidebarWidth(width) {
        const min = parseFloat(getComputedStyle(this.elements.rightSidebar).minWidth);
        const max = parseFloat(getComputedStyle(this.elements.rightSidebar).maxWidth);
        this.elements.rightSidebar.style.width = `${Math.max(min, Math.min(width, max))}px`;
    }

    /**
     * Sets the collapsed or expanded state of the right sidebar.
     * It manipulates classes on the main app container and updates the button's appearance.
     * @param {boolean} collapsed - True to collapse the sidebar, false to expand it.
     */
    setRightSidebarCollapsed(collapsed) {
        // This logic requires access to the .app-container, which is outside this editor's direct scope.
        // We find it by traversing up from the editor's container.
        const appContainer = this.container.closest('.app-container');
        if (!appContainer) return;

        const buttonText = this.elements.rightSidebarToggleBtn.querySelector('span');
        const buttonSvg = this.elements.rightSidebarToggleBtn.querySelector('svg');
        
        if (collapsed) {
            appContainer.classList.add('right-sidebar-collapsed');
            window.localStorage.setItem('veritnote_right_sidebar_collapsed', 'true');
            if (buttonText) buttonText.textContent = 'Expand';
            this.elements.rightSidebarToggleBtn.title = 'Expand right sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><polyline points="14 16 9 12 14 8"></polyline>`;
        } else {
            appContainer.classList.remove('right-sidebar-collapsed');
            appContainer.classList.remove('right-sidebar-peek'); // Always remove peek on expand
            window.localStorage.setItem('veritnote_right_sidebar_collapsed', 'false');
            this.elements.rightSidebar.style.width = window.localStorage.getItem('veritnote_right_sidebar_width') || '280px';
            if (buttonText) buttonText.textContent = 'Collapse';
            this.elements.rightSidebarToggleBtn.title = 'Collapse right sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>`;
        }
    }

    /**
     * Switches the active view in the right sidebar between 'references' and 'details'.
     * @param {string} viewName - The name of the view to activate ('references' or 'details').
     */
    switchRightSidebarView(viewName) {
        const views = {
            'references': this.elements.referencesView,
            'details': this.elements.detailsView
        };
        const slider = this.elements.rightSidebarViewToggle.querySelector('.rs-view-slider') as HTMLElement;
        const optionToActivate = this.elements.rightSidebarViewToggle.querySelector(`.rs-view-option[data-view="${viewName}"]`) as HTMLElement;
    
        if (!optionToActivate) return;
    
        if (slider) {
            slider.style.left = `${optionToActivate.offsetLeft}px`;
        }
    
        (this.elements.rightSidebarViewToggle.querySelectorAll('.rs-view-option') as NodeListOf<HTMLElement>).forEach(opt => {
            opt.classList.toggle('active', opt.dataset['view'] === viewName);
        });
    
        Object.keys(views).forEach(key => {
            const view = views[key as keyof typeof views];
            if (view) view.classList.remove('active');
        });
        if (views[viewName as keyof typeof views]) {
            (views[viewName as keyof typeof views] as HTMLElement).classList.add('active');
        }
    }

    /**
    * Updates the right sidebar's "Details" panel based on the currently selected blocks.
    */
    updateDetailsPanel() {
        const editor = this.PageSelectionManager.editor;
        if (!editor || !this.elements.detailsView) return;

        const selectedIds = this.PageSelectionManager.getSelected();
    
        // Clear previous content
        this.elements.detailsView.innerHTML = '';

        if (selectedIds.length === 0) {
            this.elements.detailsView.innerHTML = `<div class="empty-details-placeholder">Select a block to see its details.</div>`;
            return;
        }

        let contentHtml = '';
        selectedIds.forEach(id => {
            const blockInfo = editor._findBlockInstanceById(editor.blocks, id);
            if (blockInfo && blockInfo.block) {
                // Call the new method on the block instance to get its details HTML
                contentHtml += blockInfo.block.renderDetailsPanel();
            }
        });
        this.elements.detailsView.innerHTML = contentHtml;

        // After inserting HTML, we must allow the block instances to attach their event listeners
        selectedIds.forEach(id => {
            const blockInfo = editor._findBlockInstanceById(editor.blocks, id);
            if (blockInfo && blockInfo.block) {
                // Find the specific section for this block within the panel
                const blockSection = this.elements.detailsView.querySelector(`.details-panel-section[data-block-id="${id}"]`) as HTMLElement;
                if (blockSection && typeof blockInfo.block.onDetailsPanelOpen === 'function') {
                    blockInfo.block.onDetailsPanelOpen(blockSection);
                }
            }
        });
    }

    // --- Floating Toolbar Logic ---
    /**
     * Initializes the logic for the floating toolbar, including collapse/expand
     * and peek-on-hover behaviors.
     * @private
     */
    _initToolbarCollapse() {
        // --- 1. Collapse/Expand on Button Click ---
        this.elements.toggleToolbarBtn.addEventListener('click', () => {
            // We need to find the `#main-content` element, which is part of the parent Main component.
            const mainContentEl = this.container.closest('#main-content');
            if (mainContentEl) {
                this.setToolbarCollapsed(!mainContentEl.classList.contains('toolbar-collapsed'));
            }
        });

        // --- 2. Peek on Hover ---
        // This logic is self-contained within the editor's elements.
        this.elements.toolbarPeekTrigger.addEventListener('mouseenter', () => {
            const mainContentEl = this.container.closest('#main-content');
            if (mainContentEl && mainContentEl.classList.contains('toolbar-collapsed')) {
                mainContentEl.classList.add('toolbar-peek');

                // The floating toolbar itself is inside the editor, so we use `this.elements`
                this.elements.floatingToolbar.addEventListener('mouseleave', () => {
                    mainContentEl.classList.remove('toolbar-peek');
                }, { once: true }); // Use { once: true } for automatic cleanup
            }
        });
    }

    /**
     * Sets the collapsed or expanded state of the floating toolbar.
     * It manipulates classes on the `#main-content` element (part of the Main component)
     * and updates the button's appearance.
     * @param {boolean} collapsed - True to collapse the toolbar, false to expand it.
     */
    setToolbarCollapsed(collapsed: boolean) {
        // Like the sidebar, this needs to modify a class on a parent element.
        const mainContentEl = this.container.closest('#main-content');
        if (!mainContentEl) return;

        if (collapsed) {
            mainContentEl.classList.add('toolbar-collapsed');
            window.localStorage.setItem('veritnote_toolbar_collapsed', 'true');
            this.elements.toggleToolbarBtn.title = 'Expand Toolbar';
        } else {
            mainContentEl.classList.remove('toolbar-collapsed');
            window.localStorage.setItem('veritnote_toolbar_collapsed', 'false');
            this.elements.toggleToolbarBtn.title = 'Collapse Toolbar';
            // Also remove peek class on expand
            if (mainContentEl.classList.contains('toolbar-peek')) {
                mainContentEl.classList.remove('toolbar-peek');
            }
        }
    }
    
    // --- ========================================================== ---
    // --- 6. Helper & Utility Methods
    // --- ========================================================== ---
    _findBlockInstanceById(blocks: Block[], id: string, parentBlock: Block | null = null): { block: Block, parent: Block[], index: number, parentBlock: Block | null } | null {
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            if (block.id === id) {
                return { block, parent: parentBlock ? parentBlock.children : this.blocks, index: i, parentBlock };
            }
            if (block.children && block.children.length > 0) {
                const found = this._findBlockInstanceById(block.children, id, block);
                if (found) return found;
            }
        }
        return null;
    }

    _findBlockToFocusAfterTextBlockDeleted(id: string) {
        const info = this._findBlockInstanceAndParent(id);
        let blockToFocus = null;
        if (info) {
            // 尝试找到前一个兄弟节点，如果找不到，就找父节点
            blockToFocus = info.parentArray[info.index - 1] || info.parentInstance;
        }
        return blockToFocus;
    };

    _findBlockInstanceAndParent(id: string, rootBlocks = this.blocks, parent: Block | null = null): { block: Block, parentInstance: Block | null, parentArray: Block[], index: number } | null {
        for (let i = 0; i < rootBlocks.length; i++) {
            const block = rootBlocks[i];
            if (block.id === id) {
                // If parent is null, the parent is the root `this.blocks` array itself.
                const parentArray = parent ? parent.children : this.blocks;
                return { block, parentInstance: parent, parentArray, index: i };
            }
            if (block.children.length > 0) {
                const found = this._findBlockInstanceAndParent(id, block.children, block);
                if (found) return found;
            }
        }
        return null;
    };

    _generateUUID() {
        return (String([1e7]) + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            ((c as any) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> (c as any) / 4).toString(16)
        );
    }
    
    // --- Export Logic (To be refactored in the next phase) ---
    /**
     * Generates a clean, sanitized HTML string representation of the editor's content.
     * This is the primary method for both preview mode and the final export process.
     *
     * The process involves:
     * 1. Creating a clean, in-memory DOM from the current block data.
     * 2. Performing universal cleanup (removing editor-only UI).
     * 3. Universally processing all links to make them relative for export.
     * 4. Delegating to each individual Block instance to perform its own specific export modifications.
     * 5. For exports, it also collects and injects block-specific JavaScript for interactivity.
     *
     * @param {boolean} [isForExport=false] - If true, applies export-specific transformations.
     * @param {object} [exportContext={}] - An object containing data needed for the export process.
     * @param {object} [exportContext.options={}] - Export options (e.g., disableDrag).
     * @param {string} [exportContext.pathPrefix='./'] - The relative path prefix for assets.
     * @returns {Promise<string>} A promise that resolves to the final HTML string.
     */
    async getSanitizedHtml(isForExport = false, exportContext:any = {}) {
        const {
            options = {},
            pathPrefix = './'
        } = exportContext;

        // --- Step 1: 等待所有 Block 异步渲染完成 ---
        const gatherPromises = (blocks: Block[]): Promise<any>[] => {
            let promises: Promise<any>[] = [];
            blocks.forEach(b => {
                promises.push(b.exportReadyPromise);
                if (b.children && b.children.length > 0) {
                    promises.push(...gatherPromises(b.children));
                }
            });
            return promises;
        };
        await Promise.all(gatherPromises(this.blocks));

        // --- Step 2: 浅拷贝容器 ---
        const renderedContainer = this.elements.editorAreaContainer.cloneNode(true) as HTMLElement;

        // --- Step 3: 收集排除选择器并执行 Universal Cleanup ---
        let allExclusions = new Set();
        if (isForExport) {
            const collectExclusions = (blocks: Block[]) => {
                blocks.forEach(b => {
                    if ((b.constructor as typeof Block).exportExclusionSelectors) {
                        (b.constructor as typeof Block).exportExclusionSelectors.forEach(sel => allExclusions.add(sel));
                    }
                    if (b.children) collectExclusions(b.children);
                });
            };
            collectExclusions(this.blocks);
        } else {
            const collectExclusions = (blocks: Block[]) => {
                blocks.forEach(b => {
                    if ((b.constructor as typeof Block).previewExclusionSelectors) {
                        (b.constructor as typeof Block).previewExclusionSelectors.forEach(sel => allExclusions.add(sel));
                    }
                    if (b.children) collectExclusions(b.children);
                });
            };
            collectExclusions(this.blocks);
        }

        // 特殊的通用处理
        allExclusions.add('[contentEditable="true"]');
        allExclusions.add('.toolbar-active');
        allExclusions.add('.vn-active');
        allExclusions.add('.is-highlighted');
        allExclusions.add('.column-resizer');

        // 执行删除
        const exclusionSelectorString = Array.from(allExclusions).join(', ');
        if (exclusionSelectorString) {
            renderedContainer.querySelectorAll(exclusionSelectorString).forEach(el => {
                // 如果是 contentEditable，我们只是移除属性而不是删除元素
                if (el.hasAttribute('contentEditable')) {
                    el.removeAttribute('contentEditable');
                    el.removeAttribute('data-placeholder');
                } else if (el.classList.contains('toolbar-active') || el.classList.contains('vn-active') || el.classList.contains('is-highlighted')) {
                    el.classList.remove('toolbar-active', 'vn-active', 'is-highlighted');
                } else {
                    el.remove();
                }
            });
        }

        if (isForExport && options.disableDrag) {
            renderedContainer.querySelectorAll('[draggable="true"]').forEach(el => el.removeAttribute('draggable'));
        }

        // --- Step 4: 统一处理链接与内部跳转 ---
        renderedContainer.querySelectorAll('a').forEach(el => {
            let href = el.getAttribute('href');
            if (!href) return;

            if (href.includes('.veritnote')) {
                if (isForExport) {
                    let [pathPart, hashPart] = href.split('#');
                    hashPart = hashPart ? '#' + hashPart : '';

                    if (pathPart === this.filePath) {
                        el.setAttribute('href', hashPart);
                    } else {
                        const normalizedHref = pathPart.replace(/\\/g, '/');
                        const relativeHtmlPath = normalizedHref.replace('.veritnote', '.html');
                        el.setAttribute('href', pathPrefix + relativeHtmlPath + hashPart);
                    }
                } else {
                    el.setAttribute('href', '#');
                    el.setAttribute('data-internal-link', href);
                    el.classList.add('internal-link');
                }
            }
        });

        let finalHtml = renderedContainer.innerHTML;

        // --- Step 5 (Export Only): 收集 Block Specific Scripts ---
        if (isForExport) {
            const scriptModules = new Set();
            const collectScriptsRecursive = (blocks: Block[]) => {
                if (!blocks) return;
                blocks.forEach(block => {
                    if (typeof block.getExportScripts === 'function') {
                        const script = block.getExportScripts(exportContext);
                        if (script) scriptModules.add(script.trim());
                    }
                    if (block.children && block.children.length > 0) collectScriptsRecursive(block.children);
                });
            };
            collectScriptsRecursive(this.blocks);

            if (scriptModules.size > 0) {
                const finalScript = Array.from(scriptModules).join('\n\n');
                finalHtml += `<script>document.addEventListener('DOMContentLoaded', async () => { \n${finalScript}\n });<\/script>`;
            }

            const highlightScript = `
                function highlightBlockFromHash() {
                    try {
                        document.querySelectorAll('.is-highlighted').forEach(el => el.classList.remove('is-highlighted'));
                        const hash = window.location.hash;
                        if (!hash || hash.length < 2) return;
                        const blockId = decodeURIComponent(hash.substring(1));
                        const targetEl = document.querySelector(\`.block-container[data-id="\${blockId}"]\`);
                        if (targetEl) {
                            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            targetEl.classList.add('is-highlighted');
                            let removeHighlight = () => {
                                targetEl.classList.remove('is-highlighted');
                                document.removeEventListener('click', removeHighlight, true);
                                document.removeEventListener('keydown', removeHighlight, true);
                            };
                            setTimeout(() => {
                                document.addEventListener('click', removeHighlight, { once: true, capture: true });
                                document.addEventListener('keydown', removeHighlight, { once: true, capture: true });
                            }, 100);
                        }
                    } catch(e) { console.error('Failed to highlight block:', e); }
                }
                highlightBlockFromHash();
                window.addEventListener('hashchange', highlightBlockFromHash);
            `;
            finalHtml += `<script>document.addEventListener('DOMContentLoaded', () => { \n${highlightScript}\n });<\/script>`;
        }

        return finalHtml;
    }
    
    /**
     * Helper method to load block data and render it without the full editor initialization.
     * Used by getSanitizedHtml to create a clean DOM representation.
     * @param {Array<object>} blockDataList - The array of block data to render.
     */
    async loadContentForRender(blockDataList) {
        // A temporary editor needs two things before it can render:
        // 1. A DOM element to render into.
        // 2. Its blocks to be registered.
        if (!this.elements.editorAreaContainer) {
            this.elements.editorAreaContainer = document.createElement('div');
            this.elements.editorAreaContainer.id = 'editor-area-container';
            this.elements.editorAreaContainer.className = 'editor-view';
            this.container.appendChild(this.elements.editorAreaContainer);
        }

        this.blocks = blockDataList.map(data => this.createBlockInstance(data)).filter(Boolean);
        this.blocks.forEach(block => block.parent = null);
        this.render();
    }
}