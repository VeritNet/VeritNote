// js/blocks/Block.js
class Block {
    /**
     * @param {object} data - The block's data object (id, type, content, etc.).
     * @param {Editor} editor - The main editor instance.
     */
    constructor(data, editor) {
        this.id = data.id || this._generateUUID();
        this.type = data.type;
        this.content = data.content || '';
        this.properties = data.properties || {};

        // Initialize Custom CSS Property
        if (!this.properties.customCSS) {
            this.properties.customCSS = [];
            // Structure: [{ selector: ':hover', rules: [{prop: 'color', val: 'red'}] }]
        }
        
        this.editor = editor;
        this.element = null;
        this.contentElement = null;
        this.childrenContainer = null; //如果为null，则不是容器块，一个容器块只能有一个容器区
        
        // *** FIX: GUARANTEE that this.children is always an array. ***
        const childrenData = data.children || [];
        this.children = childrenData.map(childJson => this.editor.createBlockInstance(childJson)).filter(Boolean);
        // Add parent property to children right away
        this.children.forEach(child => child.parent = this);
    }

    // --- Static properties for registration and slash command ---
    static type = 'block'; // Should be overridden by subclasses
    static label = 'Block'; // Default label for UI
    static description = 'A generic block.'; // Default description for UI
    static keywords = []; // Keywords for search
    static canBeToggled = false; // Whether it appears in the slash command menu
    
    /**
     * Returns the block's data for saving.
     * @returns {object} The serializable data object for this block.
     */
    get data() {
        this.syncContentFromDOM();

        return {
            id: this.id,
            type: this.type,
            content: this.content,
            properties: this.properties,
            // *** FIX: Always generate children data from the live this.children instance array. ***
            children: this.children.map(child => child.data),
        };
    }

    /**
     * The toolbar buttons definition for this block.
     * Subclasses should override this.
     * @returns {Array} An array of button definition objects.
     */
    get toolbarButtons() {
        // We define this in the base class so all blocks get it.
        // It's an array so subclasses can push their own buttons to it.
        return [
            {
                html: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>',
                title: 'More Actions',
                action: 'showDetails' // A new action we will handle
            }
        ];
    }

    /**
     * Creates and returns the DOM element for the block.
     * This is the main rendering entry point.
     * @returns {HTMLElement} The fully rendered block element.
     */
    render() {
        this.element = this._createWrapperElement();
        this.contentElement = this._createContentElement();

        this._renderContent();
        
        this.element.appendChild(this.contentElement);

        this._renderChildren();

        this._applyCustomCSS();

        return this.element;
    }

    /**
     * Creates the main wrapper element (.block-container).
     * @private
     */
    _createWrapperElement() {
        const element = document.createElement('div');
        element.className = 'block-container';
        element.dataset.id = this.id;
        element.draggable = true;
        element.innerHTML = `
            <div class="block-controls">
                <span class="drag-handle" title="Drag to move">⠿</span>
            </div>
        `;
        return element;
    }

    /**
     * Creates the content element (.block-content).
     * @private
     */
    _createContentElement() {
        const content = document.createElement('div');
        content.className = 'block-content';
        content.dataset.id = this.id;
        content.dataset.type = this.type;
        return content;
    }

    /**
     * Renders the specific content of the block into `this.contentElement`.
     * Subclasses MUST override this method.
     * @private
     */
    _renderContent() {
        // Example: this.contentElement.innerHTML = this.content;
        // To be implemented by subclasses.
    }

    /**
     * Renders child blocks and appends them to the correct container.
     * @param {HTMLElement} [targetContainer] - 指定渲染的目标容器区。如果不传，则默认尝试渲染到交互容器(childrenContainer)。
     * @private
     */
    _renderChildren(targetContainer = null) {
        // 渲染目标：优先使用传入的 target，否则使用交互容器 childrenContainer
        const destination = targetContainer || this.childrenContainer;

        if (destination && this.children.length > 0) {
            this.children.forEach(childInstance => {
                childInstance.parent = this;
                destination.appendChild(childInstance.render());
            });
        }
    }
    
    /**
     * Updates the block's `content` property from its DOM element.
     */
    syncContentFromDOM() {
        if (this.contentElement && this.contentElement.isContentEditable) {
            this.content = this.contentElement.innerHTML;
        }
    }

    /**
     * Updates the block's DOM element from its `content` property.
     */
    syncContentToDOM() {
        if (this.contentElement) {
            this.contentElement.innerHTML = this.content;
        }
    }

