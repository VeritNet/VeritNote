// blocks/ColumnsBlock.js
class ColumnsBlock extends Block {
    static override type = 'columns';
    static override canBeToggled = false;
    static override createWrapper = false;
    
    constructor(data, editor) {
        super(data, editor);
    }

    _renderContent() {
        this.childrenContainer = this.contentElement;
    }
    
    override onInput(e) { /* no-op */ }
    override onKeyDown(e) { /* no-op */ }
}

window['registerBlock'](ColumnsBlock);