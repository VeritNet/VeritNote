// js/blocks/ColumnsBlock.js
class ColumnsBlock extends Block {
    static type = 'columns';
    static canBeToggled = false;
    
    constructor(data, editor) {
        super(data, editor);
    }

    render() {
        // 原始的、无包装器的渲染方法
        this.element = this._createContentElement();
        this.contentElement = this.element;
        
        this._renderChildren(this.contentElement);
        
        return this.element;
    }
    
    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }
}