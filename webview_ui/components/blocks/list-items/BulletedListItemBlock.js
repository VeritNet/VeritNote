// js/blocks/BulletedListItemBlock.js

class BulletedListItemBlock extends TextBlock {
    // --- 1. 静态属性定义 ---
    static type = 'bulletedListItem';
    static icon = '•';
    static label = 'Bulleted List';
    static description = 'Create a bulleted list item.';
    static keywords = ['list', 'bullet', 'ul', 'item'];
    static canBeToggled = true;
    static placeholder = 'List item';

    // --- 2. 构造函数 ---
    constructor(data, editor) {
        // 首先，调用 TextBlock 的构造函数
        super(data, editor);
        
        // 关键！手动“混入”容器块的特性
        // 这让编辑器知道它可以容纳子块，并应用容器的点击逻辑
        this.isContainer = true; 
    }

    static getPropertiesSchema() {
        return [
            { key: 'listStyleType', label: 'Bullet Style', type: 'select', options: ['disc', 'circle', 'square', 'none'] },
            { key: 'markerColor', label: 'Bullet Color', type: 'color' },
            ...super.getPropertiesSchema() // 继承 TextBlock 的属性
        ];
    }

    // --- 3. 自定义渲染 ---
    render() {
        this.element = this._createWrapperElement();
        this.contentElement = this._createContentElement();

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

        // 关键：将 this.textElement 指向真正的可编辑区域
        // 我们不再需要手动创建它，只需将 contentEditable 属性添加到现有元素上
        this.textElement = textArea;
        this.textElement.contentEditable = 'true';
        this.textElement.innerHTML = this.content || '';
        this.textElement.dataset.placeholder = this.constructor.placeholder;
        this.textElement.addEventListener('keydown', (e) => this.onKeyDown(e));

        this.element.appendChild(this.contentElement);

        // 调用基类的 _renderChildren 方法，它会自动将子块渲染到 this.childrenContainer 中
        this._renderChildren();

        return this.element;
    }

    // --- 4. 覆盖关键方法以指向正确的元素 ---
    
    // 确保数据从正确的文本元素同步
    syncContentFromDOM() {
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

    // --- 5. 覆盖键盘事件以实现列表行为 ---
    onKeyDown(e) {
        // 1. 核心优化：处理 Enter 键
        if (e.key === 'Enter') {
            // 关键：阻止 Enter 键的所有默认行为，包括在文本区内换行
            e.preventDefault(); 
        
            // 如果按下了 Shift+Enter，我们什么都不做，从而有效地“禁用”换行
            if (e.shiftKey) {
                return; 
            }

            // 如果只按下了 Enter，则创建新的列表项
            this.syncContentFromDOM();
            this.editor.insertNewBlockAfter(this, 'bulletedListItem');
            return;
        }

        // 2. 对于所有其他按键，执行 TextBlock 的默认行为
        // 这将正确处理空块删除、字母输入、富文本快捷键等
        super.onKeyDown(e);
    }
}