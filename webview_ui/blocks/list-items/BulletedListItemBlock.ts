// blocks/BulletedListItemBlock.js

class BulletedListItemBlock extends TextBlock {
    // --- 1. 静态属性定义 ---
    static override type = 'bulletedListItem';
    static override icon = '•';
    static override label = 'Bulleted List';
    static override description = 'Create a bulleted list item.';
    static override keywords = ['list', 'bullet', 'ul', 'item'];
    static override canBeToggled = true;
    static override placeholder = 'List item';


    textElement;

    // --- 2. 构造函数 ---
    constructor(data, editor) {
        // 首先，调用 TextBlock 的构造函数
        super(data, editor);
    }

    // --- 3. 渲染 ---

    override _renderContent() {
        if (!this.contentElement.innerHTML) {
            this.contentElement.innerHTML = `
                <div class="bullet-point">•</div>
                <div class="list-item-content-wrapper">
                    <div class="list-item-text-area"></div>
                    <div class="list-item-children-container block-children-container"></div>
                </div>
            `;
        
            // 获取对关键元素的引用
            const textArea = this.contentElement.querySelector('.list-item-text-area');
            this.childrenContainer = this.contentElement.querySelector('.list-item-children-container');

            this.textElement = textArea;
            this.textElement.contentEditable = 'true';
            this.textElement.innerHTML = this.content || '';
            this.textElement.dataset['placeholder'] = (this.constructor as typeof Block).placeholder;
        }

        this._applyListItemStyles();
    }

    _applyListItemStyles() {
        const p = this.properties;
         
        this.applyTextStyles();

        // Text Decoration 通常只应用于文字，不应用于图标
        if (p.textDecoration) {
            if (this.textElement) this.textElement.style.textDecoration = p.textDecoration;
        }
    }

    // --- 4. 覆盖关键方法以指向正确的元素 ---
    
    // 确保数据从正确的文本元素同步
    override syncContentFromDOM() {
        if (this.textElement) {
            this.content = this.textElement.innerHTML;
        }
    }

    // 确保聚焦到正确的文本元素
    focus() {
        if (!this.textElement) return;
        this.textElement.focus();
        // (代码与 Block.js 中的 focus 方法相同，但目标是 this.textElement)
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(this.textElement);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

window['registerBlock'](BulletedListItemBlock);