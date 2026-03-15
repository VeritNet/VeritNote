// components/data-editor/database-editor.js

class DatabaseEditor {
    constructor(container, filePath, tabManager) {
        this.container = container;
        this.filePath = filePath;
        this.tabManager = tabManager;

        // DB 数据结构
        this.dbData = {
            'config': {},
            'data': { mode: 'embedded', embeddedData: [], externalUrl: '' },
            'presets': []
        };

        this.activePresetId = null;
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
                this.dbData['data']['mode'] = e.target.value;
                this._updateDataSourceUI();
                this._markDirty();
                this._refreshPreviewData();
            });
        });

        this.elements.externalUrlInput.addEventListener('change', (e) => {
            this.dbData['data']['externalUrl'] = e.target.value;
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
                    this.dbData['data']['externalUrl'] = this.elements.externalUrlInput.value;
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
                    this.dbData['data']['embeddedData'] = this._parseCSV(text);
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
            while (this.dbData['presets'].some(p => p.name === defaultName)) {
                defaultName = `${baseName} ${counter}`;
                counter++;
            }

            const name = prompt("Preset Name:", defaultName);
            if (!name) return;
            if (this.dbData['presets'].some(p => p.name === name)) {
                alert("Preset name already exists!");
                return;
            }
            const newPreset = {
                id: 'preset-' + Date.now(),
                name: name,
                type: 'tableView', // 默认类型
                config: {
                    firstRowMode: 'header',
                    columns: []
                }
            };
            this.dbData['presets'].push(newPreset);
            this.activePresetId = newPreset.id;
            this._markDirty();
            this._renderTabs();
            this._refreshPreviewData();
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
    }

    onDatabaseLoaded(payload) {
        if (payload.path !== this.filePath) return;
        this.dbData = payload.content;

        if (!this.dbData['presets']) this.dbData['presets'] = [];
        if (!this.dbData['data']) this.dbData['data'] = { 'mode': 'embedded', 'embeddedData': [], 'externalUrl': '' };

        if (this.dbData['presets'].length > 0) {
            this.activePresetId = this.dbData['presets'][0].id;
        }

        this._updateDataSourceUI();
        this._renderTabs();
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
        const isEmbedded = this.dbData['data']['mode'] === 'embedded';
        this.container.querySelector(`input[name="db-mode"][value="embedded"]`).checked = isEmbedded;
        this.container.querySelector(`input[name="db-mode"][value="external"]`).checked = !isEmbedded;

        this.elements.embeddedConfig.style.display = isEmbedded ? 'flex' : 'none';
        this.elements.externalConfig.style.display = !isEmbedded ? 'flex' : 'none';

        if (isEmbedded) {
            this.elements.embeddedInfo.textContent = `Contains ${this.dbData['data']['embeddedData'] ? this.dbData['data']['embeddedData'].length : 0} rows of data.`;
        } else {
            this.elements.externalUrlInput.value = this.dbData['data']['externalUrl'] || '';
        }
    }

    _renderTabs() {
        this.elements.tabsContainer.innerHTML = '';
        this.dbData['presets'].forEach(preset => {
            const tab = document.createElement('div');
            tab.className = `db-preset-tab ${preset.id === this.activePresetId ? 'active' : ''}`;
            tab.innerHTML = `
                <span>${preset.name}</span>
                <span class="delete-preset" data-id="${preset.id}" style="font-size:10px; padding:2px;">❌</span>
            `;
            tab.onclick = (e) => {
                if (e.target.classList.contains('delete-preset')) {
                    if (confirm("Delete this preset?")) {
                        this.dbData['presets'] = this.dbData['presets'].filter(p => p.id !== preset.id);
                        if (this.activePresetId === preset.id) this.activePresetId = this.dbData['presets'][0]?.id || null;
                        this._markDirty();
                        this._renderTabs();
                        this._refreshPreviewData();
                    }
                } else {
                    this.activePresetId = preset.id;
                    this._renderTabs();
                    this._refreshPreviewData();
                }
            };
            this.elements.tabsContainer.appendChild(tab);
        });
    }

    _getActivePreset() {
        return this.dbData['presets'].find(p => p.id === this.activePresetId);
    }

    // --- 配置面板渲染 ---
    async _renderConfigPanel() {
        const preset = this._getActivePreset();
        if (!preset) {
            this.elements.configPanel.innerHTML = '<div class="empty-placeholder">No preset selected.</div>';
            return;
        }

        // 基础 Preset 类型选择的 UI 仍然保留在 Editor 这里
        let html = `
            <div style="margin-bottom: 15px;">
                <label style="font-weight:bold; font-size:12px;">Preset Type:</label>
                <select class="db-input preset-type-select">
                    <option value="tableView" ${preset.type === 'tableView' ? 'selected' : ''}>Table View</option>
                </select>
            </div>
            <div id="db-dynamic-config-container"></div>
        `;
        this.elements.configPanel.innerHTML = html;
        const dynamicContainer = this.elements.configPanel.querySelector('#db-dynamic-config-container');

        // 创建通知保存并刷新预览的回调函数
        const markDirtyCallback = () => {
            this._markDirty();
            this._renderPreview();
        };

        if (this.previewBlockInstance) {
            dynamicContainer.innerHTML = '<div style="font-size:12px;color:gray;">Loading config...</div>';
            // 委托子块生成该预设的具体配置面板DOM元素
            const configElement = await this.previewBlockInstance.renderPresetConfigPanel(preset, markDirtyCallback);
            dynamicContainer.innerHTML = '';
            dynamicContainer.appendChild(configElement);
        }
    }

    // --- 数据获取与预览 ---
    async _refreshPreviewData() {
        await this._renderPreview();
        await this._renderConfigPanel();
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
        const preset = this._getActivePreset();
        if (!preset) {
            this.elements.previewContainer.innerHTML = '<div style="padding:20px; color:var(--text-secondary);">No preset available for preview.</div>';
            return;
        }

        // 我们动态调用渲染子块
        if (!this.previewBlockInstance) {
            // ！！临时方案！！：伪造一个 editor 环境 (只提供需要的 API)
            const deepFakeEditor = {};
            const fakeEditor = {
                'BAPI_PE': {
                    ['createBlockInstance']: (blockData) => {
                        const BlockClass = window['blockRegistry'].get(blockData.type);
                        if (BlockClass) {
                            return new BlockClass(blockData, deepFakeEditor);
                        }
                        console.error(`Block type "${blockData.type}" is not registered.`);
                        return null;
                    },
                }
            };

            // 首次预览：实例化最外层的 DataBlock
            const DataBlockClass = window['blockRegistry'].get('data');
            if (DataBlockClass) {
                const blockData = { id: 'preview-1', type: 'data', properties: { 'dbPath': this.filePath, presetId: preset.id } };
                this.previewBlockInstance = new DataBlockClass(blockData, fakeEditor);

                this.previewBlockInstance._dbJsonCache = this.dbData;

                // 执行正常渲染周期
                this.elements.previewContainer.innerHTML = '';
                this.previewBlockInstance.render();
                this.elements.previewContainer.appendChild(this.previewBlockInstance.element);
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