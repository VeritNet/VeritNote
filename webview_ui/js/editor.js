// js/editor.js

class Editor {
    constructor(containerElement) {
        this.container = containerElement;
        this.blockRegistry = new Map(); // Stores Block classes by type name
        this.blocks = []; // Root-level array of Block instances
        this.currentPagePath = null;

        this.history = new HistoryManager(this);
        
        // --- UI Elements ---
        this.commandMenu = document.getElementById('command-menu');
        this.toolbar = document.getElementById('block-toolbar');

        // --- State Management ---
        this.activeCommandBlock = null;
        this.draggedBlock = null;
        this.currentDropInfo = null;
        this.activeToolbarBlock = null;
        this.toolbarHideTimeout = null;
        this.currentSelection = null;
        this.richTextEditingState = {
            isActive: false,
            blockId: null,
            savedRange: null
        };

        this.commandMenuSelectedIndex = 0; // NEW: For keyboard navigation
        
        this._initListeners();
    }

    /**
     * Registers a Block class so the editor knows how to create it.
     * @param {typeof Block} blockClass - The class constructor of the block to register.
     */
    registerBlock(blockClass) {
        if (blockClass.type) {
            this.blockRegistry.set(blockClass.type, blockClass);
        } else {
            console.error("Block class is missing a static 'type' property and cannot be registered.", blockClass);
        }
    }

    /**
     * Creates an instance of a registered block.
     * @param {object} blockData - The data for the block (type, id, etc.).
     * @returns {Block | null} An instance of the corresponding Block class.
     */
    createBlockInstance(blockData) {
        const BlockClass = this.blockRegistry.get(blockData.type);
        if (BlockClass) {
            return new BlockClass(blockData, this);
        }
        console.error(`Block type "${blockData.type}" is not registered.`);
        return null;
    }

    /**
     * Loads page data, creating block instances and rendering them.
     * @param {object} pageData - The page data object from the backend.
     */
    load(pageData) {
        this.currentPagePath = pageData.path;
        const blockDataList = pageData.content || [];
        this.blocks = blockDataList.map(data => this.createBlockInstance(data)).filter(Boolean);
        this.blocks.forEach(block => block.parent = null);
        this.render();

        // *** NEW: Record the initial state for undo/redo ***
        // We only do this if we're NOT in the middle of an undo/redo action
        if (!this.history.isUndoingOrRedoing) {
            this.history.recordInitialState();
        }
    }

    /**
     * Gets all block data ready for saving.
     * @returns {Array<object>} An array of serializable block data objects.
     */
    getBlocksForSaving() {
        return this.blocks.map(block => block.data);
    }
    
    /**
     * Emits a custom event to notify main.js that content has changed.
     */
    emitChange(recordHistory = true, actionType = 'unknown', blockInstance = null) {
        if (recordHistory && !this.history.isUndoingOrRedoing) {
            this.history.record(actionType);
        }
        
        // Dispatch event for unsaved status
        window.dispatchEvent(new CustomEvent('editor:change'));

        // ** REVISED: Dispatch specific event for the block AND ALL ITS PARENTS **
        if (blockInstance) {
            let currentBlock = blockInstance;
            
            // Start with the block that was directly changed
            // Then loop upwards through all its parents
            while (currentBlock) {
                // We need to ensure the parent's data object is fully up-to-date
                // before dispatching the event. `currentBlock.data` getter handles this.
                const currentBlockData = currentBlock.data;

                window.dispatchEvent(new CustomEvent('block:updated', {
                    detail: {
                        filePath: this.currentPagePath,
                        blockData: currentBlockData
                    }
                }));

                // Move up to the next parent
                const parentInfo = this._findBlockInstanceById(this.blocks, currentBlock.id);
                currentBlock = parentInfo ? parentInfo.parentBlock : null;
            }
        }
    }

    // --- Core Rendering ---

    /**
     * Clears the editor and renders all root-level blocks.
     */
    render() {
        this.container.innerHTML = '';
        this.blocks.forEach(block => {
            const blockEl = block.render();
            if (blockEl) {
                this.container.appendChild(blockEl);
            }
        });
        // Special handling for columns, which might need resizers between them
        this._postRenderProcess();
    }
    
    /**
     * Post-render tasks, like adding column resizers.
     * This is necessary because resizers need to know about their neighbors.
     * @private
     */
    _postRenderProcess() {
        this.container.querySelectorAll('.block-content[data-type="columns"]').forEach(columnsEl => {
            const columnsBlock = this._findBlockInstanceById(this.blocks, columnsEl.dataset.id)?.block;
            if (!columnsBlock || columnsBlock.children.length <= 1) return;

            for (let i = 1; i < columnsBlock.children.length; i++) {
                const leftCol = columnsBlock.children[i - 1];
                const rightCol = columnsBlock.children[i];
                const resizer = this._createColumnResizer(leftCol, rightCol);
                
                // Insert resizer between the column elements
                const leftColEl = columnsBlock.element.querySelector(`.block-content[data-id="${leftCol.id}"]`);
                if (leftColEl && leftColEl.nextSibling) {
                    leftColEl.parentElement.insertBefore(resizer, leftColEl.nextSibling);
                }
            }
        });
    }

