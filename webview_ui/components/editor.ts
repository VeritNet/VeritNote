// components/editor.js
// Editor 基类，提供文件加载、保存、配置应用等核心功能，供具体编辑器（如 PageEditor）继承和扩展

import { ipc } from './main/ipc.js';
import { TabManager } from './main/tab-manager.js';
import { FileType } from './types.js';
import * as file from './main/file-helper.js';


export abstract class Editor {
    container: HTMLElement;
    filePath: string; // To store the file's own config header
    type: FileType | null;
    tabManager: TabManager;
    computedConfig: Record<string, any> | null; // 计算后的最终配置
    context; // 透传参数，如 blockIdToFocus
    fileConfig: Record<string, any> | null; // 文件中 Config 部分原始内容
    isReady = false;
    private loadPromise: Promise<void> | null = null;

    /*
    * 顺序：
    * 1. 子 Editor 类实例被创建，调用 Editor 构造函数，初始化基本属性,
    * 2. Editor.load() 被调用，并行进行 文件加载 和 子编辑器 UI 加载
    * 3. IPC 收到 fileLoaded 消息后 onFileLoaded 被调用 ，该函数解析内容，
    *    确保子类 onLoad 编辑器初始化已完成后，通知应用配置 并调用子类 onContentParsed
    */

    constructor(container: HTMLElement, filePath: string, tabManager: TabManager, context = {}) {
        this.type = null; // 由子类在调用 super() 后设置
        this.container = container;
        this.filePath = filePath;
        this.tabManager = tabManager;
        this.computedConfig = null;
        this.context = context;
        this.fileConfig = null;
        this.isReady = false;
    }

    // --- 生命周期与文件操作 ---
    /**
     * 文件内容和编辑器并行加载的入口方法，通常在 Editor 实例创建后立即调用
     */
    public load() {
        // 通知子类开始异步加载 UI
        this.loadPromise = this.onLoad();

        // 加载文件内容
        ipc.loadFile(this.filePath, this.context);
    }

    /**
     * @param {any} savableContent 需要被持久化保存的 content 数据
     * @returns
     */
    save(savableContent: any) {
        if(!this.fileConfig)
            return;
        if (!this.isReady)
            return;
        // 调用子类可选的保存前UI处理
        if (typeof this.onBeforeSave === "function")
            this.onBeforeSave();
        ipc.saveFile(this.filePath, this.fileConfig, savableContent);
    }

    // 被 main.js 监听到 fileLoaded 后调用
    public async onFileLoaded(payload: any) {
        if (payload.path !== this.filePath)
            return;

        this.fileConfig = payload.config;
        const content = payload.content;
        const context = payload.context || {}; // 包含 blockIdToFocus 等
        this.isReady = true;
        this.tabManager.setUnsavedStatus(this.filePath, false);

        // 确保子类 onLoad 编辑器的异步初始化逻辑已完成
        if (this.loadPromise) {
            await this.loadPromise;
        }

        // 应用配置
        this.onConfigurationChanged();
        // 交给子类解析内容（并渲染）
        this.onContentParsed(content, context);
    }

    // 被 main.js 监听到 fileSaved 后调用
    public onFileSaved(payload: any) {
        if (payload.path !== this.filePath)
            return;
        if (payload.success) {
            this.tabManager.setUnsavedStatus(this.filePath, false);
            // 触发前端内部事件，解耦其它组件的监听
            window.dispatchEvent(new CustomEvent('editor:saved', { detail: { path: this.filePath } }));
            console.log(`File "${this.filePath}" saved successfully.`);
        }
        else {
            console.error(`Failed to save file "${this.filePath}":`, payload.error);
            alert(`Failed to save file: ${payload.error || 'Unknown error'}`);
        }
        // 调用子类可选的保存后UI恢复处理
        if (typeof this.onAfterSave === "function")
            this.onAfterSave(payload.success);
    }

    // --- 配置管理 ---
    public async onConfigurationChanged() {
        console.log(`Configuration change detected for: ${this.filePath}. Re-evaluating styles.`);
        ipc.resolveFileConfiguration(this.filePath);
        const fileConfigurationResolvedHandler = (e: any) => {
            const payload = e['detail']['payload'];
            if (payload.path === this.filePath) {
                if (payload.config) {
                    const newComputedConfig = file.computeFinalConfig(payload.config, this.type);
                    this.computedConfig = newComputedConfig;
                    this.applyConfiguration();
                }
                window.removeEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler);
            }
        };
        window.addEventListener('fileConfigurationResolved', fileConfigurationResolvedHandler);
    }

    // 由子类实现，具体应用新的配置
    protected abstract applyConfiguration(): void;

    // --- 需要子类覆盖的抽象/虚拟方法 ---
    protected abstract onLoad(): Promise<void>;

    // 接收后端传来的 content 和 context 进行解析与渲染
    protected abstract onContentParsed(content, context): void;

    abstract onFocus(): void;

    destroy() { this.container.innerHTML = ""; }


    abstract onKeyDown(e: any): void;
    // 可选的保存前后 UI 处理，子类可覆盖实现
    abstract onBeforeSave(): void;

    abstract onAfterSave(success): void;
}
