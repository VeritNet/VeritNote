// js/blocks/NumberedListItemBlock.js

class NumberedListItemBlock extends TextBlock {
    // --- 1. Static properties definition ---
    static type = 'numberedListItem';
    static icon = '1.';
    static label = 'Numbered List';
    static description = 'Create an ordered list item.';
    static keywords = ['list', 'number', 'ordered', 'ol', 'item'];
    static canBeToggled = true;
    static placeholder = 'List item';

    // --- 2. Constructor ---
    constructor(data, editor) {
        super(data, editor);
        
        // Ensure properties object exists and initialize the number
        if (!this.properties) {
            this.properties = {};
        }
        this.properties.number = data.properties?.number || 1;

        // It can contain child blocks (for indentation)
        this.isContainer = true;
    }

    // --- 3. Custom Rendering ---
    render() {
        this.element = this._createWrapperElement();
        this.contentElement = this._createContentElement();

        // New layout with an editable number point
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
        this.textElement.dataset.placeholder = this.constructor.placeholder;
        this.textElement.addEventListener('keydown', (e) => this.onKeyDown(e));

        this._renderContent();

        this.element.appendChild(this.contentElement);

        this._renderChildren();

        this._applyCustomCSS();

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

    // --- 4. Override key methods to handle the composite structure ---
    
    // Syncs the number from its editable div to the block's properties
    syncNumberFromDOM() {
        if (this.numberElement) {
            const num = parseInt(this.numberElement.textContent, 10);
            this.properties.number = isNaN(num) ? 1 : num;
        }
    }

    // Syncs both the main text and the number
    syncContentFromDOM() {
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
    get toolbarButtons() {
        // We add the default text formatting buttons plus our custom one
        const textButtons = super.toolbarButtons;
        return [
            ...textButtons,
            { icon: '1.', title: 'Set Start Number', action: 'setStartNumber' }
        ];
    }
    
    handleToolbarAction(action, buttonElement) {
        if (action === 'setStartNumber') {
            const newStartStr = prompt('Set starting number:', this.properties.number);
            if (newStartStr !== null) {
                const newStartNum = parseInt(newStartStr, 10);
                if (!isNaN(newStartNum)) {
                    this.properties.number = newStartNum;
                    this.numberElement.textContent = this.properties.number;
                    this.editor.emitChange(true, 'set-list-number', this);
                }
            }
        }
    }

    // --- 6. Override keyboard events for list behavior ---
    onKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); 
            this.syncContentFromDOM(); // Save current state before creating new block

            // Find this block's position to insert the new one after it
            const info = this.editor._findBlockInstanceAndParent(this.id);
            if (info) {
                const { parentArray, index } = info;
                const newNumber = (this.properties.number || 0) + 1;

                // Create a new numbered list item instance with the incremented number
                const newBlockInstance = this.editor.createBlockInstance({
                    type: 'numberedListItem',
                    content: '',
                    properties: { number: newNumber }
                });

                if (newBlockInstance) {
                    // Insert the new block into the correct array at the correct position
                    parentArray.splice(index + 1, 0, newBlockInstance);
                    
                    // Re-render the editor and focus the new block
                    this.editor.render();
                    newBlockInstance.focus();
                    this.editor.emitChange(true, 'insert-block', this);
                }
            }
            return;
        }

        // For all other keys, use the default TextBlock behavior
        super.onKeyDown(e);
    }
}