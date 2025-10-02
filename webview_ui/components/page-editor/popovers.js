// components/page-editor/popovers.js

const PRESET_COLORS = [
    '#000000', '#444444', '#666666', '#999999', '#CCCCCC', '#EEEEEE', '#F3F3F3', '#FFFFFF',
    '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#9900FF', '#FF00FF',
    '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
    '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722'
];

class PopoverManager {
    constructor(editorInstance) {
        this.editor = editorInstance;
        this.popover = this.editor.elements.popover; // Get popover from the editor's elements
        
        this.isPopoverJustOpened = false;
        this.currentPopoverCallback = null;
        this.wasSidebarForcedOpen = false;
        this.previousRightSidebarView = 'references';
        
        // This MUST be the last thing in the constructor.
        this._initGlobalListener();
    }

    _initGlobalListener() {
        // Use a single, smart listener on the document for closing popovers.
        document.addEventListener('mousedown', (e) => {
            if (this.popover.style.display === 'block' && !this.isPopoverJustOpened) {
                if (!this.popover.contains(e.target)) {
                    // Special case: don't close popover if clicking a reference item in linking mode
                    if (document.body.classList.contains('is-linking-block') && e.target.closest('.reference-item')) {
                        return;
                    }
                    this.hide();
                }
            }
            // This MUST be the last thing. It ensures that for the *next* mousedown event,
            // the flag is correctly set to false.
            this.isPopoverJustOpened = false;
        }, true); // Use capture phase to catch the event early
    }

    hide(elementToClean = null) {
        if (this.popover.style.display !== 'block') return;

        this.popover.style.display = 'none';
        this.popover.innerHTML = '';

        if (document.body.classList.contains('is-linking-block')) {
            document.body.classList.remove('is-linking-block');
            this.editor.referenceManager.enableLinkingMode(false);
            this.editor.switchRightSidebarView(this.previousRightSidebarView);
        }

        if (this.wasSidebarForcedOpen) {
            this.editor.setRightSidebarCollapsed(true);
            this.wasSidebarForcedOpen = false;
        }

        this.currentPopoverCallback = null;
        if (elementToClean && elementToClean.parentElement) {
            elementToClean.parentElement.removeChild(elementToClean);
        }

        window.dispatchEvent(new CustomEvent('popoverClosed'));
    }

    _positionAndShow(targetElement) {
        this.isPopoverJustOpened = true;
        this.popover.style.visibility = 'hidden';
        this.popover.style.display = 'block';
        const popoverRect = this.popover.getBoundingClientRect();
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
        this.popover.style.top = `${topPosition}px`;
        this.popover.style.left = `${leftPosition}px`;
        this.popover.style.visibility = 'visible';
    }

    // --- Specific Popover Methods ---

