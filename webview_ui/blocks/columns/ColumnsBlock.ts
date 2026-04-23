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

        // 利用微任务机制，在基类同步完成 _renderChildren 挂载子列后，立即挂载调整器
        // 仅编辑器模式需要
        Promise.resolve().then(() => this._mountResizers());
    }

    private _mountResizers() {
        if (!this.contentElement || this.children.length <= 1) return;

        // 清理可能遗留的 resizer，防止多次 render 导致重复
        this.contentElement.querySelectorAll('.column-resizer').forEach(el => el.remove());

        for (let i = 1; i < this.children.length; i++) {
            const leftCol = this.children[i - 1];
            const rightCol = this.children[i];
            const resizer = this._createColumnResizer(leftCol, rightCol);

            // 将 resizer 插入到 DOM 中的左列和右列之间
            const leftColEl = leftCol.element;
            if (leftColEl && leftColEl.nextSibling) {
                this.contentElement.insertBefore(resizer, leftColEl.nextSibling);
            } else {
                this.contentElement.appendChild(resizer);
            }
        }
    }

    private _createColumnResizer(leftColumn: Block, rightColumn: Block): HTMLElement {
        const resizer = document.createElement('div');
        resizer.className = 'column-resizer';

        resizer.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            if (!this.contentElement) return;

            const startX = e.clientX;
            const leftInitialWidth = leftColumn.properties.width;
            const rightInitialWidth = rightColumn.properties.width;

            const onMouseMove = (moveEvent: MouseEvent) => {
                const parentWidth = this.contentElement!.offsetWidth;
                if (parentWidth === 0) return;

                const deltaX = moveEvent.clientX - startX;
                const deltaPercentage = deltaX / parentWidth;

                let newLeftWidth = leftInitialWidth + deltaPercentage;
                let newRightWidth = rightInitialWidth - deltaPercentage;

                const minWidth = 0.1; // 10%
                if (newLeftWidth < minWidth || newRightWidth < minWidth) return;

                if (leftColumn.contentElement) leftColumn.contentElement.style.width = `${newLeftWidth * 100}%`;
                if (rightColumn.contentElement) rightColumn.contentElement.style.width = `${newRightWidth * 100}%`;
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

                leftColumn.properties.width = finalLeftWidth;
                rightColumn.properties.width = finalRightWidth;

                // 通过基类提供的 BAPI_PE 触发页面的历史记录与保存变更
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