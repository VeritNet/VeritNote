// js/blocks/ImageBlock.js
class ImageBlock extends Block {
    static type = 'image';
    static icon = '🖼️';
    static label = 'Image';
    static description = 'Embed an image from a URL or upload.';
    static keywords = ['image', 'img', 'picture', 'photo'];
    static canBeToggled = true;

    constructor(data, editor) {
        super(data, editor);
        // --- REFACTORED: Use properties for src and href ---
        if (!this.properties.src) {
            this.properties.src = '';
        }
        if (!this.properties.href) {
            this.properties.href = '';
        }
        // Content is no longer used for the image tag itself
        this.content = '';
    }

    get data() {
        // --- REFACTORED: Save properties, content is always empty ---
        return {
            id: this.id,
            type: this.type,
            content: '',
            properties: this.properties,
            children: [],
        };
    }

    static getPropertiesSchema() {
        return [
            // 核心属性
            { key: 'src', label: 'Image Source', type: 'text' },
            { key: 'href', label: 'Link URL', type: 'text' },
            { key: 'alt', label: 'Alt Text', type: 'text', placeholder: 'Description for accessibility' },

            // 尺寸与适应
            { key: 'width', label: 'Width', type: 'text', placeholder: '100% or 300px' },
            { key: 'height', label: 'Height', type: 'text', placeholder: 'auto or 200px' },
            { key: 'objectFit', label: 'Object Fit', type: 'select', options: ['fill', 'contain', 'cover', 'none', 'scale-down'] },

            // 滤镜特效 (非常实用)
            { key: 'filter', label: 'Filter', type: 'text', placeholder: 'grayscale(100%) blur(2px)' },

            // 继承通用
            ...super.getPropertiesSchema()
        ];
    }

    _renderContent() {
        const p = this.properties;

        // 构建样式字符串
        let style = `display: block;`;
        if (p.width) style += `width: ${p.width};`;
        if (p.height) style += `height: ${p.height};`;
        if (p.objectFit) style += `object-fit: ${p.objectFit};`;
        if (p.filter) style += `filter: ${p.filter};`;

        // 注意：圆角等样式应该应用在 img 标签上，而不是外层 wrapper，因为 wrapper 可能是全宽的
        if (p.borderRadius) style += `border-radius: ${p.borderRadius};`;

        if (p.src) {
            const alt = p.alt || 'image';
            this.contentElement.innerHTML = `<img src="${p.src}" alt="${alt}" style="${style}">`;
        } else {
            this.contentElement.innerHTML = `<div class="image-placeholder">Click 🖼️ to add an image</div>`;
        }
    }
    
    // Images are not directly editable
    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }

    get toolbarButtons() {
        const buttons = [
            { icon: '🖼️', title: 'Set Image Source', action: 'editImage' },
            { icon: '🔗', title: 'Set Image Link', action: 'linkImage' }
        ];
        buttons.push(...super.toolbarButtons);
        return buttons;
    }
    
    handleToolbarAction(action, buttonElement) {
        if (action === 'editImage') {
            // --- REFACTORED: Updates properties.src ---
            this.editor.popoverManager.showImageSource({
                targetElement: buttonElement,
                existingValue: this.properties.src,
                callback: (value) => {
                    this.properties.src = value || '';
                    this._renderContent(); // Re-render the block with the new image source
                    this.editor.emitChange(true, 'edit-image-src', this);
                }
            });
        } else if (action === 'linkImage') {
            this.editor.popoverManager.showLink({
                targetElement: buttonElement,
                existingValue: this.properties.href,
                callback: (value) => {
                    this.properties.href = value || '';
                    // No visual change in the editor, just save the data
                    this.editor.emitChange(true, 'edit-image-link', this);
                }
            });
        }
    }


    // --- NEW: Implement Export API ---
    async getExportHtml(blockElement, options, imageSrcMap) {
        const imgTag = blockElement.querySelector('img');
        if (imgTag) {
            const originalSrc = imgTag.getAttribute('src');
            if (imageSrcMap[originalSrc]) {
                imgTag.setAttribute('src', imageSrcMap[originalSrc]);
            }
            
            if (this.properties.href) {
                const linkWrapper = document.createElement('a');
                
                linkWrapper.setAttribute('href', this.properties.href);
                
                imgTag.parentNode.insertBefore(linkWrapper, imgTag);
                linkWrapper.appendChild(imgTag);
            }
        }
        return blockElement;
    }
}