// js/blocks/DataBlock.js
class DataBlock extends Block {
    constructor(data, editor) {
        super(data, editor);
        // 数据源路径
        if (!this.properties.dataSource) {
            this.properties.dataSource = '';
        }
        this._cachedData = null; // 缓存解析后的数据，避免每次渲染都重读
        this._lastLoadedPath = null;
    }

    static getPropertiesSchema() {
        return [
            ...super.getPropertiesSchema()
        ];
    }

    /**
     * 严谨的 CSV 解析器
     * 处理引号、转义引号 ("")、逗号和换行符
     * 返回二维数组 [[col1, col2], [val1, val2]]
     */
    parseCSV(text) {
        const rows = [];
        let currentRow = [];
        let currentVal = '';
        let insideQuote = false;

        // 预处理：统一换行符
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (insideQuote) {
                if (char === '"') {
                    if (nextChar === '"') {
                        // 转义的双引号 ("") -> (")
                        currentVal += '"';
                        i++; // 跳过下一个引号
                    } else {
                        // 结束引用
                        insideQuote = false;
                    }
                } else {
                    currentVal += char;
                }
            } else {
                if (char === '"') {
                    insideQuote = true;
                } else if (char === ',') {
                    // 字段结束
                    currentRow.push(currentVal);
                    currentVal = '';
                } else if (char === '\n') {
                    // 行结束
                    currentRow.push(currentVal);
                    rows.push(currentRow);
                    currentRow = [];
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
        }

        // 处理最后一行（如果文件末尾没有换行符）
        if (currentVal || currentRow.length > 0) {
            currentRow.push(currentVal);
            rows.push(currentRow);
        }

        return rows;
    }

    /**
     * 加载数据。在实际应用中，这里应该调用 ipc 读取文件内容。
     * 为了演示，这里假设有一个 window.readFileContent 或 fetch 可用。
     */
    async loadData() {
        const path = this.properties.dataSource;
        if (!path) return null;

        if (this._cachedData && this._lastLoadedPath === path) {
            return this._cachedData;
        }

        try {
            let text = '';

            // 1. 判断是否为远程 URL
            if (/^https?:\/\//i.test(path)) {
                const response = await fetch(path);
                if (!response.ok) throw new Error(`Failed to fetch URL: ${response.statusText}`);
                text = await response.text();
            }
            // 2. 本地文件，走 IPC
            else {
                const absolutePath = window.resolveWorkspacePath ? window.resolveWorkspacePath(path) : path;
                text = await this._loadLocalDataFromIPC(absolutePath);
            }

            this._cachedData = this.parseCSV(text);
            this._lastLoadedPath = path;
            return this._cachedData;
        } catch (e) {
            console.error("DataBlock load error:", e);
            return []; // Return empty on error to prevent crashes
        }
    }

    /**
     * 封装 IPC 请求为 Promise
     */
    _loadLocalDataFromIPC(absolutePath) {
        return new Promise((resolve, reject) => {
            const listener = (e) => {
                const payload = e.detail.payload || e.detail;

                if (payload.dataBlockId === this.id) {
                    window.removeEventListener('dataContentFetched', listener);

                    if (payload.error) {
                        reject(new Error(payload.error));
                    } else {
                        resolve(payload.content || '');
                    }
                }
            };

            setTimeout(() => {
                window.removeEventListener('dataContentFetched', listener);
                reject(new Error("Request timeout"));
            }, 5000);

            window.addEventListener('dataContentFetched', listener);

            ipc.fetchDataContent(this.id, absolutePath);
        });
    }

    get toolbarButtons() {
        const buttons = [
            { icon: '🗃️', title: 'Select Data Source', action: 'selectDataFile' }
        ];
        buttons.push(...super.toolbarButtons);
        return buttons;
    }

    handleToolbarAction(action, buttonElement) {
        if (action === 'selectDataFile') {
            this.editor.popoverManager.showDataFilePicker({
                targetElement: buttonElement,
                existingValue: this.properties.dataSource,
                callback: (path) => {
                    this._updateDataSource(path);
                }
            });
        }
    }

    _updateDataSource(path) {
        this.properties.dataSource = path;
        this._cachedData = null; // 清除缓存
        this.render();
        this.editor.emitChange(true, 'edit-data-source', this);
        this.editor.updateDetailsPanel();
    }

    renderDetailsPanel_custom() {
        const dataPath = this.properties.dataSource || '';

        // 获取子类的自定义内容
        const subCustomHtml = this.renderDetailsPanel_Data_custom();

        return `
            <div class="details-section-header">Data Configuration</div>
            <div class="details-input-row">
                <span class="details-input-label">Source</span>
                <div style="flex-grow: 1; width: 0; display: flex; gap: 4px;">
                    <input type="text" class="details-input-field data-source-input" value="${dataPath}" placeholder="Path or URL" style="flex-grow:1; min-width:0;">
                    <button class="details-btn-icon data-browse-btn" title="Browse" style="flex-shrink:0;">📂</button>
                </div>
            </div>
            <!-- 子类内容紧接在此 -->
            ${subCustomHtml}
        `;
    }

    /**
     * 供子类覆写
     */
    renderDetailsPanel_Data_custom() {
        return '';
    }

    onDetailsPanelOpen_custom(container) {
        const browseBtn = container.querySelector('.data-browse-btn');
        const sourceInput = container.querySelector('.data-source-input');

        if (browseBtn && sourceInput) {
            browseBtn.addEventListener('click', (e) => {
                this.editor.popoverManager.showDataFilePicker({
                    targetElement: browseBtn,
                    existingValue: sourceInput.value,
                    callback: (path) => {
                        this._updateDataSource(path);
                    }
                });
            });

            sourceInput.addEventListener('change', (e) => {
                this._updateDataSource(e.target.value);
            });
        }
    }
}