// components/graph-editor/GraphEditor.js

class GraphEditor {
    constructor(container, filePath, tabManager, computedConfig) {
        this.container = container; // The wrapper div provided by TabManager
        this.filePath = filePath;
        this.tabManager = tabManager;
        this.computedConfig = computedConfig;

        this.fileConfig = {}; // To store the file's own config header
        
        this.elements = {}; // To store references to DOM elements
        this.mode = 'edit'; // 'edit' or 'preview'
        this.isReady = false; // Flag to check if HTML content is loaded
        
        // --- Core Editor State (from PageEditor class, with additions) ---
        this.blockRegistry = new Map();
        this.blocks = [];
        this.history = new HistoryManager(this);
        this.activeCommandBlock = null;
        this.draggedBlockInfo = null; // Changed to store info, not just the element
        this.currentDropInfo = null;
        this.activeToolbarBlock = null;
        this.toolbarHideTimeout = null;
        this.currentSelection = null;
        this.richTextEditingState = { isActive: false, blockId: null, savedRange: null };
        this.elements.commandMenuSelectedIndex = 0;
        this.allNotes = []; // For link popover search
        this.hoveredChildrenContainer = null;

        // --- NEW: Graph-specific state ---
        this.viewState = {
            scale: 1,
            pan: { x: 0, y: 0 }
        };
        this.isPanning = false;
        this.lastMousePos = { x: 0, y: 0 };
        this.snapGuides = {};

        // --- Sub-managers for organization ---
        this.GraphSelectionManager = new GraphSelectionManager(this);
        this.GraphReferenceManager = null; 
        this.popoverManager = null;
    }

    // --- ========================================================== ---
    // --- 1. Core Lifecycle Methods
    // --- ========================================================== ---

    async load(blockIdToFocus = null) {
        const response = await fetch('components/graph-editor/graph-editor.html');
        this.container.innerHTML = await response.text();

        this._acquireElements();

        // Graph Editor does not use the page-theme.css directly on its content.
        // The background is part of the canvas, not a scrollable view.
        // We will manually apply background colors if needed.
        this.applyConfiguration(this.computedConfig);
        
        this.GraphReferenceManager = new GraphReferenceManager(this); 
        this.popoverManager = new PopoverManager(this);

        this._registerAllBlocks();
        this._initListeners();
        this._updateTransform();
        this._initUiState();
        
        this.isReady = true;
        ipc.loadPage(this.filePath, blockIdToFocus);

        alert("Features Not Yet Fully Developed! Additionally, this feature contains AI-generated code, numerous bugs, and unfinished code. It is not recommended for use at this time.");
    }

    onPageContentLoaded(pageData) {
        if (!this.isReady || pageData.path !== this.filePath) return;
    
        const blockDataList = pageData.content || [];
        const fileConfig = pageData.config || {};
    
        this.fileConfig = fileConfig; 
    
        this.blocks = blockDataList.map(data => this.createBlockInstance(data)).filter(Boolean);
        this.blocks.forEach(block => block.parent = null);
        this.render();
    
        if (this.history.isUndoingOrRedoing) {
            this.GraphReferenceManager.handleHistoryChange(this.filePath, blockDataList);
        } else {
            this.history.recordInitialState();
        }
        
        this.tabManager.setUnsavedStatus(this.filePath, false);
    
        if (pageData.blockIdToFocus) {
            this.focusBlock(pageData.blockIdToFocus);
        }
    }

    applyConfiguration(config) {
        // Graph editor has a different structure, so config application is simpler.
        // It primarily affects popups and toolbars, which inherit from main theme.
        // The canvas background is styled in graph-editor.css.
        // We might add specific graph config later.
        this.computedConfig = config;
    }

    async onConfigurationChanged() {
        console.log(`Configuration change detected for: ${this.filePath}. Re-evaluating styles.`);
        
        const resolved = await ipc.resolveFileConfiguration(this.filePath);
        if (!resolved || !resolved.config) {
            console.error("Failed to re-resolve configuration for", this.filePath);
            return;
        }

        const newComputedConfig = window.computeFinalConfig(resolved.config);
        this.applyConfiguration(newComputedConfig);
    }
    
    setFileConfig(newConfig) {
        this.fileConfig = newConfig;
        this.savePage();
    }
    
    onFocus() {
        if (!this.isReady) return;
        this.GraphSelectionManager._updateVisuals();
        this.updateToolbarState();
    }
    
    destroy() {
        if (this.GraphReferenceManager) {
            this.GraphReferenceManager.destroy();
        }
        console.log(`Editor for ${this.filePath} destroyed.`);
    }

    // --- ========================================================== ---
    // --- 2. Element Acquisition & Initial Listener Setup
    // --- ========================================================== ---

    _acquireElements() {
        // --- Core graph elements ---
        this.elements.canvasContainer = this.container.querySelector('#graph-canvas-container');
        this.elements.transformLayer = this.container.querySelector('#graph-transform-layer');

        // --- Copied UI elements (same as PageEditor) ---
        this.elements.rightSidebar = this.container.querySelector('#right-sidebar');
        this.elements.rightSidebarResizer = this.container.querySelector('#right-sidebar-resizer');
        this.elements.rightSidebarToggleBtn = this.container.querySelector('#right-sidebar-toggle-btn');
        this.elements.rightSidebarViewToggle = this.container.querySelector('#right-sidebar-view-toggle');
        this.elements.referencesView = this.container.querySelector('#references-view');
        this.elements.detailsView = this.container.querySelector('#details-view');
        this.elements.floatingToolbar = this.container.querySelector('#floating-toolbar');
        this.elements.toggleToolbarBtn = this.container.querySelector('#toggle-toolbar-btn');
        this.elements.toolbarPeekTrigger = this.container.querySelector('#toolbar-peek-trigger');
        this.elements.saveBtn = this.container.querySelector('#save-btn');
        this.elements.modeToggle = this.container.querySelector('#mode-toggle');
        this.elements.commandMenu = this.container.querySelector('#command-menu');
        this.elements.blockToolbar = this.container.querySelector('#block-toolbar');
        this.elements.blockToolbarGraceArea = this.container.querySelector('#block-toolbar-grace-area');
        this.elements.popover = this.container.querySelector('#popover');
        this.elements.deleteDropZone = this.container.querySelector('#delete-drop-zone');
        
        // Add settings button to floating toolbar (same as PageEditor)
        this.elements.settingsBtn = document.createElement('button');
        this.elements.settingsBtn.id = 'graph-settings-btn'; // Use a different ID
        this.elements.settingsBtn.className = 'toolbar-icon-btn';
        this.elements.settingsBtn.title = 'Graph Settings';
        this.elements.settingsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
        
        this.elements.floatingToolbar.appendChild(this.elements.settingsBtn);
    }
    
