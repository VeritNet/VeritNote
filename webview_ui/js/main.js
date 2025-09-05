// js/main.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Element acquisition (no change) ---
    const sidebar = document.getElementById('workspace-tree');
    const editorContainer = document.getElementById('editor');
    const previewContainer = document.getElementById('preview');
    const currentPagePathEl = document.getElementById('current-page-path');
    const editorModeBtn = document.getElementById('editor-mode-btn');
    const previewModeBtn = document.getElementById('preview-mode-btn');
    const exportBtn = document.getElementById('export-btn');
    const contextMenu = document.getElementById('context-menu');
    const exportOverlay = document.getElementById('export-overlay');
    const progressBar = document.getElementById('progress-bar');
    const exportStatus = document.getElementById('export-status');
    let contextMenuTarget = null;
    const popover = document.getElementById('popover');
    const popoverInput = document.getElementById('popover-input');
    const searchResultsContainer = document.getElementById('popover-search-results');
    const colorPickerContainer = document.getElementById('popover-color-picker');
    const localFileBtn = document.getElementById('popover-local-file-btn');

    // --- Initialization ---
    // Create the editor instance
    const editor = new Editor(editorContainer);
    
    // *** NEW: Register all available block types ***
    editor.registerBlock(ParagraphBlock);
    editor.registerBlock(Heading1Block);
    editor.registerBlock(Heading2Block);
    editor.registerBlock(ImageBlock);
    editor.registerBlock(LinkButtonBlock);
    editor.registerBlock(CalloutBlock);
    editor.registerBlock(ColumnsBlock);
    editor.registerBlock(ColumnBlock);
    editor.registerBlock(CodeBlock);

    let currentOpenFile = null;
    let popoverCallback = null;
    let allNotes = [];
    const PRESET_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F7D154', '#B298DC', '#cccccc', '#8c8c8c', '#569cd6'];

    // --- Function Definitions (mostly unchanged) ---
    
    function renderWorkspaceTree(node) {
        if (!node) return '';
        let html = '';
        if (node.type === 'folder') {
            html += `<div class="tree-node folder" data-path="${node.path}">
                        <span class="icon"></span>
                        <span class="name">${node.name}</span>
                     </div>`;
            if (node.children && node.children.length > 0) {
                html += '<div class="tree-node-children" style="display: none;">'; // Initially hidden
                node.children.forEach(child => {
                    html += renderWorkspaceTree(child);
                });
                html += '</div>';
            }
        } else if (node.type === 'page') {
            html += `<div class="tree-node page" data-path="${node.path}">
                        <span class="icon"></span>
                        <span class="name">${node.name}</span>
                     </div>`;
        }
        return html;
    }

    function switchMode(mode) {
        if (mode === 'editor') {
            editorContainer.style.display = 'block';
            previewContainer.style.display = 'none';
            editorModeBtn.classList.add('active');
            previewModeBtn.classList.remove('active');
        } else { // preview mode
            previewContainer.className = 'editor-view';
            previewContainer.innerHTML = `<div id="editor-content-wrapper">${editor.getSanitizedHtml(false)}</div>`;
            
            editorContainer.style.display = 'none';
            previewContainer.style.display = 'block';
            editorModeBtn.classList.remove('active');
            previewModeBtn.classList.add('active');
        }
    }

    // --- C++ message listeners (no change in logic, just using English UI text) ---
    window.addEventListener('workspaceListed', (e) => {
        console.log('--- JS Frontend ---');
        console.log('Received "workspaceListed" event from C++!', e.detail);
        const workspaceData = e.detail.payload;
        sidebar.dataset.workspaceData = JSON.stringify(workspaceData);
        if (workspaceData && workspaceData.children && workspaceData.children.length > 0) {
            sidebar.innerHTML = renderWorkspaceTree(workspaceData);
        } else {
            sidebar.innerHTML = `<div class="empty-workspace">Workspace is empty.<br>Right-click here to create a new page.</div>`;
            editor.load({path: '', content: []});
            currentPagePathEl.textContent = "Please select or create a note";
        }
    });

    window.addEventListener('noteListReceived', (e) => {
        allNotes = e.detail.payload;
        if (popover.style.display === 'block') {
            updateSearchResults(popoverInput.value);
        }
    });

    sidebar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenuTarget = e.target.closest('.tree-node, #workspace-tree'); // Allow right-clicking on empty space
        if (!contextMenuTarget) return;

        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.display = 'block';
    });

    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });
    
    contextMenu.addEventListener('click', (e) => {
        if (!contextMenuTarget) return;
        const action = e.target.dataset.action;
        let targetPath = contextMenuTarget.dataset.path || '';

        // Determine parent path
        let parentPath = '';
        if (contextMenuTarget.id === 'workspace-tree') {
             // Right-clicked on the empty sidebar, use root path from workspace data
            const workspaceData = JSON.parse(sidebar.dataset.workspaceData || '{}');
            parentPath = workspaceData.path || '';
        } else if (contextMenuTarget.classList.contains('folder')) {
            parentPath = targetPath;
        } else { // It's a page or the root element without a path
            parentPath = targetPath.substring(0, targetPath.lastIndexOf('\\'));
        }
        
        if (!parentPath && sidebar.dataset.workspaceData) {
            parentPath = JSON.parse(sidebar.dataset.workspaceData).path;
        }

        switch(action) {
            case 'newPage': {
                const name = prompt("Page Name", "MyPage");
                if (name) ipc.createItem(parentPath, name, 'page');
                break;
            }
            case 'newFolder': {
                const name = prompt("Folder Name", "MyFolder");
                if (name) ipc.createItem(parentPath, name, 'folder');
                break;
            }
            case 'delete': {
                if (confirm(`Delete "${targetPath}"?`)) {
                    ipc.deleteItem(targetPath);
                }
                break;
            }
        }
    });

    window.addEventListener('workspaceUpdated', () => {
        ipc.listWorkspace();
    });

    window.addEventListener('pageLoaded', (e) => {
        const pageData = e.detail.payload;
        if (e.detail.error) {
            alert(`Error loading page: ${e.detail.error}`);
            return;
        }
        currentOpenFile = pageData.path;
        editor.load(pageData); // Use the new editor's load method
        currentPagePathEl.textContent = pageData.path;

        setUnsavedStatus(false);
    
        sidebar.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
        const targetNode = sidebar.querySelector(`.tree-node.page[data-path="${pageData.path.replace(/\\/g, '\\\\')}"]`);
        if (targetNode) {
            targetNode.classList.add('active');
            let parentFolder = targetNode.closest('.tree-node-children')?.previousElementSibling;
            while(parentFolder && parentFolder.classList.contains('folder')) {
                parentFolder.classList.add('open');
                parentFolder.nextElementSibling.style.display = 'block';
                parentFolder = parentFolder.closest('.tree-node-children')?.previousElementSibling;
            }
        }

        if (pageData.fromPreview) {
            setTimeout(() => switchMode('preview'), 0);
        } else {
            switchMode('editor');
        }
    });

    window.addEventListener('pageSaved', (e) => {
        console.log(`Page saved: ${e.detail.payload.path}`, e.detail.payload.success);
    });

    // --- User Interaction (no change) ---
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
            sidebar.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
            target.classList.add('active');
            ipc.loadPage(path);
        }
    });
    
    editorModeBtn.addEventListener('click', () => switchMode('editor'));
    previewModeBtn.addEventListener('click', () => switchMode('preview'));


    window.addEventListener('editor:change', () => {
        setUnsavedStatus(true);
    });

    // --- Export Logic (no change, but will use the new editor structure) ---
    window.addEventListener('exportReady', async () => {
        await runExportProcess();
    });
    
    window.addEventListener('exportError', (e) => {
        alert(`Export failed: ${e.detail.error}`);
        hideExportOverlay();
    });

    // --- NEW: Add keyboard shortcuts for Undo/Redo ---
    document.addEventListener('keydown', (e) => {
        // --- Save Shortcut (Ctrl+S) ---
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveCurrentPage(); // Assumes saveCurrentPage function is defined in this scope
            return; // Stop further processing for this event
        }
        
        // --- Undo/Redo Shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z) ---
        // *** FIX: Removed the focus check. These shortcuts should work globally within the app window. ***
        if (e.ctrlKey || e.metaKey) { // Ctrl on Windows, Cmd on Mac
            const key = e.key.toLowerCase();

            if (key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    editor.history.redo();
                } else {
                    editor.history.undo();
                }
                return;
            }

            if (key === 'y' && !e.shiftKey) {
                 e.preventDefault();
                 editor.history.redo();
                 return;
            }
        }
    });

    let allFilesToExport = [];
    
    function getAllFiles(node, fileList) {
        if (node.type === 'page') {
            fileList.push(node.path);
        } else if (node.type === 'folder' && node.children) {
            node.children.forEach(child => getAllFiles(child, fileList));
        }
    }

    async function runExportProcess() {
        const workspaceData = JSON.parse(sidebar.dataset.workspaceData || '{}');
        function generateSidebarHtml(node, currentPath) {
            // ... (this function remains identical)
            let html = '';
            if (node.type === 'folder') {
                html += `<div class="sidebar-folder"><strong>${node.name}</strong>`;
                if (node.children && node.children.length > 0) {
                    html += '<ul>';
                    node.children.forEach(child => {
                        html += `<li>${generateSidebarHtml(child, currentPath)}</li>`;
                    });
                    html += '</ul>';
                }
                html += `</div>`;
            } else if (node.type === 'page') {
                const relativePath = node.path.substring(workspaceData.path.length + 1).replace(/\\/g, '/').replace('.veritnote', '.html');
                const isCurrent = (node.path === currentPath);
                html += `<a href="${relativePath}" class="${isCurrent ? 'current' : ''}">${node.name}</a>`;
            }
            return html;
        }
        const sidebarHtml = `<nav class="exported-sidebar">${generateSidebarHtml(workspaceData, null)}</nav>`;

        for (let i = 0; i < allFilesToExport.length; i++) {
            const path = allFilesToExport[i];
            const progress = ((i + 1) / allFilesToExport.length) * 100;
            exportStatus.textContent = `Processing: ${path}`;
            
            const pageData = await new Promise(resolve => {
                const handler = (e) => {
                    window.removeEventListener('pageLoaded', handler);
                    resolve(e.detail.payload);
                };
                window.addEventListener('pageLoaded', handler);
                ipc.loadPage(path);
            });
            
            // The magic happens here: use a temporary editor instance
            const tempEditorContainer = document.createElement('div');
            const tempEditor = new Editor(tempEditorContainer);
            // Register blocks for the temp editor too
            tempEditor.registerBlock(ParagraphBlock);
            tempEditor.registerBlock(Heading1Block);
            tempEditor.registerBlock(Heading2Block);
            tempEditor.registerBlock(ImageBlock);
            tempEditor.registerBlock(LinkButtonBlock);
            tempEditor.registerBlock(CalloutBlock);
            tempEditor.registerBlock(ColumnsBlock);
            tempEditor.registerBlock(ColumnBlock);
            
            tempEditor.load(pageData);
            const mainContentHtml = tempEditor.getSanitizedHtml(true, workspaceData.path);
            
            const sourcePath = allFilesToExport[i];
            const workspacePath = workspaceData.path;
            const relativePathStr = sourcePath.substring(workspacePath.length + 1);
            const depth = (relativePathStr.match(/\\/g) || []).length;
            const cssRelativePath = depth > 0 ? '../'.repeat(depth) + 'style.css' : 'style.css';

            const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${path.substring(path.lastIndexOf('\\') + 1).replace('.veritnote', '')}</title>
    <link rel="stylesheet" href="${cssRelativePath}">
    <style>
        body { display: flex; margin: 0; }
        .exported-sidebar { width: 250px; flex-shrink: 0; padding: 20px; border-right: 1px solid #444; height: 100vh; overflow-y: auto; box-sizing: border-box; }
        .exported-sidebar a { display: block; color: #569cd6; text-decoration: none; padding: 5px; border-radius: 4px; }
        .exported-sidebar a:hover { background-color: #333; }
        .exported-sidebar a.current { background-color: #569cd6; color: #fff; }
        .exported-sidebar ul { list-style: none; padding-left: 20px; }
        .exported-main { flex-grow: 1; height: 100vh; overflow-y: auto; box-sizing: border-box; }
        .exported-main .editor-view { padding: 40px; } 
    </style>
</head>
<body>
    ${sidebarHtml.replace(/<a href="[^"]*"/g, (match) => match.replace(new RegExp(`class="current"`), ''))}
    <main class="exported-main">
        <div class="editor-view">
            <div id="editor-content-wrapper">${mainContentHtml}</div>
        </div>
    </main>
</body>
</html>`;
            
            ipc.exportPageAsHtml(path, finalHtml);
            progressBar.style.width = `${progress}%`;
        }
        exportStatus.textContent = 'Done!';
        setTimeout(hideExportOverlay, 1500);
    }
    
    function showExportOverlay() {
        exportOverlay.style.display = 'flex';
        progressBar.style.width = '0%';
    }

    function hideExportOverlay() {
        exportOverlay.style.display = 'none';
    }

    exportBtn.addEventListener('click', () => {
        const workspaceData = JSON.parse(sidebar.dataset.workspaceData || '{}');
        allFilesToExport = [];
        getAllFiles(workspaceData, allFilesToExport);
        if (allFilesToExport.length === 0) {
            alert('No pages to export in this workspace.');
            return;
        }
        showExportOverlay();
        ipc.startExport();
    });

    // --- Popover Logic (no change) ---
    function showPopover(targetElement, options = {}) {
        const rect = targetElement.getBoundingClientRect();
        popover.style.top = `${rect.bottom + 5}px`;
        if (rect.left + 320 > window.innerWidth) {
            popover.style.left = `${window.innerWidth - 330}px`;
        } else {
            popover.style.left = `${rect.left}px`;
        }
        popover.style.display = 'block';

        popoverCallback = options.callback;
        
        const inputGroup = document.getElementById('popover-input-group');
        const searchResults = document.getElementById('popover-search-results');
        const colorPicker = document.getElementById('popover-color-picker');
        
        if (options.type === 'color') {
            inputGroup.style.display = 'none';
            searchResults.style.display = 'none';
            localFileBtn.style.display = 'none';
            colorPicker.style.display = 'grid';
            colorPicker.innerHTML = PRESET_COLORS.map(color => 
                `<div class="color-swatch" style="background-color: ${color}" data-color="${color}"></div>`
            ).join('');
        } else { 
            inputGroup.style.display = 'block';
            colorPicker.style.display = 'none';
            popoverInput.value = options.existingValue || '';
        
            if (options.isImageSource) {
                popoverInput.placeholder = 'Enter image URL or select local file...';
                searchResults.style.display = 'none';
                localFileBtn.style.display = 'block';
            } else {
                popoverInput.placeholder = 'Enter a link or search for a page...';
                searchResults.style.display = 'block';
                localFileBtn.style.display = 'none';
            }
            popoverInput.focus();
            
            if (searchResults.style.display === 'block') {
                if (allNotes.length === 0) {
                    ipc.requestNoteList();
                } else {
                    updateSearchResults(popoverInput.value);
                }
            }
        }
    }


    function updateSearchResults(query) {
        searchResultsContainer.innerHTML = '';
        const filteredNotes = allNotes.filter(note => note.name.toLowerCase().includes(query.toLowerCase()));
        filteredNotes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.textContent = `📄 ${note.name}`;
            item.dataset.path = note.path;
            searchResultsContainer.appendChild(item);
        });
    }

    window.addEventListener('showLinkPopover', (e) => showPopover(e.detail.targetElement, e.detail));
    window.addEventListener('showColorPicker', (e) => showPopover(e.detail.targetElement, { ...e.detail, type: 'color' }));

    localFileBtn.addEventListener('click', (e) => {
        e.preventDefault();
        ipc.openFileDialog();
    });

    window.addEventListener('fileDialogClosed', (e) => {
        const path = e.detail.payload.path;
        if (path && popoverCallback) {
            popoverCallback(path);
            editor.hidePopover();
        }
    });
    
    document.addEventListener('click', (e) => {
        if (!popover.contains(e.target) && popover.style.display === 'block' && !e.target.closest('.toolbar-button') && !e.target.closest('.code-block-lang-selector')) {
            editor.hidePopover();
        }
        contextMenu.style.display = 'none';
    });
    
    popoverInput.addEventListener('input', () => updateSearchResults(popoverInput.value));
    popoverInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (popoverCallback) popoverCallback(popoverInput.value);
            editor.hidePopover();
        }
    });
    searchResultsContainer.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        const item = e.target.closest('.search-result-item');
        if (item && popoverCallback) {
            popoverCallback(item.dataset.path);
            editor.hidePopover();
        }
    });
    colorPickerContainer.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
        const swatch = e.target.closest('.color-swatch');
        if (swatch && popoverCallback) {
            popoverCallback(swatch.dataset.color);
            editor.hidePopover(); 
        }
    });



    // --- NEW: Add a save button and state management ---
    const saveBtn = document.createElement('button');
    saveBtn.id = 'save-btn';
    saveBtn.textContent = 'Save';
    saveBtn.style.width = 'auto';
    saveBtn.style.marginLeft = '8px';
    document.querySelector('.editor-toolbar .mode-switcher').prepend(saveBtn);

    let isUnsaved = false;

    function setUnsavedStatus(status) {
        isUnsaved = status;
        saveBtn.disabled = !status;
        saveBtn.style.opacity = status ? '1' : '0.6';
        
        const title = currentPagePathEl.textContent || '';
        if (status && !title.endsWith(' •')) {
            currentPagePathEl.textContent += ' •';
        } else if (!status && title.endsWith(' •')) {
            currentPagePathEl.textContent = title.slice(0, -2);
        }
    }

    function saveCurrentPage() {
        if (currentOpenFile && isUnsaved) {
            const content = editor.getBlocksForSaving();
            ipc.savePage(currentOpenFile, content);
            setUnsavedStatus(false);
            console.log('Page saved!');
        }
    }
    
    saveBtn.addEventListener('click', saveCurrentPage);


    // Handshake protocol
    ipc.send('jsReady');
});