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

        this.element.appendChild(this.contentElement);

        this._renderChildren();

        // --- Active state handling (identical to bulleted list) ---
        const setActive = (isActive) => {
            if (isActive) {
                this.element.classList.add('vn-active');
            } else {
                this.element.classList.remove('vn-active');
            }
        };
        this.element.addEventListener('mouseenter', () => setActive(true));
        this.element.addEventListener('mouseleave', () => {
            if (document.activeElement !== this.textElement && document.activeElement !== this.numberElement) {
                setActive(false);
            }
        });
        this.textElement.addEventListener('focus', () => setActive(true));
        this.textElement.addEventListener('blur', () => {
            if (!this.element.matches(':hover')) {
                setActive(false);
            }
        });
        this.numberElement.addEventListener('focus', () => setActive(true));
        this.numberElement.addEventListener('blur', () => {
             if (!this.element.matches(':hover')) {
                setActive(false);
            }
        });

        return this.element;
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