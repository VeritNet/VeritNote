// components/blocks/data/DataBlock.js
class DataBlock extends Block {
    static type = 'data';
    static icon = '🗃️';
    static label = 'Database View';
    static description = 'Embed a view from a Database (.veritnotedb).';
    static keywords = ['data', 'database',
                       'table', 'tableview'];
    static canBeToggled = true;

    constructor(data, editor) {
        super(data, editor);
        this.properties.dbPath = data.properties?.dbPath || '';
        this.properties.presetId = data.properties?.presetId || '';

        this._rawData = null;
    }

    _dbJsonCache = null; // Public


    /**
     * @param {object} preset
     * @param {Function} markDirtyCallback
     * @return {Promise<HTMLElement>}
     * @public
     */
    async renderPresetConfigPanel(preset, markDirtyCallback) {
        // 确保实例和数据已经加载
        if (this.children.length === 0) {
            await this._loadDatabaseAndRender();
        }

        const childBlock = this.children[0];
        // 委派给具体的子块去生成面板
        if (childBlock && childBlock.renderPresetConfigPanel) {
            return await childBlock.renderPresetConfigPanel(preset, this._dbJsonCache, markDirtyCallback, this);
        }

        const div = document.createElement('div');
    }


    static getPropertiesSchema() {
        return [...super.getPropertiesSchema()];
    }

