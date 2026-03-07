// components/data-editor/database-editor.js

class DatabaseEditor {
    constructor(container, filePath, tabManager) {
        this.container = container;
        this.filePath = filePath;
        this.tabManager = tabManager;

        // DB 数据结构
        this.dbData = {
            config: {},
            data: { mode: 'embedded', embeddedData: [], externalUrl: '' },
            presets: []
        };

        this.activePresetId = null;
        this.previewCacheData = []; // 用于预览的数据缓存
        this.elements = {};
        this.previewBlockInstance = null; // 持有实时预览的 DataBlock 实例
    }

    async load() {
        const response = await fetch('components/database-editor/database-editor.html');
        this.container.innerHTML = await response.text();
        this._acquireElements();
        this._initListeners();
        ipc.loadDatabase(this.filePath);
    }

    _acquireElements() {
        this.elements = {
            saveBtn: this.container.querySelector('#db-save-btn'),
            modeRadios: this.container.querySelectorAll('input[name="db-mode"]'),
            externalConfig: this.container.querySelector('#db-external-config'),
            embeddedConfig: this.container.querySelector('#db-embedded-config'),
            externalUrlInput: this.container.querySelector('#db-external-url'),
            browseCsvBtn: this.container.querySelector('#db-browse-csv-btn'),
            refreshDataBtn: this.container.querySelector('#db-refresh-data-btn'),
            importCsvBtn: this.container.querySelector('#db-import-csv-btn'),
            embeddedInfo: this.container.querySelector('#db-embedded-info'),
            tabsContainer: this.container.querySelector('#db-presets-tabs'),
            addPresetBtn: this.container.querySelector('#db-add-preset-btn'),
            configPanel: this.container.querySelector('#db-preset-config-panel'),
            previewContainer: this.container.querySelector('#db-preview-container'),
            resizer: this.container.querySelector('#db-panel-resizer'),
        };
    }