    showLink(options) {
        this.hide();
        const { targetElement, existingValue, callback } = options;
        this.currentPopoverCallback = callback;
        
        this.popover.innerHTML = `
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
        
        const pageContent = this.popover.querySelector('#link-popover-page-content');
        const blockContent = this.popover.querySelector('#link-popover-block-content');
        const popoverInput = this.popover.querySelector('#link-popover-input');
        const searchResults = this.popover.querySelector('#link-popover-search-results');
        const instructionText = blockContent.querySelector('.popover-instruction');

        if (existingValue) {
            const el = document.createElement('div');
            el.className = 'current-link-display';
            el.textContent = `Current: ${existingValue}`;
            instructionText.appendChild(el);
        }

        const setActiveMode = (mode) => {
            this.popover.querySelectorAll('#link-popover-mode-toggle .popover-mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
            
            if (mode === 'block') {
                pageContent.style.display = 'none';
                blockContent.style.display = 'block';
                document.body.classList.add('is-linking-block');
                
                // --- START: REVISED LOGIC ---
                // 1. Remember the current view
                const currentActiveOption = this.editor.elements.rightSidebarViewToggle.querySelector('.rs-view-option.active');
                this.previousRightSidebarView = currentActiveOption ? currentActiveOption.dataset.view : 'references';
                
                // 2. Force switch to references view
                this.editor.switchRightSidebarView('references');
                // --- END: REVISED LOGIC ---
        
                this.wasSidebarForcedOpen = this.editor.container.closest('.app-container').classList.contains('right-sidebar-collapsed');
                if (this.wasSidebarForcedOpen) this.editor.setRightSidebarCollapsed(false);
                
                this.editor.referenceManager.enableLinkingMode(true, (refData) => {
                    const relativeFilePath = window.makePathRelativeToWorkspace(refData.filePath);
                    const link = `${relativeFilePath}#${refData.blockData.id}`;
                    if (this.currentPopoverCallback) this.currentPopoverCallback(link);
                    this.hide(); // hidePopover will handle restoring the view
                });
        
            } else { // 'page'
                blockContent.style.display = 'none';
                pageContent.style.display = 'block';
                popoverInput.value = existingValue || '';
                popoverInput.focus();
                if (this.editor.allNotes.length === 0) ipc.requestNoteList(); else this.editor.updateSearchResults(popoverInput.value, searchResults);
                
                if (document.body.classList.contains('is-linking-block')) {
                    document.body.classList.remove('is-linking-block');
                    this.editor.referenceManager.enableLinkingMode(false);
                    this.editor.switchRightSidebarView(this.previousRightSidebarView); // Restore view
                    if (this.wasSidebarForcedOpen) {
                        this.editor.setRightSidebarCollapsed(true);
                        this.wasSidebarForcedOpen = false; // Reset flag
                    }
                }
            }
        };

        this.popover.querySelectorAll('#link-popover-mode-toggle .popover-mode-btn').forEach(btn => {
            btn.onmousedown = (e) => { e.stopPropagation(); setActiveMode(btn.dataset.mode); };
        });

        popoverInput.addEventListener('input', () => this.editor.updateSearchResults(popoverInput.value, searchResults));
        popoverInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (this.currentPopoverCallback) this.currentPopoverCallback(popoverInput.value); this.hide(); } });
        searchResults.addEventListener('mousedown', (e) => { e.preventDefault(); const item = e.target.closest('.search-result-item'); if (item && this.currentPopoverCallback) { const relativePath = window.makePathRelativeToWorkspace(item.dataset.path); this.currentPopoverCallback(relativePath); this.hide(); } });

        const initialMode = existingValue && existingValue.includes('#') ? 'block' : 'page';
        setActiveMode(initialMode);

        this._positionAndShow(targetElement);
    }
    
    showImageSource(options) {
        this.hide();
        const { targetElement, existingValue, callback } = options;
        this.currentPopoverCallback = callback;
        
        this.popover.innerHTML = `
            <div class="popover-content">
                <input type="text" id="image-popover-input" placeholder="Enter image URL...">
                <button id="image-popover-local-btn" class="popover-button">Select Local File</button>
            </div>
        `;
        
        const imageInput = this.popover.querySelector('#image-popover-input');
        const localBtn = this.popover.querySelector('#image-popover-local-btn');
        
        imageInput.value = existingValue || '';
        imageInput.focus();
        
        imageInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (this.currentPopoverCallback) this.currentPopoverCallback(e.target.value); this.hide(); } });
        localBtn.addEventListener('click', (e) => { e.preventDefault(); ipc.openFileDialog(); });

        this._positionAndShow(targetElement);
    }

    showColorPicker(options) {
        this.hide();
        const { targetElement, callback } = options;
        this.currentPopoverCallback = callback;
        
        this.popover.innerHTML = `<div class="popover-content"><div id="popover-color-picker-grid" class="popover-color-picker"></div></div>`;
        const colorPickerGrid = this.popover.querySelector('#popover-color-picker-grid');
        colorPickerGrid.innerHTML = PRESET_COLORS.map(c => `<div class="color-swatch" style="background-color: ${c}" data-color="${c}"></div>`).join('');
        
        colorPickerGrid.addEventListener('mousedown', (e) => { 
            e.preventDefault(); 
            const swatch = e.target.closest('.color-swatch'); 
            if (swatch && this.currentPopoverCallback) { 
                this.currentPopoverCallback(swatch.dataset.color); 
                this.hide(); 
            } 
        });

        this._positionAndShow(options.targetElement);
    }

    showReference(options) {
        this.hide();
        const { targetElement, existingValue, callback } = options;
        this.currentPopoverCallback = callback;
        
        this.popover.innerHTML = `
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

        const pageContent = this.popover.querySelector('#ref-popover-page-content');
        const blockContent = this.popover.querySelector('#ref-popover-block-content');
        const searchResults = this.popover.querySelector('#ref-popover-search-results');
        const instructionText = blockContent.querySelector('.popover-instruction');

        if (existingValue) {
            const el = document.createElement('div');
            el.className = 'current-link-display';
            el.textContent = `Current: ${existingValue}`;
            instructionText.appendChild(el);
        }

        const setActiveMode = (mode) => {
            this.popover.querySelectorAll('#ref-popover-mode-toggle .popover-mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
            
            if (mode === 'block') {
                pageContent.style.display = 'none';
                blockContent.style.display = 'block';
                document.body.classList.add('is-linking-block');
        
                // --- START: REVISED LOGIC (Identical to showLinkPopover) ---
                // 1. Remember the current view state.
                const currentActiveOption = this.editor.elements.rightSidebarViewToggle.querySelector('.rs-view-option.active');
                this.previousRightSidebarView = currentActiveOption ? currentActiveOption.dataset.view : 'references';
                
                // 2. Force switch to the references view.
                this.editor.switchRightSidebarView('references');
                // --- END: REVISED LOGIC ---
        
                this.wasSidebarForcedOpen = this.editor.container.closest('.app-container').classList.contains('right-sidebar-collapsed');
                if (this.wasSidebarForcedOpen) this.editor.setRightSidebarCollapsed(false);
                
                this.editor.referenceManager.enableLinkingMode(true, (refData) => {
                    const relativeFilePath = window.makePathRelativeToWorkspace(refData.filePath);
                    const link = `${relativeFilePath}#${refData.blockData.id}`;
                    if (this.currentPopoverCallback) this.currentPopoverCallback(link);
                    this.hide(); // hidePopover will handle restoring the view.
                });
        
            } else { // 'page'
                blockContent.style.display = 'none';
                pageContent.style.display = 'block';
                if (this.editor.allNotes.length === 0) ipc.requestNoteList(); else this.editor.updateSearchResults('', searchResults);
        
                // --- REVISED: Let hidePopover handle all cleanup ---
                document.body.classList.remove('is-linking-block');
                this.editor.referenceManager.enableLinkingMode(false);
                if (this.wasSidebarForcedOpen) {
                    this.editor.setRightSidebarCollapsed(true);
                    this.wasSidebarForcedOpen = false; // Reset the flag.
                }
            }
        };

        this.popover.querySelectorAll('#ref-popover-mode-toggle .popover-mode-btn').forEach(btn => {
            btn.onmousedown = (e) => { e.stopPropagation(); setActiveMode(btn.dataset.mode); };
        });
        
        searchResults.addEventListener('mousedown', (e) => { e.preventDefault(); const item = e.target.closest('.search-result-item'); if (item && this.currentPopoverCallback) { this.currentPopoverCallback(item.dataset.path); this.hide(); } });

        const initialMode = existingValue && existingValue.includes('#') ? 'block' : 'page';
        setActiveMode(initialMode);

        this._positionAndShow(options.targetElement);
    }

    showLanguagePicker(options) {
        this.hide();
        const { targetElement, availableLanguages, callback } = options;
        this.currentPopoverCallback = callback; // The callback will receive the selected language string

        // --- 1. Build unique HTML for this popover ---
        this.popover.innerHTML = `
            <div class="popover-content">
                <div id="language-picker-container">
                    <input type="text" id="language-picker-search" placeholder="Search language...">
                    <div id="language-picker-list" class="popover-search-results"></div>
                </div>
            </div>
        `;

        // --- 2. Get references and add listeners ---
        const searchInput = this.popover.querySelector('#language-picker-search');
        const listContainer = this.popover.querySelector('#language-picker-list');

        const renderList = (filter = '') => {
            const lowerCaseFilter = filter.toLowerCase();
            const filteredLangs = availableLanguages.filter(lang => lang.toLowerCase().includes(lowerCaseFilter));
            listContainer.innerHTML = filteredLangs.map(lang => `<div class="language-item" data-lang="${lang}">${lang}</div>`).join('');
        };
        
        searchInput.addEventListener('input', () => renderList(searchInput.value));
        
        listContainer.addEventListener('mousedown', (event) => {
            event.preventDefault();
            const item = event.target.closest('.language-item');
            if (item && this.currentPopoverCallback) {
                this.currentPopoverCallback(item.dataset.lang);
                this.hide();
            }
        });

        // --- 3. Initial state and display ---
        renderList('');
        searchInput.focus();

        this._positionAndShow(options.targetElement);
    }

    showReferenceDrop(options) {
        this.hide();
        const { targetElement, callback } = options;
        this.currentPopoverCallback = callback;

        // 1. Build unique HTML for this popover
        this.popover.innerHTML = `
            <div class="context-menu" style="display: block; position: static; width: 100%; box-shadow: none; border: none;">
                <div class="context-menu-item" data-action="createQuote">Create Quote</div>
                <div class="context-menu-item" data-action="createCopy">Create Copy</div>
                <div class="context-menu-item" data-action="createLink">Create Link</div>
            </div>
        `;
        // We are reusing the context-menu styling for simplicity.

        // 2. Add event listeners
        this.popover.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const action = e.target.dataset.action;
                if (this.currentPopoverCallback) {
                    this.currentPopoverCallback(action);
                }
                this.hide();
            });
        });

        // 3. Position and show
        this._positionAndShow(options.targetElement);
    }
}