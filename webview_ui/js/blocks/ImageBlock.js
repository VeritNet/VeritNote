// js/blocks/ImageBlock.js
class ImageBlock extends Block {
    static type = 'image';
    static icon = '🖼️';
    static label = 'Image';
    static description = 'Embed an image from a URL or upload.';
    static keywords = ['image', 'img', 'picture', 'photo'];
    static canBeToggled = true;

    _renderContent() {
        if (!this.content) {
            this.content = `<div class="image-placeholder">Click 🖼️ to add an image</div>`;
        }
        this.contentElement.innerHTML = this.content;
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
            // This button now correctly calls the dedicated image source popover
            const existingValue = this.content.match(/src="([^"]+)"/)?.[1] || '';
            window.showImageSourcePopover({
                targetElement: buttonElement,
                existingValue: existingValue,
                callback: (value) => {
                    let currentHref = this.content.match(/href="([^"]+)"/)?.[1] || '';
                    let imgTag = value ? `<img src="${value}" alt="image">` : '';
                    this.content = currentHref && imgTag ? `<a href="${currentHref}">${imgTag}</a>` : imgTag;
                    if (!this.content) {
                        this.content = `<div class="image-placeholder">Click 🖼️ to add an image</div>`;
                    }
                    this.syncContentToDOM();
                    this.editor.emitChange(true, 'edit-image-src', this);
                }
            });
        } else if (action === 'linkImage') {
            // This button correctly calls the generic link popover
            const existingValue = this.content.match(/<a[^>]*href="([^"]*)"/)?.[1] || '';
             window.showLinkPopover({
                targetElement: buttonElement,
                existingValue: existingValue,
                callback: (value) => {
                    let currentSrc = this.content.match(/src="([^"]+)"/)?.[1] || '';
                    let imgTag = currentSrc ? `<img src="${currentSrc}" alt="image">` : '';
                    this.content = value && imgTag ? `<a href="${value}">${imgTag}</a>` : imgTag;
                    if (!this.content) {
                        this.content = `<div class="image-placeholder">Click 🖼️ to add an image</div>`;
                    }
                    this.syncContentToDOM();
                    this.editor.emitChange(true, 'edit-image-link', this);
                }
            });
        }
    }
}