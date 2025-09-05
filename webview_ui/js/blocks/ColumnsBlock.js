// js/blocks/ColumnsBlock.js
class ColumnsBlock extends Block {
    static type = 'columns';

    // This block is structural and should not appear in the command menu.
    static canBeToggled = false;
    
    constructor(data, editor) {
        super(data, editor);
        this.isContainer = true;
    }

    // Columns are special. They don't have the standard .block-container wrapper.
    // Their element IS the content element.
    render() {
        this.element = this._createContentElement();
        this.contentElement = this.element;
        this.childrenContainer = this.element; // Children (columns) are appended directly
        
        this._renderChildren();
        
        return this.element;
    }
    
    // Not directly editable or interactive
    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }
}