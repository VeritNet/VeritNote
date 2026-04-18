// blocks/table/TableBlock.ts

// --- 内部块：TableCellBlock ---
// 每个单元格都是一个功能齐全的容器块
class TableCellBlock extends Block {
    static type = 'tableCell';
    static createWrapper = false;
    static canBeToggled = false; // 用户不能通过'/'命令直接创建单元格

    _renderContent() {
        // 防止重复添加 class 和 容器
        if (!this.contentElement.classList.contains('table-cell-content')) {
            this.contentElement.classList.add('table-cell-content');
            
            // Cell 内部有唯一的容器
            this.childrenContainer = document.createElement('div');
            this.childrenContainer.className = 'block-children-container';
            this.contentElement.appendChild(this.childrenContainer);
        }
    }

    // 单元格本身不可编辑，所以禁用默认事件
    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }
}


// --- 内部块：TableRowBlock ---
// 每一行都是一个包含多个单元格的块
class TableRowBlock extends Block {
    static type = 'tableRow';
    static createWrapper = false;
    static canBeToggled = false;

    _renderContent() {
        if (!this.contentElement.classList.contains('table-row-content')) {
            this.contentElement.classList.add('table-row-content');
        }
        // 行块本身作为容器，用于直接承载 TableCellBlock 子块
        this.childrenContainer = this.contentElement;
    }
}


// --- 主块：TableBlock ---
class TableBlock extends Block {
    static type = 'table';
    static icon = '▦';
    static label = 'Table';
    static description = 'Create a structured table.';
    static keywords = ['table', 'grid', 'data'];
    static canBeToggled = true;
    static previewExclusionSelectors = [
        '.table-controls-top',
        '.table-controls-left',
        '.table-add-col-btn',
        '.table-add-row-btn'
    ];
    static exportExclusionSelectors = [
        '.table-controls-top',
        '.table-controls-left',
        '.table-add-col-btn',
        '.table-add-row-btn'
    ];

    gridWrapper: HTMLElement;
    topControls: HTMLElement;
    leftControls: HTMLElement;

    constructor(data, editor) {
        super(data, editor);
        // 初始化属性
        this.properties.hasHeaderRow = data.properties?.hasHeaderRow || false;
        this.properties.colWidths = data.properties?.colWidths || [];
        this.properties.tableWidthScale = data.properties?.tableWidthScale || 1;

        // 如果是新表格，创建默认的 2x2 结构
        if (this.children.length === 0) {
            this.properties.colWidths = [0.5, 0.5];
            for (let i = 0; i < 2; i++) {
                const cells = [];
                for (let j = 0; j < 2; j++) {
                    cells.push({ type: 'tableCell', children: [] });
                }
                const row = this.BAPI_PE.createBlockInstance({ type: 'tableRow', children: cells });
                this.children.push(row);
            }
        }
    }

    static getPropertiesSchema() {
        return [
            // 修正属性定义以对齐最新的 UiTools 解析器
            {
                name: 'tableWidthScale',
                display: 'View Scale',
                type: 'num',
                placeholder: '(0.0, 1.0] (Default 1)',
                min: 0.1,
                max: 1.0,
                step: 0.1
            },
            // 继承父类属性
            ...super.getPropertiesSchema()
        ];
    }

