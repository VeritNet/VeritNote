// blocks/NumberedListItemBlock.js

class NumberedListItemBlock extends TextBlock {
    // --- 1. Static properties definition ---
    static override type = 'numberedListItem';
    static override icon = '1.';
    static override label = 'Numbered List';
    static override description = 'Create an ordered list item.';
    static override keywords = ['list', 'number', 'ordered', 'ol', 'item'];
    static override canBeToggled = true;
    static override placeholder = 'List item';

    
    textElement: HTMLDivElement;
    numberElement: HTMLDivElement;

    // --- 2. Constructor ---
    constructor(data, editor) {
        super(data, editor);
        
        // Ensure properties object exists and initialize the number
        if (!this.properties) {
            this.properties = {};
        }
        this.properties.number = data.properties?.number || 1;
    }

    // --- 3. Rendering ---
    override _renderContent() {
        if (!this.contentElement.hasChildNodes()) {
            const numberWrapper = document.createElement('div');
            numberWrapper.className = 'number-point-wrapper';

            this.numberElement = document.createElement('div');
            this.numberElement.className = 'number-point';
            this.numberElement.contentEditable = 'true';
            this.numberElement.textContent = this.properties.number;
            //this.numberElement.addEventListener('input', () => this.syncNumberFromDOM());

            const dot = document.createElement('span');
            dot.textContent = '.';

            numberWrapper.appendChild(this.numberElement);
            numberWrapper.appendChild(dot);

            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'list-item-content-wrapper';

            this.textElement = document.createElement('div');
            this.textElement.className = 'list-item-text-area';
            this.textElement.contentEditable = 'true';
            this.textElement.textContent = this.content || '';
            this.textElement.dataset['placeholder'] = (this.constructor as typeof Block).placeholder;

            this.childrenContainer = document.createElement('div');
            this.childrenContainer.className = 'list-item-children-container block-children-container';

            contentWrapper.appendChild(this.textElement);
            contentWrapper.appendChild(this.childrenContainer);

            this.contentElement.appendChild(numberWrapper);
            this.contentElement.appendChild(contentWrapper);
        } else if (this.numberElement) {
            this.numberElement.textContent = this.properties.number;
        }

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

    // --- 4. Override key methods to handle the composite structure ---
    
    // Syncs the number from its editable div to the block's properties
    syncNumberFromDOM() {
        if (this.numberElement) {
            const num = parseInt(this.numberElement.textContent, 10);
            this.properties.number = isNaN(num) ? 1 : num;
        }
    }

    // Syncs both the main text and the number
    override syncContentFromDOM() {
        if (this.textElement) {
            this.content = this.textElement.innerHTML;
        }
        this.syncNumberFromDOM();
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
    
    // --- 5. Toolbar integration ---
    override get toolbarButtons() {
        // We add the default text formatting buttons plus our custom one
        const textButtons = super.toolbarButtons;
        return [
            ...textButtons,
            { icon: '1.', title: 'Set Start Number', action: 'setStartNumber' }
        ];
    }
    
    override handleToolbarAction(action, buttonElement) {
        if (action === 'setStartNumber') {
            const newStartStr = prompt('Set starting number:', this.properties.number);
            if (newStartStr !== null) {
                const newStartNum = parseInt(newStartStr, 10);
                if (!isNaN(newStartNum)) {
                    this.properties.number = newStartNum;
                    this.numberElement.textContent = this.properties.number;
                    this.BAPI_PE.emitChange(true, 'set-list-number', this);
                }
            }
        }
    }


    override onKeyDown(e) {
        // 处理 Enter 键
        if (e.key === 'Enter') {
            e.preventDefault();

            if (e.shiftKey) {
                return;
            }

            // 如果只按下了 Enter，则创建新的列表项
            this.syncContentFromDOM();
            let newBlockInstance = this.BAPI_PE.insertNewBlockAfter(this, 'numberedListItem');
            // 将新列表项的编号设置为当前项的编号 + 1
            newBlockInstance.properties.number = this.properties.number + 1;
            newBlockInstance._renderContent();

            return;
        }

        super.onKeyDown(e);
    }
}

window['registerBlock'](NumberedListItemBlock);