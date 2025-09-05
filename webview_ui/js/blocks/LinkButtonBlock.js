// js/blocks/LinkButtonBlock.js
class LinkButtonBlock extends Block {
    static type = 'linkButton';
    static icon = '🔘';
    static label = 'Button';
    static description = 'A prominent link button.';
    static keywords = ['button', 'link', 'btn', 'action'];
    static canBeToggled = true;

    constructor(data, editor) {
        super(data, editor);
        // Ensure properties exist for a new button
        if (!this.properties.url) {
            this.properties.url = '#';
        }
    }

    _renderContent() {
        this.contentElement.contentEditable = 'true';
        const textContent = this.content.replace(/<[^>]*>?/gm, '') || 'Edit Button Text';
        this.content = `<a href="${this.properties.url}">${textContent}</a>`;
        this.contentElement.innerHTML = this.content;
    }

    get toolbarButtons() {
        return [
            { icon: '🔗', title: 'Edit Button Link', action: 'editLinkButton' }
        ];
    }
    
    // Override sync to save only the text part, not the whole <a> tag
    syncContentFromDOM() {
        if (this.contentElement) {
            this.content = this.contentElement.textContent || '';
        }
    }

    handleToolbarAction(action, buttonElement) {
        if (action === 'editLinkButton') {
            window.dispatchEvent(new CustomEvent('showLinkPopover', { detail: {
                targetElement: buttonElement,
                existingValue: this.properties.url || '',
                callback: (value) => {
                    this.properties.url = value || '#';
                    // Re-render content with the new URL
                    const textContent = this.contentElement.textContent || 'Edit Button Text';
                    this.content = `<a href="${this.properties.url}">${textContent}</a>`;
                    this.syncContentToDOM();
                    this.editor.emitChange(true, 'edit-button-link');
                }
            }}));
        }
    }
}