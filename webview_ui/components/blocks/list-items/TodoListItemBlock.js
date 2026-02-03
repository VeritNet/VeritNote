// js/blocks/TodoListItemBlock.js

class TodoListItemBlock extends TextBlock {
    // --- 1. 静态属性定义 ---
    static type = 'todoListItem';
    static icon = '☑';
    static label = 'To-do List';
    static description = 'Track tasks with a checklist.';
    static keywords = ['todo', 'task', 'list', 'checklist', 'item'];
    static canBeToggled = true;
    static placeholder = 'To-do';

    // --- 2. 构造函数 ---
    constructor(data, editor) {
        super(data, editor);
        if (!this.properties) {
            this.properties = {};
        }
        this.properties.checked = data.properties?.checked || false;
    
        // --- 新增: 声明它是一个容器块 ---
        this.isContainer = true;
    }

    // --- 3. 自定义渲染 ---
    render() {
        this.element = this._createWrapperElement();
        this.contentElement = this._createContentElement();

        // 创建独特的内部布局: [Checkbox] [Text Area]
        this.contentElement.innerHTML = `
            <div class="todo-checkbox-wrapper">
                <input type="checkbox" class="todo-checkbox" id="todo-${this.id}">
            </div>
            <div class="list-item-content-wrapper">
                <div class="list-item-text-area"></div>
                <div class="list-item-children-container block-children-container"></div>
            </div>
        `;
        
        // 获取关键元素的引用
        this.checkbox = this.contentElement.querySelector('.todo-checkbox');
        const contentWrapper = this.contentElement.querySelector('.list-item-content-wrapper');
        this.textElement = contentWrapper.querySelector('.list-item-text-area');
        this.childrenContainer = contentWrapper.querySelector('.list-item-children-container');

        // 初始化 checkbox 的状态
        this.checkbox.checked = this.properties.checked;
        if (this.properties.checked) {
            this.checkbox.setAttribute('checked', '');
        } else {
            this.checkbox.removeAttribute('checked');
        }
        this.updateCheckedStateStyle();

        // 初始化文本区域
        this.textElement.contentEditable = 'true';
        this.textElement.innerHTML = this.content || '';
        this.textElement.dataset.placeholder = this.constructor.placeholder;

        this._renderContent();

        this.element.appendChild(this.contentElement);

        this._renderChildren();

        this._applyCustomCSS();
        
        // --- 事件监听 ---
        // 监听 checkbox 的状态变化
        this.checkbox.addEventListener('change', () => {
            this.properties.checked = this.checkbox.checked;
            this.updateCheckedStateStyle();
            this.editor.emitChange(true, 'toggle-todo', this); // 通知编辑器内容已更改
        });

        // 为文本区手动绑定 onKeyDown
        this.textElement.addEventListener('keydown', (e) => this.onKeyDown(e));

        return this.element;
    }

    _renderContent() {
        this._applyListItemStyles();
    }

    _applyListItemStyles() {
        const s = this.contentElement.style;
        const p = this.properties;

        // 应用 TextBlock 定义的所有通用文本样式
        // 这些样式会从 contentElement 继承到 text-area 和 bullet point
        if (p.color) s.color = p.color;
        if (p.fontSize) s.fontSize = p.fontSize;
        if (p.fontWeight) s.fontWeight = p.fontWeight;
        if (p.lineHeight) s.lineHeight = p.lineHeight;
        if (p.letterSpacing) s.letterSpacing = p.letterSpacing;
        if (p.fontFamily && p.fontFamily !== 'inherit') s.fontFamily = p.fontFamily;

        // 对齐方式特殊处理：通常列表项还是左对齐好看，但如果用户非要改...
        // 这里的 textAlign 会影响 wrapper，导致 bullet 和 text 一起居中/右对齐
        if (p.textAlign) s.textAlign = p.textAlign;

        // Text Decoration 通常只应用于文字，不应用于图标
        if (p.textDecoration) {
            if (this.textElement) this.textElement.style.textDecoration = p.textDecoration;
        }
    }

    // --- 4. 辅助方法 ---
    updateCheckedStateStyle() {
        if (this.properties.checked) {
            this.textElement.classList.add('todo-checked');
        } else {
            this.textElement.classList.remove('todo-checked');
        }
    }

    // 覆盖关键方法以指向正确的元素
    syncContentFromDOM() {
        if (this.textElement) {
            this.content = this.textElement.innerHTML;
        }
    }

    focus() {
        if (!this.textElement) return;
        this.textElement.focus();
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(this.textElement);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    // --- 5. 覆盖键盘事件以实现列表行为 ---
    onKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) return;
            this.syncContentFromDOM();
            // 按下回车时，创建一个新的、未勾选的 to-do 项
            this.editor.insertNewBlockAfter(this, 'todoListItem');
            return;
        }
        
        // 复用 TextBlock 的空块删除等逻辑
        super.onKeyDown(e);
    }


    // --- NEW: Implement Export API ---
    async getExportHtml(blockElement, options) {
        const checkbox = blockElement.querySelector('.todo-checkbox');
        if (checkbox) {
            // Add a data-id for the script to target
            checkbox.setAttribute('data-id', `todo-${this.id}`);
        }
        return blockElement;
    }

    static getExportScripts() {
        // The entire script logic is now self-contained here.
        return `
            const TODO_STORAGE_KEY = 'veritnote_todo_state';

            function loadTodoState() {
                try {
                    const savedState = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) || '{}');
                    document.querySelectorAll('.todo-checkbox[data-id]').forEach(checkbox => {
                        const id = checkbox.getAttribute('data-id');
                        const textEl = checkbox.closest('.block-content').querySelector('.list-item-text-area');
                        
                        if (savedState[id] !== undefined) {
                            const isChecked = savedState[id];
                            checkbox.checked = isChecked;
                            if (textEl) {
                                textEl.classList.toggle('todo-checked', isChecked);
                            }
                        }
                    });
                } catch (e) { console.error('Failed to load todo state:', e); }
            }

            function saveTodoState(id, isChecked) {
                try {
                    const savedState = JSON.parse(localStorage.getItem(TODO_STORAGE_KEY) || '{}');
                    savedState[id] = isChecked;
                    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(savedState));
                } catch (e) { console.error('Failed to save todo state:', e); }
            }

            document.querySelectorAll('.todo-checkbox[data-id]').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const id = e.target.getAttribute('data-id');
                    const isChecked = e.target.checked;
                    saveTodoState(id, isChecked);
                    const textEl = e.target.closest('.block-content').querySelector('.list-item-text-area');
                    if (textEl) { textEl.classList.toggle('todo-checked', isChecked); }
                });
            });

            loadTodoState();
        `;
    }
}