    _initListeners() {
        // --- NEW: Canvas Listeners ---
        this.elements.canvasContainer.addEventListener('mousedown', this._onCanvasMouseDown.bind(this));
        this.elements.canvasContainer.addEventListener('mousemove', this._onCanvasMouseMove.bind(this));
        this.elements.canvasContainer.addEventListener('mouseup', this._onCanvasMouseUp.bind(this));
        this.elements.canvasContainer.addEventListener('mouseleave', this._onCanvasMouseLeave.bind(this));
        this.elements.canvasContainer.addEventListener('wheel', this._onCanvasWheel.bind(this), { passive: false });
        this.elements.canvasContainer.addEventListener('contextmenu', e => e.preventDefault()); // Prevent default right-click menu on canvas

        // --- Modified listeners for the transform layer (where blocks live) ---
        // Events are attached to the canvas, but we check target inside handlers.
        // This is more robust for mouse events on a transformed layer.
        this.elements.canvasContainer.addEventListener('dragstart', this._onDragStart.bind(this));
        this.elements.canvasContainer.addEventListener('dragover', this._onDragOver.bind(this));
        this.elements.canvasContainer.addEventListener('dragleave', this._onDragLeave.bind(this));
        this.elements.canvasContainer.addEventListener('drop', this._onDrop.bind(this));
        this.elements.canvasContainer.addEventListener('dragend', this._onDragEnd.bind(this));
        this.elements.canvasContainer.addEventListener('mouseover', this._onBlockMouseOver.bind(this));
        this.elements.canvasContainer.addEventListener('mouseout', this._onBlockMouseOut.bind(this));

        // Block-specific listeners, now attached to the canvascontainer and delegated
        this.elements.canvasContainer.addEventListener('input', this._onInput.bind(this));
        this.elements.canvasContainer.addEventListener('keydown', this._onEditorKeyDown.bind(this));
        this.elements.canvasContainer.addEventListener('click', this._onClick.bind(this));

        // UI Chrome Listeners (mostly unchanged from PageEditor)
        this.elements.commandMenu.addEventListener('click', this._onCommandMenuClick.bind(this));
        this.elements.blockToolbar.addEventListener('mouseover', () => clearTimeout(this.toolbarHideTimeout));
        this.elements.blockToolbar.addEventListener('mouseout', this._onBlockMouseOut.bind(this));
        this.elements.blockToolbarGraceArea.addEventListener('mouseover', () => clearTimeout(this.toolbarHideTimeout));
        this.elements.blockToolbarGraceArea.addEventListener('mouseout', this._onBlockMouseOut.bind(this));
        this.elements.modeToggle.addEventListener('click', (e) => {
            const option = e.target.closest('.mode-toggle-option');
            if (option) { this.switchMode(option.dataset.mode); }
        });
        this.elements.saveBtn.addEventListener('click', () => this.savePage());

        // Right Sidebar Listeners (unchanged from PageEditor)
        this._initRightSidebarLogic();

        // Floating Toolbar Listeners (unchanged from PageEditor)
        this._initToolbarCollapse();

        // Global Listeners (unchanged from PageEditor)
        this._initGlobalEventListeners();
        
        // Settings button listener (unchanged from PageEditor)
        this.elements.settingsBtn.addEventListener('click', () => {
             // For now, we reuse the page config modal. This could be customized later.
             window.openConfigModal('page', this.filePath);
        });

        // Details Panel listener (unchanged from PageEditor)
        this.elements.detailsView.addEventListener('click', (e) => {
            const targetRow = e.target.closest('.details-hierarchy-row');
            if (targetRow && targetRow.dataset.blockId) {
                const blockId = targetRow.dataset.blockId;
                this.GraphSelectionManager.set(blockId);
                const blockEl = this.elements.transformLayer.querySelector(`.block-container[data-id="${blockId}"]`);
                if (blockEl) {
                    // In Graph, we might want to pan/zoom to the block instead of just scrolling
                    this.focusBlock(blockId, true);
                }
            }
        });

        // Delete Drop Zone listeners (unchanged from PageEditor)
        const deleteZone = this.elements.deleteDropZone;
        if (deleteZone) {
            deleteZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                deleteZone.classList.add('is-active');
                this._hideSnapGuides();
                this.currentDropInfo = { targetId: 'DELETE_ZONE', position: 'inside' };
            });
            deleteZone.addEventListener('dragleave', (e) => {
                deleteZone.classList.remove('is-active');
                this.currentDropInfo = null; 
            });
            deleteZone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.elements.deleteDropZone.classList.remove('is-active');
                const multiDragData = e.dataTransfer.getData('application/veritnote-block-ids');
                const singleDragId = e.dataTransfer.getData('text/plain');
                let idsToDelete = [];
                if (multiDragData) { idsToDelete = JSON.parse(multiDragData); }
                else if (singleDragId) { idsToDelete = [singleDragId]; }
                if (idsToDelete.length > 0) {
                    idsToDelete.forEach(id => {
                        const el = this.container.querySelector(`.block-container[data-id="${id}"]`);
                        if (el) el.remove();
                    });
                    this.deleteMultipleBlocks(idsToDelete);
                }
                this._onDragEnd(e);
            });
        }
    }
    
    _initUiState() {
        // Unchanged from PageEditor
        this.setRightSidebarCollapsed(localStorage.getItem('veritnote_right_sidebar_collapsed') === 'true');
        this.setToolbarCollapsed(localStorage.getItem('veritnote_toolbar_collapsed') === 'true');
    }
    
    _initGlobalEventListeners() {
        // This is identical to PageEditor, just copied for independence
        document.addEventListener('mousedown', (e) => {
            const clickedBlockEl = e.target.closest('.block-container');
            const isMultiSelectKey = e.ctrlKey || e.metaKey || e.shiftKey;
            
            // Check if click is inside this editor's container
            if (!this.container.contains(e.target)) return;

            if (clickedBlockEl) {
                if (e.target.closest('.block-controls')) {
                    // Do nothing.
                } else if (isMultiSelectKey) {
                    e.preventDefault();
                    this.GraphSelectionManager.toggle(clickedBlockEl.dataset.id);
                } else {
                    this.GraphSelectionManager.set(clickedBlockEl.dataset.id);
                }
            } else {
                const clickedUiChrome = e.target.closest(
                    '#sidebar, #right-sidebar, #tab-bar, #floating-toolbar, #popover, #context-menu, #block-toolbar'
                );
                // If click is on the canvas background, clear selection
                if (!clickedUiChrome && e.target.closest('#graph-canvas-container')) {
                    this.GraphSelectionManager.clear();
                }
            }
        });

        document.addEventListener('selectionchange', this._onSelectionChange.bind(this));
        
        window.addEventListener('fileDialogClosed', (e) => {
            if (this.tabManager.getActiveTab()?.instance === this && this.popoverManager.currentPopoverCallback) {
                this.popoverManager.currentPopoverCallback(e.detail.payload.path);
                this.popoverManager.hide();
            }
        });
        
        window.addEventListener('noteListReceived', (e) => {
            this.allNotes = e.detail.payload;
            const popoverElement = this.elements.popover;
            const anySearchResults = popoverElement.querySelector('.popover-search-results');
            const anySearchInput = popoverElement.querySelector('#link-popover-input');
            if (popoverElement.style.display === 'block' && anySearchResults) {
                const query = anySearchInput ? anySearchInput.value : '';
                this.updateSearchResults(query, anySearchResults);
            }
        });

        window.addEventListener('quoteContentLoaded', (e) => {
            // This logic is complex and less relevant for Graph's preview mode,
            // but we keep it for consistency.
            const { quoteBlockId, content, error } = e.detail.payload;
            const parts = quoteBlockId.split('::');
            const isUpdateRequest = parts.length === 2;
            let targetTab, targetBlockId;
            if (isUpdateRequest) {
                const [tabId, blockId] = parts;
                targetTab = Array.from(this.tabManager.tabs.values()).find(t => t.id === tabId);
                targetBlockId = blockId;
            } else {
                targetTab = this.tabManager.getActiveTab();
                targetBlockId = quoteBlockId;
            }

            if (!targetTab || !targetTab.instance) return;
            const targetEditor = targetTab.instance;

            // Update the quote block content in the target editor
            const blockInstance = targetEditor._findBlockInstanceById(targetEditor.blocks, targetBlockId)?.block;
            if (blockInstance && typeof blockInstance.renderQuotedContent === 'function') {
                let blocksToRender = [];
                if (Array.isArray(content)) {
                    blocksToRender = content;
                } else if (content && typeof content === 'object' && Array.isArray(content.blocks)) {
                    blocksToRender = content.blocks;
                }
                const blockInstances = blocksToRender.map(data => targetEditor.createBlockInstance(data)).filter(Boolean);
                const blockElements = blockInstances.map(instance => instance.render());
                blockInstance.renderQuotedContent(blockElements);
            }
        });

        window.addEventListener('page:saved', (e) => {
            const savedPath = e.detail.path;
            if (!savedPath) return;
            this.tabManager.tabs.forEach(tab => {
                if (tab.instance && tab.instance.blocks) {
                    const findQuotesRecursive = (blocks) => {
                        blocks.forEach(blockInstance => {
                            if (blockInstance.type === 'quote' && blockInstance.properties.referenceLink) {
                                const referenceLink = blockInstance.properties.referenceLink;
                                const referencedPagePath = window.resolveWorkspacePath(referenceLink.split('#')[0]);
                                if (savedPath === referencedPagePath) {
                                    const [pathPart, blockIdPart] = referenceLink.split('#');
                                    const absolutePath = window.resolveWorkspacePath(pathPart);
                                    const absoluteReferenceLink = blockIdPart ? `${absolutePath}#${blockIdPart}` : absolutePath;
                                    ipc.fetchQuoteContent(`${tab.id}::${blockInstance.id}`, absoluteReferenceLink);
                                }
                            }
                            if (blockInstance.children && blockInstance.children.length > 0) {
                                findQuotesRecursive(blockInstance.children);
                            }
                        });
                    };
                    findQuotesRecursive(tab.instance.blocks);
                }
            });
        });
    }

    // --- ========================================================== ---
    // --- 3. Block Management (from PageEditor class)
    // --- ========================================================== ---

    _registerAllBlocks() {
        const ALL_BLOCK_CLASSES = [
            ParagraphBlock,
            Heading1Block,
            Heading2Block,
            ImageBlock,
            LinkButtonBlock,
            CalloutBlock,
            // EXCLUDE: ColumnsBlock,
            // EXCLUDE: ColumnBlock,
            CodeBlock,
            BulletedListItemBlock,
            TodoListItemBlock,
            NumberedListItemBlock,
            ToggleListItemBlock,
            QuoteBlock,
            TableBlock,
            TableRowBlock,
            TableCellBlock
        ];
        
        ALL_BLOCK_CLASSES.forEach(blockClass => this.registerBlock(blockClass));
    }

    registerBlock(blockClass) {
        // Unchanged from PageEditor
        if (blockClass.type) {
            this.blockRegistry.set(blockClass.type, blockClass);
        } else {
            console.error("Block class is missing a static 'type' property and cannot be registered.", blockClass);
        }
    }

    createBlockInstance(blockData) {
        // Unchanged from PageEditor
        const BlockClass = this.blockRegistry.get(blockData.type);
        if (BlockClass) {
            return new BlockClass(blockData, this);
        }
        console.error(`Block type "${blockData.type}" is not registered.`);
        return null;
    }

    /**
     * Renders all root-level blocks onto the graph canvas.
     * This is the core rendering method for the Graph Editor.
     */
    render() {
        this.elements.transformLayer.innerHTML = '';

        // Helper to gather all blocks recursively into a flat list
        const allBlocks = [];
        const flatten = (blocks) => {
            blocks.forEach(block => {
                allBlocks.push(block);
                if (block.children && block.children.length > 0) {
                    flatten(block.children);
                }
            });
        };
        flatten(this.blocks);

        // Render every block to the main layer
        allBlocks.forEach(block => {
            const blockEl = this._renderBlockToCanvas(block);
            if (blockEl) {
                this.elements.transformLayer.appendChild(blockEl);
            }
        });

        // Recalculate dimensions after render to ensure visual correctness
        this._recalculateAllContainerDimensions();

        // //START DEBUG
        this._renderDebugBounds();
        // //END DEBUG
    }
    
    // --- NEW: Block position/width sync method ---
    /**
     * Updates a block's data model with its current DOM position and size.
     * @param {Block} blockInstance The block to sync.
     */
    _syncBlockTransformFromDOM(blockInstance) {
        if (!blockInstance || !blockInstance.element) return;

        blockInstance.properties.position = {
            x: parseFloat(blockInstance.element.style.left) || 0,
            y: parseFloat(blockInstance.element.style.top) || 0,
        };
        blockInstance.properties.width = parseFloat(blockInstance.element.style.width) || 300;
    }


    deleteBlock(blockInstance, recordHistory = true) {
        // Unchanged from PageEditor
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
                        filePath: this.filePath,
                        blockData: parentData
                    }
                }));
                const grandParentInfo = this._findBlockInstanceById(this.blocks, parentToUpdate.id);
                parentToUpdate = grandParentInfo ? grandParentInfo.parentBlock : null;
            }
    
            if (blockInstance.element && blockInstance.element.parentElement) {
                blockInstance.element.parentElement.removeChild(blockInstance.element);
            }
    
            if (recordHistory) {
                this.emitChange(true, 'delete-block', null);
            }
        }
    }

    deleteMultipleBlocks(blockIds) {
        // Unchanged from PageEditor
        if (!blockIds || blockIds.length === 0) return;
        blockIds.forEach(id => {
            const blockInfo = this._findBlockInstanceAndParent(id);
            if (blockInfo) {
                this.deleteBlock(blockInfo.block, false);
            }
        });
        this.emitChange(true, 'batch-delete', null);
    }
    
    // insertNewBlockAfter is specific to linear layout and not directly used in Graph,
    // but we keep it for Enter key behavior.
    insertNewBlockAfter(targetBlock, type = 'paragraph') {
        const newBlockData = { type: type, content: '' };

        // --- NEW: Graph-specific positioning for new block ---
        const targetRect = targetBlock.element.getBoundingClientRect();
        const currentPos = targetBlock.properties.position || { x: 0, y: 0 };
        const currentWidth = targetBlock.properties.width || 300;
        
        // Position new block directly below, accounting for scale
        const yOffset = (targetRect.height / this.viewState.scale) + 20; // 20px margin
        
        newBlockData.properties = {
            position: {
                x: currentPos.x,
                y: currentPos.y + yOffset
            },
            width: currentWidth
        };
        // --- END NEW ---

        const newBlockInstance = this.createBlockInstance(newBlockData);
        if (!newBlockInstance) return;

        // In Graph, new blocks are always at the root level unless dropped into a container
        this.blocks.push(newBlockInstance);
        
        const newBlockEl = newBlockInstance.render();
        // --- NEW: Apply transform properties from data ---
        newBlockEl.style.left = `${newBlockData.properties.position.x}px`;
        newBlockEl.style.top = `${newBlockData.properties.position.y}px`;
        newBlockEl.style.width = `${newBlockData.properties.width}px`;

        // Add resize handle for the new block
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'block-resize-handle';
        newBlockEl.appendChild(resizeHandle);
        this._addResizeListener(resizeHandle, newBlockInstance);
        
        this.elements.transformLayer.appendChild(newBlockEl);
        // --- END NEW ---
        
        newBlockInstance.focus();
        this.emitChange(true, 'insert-block');
        return newBlockInstance;
    }


    // --- ========================================================== ---
    // --- 4. Editor Actions & Event Handlers
    // --- ========================================================== ---

    savePage() {
        // Unchanged from PageEditor
        if (!this.isReady) return;
        const blocksToSave = this.getBlocksForSaving();
        ipc.savePage(this.filePath, blocksToSave, this.fileConfig); 
        this.tabManager.setUnsavedStatus(this.filePath, false);
        window.dispatchEvent(new CustomEvent('page:saved', { detail: { path: this.filePath } }));
    }
    
    emitChange(recordHistory = true, actionType = 'unknown', blockInstance = null) {
        // Unchanged from PageEditor
        if (this.history.isUndoingOrRedoing) {
            return;
        }
        if (recordHistory) {
            this.history.record(actionType);
        }
        this.tabManager.setUnsavedStatus(this.filePath, true);
        if (blockInstance) {
            let currentBlock = blockInstance;
            while (currentBlock) {
                const currentBlockData = currentBlock.data;
                window.dispatchEvent(new CustomEvent('block:updated', {
                    detail: {
                        filePath: this.filePath,
                        blockData: currentBlockData
                    }
                }));
                const parentInfo = this._findBlockInstanceById(this.blocks, currentBlock.id);
                currentBlock = parentInfo ? parentInfo.parentBlock : null;
            }
        }
    }

    getBlocksForSaving() {
        // --- MODIFIED for Graph Editor ---
        // Before getting data, sync transform properties for all blocks
        const syncAllTransforms = (blocks) => {
            blocks.forEach(block => {
                this._syncBlockTransformFromDOM(block);
                if (block.children && block.children.length > 0) {
                    syncAllTransforms(block.children);
                }
            });
        };
        syncAllTransforms(this.blocks);
        // Now call the original data getter
        return this.blocks.map(block => block.data);
    }
    
    // --- NEW: Canvas Event Handlers ---

    _updateTransform() {
        const { pan, scale } = this.viewState;
        this.elements.transformLayer.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;

        const baseGridSize = 20;
        const scaledGridSize = baseGridSize * scale;

        this.elements.canvasContainer.style.backgroundPosition = `${pan.x}px ${pan.y}px`;
        this.elements.canvasContainer.style.backgroundSize = `${scaledGridSize}px ${scaledGridSize}px`;
    }

    _getMousePosInCanvas(e) {
        const rect = this.elements.canvasContainer.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    _getMousePosInWorld(e) {
        const canvasPos = this._getMousePosInCanvas(e);
        const { pan, scale } = this.viewState;
        return {
            x: (canvasPos.x - pan.x) / scale,
            y: (canvasPos.y - pan.y) / scale
        };
    }

    _onCanvasMouseDown(e) {
        // Right mouse button for panning
        if (e.button === 2) {
            this.isPanning = true;
            this.lastMousePos = this._getMousePosInCanvas(e);
            this.elements.canvasContainer.style.cursor = 'grabbing';
        }
    }

    _onCanvasMouseMove(e) {
        if (this.isPanning) {
            const currentMousePos = this._getMousePosInCanvas(e);
            const deltaX = currentMousePos.x - this.lastMousePos.x;
            const deltaY = currentMousePos.y - this.lastMousePos.y;
            
            this.viewState.pan.x += deltaX;
            this.viewState.pan.y += deltaY;

            this.lastMousePos = currentMousePos;
            this._updateTransform();
        }
    }

    _onCanvasMouseUp(e) {
        if (e.button === 2) {
            this.isPanning = false;
            this.elements.canvasContainer.style.cursor = 'grab';
        }
    }

    _onCanvasMouseLeave(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.elements.canvasContainer.style.cursor = 'grab';
        }
    }

    _onCanvasWheel(e) {
        e.preventDefault();

        const scaleAmount = 1.1;
        const mousePos = this._getMousePosInCanvas(e);
        const oldScale = this.viewState.scale;

        let newScale;
        if (e.deltaY < 0) {
            // Zoom in
            newScale = oldScale * scaleAmount;
        } else {
            // Zoom out
            newScale = oldScale / scaleAmount;
        }

        // Clamp scale between min and max values
        this.viewState.scale = Math.max(0.1, Math.min(newScale, 2.0));

        // Adjust pan to zoom towards the mouse pointer
        this.viewState.pan.x = mousePos.x - (mousePos.x - this.viewState.pan.x) * (this.viewState.scale / oldScale);
        this.viewState.pan.y = mousePos.y - (mousePos.y - this.viewState.pan.y) * (this.viewState.scale / oldScale);

        this._updateTransform();
    }


    // --- Modified Event Handlers ---

    _onInput(e) {
        // This is delegated, so we need to find the actual block
        const blockEl = e.target.closest('[data-id]');
        if (!blockEl) return;
        const blockInstance = this._findBlockInstanceById(this.blocks, blockEl.dataset.id)?.block;
        if (blockInstance && typeof blockInstance.onInput === 'function') {
            blockInstance.onInput(e);
        }
    }

    _onClick(e) {
        // --- Priority 1: Check for click on a container's "add area" ---
        if (e.target.matches('.block-children-container.show-add-area::after') || e.target.closest('.block-children-container.show-add-area')) {
            const childrenContainer = e.target.closest('.block-children-container');
            if (childrenContainer) {
                const containerElement = childrenContainer.closest('[data-id]');
                if (containerElement) {
                    const containerInstance = this._findBlockInstanceAndParent(containerElement.dataset.id)?.block;
                    if (containerInstance && containerInstance.isContainer) {
                        this._appendNewBlockToContainer(containerInstance);
                        return; // Stop further processing
                    }
                }
            }
        }

        // --- Priority 2: Prevent creating block if clicking on an existing block or its controls ---
        if (e.target.closest('.block-container')) {
            return;
        }

        // --- Priority 3 (Default): Click on canvas background to create a new block ---
        if (e.target === this.elements.canvasContainer || e.target === this.elements.transformLayer) {
            if (e.button !== 0) return;

            const worldPos = this._getMousePosInWorld(e);
            const newBlockData = {
                type: 'paragraph',
                content: '',
                properties: {
                    position: worldPos,
                    width: 300
                }
            };

            const newBlockInstance = this.createBlockInstance(newBlockData);
            this.blocks.push(newBlockInstance);

            // Render and append to the top-level transform layer
            const newBlockEl = this._renderBlockToCanvas(newBlockInstance);
            this.elements.transformLayer.appendChild(newBlockEl);

            newBlockInstance.focus();
            this.emitChange(true, 'create-block');
        }
    }

    /**
     * Appends a new block inside a container block.
     * (Restored and adapted for GraphEditor)
     */
    _appendNewBlockToContainer(containerBlock) {
        const newBlockData = {
            type: 'paragraph',
            properties: {
                // New blocks inside containers are positioned relative to the container
                position: { x: 20, y: 20 + containerBlock.children.length * 40 }, // Stagger new blocks
                width: 250
            }
        };
        const newBlockInstance = this.createBlockInstance(newBlockData);

        // Add to data model
        containerBlock.children.push(newBlockInstance);
        newBlockInstance.parent = containerBlock;

        // Render and append to the container's DOM
        const newBlockEl = this._renderBlockToCanvas(newBlockInstance, true); // true = isChild
        const targetDomContainer = containerBlock.childrenContainer;

        if (targetDomContainer) {
            targetDomContainer.appendChild(newBlockEl);
        } else {
            console.warn(`Container block "${containerBlock.type}" lacks a .childrenContainer.`);
            containerBlock.element.appendChild(newBlockEl);
        }

        newBlockInstance.focus();
        this.emitChange(true, 'create-block-in-container', containerBlock);
    }



    /**
     * Renders a single block element with graph positioning.
     */
    _renderBlockToCanvas(blockInstance) {
        // Call the original render. 
        // Note: The Block.js render method appends children to the wrapper. 
        // Since we append this element to transformLayer immediately after, 
        // and we also render children independently to transformLayer, 
        // we rely on the fact that DOM nodes can only exist in one place.
        // The children will be "moved out" of this parent when they are processed in the render loop.
        const blockEl = blockInstance.render();
        if (!blockEl) return null;

        const pos = blockInstance.properties.position || { x: 0, y: 0 };
        const width = blockInstance.properties.width || 300;

        blockEl.style.position = 'absolute';
        blockEl.style.left = `${pos.x}px`;
        blockEl.style.top = `${pos.y}px`;
        blockEl.style.width = `${width}px`;

        // Override styles to enforce flat look (no nesting indentation visuals from CSS)
        blockEl.style.margin = '0';
        blockEl.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';

        // Add resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'block-resize-handle';
        blockEl.appendChild(resizeHandle);
        this._addResizeListener(resizeHandle, blockInstance);

        return blockEl;
    }

    _onSelectionChange() {
        // Unchanged from PageEditor
        const selection = document.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            // Check if selection is within this specific editor's container
            if (this.container.contains(range.startContainer)) {
                this.currentSelection = range;
            }
        }
    }

    // --- Global Keydown Handler ---
    onKeyDown(e) {
        // Unchanged from PageEditor
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.GraphSelectionManager.size() > 0) {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                return;
            }
            e.preventDefault();
            const idsToDelete = this.GraphSelectionManager.get();
            this.deleteMultipleBlocks(idsToDelete);
            this.GraphSelectionManager.clear();
            return;
        }
        if ((e.ctrlKey || e.metaKey)) {
            const key = e.key.toLowerCase();
            if (key === 's') { e.preventDefault(); this.savePage(); return; }
            if (key === 'z') { e.preventDefault(); if (e.shiftKey) { this.history.redo(); } else { this.history.undo(); } return; }
            if (key === 'y' && !e.shiftKey) { e.preventDefault(); this.history.redo(); return; }
        }
    }
    
    // --- Editor-specific Keydown Handler ---
    _onEditorKeyDown(e) {
        // Unchanged from PageEditor, but logic for 'Enter' is handled in the block's onKeyDown
        if (this.elements.commandMenu.style.display === 'block') {
            const items = this.elements.commandMenu.querySelectorAll('.command-item');
            if (items.length > 0) {
                switch (e.key) {
                    case 'ArrowUp':
                        e.preventDefault();
                        this.elements.commandMenuSelectedIndex = (this.elements.commandMenuSelectedIndex - 1 + items.length) % items.length;
                        this._updateCommandMenuSelection();
                        return;
                    case 'ArrowDown':
                        e.preventDefault();
                        this.elements.commandMenuSelectedIndex = (this.elements.commandMenuSelectedIndex + 1) % items.length;
                        this._updateCommandMenuSelection();
                        return;
                    case 'Enter':
                    case 'Tab':
                        e.preventDefault();
                        items[this.elements.commandMenuSelectedIndex].click();
                        return;
                }
            }
        }
        
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.GraphSelectionManager.size() > 0) {
            const activeEl = document.activeElement;
            const isEditingText = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
            if (isEditingText) {
                // Let it fall through
            } else {
                e.preventDefault();
                const idsToDelete = this.GraphSelectionManager.get();
                this.deleteMultipleBlocks(idsToDelete);
                this.GraphSelectionManager.clear();
                return;
            }
        }

        const contentEl = e.target.closest('.block-content, .list-item-text-area');
        if (!contentEl) return;
        
        const blockId = contentEl.dataset.id || contentEl.closest('[data-id]')?.dataset.id;
        if (!blockId) return;

        const blockInstance = this._findBlockInstanceAndParent(blockId)?.block;
        if (blockInstance && typeof blockInstance.onKeyDown === 'function') {
             if (e.key === 'Enter' && !e.shiftKey) {
                blockInstance.syncContentFromDOM();
            }
            blockInstance.onKeyDown(e);
        }
    }

    // --- Command Menu Handlers (Unchanged from PageEditor) ---
    showCommandMenuForBlock(blockInstance) {
        const blockEl = blockInstance.contentElement;
        if (!blockEl || this.elements.commandMenu.classList.contains('is-visible')) {
            return;
        }
        this.elements.commandMenu.style.display = 'block';
        requestAnimationFrame(() => {
            this.elements.commandMenu.classList.add('is-visible');
        });
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
        setTimeout(() => {
            this._handleDocumentClickForMenu = (e) => {
                if (!this.elements.commandMenu.contains(e.target)) {
                    this.hideCommandMenu();
                }
            };
            document.addEventListener('mousedown', this._handleDocumentClickForMenu);
        }, 0);
    }

    hideCommandMenu() {
        if (this.elements.commandMenu.classList.contains('is-visible')) {
            this.elements.commandMenu.classList.remove('is-visible');
            this.activeCommandBlock = null;
            setTimeout(() => {
                if (!this.elements.commandMenu.classList.contains('is-visible')) {
                    this.elements.commandMenu.style.display = 'none';
                }
            }, 150);
            this.elements.commandMenuSelectedIndex = 0;
            if (this._handleDocumentClickForMenu) {
                document.removeEventListener('mousedown', this._handleDocumentClickForMenu);
                this._handleDocumentClickForMenu = null;
            }
        }
    }

    _getFilteredCommands(searchTerm) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filteredCommands = [];
        this.blockRegistry.forEach(BlockClass => {
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

    _renderCommandMenu(commands) {
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
        this.elements.commandMenuSelectedIndex = 0;
        this._updateCommandMenuSelection();
    }

    _handleCommandMenuLifecycle(blockInstance) {
        const content = blockInstance.contentElement.textContent || '';
        if (!content.startsWith('/')) {
            this.hideCommandMenu();
            return;
        }
        const searchTerm = content.substring(1);
        const filteredCommands = this._getFilteredCommands(searchTerm);
        if (filteredCommands.length === 0) {
            this.hideCommandMenu();
            return;
        }
        this._renderCommandMenu(filteredCommands);
        this.activeCommandBlock = blockInstance;
        if (!this.elements.commandMenu.classList.contains('is-visible')) {
            this.showCommandMenuForBlock(blockInstance);
        }
    }

    _updateCommandMenuSelection() {
        const items = this.elements.commandMenu.querySelectorAll('.command-item');
        items.forEach((item, index) => {
            if (index === this.elements.commandMenuSelectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    _onCommandMenuClick(e) {
        e.preventDefault();
        const item = e.target.closest('.command-item');
        if (!item || !this.activeCommandBlock) return;

        const newType = item.dataset.type;
        const targetBlock = this.activeCommandBlock;
        targetBlock.syncContentFromDOM();

        if (targetBlock.content.trim() === '/' || targetBlock.content.trim() === '') {
            // Transform the block in place
            const { parentArray, index } = this._findBlockInstanceAndParent(targetBlock.id);

            // --- BUG FIX PART 1: Preserve transform properties reliably ---
            const preservedProps = {
                position: targetBlock.properties.position,
                width: targetBlock.properties.width
            };

            // Create the new block data, but initially with an empty properties object.
            const newBlockData = {
                id: targetBlock.id,
                type: newType,
                properties: {} // Start with a clean slate
            };

            const newBlockInstance = this.createBlockInstance(newBlockData);
            if (newBlockInstance) {
                // Now, merge the preserved properties into the new instance's properties.
                // This overwrites any defaults set by the new block's constructor.
                Object.assign(newBlockInstance.properties, preservedProps);

                // Replace the old instance with the new one in the data model
                parentArray.splice(index, 1, newBlockInstance);

                // --- BUG FIX PART 2: Re-render the block correctly for the graph ---
                const oldEl = targetBlock.element;

                // 1. Create the new base element
                const newEl = newBlockInstance.render();

                // 2. Apply graph-specific styles and add the resize handle
                if (newBlockInstance.properties.position) {
                    newEl.style.left = `${newBlockInstance.properties.position.x}px`;
                    newEl.style.top = `${newBlockInstance.properties.position.y}px`;
                }
                if (newBlockInstance.properties.width) {
                    newEl.style.width = `${newBlockInstance.properties.width}px`;
                }

                const resizeHandle = document.createElement('div');
                resizeHandle.className = 'block-resize-handle';
                newEl.appendChild(resizeHandle);
                this._addResizeListener(resizeHandle, newBlockInstance);

                // 3. Replace the old element in the DOM
                if (oldEl && oldEl.parentElement) {
                    oldEl.parentElement.replaceChild(newEl, oldEl);
                }
                // --- END FIX ---

                newBlockInstance.focus();
            }
        } else {
            // This part remains the same
            this.insertNewBlockAfter(targetBlock, newType);
        }

        this.hideCommandMenu();
        // Use a more specific action type for history
        this.emitChange(true, 'transform-block', this.activeCommandBlock);
    }

    // --- Drag & Drop Handlers (Completely Re-implemented for Graph Editor) ---
    _onDragStart(e) {
        const blockContainer = e.target.closest('.block-container');
        if (!blockContainer) return;

        const isEditableContent = e.target.isContentEditable || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
        if (isEditableContent) return;

        const blockId = blockContainer.dataset.id;
        const blockInstance = this._findBlockInstanceById(this.blocks, blockId)?.block;
        if (!blockInstance) return;

        const worldMousePos = this._getMousePosInWorld(e);

        // Calculate offset from mouse to block top-left
        const offsetX = worldMousePos.x - (blockInstance.properties.position.x || 0);
        const offsetY = worldMousePos.y - (blockInstance.properties.position.y || 0);

        this.GraphSelectionManager.set(blockId);

        this.draggedBlockInfo = {
            isMulti: false, // Simplified for this logic update
            id: blockId,
            instance: blockInstance,
            startMousePos: worldMousePos,
            offset: { x: offsetX, y: offsetY },
            initialBlockPos: { ...blockInstance.properties.position } // Deep copy
        };

        // Ghost effect
        e.dataTransfer.setData('text/plain', blockId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => blockContainer.style.opacity = '0.5', 0);

        document.body.classList.add('is-dragging-block');
    }

    _onDragOver(e) {
        e.preventDefault();
        if (!this.draggedBlockInfo) return;

        const worldMousePos = this._getMousePosInWorld(e);
        const { instance, offset } = this.draggedBlockInfo;

        // 1. Calculate new position for the dragged block
        const newX = worldMousePos.x - offset.x;
        const newY = worldMousePos.y - offset.y;

        // 2. Calculate Delta (change since last frame or initial drag?)
        // Better to compare against current DOM position to apply delta to children
        const currentX = parseFloat(instance.element.style.left) || 0;
        const currentY = parseFloat(instance.element.style.top) || 0;

        const deltaX = newX - currentX;
        const deltaY = newY - currentY;

        // 3. Move the dragged block
        instance.element.style.left = `${newX}px`;
        instance.element.style.top = `${newY}px`;

        // 4. If this block is a container, move its children (and their children) recursively
        if (instance.children && instance.children.length > 0) {
            this._moveChildrenRecursively(instance.children, deltaX, deltaY);
        }

        // //START DEBUG
        this._renderDebugBounds();
        // //END DEBUG
    }

    _moveChildrenRecursively(children, dx, dy) {
        children.forEach(child => {
            if (child.element) {
                const oldX = parseFloat(child.element.style.left) || 0;
                const oldY = parseFloat(child.element.style.top) || 0;
                child.element.style.left = `${oldX + dx}px`;
                child.element.style.top = `${oldY + dy}px`;
            }
            if (child.children && child.children.length > 0) {
                this._moveChildrenRecursively(child.children, dx, dy);
            }
        });
    }

    _onDragLeave(e) { 
        // Hide guides if mouse leaves the canvas area
        if (!this.elements.canvasContainer.contains(e.relatedTarget)) {
            this._hideSnapGuides();
        }
    }

    _onDrop(e) {
        e.preventDefault();
        if (!this.draggedBlockInfo) return;

        const { instance } = this.draggedBlockInfo;

        // 1. Commit new positions to data model (sync from DOM)
        // We need to sync the dragged block AND all its descendants
        const syncRecursive = (blk) => {
            this._syncBlockTransformFromDOM(blk);
            if (blk.children) blk.children.forEach(syncRecursive);
        };
        syncRecursive(instance);

        // 2. Determine Parent-Child Relationships based on Geometry
        this._updateParentRelationships();

        // 3. Recalculate Container Heights based on new contents
        this._recalculateAllContainerDimensions();

        // 4. Cleanup
        this._onDragEnd(e);
        this.emitChange(true, 'move-block-graph');

        // Force re-render to ensure DOM structure matches logic (though strictly visual it's already there)
        // Not strictly necessary if DOM manipulation was perfect, but safer.
        // this.render(); 
    }
    
    _onDragEnd(e) {
        document.body.classList.remove('is-dragging-block');
        if (this.draggedBlockInfo) {
            const el = this.container.querySelector(`.block-container[data-id="${this.draggedBlockInfo.id}"]`);
            if (el) el.style.opacity = '1';
        }
        this.draggedBlockInfo = null;

        // //START DEBUG
        const debugLayer = this.elements.transformLayer.querySelector('#debug-layer');
        if (debugLayer) debugLayer.innerHTML = '';
        // //END DEBUG
    }

    /**
     * Re-evaluates parent/child relationships for ALL blocks based on visual overlap.
     */
    _updateParentRelationships() {
        // 1. Flatten all blocks to process them easily
        const allBlocks = [];
        const traverse = (arr) => arr.forEach(b => { allBlocks.push(b); if (b.children) traverse(b.children); });
        traverse(this.blocks); // Note: this.blocks currently holds the root structure, which might be outdated.

        // We need a flat list irrespective of current hierarchy
        // Since we just moved things, the `this.blocks` hierarchy might be wrong.
        // Let's rebuild the hierarchy from scratch.

        // Reset all parents
        allBlocks.forEach(b => {
            b.parent = null;
            b.children = []; // Clear children array to rebuild
        });

        // 2. Find new parents
        // For each block, find the smallest container that fully encloses its Top-Left corner
        allBlocks.forEach(candidateChild => {
            const childX = candidateChild.properties.position.x;
            const childY = candidateChild.properties.position.y;

            let bestParent = null;
            let minArea = Infinity;

            allBlocks.forEach(candidateParent => {
                if (candidateChild === candidateParent) return; // Can't be parent of self
                if (!candidateParent.isContainer) return; // Only containers can be parents

                // Prevent circular references (A inside B, B inside A) - simple check:
                // Since we cleared children, we are building fresh. 
                // We just need to ensure we don't pick a parent that is actually visually *inside* the child 
                // (impossible if we use Top-Left logic and assume parents are larger, but good to keep in mind).

                const pX = candidateParent.properties.position.x;
                const pY = candidateParent.properties.position.y;
                const pW = candidateParent.properties.width || 300;
                // Use current calculated height (from DOM or properties)
                const pH = candidateParent.element ? candidateParent.element.offsetHeight : (candidateParent.properties.height || 50);

                // Check if Child's Top-Left is inside Parent
                if (childX >= pX && childX <= pX + pW &&
                    childY >= pY && childY <= pY + pH) {

                    // It's inside. Is it the "tightest" parent?
                    const area = pW * pH;
                    if (area < minArea) {
                        minArea = area;
                        bestParent = candidateParent;
                    }
                }
            });

            if (bestParent) {
                bestParent.children.push(candidateChild);
                candidateChild.parent = bestParent;
            }
        });

        // 3. Rebuild `this.blocks` to contain only root blocks (blocks with no parent)
        this.blocks = allBlocks.filter(b => b.parent === null);
    }

    /**
     * Recalculates height for all containers to fit their children.
     * Must process bottom-up (deepest nested containers first).
     */
    _recalculateAllContainerDimensions() {
        // We need to process deepest containers first because their height affects their parent's required height.
        // Simple way: Recursive function.

        const processBlock = (block) => {
            if (!block.children || block.children.length === 0) {
                if (block.isContainer) this._setContainerHeight(block, null);
                return;
            }

            // Recursively process children first
            block.children.forEach(child => processBlock(child));

            // Now process self if container
            if (block.isContainer) {
                this._setContainerHeight(block, block.children);
            }
        };

        this.blocks.forEach(root => processBlock(root));
    }

    _setContainerHeight(container, children) {
        const MIN_HEIGHT = 50; // Matches CSS min-height or logic
        const PADDING_BOTTOM = 20; // "Slightly below"

        let lowestY = container.properties.position.y + MIN_HEIGHT;

        if (children && children.length > 0) {
            let maxChildBottom = 0;
            children.forEach(child => {
                // Child Y is absolute coordinates
                const childHeight = child.element ? child.element.offsetHeight : 50;
                const childBottom = child.properties.position.y + childHeight;
                if (childBottom > maxChildBottom) {
                    maxChildBottom = childBottom;
                }
            });

            // The lowest point relative to the container's top
            // Absolute Bottom of Children + Padding
            lowestY = Math.max(lowestY, maxChildBottom + PADDING_BOTTOM);
        }

        const newHeight = lowestY - container.properties.position.y;

        // Apply directly to DOM
        if (container.element) {
            container.element.style.height = `${newHeight}px`;
            // Force the content wrapper to fill height if needed, though CSS usually handles this
        }

        // //START DEBUG
        this._renderDebugMinHeight(container, lowestY);
        // //END DEBUG
    }

    _renderDebugBounds() {
        let layer = this.elements.transformLayer.querySelector('#debug-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'debug-layer';
            layer.style.position = 'absolute';
            layer.style.top = '0';
            layer.style.left = '0';
            layer.style.width = '100%';
            layer.style.height = '100%';
            layer.style.pointerEvents = 'none';
            layer.style.zIndex = '9999';
            this.elements.transformLayer.appendChild(layer);
        }
        layer.innerHTML = '';

        const allBlocks = [];
        const flatten = (arr) => arr.forEach(b => { allBlocks.push(b); if (b.children) flatten(b.children); });
        flatten(this.blocks);

        allBlocks.forEach(block => {
            if (!block.isContainer) return;
            const rect = document.createElement('div');
            rect.style.position = 'absolute';
            rect.style.border = '1px solid red';
            rect.style.left = block.element.style.left;
            rect.style.top = block.element.style.top;
            rect.style.width = block.element.style.width;
            rect.style.height = block.element.style.height;
            layer.appendChild(rect);
        });
    }

    _renderDebugMinHeight(container, absoluteY) {
        let layer = this.elements.transformLayer.querySelector('#debug-layer');
        if (!layer) return;

        const line = document.createElement('div');
        line.style.position = 'absolute';
        line.style.height = '1px';
        line.style.backgroundColor = 'red';
        line.style.top = `${absoluteY}px`;
        line.style.left = container.element.style.left;
        line.style.width = container.element.style.width;
        layer.appendChild(line);
    }

    // --- NEW: Snapping and Resize Logic ---

    _addResizeListener(handle, blockInstance) {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent block dragging

            const startX = e.clientX;
            const startWidth = parseFloat(blockInstance.element.style.width);
            const MIN_WIDTH = 100; // Minimum block width in pixels

            const onMouseMove = (moveEvent) => {
                const deltaX = (moveEvent.clientX - startX) / this.viewState.scale;
                let newWidth = startWidth + deltaX;
                
                // Enforce minimum width
                if (newWidth < MIN_WIDTH) {
                    newWidth = MIN_WIDTH;
                }

                blockInstance.element.style.width = `${newWidth}px`;
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                // Sync the final width to the data model and record history
                const finalWidth = parseFloat(blockInstance.element.style.width);
                if (blockInstance.properties.width !== finalWidth) {
                    blockInstance.properties.width = finalWidth;
                    this.emitChange(true, 'resize-block', blockInstance);
                }
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    _getSnapTargets() {
        const targets = [];
        const draggedIds = this.draggedBlockInfo.isMulti ? this.draggedBlockInfo.ids : [this.draggedBlockInfo.id];

        this.blocks.forEach(block => {
            if (draggedIds.includes(block.id)) return; // Don't snap to itself

            const el = block.element;
            if (!el) return;

            const rect = {
                left: parseFloat(el.style.left),
                top: parseFloat(el.style.top),
                width: parseFloat(el.style.width),
                height: el.offsetHeight / this.viewState.scale // Use scaled height
            };
            rect.right = rect.left + rect.width;
            rect.bottom = rect.top + rect.height;
            rect.centerX = rect.left + rect.width / 2;
            rect.centerY = rect.top + rect.height / 2;
            targets.push(rect);
        });
        return targets;
    }

    _getVirtualBlockRect(position, instance) {
        const width = instance.properties.width || 300;
        const height = instance.element.offsetHeight / this.viewState.scale;
        const rect = {
            left: position.x,
            top: position.y,
            width: width,
            height: height
        };
        rect.right = rect.left + width;
        rect.bottom = rect.top + height;
        rect.centerX = rect.left + width / 2;
        rect.centerY = rect.top + height / 2;
        return rect;
    }
    
    _calculateSnap(draggedRect, targets) {
        const SNAP_DISTANCE = 10 / this.viewState.scale; // Adjust snap distance with scale
        let adjustX = 0;
        let adjustY = 0;
        const guides = [];

        // Define potential snap points for the dragged rectangle
        const draggedPoints = {
            l: draggedRect.left, r: draggedRect.right, cx: draggedRect.centerX,
            t: draggedRect.top, b: draggedRect.bottom, cy: draggedRect.centerY
        };

        // Find the closest snap for X and Y independently
        let minDx = SNAP_DISTANCE;
        let minDy = SNAP_DISTANCE;

        targets.forEach(target => {
            const targetPoints = {
                l: target.left, r: target.right, cx: target.centerX,
                t: target.top, b: target.bottom, cy: target.centerY
            };
            
            // Check X axis
            for (const dpKey in {l:1, r:1, cx:1}) {
                for (const tpKey in {l:1, r:1, cx:1}) {
                    const d = targetPoints[tpKey] - draggedPoints[dpKey];
                    if (Math.abs(d) < minDx) {
                        minDx = Math.abs(d);
                        adjustX = d;
                    }
                }
            }
            // Check Y axis
            for (const dpKey in {t:1, b:1, cy:1}) {
                for (const tpKey in {t:1, b:1, cy:1}) {
                    const d = targetPoints[tpKey] - draggedPoints[dpKey];
                    if (Math.abs(d) < minDy) {
                        minDy = Math.abs(d);
                        adjustY = d;
                    }
                }
            }
        });
        
        // If no snap was found within the threshold, reset adjustment
        if (minDx >= SNAP_DISTANCE) adjustX = 0;
        if (minDy >= SNAP_DISTANCE) adjustY = 0;

        // Generate guide lines based on the final snapped position
        if (adjustX !== 0 || adjustY !== 0) {
            const finalRect = { ...draggedRect, left: draggedRect.left + adjustX, top: draggedRect.top + adjustY };
            finalRect.right = finalRect.left + finalRect.width;
            finalRect.bottom = finalRect.top + finalRect.height;
            finalRect.centerX = finalRect.left + finalRect.width / 2;
            finalRect.centerY = finalRect.top + finalRect.height / 2;

            targets.forEach(target => {
                // Vertical guides
                if (Math.abs(finalRect.left - target.left) < 1) guides.push({ type: 'vertical', pos: target.left });
                if (Math.abs(finalRect.left - target.right) < 1) guides.push({ type: 'vertical', pos: target.right });
                if (Math.abs(finalRect.right - target.left) < 1) guides.push({ type: 'vertical', pos: target.left });
                if (Math.abs(finalRect.right - target.right) < 1) guides.push({ type: 'vertical', pos: target.right });
                if (Math.abs(finalRect.centerX - target.centerX) < 1) guides.push({ type: 'vertical', pos: target.centerX });
                // Horizontal guides
                if (Math.abs(finalRect.top - target.top) < 1) guides.push({ type: 'horizontal', pos: target.top });
                if (Math.abs(finalRect.top - target.bottom) < 1) guides.push({ type: 'horizontal', pos: target.bottom });
                if (Math.abs(finalRect.bottom - target.top) < 1) guides.push({ type: 'horizontal', pos: target.top });
                if (Math.abs(finalRect.bottom - target.bottom) < 1) guides.push({ type: 'horizontal', pos: target.bottom });
                if (Math.abs(finalRect.centerY - target.centerY) < 1) guides.push({ type: 'horizontal', pos: target.centerY });
            });
        }

        return { adjustX, adjustY, guides };
    }

    _showSnapGuides(guides) {
        this._hideSnapGuides();
        const uniqueGuides = new Map();
        guides.forEach(g => uniqueGuides.set(`${g.type}-${g.pos}`, g));

        uniqueGuides.forEach(guide => {
            let guideEl = document.createElement('div');
            guideEl.className = `snap-guide ${guide.type}`;
            if (guide.type === 'vertical') {
                guideEl.style.left = `${guide.pos}px`;
                guideEl.style.height = `${this.elements.transformLayer.scrollHeight}px`; // Cover full canvas height
            } else {
                guideEl.style.top = `${guide.pos}px`;
                guideEl.style.width = `${this.elements.transformLayer.scrollWidth}px`;
            }
            this.elements.transformLayer.appendChild(guideEl);
        });
    }

    _hideSnapGuides() {
        this.elements.transformLayer.querySelectorAll('.snap-guide').forEach(el => el.remove());
    }


    // --- Block Toolbar and Popover Handlers (Copied from PageEditor for completeness) ---

    _onBlockMouseOver(e) {
        // --- Part 1: Block Toolbar Logic (Copied from PageEditor) ---
        const targetEl = e.target.closest('.block-container');
        if (targetEl && targetEl !== this.activeToolbarBlock?.element) {
            clearTimeout(this.toolbarHideTimeout);
            const blockInstance = this._findBlockInstanceById(this.blocks, targetEl.dataset.id)?.block;
            if (blockInstance) {
                this._showBlockToolbar(blockInstance);
            }
        }

        // --- Part 2: Container Hover Logic (Restored and adapted from PageEditor) ---
        const hoveredBlockEl = e.target.closest('.block-container');
        if (hoveredBlockEl) {
            const blockInstance = this._findBlockInstanceById(this.blocks, hoveredBlockEl.dataset.id)?.block;
            this._setActiveContainerAddArea(blockInstance);
        }
    }

    _onBlockMouseOut(e) {
        // --- Part 1: Block Toolbar Logic (Copied from PageEditor) ---
        clearTimeout(this.toolbarHideTimeout);
        this.toolbarHideTimeout = setTimeout(() => {
            if (!this.elements.blockToolbar.matches(':hover') &&
                !this.elements.blockToolbarGraceArea.matches(':hover') &&
                !this.container.querySelector('.block-container:hover')) {
                this._hideBlockToolbar();
            }
        }, 300);

        // --- Part 2: Container Hover Logic (Restored and adapted from PageEditor) ---
        const currentHoveredBlockEl = this.hoveredChildrenContainer?.closest('.block-container');
        if (currentHoveredBlockEl && !currentHoveredBlockEl.contains(e.relatedTarget)) {
            this._setActiveContainerAddArea(null);
        }
    }

    /**
     * Helper to manage the .show-add-area class for containers.
     * (Copied directly from PageEditor)
     */
    _setActiveContainerAddArea(containerBlockInstance) {
        if (this.hoveredChildrenContainer) {
            this.hoveredChildrenContainer.classList.remove('show-add-area');
            this.hoveredChildrenContainer.classList.remove('is-drop-target-child');
        }
        this.hoveredChildrenContainer = null;

        if (containerBlockInstance && containerBlockInstance.isContainer && containerBlockInstance.childrenContainer) {
            const childrenContainer = containerBlockInstance.childrenContainer;

            const className = document.body.classList.contains('is-dragging-block')
                ? 'is-drop-target-child'
                : 'show-add-area';

            childrenContainer.classList.add(className);
            this.hoveredChildrenContainer = childrenContainer;
        }
    }
    
    _showBlockToolbar(blockInstance) {
        if (this.activeToolbarBlock) {
            this.activeToolbarBlock.element.classList.remove('toolbar-active');
        }

        this.activeToolbarBlock = blockInstance;
        const blockEl = blockInstance.element;
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

            const graceArea = this.elements.blockToolbarGraceArea;
            graceArea.style.left = `${left}px`;
            graceArea.style.width = `${toolbarWidth}px`;
            if (isToolbarAbove) {
                graceArea.style.top = `${top + toolbarHeight}px`;
                graceArea.style.height = `${blockRect.top - (top + toolbarHeight)}px`;
            } else {
                graceArea.style.top = `${blockRect.bottom}px`;
                graceArea.style.height = `${top - blockRect.bottom}px`;
            }
            graceArea.style.display = 'block';
        });
    }

    _hideBlockToolbar() {
        this.elements.blockToolbar.style.display = 'none';
        this.elements.blockToolbarGraceArea.style.display = 'none';
        if (this.activeToolbarBlock) {
            this.activeToolbarBlock.element.classList.remove('toolbar-active');
        }
        this.activeToolbarBlock = null;
    }

    _populateToolbar(blockInstance) {
        this.elements.blockToolbar.innerHTML = '';
        const buttons = blockInstance.toolbarButtons;

        buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.className = 'toolbar-button';
            if (btnInfo.html) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = btnInfo.html;
                while (tempDiv.firstChild) {
                    button.appendChild(tempDiv.firstChild);
                }
            } else {
                button.textContent = btnInfo.icon;
            }
            button.title = btnInfo.title;
            button.dataset.action = btnInfo.action;
            if (btnInfo.arg) {
                button.dataset.arg = btnInfo.arg;
            }
            button.addEventListener('mousedown', e => {
                e.preventDefault();
                this._handleToolbarClick(e, blockInstance);
            });
            this.elements.blockToolbar.appendChild(button);
        });
    }
    
    _handleToolbarClick(e, blockInstance) {
        const button = e.currentTarget;
        const action = button.dataset.action;
        const arg = button.dataset.arg;

        const forceRestoreAndExecute = (cmd, value = null) => {
            if (!this.richTextEditingState.isActive) return;
            const { blockId, savedRange } = this.richTextEditingState;
            const targetBlock = this._findBlockInstanceById(this.blocks, blockId)?.block;
            if (!targetBlock || !savedRange) {
                this.richTextEditingState.isActive = false;
                return;
            }
            targetBlock.contentElement.focus();
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedRange);
            document.execCommand(cmd, false, value);
            targetBlock.syncContentFromDOM();
            this.emitChange(true, 'format-text');
            this.richTextEditingState.isActive = false;
        };

        switch (action) {
            case 'format':
                if (this.currentSelection) {
                    blockInstance.contentElement.focus();
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(this.currentSelection);
                    document.execCommand(arg, false, null);
                    blockInstance.syncContentFromDOM();
                    this.emitChange(true, 'format-text');
                }
                break;
            case 'colorPicker':
                this.richTextEditingState = { isActive: true, blockId: blockInstance.id, savedRange: this.currentSelection };
                this.popoverManager.showColorPicker({
                    targetElement: button,
                    callback: (color) => {
                        document.execCommand('styleWithCSS', false, true);
                        forceRestoreAndExecute('foreColor', color);
                        document.execCommand('styleWithCSS', false, false);
                    }
                });
                break;
            case 'link':
                this.richTextEditingState = { isActive: true, blockId: blockInstance.id, savedRange: this.currentSelection };
                this.popoverManager.showLink({
                    targetElement: button,
                    existingValue: this.currentSelection?.commonAncestorContainer.parentNode.href || '',
                    callback: (value) => {
                        forceRestoreAndExecute(value ? 'createLink' : 'unlink', value || undefined);
                    }
                });
                break;
            case 'showDetails':
                this._showBlockDetails(blockInstance);
                this._hideBlockToolbar();
                break;
            default:
                if (typeof blockInstance.handleToolbarAction === 'function') {
                    blockInstance.handleToolbarAction(action, button);
                }
                break;
        }
    }

    _showBlockDetails(blockInstance) {
        if (!blockInstance) return;
        this.GraphSelectionManager.set(blockInstance.id);
        const appContainer = this.container.closest('.app-container');
        if (appContainer && appContainer.classList.contains('right-sidebar-collapsed')) {
            this.setRightSidebarCollapsed(false);
        }
        this.switchRightSidebarView('details');
    }

    // [Continued from Part 4/5]

    // --- ========================================================== ---
    // --- 5. UI Logic (Copied and adapted from PageEditor)
    // --- ========================================================== ---
    
    // --- Mode Switching & Toolbar State ---
    async switchMode(mode, forceRefresh = false) {
        if (!this.isReady) return;
        if (this.mode === mode && !forceRefresh) return;
    
        // For Graph, preview mode is not well-defined yet.
        // We will just disable interactions for now.
        // A full implementation would render a static SVG or similar.
        this.mode = mode;
    
        if (mode === 'edit') {
            this.elements.canvasContainer.style.pointerEvents = 'auto';
            this.elements.transformLayer.querySelectorAll('.block-container').forEach(el => {
                el.style.pointerEvents = 'auto';
            });
        } else { // preview
            // In a real scenario, we'd render a non-interactive version.
            // For now, we just disable pointer events on the canvas.
            this.elements.canvasContainer.style.pointerEvents = 'none';
            this.elements.transformLayer.querySelectorAll('.block-container').forEach(el => {
                el.style.pointerEvents = 'auto'; // but allow text selection
            });
            // You might want to hide handles, etc.
        }
        
        this.updateToolbarState();
    }

    updateToolbarState() {
        // Unchanged from PageEditor
        const activeTab = this.tabManager.tabs.get(this.filePath);
        if (activeTab) {
            this.elements.saveBtn.disabled = !activeTab.isUnsaved;
            this.elements.saveBtn.classList.toggle('unsaved', activeTab.isUnsaved);
            this.elements.modeToggle.classList.toggle('edit-active', this.mode === 'edit');
            this.elements.modeToggle.classList.toggle('preview-active', this.mode === 'preview');
        } else {
            this.elements.saveBtn.disabled = true;
            this.elements.saveBtn.classList.remove('unsaved');
            this.elements.modeToggle.classList.add('edit-active');
            this.elements.modeToggle.classList.remove('preview-active');
        }
    }

    // --- Popover Integration ---
    updateSearchResults(query, container) {
        // Unchanged from PageEditor
        if (!container) return;
        container.innerHTML = this.allNotes 
            .filter(note => note.name.toLowerCase().includes(query.toLowerCase()))
            .map(note => `<div class="search-result-item" data-path="${note.path}" title="${note.path}">📄 ${note.name}</div>`)
            .join('');
    }

    // --- Right Sidebar Logic ---
    _initRightSidebarLogic() {
        // Unchanged from PageEditor
        this.elements.rightSidebarViewToggle.addEventListener('click', (e) => {
            const option = e.target.closest('.rs-view-option');
            if (option) { this.switchRightSidebarView(option.dataset.view); }
        });

        const referencesOption = this.elements.rightSidebarViewToggle.querySelector('.rs-view-option[data-view="references"]');
        if (referencesOption) {
            referencesOption.addEventListener('dragenter', (e) => {
                if (document.body.classList.contains('is-dragging-block')) {
                    this.switchRightSidebarView('references');
                }
            });
        }
        
        this.elements.rightSidebarToggleBtn.addEventListener('click', () => {
            const appContainer = this.container.closest('.app-container');
            if (appContainer) {
                appContainer.classList.remove('right-sidebar-peek');
                this.setRightSidebarCollapsed(!appContainer.classList.contains('right-sidebar-collapsed'));
            }
        });

        this.elements.rightSidebarResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = this.elements.rightSidebar.offsetWidth;
            const onMouseMove = (moveEvent) => this._applyRightSidebarWidth(startWidth + (startX - moveEvent.clientX));
            const onMouseUp = () => {
                localStorage.setItem('veritnote_right_sidebar_width', this.elements.rightSidebar.style.width);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        const savedRightWidth = localStorage.getItem('veritnote_right_sidebar_width');
        if (savedRightWidth) { this.elements.rightSidebar.style.width = savedRightWidth; }

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
            rightSidebarPeekTrigger.addEventListener('dragenter', () => {
                 if (appContainer.classList.contains('right-sidebar-collapsed')) {
                    appContainer.classList.add('right-sidebar-peek');
                }
            });
        }
    }

    _applyRightSidebarWidth(width) {
        // Unchanged from PageEditor
        const min = parseFloat(getComputedStyle(this.elements.rightSidebar).minWidth);
        const max = parseFloat(getComputedStyle(this.elements.rightSidebar).maxWidth);
        this.elements.rightSidebar.style.width = `${Math.max(min, Math.min(width, max))}px`;
    }

    setRightSidebarCollapsed(collapsed) {
        // Unchanged from PageEditor
        const appContainer = this.container.closest('.app-container');
        if (!appContainer) return;

        const buttonText = this.elements.rightSidebarToggleBtn.querySelector('span');
        const buttonSvg = this.elements.rightSidebarToggleBtn.querySelector('svg');
        
        if (collapsed) {
            appContainer.classList.add('right-sidebar-collapsed');
            localStorage.setItem('veritnote_right_sidebar_collapsed', 'true');
            if (buttonText) buttonText.textContent = 'Expand';
            this.elements.rightSidebarToggleBtn.title = 'Expand right sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><polyline points="14 16 9 12 14 8"></polyline>`;
        } else {
            appContainer.classList.remove('right-sidebar-collapsed');
            appContainer.classList.remove('right-sidebar-peek');
            localStorage.setItem('veritnote_right_sidebar_collapsed', 'false');
            this.elements.rightSidebar.style.width = localStorage.getItem('veritnote_right_sidebar_width') || '280px';
            if (buttonText) buttonText.textContent = 'Collapse';
            this.elements.rightSidebarToggleBtn.title = 'Collapse right sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>`;
        }
    }

    switchRightSidebarView(viewName) {
        // Unchanged from PageEditor
        const views = {
            references: this.elements.referencesView,
            details: this.elements.detailsView
        };
        const slider = this.elements.rightSidebarViewToggle.querySelector('.rs-view-slider');
        const optionToActivate = this.elements.rightSidebarViewToggle.querySelector(`.rs-view-option[data-view="${viewName}"]`);
        if (!optionToActivate) return;
        if (slider) { slider.style.left = `${optionToActivate.offsetLeft}px`; }
        this.elements.rightSidebarViewToggle.querySelectorAll('.rs-view-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.view === viewName);
        });
        Object.values(views).forEach(view => {
            if (view) view.classList.remove('active');
        });
        if (views[viewName]) { views[viewName].classList.add('active'); }
    }

    updateDetailsPanel() {
        // Unchanged from PageEditor
        const editor = this.GraphSelectionManager._getEditor();
        if (!editor || !this.elements.detailsView) return;
        const selectedIds = this.GraphSelectionManager.get();
        this.elements.detailsView.innerHTML = '';
        if (selectedIds.length === 0) {
            this.elements.detailsView.innerHTML = `<div class="empty-details-placeholder">Select a block to see its details.</div>`;
            return;
        }
        let contentHtml = '';
        selectedIds.forEach(id => {
            const blockInfo = editor._findBlockInstanceById(editor.blocks, id);
            if (blockInfo && blockInfo.block) {
                contentHtml += blockInfo.block.renderDetailsPanel();
            }
        });
        this.elements.detailsView.innerHTML = contentHtml;
    }

    // --- Floating Toolbar Logic ---
    _initToolbarCollapse() {
        // Unchanged from PageEditor
        this.elements.toggleToolbarBtn.addEventListener('click', () => {
            const mainContentEl = this.container.closest('#main-content');
            if (mainContentEl) {
                this.setToolbarCollapsed(!mainContentEl.classList.contains('toolbar-collapsed'));
            }
        });
        this.elements.toolbarPeekTrigger.addEventListener('mouseenter', () => {
            const mainContentEl = this.container.closest('#main-content');
            if (mainContentEl && mainContentEl.classList.contains('toolbar-collapsed')) {
                mainContentEl.classList.add('toolbar-peek');
                this.elements.floatingToolbar.addEventListener('mouseleave', () => {
                    mainContentEl.classList.remove('toolbar-peek');
                }, { once: true });
            }
        });
    }

    setToolbarCollapsed(collapsed) {
        // Unchanged from PageEditor
        const mainContentEl = this.container.closest('#main-content');
        if (!mainContentEl) return;
        if (collapsed) {
            mainContentEl.classList.add('toolbar-collapsed');
            localStorage.setItem('veritnote_toolbar_collapsed', 'true');
            this.elements.toggleToolbarBtn.title = 'Expand Toolbar';
        } else {
            mainContentEl.classList.remove('toolbar-collapsed');
            localStorage.setItem('veritnote_toolbar_collapsed', 'false');
            this.elements.toggleToolbarBtn.title = 'Collapse Toolbar';
            if (mainContentEl.classList.contains('toolbar-peek')) {
                mainContentEl.classList.remove('toolbar-peek');
            }
        }
    }

    focusBlock(blockId, animate = false) {
        if (!blockId || !this.isReady) return;
        
        setTimeout(() => {
            const blockEl = this.elements.transformLayer.querySelector(`.block-container[data-id="${blockId}"]`);
            if (blockEl) {
                // --- NEW: Pan and Zoom logic ---
                const blockRect = blockEl.getBoundingClientRect();
                const canvasRect = this.elements.canvasContainer.getBoundingClientRect();
                
                const targetScale = 1; // Or some other desired scale
                const blockWorldPos = {
                    x: parseFloat(blockEl.style.left),
                    y: parseFloat(blockEl.style.top)
                };

                // Center of the canvas viewport
                const targetX = canvasRect.width / 2;
                const targetY = canvasRect.height / 2;

                // Calculate the required pan to center the block
                const newPanX = targetX - (blockWorldPos.x * targetScale);
                const newPanY = targetY - (blockWorldPos.y * targetScale);

                if(animate) {
                    this.elements.transformLayer.style.transition = 'transform 0.5s ease-out';
                }

                this.viewState.pan = { x: newPanX, y: newPanY };
                this.viewState.scale = targetScale;
                this._updateTransform();

                if(animate) {
                    setTimeout(() => {
                        this.elements.transformLayer.style.transition = 'transform 0.1s linear';
                    }, 500);
                }
                
                // --- Highlighting logic (same as PageEditor) ---
                const previouslyHighlighted = this.container.querySelector('.is-highlighted');
                if (previouslyHighlighted) {
                    previouslyHighlighted.classList.remove('is-highlighted');
                }
                blockEl.classList.add('is-highlighted');
                const removeHighlight = () => {
                    blockEl.classList.remove('is-highlighted');
                    document.removeEventListener('click', removeHighlight, { capture: true });
                    document.removeEventListener('keydown', removeHighlight, { capture: true });
                };
                setTimeout(() => {
                    document.addEventListener('click', removeHighlight, { once: true, capture: true });
                    document.addEventListener('keydown', removeHighlight, { once: true, capture: true });
                }, 100);

            } else {
                console.warn(`GraphEditor: Could not find block element with ID "${blockId}" to focus.`);
            }
        }, 100);
    }
    
    // --- ========================================================== ---
    // --- 6. Helper & Utility Methods (Copied from PageEditor)
    // --- ========================================================== ---

    _findBlockInstanceById(blocks, id, parentBlock = null) {
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

    _findBlockInstanceAndParent(id, rootBlocks = this.blocks, parent = null) {
        for (let i = 0; i < rootBlocks.length; i++) {
            const block = rootBlocks[i];
            if (block.id === id) {
                const parentArray = parent ? parent.children : this.blocks;
                return { block, parentInstance: parent, parentArray, index: i };
            }
            if (block.children.length > 0) {
                const found = this._findBlockInstanceAndParent(id, block.children, block);
                if (found) return found;
            }
        }
        return null;
    }

    _generateUUID() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }
    
    // --- Export Logic ---
    async getSanitizedHtml(isForExport = false, exportContext = {}) {
        // For now, we return a placeholder. Exporting a graph is complex and
        // would likely involve rendering to an SVG or a static HTML representation
        // which is beyond the scope of this initial implementation.
        const placeholder = `<div style="padding: 2rem; text-align: center; color: var(--text-secondary);">Graph export is not yet implemented.</div>`;
        return Promise.resolve(placeholder);
    }
    
    async loadContentForRender(blockDataList) {
        // This is a helper for export/preview, which we are deferring.
    }
}


