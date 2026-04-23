// blocks/ParagraphBlock.js
class ParagraphBlock extends TextBlock {
    static override type = 'paragraph';
    static override icon = '¶';
    static override label = 'Paragraph';
    static override description = 'Just a plain text paragraph.';
    static override keywords = ['text', 'paragraph', 'p'];
    static override canBeToggled = true;
    static override placeholder = 'Type \'/\' for commands...';

    textElement: HTMLElement;
}

window['registerBlock'](ParagraphBlock);