// blocks/ColumnBlock.js
class ColumnBlock extends Block {
    static override type = 'column';
    static override canBeToggled = false;
    static override createWrapper = false;
    
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

    override onInput(e) { /* no-op */ }
    override onKeyDown(e) { /* no-op */ }
}

window['registerBlock'](ColumnBlock);