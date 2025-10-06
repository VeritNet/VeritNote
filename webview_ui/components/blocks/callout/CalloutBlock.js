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

    _renderContent() {
        // The main content element for a callout is a flex container
        this.contentElement.innerHTML = `
            <div class="callout-icon">💡</div>
            <div class="callout-content-wrapper"></div>
        `;
        // Important: Re-assign the childrenContainer to the new wrapper
        this.childrenContainer = this.contentElement.querySelector('.callout-content-wrapper');
    
        // --- 新增 ---
        // 遵循新标准，为子块容器添加专用类
        this.childrenContainer.classList.add('block-children-container');
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