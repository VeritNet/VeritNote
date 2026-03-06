// components/blocks/data/TableViewBlock.js
class TableViewBlock extends Block {
    static type = 'tableView';
    static canBeToggled = false; // 不在斜杠菜单显示！这是 DataBlock 的子组件

    constructor(data, editor) {
        super(data, editor);
        // data.properties 中包含了从 db 获取的 preset 配置
        this.preset = data.properties || {};
        if (!this.preset.columns) this.preset.columns = [];
    }

    // 由父块 DataBlock (或 DatabaseEditor) 手动调用
    _renderTable(rawData) {
        if (!rawData || rawData.length === 0) {
            this.contentElement.innerHTML = '<div style="padding:10px; color:gray;">Empty data.</div>';
            return;
        }

        let sourceHeaders = [];
        let dataRows = [];

        if (this.preset.firstRowMode === 'header') {
            sourceHeaders = rawData[0];
            dataRows = rawData.slice(1);
        } else if (this.preset.firstRowMode === 'ignore') {
            sourceHeaders = rawData[0].map((_, i) => `Column ${i + 1}`);
            dataRows = rawData.slice(1);
        } else {
            sourceHeaders = rawData[0].map((_, i) => `Column ${i + 1}`);
            dataRows = rawData;
        }

        const totalCols = this.preset.columns.length;
        if (totalCols === 0) {
            this.contentElement.innerHTML = '<div style="padding:10px;">No columns configured in this preset.</div>';
            return;
        }

        let html = `<div class="table-view-container" style="width:100%; overflow-x:auto; border:1px solid var(--border-primary);">`;
        html += `<table class="vn-table" style="table-layout:fixed; width:100%;"><thead><tr>`;

        this.preset.columns.forEach(col => {
            const label = (this.preset.firstRowMode === 'header' ? col.sourceHeader : (col.label || col.sourceHeader)) || 'Untitled';
            const widthPercent = (col.width || (1 / totalCols)) * 100;
            html += `<th style="width: ${widthPercent}%;">${label}</th>`;
        });
        html += `</tr></thead><tbody>`;

        dataRows.forEach(row => {
            html += `<tr>`;
            this.preset.columns.forEach(col => {
                let colIndex = sourceHeaders.indexOf(col.sourceHeader);
                let cellValue = (colIndex > -1 && colIndex < row.length) ? row[colIndex] : '';
                html += `<td>${this._processCellType(cellValue, col)}</td>`;
            });
            html += `</tr>`;
        });

        html += `</tbody></table></div>`;
        this.contentElement.innerHTML = html;
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