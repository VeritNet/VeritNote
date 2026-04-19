// blocks/TodoListItemBlock.js

class TodoListItemBlock extends TextBlock {
    // --- 1. 静态属性定义 ---
    static override type = 'todoListItem';
    static override icon = '☑';
    static override label = 'To-do List';
    static override description = 'Track tasks with a checklist.';
    static override keywords = ['todo', 'task', 'list', 'checklist', 'item'];
    static override canBeToggled = true;
    static override placeholder = 'To-do';

    
    textElement;
    checkbox;

    // --- 2. 构造函数 ---
    constructor(data, editor) {
        super(data, editor);
        if (!this.properties) {
            this.properties = {};
        }
        this.properties.checked = data.properties?.checked || false;
    }

    // --- 3. 渲染 ---
    override _renderContent() {
        // 创建独特的内部布局: [Checkbox] [Text Area]
        this.contentElement.innerHTML = `
            <div class="todo-checkbox-wrapper">
                <input type="checkbox" class="todo-checkbox" id="todo-${this.id}" data-id="${this.id}">
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
        this.textElement.dataset['placeholder'] = (this.constructor as typeof Block).placeholder;

        this._applyListItemStyles();
        
        // --- 事件监听 ---
        // 监听 checkbox 的状态变化
        this.checkbox.addEventListener('change', () => {
            this.properties.checked = this.checkbox.checked;
            this.updateCheckedStateStyle();
            this.BAPI_PE.emitChange(true, 'toggle-todo', this); // 通知编辑器内容已更改
        });
    }

    _applyListItemStyles() {
        const p = this.properties;
         
        this.applyTextStyles();

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
    override syncContentFromDOM() {
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


    override getExportScripts(exportContext) {
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

window['registerBlock'](TodoListItemBlock);