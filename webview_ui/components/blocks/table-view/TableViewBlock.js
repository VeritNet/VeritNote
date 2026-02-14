// js/blocks/TableViewBlock.js
class TableViewBlock extends DataBlock {
    static type = 'table-view';
    static icon = '📊';
    static label = 'Table View';
    static description = 'Renders CSV data as a configurable table.';
    static keywords = ['data', 'table', 'csv', 'spreadsheet'];
    static canBeToggled = true;

    constructor(data, editor) {
        super(data, editor);

        // 初始化特定属性
        if (!this.properties.columns) this.properties.columns = [];
        // columns 结构: [{ id, sourceHeader, type, label, statusMappings: [], ... }]

        if (!this.properties.firstRowMode) this.properties.firstRowMode = 'header'; // header, ignore, data

        // 样式属性
        if (!this.properties.maxHeight) this.properties.maxHeight = '';
        if (!this.properties.tableWidthScale) this.properties.tableWidthScale = 1;
    }

    // 复用 DataBlock 的 get data()

    static getPropertiesSchema() {
        return [
            { key: 'maxHeight', label: 'Max Height', type: 'text', placeholder: 'e.g. 400px' },
            {
                key: 'tableWidthScale',
                label: 'Table View Scale',
                type: 'number',
                placeholder: '(0.0, 1.0] (Default 1)',
                min: 0.1,
                max: 1.0
            },
            ...super.getPropertiesSchema()
        ];
    }

    _renderContent() {
        this.contentElement.innerHTML = '<div class="loading-placeholder">Loading data...</div>';

        this.loadData().then(rawData => {
            if (!rawData || rawData.length === 0) {
                this.contentElement.innerHTML = '<div class="empty-details-placeholder">No data found in source.</div>';
                return;
            }

            // 处理列配置
            if (!this.properties.columns || this.properties.columns.length === 0) {
                this.contentElement.innerHTML = `
                    <div class="empty-details-placeholder" style="border: 1px dashed var(--border-primary); padding: 20px;">
                        ⚠️ No columns configured.<br>
                        Right-click block > Details > Data to configure columns.
                    </div>
                `;
                return;
            }

            this._renderTable(rawData);
        });
    }

