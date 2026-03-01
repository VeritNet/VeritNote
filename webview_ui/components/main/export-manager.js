// components/main/export-manager.js

window.ExportManager = class ExportManager {
    static async runExportProcess(exportConfig) {
        const { options, allFilesToExport, workspaceData, ui } = exportConfig;

        window.isExportCancelled = false;
        ui.exportStatus.textContent = 'Collecting file information...';
        ui.progressBar.style.width = '5%';

        const allPagesContent = [];

        // 阶段1：预拉取所有页面的纯数据内容
        for (const path of allFilesToExport) {
            if (window.isExportCancelled) return;
            const pageData = await new Promise(resolve => {
                const handler = (e) => {
                    if (e['detail']['payload'] && e['detail']['payload'].path === path) {
                        window.removeEventListener('pageLoaded', handler);
                        resolve(e['detail']['payload']);
                    }
                };
                window.addEventListener('pageLoaded', handler);
                ipc.loadPage(path);
            });
            allPagesContent.push(pageData);
        }

        if (window.isExportCancelled) return;

        ui.exportStatus.textContent = 'Preparing environment...';
        ui.progressBar.style.width = '15%';

        // 阶段2：全局收集 Quotes、Libs 和 过滤后的图片
        const globalRequiredLibs = new Set();
        const quoteContentCache = new Map();
        const imageTasks = [];

        allPagesContent.forEach(pageData => {
            const scanBlocks = (blocks) => {
                if (!blocks) return;
                blocks.forEach(block => {
                    // 收集依赖
                    const BlockClass = window['blockRegistry'].get(block.type);
                    if (BlockClass && BlockClass.requiredExportLibs.length > 0) {
                        BlockClass.requiredExportLibs.forEach(lib => globalRequiredLibs.add(lib));
                    }

                    // 收集 Quote
                    if (block.type === 'quote' && block.properties?.referenceLink) {
                        const link = block.properties.referenceLink;
                        if (!quoteContentCache.has(link)) {
                            const [filePath, blockId] = link.split('#');
                            const absoluteFilePath = window.resolveWorkspacePath(filePath);
                            const sourcePageData = allPagesContent.find(p => p.path === absoluteFilePath);
                            if (sourcePageData) {
                                let contentToCache = sourcePageData.content;
                                if (blockId) {
                                    const findBlockById = (blks, id) => {
                                        for (const b of blks) {
                                            if (b.id === id) return b;
                                            if (b.children) { const f = findBlockById(b.children, id); if (f) return f; }
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

                    // 收集图片 (修复Bug 2: 严格根据选项过滤)
                    if (block.type === 'image' && block.properties?.src) {
                        const src = block.properties.src;
                        const isLocalHttp = src.includes('http://veritnote.localhost');
                        const isOnline = (src.startsWith('http://') || src.startsWith('https://')) && !isLocalHttp;
                        if ((isOnline && options.downloadOnline) || (!isOnline && options.copyLocal)) {
                            imageTasks.push({ 'originalSrc': src, 'pagePath': pageData.path });
                        }
                    }

                    if (block.children) scanBlocks(block.children);
                });
            };
            scanBlocks(pageData.content);

            // 检查背景图片
            const pageConfig = pageData.config?.page || {};
            if (pageConfig.background?.type === 'image' && pageConfig.background.value) {
                const src = pageConfig.background.value;
                const isOnline = src.startsWith('http://') || src.startsWith('https://');
                if ((isOnline && options.downloadOnline) || (!isOnline && options.copyLocal)) {
                    imageTasks.push({ 'originalSrc': src, 'pagePath': pageData.path });
                }
            }
        });

        // 阶段3：初始化输出目录 (修复Bug 1 & 3: 必须在处理图片前调用)
        ipc.prepareExportLibs(Array.from(globalRequiredLibs));
        await new Promise(resolve => window.addEventListener('exportLibsReady', resolve, { once: true }));
        if (window.isExportCancelled) return;

        // 阶段4：处理图片
        let imageSrcMap = {};
        const uniqueImageTasks = Array.from(new Map(imageTasks.map(task => [task.originalSrc, task])).values());
        if (uniqueImageTasks.length > 0) {
            ui.exportStatus.textContent = 'Processing images...';
            ipc.processExportImages(uniqueImageTasks);
            imageSrcMap = await new Promise(resolve => {
                window.addEventListener('exportImagesProcessed', (e) => resolve(e['detail']['payload']['srcMap']), { once: true });
            });
            console.log(imageSrcMap);
        }
        if (window.isExportCancelled) return;

        // 阶段5：遍历生成 HTML 并直接写入
        ui.exportStatus.textContent = 'Generating HTML pages...';

        for (let i = 0; i < allFilesToExport.length; i++) {
            if (window.isExportCancelled) return;
            const path = allFilesToExport[i];
            const progress = 20 + ((i + 1) / allFilesToExport.length) * 80;

            ui.exportStatus.textContent = `Cooking: ${path.substring(path.lastIndexOf('\\') + 1)}`;

            const relativePathStr = path.substring(workspaceData.path.length + 1);
            const depth = (relativePathStr.match(/\\/g) || []).length;
            const pathPrefix = depth > 0 ? '../'.repeat(depth) : './';

            if (path.endsWith('.veritnote')) {
                // 将准备好的全局数据传入
                const pageResult = await window.PageExporter.process(path, options, pathPrefix, allPagesContent, imageSrcMap, quoteContentCache);
                if (window.isExportCancelled) return;

                const filteredWorkspaceData = { ...workspaceData };
                if (filteredWorkspaceData.children) {
                    filteredWorkspaceData.children = filteredWorkspaceData.children.filter(child => child.name !== 'build');
                }
                const sidebarHtml = this._generateSidebarHtml(filteredWorkspaceData, path, pathPrefix, workspaceData.path);
                const finalHtml = this._assembleFinalHtml(path, pageResult, sidebarHtml, pathPrefix);

                // 直接写入，环境已经准备好了
                ipc.exportPageAsHtml(path, finalHtml);
                ui.progressBar.style.width = `${progress}%`;
            }
        }

        ui.exportStatus.textContent = 'Done!';
        setTimeout(window.hideExportOverlay, 1500);
    }

    // [复刻原逻辑] 生成侧边栏HTML
    static _generateSidebarHtml(node, currentPath, pathPrefix, workspaceRootPath) {
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

            html += `<div class="tree-node folder ${isOpen ? 'open' : ''}" data-path="${node.path}"><span class="icon"></span><span class="name">${node.name}</span></div>`;
            if (node.children && node.children.length > 0) {
                html += `<div class="tree-node-children" style="${isOpen ? 'display: block;' : 'display: none;'}">`;
                node.children.forEach(child => {
                    html += this._generateSidebarHtml(child, currentPath, pathPrefix, workspaceRootPath);
                });
                html += '</div>';
            }
        } else if (node.type === 'page') {
            const relativePath = node.path.substring(workspaceRootPath.length + 1).replace(/\\/g, '/').replace('.veritnote', '.html');
            const isActive = (node.path === currentPath);
            html += `<div class="tree-node page ${isActive ? 'active' : ''}" data-path="${node.path}" data-href="${pathPrefix}${relativePath}"><span class="icon"></span><span class="name">${node.name.replace('.veritnote', '')}</span></div>`;
        }
        return html;
    }

    // [复刻原逻辑] 组装最终的 DOCTYPE HTML 模板
    static _assembleFinalHtml(path, pageResult, sidebarHtml, pathPrefix) {
        const { mainContentHtml, customStyleTag, libIncludes, cssRelativePath } = pageResult;

        const exportStyleOverrides = `
            <style>
                body { overflow: hidden !important; }
                .app-container { height: 100vh; }
                #main-content { overflow-y: auto !important; height: 100vh; }
            </style>
        `;

        const fullSidebarTemplate = `
            <aside id="sidebar">
                <div class="workspace-tree">${sidebarHtml}</div>
                <div class="sidebar-footer">
                    <button id="sidebar-toggle-btn" class="sidebar-footer-btn" title="Collapse sidebar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                        <span>Collapse</span>
                    </button>
                </div>
            </aside>
        `;

        // 侧边栏的交互 JS (直接复刻旧版原汁原味代码)
        const scriptTemplate = `
            document.addEventListener('DOMContentLoaded', () => {
                const SIDEBAR_COLLAPSED_KEY = 'veritnote_exported_sidebar_collapsed';
                const appContainer = document.querySelector('.app-container');
                const sidebar = document.getElementById('sidebar');
                const peekTrigger = document.getElementById('sidebar-peek-trigger');
                const toggleBtn = document.getElementById('sidebar-toggle-btn');
                const toggleBtnSpan = toggleBtn.querySelector('span');
                const toggleBtnSvg = toggleBtn.querySelector('svg');

                const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
                const urlParams = new URLSearchParams(window.location.search);
                const isPeekingOnLoad = urlParams.get('peek') === 'true';

                if (isCollapsed) {
                    appContainer.classList.add('sidebar-collapsed');
                    if (toggleBtnSpan) toggleBtnSpan.textContent = 'Expand';
                    if (toggleBtnSvg) toggleBtnSvg.innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line><polyline points="10 8 15 12 10 16"></polyline>';
                    if (isPeekingOnLoad) appContainer.classList.add('sidebar-peek');
                }

                sidebar.querySelectorAll('.tree-node.folder').forEach(folder => {
                    folder.addEventListener('click', (e) => {
                        if (e.target.closest('.tree-node.page')) return;
                        e.stopPropagation();
                        folder.classList.toggle('open');
                        const children = folder.nextElementSibling;
                        if (children && children.classList.contains('tree-node-children')) {
                            children.style.display = folder.classList.contains('open') ? 'block' : 'none';
                        }
                    });
                });

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
                    if (appContainer.classList.contains('sidebar-collapsed')) appContainer.classList.add('sidebar-peek');
                });

                sidebar.addEventListener('mouseleave', () => {
                    if (appContainer.classList.contains('sidebar-peek')) appContainer.classList.remove('sidebar-peek');
                });

                 sidebar.querySelectorAll('.tree-node.page').forEach(pageNode => {
                    pageNode.addEventListener('click', () => {
                        let href = pageNode.dataset.href;
                        if(href) {
                            if (appContainer.classList.contains('sidebar-peek')) href += '?peek=true';
                            window.location.href = href;
                        }
                    });
                });
            });
        `;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${path.substring(path.lastIndexOf('\\') + 1).replace('.veritnote', '')}</title>
    <link rel="stylesheet" href="${cssRelativePath}">
    ${customStyleTag}
    ${exportStyleOverrides}
    ${libIncludes}
</head>
<body>
    <div class="app-container page-theme-container">
        <div id="sidebar-peek-trigger"></div>
        ${fullSidebarTemplate}
        <main id="main-content">
            <div class="page-background-container">
                 <div class="editor-view">${mainContentHtml}</div>
            </div>
        </main>
    </div>
    <script>${scriptTemplate}</script>
</body>
</html>`;
    }
};


// 专门处理 Page 类型导出的处理器
window.PageExporter = class PageExporter {
    static async process(path, options, pathPrefix, allPagesContent, imageSrcMap, quoteContentCache) {
        const pageData = allPagesContent.find(p => p.path === path);
        if (!pageData) throw new Error(`Data not found for page: ${path}`);

        // 1. 创建唯一的临时 Editor 实例
        const tempEditorContainer = document.createElement('div');
        const tempEditor = new PageEditor(tempEditorContainer, path, null);
        await tempEditor.loadContentForRender(pageData.content);

        // 2. 提纯核心 HTML
        const exportContext = { options, imageSrcMap, quoteContentCache, pathPrefix };
        const mainContentHtml = await tempEditor.getSanitizedHtml(true, exportContext);

        // 3. 收集该页面所需依赖 Libraries (用于组装 <head>)
        const requiredLibsForThisPage = new Set();
        const findBlockTypesRecursive = (blocks) => {
            if (!blocks) return;
            blocks.forEach(block => {
                const BlockClass = window['blockRegistry'].get(block.type);
                if (BlockClass && BlockClass.requiredExportLibs.length > 0) {
                    BlockClass.requiredExportLibs.forEach(libPath => requiredLibsForThisPage.add(libPath));
                }
                if (block.children) findBlockTypesRecursive(block.children);
            });
        };
        findBlockTypesRecursive(pageData.content);

        let libIncludes = '';
        requiredLibsForThisPage.forEach(libPath => {
            const libRelativePath = `${pathPrefix}${libPath}`;
            if (libPath.endsWith('.css')) libIncludes += `    <link rel="stylesheet" href="${libRelativePath}">\n`;
            else if (libPath.endsWith('.js')) libIncludes += `    <script src="${libRelativePath}"><\/script>\n`;
        });

        // 4. 处理 CSS 配置重载 (背景图片映射等)
        ipc.resolveFileConfiguration(path)
        const resolved = await new Promise((resolve, reject) => {
            const fileConfigurationResolvedHandler = (e) => {
                const payload = e['detail']['payload'];
                if (payload.path === path) {
                    resolve(payload);
                    window.removeEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler); // 移除监听器，防止多次触发
                }
            };
            window.addEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler);
        });

        const computedConfig = window.computeFinalConfig(resolved.config);

        if (computedConfig.background?.type === 'image' && computedConfig.background.value) {
            const originalSrc = computedConfig.background.value;
            if (imageSrcMap[originalSrc]) {
                computedConfig.background.value = pathPrefix + imageSrcMap[originalSrc];
            }
        }

        let customStyleContent = '';
        let backgroundStyleContent = '';
        for (const key in computedConfig) {
            if (JSON.stringify(computedConfig[key]) !== JSON.stringify(window.DEFAULT_CONFIG.page[key])) {
                const value = computedConfig[key];
                if (key === 'background' && typeof value === 'object') {
                    const bgColor = (value.type === 'color') ? value.value : 'transparent';
                    const bgImage = (value.type === 'image' && value.value) ? `url('${value.value.replace(/\\/g, '/')}')` : 'none';
                    backgroundStyleContent += `    background-color: ${bgColor};\n`;
                    backgroundStyleContent += `    background-image: ${bgImage};\n`;
                } else {
                    customStyleContent += `    --page-${key}: ${value};\n`;
                }
            }
        }

        let customStyleTag = '';
        let styleRules = [];
        if (backgroundStyleContent) styleRules.push(`.page-background-container {\n${backgroundStyleContent}}`);
        if (customStyleContent) styleRules.push(`.editor-view {\n${customStyleContent}}`);

        if (styleRules.length > 0) {
            customStyleTag = `<style id="veritnote-custom-styles">\n/* Page-specific overrides */\n${styleRules.join('\n\n    ')}\n</style>`;
        }

        return {
            mainContentHtml,
            customStyleTag,
            libIncludes,
            cssRelativePath: `${pathPrefix}style.css`,
            requiredLibs: requiredLibsForThisPage
        };
    }
};