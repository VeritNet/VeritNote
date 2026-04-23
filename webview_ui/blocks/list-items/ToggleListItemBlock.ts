// blocks/ToggleListItemBlock.js

class ToggleListItemBlock extends TextBlock {
    // --- 1. Static properties definition ---
    static override type = 'toggleListItem';
    static override icon = '▶';
    static override label = 'Toggle List';
    static override description = 'Create a collapsible list item.';
    static override keywords = ['toggle', 'list', 'collapsible', 'expand', 'item'];
    static override canBeToggled = true;
    static override placeholder = 'Toggle';

    
    textElement: HTMLElement;
    toggleElement: HTMLElement;

    // --- 2. Constructor ---
    constructor(data, editor) {
        super(data, editor);

        // The core state property: isCollapsed
        this.properties.isCollapsed = data.properties?.isCollapsed || false;
    }

    // --- 3. Rendering ---
    override _renderContent() {
        if (!this.contentElement.hasChildNodes()) {
            const toggleWrapper = document.createElement('div');
            toggleWrapper.className = 'toggle-triangle-wrapper';

            this.toggleElement = document.createElement('div');
            this.toggleElement.className = 'toggle-triangle';
            this.toggleElement.dataset['id'] = this.id;
            
            this.toggleElement.addEventListener('click', () => {
                this.properties.isCollapsed = !this.properties.isCollapsed;
                this.updateCollapsedStateStyle();
                this.BAPI_PE.emitChange(true, 'toggle-collapse', this);
            });

            toggleWrapper.appendChild(this.toggleElement);

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

            this.contentElement.appendChild(toggleWrapper);
            this.contentElement.appendChild(contentWrapper);
        }

        this.updateCollapsedStateStyle();
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
    override getExportScripts(exportContext) {
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