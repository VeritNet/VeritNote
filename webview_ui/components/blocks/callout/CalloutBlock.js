// js/blocks/CalloutBlock.js
class CalloutBlock extends ContainerBlock {
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

    _renderContent() {
        const p = this.properties;
        const icon = p.icon || '💡';

        // 应用布局方向
        const flexDirection = p.layout || 'row';
        const alignItems = flexDirection === 'column' ? 'flex-start' : 'flex-start';

        this.contentElement.style.flexDirection = flexDirection;
        this.contentElement.style.alignItems = alignItems;

        // 保存现有的子元素
        const fragment = document.createDocumentFragment();
        // 如果 childrenContainer 已经存在且有子节点，把它们移到 fragment 中暂存
        if (this.childrenContainer && this.childrenContainer.childNodes.length > 0) {
            while (this.childrenContainer.firstChild) {
                fragment.appendChild(this.childrenContainer.firstChild);
            }
        }

        // 重置 HTML 结构
        this.contentElement.innerHTML = `
            <div class="callout-icon" style="font-size: ${p.iconSize || '1.2em'}">${icon}</div>
            <div class="callout-content-wrapper"></div>
        `;

        // 重新获取容器引用
        this.childrenContainer = this.contentElement.querySelector('.callout-content-wrapper');
        this.childrenContainer.classList.add('block-children-container');

        // 恢复子元素
        this.childrenContainer.appendChild(fragment);
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