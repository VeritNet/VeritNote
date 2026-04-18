// blocks/ToggleListItemBlock.js

class ToggleListItemBlock extends TextBlock {
    // --- 1. Static properties definition ---
    static type = 'toggleListItem';
    static icon = '▶';
    static label = 'Toggle List';
    static description = 'Create a collapsible list item.';
    static keywords = ['toggle', 'list', 'collapsible', 'expand', 'item'];
    static canBeToggled = true;
    static placeholder = 'Toggle';

    
    textElement;
    toggleElement;

    // --- 2. Constructor ---
    constructor(data, editor) {
        super(data, editor);
        if (!this.properties) {
            this.properties = {};
        }
        // The core state property: isCollapsed
        this.properties.isCollapsed = data.properties?.isCollapsed || false;
    }

    // --- 3. Rendering ---
    _renderContent() {
        // Create the unique layout: [Toggle Triangle] [Text Area]
        this.contentElement.innerHTML = `
            <div class="toggle-triangle-wrapper">
                <div class="toggle-triangle" data-id="${this.id}"></div>
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
        this.textElement.dataset['placeholder'] = (this.constructor as typeof Block).placeholder;

        this._applyListItemStyles();
        
        // --- Event Listeners ---
        // Listen for clicks on the triangle to toggle the state
        this.toggleElement.addEventListener('click', () => {
            this.properties.isCollapsed = !this.properties.isCollapsed;
            this.updateCollapsedStateStyle();
            this.BAPI_PE.emitChange(true, 'toggle-collapse', this); // Notify the editor of the change
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


    /**
     * Provides the necessary JavaScript to make the toggle list interactive in the exported HTML.
     * This script handles click events, toggles a CSS class, and saves the state to localStorage.
     */
    getExportScripts(exportContext) {
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

window['registerBlock'](ToggleListItemBlock);