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

        this._dbJsonCache = null;
        this._rawData = null;
    }

    _dbJsonCache = null; // Public

    static getPropertiesSchema() {
        return [...super.getPropertiesSchema()];
    }

    get toolbarButtons() {
        const buttons = [{ icon: '⚙️', title: 'Config Source', action: 'showDetails' }];
        buttons.push(...super.toolbarButtons);
        return buttons;
    }

    _renderContent() {
        if (!this.properties.dbPath || !this.properties.presetId) {
            this.contentElement.innerHTML = `
                <div style="border:1px dashed var(--border-primary); padding:20px; text-align:center; color:var(--text-secondary);">
                    🗃️ Data Block: Right-click > Details to select Database and Preset.
                </div>
            `;
            return;
        }

        this.contentElement.innerHTML = '<div style="padding:10px;">Loading database view...</div>';

        this._loadDatabaseAndRender().catch(e => {
            this.contentElement.innerHTML = `<div style="color:red; padding:10px;">Error loading DB: ${e.message}</div>`;
        });
    }

    async _loadDatabaseAndRender() {
        // 1. 获取 DB JSON
        if (!this._dbJsonCache) { // 不可以删除此判断！不可以删除此判断！
            const absolutePath = window.resolveWorkspacePath(this.properties.dbPath);
            this._dbJsonCache = await this._fetchJson(absolutePath);
        }

        console.log('DB JSON Cache:', this._dbJsonCache);
        console.log('Selected Preset ID:', this.properties.presetId);
        const preset = this._dbJsonCache.presets.find(p => p.id === this.properties.presetId);
        if (!preset) throw new Error("Preset not found in DB.");

        // 2. 获取数据 (解析 Embedded 或 请求 External)
        const dbData = this._dbJsonCache.data;
        if (dbData.mode === 'embedded') {
            this._rawData = dbData.embeddedData;
        } else if (dbData.mode === 'external' && dbData.externalUrl) {
            this._rawData = await this._fetchExternalCsv(dbData.externalUrl);
        } else {
            this._rawData = [];
        }

        // 3. 动态实例化对应类型的子渲染块
        const RendererClass = window['blockRegistry'].get(preset.type);
        if (!RendererClass) throw new Error(`Unknown preset type: ${preset.type}`);

        // 创建临时实例，仅用于渲染
        const blockData = { id: this.id + '-inner', type: preset.type, properties: { ...preset } };
        const renderInstance = new RendererClass(blockData, this.editor);

        this.contentElement.innerHTML = '';
        renderInstance.render(); // 生成外壳
        // 将数据喂给它并强制其绘制内部结构
        renderInstance._renderDataContent(this._rawData);
        this.contentElement.appendChild(renderInstance.contentElement);
    }

    _fetchJson(path) {
        return new Promise((resolve) => {
            const listener = (e) => {
                if (e.detail.payload.path === this.properties.dbPath) {
                    window.removeEventListener('databaseLoaded', listener);
                    resolve(e.detail.payload.content);
                }
            };
            window.addEventListener('databaseLoaded', listener);
            ipc.loadDatabase(path);
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
                <span class="details-input-label">DB File</span>
                <div style="flex-grow: 1; display: flex; gap: 4px;">
                    <input type="text" class="details-input-field db-path-input" value="${dbPath}" readonly placeholder="Select a .veritnotedb">
                    <button class="details-btn-icon db-browse-btn" title="Browse">📂</button>
                </div>
            </div>
            <div class="details-input-row" style="margin-top: 8px;">
                <span class="details-input-label">Preset View</span>
                <select class="details-input-field db-preset-select" ${!this._dbJsonCache ? 'disabled' : ''}>
                    ${presetOptions}
                </select>
            </div>
            <div style="margin-top: 8px; text-align:right;">
                <button class="css-btn db-refresh-btn" style="width:auto;">↻ Reload DB</button>
            </div>
        `;
    }

    onDetailsPanelOpen_custom(container) {
    //    const browseBtn = container.querySelector('.db-browse-btn');
    //    const presetSelect = container.querySelector('.db-preset-select');
    //    const refreshBtn = container.querySelector('.db-refresh-btn');

    //    browseBtn.addEventListener('click', () => {
    //        window.BAPI_IPC.openFileDialog = () => { ipc.send('openFileDialog'); };
    //        const listener = (e) => {
    //            window.removeEventListener('fileDialogClosed', listener);
    //            if (e.detail.payload.path && e.detail.payload.path.endsWith('.veritnotedb')) {
    //                this.properties.dbPath = window.makePathRelativeToWorkspace(e.detail.payload.path);
    //                this.properties.presetId = ''; // Reset preset
    //                this._dbJsonCache = null; // Clear cache to reload
    //                this._loadDatabaseAndRender().then(() => this._refreshDetailsPanel());
    //                this.BAPI_PE.emitChange(true, 'change-db', this);
    //            }
    //        };
    //        window.addEventListener('fileDialogClosed', listener);
    //        ipc.send('openFileDialog');
    //    });

    //    presetSelect.addEventListener('change', (e) => {
    //        this.properties.presetId = e.target.value;
    //        this._renderContent();
    //        this.BAPI_PE.emitChange(true, 'change-preset', this);
    //    });

    //    refreshBtn.addEventListener('click', () => {
    //        this._dbJsonCache = null;
    //        this._rawData = null;
    //        this._loadDatabaseAndRender().then(() => this._refreshDetailsPanel());
    //    });
    }
}

window['registerBlock'](DataBlock);