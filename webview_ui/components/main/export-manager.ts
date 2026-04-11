// components/main/export-manager.js

import { ipc } from './ipc.js';

import { PageEditor } from '../page-editor/page-editor.js';

import { DEFAULT_CONFIG } from './default-config.js';

interface ExportOptions {
    downloadOnline: boolean;
    copyLocal: boolean;
}

interface ExportConfig {
    options: ExportOptions;
    allFilesToExport: string[];
    workspaceData: WorkspaceTreeNode;
    ui: {
        exportStatus: HTMLElement;
        progressBar: HTMLElement;
    };
}

interface PageResult {
    mainContentHtml: string;
    customStyleTag: string;
    libIncludes: string;
    cssRelativePath: string;
}

interface ImageTask {
    originalSrc: string;
    pagePath: string;
}

interface ExportPrepareResult {
    libs: string[];
    imageTasks: ImageTask[];
}

interface ExportGenerateResult {
    content: string;
    savePath: string;
    exportType: 'page_html' | 'database_js';
}


export const ExportManager = class ExportManager {
    static async runExportProcess(exportConfig: ExportConfig): Promise<void> {
        const { options, allFilesToExport, workspaceData, ui } = exportConfig;
        window.isExportCancelled = false;
        ui.exportStatus.textContent = 'Initializing exporters...';
        ui.progressBar.style.width = '5%';

        const exporters: (InstanceType<typeof window.PageExporter> | InstanceType<typeof window.DatabaseExporter>)[] = [];

        // 1. 初始化对应文件的导出器
        for (const path of allFilesToExport) {
            const relativePathStr = path.substring(workspaceData.path.length + 1);
            const depth = (relativePathStr.match(/\\/g) || []).length;
            const pathPrefix = depth > 0 ? '../'.repeat(depth) : './';

            if (path.endsWith('.veritnote')) {
                exporters.push(new window.PageExporter(path, options, workspaceData, pathPrefix));
            }
            else if (path.endsWith('.veritnotedb')) {
                exporters.push(new window.DatabaseExporter(path, options, workspaceData, pathPrefix));
            }
        }

        if (window.isExportCancelled)
            return;
        ui.exportStatus.textContent = 'Preparing file resources...';
        ui.progressBar.style.width = '20%';

        // 2. 预检阶段：收集全局资源依赖
        const allLibs = new Set<string>();

        const allImageTasks: ImageTask[] = [];
        for (const exp of exporters) {
            if (window.isExportCancelled)
                return;

            const { libs, imageTasks }: ExportPrepareResult = await exp.prepare();
            libs.forEach(l => allLibs.add(l));
            if (imageTasks)
                allImageTasks.push(...imageTasks);
        }
        if (window.isExportCancelled)
            return;
        ui.exportStatus.textContent = 'Processing external assets...';

        // 3. 全局资源打包 (Libs & Images)
        if (allLibs.size > 0) {
            ipc.prepareExportLibs(Array.from(allLibs));
            await new Promise<void>(resolve => window.addEventListener('exportLibsReady', () => resolve(), { once: true }));
        }

        let imageSrcMap: Record<string, string> = {};
        if (allImageTasks.length > 0) {
            const uniqueTasks = Array.from(new Map(allImageTasks.map(t => [t['originalSrc'], t])).values());
            ipc.processExportImages(uniqueTasks);
            imageSrcMap = await new Promise<Record<string, string>>(resolve => window.addEventListener('exportImagesProcessed', (e: Event) => resolve((e as CustomEvent).detail.payload['srcMap']), { once: true }));
        }

        // 4. 生成与导出最终文件
        for (let i = 0; i < exporters.length; i++) {
            if (window.isExportCancelled)
                return;
            const exp = exporters[i];
            ui.exportStatus.textContent = `Cooking: ${exp.path.substring(exp.path.lastIndexOf("\\") + 1)}`;
            const { content, savePath, exportType } = await exp.generate(imageSrcMap);
            if (exportType === 'page_html') {
                ipc.exportPageAsHtml(savePath, content);
            }
            else if (exportType === 'database_js') {
                ipc.exportDatabaseAsJs(savePath, content);
            }
            ui.progressBar.style.width = `${30 + ((i + 1) / exporters.length) * 70}%`;
        }
        ui.exportStatus.textContent = 'Done!';
        setTimeout(window.hideExportOverlay, 1500);
    }

    // 生成侧边栏HTML
    static _generateSidebarHtml(node: WorkspaceTreeNode, currentPath: string, pathPrefix: string, workspaceRootPath: string): string {
        let html = '';
        if (node.type === 'folder') {
            const containsActivePage = (folderNode: WorkspaceTreeNode): boolean => {
                if (!folderNode.children)
                    return false;
                return folderNode.children.some(child => {
                    if (child.path === currentPath)
                        return true;
                    if (child.type === 'folder')
                        return containsActivePage(child);
                    return false;
                });
            };
            const isOpen = containsActivePage(node);
            html += `<div class="tree-node folder ${isOpen ? 'open' : ''}" data-path="${node.path}"><span class="icon"></span><span class="name">${node.name}</span></div>`;
            if (node.children && node.children.length > 0) {
                html += `<div class="tree-node-children" style="${isOpen ? 'display: block;' : 'display: none;'}">`;
                node.children.forEach(child => {
                    html += ExportManager._generateSidebarHtml(child, currentPath, pathPrefix, workspaceRootPath);
                });
                html += "</div>";
            }
        }
        else if (node.type === "page") {
            const relativePath = node.path.substring(workspaceRootPath.length + 1).replace(/\\/g, "/").replace(".veritnote", ".html");
            const isActive = (node.path === currentPath);
            html += `<div class="tree-node page ${isActive ? 'active' : ''}" data-path="${node.path}" data-href="${pathPrefix}${relativePath}"><span class="icon"></span><span class="name">${node.name.replace(".veritnote", "")}</span></div>`;
        }
        return html;
    }

    // 组装最终的 DOCTYPE HTML 模板
    static _assembleFinalHtml(path: string, pageResult: PageResult, sidebarHtml: string, pathPrefix: string): string {
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
                    if (isPeekingOnLoad) {
                        appContainer.classList.add('sidebar-peek');
                        const url = new URL(window.location);
                        url.searchParams.delete('peek');
                        window.history.replaceState({}, '', url.pathname + url.search);
                    }
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
                        let href = pageNode.dataset['href'];
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
    <title>${path.substring(path.lastIndexOf("\\") + 1).replace('.veritnote', '')}</title>
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
    path: string;
    options: ExportOptions;
    workspaceData: WorkspaceTreeNode;
    pathPrefix: string;
    tempEditor: PageEditor | null;


    constructor(path: string, options: ExportOptions, workspaceData: WorkspaceTreeNode, pathPrefix: string) {
        this.path = path;
        this.options = options;
        this.workspaceData = workspaceData;
        this.pathPrefix = pathPrefix;
        this.tempEditor = null;
    }

    // 阶段1：加载内容并收集所有需要的资源
    async prepare(): Promise<ExportPrepareResult> {
        const pageData = await new Promise(resolve => {
            const handler = (e: any) => {
                if (e.detail.payload && e.detail.payload.path === this.path) {
                    window.removeEventListener('fileLoaded', handler);
                    resolve(e.detail.payload);
                }
            };
            window.addEventListener('fileLoaded', handler);
            ipc.loadFile(this.path, {});
        });
        const container = document.createElement('div');
        this.tempEditor = new PageEditor(container, this.path, null);
        await this.tempEditor.loadContentForRender(pageData['content']['blocks']);

        // 等待所有异步块渲染完毕 (通过之前加入的 exportReadyPromise)
        const gatherPromises = (blocks: Block[]): Promise<void>[] => {

            let promises: Promise<void>[] = [];
            blocks.forEach(b => {
                promises.push(b.exportReadyPromise);
                if (b.children)
                    promises.push(...gatherPromises(b.children));
            });
            return promises;
        };
        await Promise.all(gatherPromises(this.tempEditor.blocks));

        const libs: Set<string> = new Set();
        const imageTasks = [];

        // 收集组件库和图片
        const scan = (blocks: Block[]) => {
            if (!blocks)
                return;
            blocks.forEach(b => {
                const BlockClass = window.blockRegistry.get(b.type);
                if (BlockClass && BlockClass.requiredExportLibs) {
                    BlockClass.requiredExportLibs.forEach(l => libs.add(l));
                }

                // 图片收集逻辑
                if (b.type === 'image' && b.properties?.src) {
                    const src = b.properties.src;
                    const isLocalHttp = src.includes('http://veritnote.localhost');
                    const isOnline = (src.startsWith('http://') || src.startsWith('https://')) && !isLocalHttp;
                    if ((isOnline && this.options.downloadOnline) || (!isOnline && this.options.copyLocal)) {
                        imageTasks.push({ 'originalSrc': src, 'pagePath': this.path });
                    }
                }
                if (b.children)
                    scan(b.children);
            });
        };
        scan(this.tempEditor.blocks);

        // 收集背景图片
        const pageConfig = pageData['config']?.page || {};
        if (pageConfig.background?.type === 'image' && pageConfig.background.value) {
            const src = pageConfig.background.value;
            const isOnline = src.startsWith('http://') || src.startsWith('https://');
            if ((isOnline && this.options.downloadOnline) || (!isOnline && this.options.copyLocal)) {
                imageTasks.push({ 'originalSrc': src, 'pagePath': this.path });
            }
        }
        return { libs: Array.from(libs), imageTasks };
    }

    // 阶段2：利用获取到的映射生成最终 HTML
    async generate(imageSrcMap: Record<string, string>): Promise<ExportGenerateResult> {
        // 在生成 HTML 前，遍历更新编辑器所有图片块的链接
        const updateBlockImages = (blocks: Block[]) => {
            if (!blocks)
                return;
            blocks.forEach(b => {
                // 定位图片块及其 src 属性
                if (b.type === 'image' && b.properties?.src) {
                    const originalSrc = b.properties.src;
                    if (imageSrcMap[originalSrc]) {
                        const newSrc = this.pathPrefix + imageSrcMap[originalSrc];

                        // 更新数据模型
                        b.properties.src = newSrc;

                        // 同步更新底层 DOM 节点（兼容 getsanitizedhtml 依赖 DOM 序列化的情况）
                        const blockEl = b.element;
                        if (blockEl) {
                            const imgTags = blockEl.querySelectorAll('img');
                            imgTags.forEach((img: HTMLImageElement) => {
                                if (img.getAttribute('src') === originalSrc) {
                                    img.setAttribute('src', newSrc);
                                }
                            });
                        }
                    }
                }

                // 递归处理嵌套子块
                if (b.children)
                    updateBlockImages(b.children);
            });
        };
        updateBlockImages(this.tempEditor!.blocks);

        // 调用 getSanitizedHtml
        const mainContentHtml = await this.tempEditor!.getSanitizedHtml(true, {
            options: this.options,
            pathPrefix: this.pathPrefix
        });

        // 获取并重载配置 (用于生成自定义 Style)
        ipc.resolveFileConfiguration(this.path);

        const resolved: any = await new Promise(resolve => {
            const handler = (e: Event) => {
                const payload = (e as CustomEvent).detail.payload;
                if (payload.path === this.path) {
                    window.removeEventListener('fileConfigurationResolved', handler);
                    resolve(payload);
                }
            };
            window.addEventListener('fileConfigurationResolved', handler);
        });

        const computedConfig = window.computeFinalConfig(resolved.config, 'page');

        // 背景图片路径替换
        if (computedConfig.background?.type === 'image' && computedConfig.background.value) {
            const originalSrc = computedConfig.background.value;
            if (imageSrcMap[originalSrc]) {
                computedConfig.background.value = this.pathPrefix + imageSrcMap[originalSrc];
            }
        }

        let customStyleContent = '';
        let backgroundStyleContent = '';
        for (const key in computedConfig) {
            if (JSON.stringify(computedConfig[key]) !== JSON.stringify(DEFAULT_CONFIG.page[key])) {
                const value = computedConfig[key];
                if (key === 'background' && typeof value === 'object') {
                    const bgColor = (value.type === 'color') ? value.value : 'transparent';
                    const bgImage = (value.type === 'image' && value.value) ? `url('${value.value.replace(/\\/g, "/")}')` : 'none';
                    backgroundStyleContent += `    background-color: ${bgColor};\n    background-image: ${bgImage};\n`;
                }
                else {
                    customStyleContent += `    --page-${key}: ${value};\n`;
                }
            }
        }

        let styleRules = [];
        if (backgroundStyleContent)
            styleRules.push(`.page-background-container {\n${backgroundStyleContent}}`);
        if (customStyleContent)
            styleRules.push(`.editor-view {\n${customStyleContent}}`);
        const customStyleTag = styleRules.length > 0 ? `<style id="veritnote-custom-styles">\n/* Page overrides */\n${styleRules.join("\n\n")}\n</style>` : "";


        // 组装 Lib
        const requiredLibsForThisPage: Set<string> = new Set();
        const scanLibs = (blocks: Block[]) => {
            if (!blocks)
                return;
            blocks.forEach(b => {
                const BC = window.blockRegistry.get(b.type);
                if (BC && BC.requiredExportLibs)
                    BC.requiredExportLibs.forEach(l => requiredLibsForThisPage.add(l));
                if (b.children)
                    scanLibs(b.children);
            });
        };
        scanLibs(this.tempEditor!.blocks);

        let libIncludes = '';
        requiredLibsForThisPage.forEach(libPath => {
            const libRel = `${this.pathPrefix}${libPath}`;
            if (libPath.endsWith('.css'))
                libIncludes += `    <link rel="stylesheet" href="${libRel}">\n`;
            else if (libPath.endsWith('.js'))
                libIncludes += `    <script src="${libRel}"><\/script>\n`;
        });

        const filteredWorkspaceData = { ...this.workspaceData };
        if (filteredWorkspaceData.children) {
            filteredWorkspaceData.children = filteredWorkspaceData.children.filter(c => c.name !== 'build');
        }

        // 调用 ExportManager 的静态方法生成侧边栏
        const sidebarHtml = ExportManager._generateSidebarHtml(filteredWorkspaceData, this.path, this.pathPrefix, this.workspaceData.path);
        const finalHtml = ExportManager._assembleFinalHtml(this.path, { mainContentHtml, customStyleTag, libIncludes, cssRelativePath: `${this.pathPrefix}style.css` }, sidebarHtml, this.pathPrefix);

        return {
            content: finalHtml,
            savePath: this.path.replace('.veritnote', '.html'),
            exportType: 'page_html'
        };
    }
};


window.DatabaseExporter = class DatabaseExporter {
    path: string;
    options: ExportOptions;
    workspaceData: WorkspaceTreeNode;
    pathPrefix: string;

    constructor(path: string, options: ExportOptions, workspaceData: WorkspaceTreeNode, pathPrefix: string) {
        this.path = path;
        this.options = options;
        this.workspaceData = workspaceData;
        this.pathPrefix = pathPrefix;
    }

    // 阶段1：收集资产
    async prepare(): Promise<ExportPrepareResult> {
        return { libs: [], imageTasks: [] };
    }

    // 阶段2：生成静态内容
    async generate(imageSrcMap: Record<string, string>): Promise<ExportGenerateResult> {
        const jsonString = await new Promise<string>((resolve) => {
            const reqId = 'export-db-' + Date.now() + Math.random();
            const listener = (e: Event) => {
                const payload = (e as CustomEvent).detail.payload;
                if (payload.dataBlockId === reqId) {
                    window.removeEventListener('dataContentFetched', listener);
                    let content = payload.content;
                    if (typeof content === 'string') {
                        try {
                            content = JSON.parse(content);
                        }
                        catch (err) { }
                    }

                    // 提纯 DB：只保留 Data 和 Presets
                    const exportData = {
                        data: content.data || { mode: 'embedded', embeddedData: [] },
                        presets: content.presets || []
                    };
                    resolve(JSON.stringify(exportData, null, 2));
                }
            };
            window.addEventListener('dataContentFetched', listener);
            ipc.fetchDataContent(reqId, this.path);
        });

        const relativeWorkspacePath = this.path.substring(this.workspaceData.path.length + 1).replace(/\\/g, '/');
        const dbKey = relativeWorkspacePath.replace('.veritnotedb', '.js');

        // 拼接出浏览器可直接执行的 JavaScript 代码，将数据挂载到全局变量
        const jsContent = `window.__VN_DB__ = window.__VN_DB__ || {};\nwindow.__VN_DB__['${dbKey}'] = ${jsonString};`;

        return {
            content: jsContent,
            savePath: this.path.replace('.veritnotedb', '.js'),
            exportType: 'database_js'
        };
    }
};
