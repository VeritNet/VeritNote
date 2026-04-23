// blocks/media/ImageBlock.js
class ImageBlock extends Block {
    static override type = 'image';
    static override icon = '🖼️';
    static override label = 'Image';
    static override description = 'Embed an image from a URL or upload.';
    static override keywords = ['image', 'img', 'picture', 'photo'];
    static override canBeToggled = true;

    constructor(data, editor) {
        super(data, editor);
        // --- REFACTORED: Use properties for src and href ---
        if (!this.properties.src) {
            this.properties.src = '';
        }
        if (!this.properties.href) {
            this.properties.href = '';
        }
    }

    static override getPropertiesSchema() {
        return [
            // 核心属性
            { name: 'src', display: 'Image Source', type: 'text' },
            { name: 'href', display: 'Link URL', type: 'text' },
            { name: 'alt', display: 'Alt Text', type: 'text', placeholder: 'Description for accessibility' },

            // 尺寸与适应
            { name: 'width', display: 'Width', type: 'text', placeholder: '100% or 300px' },
            { name: 'height', display: 'Height', type: 'text', placeholder: 'auto or 200px' },
            { name: 'objectFit', display: 'Object Fit', type: 'combo', values: [{display: 'fill', value: 'fill'}, {display: 'contain', value: 'contain'}, {display: 'cover', value: 'cover'}, {display: 'none', value: 'none'}, {display: 'scale-down', value: 'scale-down'}] },

            // 滤镜特效 (非常实用)
            { name: 'filter', display: 'Filter', type: 'text', placeholder: 'grayscale(100%) blur(2px)' },

            // 继承通用
            ...super.getPropertiesSchema()
        ];
    }

    _renderContent() {
        const p = this.properties;
        while (this.contentElement.firstChild) {
            this.contentElement.removeChild(this.contentElement.firstChild);
        }

        if (!p.src) {
            const placeholder = document.createElement('div');
            placeholder.className = 'image-placeholder';
            placeholder.textContent = 'Click 🖼️ to add an image';
            this.contentElement.appendChild(placeholder);
            return;
        }

        const img = document.createElement('img');
        img.src = p.src;
        img.alt = p.alt || 'image';
        
        img.style.display = 'block';
        if (p.width) img.style.width = p.width;
        if (p.height) img.style.height = p.height;
        if (p.objectFit) img.style.objectFit = p.objectFit;
        if (p.filter) img.style.filter = p.filter;
        if (p.borderRadius) img.style.borderRadius = p.borderRadius;

        if (p.href) {
            const link = document.createElement('a');
            link.href = p.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.appendChild(img);
            this.contentElement.appendChild(link);
        } else {
            this.contentElement.appendChild(img);
        }
    }
    
    // Images are not directly editable
    override onInput(e) { /* no-op */ }
    override onKeyDown(e) { /* no-op */ }

    override get toolbarButtons() {
        const buttons = [
            { icon: '🖼️', title: 'Set Image Source', action: 'editImage' },
            { icon: '🔗', title: 'Set Image Link', action: 'linkImage' }
        ];
        buttons.push(...super.toolbarButtons as any);
        return buttons;
    }
    
    override handleToolbarAction(action, buttonElement) {
        if (action === 'editImage') {
            // --- REFACTORED: Updates properties.src ---
            this.BAPI_PE.popoverManager.showImageSource(
                buttonElement,
                this.properties.src,
                (value) => {
                    this.properties.src = value || '';
                    this._renderContent(); // Re-render the block with the new image source
                    this.BAPI_PE.emitChange(true, 'edit-image-src', this);
                }
            );
        } else if (action === 'linkImage') {
            this.BAPI_PE.popoverManager.showLink(
                buttonElement,
                this.properties.href,
                (value) => {
                    this.properties.href = value || '';
                    // No visual change in the editor, just save the data
                    this.BAPI_PE.emitChange(true, 'edit-image-link', this);
                    this._renderContent(); // Re-render to update the link <a> wrapping
                }
            );
        }
    }
}

window['registerBlock'](ImageBlock);