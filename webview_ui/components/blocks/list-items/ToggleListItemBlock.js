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

        this.element.appendChild(this.contentElement);

        this._renderChildren();
        
        // --- Event Listeners ---
        // Listen for clicks on the triangle to toggle the state
        this.toggleElement.addEventListener('click', () => {
            this.properties.isCollapsed = !this.properties.isCollapsed;
            this.updateCollapsedStateStyle();
            this.editor.emitChange(true, 'toggle-collapse', this); // Notify the editor of the change
        });

        // Manually bind onKeyDown to the text area
        this.textElement.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Active state handling (identical to other list items)
        const setActive = (isActive) => {
            if (isActive) { this.element.classList.add('vn-active'); } 
            else { this.element.classList.remove('vn-active'); }
        };
        this.element.addEventListener('mouseenter', () => setActive(true));
        this.element.addEventListener('mouseleave', () => {
            if (document.activeElement !== this.textElement) { setActive(false); }
        });
        this.textElement.addEventListener('focus', () => setActive(true));
        this.textElement.addEventListener('blur', () => {
            if (!this.element.matches(':hover')) { setActive(false); }
        });

        return this.element;
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