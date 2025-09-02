document.addEventListener('DOMContentLoaded', () => {
    // --- 元素获取 ---
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
    let contextMenuTarget = null; // 用于存储右键点击的目标
    const popover = document.getElementById('popover');
    const popoverInput = document.getElementById('popover-input');
    const searchResultsContainer = document.getElementById('popover-search-results');
    const colorPickerContainer = document.getElementById('popover-color-picker');
    const localFileBtn = document.getElementById('popover-local-file-btn');

    // --- 初始化 ---
    const editor = new Editor(editorContainer);
    let currentOpenFile = null;
    let saveTimeout = null;

    let popoverCallback = null;
    let allNotes = [];
    const PRESET_COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#F7D154', '#B298DC', '#cccccc', '#8c8c8c', '#569cd6'];

    // --- 函数定义 ---

    // 渲染工作区文件树
    function renderWorkspaceTree(node) {
        if (!node) return '';
        
        let html = '';
        if (node.type === 'folder') {
            html += `<div class="tree-node folder" data-path="${node.path}">
                        <span class="icon"></span>
                        <span class="name">${node.name}</span>
                     </div>`;
            if (node.children && node.children.length > 0) {
                html += '<div class="tree-node-children">';
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
    
    // 切换视图模式
    function switchMode(mode) {
        if (mode === 'editor') {
            editorContainer.style.display = 'block';
            previewContainer.style.display = 'none';
            editorModeBtn.classList.add('active');
            previewModeBtn.classList.remove('active');
        } else { // preview mode
            previewContainer.className = 'editor-view'; // 复用编辑器的 class
            previewContainer.innerHTML = `<div id="editor-content-wrapper">${editor.getSanitizedHtml(false)}</div>`; // 模拟编辑器的内部结构
            
            editorContainer.style.display = 'none';
            previewContainer.style.display = 'block';
            editorModeBtn.classList.remove('active');
            previewModeBtn.classList.add('active');
        }
    }
    
    

    // --- C++ 消息监听 ---
    window.addEventListener('workspaceListed', (e) => {
        console.log('--- JS Frontend ---');
        console.log('Received "workspaceListed" event from C++!', e.detail);

        const workspaceData = e.detail.payload;
        sidebar.dataset.workspaceData = JSON.stringify(workspaceData);
        if (workspaceData && workspaceData.children) {
            sidebar.innerHTML = renderWorkspaceTree(workspaceData);
        } else {
            sidebar.innerHTML = `<div class="empty-workspace">Workspace is empty or failed to load.</div>`;
            console.error("Workspace data is invalid or empty:", workspaceData);
        }
    });

    window.addEventListener('noteListReceived', (e) => {
        allNotes = e.detail.payload;
        // 如果 popover 正在等待这个列表，就刷新它
        if (popover.style.display === 'block') {
            updateSearchResults(popoverInput.value);
        }
    });

    // 右键菜单逻辑 (新增)
    sidebar.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenuTarget = e.target.closest('.tree-node');
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.display = 'block';
    });

    // 全局点击隐藏菜单 (新增)
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });

    // 菜单项点击 (新增)
    contextMenu.addEventListener('click', (e) => {
        if (!contextMenuTarget) return;

        const action = e.target.dataset.action;
        let targetPath = contextMenuTarget.dataset.path;
        
        // 如果是在文件夹上右键，则父路径就是它自己
        // 如果是在文件上右键，父路径是它的父目录
        let parentPath = contextMenuTarget.classList.contains('folder') 
            ? targetPath
            : targetPath.substring(0, targetPath.lastIndexOf('\\'));

        switch(action) {
            case 'newPage': {
                const name = prompt("输入新笔记名称:", "未命名笔记");
                if (name) ipc.createItem(parentPath, name, 'page');
                break;
            }
            case 'newFolder': {
                const name = prompt("输入新文件夹名称:", "未命名文件夹");
                if (name) ipc.createItem(parentPath, name, 'folder');
                break;
            }
            case 'delete': {
                if (confirm(`确定要删除 "${targetPath}" 吗？此操作不可恢复。`)) {
                    ipc.deleteItem(targetPath);
                }
                break;
            }
        }
    });

    window.addEventListener('workspaceUpdated', () => {
        ipc.listWorkspace(); // 后端完成后，请求刷新文件树
    });

    window.addEventListener('pageLoaded', (e) => {
        const pageData = e.detail.payload;
        const fromPreview = e.detail.payload.fromPreview; // 获取 fromPreview 标志
        console.log(e.detail.payload.fromPreview);
        if (e.detail.error) {
            alert(`Error loading page: ${e.detail.error}`);
            return;
        }
        currentOpenFile = pageData.path;
        editor.load(pageData);
        currentPagePathEl.textContent = pageData.path;
    
        // 更新侧边栏的 active 状态
        sidebar.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
        const targetNode = sidebar.querySelector(`.tree-node.page[data-path="${pageData.path.replace(/\\/g, '\\\\')}"]`);
        if (targetNode) {
            targetNode.classList.add('active');
            // 确保父文件夹展开
            let parentFolder = targetNode.closest('.tree-node-children')?.previousElementSibling;
            while(parentFolder && parentFolder.classList.contains('folder')) {
                parentFolder.classList.add('open');
                parentFolder.nextElementSibling.style.display = 'block';
                parentFolder = parentFolder.closest('.tree-node-children')?.previousElementSibling;
            }
        }

        if (fromPreview) {
            setTimeout(() => {
                switchMode('preview'); // DOM 更新完毕
            }, 0);
        } else {
            switchMode('editor');
        }
    });

    window.addEventListener('pageSaved', (e) => {
        console.log(`Page saved: ${e.detail.payload.path}`, e.detail.payload.success);
        // 可以加一个保存成功的提示
    });

    // --- 用户交互事件监听 ---
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
            // 移除其他节点的 active 状态
            sidebar.querySelectorAll('.tree-node.active').forEach(n => n.classList.remove('active'));
            // 添加 active 状态到当前节点
            target.classList.add('active');
            ipc.loadPage(path);
        }
    });
    
    editorModeBtn.addEventListener('click', () => switchMode('editor'));
    previewModeBtn.addEventListener('click', () => switchMode('preview'));

    // 编辑器内容改变时，延迟保存
    window.addEventListener('editor:change', () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            if (currentOpenFile) {
                const content = editor.getBlocksForSaving();
                ipc.savePage(currentOpenFile, content);
            }
        }, 1500); // 1.5秒后自动保存
    });



    window.addEventListener('exportReady', async () => {
        await runExportProcess();
    });
    
    window.addEventListener('exportError', (e) => {
        alert(`导出失败: ${e.detail.error}`);
        hideExportOverlay();
    });

    // --- 导出流程函数 (新增) ---
    let allFilesToExport = [];
    
    function getAllFiles(node, fileList) {
        if (node.type === 'page') {
            fileList.push(node.path);
        } else if (node.type === 'folder' && node.children) {
            node.children.forEach(child => getAllFiles(child, fileList));
        }
    }

    async function runExportProcess() {
        // --- 生成侧边栏目录的 HTML ---
        const workspaceData = JSON.parse(sidebar.dataset.workspaceData || '{}');
        function generateSidebarHtml(node, currentPath) {
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

            exportStatus.textContent = `正在处理: ${path}`;
            
            // 1. 请求文件内容
            ipc.loadPage(path);
            
            // 2. 等待内容返回
            const pageData = await new Promise(resolve => {
                const handler = (e) => {
                    window.removeEventListener('pageLoaded', handler);
                    resolve(e.detail.payload);
                };
                window.addEventListener('pageLoaded', handler);
            });

            // 3. 生成 HTML
            const tempEditorContainer = document.createElement('div');
            tempEditorContainer.style.display = 'none'; // 隐藏
            document.body.appendChild(tempEditorContainer);
        
            const tempEditor = new Editor(tempEditorContainer);
            tempEditor.load(pageData); // 加载数据并渲染到临时容器中
        
            const mainContentHtml = tempEditor.getSanitizedHtml(true, workspaceData.path);
        
            document.body.removeChild(tempEditorContainer);

            // 计算 CSS 文件的相对路径
            const sourcePath = allFilesToExport[i];
            const workspacePath = workspaceData.path;
            const relativePathStr = sourcePath.substring(workspacePath.length + 1);
            const depth = (relativePathStr.match(/\\/g) || []).length;
            const cssRelativePath = depth > 0 ? '../'.repeat(depth) + 'style.css' : 'style.css';

            const finalHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${path.substring(path.lastIndexOf('\\') + 1).replace('.veritnote', '')}</title>
    <!-- 直接链接 CSS 文件 -->
    <link rel="stylesheet" href="${cssRelativePath}">
    <!-- 添加一些导出特有的样式 -->
    <style>
        body { display: flex; margin: 0; }
        .exported-sidebar { width: 250px; flex-shrink: 0; padding: 20px; border-right: 1px solid #444; height: 100vh; overflow-y: auto; box-sizing: border-box; }
        .exported-sidebar a { display: block; color: #569cd6; text-decoration: none; padding: 5px; border-radius: 4px; }
        .exported-sidebar a:hover { background-color: #333; }
        .exported-sidebar a.current { background-color: #569cd6; color: #fff; }
        .exported-sidebar ul { list-style: none; padding-left: 20px; }
        .exported-main { flex-grow: 1; height: 100vh; overflow-y: auto; box-sizing: border-box; }
        /* 复用编辑器的主要视窗样式 */
        .exported-main .editor-view { padding: 40px; } 
    </style>
</head>
<body>
    ${sidebarHtml.replace()}
    <main class="exported-main">
        <!-- 使用与预览模式一致的结构 -->
        <div class="editor-view">
            <div id="editor-content-wrapper">${mainContentHtml}</div>
        </div>
    </main>
</body>
</html>`;
            
            // 4. 发送给后端写入
            ipc.exportPageAsHtml(path, finalHtml);

            progressBar.style.width = `${progress}%`;
        }
        exportStatus.textContent = '导出完成！';
        setTimeout(hideExportOverlay, 1500);
    }
    
    function showExportOverlay() {
        exportOverlay.style.display = 'flex';
        progressBar.style.width = '0%';
    }

    function hideExportOverlay() {
        exportOverlay.style.display = 'none';
    }


    // --- Popover 通用逻辑 ---
    function showPopover(targetElement, options = {}) {
        // 定位逻辑 (保持不变)
        const rect = targetElement.getBoundingClientRect();
        popover.style.top = `${rect.bottom + 5}px`;
        // 防止 popover 超出屏幕右边界
        if (rect.left + 320 > window.innerWidth) {
            popover.style.left = `${window.innerWidth - 330}px`;
        } else {
            popover.style.left = `${rect.left}px`;
        }
        popover.style.display = 'block';

        // 保存回调和目标ID (保持不变)
        popoverCallback = options.callback;
        popoverTargetBlockId = options.blockId;
    
        // 获取 popover 内部的元素
        const localFileBtn = document.getElementById('popover-local-file-btn');
        const inputGroup = document.getElementById('popover-input-group'); // 给 input 和 button 包一个 div
        const searchResults = document.getElementById('popover-search-results');
        const colorPicker = document.getElementById('popover-color-picker');

        // 根据类型显示/隐藏不同的 UI 组件
        if (options.type === 'color') {
            // --- 颜色选择器模式 ---
            inputGroup.style.display = 'none';
            searchResults.style.display = 'none';
            localFileBtn.style.display = 'none';
            colorPicker.style.display = 'grid'; // 使用 grid
        
            // 动态生成颜色样本
            colorPicker.innerHTML = PRESET_COLORS.map(color => 
                `<div class="color-swatch" style="background-color: ${color}" data-color="${color}"></div>`
            ).join('');

        } else { 
            inputGroup.style.display = 'block';
            colorPicker.style.display = 'none';

            popoverInput.value = options.existingValue || '';
        
            // 精确控制搜索结果和本地文件按钮
            if (options.isImageSource) { // 设置图片源 (只能 URL 或本地文件)
                popoverInput.placeholder = 'Enter image URL or select local file...';
                searchResults.style.display = 'none'; // 隐藏搜索结果
                localFileBtn.style.display = 'block'; // 显示本地文件按钮
            } else if (options.isImageLink) { // 设置图片点击链接 (URL 或页面)
                popoverInput.placeholder = 'Enter a link or search for a page...';
                searchResults.style.display = 'block'; // 显示搜索结果
                localFileBtn.style.display = 'none'; // 隐藏本地文件按钮
            } else { // 文本链接或链接按钮 (URL 或页面)
                popoverInput.placeholder = 'Enter a link or search for a page...';
                searchResults.style.display = 'block'; // 显示搜索结果
                localFileBtn.style.display = 'none'; // 隐藏本地文件按钮
            }
            popoverInput.focus();
        
            // 只有在需要搜索页面时才请求列表或更新
            if (searchResults.style.display === 'block') {
                if (allNotes.length === 0) {
                    ipc.requestNoteList();
                } else {
                    updateSearchResults(popoverInput.value);
                }
            }
        }
    }

    function hidePopover() {
        if (popover.style.display === 'block') {
            popover.style.display = 'none';
            popoverCallback = null;
            // 通知编辑器退出富文本编辑状态
            window.dispatchEvent(new CustomEvent('popoverClosed'));
        }
    }

    function updateSearchResults(query) {
        // ... (搜索过滤和渲染逻辑) ...
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

    // --- 事件监听 ---
    window.addEventListener('showLinkPopover', (e) => showPopover(e.detail.targetElement, e.detail));
    window.addEventListener('showColorPicker', (e) => showPopover(e.detail.targetElement, { ...e.detail, type: 'color' }));

    // 为“选择本地文件”按钮添加点击事件监听器
    localFileBtn.addEventListener('click', (e) => {
        e.preventDefault(); // 防止按钮点击导致意外行为
        // 直接调用 ipc 函数，向后端发送请求
        ipc.openFileDialog();
    });

    // 监听 C++ 后端返回的文件路径消息
    window.addEventListener('fileDialogClosed', (e) => {
        const path = e.detail.payload.path;
        // 检查路径是否存在，并且 popover 的回调函数也存在
        if (path && popoverCallback) {
            // 调用之前由 editor.js 设置好的回调函数，把路径传给它
            popoverCallback(path);
            // 操作完成，关闭 popover
            hidePopover();
        }
    });
    
    // Popover 内部事件
    document.addEventListener('click', (e) => {
        if (!popover.contains(e.target) && popover.style.display === 'block' && !e.target.closest('.toolbar-button')) {
            hidePopover();
        }
    });
    
    popoverInput.addEventListener('input', () => updateSearchResults(popoverInput.value));
    
    popoverInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (popoverCallback) popoverCallback(popoverInput.value);
            hidePopover();
        }
    });

    searchResultsContainer.addEventListener('mousedown', (e) => {
        // 阻止默认行为
        e.preventDefault(); 
    
        const item = e.target.closest('.search-result-item');
        if (item && popoverCallback) {
            popoverCallback(item.dataset.path);
            hidePopover();
        }
    });
    
    colorPickerContainer.addEventListener('mousedown', (e) => {
        // 阻止默认的 mousedown 行为，从而阻止编辑器失焦
        e.preventDefault(); 
    
        const swatch = e.target.closest('.color-swatch');
        if (swatch && popoverCallback) {
            popoverCallback(swatch.dataset.color);
            // 操作完成后可以立即隐藏 popover，也可以让用户继续选择
            hidePopover(); 
        }
    });


    window.addEventListener('workspaceListed', (e) => {
        const workspaceData = e.detail.payload;
        sidebar.dataset.workspaceData = JSON.stringify(workspaceData);
        if (workspaceData && workspaceData.children && workspaceData.children.length > 0) {
            sidebar.innerHTML = renderWorkspaceTree(workspaceData);
        } else {
            sidebar.innerHTML = `<div class="empty-workspace">工作区为空。<br>请在此处右键新建笔记。</div>`;
            // 清空编辑器
            editor.load({path: '', content: []});
            currentPagePathEl.textContent = "请选择或创建一篇笔记";
        }
    });


    // --- 用户交互事件监听 (修改/新增) ---

    // 导出按钮
    exportBtn.addEventListener('click', () => {
        const workspaceData = JSON.parse(sidebar.dataset.workspaceData || '{}'); // 从 sidebar 获取数据
        allFilesToExport = [];
        getAllFiles(workspaceData, allFilesToExport);

        if (allFilesToExport.length === 0) {
            alert('工作区没有可导出的笔记。');
            return;
        }

        showExportOverlay();
        ipc.startExport();
    });

    // 握手协议通知后端 JS 已就绪
    ipc.send('jsReady'); 
});