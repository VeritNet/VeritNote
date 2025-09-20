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
        ToggleListItemBlock,
        QuoteBlock
    ];

    /**
     * Helper function to register all known block types on an editor instance.
     * @param {Editor} editorInstance The editor instance to register blocks on.
     */
    window.registerAllBlocks = function(editorInstance) {
        ALL_BLOCK_CLASSES.forEach(blockClass => {
            editorInstance.registerBlock(blockClass);
        });
    }
    // Call it immediately for the old logic that expects it here
    function registerAllBlocks(editorInstance) {
        window.registerAllBlocks(editorInstance);
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

    const mainContent = document.getElementById('main-content'); // Crucial for adding collapse class
    const rightSidebar = document.getElementById('right-sidebar');
    const rightSidebarResizer = document.getElementById('right-sidebar-resizer');
    const rightSidebarToggleBtn = document.getElementById('right-sidebar-toggle-btn');

    const referencesView = document.getElementById('references-view');

    const detailsView = document.getElementById('details-view');
    const rightSidebarViewToggle = document.getElementById('right-sidebar-view-toggle');

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
    
    let isPopoverJustOpened = false; // A flag to prevent the popover from closing immediately after opening
    let currentPopoverCallback = null;
    let wasSidebarForcedOpen = false;
    let previousRightSidebarView = 'references';

    /**
     * Hides any open popover and cleans up associated states.
     * @param {HTMLElement} [elementToClean] - An optional extra element to remove when hiding.
     */
    function hidePopover(elementToClean = null) {
        if (popover.style.display !== 'block') return; // Exit if not open
    
        popover.style.display = 'none';
        popover.innerHTML = ''; 
    
        // --- REVISED AND SIMPLIFIED CLEANUP LOGIC ---
        if (document.body.classList.contains('is-linking-block')) {
            // This handles cases where the popover is closed directly
            // without switching back to 'page' mode first.
            document.body.classList.remove('is-linking-block');
            referenceManager.enableLinkingMode(false);
            switchRightSidebarView(previousRightSidebarView); // Restore view
        }
    
        if (wasSidebarForcedOpen) {
            setRightSidebarCollapsed(true);
            wasSidebarForcedOpen = false; // Always reset the flag on close
        }
        // --- END OF REVISED LOGIC ---
    
        currentPopoverCallback = null;
        
        if (elementToClean && elementToClean.parentElement) {
            elementToClean.parentElement.removeChild(elementToClean);
        }
    
        window.dispatchEvent(new CustomEvent('popoverClosed'));
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
     * Shows a popover for setting HREF links (pages or URLs).
     * @param {object} options - { targetElement, existingValue, callback }
     */
    window.showLinkPopover = function(options) {
        hidePopover(); 
        const { targetElement, existingValue, callback } = options;
        currentPopoverCallback = callback;
        
        popover.innerHTML = `
            <div id="link-popover-mode-toggle" class="popover-link-mode-toggle">
                <button class="popover-mode-btn active" data-mode="page">Link to Page/URL</button>
                <button class="popover-mode-btn" data-mode="block">Link to Block</button>
            </div>
            <div class="popover-content">
                <div id="link-popover-page-content">
                    <input type="text" id="link-popover-input" placeholder="Enter a link or search...">
                    <div id="link-popover-search-results" class="popover-search-results"></div>
                </div>
                <div id="link-popover-block-content" style="display: none;">
                    <p class="popover-instruction">Select a reference from the panel on the right.</p>
                </div>
            </div>
        `;

        const pageContent = popover.querySelector('#link-popover-page-content');
        const blockContent = popover.querySelector('#link-popover-block-content');
        const popoverInput = popover.querySelector('#link-popover-input');
        const searchResults = popover.querySelector('#link-popover-search-results');
        const instructionText = blockContent.querySelector('.popover-instruction');

        if (existingValue) {
            const el = document.createElement('div');
            el.className = 'current-link-display';
            el.textContent = `Current: ${existingValue}`;
            instructionText.appendChild(el);
        }

        const setActiveMode = (mode) => {
            popover.querySelectorAll('#link-popover-mode-toggle .popover-mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
            
            if (mode === 'block') {
                pageContent.style.display = 'none';
                blockContent.style.display = 'block';
                document.body.classList.add('is-linking-block');
                
                // --- START: REVISED LOGIC ---
                // 1. Remember the current view
                const currentActiveOption = rightSidebarViewToggle.querySelector('.rs-view-option.active');
                previousRightSidebarView = currentActiveOption ? currentActiveOption.dataset.view : 'references';
                
                // 2. Force switch to references view
                switchRightSidebarView('references');
                // --- END: REVISED LOGIC ---
        
                wasSidebarForcedOpen = appContainer.classList.contains('right-sidebar-collapsed');
                if (wasSidebarForcedOpen) setRightSidebarCollapsed(false);
                
                referenceManager.enableLinkingMode(true, (refData) => {
                    const link = `${refData.filePath}#${refData.blockData.id}`;
                    if (currentPopoverCallback) currentPopoverCallback(link);
                    hidePopover(); // hidePopover will handle restoring the view
                });
        
            } else { // 'page'
                blockContent.style.display = 'none';
                pageContent.style.display = 'block';
                popoverInput.value = existingValue || '';
                popoverInput.focus();
                if (allNotes.length === 0) ipc.requestNoteList(); else updateSearchResults(popoverInput.value, searchResults);
                
                if (document.body.classList.contains('is-linking-block')) {
                    document.body.classList.remove('is-linking-block');
                    referenceManager.enableLinkingMode(false);
                    switchRightSidebarView(previousRightSidebarView); // Restore view
                    if (wasSidebarForcedOpen) {
                        setRightSidebarCollapsed(true);
                        wasSidebarForcedOpen = false; // Reset flag
                    }
                }
            }
        };

        popover.querySelectorAll('#link-popover-mode-toggle .popover-mode-btn').forEach(btn => {
            btn.onmousedown = (e) => { e.stopPropagation(); setActiveMode(btn.dataset.mode); };
        });

        popoverInput.addEventListener('input', () => updateSearchResults(popoverInput.value, searchResults));
        popoverInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (currentPopoverCallback) currentPopoverCallback(popoverInput.value); hidePopover(); } });
        searchResults.addEventListener('mousedown', (e) => { e.preventDefault(); const item = e.target.closest('.search-result-item'); if (item && currentPopoverCallback) { currentPopoverCallback(item.dataset.path); hidePopover(); } });

        const initialMode = existingValue && existingValue.includes('#') ? 'block' : 'page';
        setActiveMode(initialMode);
        positionAndShowPopover(targetElement);
    }

    /**
     * Shows a popover for setting an image SRC.
     * @param {object} options - { targetElement, existingValue, callback }
     */
    window.showImageSourcePopover = function(options) {
        hidePopover();
        const { targetElement, existingValue, callback } = options;
        currentPopoverCallback = callback;

        popover.innerHTML = `
            <div class="popover-content">
                <input type="text" id="image-popover-input" placeholder="Enter image URL...">
                <button id="image-popover-local-btn" class="popover-button">Select Local File</button>
            </div>
        `;

        const imageInput = popover.querySelector('#image-popover-input');
        const localBtn = popover.querySelector('#image-popover-local-btn');
        
        imageInput.value = existingValue || '';
        imageInput.focus();
        
        imageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (currentPopoverCallback) currentPopoverCallback(e.target.value); hidePopover(); } });
        localBtn.addEventListener('click', (e) => { e.preventDefault(); ipc.openFileDialog(); });

        positionAndShowPopover(targetElement);
    }

    /**
     * Shows the color picker popover.
     * @param {object} options - { targetElement, callback }
     */
    window.showColorPicker = function(options) {
        hidePopover();
        const { targetElement, callback } = options;
        currentPopoverCallback = callback;
        
        popover.innerHTML = `<div class="popover-content"><div id="popover-color-picker-grid" class="popover-color-picker"></div></div>`;
        const colorPickerGrid = popover.querySelector('#popover-color-picker-grid');
        colorPickerGrid.innerHTML = PRESET_COLORS.map(c => `<div class="color-swatch" style="background-color: ${c}" data-color="${c}"></div>`).join('');
        
        colorPickerGrid.addEventListener('mousedown', (e) => { 
            e.preventDefault(); 
            const swatch = e.target.closest('.color-swatch'); 
            if (swatch && currentPopoverCallback) { 
                currentPopoverCallback(swatch.dataset.color); 
                hidePopover(); 
            } 
        });

        positionAndShowPopover(targetElement);
    }

    /**
     * Shows a popover for setting a Quote block's reference.
     * @param {object} options - { targetElement, existingValue, callback }
     */
    window.showReferencePopover = function(options) {
        hidePopover();
        const { targetElement, existingValue, callback } = options;
        currentPopoverCallback = callback;
        
        popover.innerHTML = `
            <div id="ref-popover-mode-toggle" class="popover-link-mode-toggle">
                <button class="popover-mode-btn active" data-mode="page">Reference Page</button>
                <button class="popover-mode-btn" data-mode="block">Reference Block</button>
            </div>
            <div class="popover-content">
                <div id="ref-popover-page-content">
                    <div id="ref-popover-search-results" class="popover-search-results"></div>
                </div>
                <div id="ref-popover-block-content" style="display: none;">
                    <p class="popover-instruction">Select a reference from the panel on the right.</p>
                </div>
            </div>
        `;

        const pageContent = popover.querySelector('#ref-popover-page-content');
        const blockContent = popover.querySelector('#ref-popover-block-content');
        const searchResults = popover.querySelector('#ref-popover-search-results');
        const instructionText = blockContent.querySelector('.popover-instruction');

        if (existingValue) {
            const el = document.createElement('div');
            el.className = 'current-link-display';
            el.textContent = `Current: ${existingValue}`;
            instructionText.appendChild(el);
        }

        const setActiveMode = (mode) => {
            popover.querySelectorAll('#ref-popover-mode-toggle .popover-mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
            
            if (mode === 'block') {
                pageContent.style.display = 'none';
                blockContent.style.display = 'block';
                document.body.classList.add('is-linking-block');
        
                // --- START: REVISED LOGIC (Identical to showLinkPopover) ---
                // 1. Remember the current view state.
                const currentActiveOption = rightSidebarViewToggle.querySelector('.rs-view-option.active');
                previousRightSidebarView = currentActiveOption ? currentActiveOption.dataset.view : 'references';
                
                // 2. Force switch to the references view.
                switchRightSidebarView('references');
                // --- END: REVISED LOGIC ---
        
                wasSidebarForcedOpen = appContainer.classList.contains('right-sidebar-collapsed');
                if (wasSidebarForcedOpen) setRightSidebarCollapsed(false);
                
                referenceManager.enableLinkingMode(true, (refData) => {
                    const link = `${refData.filePath}#${refData.blockData.id}`;
                    if (currentPopoverCallback) currentPopoverCallback(link);
                    hidePopover(); // hidePopover will handle restoring the view.
                });
        
            } else { // 'page'
                blockContent.style.display = 'none';
                pageContent.style.display = 'block';
                if (allNotes.length === 0) ipc.requestNoteList(); else updateSearchResults('', searchResults);
        
                // --- REVISED: Let hidePopover handle all cleanup ---
                document.body.classList.remove('is-linking-block');
                referenceManager.enableLinkingMode(false);
                if (wasSidebarForcedOpen) {
                    setRightSidebarCollapsed(true);
                    wasSidebarForcedOpen = false; // Reset the flag.
                }
            }
        };

        popover.querySelectorAll('#ref-popover-mode-toggle .popover-mode-btn').forEach(btn => {
            btn.onmousedown = (e) => { e.stopPropagation(); setActiveMode(btn.dataset.mode); };
        });
        
        searchResults.addEventListener('mousedown', (e) => { e.preventDefault(); const item = e.target.closest('.search-result-item'); if (item && currentPopoverCallback) { currentPopoverCallback(item.dataset.path); hidePopover(); } });

        const initialMode = existingValue && existingValue.includes('#') ? 'block' : 'page';
        setActiveMode(initialMode);
        positionAndShowPopover(targetElement);
    }

    /**
     * Shows a popover for selecting a code block language.
     * @param {object} options - { targetElement, availableLanguages, callback }
     */
    window.showLanguagePickerPopover = function(options) {
        hidePopover(); // Ensure a clean slate
        const { targetElement, availableLanguages, callback } = options;
        currentPopoverCallback = callback; // The callback will receive the selected language string

        // --- 1. Build unique HTML for this popover ---
        popover.innerHTML = `
            <div class="popover-content">
                <div id="language-picker-container">
                    <input type="text" id="language-picker-search" placeholder="Search language...">
                    <div id="language-picker-list" class="popover-search-results"></div>
                </div>
            </div>
        `;

        // --- 2. Get references and add listeners ---
        const searchInput = popover.querySelector('#language-picker-search');
        const listContainer = popover.querySelector('#language-picker-list');

        const renderList = (filter = '') => {
            const lowerCaseFilter = filter.toLowerCase();
            const filteredLangs = availableLanguages.filter(lang => lang.toLowerCase().includes(lowerCaseFilter));
            listContainer.innerHTML = filteredLangs.map(lang => `<div class="language-item" data-lang="${lang}">${lang}</div>`).join('');
        };
        
        searchInput.addEventListener('input', () => renderList(searchInput.value));
        
        listContainer.addEventListener('mousedown', (event) => {
            event.preventDefault();
            const item = event.target.closest('.language-item');
            if (item && currentPopoverCallback) {
                currentPopoverCallback(item.dataset.lang);
                hidePopover();
            }
        });

        // --- 3. Initial state and display ---
        renderList('');
        searchInput.focus();
        positionAndShowPopover(targetElement);
    }

    /**
     * Shows a popover with options for dropping a reference item.
     * @param {object} options - { targetElement, callback }
     */
    window.showReferenceDropPopover = function(options) {
        hidePopover(); // Ensure a clean slate
        const { targetElement, callback } = options;
        currentPopoverCallback = callback;

        // 1. Build unique HTML for this popover
        popover.innerHTML = `
            <div class="context-menu" style="display: block; position: static; width: 100%; box-shadow: none; border: none;">
                <div class="context-menu-item" data-action="createQuote">Create Quote</div>
                <div class="context-menu-item" data-action="createCopy">Create Copy</div>
                <div class="context-menu-item" data-action="createLink">Create Link</div>
            </div>
        `;
        // We are reusing the context-menu styling for simplicity.

        // 2. Add event listeners
        popover.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const action = e.target.dataset.action;
                if (currentPopoverCallback) {
                    currentPopoverCallback(action);
                }
                hidePopover();
            });
        });

        // 3. Position and show
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
    // This listener now serves both image source and link popovers
    window.addEventListener('fileDialogClosed', (e) => { if (e.detail.payload.path && currentPopoverCallback) { currentPopoverCallback(e.detail.payload.path); hidePopover(); } });



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


    class SelectionManager {
        constructor() {
            this.selectedBlockIds = new Set();
            this.activeEditor = null;
        }

        _getEditor() {
            const activeTab = tabManager.getActiveTab();
            return activeTab ? activeTab.editor : null;
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
            updateDetailsPanel(); 
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
    }
    
    const selectionManager = new SelectionManager();
    window.selectionManager = selectionManager;


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

            // ** NEW LOGIC STARTS HERE **
            let isUnsavedAndClosing = false;

            if (tabToClose.isUnsaved) {
                if (!confirm(`"${tabToClose.name}" has unsaved changes. Are you sure you want to close it?`)) {
                    return; // User cancelled
                }
                // Mark that we are closing an unsaved tab
                isUnsavedAndClosing = true;
            }
            // ** NEW LOGIC ENDS HERE **

            // Clean up DOM and memory
            tabToClose.dom.wrapper.remove();
            this.tabs.delete(path);
            this.tabOrder = this.tabOrder.filter(p => p !== path);

            // If we closed the active tab, switch to another one
            if (this.activeTabPath === path) {
                const newActivePath = this.tabOrder[this.tabOrder.length - 1] || null;
                this.activeTabPath = null; // Force switch
                this.switchTab(newActivePath);
            }
            
            this.render();

            // ** NEW: Dispatch event to revert references if needed **
            if (isUnsavedAndClosing) {
                window.dispatchEvent(new CustomEvent('tab:revert-references', {
                    detail: { filePath: path }
                }));
            }
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
            onTabSwitched();
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
            this.container = document.getElementById('references-view');
            this.placeholder = this.container.querySelector('.empty-references-placeholder');
            this.references = [];
            this.draggedItem = null;
            this._initListeners();
        }
        _initListeners() {
            this.container.addEventListener('dragover', this._handleDragOver.bind(this));
            this.container.addEventListener('dragleave', this._handleDragLeave.bind(this));
            this.container.addEventListener('drop', this._handleDrop.bind(this));
            this.container.addEventListener('dragstart', this._handleItemDragStart.bind(this));
            this.container.addEventListener('dragend', this._handleItemDragEnd.bind(this));
            this.container.addEventListener('click', this._handleClick.bind(this));
            window.addEventListener('block:updated', this.handleBlockUpdate.bind(this));
            window.addEventListener('block:deleted', this.handleBlockDeletion.bind(this));
            window.addEventListener('history:applied', this.handleHistoryChange.bind(this));
            window.addEventListener('tab:revert-references', this.handleRevertReferences.bind(this));
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

            const referencesView = document.getElementById('references-view');
            if (!referencesView || !referencesView.classList.contains('active')) {
                // If for any reason a drop event happens while not in references view, ignore it.
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
                    const refObject = this.references.find(r => r.blockData.id === blockId);
                    if (refObject) { newReferences.push(refObject); }
                });
                this.references = newReferences;
                this.render();
                return;
            }


            // --- START: NEW Multi-block drop logic ---
            const multiDragData = e.dataTransfer.getData('application/veritnote-block-ids');
            const singleDragId = e.dataTransfer.getData('text/plain');
            
            let blockIdsToAdd = [];

            if (multiDragData) {
                try {
                    blockIdsToAdd = JSON.parse(multiDragData);
                } catch (err) {
                    console.error("Failed to parse multi-drag data for references:", err);
                    return;
                }
            } else if (singleDragId) {
                blockIdsToAdd = [singleDragId];
            }

            if (blockIdsToAdd.length > 0) {
                const activeTab = tabManager.getActiveTab();
                if (activeTab) {
                    blockIdsToAdd.forEach(blockId => {
                        // Check if a reference for this block already exists.
                        if (this.references.some(ref => ref.blockData.id === blockId)) {
                            console.log(`Reference for block ${blockId} already exists, skipping.`);
                            return; // 'continue' for forEach loop
                        }

                        // Find the block instance from the editor's current state.
                        // This correctly handles parent/child relationships as each is found independently.
                        const blockInstance = activeTab.editor._findBlockInstanceById(activeTab.editor.blocks, blockId)?.block;
                        
                        if (blockInstance) {
                            // Add the reference using its most up-to-date data.
                            this.addReference(activeTab.path, blockInstance.data);
                        } else {
                            console.warn(`Could not find block instance for ID ${blockId} to create reference.`);
                        }
                    });
                }
            }
            // --- END: NEW Multi-block drop logic ---
        }
        _handleItemDragStart(e) {
            const item = e.target.closest('.reference-item');
            if (item) {
                this.draggedItem = item;
                const blockId = item.dataset.blockId;
                const refData = this.references.find(r => r.blockData.id === blockId);

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
            const scrollPos = this.container.scrollTop;
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
            this.container.scrollTop = scrollPos;
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
        handleRevertReferences(e) {
            const { filePath } = e.detail;
        
            // Find all references that belong to the closed, unsaved page
            const refsToRevert = this.references.filter(ref => ref.filePath === filePath);
        
            if (refsToRevert.length === 0) {
                return; // No references from this page, nothing to do
            }
        
            // We need to fetch the SAVED content of the page from the backend.
            // We'll create a temporary event listener to catch the response.
            const onPageRevertedListener = (loadEvent) => {
                // Check if the loaded data is for the page we requested
                if (loadEvent.detail.payload?.path === filePath) {
                    window.removeEventListener('pageLoaded', onPageRevertedListener); // Clean up listener
        
                    const savedContent = loadEvent.detail.payload.content;
                    if (!savedContent) return;
        
                    // Create a map of the SAVED block data for easy lookup
                    const savedBlocksMap = new Map();
                    const flattenBlocks = (blocks) => {
                        if (!blocks) return;
                        for (const block of blocks) {
                            savedBlocksMap.set(block.id, block);
                            if (block.children) {
                                flattenBlocks(block.children);
                            }
                        }
                    };
                    flattenBlocks(savedContent);
        
                    // Now, update our local reference data with the saved version
                    refsToRevert.forEach(refToRevert => {
                        const savedBlockData = savedBlocksMap.get(refToRevert.blockData.id);
                        if (savedBlockData) {
                            // Find the reference in the main array and update it
                            const mainRefIndex = this.references.findIndex(r => r.blockData.id === refToRevert.blockData.id);
                            if (mainRefIndex !== -1) {
                                this.references[mainRefIndex].blockData = savedBlockData;
                                
                                // Visually update the specific item in the DOM
                                const itemEl = this.container.querySelector(`.reference-item[data-block-id="${savedBlockData.id}"]`);
                                if (itemEl) {
                                    this.updateReferenceItemDOM(itemEl, this.references[mainRefIndex]);
                                }
                            }
                        }
                        // If the block doesn't exist in the saved version (e.g., it was a new, unsaved block),
                        // it will just be left as is. A more advanced implementation might remove it.
                        // For now, reverting to the last known saved state is sufficient.
                    });
                }
            };
            
            window.addEventListener('pageLoaded', onPageRevertedListener);
            
            // Request the saved content from the backend.
            // The blockIdToFocus can be null as we only need the content.
            ipc.loadPage(filePath, null);
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



    /**
    * Updates the right sidebar's "Details" panel based on the currently selected blocks.
    */
    function updateDetailsPanel() {
        const editor = selectionManager._getEditor();
        if (!editor || !detailsView) return;

        const selectedIds = selectionManager.get();
    
        // Clear previous content
        detailsView.innerHTML = '';

        if (selectedIds.length === 0) {
            detailsView.innerHTML = `<div class="empty-details-placeholder">Select a block to see its details.</div>`;
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
        detailsView.innerHTML = contentHtml;
    }


    /**
     * Finds the ID of the first block element that is visible at the top of a given scrollable container.
     * @param {HTMLElement} container The scrollable container (e.g., editor-view).
     * @returns {string|null} The ID of the top-most visible block, or null if none are found.
     */
    function getTopVisibleBlockId(container) {
        const containerRect = container.getBoundingClientRect();
        const blockElements = container.querySelectorAll('.block-container');
    
        for (const blockEl of blockElements) {
            const blockRect = blockEl.getBoundingClientRect();
            // Check if the block's top edge is at or below the container's top edge,
            // and if it's at least partially visible within the container's vertical space.
            if (blockRect.top >= containerRect.top && blockRect.top < containerRect.bottom) {
                return blockEl.dataset.id;
            }
        }
        // Fallback: If no block is perfectly at the top, find the first one that is at all visible.
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
     */
    function scrollToBlock(container, blockId) {
        if (!blockId) return;
        const targetElement = container.querySelector(`.block-container[data-id="${blockId}"]`);
        if (targetElement) {
            // 'start' aligns the top of the element with the top of the scrollable area.
            targetElement.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
    }


    // --- Update selection visuals when tab is switched ---
    function onTabSwitched() {
        selectionManager.clear(); // Clear selection when switching tabs for simplicity
        updateSidebarActiveState();
    }

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

    async function switchMode(mode, tab = null, forceRefresh = false) {
        const activeTab = tab || tabManager.getActiveTab();
        if (!activeTab) {
            return;
        }
    
        const wasInPreviewMode = activeTab.mode === 'preview';
    
        if (activeTab.mode === mode && !forceRefresh) {
            return;
        }
    
        // --- START: SCROLL SYNC LOGIC ---
        let topBlockId = null;
        const editorContainer = activeTab.dom.editorContainer;
        const previewContainer = activeTab.dom.previewContainer;
    
        // 1. Before switching, record the current scroll position.
        if (activeTab.mode === 'edit') {
            topBlockId = getTopVisibleBlockId(editorContainer);
        } else { // mode === 'preview'
            topBlockId = getTopVisibleBlockId(previewContainer);
        }
        // --- END: SCROLL SYNC LOGIC ---
    
        activeTab.mode = mode;
    
        if (mode === 'edit') {
            editorContainer.style.display = 'block';
            previewContainer.style.display = 'none';
    
            // Restore scroll position IN THE NEXT FRAME to ensure DOM is visible.
            requestAnimationFrame(() => {
                scrollToBlock(editorContainer, topBlockId);
            });
    
            if (wasInPreviewMode) {
                // This logic to re-fetch quote content remains the same.
                const triggerQuoteFetchRecursive = (blocks) => {
                    if (!blocks) return;
                    blocks.forEach(block => {
                        if (block.type === 'quote' && block.properties.referenceLink) {
                            ipc.fetchQuoteContent(block.id, block.properties.referenceLink);
                        }
                        if (block.children) {
                            triggerQuoteFetchRecursive(block.children);
                        }
                    });
                };
                triggerQuoteFetchRecursive(activeTab.editor.blocks);
            }
    
        } else { // mode === 'preview'
            // Generate the new HTML (this part is async).
            previewContainer.innerHTML = await activeTab.editor.getSanitizedHtml(false);
            
            editorContainer.style.display = 'none';
            previewContainer.style.display = 'block';
    
            // Restore scroll position. No need for requestAnimationFrame here because
            // we awaited the HTML generation, so the DOM is ready.
            scrollToBlock(previewContainer, topBlockId);
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

            // Dispatch a global event indicating a page has been saved.
            // This is the signal for QuoteBlocks to update themselves.
            window.dispatchEvent(new CustomEvent('page:saved', {
                detail: {
                    path: activeTab.path
                }
            }));
        }
    }

    window.addEventListener('page:saved', (e) => {
        const savedPath = e.detail.path;
        if (!savedPath) return;

        console.log(`A page was saved: ${savedPath}. Checking all open tabs for relevant quote blocks to update.`);

        // 1. 创建一个临时的、不可见的编辑器实例用于渲染
        const tempRenderContainer = document.createElement('div');
        tempRenderContainer.style.display = 'none';
        document.body.appendChild(tempRenderContainer);
        const tempEditor = new Editor(tempRenderContainer);
        window.registerAllBlocks(tempEditor);

        // 2. 遍历所有打开的标签页
        tabManager.tabs.forEach(tab => {
            // 我们需要操作的是标签页的 DOM 容器，而不是 editor 实例
            const editorContainer = tab.dom.editorContainer;
            if (!editorContainer) return;

            // 3. 找到当前标签页中所有引用了被保存文件的 QuoteBlock DOM 元素
            const quoteElements = editorContainer.querySelectorAll(`.block-content[data-type="quote"]`);
            
            quoteElements.forEach(quoteEl => {
                const blockId = quoteEl.dataset.id;
                // 从 DOM 中找到对应的 block 实例来获取其属性
                const blockInstance = tab.editor._findBlockInstanceById(tab.editor.blocks, blockId)?.block;
                
                if (blockInstance && blockInstance.properties.referenceLink) {
                    const referenceLink = blockInstance.properties.referenceLink;
                    const referencedPagePath = referenceLink.split('#')[0];

                    // 4. 如果这个引用块确实引用了刚刚被保存的文件
                    if (savedPath === referencedPagePath) {
                        console.log(`Found a quote block (${blockId}) in tab "${tab.path}" that needs updating.`);
                        
                        // 5. 向后端请求这个引用链接最新的内容
                        // 我们需要一种方式来接收这个内容并将其与正确的 DOM 元素关联起来
                        // 我们可以在请求时附带 tab ID 和 block ID
                        ipc.fetchQuoteContent(`${tab.id}::${blockId}`, referenceLink);
                    }
                }
            });
        });

        // 清理临时编辑器
        document.body.removeChild(tempRenderContainer);
    });

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

    // Add a listener for when quote content is loaded from the backend
    window.addEventListener('quoteContentLoaded', (e) => {
        const { quoteBlockId, content, error } = e.detail.payload;

        const parts = quoteBlockId.split('::');
        const isUpdateRequest = parts.length === 2;
        let targetTab, targetBlockId;

        if (isUpdateRequest) {
            const [tabId, blockId] = parts;
            targetTab = Array.from(tabManager.tabs.values()).find(t => t.id === tabId);
            targetBlockId = blockId;
        } else {
            targetTab = tabManager.getActiveTab();
            targetBlockId = quoteBlockId;
        }

        if (!targetTab) { return; }

        if (error) {
            console.error(`Error loading quote content for block ${targetBlockId} in tab ${targetTab.path}:`, error);
        }

        // --- THE CORE FIX: Handle both Edit and Preview modes ---
        if (targetTab.mode === 'preview') {
            // --- Case 1: Tab is in Preview Mode ---
            const targetPreviewDOM = targetTab.dom.previewContainer;
            const quoteElement = targetPreviewDOM.querySelector(`.block-container[data-id="${targetBlockId}"]`);
            if (quoteElement) {
                const previewContainer = quoteElement.querySelector('.quote-preview-container');
                if (previewContainer) {
                    previewContainer.innerHTML = ''; // Clear "Loading..."
                    if (!content || content.length === 0) {
                        previewContainer.innerHTML = '<div class="quote-error-placeholder">Referenced content could not be found.</div>';
                    } else {
                        // We need to render the raw block data into HTML
                        const tempRenderDiv = document.createElement('div');
                        const tempEditor = new Editor(tempRenderDiv);
                        window.registerAllBlocks(tempEditor);
                        const blockInstances = content.map(data => tempEditor.createBlockInstance(data)).filter(Boolean);
                        blockInstances.forEach(block => {
                            previewContainer.appendChild(block.render());
                        });
                    }
                }
            }
        } else {
            // --- Case 2: Tab is in Edit Mode (Original Logic, slightly improved) ---
            // It's better to find the block instance and call its method.
            const blockInstance = targetTab.editor._findBlockInstanceById(targetTab.editor.blocks, targetBlockId)?.block;
            if (blockInstance && typeof blockInstance.renderQuotedContent === 'function') {
                blockInstance.renderQuotedContent(content);
            }
        }
    });

    window.addEventListener('pageLoaded', async (e) => {
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
            // MODIFIED: await the switchMode call
            await switchMode(loadedTab.mode, loadedTab, true); 
    
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

    modeToggle.addEventListener('click', async (e) => {
        const option = e.target.closest('.mode-toggle-option');
        if (option) { 
            // await the switchMode call
            await switchMode(option.dataset.mode); 
        }
    });

    saveBtn.addEventListener('click', saveCurrentPage);

    window.addEventListener('editor:change', () => {
        const activeTab = tabManager.getActiveTab();
        if (activeTab) { tabManager.setUnsavedStatus(activeTab.path, true); }
    });

    document.addEventListener('keydown', (e) => {
        const activeTab = tabManager.getActiveTab();
        if (!activeTab) return;
        const activeEditor = activeTab.editor;
    
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectionManager.size() > 0) {
            
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
            
            const idsToDelete = selectionManager.get();
            activeEditor.deleteMultipleBlocks(idsToDelete);
            selectionManager.clear();
            return; // We've handled the event, so we're done.
        }
    
    
        // The rest of the shortcuts (Ctrl+S, Ctrl+W, undo/redo) remain unchanged.
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrentPage(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeTab) { tabManager.closeTab(activeTab.path); } return; }
    
        if ((e.ctrlKey || e.metaKey)) {
            const key = e.key.toLowerCase();
            if (key === 'z') { e.preventDefault(); if (e.shiftKey) { activeEditor.history.redo(); } else { activeEditor.history.undo(); } return; }
            if (key === 'y' && !e.shiftKey) { e.preventDefault(); activeEditor.history.redo(); return; }
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
        // --- 1. SELECTION LOGIC ---
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
                selectionManager.toggle(clickedBlockEl.dataset.id);
            } else {
                // This is for single-selecting by clicking the block's body
                selectionManager.set(clickedBlockEl.dataset.id);
            }
        } else {
            // This part handles clicking on the editor background, etc.
            const clickedUiChrome = e.target.closest(
                '#sidebar, #right-sidebar, #tab-bar, #floating-toolbar, #popover, #context-menu, #block-toolbar, .block-controls'
            );
            if (!clickedUiChrome) {
                selectionManager.clear();
            }
        }

        // --- 2. CONTEXT MENU & POPOVER CLOSING LOGIC (MERGED) ---
        if (!e.target.closest('#context-menu')) {
            contextMenu.style.display = 'none';
        }

        if (popover.style.display === 'block' && !isPopoverJustOpened) {
            // This condition correctly prevents the popover from closing on the same click that opened it.
            if (!popover.contains(e.target)) {
                // Special case: don't close popover if clicking a reference item in linking mode
                if (document.body.classList.contains('is-linking-block') && e.target.closest('.reference-item')) {
                    return;
                }
                hidePopover(); // Close the popover if the click is outside.
            }
        }

        // --- 3. FLAG RESET ---
        // This MUST be the last thing to run in this handler. It ensures that for the *next*
        // mousedown event, the flag is correctly set to false.
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
        // This is now more generic as we can't assume which search results container is visible
        const anySearchResults = popover.querySelector('.popover-search-results');
        const anySearchInput = popover.querySelector('#link-popover-input'); // only one type has an input
        if (popover.style.display === 'block' && anySearchResults) {
            const query = anySearchInput ? anySearchInput.value : '';
            updateSearchResults(query, anySearchResults);
        }
    });

    function updateSearchResults(query, container) {
        if (!container) return; // Safety check
        container.innerHTML = allNotes
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


        // NEW: Step 1.5: Pre-load and cache content for all quote blocks
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
                        if (!quoteContentCache.has(link)) {
                            quoteLinksToFetch.add(link);
                        }
                    }
                    if (block.children) findQuotesRecursive(block.children);
                });
            };
            findQuotesRecursive(pageData.content);

            for (const link of quoteLinksToFetch) {
                // This simulates the C++ backend logic on the frontend for export
                const [filePath, blockId] = link.split('#');
                // Find the already-loaded content for the referenced page
                const sourcePageData = allPagesContent.find(p => p.path === filePath);
                if (sourcePageData) {
                    let contentToCache = sourcePageData.content;
                    if (blockId) {
                        // If referencing a specific block, find it
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
            window.registerAllBlocks(tempEditor);
            
            tempEditor.load(pageData);
            const mainContentHtml = await tempEditor.getSanitizedHtml(true, workspaceData.path, options, imageSrcMap, quoteContentCache);
    
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
                    const containsActivePage = (folderNode) => {
                        if (!folderNode.children) return false;
                        return folderNode.children.some(child => {
                            if (child.path === currentPath) return true;
                            if (child.type === 'folder') return containsActivePage(child);
                            return false;
                        });
                    };
                    const isOpen = containsActivePage(node);
                    
                    html += `<div class="tree-node folder ${isOpen ? 'open' : ''}" data-path="${node.path}">
                                <span class="icon"></span>
                                <span class="name">${node.name}</span>
                             </div>`;
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
                    // --- FINAL STRUCTURE: A simple div with a data-href attribute. No <a> tag! ---
                    html += `<div class="tree-node page ${isActive ? 'active' : ''}" data-path="${node.path}" data-href="${relativePath}">
                                <span class="icon"></span>
                                <span class="name">${node.name}</span>
                             </div>`;
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
                            <svg xmlns="http://www.w.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                            <span>Collapse</span>
                        </button>
                    </div>
                </aside>
            `;
    
            // --- FINAL REVISION: The script now handles navigation via JS, no inline styles needed. ---
            const finalHtml = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>${path.substring(path.lastIndexOf('\\') + 1).replace('.veritnote', '')}</title>
        <link rel="stylesheet" href="${cssRelativePath}">
        ${libIncludes}
    </head>
    <body>
        <div class="app-container">
            <div id="sidebar-peek-trigger"></div>
            ${sidebarHtml}
            <main id="main-content">
                <div id="main-content-body">
                    <div id="editor-area-container">
                         <div class="editor-view">${mainContentHtml}</div>
                    </div>
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
                const urlParams = new URLSearchParams(window.location.search);
                const isPeekFromUrl = urlParams.get('peek') === 'true';
                let isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';

                if (isPeekFromUrl) {
                    isCollapsed = true;
                }
                
                if (isCollapsed) {
                    appContainer.classList.add('sidebar-collapsed');
                    if (toggleBtnSpan) toggleBtnSpan.textContent = 'Expand';
                    if (toggleBtnSvg) toggleBtnSvg.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>';
                }
                if (isPeekFromUrl) {
                    appContainer.classList.add('sidebar-peek');
                }
    
                // Folder expand/collapse logic
                sidebar.querySelectorAll('.tree-node.folder').forEach(folder => {
                    folder.addEventListener('click', (e) => {
                        if (e.target.closest('.tree-node.page')) return; // Ignore clicks on page items within folders
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

                // --- FINAL NAVIGATION LOGIC: Replicates editor behavior ---
                sidebar.addEventListener('click', function(e) {
                    const pageNode = e.target.closest('.tree-node.page');
                    if (!pageNode) return;

                    const href = pageNode.dataset.href;
                    if (!href) return;
                    
                    let finalUrl = href;
                    if (appContainer.classList.contains('sidebar-peek')) {
                        finalUrl += (href.includes('?') ? '&' : '?') + 'peek=true';
                    }
                    window.location.href = finalUrl;
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


    /**
     * Centralized function to switch the view of the right sidebar.
     * @param {string} viewName - The name of the view to switch to ('references' or 'details').
     */
    function switchRightSidebarView(viewName) {
        const views = { references: referencesView, details: detailsView };
        const slider = rightSidebarViewToggle.querySelector('.rs-view-slider');
        const optionToActivate = rightSidebarViewToggle.querySelector(`.rs-view-option[data-view="${viewName}"]`);
    
        if (!optionToActivate) return;
    
        // Move slider
        if (slider) {
            slider.style.left = `${optionToActivate.offsetLeft}px`;
        }
    
        // Toggle active state on buttons
        rightSidebarViewToggle.querySelectorAll('.rs-view-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.view === viewName);
        });
    
        // Toggle active state on view panels
        Object.values(views).forEach(view => {
            if (view) view.classList.remove('active');
        });
        if (views[viewName]) {
            views[viewName].classList.add('active');
        }
    }
    
    /**
     * Initializes the tab switching logic for the right sidebar.
     */
    function initRightSidebarTabs() {
        rightSidebarViewToggle.addEventListener('click', (e) => {
            const option = e.target.closest('.rs-view-option');
            if (option) {
                switchRightSidebarView(option.dataset.view);
            }
        });

        const referencesOption = rightSidebarViewToggle.querySelector('.rs-view-option[data-view="references"]');
        if (referencesOption) {
            referencesOption.addEventListener('dragenter', (e) => {
                // Only switch if a block is being dragged from the editor
                if (document.body.classList.contains('is-dragging-block')) {
                    switchRightSidebarView('references');
                }
            });
        }
    }

    initRightSidebarTabs();
});