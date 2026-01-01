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

    static getPropertiesSchema() {
        return [
            { key: 'url', label: 'Target URL', type: 'text' },

            // 按钮专属外观
            { key: 'display', label: 'Display', type: 'select', options: ['inline-block', 'block'] },
            { key: 'btnColor', label: 'Text Color', type: 'color' },
            { key: 'btnBgColor', label: 'Button Color', type: 'color' },
            { key: 'padding', label: 'Inner Padding', type: 'text', placeholder: '8px 16px' }, // 覆盖基类的 padding
            { key: 'fontSize', label: 'Font Size', type: 'text', placeholder: '14px' },
            { key: 'fontWeight', label: 'Font Weight', type: 'select', options: ['normal', 'bold'] },
            { key: 'cursor', label: 'Cursor', type: 'select', options: ['pointer', 'default', 'not-allowed'] },

            // 继承通用 (用于外边距等)
            ...super.getPropertiesSchema()
        ];
    }

    _renderContent() {
        // 1. 外层容器不再可编辑
        this.contentElement.contentEditable = 'false';

        const textContent = this.content || 'Button';

        // 构建样式
        const p = this.properties;
        let style = '';
        if (p.btnColor) style += `color: ${p.btnColor};`;
        if (p.btnBgColor) style += `background-color: ${p.btnBgColor};`;
        if (p.padding) style += `padding: ${p.padding};`;
        if (p.fontSize) style += `font-size: ${p.fontSize};`;
        if (p.fontWeight) style += `font-weight: ${p.fontWeight};`;
        if (p.display) style += `display: ${p.display}; width: ${p.display === 'block' ? '100%' : 'auto'}; text-align: center;`;
        if (p.cursor) style += `cursor: ${p.cursor};`;

        // 2. 将 contentEditable 加在 a 标签上，并强制 display: inline-block 确保行为正常
        // 注意：我们需要防止点击 a 标签跳转，这通常由编辑器拦截，但 contentEditable 为 true 时浏览器通常不会跳转
        this.contentElement.innerHTML = `<a href="${p.url || '#'}" style="${style}" contenteditable="true">${textContent}</a>`;
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