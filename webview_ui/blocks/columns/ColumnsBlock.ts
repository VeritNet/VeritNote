// blocks/ColumnsBlock.js
class ColumnsBlock extends Block {
    static type = 'columns';
    static canBeToggled = false;
    static createWrapper = false;
    
    constructor(data, editor) {
        super(data, editor);
    }

    _renderContent() {
        this.childrenContainer = this.contentElement;
    }
    
    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }
}

window['registerBlock'](ColumnsBlock);