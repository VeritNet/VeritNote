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

    
    textElement;
    numberElement;

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
        // Layout with an editable number point
        this.contentElement.innerHTML = `
            <div class="number-point-wrapper">
                <div class="number-point" contenteditable="true"></div>
                <span>.</span>
            </div>
            <div class="list-item-content-wrapper">
                <div class="list-item-text-area"></div>
                <div class="list-item-children-container block-children-container"></div>
            </div>
        `;
    
        // Get references to key elements
        this.numberElement = this.contentElement.querySelector('.number-point');
        const textArea = this.contentElement.querySelector('.list-item-text-area');
        this.childrenContainer = this.contentElement.querySelector('.list-item-children-container');

        // Set up the editable number
        this.numberElement.textContent = this.properties.number;
        this.numberElement.addEventListener('input', () => this.syncNumberFromDOM());
        
        // Set up the main text area
        this.textElement = textArea;
        this.textElement.contentEditable = 'true';
        this.textElement.innerHTML = this.content || '';
        this.textElement.dataset['placeholder'] = (this.constructor as typeof Block).placeholder;

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
}

window['registerBlock'](NumberedListItemBlock);