    get toolbarButtons() {
        const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>`;
        const buttons = [{ html: iconSvg, title: 'Config Source', action: 'selectDb' }];
        buttons.push(...super.toolbarButtons);
        return buttons;
    }

    handleToolbarAction(action, buttonElement) {
        if (action === 'selectDb') {
            this.BAPI_PE.popoverManager.showDataFilePicker(
                buttonElement,
                this.properties.dbPath,
                this.properties.presetId,
                (result) => {
                    if (result && (result.dbPath !== this.properties.dbPath || result.presetId !== this.properties.presetId)) {
                        this.properties.dbPath = result.dbPath;
                        this.properties.presetId = result.presetId;
                        this._dbJsonCache = null;
                        this._loadDatabaseAndRender().then(() => this._refreshDetailsPanel());
                        this.BAPI_PE.emitChange(true, 'change-db-preset', this);
                    }
                }
            );
        }
    }


    _renderContent() {
        if (!this.properties.dbPath || !this.properties.presetId) {
            this.contentElement.innerHTML = `
                <div style="border:1px dashed var(--border-primary); padding:20px; text-align:center; color:var(--text-secondary);">
                    Select a Database and Preset.
                </div>
            `;
            return;
        }

        this.contentElement.innerHTML = '<div style="padding:10px;">Loading database view...</div>';

        this._loadDatabaseAndRender();
    }

    async _getRawData() {
        // 1. 获取 DB JSON
        if (!this._dbJsonCache) { // 不可以删除此判断！不可以删除此判断！
            const absolutePath = this.BAPI_WD.resolveWorkspacePath(this.properties.dbPath);
            this._dbJsonCache = await this._fetchJson(absolutePath);
        }

        const preset = this._dbJsonCache.presets.find(p => p.id === this.properties.presetId);
        if (!preset) throw new Error("Preset not found in DB.");

        // 2. 获取数据 (解析 Embedded 或 请求 External)
        const dbData = this._dbJsonCache.data;
        if (dbData.mode === 'embedded') {
            return dbData.embeddedData;
        } else if (dbData.mode === 'external' && dbData.externalUrl) {
            return await this._fetchExternalCsv(dbData.externalUrl);
        } else {
            return [];
        }
    }

    async _loadDatabaseAndRender() {
        this._rawData = await this._getRawData();
        const preset = this._dbJsonCache.presets.find(p => p.id === this.properties.presetId);
        if (!preset) return;

        if (!preset.config) preset.config = {};

        let childBlock = this.children[0];

        // 检查是否需要重新创建子块（类型改变或首次加载）
        if (!childBlock || childBlock.type !== preset.type) {
            const RendererClass = window['blockRegistry'].get(preset.type);
            if (!RendererClass) throw new Error(`Unknown preset type: ${preset.type}`);

            // 创建真正的持久化结构子块，不再强塞 preset 数据到 properties 里
            const blockData = { type: preset.type };
            childBlock = this.BAPI_PE.createBlockInstance(blockData);

            // 确立父子关系并清空旧块
            this.children = [childBlock];
            childBlock.parent = this;
        }

        this.element.innerHTML = '';

        // 渲染子块的 DOM 框架
        const childEl = childBlock.render();
        this.element.appendChild(childEl);

        // 将原始数据和 preset.config 动态喂给子块，命令其绘制内部结构
        childBlock._renderDataContent(this._rawData, preset.config);
    }

    _fetchJson(path) {
        return new Promise((resolve) => {
            const reqId = this.id + '-' + Date.now();
            const listener = (e) => {
                if (e.detail.payload.dataBlockId === reqId) {
                    window.removeEventListener('dataContentFetched', listener);
                    let content = e.detail.payload.content;
                    if (typeof content === 'string') {
                        try { content = JSON.parse(content); }
                        catch (err) { content = { data: {}, presets: [] }; }
                    }
                    resolve(content);
                }
            };
            window.addEventListener('dataContentFetched', listener);
            window.BAPI_IPC.fetchDataContent(reqId, path);
        });
    }

    async _fetchExternalCsv(url) {
        const res = await fetch(url);
        const text = await res.text();
        return this._parseCSV(text);
    }

    _parseCSV(text) {
        const rows = [];
        text.split('\n').forEach(line => {
            if (line.trim()) rows.push(line.split(',').map(s => s.trim().replace(/^"|"$/g, '')));
        });
        return rows;
    }

    // --- Details Panel Logic ---
    renderDetailsPanel_custom() {
        const dbPath = this.properties.dbPath || '';
        let presetOptions = '<option value="">Select a preset...</option>';
        if (this._dbJsonCache && this._dbJsonCache.presets) {
            presetOptions += this._dbJsonCache.presets.map(p =>
                `<option value="${p.id}" ${p.id === this.properties.presetId ? 'selected' : ''}>${p.name} (${p.type})</option>`
            ).join('');
        }

        return `
            <div class="details-section-header">Database Configuration</div>
            <div class="details-input-row">
                <span class="details-input-label">DB File Path</span>
                <input type="text" class="details-input-field db-path-input" value="${dbPath}" placeholder="e.g. databases/my_data.veritnotedb">
            </div>
            <div class="details-input-row" style="margin-top: 8px;">
                <span class="details-input-label">Preset View</span>
                <select class="details-input-field db-preset-select" ${!this._dbJsonCache ? 'disabled' : ''}>
                    ${presetOptions}
                </select>
            </div>
            <div style="margin-top: 8px; text-align:right;">
                <button class="css-btn db-refresh-btn" style="width:auto;">↻ Reload DataBase</button>
            </div>
            ${this.children[0] ? `
                <div style="margin-top: 8px; text-align:right;">
                    <button class="css-btn db-sub-focus-btn" style="width:auto;">⚙ Settings: ${this.children[0].constructor.label || this.children[0].type}</button>
                </div>
            ` : ''}
        `;
    }

    onDetailsPanelOpen_custom(container) {
        const pathInput = container.querySelector('.db-path-input');
        const presetSelect = container.querySelector('.db-preset-select');
        const refreshBtn = container.querySelector('.db-refresh-btn');
        const subFocusBtn = container.querySelector('.db-sub-focus-btn');

        pathInput.addEventListener('change', (e) => {
            const newPath = e.target.value.trim();
            if (newPath !== this.properties.dbPath) {
                this.properties.dbPath = newPath;
                this.properties.presetId = '';
                this._dbJsonCache = null;

                if (newPath) {
                    const absolutePath = this.BAPI_WD.resolveWorkspacePath(newPath);
                    this._fetchJson(absolutePath).then(json => {
                        this._dbJsonCache = json;
                        this._renderContent();
                        this._refreshDetailsPanel();
                    });
                } else {
                    this._renderContent();
                    this._refreshDetailsPanel();
                }
                this.BAPI_PE.emitChange(true, 'change-db', this);
            }
        });

        presetSelect.addEventListener('change', (e) => {
            this.properties.presetId = e.target.value;
            this._renderContent();
            this.BAPI_PE.emitChange(true, 'change-preset', this);
        });

        refreshBtn.addEventListener('click', () => {
            this._dbJsonCache = null;
            this._rawData = null;
            this._loadDatabaseAndRender().then(() => this._refreshDetailsPanel());
        });

        if (subFocusBtn) {
            subFocusBtn.addEventListener('click', () => {
                if (this.children[0]) this.BAPI_PE.selectBlock(this.children[0].id);
            });
        }

        // 仅有路径但没缓存时（例如首次通过外部输入打开细节），自动抓取以生成 Preset 的选项
        if (this.properties.dbPath && !this._dbJsonCache) {
            const absolutePath = this.BAPI_WD.resolveWorkspacePath(this.properties.dbPath);
            this._fetchJson(absolutePath).then(json => {
                this._dbJsonCache = json;
                this._refreshDetailsPanel();
            });
        }
    }
}

window['registerBlock'](DataBlock);