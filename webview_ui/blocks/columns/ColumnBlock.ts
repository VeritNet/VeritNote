// blocks/ColumnBlock.js
class ColumnBlock extends Block {
    static type = 'column';
    static canBeToggled = false;
    static createWrapper = false;
    
    constructor(data, editor) {
        super(data, editor);
        if (!this.properties.width) {
            this.properties.width = 0.5;
        }
    }

    _renderContent() {
        this.childrenContainer = this.element;
        this.contentElement.style.width = `${this.properties.width * 100}%`;
    }

    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }
}

window['registerBlock'](ColumnBlock);