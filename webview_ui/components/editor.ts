// components/editor.js
// Editor 基类，提供文件加载、保存、配置应用等核心功能，供具体编辑器（如 PageEditor）继承和扩展

import { ipc } from './main/ipc.js';

export class Editor {
    container;
    filePath; // To store the file's own config header
    type; // e.g. 'page', 'database'
    tabManager;
    computedConfig;
    context; // 透传参数，如 blockIdToFocus

    fileConfig = {};
    isReady = false;

    constructor(container, filePath, tabManager, computedConfig, context = {}) {
        this.container = container;
        this.filePath = filePath;
        this.type = '';
        this.tabManager = tabManager;
        this.computedConfig = computedConfig || {};
        this.context = context;

        this.fileConfig = {};
        this.isReady = false;
    }

    // --- 生命周期与文件操作 ---
    load() {
        // 子类需在 load 中先加载 HTML 模板，完成后再调用 super.load() 或直接调 ipc.loadFile
        ipc.loadFile(this.filePath, this.context);
    }

    /**
     * @param {any} savableContent 需要被持久化保存的 content 数据
     * @returns
     */
    save(savableContent?) {
        if (!this.isReady) return;

        // 调用子类可选的保存前UI处理
        if (typeof this.onBeforeSave === 'function') this.onBeforeSave();

        ipc.saveFile(this.filePath, this.fileConfig, savableContent);
    }

    // 被 main.js 监听到 fileLoaded 后调用
    onFileLoaded(payload) {
        if (payload.path !== this.filePath) return;

        this.fileConfig = payload.config || {};
        const content = payload.content;
        const context = payload.context || {}; // 包含 blockIdToFocus 等

        this.isReady = true;
        this.tabManager.setUnsavedStatus(this.filePath, false);

        // 交给子类解析内容并渲染
        this.onContentParsed(content, context);
    }

    // 被 main.js 监听到 fileSaved 后调用
    onFileSaved(payload) {
        if (payload.path !== this.filePath) return;

        if (payload.success) {
            this.tabManager.setUnsavedStatus(this.filePath, false);
            // 触发前端内部事件，解耦其它组件的监听
            window.dispatchEvent(new CustomEvent('editor:saved', { detail: { path: this.filePath } }));
            console.log(`File "${this.filePath}" saved successfully.`);
        } else {
            console.error(`Failed to save file "${this.filePath}":`, payload.error);
            alert(`Failed to save file: ${payload.error || 'Unknown error'}`);
        }

        // 调用子类可选的保存后UI恢复处理
        if (typeof this.onAfterSave === 'function') this.onAfterSave(payload.success);
    }

    // --- 配置管理 ---
    async onConfigurationChanged() {
        console.log(`Configuration change detected for: ${this.filePath}. Re-evaluating styles.`);
        ipc.resolveFileConfiguration(this.filePath);

        const fileConfigurationResolvedHandler = (e: any) => {
            const payload = e['detail']['payload'];
            if (payload.path === this.filePath) {
                if (payload.config) {
                    const newComputedConfig = window.computeFinalConfig(payload.config, this.type);
                    this.applyConfiguration(newComputedConfig);
                }
                window.removeEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler);
            }
        };
        window.addEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler);
    }

    setFileConfig(newConfig) {
        this.fileConfig = newConfig;
        this.save();
    }

    applyConfiguration(config) {
        this.computedConfig = config;
        const themeContainers = this.getThemeContainers();

        for (const key in config) {
            const value = config[key];
            if (key === 'background' && typeof value === 'object') {
                const bgColor = (value.type === 'color') ? value.value : 'transparent';
                const bgImage = (value.type === 'image' && value.value) ? `url('${value.value.replace(/\\/g, '/')}')` : 'none';
                themeContainers.backgrounds.forEach(c => {
                    if (c) { c.style.backgroundColor = bgColor; c.style.backgroundImage = bgImage; }
                });
                continue;
            }

            const cssVarName = `--page-${key}`;
            themeContainers.views.forEach(c => {
                if (c) c.style.setProperty(cssVarName, value);
            });
        }
    }

    // --- 需要子类覆盖的抽象/虚拟方法 ---

    // 接收后端传来的 content 和 context 进行解析与渲染
    onContentParsed(content, context) { }

    // 获取需要应用 CSS Variables 和 Background 的 DOM 容器
    getThemeContainers() { return { backgrounds: [this.container], views: [this.container] }; }

    onFocus() { }
    destroy() { this.container.innerHTML = ''; }
    onKeyDown(e) { }

    // 可选的保存前后 UI 处理，子类可覆盖实现
    onBeforeSave() { }

    onAfterSave(success) { }
}