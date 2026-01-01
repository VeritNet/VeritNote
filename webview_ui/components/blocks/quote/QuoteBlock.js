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

    static getPropertiesSchema() {
        return [
            { key: 'referenceLink', label: 'Ref Link', type: 'text' },
            { key: 'clickLink', label: 'Click URL', type: 'text' },

            // 引用条样式
            { key: 'borderLeftWidth', label: 'Bar Width', type: 'text', placeholder: '3px' },
            { key: 'borderLeftColor', label: 'Bar Color', type: 'color' },

            // 继承通用
            ...super.getPropertiesSchema()
        ];
    }

    _applyGenericStyles() {
        super._applyGenericStyles(); // 应用基础样式

        // 叠加 Quote 特有的样式
        const s = this.contentElement.style; // 注意 Quote 的样式是加在 contentElement 上的
        const p = this.properties;

        if (p.borderLeftWidth) s.borderLeftWidth = p.borderLeftWidth;
        if (p.borderLeftColor) s.borderLeftColor = p.borderLeftColor;

        // 如果是 plain 样式，可能要强制去掉 border
        if (p.style === 'plain') {
            s.borderLeft = 'none';
            s.paddingLeft = '0';
        }
    }

    // --- 4. Rendering Logic ---
    _renderContent() {
        this.contentElement.dataset.style = this.properties.style;

        // --- SIMPLIFIED: No <a> tag or click listeners in the editor view ---
        this.contentElement.innerHTML = `<div class="quote-preview-container"></div>`;
        
        this.previewContainer = this.contentElement.querySelector('.quote-preview-container');

        if (this.properties.referenceLink) {
            this.previewContainer.innerHTML = '<div class="quote-loading-placeholder">Loading reference...</div>';
    
            const [pathPart, blockId] = this.properties.referenceLink.split('#');
            const absolutePath = window.resolveWorkspacePath(pathPart);
            const absoluteReferenceLink = blockId ? `${absolutePath}#${blockId}` : absolutePath;
    
            ipc.fetchQuoteContent(this.id, absoluteReferenceLink); // 使用解析后的绝对路径
        } else {
            this.previewContainer.innerHTML = `<div class="quote-empty-placeholder">Click “ to set a reference</div>`;
        }
    }

    renderQuotedContent(blockElements) {
        const previewContainer = this.contentElement.querySelector('.quote-preview-container');
        if (!previewContainer) return;

        previewContainer.innerHTML = ''; // 清空 "Loading..." 或旧内容

        if (!blockElements || blockElements.length === 0) {
            previewContainer.innerHTML = '<div class="quote-error-placeholder">Referenced content could not be found.</div>';
        } else {
            // 逐个追加由 page-editor.js 渲染好的 DOM 元素
            blockElements.forEach(el => {
                previewContainer.appendChild(el);
            });
        }
    }

    // --- 5. Toolbar ---
    get toolbarButtons() {
        const buttons = [
            { icon: '“', title: 'Set Reference', action: 'setReference' },
            { icon: '|', title: 'Toggle Style', action: 'toggleStyle' },
            { icon: '🔗', title: 'Set Click Link', action: 'setClickLink' }
        ];
        buttons.push(...super.toolbarButtons);
        return buttons;
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
        this.editor.popoverManager.showReference({
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
        this.editor.popoverManager.showLink({
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


    // --- NEW: Implement Export API ---

    /**
     * Renders the final static HTML for the exported Quote block.
     * It replaces the "Loading..." placeholder with the actual referenced content,
     * which is pre-fetched and passed in the `quoteContentCache`.
     */
    async getExportHtml(blockElement, options, imageSrcMap, pathPrefix, quoteContentCache) {
        const previewContainer = blockElement.querySelector('.quote-preview-container');
        if (previewContainer && this.properties.referenceLink) {
            const referenceLink = this.properties.referenceLink;
            const cachedBlockData = quoteContentCache.get(referenceLink);
        
            // Clear the "Loading..." placeholder
            previewContainer.innerHTML = '';
        
            if (cachedBlockData && Array.isArray(cachedBlockData)) {
                // The cache contains raw block data, so we must render it.
                const blockInstances = cachedBlockData.map(data => this.editor.createBlockInstance(data)).filter(Boolean);
                
                blockInstances.forEach(instance => {
                    const renderedEl = instance.render(); // This creates the full block element with controls
                    
                    // --- Cleanup for Export ---
                    // We must remove editor-specific UI from the rendered content.
                    renderedEl.querySelectorAll('.block-controls, .column-resizer').forEach(el => el.remove());
                    renderedEl.querySelectorAll('[contentEditable="true"]').forEach(el => el.removeAttribute('contentEditable'));
        
                    previewContainer.appendChild(renderedEl);
                });
            } else {
                previewContainer.innerHTML = '<div class="quote-error-placeholder">Referenced content could not be found.</div>';
            }
        }
        
        if (this.properties.clickLink) {
            const linkWrapper = document.createElement('a');

            linkWrapper.setAttribute('href', this.properties.clickLink);
            linkWrapper.className = 'quote-click-wrapper';

            blockElement.parentNode.insertBefore(linkWrapper, blockElement);
            linkWrapper.appendChild(blockElement);
            
            return linkWrapper;
        }

        return blockElement;
    }
}