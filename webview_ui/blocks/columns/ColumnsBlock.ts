// blocks/ColumnsBlock.ts
class ColumnsBlock extends Block {
    static override type = 'columns';
    static override canBeToggled = false;
    static override createWrapper = false;

    constructor(data: any, editor: any) {
        super(data, editor);
    }

    override _renderContent() {
        this.childrenContainer = this.contentElement;
    }

    override runEditorScripts() {
        if (!this.contentElement || this.children.length === 0) return;
        console.log(this.contentElement.children);

        // 1. 通过 DOM 查询直接获取基类挂载的子列容器（避开访问子块的私有变量）
        const childNodes = Array.from(this.contentElement.children).filter(el =>
            el.classList.contains('block-content')
        );
        console.log(childNodes);

        if (childNodes.length === 0) return;

        // 2. 统一由父块属性管理分配宽度
        if (!this.properties.widths || this.properties.widths.length !== childNodes.length) {
            const defaultWidth = 1 / childNodes.length;
            this.properties.widths = childNodes.map(() => defaultWidth);
        }

        console.log('ColumnsBlock: Running editor scripts. Child:', childNodes);

        // 3. 清理旧的调整条（以防被重复调用）
        this.contentElement.querySelectorAll('.column-resizer').forEach(el => el.remove());

        // 4. 直接向子列 DOM 赋予宽度，并插入调整器
        childNodes.forEach((node, index) => {
            const el = node as HTMLElement;
            // 弃用 Wrapper，直接控制子块最外层容器的宽度
            el.style.width = `${this.properties.widths[index] * 100}%`;

            // 如果不是最后一列，则在当前列 DOM 之后插入一个调整器
            if (index < childNodes.length - 1) {
                const resizer = this._createColumnResizer(index, childNodes as HTMLElement[]);
                el.after(resizer);
            }
        });
    }

    private _createColumnResizer(leftIndex: number, childNodes: HTMLElement[]): HTMLElement {
        const resizer = document.createElement('div');
        resizer.className = 'column-resizer';

        resizer.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            if (!this.contentElement) return;

            const startX = e.clientX;
            const leftInitialWidth = this.properties.widths[leftIndex];
            const rightInitialWidth = this.properties.widths[leftIndex + 1];

            // 直接获取左右真实的子块 DOM
            const leftNode = childNodes[leftIndex];
            const rightNode = childNodes[leftIndex + 1];

            const onMouseMove = (moveEvent: MouseEvent) => {
                const parentWidth = this.contentElement!.offsetWidth;
                if (parentWidth === 0) return;

                const deltaX = moveEvent.clientX - startX;
                const deltaPercentage = deltaX / parentWidth;

                let newLeftWidth = leftInitialWidth + deltaPercentage;
                let newRightWidth = rightInitialWidth - deltaPercentage;

                const minWidth = 0.1; // 10%
                if (newLeftWidth < minWidth || newRightWidth < minWidth) return;

                // 直接调整子列容器的样式
                leftNode.style.width = `${newLeftWidth * 100}%`;
                rightNode.style.width = `${newRightWidth * 100}%`;
            };

            const onMouseUp = (upEvent: MouseEvent) => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                const parentWidth = this.contentElement!.offsetWidth;
                if (parentWidth === 0) return;

                const deltaX = upEvent.clientX - startX;
                const deltaPercentage = deltaX / parentWidth;

                let finalLeftWidth = leftInitialWidth + deltaPercentage;
                let finalRightWidth = rightInitialWidth - deltaPercentage;

                const minWidth = 0.1;
                if (finalLeftWidth < minWidth) {
                    finalRightWidth += (finalLeftWidth - minWidth);
                    finalLeftWidth = minWidth;
                }
                if (finalRightWidth < minWidth) {
                    finalLeftWidth += (finalRightWidth - minWidth);
                    finalRightWidth = minWidth;
                }

                this.properties.widths[leftIndex] = finalLeftWidth;
                this.properties.widths[leftIndex + 1] = finalRightWidth;

                leftNode.style.width = `${finalLeftWidth * 100}%`;
                rightNode.style.width = `${finalRightWidth * 100}%`;

                this.BAPI_PE.emitChange(true, 'resize-column');
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        return resizer;
    }

    override onInput(e: Event) { /* no-op */ }
    override onKeyDown(e: Event) { /* no-op */ }
}

window['registerBlock'](ColumnsBlock);