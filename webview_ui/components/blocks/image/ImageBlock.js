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

    _renderContent() {
        // --- REFACTORED: Only render the image, never the <a> tag in the editor ---
        if (this.properties.src) {
            this.contentElement.innerHTML = `<img src="${this.properties.src}" alt="image">`;
        } else {
            this.contentElement.innerHTML = `<div class="image-placeholder">Click 🖼️ to add an image</div>`;
        }
    }
    
    // Images are not directly editable
    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }

    get toolbarButtons() {
        return [
            { icon: '🖼️', title: 'Set Image Source', action: 'editImage' },
            { icon: '🔗', title: 'Set Image Link', action: 'linkImage' }
        ];
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