// js/blocks/ColumnBlock.js
class ColumnBlock extends ContainerBlock {
    static type = 'column';
    static canBeToggled = false;
    
    constructor(data, editor) {
        super(data, editor);

        // *** FIX: As you correctly pointed out, do NOT create a default child. ***
        // Columns are populated by drag-and-drop or other user actions, not on creation.
        
        if (!this.properties.width) {
            this.properties.width = 0.5;
        }
    }

    render() {
        this.element = this._createContentElement();
        this.contentElement = this.element;
        this.childrenContainer = this.element;

        this._renderContent();
        this._renderChildren();

        return this.element;
    }

    _renderContent() {
        this.contentElement.style.width = `${this.properties.width * 100}%`;
    }

    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }
}