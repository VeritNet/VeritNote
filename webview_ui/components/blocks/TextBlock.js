// js/blocks/TextBlock.js
class TextBlock extends Block {
    constructor(data, editor) {
        super(data, editor);
    }

    static getPropertiesSchema() {
        return [
            // 文本专属属性
            { key: 'color', label: 'Text Color', type: 'color' },
            { key: 'textAlign', label: 'Alignment', type: 'select', options: ['left', 'center', 'right', 'justify'] },
            { key: 'fontSize', label: 'Font Size', type: 'text', placeholder: 'e.g. 16px' },
            { key: 'fontWeight', label: 'Font Weight', type: 'select', options: ['normal', 'bold', '300', '400', '500', '600', '700', '800'] },
            { key: 'lineHeight', label: 'Line Height', type: 'text', placeholder: 'e.g. 1.5' },
            { key: 'letterSpacing', label: 'Letter Spacing', type: 'text', placeholder: 'e.g. 0.5px' },
            { key: 'textDecoration', label: 'Decoration', type: 'select', options: ['none', 'underline', 'line-through', 'overline'] },
            { key: 'fontFamily', label: 'Font Family', type: 'select', options: ['inherit', 'sans-serif', 'serif', 'monospace', 'cursive'] },

            // 继承通用的盒模型属性
            ...super.getPropertiesSchema()
        ];
    }

    _renderContent() {
        super._renderContent();
        this.contentElement.contentEditable = 'true';
        this.contentElement.innerHTML = this.content || '';

        if (this.constructor.placeholder) {
            this.contentElement.dataset.placeholder = this.constructor.placeholder;
        }

        // --- 应用文本样式 ---
        const s = this.contentElement.style;
        const p = this.properties;

        if (p.color) s.color = p.color;
        if (p.textAlign) s.textAlign = p.textAlign;
        if (p.fontSize) s.fontSize = p.fontSize;
        if (p.fontWeight) s.fontWeight = p.fontWeight;
        if (p.lineHeight) s.lineHeight = p.lineHeight;
        if (p.letterSpacing) s.letterSpacing = p.letterSpacing;
        if (p.textDecoration) s.textDecoration = p.textDecoration;
        if (p.fontFamily && p.fontFamily !== 'inherit') s.fontFamily = p.fontFamily;
    }

    get toolbarButtons() {
        const buttons = [
            { icon: '𝐁', title: 'Bold', action: 'format', arg: 'bold' },
            { icon: '𝘐', title: 'Italic', action: 'format', arg: 'italic' },
            { icon: 'U̲', title: 'Underlined', action: 'format', arg: 'underline' },
            { icon: 'S̶', title: 'StrikeThrough', action: 'format', arg: 'strikeThrough' },
            { icon: '🎨', title: 'Color', action: 'colorPicker' },
            { icon: '🔗', title: 'Link', action: 'link' },
        ];
        buttons.push(...super.toolbarButtons);
        return buttons;
    }

    onKeyDown(e) {
        // 检查条件：按下的是 Backspace 或 Delete 键，并且内容为空
        // 浏览器在清空 contenteditable 时有时会留下 <br>，所以要同时检查
        if ((e.key === 'Backspace' || e.key === 'Delete') && 
            (this.contentElement.innerHTML === '' || this.contentElement.innerHTML === '<br>')) {
            
            e.preventDefault(); // 阻止默认行为（例如删除整个块的DOM节点）

            // (可选但强烈推荐的UX优化) 找到前一个块，以便删除后聚焦
            const info = this.editor._findBlockInstanceAndParent(this.id);
            let blockToFocus = null;
            if (info) {
                // 尝试找到前一个兄弟节点，如果找不到，就找父节点
                blockToFocus = info.parentArray[info.index - 1] || info.parentInstance;
            }

            // 调用编辑器的核心删除方法
            this.editor.deleteBlock(this);

            // 如果找到了前一个块，就将光标聚焦到它上面
            if (blockToFocus) {
                blockToFocus.focus();
            }
            
            return; // 已经处理完毕，退出函数
        }

        // 如果以上条件不满足，则执行父类（Block.js）中的默认 onKeyDown 逻辑
        // 这能确保“回车创建新块”和“/”命令菜单的功能依然有效
        super.onKeyDown(e);
    }

