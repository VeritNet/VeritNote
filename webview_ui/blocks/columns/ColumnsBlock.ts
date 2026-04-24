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
        if (!this.contentElement || this.children.length === 0) return;

        // 1. 仅提取真正的子列 DOM（精准匹配 data-type="column"）
        // 这样可以避开基类生成的 .block-controls 等 UI 元素，杜绝“虚空列”
        const childNodes = Array.from(this.contentElement.children).filter(
            el => el.getAttribute('data-type') === 'column'
        );

        if (childNodes.length === 0) return;

        // 2. 统一由父块属性管理分配宽度
        if (!this.properties.widths || this.properties.widths.length !== childNodes.length) {
            const defaultWidth = 1 / childNodes.length;
            this.properties.widths = childNodes.map(() => defaultWidth);
        }

        // 3. 清理旧的包装器和调整条（不要用 innerHTML = ''，以保护 block-controls）
        this.contentElement.querySelectorAll('.column-wrapper, .column-resizer').forEach(el => el.remove());

        const fragment = document.createDocumentFragment();
        const wrappers: HTMLElement[] = [];

        // 4. 为每个真实子节点创建 wrapper 包装器
        childNodes.forEach((node, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'column-wrapper';
            wrapper.style.width = `${this.properties.widths[index] * 100}%`;

            // appendChild 会自动将 node 从原父级移动到 wrapper 中
            wrapper.appendChild(node);
            wrappers.push(wrapper);
            fragment.appendChild(wrapper);

            if (index < childNodes.length - 1) {
                const resizer = this._createColumnResizer(index, wrappers);
                fragment.appendChild(resizer);
            }
        });

        // 5. 挂载搭建好的包装器结构（追加在尾部）
        this.contentElement.appendChild(fragment);
    }

    private _createColumnResizer(leftIndex: number, wrappers: HTMLElement[]): HTMLElement {
        const resizer = document.createElement('div');
        resizer.className = 'column-resizer';

        resizer.addEventListener('mousedown', (e: MouseEvent) => {
            e.preventDefault();
            if (!this.contentElement) return;

            const startX = e.clientX;
            // 访问父块自己维护的 widths 数组
            const leftInitialWidth = this.properties.widths[leftIndex];
            const rightInitialWidth = this.properties.widths[leftIndex + 1];
            // 获取我们自己创建的左右 Wrapper DOM
            const leftWrapper = wrappers[leftIndex];
            const rightWrapper = wrappers[leftIndex + 1];

            const onMouseMove = (moveEvent: MouseEvent) => {
                const parentWidth = this.contentElement!.offsetWidth;
                if (parentWidth === 0) return;

                const deltaX = moveEvent.clientX - startX;
                const deltaPercentage = deltaX / parentWidth;

                let newLeftWidth = leftInitialWidth + deltaPercentage;
                let newRightWidth = rightInitialWidth - deltaPercentage;

                const minWidth = 0.1; // 10%
                if (newLeftWidth < minWidth || newRightWidth < minWidth) return;

                // 调整 Wrapper 的样式
                leftWrapper.style.width = `${newLeftWidth * 100}%`;
                rightWrapper.style.width = `${newRightWidth * 100}%`;
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

                // 固化最新比例到父块 properties
                this.properties.widths[leftIndex] = finalLeftWidth;
                this.properties.widths[leftIndex + 1] = finalRightWidth;

                leftWrapper.style.width = `${finalLeftWidth * 100}%`;
                rightWrapper.style.width = `${finalRightWidth * 100}%`;

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