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
        
        this.editor.load({
            path: this.editor.currentPagePath,
            content: pageContent
        });

        // ** NEW: Dispatch a global update event after history change **
        // This tells listeners like ReferenceManager to re-check everything.
        window.dispatchEvent(new CustomEvent('history:applied', {
            detail: {
                filePath: this.editor.currentPagePath,
                allBlockData: this.editor.getBlocksForSaving() // Send the complete new state
            }
        }));
    }
}