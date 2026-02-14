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
        this.contentElement.innerHTML = `<div class="quote-preview-container"></div>`;
        this.previewContainer = this.contentElement.querySelector('.quote-preview-container');

        if (this.properties.referenceLink) {
            // 检查编辑器实例是否有预加载的缓存 (用于预览模式)
            if (this.editor.quoteContentCache && this.editor.quoteContentCache.has(this.properties.referenceLink)) {
                const cachedContent = this.editor.quoteContentCache.get(this.properties.referenceLink);
                if (cachedContent) {
                    this.renderQuotedContent(cachedContent);
                } else {
                    this.renderError("Referenced content could not be loaded.");
                }
            } else {
                // 如果没有缓存，则执行正常的异步加载 (用于编辑模式)
                this.loadQuoteContent();
            }
        } else {
            this.previewContainer.innerHTML = `<div class="quote-empty-placeholder">Click “ to set a reference</div>`;
        }
    }

    loadQuoteContent() {
        if (!this.properties.referenceLink) return;

        this.previewContainer.innerHTML = '<div class="quote-loading-placeholder">Loading reference...</div>';

        const [pathPart, blockId] = this.properties.referenceLink.split('#');
        const absolutePath = window.resolveWorkspacePath(pathPart);
        const absoluteReferenceLink = blockId ? `${absolutePath}#${blockId}` : absolutePath;

        // 定义一次性事件监听器
        const listener = (e) => {
            const payload = e.detail.payload || e.detail; // 兼容不同的 IPC 封装

            // 检查是否是当前块的请求
            if (payload.quoteBlockId === this.id) {
                window.removeEventListener('quoteContentFetched', listener);

                if (payload.error) {
                    this.renderError(payload.error);
                } else {
                    this.renderQuotedContent(payload.content);
                }
            }
        };

        // 设置超时保护
        setTimeout(() => {
            window.removeEventListener('quoteContentFetched', listener);
            if (this.previewContainer.innerHTML.includes('Loading')) {
                // 仅当还在 Loading 状态时显示超时，避免覆盖已加载内容
                // this.renderError("Request timeout"); 
            }
        }, 10000); // Quote 加载可能较慢，给 10秒

        // 监听 IPC 广播的事件
        window.addEventListener('quoteContentFetched', listener);

        // 发起请求，传入 this.id 作为请求标识
        ipc.fetchQuoteContent(this.id, absoluteReferenceLink);
    }

    renderQuotedContent(blockDataList) {
        if (!this.previewContainer) return;
        this.previewContainer.innerHTML = '';

        if (!blockDataList || blockDataList.length === 0) {
            this.renderError("Referenced content could not be found or is empty.");
            return;
        }

        // 使用编辑器实例创建块并渲染
        const blockInstances = blockDataList.map(data => this.editor.createBlockInstance(data)).filter(Boolean);
        blockInstances.forEach(instance => {
            // 渲染并添加到容器
            const el = instance.render();

            // 移除一些交互控件，使引用内容只读
            el.querySelectorAll('.block-controls').forEach(c => c.remove());
            el.querySelectorAll('[contentEditable]').forEach(c => c.removeAttribute('contentEditable'));

            this.previewContainer.appendChild(el);
        });

        this._cachedContent = blockDataList;
    }

    renderError(msg) {
        if (this.previewContainer) {
            this.previewContainer.innerHTML = `<div class="quote-error-placeholder">${msg}</div>`;
        }
    }

    /**
     * 响应页面保存事件，检查是否需要刷新
     */
    onPageSaved(savedPath) {
        if (!this.properties.referenceLink) return;

        const [pathPart] = this.properties.referenceLink.split('#');
        const referencedPagePath = window.resolveWorkspacePath(pathPart);

        // 如果保存的页面正是当前引用的页面，则重新加载
        if (savedPath === referencedPagePath) {
            console.log(`QuoteBlock ${this.id}: Referenced page saved, refreshing...`);
            this.loadQuoteContent();
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