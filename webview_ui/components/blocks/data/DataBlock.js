// components/blocks/data/DataBlock.js
class DataBlock extends Block {
    static type = 'data';
    static icon = '🗃️';
    static label = 'Database View';
    static description = 'Embed a view from a Database (.veritnotedb).';
    static keywords = ['data', 'database',
                       'table', 'tableview'];
    static canBeToggled = true;

    // 导出时，要把整个真正渲染数据的子块容器清理掉，只留下 DataBlock 自己的壳子，导出脚本会重新动态生成子块内容
    static previewExclusionSelectors = [
    ];
    static exportExclusionSelectors = [
        '.data-child-container'
    ];

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

        // 将路径信息挂载到 DOM 上，供导出后的外置脚本读取
        this.contentElement.dataset.dbPath = this.properties.dbPath;
        this.contentElement.dataset.presetId = this.properties.presetId;

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

            const blockData = { type: preset.type };
            childBlock = this.BAPI_PE.createBlockInstance(blockData);

            // 确立父子关系并清空旧块
            this.children = [childBlock];
            childBlock.parent = this;
        }

        this.contentElement.innerHTML = '';

        // 渲染子块的 DOM
        const childEl = childBlock.render();
        childEl.classList.add('data-child-container'); // 这个类名用于导出时识别删除
        this.contentElement.appendChild(childEl);

        // 将原始数据和 preset.config 动态喂给子块，命令其绘制内部结构
        childBlock._renderDataContent(this._rawData, preset.config, childBlock.element, childBlock.properties);
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
        let presetOptions = '';
        if (this._dbJsonCache && this._dbJsonCache.presets) {
            presetOptions += this._dbJsonCache.presets.map(p =>
                `<div class="menu-item" title="${p.name} (${p.type})">${p.id}</div>`
            ).join('');
        }

        return `
            <div tc="1" class="details-section-header">Database Configuration</div>
            <div fx="sb" pd="xs" gap="s" hv-bg="3" rd="m">
                <span tc="2" style="flex: 2">DB File Path</span>
                <input type="text" style="flex: 3" class="inp" id="db-path-input" value="${dbPath}" placeholder="my_data.veritnotedb">
            </div>
            <div fx="sb" pd="xs" gap="s" hv-bg="3" rd="m">
                <span tc="2" style="flex: 2">Preset View</span>
                <div style="flex: 3" class="combo-box" ${!this._dbJsonCache ? 'disabled' : ''}>
                    <div class="sel" tabindex="0" id="db-preset-select" placeholder="Select a preset...">${this.properties.presetId}</div>
                    <div class="menu dropdown anim-fade scroll-y" style="max-height: 40vh;">
                      ${presetOptions}
                    </div>
                </div>
            </div>
            <button class="btn" tc="2" id="db-refresh-btn" pd="s" bg="none" bd="none" hv-bg="3" style="width:auto;">↻ Reload DataBase</button>
            ${this.children[0] ? `
                <button class="btn" tc="2" id="db-sub-focus-btn" pd="s" bg="none" bd="none" hv-bg="3" style="width:auto;">⚙ Settings: ${this.children[0].constructor.label || this.children[0].type}</button><br>
            ` : ''}
        `;
    }

    onDetailsPanelOpen_custom(container) {
        const pathInput = container.querySelector('#db-path-input');
        const presetSelect = container.querySelector('#db-preset-select');
        const refreshBtn = container.querySelector('#db-refresh-btn');
        const subFocusBtn = container.querySelector('#db-sub-focus-btn');

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


    // 为导出页面生成数据初始化脚本
    getExportScripts(exportContext = {}) {
        const dbPath = this.properties.dbPath;
        const presetId = this.properties.presetId;

        if (!dbPath || !presetId) return null;

        // 获取页面相对根目录的前缀，默认为当前目录
        const pathPrefix = exportContext.pathPrefix || './';

        // 统一斜杠并作为全局唯一标识 Key
        const dbKey = dbPath.replace(/\\/g, '/').replace('.veritnotedb', '.js');
        // HTML 引入时实际的相对网络请求 URL
        const scriptUrl = pathPrefix + dbKey;

        let childProps = {};
        let childType = 'unknown';
        if (this.children && this.children.length > 0) {
            childProps = this.children[0].properties || {};
            childType = this.children[0].type;
        }

        // 修复: 将 _renderDataContent(...) { 转换为 function( ... ) {
        let renderersSetup = '';
        window['blockRegistry'].forEach((BlockClass, type) => {
            if (BlockClass.prototype._renderDataContent) {
                let funcStr = BlockClass.prototype._renderDataContent.toString();
                // 匹配方法名并替换为 function 关键字
                funcStr = funcStr.replace(/^(async\s+)?_renderDataContent\s*\(/, '$1function(');
                renderersSetup += `window.DataBlockRenderers['${type}'] = ${funcStr};\n`;
            }
        });

        // 核心脚本生成
        const script = `
            // 1. 初始化全局基础设施 (确保只执行一次)
            if (!window.VeritNoteDBLoader) {
                window.DataBlockRenderers = {};
                ${renderersSetup}

                // 全局 DB 加载器：防止同一个 DB.js 被加载多次
                window.VeritNoteDBLoader = {
                    cache: {}, // dbKey -> Promise
                    load: function(url, dbKey) {
                        if (this.cache[dbKey]) return this.cache[dbKey];
                        
                        this.cache[dbKey] = new Promise((resolve, reject) => {
                            const scriptEl = document.createElement('script');
                            scriptEl.src = url;
                            scriptEl.onload = () => {
                                if (window.__VN_DB__ && window.__VN_DB__[dbKey]) {
                                    resolve(window.__VN_DB__[dbKey]);
                                } else {
                                    reject(new Error('DB Data not found for key: ' + dbKey));
                                }
                            };
                            scriptEl.onerror = () => reject(new Error('Failed to load DB script: ' + url));
                            document.head.appendChild(scriptEl);
                        });
                        return this.cache[dbKey];
                    }
                };
                window.__VN_DB__ = window.__VN_DB__ || {};
            }

            // 2. 当前 DataBlock 实例的执行逻辑
                try {
                    const blockId = '${this.id}';
                    const scriptUrl = '${scriptUrl}';
                    const dbKey = '${dbKey}';
                    const presetId = '${presetId}';
                    const childType = '${childType}';
                    const childProperties = ${JSON.stringify(childProps)};

                    // 通过全局加载器获取 DB 数据（多块复用同一个 Promise），传入请求URL和唯一标识Key
                    const dbJson = await window.VeritNoteDBLoader.load(scriptUrl, dbKey);
                    
                    const preset = dbJson.presets.find(p => p.id === presetId);
                    if (!preset) throw new Error('Preset not found in DB');
                      
                    const dbData = dbJson.data;
                    if (dbData.mode === 'embedded' && dbData.embeddedData) {
                        rawData = dbData.embeddedData;
                    } else if (dbData.mode === 'external' && dbData.externalUrl) {
                        const res = await fetch(dbData.externalUrl);
                        const text = await res.text();
                        const rows = [];
                        text.split('\\n').forEach(line => {
                            if (line.trim()) rows.push(line.split(',').map(s => s.trim().replace(/^"|"$/g, '')));
                        });
                        rawData = rows;
                    } else {
                        rawData = [];
                    }
                    
                    const container = document.querySelector('.block-container[data-id="' + blockId + '"]');
                    if (!container) return;
                    
                    const contentEl = container.querySelector('.block-content[data-type="data"]');
                    if (!contentEl) return;

                    contentEl.innerHTML = '<div class="data-child-container" data-type="' + childType + '"></div>';
                    const childElement = contentEl.querySelector('.data-child-container');

                    if (window.DataBlockRenderers[childType]) {
                        window.DataBlockRenderers[childType](rawData, preset.config, childElement, childProperties, true);
                    }
                } catch(e) {
                    console.error('DataBlock export init failed for block ' + '${this.id}', e);
                }
        `;

        return script;
    }
}

window['registerBlock'](DataBlock);