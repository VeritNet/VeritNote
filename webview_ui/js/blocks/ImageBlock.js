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
        const isImageSourceAction = action === 'editImage';
        const isImageLinkAction = action === 'linkImage';

        let existingValue = '';
        if (isImageSourceAction) {
            existingValue = this.content.match(/src="([^"]+)"/)?.[1] || '';
        } else if (isImageLinkAction) {
            existingValue = this.content.match(/<a[^>]*href="([^"]*)"/)?.[1] || '';
        }

        window.dispatchEvent(new CustomEvent('showLinkPopover', { detail: {
            targetElement: buttonElement,
            isImageSource: isImageSourceAction,
            isImageLink: isImageLinkAction,
            existingValue: existingValue,
            callback: (value) => {
                // Update block content based on the action
                if (isImageSourceAction) {
                    let currentHref = this.content.match(/href="([^"]+)"/)?.[1] || '';
                    let imgTag = value ? `<img src="${value}" alt="image">` : '';
                    this.content = currentHref && imgTag ? `<a href="${currentHref}">${imgTag}</a>` : imgTag;
                } else if (isImageLinkAction) {
                    let currentSrc = this.content.match(/src="([^"]+)"/)?.[1] || '';
                    let imgTag = currentSrc ? `<img src="${currentSrc}" alt="image">` : '';
                    this.content = value && imgTag ? `<a href="${value}">${imgTag}</a>` : imgTag;
                }

                if (!this.content) {
                    this.content = `<div class="image-placeholder">Click 🖼️ to add an image</div>`;
                }

                this.syncContentToDOM();
                this.editor.emitChange(true, 'edit-image');
            }
        }}));
    }
}