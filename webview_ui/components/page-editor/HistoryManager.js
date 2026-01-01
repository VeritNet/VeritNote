// js/HistoryManager.js
class HistoryManager {
    constructor(editor, maxStackSize = 100) {
        this.editor = editor;
        this.maxStackSize = maxStackSize;
        
        this.undoStack = [];
        this.redoStack = [];

        this.isUndoingOrRedoing = false; // A flag to prevent cycles
        this.coalescingTimeout = null;
        this.lastActionType = null;
    }

    /**
     * Pushes a new state to the undo stack.
     * This should be called after any significant change.
     * @param {string} actionType - A type identifier for the action (e.g., 'typing', 'delete-block').
     */
    record(actionType = 'unknown') {
        if (this.isUndoingOrRedoing) {
            return;
        }

        // --- Action Coalescing for typing ---
        // If the new action is 'typing' and the last action was also 'typing',
        // instead of pushing a new state, we update the latest state after a delay.
        if (actionType === 'typing' && this.lastActionType === 'typing' && this.undoStack.length > 0) {
            clearTimeout(this.coalescingTimeout);
            this.coalescingTimeout = setTimeout(() => {
                // Update the most recent snapshot with the final text.
                this.undoStack[this.undoStack.length - 1] = this._createSnapshot();
                this.lastActionType = null; // End coalescing period
            }, 500); // 500ms delay to group typing actions
            return; // Don't push a new state immediately
        }
        
        clearTimeout(this.coalescingTimeout); // Any non-typing action clears the timeout

        // --- Standard recording ---
        const snapshot = this._createSnapshot();
        
        // Prevent recording identical states
        if (this.undoStack.length > 0 && this.undoStack[this.undoStack.length - 1] === snapshot) {
            return;
        }

        this.undoStack.push(snapshot);
        this.redoStack = []; // Any new action clears the redo stack

        // Enforce max stack size
        if (this.undoStack.length > this.maxStackSize) {
            this.undoStack.shift(); // Remove the oldest entry
        }
        
        this.lastActionType = actionType;
        // console.log(`Recorded: ${actionType}. Undo stack size: ${this.undoStack.length}`);
    }

    undo() {
        if (this.undoStack.length <= 1) { // Keep the initial state
            return;
        }

        this.isUndoingOrRedoing = true;
        
        const currentState = this.undoStack.pop();
        this.redoStack.push(currentState);

        const prevState = this.undoStack[this.undoStack.length - 1];
        this._applySnapshot(prevState);

        this.isUndoingOrRedoing = false;
        this.editor.emitChange(false); // Emit change, but don't record history
        // console.log(`Undo. Undo stack: ${this.undoStack.length}, Redo stack: ${this.redoStack.length}`);
    }

    redo() {
        if (this.redoStack.length === 0) {
            return;
        }
        
        this.isUndoingOrRedoing = true;

        const nextState = this.redoStack.pop();
        this.undoStack.push(nextState);

        this._applySnapshot(nextState);

        this.isUndoingOrRedoing = false;
        this.editor.emitChange(false); // Emit change, but don't record history
        // console.log(`Redo. Undo stack: ${this.undoStack.length}, Redo stack: ${this.redoStack.length}`);
    }
    
    /**
     * Clears all history. Called when a new page is loaded.
     */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this.lastActionType = null;
        clearTimeout(this.coalescingTimeout);
    }
    
    /**
     * Records the initial state of the editor when a page is loaded.
     */
    recordInitialState() {
        this.clear();
        // We need to wait a tick for the editor to fully render and load
        setTimeout(() => {
            const initialState = this._createSnapshot();
            this.undoStack.push(initialState);
        }, 0);
    }

    _createSnapshot() {
        return JSON.stringify(this.editor.getBlocksForSaving());
    }

    _applySnapshot(snapshot) {
        if (!snapshot) return;
        const pageContent = JSON.parse(snapshot);

        // 1. 用快照中的数据替换编辑器当前的 blocks 数组
        this.editor.blocks = pageContent.map(data => this.editor.createBlockInstance(data)).filter(Boolean);
        // 2. 确保所有根级块的 parent 属性为 null
        this.editor.blocks.forEach(block => block.parent = null);
        // 3. 调用编辑器的 render 方法，用新的 blocks 数组完全重构 DOM
        this.editor.render();

        // DOM 重绘后，原来的元素没了，需要根据 ID 重新把 .is-selected 加回去
        // 并且强制刷新细节面板，让它读取新的 block 实例数据
        if (this.editor.PageSelectionManager) {
            this.editor.PageSelectionManager.validateAndRefresh();
        }

        if (this.editor.referenceManager) {
            const allBlockData = this.editor.getBlocksForSaving();
            this.editor.referenceManager.handleHistoryChange(this.editor.filePath, allBlockData);
        }

        // 这个事件对于让 ReferenceManager 等其他模块同步状态至关重要
        window.dispatchEvent(new CustomEvent('history:applied', {
            detail: {
                filePath: this.editor.currentPagePath,
                allBlockData: this.editor.getBlocksForSaving()
            }
        }));
    }
}