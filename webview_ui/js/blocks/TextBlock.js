// js/blocks/TextBlock.js
class TextBlock extends Block {
    constructor(data, editor) {
        super(data, editor);
    }

    _renderContent() {
        super._renderContent();
        this.contentElement.contentEditable = 'true';
        this.contentElement.innerHTML = this.content || '';
        if (this.constructor.placeholder) {
            this.contentElement.dataset.placeholder = this.constructor.placeholder;
        }
    }

    get toolbarButtons() {
        return [
            { icon: '𝐁', title: 'Bold', action: 'format', arg: 'bold' },
            { icon: '𝘐', title: 'Italic', action: 'format', arg: 'italic' },
            { icon: 'U̲', title: 'Underlined', action: 'format', arg: 'underline' },
            { icon: 'S̶', title: 'StrikeThrough', action: 'format', arg: 'strikeThrough' },
            { icon: '🎨', title: 'Color', action: 'colorPicker' },
            { icon: '🔗', title: 'Link', action: 'link' },
        ];
    }
}