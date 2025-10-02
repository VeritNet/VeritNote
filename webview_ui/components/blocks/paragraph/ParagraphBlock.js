// js/blocks/ParagraphBlock.js
class ParagraphBlock extends TextBlock {
    static type = 'paragraph';
    static icon = '¶';
    static label = 'Paragraph';
    static description = 'Just a plain text paragraph.';
    static keywords = ['text', 'paragraph', 'p'];
    static canBeToggled = true;
    static placeholder = 'Type \'/\' for commands...';
}