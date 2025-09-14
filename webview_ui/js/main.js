// js/main.js
document.addEventListener('DOMContentLoaded', () => {
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
        ToggleListItemBlock
    ];

    /**
     * Helper function to register all known block types on an editor instance.
     * @param {Editor} editorInstance The editor instance to register blocks on.
     */
    function registerAllBlocks(editorInstance) {
        ALL_BLOCK_CLASSES.forEach(blockClass => {
            editorInstance.registerBlock(blockClass);
        });
    }



    // --- Element acquisition ---
    const sidebar = document.getElementById('workspace-tree');
    const editorAreaContainer = document.getElementById('editor-area-container');
    const noFileMessage = document.getElementById('no-file-message');
    const exportBtn = document.getElementById('export-btn');
    const contextMenu = document.getElementById('context-menu');
    const exportOverlay = document.getElementById('export-overlay');
    const progressBar = document.getElementById('progress-bar');
    const exportStatus = document.getElementById('export-status');
    const popover = document.getElementById('popover');
    const popoverInput = document.getElementById('popover-input');
    const searchResultsContainer = document.getElementById('popover-search-results');
    const colorPickerContainer = document.getElementById('popover-color-picker');
    const localFileBtn = document.getElementById('popover-local-file-btn');
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    const appContainer = document.querySelector('.app-container');
    const sidebarContainer = document.getElementById('sidebar');
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const cookSettingsModal = document.getElementById('cook-settings-modal');
    const startCookBtn = document.getElementById('start-cook-btn');
    const cancelCookBtn = document.getElementById('cancel-cook-btn');
    const saveBtn = document.getElementById('save-btn');
    const modeToggle = document.getElementById('mode-toggle');
    const tabBar = document.getElementById('tab-bar');
    const dynamicTabsContainer = document.getElementById('dynamic-tabs-container');

    // --- START: NEW/MODIFIED ELEMENT SELECTORS ---
    const mainContent = document.getElementById('main-content'); // Crucial for adding collapse class
    const rightSidebar = document.getElementById('right-sidebar');
    const rightSidebarResizer = document.getElementById('right-sidebar-resizer');
    const rightSidebarToggleBtn = document.getElementById('right-sidebar-toggle-btn');
    const referencesView = document.getElementById('references-view');
    // --- END: NEW/MODIFIED ELEMENT SELECTORS ---

    const windowControls = document.getElementById('window-controls');
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');
    const fullscreenBtnWC = document.getElementById('toggle-fullscreen-btn-wc');

    const floatingToolbar = document.getElementById('floating-toolbar');
    const toggleToolbarBtn = document.getElementById('toggle-toolbar-btn');
    const toolbarPeekTrigger = document.getElementById('toolbar-peek-trigger');

    let contextMenuTarget = null;
    let allNotes = [];
    const PRESET_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F7D154', '#B298DC', '#cccccc', '#8c8c8c', '#569cd6'];

    // --- Tab Management ---
    /**
        * Centralized function to handle all in-app link clicks.
        * @param {string} fullPath - The full link path, e.g., "C:\\...\\Page.veritnote#block-id"
    */
    function handleLinkClick(fullPath) {
        let path = fullPath;
        let blockId = null;
        if (fullPath && fullPath.includes('#')) {
            [path, blockId] = fullPath.split('#');
        }
        tabManager.openTab(path, blockId);
    }



    // ======================================================================
    // ================= REBUILT POPOVER SYSTEM ======================
    // ======================================================================
    
    // A flag to prevent the popover from closing immediately after opening
    let isPopoverJustOpened = false;
    let currentPopoverCallback = null;
    let wasSidebarForcedOpen = false;

    /**
     * Hides any open popover and cleans up associated states.
     * This is now the single source of truth for closing popovers.
     */
    function hidePopover() {
        if (popover.style.display === 'block') {
            popover.style.display = 'none';
            document.body.classList.remove('is-linking-block');
            referenceManager.enableLinkingMode(false);
            if (wasSidebarForcedOpen) {
                setRightSidebarCollapsed(true);
            }
            wasSidebarForcedOpen = false;
            currentPopoverCallback = null;
            popover.querySelectorAll('.custom-popover-content').forEach(el => el.remove());
            window.dispatchEvent(new CustomEvent('popoverClosed'));
        }
    }

    /**
     * Central function to calculate position and display the popover.
     * @param {HTMLElement} targetElement The element to position against.
     */
    function positionAndShowPopover(targetElement) {
        isPopoverJustOpened = true;
        popover.style.visibility = 'hidden';
        popover.style.display = 'block';
        const popoverRect = popover.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const buffer = 10;
        let topPosition = targetRect.bottom + 5;
        if (topPosition + popoverRect.height > windowHeight - buffer) {
            topPosition = targetRect.top - popoverRect.height - 5;
        }
        let leftPosition = targetRect.left;
        if (leftPosition + popoverRect.width > window.innerWidth - buffer) {
             leftPosition = window.innerWidth - popoverRect.width - buffer;
        }
        if (leftPosition < buffer) { leftPosition = buffer; }
        popover.style.top = `${topPosition}px`;
        popover.style.left = `${leftPosition}px`;
        popover.style.visibility = 'visible';
    }

    /**
     * Shows a popover for setting HREF links (pages or blocks).
     * @param {object} options - { targetElement, existingValue, callback }
     */
    window.showLinkPopover = function(options) {
        const { targetElement, existingValue, callback } = options;
        currentPopoverCallback = callback;
        
        // --- UI Setup ---
        popover.querySelectorAll('.popover-content > div').forEach(el => el.style.display = 'none');
        document.getElementById('popover-link-mode-toggle').style.display = 'flex';
        
        const pageContent = document.getElementById('popover-page-content');
        const blockContent = document.getElementById('popover-block-content');
        const instructionText = blockContent.querySelector('.popover-instruction');
        instructionText.querySelector('.current-link-display')?.remove();
        if (existingValue) {
            const el = document.createElement('div');
            el.className = 'current-link-display';
            el.textContent = `Current: ${existingValue}`;
            instructionText.appendChild(el);
        }

        const setActiveMode = (mode) => {
            document.querySelectorAll('.popover-mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
            if (mode === 'block') {
                pageContent.style.display = 'none';
                blockContent.style.display = 'block';
                document.body.classList.add('is-linking-block');
                wasSidebarForcedOpen = appContainer.classList.contains('right-sidebar-collapsed');
                if (wasSidebarForcedOpen) setRightSidebarCollapsed(false);
                referenceManager.enableLinkingMode(true, (refData) => {
                    const link = `${refData.filePath}#${refData.blockData.id}`;
                    if (currentPopoverCallback) currentPopoverCallback(link);
                    hidePopover();
                });
            } else { // 'page'
                blockContent.style.display = 'none';
                pageContent.style.display = 'block';
                popoverInput.value = existingValue || '';
                popoverInput.placeholder = 'Enter a link or search...';
                localFileBtn.style.display = 'none'; // Page links don't use this
                searchResultsContainer.style.display = 'block';
                popoverInput.focus();
                if (allNotes.length === 0) ipc.requestNoteList();
                else updateSearchResults(popoverInput.value);
                document.body.classList.remove('is-linking-block');
                referenceManager.enableLinkingMode(false);
                if (wasSidebarForcedOpen) setRightSidebarCollapsed(true);
            }
        };

        document.querySelectorAll('#popover-link-mode-toggle .popover-mode-btn').forEach(btn => {
            btn.onmousedown = (e) => { e.stopPropagation(); setActiveMode(btn.dataset.mode); };
        });

        const initialMode = existingValue && existingValue.includes('#') ? 'block' : 'page';
        setActiveMode(initialMode);
        positionAndShowPopover(targetElement);
    }

    /**
     * Shows a popover for setting an image SRC.
     * @param {object} options - { targetElement, existingValue, callback }
     */
    window.showImageSourcePopover = function(options) {
        const { targetElement, existingValue, callback } = options;
        currentPopoverCallback = callback;

        // --- UI Setup ---
        popover.querySelectorAll('.popover-content > div, #popover-link-mode-toggle').forEach(el => el.style.display = 'none');
        const imageSourceContent = document.getElementById('popover-image-source-content');
        imageSourceContent.style.display = 'block';
        
        const imageInput = document.getElementById('popover-image-input');
        imageInput.value = existingValue || '';
        imageInput.focus();

        positionAndShowPopover(targetElement);
    }
    
    /**
     * Shows the color picker popover.
     * @param {object} options - { targetElement, callback }
     */
    window.showColorPicker = function(options) {
        const { targetElement, callback } = options;
        currentPopoverCallback = callback;
        
        // --- UI Setup ---
        document.getElementById('popover-link-mode-toggle').style.display = 'none';
        document.getElementById('popover-page-content').style.display = 'none';
        document.getElementById('popover-block-content').style.display = 'none';
        const colorPicker = document.getElementById('popover-color-picker');
        colorPicker.style.display = 'grid';
        colorPicker.innerHTML = PRESET_COLORS.map(c => `<div class="color-swatch" style="background-color: ${c}" data-color="${c}"></div>`).join('');
        
        positionAndShowPopover(targetElement);
    }

    /**
     * Shows a completely custom popover.
     * @param {object} options - { targetElement, content, onOpen, editor }
     */
    window.showCustomPopover = function(options) {
        const { targetElement, content, onOpen, editor } = options;

        // --- UI Setup ---
        popover.querySelectorAll('.popover-content > div, #popover-link-mode-toggle').forEach(el => el.style.display = 'none');
        const popoverContent = popover.querySelector('.popover-content');
        popover.querySelectorAll('.custom-popover-content').forEach(el => el.remove());
        const customWrapper = document.createElement('div');
        customWrapper.className = 'custom-popover-content';
        customWrapper.innerHTML = content;
        popoverContent.appendChild(customWrapper);

        positionAndShowPopover(targetElement);

        if (typeof onOpen === 'function') {
            onOpen(customWrapper, editor); // Pass editor instance to the callback
        }
    }
    
    // --- Event Listeners for Popover Content ---
    // These now use the single `currentPopoverCallback`
    document.getElementById('popover-image-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (currentPopoverCallback) currentPopoverCallback(e.target.value); hidePopover(); } });
    document.getElementById('popover-image-local-btn').addEventListener('click', (e) => { e.preventDefault(); ipc.openFileDialog(); });
    // This listener now serves both image source and link popovers
    window.addEventListener('fileDialogClosed', (e) => { if (e.detail.payload.path && currentPopoverCallback) { currentPopoverCallback(e.detail.payload.path); hidePopover(); } });
    
    // Listeners for page/URL link popover
    popoverInput.addEventListener('input', () => updateSearchResults(popoverInput.value));
    popoverInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (currentPopoverCallback) currentPopoverCallback(popoverInput.value); hidePopover(); } });
    searchResultsContainer.addEventListener('mousedown', (e) => { e.preventDefault(); const item = e.target.closest('.search-result-item'); if (item && currentPopoverCallback) { currentPopoverCallback(item.dataset.path); hidePopover(); } });
    
    // Listener for color picker
    document.getElementById('popover-color-picker').addEventListener('mousedown', (e) => { e.preventDefault(); const swatch = e.target.closest('.color-swatch'); if (swatch && currentPopoverCallback) { currentPopoverCallback(swatch.dataset.color); hidePopover(); } });
    
    // Global listener to close popovers
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#context-menu')) { contextMenu.style.display = 'none'; }
        if (popover.style.display === 'block' && !isPopoverJustOpened) {
            if (!popover.contains(e.target)) {
                 if (document.body.classList.contains('is-linking-block') && e.target.closest('.reference-item')) { return; }
                 hidePopover();
            }
        }
        isPopoverJustOpened = false;
    });



    /**
     * Finds a block in the currently active tab and highlights it.
     * @param {string} blockId - The ID of the block to highlight.
     */
    function highlightBlockInActiveTab(blockId) {
        console.group(`--- DEBUG: highlightBlockInActiveTab ---`);
        console.log(`Input: blockId = "${blockId}"`);

        if (!blockId) {
            console.warn('Warning: Aborted because blockId is null or empty.');
            console.groupEnd();
            return;
        }

        const activeTab = tabManager.getActiveTab();
        if (!activeTab) {
            console.error('Error: Aborted because there is no active tab.');
            console.groupEnd();
            return;
        }
    
        console.log(`State: Active tab is "${activeTab.path}", its mode is "${activeTab.mode}".`);

        setTimeout(() => {
            console.log(`Sub-Action: Executing setTimeout for highlight.`);
        
            const container = activeTab.mode === 'edit' 
                ? activeTab.dom.editorContainer 
                : activeTab.dom.previewContainer;

            console.log(`State: Target container determined:`, container);
        
            const blockEl = container.querySelector(`.block-container[data-id="${blockId}"]`);
        
            if (blockEl) {
                console.log('Result: SUCCESS - Found block element:', blockEl);
                // ... (highlighting logic) ...
                const previouslyHighlighted = document.querySelector('.is-highlighted');
                if (previouslyHighlighted) {
                    previouslyHighlighted.classList.remove('is-highlighted');
                }
                blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                blockEl.classList.add('is-highlighted');
                const removeHighlight = () => {
                    blockEl.classList.remove('is-highlighted');
                    document.removeEventListener('click', removeHighlight, true);
                    document.removeEventListener('keydown', removeHighlight, true);
                };
                setTimeout(() => {
                    document.addEventListener('click', removeHighlight, { once: true, capture: true });
                    document.addEventListener('keydown', removeHighlight, { once: true, capture: true });
                }, 100);

            } else {
                console.error(`Result: FAILED - Could not find block element with selector: .block-container[data-id="${blockId}"]`);
                // ** CRITICAL DEBUG INFO: Print the container's content at the moment of failure **
                console.log(`Container's innerHTML at time of failure (length: ${container.innerHTML.length}):`);
                // Only log a snippet to avoid flooding the console
                console.log(container.innerHTML.substring(0, 1000) + (container.innerHTML.length > 1000 ? '...' : ''));
            }
            console.groupEnd(); // End of highlightBlockInActiveTab group
        }, 200); // Using a slightly longer delay for safety
    }


    class TabManager {
        constructor() {
            this.tabs = new Map();
            this.tabOrder = [];
            this.activeTabPath = null;
        }

        getActiveTab() { return this.tabs.get(this.activeTabPath); }
        
        openTab(path, blockIdToFocus = null) {
            // --- 1. If tab is already open ---
            if (this.tabs.has(path)) {
                this.switchTab(path);
                // If we need to focus a block in an already open tab,
                // we dispatch a NEW, DEDICATED event for that.
                if (blockIdToFocus) {
                    window.dispatchEvent(new CustomEvent('tab:focus-block', {
                        detail: { path, blockIdToFocus }
                    }));
                }
                return;
            }
    
            // --- 2. If tab is new ---
            const fileName = path.substring(path.lastIndexOf('\\') + 1).replace('.veritnote', '');
            const tabId = `tab-${Date.now()}-${Math.random()}`;
            const wrapper = document.createElement('div');
            wrapper.className = 'editor-instance-wrapper';
            wrapper.id = `wrapper-${tabId}`;
            wrapper.style.display = 'none';
            const editorContainer = document.createElement('div');
            editorContainer.className = 'editor-view';
            const previewContainer = document.createElement('div');
            previewContainer.className = 'editor-view';
            previewContainer.style.display = 'none';
            
            wrapper.addEventListener('click', (e) => {
                const link = e.target.closest('a.internal-link');
                if (link) {
                    e.preventDefault();
                    const fullPath = link.getAttribute('data-internal-link');
                    if (fullPath) { handleLinkClick(fullPath); }
                }
            });
            
            wrapper.appendChild(editorContainer);
            wrapper.appendChild(previewContainer);
            editorAreaContainer.appendChild(wrapper);
    
            const newEditor = new Editor(editorContainer);
            registerAllBlocks(newEditor);
    
            const currentActiveTab = this.getActiveTab();
            const initialMode = currentActiveTab ? currentActiveTab.mode : 'edit';
    
            const newTab = {
                id: tabId, path: path, name: fileName, isUnsaved: false,
                mode: initialMode, editor: newEditor,
                dom: { wrapper, editorContainer, previewContainer, tabItem: null }
            };
    
            this.tabs.set(path, newTab);
            this.tabOrder.push(path);
            
            // Request page content FROM HERE, passing the blockId to the backend
            ipc.loadPage(path, blockIdToFocus); 
            this.switchTab(path);
        }

        closeTab(path) {
            const tabToClose = this.tabs.get(path);
            if (!tabToClose) return;
            if (tabToClose.isUnsaved) { if (!confirm(`"${tabToClose.name}" has unsaved changes. Are you sure you want to close it?`)) { return; } }
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
                updateToolbarState(newTab);
            } else {
                noFileMessage.style.display = 'flex';
                updateToolbarState(null);
            }
            this.render();
            updateSidebarActiveState();
        }
        setUnsavedStatus(path, isUnsaved) {
            const tab = this.tabs.get(path);
            if (tab && tab.isUnsaved !== isUnsaved) {
                tab.isUnsaved = isUnsaved;
                this.render();
                if (tab.path === this.activeTabPath) { updateToolbarState(tab); }
            }
        }
        handlePageLoaded(pageData) {
            const tab = this.tabs.get(pageData.path);
            if (tab) {
                tab.editor.load(pageData);
                this.setUnsavedStatus(pageData.path, false);
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
                tabItem.innerHTML = `<span class="unsaved-dot"></span><span class="tab-name">${tab.name}</span><button class="tab-close-btn">&times;</button>`;
                tabItem.addEventListener('mousedown', (e) => {
                    if (e.button === 1) { this.closeTab(path); return; }
                    if (!e.target.classList.contains('tab-close-btn')) { this.switchTab(path); }
                });
                tabItem.querySelector('.tab-close-btn').addEventListener('click', () => this.closeTab(path));
                tabItem.draggable = true;
                tabItem.addEventListener('dragstart', e => this.handleDragStart(e, path));
                tabItem.addEventListener('dragover', e => this.handleDragOver(e, path));
                tabItem.addEventListener('dragleave', e => this.handleDragLeave(e));
                tabItem.addEventListener('drop', e => this.handleDrop(e, path));
                tabItem.addEventListener('dragend', e => this.handleDragEnd(e));
                dynamicTabsContainer.appendChild(tabItem);
                tab.dom.tabItem = tabItem;
            });
        }
        handleDragStart(e, path) { e.dataTransfer.setData('text/plain', path); this.draggedElement = e.target; setTimeout(() => this.draggedElement.classList.add('dragging'), 0); }
        handleDragOver(e, targetPath) {
            e.preventDefault();
            const draggingElem = this.draggedElement;
            if (!draggingElem || draggingElem === e.currentTarget) return;
            const targetElem = e.currentTarget;
            const rect = targetElem.getBoundingClientRect();
            const isAfter = e.clientX > rect.left + rect.width / 2;
            if (isAfter) { dynamicTabsContainer.insertBefore(draggingElem, targetElem.nextSibling); } else { dynamicTabsContainer.insertBefore(draggingElem, targetElem); }
        }
        handleDragLeave(e) { e.preventDefault(); }
        handleDrop(e, path) { e.preventDefault(); const newOrder = []; dynamicTabsContainer.querySelectorAll('.tab-item').forEach(item => newOrder.push(item.dataset.path)); this.tabOrder = newOrder; }
        handleDragEnd(e) { if (this.draggedElement) { this.draggedElement.classList.remove('dragging'); } this.draggedElement = null; this.render(); }
    }

    window.addEventListener('tab:focus-block', (e) => {
        const { path, blockIdToFocus } = e.detail;
        // This event is for already-open tabs. The active tab should already be the correct one.
        if (tabManager.getActiveTab()?.path === path) {
            highlightBlockInActiveTab(blockIdToFocus);
        }
    });

    // --- Reference Management ---
    class ReferenceManager {
        constructor() {
            this.dropZone = document.getElementById('right-sidebar-content');
            this.container = referencesView;
            this.placeholder = this.container.querySelector('.empty-references-placeholder');
            this.references = [];
            this.draggedItem = null;
            this._initListeners();
        }
        _initListeners() {
            this.dropZone.addEventListener('dragover', this._handleDragOver.bind(this));
            this.dropZone.addEventListener('dragleave', this._handleDragLeave.bind(this));
            this.dropZone.addEventListener('drop', this._handleDrop.bind(this));
            this.container.addEventListener('dragstart', this._handleItemDragStart.bind(this));
            this.container.addEventListener('dragend', this._handleItemDragEnd.bind(this));
            this.container.addEventListener('click', this._handleClick.bind(this));
            window.addEventListener('block:updated', this.handleBlockUpdate.bind(this));
            window.addEventListener('block:deleted', this.handleBlockDeletion.bind(this));
            window.addEventListener('history:applied', this.handleHistoryChange.bind(this));
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
                    if (isAfter) {
                        targetItem.parentNode.insertBefore(indicator, targetItem.nextSibling);
                    } else {
                        targetItem.parentNode.insertBefore(indicator, targetItem);
                    }
                }
            } else {
                e.dataTransfer.dropEffect = 'copy';
                this.dropZone.classList.add('drag-over');
            }
        }
        _handleDragLeave(e) {
            if (!this.dropZone.contains(e.relatedTarget)) {
                this.dropZone.classList.remove('drag-over');
                this.cleanupDropIndicator();
            }
        }
        _handleDrop(e) {
            e.preventDefault();
            this.dropZone.classList.remove('drag-over');
            document.body.classList.remove('is-dragging-block');
            const isReorder = e.dataTransfer.types.includes('application/veritnote-reference-reorder');
            if (isReorder && this.draggedItem) {
                const indicator = this.container.querySelector('.reference-item-drop-indicator');
                if (indicator) { this.container.insertBefore(this.draggedItem, indicator); } 
                else { this.container.appendChild(this.draggedItem); }
                this.draggedItem.style.display = '';
                const newReferences = [];
                this.container.querySelectorAll('.reference-item').forEach(itemEl => {
                    const blockId = itemEl.dataset.blockId;
                    const refObject = this.references.find(r => r.blockData.id === blockId);
                    if (refObject) { newReferences.push(refObject); }
                });
                this.references = newReferences;
                this.render();
                return;
            }
            const blockIdFromEditor = e.dataTransfer.getData('text/plain');
            if (blockIdFromEditor) {
                const activeTab = tabManager.getActiveTab();
                if (activeTab) {
                    if (this.references.some(ref => ref.blockData.id === blockIdFromEditor)) { return; }
                    const blockInstance = activeTab.editor._findBlockInstanceById(activeTab.editor.blocks, blockIdFromEditor)?.block;
                    if (blockInstance) { this.addReference(activeTab.path, blockInstance.data); }
                }
            }
        }
        _handleItemDragStart(e) {
            const item = e.target.closest('.reference-item');
            if (item) {
                this.draggedItem = item;
                e.dataTransfer.setData('application/veritnote-reference-reorder', item.dataset.blockId);
                e.dataTransfer.effectAllowed = 'move';
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
        _handleClick(e) {
            if (this.isLinkingMode) {
                const itemEl = e.target.closest('.reference-item');
                if (itemEl && this.linkingCallback) {
                    const blockId = itemEl.dataset.blockId;
                    const refData = this.references.find(r => r.blockData.id === blockId);
                    if (refData) { this.linkingCallback(refData); }
                }
                return;
            }
            const deleteBtn = e.target.closest('.reference-item-delete-btn');
            if (deleteBtn) { this.removeReference(deleteBtn.closest('.reference-item').dataset.blockId); }
        }
        enableLinkingMode(enable, callback = null) { this.isLinkingMode = enable; this.linkingCallback = enable ? callback : null; }
        addReference(filePath, blockData) { this.references.push({ filePath, blockData }); this.render(); }
        removeReference(blockId) { this.references = this.references.filter(ref => ref.blockData.id !== blockId); this.render(); }
        render() {
            const scrollPos = this.dropZone.scrollTop;
            this.container.innerHTML = '';
            this.container.appendChild(this.placeholder);
            this.placeholder.style.display = this.references.length === 0 ? 'block' : 'none';
            if (this.references.length === 0) return;
            const tempEditor = new Editor(document.createElement('div'));
            registerAllBlocks(tempEditor);
            this.references.forEach((ref) => {
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
            this.dropZone.scrollTop = scrollPos;
        }
        handleBlockUpdate(e) {
            const { filePath, blockData } = e.detail;
            const refIndex = this.references.findIndex(ref => ref.blockData.id === blockData.id);
            if (refIndex !== -1) {
                this.references[refIndex] = { filePath, blockData };
                const itemEl = this.container.querySelector(`.reference-item[data-block-id="${blockData.id}"]`);
                if (itemEl) { this.updateReferenceItemDOM(itemEl, { filePath, blockData }); }
            }
        }
        handleBlockDeletion(e) {
            const { blockId } = e.detail;
            if (this.references.some(ref => ref.blockData.id === blockId)) { this.removeReference(blockId); }
        }
        handleHistoryChange(e) {
            const { filePath, allBlockData } = e.detail;
            const pageBlocksMap = new Map();
            const flattenBlocks = (blocks) => {
                if (!blocks) return;
                for (const block of blocks) {
                    pageBlocksMap.set(block.id, block);
                    if (block.children) { flattenBlocks(block.children); }
                }
            };
            flattenBlocks(allBlockData);
            this.references.forEach(ref => {
                if (ref.filePath === filePath) {
                    const updatedBlockData = pageBlocksMap.get(ref.blockData.id);
                    if (updatedBlockData) {
                        ref.blockData = updatedBlockData;
                        const itemEl = this.container.querySelector(`.reference-item[data-block-id="${ref.blockData.id}"]`);
                        if (itemEl) { this.updateReferenceItemDOM(itemEl, ref); }
                    } else {
                        ref.markedForDeletion = true;
                    }
                }
            });
            const oldRefCount = this.references.length;
            this.references = this.references.filter(ref => !ref.markedForDeletion);
            if (this.references.length < oldRefCount) { this.render(); }
        }
        updateReferenceItemDOM(itemEl, refData) {
            const tempEditor = new Editor(document.createElement('div'));
            registerAllBlocks(tempEditor);
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

    const tabManager = new TabManager();
    const referenceManager = new ReferenceManager();

    // --- UI Update Functions ---
    function updateToolbarState(activeTab) {
        if (activeTab) {
            saveBtn.disabled = !activeTab.isUnsaved;
            saveBtn.classList.toggle('unsaved', activeTab.isUnsaved);
            modeToggle.classList.toggle('edit-active', activeTab.mode === 'edit');
            modeToggle.classList.toggle('preview-active', activeTab.mode === 'preview');
        } else {
            saveBtn.disabled = true;
            saveBtn.classList.remove('unsaved');
            modeToggle.classList.add('edit-active');
            modeToggle.classList.remove('preview-active');
        }
    }
    function updateSidebarActiveState() {
        sidebar.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
        if (tabManager.activeTabPath) {
            const pathForQuery = tabManager.activeTabPath.replace(/\\/g, '\\\\');
            const targetNode = sidebar.querySelector(`.tree-node.page[data-path="${pathForQuery}"]`);
            if (targetNode) { targetNode.classList.add('active'); }
        }
    }

    function switchMode(mode, tab = null, forceRefresh = false) {
        const activeTab = tab || tabManager.getActiveTab();
        if (!activeTab) {
            return;
        }
    
        // The check now considers the forceRefresh flag
        if (activeTab.mode === mode && !forceRefresh) {
            return;
        }
    
        activeTab.mode = mode;
    
        const editorContainer = activeTab.dom.editorContainer;
        const previewContainer = activeTab.dom.previewContainer;
    
        if (mode === 'edit') {
            editorContainer.style.display = 'block';
            previewContainer.style.display = 'none';
        } else { // mode === 'preview'
            // This part will now be executed correctly on new tabs
            previewContainer.innerHTML = activeTab.editor.getSanitizedHtml(false);
            editorContainer.style.display = 'none';
            previewContainer.style.display = 'block';
        }
        updateToolbarState(activeTab);
    }

    function saveCurrentPage() {
        const activeTab = tabManager.getActiveTab();
        if (activeTab && activeTab.isUnsaved) {
            const content = activeTab.editor.getBlocksForSaving();
            ipc.savePage(activeTab.path, content);
            tabManager.setUnsavedStatus(activeTab.path, false);
            console.log('Page saved!', activeTab.path);
        }
    }

    // --- C++ message listeners ---
    window.addEventListener('workspaceListed', (e) => {
        const workspaceData = e.detail.payload;
        sidebar.dataset.workspaceData = JSON.stringify(workspaceData);
        if (workspaceData && workspaceData.children && workspaceData.children.length > 0) {
            sidebar.innerHTML = renderWorkspaceTree(workspaceData);
        } else {
            sidebar.innerHTML = `<div class="empty-workspace">Workspace is empty.<br>Right-click to create a file.</div>`;
        }
        updateSidebarActiveState();
    });

window.addEventListener('pageLoaded', (e) => {
    console.group(`--- DEBUG: pageLoaded event for path: ${e.detail.payload?.path} ---`);
    
    if (e.detail.error) {
        console.error('Error in pageLoaded:', e.detail.error);
        alert(`Error loading page: ${e.detail.error}`);
        tabManager.closeTab(e.detail.payload.path);
        console.groupEnd();
        return;
    }
    
    const pageData = e.detail.payload;
    console.log('Payload received:', pageData);
    
    tabManager.handlePageLoaded(pageData); 

    const { path, blockIdToFocus } = pageData;
    const loadedTab = tabManager.tabs.get(path);

    if (loadedTab) {
        console.log(`State: Found loaded tab object. Its desired mode is "${loadedTab.mode}".`);
        switchMode(loadedTab.mode, loadedTab, true); 

        if (blockIdToFocus) {
            console.log(`Action: Calling highlightBlockInActiveTab for blockId: "${blockIdToFocus}"`);
            highlightBlockInActiveTab(blockIdToFocus);
        } else {
            console.log('Info: No blockIdToFocus in payload.');
        }
    } else {
        console.error('Error: Could not find tab object for path:', path);
    }
    console.groupEnd();
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
    });

    // --- Event Listeners ---
    sidebar.addEventListener('click', (e) => {
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
            tabManager.openTab(path);
        }
    });
    modeToggle.addEventListener('click', (e) => {
        const option = e.target.closest('.mode-toggle-option');
        if (option) { switchMode(option.dataset.mode); }
    });
    saveBtn.addEventListener('click', saveCurrentPage);
    window.addEventListener('editor:change', () => {
        const activeTab = tabManager.getActiveTab();
        if (activeTab) { tabManager.setUnsavedStatus(activeTab.path, true); }
    });
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrentPage(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); const activeTab = tabManager.getActiveTab(); if (activeTab) { tabManager.closeTab(activeTab.path); } return; }
        const activeTab = tabManager.getActiveTab();
        if (activeTab && (e.ctrlKey || e.metaKey)) {
            const key = e.key.toLowerCase();
            if (key === 'z') { e.preventDefault(); if (e.shiftKey) { activeTab.editor.history.redo(); } else { activeTab.editor.history.undo(); } return; }
            if (key === 'y' && !e.shiftKey) { e.preventDefault(); activeTab.editor.history.redo(); return; }
        }
    });
    backToDashboardBtn.addEventListener('click', () => {
        let unsavedFiles = [];
        tabManager.tabs.forEach(tab => { if (tab.isUnsaved) { unsavedFiles.push(tab.name); } });
        if (unsavedFiles.length > 0) { if (!confirm(`You have unsaved changes in: ${unsavedFiles.join(', ')}.\n\nLeave without saving?`)) { return; } }
        ipc.send('goToDashboard');
    });

    // --- Helper Functions, Context Menu, Popover, etc. ---
    function renderWorkspaceTree(node) {
        if (!node) return '';
        let html = '';
        if (node.type === 'folder') {
            html += `<div class="tree-node folder" data-path="${node.path}"><span class="icon"></span><span class="name">${node.name}</span></div>`;
            if (node.children && node.children.length > 0) {
                html += '<div class="tree-node-children" style="display: none;">';
                node.children.forEach(child => { html += renderWorkspaceTree(child); });
                html += '</div>';
            }
        } else if (node.type === 'page') {
            html += `<div class="tree-node page" data-path="${node.path}"><span class="icon"></span><span class="name">${node.name}</span></div>`;
        }
        return html;
    }
    sidebar.addEventListener('contextmenu', (e) => { e.preventDefault(); contextMenuTarget = e.target.closest('.tree-node, #workspace-tree'); if (!contextMenuTarget) return; contextMenu.style.top = `${e.clientY}px`; contextMenu.style.left = `${e.clientX}px`; contextMenu.style.display = 'block'; });
    

    document.addEventListener('mousedown', (e) => {
        // Hide context menu on any mousedown
        if (!e.target.closest('#context-menu')) {
            contextMenu.style.display = 'none';
        }

        // --- THE CORE FIX for the "closes immediately" bug ---
        if (popover.style.display === 'block') {
            // If the popover is open, and we click outside of it...
            if (!popover.contains(e.target) && !isPopoverJustOpened) {
                 // ...and also not on a reference item while in linking mode...
                if (document.body.classList.contains('is-linking-block') && e.target.closest('.reference-item')) {
                    return;
                }
                hidePopoverAndCleanup();
            }
        }
        // Reset the flag after the mousedown event has been processed
        isPopoverJustOpened = false;
    });


    contextMenu.addEventListener('click', (e) => {
        if (!contextMenuTarget) return;
        const action = e.target.dataset.action;
        let targetPath = contextMenuTarget.dataset.path || '';
        let parentPath = '';
        if (contextMenuTarget.id === 'workspace-tree') { parentPath = JSON.parse(sidebar.dataset.workspaceData || '{}').path || ''; } else if (contextMenuTarget.classList.contains('folder')) { parentPath = targetPath; } else { parentPath = targetPath.substring(0, targetPath.lastIndexOf('\\')); }
        if (!parentPath && sidebar.dataset.workspaceData) { parentPath = JSON.parse(sidebar.dataset.workspaceData).path; }
        switch (action) {
            case 'newPage': { const name = prompt("Page Name", "MyPage"); if (name) { ipc.createItem(parentPath, name, 'page'); ipc.listWorkspace(); } break; }
            case 'newFolder': { const name = prompt("Folder Name", "MyFolder"); if (name) { ipc.createItem(parentPath, name, 'folder'); ipc.listWorkspace(); } break; }
            case 'delete': { if (confirm(`Delete "${targetPath}"?`)) { ipc.deleteItem(targetPath); } break; }
        }
    });

    // --- Sidebar Resizing & Collapse ---
    const SIDEBAR_WIDTH_KEY = 'veritnote_sidebar_width';
    const SIDEBAR_COLLAPSED_KEY = 'veritnote_sidebar_collapsed';
    function applySidebarWidth(width) { const min = parseFloat(getComputedStyle(sidebarContainer).minWidth); const max = parseFloat(getComputedStyle(sidebarContainer).maxWidth); sidebarContainer.style.width = `${Math.max(min, Math.min(width, max))}px`; }
    sidebarResizer.addEventListener('mousedown', (e) => { e.preventDefault(); const startX = e.clientX; const startWidth = sidebarContainer.offsetWidth; function onMouseMove(moveEvent) { applySidebarWidth(startWidth + (moveEvent.clientX - startX)); } function onMouseUp() { localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarContainer.style.width); document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); } document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp); });
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY); if (savedWidth) { sidebarContainer.style.width = savedWidth; }
    function setSidebarCollapsed(collapsed) {
        const buttonText = sidebarToggleBtn.querySelector('span'); const buttonSvg = sidebarToggleBtn.querySelector('svg');
        if (collapsed) {
            appContainer.classList.add('sidebar-collapsed'); localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true'); sidebarContainer.style.width = '';
            if (buttonText) buttonText.textContent = 'Expand'; sidebarToggleBtn.title = 'Expand sidebar'; if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>`;
        } else {
            appContainer.classList.remove('sidebar-collapsed'); localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false'); sidebarContainer.style.width = localStorage.getItem(SIDEBAR_WIDTH_KEY) || '260px';
            if (buttonText) buttonText.textContent = 'Collapse'; sidebarToggleBtn.title = 'Collapse sidebar'; if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>`;
        }
    }
    sidebarToggleBtn.addEventListener('click', () => { appContainer.classList.remove('sidebar-peek'); setSidebarCollapsed(!appContainer.classList.contains('sidebar-collapsed')); });
    setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true');
    document.getElementById('sidebar-peek-trigger').addEventListener('mouseenter', () => { 
        if (appContainer.classList.contains('sidebar-collapsed')) appContainer.classList.add('sidebar-peek'); 
    });
    sidebarContainer.addEventListener('mouseleave', () => { 
        if (appContainer.classList.contains('sidebar-peek')) appContainer.classList.remove('sidebar-peek'); 
    });

    // --- Floating Toolbar Logic ---
    const TOOLBAR_COLLAPSED_KEY = 'veritnote_toolbar_collapsed';
    function setToolbarCollapsed(collapsed) {
        if (collapsed) { mainContent.classList.add('toolbar-collapsed'); localStorage.setItem(TOOLBAR_COLLAPSED_KEY, 'true'); toggleToolbarBtn.title = 'Expand Toolbar'; }
        else { mainContent.classList.remove('toolbar-collapsed'); localStorage.setItem(TOOLBAR_COLLAPSED_KEY, 'false'); toggleToolbarBtn.title = 'Collapse Toolbar'; if (mainContent.classList.contains('toolbar-peek')) { mainContent.classList.remove('toolbar-peek'); } }
    }
    toggleToolbarBtn.addEventListener('click', () => { setToolbarCollapsed(!mainContent.classList.contains('toolbar-collapsed')); });
    toolbarPeekTrigger.addEventListener('mouseenter', () => { if (mainContent.classList.contains('toolbar-collapsed')) { mainContent.classList.add('toolbar-peek'); } });
    floatingToolbar.addEventListener('mouseleave', () => { if (mainContent.classList.contains('toolbar-peek')) { mainContent.classList.remove('toolbar-peek'); } });
    setToolbarCollapsed(localStorage.getItem(TOOLBAR_COLLAPSED_KEY) === 'true');

    // --- Popover Logic ---
    window.addEventListener('noteListReceived', (e) => {
        allNotes = e.detail.payload;
        if (popover.style.display === 'block') {
            updateSearchResults(popoverInput.value);
        }
    });

    function updateSearchResults(query) {
        searchResultsContainer.innerHTML = allNotes
            .filter(note => note.name.toLowerCase().includes(query.toLowerCase()))
            .map(note => `<div class="search-result-item" data-path="${note.path}" title="${note.path}">📄 ${note.name}</div>`)
            .join('');
    }

    
    
    // --- Export Logic ---
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
    window.addEventListener('exportCancelled', () => { exportStatus.textContent = 'Cancelled.'; setTimeout(hideExportOverlay, 1000); });
    window.addEventListener('exportImageProgress', e => { const { originalSrc, percentage } = e.detail.payload; exportStatus.textContent = `Downloading ${originalSrc.substring(originalSrc.lastIndexOf('/') + 1)} (${percentage}%)`; });

    async function runExportProcess(options, allFilesToExport) {
        exportStatus.textContent = 'Collecting file information...';
        progressBar.style.width = '5%';

        const tempEditorForRegistry = new Editor(document.createElement('div'));
        registerAllBlocks(tempEditorForRegistry);
    
        const workspaceData = JSON.parse(sidebar.dataset.workspaceData || '{}');
        const allPagesContent = [];
    
        // A recursive function to find all unique block types used in a page's content
        const findBlockTypesRecursive = (blocks, typesSet) => {
            if (!blocks) return;
            blocks.forEach(block => {
                typesSet.add(block.type);
                if (block.children) {
                    findBlockTypesRecursive(block.children, typesSet);
                }
            });
        };
    
        // Collect all page content first
        for (const path of allFilesToExport) {
            if (isExportCancelled) return;
            const pageData = await new Promise(resolve => {
                const handler = (e) => {
                    if (e.detail.payload.path === path) {
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
    
        // --- Step 1: Prepare the build environment and copy libraries FIRST ---
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
    
        // This call now also creates the build folder and copies style.css
        ipc.prepareExportLibs(Array.from(requiredLibs));
        
        // Wait for the backend to confirm that the environment is ready
        await new Promise(resolve => {
            window.addEventListener('exportLibsReady', resolve, { once: true });
        });
        
        if (isExportCancelled) return;
    
        // --- Step 2: Scan for and process images SECOND ---
        let imageSrcMap = {};
        if (options.copyLocal || options.downloadOnline) {
            exportStatus.textContent = 'Processing images...';
            progressBar.style.width = '15%';
            
            const imageTasks = [];
            const findImagesRecursive = (blocks, pagePath) => {
                if (!blocks) return;
                blocks.forEach(block => {
                    if (block.type === 'image' && block.content) {
                        const match = block.content.match(/src="([^"]+)"/);
                        if (match) {
                            const src = match[1];
                            const isLocal = /^[a-zA-Z]:\\/.test(src) || src.startsWith('file:///');
                            const isOnline = src.startsWith('http');
                            if ((options.copyLocal && isLocal) || (options.downloadOnline && isOnline)) {
                                imageTasks.push({ originalSrc: src, pagePath: pagePath });
                            }
                        }
                    }
                    if (block.children) {
                        findImagesRecursive(block.children, pagePath);
                    }
                });
            };
    
            allPagesContent.forEach(pageData => findImagesRecursive(pageData.content, pageData.path));
    
            if (imageTasks.length > 0) {
                ipc.processExportImages(imageTasks);
                if (isExportCancelled) return;
                imageSrcMap = await new Promise(resolve => {
                    window.addEventListener('exportImagesProcessed', (e) => resolve(e.detail.payload.srcMap), { once: true });
                });
            }
        }
    
        if (isExportCancelled) return;
        
        exportStatus.textContent = 'Generating HTML pages...';
    
        // --- Step 3: Generate and export HTML for each page ---
        for (let i = 0; i < allPagesContent.length; i++) {
            if (isExportCancelled) return;
            const pageData = allPagesContent[i];
            const path = pageData.path;
            const progress = 20 + ((i + 1) / allPagesContent.length) * 80;
    
            exportStatus.textContent = `Cooking: ${path.substring(path.lastIndexOf('\\') + 1)}`;
            
            const tempEditorContainer = document.createElement('div');
            const tempEditor = new Editor(tempEditorContainer);
            tempEditorForRegistry.blockRegistry.forEach(BlockClass => tempEditor.registerBlock(BlockClass));
            
            tempEditor.load(pageData);
            const mainContentHtml = tempEditor.getSanitizedHtml(true, workspaceData.path, options, imageSrcMap);
    
            const sourcePath = path;
            const workspacePath = workspaceData.path;
            const relativePathStr = sourcePath.substring(workspacePath.length + 1);
            const depth = (relativePathStr.match(/\\/g) || []).length;
            const pathPrefix = depth > 0 ? '../'.repeat(depth) : './';
    
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
            if (requiredLibsForThisPage.has('vendor/highlight/highlight.min.js')) {
                libIncludes += `    <script>document.addEventListener('DOMContentLoaded', () => { hljs.highlightAll(); });<\/script>\n`;
            }
    
            const filteredWorkspaceData = { ...workspaceData };
            if (filteredWorkspaceData.children) {
                filteredWorkspaceData.children = filteredWorkspaceData.children.filter(child => child.name !== 'build');
            }


            function generateSidebarHtml(node, currentPath) {
                let html = '';
                if (node.type === 'folder') {
                    html += `<div class="tree-node folder" data-path="${node.path}">
                                <span class="icon"></span>
                    <span class="name">${node.name}</span>
                             </div>`;
                    if (node.children && node.children.length > 0) {
                        html += '<div class="tree-node-children">';
                        node.children.forEach(child => {
                            html += generateSidebarHtml(child, currentPath);
                        });
                        html += '</div>';
                    }
                } else if (node.type === 'page') {
                    const relativePath = node.path.substring(JSON.parse(sidebar.dataset.workspaceData).path.length + 1).replace(/\\/g, '/').replace('.veritnote', '.html');
                    const isActive = (node.path === currentPath);
                    html += `<div class="tree-node page ${isActive ? 'active' : ''}" data-path="${node.path}">
                                <span class="icon"></span>
                                <span class="name"><a href="${relativePath}">${node.name}</a></span>
                             </div>`;
                }
                return html;
            }

    
            const sidebarHtml = `<nav id="exported-sidebar" class="exported-sidebar">${generateSidebarHtml(filteredWorkspaceData, path)}<button id="sidebar-toggle-btn">Collapse</button></nav>`;
    
            const finalHtml = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>${path.substring(path.lastIndexOf('\\') + 1).replace('.veritnote', '')}</title>
        <link rel="stylesheet" href="${cssRelativePath}">
    ${libIncludes}
        <style>
            body { margin: 0; font-family: ${getComputedStyle(document.body).fontFamily}; }
            /* Core App Layout */
            .app-container { display: flex; height: 100vh; transition: grid-template-columns 0.3s ease; }
            .exported-main { flex-grow: 1; height: 100vh; overflow-y: auto; box-sizing: border-box; background-color: #191919; color: #ccc; }
            .exported-main .editor-view { padding: 40px; max-width: 900px; margin: 0 auto; } 
            /* Sidebar Styles */
            .exported-sidebar { width: 260px; flex-shrink: 0; padding: 8px; border-right: 1px solid #444; height: 100vh; overflow-y: auto; box-sizing: border-box; background-color: #252526; color: #ccc; user-select: none; transition: width 0.3s ease, transform 0.3s ease, min-width 0.3s ease; position: relative; z-index: 50; }
            /* Sidebar Tree Styles (mirrors editor) */
            .tree-node { padding: 4px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; }
            .tree-node:hover { background-color: #333; }
            .tree-node.page a { color: #ccc; text-decoration: none; display: block; width: 100%; }
            .tree-node.page.active { background-color: #569cd6; }
            .tree-node.page.active a { color: #fff; }
            .tree-node .icon { margin-right: 8px; width: 16px; height: 16px; text-align: center; }
            .tree-node.folder > .icon::before { content: '▶'; font-size: 10px; display: inline-block; transition: transform 0.2s ease; }
            .tree-node.folder.open > .icon::before { transform: rotate(90deg); }
            .tree-node.page > .icon::before { content: '📄'; font-size: 12px; }
            .tree-node-children { padding-left: 16px; display: none; }
            /* Sidebar Collapse/Peek Logic */
            .sidebar-collapsed .exported-sidebar { width: 0; min-width: 0; border-right: none; transform: translateX(-100%); padding: 0; }
            .sidebar-collapsed.sidebar-peek .exported-sidebar { width: 260px; min-width: 260px; transform: translateX(0); border-right: 1px solid #444; box-shadow: 5px 0 15px rgba(0,0,0,0.2); }
            #sidebar-peek-trigger { position: fixed; top: 0; left: 0; width: 10px; height: 100vh; z-index: 100; }
            .app-container:not(.sidebar-collapsed) #sidebar-peek-trigger { display: none; }
            #sidebar-toggle-btn { position: absolute; bottom: 8px; left: 8px; right: 8px; width: calc(100% - 16px); background: none; border: 1px solid #444; color: #8c8c8c; padding: 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 14px; }
            #sidebar-toggle-btn:hover { background-color: #333; color: #ccc; }
        </style>
    </head>
    <body>
        <div class="app-container">
            <div id="sidebar-peek-trigger"></div>
            ${sidebarHtml}
            <main class="exported-main">
                <div class="editor-view">
                    <div id="editor-content-wrapper">${mainContentHtml}</div>
                </div>
            </main>
        </div>
        <script>
            document.addEventListener('DOMContentLoaded', () => {
                const SIDEBAR_COLLAPSED_KEY = 'veritnote_exported_sidebar_collapsed';
                const appContainer = document.querySelector('.app-container');
                const sidebar = document.getElementById('exported-sidebar');
                const peekTrigger = document.getElementById('sidebar-peek-trigger');
                const toggleBtn = document.getElementById('sidebar-toggle-btn');
    
                // Folder expand/collapse logic
                sidebar.querySelectorAll('.folder').forEach(folder => {
                    folder.addEventListener('click', (e) => {
                        if (e.target.tagName === 'A') return;
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
                        toggleBtn.textContent = 'Expand';
                    } else {
                        appContainer.classList.remove('sidebar-collapsed');
                        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false');
                        toggleBtn.textContent = 'Collapse';
                    }
                }
    
                toggleBtn.addEventListener('click', () => {
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
    
                // Initial state
                const wasCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
                setSidebarCollapsed(wasCollapsed);
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


    // --- Right Sidebar Resizing, Collapse, and Peek Logic (FINAL MIRRORED VERSION) ---
    const RIGHT_SIDEBAR_WIDTH_KEY = 'veritnote_right_sidebar_width';
    const RIGHT_SIDEBAR_COLLAPSED_KEY = 'veritnote_right_sidebar_collapsed';
    const rightSidebarPeekTrigger = document.getElementById('right-sidebar-peek-trigger');
    
    function applyRightSidebarWidth(width) {
        const min = parseFloat(getComputedStyle(rightSidebar).minWidth);
        const max = parseFloat(getComputedStyle(rightSidebar).maxWidth);
        rightSidebar.style.width = `${Math.max(min, Math.min(width, max))}px`;
    }
    
    rightSidebarResizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = rightSidebar.offsetWidth;
        function onMouseMove(moveEvent) { applyRightSidebarWidth(startWidth + (startX - moveEvent.clientX)); }
        function onMouseUp() {
            localStorage.setItem(RIGHT_SIDEBAR_WIDTH_KEY, rightSidebar.style.width);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    
    const savedRightWidth = localStorage.getItem(RIGHT_SIDEBAR_WIDTH_KEY);
    if (savedRightWidth) { rightSidebar.style.width = savedRightWidth; }
    
    function setRightSidebarCollapsed(collapsed) {
        const buttonText = rightSidebarToggleBtn.querySelector('span');
        const buttonSvg = rightSidebarToggleBtn.querySelector('svg');
        
        // ** THE CRITICAL FIX: All classes are applied to appContainer **
        if (collapsed) {
            appContainer.classList.add('right-sidebar-collapsed');
            localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, 'true');
            if (buttonText) buttonText.textContent = 'Expand';
            rightSidebarToggleBtn.title = 'Expand right sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><polyline points="14 16 9 12 14 8"></polyline>`;
        } else {
            appContainer.classList.remove('right-sidebar-collapsed');
            appContainer.classList.remove('right-sidebar-peek'); // Also remove peek class on expand
            localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, 'false');
            rightSidebar.style.width = localStorage.getItem(RIGHT_SIDEBAR_WIDTH_KEY) || '280px';
            if (buttonText) buttonText.textContent = 'Collapse';
            rightSidebarToggleBtn.title = 'Collapse right sidebar';
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>`;
        }
    }
    
    rightSidebarToggleBtn.addEventListener('click', () => {
        appContainer.classList.remove('right-sidebar-peek');
        setRightSidebarCollapsed(!appContainer.classList.contains('right-sidebar-collapsed'));
    });
    
    // Peek on hover (Mirrors left sidebar)
    rightSidebarPeekTrigger.addEventListener('mouseenter', () => {
        if (appContainer.classList.contains('right-sidebar-collapsed')) {
            appContainer.classList.add('right-sidebar-peek');
        }
    });
    rightSidebar.addEventListener('mouseleave', () => {
        if (appContainer.classList.contains('right-sidebar-peek')) {
            appContainer.classList.remove('right-sidebar-peek');
        }
    });
    
    // Peek on drag (Mirrors left sidebar)
    rightSidebarPeekTrigger.addEventListener('dragenter', () => {
         if (appContainer.classList.contains('right-sidebar-collapsed')) {
            appContainer.classList.add('right-sidebar-peek');
        }
    });
    
    // Initialize state
    setRightSidebarCollapsed(localStorage.getItem(RIGHT_SIDEBAR_COLLAPSED_KEY) === 'true');



    // --- Window State & Dragging ---
    window.addEventListener('windowStateChanged', (e) => { const { state } = e.detail.payload; if (state === 'fullscreen') { document.body.classList.add('is-fullscreen'); } else { document.body.classList.remove('is-fullscreen'); } });
    minimizeBtn.addEventListener('click', () => ipc.minimizeWindow());
    maximizeBtn.addEventListener('click', () => ipc.maximizeWindow());
    closeBtn.addEventListener('click', () => ipc.closeWindow());
    fullscreenBtnWC.addEventListener('click', () => ipc.toggleFullscreen());
    tabBar.addEventListener('mousedown', (e) => { if (e.target === tabBar && !document.body.classList.contains('is-fullscreen')) { ipc.startWindowDrag(); } });

    // --- Initial State ---
    window.initializeWorkspace = function(workspacePath) {
        if (workspacePath) {
            ipc.send('setWorkspace', { path: workspacePath });
            ipc.send('listWorkspace');
            updateToolbarState(null);
            ipc.checkWindowState();
        } else {
            alert("Error: Workspace path was not provided.");
            ipc.send('goToDashboard');
        }
    };
});