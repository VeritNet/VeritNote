﻿// js/blocks/TableBlock.js

// --- 内部块：TableCellBlock ---
// 每个单元格都是一个功能齐全的容器块
class TableCellBlock extends ContainerBlock {
    static type = 'tableCell';
    static canBeToggled = false; // 用户不能通过'/'命令直接创建单元格

    render() {
        // 单元格不需要标准的 .block-container 包装或控件
        this.element = document.createElement('div');
        this.element.className = 'table-cell-content';
        this.element.dataset.id = this.id;

        // 关键：单元格内部必须有一个 children 容器
        this.childrenContainer = document.createElement('div');
        this.childrenContainer.className = 'block-children-container';
        this.element.appendChild(this.childrenContainer);
        
        // 渲染所有子块
        this._renderChildren();

        return this.element;
    }

    // 单元格本身不可编辑，所以禁用默认事件
    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }
}


// --- 内部块：TableRowBlock ---
// 每一行都是一个包含多个单元格的块
class TableRowBlock extends Block {
    static type = 'tableRow';
    static canBeToggled = false;

    render() {
        // 行也不需要标准的 .block-container 包装
        this.element = document.createElement('div');
        this.element.className = 'table-row-content';
        this.element.dataset.id = this.id;
        
        this.childrenContainer = this.element;
        this._renderChildren();

        return this.element;
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

    constructor(data, editor) {
        super(data, editor);
        this.isContainer = true;

        // 初始化属性
        this.properties.hasHeaderRow = data.properties?.hasHeaderRow || false;
        this.properties.colWidths = data.properties?.colWidths || [];

        // 如果是新表格，创建默认的 2x2 结构
        if (this.children.length === 0) {
            this.properties.colWidths = [0.5, 0.5];
            for (let i = 0; i < 2; i++) {
                const cells = [];
                for (let j = 0; j < 2; j++) {
                    cells.push({ type: 'tableCell', children: [] });
                }
                const row = this.editor.createBlockInstance({ type: 'tableRow', children: cells });
                this.children.push(row);
            }
        }
    }

    render() {
        this.element = this._createWrapperElement();
        this.contentElement = this._createContentElement();

        // 创建表格的滚动容器和内部网格
        this.contentElement.innerHTML = `
            <div class="table-controls-top"></div>
            <div class="table-controls-left"></div>
            <div class="table-scroll-wrapper">
                <div class="table-grid-wrapper"></div>
            </div>
            <button class="table-add-col-btn" title="Add column">+</button>
            <button class="table-add-row-btn" title="Add row">+</button>
        `;

        this.gridWrapper = this.contentElement.querySelector('.table-grid-wrapper');
        this.topControls = this.contentElement.querySelector('.table-controls-top');
        this.leftControls = this.contentElement.querySelector('.table-controls-left');
        
        // 设置网格布局
        const colCount = this.properties.colWidths.length;
        const gridTemplateColumns = this.properties.colWidths.map(w => `${w * 100}%`).join(' ');
        this.gridWrapper.style.gridTemplateColumns = gridTemplateColumns;
        this.topControls.style.gridTemplateColumns = gridTemplateColumns;

        // 渲染行和单元格
        this.children.forEach((row, rowIndex) => {
            // 渲染行本身
            const rowEl = row.render();
            this.gridWrapper.appendChild(rowEl);
            
            // 渲染左侧的行删除按钮
            // 为每个按钮创建一个包装器，以便控制其高度和布局
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

        // 渲染顶部的列删除按钮和调整器
        for (let i = 0; i < colCount; i++) {
            const colControl = document.createElement('div');
            colControl.className = 'table-col-control';

            const deleteColBtn = document.createElement('button');
            deleteColBtn.className = 'table-delete-col-btn';
            deleteColBtn.innerHTML = '&#x2212;'; // Minus sign
            deleteColBtn.title = 'Delete column';
            deleteColBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteColumn(i);
            });
            colControl.appendChild(deleteColBtn);
            
            // 添加列调整器 (除了最后一列)
            if (i < colCount - 1) {
                const resizer = document.createElement('div');
                resizer.className = 'table-col-resizer';
                resizer.addEventListener('mousedown', (e) => this.initResize(e, i));
                colControl.appendChild(resizer);
            }
            
            this.topControls.appendChild(colControl);
        }

        // 绑定添加行/列按钮事件
        this.contentElement.querySelector(':scope > .table-add-col-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.addColumn();
        });
        this.contentElement.querySelector(':scope > .table-add-row-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.addRow();
        });

        this.element.appendChild(this.contentElement);

        // 使用 requestAnimationFrame 确保在浏览器计算完布局后才获取行高
        requestAnimationFrame(() => {
        if (!this.gridWrapper || !this.leftControls) return;

        // rowElements 是 .table-row-content 元素
        const rowElements = Array.from(this.gridWrapper.children); 
        const deleteBtnWrappers = Array.from(this.leftControls.children);

        rowElements.forEach((rowEl, index) => {
            const wrapper = deleteBtnWrappers[index];
            if (wrapper) {
                // 【修复核心】
                // 因为 rowEl ( .table-row-content ) 的 display 是 contents，所以 offsetHeight 是 0。
                // 我们必须通过计算其子元素（单元格）的最大高度来确定行的实际高度。
                let maxHeight = 0;
                
                // 遍历当前行的所有单元格 (cell)
                for (const cellEl of rowEl.children) {
                    maxHeight = Math.max(maxHeight, cellEl.offsetHeight);
                }
                
                // 将按钮包装器的高度设置为该行最高的单元格的高度
                wrapper.style.height = `${maxHeight}px`;
            }
        });
    });

        return this.element;
    }

    // --- 表格操作方法 ---

    addRow() {
        const colCount = this.properties.colWidths.length;
        const cells = [];
        for (let i = 0; i < colCount; i++) {
            cells.push({ type: 'tableCell', children: [] });
        }
        const newRow = this.editor.createBlockInstance({ type: 'tableRow', children: cells });
        this.children.push(newRow);
        this.editor.render(); // 结构变化较大，完全重绘
        this.editor.emitChange(true, 'add-table-row', this);
    }

    deleteRow(rowIndex) {
        if (this.children.length > 1) {
            this.children.splice(rowIndex, 1);
            this.editor.render();
            this.editor.emitChange(true, 'delete-table-row', this);
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
            const newCell = this.editor.createBlockInstance({ type: 'tableCell', children: [] });
            row.children.push(newCell);
        });

        this.editor.render();
        this.editor.emitChange(true, 'add-table-column', this);
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

            this.editor.render();
            this.editor.emitChange(true, 'delete-table-column', this);
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

            // 限制最小宽度 (例如 5%)
            const minWidth = 0.05;
            if (newLeftWidth < minWidth || newRightWidth < minWidth) return;

            // 实时更新DOM以提供反馈
            this.properties.colWidths[colIndex] = newLeftWidth;
            this.properties.colWidths[colIndex + 1] = newRightWidth;
            
            const gridTemplateColumns = this.properties.colWidths.map(w => `${w * 100}%`).join(' ');
            this.gridWrapper.style.gridTemplateColumns = gridTemplateColumns;
            this.topControls.style.gridTemplateColumns = gridTemplateColumns;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            this.editor.emitChange(true, 'resize-table-column', this);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
}