    renderDetailsPanel_custom() {
        this.syncContentFromDOM();
        const currentHtml = this.content || '';

        return `
        <div class="details-section-header">Content Source</div>
            <div class="details-custom-content-view">
            <div class="details-code-editor-wrapper" style="
                position: relative; 
                min-height: 100px; 
                border: 1px solid var(--border-color); 
                border-radius: 4px; 
                background-color: #282c34; /* Atom One Dark 背景色，与 highlight.js 主题匹配 */
                resize: vertical; 
                overflow: auto; /* 允许调整大小 */
            ">
                <!-- 底层：显示高亮代码 -->
                <pre style="
                    margin: 0; 
                    padding: 10px; 
                    pointer-events: none; 
                    background: transparent;
                    width: 100%;
                    min-height: 100%;
                    box-sizing: border-box;
                    white-space: pre-wrap; /* 自动换行 */
                    word-break: break-all;
                    font-family: monospace; 
                    font-size: 12px;
                    line-height: 1.5;
                "><code class="language-html" style="background: transparent; padding: 0;">${this._escapeHtml(currentHtml)}</code></pre>

                <!-- 顶层：透明输入框 -->
                <textarea 
                    class="details-html-source" 
                    spellcheck="false"
                    style="
                        position: absolute; 
                        top: 0; 
                        left: 0; 
                        width: 100%; 
                        height: 100%; 
                        margin: 0; 
                        padding: 10px; 
                        border: none; 
                        background: transparent; 
                        color: transparent; /* 文字透明，只显示光标 */
                        caret-color: #fff; /* 光标设为白色 */
                        resize: none; /* 禁用自身的 resize，跟随 wrapper */
                        outline: none;
                        font-family: monospace; 
                        font-size: 12px;
                        line-height: 1.5;
                        white-space: pre-wrap; /* 必须与 pre 保持一致 */
                        word-break: break-all;
                        box-sizing: border-box;
                        overflow: hidden; /* 隐藏滚动条，跟随 wrapper 滚动 */
                ">${this._escapeHtml(currentHtml)}</textarea>
            </div>
            </div>
        `;
    }

    _escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    onDetailsPanelOpen_custom(container) {
        const textarea = container.querySelector('.details-html-source');
        const codeElement = container.querySelector('code');
        const wrapper = container.querySelector('.details-code-editor-wrapper');

        if (!textarea || !codeElement) return;

        // 0. 初始化高亮
        if (typeof hljs !== 'undefined') {
            hljs.highlightElement(codeElement);
        }

        // 定义更新显示的函数
        const updateHighlight = (text) => {
            // 设置纯文本内容，避免 XSS
            codeElement.textContent = text;
            // 移除高亮标记以便重新高亮
            codeElement.removeAttribute('data-highlighted');
            if (typeof hljs !== 'undefined') {
                hljs.highlightElement(codeElement);
            }
        };

        // 1. 面板 -> 编辑器 (及本地高亮更新)
        textarea.addEventListener('input', () => {
            const newHtml = textarea.value;

            // 更新底层高亮
            updateHighlight(newHtml);

            // 更新数据模型和编辑器 DOM
            this.content = newHtml;
            this.syncContentToDOM();
            this.editor.emitChange(true, 'source-edit', this);
        });

        // 修正上面的 HTML 样式 (JS动态修正更方便)
        wrapper.style.overflow = 'hidden'; // wrapper 裁剪
        textarea.style.overflow = 'auto'; // textarea 负责滚动
        const pre = codeElement.parentElement;
        pre.style.overflow = 'hidden'; // pre 隐藏滚动条

        textarea.addEventListener('scroll', () => {
            pre.scrollTop = textarea.scrollTop;
            pre.scrollLeft = textarea.scrollLeft;
        });

        // 2. 编辑器 -> 面板
        const safeUpdateHandler = (e) => {
            if (!textarea.isConnected) {
                window.removeEventListener('block:updated', safeUpdateHandler);
                return;
            }
            if (e.detail.filePath === this.editor.filePath &&
                e.detail.blockData.id === this.id) {
                if (document.activeElement !== textarea) {
                    const newContent = e.detail.blockData.content;
                    textarea.value = newContent;
                    updateHighlight(newContent);
                }
            }
        };

        window.addEventListener('block:updated', safeUpdateHandler);
    }
}