    _initListeners() {
        this.elements.saveBtn.addEventListener('click', () => this.save());

        this.elements.modeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.dbData.data.mode = e.target.value;
                this._updateDataSourceUI();
                this._markDirty();
                this._refreshPreviewData();
            });
        });

        this.elements.externalUrlInput.addEventListener('change', (e) => {
            this.dbData.data.externalUrl = e.target.value;
            this._markDirty();
            this._refreshPreviewData();
        });

        this.elements.refreshDataBtn.addEventListener('click', () => {
            this.elements.refreshDataBtn.classList.add('spinning');
            this._refreshPreviewData().then(() => {
                setTimeout(() => this.elements.refreshDataBtn.classList.remove('spinning'), 500);
            });
        });

        this.elements.browseCsvBtn.addEventListener('click', () => {
            const listener = (e) => {
                window.removeEventListener('fileDialogClosed', listener);
                if (e.detail.payload.path) {
                    this.elements.externalUrlInput.value = window.makePathRelativeToWorkspace(e.detail.payload.path);
                    this.dbData.data.externalUrl = this.elements.externalUrlInput.value;
                    this._markDirty();
                    this._refreshPreviewData();
                }
            };
            window.addEventListener('fileDialogClosed', listener);
            ipc.openFileDialog("CSV File");
        });

        this.elements.importCsvBtn.addEventListener('click', () => {
            const listener = async (e) => {
                window.removeEventListener('fileDialogClosed', listener);
                if (e.detail.payload.path) {
                    const absolutePath = window.resolveWorkspacePath(e.detail.payload.path);
                    const res = await fetch(absolutePath);
                    const text = await res.text();
                    this.dbData.data.embeddedData = this._parseCSV(text);
                    this._updateDataSourceUI();
                    this._markDirty();
                    this._refreshPreviewData();
                }
            };
            window.addEventListener('fileDialogClosed', listener);
            ipc.openFileDialog("CSV File");
        });

        this.elements.addPresetBtn.addEventListener('click', () => {
            // 自动生成不重复的默认名称
            let baseName = "New View";
            let defaultName = baseName;
            let counter = 1;
            while (this.dbData.presets.some(p => p.name === defaultName)) {
                defaultName = `${baseName} ${counter}`;
                counter++;
            }

            const name = prompt("Preset Name:", defaultName);
            if (!name) return;
            if (this.dbData.presets.some(p => p.name === name)) {
                alert("Preset name already exists!");
                return;
            }
            const newPreset = {
                id: 'preset-' + Date.now(),
                name: name,
                type: 'tableView', // 默认类型
                firstRowMode: 'header',
                columns: []
            };
            this.dbData.presets.push(newPreset);
            this.activePresetId = newPreset.id;
            this._markDirty();
            this._renderTabs();
            this._renderConfigPanel();
            this._renderPreview();
        });

        this.elements.tabsContainer.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                this.elements.tabsContainer.scrollLeft += e.deltaY;
            }
        });

        // --- 初始化记忆的侧边栏宽度 ---
        const savedConfigWidth = window.localStorage.getItem('veritnote_db_config_width');
        if (savedConfigWidth) {
            this.elements.configPanel.style.width = savedConfigWidth;
        }

        // --- 面板宽度拖拽调整逻辑 ---
        this.elements.resizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = this.elements.configPanel.offsetWidth;
            this.elements.resizer.classList.add('is-resizing');

            const onMouseMove = (moveEvent) => {
                const newWidth = startWidth + (moveEvent.clientX - startX);
                this.elements.configPanel.style.width = `${newWidth}px`;
            };

            const onMouseUp = () => {
                window.localStorage.setItem('veritnote_db_config_width', this.elements.configPanel.style.width);
                this.elements.resizer.classList.remove('is-resizing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });

        // 委托 Config Panel 的点击事件
        this.elements.configPanel.addEventListener('click', this._onConfigClick.bind(this));
        this.elements.configPanel.addEventListener('change', this._onConfigChange.bind(this));
    }

    onDatabaseLoaded(payload) {
        if (payload.path !== this.filePath) return;
        this.dbData = payload.content;

        if (!this.dbData.presets) this.dbData.presets = [];
        if (!this.dbData.data) this.dbData.data = { mode: 'embedded', embeddedData: [], externalUrl: '' };

        if (this.dbData.presets.length > 0) {
            this.activePresetId = this.dbData.presets[0].id;
        }

        this._updateDataSourceUI();
        this._renderTabs();
        this._renderConfigPanel();
        this._refreshPreviewData();
        this.tabManager.setUnsavedStatus(this.filePath, false);
    }

    _markDirty() {
        this.tabManager.setUnsavedStatus(this.filePath, true);
    }

    save() {
        this.elements.saveBtn.disabled = true;
        ipc.saveDatabase(this.filePath, this.dbData);
    }

    onDatabaseSaved(payload) {
        if (payload.path !== this.filePath) return;
        this.elements.saveBtn.disabled = false;
        if (payload.success) {
            this.tabManager.setUnsavedStatus(this.filePath, false);
        } else {
        }
    }

    // --- UI 渲染逻辑 ---

    _updateDataSourceUI() {
        const isEmbedded = this.dbData.data.mode === 'embedded';
        this.container.querySelector(`input[name="db-mode"][value="embedded"]`).checked = isEmbedded;
        this.container.querySelector(`input[name="db-mode"][value="external"]`).checked = !isEmbedded;

        this.elements.embeddedConfig.style.display = isEmbedded ? 'flex' : 'none';
        this.elements.externalConfig.style.display = !isEmbedded ? 'flex' : 'none';

        if (isEmbedded) {
            this.elements.embeddedInfo.textContent = `Contains ${this.dbData.data.embeddedData ? this.dbData.data.embeddedData.length : 0} rows of data.`;
        } else {
            this.elements.externalUrlInput.value = this.dbData.data.externalUrl || '';
        }
    }

    _renderTabs() {
        this.elements.tabsContainer.innerHTML = '';
        this.dbData.presets.forEach(preset => {
            const tab = document.createElement('div');
            tab.className = `db-preset-tab ${preset.id === this.activePresetId ? 'active' : ''}`;
            tab.innerHTML = `
                <span>${preset.name}</span>
                <span class="delete-preset" data-id="${preset.id}" style="font-size:10px; padding:2px;">❌</span>
            `;
            tab.onclick = (e) => {
                if (e.target.classList.contains('delete-preset')) {
                    if (confirm("Delete this preset?")) {
                        this.dbData.presets = this.dbData.presets.filter(p => p.id !== preset.id);
                        if (this.activePresetId === preset.id) this.activePresetId = this.dbData.presets[0]?.id || null;
                        this._markDirty();
                        this._renderTabs();
                        this._renderConfigPanel();
                    }
                } else {
                    this.activePresetId = preset.id;
                    this._renderTabs();
                    this._renderConfigPanel();
                    this._renderPreview();
                }
            };
            this.elements.tabsContainer.appendChild(tab);
        });
    }

    _getActivePreset() {
        return this.dbData.presets.find(p => p.id === this.activePresetId);
    }

    // --- 配置面板渲染 (从原 TableViewBlock 迁移) ---
    _renderConfigPanel() {
        const preset = this._getActivePreset();
        if (!preset) {
            this.elements.configPanel.innerHTML = '<div class="empty-placeholder">No preset selected.</div>';
            return;
        }

        let html = `
            <div style="margin-bottom: 15px;">
                <label style="font-weight:bold; font-size:12px;">Preset Type:</label>
                <select class="db-input preset-type-select">
                    <option value="tableView" ${preset.type === 'tableView' ? 'selected' : ''}>Table View</option>
                    <!-- Future types here -->
                </select>
            </div>
        `;

        if (preset.type === 'tableView') {
            const modes = ['header', 'ignore', 'data'];
            const modeOptions = modes.map(m => `<option value="${m}" ${preset.firstRowMode === m ? 'selected' : ''}>${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('');

            html += `
                <div style="margin-bottom:10px;">
                    <label style="font-size:12px;">First Row Mode:</label>
                    <select class="db-input first-row-mode-select">${modeOptions}</select>
                </div>
                <hr style="border:0; border-top:1px solid var(--border-primary); margin: 15px 0;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-weight:bold; font-size:12px;">Columns</span>
                    <button class="primary-btn add-col-btn" style="padding:4px 8px;">+ Add Col</button>
                </div>
                <div id="db-columns-list">
            `;

            (preset.columns || []).forEach((col, index) => {
                html += this._renderColumnConfigItem(col, index, preset);
            });
            html += `</div>`;
        }

        this.elements.configPanel.innerHTML = html;
        this._populateSourceHeadersForConfig();
    }

    _renderColumnConfigItem(col, index, preset) {
        const types = ['string', 'number', 'html', 'progress', 'status'];
        const typeOptions = types.map(t => `<option value="${t}" ${col.type === t ? 'selected' : ''}>${t}</option>`).join('');
        const isHeaderMode = preset.firstRowMode === 'header';

        // 补回：Status 的具体映射配置 UI
        let statusEditorHtml = '';
        if (col.type === 'status') {
            statusEditorHtml = `<div class="status-mappings-container" data-col-index="${index}" style="margin-top: 8px; border-top: 1px dashed var(--border-primary); padding-top: 8px;">`;
            statusEditorHtml += `<div style="font-size:10px; color:var(--text-secondary); margin-bottom: 4px;">Use variable <code>data</code> (e.g. <code>data > 0.5</code> or <code>data == "Done"</code>)</div>`;

            (col.statusMappings || []).forEach((map, mIndex) => {
                statusEditorHtml += `
                    <div style="border:1px solid var(--border-primary); padding:6px; border-radius:4px; margin-bottom:6px; position:relative; background:rgba(0,0,0,0.1);">
                        <button class="db-icon-btn delete col-delete-map" data-col-index="${index}" data-map-index="${mIndex}" style="position:absolute; top:2px; right:2px;">×</button>
                        
                        <div style="display:flex; align-items:center; margin-bottom:4px; margin-right: 20px;">
                            <span style="font-size:10px; color:var(--text-accent); font-family:monospace; margin-right:4px;">if (</span>
                            <input type="text" class="db-input map-condition" value="${map.condition.replace(/"/g, '&quot;')}" placeholder='data > 10' data-col-index="${index}" data-map-index="${mIndex}" style="margin:0; font-family:monospace; flex-grow:1; padding: 2px 4px;">
                            <span style="font-size:10px; color:var(--text-accent); font-family:monospace; margin-left:4px;">)</span>
                        </div>
                        
                        <div style="display:flex; align-items:center;">
                            <span style="font-size:10px; color:var(--text-secondary); margin-right:8px;">Then:</span>
                            <input type="text" class="db-input map-html" value="${map.html.replace(/"/g, '&quot;')}" placeholder='HTML/Text' data-col-index="${index}" data-map-index="${mIndex}" style="margin:0; flex-grow:1; padding: 2px 4px;">
                        </div>
                    </div>
                `;
            });
            statusEditorHtml += `<button class="db-btn add-map-btn" data-col-index="${index}" style="padding:2px 6px; font-size:11px;">+ Add Condition</button></div>`;
        }

        return `
            <div class="db-col-card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <span style="font-weight:bold; font-size:12px;">Col ${index + 1}</span>
                    <div style="display:flex; gap: 2px;">
                        <button class="db-icon-btn col-move-up" data-index="${index}" title="Move Up">↑</button>
                        <button class="db-icon-btn col-move-down" data-index="${index}" title="Move Down">↓</button>
                        <button class="db-icon-btn delete col-delete" data-index="${index}" title="Delete">🗑</button>
                    </div>
                </div>
                <label style="font-size:11px; color:var(--text-secondary);">Data Source Header:</label>
                <select class="db-input col-source-select" data-index="${index}" data-current="${col.sourceHeader || ''}">
                    <option value="">(Loading...)</option>
                </select>
                
                <label style="font-size:11px; color:var(--text-secondary);">Display Label:</label>
                <input type="text" class="db-input col-label-input" value="${col.label || ''}" data-index="${index}" ${isHeaderMode ? 'disabled style="opacity:0.6"' : ''}>
                
                <label style="font-size:11px; color:var(--text-secondary);">Type:</label>
                <select class="db-input col-type-select" data-index="${index}">${typeOptions}</select>
                
                ${statusEditorHtml}
            </div>
        `;
    }

    _populateSourceHeadersForConfig() {
        const preset = this._getActivePreset();
        if (!preset) return;

        let headers = [];
        if (this.previewCacheData && this.previewCacheData.length > 0) {
            if (preset.firstRowMode === 'header') {
                headers = this.previewCacheData[0];
            } else {
                headers = this.previewCacheData[0].map((_, i) => `Column ${i + 1}`);
            }
        }

        this.elements.configPanel.querySelectorAll('.col-source-select').forEach(select => {
            const currentVal = select.dataset.current;
            select.innerHTML = headers.map(h => `<option value="${h}" ${h === currentVal ? 'selected' : ''}>${h}</option>`).join('');
        });
    }

    // --- 事件处理：Config 交互 ---
    _onConfigClick(e) {
        const target = e.target;
        const preset = this._getActivePreset();
        if (!preset) return;

        if (target.classList.contains('add-col-btn')) {
            // 根据当前数据智能赋予初始 Header
            let defaultHeader = '';
            const colIdx = preset.columns.length;
            if (this.previewCacheData && this.previewCacheData.length > 0) {
                if (preset.firstRowMode === 'header') {
                    // 尝试取对应列的数据，没有就取第一列
                    defaultHeader = this.previewCacheData[0][colIdx] || this.previewCacheData[0][0] || '';
                } else {
                    defaultHeader = `Column ${colIdx + 1}`;
                }
            }

            preset.columns.push({
                sourceHeader: defaultHeader,
                type: 'string',
                label: defaultHeader,
                width: 0.2
            });

            this._markDirty();
            this._renderConfigPanel();
            this._renderPreview();
        } else if (target.classList.contains('col-delete')) {
            const idx = parseInt(target.dataset.index);
            preset.columns.splice(idx, 1);
            this._markDirty();
            this._renderConfigPanel();
            this._renderPreview();
        } else if (target.classList.contains('col-move-up') || target.classList.contains('col-move-down')) {
            const idx = parseInt(target.dataset.index);
            const dir = target.classList.contains('col-move-up') ? -1 : 1;
            const newIdx = idx + dir;
            if (newIdx >= 0 && newIdx < preset.columns.length) {
                const temp = preset.columns[idx];
                preset.columns[idx] = preset.columns[newIdx];
                preset.columns[newIdx] = temp;
                this._markDirty();
                this._renderConfigPanel();
                this._renderPreview();
            }
        } else if (target.classList.contains('add-map-btn')) {
            const idx = parseInt(target.dataset.colIndex);
            if (!preset.columns[idx].statusMappings) preset.columns[idx].statusMappings = [];
            preset.columns[idx].statusMappings.push({ condition: '', html: '' });
            this._markDirty();
            this._renderConfigPanel();
        } else if (target.classList.contains('col-delete-map')) {
            const colIdx = parseInt(target.dataset.colIndex);
            const mapIdx = parseInt(target.dataset.mapIndex);
            preset.columns[colIdx].statusMappings.splice(mapIdx, 1);
            this._markDirty();
            this._renderConfigPanel();
            this._renderPreview();
        }
    }

    _onConfigChange(e) {
        const target = e.target;
        const preset = this._getActivePreset();
        if (!preset) return;

        if (target.classList.contains('first-row-mode-select')) {
            const newMode = target.value;
            const oldMode = preset.firstRowMode;

            if (newMode !== oldMode && this.previewCacheData && this.previewCacheData.length > 0) {
                const realHeaders = this.previewCacheData[0];
                const genericHeaders = realHeaders.map((_, i) => `Column ${i + 1}`);

                preset.columns.forEach(col => {
                    let colIndex = realHeaders.indexOf(col.sourceHeader);
                    if (colIndex === -1) {
                        colIndex = genericHeaders.indexOf(col.sourceHeader);
                    }
                    if (colIndex !== -1) {
                        col.sourceHeader = (newMode === 'header') ? realHeaders[colIndex] : genericHeaders[colIndex];
                    }
                });
            }

            preset.firstRowMode = newMode;
            this._markDirty();
            this._renderConfigPanel();
            this._renderPreview();
        } else if (target.classList.contains('col-source-select')) {
            const idx = parseInt(target.dataset.index);
            preset.columns[idx].sourceHeader = target.value;
            if (preset.firstRowMode === 'header') preset.columns[idx].label = target.value;
            this._markDirty();
            this._renderConfigPanel();
            this._renderPreview();
        } else if (target.classList.contains('col-label-input')) {
            const idx = parseInt(target.dataset.index);
            preset.columns[idx].label = target.value;
            this._markDirty();
            this._renderPreview();
        } else if (target.classList.contains('col-type-select')) {
            const idx = parseInt(target.dataset.index);
            preset.columns[idx].type = target.value;
            this._markDirty();
            this._renderConfigPanel();
            this._renderPreview();
        } else if (target.classList.contains('map-condition')) {
            const colIdx = parseInt(target.dataset.colIndex);
            const mapIdx = parseInt(target.dataset.mapIndex);
            preset.columns[colIdx].statusMappings[mapIdx].condition = target.value;
            this._markDirty();
            this._renderPreview();
        } else if (target.classList.contains('map-html')) {
            const colIdx = parseInt(target.dataset.colIndex);
            const mapIdx = parseInt(target.dataset.mapIndex);
            preset.columns[colIdx].statusMappings[mapIdx].html = target.value;
            this._markDirty();
            this._renderPreview();
        }
    }

    // --- 数据获取与预览 ---
    async _refreshPreviewData() {
        this.previewCacheData = [];
        if (this.dbData.data.mode === 'embedded') {
            this.previewCacheData = this.dbData.data.embeddedData;
            this._populateSourceHeadersForConfig();
            this._renderPreview();
        } else if (this.dbData.data.mode === 'external' && this.dbData.data.externalUrl) {
            let text = '';
            try {
                const response = await fetch(this.dbData.data.externalUrl);
                text = await response.text();
                this.previewCacheData = this._parseCSV(text);
            } catch (e) {
                console.error("Preview data load error", e);
            }
            this._populateSourceHeadersForConfig();
            this._renderPreview();
        }
    }

    _parseCSV(text) {
        // (省略完整实现，使用原先 DataBlock 中的 csv 简易解析即可)
        const rows = [];
        text.split('\n').forEach(line => {
            if (line.trim()) rows.push(line.split(',').map(s => s.trim().replace(/^"|"$/g, '')));
        });
        return rows;
    }

    _renderPreview() {
        console.log("Rendering preview");
        const preset = this._getActivePreset();
        if (!preset) {
            this.elements.previewContainer.innerHTML = '<div style="padding:20px; color:var(--text-secondary);">No preset available for preview.</div>';
            return;
        }

        // 核心：直接实例化 TableViewBlock 作为渲染器
        // 伪造一个 editor 环境 (只提供需要的 API)
        const fakeEditor = { BAPI_PE: {}, BAPI_WD: window.BAPI_WD, BAPI_IPC: window.BAPI_IPC };

        // 我们动态调用渲染子块
        if (!this.previewBlockInstance) {
            // 首次预览：实例化最外层的 DataBlock
            const DataBlockClass = window['blockRegistry'].get('data');
            if (DataBlockClass) {
                const blockData = { id: 'preview-1', type: 'data', properties: { 'dbPath': this.filePath, presetId: preset.id } };
                this.previewBlockInstance = new DataBlockClass(blockData, fakeEditor);

                this.previewBlockInstance._dbJsonCache = this.dbData;

                // 执行正常渲染周期
                this.elements.previewContainer.innerHTML = '';
                this.previewBlockInstance.render();
                this.elements.previewContainer.appendChild(this.previewBlockInstance.contentElement);
            }
        } else {
            // 已存在实例：直接复用，更新配置并请求自身重绘
            this.previewBlockInstance.properties.presetId = preset.id;
            this.previewBlockInstance._dbJsonCache = this.dbData;

            this.previewBlockInstance.render();
        }
    }

    destroy() { this.container.innerHTML = ''; }
    onFocus() { }
    onKeyDown(e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            this.save();
        }
    }
}