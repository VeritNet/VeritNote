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
        this.toolbarGraceArea = document.getElementById('block-toolbar-grace-area');

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
        this._handleDocumentClickForMenu = null;
        
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
     * Renders a single block instance and its children.
     * This is a new helper for both full and partial rendering.
     * @param {Block} blockInstance The block instance to render.
     * @returns {HTMLElement} The rendered block element.
     * @private
     */
    _renderBlockInstance(blockInstance) {
        // The block's own render method creates the element
        const blockEl = blockInstance.render(); 
        // We no longer need to manually handle children here, 
        // as the block's .render() method now does that correctly.
        return blockEl;
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
        this.toolbarGraceArea.addEventListener('mouseover', () => clearTimeout(this.toolbarHideTimeout));
        this.toolbarGraceArea.addEventListener('mouseout', this._onBlockMouseOut.bind(this));

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


    deleteBlock(blockInstance, recordHistory = true) {
        const info = this._findBlockInstanceAndParent(blockInstance.id);
        if (info) {
            window.dispatchEvent(new CustomEvent('block:deleted', {
                detail: {
                    filePath: this.currentPagePath,
                    blockId: blockInstance.id
                }
            }));
            
            info.parentArray.splice(info.index, 1);
            
            let parentToUpdate = info.parentInstance;
            while(parentToUpdate) {
                const parentData = parentToUpdate.data;
                window.dispatchEvent(new CustomEvent('block:updated', {
                    detail: {
                        filePath: this.currentPagePath,
                        blockData: parentData
                    }
                }));
                const grandParentInfo = this._findBlockInstanceById(this.blocks, parentToUpdate.id);
                parentToUpdate = grandParentInfo ? grandParentInfo.parentBlock : null;
            }

            this._cleanupData();

            if (blockInstance.element && blockInstance.element.parentElement) {
                blockInstance.element.parentElement.removeChild(blockInstance.element);
            }

            // MODIFIED: Only record history if requested
            if (recordHistory) {
                this.emitChange(true, 'delete-block', null);
            }
        }
    }

    deleteMultipleBlocks(blockIds) {
        if (!blockIds || blockIds.length === 0) return;

        blockIds.forEach(id => {
            // CRITICAL: Check if the block still exists before trying to delete it.
            // This handles cases where a child is deleted because its parent was also in the selection.
            const blockInfo = this._findBlockInstanceAndParent(id);
            if (blockInfo) {
                // Call deleteBlock but tell it NOT to record history for each individual deletion.
                this.deleteBlock(blockInfo.block, false);
            }
        });

        // And now, record a SINGLE history event for the entire batch operation.
        this.emitChange(true, 'batch-delete', null);
    }



    _onClick(e) {
        const deleteButton = e.target.closest('.delete-btn');
        // 1. 高优先级检查：删除按钮
        if (deleteButton) {
            const blockContainerEl = deleteButton.closest('.block-container');
            if (blockContainerEl) {
                const blockId = blockContainerEl.dataset.id;
                // --- START BATCH DELETE LOGIC ---
                if (window.selectionManager && window.selectionManager.size() > 0 && window.selectionManager.has(blockId)) {
                    // If the clicked block is part of a selection, delete the whole selection.
                    const idsToDelete = window.selectionManager.get();
                    this.deleteMultipleBlocks(idsToDelete);
                    window.selectionManager.clear();
                } else {
                    // Otherwise, delete only this single block.
                    const blockInstance = this._findBlockInstanceAndParent(blockId)?.block;
                    if (blockInstance) { this.deleteBlock(blockInstance); }
                }
                // --- END BATCH DELETE LOGIC ---
            }
            return;
        }


        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            // If any multi-select key is pressed, do nothing and exit early.
            // The selection logic is handled in main.js's global mousedown listener.
            return; 
        }

        // 2. 高优先级检查：编辑器背景
        // (其余的 _onClick 逻辑保持不变)
        if (e.target === this.container) {
            this._onBackgroundClick();
            return;
        }

        if (e.target.matches('.block-content[data-type="column"]')) {
            const columnId = e.target.dataset.id;
            const columnInstance = this._findBlockInstanceAndParent(columnId)?.block;
            if (columnInstance) {
                this._appendNewBlockToContainer(columnInstance);
                return;
            }
        }

        const childrenContainer = e.target.closest('.block-children-container');
        if (childrenContainer) {
            const containerElement = childrenContainer.closest('[data-id]');
            const clickedBlockElement = e.target.closest('[data-id]');
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
        
        const newBlockEl = this._renderBlockInstance(newBlock);
        this.container.appendChild(newBlockEl);
        
        newBlock.focus();
        this.emitChange(true, 'create-block');
    }

    _appendNewBlockToContainer(containerBlock) {
        const newBlockInstance = this.createBlockInstance({ type: 'paragraph' });
        containerBlock.children.push(newBlockInstance);
       
        const newBlockEl = this._renderBlockInstance(newBlockInstance);
        // Find the correct DOM container for children
        const childrenContainerEl = containerBlock.element.querySelector('.block-children-container');
        if (childrenContainerEl) {
            childrenContainerEl.appendChild(newBlockEl);
        } else {
            // Fallback for containers without a dedicated children div
            containerBlock.element.appendChild(newBlockEl);
        }
        
        newBlockInstance.focus();
        this.emitChange(true, 'create-block');
    }
    
    // --- Block Manipulation API (for internal use) ---
    insertNewBlockAfter(targetBlock, type = 'paragraph') {
        const newBlockData = { type: type, content: '' };
        const newBlockInstance = this.createBlockInstance(newBlockData);
        if (!newBlockInstance) return;

        let targetElement = null;
        let parentElement = this.container;

        if (!targetBlock) {
            this.blocks.unshift(newBlockInstance);
            targetElement = this.container.firstChild;
        } else {
            const { parentInstance, parentArray, index } = this._findBlockInstanceAndParent(targetBlock.id);
            parentArray.splice(index + 1, 0, newBlockInstance);
            
            targetElement = targetBlock.element;
            if (parentInstance) {
                parentElement = parentInstance.childrenContainer || parentInstance.element;
            }
        }
        
        // --- Partial DOM update ---
        const newBlockEl = this._renderBlockInstance(newBlockInstance);
        if (targetElement) {
            parentElement.insertBefore(newBlockEl, targetElement.nextSibling);
        } else {
            parentElement.appendChild(newBlockEl);
        }
        
        newBlockInstance.focus();
        this.emitChange(true, 'insert-block');
    }
    
    // --- Command Menu ---
    showCommandMenuForBlock(blockInstance) {
        const blockEl = blockInstance.contentElement;
        if (!blockEl) return;

        const wasAlreadyVisible = this.commandMenu.style.display === 'block';

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

        if (!wasAlreadyVisible) {
            // Use a timeout to prevent the same click that opened the menu
            // from immediately closing it.
            setTimeout(() => {
                // Define the handler and store it
                this._handleDocumentClickForMenu = (e) => {
                    // If the click is outside the command menu, hide it
                    if (!this.commandMenu.contains(e.target)) {
                        this.hideCommandMenu();
                    }
                };
                // Add the listener to the document
                document.addEventListener('mousedown', this._handleDocumentClickForMenu);
            }, 0);
        }
    }

    hideCommandMenu() {
        if (this.commandMenu.style.display === 'block') {
            this.commandMenu.style.display = 'none';
            this.activeCommandBlock = null;
            this.commandMenuSelectedIndex = 0;

            if (this._handleDocumentClickForMenu) {
                document.removeEventListener('mousedown', this._handleDocumentClickForMenu);
                this._handleDocumentClickForMenu = null; // Clean up the reference
            }
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

        if (targetBlock.content.trim() === '/' || targetBlock.content.trim() === '') {
            // Transform the block in place
            const { parentArray, index } = this._findBlockInstanceAndParent(targetBlock.id);
            const newBlockData = { id: targetBlock.id, type: newType };
            const newBlockInstance = this.createBlockInstance(newBlockData);
            if (newBlockInstance) {
                parentArray.splice(index, 1, newBlockInstance);
                
                const oldEl = targetBlock.element;
                const newEl = this._renderBlockInstance(newBlockInstance);
                oldEl.parentElement.replaceChild(newEl, oldEl);
                
                newBlockInstance.focus();
            }
        } else {
            // Insert a new block after (reusing the new partial-rendering function)
            this.insertNewBlockAfter(targetBlock, newType);
        }

        this.hideCommandMenu();
        this.emitChange(true, 'create-block');
    }

    // --- Drag and Drop (Identical logic to the original, just adapted for block instances) ---
    _onDragStart(e) {
        const blockContainer = e.target.closest('.block-container');
        if (blockContainer) {
            const blockId = blockContainer.dataset.id;
            const isMultiDrag = window.selectionManager && window.selectionManager.size() > 1 && window.selectionManager.has(blockId);

            this.draggedBlock = blockContainer; // Keep this for visual feedback (opacity)

            if (isMultiDrag) {
                // --- MULTI-DRAG LOGIC ---
                // Get all selected IDs, but ensure the actually dragged block is first in the list.
                // This helps in re-ordering them correctly on drop.
                const selectedIds = window.selectionManager.get();
                const orderedIds = [blockId, ...selectedIds.filter(id => id !== blockId)];
                
                e.dataTransfer.setData('application/veritnote-block-ids', JSON.stringify(orderedIds));
                
                // Add a class to all selected blocks for visual feedback
                orderedIds.forEach(id => {
                    const el = this.container.querySelector(`.block-container[data-id="${id}"]`);
                    if (el) el.classList.add('is-dragging-ghost');
                });
                
            } else {
                // --- SINGLE-DRAG LOGIC (unchanged) ---
                window.selectionManager.clear(); // Clear selection if starting a single drag
                e.dataTransfer.setData('text/plain', blockId);
                setTimeout(() => blockContainer.style.opacity = '0.5', 0);
            }

            document.body.classList.add('is-dragging-block');
        }
    }

    _onDragOver(e) {
        e.preventDefault();
    
        const rightSidebar = e.target.closest('#right--sidebar');
        const referencesView = document.getElementById('references-view');
    
        if (e.target.closest('#right-sidebar')) {
            // Check if the references view is active.
            if (referencesView && referencesView.classList.contains('active')) {
                // It's the correct view, proceed as normal.
                this._cleanupDragIndicators();
                this.currentDropInfo = null;
                e.dataTransfer.dropEffect = 'copy';
                // ONLY dispatch the event if it's the correct view.
                window.dispatchEvent(new CustomEvent('block:dragover:right-sidebar')); 
            } else {
                // It's the wrong view (e.g., "Details"). Prohibit dropping.
                e.dataTransfer.dropEffect = 'none';
                // DO NOT dispatch the event, so no highlight will appear.
            }
            return; // IMPORTANT: Exit early.
        }
    
        // The rest of the _onDragOver function remains the same...
        const targetEl = e.target.closest('.block-container');
        
        // If not over a valid block, or over the dragged block itself, clean up and exit.
        if (!targetEl || targetEl === this.draggedBlock || (window.selectionManager && window.selectionManager.has(targetEl.dataset.id))) {
             this._cleanupDragIndicators();
             this.currentDropInfo = null;
            return;
        }
        
        // --- NEW: Four-Quadrant Overlay Logic ---
        this._showQuadrantOverlay(targetEl, e);

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
            const xZone = rect.width * 0.15; // 15% of width for left/right zones
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
        // --- Check for reference item drop at the very beginning ---
        const refItemDataStr = e.dataTransfer.getData('application/veritnote-reference-item');
        if (refItemDataStr) {
            e.preventDefault();
            this._cleanupDragIndicators();
            document.body.classList.remove('is-dragging-block');
            
            try {
                const refData = JSON.parse(refItemDataStr);
                this._handleReferenceItemDrop(e, refData);
            } catch (err) {
                console.error("Failed to parse reference item data:", err);
            }
            return; // Stop further execution of the drop handler
        }

        document.body.classList.remove('is-dragging-block');
        this.container.querySelectorAll('.is-dragging-ghost').forEach(el => el.classList.remove('is-dragging-ghost'));
        e.preventDefault();
        this._cleanupDragIndicators();
        
        if (this.draggedBlock) {
            this.draggedBlock.style.opacity = '1';
        }

        const multiDragData = e.dataTransfer.getData('application/veritnote-block-ids');
        const singleDragId = e.dataTransfer.getData('text/plain');

        if ((!multiDragData && !singleDragId) || !this.currentDropInfo) {
            this.draggedBlock = null;
            return;
        }

        const { targetId, position } = this.currentDropInfo;
        const targetBlockInfo = this._findBlockInstanceAndParent(targetId);
        if (!targetBlockInfo) {
             this.draggedBlock = null;
             return;
        }
        
        const draggedIds = multiDragData ? JSON.parse(multiDragData) : [singleDragId];
        if (draggedIds.includes(targetId)) return;

        draggedIds.forEach(id => {
            const blockInfo = this._findBlockInstanceAndParent(id);
            if (blockInfo?.block) blockInfo.block.syncContentFromDOM();
        });
        if (targetBlockInfo?.block) {
            targetBlockInfo.block.syncContentFromDOM();
        }

        const removedBlocks = [];
        const allBlockInfos = draggedIds.map(id => this._findBlockInstanceAndParent(id)).filter(Boolean);
        
        // --- NEW: Explicitly remove the old DOM elements before anything else ---
        allBlockInfos.forEach(info => {
            if (info.block.element && info.block.element.parentElement) {
                info.block.element.parentElement.removeChild(info.block.element);
            }
        });
        
        const blocksByParent = new Map();
        allBlockInfos.forEach(info => {
            const parentId = info.parentInstance ? info.parentInstance.id : 'root';
            if (!blocksByParent.has(parentId)) {
                blocksByParent.set(parentId, []);
            }
            blocksByParent.get(parentId).push(info);
        });

        blocksByParent.forEach(infos => {
            infos.sort((a, b) => b.index - a.index);
            infos.forEach(info => {
                const [removed] = info.parentArray.splice(info.index, 1);
                const originalIndex = draggedIds.indexOf(removed.id);
                removedBlocks[originalIndex] = removed;
            });
        });
        const finalRemovedBlocks = removedBlocks.filter(Boolean);

        // Re-find target info AFTER removal
        const finalTargetInfo = this._findBlockInstanceAndParent(targetId);
        if (!finalTargetInfo) {
            // If the target was a child of what we dragged, it might disappear.
            // A full render is a safe fallback here.
            this.render();
            this.draggedBlock = null;
            return;
        }
        const { block: targetBlockInstance, parentArray: toParentArray, index: toIndex, parentInstance: toParentInstance } = finalTargetInfo;

        // --- Perform insertion based on position ---
        let parentToRender = toParentInstance || { element: this.container, children: this.blocks };
        let containerElement = parentToRender.childrenContainer || parentToRender.element;
        let needsFullRender = false;

        switch (position) {
            case 'left':
            case 'right':
                this._handleColumnDrop(finalRemovedBlocks, targetBlockInstance, position);
                needsFullRender = true; // Column operations are complex, force full render
                break;
            case 'before':
                toParentArray.splice(toIndex, 0, ...finalRemovedBlocks);
                // Insert new DOM elements
                finalRemovedBlocks.reverse().forEach(block => { // reverse to insert in correct order
                    const newEl = this._renderBlockInstance(block);
                    containerElement.insertBefore(newEl, targetBlockInstance.element);
                });
                break;
            case 'after':
                toParentArray.splice(toIndex + 1, 0, ...finalRemovedBlocks);
                // Insert new DOM elements
                finalRemovedBlocks.forEach(block => {
                    const newEl = this._renderBlockInstance(block);
                    containerElement.insertBefore(newEl, targetBlockInstance.element.nextSibling);
                });
                break;
            case 'inside_last':
                if (targetBlockInstance.isContainer) {
                    targetBlockInstance.children.push(...finalRemovedBlocks);
                    // Update the drop target's container element
                    parentToRender = targetBlockInstance;
                    containerElement = parentToRender.childrenContainer || parentToRender.element;
                    // Insert new DOM elements
                    finalRemovedBlocks.forEach(block => {
                        const newEl = this._renderBlockInstance(block);
                        containerElement.appendChild(newEl);
                    });
                }
                break;
        }
        
        // --- Cleanup, render, save ---
        this.draggedBlock = null;
        this.currentDropInfo = null;
        window.selectionManager.clear();
        
        const structuralChange = this._cleanupData();
        
        if (needsFullRender || structuralChange) {
            this.render();
        } else {
            this._postRenderProcess();
        }
        
        this.emitChange(true, 'drag-drop-reorder');
    }

    _handleReferenceItemDrop(event, refData) {
        if (!this.currentDropInfo) return;
        const { targetId, position } = this.currentDropInfo;
        const targetBlockInfo = this._findBlockInstanceAndParent(targetId);
        if (!targetBlockInfo) return;

        const popoverAnchor = document.createElement('div');
        popoverAnchor.style.position = 'fixed';
        popoverAnchor.style.top = `${event.clientY}px`;
        popoverAnchor.style.left = `${event.clientX}px`;
        popoverAnchor.style.width = '1px';
        popoverAnchor.style.height = '1px';
        this.container.appendChild(popoverAnchor);

        window.showReferenceDropPopover({
            targetElement: popoverAnchor,
            callback: (action) => {
                this._executeReferenceDropAction(action, refData, targetBlockInfo, position);
            }
        });

        // --- The global mousedown listener in main.js will call hidePopover.
        // We just need to ensure hidePopover knows about our anchor. ---
        const originalHidePopover = window.hidePopover;
        window.hidePopover = () => {
            originalHidePopover(popoverAnchor); // Pass the anchor to be cleaned
            window.hidePopover = originalHidePopover; // Restore the original function
        };

        // If popover is closed by any means (e.g. Esc key in future), ensure cleanup
        const cleanup = () => {
            window.hidePopover = originalHidePopover; // Restore in case it wasn't closed by click
            if (popoverAnchor.parentElement) {
                popoverAnchor.parentElement.removeChild(popoverAnchor);
            }
        }
        window.addEventListener('popoverClosed', cleanup, { once: true });
    }

    _executeReferenceDropAction(action, refData, targetBlockInfo, position) {
        let newBlockInstance;

        switch (action) {
            case 'createQuote':
                newBlockInstance = this.createBlockInstance({
                    type: 'quote',
                    properties: {
                        referenceLink: `${refData.filePath}#${refData.blockData.id}`
                    }
                });
                break;

            case 'createCopy':
                // Deep copy the block data, but generate a new ID for the top-level block and all its children
                const deepCopyAndNewIds = (blockData) => {
                    const newBlock = JSON.parse(JSON.stringify(blockData)); // Simple deep copy
                    newBlock.id = this._generateUUID(); // Assign new ID
                    if (newBlock.children && newBlock.children.length > 0) {
                        newBlock.children.forEach(child => deepCopyAndNewIds(child));
                    }
                    return newBlock;
                };
                const copiedBlockData = deepCopyAndNewIds(refData.blockData);
                newBlockInstance = this.createBlockInstance(copiedBlockData);
                break;

            case 'createLink':
                newBlockInstance = this.createBlockInstance({
                    type: 'paragraph',
                    content: `<a href="${refData.filePath}#${refData.blockData.id}">Link To Block</a>`
                });
                break;
            
            default:
                return; // Do nothing if action is unknown
        }

        if (!newBlockInstance) return;

        // --- Now, insert the newly created block at the correct position ---
        this._insertBlockAtPosition(newBlockInstance, targetBlockInfo, position);
        this.emitChange(true, `ref-drop-${action}`);
    }

    // --- A helper function to insert a block instance based on drop info ---
    _insertBlockAtPosition(blockToInsert, targetInfo, position) {
        const { block: targetBlockInstance, parentArray: toParentArray, index: toIndex, parentInstance: toParentInstance } = targetInfo;
        let containerElement = (toParentInstance ? toParentInstance.childrenContainer : this.container) || this.container;

        const newEl = this._renderBlockInstance(blockToInsert);

        switch (position) {
            case 'before':
                toParentArray.splice(toIndex, 0, blockToInsert);
                containerElement.insertBefore(newEl, targetBlockInstance.element);
                break;
            case 'after':
                toParentArray.splice(toIndex + 1, 0, blockToInsert);
                containerElement.insertBefore(newEl, targetBlockInstance.element.nextSibling);
                break;
            case 'inside_last':
                if (targetBlockInstance.isContainer) {
                    targetBlockInstance.children.push(blockToInsert);
                    const targetContainerEl = targetBlockInstance.childrenContainer || targetBlockInstance.element;
                    targetContainerEl.appendChild(newEl);
                } else {
                    // Fallback: if dropped 'inside' a non-container, treat it as 'after'
                    toParentArray.splice(toIndex + 1, 0, blockToInsert);
                    containerElement.insertBefore(newEl, targetBlockInstance.element.nextSibling);
                }
                break;
            case 'left':
            case 'right':
                // For simplicity in this new feature, we'll treat side-drops as a full-render operation
                this._handleColumnDrop([blockToInsert], targetBlockInstance, position);
                this.render();
                break;
        }

        // For simple insertions, focus the new element if it's focusable
        if (newEl && typeof blockToInsert.focus === 'function') {
            blockToInsert.focus();
        }
    }

    _onDragEnd(e) {
        document.body.classList.remove('is-dragging-block');
        this.container.querySelectorAll('.is-dragging-ghost').forEach(el => el.classList.remove('is-dragging-ghost'));
        this._cleanupDragIndicators();
        
        if (this.draggedBlock) {
            this.draggedBlock.style.opacity = '1';
            this.draggedBlock = null;
        }
    }
    
    // *** column drop logic ***
    _handleColumnDrop(draggedBlocks, targetBlockInstance, position) {
        const { parentArray, index: targetIndex, parentInstance } = this._findBlockInstanceAndParent(targetBlockInstance.id);

        // Scene A: Target is already a column inside a Columns block.
        if (parentInstance && parentInstance.type === 'columns') {
            // Create a new column to hold the dropped blocks
            const newColumn = this.createBlockInstance({ type: 'column' });
            newColumn.children.push(...draggedBlocks);
            
            // Insert the new column next to the target column
            const insertIndex = position === 'left' ? targetIndex : targetIndex + 1;
            parentInstance.children.splice(insertIndex, 0, newColumn);
            
            // Rebalance widths of all columns in the container
            const numCols = parentInstance.children.length;
            parentInstance.children.forEach(col => col.properties.width = 1 / numCols);
        } else {
            // Scene B: Two or more blocks merge into a brand new Columns block.
            
            // First, create a column for the target block
            const targetColumn = this.createBlockInstance({ type: 'column' });
            targetColumn.children.push(targetBlockInstance);
            
            // Second, create a column for ALL the dragged blocks
            const draggedColumn = this.createBlockInstance({ type: 'column' });
            draggedColumn.children.push(...draggedBlocks);
            
            // Third, create the main Columns container
            const newColumnsContainer = this.createBlockInstance({ type: 'columns' });
            
            // Arrange the new columns based on the drop position
            if (position === 'left') {
                newColumnsContainer.children.push(draggedColumn, targetColumn);
            } else { // 'right'
                newColumnsContainer.children.push(targetColumn, draggedColumn);
            }
            
            // Finally, replace the original target block with the new columns container in the DOM tree
            parentArray.splice(targetIndex, 1, newColumnsContainer);
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
                    // --- NEW: Keep track of columns to remove from DOM ---
                    const columnsToRemoveFromDOM = [];

                    const originalColumnCount = block.children.length;
                
                    // 规则 A: 过滤掉空的子列
                    block.children = block.children.filter(col => {
                        if (col.children.length > 0) {
                            return true;
                        } else {
                            // If column is empty, mark its element for removal
                            if (col.element) {
                                columnsToRemoveFromDOM.push(col.element);
                            }
                            return false;
                        }
                    });

                    // --- NEW: Perform the DOM removal ---
                    columnsToRemoveFromDOM.forEach(el => el.parentElement?.removeChild(el));

                    const newColumnCount = block.children.length;
                    const columnsWereRemoved = newColumnCount < originalColumnCount;

                    if (columnsWereRemoved) {
                        structuralChange = true;
                    }

                    const info = this._findBlockInstanceAndParent(block.id);
                    if (!info) continue;

                    if (newColumnCount === 0) {
                        // 规则 B: 如果完全空了，删除整个 columns 容器
                        if (block.element) block.element.parentElement?.removeChild(block.element);
                        info.parentArray.splice(info.index, 1);
                    } else if (newColumnCount === 1) {
                        // 规则 C: 如果只剩一列，将其子元素“提升”出来，替换掉 columns 容器
                        const survivingBlocks = block.children[0].children;
                        // First, update the data model
                        info.parentArray.splice(info.index, 1, ...survivingBlocks);
                        
                        // Then, update the DOM
                        if (block.element) {
                            const parentEl = block.element.parentElement;
                            const survivingBlockElements = survivingBlocks.map(b => this._renderBlockInstance(b));
                            block.element.replaceWith(...survivingBlockElements);
                        }

                    } else if (columnsWereRemoved) {
                        // 关键修复：只有在列数实际减少时，才重新平衡宽度
                        const numCols = block.children.length;
                        block.children.forEach(col => {
                           col.properties.width = 1 / numCols;
                           // Also update the DOM style directly
                           if(col.element) {
                               col.element.style.width = `${col.properties.width * 100}%`;
                           }
                        });
                    }
                }
            }
        };
    
        traverseAndClean(this.blocks, null);
    
        return structuralChange;
    }

    // --- Drag & Drop Visual Helpers (Identical logic) ---
    _cleanupDragIndicators() {
        // Now also removes the new overlay
        this.container.querySelectorAll('.drop-indicator, .drop-indicator-vertical, .quadrant-overlay').forEach(el => el.remove());
    }

    // --- NEW: Quadrant Overlay Method ---
    _showQuadrantOverlay(targetEl, event) {
        // First, ensure no old indicators or overlays exist
        this._cleanupDragIndicators();

        const overlay = document.createElement('div');
        overlay.className = 'quadrant-overlay';

        // Create the visual elements for the quadrant lines and backgrounds
        overlay.innerHTML = `
            <div class="quadrant-bg" data-quadrant="top"></div>
            <div class="quadrant-bg" data-quadrant="bottom"></div>
            <div class="quadrant-bg" data-quadrant="left"></div>
            <div class="quadrant-bg" data-quadrant="right"></div>
            <div class="quadrant-line-h"></div>
            <div class="quadrant-line-v"></div>
        `;

        targetEl.appendChild(overlay);

        // --- Highlight the active quadrant based on mouse position ---
        const rect = targetEl.getBoundingClientRect();
        const yMidpoint = rect.top + rect.height / 2;
        const xZone = rect.width * 0.15;

        // Find and remove any existing 'active' class
        const activeBg = overlay.querySelector('.quadrant-bg.active');
        if (activeBg) activeBg.classList.remove('active');

        // Determine and set the new active quadrant
        let activeQuadrant = null;
        if (event.clientX < rect.left + xZone) {
            activeQuadrant = 'left';
        } else if (event.clientX > rect.right - xZone) {
            activeQuadrant = 'right';
        } else if (event.clientY < yMidpoint) {
            activeQuadrant = 'top';
        } else {
            activeQuadrant = 'bottom';
        }
        
        const newActiveBg = overlay.querySelector(`.quadrant-bg[data-quadrant="${activeQuadrant}"]`);
        if (newActiveBg) {
            newActiveBg.classList.add('active');
        }
    }

    _showHorizontalIndicator(targetEl, position) {
        this._cleanupDragIndicators(); // Clean up here to ensure only one indicator exists
        const indicator = document.createElement('div');
        indicator.className = 'drop-indicator';
        
        // --- THE FIX ---
        // Instead of setting left/width, we make it a block element and let it
        // be positioned relative to its new parent in the DOM.
        indicator.style.width = '100%'; // It should span the full width of its container context.
        indicator.style.position = 'relative'; // Ensure it flows within the document layout.
        
        if (position === 'before') {
             targetEl.parentElement.insertBefore(indicator, targetEl);
        } else if (position === 'after') {
            // insertAfter logic
            targetEl.parentElement.insertBefore(indicator, targetEl.nextSibling);
        } else if (position === 'inside_last') {
            const contentWrapper = targetEl.querySelector('.callout-content-wrapper, .block-content[data-type="column"]');
            if (contentWrapper) {
                indicator.style.width = 'auto'; // Let it fit inside the container
                indicator.style.margin = '0 4px'; // Add some margin
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
            // Also check if the mouse is over the new grace area
            if (!this.toolbar.matches(':hover') && 
                !this.toolbarGraceArea.matches(':hover') && 
                !this.container.querySelector('.block-container:hover')) {
                this._hideBlockToolbar();
            }
        }, 300); // A slightly longer delay can also help
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
            let isToolbarAbove = true;
            if (top < editorRect.top) {
                top = blockRect.bottom + 5;
                isToolbarAbove = false;
            }
            let left = blockRect.left + (blockRect.width / 2) - (toolbarWidth / 2);
            if (left < editorRect.left) left = editorRect.left;
            if (left + toolbarWidth > editorRect.right) left = editorRect.right - toolbarWidth;
            
            this.toolbar.style.top = `${top}px`;
            this.toolbar.style.left = `${left}px`;
            this.toolbar.style.display = 'flex';

            // --- NEW: Calculate and display the grace area ---
            const graceArea = this.toolbarGraceArea;
            graceArea.style.left = `${left}px`;
            graceArea.style.width = `${toolbarWidth}px`;
            
            if (isToolbarAbove) {
                // Grace area is between toolbar and block
                graceArea.style.top = `${top + toolbarHeight}px`;
                graceArea.style.height = `${blockRect.top - (top + toolbarHeight)}px`;
            } else {
                // Grace area is between block and toolbar
                graceArea.style.top = `${blockRect.bottom}px`;
                graceArea.style.height = `${top - blockRect.bottom}px`;
            }
            graceArea.style.display = 'block';
        });
    }

    _hideBlockToolbar() {
        this.toolbar.style.display = 'none';
        // NEW: Hide the grace area along with the toolbar
        this.toolbarGraceArea.style.display = 'none';

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

    
    async getSanitizedHtml(isForExport = false, workspaceRoot = '', options = {}, imageSrcMap = {}, quoteContentCache = new Map()) {
        
        // --- THE CORE FIX: Instead of cloning the live DOM, we generate a fresh, clean DOM from the source data. ---
        const cleanContainer = document.createElement('div');
        const tempEditor = new Editor(cleanContainer);
        registerAllBlocks(tempEditor);

        // Load the current page's data into this temporary, clean editor instance.
        // this.getBlocksForSaving() ensures we get the most up-to-date data model.
        tempEditor.load({ path: this.currentPagePath, content: this.getBlocksForSaving() });
        
        // From now on, we operate on 'cleanContainer', not the live 'this.container'.
        const clonedContainer = cleanContainer;
        // --- END OF THE CORE FIX ---


        // --- 1. Standard Cleanup (now partially redundant, but kept for safety) ---
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
        // This logic is now more complex because we are working with a detached DOM. We need to get state from the live DOM.
        clonedContainer.querySelectorAll('.block-content[data-type="todoListItem"]').forEach(clonedTodoEl => {
            const blockId = clonedTodoEl.dataset.id;
            const originalBlockInstance = this._findBlockInstanceById(this.blocks, blockId)?.block;
            if (originalBlockInstance && originalBlockInstance.properties.checked) {
                const clonedCheckbox = clonedTodoEl.querySelector('.todo-checkbox');
                const clonedTextEl = clonedTodoEl.querySelector('.list-item-text-area');
                if (clonedCheckbox) clonedCheckbox.setAttribute('checked', '');
                if (clonedTextEl) clonedTextEl.classList.add('todo-checked');
            }
             if (isForExport) {
                const clonedCheckbox = clonedTodoEl.querySelector('.todo-checkbox');
                if (clonedCheckbox) clonedCheckbox.setAttribute('data-id', `todo-${blockId}`);
            }
        });

        clonedContainer.querySelectorAll('.block-content[data-type="toggleListItem"]').forEach(clonedToggleEl => {
            const blockId = clonedToggleEl.dataset.id;
            const originalBlockInstance = this._findBlockInstanceById(this.blocks, blockId)?.block;
            if (originalBlockInstance && originalBlockInstance.properties.isCollapsed) {
                clonedToggleEl.classList.add('is-collapsed');
            }
             if (isForExport) {
                const toggleTriangle = clonedToggleEl.querySelector('.toggle-triangle');
                if (toggleTriangle) toggleTriangle.setAttribute('data-id', `toggle-${blockId}`);
            } else {
                 const toggleTriangle = clonedToggleEl.querySelector('.toggle-triangle');
                 if (toggleTriangle) {
                    const onclickScript = "this.closest('.block-content[data-type=\"toggleListItem\"]').classList.toggle('is-collapsed');";
                    toggleTriangle.setAttribute('onclick', onclickScript);
                 }
            }
        });


        // --- 3. Block-Specific Interactive Element Processing ---
        // This logic remains the same, but now operates on the clean DOM.
        clonedContainer.querySelectorAll('.block-content[data-type="image"]').forEach(imageContentEl => {
            const blockId = imageContentEl.dataset.id;
            const originalBlock = this._findBlockInstanceById(this.blocks, blockId)?.block;
            if (originalBlock && originalBlock.properties.href) {
                const imgTag = imageContentEl.querySelector('img');
                if (imgTag) {
                    const linkWrapper = document.createElement('a');
                    linkWrapper.setAttribute('href', originalBlock.properties.href);
                    imgTag.parentNode.insertBefore(linkWrapper, imgTag);
                    linkWrapper.appendChild(imgTag);
                }
            }
        });

        clonedContainer.querySelectorAll('.block-container').forEach(blockContainerEl => {
            const quoteContentEl = blockContainerEl.querySelector('.block-content[data-type="quote"]');
            if (quoteContentEl) {
                const blockId = quoteContentEl.dataset.id;
                const originalBlock = this._findBlockInstanceById(this.blocks, blockId)?.block;
                if (originalBlock && originalBlock.properties.clickLink) {
                    const linkWrapper = document.createElement('a');
                    linkWrapper.setAttribute('href', originalBlock.properties.clickLink);
                    linkWrapper.className = 'quote-click-wrapper';
                    blockContainerEl.parentNode.insertBefore(linkWrapper, blockContainerEl);
                    linkWrapper.appendChild(blockContainerEl);
                }
            }
        });

        // --- 4. Universal Link/Image/etc Processing ---
        // This logic remains the same.
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
                } else {
                    el.setAttribute('href', '#');
                    el.setAttribute('data-internal-link', href);
                    el.classList.add('internal-link');
                }
            }
        });
        
        clonedContainer.querySelectorAll('img').forEach(el => {
            const originalPath = el.getAttribute('src');
            if (!originalPath) return;
            if (isForExport && imageSrcMap[originalPath]) {
                el.setAttribute('src', imageSrcMap[originalPath]);
                return;
            }
        });


        // Static rendering for Quote Blocks during export
        if (isForExport) {
            const quoteBlocks = clonedContainer.querySelectorAll('.block-content[data-type="quote"]');
            for (const quoteEl of quoteBlocks) {
                const blockId = quoteEl.dataset.id;
                // We use the 'live' editor instance to get the properties
                const originalBlockInstance = this._findBlockInstanceById(this.blocks, blockId)?.block;
                if (originalBlockInstance && originalBlockInstance.properties.referenceLink) {
                    const referenceLink = originalBlockInstance.properties.referenceLink;
                    const cachedContent = quoteContentCache.get(referenceLink);
                    const previewContainer = quoteEl.querySelector('.quote-preview-container');
                    if (previewContainer) {
                        previewContainer.innerHTML = ''; 
                        if (cachedContent) {
                            const tempRenderDiv = document.createElement('div');
                            const tempRenderEditor = new Editor(tempRenderDiv); // Use a different name to avoid confusion
                            registerAllBlocks(tempRenderEditor);
                            tempRenderEditor.load({ path: 'temp', content: cachedContent });
                            const quotedHtml = tempRenderEditor.getSanitizedHtml(isForExport, workspaceRoot, options, imageSrcMap, quoteContentCache); 
                            previewContainer.innerHTML = await quotedHtml;
                        } else {
                            previewContainer.innerHTML = '<div class="quote-error-placeholder">Referenced content could not be found.</div>';
                        }
                    }
                }
            }
        }
        
        // --- 5. Final HTML Assembly & Script Injection ---
        // The rest of the function remains the same.
        let finalHtml = clonedContainer.innerHTML;

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

        if (isForExport) {
            const highlightScript = `
<script>
    document.addEventListener('DOMContentLoaded', () => {
        function highlightBlockFromHash() {
            try {
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



    _generateUUID() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }
}