    _renderContent() {
        let scale = parseFloat(this.properties.tableWidthScale);
        if (isNaN(scale) || scale <= 0 || scale > 1) scale = 1;
        const totalWidthStyle = scale === 1 ? '100%' : `${(1 / scale) * 100}%`;

        // 1. 初始化 DOM 骨架（生命周期内仅执行一次）
        if (!this.contentElement.querySelector('.table-scroll-wrapper')) {
            // 将顶部控制条包裹在 table-scroll-wrapper 内使其跟随滚动
            this.contentElement.innerHTML = `
                <div class="table-controls-left"></div>
                <div class="table-scroll-wrapper">
                    <div class="table-controls-top"></div>
                    <div class="table-grid-wrapper"></div>
                </div>
                <button class="table-add-col-btn" title="Add column">+</button>
                <button class="table-add-row-btn" title="Add row">+</button>
            `;

            this.gridWrapper = this.contentElement.querySelector('.table-grid-wrapper');
            this.topControls = this.contentElement.querySelector('.table-controls-top');
            this.leftControls = this.contentElement.querySelector('.table-controls-left');
            
            // 指示基类向该容器内插入子集 (TableRowBlocks)
            this.childrenContainer = this.gridWrapper;

            // 绑定添加按钮事件 (仅初次绑定)
            this.contentElement.querySelector('.table-add-col-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.addColumn();
            });
            this.contentElement.querySelector('.table-add-row-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.addRow();
            });
        }

        // 2. 动态更新样式与布局 (任何属性或细节面板交互都会触发此处更新)
        this.gridWrapper.style.minWidth = totalWidthStyle;
        this.topControls.style.minWidth = totalWidthStyle;

        // 确保相对滚动时 topControls 不发生样式错乱
        this.contentElement.style.paddingTop = '0px'; 
        this.topControls.style.position = 'relative';
        this.topControls.style.left = '0';
        this.topControls.style.right = 'auto';
        this.topControls.style.top = '0';

        const colCount = this.properties.colWidths.length;
        const gridTemplateColumns = this.properties.colWidths.map(w => `${w * 100}%`).join(' ');
        this.gridWrapper.style.gridTemplateColumns = gridTemplateColumns;
        this.topControls.style.gridTemplateColumns = gridTemplateColumns;

        // 3. 同步重绘交互控件 UI (行/列的增删与调整控制器)
        this.leftControls.innerHTML = '';
        this.children.forEach((row, rowIndex) => {
            const deleteBtnWrapper = document.createElement('div');
            deleteBtnWrapper.className = 'table-delete-row-btn-wrapper';

            const deleteRowBtn = document.createElement('button');
            deleteRowBtn.className = 'table-delete-row-btn';
            deleteRowBtn.innerHTML = '&#x2212;';
            deleteRowBtn.title = 'Delete row';
            deleteRowBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteRow(rowIndex);
            });

            deleteBtnWrapper.appendChild(deleteRowBtn);
            this.leftControls.appendChild(deleteBtnWrapper);
        });

        this.topControls.innerHTML = '';
        for (let i = 0; i < colCount; i++) {
            const colControl = document.createElement('div');
            colControl.className = 'table-col-control';

            const deleteColBtn = document.createElement('button');
            deleteColBtn.className = 'table-delete-col-btn';
            deleteColBtn.innerHTML = '&#x2212;';
            deleteColBtn.title = 'Delete column';
            deleteColBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteColumn(i);
            });
            colControl.appendChild(deleteColBtn);
            
            if (i < colCount - 1) {
                const resizer = document.createElement('div');
                resizer.className = 'table-col-resizer';
                resizer.addEventListener('mousedown', (e) => this.initResize(e, i));
                colControl.appendChild(resizer);
            }
            
            this.topControls.appendChild(colControl);
        }

        // 4. 计算对齐行高
        requestAnimationFrame(() => this._syncRowHeights());
    }

    _syncRowHeights() {
        if (!this.gridWrapper || !this.leftControls) return;
        const rowElements = Array.from(this.gridWrapper.children) as HTMLElement[]; 
        const deleteBtnWrappers = Array.from(this.leftControls.children) as HTMLElement[];

        rowElements.forEach((rowEl, index) => {
            const wrapper = deleteBtnWrappers[index];
            if (wrapper) {
                let maxHeight = 0;
                for (const cellEl of Array.from(rowEl.children)) {
                    maxHeight = Math.max(maxHeight, (cellEl as HTMLElement).offsetHeight);
                }
                wrapper.style.height = `${maxHeight}px`;
            }
        });
    }

    // --- 表格结构操作方法 ---

    addRow() {
        const colCount = this.properties.colWidths.length;
        const cells = [];
        for (let i = 0; i < colCount; i++) {
            cells.push({ type: 'tableCell', children: [] });
        }
        const newRow = this.BAPI_PE.createBlockInstance({ type: 'tableRow', children: cells });
        this.children.push(newRow);
        
        this._reRenderSelf(); // 结构变化较大，使用基类的自动重绘来触发完整的树清理与替换
        this.BAPI_PE.emitChange(true, 'add-table-row', this);
    }

    deleteRow(rowIndex) {
        if (this.children.length > 1) {
            this.children.splice(rowIndex, 1);
            this._reRenderSelf();
            this.BAPI_PE.emitChange(true, 'delete-table-row', this);
        }
    }

    addColumn() {
        // 重新平衡现有列宽
        const currentColCount = this.properties.colWidths.length;
        const newColCount = currentColCount + 1;
        const newWidth = 1 / newColCount;
        
        this.properties.colWidths = Array(newColCount).fill(newWidth);
         
        // 为每一行添加一个新单元格
        this.children.forEach(row => {
            const newCell = this.BAPI_PE.createBlockInstance({ type: 'tableCell', children: [] });
            row.children.push(newCell);
        });

        this._reRenderSelf();
        this.BAPI_PE.emitChange(true, 'add-table-column', this);
    }

    deleteColumn(colIndex) {
        const colCount = this.properties.colWidths.length;
        if (colCount > 1) {
            // 从每一行删除单元格
            this.children.forEach(row => {
                row.children.splice(colIndex, 1);
            });
             
            // 移除宽度并重新平衡
            this.properties.colWidths.splice(colIndex, 1);
            const newTotalWidth = 1;
            const remainingWidth = this.properties.colWidths.reduce((sum, w) => sum + w, 0);
            this.properties.colWidths = this.properties.colWidths.map(w => (w / remainingWidth) * newTotalWidth);

            this._reRenderSelf();
            this.BAPI_PE.emitChange(true, 'delete-table-column', this);
        }
    }

    // --- 列宽调整逻辑 ---

    initResize(e, colIndex) {
        e.preventDefault();
        const startX = e.clientX;
        const leftColInitialWidth = this.properties.colWidths[colIndex];
        const rightColInitialWidth = this.properties.colWidths[colIndex + 1];
        const tableWidth = this.gridWrapper.offsetWidth;

        const onMouseMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaPercentage = deltaX / tableWidth;

            let newLeftWidth = leftColInitialWidth + deltaPercentage;
            let newRightWidth = rightColInitialWidth - deltaPercentage;

            // 限制最小宽度
            const minWidth = 0.05;
            if (newLeftWidth < minWidth || newRightWidth < minWidth) return;

            // 实时更新 DOM 以提供视觉反馈
            this.properties.colWidths[colIndex] = newLeftWidth;
            this.properties.colWidths[colIndex + 1] = newRightWidth;
            
            const gridTemplateColumns = this.properties.colWidths.map(w => `${w * 100}%`).join(' ');
            this.gridWrapper.style.gridTemplateColumns = gridTemplateColumns;
            this.topControls.style.gridTemplateColumns = gridTemplateColumns;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            this.BAPI_PE.emitChange(true, 'resize-table-column', this);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}

window['registerBlock'](TableCellBlock);
window['registerBlock'](TableRowBlock);
window['registerBlock'](TableBlock);