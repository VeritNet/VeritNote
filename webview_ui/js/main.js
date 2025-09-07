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
    const backToDashboardBtn = document.getElementById('back-to-dashboard-btn');
    const toggleFullscreenBtnEditor = document.getElementById('toggle-fullscreen-btn-editor');
    const appContainer = document.querySelector('.app-container'); // Get the top-level container
    const sidebarContainer = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const cookSettingsModal = document.getElementById('cook-settings-modal');
    const startCookBtn = document.getElementById('start-cook-btn');
    const cancelCookBtn = document.getElementById('cancel-cook-btn');

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
    editor.registerBlock(BulletedListItemBlock);
    editor.registerBlock(TodoListItemBlock);
    editor.registerBlock(NumberedListItemBlock);
    editor.registerBlock(ToggleListItemBlock);

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

    async function runExportProcess(options, allFilesToExport) {
        exportStatus.textContent = 'Collecting file information...';
        progressBar.style.width = '5%';
    
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
        editor.blockRegistry.forEach((BlockClass, type) => {
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
            editor.blockRegistry.forEach(BlockClass => tempEditor.registerBlock(BlockClass));
            
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

    
    let isExportCancelled = false;
    function showExportOverlay() {
        isExportCancelled = false; // Reset flag on show
        exportOverlay.style.display = 'flex';
        progressBar.style.width = '0%';
        // Add a cancel button
        if (!document.getElementById('cancel-export-btn')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancel-export-btn';
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.marginTop = '16px';
            cancelBtn.onclick = () => {
                isExportCancelled = true;
                exportStatus.textContent = 'Cancelling...';
                ipc.send('cancelExport');
            };
            exportOverlay.querySelector('.export-modal').appendChild(cancelBtn);
        }
    }

    function hideExportOverlay() {
        exportOverlay.style.display = 'none';
        const cancelBtn = document.getElementById('cancel-export-btn');
        if (cancelBtn) cancelBtn.remove();
    }
    
    // Listen for cancellation confirmation from backend
    window.addEventListener('exportCancelled', () => {
        exportStatus.textContent = 'Cleanup complete.';
        setTimeout(hideExportOverlay, 1000);
    });
    
    // Listen for image download progress
    window.addEventListener('exportImageProgress', (e) => {
        const { originalSrc, percentage } = e.detail.payload;
        const filename = originalSrc.substring(originalSrc.lastIndexOf('/') + 1);
        exportStatus.textContent = `Downloading ${filename} (${percentage}%)`;
    });

    exportBtn.addEventListener('click', () => {
        cookSettingsModal.style.display = 'flex';
    });

    cancelCookBtn.addEventListener('click', () => {
        cookSettingsModal.style.display = 'none';
    });

    startCookBtn.addEventListener('click', () => {
        const options = {
            copyLocal: document.getElementById('copy-local-images').checked,
            downloadOnline: document.getElementById('download-online-images').checked,
            disableDrag: document.getElementById('disable-drag-export').checked
        };
        
        cookSettingsModal.style.display = 'none';

        const workspaceData = JSON.parse(sidebar.dataset.workspaceData || '{}');
        // This allFilesToExport is correctly populated here
        const allFilesToExport = [];
        getAllFiles(workspaceData, allFilesToExport);

        if (allFilesToExport.length === 0) {
            alert('No pages to export in this workspace.');
            return;
        }
        showExportOverlay();
        // --- FIX: Pass the populated list as an argument ---
        runExportProcess(options, allFilesToExport); 
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
            item.title = note.path; // <-- FIX: Add this line to show the full path on hover
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

    // --- NEW: Back button logic ---
    backToDashboardBtn.addEventListener('click', () => {
        if (isUnsaved) {
            if (confirm("You have unsaved changes. Do you want to save before leaving?")) {
                saveCurrentPage(); // Assumes this function now correctly handles the async nature of saving
            }
        }
        ipc.send('goToDashboard');
    });



    // --- NEW: Sidebar Collapse Logic ---
    const SIDEBAR_COLLAPSED_KEY = 'veritnote_sidebar_collapsed';

    function setSidebarCollapsed(collapsed) {
        const buttonText = sidebarToggleBtn.querySelector('span');
        const buttonSvg = sidebarToggleBtn.querySelector('svg');

        if (collapsed) {
            appContainer.classList.add('sidebar-collapsed');
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
            if (buttonText) buttonText.textContent = 'Expand';
            sidebarToggleBtn.title = 'Expand sidebar';
            // 更改为展开图标 (可选，但建议)
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>`;

        } else {
            appContainer.classList.remove('sidebar-collapsed');
            localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'false');
            if (buttonText) buttonText.textContent = 'Collapse';
            sidebarToggleBtn.title = 'Collapse sidebar';
            // 恢复为折叠图标
            if (buttonSvg) buttonSvg.innerHTML = `<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line>`;
        }
    }

    sidebarToggleBtn.addEventListener('click', () => {
        const isCollapsed = appContainer.classList.contains('sidebar-collapsed');
        setSidebarCollapsed(!isCollapsed);
    });
    
    // --- NEW: Logic for peeking sidebar on mouse move ---
    const peekTrigger = document.getElementById('sidebar-peek-trigger');

    // 当鼠标进入左侧的触发区域时
    peekTrigger.addEventListener('mouseenter', () => {
        if (appContainer.classList.contains('sidebar-collapsed')) {
            appContainer.classList.add('sidebar-peek');
        }
    });

    // 当鼠标离开展开的侧边栏时
    sidebarContainer.addEventListener('mouseleave', () => {
        // 确保我们是在 peek 状态下离开的
        if (appContainer.classList.contains('sidebar-peek')) {
            appContainer.classList.remove('sidebar-peek');
        }
    });


    // --- Initial State ---
    // On load, check localStorage for saved state
    const wasCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    setSidebarCollapsed(wasCollapsed);



    window.initializeWorkspace = function(workspacePath) {
        if (workspacePath) {
            // Send workspace path to backend to be set.
            // The backend needs to know this for file operations.
            ipc.send('setWorkspace', { path: workspacePath });
            
            // Trigger the initial listing of files.
            ipc.send('listWorkspace');
        } else {
            // This case should ideally not happen if navigation is correct
            alert("Error: Workspace path was not provided.");
            ipc.send('goToDashboard');
        }
    };



    toggleFullscreenBtnEditor.addEventListener('click', () => {
        ipc.send('toggleFullscreen');
    });
});