    // --- Event Listeners Initialization ---
    _initListeners() {
        this.container.addEventListener('input', this._onInput.bind(this));
        this.container.addEventListener('keydown', this._onKeyDown.bind(this));
        this.container.addEventListener('click', this._onClick.bind(this));
        
        this.container.addEventListener('dragstart', this._onDragStart.bind(this));
        this.container.addEventListener('dragover', this._onDragOver.bind(this));
        this.container.addEventListener('dragleave', this._onDragLeave.bind(this));
        this.container.addEventListener('drop', this._onDrop.bind(this));
        this.container.addEventListener('dragend', this._onDragEnd.bind(this));
        
        this.commandMenu.addEventListener('click', this._onCommandMenuClick.bind(this));

        this.container.addEventListener('mouseover', this._onBlockMouseOver.bind(this));
        this.container.addEventListener('mouseout', this._onBlockMouseOut.bind(this));
        this.toolbar.addEventListener('mouseover', () => clearTimeout(this.toolbarHideTimeout));
        this.toolbar.addEventListener('mouseout', this._onBlockMouseOut.bind(this));

        document.addEventListener('selectionchange', this._onSelectionChange.bind(this));

        window.addEventListener('popoverClosed', () => {
            this.richTextEditingState.isActive = false;
        });
    }

    // --- Event Handlers ---
    _onInput(e) {
        const blockEl = e.target.closest('[data-id]');
        if (!blockEl) return;

        const blockInstance = this._findBlockInstanceById(this.blocks, blockEl.dataset.id)?.block;
        if (blockInstance && typeof blockInstance.onInput === 'function') {
            blockInstance.onInput(e);
        }
    }

    _onKeyDown(e) {
        if (this.commandMenu.style.display === 'block') {
            const items = this.commandMenu.querySelectorAll('.command-item');
            if (items.length === 0) return;

            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.commandMenuSelectedIndex = (this.commandMenuSelectedIndex - 1 + items.length) % items.length;
                    this._updateCommandMenuSelection();
                    return; // Prevent further keydown processing
                case 'ArrowDown':
                    e.preventDefault();
                    this.commandMenuSelectedIndex = (this.commandMenuSelectedIndex + 1) % items.length;
                    this._updateCommandMenuSelection();
                    return; // Prevent further keydown processing
                case 'Enter':
                    e.preventDefault();
                    items[this.commandMenuSelectedIndex].click(); // Simulate a click on the selected item
                    return; // Prevent further keydown processing
                case 'Tab': // Also treat Tab as confirmation
                    e.preventDefault();
                    items[this.commandMenuSelectedIndex].click();
                    return;
            }
        }
        
        // Original onKeyDown logic for the block instance
        const contentEl = e.target.closest('.block-content[contenteditable="true"]');
        if (!contentEl) return;
        
