document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const recentList = document.getElementById('recent-list');
    const openWorkspaceBtn = document.getElementById('open-workspace-btn');
    const dragRegion = document.getElementById('drag-region');
    const aboutBtn = document.getElementById('about-btn');
    const aboutModal = document.getElementById('about-modal');
    const closeModalBtn = aboutModal.querySelector('.close-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');

    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    const STORAGE_KEY = 'veritnote_recent_workspaces';

    // --- 辅助函数: 从路径/URI中获取文件名 ---
    function getFileNameFromPath(path) {
        if (window.currentOS === 'android') {
            // 对于 "content://..." URI, 文件名是最后一个 '/' 之后的部分
            return path.substring(path.lastIndexOf('/') + 1);
        } else {
            // Windows 逻辑保持不变
            return path.substring(path.lastIndexOf('\\') + 1);
        }
    }

    // --- Data Logic ---
    function getRecentWorkspaces() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    }

    function saveRecentWorkspaces(workspaces) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(workspaces));
    }

    function addRecentWorkspace(path) {
        let workspaces = getRecentWorkspaces();
        const now = new Date().toISOString();
        const name = getFileNameFromPath(path);
        
        // Remove existing entry for the same path to move it to the top
        workspaces = workspaces.filter(ws => ws.path !== path);
        
        // Add new entry to the top
        workspaces.unshift({ name, path, lastOpened: now });
        
        // Limit to 10 recent items
        if (workspaces.length > 10) {
            workspaces = workspaces.slice(0, 10);
        }
        
        saveRecentWorkspaces(workspaces);
    }
    
    // This is called from C++ after a workspace is chosen
    window.addRecentWorkspace = addRecentWorkspace;

    // --- UI Rendering ---
    function renderList(filter = '') {
        const workspaces = getRecentWorkspaces();
        const filtered = workspaces.filter(ws => 
            ws.name.toLowerCase().includes(filter.toLowerCase()) || 
            ws.path.toLowerCase().includes(filter.toLowerCase())
        );

        if (filtered.length === 0) {
            recentList.innerHTML = `<div class="empty-list">No recent workspaces found.</div>`;
            return;
        }

        recentList.innerHTML = filtered.map(ws => `
            <div class="item" data-path="${ws.path}" title="${ws.path}">
                <div class="item-details">
                    <div class="name">${ws.name}</div>
                    <div class="path">${ws.path}</div>
                </div>
                <div class="item-controls">
                    <button class="remove-btn" data-path="${ws.path}">&times;</button>
                </div>
            </div>
        `).join('');
    }

    // --- Event Listeners ---
    searchInput.addEventListener('input', () => renderList(searchInput.value));

    openWorkspaceBtn.addEventListener('click', async () => {
        // 1. 调用返回 Promise 的函数并等待结果
        const selectedPath = await ipc.openWorkspaceDialog();
        
        // 2. 检查用户是否选择了路径 (如果取消对话框，selectedPath 会是 undefined)
        if (selectedPath) {
            // 3. 立即将新路径添加到最近列表并更新UI
            addRecentWorkspace(selectedPath);
            renderList(searchInput.value);
            
            // 4. 发送导航请求
            ipc.openWorkspace(selectedPath);
        }
    });

    // --- 新增: 窗口控件事件监听 ---
    minimizeBtn.addEventListener('click', () => ipc.minimizeWindow());
    maximizeBtn.addEventListener('click', () => ipc.maximizeWindow());
    closeBtn.addEventListener('click', () => ipc.closeWindow());

    recentList.addEventListener('click', (e) => {
        const item = e.target.closest('.item');
        const removeBtn = e.target.closest('.remove-btn');

        if (removeBtn) {
            e.stopPropagation(); // Prevent opening the workspace when removing
            const pathToRemove = removeBtn.dataset.path;
            let workspaces = getRecentWorkspaces().filter(ws => ws.path !== pathToRemove);
            saveRecentWorkspaces(workspaces);
            renderList(searchInput.value);
        } else if (item) {
            ipc.send('openWorkspace', { path: item.dataset.path });
        }
    });

    // About Modal
    aboutBtn.addEventListener('click', () => { aboutModal.style.display = 'flex'; });
    closeModalBtn.addEventListener('click', () => { aboutModal.style.display = 'none'; });
    aboutModal.addEventListener('click', (e) => {
        if (e.target === aboutModal) {
            aboutModal.style.display = 'none';
        }
    });
    copyLinkBtn.addEventListener('click', () => {
        const linkInput = document.getElementById('github-link');
        linkInput.select();
        document.execCommand('copy');
        copyLinkBtn.textContent = 'Copied!';
        setTimeout(() => { copyLinkBtn.textContent = 'Copy'; }, 1500);
    });


    dragRegion.addEventListener('mousedown', () => {
        ipc.startWindowDrag();
    });

    // --- Initial Load ---
    renderList();
});