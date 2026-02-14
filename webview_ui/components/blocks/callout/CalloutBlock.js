// js/blocks/CalloutBlock.js
class CalloutBlock extends Block {
    static type = 'callout';
    static icon = '💡';
    static label = 'Callout';
    static description = 'A container with an icon and background color.';
    static keywords = ['callout', 'info', 'tip', 'warning', 'note'];
    static canBeToggled = true;

    constructor(data, editor) {
        super(data, editor);
        
        // *** FIX: Use this.children, which is guaranteed to be an array by the Block constructor. ***
        // This logic is correct: a new, empty callout should have a paragraph to type in.
        if (this.children.length === 0) {
            const newParagraph = this.editor.createBlockInstance({ type: 'paragraph', content: '' });
            this.children.push(newParagraph);
            // Manually set the parent since it's created after the initial parent assignment
            newParagraph.parent = this;
        }
    }

    static getPropertiesSchema() {
        return [
            { key: 'icon', label: 'Icon Emoji', type: 'text', placeholder: '💡' },

            // Callout 特有布局
            { key: 'iconSize', label: 'Icon Size', type: 'text', placeholder: '1.2em' },
            { key: 'layout', label: 'Layout', type: 'select', options: ['row', 'row-reverse', 'column'] },

            // 继承通用
            ...super.getPropertiesSchema()
        ];
    }

    render() {
        this.element = this._createWrapperElement();
        this.contentElement = this._createContentElement();

        // 1. 建立永久性的 HTML 结构 (不再在 update 中销毁)
        // 注意：这里手动加上了 block-children-container 类
        this.contentElement.innerHTML = `
            <div class="callout-icon"></div>
            <div class="callout-content-wrapper block-children-container"></div>
        `;

        // 2. 获取关键元素的引用，供后续使用
        this.iconElement = this.contentElement.querySelector('.callout-icon');
        this.childrenContainer = this.contentElement.querySelector('.callout-content-wrapper');

        // 3. 应用动态属性 (图标、布局、颜色)
        this._renderContent();

        this.element.appendChild(this.contentElement);

        // 4. 渲染子元素
        // 由于上面已经正确设置了 this.childrenContainer，这里直接调用即可
        this._renderChildren();

        this._applyCustomCSS();

        return this.element;
    }

    _renderContent() {
        const p = this.properties;

        // 1. 更新图标
        if (this.iconElement) {
            this.iconElement.textContent = p.icon || '💡';
            this.iconElement.style.fontSize = p.iconSize || '1.2em';
        }

        // 2. 更新布局样式
        const flexDirection = p.layout || 'row';
        const alignItems = flexDirection === 'column' ? 'flex-start' : 'flex-start';

        // 确保 contentElement 启用 Flex 布局
        this.contentElement.style.display = 'flex';
        this.contentElement.style.flexDirection = flexDirection;
        this.contentElement.style.alignItems = alignItems;
        this.contentElement.style.gap = '8px'; // 给图标和内容之间一点默认间距
    }

    // Callout content itself is not editable, its children are.
    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }

    // Callouts don't have their own toolbar, but their children do.
    get toolbarButtons() {
        const buttons = [];
        buttons.push(...super.toolbarButtons);
        return buttons;
    }
}