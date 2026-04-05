// components/page-editor/SelectionManager.js

export class PageSelectionManager {
    editor;
    selectedBlockIds;

    constructor(editor) {
        this.editor = editor;
        this.selectedBlockIds = new Set();
    }

    // ==========================================
    // 方式一：蓝色选中 (Select - 单选/多选)
    // ==========================================

    _updateVisuals() {
        if (!this.editor || !this.editor.container) return;

        this.editor.container.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));

        this.selectedBlockIds.forEach(id => {
            const blockEl = this.editor.container.querySelector(`.block-container[data-id="${id}"]`);
            if (blockEl) {
                blockEl.classList.add('is-selected');
            }
        });

        this.editor.updateDetailsPanel();
    }

    toggleSelect(blockId) {
        if (this.selectedBlockIds.has(blockId)) {
            this.selectedBlockIds.delete(blockId);
        } else {
            this.selectedBlockIds.add(blockId);
        }
        this._updateVisuals();
    }

    setSelect(blockId) {
        // 如果该块已经是唯一选中的块，只需重新聚焦光标
        if (this.selectedBlockIds.size === 1 && this.selectedBlockIds.has(blockId)) {
            this._focusDOMElement(blockId);
            return;
        }

        this.selectedBlockIds.clear();
        this.selectedBlockIds.add(blockId);
        this._updateVisuals();

        // 蓝框选中时，如果是单选，顺便处理 DOM 光标聚焦（替代原 Block.focus 逻辑）
        this._focusDOMElement(blockId);
    }

    clearSelect() {
        if (this.selectedBlockIds.size === 0) return;
        this.selectedBlockIds.clear();
        this._updateVisuals();
    }

    getSelected() {
        return Array.from(this.selectedBlockIds);
    }

    hasSelected(blockId) {
        return this.selectedBlockIds.has(blockId);
    }

    getSelectionSize() {
        return this.selectedBlockIds.size;
    }

    // 内部私有方法：处理实际的 DOM 光标聚焦
    _focusDOMElement(blockId) {
        const blockInstance = this.editor._findBlockInstanceById(this.editor.blocks, blockId)?.block;
        if (blockInstance && blockInstance.contentElement && blockInstance.contentElement.isContentEditable) {
            blockInstance.contentElement.focus();
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(blockInstance.contentElement);
            range.collapse(false); // 光标移至末尾
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }


    validateAndRefresh() {
        // 1. 过滤掉那些在当前 DOM 中已经不存在的 ID
        // (例如：撤销了“创建新块”的操作，该块ID就不应该继续被选中)
        const validIds = new Set();
        this.selectedBlockIds.forEach(id => {
            // 检查编辑器中是否真的还有这个块的 DOM
            if (this.editor.container.querySelector(`.block-container[data-id="${id}"]`)) {
                validIds.add(id);
            }
        });
        this.selectedBlockIds = validIds;

        // 2. 强制重新应用视觉样式（添加 .is-selected 类）并更新细节面板
        this._updateVisuals();
    }

    // ==========================================
    // 方式二：黄色高亮 (Highlight)
    // ==========================================

    highlightBlock(blockId) {
        if (!blockId || !this.editor.isReady) return;

        const activeContainer = this.editor.mode === 'edit'
            ? this.editor.elements.editorAreaContainer
            : this.editor.elements.previewView;

        if (!activeContainer) return;

        const blockEl = activeContainer.querySelector(`.block-container[data-id="${blockId}"]`);

        if (blockEl) {
            const previouslyHighlighted = this.editor.container.querySelector('.is-highlighted');
            if (previouslyHighlighted) {
                previouslyHighlighted.classList.remove('is-highlighted');
            }

            blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            blockEl.classList.add('is-highlighted');

            const removeHighlight = () => {
                blockEl.classList.remove('is-highlighted');
                document.removeEventListener('click', removeHighlight, { capture: true });
                document.removeEventListener('keydown', removeHighlight, { capture: true });
            };

            setTimeout(() => {
                document.addEventListener('click', removeHighlight, { once: true, capture: true });
                document.addEventListener('keydown', removeHighlight, { once: true, capture: true });
            }, 100);
        }
    }
}