// components/page-editor/page-editor.js

class PageEditor {
    constructor(container, filePath, tabManager, computedConfig) {
        this.container = container; // The wrapper div provided by TabManager
        this.filePath = filePath;
        this.tabManager = tabManager;
        this.computedConfig = computedConfig;

        this.fileConfig = {}; // To store the file's own config header
        
        this.elements = {}; // To store references to DOM elements
        this.mode = 'edit'; // 'edit' or 'preview'
        this.isReady = false; // Flag to check if HTML content is loaded
        
        // --- Core Editor State (from old Editor class) ---
        this.blockRegistry = new Map();
        this.blocks = [];
        this.history = new HistoryManager(this);
        this.activeCommandBlock = null;
        this.draggedBlock = null;
        this.currentDropInfo = null;
        this.activeToolbarBlock = null;
        this.toolbarHideTimeout = null;
        this.currentSelection = null;
        this.richTextEditingState = { isActive: false, blockId: null, savedRange: null };
        this.elements.commandMenuSelectedIndex = 0;
        this.allNotes = []; // For link popover search

         // --- Property to track the currently hovered container's children-container element ---
        this.hoveredChildrenContainer = null;

        // --- Sub-managers for organization ---
        this.PageSelectionManager = new PageSelectionManager(this);
        // The following will be initialized after HTML is loaded
        this.PageReferenceManager = null; 
        this.popoverManager = null;
    }

    // --- ========================================================== ---
    // --- 1. Core Lifecycle Methods
    // --- ========================================================== ---

    async load(blockIdToFocus = null) {
        const response = await fetch('components/page-editor/page-editor.html');
        this.container.innerHTML = await response.text();

        this._acquireElements();

        this.applyConfiguration(this.computedConfig);
        
        // NOTE: For now, we define these managers inside the editor. 
        // In a future refactor, they could become separate files too.
        this.PageReferenceManager = new PageReferenceManager(this); 
        this.popoverManager = new PopoverManager(this);

        this._registerAllBlocks();
        this._initListeners();
        this._initUiState();
        
        this.isReady = true;
        ipc.loadPage(this.filePath, blockIdToFocus);
    }

    onPageContentLoaded(pageData) {
        // 现在我们可以安全地检查 path
        if (!this.isReady || pageData.path !== this.filePath) return;
    
        // 从 pageData 对象中解构出需要的值
        const blockDataList = pageData.content || [];
        const fileConfig = pageData.config || {};
    
        this.fileConfig = fileConfig; 
    
        this.blocks = blockDataList.map(data => this.createBlockInstance(data)).filter(Boolean);
        this.blocks.forEach(block => block.parent = null);
        this.render();
    
        if (this.history.isUndoingOrRedoing) {
            this.PageReferenceManager.handleHistoryChange(this.filePath, blockDataList);
        } else {
            this.history.recordInitialState();
        }
        
        this.tabManager.setUnsavedStatus(this.filePath, false);
    
        // 现在 pageData.blockIdToFocus 是有效的
        if (pageData.blockIdToFocus) {
            this.focusBlock(pageData.blockIdToFocus);
        }
    }

    // Method to apply computed styles
    applyConfiguration(config) {
        this.computedConfig = config;
    
        const backgroundContainers = [this.elements.editBackgroundContainer, this.elements.previewBackgroundContainer];
        const viewContainers = [this.elements.editorAreaContainer, this.elements.previewView];
    
        for (const key in config) {
            const value = config[key];
    
            // --- UNIFIED BACKGROUND LOGIC (Correctly applied) ---
            if (key === 'background' && typeof value === 'object') {
                const bgColor = (value.type === 'color') ? value.value : 'transparent';
                const bgImage = (value.type === 'image' && value.value) ? `url('${value.value.replace(/\\/g, '/')}')` : 'none';
                
                backgroundContainers.forEach(container => {
                    if (container) {
                        container.style.backgroundColor = bgColor;
                        container.style.backgroundImage = bgImage;
                    }
                });
                continue; // Go to the next key
            }
            
            // --- LOGIC FOR ALL OTHER VARIABLES (like max-width, fonts, text colors) ---
            const cssVarName = `--page-${key}`;
            
            // CRITICAL FIX for max-width and other content styles:
            // Apply these variables directly to the view containers where they are used.
            viewContainers.forEach(container => {
                 if (container) {
                    container.style.setProperty(cssVarName, value);
                 }
            });
        }
    }

    /**
     * [INTERFACE METHOD]
     * Called by the main controller when a parent configuration changes.
     * This method re-resolves the file's entire configuration chain and applies it.
     */
    async onConfigurationChanged() {
        console.log(`Configuration change detected for: ${this.filePath}. Re-evaluating styles.`);
        
        // 1. Re-resolve the configuration from the backend
        const resolved = await ipc.resolveFileConfiguration(this.filePath);
        if (!resolved || !resolved.config) {
            console.error("Failed to re-resolve configuration for", this.filePath);
            return;
        }

        // 2. Compute the final config with defaults filled in
        const newComputedConfig = window.computeFinalConfig(resolved.config);

        // 3. Apply the new configuration to the UI
        this.applyConfiguration(newComputedConfig);
    }
    
    // Method for main.js to call when saving config from modal
    setFileConfig(newConfig) {
        this.fileConfig = newConfig;
        this.savePage(); // This will save the blocks AND the new config
    }
    
    onFocus() {
        if (!this.isReady) return;
        this.PageSelectionManager._updateVisuals();
        this.updateToolbarState();
    }
    
