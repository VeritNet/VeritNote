// blocks/Heading2Block.js
class Heading2Block extends TextBlock {
    static override type = 'heading2';
    static override icon = 'H2';
    static override label = 'Heading 2';
    static override description = 'A medium-sized heading.';
    static override keywords = ['h2', 'heading', 'subtitle', 'header'];
    static override canBeToggled = true;
    static override placeholder = 'Heading 2';
}

window['registerBlock'](Heading2Block);