// blocks/Block.js
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
        /**
         * 关于子块的2种情况
         * 1. 如果一个块的父级没有交互容器(childrenContainer为null)，说明该块是父级不可分割的结构（如Row是Table的结构）块。page编辑器的_canAcceptSideDrop会拒绝尝试破坏其父块内容结构的行为
         * 2. 如果一个块的父级有交互容器(childrenContainer不为null)，说明该块是容器区内的自由进出的块
        */
        this.contentElement = null;
        this.childrenContainer = null; //如果为null，则不是容器块，一个容器块只能有一个容器区

        this.BAPI_PE = this.editor.BAPI_PE;// 提供给Block使用的编辑器 API 访问对象，包含一些工具方法和事件接口等，具体内容由 PageEditor 定义和维护
        this.BAPI_WD = window.BAPI_WD;// 提供给Block使用的编辑器 API 访问对象，包含一些工具方法和事件接口等，具体内容由 Window 定义和维护
        this.BAPI_IPC = window.BAPI_IPC;// 提供给Block使用的编辑器 API 访问对象，包含一些工具方法和事件接口等，具体内容由 IPC 定义和维护

        // Children
        const childrenData = data.children || [];
        this.children = childrenData.map(childJson => this.BAPI_PE.createBlockInstance(childJson)).filter(Boolean);
        // Add parent property to children right away
        this.children.forEach(child => child.parent = this);

        // 异步渲染锁，默认为已完成状态。子类如果有异步行为，需覆写这两个变量。
        this.exportReadyResolve = () => { };
        this.exportReadyPromise = Promise.resolve();
    }



    // ========== ------ ========== //
    // ========== Public ========== //
    // ========== ------ ========== //



    // --- Static properties for registration and slash command ---
    static type = 'block'; // Should be overridden by subclasses
    static label = 'Block'; // Default label for UI
    static description = 'A generic block.'; // Default description for UI
    static keywords = []; // Keywords for search
    static canBeToggled = false; // Whether it appears in the slash command menu
    // 定义预览/导出需要排除的 DOM 元素选择器
    static previewExclusionSelectors = [
        '.block-controls',
        '.drag-handle',
        '.drop-indicator',
        '.drop-indicator-vertical',
        '.quadrant-overlay'
    ];
    static exportExclusionSelectors = [
        '.block-controls',
        '.drag-handle',
        '.drop-indicator',
        '.drop-indicator-vertical',
        '.quadrant-overlay'
    ];
    element = null;
    content = null;
    properties = {};
    contentElement = null;
    childrenContainer = null;
    children = [];
    
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

    handleToolbarAction(action, buttonElement) { }

    /**
     * Creates and returns the DOM element for the block.
     * This is the main rendering entry point.
     * @returns {HTMLElement} The fully rendered block element.
     */
    render() {
        if (!this.element) {
            this.element = this._createWrapperElement();
        }
        if (!this.contentElement) {
            this.contentElement = this._createContentElement();
            this.element.appendChild(this.contentElement);
        }

        this._renderContent();

        this._renderChildren();

        this._applyCustomCSS();

        return this.element;
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
     * Handles input events on the block.
     * @param {InputEvent} e The event object.
     */
    onInput(e) {
        // Simply delegate the entire lifecycle management to the editor
        // The editor will decide whether to show, hide, or update the menu.
        this.BAPI_PE._handleCommandMenuLifecycle(this);

        this.BAPI_PE.emitChange(true, 'typing', this);
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
            this.BAPI_PE.insertNewBlockAfter(this);
        }

        if (e.key === '/') {
            setTimeout(() => this.BAPI_PE.showCommandMenuForBlock(this), 0);
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
                    style="--depth: ${item.depth};"  /* Depth is always a positive integer */
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

        const customCssHtml = this._renderCustomCSSSectionHTML();

        return `
            <div class="details-panel-section" pd="s" data-block-id="${this.id}">
                <div tc="1" class="details-section-header">Block Details</div>
                
                <div fx="sb" gap="l" style="margin-bottom: 8px;">
                    <span tc="2" style="font-size: 13px;">Type</span>
                    <span class="badge scroll-x" tc="2" title="${this.type}" style="user-select: text; white-space:nowrap;">${this.type}</span>
                </div>
                <div fx="sb" gap="l" style="margin-bottom: 8px;">
                    <span tc="2" style="font-size: 13px;">ID</span>
                    <span class="badge scroll-x" tc="2" title="${this.id}" style="user-select: text; white-space:nowrap;">${this.id}</span>
                </div>

                <br>
                <!-- Hierarchy Section -->
                <div tc="1" class="details-section-header">Hierarchy</div>
                <div class="details-hierarchy-view">
                    ${hierarchyHtml}
                </div>
                
                ${customContentHtml ? `<br>${customContentHtml}` : ''}

                <br>
                <!-- Modular Properties Section -->
                <div fx="sb">
                    <span tc="1" class="details-section-header">Properties</span>
                    <button class="btn details-reset-btn" pd="xs" bg="none" bd="none" hv-bg="3" title="Reset all properties to default" style="width: auto; font-size: 12px;">
                        ↺ Reset
                    </button>
                </div>
                <!-- 预留供 UI-Lib 工具挂载表单的容器 -->
                <div id="kv-form-container-${this.id}" fx="col" gap="s"></div>

                <br>
                <!-- Custom CSS Section -->
                <div tc="1" class="details-section-header">Custom CSS</div>
                <div class="details-custom-css-view">
                    ${customCssHtml}
                </div>
            </div>
        `;
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
                    delete this.properties[field.name];
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
                this.BAPI_PE.emitChange(true, 'reset-props', this);
                this.BAPI_PE.updateDetailsPanel(); // 刷新面板以清空输入框
            });
        }

        // 1. Handle Regular Properties via UiTools.createKvForm
        const formContainer = container.querySelector(`#kv-form-container-${this.id}`);
        if (formContainer) {
            // 递归解析并将 this.properties 填入 Schema 的 value
            const populateSchema = (schemaList, propsObj) => {
                if (!propsObj) propsObj = {};
                return schemaList.map(item => {
                    const newItem = { ...item };
                    const valObj = propsObj[item.name];

                    let rootVal, childProps;
                    // 分离父节点值与子结构配置
                    if (Array.isArray(valObj)) {
                        rootVal = valObj[0];
                        childProps = valObj[1] || {};
                    } else {
                        rootVal = valObj;
                        childProps = {};
                    }

                    // 赋值逻辑（优先使用已保存值，否则保留 schema 默认，或者赋予基础类型兜底值）
                    if (rootVal !== undefined) {
                        newItem.value = rootVal;
                    } else if (newItem.value === undefined) {
                        newItem.value = item.type === 'num' ? (item.min !== undefined ? item.min : 1) : '';
                    }

                    // 处理该项可能存在的嵌套子级
                    if (newItem.children) {
                        newItem.children = populateSchema(newItem.children, childProps);
                    }
                    return newItem;
                });
            };

            const schema = populateSchema(this.constructor.getPropertiesSchema(), this.properties);

            // 调用 BAPI_WD 提供的工具库方法
            const myForm = this.BAPI_WD.UiTools.createKvForm(schema, () => {
                const newValues = myForm.getValue();
                const genericKeys = [
                    'backgroundMode', 'padding', 'marginTop', 'marginBottom',
                    'borderStyle', 'borderRadius', 'boxShadow', 'opacity'
                ];

                let needGeneric = false;
                let needContent = false;

                // 同步数据与渲染判断
                Object.keys(newValues).forEach(key => {
                    // 使用 JSON.stringify 简单比对嵌套结构是否发生改变
                    if (JSON.stringify(this.properties[key]) !== JSON.stringify(newValues[key])) {
                        // 彻底保留表单返回的数据结构
                        this.properties[key] = newValues[key];

                        if (genericKeys.includes(key)) needGeneric = true;
                        else needContent = true;
                    }
                });

                if (needGeneric) this._applyGenericStyles();
                if (needContent) this._renderContent();

                this.BAPI_PE.emitChange(true, 'property-change', this);
            });

            formContainer.appendChild(myForm.dom);
        }

        // 2. Handle Custom CSS Interaction (DevTools Style Auto-append)
        const cssContainer = container.querySelector('.details-custom-css-view');
        if (cssContainer) {
            cssContainer.addEventListener('input', (e) => {
                const target = e.target;
                const gIdx = parseInt(target.dataset['group']);
                const group = this.properties.customCSS[gIdx];

                if (target.classList.contains('css-selector')) {
                    group.selector = target.value;

                    // 若在最后一个块输入，立刻追加新的空块 DOM
                    if (gIdx === this.properties.customCSS.length - 1 && target.value.trim() !== '') {
                        this.properties.customCSS.push({ selector: '', rules: [{ prop: '', val: '' }] });
                        const newGroupIdx = gIdx + 1;

                        // 如果是从 1 变成 2 个组，给原本那唯一的第 1 个组补上删除按钮
                        if (this.properties.customCSS.length === 2) {
                            const firstGroupHeader = cssContainer.querySelector('.css-rule-block[data-group="0"] > div:first-child');
                            if (firstGroupHeader && !firstGroupHeader.querySelector('.css-group-del')) {
                                firstGroupHeader.insertAdjacentHTML('beforeend', `<button class="btn sq css-group-del" bg="none" bd="none" hv-tc="err" data-group="0" title="Delete Group"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`);
                            }
                        }

                        // 新组生成时自带删除按钮（因为总量必定 >= 2了），且必须包含第一行初始空白 key-value
                        const newGroupHtml = `
                        <div class="css-rule-block" bg="1" bd="1" rd="s" pd="s" style="position:relative;" data-group="${newGroupIdx}">
                            <div fx="row" gap="s" style="margin-bottom:8px; border-bottom:1px solid var(--bd-1); padding-bottom:8px;">
                                <span tc="2" style="font-family:monospace; font-size:11px;">#block-${this.id.substr(0, 4)}</span>
                                <input type="text" class="inp css-selector" style="flex-grow:1;" value="" placeholder="e.g. :hover" data-group="${newGroupIdx}">
                                <button class="btn sq css-group-del" bg="none" bd="none" hv-tc="err" data-group="${newGroupIdx}" title="Delete Group"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                            </div>
                            <div fx="col" gap="xs" class="css-properties-list">
                                <div fx="row" gap="xs" class="css-rule-row" data-group="${newGroupIdx}" data-rule="0">
                                    <input type="text" class="inp css-key" value="" placeholder="prop" data-group="${newGroupIdx}" data-rule="0">
                                    <span tc="2">:</span>
                                    <input type="text" class="inp css-val" value="" placeholder="value" data-group="${newGroupIdx}" data-rule="0">
                                </div>
                            </div>
                        </div>`;
                        container.querySelector('#css-rules-container').insertAdjacentHTML('beforeend', newGroupHtml);
                    }
                }
                else if (target.classList.contains('css-key') || target.classList.contains('css-val')) {
                    const rIdx = parseInt(target.dataset['rule']);
                    const rule = group.rules[rIdx];
                    if (target.classList.contains('css-key')) rule.prop = target.value;
                    if (target.classList.contains('css-val')) rule.val = target.value;

                    this._applyCustomCSS();

                    // 若在当前块的最后一行输入，立刻追加新的空行 DOM
                    if (rIdx === group.rules.length - 1 && (rule.prop.trim() !== '' || rule.val.trim() !== '')) {
                        group.rules.push({ prop: '', val: '' });
                        const newRuleIdx = rIdx + 1;

                        // 如果是该组的行数从 1 变成 2 个，给原本那唯一的第 1 行补上删除按钮
                        if (group.rules.length === 2) {
                            const firstRuleRow = cssContainer.querySelector(`.css-rule-row[data-group="${gIdx}"][data-rule="0"]`);
                            if (firstRuleRow && !firstRuleRow.querySelector('.css-rule-del')) {
                                firstRuleRow.insertAdjacentHTML('beforeend', `<button class="btn sq css-rule-del" bg="none" bd="none" hv-tc="err" data-group="${gIdx}" data-rule="0" title="Delete Rule"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`);
                            }
                        }

                        // 新行生成时自带删除按钮
                        const newRuleHtml = `
                            <div fx="row" gap="xs" class="css-rule-row" data-group="${gIdx}" data-rule="${newRuleIdx}">
                                <input type="text" class="inp css-key" value="" placeholder="prop" data-group="${gIdx}" data-rule="${newRuleIdx}">
                                <span tc="2">:</span>
                                <input type="text" class="inp css-val" value="" placeholder="value" data-group="${gIdx}" data-rule="${newRuleIdx}">
                                <button class="btn sq css-rule-del" bg="none" bd="none" hv-tc="err" data-group="${gIdx}" data-rule="${newRuleIdx}" title="Delete Rule"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                            </div>`;
                        target.closest('.css-properties-list').insertAdjacentHTML('beforeend', newRuleHtml);
                    }
                }
            });

            // 基于事件委托响应点击删除的逻辑，移除DOM并重构剩余DOM的 dataset 索引映射，确保不打断用户交互
            cssContainer.addEventListener('click', (e) => {
                const ruleDelBtn = e.target.closest('.css-rule-del');
                const groupDelBtn = e.target.closest('.css-group-del');

                if (ruleDelBtn) {
                    const rIdx = parseInt(ruleDelBtn.dataset.rule);
                    const gIdx = parseInt(ruleDelBtn.dataset.group);
                    const group = this.properties.customCSS[gIdx];

                    // 1. 底层数据删除
                    group.rules.splice(rIdx, 1);

                    // 2. DOM 删除及索引数据更新（确保下次输入时绑定的 array index 是对的）
                    const row = ruleDelBtn.closest('.css-rule-row');
                    const listContainer = row.parentElement;
                    row.remove();

                    Array.from(listContainer.querySelectorAll('.css-rule-row')).forEach((r, idx) => {
                        r.dataset.rule = idx; // 刷新行的标识
                        r.querySelectorAll('[data-rule]').forEach(el => el.dataset.rule = idx); // 刷新子元素(input/btn)的标识
                    });

                    // 3. 数量回落到 1 时，剥夺最后那个独苗的删除按钮
                    if (group.rules.length === 1) {
                        const lastBtn = listContainer.querySelector('.css-rule-del');
                        if (lastBtn) lastBtn.remove();
                    }

                    this._applyCustomCSS(); // 让样式立即应用到画板
                    this.BAPI_PE.emitChange(true, 'css-edit', this); // 记入历史记录
                }
                else if (groupDelBtn) {
                    const gIdx = parseInt(groupDelBtn.dataset.group);

                    // 1. 底层数据删除
                    this.properties.customCSS.splice(gIdx, 1);

                    // 2. DOM 删除及索引数据更新
                    const block = groupDelBtn.closest('.css-rule-block');
                    const rulesContainer = block.parentElement;
                    block.remove();

                    Array.from(rulesContainer.querySelectorAll('.css-rule-block')).forEach((b, idx) => {
                        b.dataset.group = idx;
                        b.querySelectorAll('[data-group]').forEach(el => el.dataset.group = idx);
                    });

                    // 3. 数量回落到 1 时，剥夺最后那个独苗组的删除按钮
                    if (this.properties.customCSS.length === 1) {
                        const lastBtn = rulesContainer.querySelector('.css-group-del');
                        if (lastBtn) lastBtn.remove();
                    }

                    this._applyCustomCSS();
                    this.BAPI_PE.emitChange(true, 'css-edit', this);
                }
            });

            // 失焦时进行静默清理
            cssContainer.addEventListener('focusout', (e) => {
                setTimeout(() => {
                    // 如果焦点还在 CSS 区域内部切换，则不处理
                    if (cssContainer.contains(document.activeElement)) return;

                    // 如果焦点彻底离开，则清理多余空行/空块并刷新历史记录
                    const originalLength = JSON.stringify(this.properties.customCSS).length;
                    this._cleanUpCustomCSSData();
                    if (JSON.stringify(this.properties.customCSS).length !== originalLength) {
                        this._refreshDetailsPanel();
                        this.BAPI_PE.emitChange(true, 'css-edit', this);
                    }
                }, 10); // 微小延迟以确保 activeElement 已更新
            });
        }
    }


    // --- Export API ---
    /**
     * Returns any JavaScript code that needs to be injected into the final exported HTML file
     * to make this block interactive.
     * @returns {string|null} A string containing the script (without <script> tags), or null.
     */
    getExportScripts(exportContext) {
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



    // ========== ------- ========== //
    // ========== Private ========== //
    // ========== ------- ========== //



    /**
     * Creates the main wrapper element (.block-container).
     * @private
     */
    _createWrapperElement() {
        const element = document.createElement('div');
        element.className = 'block-container';
        element.dataset['id'] = this.id;
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
        content.dataset['id'] = this.id;
        content.dataset['type'] = this.type;
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
     * Updates the block's DOM element from its `content` property.
     */
    syncContentToDOM() {
        if (this.contentElement) {
            this.contentElement.innerHTML = this.content;
        }
    }

    /**
     * Subclasses can override this to inject custom HTML into the details panel.
     * Returned HTML will be placed between Hierarchy and Properties sections.
     * @returns {string} HTML string or empty string.
     * @private
     */
    renderDetailsPanel_custom() {
        return '';
    }


    // Methods for Details Panel & CSS

    /**
     * Returns an array defining the editable properties for this block.
     * Subclasses should override this.
     * @returns {Array<{key: string, label: string, type: 'text'|'number'|'color'|'select'|'checkbox', options?: Array}>}
     * @private
     */
    static getPropertiesSchema() {
        const borderStyles = ['solid', 'dashed', 'dotted', 'double'];
        const borderChildren = borderStyles.flatMap(style => [
            { condition: style, name: 'borderWidth', display: 'Border Width', type: 'text', placeholder: 'e.g. 1px' },
            { condition: style, name: 'borderColor', display: 'Border Color', type: 'color' }
        ]);

        return [
            // 布局与间距
            { name: 'padding', display: 'Padding', type: 'text', placeholder: 'e.g. 10px 20px' },
            { name: 'marginTop', display: 'Margin Top', type: 'text', placeholder: 'e.g. 10px' },
            { name: 'marginBottom', display: 'Margin Bottom', type: 'text', placeholder: 'e.g. 10px' },

            // 背景与可见性
            {
                name: 'backgroundMode',
                display: 'Bg Mode',
                type: 'sel',
                values: [{display: 'Transparent', value: 'Transparent'}, {display: 'Color', value: 'Color'}, {display: 'Image', value: 'Image'}],
                value: 'Transparent',
                children: [
                    { condition: 'Color', name: 'backgroundColor', display: 'Color', type: 'color' },
                    { condition: 'Image', name: 'backgroundImage', display: 'Image URL', type: 'text', placeholder: 'https://...' },
                    { condition: 'Image', name: 'backgroundSize', display: 'Bg Size', type: 'sel', values: [{display: 'auto', value: 'auto'}, {display: 'cover', value: 'cover'}, {display: 'contain', value: 'contain'}, {display: '100% 100%', value: '100% 100%'}], value: 'cover' }
                ]
            },
            { name: 'opacity', display: 'Opacity', type: 'num', value: 1, min: 0, max: 1, step: 0.05 },

            // 边框设置
            {
                name: 'borderStyle',
                display: 'Border Style',
                type: 'sel',
                values: [{display: 'none', value: 'none'}, {display: 'solid', value: 'solid'}, {display: 'dashed', value: 'dashed'}, {display: 'dotted', value: 'dotted'}, {display: 'double', value: 'double'}],
                value: 'none',
                children: borderChildren
            },
            { name: 'borderRadius', display: 'Radius', type: 'text', placeholder: 'e.g. 4px' },

            // 高级效果
            { name: 'boxShadow', display: 'Shadow', type: 'text', placeholder: 'e.g. 0 2px 4px rgba(0,0,0,0.1)' }
        ];
    }


    _cleanUpCustomCSSData() {
        if (!this.properties.customCSS) this.properties.customCSS = [];

        // 1. 清理空规则，并在每个块末尾补齐一个空白规则
        this.properties.customCSS.forEach(group => {
            if (!group.rules) group.rules = [];
            group.rules = group.rules.filter(r => (r.prop || '').trim() !== '' || (r.val || '').trim() !== '');
            group.rules.push({ prop: '', val: '' });
        });

        // 2. 清理完全空白的块，并在整体末尾补齐一个空白块
        this.properties.customCSS = this.properties.customCSS.filter(g =>
            (g.selector || '').trim() !== '' || g.rules.length > 1
        );
        this.properties.customCSS.push({ selector: '', rules: [{ prop: '', val: '' }] });
    }

    /**
     * @returns
     * @private
     */
    _renderCustomCSSSectionHTML() {
        this._cleanUpCustomCSSData(); // 渲染前强制整理数据结构

        let html = '<div class="custom-css-container" fx="col" gap="s" id="css-rules-container">';

        this.properties.customCSS.forEach((blockRule, index) => {
            const showGroupDel = this.properties.customCSS.length > 1; // 组大于1个则显示
            let propsHtml = blockRule.rules.map((rule, rIndex) => {
                const showRuleDel = blockRule.rules.length > 1; // 行大于1个则显示
                return `
                <div fx="row" gap="xs" class="css-rule-row" data-group="${index}" data-rule="${rIndex}">
                    <input type="text" class="inp css-key" value="${rule.prop}" placeholder="prop" data-group="${index}" data-rule="${rIndex}">
                    <span tc="2">:</span>
                    <input type="text" class="inp css-val" value="${rule.val}" placeholder="value" data-group="${index}" data-rule="${rIndex}">
                    ${showRuleDel ? `<button class="btn sq css-rule-del" bg="none" bd="none" hv-tc="err" data-group="${index}" data-rule="${rIndex}" title="Delete Rule"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : ''}
                </div>
                `;
            }).join('');

            html += `
                <div class="css-rule-block" bg="1" bd="1" rd="s" pd="s" style="position:relative;" data-group="${index}">
                    <div fx="row" gap="s" style="margin-bottom:8px; border-bottom:1px solid var(--bd-1); padding-bottom:8px;">
                        <span tc="2" style="font-family:monospace; font-size:11px;">#block-${this.id.substr(0, 4)}</span>
                        <input type="text" class="inp css-selector" style="flex-grow:1;" value="${blockRule.selector}" placeholder="e.g. :hover" data-group="${index}">
                        ${showGroupDel ? `<button class="btn sq css-group-del" bg="none" bd="none" hv-tc="err" data-group="${index}" title="Delete Group"><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : ''}
                    </div>
                    <div fx="col" gap="xs" class="css-properties-list">
                        ${propsHtml}
                    </div>
                </div>
            `;
        });

        html += '</div>';
        return html;
    }

    /**
     * Subclasses can override this to attach event listeners to their custom HTML.
     * @param {HTMLElement} container - The details panel container.
     * @private
     */
    onDetailsPanelOpen_custom(container) {
        // Default: do nothing
    }

    _refreshDetailsPanel() {
        this._applyCustomCSS();
        this.BAPI_PE.emitChange(false, 'css-ui-update', this); // Don't record history for every UI click
        this.BAPI_PE.updateDetailsPanel(); // Force re-render of panel
    }

    // 直接设置DOM属性以应用通用样式（如背景、边距、边框等），无需重写渲染整个块
    _applyGenericStyles() {
        if (!this.element) return;
        const s = this.element.style;
        const p = this.properties;

        // 辅助方法：解析可能为数组的嵌套属性结构 [value, { subProps }]
        const parseNested = (key) => {
            const val = p[key];
            if (Array.isArray(val)) return { mode: val[0], sub: val[1] || {} };
            return { mode: val, sub: {} };
        };

        // 布局
        s.padding = p.padding || '';
        s.marginTop = p.marginTop || '';
        s.marginBottom = p.marginBottom || '';

        // 背景
        const bg = parseNested('backgroundMode');
        if (bg.mode === 'Color') {
            s.backgroundColor = bg.sub.backgroundColor || '';
            s.backgroundImage = '';
        } else if (bg.mode === 'Image') {
            s.backgroundColor = '';
            s.backgroundImage = bg.sub.backgroundImage ? `url('${bg.sub.backgroundImage}')` : '';
            s.backgroundSize = bg.sub.backgroundSize || 'cover';
        } else {
            // Transparent 或未定义
            s.backgroundColor = '';
            s.backgroundImage = '';
        }

        if (p.opacity !== undefined && p.opacity !== '') s.opacity = p.opacity; else s.opacity = '';

        // 边框
        const border = parseNested('borderStyle');
        s.borderStyle = (border.mode && border.mode !== 'none') ? border.mode : 'none';
        if (s.borderStyle !== 'none') {
            s.borderWidth = border.sub.borderWidth || '';
            s.borderColor = border.sub.borderColor || '';
        } else {
            s.borderWidth = '';
            s.borderColor = '';
        }
        s.borderRadius = p.borderRadius || '';

        // 阴影
        s.boxShadow = p.boxShadow || '';
    }

    _applyCustomCSS() {
        if (!this.element) return;

        // 1. 在当前 Block 的 DOM 树内寻找或创建 style 标签
        let styleTag = this.element.querySelector(`style#style-block-${this.id}`);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = `style-block-${this.id}`;
            // 插入到块元素的最前面，这样导出时 cloneNode 会天然包含它
            this.element.prepend(styleTag);
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

    _reRenderSelf() {
        // 1. 保存旧的 DOM 元素引用
        const oldElement = this.element;
        // 2. 调用自身的 render 方法生成全新的 DOM 结构
        const newElement = this.render();

        // 3. 在真实的 DOM 树中，用新元素替换旧元素
        if (oldElement && oldElement.parentElement) {
            oldElement.parentElement.replaceChild(newElement, oldElement);
        }
    }


    _generateUUID() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    }
}