        const blockInstance = this._findBlockInstanceAndParent(contentEl.dataset.id)?.block;
        if (blockInstance && typeof blockInstance.onKeyDown === 'function') {
             if (e.key === 'Enter' && !e.shiftKey) {
                blockInstance.syncContentFromDOM();
            }
            blockInstance.onKeyDown(e);
        }
    }


    deleteBlock(blockInstance) {
        const info = this._findBlockInstanceAndParent(blockInstance.id);
        if (info) {
            // ** STEP 1: Dispatch deletion event for the block itself **
            window.dispatchEvent(new CustomEvent('block:deleted', {
                detail: {
                    filePath: this.currentPagePath,
                    blockId: blockInstance.id
                }
            }));
            
            // ** STEP 2: Actually remove the block from its parent's children array **
            info.parentArray.splice(info.index, 1);
            
            // ** STEP 3: (REVISED) Trigger updates for all parent containers **
            let parentToUpdate = info.parentInstance;
            while(parentToUpdate) {
                // Get the parent's most up-to-date data (which now excludes the deleted child)
                const parentData = parentToUpdate.data;
                
                window.dispatchEvent(new CustomEvent('block:updated', {
                    detail: {
                        filePath: this.currentPagePath,
                        blockData: parentData
                    }
                }));
                
                // Move up to the next parent
                const grandParentInfo = this._findBlockInstanceById(this.blocks, parentToUpdate.id);
                parentToUpdate = grandParentInfo ? grandParentInfo.parentBlock : null;
            }

            // ** STEP 4: Perform cleanup, render, and record history **
            this._cleanupData();
            this.render();
            this.emitChange(true, 'delete-block', null); // Pass null as we've handled updates manually
        }
    }

    
    _onClick(e) {
        // 1. 高优先级检查：删除按钮
        if (e.target.classList.contains('delete-btn')) {
        const blockContainerEl = e.target.closest('.block-container');
        if (blockContainerEl) {
            const blockInstance = this._findBlockInstanceAndParent(blockContainerEl.dataset.id)?.block;
            if (blockInstance) { this.deleteBlock(blockInstance); }
        }
        return;
    }

    // 2. 高优先级检查：编辑器背景
    if (e.target === this.container) {
        this._onBackgroundClick();
        return;
    }

    // --- 最终的、分层且无漏洞的容器点击逻辑 ---

    // 3. 第一层：为 Column 布局提供特殊处理
    // 这个逻辑是正确的，因为当点击子块时，e.target 不会是 column 自身。
    if (e.target.matches('.block-content[data-type="column"]')) {
        const columnId = e.target.dataset.id;
        const columnInstance = this._findBlockInstanceAndParent(columnId)?.block;
        if (columnInstance) {
            this._appendNewBlockToContainer(columnInstance);
            return;
        }
    }

    // 4. 第二层：为所有其他标准容器块提供统一的、无漏洞的处理
    const childrenContainer = e.target.closest('.block-children-container');
    if (childrenContainer) {
        // 找到这个 childrenContainer 所属的容器块的 DOM 元素
        // 例如，对于 Callout，这将是 .block-content[data-type="callout"]
        const containerElement = childrenContainer.closest('[data-id]');

        // 找到从点击位置（e.target）向上追溯的第一个块的 DOM 元素
        // 这就是我们实际点击的那个块
        const clickedBlockElement = e.target.closest('[data-id]');

        // **这就是您提出的关键性检查**
        // 只有当“实际点击的块”就是“我们所在的容器块”时，才视为点击了空白区域。
        // 如果它们不相等，说明我们点击的是一个子块。
        if (containerElement && clickedBlockElement && containerElement.dataset.id === clickedBlockElement.dataset.id) {
            const containerInstance = this._findBlockInstanceAndParent(containerElement.dataset.id)?.block;
            if (containerInstance) {
                this._appendNewBlockToContainer(containerInstance);
                return;
            }
        }
    }
}

    _onBackgroundClick() {
        const newBlock = this.createBlockInstance({ type: 'paragraph' });
        this.blocks.push(newBlock);
        this.render();
        newBlock.focus();
        this.emitChange(true, 'create-block');
    }

    _appendNewBlockToContainer(containerBlock) {
        const newBlockInstance = this.createBlockInstance({ type: 'paragraph' });
        containerBlock.children.push(newBlockInstance);
        
        this.render();
        newBlockInstance.focus();
        this.emitChange(true, 'create-block');
    }
    
    // --- Block Manipulation API (for internal use) ---
    insertNewBlockAfter(targetBlock, type = 'paragraph') {
        const newBlockData = { type: type, content: '' };
        const newBlockInstance = this.createBlockInstance(newBlockData);
        if (!newBlockInstance) return;

        if (!targetBlock) { // Inserting at the beginning or in an empty editor
            this.blocks.unshift(newBlockInstance);
        } else {
            const { parent, index } = this._findBlockInstanceById(this.blocks, targetBlock.id);
            if (parent) {
                parent.splice(index + 1, 0, newBlockInstance);
            }
        }
        this.render();
        newBlockInstance.focus();
        this.emitChange(true, 'insert-block');
    }
    
    // --- Command Menu ---
    showCommandMenuForBlock(blockInstance) {
        const blockEl = blockInstance.contentElement;
        if (!blockEl) return;

        this.commandMenu.style.display = 'block'; // Show first to measure height
        this.activeCommandBlock = blockInstance;

        const rect = blockEl.getBoundingClientRect();
        const menuHeight = this.commandMenu.offsetHeight;
        const windowHeight = window.innerHeight;
        const buffer = 10; // 10px spacing from the edge

        let topPosition = rect.bottom;

        // Check if the menu would go off-screen at the bottom
        if (rect.bottom + menuHeight > windowHeight - buffer) {
            // If so, position it ABOVE the block instead
            topPosition = rect.top - menuHeight;
        }

        this.commandMenu.style.left = `${rect.left}px`;
        this.commandMenu.style.top = `${topPosition}px`;
        
        this._updateCommandMenu(blockEl.textContent.substring(1));
    }

    hideCommandMenu() {
        if (this.commandMenu.style.display === 'block') {
            this.commandMenu.style.display = 'none';
            this.activeCommandBlock = null;
            this.commandMenuSelectedIndex = 0; // Reset index when hiding
        }
    }
    
    _updateCommandMenu(searchTerm) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        
        let filteredCommands = [];
        this.blockRegistry.forEach(BlockClass => {
            if (BlockClass.canBeToggled) {
                const match = BlockClass.label.toLowerCase().includes(lowerCaseSearchTerm) ||
                              BlockClass.keywords.some(k => k.toLowerCase().startsWith(lowerCaseSearchTerm));
                if (match) {
                    filteredCommands.push({
                        type: BlockClass.type,
                        title: BlockClass.label,
                        description: BlockClass.description,
                        icon: BlockClass.icon || '■' // Get icon from class static property
                    });
                }
            }
        });

        if (filteredCommands.length === 0) {
            this.hideCommandMenu();
            return;
        }

        this.commandMenu.innerHTML = `
            <div class="command-menu-title">Basic Blocks</div>
            <div class="command-menu-list">
                ${filteredCommands.map(cmd => `
                    <div class="command-item" data-type="${cmd.type}">
                        <span class="command-item-icon">${cmd.icon}</span>
                        <div class="command-item-text">
                            <strong>${cmd.title}</strong>
                            <small>${cmd.description}</small>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // NEW: Reset index and apply selection after updating content
        this.commandMenuSelectedIndex = 0;
        this._updateCommandMenuSelection();
    }

    _updateCommandMenuSelection() {
        const items = this.commandMenu.querySelectorAll('.command-item');
        items.forEach((item, index) => {
            if (index === this.commandMenuSelectedIndex) {
                item.classList.add('selected');
                // Ensure the selected item is visible in the scrollable area
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    _onCommandMenuClick(e) {
        e.preventDefault();
        const item = e.target.closest('.command-item');
        if (!item || !this.activeCommandBlock) return;

        const newType = item.dataset.type;
        const targetBlock = this.activeCommandBlock;
        targetBlock.syncContentFromDOM();

        const { parentInstance } = this._findBlockInstanceAndParent(targetBlock.id);

        // If the block is empty or just '/', transform it
        if (targetBlock.content.trim() === '/' || targetBlock.content.trim() === '') {
            const { parentArray, index } = this._findBlockInstanceAndParent(targetBlock.id);
            const newBlockData = { id: targetBlock.id, type: newType };
            const newBlockInstance = this.createBlockInstance(newBlockData);
            if(newBlockInstance) {
                parentArray.splice(index, 1, newBlockInstance);
                this.render();
                newBlockInstance.focus();
            }
        } 
        // *** FIX: If inside a container, insert a new block AFTER the current one, INSIDE the container ***
        else if (parentInstance && parentInstance.isContainer) {
            const { index } = this._findBlockInstanceAndParent(targetBlock.id, parentInstance.children);
            const newBlockInstance = this.createBlockInstance({ type: newType });
            if (newBlockInstance) {
                parentInstance.children.splice(index + 1, 0, newBlockInstance);
                this.render();
                newBlockInstance.focus();
            }
        }
        // Otherwise, insert a new block after it at the same level
        else {
            const { parentArray, index } = this._findBlockInstanceAndParent(targetBlock.id);
            const newBlockInstance = this.createBlockInstance({ type: newType });
            if (newBlockInstance) {
                parentArray.splice(index + 1, 0, newBlockInstance);
                this.render();
                newBlockInstance.focus();
            }
        }

        this.hideCommandMenu();
        this.emitChange(true, 'create-block');
    }

    // --- Drag and Drop (Identical logic to the original, just adapted for block instances) ---
    _onDragStart(e) {
        const blockContainer = e.target.closest('.block-container');
        if (blockContainer) {
            this.draggedBlock = blockContainer;
            e.dataTransfer.setData('text/plain', blockContainer.dataset.id);
            setTimeout(() => e.target.style.opacity = '0.5', 0);
            document.body.classList.add('is-dragging-block');
        }
    }

    _onDragOver(e) {
        e.preventDefault();

        if (e.target.closest('#right-sidebar')) {
            this._cleanupDragIndicators();
            this.currentDropInfo = null; // Important: Clear drop info
            e.dataTransfer.dropEffect = 'copy'; // Show a copy cursor
            window.dispatchEvent(new CustomEvent('block:dragover:right-sidebar'));
            return;
        }

        this._cleanupDragIndicators();
    
        let targetEl = e.target.closest('.block-container');
        if (!targetEl || targetEl === this.draggedBlock) return;

        const rect = targetEl.getBoundingClientRect();
        const targetBlockInstance = this._findBlockInstanceById(this.blocks, targetEl.dataset.id)?.block;
        const canHaveChildren = targetBlockInstance?.isContainer;

        const paddingBottom = 24; 
        const isInBottomPadding = canHaveChildren && (e.clientY > rect.bottom - paddingBottom);

        if (isInBottomPadding) {
            this._showHorizontalIndicator(targetEl, 'inside_last');
            this.currentDropInfo = { targetId: targetEl.dataset.id, position: 'inside_last' };
        } else {
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
    
    _onDragLeave(e) {  }

    // We need a way to find a block and its parent instance
    _findBlockInstanceAndParent(id, rootBlocks = this.blocks, parent = null) {
        for (let i = 0; i < rootBlocks.length; i++) {
            const block = rootBlocks[i];
            if (block.id === id) {
                // If parent is null, the parent is the root `this.blocks` array itself.
                const parentArray = parent ? parent.children : this.blocks;
                return { block, parentInstance: parent, parentArray, index: i };
            }
            if (block.children.length > 0) {
                const found = this._findBlockInstanceAndParent(id, block.children, block);
                if (found) return found;
            }
        }
        return null;
    }

    _onDrop(e) {
        document.body.classList.remove('is-dragging-block');
        e.preventDefault();
        this._cleanupDragIndicators();
        if (this.draggedBlock) {
            this.draggedBlock.style.opacity = '1';
            // Reset the editor's draggedBlock reference AFTER drop.
            this.draggedBlock = null; 
        }

        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || !this.currentDropInfo) return;

        const { targetId, position } = this.currentDropInfo;
        if (draggedId === targetId) return;

        // *** THE FIX: Force sync content from DOM for both blocks before any logic runs. ***
        const draggedBlockInfo = this._findBlockInstanceAndParent(draggedId);
        const targetBlockInfo = this._findBlockInstanceAndParent(targetId);

        // Ensure blocks exist before trying to sync
        if (draggedBlockInfo?.block) {
            draggedBlockInfo.block.syncContentFromDOM();
        }
        if (targetBlockInfo?.block) {
            targetBlockInfo.block.syncContentFromDOM();
        }
        // *** END OF FIX ***

        // 1. Find and REMOVE the dragged block from its original position
        if (!draggedBlockInfo) return;
        const { block: draggedBlockInstance, parentArray: fromParentArray, index: fromIndex } = draggedBlockInfo;
        
        fromParentArray.splice(fromIndex, 1);
        
        // 2. Find the target
        if (!targetBlockInfo) {
            fromParentArray.splice(fromIndex, 0, draggedBlockInstance); // Revert
            this.render();
            return;
        }
        const { block: targetBlockInstance, parentArray: toParentArray, index: toIndex } = targetBlockInfo;

        
        // 3. Perform insertion
        switch (position) {
            case 'left':
            case 'right':
                this._handleColumnDrop(draggedBlockInstance, targetBlockInstance, position);
                break;
            case 'before':
                toParentArray.splice(toIndex, 0, draggedBlockInstance);
                break;
            case 'after':
                toParentArray.splice(toIndex + 1, 0, draggedBlockInstance);
                break;
            case 'inside_last':
                // This is for dropping into containers like Callout
                targetBlockInstance.children.push(draggedBlockInstance);
                break;
        }
        
        // 4. Cleanup, render, save
        this.draggedBlock = null;
        this.currentDropInfo = null;
        this._cleanupData();
        this.render();
        this.emitChange(true, 'drag-drop');
    }

    _onDragEnd(e) {
        // This handles cases where the block is dropped outside a valid target.
        document.body.classList.remove('is-dragging-block');
        this._cleanupDragIndicators();
        // The draggedBlock might still exist if drop didn't happen on a valid target
        if (this.draggedBlock) {
            this.draggedBlock.style.opacity = '1';
            this.draggedBlock = null;
        }
    }
    
    // *** FIX: A much simpler, instance-based column drop logic ***
    _handleColumnDrop(draggedBlockInstance, targetBlockInstance, position) {
        const { parentArray, index: targetIndex, parentInstance } = this._findBlockInstanceAndParent(targetBlockInstance.id);

        // Scene A: Target is inside a Columns block. We add a new column.
        if (parentInstance && parentInstance.type === 'columns') {
            const newColumn = this.createBlockInstance({ type: 'column' });
            newColumn.children.push(draggedBlockInstance);
            
            const insertIndex = position === 'left' ? targetIndex : targetIndex + 1;
            parentInstance.children.splice(insertIndex, 0, newColumn);
            
            // Rebalance widths
            parentInstance.children.forEach(col => col.properties.width = 1 / parentInstance.children.length);
            
        } else {
            // Scene B: Two blocks merge into a new Columns block.
            const col1 = this.createBlockInstance({ type: 'column' });
            const col2 = this.createBlockInstance({ type: 'column' });
            
            if (position === 'left') {
                col1.children.push(draggedBlockInstance);
                col2.children.push(targetBlockInstance);
            } else {
                col1.children.push(targetBlockInstance);
                col2.children.push(draggedBlockInstance);
            }
            
            const newColumns = this.createBlockInstance({ type: 'columns' });
            newColumns.children.push(col1, col2);
            
            // Replace the original target block with the new columns container
            parentArray.splice(targetIndex, 1, newColumns);
        }
    }
    
    _cleanupData() {
        let structuralChange = false;

        const traverseAndClean = (blocks, parent) => {
            for (let i = blocks.length - 1; i >= 0; i--) {
                const block = blocks[i];

                if (block.children && block.children.length > 0) {
                    traverseAndClean(block.children, block);
                }

                if (block.type === 'columns') {
                    const originalColumnCount = block.children.length;
                
                    // 规则 A: 过滤掉空的子列
                    block.children = block.children.filter(col => col.children.length > 0);
                    const newColumnCount = block.children.length;

                    const columnsWereRemoved = newColumnCount < originalColumnCount;

                    if (columnsWereRemoved) {
                        structuralChange = true;
                    }

                    const info = this._findBlockInstanceAndParent(block.id);
                    if (!info) continue;

                    if (newColumnCount === 0) {
                        // 规则 B: 如果完全空了，删除整个 columns 容器
                        info.parentArray.splice(info.index, 1);
                    } else if (newColumnCount === 1) {
                        // 规则 C: 如果只剩一列，将其子元素“提升”出来，替换掉 columns 容器
                        const survivingBlocks = block.children[0].children;
                        info.parentArray.splice(info.index, 1, ...survivingBlocks);
                    } else if (columnsWereRemoved) {
                        // 关键修复：只有在列数实际减少时，才重新平衡宽度
                        const numCols = block.children.length;
                        block.children.forEach(col => col.properties.width = 1 / numCols);
                    }
                }
            }
        };
    
        traverseAndClean(this.blocks, null);
    
        return structuralChange;
    }

    // --- Drag & Drop Visual Helpers (Identical logic) ---
    _cleanupDragIndicators() {
        this.container.querySelectorAll('.drop-indicator, .drop-indicator-vertical').forEach(el => el.remove());
    }

    _showHorizontalIndicator(targetEl, position) {
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        indicator.style.width = `${targetEl.offsetWidth}px`;
        indicator.style.left = `0px`; // Simplified, CSS can handle centering
        if (position === 'before') {
             targetEl.parentElement.insertBefore(indicator, targetEl);
        } else if (position === 'after') {
            targetEl.parentElement.insertBefore(indicator, targetEl.nextSibling);
        } else if (position === 'inside_last') {
            const contentWrapper = targetEl.querySelector('.callout-content-wrapper, .block-content[data-type="column"]');
            if (contentWrapper) {
                contentWrapper.appendChild(indicator);
            }
        }
    }

    _showVerticalIndicator(targetEl, position) {
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator-vertical';
        indicator.style.height = `${targetEl.offsetHeight}px`;
        if (position === 'left') {
            indicator.style.left = '0';
        } else { // right
            indicator.style.right = '0';
        }
        targetEl.appendChild(indicator);
    }

    _createColumnResizer(leftColumn, rightColumn) {
        const resizer = document.createElement('div');
        resizer.className = 'column-resizer';

        // 找到共同的父级 ColumnsBlock 实例
        const parentColumnsBlock = this._findBlockInstanceAndParent(leftColumn.id)?.parentInstance;

        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
        
            // 如果找不到父级，则不执行任何操作
            if (!parentColumnsBlock || !parentColumnsBlock.contentElement) return;

            const startX = e.clientX;
            const leftInitialWidth = leftColumn.properties.width;
            const rightInitialWidth = rightColumn.properties.width;
        
            const onMouseMove = (moveEvent) => {
                // 关键修复：从稳定的 JS 实例获取父容器宽度
                const parentWidth = parentColumnsBlock.contentElement.offsetWidth;
                if (parentWidth === 0) return;

                const deltaX = moveEvent.clientX - startX;
                const deltaPercentage = deltaX / parentWidth;
            
                let newLeftWidth = leftInitialWidth + deltaPercentage;
                let newRightWidth = rightInitialWidth - deltaPercentage;

                // 限制最小宽度，防止一列完全消失
                const minWidth = 0.1; // 10%
                if (newLeftWidth < minWidth || newRightWidth < minWidth) return;

                // 直接更新 DOM 以提供实时反馈
                leftColumn.contentElement.style.width = `${newLeftWidth * 100}%`;
                rightColumn.contentElement.style.width = `${newRightWidth * 100}%`;
            };

            const onMouseUp = (upEvent) => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            
                const parentWidth = parentColumnsBlock.contentElement.offsetWidth;
                if (parentWidth === 0) return;

                const deltaX = upEvent.clientX - startX;
                const deltaPercentage = deltaX / parentWidth;
            
                let finalLeftWidth = leftInitialWidth + deltaPercentage;
                let finalRightWidth = rightInitialWidth - deltaPercentage;

                // 最终计算时再次确保不小于最小宽度
                const minWidth = 0.1;
                if (finalLeftWidth < minWidth) {
                    finalRightWidth += (finalLeftWidth - minWidth);
                    finalLeftWidth = minWidth;
                }
                if (finalRightWidth < minWidth) {
                    finalLeftWidth += (finalRightWidth - minWidth);
                    finalRightWidth = minWidth;
                }

                // 关键：将最终计算出的比例保存回数据模型
                leftColumn.properties.width = finalLeftWidth;
                rightColumn.properties.width = finalRightWidth;
            
                this.emitChange(true, 'resize-column');
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
        return resizer;
    }

    // --- Toolbar ---
    _onBlockMouseOver(e) {
        const targetEl = e.target.closest('.block-container');
        if (targetEl && targetEl !== this.activeToolbarBlock?.element) {
            clearTimeout(this.toolbarHideTimeout);
            const blockInstance = this._findBlockInstanceById(this.blocks, targetEl.dataset.id)?.block;
            if (blockInstance) {
                this._showBlockToolbar(blockInstance);
            }
        }
    }

    _onBlockMouseOut(e) {
        clearTimeout(this.toolbarHideTimeout);
        this.toolbarHideTimeout = setTimeout(() => {
            if (!this.toolbar.matches(':hover') && !this.container.querySelector('.block-container:hover')) {
                this._hideBlockToolbar();
            }
        }, 300);
    }

    _showBlockToolbar(blockInstance) {
        if (this.activeToolbarBlock) {
            this.activeToolbarBlock.element.classList.remove('toolbar-active');
        }

        this.activeToolbarBlock = blockInstance;
        const blockEl = blockInstance.element;
        blockEl.classList.add('toolbar-active');

        this._populateToolbar(blockInstance);

        requestAnimationFrame(() => {
            const blockRect = blockEl.getBoundingClientRect();
            const editorRect = this.container.getBoundingClientRect();
            const toolbarHeight = this.toolbar.offsetHeight;
            const toolbarWidth = this.toolbar.offsetWidth;
            
            let top = blockRect.top - toolbarHeight - 5;
            if (top < editorRect.top) {
                top = blockRect.bottom + 5;
            }
            let left = blockRect.left + (blockRect.width / 2) - (toolbarWidth / 2);
            if (left < editorRect.left) left = editorRect.left;
            if (left + toolbarWidth > editorRect.right) left = editorRect.right - toolbarWidth;
            
            this.toolbar.style.top = `${top}px`;
            this.toolbar.style.left = `${left}px`;
            this.toolbar.style.display = 'flex';
        });
    }

    _hideBlockToolbar() {
        this.toolbar.style.display = 'none';
        if (this.activeToolbarBlock) {
            this.activeToolbarBlock.element.classList.remove('toolbar-active');
        }
        this.activeToolbarBlock = null;
    }

    _populateToolbar(blockInstance) {
        this.toolbar.innerHTML = '';
        const buttons = blockInstance.toolbarButtons;

        buttons.forEach(btnInfo => {
            const button = document.createElement('button');
            button.className = 'toolbar-button';
            
            // A more robust way to handle this
            if (btnInfo.html) {
                // Create a temporary element to parse the HTML string
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = btnInfo.html;
                // Append all parsed child nodes to the button
                while (tempDiv.firstChild) {
                    button.appendChild(tempDiv.firstChild);
                }
            } else {
                button.textContent = btnInfo.icon; // Use textContent for icons to be safe
            }
            
            button.title = btnInfo.title;
            button.dataset.action = btnInfo.action;
            if (btnInfo.arg) {
                button.dataset.arg = btnInfo.arg;
            }
            button.addEventListener('mousedown', e => {
                e.preventDefault();
                this._handleToolbarClick(e, blockInstance);
            });
            this.toolbar.appendChild(button);
        });
    }

    _handleToolbarClick(e, blockInstance) {
        const button = e.currentTarget;
        const action = button.dataset.action;
        const arg = button.dataset.arg;

        const forceRestoreAndExecute = (cmd, value = null) => {
            if (!this.richTextEditingState.isActive) return;
            const { blockId, savedRange } = this.richTextEditingState;
            const targetBlock = this._findBlockInstanceById(this.blocks, blockId)?.block;
            if (!targetBlock || !savedRange) {
                this.richTextEditingState.isActive = false;
                return;
            }
            targetBlock.contentElement.focus();
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedRange);
            document.execCommand(cmd, false, value);
            targetBlock.syncContentFromDOM();
            this.emitChange(true, 'format-text');
            this.richTextEditingState.isActive = false;
        };

        switch (action) {
            case 'format':
                if (this.currentSelection) {
                    blockInstance.contentElement.focus();
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(this.currentSelection);
                    document.execCommand(arg, false, null);
                    blockInstance.syncContentFromDOM();
                    this.emitChange(true, 'format-text');
                }
                break;
            
            case 'colorPicker':
                this.richTextEditingState = { isActive: true, blockId: blockInstance.id, savedRange: this.currentSelection };
                window.showColorPicker({ 
                    targetElement: button,
                    callback: (color) => {
                        document.execCommand('styleWithCSS', false, true);
                        forceRestoreAndExecute('foreColor', color);
                        document.execCommand('styleWithCSS', false, false);
                    }
                });
                break;

            case 'link':
                this.richTextEditingState = { isActive: true, blockId: blockInstance.id, savedRange: this.currentSelection };
                window.showLinkPopover({
                    targetElement: button,
                    existingValue: this.currentSelection?.commonAncestorContainer.parentNode.href || '',
                    callback: (value) => {
                        forceRestoreAndExecute(value ? 'createLink' : 'unlink', value || undefined);
                    }
                });
                break;

            // Actions for specific blocks (e.g., Image, LinkButton)
            default:
                if (typeof blockInstance.handleToolbarAction === 'function') {
                    blockInstance.handleToolbarAction(action, button);
                }
                break;
        }
    }
    
    // --- Rich Text & Selection ---
    _onSelectionChange() {
        const selection = document.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            if (this.container.contains(range.startContainer)) {
                this.currentSelection = range;
            }
        }
    }

    // --- Helpers ---
    _findBlockInstanceById(blocks, id, parentBlock = null) {
        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            if (block.id === id) {
                return { block, parent: parentBlock ? parentBlock.children : this.blocks, index: i, parentBlock };
            }
            if (block.children && block.children.length > 0) {
                const found = this._findBlockInstanceById(block.children, id, block);
                if (found) return found;
            }
        }
        return null;
    }

    
    getSanitizedHtml(isForExport = false, workspaceRoot = '', options = {}, imageSrcMap = {}) {
        const clonedContainer = this.container.cloneNode(true);

        // --- 1. Standard Cleanup ---
        clonedContainer.querySelectorAll('.block-controls, .column-resizer, .drop-indicator, .drop-indicator-vertical').forEach(el => el.remove());
        clonedContainer.querySelectorAll('.block-content[data-type="code"] .code-block-input').forEach(el => el.remove());
        clonedContainer.querySelectorAll('[contentEditable="true"]').forEach(el => {
            el.removeAttribute('contentEditable');
            el.removeAttribute('data-placeholder');
        });
        clonedContainer.querySelectorAll('.toolbar-active, .vn-active, .is-highlighted').forEach(el => {
            el.classList.remove('toolbar-active', 'vn-active', 'is-highlighted');
        });
        if (isForExport && options.disableDrag) {
            clonedContainer.querySelectorAll('[draggable="true"]').forEach(el => el.removeAttribute('draggable'));
        }

        // --- 2. List Items State Inheritance ---
        // To-do List state
        clonedContainer.querySelectorAll('.block-content[data-type="todoListItem"]').forEach(clonedTodoEl => {
            const clonedCheckbox = clonedTodoEl.querySelector('.todo-checkbox');
            const clonedTextEl = clonedTodoEl.querySelector('.list-item-text-area');
            if (clonedCheckbox && clonedTextEl) {
                const originalCheckbox = this.container.querySelector('#' + clonedCheckbox.id);
                if (originalCheckbox && originalCheckbox.checked) {
                    clonedCheckbox.setAttribute('checked', '');
                    clonedTextEl.classList.add('todo-checked');
                }
                if (isForExport) {
                    clonedCheckbox.setAttribute('data-id', clonedCheckbox.id);
                }
            }
        });

        // Toggle List state
        clonedContainer.querySelectorAll('.block-content[data-type="toggleListItem"]').forEach(clonedToggleEl => {
            const originalBlock = this._findBlockInstanceById(this.blocks, clonedToggleEl.dataset.id)?.block;
            if (originalBlock) {
                if (originalBlock.properties.isCollapsed) {
                    clonedToggleEl.classList.add('is-collapsed');
                }
                const toggleTriangle = clonedToggleEl.querySelector('.toggle-triangle');
                if (toggleTriangle) {
                    if (isForExport) {
                        toggleTriangle.setAttribute('data-id', `toggle-${originalBlock.id}`);
                    } else {
                        const onclickScript = "this.closest('.block-content[data-type=\"toggleListItem\"]').classList.toggle('is-collapsed');";
                        toggleTriangle.setAttribute('onclick', onclickScript);
                    }
                }
            }
        });


        // --- 3. Universal Link and Image Processing ---
        
        // Handle Links (<a> tags)
        clonedContainer.querySelectorAll('a').forEach((el, index) => {
            let href = el.getAttribute('href');
            if (!href) return;

            let normalizedHref = href.replace(/\\/g, '/');
            
            let pathPart = normalizedHref;
            let hashPart = '';

            if (normalizedHref.includes('#')) {
                const parts = normalizedHref.split('#');
                pathPart = parts[0];
                hashPart = '#' + parts[1];
            }

            if (pathPart.endsWith('.veritnote')) {
                if (isForExport) {
                    const relativePath = pathPart.substring(workspaceRoot.length + 1).replace('.veritnote', '.html');
                    el.setAttribute('href', relativePath + hashPart);
                } else { // In-app preview mode
                    el.setAttribute('href', '#');
                    el.setAttribute('data-internal-link', href);
                    el.classList.add('internal-link');
                    // ** DEBUG: Add a unique ID for logging **
                    el.setAttribute('data-debug-id', `link-${index}`);
                }
            }
        });
        
        // Handle Images (<img> tags)
        clonedContainer.querySelectorAll('img').forEach(el => {
            const originalPath = el.getAttribute('src');
            if (!originalPath) return;

            // Priority: Check if the backend provided a new path in the imageSrcMap (for copied/downloaded images)
            if (isForExport && imageSrcMap[originalPath]) {
                el.setAttribute('src', imageSrcMap[originalPath]);
                return; // Path has been replaced, no further processing needed for this image
            }

            // Note: Unlike links, image `src` usually doesn't need path rewriting for in-app preview,
            // as local file paths (`file:///...`) or online URLs work directly.
            // Export logic is handled by the imageSrcMap.
        });


        // --- 4. Final HTML Assembly & Script Injection ---
        let finalHtml = clonedContainer.innerHTML;

        // Inject script for To-do list state persistence on export
        if (isForExport && finalHtml.includes('data-type="todoListItem"')) {
            const script = `
<script>
    document.addEventListener('DOMContentLoaded', () => {
        const STORAGE_KEY = 'veritnote_todo_state';
        function loadState() {
            try {
                const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                document.querySelectorAll('.todo-checkbox[data-id]').forEach(checkbox => {
                    const id = checkbox.getAttribute('data-id');
                    if (savedState[id] !== undefined) { checkbox.checked = savedState[id]; }
                    const textEl = checkbox.closest('.block-content').querySelector('.list-item-text-area');
                    if (textEl) { textEl.classList.toggle('todo-checked', checkbox.checked); }
                });
            } catch (e) { console.error('Failed to load to-do state:', e); }
        }
        function saveState(id, isChecked) {
            try {
                const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                savedState[id] = isChecked;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
            } catch (e) { console.error('Failed to save to-do state:', e); }
        }
        document.querySelectorAll('.todo-checkbox[data-id]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                const isChecked = e.target.checked;
                saveState(id, isChecked);
                const textEl = e.target.closest('.block-content').querySelector('.list-item-text-area');
                if (textEl) { textEl.classList.toggle('todo-checked', isChecked); }
            });
        });
        loadState();
    });
<\/script>`;
            finalHtml += script;
        }

        // Inject script for Toggle list state persistence on export
        if (isForExport && finalHtml.includes('data-type="toggleListItem"')) {
            const script = `
<script>
    document.addEventListener('DOMContentLoaded', () => {
        const STORAGE_KEY = 'veritnote_toggle_state';
        function loadState() {
            try {
                const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                document.querySelectorAll('.toggle-triangle[data-id]').forEach(triangle => {
                    const id = triangle.getAttribute('data-id');
                    const container = triangle.closest('.block-content[data-type="toggleListItem"]');
                    if (savedState[id] !== undefined && container) {
                        container.classList.toggle('is-collapsed', savedState[id]);
                    }
                });
            } catch (e) { console.error('Failed to load toggle state:', e); }
        }
        function saveState(id, isCollapsed) {
            try {
                const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
                savedState[id] = isCollapsed;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
            } catch (e) { console.error('Failed to save toggle state:', e); }
        }
        document.querySelectorAll('.toggle-triangle[data-id]').forEach(triangle => {
            triangle.addEventListener('click', (e) => {
                const container = e.target.closest('.block-content[data-type="toggleListItem"]');
                if (container) {
                    const id = e.target.getAttribute('data-id');
                    container.classList.toggle('is-collapsed');
                    saveState(id, container.classList.contains('is-collapsed'));
                }
            });
        });
        loadState();
    });
<\/script>`;
            finalHtml += script;
        }

        // Inject script for Block Highlighting on exported pages
        if (isForExport) {
            const highlightScript = `
<script>
    document.addEventListener('DOMContentLoaded', () => {
        function highlightBlockFromHash() {
            try {
                // Clear any previous highlight first
                document.querySelectorAll('.is-highlighted').forEach(el => el.classList.remove('is-highlighted'));

                const hash = window.location.hash;
                if (!hash || hash.length < 2) return;
                
                const blockId = decodeURIComponent(hash.substring(1));
                const targetEl = document.querySelector(\`.block-container[data-id="\${blockId}"]\`);

                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    targetEl.classList.add('is-highlighted');

                    const removeHighlight = () => {
                        targetEl.classList.remove('is-highlighted');
                        document.removeEventListener('click', removeHighlight, true);
                        document.removeEventListener('keydown', removeHighlight, true);
                    };
                    setTimeout(() => {
                        document.addEventListener('click', removeHighlight, { once: true, capture: true });
                        document.addEventListener('keydown', removeHighlight, { once: true, capture: true });
                    }, 100);
                }
            } catch(e) { console.error('Failed to highlight block:', e); }
        }
        highlightBlockFromHash();
        window.addEventListener('hashchange', highlightBlockFromHash);
    });
<\/script>`;
            finalHtml += highlightScript;
        }

        return finalHtml;
    }



    // NEW Method for flexible popovers
    showCustomPopover({ targetElement, content, onOpen }) {
        // This is a global function now, defined in main.js.
        // But we are now passing `this.hidePopover.bind(this)` as part of the options,
        // so the custom content can close itself.
        window.showCustomPopover({ targetElement, content, onOpen, editor: this });
    }
    
    hidePopover() {
        // This is a global function now, defined in main.js
        window.hidePopover();
    }
}