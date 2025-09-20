// js/blocks/QuoteBlock.js
class QuoteBlock extends Block {
    // --- 1. Static properties ---
    static type = 'quote';
    static icon = '“';
    static label = 'Quote';
    static description = 'Reference content from another page or block.';
    static keywords = ['quote', 'reference', 'embed', 'transclusion'];
    static canBeToggled = true;

    // --- 2. Constructor ---
    constructor(data, editor) {
        super(data, editor);
        
        // Initialize properties for reference link, style, and click behavior
        this.properties.referenceLink = data.properties?.referenceLink || null;
        this.properties.style = data.properties?.style || 'default'; // 'default' or 'plain'
        this.properties.clickLink = data.properties?.clickLink || null;

        // This block's content is virtual, so it has no direct children in its data model
        this.children = [];
    }

    // --- 3. Data Getter ---
    // The key is that it *only* saves properties, not content or children.
    get data() {
        return {
            id: this.id,
            type: this.type,
            content: '', // Always empty
            properties: this.properties,
            children: [], // Always empty
        };
    }

    // --- 4. Rendering Logic ---
    _renderContent() {
        this.contentElement.dataset.style = this.properties.style;

        // --- SIMPLIFIED: No <a> tag or click listeners in the editor view ---
        this.contentElement.innerHTML = `<div class="quote-preview-container"></div>`;
        
        this.previewContainer = this.contentElement.querySelector('.quote-preview-container');

        if (this.properties.referenceLink) {
            this.previewContainer.innerHTML = '<div class="quote-loading-placeholder">Loading reference...</div>';
            ipc.fetchQuoteContent(this.id, this.properties.referenceLink);
        } else {
            this.previewContainer.innerHTML = `<div class="quote-empty-placeholder">Click “ to set a reference</div>`;
        }
    }

    renderQuotedContent(blockDataArray) {
        if (!this.previewContainer) return;
        this.previewContainer.innerHTML = '';

        if (!blockDataArray || blockDataArray.length === 0) {
            this.previewContainer.innerHTML = '<div class="quote-error-placeholder">Referenced content could not be found.</div>';
            return;
        }

        const sandboxContainer = document.createElement('div');
        const tempEditor = new Editor(sandboxContainer);
        registerAllBlocks(tempEditor);

        const blockInstances = blockDataArray.map(data => tempEditor.createBlockInstance(data)).filter(Boolean);
        
        blockInstances.forEach(block => {
            const blockEl = block.render();
            this.previewContainer.appendChild(blockEl);
        });
    }

    // --- 5. Toolbar ---
    get toolbarButtons() {
        return [
            { icon: '“', title: 'Set Reference', action: 'setReference' },
            { icon: '|', title: 'Toggle Style', action: 'toggleStyle' },
            { icon: '🔗', title: 'Set Click Link', action: 'setClickLink' }
        ];
    }
    
    handleToolbarAction(action, buttonElement) {
        switch(action) {
            case 'setReference':
                this.showReferencePicker(buttonElement);
                break;
            case 'toggleStyle':
                this.toggleStyle();
                break;
            case 'setClickLink':
                this.showClickLinkPicker(buttonElement);
                break;
        }
    }

    showReferencePicker(targetElement) {
        // Uses a new, custom popover defined in main.js
        window.showReferencePopover({
            targetElement: targetElement,
            existingValue: this.properties.referenceLink,
            callback: (value) => {
                this.properties.referenceLink = value;
                this.editor.emitChange(true, 'set-quote-reference', this);
                this._renderContent(); // Re-render to fetch new content
            }
        });
    }
    
    toggleStyle() {
        this.properties.style = this.properties.style === 'default' ? 'plain' : 'default';
        if (this.contentElement) {
            this.contentElement.dataset.style = this.properties.style;
        }
        this.editor.emitChange(true, 'toggle-quote-style', this);
    }

    showClickLinkPicker(targetElement) {
        // Reuses the standard link popover
        window.showLinkPopover({
            targetElement: targetElement,
            existingValue: this.properties.clickLink,
            callback: (value) => {
                this.properties.clickLink = value;
                this.editor.emitChange(true, 'set-quote-click-link', this);
                // No need to re-render, as the link is only applied on export/preview
            }
        });
    }

    // This block is not directly editable
    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }
}