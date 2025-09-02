class Editor {
    constructor(containerElement) {
        this.container = containerElement;
        this.blocks = [];
        this.currentPagePath = null;
        this.commandMenu = document.getElementById('command-menu');
        this.draggedBlock = null; // 用于拖拽操作
        this.activeCommandBlockId = null;

        this.toolbar = document.getElementById('block-toolbar');
        this.activeToolbarBlockEl = null;
        this.toolbarHideTimeout = null;

        // 富文本编辑相关
        this.currentSelection = null;
        this.richTextEditingState = {
            isActive: false,
            blockId: null,
            savedRange: null
        };

        this.commands = [
            { type: 'paragraph', title: 'Paragraph', description: 'Text paragraph', keywords: ['text', 'paragraph', 'p', 'wenben', 'duanluo'] },
            { type: 'heading1', title: 'Heading 1', description: 'Large Page Header', keywords: ['h1', 'heading1', 'title', 'biaoti1'] },
            { type: 'heading2', title: 'Heading 2', description: 'Page Title', keywords: ['h2', 'heading2', 'subtitle', 'biaoti2'] },
            { type: 'image', title: 'Image', description: 'Upload or link an image', keywords: ['image', 'img', 'picture', 'tupian'] },
            { type: 'linkButton', title: 'Button', description: 'A prominent link button', keywords: ['button', 'link', 'btn', 'anniu'] },
            { type: 'callout', title: 'Callout', description: 'Container with background and an icon', keywords: ['callout', 'info', 'tip', 'biaozhu'] }
        ];

        this._initListeners();
    }

    load(pageData) {
        this.currentPagePath = pageData.path;
        this.blocks = pageData.content || [];
        this.render();
    }

    getBlocksForSaving() {
        // 确保所有contenteditable的内容都已同步到JS对象中
        this._syncAllBlocksFromDOM();
        return this.blocks;
    }

    // --- 渲染 ---
    render() {
        this.container.innerHTML = '';
        this.blocks.forEach(block => {
            const blockEl = this._createBlockElement(block);
            this.container.appendChild(blockEl);
        });
    }

    _createBlockElement(block) {
        const isStructural = ['columns', 'column'].includes(block.type);

        const element = document.createElement('div');

        if (isStructural) {
            element.className = `block-content block-structural`;
        } else {
            element.className = 'block-container';
            element.draggable = true;
            // 直接在这里创建所有控件
            element.innerHTML = `
                <div class="block-controls">
                    <span class="drag-handle" title="拖拽移动">⠿</span>
                    <span class="delete-btn" title="删除">🗑️</span>
                </div>
            `;
        }
    
        element.dataset.id = block.id;

        const content = isStructural ? element : document.createElement('div');
        if (!isStructural) {
            element.appendChild(content);
        }
        content.className = 'block-content';
        content.dataset.id = block.id;
        content.dataset.type = block.type;

        // --- 渲染逻辑 ---
        if (block.type === 'callout') {
            content.innerHTML = `<div class="callout-icon">💡</div><div class="callout-content-wrapper"></div>`;
        } else if (block.type === 'columns') {
            // columns 块的子元素是 column 块
        } else if (block.type === 'column') {
            content.style.width = `${block.properties.width * 100}%`;
        } else { // 默认可编辑块
            content.contentEditable = 'true';
            content.innerHTML = block.content || '';
            const placeholders = {
                paragraph: "Enter ‘/’ to invoke commands...",
                heading1: "Heading 1",
                heading2: "Heading 2",
            };
            if (placeholders[block.type]) {
                content.dataset.placeholder = placeholders[block.type];
            }
        }
        
        if (!isStructural) {
            element.appendChild(content);
        }
        if (!isStructural) {
            this._populateToolbar(element); 
        }

        // --- 递归渲染子 Block ---
        let childrenContainer;
        if (block.type === 'callout') {
            childrenContainer = content.querySelector('.callout-content-wrapper');
        } else if (['columns', 'column'].includes(block.type)) {
            childrenContainer = content;
        } else {
            childrenContainer = document.createElement('div');
            childrenContainer.className = 'block-children';
            element.appendChild(childrenContainer);
        }

        if (block.children && block.children.length > 0) {
            block.children.forEach((childBlock, index) => {
                if (block.type === 'columns' && index > 0) {
                    const resizer = this._createColumnResizer(block.children[index - 1], childBlock);
                    childrenContainer.appendChild(resizer);
                }
                childrenContainer.appendChild(this._createBlockElement(childBlock));
            });
        }

        return element;
    }

    _createColumnResizer(leftColumn, rightColumn) {
        const resizer = document.createElement('div');
        resizer.className = 'column-resizer';
    
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const leftInitialWidth = leftColumn.properties.width;
            const rightInitialWidth = rightColumn.properties.width;

            // 获取左右两列的 DOM 元素
            const leftEl = resizer.previousElementSibling;
            const rightEl = resizer.nextElementSibling;
        
            const onMouseMove = (moveEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const parentWidth = resizer.parentElement.offsetWidth;
            if (parentWidth === 0) return; // 防止除以零
            
                const deltaPercentage = deltaX / parentWidth;
            
                let newLeftWidth = leftInitialWidth + deltaPercentage;
                let newRightWidth = rightInitialWidth - deltaPercentage;

                // 限制最小宽度，比如 10%
                if (newLeftWidth < 0.1 || newRightWidth < 0.1) return;

                // 直接更新 DOM style 提供实时预览，而不是全量 render
                leftEl.style.width = `${newLeftWidth * 100}%`;
                rightEl.style.width = `${newRightWidth * 100}%`;
            };

            const onMouseUp = (upEvent) => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);

                // 只在松开鼠标时更新数据模型
                const deltaX = upEvent.clientX - startX;
                const parentWidth = resizer.parentElement.offsetWidth;
                const deltaPercentage = deltaX / parentWidth;

                let finalLeftWidth = leftInitialWidth + deltaPercentage;
                let finalRightWidth = rightInitialWidth - deltaPercentage;

                // 再次检查约束
                if(finalLeftWidth < 0.1) {
                    finalRightWidth += finalLeftWidth - 0.1;
                    finalLeftWidth = 0.1;
                }
                if(finalRightWidth < 0.1) {
                    finalLeftWidth += finalRightWidth - 0.1;
                    finalRightWidth = 0.1;
                }
            
                leftColumn.properties.width = finalLeftWidth;
                rightColumn.properties.width = finalRightWidth;
            
                window.dispatchEvent(new CustomEvent('editor:change')); // 触发保存
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    
        return resizer;
    }

    _cleanupData() {
        const traverse = (blocks, parent) => {
            for (let i = blocks.length - 1; i >= 0; i--) {
                const block = blocks[i];
            
                // 递归清理子元素
                if (block.children) {
                    traverse(block.children, block);
                }

                // 规则 1: 如果 column 为空，删除它
                if (block.type === 'column' && (!block.children || block.children.length === 0)) {
                    blocks.splice(i, 1);
                    continue; // 继续循环，因为当前块已被删除
                }

                // 规则 2: 如果 columns 容器子元素 <= 1，解散它
                if (block.type === 'columns') {
                    if (!block.children || block.children.length === 0) {
                        // 如果完全为空，直接删除
                        blocks.splice(i, 1);
                    } else if (block.children.length === 1) {
                        // 如果只剩一个 column，用它的内容替换掉 columns 容器
                        const survivingBlocks = block.children[0].children || [];
                        blocks.splice(i, 1, ...survivingBlocks);
                    } else {
                        // 如果有多个 column，重新分配宽度
                        const numCols = block.children.length;
                        block.children.forEach(col => col.properties.width = 1 / numCols);
                    }
                }
            }
        };
        traverse(this.blocks, null);
    }

    _onBackgroundClick(e) {
        // 找到被点击的、最内层的容器元素
        let targetContainer = e.target.closest('.block-content[data-type="callout"], .block-content[data-type="column"]');

        if (targetContainer) {
            // 确保点击在容器的空白处，而不是它的子块上
            const contentWrapper = targetContainer.querySelector('.callout-content-wrapper > .callout-content-wrapper') || targetContainer;
            if (e.target !== contentWrapper) return;
        
            const containerId = targetContainer.dataset.id;
            const { block: containerBlock } = this._findBlockById(this.blocks, containerId);

            if (containerBlock) {
                if (!containerBlock.children) containerBlock.children = [];
                const newBlock = { id: this._generateUUID(), type: 'paragraph', content: '' };
                containerBlock.children.push(newBlock); // 在容器末尾添加子块
                this.render();
                this.focusNewBlock(newBlock.id);
            }
        } else if (e.target === this.container) {
            // 点击的是最外层的画布
            const newBlock = { id: this._generateUUID(), type: 'paragraph', content: '' };
            this.blocks.push(newBlock); // 添加到顶层
            this.render();
            this.focusNewBlock(newBlock.id);
        }
    }
    focusNewBlock(blockId) {
        setTimeout(() => {
            const newBlockEl = this.container.querySelector(`.block-content[data-id="${blockId}"]`);
            if (newBlockEl) this.focusBlock(newBlockEl);
        }, 0);
    }

    
    // --- 事件监听 ---
    _initListeners() {
        // 使用事件委托来处理所有 block 的输入
        this.container.addEventListener('input', this._onBlockInput.bind(this));
        this.container.addEventListener('keydown', this._onBlockKeyDown.bind(this));
        this.container.addEventListener('click', this._onBlockClick.bind(this));
        
        // 拖拽事件
        this.container.addEventListener('dragstart', this._onDragStart.bind(this));
        this.container.addEventListener('dragover', this._onDragOver.bind(this));
        this.container.addEventListener('dragleave', this._onDragLeave.bind(this));
        this.container.addEventListener('drop', this._onDrop.bind(this));
        
        // 命令菜单
        this.commandMenu.addEventListener('click', this._onCommandMenuClick.bind(this));

        // 监听编辑器背景的点击事件
        this.container.addEventListener('click', this._onBackgroundClick.bind(this));

        // 使用事件委托来处理所有工具栏的交互
        this.container.addEventListener('mouseover', this._onBlockMouseOver.bind(this));
        this.container.addEventListener('mouseout', this._onBlockMouseOut.bind(this));
        this.toolbar.addEventListener('mouseover', () => clearTimeout(this.toolbarHideTimeout));
        this.toolbar.addEventListener('mouseout', this._onBlockMouseOut.bind(this));

        // 监听选区变化，为富文本编辑做准备
        document.addEventListener('selectionchange', this._onSelectionChange.bind(this));

        window.addEventListener('popoverClosed', () => {
            this.richTextEditingState.isActive = false;
        });
    }

    _onBlockInput(e) {
        if (!e.target.classList.contains('block-content')) return;

        const blockContentEl = e.target;
        const content = blockContentEl.textContent; // 使用 textContent 获取纯文本

        // 处理命令菜单的实时搜索
        if (content.startsWith('/')) {
            const searchTerm = content.substring(1);
            const rect = blockContentEl.getBoundingClientRect();
            this._showCommandMenu(rect.left, rect.bottom);
            this._updateCommandMenu(searchTerm);
        } else {
            this._hideCommandMenu();
        }

        const blockId = e.target.dataset.id;
        const newContent = e.target.innerHTML;
        const blockData = this._findBlockById(this.blocks, blockId);
        
        if (blockData) {
            blockData.block.content = newContent;
            // 简单的自动保存触发器（可优化为防抖函数）
            window.dispatchEvent(new CustomEvent('editor:change'));
        }
    }

    _onBlockKeyDown(e) {
        if (!e.target.classList.contains('block-content')) return;
        
        const blockEl = e.target.closest('.block-container');
        const blockContentEl = e.target;
        const blockId = blockEl.dataset.id;

        // 回车: 创建新 Block
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
        
            const { block, parent, index } = this._findBlockById(this.blocks, blockId);
            const parentInfo = this._findBlockById(this.blocks, parent[index].id);
            const parentOfBlock = parentInfo ? this._findBlockById(this.blocks, parentInfo.parent[parentInfo.index].id) : null;

            const newBlock = { id: this._generateUUID(), type: 'paragraph', content: '' };
        
            // 如果在一个容器块内（如 callout 或 column），则在容器内创建子块
            if ((block.type !== 'paragraph' || block.content !== '') && (parent.type === 'callout' || parent.type === 'column')) {
                parent.children.splice(index + 1, 0, newBlock);
            } else {
                // 否则，在同级创建
                parent.splice(index + 1, 0, newBlock);
            }
        
            this.render();
            // 聚焦
            setTimeout(() => {
                const newBlockEl = this.container.querySelector(`[data-id="${newBlock.id}"] .block-content`);
                if (newBlockEl) this.focusBlock(newBlockEl);
            }, 0);
        }

        // 退格: 删除空 Block
        if (e.key === 'Backspace' && e.target.innerHTML === '') {
            e.preventDefault();
            this._deleteBlock(blockId);
            this.render();
            // 这里可以添加逻辑来聚焦到前一个block
        }
        
        // "/" 命令
        if (e.key === '/') {
            this.activeCommandBlockId = e.target.closest('.block-container').dataset.id;
            // 延迟一点显示，等待'/'字符进入DOM
            setTimeout(() => {
                const blockContentEl = this.container.querySelector(`.block-content[data-id="${this.activeCommandBlockId}"]`);
                if (blockContentEl && blockContentEl.textContent.startsWith('/')) {
                    const rect = blockContentEl.getBoundingClientRect();
                    this._showCommandMenu(rect.left, rect.bottom);
                    this._updateCommandMenu(blockContentEl.textContent.substring(1));
                }
            }, 0);
        } else if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter') {
            // 避免在用箭头或回车选择命令时关闭菜单
            this._hideCommandMenu();
        }
    }

    _updateCommandMenu(searchTerm) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
    
        const filteredCommands = this.commands.filter(cmd => {
            return cmd.title.toLowerCase().includes(lowerCaseSearchTerm) ||
                   cmd.keywords.some(keyword => keyword.startsWith(lowerCaseSearchTerm));
        });

        if (filteredCommands.length === 0) {
            this._hideCommandMenu();
            return;
        }

        this.commandMenu.innerHTML = filteredCommands.map(cmd => `
            <div class="command-item" data-type="${cmd.type}">
                <strong>${cmd.title}</strong>
                <small>${cmd.description}</small>
            </div>
        `).join('');
    }

    _onBlockClick(e) {
        if (e.target.classList.contains('delete-btn')) {
            const blockId = e.target.closest('.block-container').dataset.id;
            this._deleteBlock(blockId);
            this.render();
        }
    }
    
    // --- 拖拽逻辑 ---
    _onDragStart(e) {
        if (e.target.classList.contains('block-container')) {
            this.draggedBlock = e.target;
            e.dataTransfer.setData('text/plain', e.target.dataset.id);
            setTimeout(() => e.target.style.opacity = '0.5', 0); // 视觉反馈
        }
    }

    _onDragOver(e) {
        e.preventDefault();
        this._cleanupDragIndicators(); // 清理旧指示器
    
        // 移除旧的高亮
        this.container.querySelectorAll('.is-hover-parent').forEach(el => el.classList.remove('is-hover-parent'));

        let targetEl = e.target.closest('.block-container');
        if (!targetEl || targetEl === this.draggedBlock) return;

        // 高亮当前悬停的块的父容器
        const parentContainer = targetEl.parentElement.closest('.block-container');
        if (parentContainer) {
            parentContainer.classList.add('is-hover-parent');
        }

        const rect = targetEl.getBoundingClientRect();
        const targetType = targetEl.querySelector('.block-content')?.dataset.type;
        const canHaveChildren = ['callout', 'column'].includes(targetType);

        // 判断鼠标是否在“容器底部留白”区域
        const paddingBottom = 24; // 与 CSS 中的值一致
        const isInBottomPadding = canHaveChildren && (e.clientY > rect.bottom - paddingBottom);

        if (isInBottomPadding) {
            // 在容器末尾插入（作为最后一个子元素）
            this._showHorizontalIndicator(targetEl, 'inside_last');
            this.currentDropInfo = { targetId: targetEl.dataset.id, position: 'inside_last' };
        } else {
            // 原有的逻辑
            const yMidpoint = rect.top + rect.height / 2;
            const xZone = rect.width * 0.15;

            const dropInfo = { targetId: targetEl.dataset.id, position: 'after' };

            if (e.clientX < rect.left + xZone) {
                this._showVerticalIndicator(targetEl, 'left');
                dropInfo.position = 'left';
            } else if (e.clientX > rect.right - xZone) {
                this._showVerticalIndicator(targetEl, 'right');
                dropInfo.position = 'right';
            } else {
                const positionV = (e.clientY < yMidpoint) ? 'before' : 'after';
                this._showHorizontalIndicator(targetEl, positionV);
                dropInfo.position = positionV;
            }
            this.currentDropInfo = dropInfo;
        }
    }
    
    _onDragLeave(e) {
         // 可在此处添加逻辑，如果鼠标移出整个编辑器区域，则移除指示器
    }

    _onDrop(e) {
        e.preventDefault();
        this._cleanupDragIndicators();
        if (this.draggedBlock) this.draggedBlock.style.opacity = '1';

        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || !this.currentDropInfo) return;

        const { targetId, position } = this.currentDropInfo;
        if (draggedId === targetId) return;

        // 1. 从原位置移除被拖拽的块
        const { block: draggedBlockData, parent: fromParent, index: fromIndex } = this._findBlockById(this.blocks, draggedId);
        if (!draggedBlockData) return;
        fromParent.splice(fromIndex, 1);
    
        // 2. 找到目标块
        const targetInfo = this._findBlockById(this.blocks, targetId);
        if (!targetInfo) {
            fromParent.splice(fromIndex, 0, draggedBlockData); // 失败则放回
            return;
        }
        const { block: targetBlockData, parent: toParent, index: toIndex } = targetInfo;

        // 3. 根据 position 执行操作
        switch (position) {
            case 'left':
            case 'right':
                // 只要是左右，就无条件调用列处理函数
                this._handleColumnDrop(draggedBlockData, targetBlockData, toParent, toIndex, position);
                break;
            case 'before':
                toParent.splice(toIndex, 0, draggedBlockData);
                break;
            case 'after':
                toParent.splice(toIndex + 1, 0, draggedBlockData);
                break;
            case 'inside_last':
                if (!targetBlockData.children) targetBlockData.children = [];
                targetBlockData.children.push(draggedBlockData);
                break;
        }

        // 4. 清理、渲染、保存
        this.container.querySelectorAll('.is-hover-parent').forEach(el => el.classList.remove('is-hover-parent'));
        this.draggedBlock = null;
        this.currentDropInfo = null;
        this._cleanupData();
        this.render();
        window.dispatchEvent(new CustomEvent('editor:change'));
    }

    // --- 拖拽辅助函数 ---
    _cleanupDragIndicators() {
        this.container.querySelectorAll('.drop-indicator, .drop-indicator-vertical').forEach(el => el.remove());
        this.container.querySelectorAll('.drag-over-inside, .is-hover-parent').forEach(el => el.classList.remove('is-hover-parent', 'drag-over-inside'));
    }

    _showHorizontalIndicator(targetEl, position) {
        const parentContainer = targetEl.closest('.block-content[data-type="column"], .callout-content-wrapper > .callout-content-wrapper, #editor');
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';

        const containerRect = parentContainer.getBoundingClientRect();
        // 目标块的直接父级（通常是.block-children或.block-content）
        const immediateParentEl = (position === 'inside_last') ? targetEl.querySelector('.block-content') : targetEl.parentElement;
        const immediateParentRect = immediateParentEl.getBoundingClientRect();
    
        // 计算相对偏移
        const leftOffset = containerRect.left - immediateParentRect.left;

        indicator.style.width = `${containerRect.width}px`;
        indicator.style.left = `${leftOffset}px`;
    
        if (position === 'before') {
            targetEl.parentElement.insertBefore(indicator, targetEl);
        } else if (position === 'after') {
            targetEl.parentElement.insertBefore(indicator, targetEl.nextSibling);
        } else if (position === 'inside_last') {
            const contentWrapper = targetEl.querySelector('.callout-content-wrapper > .callout-content-wrapper, .block-content');
            if (contentWrapper) {
                contentWrapper.appendChild(indicator);
            }
        }
    }

    _showVerticalIndicator(targetEl, position) {
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator-vertical';
        // 高度应该和目标块一致
        indicator.style.height = `${targetEl.offsetHeight}px`;
    
        if (position === 'left') {
            indicator.style.left = '0';
        } else {
            indicator.style.right = '0';
        }
        targetEl.appendChild(indicator);
    }

    // 处理列布局拖拽的逻辑
    _handleColumnDrop(draggedBlock, targetBlock, parentOfTargetList, targetIndexInParentList, position) {
        // 找到目标块的父级容器 (可能是 column, callout, 或 null 代表顶层)
        const targetInfo = this._findBlockById(this.blocks, targetBlock.id);
        const parentOfTargetBlock = targetInfo.parentBlock;

        // 场景 A: 目标块的直接父级已经是 columns 容器。
        // 在现有的列之间“插入”一个新列。
        if (parentOfTargetBlock && parentOfTargetBlock.type === 'columns') {
        
            // 找到目标块所在的 column 的索引
            const targetColumnIndex = parentOfTargetBlock.children.findIndex(col => col.id === targetInfo.parent.id);

            // 创建一个包含被拖拽块的新列
            const newColumn = { id: this._generateUUID(), type: 'column', properties: { width: 0.5 }, children: [draggedBlock] };
        
            // 决定插入新列的位置
            const insertIndex = (position === 'left') ? targetColumnIndex : targetColumnIndex + 1;
            parentOfTargetBlock.children.splice(insertIndex, 0, newColumn);
        
            // 重新分配所有列的宽度
            const numCols = parentOfTargetBlock.children.length;
            parentOfTargetBlock.children.forEach(col => col.properties.width = 1 / numCols);
        } 
        // 场景 B: 其他所有情况。
        // 包括两个普通块合并、在一个 column 内部创建嵌套列、在 callout 内部创建列等。
        // 逻辑都是一样的：用一个新的 columns 容器替换掉原来的 targetBlock。
        else {
            const newColumnsContainer = {
                id: this._generateUUID(),
                type: 'columns',
                children: []
            };
            const col1 = { id: this._generateUUID(), type: 'column', properties: { width: 0.5 }, children: [] };
            const col2 = { id: this._generateUUID(), type: 'column', properties: { width: 0.5 }, children: [] };

            if (position === 'left') {
                col1.children.push(draggedBlock);
                col2.children.push(targetBlock);
            } else {
                col1.children.push(targetBlock);
                col2.children.push(draggedBlock);
            }
            newColumnsContainer.children.push(col1, col2);
        
            // 在父级列表中，用新的列容器替换掉原来的目标块
            parentOfTargetList.splice(targetIndexInParentList, 1, newColumnsContainer);
        }
    }


    // --- 命令菜单 ---
    _showCommandMenu(x, y) {
        this.commandMenu.style.left = `${x}px`;
        this.commandMenu.style.top = `${y}px`;
        this.commandMenu.style.display = 'block';
    }

    _hideCommandMenu() {
        if (this.commandMenu.style.display === 'block') {
            this.commandMenu.style.display = 'none';
            this.activeCommandBlockId = null; // 重置状态
        }
    }

    _updateBlockContent(block) {
        switch (block.type) {
            case 'image':
                block.content = `<div class="image-placeholder">点击🖼️添加图片</div>`;
                break;
            case 'linkButton':
                block.properties = { url: '' };
                block.content = `<a href="#">编辑按钮</a>`;
                break;
            case 'callout':
                block.content = ''; // 内容由子块提供
                block.children = [{ id: this._generateUUID(), type: 'paragraph', content: '' }]; // 默认带一个段落
                break;
        }
    }

    _onCommandMenuClick(e) {
        e.preventDefault(); // 阻止点击菜单时编辑器失去焦点
        const item = e.target.closest('.command-item');
        if (!item) return;
    
        const type = item.dataset.type;
        const activeId = this.activeCommandBlockId; 
    
        if (activeId) {
           const { block: blockData, parent, index } = this._findBlockById(this.blocks, activeId);
        
            if (blockData) {
                // 检查当前块的内容是否只是一个'/'，或者为空
                // 先从DOM同步一下最新的内容
                const blockContentEl = this.container.querySelector(`.block-content[data-id="${activeId}"]`);
                const currentContent = blockContentEl ? blockContentEl.innerHTML.trim() : blockData.content;

                if (currentContent === '/' || currentContent === '') {
                    // 如果是空的，就替换当前块
                   blockData.type = type;
                    blockData.content = ''; 
                    this._updateBlockContent(blockData);
                    this.render(); // 重新渲染
                
                   // 聚焦到修改后的块
                   setTimeout(() => {
                        const newBlockEl = this.container.querySelector(`[data-id="${activeId}"] .block-content`);
                        if(newBlockEl) this.focusBlock(newBlockEl);
                    }, 0);

                } else {
                    // 如果有内容，就在后面插入新块
                    const newBlock = { id: this._generateUUID(), type: type, content: '' };
                    this._updateBlockContent(newBlock);
                    parent.splice(index + 1, 0, newBlock); // 直接在数据层面操作
                    this.render(); // 重新渲染

                    // 聚焦到新创建的块
                    setTimeout(() => {
                        const newBlockEl = this.container.querySelector(`[data-id="${newBlock.id}"] .block-content`);
                        if(newBlockEl) this.focusBlock(newBlockEl);
                    }, 0);
                }
                window.dispatchEvent(new CustomEvent('editor:change'));
            }
        }
        this._hideCommandMenu();
    }


    // --- 数据操作辅助函数 ---
    _findBlockById(blocks, id, parentBlock = null) {
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            if (block.id === id) {
                return { block, parent: parentBlock ? parentBlock.children : this.blocks, index: i, parentBlock };
            }
            if (block.children) {
                const found = this._findBlockById(block.children, id, block);
                if (found) return found;
            }
        }
        return null;
    }
    
    _insertBlockAfter(targetId, newBlock) {
        const { parent, index } = this._findBlockById(this.blocks, targetId);
        if (parent) {
            parent.splice(index + 1, 0, newBlock);
            window.dispatchEvent(new CustomEvent('editor:change'));
        }
    }
    
    _deleteBlock(id) {
        const { parent, index } = this._findBlockById(this.blocks, id);
        if (parent) {
            parent.splice(index, 1);
            this._cleanupData();
            window.dispatchEvent(new CustomEvent('editor:change'));
        }
    }

    // 工具栏
    _onBlockMouseOver(e) {
        const targetEl = e.target.closest('.block-container');
        // 如果目标有效，并且不是当前已经显示工具栏的块
        if (targetEl && targetEl !== this.activeToolbarBlockEl) {
            // 清除可能存在的隐藏计时器
            clearTimeout(this.toolbarHideTimeout);
            // 显示工具栏
            this._showBlockToolbar(targetEl);
        }
    }

    /**
     * 当鼠标移出块或工具栏时触发。
     * 负责启动隐藏工具栏的计时器，提供一个“豁免区”。
     */
    _onBlockMouseOut(e) {
        // 清除任何之前的隐藏计时器
        clearTimeout(this.toolbarHideTimeout);
        // 设置一个新的计时器，延迟隐藏
        this.toolbarHideTimeout = setTimeout(() => {
            // 在执行隐藏之前，再次检查鼠标是否真的离开了交互区域
            if (!this.toolbar.matches(':hover') && !this.container.querySelector('.block-container:hover')) {
                this._hideBlockToolbar();
            }
        }, 300); // 300毫秒的延迟，足够鼠标从块移动到工具栏
    }

    /**
     * 显示并正确定位工具栏的核心函数。
     * 它会计算块的位置，并确保工具栏不会超出编辑器边界。
     */
    _showBlockToolbar(blockEl) {
        if (this.activeToolbarBlockEl) {
            this.activeToolbarBlockEl.classList.remove('toolbar-active');
        }

        this.activeToolbarBlockEl = blockEl;
        this.activeToolbarBlockEl.classList.add('toolbar-active');
        const blockRect = blockEl.getBoundingClientRect();       // 块的视口位置
        const editorRect = this.container.getBoundingClientRect(); // 编辑器视口位置

        // 动态填充工具栏的按钮
        this._populateToolbar(blockEl);

        // 使用 requestAnimationFrame 确保在下一帧渲染时获取尺寸，
        // 此时工具栏内容已经填充完毕，尺寸是准确的。
        requestAnimationFrame(() => {
            const toolbarHeight = this.toolbar.offsetHeight;
            const toolbarWidth = this.toolbar.offsetWidth;

            // --- Top 位置计算 ---
            let top = blockRect.top - toolbarHeight - 5; // 尝试显示在上方，留 5px 间距
            
            // 如果上方空间不足，则显示在下方
            if (top < editorRect.top) {
                top = blockRect.bottom + 5;
            }

            // --- Left 位置计算 ---
            let left = blockRect.left + (blockRect.width / 2) - (toolbarWidth / 2); // 尝试居中对齐

            // --- 边界检查 ---
            // 防止工具栏超出编辑器左边界
            if (left < editorRect.left) {
                left = editorRect.left;
            }
            // 防止工具栏超出编辑器右边界
            if (left + toolbarWidth > editorRect.right) {
                left = editorRect.right - toolbarWidth;
            }
            
            // 应用最终计算出的位置
            this.toolbar.style.top = `${top}px`;
            this.toolbar.style.left = `${left}px`;
            this.toolbar.style.display = 'flex';
        });
    }

    /**
     * 隐藏工具栏并重置状态。
     */
    _hideBlockToolbar() {
        this.toolbar.style.display = 'none';
        // 当工具栏隐藏时，移除 active class
        if (this.activeToolbarBlockEl) {
            this.activeToolbarBlockEl.classList.remove('toolbar-active');
        }
        this.activeToolbarBlockEl = null;
    }

    _populateToolbar(blockEl) {
        const blockContentEl = blockEl.querySelector('.block-content');
        const type = blockContentEl.dataset.type;
        this.toolbar.innerHTML = '';

        // 这个 buttons 对象定义必须在这里！
        const buttons = {
            // 文本块的按钮
            text: [
                { icon: '𝐁', title: 'Bold', action: 'format', arg: 'bold' },
                { icon: '𝘐', title: 'Italic', action: 'format', arg: 'italic' },
                { icon: 'U̲', title: 'Underlined', action: 'format', arg: 'underline' },
                { icon: 'S̶', title: 'StrikeThrough', action: 'format', arg: 'strikeThrough' },
                { icon: '🎨', title: 'Color', action: 'colorPicker' },
                { icon: '🔗', title: 'Link', action: 'link' },
            ],
            // 链接按钮的按钮
            linkButton: [
                { icon: '🔗', title: 'Edit Link', action: 'editLinkButton' }
            ],
            // 图片块的按钮
            image: [
                { icon: '🖼️', title: 'Set Image', action: 'editImage' },
                { icon: '🔗', title: 'Set link', action: 'linkImage' }
            ]
        };

        let targetButtons = [];
        if (['paragraph', 'heading1', 'heading2'].includes(type)) {
            targetButtons = buttons.text;
        } else if (buttons[type]) {
            targetButtons = buttons[type];
        }

        targetButtons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.className = 'toolbar-button';
            button.innerHTML = btnInfo.icon;
            button.title = btnInfo.title; // 为按钮添加 title 提示
            button.dataset.action = btnInfo.action;
            if (btnInfo.arg) {
                button.dataset.arg = btnInfo.arg;
            }
            button.addEventListener('mousedown', e => {
                e.preventDefault();
                this._handleToolbarClick(e, blockEl); // 把 blockEl 传过去
            });
            this.toolbar.appendChild(button);
        });
    }

    // --- 富文本编辑 ---
    _onSelectionChange() {
        const selection = document.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            // 只在选区的起点位于编辑器内部时，才保存它
            if (this.container.contains(range.startContainer)) {
                this.currentSelection = range;
            }
        }
    }

    _restoreSelection() {
        if (this.currentSelection) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(this.currentSelection);
        }
    }

    _formatText(command, value = null) {
        this.activeToolbarBlockEl.querySelector('.block-content').focus();
        this._restoreSelection();
        document.execCommand(command, false, value);
        this._syncActiveBlockFromDOM(); // 保存更改
    }
    
    _syncActiveBlockFromDOM(idToSync = null) {
        const targetId = idToSync || (this.activeToolbarBlockEl ? this.activeToolbarBlockEl.querySelector('.block-content').dataset.id : null);
        if (!targetId) return;

        const contentEl = this.container.querySelector(`.block-content[data-id="${targetId}"]`);
        if (!contentEl) return;

        const blockData = this._findBlockById(this.blocks, targetId);
        if(blockData) {
            blockData.block.content = contentEl.innerHTML;
            window.dispatchEvent(new CustomEvent('editor:change'));
        }
    }


    // --- 工具栏点击处理器 ---
    _handleToolbarClick(e) {
        const button = e.currentTarget;
        const action = button.dataset.action;
        const arg = button.dataset.arg;
        const blockId = this.activeToolbarBlockEl.dataset.id;

        // 一个原子化的、强制恢复并执行的函数
        const forceRestoreAndExecute = (cmd, value = null) => {
            if (!this.richTextEditingState.isActive) return;

            const { blockId, savedRange } = this.richTextEditingState;
            const targetContentEl = this.container.querySelector(`.block-content[data-id="${blockId}"]`);

            if (!targetContentEl || !savedRange) {
                this.richTextEditingState.isActive = false; // 出错则重置状态
                return;
            }

            // 1. 强制聚焦
            targetContentEl.focus();

            // 2. 强制恢复选区
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedRange);

            // 3. 执行命令
            document.execCommand(cmd, false, value);

            // 4. 同步数据
            this._syncActiveBlockFromDOM(blockId);
        
            // 5. 退出编辑状态
            this.richTextEditingState.isActive = false;
        };

        switch (action) {
            case 'format':
                // 对于直接操作，依然可以快速执行，但要确保有选区
                if (this.currentSelection) {
                    const contentEl = this.activeToolbarBlockEl.querySelector('.block-content');
                    contentEl.focus();
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(this.currentSelection);
                    document.execCommand(arg, false, null);
                    this._syncActiveBlockFromDOM(blockId);
                }
                break;
            
            case 'colorPicker':
                // 进入编辑状态
                this.richTextEditingState = {
                    isActive: true,
                    blockId: blockId,
                    savedRange: this.currentSelection
                };
                window.dispatchEvent(new CustomEvent('showColorPicker', { detail: { 
                    targetElement: button,
                    callback: (color) => {
                        document.execCommand('styleWithCSS', false, true);
                        forceRestoreAndExecute('foreColor', color);
                        document.execCommand('styleWithCSS', false, false);
                    }
                }}));
                break;

            case 'link':
                // 进入编辑状态
                this.richTextEditingState = {
                    isActive: true,
                    blockId: blockId,
                    savedRange: this.currentSelection
                };
                window.dispatchEvent(new CustomEvent('showLinkPopover', { detail: {
                    targetElement: button,
                    // 从选区中获取已存在的链接作为初始值
                    existingValue: this.currentSelection ? this.currentSelection.commonAncestorContainer.parentNode.href : '',
                    callback: (value) => {
                        forceRestoreAndExecute(value ? 'createLink' : 'unlink', value || undefined);
                    }
                }}));
                break;

            case 'editLinkButton':
            case 'editImage':
            case 'linkImage':
                const { block } = this._findBlockById(this.blocks, blockId);
                if (!block) return;

                const isImageSourceAction = action === 'editImage';
                const isImageLinkAction = action === 'linkImage';

                let existingValue = '';
                if (isImageSourceAction) {
                    existingValue = block.content.match(/src="([^"]+)"/)?.[1] || '';
                } else if (isImageLinkAction) {
                    existingValue = block.content.match(/<a[^>]*href="([^"]*)"/)?.[1] || '';
                } else if (action === 'editLinkButton') {
                    existingValue = block.properties?.url || '';
                }

                window.dispatchEvent(new CustomEvent('showLinkPopover', { detail: {
                    targetElement: button,
                    isImageSource: isImageSourceAction,
                    isImageLink: isImageLinkAction,
                    existingValue: existingValue,
                    callback: (value) => {
                        // 在回调中，通过 blockId 重新查找数据，这是最可靠的方式
                        const { block: targetBlock } = this._findBlockById(this.blocks, blockId);
                        if (!targetBlock) return;
                        
                        // 将对 DOM 的操作和对数据模型的操作清晰地分开
                        if (action === 'link') {
                            if (!this.activeToolbarBlockEl) return;
                            this.activeToolbarBlockEl.querySelector('.block-content').focus();
                            this._restoreSelection();
                            document.execCommand(value ? 'createLink' : 'unlink', false, value || undefined);
                            this._syncActiveBlockFromDOM(); // 操作 DOM 后，同步回数据
                        } else {
                            // 对于图片和链接按钮，直接操作数据模型
                            if (isImageSourceAction) {
                                let currentHref = targetBlock.content.match(/href="([^"]+)"/)?.[1] || '';
                                let imgTag = value ? `<img src="${value}" alt="image">` : '';
                                targetBlock.content = currentHref && imgTag ? `<a href="${currentHref}">${imgTag}</a>` : imgTag;
                            } else if (isImageLinkAction) {
                                let currentSrc = targetBlock.content.match(/src="([^"]+)"/)?.[1] || '';
                                let imgTag = currentSrc ? `<img src="${currentSrc}" alt="image">` : '';
                                targetBlock.content = value && imgTag ? `<a href="${value}">${imgTag}</a>` : imgTag;
                            } else if (action === 'editLinkButton') {
                                targetBlock.properties.url = value;
                                const textContent = targetBlock.content.replace(/<[^>]*>?/gm, '') || '编辑按钮';
                                targetBlock.content = `<a href="${value}">${textContent}</a>`;
                            }
                            this._syncBlockFromData(targetBlock); // 操作数据后，同步到 DOM
                            window.dispatchEvent(new CustomEvent('editor:change'));
                        }
                    }
                }}));
                break;
        }
    }

    // 辅助函数，用于将数据模型的变化同步到 DOM
    _syncBlockFromData(blockData) {
        const blockEl = this.container.querySelector(`.block-container[data-id="${blockData.id}"]`);
        if (blockEl) {
            const contentEl = blockEl.querySelector('.block-content');
            if (contentEl) {
                contentEl.innerHTML = blockData.content;
            }
        }
    }

    _syncAllBlocksFromDOM() {
        this.container.querySelectorAll('.block-content').forEach(el => {
            const blockData = this._findBlockById(this.blocks, el.dataset.id);
            if (blockData) {
                blockData.block.content = el.innerHTML;
            }
        });
    }

    _generateUUID() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }


    focusBlock(element) {
        element.focus();
        // 将光标移动到内容的末尾
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(false); // false 表示折叠到末尾
        selection.removeAllRanges();
        selection.addRange(range);
    }


    getSanitizedHtml(isForExport = false, workspaceRoot = '') {
        // 1. 克隆整个编辑器容器，以避免修改当前视图
        const clonedContainer = this.container.cloneNode(true);

        // 2. 移除所有不必要的编辑控件
        clonedContainer.querySelectorAll('.block-controls, .column-resizer, .drop-indicator, .drop-indicator-vertical').forEach(el => el.remove());

        // 3. 移除所有 contentEditable 属性和占位符
        clonedContainer.querySelectorAll('[contentEditable="true"]').forEach(el => {
            el.removeAttribute('contentEditable');
            el.removeAttribute('data-placeholder');
        });

        // 4. 移除所有交互相关的 class 和 data 属性
        clonedContainer.querySelectorAll('.is-hover-parent, .drag-over-inside').forEach(el => {
            el.classList.remove('is-hover-parent', 'drag-over-inside');
        });

        // 5. 处理内部链接
        clonedContainer.querySelectorAll('a').forEach(a => {
            let href = a.getAttribute('href');
            if (href && href.endsWith('.veritnote')) {
                if (isForExport) {
                    // 转换为相对 HTML 路径
                    const relativePath = href.substring(workspaceRoot.length + 1).replace(/\\/g, '/');
                    a.setAttribute('href', relativePath.replace('.veritnote', '.html'));
                } else {
                    // 预览模式：转换为 JS 调用
                    a.setAttribute('href', '#');
                    a.setAttribute('onclick', `window.chrome.webview.postMessage({ action: 'loadPage', payload: { path: '${href.replace(/\\/g, '\\\\')}', fromPreview: true } }); return false;`);
                }
            }
        });

        // 返回净化后的 HTML 字符串
        return clonedContainer.innerHTML;
    }
}