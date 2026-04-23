// blocks/ColumnBlock.ts
class ColumnBlock extends Block {
    static override type = 'column';
    static override canBeToggled = false;
    static override createWrapper = false;

    constructor(data: any, editor: any) {
        super(data, editor);
        if (!this.properties.width) {
            this.properties.width = 0.5;
        }
    }

    override _renderContent() {
        this.childrenContainer = this.element;
        if (this.contentElement) {
            this.contentElement.style.width = `${this.properties.width * 100}%`;
        }
    }

    override onInput(e: Event) { /* no-op */ }
    override onKeyDown(e: Event) { /* no-op */ }
}

window['registerBlock'](ColumnBlock);