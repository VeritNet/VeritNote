// blocks/ColumnBlock.ts
class ColumnBlock extends Block {
    static override type = 'column';
    static override canBeToggled = false;
    static override createWrapper = false;

    constructor(data: any, editor: any) {
        super(data, editor);
    }

    override _renderContent() {
        this.childrenContainer = this.contentElement;
    }

    override onInput(e: Event) { /* no-op */ }
    override onKeyDown(e: Event) { /* no-op */ }
}

window['registerBlock'](ColumnBlock);