// --- In-file Helper Classes (Copied from PageEditor) ---
// The GraphSelectionManager and GraphReferenceManager classes are identical to those in page-editor.js
// We include them here to keep GraphEditor as a self-contained module.

class GraphSelectionManager {
    constructor(editor) {
        this.selectedBlockIds = new Set();
        this.editor = editor;
    }
    _getEditor() { return this.editor; }
    _updateVisuals() {
        const editor = this._getEditor();
        if (!editor || !editor.container) return;
        editor.container.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
        this.selectedBlockIds.forEach(id => {
            const blockEl = editor.container.querySelector(`.block-container[data-id="${id}"]`);
            if (blockEl) { blockEl.classList.add('is-selected'); }
        });
        editor.updateDetailsPanel();
    }
    toggle(blockId) {
        if (this.selectedBlockIds.has(blockId)) { this.selectedBlockIds.delete(blockId); } 
        else { this.selectedBlockIds.add(blockId); }
        this._updateVisuals();
    }
    set(blockId) {
        if (this.selectedBlockIds.size === 1 && this.selectedBlockIds.has(blockId)) { return; }
        this.selectedBlockIds.clear();
        this.selectedBlockIds.add(blockId);
        this._updateVisuals();
    }
    clear() {
        if (this.selectedBlockIds.size === 0) return;
        this.selectedBlockIds.clear();
        this._updateVisuals();
    }
    get() { return Array.from(this.selectedBlockIds); }
    has(blockId) { return this.selectedBlockIds.has(blockId); }
    size() { return this.selectedBlockIds.size; }
}

