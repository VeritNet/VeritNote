// components/data-editor/data-editor.js

class DataEditor {
    constructor(container, filePath, tabManager) {
        this.container = container;
        this.filePath = filePath;
        this.tabManager = tabManager;

        this.elements = {};
        this.originalContent = "";

        this._init();
    }

    _init() {
        this.container.innerHTML = `
            <div class="data-editor-container">
                <div class="data-editor-toolbar">
                    <button id="data-save-btn" class="primary-btn">Save</button>
                    <span id="data-status" class="data-save-status"></span>
                </div>
                <div class="data-editor-content">
                    <textarea id="data-textarea" class="data-editor-textarea" placeholder="Loading..."></textarea>
                </div>
            </div>
        `;

        this.elements.textarea = this.container.querySelector('#data-textarea');
        this.elements.saveBtn = this.container.querySelector('#data-save-btn');
        this.elements.status = this.container.querySelector('#data-status');

        // 绑定事件
        this.elements.saveBtn.addEventListener('click', () => this.save());

        this.elements.textarea.addEventListener('input', () => {
            // 简单的脏状态检查
            const isDirty = this.elements.textarea.value !== this.originalContent;
            this.tabManager.setUnsavedStatus(this.filePath, isDirty);
        });
    }

    // --- Lifecycle Methods ---

    load() {
        // 调用 IPC 请求加载数据
        ipc.loadData(this.filePath);
    }

    onDataLoaded(payload) {
        if (payload.path !== this.filePath) return;

        if (payload.error) {
            this.elements.textarea.value = `Error loading file: ${payload.error}`;
            return;
        }

        const content = payload.content || "";
        this.originalContent = content;
        this.elements.textarea.value = content;
        this.elements.status.textContent = "Loaded";
        this.tabManager.setUnsavedStatus(this.filePath, false);
    }

    save() {
        const content = this.elements.textarea.value;
        this.elements.saveBtn.disabled = true;
        this.elements.status.textContent = "Saving...";

        ipc.saveData(this.filePath, content);
    }

    onDataSaved(payload) {
        if (payload.path !== this.filePath) return;

        this.elements.saveBtn.disabled = false;
        if (payload.success) {
            this.originalContent = this.elements.textarea.value;
            this.tabManager.setUnsavedStatus(this.filePath, false);
            this.elements.status.textContent = "Saved";
            setTimeout(() => { this.elements.status.textContent = ""; }, 2000);
        } else {
            this.elements.status.textContent = "Save Failed: " + (payload.error || "Unknown error");
        }
    }

    destroy() {
        // 清理工作，如果有的话
        this.container.innerHTML = '';
    }

    onFocus() {
        // 标签页激活时调用
        this.elements.textarea.focus();
    }

    // 适配 main.js 的快捷键调用
    onKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            this.save();
        }
    }
}