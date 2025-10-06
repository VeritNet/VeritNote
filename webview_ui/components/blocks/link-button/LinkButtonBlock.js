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
            this.properties.url = '';
        }
    }

    _renderContent() {
        this.contentElement.contentEditable = 'true';
        // When rendering, ensure content is just the text, not a nested <a> tag.
        const textContent = this.content || 'Edit Button Text';
        this.contentElement.innerHTML = `<a href="${this.properties.url || '#'}">${textContent}</a>`;
    }

    get toolbarButtons() {
        const buttons = [
            { icon: '🔗', title: 'Edit Button Link', action: 'editLinkButton' }
        ];
        buttons.push(...super.toolbarButtons);
        return buttons;
    }
    
    // Override sync to save only the text part from the contentEditable element
    syncContentFromDOM() {
        if (this.contentElement) {
            // We get the textContent of the inner <a> tag, or the element itself if <a> is missing
            const linkElement = this.contentElement.querySelector('a');
            this.content = linkElement ? linkElement.textContent : this.contentElement.textContent;
            this.content = this.content || ''; // Ensure it's not null
        }
    }

    /**
     * This method will be called by the editor when the toolbar button is clicked.
     */
    handleToolbarAction(action, buttonElement) {
        if (action === 'editLinkButton') {
            // We call the global showLinkPopover function
            this.editor.popoverManager.showLink({
                targetElement: buttonElement,
                existingValue: this.properties.url || '',
                callback: (value) => {
                    this.properties.url = value || '#';
                    // Re-render content with the new URL after a delay
                    // This ensures the popover has time to close and doesn't interfere
                    setTimeout(() => {
                        this.syncContentFromDOM(); // First, save any text changes the user made
                        this._renderContent();   // Then, re-render the link with the new URL
                        this.editor.emitChange(true, 'edit-button-link', this);
                    }, 0);
                }
            });
        }
    }

    // Use default TextBlock-like onInput to trigger updates
    onInput(e) {
        this.editor.emitChange(true, 'typing', this);
    }
}