class GraphReferenceManager {
    constructor(editor) {
        this.editor = editor;
        this.container = editor.elements.referencesView;
        this.placeholder = this.container.querySelector('.empty-references-placeholder');
        this.draggedItem = null;
        this.isLinkingMode = false;
        this.linkingCallback = null;
        this._initListeners();
        this.render();
    }
    _initListeners() {
        this.container.addEventListener('dragover', this._handleDragOver.bind(this));
        this.container.addEventListener('dragleave', this._handleDragLeave.bind(this));
        this.container.addEventListener('drop', this._handleDrop.bind(this));
        this.container.addEventListener('dragstart', this._handleItemDragStart.bind(this));
        this.container.addEventListener('dragend', this._handleItemDragEnd.bind(this));
        this.container.addEventListener('click', this._handleClick.bind(this));
        this._boundRender = this.render.bind(this);
        window.addEventListener('global:referencesChanged', this._boundRender);
        this._boundHandleBlockUpdate = this._handleBlockUpdateEvent.bind(this);
        window.addEventListener('block:updated', this._boundHandleBlockUpdate);
        this._boundHandleBlockDelete = this._handleBlockDeleteEvent.bind(this);
        window.addEventListener('block:deleted', this._boundHandleBlockDelete);
    }
    destroy() {
        window.removeEventListener('global:referencesChanged', this._boundRender);
        window.removeEventListener('block:updated', this._boundHandleBlockUpdate);
        window.removeEventListener('block:deleted', this._boundHandleBlockDelete);
    }
    _handleBlockDeleteEvent(e) {
        if (e.detail.filePath === this.editor.filePath) {
            this.handleBlockDeletion(e.detail.blockId);
        }
    }
    _handleBlockUpdateEvent(e) {
        if (e.detail.filePath !== this.editor.filePath) return;
        const updatedBlockData = e.detail.blockData;
        if (!updatedBlockData || !updatedBlockData.id) return;
        const refExists = globalState.references.some(r => r && r.blockData && r.blockData.id === updatedBlockData.id);
        if (refExists) { updateGlobalReferenceData(updatedBlockData); }
    }
    cleanupDropIndicator() { this.container.querySelector('.reference-item-drop-indicator')?.remove(); }
    _handleDragOver(e) {
        e.preventDefault();
        const isReorder = e.dataTransfer.types.includes('application/veritnote-reference-reorder');
        if (isReorder) {
            e.dataTransfer.dropEffect = 'move';
            this.cleanupDropIndicator();
            const targetItem = e.target.closest('.reference-item');
            if (targetItem && targetItem !== this.draggedItem) {
                const rect = targetItem.getBoundingClientRect();
                const isAfter = e.clientY > rect.top + rect.height / 2;
                const indicator = document.createElement('div');
                indicator.className = 'reference-item-drop-indicator';
                if (isAfter) { targetItem.parentNode.insertBefore(indicator, targetItem.nextSibling); } 
                else { targetItem.parentNode.insertBefore(indicator, targetItem); }
            }
        } else {
            e.dataTransfer.dropEffect = 'copy';
            this.container.classList.add('drag-over');
        }
    }
    _handleDragLeave(e) {
        if (!this.container.contains(e.relatedTarget)) {
            this.container.classList.remove('drag-over');
            this.cleanupDropIndicator();
        }
    }
    _handleDrop(e) {
        e.preventDefault();
        this.container.classList.remove('drag-over');
        document.body.classList.remove('is-dragging-block');
        if (!this.container.classList.contains('active')) return;
        const isReorder = e.dataTransfer.types.includes('application/veritnote-reference-reorder');
        if (isReorder && this.draggedItem) {
            const indicator = this.container.querySelector('.reference-item-drop-indicator');
            if (indicator) { this.container.insertBefore(this.draggedItem, indicator); } 
            else { this.container.appendChild(this.draggedItem); }
            this.draggedItem.style.display = '';
            const newReferences = [];
            this.container.querySelectorAll('.reference-item').forEach(itemEl => {
                const blockId = itemEl.dataset.blockId;
                const refObject = globalState.references.find(r => r.blockData.id === blockId);
                if (refObject) { newReferences.push(refObject); }
            });
            updateGlobalReferences(newReferences);
            return;
        }
        const multiDragData = e.dataTransfer.getData('application/veritnote-block-ids');
        const singleDragId = e.dataTransfer.getData('text/plain');
        let blockIdsToAdd = [];
        if (multiDragData) { blockIdsToAdd = JSON.parse(multiDragData); } 
        else if (singleDragId) { blockIdsToAdd = [singleDragId]; }
        if (blockIdsToAdd.length > 0) {
            blockIdsToAdd.forEach(blockId => {
                if (globalState.references.some(ref => ref.blockData.id === blockId)) return;
                const blockInstance = this.editor._findBlockInstanceById(this.editor.blocks, blockId)?.block;
                if (blockInstance) { this.addReference(this.editor.filePath, blockInstance.data); }
            });
        }
    }
    _handleItemDragStart(e) {
        const item = e.target.closest('.reference-item');
        if (item) {
            this.draggedItem = item;
            const blockId = item.dataset.blockId;
            const refData = globalState.references.find(r => r.blockData.id === blockId);
            if (refData) { e.dataTransfer.setData('application/veritnote-reference-item', JSON.stringify(refData)); }
            e.dataTransfer.setData('application/veritnote-reference-reorder', blockId);
            e.dataTransfer.effectAllowed = 'copyMove';
            setTimeout(() => { item.style.display = 'none'; }, 0);
        }
    }
    _handleItemDragEnd(e) {
        if (this.draggedItem) {
            this.draggedItem.style.display = '';
            this.draggedItem.classList.remove('dragging');
        }
        this.draggedItem = null;
        this.cleanupDropIndicator();
    }
    async _handleClick(e) {
        if (this.isLinkingMode) {
            const itemEl = e.target.closest('.reference-item');
            if (itemEl && this.linkingCallback) {
                const blockId = itemEl.dataset.blockId;
                const refData = globalState.references.find(r => r.blockData.id === blockId);
                if (refData) { this.linkingCallback(refData); }
            }
            return;
        }
        const deleteBtn = e.target.closest('.reference-item-delete-btn');
        if (deleteBtn) {
            this.removeReference(deleteBtn.closest('.reference-item').dataset.blockId);
            return;
        }
        const itemEl = e.target.closest('.reference-item');
        if (itemEl) {
            const blockId = itemEl.dataset.blockId;
            const refData = globalState.references.find(r => r.blockData.id === blockId);
            if (refData) {
                if (refData.filePath === this.editor.filePath) { this.editor.focusBlock(blockId, true); } 
                else { await this.editor.tabManager.openTab(refData.filePath, blockId); }
            }
        }
    }
    enableLinkingMode(enable, callback = null) {
        this.isLinkingMode = enable;
        this.linkingCallback = enable ? callback : null;
    }
    addReference(filePath, blockData) { addGlobalReference(filePath, blockData); }
    removeReference(blockId) { removeGlobalReference(blockId); }
    render() {
        const scrollPos = this.container.scrollTop;
        this.container.innerHTML = '';
        this.container.appendChild(this.placeholder);
        this.placeholder.style.display = globalState.references.length === 0 ? 'block' : 'none';
        if (globalState.references.length === 0) return;
        const tempEditorContainer = document.createElement('div');
        const tempEditor = new GraphEditor(tempEditorContainer, '', null);
        tempEditor._registerAllBlocks();
        globalState.references.forEach((ref) => {
            const fileName = ref.filePath.substring(ref.filePath.lastIndexOf('\\') + 1).replace('.veritnotegraph', '').replace('.veritnote', '');
            const itemEl = document.createElement('div');
            itemEl.className = 'reference-item';
            itemEl.dataset.blockId = ref.blockData.id;
            itemEl.draggable = true;
            const blockInstance = tempEditor.createBlockInstance(ref.blockData);
            if (!blockInstance) return;
            const renderedBlockEl = blockInstance.render();
            itemEl.innerHTML = `<button class="reference-item-delete-btn">&times;</button><div class="reference-item-title">${fileName}</div><div class="reference-item-preview"></div>`;
            itemEl.querySelector('.reference-item-preview').appendChild(renderedBlockEl);
            this.container.appendChild(itemEl);
        });
        this.container.scrollTop = scrollPos;
    }
    handleBlockUpdate(filePath, blockData) {
        updateGlobalReferenceData(blockData);
        const itemEl = this.container.querySelector(`.reference-item[data-block-id="${blockData.id}"]`);
        if (itemEl) {
            const ref = globalState.references.find(r => r.blockData.id === blockData.id);
            if (ref) { this.updateReferenceItemDOM(itemEl, ref); }
        }
    }
    handleBlockDeletion(blockId) {
        const refExists = globalState.references.some(ref => ref.blockData.id === blockId);
        if (refExists) { removeGlobalReference(blockId); }
    }
    handleHistoryChange(filePath, allBlockData) {
        const pageBlocksMap = new Map();
        const flattenBlocks = (blocks) => {
            if (!blocks) return;
            for (const block of blocks) {
                pageBlocksMap.set(block.id, block);
                if (block.children) flattenBlocks(block.children);
            }
        };
        flattenBlocks(allBlockData);
        let referencesChanged = false;
        let updatedRefs = [];
        for (const ref of globalState.references) {
            if (ref.filePath === filePath) {
                const updatedBlockData = pageBlocksMap.get(ref.blockData.id);
                if (updatedBlockData) { updatedRefs.push({ filePath: ref.filePath, blockData: updatedBlockData }); } 
                else { referencesChanged = true; }
            } else { updatedRefs.push(ref); }
        }
        if (referencesChanged || JSON.stringify(updatedRefs) !== JSON.stringify(globalState.references)) {
             updateGlobalReferences(updatedRefs);
        }
    }
    handleRevertReferences(filePath) {
        const refsToRevert = globalState.references.filter(ref => ref.filePath === filePath);
        if (refsToRevert.length === 0) return;
        const onPageRevertedListener = (loadEvent) => {
            if (loadEvent.detail.payload?.path === filePath) {
                window.removeEventListener('pageLoaded', onPageRevertedListener);
                const savedContent = loadEvent.detail.payload.content;
                if (!savedContent) return;
                const savedBlocksMap = new Map();
                const flattenBlocks = (blocks) => {
                    if (!blocks) return;
                    for (const block of blocks) {
                        savedBlocksMap.set(block.id, block);
                        if (block.children) flattenBlocks(block.children);
                    }
                };
                flattenBlocks(savedContent);
                let changed = false;
                refsToRevert.forEach(refToRevert => {
                    const savedBlockData = savedBlocksMap.get(refToRevert.blockData.id);
                    if (savedBlockData) {
                        const mainRef = globalState.references.find(r => r.blockData.id === refToRevert.blockData.id);
                        if (mainRef) {
                            mainRef.blockData = savedBlockData;
                            changed = true;
                        }
                    }
                });
                if (changed) { window.dispatchEvent(new CustomEvent('global:referencesChanged')); }
            }
        };
        window.addEventListener('pageLoaded', onPageRevertedListener);
        ipc.loadPage(filePath, null);
    }
    updateReferenceItemDOM(itemEl, refData) {
        const tempEditorContainer = document.createElement('div');
        const tempEditor = new GraphEditor(tempEditorContainer, '', null);
        tempEditor._registerAllBlocks();
        const blockInstance = tempEditor.createBlockInstance(refData.blockData);
        if (!blockInstance) return;
        const newPreviewContent = blockInstance.render();
        const previewContainer = itemEl.querySelector('.reference-item-preview');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.appendChild(newPreviewContent);
        }
    }
}