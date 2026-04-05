// components/page-editor/popovers.js

import { ipc } from '../main/ipc.js';

const PRESET_COLORS = [
    '#000000', '#444444', '#666666', '#999999', '#CCCCCC', '#EEEEEE', '#F3F3F3', '#FFFFFF',
    '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#9900FF', '#FF00FF',
    '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
    '#009688', '#4CAF50', '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800', '#FF5722'
];

export class PopoverManager {
    editor;
    popover; // Get popover from the editor's elements

    isPopoverJustOpened;
    currentPopoverCallback;
    wasSidebarForcedOpen;
    previousRightSidebarView;

    constructor(editorInstance) {
        this.editor = editorInstance;
        this.popover = this.editor.elements.popover;
        
        this.isPopoverJustOpened = false;
        this.currentPopoverCallback = null;
        this.wasSidebarForcedOpen = false;
        this.previousRightSidebarView = 'references';
        
        // This MUST be the last thing in the constructor.
        this._initGlobalListener();
    }

    _initGlobalListener() {
        // Use a single, smart listener on the document for closing popovers.
        document.addEventListener('mousedown', (e:any) => {
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
            this.editor.PageReferenceManager.enableLinkingMode(false);
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

    showLink(targetElement, existingValue, callback) {
        this.hide();
        
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
            this.popover.querySelectorAll('#link-popover-mode-toggle .popover-mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset['mode'] === mode));
            
            if (mode === 'block') {
                pageContent.style.display = 'none';
                blockContent.style.display = 'block';
                document.body.classList.add('is-linking-block');
                
                // --- START: REVISED LOGIC ---
                // 1. Remember the current view
                const currentActiveOption = this.editor.elements.rightSidebarViewToggle.querySelector('.rs-view-option.active');
                this.previousRightSidebarView = currentActiveOption ? currentActiveOption.dataset['view'] : 'references';
                
                // 2. Force switch to references view
                this.editor.switchRightSidebarView('references');
                // --- END: REVISED LOGIC ---
        
                this.wasSidebarForcedOpen = this.editor.container.closest('.app-container').classList.contains('right-sidebar-collapsed');
                if (this.wasSidebarForcedOpen) this.editor.setRightSidebarCollapsed(false);
                
                this.editor.PageReferenceManager.enableLinkingMode(true, (refData) => {
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
                this.editor.updateSearchResults(popoverInput.value, searchResults);
                
                if (document.body.classList.contains('is-linking-block')) {
                    document.body.classList.remove('is-linking-block');
                    this.editor.PageReferenceManager.enableLinkingMode(false);
                    this.editor.switchRightSidebarView(this.previousRightSidebarView); // Restore view
                    if (this.wasSidebarForcedOpen) {
                        this.editor.setRightSidebarCollapsed(true);
                        this.wasSidebarForcedOpen = false; // Reset flag
                    }
                }
            }
        };

        this.popover.querySelectorAll('#link-popover-mode-toggle .popover-mode-btn').forEach(btn => {
            btn.onmousedown = (e) => { e.stopPropagation(); setActiveMode(btn.dataset['mode']); };
        });

        popoverInput.addEventListener('input', () => this.editor.updateSearchResults(popoverInput.value, searchResults));
        popoverInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (this.currentPopoverCallback) this.currentPopoverCallback(popoverInput.value); this.hide(); } });
        searchResults.addEventListener('mousedown', (e) => { e.preventDefault(); const item = e.target.closest('.search-result-item'); if (item && this.currentPopoverCallback) { const relativePath = window.makePathRelativeToWorkspace(item.dataset['path']); this.currentPopoverCallback(relativePath); this.hide(); } });

        const initialMode = existingValue && existingValue.indexOf('#') > -1 && existingValue.split('#')[1].length > 0 ? 'block' : 'page';
        setActiveMode(initialMode);

        this._positionAndShow(targetElement);
    }

    showDataFilePicker(targetElement, existingDbPath, existingPresetId, callback) {
        this.hide();
        this.currentPopoverCallback = callback;

        this.popover.innerHTML = `
            <div class="popover-content">
                <div id="db-step">
                    <input type="text" id="data-popover-input" placeholder="Search database file..." style="width:100%; margin-bottom:8px;">
                    <div id="data-popover-list" class="popover-search-results" style="max-height: 150px;"></div>
                </div>
                <div id="preset-step" style="display: none;">
                    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 4px;">Selected: <span id="selected-db-name" style="font-weight:bold; color:var(--text-primary);"></span></div>
                    <div id="preset-popover-list" class="popover-search-results" style="max-height: 150px;"></div>
                    <button id="back-to-db-btn" class="popover-button" style="margin-top: 8px;">Change Database</button>
                </div>
            </div>
        `;

        const dbStep = this.popover.querySelector('#db-step');
        const presetStep = this.popover.querySelector('#preset-step');
        const dbInput = this.popover.querySelector('#data-popover-input');
        const dbListContainer = this.popover.querySelector('#data-popover-list');
        const presetListContainer = this.popover.querySelector('#preset-popover-list');
        const selectedDbNameSpan = this.popover.querySelector('#selected-db-name');
        const backBtn = this.popover.querySelector('#back-to-db-btn');

        let currentSelectedDbPath = existingDbPath || '';
        let currentPresets = [];
        const allDataFiles = window.getAllDatabaseFiles ? window.getAllDatabaseFiles() : [];

        const renderDbList = (filter = '') => {
            const lowerFilter = filter.toLowerCase();
            const filtered = allDataFiles.filter(f => f.name.toLowerCase().includes(lowerFilter));

            if (filtered.length === 0) {
                dbListContainer.innerHTML = '<div class="empty-details-placeholder" style="padding:5px;">No files found.</div>';
                return;
            }

            // 去除 .veritnotedb 后缀显示
            dbListContainer.innerHTML = filtered.map(f => {
                const displayName = f.name.replace('.veritnotedb', '');
                const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`;
                return `
                <div class="search-result-item ${f.path === currentSelectedDbPath ? 'selected' : ''}" data-path="${f.path}" title="${f.path}">
                    ${iconSvg + " " + displayName}
                </div>
            `}).join('');
        };

        const renderPresetList = () => {
            if (currentPresets.length === 0) {
                presetListContainer.innerHTML = '<div class="empty-details-placeholder" style="padding:5px;">No presets found in this DB.</div>';
                return;
            }
            presetListContainer.innerHTML = currentPresets.map(p => `
                <div class="search-result-item ${p.id === existingPresetId ? 'selected' : ''}" data-preset-id="${p.id}">
                    👁️ ${p.name} <span style="font-size: 10px; color: var(--text-secondary);">(${p.type})</span>
                </div>
            `).join('');
        };

        const fetchAndShowPresets = (dbPath) => {
            currentSelectedDbPath = dbPath;
            const dbFile = allDataFiles.find(f => f.path === dbPath);
            selectedDbNameSpan.textContent = dbFile ? dbFile.name.replace('.veritnotedb', '') : dbPath.split(/[\\/]/).pop().replace('.veritnotedb', '');

            presetListContainer.innerHTML = '<div class="empty-details-placeholder" style="padding:5px;">Loading presets...</div>';
            dbStep.style.display = 'none';
            presetStep.style.display = 'block';

            const absolutePath = window.resolveWorkspacePath(dbPath);
            const reqId = 'popover-fetch-' + Date.now();

            const listener = (e) => {
                if (e.detail.payload.dataBlockId === reqId) {
                    window.removeEventListener('dataContentFetched', listener);
                    try {
                        const contentObj = typeof e.detail.payload.content === 'string' ? JSON.parse(e.detail.payload.content) : e.detail.payload.content;
                        currentPresets = contentObj.presets || [];
                        renderPresetList();
                    } catch (err) {
                        presetListContainer.innerHTML = '<div class="empty-details-placeholder" style="padding:5px; color:red;">Failed to parse database.</div>';
                    }
                }
            };
            window.addEventListener('dataContentFetched', listener);
            ipc.fetchDataContent(reqId, absolutePath);
        };

        dbInput.addEventListener('input', () => renderDbList(dbInput.value));

        dbListContainer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const item = e.target.closest('.search-result-item');
            if (item) {
                const relativePath = window.makePathRelativeToWorkspace ? window.makePathRelativeToWorkspace(item.dataset['path']) : item.dataset['path'];
                fetchAndShowPresets(relativePath);
            }
        });

        presetListContainer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const item = e.target.closest('.search-result-item');
            if (item && this.currentPopoverCallback) {
                this.currentPopoverCallback({
                    'dbPath': currentSelectedDbPath,
                    'presetId': item.dataset['presetId']
                });
                this.hide();
            }
        });

        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            presetStep.style.display = 'none';
            dbStep.style.display = 'block';
            renderDbList(dbInput.value);
            dbInput.focus();
        });

        // 初始化判断
        if (existingDbPath) {
            fetchAndShowPresets(existingDbPath); // 如果已有库，直接跳到预设选择器
        } else {
            renderDbList(dbInput.value);
            dbInput.focus();
        }

        this._positionAndShow(targetElement);
    }
    
    showImageSource(targetElement, existingValue, callback) {
        this.hide();
        
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
        localBtn.addEventListener('click', (e) => { e.preventDefault(); ipc.openFileDialog("Image File"); });
        const listener = (e) => {
            window.removeEventListener('fileDialogClosed', listener);
            this.currentPopoverCallback(e.detail.payload.path);
            this.hide();
        }
        window.addEventListener('fileDialogClosed', listener);

        this._positionAndShow(targetElement);
    }

    showVideoSource(targetElement, existingValue, callback) {
        this.hide();

        this.currentPopoverCallback = callback;

        this.popover.innerHTML = `
            <div class="popover-content">
                <input type="text" id="video-popover-input" placeholder="Enter video URL...">
                <button id="video-popover-local-btn" class="popover-button">Select Local File</button>
            </div>
        `;

        const videoInput = this.popover.querySelector('#video-popover-input');
        const localBtn = this.popover.querySelector('#video-popover-local-btn');

        videoInput.value = existingValue || '';
        videoInput.focus();

        videoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (this.currentPopoverCallback) this.currentPopoverCallback(e.target.value); this.hide(); } });
        localBtn.addEventListener('click', (e) => { e.preventDefault(); ipc.openFileDialog("Video File"); });
        const listener = (e) => {
            window.removeEventListener('fileDialogClosed', listener);
            this.currentPopoverCallback(e.detail.payload.path);
            this.hide();
        }
        window.addEventListener('fileDialogClosed', listener);

        this._positionAndShow(targetElement);
    }

    showAudioSource(targetElement, existingValue, callback) {
        this.hide();

        this.currentPopoverCallback = callback;

        this.popover.innerHTML = `
            <div class="popover-content">
                <input type="text" id="audio-popover-input" placeholder="Enter audio URL...">
                <button id="audio-popover-local-btn" class="popover-button">Select Local File</button>
            </div>
        `;

        const audioInput = this.popover.querySelector('#audio-popover-input');
        const localBtn = this.popover.querySelector('#audio-popover-local-btn');

        audioInput.value = existingValue || '';
        audioInput.focus();

        audioInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (this.currentPopoverCallback) this.currentPopoverCallback(e.target.value); this.hide(); } });
        localBtn.addEventListener('click', (e) => { e.preventDefault(); ipc.openFileDialog("Audio File"); });
        const listener = (e) => {
            window.removeEventListener('fileDialogClosed', listener);
            this.currentPopoverCallback(e.detail.payload.path);
            this.hide();
        }
        window.addEventListener('fileDialogClosed', listener);

        this._positionAndShow(targetElement);
    }

    showColorPicker(targetElement, callback) {
        this.hide();

        this.currentPopoverCallback = callback;
        
        this.popover.innerHTML = `<div class="popover-content"><div id="popover-color-picker-grid" class="popover-color-picker"></div></div>`;
        const colorPickerGrid = this.popover.querySelector('#popover-color-picker-grid');
        colorPickerGrid.innerHTML = PRESET_COLORS.map(c => `<div class="color-swatch" style="background-color: ${c}" data-color="${c}"></div>`).join('');
        
        colorPickerGrid.addEventListener('mousedown', (e) => { 
            e.preventDefault(); 
            const swatch = e.target.closest('.color-swatch'); 
            if (swatch && this.currentPopoverCallback) { 
                this.currentPopoverCallback(swatch.dataset['color']); 
                this.hide(); 
            } 
        });

        this._positionAndShow(targetElement);
    }

    showReference(targetElement, existingValue, callback) {
        this.hide();
        
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
            this.popover.querySelectorAll('#ref-popover-mode-toggle .popover-mode-btn').forEach(btn => btn.classList.toggle('active', btn.dataset['mode'] === mode));
            
            if (mode === 'block') {
                pageContent.style.display = 'none';
                blockContent.style.display = 'block';
                document.body.classList.add('is-linking-block');
        
                // --- START: REVISED LOGIC (Identical to showLinkPopover) ---
                // 1. Remember the current view state.
                const currentActiveOption = this.editor.elements.rightSidebarViewToggle.querySelector('.rs-view-option.active');
                this.previousRightSidebarView = currentActiveOption ? currentActiveOption.dataset['view'] : 'references';
                
                // 2. Force switch to the references view.
                this.editor.switchRightSidebarView('references');
                // --- END: REVISED LOGIC ---
        
                this.wasSidebarForcedOpen = this.editor.container.closest('.app-container').classList.contains('right-sidebar-collapsed');
                if (this.wasSidebarForcedOpen) this.editor.setRightSidebarCollapsed(false);
                
                this.editor.PageReferenceManager.enableLinkingMode(true, (refData) => {
                    const relativeFilePath = window.makePathRelativeToWorkspace(refData.filePath);
                    const link = `${relativeFilePath}#${refData.blockData.id}`;
                    if (this.currentPopoverCallback) this.currentPopoverCallback(link);
                    this.hide(); // hidePopover will handle restoring the view.
                });
        
            } else { // 'page'
                blockContent.style.display = 'none';
                pageContent.style.display = 'block';
                this.editor.updateSearchResults('', searchResults);
        
                // --- REVISED: Let hidePopover handle all cleanup ---
                document.body.classList.remove('is-linking-block');
                this.editor.PageReferenceManager.enableLinkingMode(false);
                if (this.wasSidebarForcedOpen) {
                    this.editor.setRightSidebarCollapsed(true);
                    this.wasSidebarForcedOpen = false; // Reset the flag.
                }
            }
        };

        this.popover.querySelectorAll('#ref-popover-mode-toggle .popover-mode-btn').forEach(btn => {
            btn.onmousedown = (e) => { e.stopPropagation(); setActiveMode(btn.dataset['mode']); };
        });
        
        searchResults.addEventListener('mousedown', (e) => { e.preventDefault(); const item = e.target.closest('.search-result-item'); if (item && this.currentPopoverCallback) { this.currentPopoverCallback(item.dataset['path']); this.hide(); } });

        const initialMode = existingValue && existingValue.indexOf('#') > -1 && existingValue.split('#')[1].length > 0 ? 'block' : 'page';
        setActiveMode(initialMode);

        this._positionAndShow(targetElement);
    }

    showLanguagePicker(targetElement, availableLanguages, callback) {
        this.hide();
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
                this.currentPopoverCallback(item.dataset['lang']);
                this.hide();
            }
        });

        // --- 3. Initial state and display ---
        renderList('');
        searchInput.focus();

        this._positionAndShow(targetElement);
    }

    showReferenceDrop(targetElement, callback) {
        this.hide();

        this.currentPopoverCallback = callback;

        // 1. Build unique HTML for this popover
        this.popover.innerHTML = `
            <div class="menu glass" style="position: static">
                <div class="menu-item" data-action="createQuote">Create Quote</div>
                <div class="menu-item" data-action="createCopy">Create Copy</div>
                <div class="menu-item" data-action="createLink">Create Link</div>
            </div>
        `;
        // We are reusing the context-menu styling for simplicity.

        // 2. Add event listeners
        this.popover.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const action = e.target.dataset['action'];
                if (this.currentPopoverCallback) {
                    this.currentPopoverCallback(action);
                }
                this.hide();
            });
        });

        // 3. Position and show
        this._positionAndShow(targetElement);
    }
}