    destroy() {
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
            rightSidebar: this.container.querySelector('#right-sidebar'),
            rightSidebarResizer: this.container.querySelector('#right-sidebar-resizer'),
            rightSidebarToggleBtn: this.container.querySelector('#right-sidebar-toggle-btn'),
            rightSidebarViewToggle: this.container.querySelector('#right-sidebar-view-toggle'),
            referencesView: this.container.querySelector('#references-view'),
            detailsView: this.container.querySelector('#details-view'),
            floatingToolbar: this.container.querySelector('#floating-toolbar'),
            toggleToolbarBtn: this.container.querySelector('#toggle-toolbar-btn'),
            toolbarPeekTrigger: this.container.querySelector('#toolbar-peek-trigger'),
            saveBtn: this.container.querySelector('#save-btn'),
            modeToggle: this.container.querySelector('#mode-toggle'),
            commandMenu: this.container.querySelector('#command-menu'),
            blockToolbar: this.container.querySelector('#block-toolbar'),
            blockToolbarGraceArea: this.container.querySelector('#block-toolbar-grace-area'),
            popover: this.container.querySelector('#popover'),
            deleteDropZone: this.container.querySelector('#delete-drop-zone'),
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


        // Add a settings button to the floating toolbar
        this.elements.settingsBtn = document.createElement('button');
        this.elements.settingsBtn.id = 'page-settings-btn';
        this.elements.settingsBtn.className = 'toolbar-icon-btn';
        this.elements.settingsBtn.title = 'Page Settings';
        this.elements.settingsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`; // Add a gear icon SVG
        
        this.elements.floatingToolbar.appendChild(this.elements.settingsBtn);
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
            this.elements.editorAreaContainer.addEventListener('contextmenu', (e) => {
                const blockEl = e.target.closest('.block-container');
                if (blockEl) {
                    e.preventDefault(); // Prevent the default browser context menu
                    const blockInstance = this._findBlockInstanceById(this.blocks, blockEl.dataset.id)?.block;
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
        this.elements.modeToggle.addEventListener('click', (e) => {
            const option = e.target.closest('.mode-toggle-option');
            if (option) { this.switchMode(option.dataset.mode); }
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

        // Listener for the new settings button
        this.elements.settingsBtn.addEventListener('click', () => {
             window.openConfigModal('page', this.filePath);
        });

        // Click listener for hierarchy view in details panel
        this.elements.detailsView.addEventListener('click', (e) => {
            // Target the entire row for a larger click area
            const targetRow = e.target.closest('.details-hierarchy-row');
            if (targetRow && targetRow.dataset.blockId) {
                const blockId = targetRow.dataset.blockId;
                // 1. Update the selection using the selection manager
                this.PageSelectionManager.set(blockId);
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
            deleteZone.addEventListener('dragover', (e) => {
                // *** CRITICAL FIX PART 1 ***
                e.preventDefault(); // This is absolutely necessary to allow a drop.
                e.dataTransfer.dropEffect = 'move'; // Show a "move" cursor, not "disabled".
                
                // Add visual feedback and set the drop info, just like in the main _onDragOver.
                deleteZone.classList.add('is-active');
                this._cleanupDragIndicators(); // Hide any block indicators.
                this.currentDropInfo = { targetId: 'DELETE_ZONE', position: 'inside' };
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
            deleteZone.addEventListener('drop', (e) => {
                // *** CRITICAL FIX PART 2 ***
                e.preventDefault(); // Prevent any default browser action.
                
                // This logic is now self-contained and guaranteed to fire.
                // We can reuse the same logic from the _onDrop method.
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
                
                // Manually call drag end cleanup.
                this._onDragEnd(e);
            });
        }
    }
    
    _initUiState() {
        this.setRightSidebarCollapsed(localStorage.getItem('veritnote_right_sidebar_collapsed') === 'true');
        this.setToolbarCollapsed(localStorage.getItem('veritnote_toolbar_collapsed') === 'true');
    }
    
    _initGlobalEventListeners() {
        document.addEventListener('mousedown', (e) => {
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
                    this.PageSelectionManager.toggle(clickedBlockEl.dataset.id);
                } else {
                    // This is for single-selecting by clicking the block's body
                    this.PageSelectionManager.set(clickedBlockEl.dataset.id);
                }
            } else {
                // This part handles clicking on the editor background, etc.
                const clickedUiChrome = e.target.closest(
                    '#sidebar, #right-sidebar, #tab-bar, #floating-toolbar, #popover, #context-menu, #block-toolbar, .block-controls'
                );
                if (!clickedUiChrome) {
                    this.PageSelectionManager.clear();
                }
            }
        });

        document.addEventListener('selectionchange', this._onSelectionChange.bind(this));
        
        // These window listeners are for IPC events. They need a check to see if the event is for this editor.
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
            const anySearchInput = popoverElement.querySelector('#link-popover-input'); // only one type has an input
            if (popoverElement.style.display === 'block' && anySearchResults) {
                const query = anySearchInput ? anySearchInput.value : '';
                this.updateSearchResults(query, anySearchResults);
            }
        });

        window.addEventListener('quoteContentLoaded', (e) => {
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

            if (!targetTab || !targetTab.instance) {
                return;
            }
            const targetEditor = targetTab.instance;

            if (error) {
                console.error(`Error loading quote content for block ${targetBlockId} in tab ${targetTab.path}:`, error);
            }
            
            // --- Make content handling robust ---
            const renderContentToDom = (container) => {
                container.innerHTML = ''; 
                
                // This logic is now robust against different content formats
                let blocksToRender = [];
                if (Array.isArray(content)) {
                    blocksToRender = content;
                } else if (content && typeof content === 'object' && Array.isArray(content.blocks)) {
                    // This handles the case where the old C++ code might send the full page object
                    blocksToRender = content.blocks;
                }

                if (!blocksToRender || blocksToRender.length === 0) {
                    container.innerHTML = '<div class="quote-error-placeholder">Referenced content could not be found.</div>';
                } else {
                    const blockInstances = blocksToRender.map(data => targetEditor.createBlockInstance(data)).filter(Boolean);
                    blockInstances.forEach(block => {
                        container.appendChild(block.render());
                    });
                }
            };

            if (targetEditor.mode === 'preview') {
                const quoteElement = targetEditor.elements.previewView.querySelector(`.block-container[data-id="${targetBlockId}"]`);
                if (quoteElement) {
                    const previewContainer = quoteElement.querySelector('.quote-preview-container');
                    if (previewContainer) {
                        renderContentToDom(previewContainer);
                    }
                }
            } else {
                const blockInstance = targetEditor._findBlockInstanceById(targetEditor.blocks, targetBlockId)?.block;
                if (blockInstance && typeof blockInstance.renderQuotedContent === 'function') {
                    
                    // --- Also apply the fix here for consistency ---
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
            }
        });


        window.addEventListener('page:saved', (e) => {
    const savedPath = e.detail.path;
    if (!savedPath) return;

    // 遍历所有打开的标签页
    this.tabManager.tabs.forEach(tab => {
        // 如果当前标签页的编辑器实例存在
        if (tab.instance && tab.instance.blocks) {
            // 递归查找所有QuoteBlock实例
            const findQuotesRecursive = (blocks) => {
                blocks.forEach(blockInstance => {
                    if (blockInstance.type === 'quote' && blockInstance.properties.referenceLink) {
                        const referenceLink = blockInstance.properties.referenceLink;
                        const referencedPagePath = window.resolveWorkspacePath(referenceLink.split('#')[0]);

                        // 如果这个引用块确实引用了刚刚被保存的文件
                        if (savedPath === referencedPagePath) {
                            console.log(`Found a quote block (${blockInstance.id}) in tab "${tab.path}" that needs updating.`);

                            const [pathPart, blockIdPart] = referenceLink.split('#');
                            const absolutePath = window.resolveWorkspacePath(pathPart);
                            const absoluteReferenceLink = blockIdPart ? `${absolutePath}#${blockIdPart}` : absolutePath;
                            
                            // 使用 "tab.id::block.id" 格式发送请求，确保响应能被正确路由
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
    // --- 3. Block Management (from old Editor class)
    // --- ========================================================== ---

    _registerAllBlocks() {
        const ALL_BLOCK_CLASSES = [
            ParagraphBlock,
            Heading1Block,
            Heading2Block,
            ImageBlock,
            LinkButtonBlock,
            CalloutBlock,
            ColumnsBlock,
            ColumnBlock,
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

    /**
     * Registers a Block class so the editor knows how to create it.
     * @param {typeof Block} blockClass - The class constructor of the block to register.
     */
    registerBlock(blockClass) {
        if (blockClass.type) {
            this.blockRegistry.set(blockClass.type, blockClass);
        } else {
            console.error("Block class is missing a static 'type' property and cannot be registered.", blockClass);
        }
    }

    /**
     * Creates an instance of a registered block.
     * @param {object} blockData - The data for the block (type, id, etc.).
     * @returns {Block | null} An instance of the corresponding Block class.
     */
    createBlockInstance(blockData) {
        const BlockClass = this.blockRegistry.get(blockData.type);
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
        // Special handling for columns, which might need resizers between them
        this._postRenderProcess();
    }

    /**
     * Post-render tasks, like adding column resizers.
     * This is necessary because resizers need to know about their neighbors.
     * @private
     */
    _postRenderProcess() {
        this.container.querySelectorAll('.block-content[data-type="columns"]').forEach(columnsEl => {
            const columnsBlock = this._findBlockInstanceById(this.blocks, columnsEl.dataset.id)?.block;
            if (!columnsBlock || columnsBlock.children.length <= 1) return;

            for (let i = 1; i < columnsBlock.children.length; i++) {
                const leftCol = columnsBlock.children[i - 1];
                const rightCol = columnsBlock.children[i];
                const resizer = this._createColumnResizer(leftCol, rightCol);
                
                // Insert resizer between the column elements
                const leftColEl = columnsBlock.element.querySelector(`.block-content[data-id="${leftCol.id}"]`);
                if (leftColEl && leftColEl.nextSibling) {
                    leftColEl.parentElement.insertBefore(resizer, leftColEl.nextSibling);
                }
            }
        });
    }

    deleteBlock(blockInstance, recordHistory = true) {
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

    deleteMultipleBlocks(blockIds) {
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

    insertNewBlockAfter(targetBlock, type = 'paragraph') {
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
        
        newBlockInstance.focus();
        this.emitChange(true, 'insert-block');
    }

    // --- ========================================================== ---
    // --- 4. Editor Actions & Event Handlers
    // --- ========================================================== ---

    savePage() {
        if (!this.isReady) return;
        // 调用 getBlocksForSaving() 来获取要保存的数据
        const blocksToSave = this.getBlocksForSaving();

        ipc.savePage(this.filePath, blocksToSave, this.fileConfig); 
    
        this.tabManager.setUnsavedStatus(this.filePath, false);
        window.dispatchEvent(new CustomEvent('page:saved', { detail: { path: this.filePath } }));
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
    emitChange(recordHistory = true, actionType = 'unknown', blockInstance = null) {
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
                        filePath: this.filePath,
                        blockData: currentBlockData
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

    /**
     * Gets all block data ready for saving.
     * @returns {Array<object>} An array of serializable block data objects.
     */
    getBlocksForSaving() {
        return this.blocks.map(block => block.data);
    }

    // --- Event Handlers ---
    _onInput(e) {
        const blockEl = e.target.closest('[data-id]');
        if (!blockEl) return;

        const blockInstance = this._findBlockInstanceById(this.blocks, blockEl.dataset.id)?.block;
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
                const blockId = blockContainerEl.dataset.id;
                const isMultiSelectKey = e.ctrlKey || e.metaKey || e.shiftKey;
                if (isMultiSelectKey) {
                    this.PageSelectionManager.toggle(blockId);
                } else {
                    this.PageSelectionManager.set(blockId);
                }
            }
            return;
        }
    
        // --- 优先级 2: 检查点击目标是否是容器的背景或其激活的留白区 ---
        // The target will be the container itself if its background is clicked,
        // or if its ::after pseudo-element is clicked.
        if (e.target.matches('.block-children-container.show-add-area, .callout-content-wrapper.show-add-area, .table-cell-content')) {
            // Find the closest parent element with a data-id, which represents the block instance
            const containerElement = e.target.closest('[data-id]');
            if (containerElement) {
                const containerInstance = this._findBlockInstanceAndParent(containerElement.dataset.id)?.block;
                
                // Ensure it's a container and NOT a column (columns have their own logic)
                if (containerInstance && containerInstance.isContainer && containerInstance.type !== 'column') {
                    this._appendNewBlockToContainer(containerInstance);
                    return;
                }
            }
        }
    
        // --- 优先级 3: Column 的特殊点击逻辑 (保持不变) ---
        // 只有当上面的逻辑没有命中时，才会检查 Column。
        // 这就解决了 List 干扰 Column 的问题。
        if (e.target.matches('.block-content[data-type="column"]')) {
            const columnId = e.target.dataset.id;
            const columnInstance = this._findBlockInstanceAndParent(columnId)?.block;
            if (columnInstance) {
                this._appendNewBlockToContainer(columnInstance);
                return;
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
    async _onPreviewClick(e) {
        // 使用 .closest() 寻找被点击的元素或其祖先元素中符合条件的链接
        const link = e.target.closest('a.internal-link');

        if (link) {
            e.preventDefault(); // 阻止 a[href="#"] 的默认跳转行为

            const internalLink = link.dataset.internalLink;
            if (!internalLink) return;

            // 1. 将链接分割为文件路径和可能的块ID（哈希部分）
            let [filePath, blockId] = internalLink.split('#');
            blockId = blockId || null; // 如果没有哈希，确保 blockId 为 null

            // 2. 使用全局辅助函数将相对工作区路径解析为绝对路径
            const absolutePath = window.resolveWorkspacePath(filePath);

            // 3. 调用 TabManager 来打开或切换到目标标签页
            // openTab 方法足够智能，如果标签页已打开，它会切换过去，
            // 并将 blockId 传递给编辑器以滚动到指定块。
            await this.tabManager.openTab(absolutePath, blockId);
        }
    }

    _onBackgroundClick() {
        // 如果编辑器中已经有块，并且最后一个块是空的段落，则直接聚焦它，而不是创建新块
        const lastBlock = this.blocks[this.blocks.length - 1];
        if (lastBlock && lastBlock.type === 'paragraph' && (!lastBlock.content || lastBlock.content === '<br>')) {
            lastBlock.focus();
            return;
        }

        const newBlock = this.createBlockInstance({ type: 'paragraph' });
        this.blocks.push(newBlock);
        
        const newBlockEl = newBlock.render(); // 使用 .render()
        // 确保添加到 #editor-area-container，而不是 this.container
        this.elements.editorAreaContainer.appendChild(newBlockEl); 
        
        newBlock.focus();
        this.emitChange(true, 'create-block');
    }

    _appendNewBlockToContainer(containerBlock) {
        const newBlockInstance = this.createBlockInstance({ type: 'paragraph' });
        
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
            // 如果由于某种原因 childrenContainer 不存在，提供一个健壮的回退
            console.warn(`Block type "${containerBlock.type}" is a container but lacks a .childrenContainer reference. Appending to .element as a fallback.`);
            containerBlock.element.appendChild(newBlockEl);
        }
        
        newBlockInstance.focus();
        this.emitChange(true, 'create-block');
    }

    _onSelectionChange() {
        const selection = document.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (this.container.contains(range.startContainer)) {
                this.currentSelection = range;
            }
        }
    }

    // --- Global Keydown Handler ---
    onKeyDown(e) {
        const activeTab = tabManager.getActiveTab();
        if (!activeTab) return;
        const activeEditor = activeTab.editor;
    
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.PageSelectionManager.size() > 0) {
            
            // First, check if the user is actively editing text.
            const activeEl = document.activeElement;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
                // If the focus is inside any editable field, DO NOTHING here.
                // Let the browser's default behavior (deleting a character) or the
                // block's own keydown handler (like deleting an empty block) take over.
                return;
            }
    
            // If we reach this point, it means the user is not focused on an input field.
            // It's now safe to assume they intend to delete the selected block(s).
            
            e.preventDefault(); // Prevent default browser actions (like navigating back).
            
            const idsToDelete = this.PageSelectionManager.get();
            this.deleteMultipleBlocks(idsToDelete); // 'this' 就是 activeEditor
            this.PageSelectionManager.clear();
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
    _onEditorKeyDown(e) {
        // --- Priority 1: Slash Command Menu Navigation ---
        // If the command menu is visible, it intercepts arrow keys and Enter to navigate the menu.
        if (this.elements.commandMenu.style.display === 'block') {
            const items = this.elements.commandMenu.querySelectorAll('.command-item');
            if (items.length > 0) {
                switch (e.key) {
                    case 'ArrowUp':
                        e.preventDefault();
                        this.elements.commandMenuSelectedIndex = (this.elements.commandMenuSelectedIndex - 1 + items.length) % items.length;
                        this._updateCommandMenuSelection();
                        return; // Stop further processing

                    case 'ArrowDown':
                        e.preventDefault();
                        this.elements.commandMenuSelectedIndex = (this.elements.commandMenuSelectedIndex + 1) % items.length;
                        this._updateCommandMenuSelection();
                        return; // Stop further processing

                    case 'Enter':
                    case 'Tab': // Treat Tab as confirmation as well
                        e.preventDefault();
                        items[this.elements.commandMenuSelectedIndex].click(); // Simulate a click
                        return; // Stop further processing
                }
            }
        }
        
        // --- Priority 2: Deleting Selected Blocks ---
        // This logic is transplanted from the old main.js global keydown listener.
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.PageSelectionManager.size() > 0) {
            // First, check if the user is actively editing text inside an input field or a contenteditable element.
            const activeEl = document.activeElement;
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
                
                const idsToDelete = this.PageSelectionManager.get();
                this.deleteMultipleBlocks(idsToDelete);
                this.PageSelectionManager.clear();
                return; // We've handled the event, so we're done.
            }
        }

        // --- Priority 3: Forwarding to the Block Instance ---
        // This is the original logic from the old editor.js _onKeyDown.
        // It finds the block where the key was pressed and calls its onKeyDown method.
        const contentEl = e.target.closest('.block-content, .list-item-text-area');
        if (!contentEl) return;
        
        const blockId = contentEl.dataset.id || contentEl.closest('[data-id]')?.dataset.id;
        if (!blockId) return;

        const blockInstance = this._findBlockInstanceAndParent(blockId)?.block;
        if (blockInstance && typeof blockInstance.onKeyDown === 'function') {
            // A small but important detail from the original code:
            // Sync content before processing 'Enter' to ensure the latest text is saved.
             if (e.key === 'Enter' && !e.shiftKey) {
                blockInstance.syncContentFromDOM();
            }
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
    showCommandMenuForBlock(blockInstance) {
        const blockEl = blockInstance.contentElement;
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

            // Wait for the animation to finish before setting display to none
            setTimeout(() => {
                // Check again in case it was re-opened quickly
                if (!this.elements.commandMenu.classList.contains('is-visible')) {
                    this.elements.commandMenu.style.display = 'none';
                }
            }, 150); // Match the CSS transition duration
            
            this.elements.commandMenuSelectedIndex = 0;

            if (this._handleDocumentClickForMenu) {
                document.removeEventListener('mousedown', this._handleDocumentClickForMenu);
                this._handleDocumentClickForMenu = null; // Clean up the reference
            }
        }
    }

    /**
     * Filters the registered block commands based on a search term.
     * @param {string} searchTerm The term to filter by.
     * @returns {Array<object>} An array of matching command objects.
     * @private
     */
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

    /**
     * Renders the command menu's inner HTML from a list of commands.
     * @param {Array<object>} commands - The command objects to render.
     * @private
     */
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

    /**
     * The single source of truth for managing the command menu's state.
     * Decides whether to show, update, or hide the menu based on block content.
     * @param {Block} blockInstance The block instance that may trigger the menu.
     * @private
     */
    _handleCommandMenuLifecycle(blockInstance) {
        const content = blockInstance.contentElement.textContent || '';

        // --- DECISION 1: Should the menu exist at all? ---
        // If content doesn't start with '/', hide and exit immediately.
        if (!content.startsWith('/')) {
            this.hideCommandMenu();
            return;
        }

        // --- DECISION 2: Are there any commands to show? ---
        const searchTerm = content.substring(1);
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
            if (index === this.elements.commandMenuSelectedIndex) {
                item.classList.add('selected');
                // Ensure the selected item is visible in the scrollable area
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
            const newBlockData = { id: targetBlock.id, type: newType };
            const newBlockInstance = this.createBlockInstance(newBlockData);
            if (newBlockInstance) {
                parentArray.splice(index, 1, newBlockInstance);
                
                const oldEl = targetBlock.element;
                const newEl = newBlockInstance.render();
                oldEl.parentElement.replaceChild(newEl, oldEl);
                
                newBlockInstance.focus();
            }
        } else {
            // Insert a new block after (reusing the new partial-rendering function)
            this.insertNewBlockAfter(targetBlock, newType);
        }

        this.hideCommandMenu();
        this.emitChange(true, 'create-block');
    }

    // --- Drag & Drop Handlers ---
    _onDragStart(e) {
        const blockContainer = e.target.closest('.block-container');
        if (blockContainer) {
            const blockId = blockContainer.dataset.id;
            const isMultiDrag = this.PageSelectionManager && this.PageSelectionManager.size() > 1 && this.PageSelectionManager.has(blockId);

            this.draggedBlock = blockContainer; // Keep this for visual feedback (opacity)

            if (isMultiDrag) {
                // --- MULTI-DRAG LOGIC ---
                // Get all selected IDs, but ensure the actually dragged block is first in the list.
                // This helps in re-ordering them correctly on drop.
                const selectedIds = this.PageSelectionManager.get();
                const orderedIds = [blockId, ...selectedIds.filter(id => id !== blockId)];
                
                e.dataTransfer.setData('application/veritnote-block-ids', JSON.stringify(orderedIds));
                
                // Add a class to all selected blocks for visual feedback
                orderedIds.forEach(id => {
                    const el = this.container.querySelector(`.block-container[data-id="${id}"]`);
                    if (el) el.classList.add('is-dragging-ghost');
                });
                
            } else {
                // --- SINGLE-DRAG LOGIC (unchanged) ---
                this.PageSelectionManager.clear(); // Clear selection if starting a single drag
                e.dataTransfer.setData('text/plain', blockId);
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
    _setActiveContainerAddArea(containerBlockInstance) {
        // Deactivate the previously active one, if any.
        if (this.hoveredChildrenContainer) {
            this.hoveredChildrenContainer.classList.remove('show-add-area');
            this.hoveredChildrenContainer.classList.remove('is-drop-target-child'); // Also clean up drag class
        }
    
        this.hoveredChildrenContainer = null;
    
        // Activate the new one, if it's a valid container.
        if (containerBlockInstance && containerBlockInstance.isContainer && containerBlockInstance.childrenContainer) {
            const childrenContainer = containerBlockInstance.childrenContainer;
            
            // The class to add depends on whether we are dragging or not.
            const className = document.body.classList.contains('is-dragging-block') 
                ? 'is-drop-target-child' 
                : 'show-add-area';
    
            childrenContainer.classList.add(className);
            this.hoveredChildrenContainer = childrenContainer;
        }
    }

_onDragOver(e) {
    e.preventDefault();
    
    // --- Part 1: Handle external zones (Delete, Right Sidebar) ---
    // This logic is self-contained and correct.
    // ... (keep the existing logic for delete zone and right sidebar here) ...
    const deleteZone = this.elements.deleteDropZone;
    if (deleteZone && deleteZone.contains(e.target)) {
        deleteZone.classList.add('is-active');
        e.dataTransfer.dropEffect = 'move'; 
        this._cleanupDragIndicators();
        this._setActiveContainerAddArea(null);
        this.currentDropInfo = { targetId: 'DELETE_ZONE', position: 'inside' };
        return;
    } else if (deleteZone) {
        deleteZone.classList.remove('is-active');
    }
    if (e.target.closest('#right-sidebar')) {
        this._cleanupDragIndicators();
        this._setActiveContainerAddArea(null);
        this.currentDropInfo = null;
        const referencesView = document.getElementById('references-view');
        if (referencesView && referencesView.classList.contains('active')) {
            e.dataTransfer.dropEffect = 'copy';
            window.dispatchEvent(new CustomEvent('block:dragover:right-sidebar')); 
        } else {
            e.dataTransfer.dropEffect = 'none';
        }
        return;
    }

    // --- Part 2: Handle dragging over the main editor area ---
    
    // *** NEW: Precise Target Identification Logic ***
    let targetEl = null;
    let targetBlockInstance = null;
    
    // Priority 1: Check for the most specific container first - a table cell.
    const cellEl = e.target.closest('.table-cell-content');
    if (cellEl) {
        targetEl = cellEl; // The cell itself is our logical target element
        targetBlockInstance = this._findBlockInstanceById(this.blocks, cellEl.dataset.id)?.block;
    } else {
        // Priority 2: If not a cell, check for a standard block container.
        const containerEl = e.target.closest('.block-container');
        if (containerEl) {
            targetEl = containerEl;
            targetBlockInstance = this._findBlockInstanceById(this.blocks, containerEl.dataset.id)?.block;
        }
    }
    
    // If no valid target found, or over a ghost, clean up and exit.
    if (!targetEl || !targetBlockInstance || targetEl.classList.contains('is-dragging-ghost')) {
        this._cleanupDragIndicators();
        this._setActiveContainerAddArea(null);
        this.currentDropInfo = null;
        return;
    }

    // --- At this point, we have a guaranteed, precise targetEl and targetBlockInstance ---

    // 1. Determine the base drop position.
    const rect = targetEl.getBoundingClientRect();
    const yMidpoint = rect.top + rect.height / 2;
    const xZone = rect.width * 0.15;

    let position = 'after'; // Default
    if (targetBlockInstance.type !== 'tableCell' && e.clientX < rect.left + xZone) {
        // Column creation only works for non-cell blocks
        position = 'left';
    } else if (targetBlockInstance.type !== 'tableCell' && e.clientX > rect.right - xZone) {
        position = 'right';
    } else if (e.clientY < yMidpoint) {
        position = 'before';
    }
    
    // 2. SPECIAL CASE: Override to 'inside_last' if it's a container
    //    and the mouse is not in the top/bottom edge zones.
    const isContainer = targetBlockInstance.isContainer;
    const verticalBuffer = Math.min(rect.height * 0.3, 20); // Use a slightly larger buffer

    if (isContainer && e.clientY > rect.top + verticalBuffer && e.clientY < rect.bottom - verticalBuffer) {
        position = 'inside_last';
    }

    // 3. Update data state.
    this.currentDropInfo = { targetId: targetEl.dataset.id, position: position };

    // 4. Update UI based on the final determined position.
    this._cleanupDragIndicators();

    switch (position) {
        case 'before':
        case 'after':
            this._setActiveContainerAddArea(null);
            this._showHorizontalIndicator(targetEl, position);
            break;
        case 'left':
        case 'right':
            this._setActiveContainerAddArea(null);
            this._showVerticalIndicator(targetEl, position);
            break;
        case 'inside_last':
            this._setActiveContainerAddArea(targetBlockInstance);
            break;
        default:
            this._setActiveContainerAddArea(null);
            break;
    }
}

    _onDragLeave(e) {  }

    _onDrop(e) {
        // --- Check for reference item drop at the very beginning ---
        const refItemDataStr = e.dataTransfer.getData('application/veritnote-reference-item');
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
    
        const multiDragData = e.dataTransfer.getData('application/veritnote-block-ids');
        const singleDragId = e.dataTransfer.getData('text/plain');
    
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
        
        const draggedIds = multiDragData ? JSON.parse(multiDragData) : [singleDragId];
        if (draggedIds.includes(targetId)) return;
    
        draggedIds.forEach(id => {
            const blockInfo = this._findBlockInstanceAndParent(id);
            if (blockInfo?.block) blockInfo.block.syncContentFromDOM();
        });
        if (targetBlockInfo?.block) {
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
        let parentToRender = toParentInstance || { element: this.container, children: this.blocks };
        let containerElement = parentToRender.childrenContainer || parentToRender.element;
        let needsFullRender = false;
    
        switch (position) {
            case 'left':
            case 'right':
                this._handleColumnDrop(finalRemovedBlocks, targetBlockInstance, position);
                needsFullRender = true;
                break;
             case 'before':
            case 'after': { 
                const parentEl = targetBlockInstance.element.parentElement;
                if (!parentEl) {
                    needsFullRender = true;
                    break;
                }
                const insertIndex = (position === 'before') ? toIndex : toIndex + 1;
                toParentArray.splice(insertIndex, 0, ...finalRemovedBlocks);
                const anchorNode = (position === 'before') ? targetBlockInstance.element : targetBlockInstance.element.nextSibling;
                finalRemovedBlocks.forEach(block => {
                    const newEl = block.render();
                    parentEl.insertBefore(newEl, anchorNode);
                });
                break;
            }
    
            case 'inside_last':
                if (targetBlockInstance.isContainer) {
                    targetBlockInstance.children.push(...finalRemovedBlocks);
                    const containerElement = targetBlockInstance.childrenContainer || targetBlockInstance.contentElement;
                    
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
        this.PageSelectionManager.clear();
        
        // --- 核心修改：统一事件通知 ---
        // 1. 从 _cleanupData 获取被修改的容器
        const { structuralChange, modifiedContainerIds } = this._cleanupData();
    
        if (needsFullRender || structuralChange) {
            this.render();
        } else {
            this._postRenderProcess();
        }
        
        // 2. 收集所有受影响的父容器
        const affectedParents = new Set();
        // (a) 添加被拖拽块的原始父容器
        allBlockInfos.forEach(info => {
            if (info.parentInstance) {
                affectedParents.add(info.parentInstance);
            }
        });
    
        // (b) 添加拖放的目标父容器
        if (position === 'inside_last' && targetBlockInstance.isContainer) {
            // 如果是拖入容器内部，目标容器就是 targetBlockInstance 本身
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

    _handleColumnDrop(draggedBlocks, targetBlockInstance, position) {
        const { parentArray, index: targetIndex, parentInstance } = this._findBlockInstanceAndParent(targetBlockInstance.id);

        // Scene A: Target is already a column inside a Columns block.
        if (parentInstance && parentInstance.type === 'columns') {
            // Create a new column to hold the dropped blocks
            const newColumn = this.createBlockInstance({ type: 'column' });
            newColumn.children.push(...draggedBlocks);
            
            // Insert the new column next to the target column
            const insertIndex = position === 'left' ? targetIndex : targetIndex + 1;
            parentInstance.children.splice(insertIndex, 0, newColumn);
            
            // Rebalance widths of all columns in the container
            const numCols = parentInstance.children.length;
            parentInstance.children.forEach(col => col.properties.width = 1 / numCols);
        } else {
            // Scene B: Two or more blocks merge into a brand new Columns block.
            
            // First, create a column for the target block
            const targetColumn = this.createBlockInstance({ type: 'column' });
            targetColumn.children.push(targetBlockInstance);
            
            // Second, create a column for ALL the dragged blocks
            const draggedColumn = this.createBlockInstance({ type: 'column' });
            draggedColumn.children.push(...draggedBlocks);
            
            // Third, create the main Columns container
            const newColumnsContainer = this.createBlockInstance({ type: 'columns' });
            
            // Arrange the new columns based on the drop position
            if (position === 'left') {
                newColumnsContainer.children.push(draggedColumn, targetColumn);
            } else { // 'right'
                newColumnsContainer.children.push(targetColumn, draggedColumn);
            }
            
            // Finally, replace the original target block with the new columns container in the DOM tree
            parentArray.splice(targetIndex, 1, newColumnsContainer);
        }
    }

    _cleanupData() {
        // structuralChange is now only used for the return value for render() decision
        let structuralChange = false; 
        const modifiedContainerIds = new Set(); // <--- 新增：用于记录被修改的容器
    
        const traverseAndClean = (blocks, parent) => {
            for (let i = blocks.length - 1; i >= 0; i--) {
                const block = blocks[i];
    
                if (block.children && block.children.length > 0) {
                    traverseAndClean(block.children, block);
                }
    
                if (block.type === 'columns') {
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
            if (this.hoveredChildrenContainer) {
                 this.hoveredChildrenContainer.classList.remove('show-add-area', 'is-drop-target-child');
            }
            this.container.querySelectorAll('.is-drop-target').forEach(el => {
                el.classList.remove('is-drop-target');
            });
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

    _showHorizontalIndicator(targetEl, position) {
        this._cleanupDragIndicators(); // Clean up here to ensure only one indicator exists
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        
        // --- THE FIX ---
        // Instead of setting left/width, we make it a block element and let it
        // be positioned relative to its new parent in the DOM.
        indicator.style.width = '100%'; // It should span the full width of its container context.
        indicator.style.position = 'relative'; // Ensure it flows within the document layout.
        
        if (position === 'before') {
             targetEl.parentElement.insertBefore(indicator, targetEl);
        } else if (position === 'after') {
            // insertAfter logic
            targetEl.parentElement.insertBefore(indicator, targetEl.nextSibling);
        } else if (position === 'inside_last') {
            const contentWrapper = targetEl.querySelector('.callout-content-wrapper, .block-content[data-type="column"]');
            if (contentWrapper) {
                indicator.style.width = 'auto'; // Let it fit inside the container
                indicator.style.margin = '0 4px'; // Add some margin
                contentWrapper.appendChild(indicator);
            }
        }
    }

    _showVerticalIndicator(targetEl, position) {
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator-vertical';
        indicator.style.height = `${targetEl.offsetHeight}px`;
        if (position === 'left') {
            indicator.style.left = '0';
        } else { // right
            indicator.style.right = '0';
        }
        targetEl.appendChild(indicator);
    }

    _createColumnResizer(leftColumn, rightColumn) {
        const resizer = document.createElement('div');
        resizer.className = 'column-resizer';

        // 找到共同的父级 ColumnsBlock 实例
        const parentColumnsBlock = this._findBlockInstanceAndParent(leftColumn.id)?.parentInstance;

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
        
            // 如果找不到父级，则不执行任何操作
            if (!parentColumnsBlock || !parentColumnsBlock.contentElement) return;

            const startX = e.clientX;
            const leftInitialWidth = leftColumn.properties.width;
            const rightInitialWidth = rightColumn.properties.width;
        
            const onMouseMove = (moveEvent) => {
                // 关键修复：从稳定的 JS 实例获取父容器宽度
                const parentWidth = parentColumnsBlock.contentElement.offsetWidth;
                if (parentWidth === 0) return;

                const deltaX = moveEvent.clientX - startX;
                const deltaPercentage = deltaX / parentWidth;
            
                let newLeftWidth = leftInitialWidth + deltaPercentage;
                let newRightWidth = rightInitialWidth - deltaPercentage;

                // 限制最小宽度，防止一列完全消失
                const minWidth = 0.1; // 10%
                if (newLeftWidth < minWidth || newRightWidth < minWidth) return;

                // 直接更新 DOM 以提供实时反馈
                leftColumn.contentElement.style.width = `${newLeftWidth * 100}%`;
                rightColumn.contentElement.style.width = `${newRightWidth * 100}%`;
            };

            const onMouseUp = (upEvent) => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            
                const parentWidth = parentColumnsBlock.contentElement.offsetWidth;
                if (parentWidth === 0) return;

                const deltaX = upEvent.clientX - startX;
                const deltaPercentage = deltaX / parentWidth;
            
                let finalLeftWidth = leftInitialWidth + deltaPercentage;
                let finalRightWidth = rightInitialWidth - deltaPercentage;

                // 最终计算时再次确保不小于最小宽度
                const minWidth = 0.1;
                if (finalLeftWidth < minWidth) {
                    finalRightWidth += (finalLeftWidth - minWidth);
                    finalLeftWidth = minWidth;
                }
                if (finalRightWidth < minWidth) {
                    finalLeftWidth += (finalRightWidth - minWidth);
                    finalRightWidth = minWidth;
                }

                // 关键：将最终计算出的比例保存回数据模型
                leftColumn.properties.width = finalLeftWidth;
                rightColumn.properties.width = finalRightWidth;
            
                this.emitChange(true, 'resize-column');
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        return resizer;
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

        this.popoverManager.showReferenceDrop({
            targetElement: popoverAnchor,
            callback: (action) => {
                this._executeReferenceDropAction(action, refData, targetBlockInfo, position);
            }
        });

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

    _executeReferenceDropAction(action, refData, targetBlockInfo, position) {
        let newBlockInstance;
        const relativeFilePath = window.makePathRelativeToWorkspace(refData.filePath);

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
    _insertBlockAtPosition(blockToInsert, targetInfo, position) {
        const { block: targetBlockInstance, parentArray: toParentArray, index: toIndex, parentInstance: toParentInstance } = targetInfo;
        
        const parentDomElement = targetBlockInstance.element.parentElement;
        
        if (!parentDomElement) {
            console.error("Cannot insert block: target element has no parent DOM node.");
            return;
        }
        
        const newEl = blockToInsert.render();

        switch (position) {
            case 'before':
                toParentArray.splice(toIndex, 0, blockToInsert);
                // 使用正确的父节点
                parentDomElement.insertBefore(newEl, targetBlockInstance.element);
                break;
            case 'after':
                toParentArray.splice(toIndex + 1, 0, blockToInsert);
                // 使用正确的父节点
                parentDomElement.insertBefore(newEl, targetBlockInstance.element.nextSibling);
                break;
            case 'inside_last':
                if (targetBlockInstance.isContainer) {
                    targetBlockInstance.children.push(blockToInsert);
                    // 这里的逻辑是正确的，因为它是在容器内部追加
                    const targetContainerEl = targetBlockInstance.childrenContainer || targetBlockInstance.contentElement;
                    if(targetContainerEl) {
                        targetContainerEl.appendChild(newEl);
                    } else {
                        // Fallback: 如果找不到特定的子容器，就追加到 block 元素自身
                        targetBlockInstance.element.appendChild(newEl);
                    }
                } else {
                    // Fallback: 如果拖放到非容器内部，行为同 'after'
                    toParentArray.splice(toIndex + 1, 0, blockToInsert);
                    // 使用正确的父节点
                    parentDomElement.insertBefore(newEl, targetBlockInstance.element.nextSibling);
                }
                break;
            case 'left':
            case 'right':
                this._handleColumnDrop([blockToInsert], targetBlockInstance, position);
                this.render(); // render() 会处理好 DOM 结构，所以是安全的
                break;
        }

        if (newEl && typeof blockToInsert.focus === 'function') {
            blockToInsert.focus();
        }
    }
    
    // --- Block Toolbar Handlers ---
    _onBlockMouseOver(e) {
        // --- Part 1: Block Toolbar Logic (existing) ---
        const targetEl = e.target.closest('.block-container');
        if (targetEl && targetEl !== this.activeToolbarBlock?.element) {
            clearTimeout(this.toolbarHideTimeout);
            const blockInstance = this._findBlockInstanceById(this.blocks, targetEl.dataset.id)?.block;
            if (blockInstance) {
                this._showBlockToolbar(blockInstance);
            }
        }
    
        // --- Part 2: MODIFIED Add Area Logic ---
        const hoveredBlockEl = e.target.closest('.block-container, .table-cell-content');
        if (hoveredBlockEl) {
            const blockInstance = this._findBlockInstanceById(this.blocks, hoveredBlockEl.dataset.id)?.block;
            // Use the new helper method to handle activation.
            this._setActiveContainerAddArea(blockInstance);
        }
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
    
        // --- Part 2: MODIFIED Add Area Logic ---
        // Check if the mouse has moved to an element that is NOT a descendant of the hovered block.
        const currentHoveredBlockEl = this.hoveredChildrenContainer?.closest('.block-container, .table-cell-content');
        if (currentHoveredBlockEl && !currentHoveredBlockEl.contains(e.relatedTarget)) {
            // Deactivate by calling the helper with null.
            this._setActiveContainerAddArea(null);
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

    _populateToolbar(blockInstance) {
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
    _showBlockDetails(blockInstance) {
        if (!blockInstance) return;
        
        // 1. Select the current block
        this.PageSelectionManager.set(blockInstance.id);
        
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
    async switchMode(mode, forceRefresh = false) {
        if (!this.isReady) return;
        const wasInPreviewMode = this.mode === 'preview';
        if (this.mode === mode && !forceRefresh) return;
    
        // --- RE-APPLYING LOGIC FOR SEPARATED STRUCTURE ---
        let topBlockId = null;
        const editScrollContainer = this.elements.editBackgroundContainer;
        const previewScrollContainer = this.elements.previewBackgroundContainer;
    
        if (this.mode === 'edit') {
            topBlockId = this._getTopVisibleBlockId(editScrollContainer);
        } else {
            topBlockId = this._getTopVisibleBlockId(previewScrollContainer);
        }
        
        this.mode = mode;
    
        if (mode === 'edit') {
            editScrollContainer.style.display = 'flex'; // Use 'flex' to match the CSS
            previewScrollContainer.style.display = 'none';
            
            requestAnimationFrame(() => { this._scrollToBlock(editScrollContainer, topBlockId); });
    
            if (wasInPreviewMode) {
                const triggerQuoteFetchRecursive = (blocks) => {
                    if (!blocks) return;
                    blocks.forEach(block => {
                        if (block.type === 'quote' && block.properties.referenceLink) {
                            const referenceLink = block.properties.referenceLink;
                            const [pathPart, blockId] = referenceLink.split('#');
                            const absolutePath = window.resolveWorkspacePath(pathPart);
                            const absoluteReferenceLink = blockId ? `${absolutePath}#${blockId}` : absolutePath;
                            
                            ipc.fetchQuoteContent(block.id, absoluteReferenceLink);
                        }
                        if (block.children) {
                            triggerQuoteFetchRecursive(block.children);
                        }
                    });
                };
                triggerQuoteFetchRecursive(this.blocks);
            }
    
        } else { // preview
            // 'getSanitizedHtml' returns the *inner* content for the .editor-view
            this.elements.previewView.innerHTML = await this.getSanitizedHtml(false);
            
            editScrollContainer.style.display = 'none';
            previewScrollContainer.style.display = 'flex'; // Use 'flex' to match the CSS
            
            this._scrollToBlock(previewScrollContainer, topBlockId);
        }
        
        // Finally, update the toolbar UI to reflect the new mode.
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
                return blockEl.dataset.id;
            }
        }
        for (const blockEl of blockElements) {
            const blockRect = blockEl.getBoundingClientRect();
            if (blockRect.bottom > containerRect.top && blockRect.top < containerRect.bottom) {
                return blockEl.dataset.id;
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
    _scrollToBlock(container, blockId) {
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
            this.elements.saveBtn.disabled = !activeTab.isUnsaved;
            this.elements.saveBtn.classList.toggle('unsaved', activeTab.isUnsaved);

            // --- Mode Toggle State ---
            // The `mode` state is managed by this PageEditor instance.
            this.elements.modeToggle.classList.toggle('edit-active', this.mode === 'edit');
            this.elements.modeToggle.classList.toggle('preview-active', this.mode === 'preview');
        } else {
            // Fallback for when there is no active tab (should rarely happen when an editor is active).
            // This logic is inherited from the old main.js for robustness.
            this.elements.saveBtn.disabled = true;
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
        if (!container) return; // Safety check
        
        // Ensure you are using the class property `this.allNotes`
        container.innerHTML = this.allNotes 
            .filter(note => note.name.toLowerCase().includes(query.toLowerCase()))
            .map(note => `<div class="search-result-item" data-path="${note.path}" title="${note.path}">📄 ${note.name}</div>`)
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
            const option = e.target.closest('.rs-view-option');
            if (option) {
                this.switchRightSidebarView(option.dataset.view);
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
                localStorage.setItem('veritnote_right_sidebar_width', this.elements.rightSidebar.style.width);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // Restore saved width on init
        const savedRightWidth = localStorage.getItem('veritnote_right_sidebar_width');
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
            localStorage.setItem('veritnote_right_sidebar_collapsed', 'true');
            if (buttonText) buttonText.textContent = 'Expand';
            this.elements.rightSidebarToggleBtn.title = 'Expand right sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><polyline points="14 16 9 12 14 8"></polyline>`;
        } else {
            appContainer.classList.remove('right-sidebar-collapsed');
            appContainer.classList.remove('right-sidebar-peek'); // Always remove peek on expand
            localStorage.setItem('veritnote_right_sidebar_collapsed', 'false');
            this.elements.rightSidebar.style.width = localStorage.getItem('veritnote_right_sidebar_width') || '280px';
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
            references: this.elements.referencesView,
            details: this.elements.detailsView
        };
        const slider = this.elements.rightSidebarViewToggle.querySelector('.rs-view-slider');
        const optionToActivate = this.elements.rightSidebarViewToggle.querySelector(`.rs-view-option[data-view="${viewName}"]`);
    
        if (!optionToActivate) return;
    
        if (slider) {
            slider.style.left = `${optionToActivate.offsetLeft}px`;
        }
    
        this.elements.rightSidebarViewToggle.querySelectorAll('.rs-view-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.view === viewName);
        });
    
        Object.values(views).forEach(view => {
            if (view) view.classList.remove('active');
        });
        if (views[viewName]) {
            views[viewName].classList.add('active');
        }
    }

    /**
    * Updates the right sidebar's "Details" panel based on the currently selected blocks.
    */
    updateDetailsPanel() {
        const editor = this.PageSelectionManager._getEditor();
        if (!editor || !this.elements.detailsView) return;

        const selectedIds = this.PageSelectionManager.get();
    
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
                const blockSection = this.elements.detailsView.querySelector(`.details-panel-section[data-block-id="${id}"]`);
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
    setToolbarCollapsed(collapsed) {
        // Like the sidebar, this needs to modify a class on a parent element.
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
            // Also remove peek class on expand
            if (mainContentEl.classList.contains('toolbar-peek')) {
                mainContentEl.classList.remove('toolbar-peek');
            }
        }
    }

    // --- Block Highlighting ---
    /**
     * Finds a block by its ID within the current editor or preview view,
     * scrolls it into the center of the viewport, and applies a temporary
     * highlight effect.
     *
     * @param {string} blockId - The ID of the block to focus and highlight.
     */
    focusBlock(blockId) {
        if (!blockId || !this.isReady) {
            return;
        }

        // Use a short timeout to ensure the DOM has fully rendered after a potential
        // mode switch or page load, preventing race conditions where the element
        // might not be found immediately.
        setTimeout(() => {
            // Determine which view container is currently active (edit or preview).
            const activeContainer = this.mode === 'edit' 
                ? this.elements.editorAreaContainer 
                : this.elements.previewView;

            if (!activeContainer) return;

            // Find the target block element within the active container.
            const blockEl = activeContainer.querySelector(`.block-container[data-id="${blockId}"]`);
        
            if (blockEl) {
                // 1. Remove highlight from any previously highlighted block.
                const previouslyHighlighted = this.container.querySelector('.is-highlighted');
                if (previouslyHighlighted) {
                    previouslyHighlighted.classList.remove('is-highlighted');
                }

                // 2. Scroll the target block into the center of the view.
                blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // 3. Apply the highlight class.
                blockEl.classList.add('is-highlighted');
                
                // 4. Set up a one-time event listener to remove the highlight.
                // The highlight will be removed on the next click or keydown anywhere in the document.
                const removeHighlight = () => {
                    blockEl.classList.remove('is-highlighted');
                    document.removeEventListener('click', removeHighlight, { capture: true });
                    document.removeEventListener('keydown', removeHighlight, { capture: true });
                };

                // Use another short timeout before attaching the removal listeners.
                // This prevents the same click that triggered the focus from immediately removing it.
                setTimeout(() => {
                    document.addEventListener('click', removeHighlight, { once: true, capture: true });
                    document.addEventListener('keydown', removeHighlight, { once: true, capture: true });
                }, 100);

            } else {
                console.warn(`PageEditor: Could not find block element with ID "${blockId}" to focus.`);
            }
        }, 200); // A slightly longer delay gives the UI more time to settle.
    }
    
    // --- ========================================================== ---
    // --- 6. Helper & Utility Methods
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
    }

    _generateUUID() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
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
     * @param {object} [exportContext.imageSrcMap={}] - A map of original image URLs to new local paths.
     * @param {Map} [exportContext.quoteContentCache=new Map()] - A map of pre-rendered HTML for quote blocks.
     * @param {string} [exportContext.pathPrefix='./'] - The relative path prefix for assets.
     * @returns {Promise<string>} A promise that resolves to the final HTML string.
     */
    async getSanitizedHtml(isForExport = false, exportContext = {}) {
        const {
            options = {},
            imageSrcMap = {},
            quoteContentCache = new Map(),
            pathPrefix = './'
        } = exportContext;

        // --- Step 1: Create a Clean DOM from Data ---
        // We build a fresh DOM tree from our canonical block data, ensuring no editor-specific artifacts
        // (like event listeners or temporary classes) are included from the start.
        const cleanContainer = document.createElement('div');
        // Create a temporary, lightweight editor instance solely for rendering.
        const tempEditor = new PageEditor(cleanContainer, this.filePath, null);

        tempEditor.elements.editorAreaContainer = document.createElement('div');
        tempEditor.elements.editorAreaContainer.id = 'editor-area-container';
        tempEditor.elements.editorAreaContainer.className = 'editor-view';
        cleanContainer.appendChild(tempEditor.elements.editorAreaContainer);

        tempEditor._registerAllBlocks();
        // Use a helper to load data and render without the full initialization lifecycle.
        await tempEditor.loadContentForRender(this.getBlocksForSaving());
        const renderedContainer = tempEditor.elements.editorAreaContainer;

        // --- Step 2: Perform Universal Cleanup ---
        renderedContainer.querySelectorAll('.block-controls, .column-resizer, .drop-indicator, .drop-indicator-vertical, .quadrant-overlay, .table-controls-top, .table-controls-left, .table-add-col-btn, .table-add-row-btn').forEach(el => el.remove());
        renderedContainer.querySelectorAll('.block-content[data-type="code"] .code-block-input').forEach(el => el.remove());
        renderedContainer.querySelectorAll('[contentEditable="true"]').forEach(el => {
            el.removeAttribute('contentEditable');
            el.removeAttribute('data-placeholder');
        });
        renderedContainer.querySelectorAll('.toolbar-active, .vn-active, .is-highlighted').forEach(el => {
            el.classList.remove('toolbar-active', 'vn-active', 'is-highlighted');
        });
        if (isForExport && options.disableDrag) {
            renderedContainer.querySelectorAll('[draggable="true"]').forEach(el => el.removeAttribute('draggable'));
        }

        // --- Step 3: Delegate to Each Block for Specific Export Modifications ---
        // Find all rendered block containers in the clean DOM.
        const allBlockElements = Array.from(renderedContainer.querySelectorAll('.block-container'));
        for (const blockEl of allBlockElements) {
            const blockId = blockEl.dataset.id;
            const blockInstance = this._findBlockInstanceById(this.blocks, blockId)?.block;
            
            if (blockInstance && typeof blockInstance.getExportHtml === 'function') {
                // blockInstance.getExportHtml 可能会创建新的 <a> 标签
                await blockInstance.getExportHtml(blockEl, options, imageSrcMap, pathPrefix, quoteContentCache);
            }
        }

        // 收集所有块的自定义 CSS
        let allCustomCSS = '';

        // 定义递归收集函数，因为块可能有子块（如分栏、引用）
        const collectCSSRecursive = (blocks) => {
            if (!blocks) return;
            blocks.forEach(block => {
                // 调用刚刚在 Block.js 里写的新方法
                if (typeof block.getCustomCSSString === 'function') {
                    allCustomCSS += block.getCustomCSSString();
                }
                // 递归子块
                if (block.children && block.children.length > 0) {
                    collectCSSRecursive(block.children);
                }
            });
        };

        // 从临时编辑器的块列表中收集（因为它们拥有完整的数据）
        collectCSSRecursive(tempEditor.blocks);

        // --- Step 4: Universally Process All Links ---
        // This must be done before delegating to blocks, so blocks receive already-processed links.
        renderedContainer.querySelectorAll('a').forEach(el => {
            let href = el.getAttribute('href');
            if (!href) return;
            
            // 检查是否是内部链接
            if (href.includes('.veritnote')) {
                if (isForExport) {
                    // 最终导出：转换为 .html
                    const normalizedHref = href.replace(/\\/g, '/');
                    let [pathPart, hashPart] = normalizedHref.split('#');
                    hashPart = hashPart ? '#' + hashPart : '';
                    const relativeHtmlPath = pathPart.replace('.veritnote', '.html');
                    el.setAttribute('href', pathPrefix + relativeHtmlPath + hashPart);
                } else { 
                    // 应用内预览：转换为可点击的 data-internal-link
                    el.setAttribute('href', '#');
                    el.setAttribute('data-internal-link', href);
                    el.classList.add('internal-link');
                }
            }
            // 外部链接
        });

        //----------------------
        let finalHtml = renderedContainer.innerHTML;

        // --- Step 5 (Export Only): Collect and Inject Block-Specific Scripts ---
        // This is the old logic for highlight.js which is now also handled by a block's getExportScripts.
        if (isForExport) {
            if (allCustomCSS) {
                // 将所有样式包裹在 <style> 标签中，并放在最前面
                finalHtml = `<style>\n/* VeritNote Custom CSS */\n${allCustomCSS}\n</style>\n` + finalHtml;
            }

            const scriptModules = new Set();
        
            // This function traverses the entire block tree to find all unique block types
            // and collect their required export scripts.
            const collectScriptsRecursive = (blocks) => {
                if (!blocks) return;
                blocks.forEach(block => {
                    const BlockClass = block.constructor;
                    if (typeof BlockClass.getExportScripts === 'function') {
                        const script = BlockClass.getExportScripts();
                        if (script) {
                            scriptModules.add(script.trim());
                        }
                    }
                    // Recurse into children
                    if (block.children && block.children.length > 0) {
                        collectScriptsRecursive(block.children);
                    }
                });
            };
        
            // Start the recursive collection from the root blocks
            collectScriptsRecursive(this.blocks);
        
            if (scriptModules.size > 0) {
                const finalScript = Array.from(scriptModules).join('\n\n');
                finalHtml += `<script>document.addEventListener('DOMContentLoaded', () => { \n${finalScript}\n });<\/script>`;
            }
        
            // Add the highlight-on-hash-change script (this is a universal feature for any exported page with blocks)
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
                             removeHighlight = () => {
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
            this._registerAllBlocks();
        }

        this.blocks = blockDataList.map(data => this.createBlockInstance(data)).filter(Boolean);
        this.blocks.forEach(block => block.parent = null);
        this.render();
    }
}


// --- ========================================================== ---
// --- In-file Helper Classes
// --- ========================================================== ---

class PageSelectionManager {
    constructor(editor) { // 接收 editor 实例
        this.selectedBlockIds = new Set();
        this.editor = editor; // 保存 editor 实例的引用
    }

    _getEditor() {
        return this.editor;
    }

    _updateVisuals() {
        const editor = this._getEditor();
        if (!editor || !editor.container) return;

        editor.container.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));

        this.selectedBlockIds.forEach(id => {
            const blockEl = editor.container.querySelector(`.block-container[data-id="${id}"]`);
            if (blockEl) {
                blockEl.classList.add('is-selected');
            }
        });

        // Update the details panel whenever the selection visuals change.
        editor.updateDetailsPanel();
    }

    toggle(blockId) {
        if (this.selectedBlockIds.has(blockId)) {
            this.selectedBlockIds.delete(blockId);
        } else {
            this.selectedBlockIds.add(blockId);
        }
        this._updateVisuals();
    }

    set(blockId) {
        // If this block is already the only one selected, do nothing.
        // This allows clicking inside an already selected block to edit text.
        if (this.selectedBlockIds.size === 1 && this.selectedBlockIds.has(blockId)) {
            return;
        }
        this.selectedBlockIds.clear();
        this.selectedBlockIds.add(blockId);
        this._updateVisuals();
    }

    clear() {
        if (this.selectedBlockIds.size === 0) return;
        this.selectedBlockIds.clear();
        this._updateVisuals();
    }

    get() {
        return Array.from(this.selectedBlockIds);
    }

    has(blockId) {
        return this.selectedBlockIds.has(blockId);
    }

    size() {
        return this.selectedBlockIds.size;
    }

    validateAndRefresh() {
        // 1. 过滤掉那些在当前 DOM 中已经不存在的 ID
        // (例如：撤销了“创建新块”的操作，该块ID就不应该继续被选中)
        const validIds = new Set();
        this.selectedBlockIds.forEach(id => {
            // 检查编辑器中是否真的还有这个块的 DOM
            if (this.editor.container.querySelector(`.block-container[data-id="${id}"]`)) {
                validIds.add(id);
            }
        });
        this.selectedBlockIds = validIds;

        // 2. 强制重新应用视觉样式（添加 .is-selected 类）并更新细节面板
        this._updateVisuals();
    }
}

class PageReferenceManager {
    constructor(editor) {
        this.editor = editor; // The PageEditor instance

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

        // 监听全局引用列表的变化并重绘UI (例如，其他页面添加/删除了引用)
        this._boundRender = this.render.bind(this);
        window.addEventListener('global:referencesChanged', this._boundRender);
        // 监听当前编辑器内的块更新事件
        this._boundHandleBlockUpdate = this._handleBlockUpdateEvent.bind(this);
        window.addEventListener('block:updated', this._boundHandleBlockUpdate);
        // 监听当前编辑器内的块删除事件
        this._boundHandleBlockDelete = this._handleBlockDeleteEvent.bind(this);
        window.addEventListener('block:deleted', this._boundHandleBlockDelete);
    }

    destroy() {
        // 清理所有添加的监听器
        window.removeEventListener('global:referencesChanged', this._boundRender);
        window.removeEventListener('block:updated', this._boundHandleBlockUpdate);
        window.removeEventListener('block:deleted', this._boundHandleBlockDelete);
    }
    
    /**
     * 事件处理器：当一个块被删除时调用
     * @param {CustomEvent} e - 事件对象，e.detail 包含 { filePath, blockId }
     */
    _handleBlockDeleteEvent(e) {
        // 只处理来自当前编辑器的事件
        if (e.detail.filePath === this.editor.filePath) {
            this.handleBlockDeletion(e.detail.blockId);
        }
    }

    _handleBlockUpdateEvent(e) {
        // 只处理来自当前编辑器的事件
        if (e.detail.filePath !== this.editor.filePath) {
            return;
        }

        const updatedBlockData = e.detail.blockData;

        // 确保我们收到了一个有效的 blockData 对象，并且它有 ID
        if (!updatedBlockData || !updatedBlockData.id) {
            return;
        }
    
        // 检查这个块是否确实存在于引用列表中
        const refExists = globalState.references.some(
            // 也对数组中的项进行安全检查
            r => r && r.blockData && r.blockData.id === updatedBlockData.id
        );

        if (refExists) {
            // 如果存在，则调用全局函数来更新它
            updateGlobalReferenceData(updatedBlockData);
        }
    }

    // --- Drag and Drop Handlers ---

    cleanupDropIndicator() {
        this.container.querySelector('.reference-item-drop-indicator')?.remove();
    }

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
                if (isAfter) {
                    targetItem.parentNode.insertBefore(indicator, targetItem.nextSibling);
                } else {
                    targetItem.parentNode.insertBefore(indicator, targetItem);
                }
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

        if (!this.container.classList.contains('active')) {
            return;
        }

        // --- Reorder logic ---
        const isReorder = e.dataTransfer.types.includes('application/veritnote-reference-reorder');
        if (isReorder && this.draggedItem) {
            const indicator = this.container.querySelector('.reference-item-drop-indicator');
            if (indicator) { this.container.insertBefore(this.draggedItem, indicator); } 
            else { this.container.appendChild(this.draggedItem); }
            this.draggedItem.style.display = '';
            
            const newReferences = [];
            this.container.querySelectorAll('.reference-item').forEach(itemEl => {
                const blockId = itemEl.dataset.blockId;
                // 从全局状态中查找
                const refObject = globalState.references.find(r => r.blockData.id === blockId);
                if (refObject) { newReferences.push(refObject); }
            });
            updateGlobalReferences(newReferences); // 调用全局更新函数
            return;
        }

        // --- Multi-block drop logic ---
        const multiDragData = e.dataTransfer.getData('application/veritnote-block-ids');
        const singleDragId = e.dataTransfer.getData('text/plain');
        
        let blockIdsToAdd = [];
        if (multiDragData) {
            blockIdsToAdd = JSON.parse(multiDragData);
        } else if (singleDragId) {
            blockIdsToAdd = [singleDragId];
        }

        if (blockIdsToAdd.length > 0) {
            blockIdsToAdd.forEach(blockId => {
                if (globalState.references.some(ref => ref.blockData.id === blockId)) {
                    return;
                }
                
                const blockInstance = this.editor._findBlockInstanceById(this.editor.blocks, blockId)?.block;
                
                if (blockInstance) {
                    this.addReference(this.editor.filePath, blockInstance.data);
                }
            });
        }
    }

    _handleItemDragStart(e) {
        const item = e.target.closest('.reference-item');
        if (item) {
            this.draggedItem = item;
            const blockId = item.dataset.blockId;
            
            // 将 this.references 改为 globalState.references
            const refData = globalState.references.find(r => r.blockData.id === blockId);
    
            if (refData) {
                e.dataTransfer.setData('application/veritnote-reference-item', JSON.stringify(refData));
            }
            
            // This is for reordering within the reference panel itself
            e.dataTransfer.setData('application/veritnote-reference-reorder', blockId);
            e.dataTransfer.effectAllowed = 'copyMove'; // Allow both copy (to editor) and move (in panel)
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

    // --- Interaction and State Management ---

    async _handleClick(e) {
        // Priority 1: Check for linking mode
        if (this.isLinkingMode) {
            const itemEl = e.target.closest('.reference-item');
            if (itemEl && this.linkingCallback) {
                const blockId = itemEl.dataset.blockId;
                const refData = globalState.references.find(r => r.blockData.id === blockId);
                if (refData) { this.linkingCallback(refData); }
            }
            return;
        }

        // Priority 2: Check for delete button click
        const deleteBtn = e.target.closest('.reference-item-delete-btn');
        if (deleteBtn) {
            this.removeReference(deleteBtn.closest('.reference-item').dataset.blockId);
            return;
        }

        // Default action: Navigate to the block
        const itemEl = e.target.closest('.reference-item');
        if (itemEl) {
            const blockId = itemEl.dataset.blockId;
            const refData = globalState.references.find(r => r.blockData.id === blockId);

            if (refData) {
                // Check if the reference is in the current file
                if (refData.filePath === this.editor.filePath) {
                    this.editor.focusBlock(blockId);
                } else {
                    // Open or switch to the other file's tab and focus the block
                    await this.editor.tabManager.openTab(refData.filePath, blockId);
                }
            }
        }
    }

    enableLinkingMode(enable, callback = null) {
        this.isLinkingMode = enable;
        this.linkingCallback = enable ? callback : null;
    }

    addReference(filePath, blockData) {
        addGlobalReference(filePath, blockData);
    }

    removeReference(blockId) {
        removeGlobalReference(blockId);
    }

    render() {
        const scrollPos = this.container.scrollTop;
        this.container.innerHTML = '';
        this.container.appendChild(this.placeholder);
        
        // 直接从全局状态读取数据
        this.placeholder.style.display = globalState.references.length === 0 ? 'block' : 'none';
        if (globalState.references.length === 0) return;
        
        const tempEditorContainer = document.createElement('div');
        const tempEditor = new PageEditor(tempEditorContainer, '', null);
        tempEditor._registerAllBlocks();

        // 遍历全局引用
        globalState.references.forEach((ref) => {
            const fileName = ref.filePath.substring(ref.filePath.lastIndexOf('\\') + 1).replace('.veritnote', '');
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

    // --- Public Methods for Reacting to Global Events ---
    // These methods will be called by the parent PageEditor instance.

    handleBlockUpdate(filePath, blockData) {
        // 功能 1: 实时同步
        // 1. 更新全局状态中的数据
        updateGlobalReferenceData(blockData); 
        
        // 2. 更新当前实例的 DOM (其他实例会通过 block:updated 事件各自更新自己的DOM)
        const itemEl = this.container.querySelector(`.reference-item[data-block-id="${blockData.id}"]`);
        if (itemEl) {
            // filePath 在这里没有变化，所以可以复用
            const ref = globalState.references.find(r => r.blockData.id === blockData.id);
            if (ref) {
                 this.updateReferenceItemDOM(itemEl, ref);
            }
        }
    }

    handleBlockDeletion(blockId) {
        // 检查这个块是否在引用列表中
        const refExists = globalState.references.some(ref => ref.blockData.id === blockId);
        if (refExists) {
            // 调用全局函数来移除引用并触发事件
            removeGlobalReference(blockId);
        }
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
    
        // 遍历全局引用
        for (const ref of globalState.references) {
            // 只关心那些来自被修改页面的引用
            if (ref.filePath === filePath) {
                const updatedBlockData = pageBlocksMap.get(ref.blockData.id);
                if (updatedBlockData) {
                    // 如果块仍然存在，更新它的数据并保留它
                    updatedRefs.push({ filePath: ref.filePath, blockData: updatedBlockData });
                } else {
                    // 如果块不存在了（被撤销操作删除了），则标记需要更新
                    referencesChanged = true;
                }
            } else {
                // 保留所有其他页面的引用
                updatedRefs.push(ref);
            }
        }
        
        // 如果引用列表的长度或内容发生变化，则触发全局更新
        if (referencesChanged || JSON.stringify(updatedRefs) !== JSON.stringify(globalState.references)) {
             updateGlobalReferences(updatedRefs);
        }
    }
    
    handleRevertReferences(filePath) {
        // 功能 2: 恢复到已保存版本
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
                
                // 如果数据真的发生了变化，触发全局更新
                if (changed) {
                    window.dispatchEvent(new CustomEvent('global:referencesChanged'));
                }
            }
        };
        
        window.addEventListener('pageLoaded', onPageRevertedListener);
        ipc.loadPage(filePath, null);
    }

    updateReferenceItemDOM(itemEl, refData) {
        const tempEditorContainer = document.createElement('div');
        const tempEditor = new PageEditor(tempEditorContainer, '', null);
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