    /**
     * Focuses the block's content element and moves cursor to the end.
     */
    focus() {
        if (!this.contentElement || !this.contentElement.isContentEditable) return;
        
        this.contentElement.focus();
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(this.contentElement);
        range.collapse(false); // Move to the end
        selection.removeAllRanges();
        selection.addRange(range);
    }
    
    /**
     * Handles input events on the block.
     * @param {InputEvent} e The event object.
     */
    onInput(e) {
        // Simply delegate the entire lifecycle management to the editor.
        // The editor will decide whether to show, hide, or update the menu.
        this.editor._handleCommandMenuLifecycle(this);
        
        this.editor.emitChange(true, 'typing', this);
    }
    
    /**
     * Handles keydown events on the block.
     * @param {KeyboardEvent} e The event object.
     */
    onKeyDown(e) {
        // Default behavior for contentEditable blocks
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // *** FIX: Force sync THIS block's content before telling the editor to create a new one. ***
            this.syncContentFromDOM(); 
            this.editor.insertNewBlockAfter(this);
        }

        if (e.key === '/') {
            setTimeout(() => this.editor.showCommandMenuForBlock(this), 0);
        }
    }

    /**
     * Renders the HTML content for this block to be displayed in the details panel.
     * @returns {string} The HTML string to be inserted into the details panel.
     */
    renderDetailsPanel() {
        // --- Step 1: Build the Hierarchy Data Structure ---
        const hierarchyData = [];
        let maxAncestorDepth = 0;

        // Function to gather ancestors (parents)
        const gatherAncestors = (node) => {
            if (!node) return;
            // Add to the beginning of the array to maintain order
            hierarchyData.unshift({ block: node }); 
            maxAncestorDepth++; // Count how many ancestors we have
            gatherAncestors(node.parent);
        };

        // Function to gather descendants (children)
        const gatherDescendants = (children, depth) => {
            if (!children || children.length === 0) return;
            children.forEach(child => {
                // The depth here is correct, it's relative to the current block
                hierarchyData.push({ block: child, depth: depth });
                gatherDescendants(child.children, depth + 1);
            });
        };

        // --- REVISED LOGIC ---
        // 1. Gather all ancestors first to determine the root depth
        gatherAncestors(this.parent);
        
        // 2. Now, assign the correct, positive depth to each ancestor
        hierarchyData.forEach((item, index) => {
            item.depth = index;
        });

        // 3. Add the current block. Its depth is the number of ancestors.
        hierarchyData.push({ block: this, depth: maxAncestorDepth });
        
        // 4. Gather descendants. Their depth is relative to the current block.
        gatherDescendants(this.children, maxAncestorDepth + 1);
        

        // --- Step 2: Render HTML from the Data Structure ---
        const hierarchyHtml = hierarchyData.map(item => {
            const isCurrent = item.block.id === this.id;
            return `
                <div 
                    class="details-hierarchy-row" 
                    data-block-id="${item.block.id}" 
                    style="--depth: ${item.depth};"  /* Now depth is always a positive integer */
                    title="Click to select ${item.block.type}"
                >
                    <div class="details-hierarchy-indent"></div>
                    <div class="details-hierarchy-item ${isCurrent ? 'is-current' : ''}">
                        ${item.block.type}
                    </div>
                </div>
            `;
        }).join('');


        const customContentHtml = this.renderDetailsPanel_custom();

        const propertiesHtml = this._renderPropertiesSectionHTML();
        const customCssHtml = this._renderCustomCSSSectionHTML();

        return `
            <div class="details-panel-section" data-block-id="${this.id}">
                <div class="details-section-header">Block Details</div>
                <div class="details-property">
                    <span class="details-property-label">Type</span>
                    <span class="details-property-value">${this.type}</span>
                </div>
                <div class="details-property">
                    <span class="details-property-label">ID</span>
                    <span class="details-property-value is-monospace" title="${this.id}">${this.id}</span>
                </div>

                <br>
                <!-- Hierarchy Section -->
                <div class="details-section-header">Hierarchy</div>
                <div class="details-hierarchy-view">
                    ${hierarchyHtml}
                </div>

                
                ${customContentHtml ? `
                    <br>
                    ${customContentHtml}
                ` : ''}

                <br>
                <!-- Modular Properties Section -->
                <div class="details-section-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <span>Properties</span>
                    <button class="details-reset-btn" title="Reset all properties to default" style="background:none; border:none; color:var(--text-secondary); cursor:pointer; font-size:12px;">
                        ↺ Reset
                    </button>
                </div>
                <div class="details-properties-view">
                    ${propertiesHtml}
                </div>

                <br>
                <!-- Custom CSS Section -->
                <div class="details-section-header">Custom CSS</div>
                <div class="details-custom-css-view">
                    ${customCssHtml}
                </div>
            </div>
        `;
    }

    /**
     * Subclasses can override this to inject custom HTML into the details panel.
     * Returned HTML will be placed between Hierarchy and Properties sections.
     * @returns {string} HTML string or empty string.
     */
    renderDetailsPanel_custom() {
        return '';
    }


    // Methods for Details Panel & CSS

    /**
     * Returns an array defining the editable properties for this block.
     * Subclasses should override this.
     * @returns {Array<{key: string, label: string, type: 'text'|'number'|'color'|'select'|'checkbox', options?: Array}>}
     */
    static getPropertiesSchema() {
        return [
            // 布局与间距
            { key: 'padding', label: 'Padding', type: 'text', placeholder: 'e.g. 10px 20px' },
            { key: 'marginTop', label: 'Margin Top', type: 'text', placeholder: 'e.g. 10px' },
            { key: 'marginBottom', label: 'Margin Bottom', type: 'text', placeholder: 'e.g. 10px' },

            // 背景与可见性
            { key: 'backgroundColor', label: 'Background', type: 'color' },
            { key: 'opacity', label: 'Opacity', type: 'number', placeholder: '0.0 - 1.0' },

            // 边框设置
            { key: 'borderWidth', label: 'Border Width', type: 'text', placeholder: 'e.g. 1px' },
            { key: 'borderStyle', label: 'Border Style', type: 'select', options: ['none', 'solid', 'dashed', 'dotted', 'double'] },
            { key: 'borderColor', label: 'Border Color', type: 'color' },
            { key: 'borderRadius', label: 'Radius', type: 'text', placeholder: 'e.g. 4px' },

            // 高级效果
            { key: 'boxShadow', label: 'Shadow', type: 'text', placeholder: 'e.g. 0 2px 4px rgba(0,0,0,0.1)' }
        ];
    }

    _renderPropertiesSectionHTML() {
        const schema = this.constructor.getPropertiesSchema();
        if (!schema || schema.length === 0) return '<div class="empty-details-placeholder">No properties available.</div>';

        return schema.map(field => {
            const value = this.properties[field.key] || '';
            let inputHtml = '';

            if (field.type === 'select') {
                const optionsHtml = field.options.map(opt =>
                    `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`
                ).join('');
                inputHtml = `<select class="details-input-field" data-prop-key="${field.key}">${optionsHtml}</select>`;
            } else if (field.type === 'checkbox') {
                inputHtml = `<input type="checkbox" class="details-input-field" data-prop-key="${field.key}" ${value ? 'checked' : ''}>`;
            } else {
                inputHtml = `<input type="${field.type}" class="details-input-field" data-prop-key="${field.key}" value="${value}" placeholder="${field.placeholder || ''}">`;
            }

            return `
                <div class="details-input-row">
                    <span class="details-input-label">${field.label}</span>
                    ${inputHtml}
                </div>
            `;
        }).join('');
    }

    _renderCustomCSSSectionHTML() {
        let html = '<div class="custom-css-container" id="css-rules-container">';

        this.properties.customCSS.forEach((blockRule, index) => {
            let propsHtml = blockRule.rules.map((rule, rIndex) => `
                <div class="css-property-row">
                    <input type="text" class="details-input-field css-key" value="${rule.prop}" placeholder="prop" data-group="${index}" data-rule="${rIndex}">
                    <span style="color:var(--text-secondary)">:</span>
                    <input type="text" class="details-input-field css-val" value="${rule.val}" placeholder="value" data-group="${index}" data-rule="${rIndex}">
                    <button class="css-btn css-btn-delete" data-action="delete-rule" data-group="${index}" data-rule="${rIndex}">×</button>
                </div>
            `).join('');

            html += `
                <div class="css-rule-block">
                    <div class="css-selector-row">
                        <span class="css-selector-prefix">#block-${this.id.substr(0, 4)}...</span>
                        <input type="text" class="details-input-field css-selector" value="${blockRule.selector}" placeholder=":hover, .inner-class" data-group="${index}">
                        <button class="css-btn css-btn-delete" data-action="delete-group" data-group="${index}">🗑️</button>
                    </div>
                    <div class="css-properties-list">
                        ${propsHtml}
                        <button class="css-btn css-btn-add" data-action="add-rule" data-group="${index}">+ Add Property</button>
                    </div>
                </div>
            `;
        });

        html += `<button class="popover-button" id="add-css-group-btn" style="margin-top:0">+ Add CSS Block</button>`;
        html += '</div>';
        return html;
    }

    /**
     * Called by PageEditor after the details panel HTML is inserted into the DOM.
     * This attaches event listeners to the inputs.
     * @param {HTMLElement} container - The details panel container.
     */
    onDetailsPanelOpen(container) {
        this.onDetailsPanelOpen_custom(container);

        // 0. 处理重置按钮点击事件
        const resetBtn = container.querySelector('.details-reset-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!confirm('Reset all visual properties for this block?')) return;

                // 安全重置：只删除在 Schema 中定义的属性键值
                // 这样不会误删 Table 的 colWidths 或其他内部状态
                const schema = this.constructor.getPropertiesSchema();
                schema.forEach(field => {
                    delete this.properties[field.key];
                });

                // 立即生效
                this._renderContent();   // 刷新块内容（如文字颜色）
                this._applyGenericStyles(); // 刷新通用样式（如背景、边距）
                // 某些属性（如边距）被删除后，_applyGenericStyles 不会自动移除内联样式，
                // 因为它通常只负责"设置存在的属性"。
                // 所以更彻底的做法是先清空 style 再重新应用。
                if (this.element) {
                    this.element.removeAttribute('style');
                    // 重新应用可能存在的非 Schema 样式（如果有的话，通常没有）
                    this._applyGenericStyles();
                }

                // 通知编辑器保存并刷新面板
                this.editor.emitChange(true, 'reset-props', this);
                this.editor.updateDetailsPanel(); // 刷新面板以清空输入框
            });
        }

        // 1. Handle Regular Properties
        const inputs = container.querySelectorAll('.details-properties-view .details-input-field');
        inputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const key = e.target.dataset.propKey;
                const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

                this.properties[key] = value;

                const genericProperties = [
                    'backgroundColor', 'opacity',
                    'padding', 'marginTop', 'marginBottom',
                    'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
                    'boxShadow'
                ];

                if (genericProperties.includes(key)) {
                    this._applyGenericStyles();
                } else {
                    this._renderContent();
                }

                this.editor.emitChange(true, 'property-change', this);
            });
        });

        // 2. Handle Custom CSS Interaction (Delegated)
        const cssContainer = container.querySelector('.details-custom-css-view');
        if (cssContainer) {
            cssContainer.addEventListener('click', (e) => {
                const target = e.target;
                if (target.dataset.action === 'add-css-group-btn' || target.id === 'add-css-group-btn') {
                    this.properties.customCSS.push({ selector: '', rules: [{ prop: '', val: '' }] });
                    this._refreshDetailsPanel();
                }
                else if (target.dataset.action === 'delete-group') {
                    const idx = parseInt(target.dataset.group);
                    this.properties.customCSS.splice(idx, 1);
                    this._refreshDetailsPanel();
                }
                else if (target.dataset.action === 'add-rule') {
                    const idx = parseInt(target.dataset.group);
                    this.properties.customCSS[idx].rules.push({ prop: '', val: '' });
                    this._refreshDetailsPanel();
                }
                else if (target.dataset.action === 'delete-rule') {
                    const gIdx = parseInt(target.dataset.group);
                    const rIdx = parseInt(target.dataset.rule);
                    this.properties.customCSS[gIdx].rules.splice(rIdx, 1);
                    this._refreshDetailsPanel();
                }
            });

            cssContainer.addEventListener('input', (e) => {
                const target = e.target;
                if (target.classList.contains('css-selector')) {
                    const idx = parseInt(target.dataset.group);
                    this.properties.customCSS[idx].selector = target.value;
                    this._applyCustomCSS();
                    // Debounce save? relying on blur or next action for history usually better, but for CSS visual feedback we update immediately.
                }
                else if (target.classList.contains('css-key')) {
                    const gIdx = parseInt(target.dataset.group);
                    const rIdx = parseInt(target.dataset.rule);
                    this.properties.customCSS[gIdx].rules[rIdx].prop = target.value;
                    this._applyCustomCSS();
                }
                else if (target.classList.contains('css-val')) {
                    const gIdx = parseInt(target.dataset.group);
                    const rIdx = parseInt(target.dataset.rule);
                    this.properties.customCSS[gIdx].rules[rIdx].val = target.value;
                    this._applyCustomCSS();
                }
            });

            // Save history on change (blur)
            cssContainer.addEventListener('change', () => {
                this.editor.emitChange(true, 'css-edit', this);
            });
        }
    }

    /**
     * Subclasses can override this to attach event listeners to their custom HTML.
     * @param {HTMLElement} container - The details panel container.
     */
    onDetailsPanelOpen_custom(container) {
        // Default: do nothing
    }

    _refreshDetailsPanel() {
        this._applyCustomCSS();
        this.editor.emitChange(false, 'css-ui-update', this); // Don't record history for every UI click
        this.editor.updateDetailsPanel(); // Force re-render of panel
    }

    _applyGenericStyles() {
        if (!this.element) return;

        const s = this.element.style;
        const p = this.properties;

        // 布局
        if (p.padding) s.padding = p.padding;
        if (p.marginTop) s.marginTop = p.marginTop;
        if (p.marginBottom) s.marginBottom = p.marginBottom;

        // 背景与可见性
        if (p.backgroundColor) s.backgroundColor = p.backgroundColor;
        if (p.opacity) s.opacity = p.opacity;

        // 边框
        if (p.borderWidth) s.borderWidth = p.borderWidth;
        if (p.borderStyle) s.borderStyle = p.borderStyle;
        if (p.borderColor) s.borderColor = p.borderColor;
        if (p.borderRadius) s.borderRadius = p.borderRadius;

        // 阴影
        if (p.boxShadow) s.boxShadow = p.boxShadow;
    }

    _applyCustomCSS() {
        // 1. Remove existing style element for this block if it exists
        let styleTag = document.getElementById(`style-block-${this.id}`);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = `style-block-${this.id}`;
            document.head.appendChild(styleTag);
        }

        // 2. Generate CSS String
        let cssString = '';
        if (this.properties.customCSS && this.properties.customCSS.length > 0) {
            this.properties.customCSS.forEach(group => {
                // Ensure the selector targets this specific block ID
                const selector = `.block-container[data-id="${this.id}"] ${group.selector}`;
                const rules = group.rules
                    .filter(r => r.prop && r.val)
                    .map(r => `${r.prop}: ${r.val} !important;`)
                    .join(' ');

                if (rules) {
                    cssString += `${selector} { ${rules} } \n`;
                }
            });
        }

        // 3. Apply Generic Styles via inline (handled in _applyGenericStyles) or here.
        // Let's call generic applier here to ensure render correctness.
        this._applyGenericStyles();

        // 4. Update Style Tag
        styleTag.textContent = cssString;
    }

    /**
     * 生成当前块及其自定义属性对应的 CSS 字符串，用于导出。
     */
    getCustomCSSString() {
        let cssString = '';

        // 1. 处理 Custom CSS 面板中的规则 (如 :hover 等)
        if (this.properties.customCSS && this.properties.customCSS.length > 0) {
            this.properties.customCSS.forEach(group => {
                // 确保选择器依然能选中这个块
                // 注意：导出时 .block-container 和 data-id 都会保留，所以这个选择器是有效的
                const selector = `.block-container[data-id="${this.id}"] ${group.selector}`;

                const rules = group.rules
                    .filter(r => r.prop && r.val)
                    .map(r => `${r.prop}: ${r.val} !important;`)
                    .join(' ');

                if (rules) {
                    cssString += `${selector} { ${rules} } \n`;
                }
            });
        }

        // 注意：通用的 _applyGenericStyles (背景、边距等) 是直接写在 element.style 上的，
        // 它们会作为 inline style 自动包含在 innerHTML 中，所以这里不需要重复处理。

        return cssString;
    }


    _generateUUID() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }


    // --- NEW: Export API ---

    /**
     * Generates the final, sanitized HTML for this block for export.
     * Subclasses can override this to add special behaviors.
     * @param {HTMLElement} blockElement - The pre-rendered, clean DOM element of the block.
     * @param {object} options - The export options from the main process.
     * @param {object} imageSrcMap - A map of original image sources to their new local paths.
     * @param {string} pathPrefix - The relative path prefix (e.g., './' or '../') for assets.
     */
    async getExportHtml(blockElement, options, imageSrcMap, pathPrefix) {
        // Default implementation does nothing special, just returns the element.
        return blockElement;
    }

    /**
     * Returns any JavaScript code that needs to be injected into the final exported HTML file
     * to make this block interactive.
     * @returns {string|null} A string containing the script (without <script> tags), or null.
     */
    static getExportScripts() {
        // Default is no scripts.
        return null;
    }

    /**
     * Returns a list of vendor library paths required for this block when exported.
     * @returns {Array<string>} Example: ['vendor/highlight/highlight.min.js']
     */
    static get requiredExportLibs() {
        return [];
    }
}