    _renderTable(rawData) {
        // 1. 确定数据源头和表头
        let sourceHeaders = [];
        let dataRows = [];

        if (this.properties.firstRowMode === 'header') {
            sourceHeaders = rawData[0];
            dataRows = rawData.slice(1);
        } else if (this.properties.firstRowMode === 'ignore') {
            // 尝试生成索引作为临时表头
            sourceHeaders = rawData[0].map((_, i) => `Column ${i + 1}`);
            dataRows = rawData.slice(1);
        } else {
            // firstRowMode === 'data'
            sourceHeaders = rawData[0].map((_, i) => `Column ${i + 1}`);
            dataRows = rawData;
        }

        // 2. 构建 HTML
        let scale = parseFloat(this.properties.tableWidthScale);
        if (isNaN(scale) || scale <= 0 || scale > 1) scale = 1;
        const totalWidthStyle = scale === 1 ? '100%' : `${(1 / scale) * 100}%`;

        // 初始化列宽：如果列没有宽度配置，分配平均宽度
        const totalCols = this.properties.columns.length;
        let hasMissingWidth = false;
        this.properties.columns.forEach(col => {
            if (!col.width) {
                col.width = 1 / totalCols; // 默认平均分配
                hasMissingWidth = true;
            }
        });
        // 只有在初始化默认值时才保存一次，避免渲染循环
        if (hasMissingWidth && totalCols > 0) {
            ///////////////////////////////////////////////////////////
        }

        const containerStyle = `
            width: 100%; 
            overflow-x: auto; 
            overflow-y: auto; 
            max-height: ${this.properties.maxHeight || 'auto'};
            border: 1px solid var(--border-primary);
            border-radius: 4px;
            display: block; /* 确保块级显示 */
        `;
        const tableStyle = `
            table-layout: fixed; 
            width: ${totalWidthStyle}; 
            min-width: 100%;
            margin: 0; /* 移除默认边距 */
        `;

        let html = `<div class="table-view-container" style="${containerStyle}">`;
        html += `<table class="vn-table" style="${tableStyle}"><thead><tr>`;

        // 渲染表头
        this.properties.columns.forEach((colConfig, index) => {
            const label = colConfig.label || colConfig.sourceHeader || 'Untitled';
            const widthPercent = (colConfig.width || (1 / totalCols)) * 100;

            // 最后一列不加 resizer
            const resizerHtml = (index < totalCols - 1)
                ? `<div class="tv-col-resizer" style="position:absolute; right:0; top:0; bottom:0; width:5px; cursor:col-resize; z-index:2;" data-index="${index}"></div>`
                : '';

            html += `<th style="width: ${widthPercent}%; position: relative;">
                        <div style="overflow:hidden; text-overflow:ellipsis;">${label}</div>
                        ${resizerHtml}
                     </th>`;
        });
        html += `</tr></thead><tbody>`;

        // 渲染数据行
        dataRows.forEach(row => {
            html += `<tr>`;
            this.properties.columns.forEach(colConfig => {
                // 找到对应源数据的索引
                let colIndex = -1;
                if (this.properties.firstRowMode === 'header') {
                    colIndex = sourceHeaders.indexOf(colConfig.sourceHeader);
                } else {
                    // 如果不是 header 模式，sourceHeader 存储的可能是 "Column 1" 这种字符串
                    // 这里简化逻辑：我们在配置界面存的是 header 字符串，如果没有 header，我们假设用户在配置时看到的是索引
                    // 为了健壮性，这里假设 colConfig.sourceHeader 存储的是实际的列名或者索引值
                    // 实际上，为了简单，我们在配置阶段应该让用户选择 "Index 0: Value" 
                    // 这里我们通过匹配 text 来找 index，或者 fallback 到顺序
                    colIndex = sourceHeaders.indexOf(colConfig.sourceHeader);
                }

                let cellValue = (colIndex > -1 && colIndex < row.length) ? row[colIndex] : '';
                const renderedValue = this._processCellType(cellValue, colConfig);
                html += `<td>${renderedValue}</td>`;
            });
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;
        this.contentElement.innerHTML = html;

        // 绑定 Resize 事件
        this.contentElement.querySelectorAll('.tv-col-resizer').forEach(handle => {
            handle.addEventListener('mousedown', (e) => this.initResize(e, parseInt(handle.dataset.index)));
        });
    }

    initResize(e, colIndex) {
        e.preventDefault();
        e.stopPropagation();

        const tableEl = this.contentElement.querySelector('table');
        const startX = e.clientX;
        const tableWidth = tableEl.offsetWidth;

        // 获取当前列和右侧列的初始宽度比例
        const leftColConfig = this.properties.columns[colIndex];
        const rightColConfig = this.properties.columns[colIndex + 1];

        if (!leftColConfig || !rightColConfig) return;

        const leftColInitialWidth = leftColConfig.width;
        const rightColInitialWidth = rightColConfig.width;

        const onMouseMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaPercentage = deltaX / tableWidth;

            let newLeftWidth = leftColInitialWidth + deltaPercentage;
            let newRightWidth = rightColInitialWidth - deltaPercentage;

            const minWidth = 0.03;
            if (newLeftWidth < minWidth || newRightWidth < minWidth) return;

            // 更新内存中的配置
            leftColConfig.width = newLeftWidth;
            rightColConfig.width = newRightWidth;

            // 实时更新 DOM (直接操作 style 避免重绘整个 innerHTML)
            const headers = tableEl.querySelectorAll('th');
            if (headers[colIndex]) headers[colIndex].style.width = `${newLeftWidth * 100}%`;
            if (headers[colIndex + 1]) headers[colIndex + 1].style.width = `${newRightWidth * 100}%`;
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            // 调整结束后记录历史
            this.editor.emitChange(true, 'resize-table-view-column', this);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
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
                        // 构建条件函数：value 是否满足 condition
                        // 用户输入: > 0.5  -->  return value > 0.5
                        // 用户输入: == "Done" --> return value == "Done"
                        // 我们稍微清洗一下输入，防止最基础的错误
                        const condition = map.condition.trim();
                        if (!condition) continue;

                        // 安全隐患提示：这里使用了 new Function，对于本地应用通常可接受，但在 Web 端需谨慎
                        // 这里的 value 是字符串，用户写条件时可能需要注意类型转换
                        // 我们尝试自动把 value 转为数字如果它看起来像数字
                        let valForEval = value;
                        if (!isNaN(parseFloat(value))) valForEval = parseFloat(value);
                        else valForEval = String(value); // 确保它是字符串

                        const checkFunc = new Function('data', `try { return ${condition}; } catch(e) { return false; }`);

                        if (checkFunc(valForEval)) {
                            return map.html;
                        }
                    } catch (e) {
                        console.warn("Status mapping error", e);
                    }
                }
                return value; // 没有匹配则返回原值

            case 'string':
            default:
                // 转义 HTML 以防止 XSS（除非明确选了 HTML 类型）
                return String(value)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
        }
    }

    // --- Details Panel Logic ---

    renderDetailsPanel_Data_custom() {
        const modes = ['header', 'ignore', 'data'];
        const modeOptions = modes.map(m => `<option value="${m}" ${this.properties.firstRowMode === m ? 'selected' : ''}>${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('');

        let columnsHtml = `<div class="data-columns-list" id="data-columns-list-${this.id}">`;
        this.properties.columns.forEach((col, index) => {
            columnsHtml += this._renderColumnConfigItem(col, index);
        });
        columnsHtml += `</div>`;

        return `
            <div style="display:flex; justify-content:flex-end; margin-bottom: 8px;">
                <button class="css-btn data-refresh-btn" style="width: auto;">↻ Reload</button>
            </div>

            <div class="details-input-row" style="margin-top: 8px;">
                <span class="details-input-label">First Row</span>
                <select class="details-input-field first-row-mode-select">${modeOptions}</select>
            </div>
            
            <div style="margin-top: 12px; margin-bottom: 6px; display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border-primary); padding-bottom: 4px;">
                <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Columns Config</span>
                <button class="css-btn css-btn-add add-column-btn" style="width: auto; margin:0; font-size:11px; padding: 2px 6px;">+ Add</button>
            </div>
            
            ${columnsHtml}
            
            <!-- Filter placeholder -->
            <div style="margin-top: 15px; border-top: 1px solid var(--border-primary); padding-top: 5px;">
                <span style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">Sort & Filter</span>
                <div style="margin-top: 5px; padding: 8px; border: 1px dashed var(--border-primary); color: var(--text-secondary); font-style: italic; font-size: 11px;">
                    (Advanced features coming soon)
                </div>
            </div>
        `;
    }

    _renderColumnConfigItem(col, index) {
        // 类型选项
        const types = ['string', 'number', 'html', 'progress', 'status'];
        const typeOptions = types.map(t => `<option value="${t}" ${col.type === t ? 'selected' : ''}>${t}</option>`).join('');

        const isHeaderMode = this.properties.firstRowMode === 'header';
        const labelDisabledAttr = isHeaderMode ? 'disabled' : '';
        const labelStyle = isHeaderMode ? 'background-color: var(--bg-secondary); opacity: 0.6; cursor: not-allowed;' : '';
        const labelPlaceholder = isHeaderMode ? '(Auto from Header)' : 'Display Name';

        // 状态映射编辑器 (如果类型是 status)
        let statusEditorHtml = '';
        if (col.type === 'status') {
            statusEditorHtml = `<div class="status-mappings-container" data-col-index="${index}">`;
            statusEditorHtml += `<div style="font-size:10px; color:var(--text-secondary); margin:4px 0;">Use variable <code>data</code> (e.g. <code>data > 0.5</code> or <code>data == "Done"</code>)</div>`;

            (col.statusMappings || []).forEach((map, mIndex) => {
                // [FIX] 改为两行布局，增加包裹感和提示
                statusEditorHtml += `
                    <div class="css-property-row" style="flex-direction:column; align-items:stretch; border:1px solid var(--border-primary); padding:6px; border-radius:4px; margin-top:6px; position:relative; background:rgba(0,0,0,0.02);">
                        <button class="css-btn css-btn-delete delete-map-btn" data-col-index="${index}" data-map-index="${mIndex}" style="position:absolute; top:4px; right:4px;">×</button>
                        
                        <div style="display:flex; align-items:center; margin-bottom:4px;">
                            <span style="font-size:11px; color:var(--text-accent); font-family:monospace; margin-right:4px;">if (</span>
                            <input type="text" class="details-input-field map-condition" value="${map.condition.replace(/"/g, '&quot;')}" placeholder='data > 10' data-col-index="${index}" data-map-index="${mIndex}" style="font-family:monospace; flex-grow:1;">
                            <span style="font-size:11px; color:var(--text-accent); font-family:monospace; margin-left:4px;">)</span>
                        </div>
                        
                        <div style="display:flex; align-items:center;">
                            <span style="font-size:11px; color:var(--text-secondary); margin-right:8px;">Then:</span>
                            <input type="text" class="details-input-field map-html" value="${map.html.replace(/"/g, '&quot;')}" placeholder='Display Text or HTML' data-col-index="${index}" data-map-index="${mIndex}" style="flex-grow:1;">
                        </div>
                    </div>
                `;
            });
            statusEditorHtml += `<button class="css-btn css-btn-add add-map-btn" data-col-index="${index}" style="margin-top:4px;">+ Add Condition</button></div>`;
        }

        return `
            <div class="css-rule-block column-config-item" style="margin-bottom: 8px;">
                <div class="css-selector-row">
                    <span style="font-weight:bold; font-size:12px; color:var(--text-secondary);">Col ${index + 1}</span>
                    <div style="flex-grow:1; display:flex; justify-content:flex-end; gap:4px;">
                         <button class="css-btn move-col-btn" data-dir="-1" data-index="${index}" title="Move Up">↑</button>
                         <button class="css-btn move-col-btn" data-dir="1" data-index="${index}" title="Move Down">↓</button>
                         <button class="css-btn css-btn-delete delete-col-btn" data-index="${index}">🗑️</button>
                    </div>
                </div>
                <div class="css-properties-list">
                    <div class="details-input-row">
                        <span class="details-input-label" style="min-width: 60px;">Header</span>
                        <!-- Source Header Selector will be populated dynamically -->
                        <select class="details-input-field col-source-select" data-index="${index}" data-current="${col.sourceHeader || ''}">
                             <option value="">(Loading...)</option>
                        </select>
                    </div>
                    <div class="details-input-row">
                        <span class="details-input-label" style="min-width: 60px;">Label</span>
                        <input type="text" class="details-input-field col-label-input"
                               value="${col.label || ''}" 
                               placeholder="${labelPlaceholder}" 
                               style="${labelStyle}"
                               ${labelDisabledAttr}
                               data-index="${index}">
                    </div>
                    <div class="details-input-row">
                        <span class="details-input-label" style="min-width: 60px;">Type</span>
                        <select class="details-input-field col-type-select" data-index="${index}">
                            ${typeOptions}
                        </select>
                    </div>
                    ${statusEditorHtml}
                </div>
            </div>
        `;
    }

    onDetailsPanelOpen_custom(container) {
        super.onDetailsPanelOpen_custom(container); // 绑定基类的文件选择器

        // 0. 绑定刷新按钮
        const refreshBtn = container.querySelector('.data-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                // 清除缓存
                this._cachedData = null;
                // 重新加载数据
                await this.loadData();
                // 强制重新生成内容
                this._renderContent();
                // 刷新面板（因为列配置可能需要根据新数据更新）
                this._refreshDetailsPanel();
                // 通知编辑器
                this.editor.emitChange(true, 'refresh-data', this);
            });
        }

        // 1. 绑定 First Row Mode
        const modeSelect = container.querySelector('.first-row-mode-select');
        if (modeSelect) {
            modeSelect.addEventListener('change', async (e) => {
                const newMode = e.target.value;

                const rawData = await this.loadData();

                if (rawData && rawData.length > 0) {
                    const realHeaders = rawData[0]; // 实际表头 e.g.["Name", "Age"]
                    const genericHeaders = realHeaders.map((_, i) => `Column ${i + 1}`); // 通用表头 ["Column 1", "Column 2"]

                    // 遍历所有已配置的列，尝试迁移 sourceHeader
                    this.properties.columns.forEach(col => {
                        // 1. 尝试找到当前 sourceHeader 对应的列索引
                        // 它可能是旧模式下的名字，可能是 "Name"，也可能是 "Column 1"
                        let colIndex = realHeaders.indexOf(col.sourceHeader);
                        if (colIndex === -1) {
                            colIndex = genericHeaders.indexOf(col.sourceHeader);
                        }

                        // 2. 如果找到了对应索引，根据新模式更新 sourceHeader 字符串
                        if (colIndex !== -1) {
                            if (newMode === 'header') {
                                // 切换到 Header 模式：用真实列名覆盖
                                col.sourceHeader = realHeaders[colIndex];
                            } else {
                                // 切换到 Data/Ignore 模式：用 Column X 覆盖
                                col.sourceHeader = genericHeaders[colIndex];
                            }
                        }
                    });
                }

                // 更新模式并刷新
                this.properties.firstRowMode = newMode;
                this._refreshDetailsPanel();
                this._renderContent(); // 确保视图同步
                this.editor.emitChange(true, 'edit-table-config', this);
            });
        }

        // 2. 动态填充 Source Header 选项
        // 我们需要读取当前缓存的数据来知道有哪些 Header
        const populateHeaders = async () => {
            const rawData = await this.loadData();
            let headers = [];
            if (rawData && rawData.length > 0) {
                if (this.properties.firstRowMode === 'header') {
                    headers = rawData[0];
                } else {
                    headers = rawData[0].map((_, i) => `Column ${i + 1}`);
                }
            }

            container.querySelectorAll('.col-source-select').forEach(select => {
                const currentVal = select.dataset.current;
                select.innerHTML = headers.map(h => `<option value="${h}" ${h === currentVal ? 'selected' : ''}>${h}</option>`).join('');

                // 监听 Header 改变
                select.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.index);
                    this.properties.columns[idx].sourceHeader = e.target.value;
                    // 如果 label 为空，自动填入 header
                    if (!this.properties.columns[idx].label) {
                        this.properties.columns[idx].label = e.target.value;
                    }
                    this._renderContent();
                    this.editor.emitChange(true, 'edit-table-config', this);
                });
            });
        };
        populateHeaders();

        // 3. 绑定 Add Column
        const addBtn = container.querySelector('.add-column-btn');
        if (addBtn) {
            addBtn.addEventListener('click', async () => {
                let defaultHeader = '';
                const rawData = await this.loadData();
                if (rawData && rawData.length > 0) {
                    if (this.properties.firstRowMode === 'header') {
                        defaultHeader = rawData[0][0] || '';
                    } else {
                        defaultHeader = 'Column 1';
                    }
                }

                this.properties.columns.push({ sourceHeader: defaultHeader, type: 'string', label: '' });
                this._refreshDetailsPanel();
                this._renderContent(); // 确保视图同步刷新
                this.editor.emitChange(true, 'edit-table-config', this);
            });
        }

        // 4. 绑定 Delete / Move / Type Change / Label
        container.addEventListener('click', (e) => {
            const target = e.target;

            // Delete Column
            if (target.classList.contains('delete-col-btn')) {
                const idx = parseInt(target.dataset.index);
                this.properties.columns.splice(idx, 1);
                this._refreshDetailsPanel();
                this._renderContent();
                this.editor.emitChange(true, 'edit-table-config', this);
            }
            // Move Column
            else if (target.classList.contains('move-col-btn')) {
                const idx = parseInt(target.dataset.index);
                const dir = parseInt(target.dataset.dir);
                const newIdx = idx + dir;
                if (newIdx >= 0 && newIdx < this.properties.columns.length) {
                    const temp = this.properties.columns[idx];
                    this.properties.columns[idx] = this.properties.columns[newIdx];
                    this.properties.columns[newIdx] = temp;
                    this._refreshDetailsPanel();
                    this._renderContent();
                    this.editor.emitChange(true, 'edit-table-config', this);
                }
            }
            // Add Status Map
            else if (target.classList.contains('add-map-btn')) {
                const idx = parseInt(target.dataset.colIndex);
                if (!this.properties.columns[idx].statusMappings) this.properties.columns[idx].statusMappings = [];
                this.properties.columns[idx].statusMappings.push({ condition: '', html: '' });
                this._refreshDetailsPanel();
            }
            // Delete Status Map
            else if (target.classList.contains('delete-map-btn')) {
                const colIdx = parseInt(target.dataset.colIndex);
                const mapIdx = parseInt(target.dataset.mapIndex);
                this.properties.columns[colIdx].statusMappings.splice(mapIdx, 1);
                this._refreshDetailsPanel();
                this._renderContent();
                this.editor.emitChange(true, 'edit-table-config', this);
            }
        });

        // 5. 绑定 Inputs (Label, Type, Status Map Inputs)
        container.addEventListener('change', (e) => {
            const target = e.target;
            if (target.classList.contains('col-label-input')) {
                const idx = parseInt(target.dataset.index);
                this.properties.columns[idx].label = target.value;
                this._renderContent();
                this.editor.emitChange(true, 'edit-table-config', this);
            }
            else if (target.classList.contains('col-type-select')) {
                const idx = parseInt(target.dataset.index);
                this.properties.columns[idx].type = target.value;
                this._refreshDetailsPanel(); // 类型改变需要刷新（显示/隐藏 status editor）
                this._renderContent();
                this.editor.emitChange(true, 'edit-table-config', this);
            }
            else if (target.classList.contains('map-condition')) {
                const colIdx = parseInt(target.dataset.colIndex);
                const mapIdx = parseInt(target.dataset.mapIndex);
                this.properties.columns[colIdx].statusMappings[mapIdx].condition = target.value;
                this._renderContent();
                this.editor.emitChange(true, 'edit-table-config', this);
            }
            else if (target.classList.contains('map-html')) {
                const colIdx = parseInt(target.dataset.colIndex);
                const mapIdx = parseInt(target.dataset.mapIndex);
                this.properties.columns[colIdx].statusMappings[mapIdx].html = target.value;
                this._renderContent();
                this.editor.emitChange(true, 'edit-table-config', this);
            }
        });
    }
}