// js/blocks/Block.js
class Block {
    /**
     * @param {object} data - The block's data object (id, type, content, etc.).
     * @param {Editor} editor - The main editor instance.
     */
    constructor(data, editor) {
        this.id = data.id || this._generateUUID();
        this.type = data.type;
        this.content = data.content || '';
        this.properties = data.properties || {};
        
        this.editor = editor;
        this.element = null;
        this.contentElement = null;
        this.childrenContainer = null;
        
        // *** FIX: GUARANTEE that this.children is always an array. ***
        const childrenData = data.children || [];
        this.children = childrenData.map(childJson => this.editor.createBlockInstance(childJson)).filter(Boolean);
        // Add parent property to children right away
        this.children.forEach(child => child.parent = this);
    }

    // --- Static properties for registration and slash command ---
    static type = 'block'; // Should be overridden by subclasses
    static label = 'Block'; // Default label for UI
    static description = 'A generic block.'; // Default description for UI
    static keywords = []; // Keywords for search
    static canBeToggled = false; // Whether it appears in the slash command menu
    
    /**
     * Returns the block's data for saving.
     * @returns {object} The serializable data object for this block.
     */
    get data() {
        this.syncContentFromDOM();

        return {
            id: this.id,
            type: this.type,
            content: this.content,
            properties: this.properties,
            // *** FIX: Always generate children data from the live this.children instance array. ***
            children: this.children.map(child => child.data),
        };
    }

    /**
     * The toolbar buttons definition for this block.
     * Subclasses should override this.
     * @returns {Array} An array of button definition objects.
     */
    get toolbarButtons() {
        return []; // e.g., [{ icon: 'B', title: 'Bold', action: 'format', arg: 'bold' }]
    }

    /**
     * Creates and returns the DOM element for the block.
     * This is the main rendering entry point.
     * @returns {HTMLElement} The fully rendered block element.
     */
    render() {
        this.element = this._createWrapperElement();
        this.contentElement = this._createContentElement();
        
        this.childrenContainer = this.element;

        this._renderContent();
        
        this.element.appendChild(this.contentElement);

        this._renderChildren();

        return this.element;
    }

    /**
     * Creates the main wrapper element (.block-container).
     * @private
     */
    _createWrapperElement() {
        const element = document.createElement('div');
        element.className = 'block-container';
        element.dataset.id = this.id;
        element.draggable = true;
        // Inject controls
        element.innerHTML = `
            <div class="block-controls">
                <span class="drag-handle" title="Drag to move">⠿</span>
                <span class="delete-btn" title="Delete">🗑️</span>
            </div>
        `;
        return element;
    }

    /**
     * Creates the content element (.block-content).
     * @private
     */
    _createContentElement() {
        const content = document.createElement('div');
        content.className = 'block-content';
        content.dataset.id = this.id;
        content.dataset.type = this.type;
        return content;
    }

    /**
     * Renders the specific content of the block into `this.contentElement`.
     * Subclasses MUST override this method.
     * @private
     */
    _renderContent() {
        // Example: this.contentElement.innerHTML = this.content;
        // To be implemented by subclasses.
    }

    /**
     * Renders child blocks and appends them to the correct container.
     * @private
     */
    _renderChildren() {
        if (this.children.length > 0) {
            this.children.forEach(childInstance => {
                // The parent property is now set in the constructor, but we can ensure it here too.
                childInstance.parent = this; 
                this.childrenContainer.appendChild(childInstance.render());
            });
        }
    }
    
    /**
     * Updates the block's `content` property from its DOM element.
     */
    syncContentFromDOM() {
        if (this.contentElement && this.contentElement.isContentEditable) {
            this.content = this.contentElement.innerHTML;
        }
    }

    /**
     * Updates the block's DOM element from its `content` property.
     */
    syncContentToDOM() {
        if (this.contentElement) {
            this.contentElement.innerHTML = this.content;
        }
    }

    /**
     * Focuses the block's content element and moves cursor to the end.
     */
    focus() {
        if (!this.contentElement || !this.contentElement.isContentEditable) return;
        
        this.contentElement.focus();
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(this.contentElement);
        range.collapse(false); // Move to the end
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    /**
     * Handles input events on the block.
     * @param {InputEvent} e The event object.
     */
    onInput(e) {
        const content = this.contentElement.textContent || '';
        if (content.startsWith('/')) {
            this.editor.showCommandMenuForBlock(this);
        } else {
            this.editor.hideCommandMenu();
        }
        // *** MODIFIED: Pass the 'typing' actionType ***
        this.editor.emitChange(true, 'typing');
    }
    
    /**
     * Handles keydown events on the block.
     * @param {KeyboardEvent} e The event object.
     */
    onKeyDown(e) {
        // Default behavior for contentEditable blocks
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // *** FIX: Force sync THIS block's content before telling the editor to create a new one. ***
            this.syncContentFromDOM(); 
            this.editor.insertNewBlockAfter(this);
        }

        if (e.key === '/') {
            setTimeout(() => this.editor.showCommandMenuForBlock(this), 0);
        }
    }

    _generateUUID() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }


    /**
     * @returns {Array<string>} A list of vendor library paths required for this block when exported.
     * Example: ['vendor/highlight/highlight.min.js', 'vendor/highlight/theme.css']
     */
    static get requiredExportLibs() {
        return [];
    }
}