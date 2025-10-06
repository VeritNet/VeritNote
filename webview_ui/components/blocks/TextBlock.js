// js/blocks/TextBlock.js
class TextBlock extends Block {
    constructor(data, editor) {
        super(data, editor);
    }

    _renderContent() {
        super._renderContent();
        this.contentElement.contentEditable = 'true';
        this.contentElement.innerHTML = this.content || '';
        if (this.constructor.placeholder) {
            this.contentElement.dataset.placeholder = this.constructor.placeholder;
        }
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
}