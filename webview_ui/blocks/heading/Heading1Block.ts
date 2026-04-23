// blocks/Heading1Block.js
class Heading1Block extends TextBlock {
    static override type = 'heading1';
    static override icon = 'H1';
    static override label = 'Heading 1';
    static override description = 'A large, top-level heading.';
    static override keywords = ['h1', 'heading', 'title', 'header'];
    static override canBeToggled = true;
    static override placeholder = 'Heading 1';

    textElement: HTMLElement;
}

window['registerBlock'](Heading1Block);