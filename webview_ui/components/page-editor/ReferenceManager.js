class PageReferenceManager {
    constructor(editor) {
        this.editor = editor; // The PageEditor instance

        this.container = editor.elements.referencesView;
        this.placeholder = this.container.querySelector('.empty-references-placeholder');

        this.draggedItem = null;
        this.isLinkingMode = false;
        this.linkingCallback = null;

        this._initListeners();
        this.render();
    }

    _initListeners() {
        this.container.addEventListener('dragover', this._handleDragOver.bind(this));
        this.container.addEventListener('dragleave', this._handleDragLeave.bind(this));
        this.container.addEventListener('drop', this._handleDrop.bind(this));
        this.container.addEventListener('dragstart', this._handleItemDragStart.bind(this));
        this.container.addEventListener('dragend', this._handleItemDragEnd.bind(this));
        this.container.addEventListener('click', this._handleClick.bind(this));

        // 监听全局引用列表的变化并重绘UI (例如，其他页面添加/删除了引用)
        this._boundRender = this.render.bind(this);
        window.addEventListener('global:referencesChanged', this._boundRender);
        // 监听当前编辑器内的块更新事件
        this._boundHandleBlockUpdate = this._handleBlockUpdateEvent.bind(this);
        window.addEventListener('block:updated', this._boundHandleBlockUpdate);
        // 监听当前编辑器内的块删除事件
        this._boundHandleBlockDelete = this._handleBlockDeleteEvent.bind(this);
        window.addEventListener('block:deleted', this._boundHandleBlockDelete);
    }

    destroy() {
        // 清理所有添加的监听器
        window.removeEventListener('global:referencesChanged', this._boundRender);
        window.removeEventListener('block:updated', this._boundHandleBlockUpdate);
        window.removeEventListener('block:deleted', this._boundHandleBlockDelete);
    }

    /**
     * 事件处理器：当一个块被删除时调用
     * @param {CustomEvent} e - 事件对象，e.detail 包含 { filePath, blockId }
     */
    _handleBlockDeleteEvent(e) {
        // 只处理来自当前编辑器的事件
        if (e.detail.filePath === this.editor.filePath) {
            this.handleBlockDeletion(e.detail.blockId);
        }
    }

    _handleBlockUpdateEvent(e) {
        // 只处理来自当前编辑器的事件
        if (e.detail.filePath !== this.editor.filePath) {
            return;
        }

        const updatedBlockData = e.detail.blockData;

        // 确保我们收到了一个有效的 blockData 对象，并且它有 ID
        if (!updatedBlockData || !updatedBlockData.id) {
            return;
        }

        // 检查这个块是否确实存在于引用列表中
        const refExists = window.globalState.references.some(
            // 也对数组中的项进行安全检查
            r => r && r.blockData && r.blockData.id === updatedBlockData.id
        );

        if (refExists) {
            // 如果存在，则调用全局函数来更新它
            window.updateGlobalReferenceData(updatedBlockData);
        }
    }

    // --- Drag and Drop Handlers ---

    cleanupDropIndicator() {
        this.container.querySelector('.reference-item-drop-indicator')?.remove();
    }

    _handleDragOver(e) {
        e.preventDefault();
        const isReorder = e.dataTransfer.types.includes('application/veritnote-reference-reorder');
        if (isReorder) {
            e.dataTransfer.dropEffect = 'move';
            this.cleanupDropIndicator();
            const targetItem = e.target.closest('.reference-item');
            if (targetItem && targetItem !== this.draggedItem) {
                const rect = targetItem.getBoundingClientRect();
                const isAfter = e.clientY > rect.top + rect.height / 2;
                const indicator = document.createElement('div');
                indicator.className = 'reference-item-drop-indicator';
                if (isAfter) {
                    targetItem.parentNode.insertBefore(indicator, targetItem.nextSibling);
                } else {
                    targetItem.parentNode.insertBefore(indicator, targetItem);
                }
            }
        } else {
            e.dataTransfer.dropEffect = 'copy';
            this.container.classList.add('drag-over');
        }
    }

    _handleDragLeave(e) {
        if (!this.container.contains(e.relatedTarget)) {
            this.container.classList.remove('drag-over');
            this.cleanupDropIndicator();
        }
    }

    _handleDrop(e) {
        e.preventDefault();
        this.container.classList.remove('drag-over');
        document.body.classList.remove('is-dragging-block');

        if (!this.container.classList.contains('active')) {
            return;
        }

        // --- Reorder logic ---
        const isReorder = e.dataTransfer.types.includes('application/veritnote-reference-reorder');
        if (isReorder && this.draggedItem) {
            const indicator = this.container.querySelector('.reference-item-drop-indicator');
            if (indicator) { this.container.insertBefore(this.draggedItem, indicator); }
            else { this.container.appendChild(this.draggedItem); }
            this.draggedItem.style.display = '';

            const newReferences = [];
            this.container.querySelectorAll('.reference-item').forEach(itemEl => {
                const blockId = itemEl.dataset['blockId'];
                // 从全局状态中查找
                const refObject = window.globalState.references.find(r => r.blockData.id === blockId);
                if (refObject) { newReferences.push(refObject); }
            });
            window.updateGlobalReferences(newReferences); // 调用全局更新函数
            return;
        }

        // --- Multi-block drop logic ---
        const multiDragData = e.dataTransfer.getData('application/veritnote-block-ids');
        const singleDragId = e.dataTransfer.getData('text/plain');

        let blockIdsToAdd = [];
        if (multiDragData) {
            blockIdsToAdd = JSON.parse(multiDragData);
        } else if (singleDragId) {
            blockIdsToAdd = [singleDragId];
        }

        if (blockIdsToAdd.length > 0) {
            blockIdsToAdd.forEach(blockId => {
                if (window.globalState.references.some(ref => ref.blockData.id === blockId)) {
                    return;
                }

                const blockInstance = this.editor._findBlockInstanceById(this.editor.blocks, blockId)?.block;

                if (blockInstance) {
                    this.addReference(this.editor.filePath, blockInstance.data);
                }
            });
        }
    }

    _handleItemDragStart(e) {
        const item = e.target.closest('.reference-item');
        if (item) {
            this.draggedItem = item;
            const blockId = item.dataset['blockId'];

            // 将 this.references 改为 globalState.references
            const refData = window.globalState.references.find(r => r.blockData.id === blockId);

            if (refData) {
                e.dataTransfer.setData('application/veritnote-reference-item', JSON.stringify(refData));
            }

            document.body.classList.add('is-dragging-block');

            // This is for reordering within the reference panel itself
            e.dataTransfer.setData('application/veritnote-reference-reorder', blockId);
            e.dataTransfer.effectAllowed = 'copyMove'; // Allow both copy (to editor) and move (in panel)
            setTimeout(() => { item.style.display = 'none'; }, 0);
        }
    }

    _handleItemDragEnd(e) {
        if (this.draggedItem) {
            this.draggedItem.style.display = '';
            this.draggedItem.classList.remove('dragging');
        }
        this.draggedItem = null;
        this.cleanupDropIndicator();

        document.body.classList.remove('is-dragging-block');
    }

    // --- Interaction and State Management ---

    async _handleClick(e) {
        // Priority 1: Check for linking mode
        if (this.isLinkingMode) {
            const itemEl = e.target.closest('.reference-item');
            if (itemEl && this.linkingCallback) {
                const blockId = itemEl.dataset['blockId'];
                const refData = window.globalState.references.find(r => r.blockData.id === blockId);
                if (refData) { this.linkingCallback(refData); }
            }
            return;
        }

        // Priority 2: Check for delete button click
        const deleteBtn = e.target.closest('.reference-item-delete-btn');
        if (deleteBtn) {
            this.removeReference(deleteBtn.closest('.reference-item').dataset['blockId']);
            return;
        }

        // Default action: Navigate to the block
        const itemEl = e.target.closest('.reference-item');
        if (itemEl) {
            const blockId = itemEl.dataset['blockId'];
            const refData = window.globalState.references.find(r => r.blockData.id === blockId);

            if (refData) {
                // Check if the reference is in the current file
                if (refData.filePath === this.editor.filePath) {
                    this.editor.PageSelectionManager.highlightBlock(blockId);
                } else {
                    // Open or switch to the other file's tab and focus the block
                    await this.editor.tabManager.openTab(refData.filePath, blockId);
                }
            }
        }
    }

    enableLinkingMode(enable, callback = null) {
        this.isLinkingMode = enable;
        this.linkingCallback = enable ? callback : null;
    }

    addReference(filePath, blockData) {
        window.addGlobalReference(filePath, blockData);
    }

    removeReference(blockId) {
        window.removeGlobalReference(blockId);
    }

    render() {
        const scrollPos = this.container.scrollTop;
        this.container.innerHTML = '';
        this.container.appendChild(this.placeholder);

        // 直接从全局状态读取数据
        this.placeholder.style.display = window.globalState.references.length === 0 ? 'block' : 'none';
        if (window.globalState.references.length === 0) return;

        const tempEditorContainer = document.createElement('div');
        const tempEditor = new PageEditor(tempEditorContainer, '', null);

        // 遍历全局引用
        window.globalState.references.forEach((ref) => {
            const fileName = ref.filePath.substring(ref.filePath.lastIndexOf('\\') + 1).replace('.veritnote', '');
            const itemEl = document.createElement('div');
            itemEl.className = 'reference-item';
            itemEl.dataset['blockId'] = ref.blockData.id;
            itemEl.draggable = true;

            const blockInstance = tempEditor.createBlockInstance(ref.blockData);
            if (!blockInstance) return;

            const renderedBlockEl = blockInstance.render();
            itemEl.innerHTML = `<button class="reference-item-delete-btn">&times;</button><div class="reference-item-title">${fileName}</div><div class="reference-item-preview"></div>`;
            itemEl.querySelector('.reference-item-preview').appendChild(renderedBlockEl);
            this.container.appendChild(itemEl);
        });
        this.container.scrollTop = scrollPos;
    }

    // --- Public Methods for Reacting to Global Events ---
    // These methods will be called by the parent PageEditor instance.

    handleBlockUpdate(filePath, blockData) {
        // 功能 1: 实时同步
        // 1. 更新全局状态中的数据
        window.updateGlobalReferenceData(blockData);

        // 2. 更新当前实例的 DOM (其他实例会通过 block:updated 事件各自更新自己的DOM)
        const itemEl = this.container.querySelector(`.reference-item[data-block-id="${blockData.id}"]`);
        if (itemEl) {
            // filePath 在这里没有变化，所以可以复用
            const ref = window.globalState.references.find(r => r.blockData.id === blockData.id);
            if (ref) {
                this.updateReferenceItemDOM(itemEl, ref);
            }
        }
    }

    handleBlockDeletion(blockId) {
        // 检查这个块是否在引用列表中
        const refExists = window.globalState.references.some(ref => ref.blockData.id === blockId);
        if (refExists) {
            // 调用全局函数来移除引用并触发事件
            window.removeGlobalReference(blockId);
        }
    }

    handleHistoryChange(filePath, allBlockData) {
        const pageBlocksMap = new Map();
        const flattenBlocks = (blocks) => {
            if (!blocks) return;
            for (const block of blocks) {
                pageBlocksMap.set(block.id, block);
                if (block.children) flattenBlocks(block.children);
            }
        };
        flattenBlocks(allBlockData);

        let referencesChanged = false;
        let updatedRefs = [];

        // 遍历全局引用
        for (const ref of window.globalState.references) {
            // 只关心那些来自被修改页面的引用
            if (ref.filePath === filePath) {
                const updatedBlockData = pageBlocksMap.get(ref.blockData.id);
                if (updatedBlockData) {
                    // 如果块仍然存在，更新它的数据并保留它
                    updatedRefs.push({ filePath: ref.filePath, blockData: updatedBlockData });
                } else {
                    // 如果块不存在了（被撤销操作删除了），则标记需要更新
                    referencesChanged = true;
                }
            } else {
                // 保留所有其他页面的引用
                updatedRefs.push(ref);
            }
        }

        // 如果引用列表的长度或内容发生变化，则触发全局更新
        if (referencesChanged || JSON.stringify(updatedRefs) !== JSON.stringify(window.globalState.references)) {
            window.updateGlobalReferences(updatedRefs);
        }
    }

    handleRevertReferences(filePath) {
        // 功能 2: 恢复到已保存版本
        const refsToRevert = window.globalState.references.filter(ref => ref.filePath === filePath);

        if (refsToRevert.length === 0) return;

        const onPageRevertedListener = (loadEvent) => {
            if (loadEvent.detail.payload?.path === filePath) {
                window.removeEventListener('pageLoaded', onPageRevertedListener);

                const savedContent = loadEvent.detail.payload.content;
                if (!savedContent) return;

                const savedBlocksMap = new Map();
                const flattenBlocks = (blocks) => {
                    if (!blocks) return;
                    for (const block of blocks) {
                        savedBlocksMap.set(block.id, block);
                        if (block.children) flattenBlocks(block.children);
                    }
                };
                flattenBlocks(savedContent);

                let changed = false;
                refsToRevert.forEach(refToRevert => {
                    const savedBlockData = savedBlocksMap.get(refToRevert.blockData.id);
                    if (savedBlockData) {
                        const mainRef = window.globalState.references.find(r => r.blockData.id === refToRevert.blockData.id);
                        if (mainRef) {
                            mainRef.blockData = savedBlockData;
                            changed = true;
                        }
                    }
                });

                // 如果数据真的发生了变化，触发全局更新
                if (changed) {
                    window.dispatchEvent(new CustomEvent('global:referencesChanged'));
                }
            }
        };

        window.addEventListener('pageLoaded', onPageRevertedListener);
        ipc.loadPage(filePath, null);
    }

    updateReferenceItemDOM(itemEl, refData) {
        const tempEditorContainer = document.createElement('div');
        const tempEditor = new PageEditor(tempEditorContainer, '', null);

        const blockInstance = tempEditor.createBlockInstance(refData.blockData);
        if (!blockInstance) return;

        const newPreviewContent = blockInstance.render();
        const previewContainer = itemEl.querySelector('.reference-item-preview');
        if (previewContainer) {
            previewContainer.innerHTML = '';
            previewContainer.appendChild(newPreviewContent);
        }
    }
}