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


    textElement: HTMLElement;

    // --- 2. 构造函数 ---
    constructor(data, editor) {
        // 首先，调用 TextBlock 的构造函数
        super(data, editor);
    }

    // --- 3. 渲染 ---

    override _renderContent() {
        if (!this.contentElement.hasChildNodes()) {
            const bullet = document.createElement('div');
            bullet.className = 'bullet-point';
            bullet.textContent = '•';

            const wrapper = document.createElement('div');
            wrapper.className = 'list-item-content-wrapper';

            this.textElement = document.createElement('div');
            this.textElement.className = 'list-item-text-area';
            this.textElement.contentEditable = 'true';
            this.textElement.textContent = this.properties.text || '';
            this.textElement.dataset['placeholder'] = (this.constructor as typeof Block).placeholder;

            this.childrenContainer = document.createElement('div');
            this.childrenContainer.className = 'list-item-children-container block-children-container';

            wrapper.appendChild(this.textElement);
            wrapper.appendChild(this.childrenContainer);

            this.contentElement.appendChild(bullet);
            this.contentElement.appendChild(wrapper);
        }

        this._applyListItemStyles(1);
    }

    _applyListItemStyles(a: number) {
        const b = a;
        const p = this.properties;
         
        this.applyTextStyles();

        // Text Decoration 通常只应用于文字，不应用于图标
        if (p.textDecoration) {
            if (this.textElement) this.textElement.style.textDecoration = p.textDecoration;
        }
    }

    // --- 4. 覆盖关键方法以指向正确的元素 ---

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