// js/blocks/ToggleListItemBlock.js

class ToggleListItemBlock extends TextBlock {
    // --- 1. Static properties definition ---
    static type = 'toggleListItem';
    static icon = '▶';
    static label = 'Toggle List';
    static description = 'Create a collapsible list item.';
    static keywords = ['toggle', 'list', 'collapsible', 'expand', 'item'];
    static canBeToggled = true;
    static placeholder = 'Toggle';

    // --- 2. Constructor ---
    constructor(data, editor) {
        super(data, editor);
        if (!this.properties) {
            this.properties = {};
        }
        // The core state property: isCollapsed
        this.properties.isCollapsed = data.properties?.isCollapsed || false;
    
        // It's a container block that can hold other blocks
        this.isContainer = true;
    }

    // --- 3. Custom Rendering ---
    render() {
        this.element = this._createWrapperElement();
        this.contentElement = this._createContentElement();

        // Create the unique layout: [Toggle Triangle] [Text Area]
        this.contentElement.innerHTML = `
            <div class="toggle-triangle-wrapper">
                <div class="toggle-triangle"></div>
            </div>
            <div class="list-item-content-wrapper">
                <div class="list-item-text-area"></div>
                <div class="list-item-children-container block-children-container"></div>
            </div>
        `;
        
        // Get references to key elements
        this.toggleElement = this.contentElement.querySelector('.toggle-triangle');
        const contentWrapper = this.contentElement.querySelector('.list-item-content-wrapper');
        this.textElement = contentWrapper.querySelector('.list-item-text-area');
        this.childrenContainer = contentWrapper.querySelector('.list-item-children-container');

        // Initialize the collapsed state from loaded data
        this.updateCollapsedStateStyle();

        // Initialize the text area
        this.textElement.contentEditable = 'true';
        this.textElement.innerHTML = this.content || '';
        this.textElement.dataset.placeholder = this.constructor.placeholder;

        this._renderContent();

        this.element.appendChild(this.contentElement);

        this._renderChildren();

        this._applyCustomCSS();
        
        // --- Event Listeners ---
        // Listen for clicks on the triangle to toggle the state
        this.toggleElement.addEventListener('click', () => {
            this.properties.isCollapsed = !this.properties.isCollapsed;
            this.updateCollapsedStateStyle();
            this.editor.emitChange(true, 'toggle-collapse', this); // Notify the editor of the change
        });

        // Manually bind onKeyDown to the text area
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

    // --- 4. Helper Methods ---
    updateCollapsedStateStyle() {
        // Add or remove a class based on the isCollapsed property
        // The actual hiding/showing is handled by CSS
        if (this.properties.isCollapsed) {
            this.contentElement.classList.add('is-collapsed');
        } else {
            this.contentElement.classList.remove('is-collapsed');
        }
    }

    // Override key methods to point to the correct text element
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

    // --- 5. Override Keyboard Events for List Behavior ---
    onKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.syncContentFromDOM();
            // When Enter is pressed, create a new, expanded toggle list item
            this.editor.insertNewBlockAfter(this, 'toggleListItem');
            return;
        }
        
        // Reuse TextBlock's logic for deleting empty blocks, etc.
        super.onKeyDown(e);
    }


     // --- NEW: Implement Export API ---

    /**
     * Modifies the block's DOM element for export.
     * Adds a data-id to the toggle triangle for the script to find it.
     */
    async getExportHtml(blockElement, options) {
        const toggleTriangle = blockElement.querySelector('.toggle-triangle');
        if (toggleTriangle) {
            // Add a unique ID for the export script to target.
            toggleTriangle.setAttribute('data-id', `toggle-${this.id}`);
        }
        return blockElement;
    }

    /**
     * Provides the necessary JavaScript to make the toggle list interactive in the exported HTML.
     * This script handles click events, toggles a CSS class, and saves the state to localStorage.
     */
    static getExportScripts() {
        // The entire script logic is now self-contained in this block.
        return `
            const TOGGLE_STORAGE_KEY = 'veritnote_toggle_state';
            function loadToggleState() {
                try {
                    const savedState = JSON.parse(localStorage.getItem(TOGGLE_STORAGE_KEY) || '{}');
                    document.querySelectorAll('.toggle-triangle[data-id]').forEach(triangle => {
                        const id = triangle.getAttribute('data-id');
                        const container = triangle.closest('.block-content[data-type="toggleListItem"]');
                        if (savedState[id] !== undefined && container) {
                            container.classList.toggle('is-collapsed', savedState[id]);
                        }
                    });
                } catch (e) { console.error('Failed to load toggle state:', e); }
            }
            function saveToggleState(id, isCollapsed) {
                try {
                    const savedState = JSON.parse(localStorage.getItem(TOGGLE_STORAGE_KEY) || '{}');
                    savedState[id] = isCollapsed;
                    localStorage.setItem(TOGGLE_STORAGE_KEY, JSON.stringify(savedState));
                } catch (e) { console.error('Failed to save toggle state:', e); }
            }
            document.querySelectorAll('.toggle-triangle[data-id]').forEach(triangle => {
                triangle.addEventListener('click', (e) => {
                    const container = e.target.closest('.block-content[data-type="toggleListItem"]');
                    if (container) {
                        const id = e.target.getAttribute('data-id');
                        container.classList.toggle('is-collapsed');
                        saveToggleState(id, container.classList.contains('is-collapsed'));
                    }
                });
            });
            loadToggleState();
        `;
    }
}