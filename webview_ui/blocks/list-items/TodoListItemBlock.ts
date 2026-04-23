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

    
    textElement: HTMLDivElement;
    checkbox: HTMLInputElement;

    // --- 2. 构造函数 ---
    constructor(data, editor) {
        super(data, editor);

        this.properties.checked = data.properties?.checked || false;
    }

    // --- 3. 渲染 ---
    override _renderContent() {
        if (!this.contentElement.hasChildNodes()) {
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.className = 'todo-checkbox-wrapper';

            let cb = document.createElement('input');
            cb.type = 'checkbox';

            this.checkbox = document.createElement('input');
            this.checkbox.type = 'checkbox';
            this.checkbox.className = 'todo-checkbox';
            this.checkbox.id = `todo-${this.id}`;
            this.checkbox.dataset['id'] = this.id;
            
            this.checkbox.addEventListener('change', () => {
                this.properties.checked = this.checkbox.checked;
                this.updateCheckedStateStyle();
                this.BAPI_PE.emitChange(true, 'toggle-todo', this);
            });

            checkboxWrapper.appendChild(this.checkbox);

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'list-item-content-wrapper';

            this.textElement = document.createElement('div');
            this.textElement.className = 'list-item-text-area';
            this.textElement.contentEditable = 'true';
            this.textElement.innerHTML = this.properties.text || '';
            this.textElement.dataset['placeholder'] = (this.constructor as typeof Block).placeholder;

            this.childrenContainer = document.createElement('div');
            this.childrenContainer.className = 'list-item-children-container block-children-container';

            contentWrapper.appendChild(this.textElement);
            contentWrapper.appendChild(this.childrenContainer);

            this.contentElement.appendChild(checkboxWrapper);
            this.contentElement.appendChild(contentWrapper);
        }
        
        if (this.checkbox) {
            this.checkbox.checked = this.properties.checked;
            if (this.properties.checked) {
                this.checkbox.setAttribute('checked', '');
            } else {
                this.checkbox.removeAttribute('checked');
            }
        }

        this.updateCheckedStateStyle();
        this._applyListItemStyles();
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