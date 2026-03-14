// components/blocks/data/TableViewBlock.js
class TableViewBlock extends Block {
    static type = 'tableView';
    static canBeToggled = false;
    static label = 'Table View';

    constructor(data, editor) {
        super(data, editor);

        this.properties.tableWidthScale = data.properties?.tableWidthScale || 1;
        this.properties.maxHeight = data.properties?.maxHeight || '';

        // 缓存父级传来的数据，用于 Details 面板修改属性后自身触发的重绘
        this._lastRawData = null;
        this._lastConfig = null;
    }

    render() {
        this.element = document.createElement('div');
        this.element.className = 'tableview-content';
        this.element.dataset['id'] = this.id;
        return this.element;
    }

    _renderContent() {
        if (this._lastRawData && this._lastConfig) {
            this._renderDataContent(this._lastRawData, this._lastConfig);
        }
    }

    static getPropertiesSchema() {
        return [
            { key: 'tableWidthScale', label: 'Table View Scale', type: 'number', placeholder: '(0.0, 1.0] (Default 1)', min: 0.1, max: 1.0 },
            { key: 'maxHeight', label: 'Max Height', type: 'text', placeholder: 'e.g. 400px' },
            ...super.getPropertiesSchema()
        ];
    }

    /**
     * @private
     */
    async renderPresetConfigPanel(preset, dbJsonCache, markDirtyCallback, parentDataBlock) {
        if (!preset.config) preset.config = {};
        const config = preset.config;
        if (!config.columns) config.columns = [];

        if (!this.configContainer) {
            this.configContainer = document.createElement('div');
            this.configContainer.className = 'table-view-config-container';

            this.configContainer.addEventListener('click', async (e) => {
                const target = e.target;
                if (target.classList.contains('add-col-btn')) {
                    const rawData = await parentDataBlock._getRawData();
                    let defaultHeader = '';
                    const colIdx = config.columns.length;
                    if (rawData && rawData.length > 0) {
                        if (config.firstRowMode === 'header') {
                            defaultHeader = rawData[0][colIdx] || rawData[0][0] || '';
                        } else {
                            defaultHeader = `Column ${colIdx + 1}`;
                        }
                    }
                    config.columns.push({ sourceHeader: defaultHeader, type: 'string', label: defaultHeader, width: 0.2 });
                    markDirtyCallback();
                    this.renderPresetConfigPanel(preset, dbJsonCache, markDirtyCallback, parentDataBlock);
                } else if (target.classList.contains('col-delete')) {
                    config.columns.splice(parseInt(target.dataset['index']), 1);
                    markDirtyCallback();
                    this.renderPresetConfigPanel(preset, dbJsonCache, markDirtyCallback, parentDataBlock);
                } else if (target.classList.contains('col-move-up') || target.classList.contains('col-move-down')) {
                    const idx = parseInt(target.dataset['index']);
                    const newIdx = idx + (target.classList.contains('col-move-up') ? -1 : 1);
                    if (newIdx >= 0 && newIdx < config.columns.length) {
                        const temp = config.columns[idx];
                        config.columns[idx] = config.columns[newIdx];
                        config.columns[newIdx] = temp;
                        markDirtyCallback();
                        this.renderPresetConfigPanel(preset, dbJsonCache, markDirtyCallback, parentDataBlock);
                    }
                } else if (target.classList.contains('add-map-btn')) {
                    const idx = parseInt(target.dataset['colIndex']);
                    if (!config.columns[idx].statusMappings) config.columns[idx].statusMappings = [];
                    config.columns[idx].statusMappings.push({ condition: '', html: '' });
                    markDirtyCallback();
                    this.renderPresetConfigPanel(preset, dbJsonCache, markDirtyCallback, parentDataBlock);
                } else if (target.classList.contains('col-delete-map')) {
                    config.columns[parseInt(target.dataset['colIndex'])].statusMappings.splice(parseInt(target.dataset['mapIndex']), 1);
                    markDirtyCallback();
                    this.renderPresetConfigPanel(preset, dbJsonCache, markDirtyCallback, parentDataBlock);
                }
            });

            this.configContainer.addEventListener('change', async (e) => {
                const target = e.target;
                if (target.classList.contains('first-row-mode-select')) {
                    const newMode = target.value;
                    if (newMode !== config.firstRowMode) {
                        const rawData = await parentDataBlock._getRawData();
                        if (rawData && rawData.length > 0) {
                            const realHeaders = rawData[0];
                            const genericHeaders = realHeaders.map((_, i) => `Column ${i + 1}`);
                            config.columns.forEach(col => {
                                let colIndex = realHeaders.indexOf(col.sourceHeader);
                                if (colIndex === -1) colIndex = genericHeaders.indexOf(col.sourceHeader);
                                if (colIndex !== -1) col.sourceHeader = (newMode === 'header') ? realHeaders[colIndex] : genericHeaders[colIndex];
                            });
                        }
                    }
                    config.firstRowMode = newMode;
                    markDirtyCallback();
                    this.renderPresetConfigPanel(preset, dbJsonCache, markDirtyCallback, parentDataBlock);
                } else if (target.classList.contains('col-source-select')) {
                    const idx = parseInt(target.dataset['index']);
                    config.columns[idx].sourceHeader = target.value;
                    if (config.firstRowMode === 'header') config.columns[idx].label = target.value;
                    markDirtyCallback();
                    this.renderPresetConfigPanel(preset, dbJsonCache, markDirtyCallback, parentDataBlock);
                } else if (target.classList.contains('col-label-input')) {
                    config.columns[parseInt(target.dataset['index'])].label = target.value;
                    markDirtyCallback();
                } else if (target.classList.contains('col-type-select')) {
                    config.columns[parseInt(target.dataset['index'])].type = target.value;
                    markDirtyCallback();
                    this.renderPresetConfigPanel(preset, dbJsonCache, markDirtyCallback, parentDataBlock);
                } else if (target.classList.contains('map-condition')) {
                    config.columns[parseInt(target.dataset['colIndex'])].statusMappings[parseInt(target.dataset['mapIndex'])].condition = target.value;
                    markDirtyCallback();
                } else if (target.classList.contains('map-html')) {
                    config.columns[parseInt(target.dataset['colIndex'])].statusMappings[parseInt(target.dataset['mapIndex'])].html = target.value;
                    markDirtyCallback();
                }
            });
        }

        const rawData = await parentDataBlock._getRawData();
        let headers = [];
        if (rawData && rawData.length > 0) {
            if (config.firstRowMode === 'header') {
                headers = rawData[0];
            } else {
                headers = rawData[0].map((_, i) => `Column ${i + 1}`);
            }
        }

        const modes = ['header', 'ignore', 'data'];
        const modeOptions = modes.map(m => `<option value="${m}" ${config.firstRowMode === m ? 'selected' : ''}>${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('');

        let html = `
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

        (config.columns || []).forEach((col, index) => {
            const types = ['string', 'number', 'html', 'progress', 'status'];
            const typeOptions = types.map(t => `<option value="${t}" ${col.type === t ? 'selected' : ''}>${t}</option>`).join('');
            const isHeaderMode = config.firstRowMode === 'header';

            const headerOptions = headers.map(h => `<option value="${h}" ${h === col.sourceHeader ? 'selected' : ''}>${h}</option>`).join('');

            let statusEditorHtml = '';
            if (col.type === 'status') {
                statusEditorHtml = `<div class="status-mappings-container" data-col-index="${index}" style="margin-top: 8px; border-top: 1px dashed var(--border-primary); padding-top: 8px;">`;
                statusEditorHtml += `<div style="font-size:10px; color:var(--text-secondary); margin-bottom: 4px;">Use variable <code>data</code></div>`;
                (col.statusMappings || []).forEach((map, mIndex) => {
                    statusEditorHtml += `
                        <div style="border:1px solid var(--border-primary); padding:6px; border-radius:4px; margin-bottom:6px; position:relative; background:rgba(0,0,0,0.1);">
                            <button class="db-icon-btn delete col-delete-map" data-col-index="${index}" data-map-index="${mIndex}" style="position:absolute; top:2px; right:2px;">×</button>
                            <div style="display:flex; align-items:center; margin-bottom:4px; margin-right: 20px;">
                                <span style="font-size:10px; color:var(--text-accent); font-family:monospace; margin-right:4px;">if (</span>
                                <input type="text" class="db-input map-condition" value="${map.condition.replace(/"/g, '&quot;')}" data-col-index="${index}" data-map-index="${mIndex}" style="margin:0; font-family:monospace; flex-grow:1; padding: 2px 4px;">
                                <span style="font-size:10px; color:var(--text-accent); font-family:monospace; margin-left:4px;">)</span>
                            </div>
                            <div style="display:flex; align-items:center;">
                                <span style="font-size:10px; color:var(--text-secondary); margin-right:8px;">Then:</span>
                                <input type="text" class="db-input map-html" value="${map.html.replace(/"/g, '&quot;')}" data-col-index="${index}" data-map-index="${mIndex}" style="margin:0; flex-grow:1; padding: 2px 4px;">
                            </div>
                        </div>
                    `;
                });
                statusEditorHtml += `<button class="db-btn add-map-btn" data-col-index="${index}" style="padding:2px 6px; font-size:11px;">+ Add Condition</button></div>`;
            }

            html += `
                <div class="db-col-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-weight:bold; font-size:12px;">Col ${index + 1}</span>
                        <div style="display:flex; gap: 2px;">
                            <button class="db-icon-btn col-move-up" data-index="${index}">↑</button>
                            <button class="db-icon-btn col-move-down" data-index="${index}">↓</button>
                            <button class="db-icon-btn delete col-delete" data-index="${index}">🗑</button>
                        </div>
                    </div>
                    <label style="font-size:11px; color:var(--text-secondary);">Data Source Header:</label>
                    <select class="db-input col-source-select" data-index="${index}">${headerOptions}</select>
                    
                    <label style="font-size:11px; color:var(--text-secondary);">Display Label:</label>
                    <input type="text" class="db-input col-label-input" value="${col.label || ''}" data-index="${index}" ${isHeaderMode ? 'disabled style="opacity:0.6"' : ''}>
                    
                    <label style="font-size:11px; color:var(--text-secondary);">Type:</label>
                    <select class="db-input col-type-select" data-index="${index}">${typeOptions}</select>
                    ${statusEditorHtml}
                </div>
            `;
        });
        html += `</div>`;

        this.configContainer.innerHTML = html;
        return this.configContainer;
    }

    // 由 DataBlock 调用
    // 由 DataBlock 调用
    _renderDataContent(rawData, config) {
        // 缓存数据，以便在 Details 面板修改属性后触发 _renderContent 时重绘
        this._lastRawData = rawData;
        this._lastConfig = config;

        if (!config) return;
        if (!config.columns) config.columns = [];

        if (!rawData || rawData.length === 0) {
            this.element.innerHTML = '<div style="padding:10px; color:gray;">Empty data.</div>';
            return;
        }

        let sourceHeaders = [];
        let dataRows = [];

        // 根据配置解析表头和数据体
        if (config.firstRowMode === 'header') {
            sourceHeaders = rawData[0] || [];
            dataRows = rawData.slice(1);
        } else if (config.firstRowMode === 'ignore') {
            sourceHeaders = (rawData[0] || []).map((_, i) => `Column ${i + 1}`);
            dataRows = rawData.slice(1);
        } else {
            sourceHeaders = (rawData[0] || []).map((_, i) => `Column ${i + 1}`);
            dataRows = rawData;
        }

        const totalCols = config.columns.length;
        if (totalCols === 0) {
            this.element.innerHTML = '<div style="padding:10px;">No columns configured in this preset.</div>';
            return;
        }

        // 1. 计算宽度比例样式
        let scale = parseFloat(this.properties.tableWidthScale);
        if (isNaN(scale) || scale <= 0 || scale > 1) scale = 1;
        const totalWidthStyle = scale === 1 ? '100%' : `${(1 / scale) * 100}%`;

        // 2. 计算最大高度样式
        let maxHeightStyle = '';
        if (this.properties.maxHeight) {
            maxHeightStyle = `max-height: ${this.properties.maxHeight}; overflow-y: auto;`;
        }

        // 3. 构建 HTML 框架
        let html = `<div class="table-view-container" style="width:100%; overflow-x:auto; ${maxHeightStyle} border:1px solid var(--border-primary);">`;
        html += `<table class="vn-table" style="table-layout:fixed; width:${totalWidthStyle};"><thead><tr>`;

        // 渲染表头
        config.columns.forEach(col => {
            const label = (config.firstRowMode === 'header' ? col.sourceHeader : (col.label || col.sourceHeader)) || 'Untitled';
            const widthPercent = (col.width || (1 / totalCols)) * 100;
            html += `<th style="width: ${widthPercent}%;">${label}</th>`;
        });
        html += `</tr></thead><tbody>`;

        // 渲染数据行
        dataRows.forEach(row => {
            html += `<tr>`;
            config.columns.forEach(col => {
                let colIndex = sourceHeaders.indexOf(col.sourceHeader);
                let cellValue = (colIndex > -1 && colIndex < row.length) ? row[colIndex] : '';
                html += `<td>${this._processCellType(cellValue, col)}</td>`;
            });
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;
        this.element.innerHTML = html;
    }

    _processCellType(value, config) {
        if (value === null || value === undefined) return '';

        switch (config.type) {
            case 'number':
                const num = parseFloat(String(value).replace(/[^0-9.-]+/g, ""));
                return isNaN(num) ? '' : num;

            case 'html':
                return value; // 信任源 HTML

            case 'progress':
                const percent = parseFloat(value);
                if (isNaN(percent)) return '';
                const clamped = Math.max(0, Math.min(1, percent));
                return `
                    <div style="display: flex; align-items: center; width: 100%; height: 100%;">
                        <div style="flex-grow: 1; height: 8px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; margin-right: 8px;">
                            <div style="width: ${clamped * 100}%; height: 100%; background: var(--text-accent);"></div>
                        </div>
                        <span style="font-size: 12px; color: var(--text-secondary); min-width: 35px; text-align: right; flex-shrink: 0;">
                            ${Math.round(clamped * 100)}%
                        </span>
                    </div>
                `;

            case 'status':
                if (!config.statusMappings) return value;
                for (const map of config.statusMappings) {
                    try {
                        const condition = map.condition.trim();
                        if (!condition) continue;

                        let valForEval = value;
                        if (!isNaN(parseFloat(value))) valForEval = parseFloat(value);
                        else valForEval = String(value);

                        const checkFunc = new Function('data', `try { return ${condition}; } catch(e) { return false; }`);
                        if (checkFunc(valForEval)) {
                            return map.html;
                        }
                    } catch (e) {
                        console.warn("Status mapping error", e);
                    }
                }
                return value;

            case 'string':
            default:
                return String(value)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
        }
    }
}

window['registerBlock'](TableViewBlock);