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
    emitChange(recordHistory = true, actionType = 'unknown') {
        if (recordHistory && !this.history.isUndoingOrRedoing) {
            this.history.record(actionType);
        }
        // This event now ONLY signals "unsaved changes" status to main.js
        window.dispatchEvent(new CustomEvent('editor:change'));
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
            info.parentArray.splice(info.index, 1);
            
            // *** FIX: Call cleanup immediately after deletion. ***
            this._cleanupData();
            
            this.render();
            this.emitChange(true, 'delete-block');
        }
    }

    
    _onClick(e) {
        // *** FIX: Simplified and more robust logic for clicking container whitespace ***
        if (e.target.matches('.callout-content-wrapper, .block-content[data-type="column"]')) {
            const containerId = e.target.closest('[data-id]').dataset.id;
            const containerInstance = this._findBlockInstanceAndParent(containerId)?.block;
            if (containerInstance) {
                this._appendNewBlockToContainer(containerInstance);
                return; 
            }
        }
        
        const blockContainerEl = e.target.closest('.block-container');
        if (!blockContainerEl) {
            if (e.target === this.container) {
                this._onBackgroundClick();
            }
            return;
        }

        if (e.target.classList.contains('delete-btn')) {
            const blockContainerEl = e.target.closest('.block-container');
            const blockInstance = this._findBlockInstanceAndParent(blockContainerEl.dataset.id)?.block;
            if (blockInstance) {
                // *** FIX: Use the centralized deleteBlock method ***
                this.deleteBlock(blockInstance);
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

    deleteBlock(blockToDelete, focusPrevious = false) {
        const { parent, index } = this._findBlockInstanceById(this.blocks, blockToDelete.id);
        if (parent) {
            parent.splice(index, 1);
            
            // Focus logic
            if (focusPrevious) {
                const prevBlock = parent[index - 1] || (this._findBlockInstanceById(this.blocks, blockToDelete.id)?.parentBlock);
                if (prevBlock) {
                    prevBlock.focus();
                }
            }

            this._cleanupData();
            this.render();
            this.emitChange();
        }
    }
    
    // --- Command Menu ---
    showCommandMenuForBlock(blockInstance) {
        const blockEl = blockInstance.contentElement;
        if (!blockEl) return;

        const rect = blockEl.getBoundingClientRect();
        this.commandMenu.style.left = `${rect.left}px`;
        this.commandMenu.style.top = `${rect.bottom}px`;
        this.commandMenu.style.display = 'block';
        this.activeCommandBlock = blockInstance;
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
        }
    }

    _onDragOver(e) {
        e.preventDefault();
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
    
    _onDragLeave(e) { /* No change needed */ }

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
        e.preventDefault();
        this._cleanupDragIndicators();
        if (this.draggedBlock) this.draggedBlock.style.opacity = '1';

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
            // Traverse from the end to avoid index issues when removing items
            for (let i = blocks.length - 1; i >= 0; i--) {
                const block = blocks[i];

                // Step 1: Recurse down to the deepest level first
                if (block.children && block.children.length > 0) {
                    traverseAndClean(block.children, block);
                }

                // Step 2: Now, evaluate the current block
                if (block.type === 'columns') {
                    // Rule A: If a columns container has no columns left, remove it.
                    if (block.children.length === 0) {
                        blocks.splice(i, 1);
                        structuralChange = true;
                        continue; // Move to the next block in the parent
                    }
                    
                    // Rule B: If it has only one column left, dissolve the container
                    // and promote the column's children to this level.
                    if (block.children.length === 1) {
                        const survivingBlocks = block.children[0].children;
                        blocks.splice(i, 1, ...survivingBlocks);
                        structuralChange = true;
                        continue;
                    }

                    // Rule C: If multiple columns remain, rebalance their widths.
                    // This is not a structural change, but good hygiene.
                    const numCols = block.children.length;
                    block.children.forEach(col => col.properties.width = 1 / numCols);
                }
                
                // Rule D: If a column is now empty, it should be removed.
                // This check happens after we've potentially cleaned up its children.
                if (block.type === 'column' && block.children.length === 0) {
                    // The parent of a column is always a 'columns' block
                    if (parent && parent.type === 'columns') {
                        blocks.splice(i, 1);
                        structuralChange = true;
                    }
                }
            }
        };
        
        // Start the process from the root blocks
        traverseAndClean(this.blocks, null);
        
        return structuralChange;
    }

    // And update the centralized delete method to re-render if needed
    deleteBlock(blockInstance, focusPrevious = false) {
        const info = this._findBlockInstanceAndParent(blockInstance.id);
        if (info) {
            const { parentArray, index } = info;
            parentArray.splice(index, 1);

            // After deletion, run cleanup. It returns true if the structure was changed.
            const structureChanged = this._cleanupData();
            
            // Always re-render after a deletion or structural change.
            this.render();
            this.emitChange();
            
            // Future logic for focusing can be added here
            // For example, find the block at `index - 1` and focus it.
        }
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
        resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const leftInitialWidth = leftColumn.properties.width;
            const rightInitialWidth = rightColumn.properties.width;
            const leftEl = leftColumn.contentElement;
            const rightEl = rightColumn.contentElement;

            const onMouseMove = (moveEvent) => {
                const deltaX = moveEvent.clientX - startX;
                const parentWidth = resizer.parentElement.offsetWidth;
                if (parentWidth === 0) return;
                const deltaPercentage = deltaX / parentWidth;
                let newLeftWidth = leftInitialWidth + deltaPercentage;
                let newRightWidth = rightInitialWidth - deltaPercentage;
                if (newLeftWidth < 0.1 || newRightWidth < 0.1) return;
                leftEl.style.width = `${newLeftWidth * 100}%`;
                rightEl.style.width = `${newRightWidth * 100}%`;
            };
            const onMouseUp = (upEvent) => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                const deltaX = upEvent.clientX - startX;
                const parentWidth = resizer.parentElement.offsetWidth;
                const deltaPercentage = deltaX / parentWidth;
                let finalLeftWidth = leftInitialWidth + deltaPercentage;
                let finalRightWidth = rightInitialWidth - deltaPercentage;
                if (finalLeftWidth < 0.1) {
                    finalRightWidth += finalLeftWidth - 0.1;
                    finalLeftWidth = 0.1;
                }
                if(finalRightWidth < 0.1) {
                    finalLeftWidth += finalRightWidth - 0.1;
                    finalRightWidth = 0.1;
                }
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
                this.richTextEditingState = { isActive: true, blockId: blockInstance.id, savedRange: this.currentSelection };
                window.dispatchEvent(new CustomEvent('showLinkPopover', { detail: {
                    targetElement: button,
                    existingValue: this.currentSelection?.commonAncestorContainer.parentNode.href || '',
                    callback: (value) => {
                        forceRestoreAndExecute(value ? 'createLink' : 'unlink', value || undefined);
                    }
                }}));
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

    getSanitizedHtml(isForExport = false, workspaceRoot = '') {
        const clonedContainer = this.container.cloneNode(true);
        clonedContainer.querySelectorAll('.block-controls, .column-resizer, .drop-indicator, .drop-indicator-vertical').forEach(el => el.remove());
        clonedContainer.querySelectorAll('[contentEditable="true"]').forEach(el => {
            el.removeAttribute('contentEditable');
            el.removeAttribute('data-placeholder');
        });
        clonedContainer.querySelectorAll('.toolbar-active').forEach(el => el.classList.remove('toolbar-active'));
        clonedContainer.querySelectorAll('a').forEach(a => {
            let href = a.getAttribute('href');
            if (href && href.endsWith('.veritnote')) {
                if (isForExport) {
                    const relativePath = href.substring(workspaceRoot.length + 1).replace(/\\/g, '/');
                    a.setAttribute('href', relativePath.replace('.veritnote', '.html'));
                } else {
                    a.setAttribute('href', '#');
                    a.setAttribute('onclick', `window.chrome.webview.postMessage({ action: 'loadPage', payload: { path: '${href.replace(/\\/g, '\\\\')}', fromPreview: true } }); return false;`);
                }
            }
        });
        return clonedContainer.innerHTML;
    }


    // NEW Method for flexible popovers
    showCustomPopover({ targetElement, content, onOpen }) {
        const popover = document.getElementById('popover');
        const popoverContent = popover.querySelector('.popover-content');

        // Hide all standard internal elements
        popover.querySelectorAll('#popover-input-group, #popover-search-results, #popover-color-picker').forEach(el => {
            el.style.display = 'none';
        });

        // Clear previous custom content
        popover.querySelectorAll('.custom-popover-content').forEach(el => el.remove());

        // Add our new content
        const customWrapper = document.createElement('div');
        customWrapper.className = 'custom-popover-content';
        customWrapper.innerHTML = content;
        popoverContent.appendChild(customWrapper);

        // Position and show the popover
        const rect = targetElement.getBoundingClientRect();
        popover.style.top = `${rect.bottom + 5}px`;
        if (rect.left + 320 > window.innerWidth) { // Assuming 320px width
            popover.style.left = `${window.innerWidth - 330}px`;
        } else {
            popover.style.left = `${rect.left}px`;
        }
        popover.style.display = 'block';

        // Call the setup callback
        if (typeof onOpen === 'function') {
            onOpen();
        }
    }
    
    hidePopover() {
        const popover = document.getElementById('popover');
        if (popover.style.display === 'block') {
            popover.style.display = 'none';
            // Clean up custom content to prevent conflicts
            popover.querySelectorAll('.custom-popover-content').forEach(el => el.remove());
        }
    }
}