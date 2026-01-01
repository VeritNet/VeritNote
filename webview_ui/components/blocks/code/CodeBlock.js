// js/blocks/CodeBlock.js
class CodeBlock extends Block {
    static type = 'code';
    static icon = '&lt;/&gt;';
    static label = 'Code Block';
    static description = 'Capture and highlight code snippets.';
    static keywords = ['code', 'snippet', 'pre', 'highlight'];
    static canBeToggled = true;

    static get requiredExportLibs() {
        return [
            'vendor/highlight/highlight.min.js',
            'vendor/highlight/theme.css'
        ];
    }

    constructor(data, editor) {
        super(data, editor);
        
        // *** THE FIX: Robustly ensure properties and language exist. ***
        // This handles loading old data that might not have these fields.
        if (!this.properties) {
            this.properties = {};
        }
        if (!this.properties.language) {
            this.properties.language = 'plaintext';
        }

        this.availableLanguages = [
            'bash', 'cpp', 'csharp', 'css', 'diff', 'go', 'graphql', 'ini', 'java', 
            'javascript', 'json', 'kotlin', 'less', 'lua', 'makefile', 'markdown', 
            'objectivec', 'perl', 'php', 'plaintext', 'python', 'r', 'ruby', 'rust', 
            'scss', 'shell', 'powershell', 'sql', 'swift', 'typescript', 'xml', 'yaml'
        ].sort();
    }

    static getPropertiesSchema() {
        return [
            { key: 'language', label: 'Language', type: 'text' }, // 只读展示或手动输入

            // 代码显示设置
            { key: 'fontSize', label: 'Font Size', type: 'text', placeholder: '14px' },
            { key: 'tabSize', label: 'Tab Size', type: 'number', placeholder: '4' },
            { key: 'wordWrap', label: 'Word Wrap', type: 'checkbox' },
            { key: 'showLineNumbers', label: 'Line Numbers', type: 'checkbox' }, // 仅作预留，需配合 CSS counter 实现

            // 继承通用
            ...super.getPropertiesSchema()
        ];
    }

    render() {
        // The main wrapper is still a .block-container
        this.element = this._createWrapperElement();
        
        // The .block-content is the main visual container with background
        this.contentElement = this._createContentElement();

        // Inside .block-content, we have our structure
        this.contentElement.innerHTML = `
            <pre><code class="language-${this.properties.language}"></code></pre>
            <textarea class="code-block-input" spellcheck="false"></textarea>
        `;

        this.element.appendChild(this.contentElement);

        // Get references to our internal elements
        this.highlightedElement = this.contentElement.querySelector('code');
        this.inputElement = this.contentElement.querySelector('textarea');

        // Set initial content and highlight
        this.inputElement.value = this.content;
        this.updateHighlight();

        // Add event listeners
        this.inputElement.addEventListener('input', () => this.onInput());
        this.inputElement.addEventListener('scroll', () => this.syncScroll());

        return this.element;

        this._applyCodeStyles();
        return this.element;
    }

    _applyCodeStyles() {
        const p = this.properties;
        const pre = this.contentElement.querySelector('pre');
        const textArea = this.contentElement.querySelector('textarea');

        if (pre && textArea) {
            const size = p.fontSize || '14px';
            pre.style.fontSize = size;
            textArea.style.fontSize = size;

            const tab = p.tabSize || 4;
            pre.style.tabSize = tab;
            textArea.style.tabSize = tab;

            const wrap = p.wordWrap ? 'pre-wrap' : 'pre';
            pre.style.whiteSpace = wrap;
            // 注意：textarea 必须保持 nowrap 以避免光标错位，或者需要极其复杂的同步逻辑
            // 这里我们只改变显示的 pre 的换行。如果是编辑模式，用户体验可能略有割裂，
            // 但为了光标对齐，通常 textarea 保持 pre。
        }
    }
    
    onInput() {
        this.updateHighlight();
        // Use 'typing' action type to get coalescing for free
        this.editor.emitChange(true, 'typing', this);
    }
    
    // Code blocks don't need default keydown handlers (no Enter for new blocks, etc.)
    onKeyDown(e) {
        // Allow tabbing for indentation
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.inputElement.selectionStart;
            const end = this.inputElement.selectionEnd;
            
            // Insert a tab character
            this.inputElement.value = this.inputElement.value.substring(0, start) + "\t" + this.inputElement.value.substring(end);
            
            // Move cursor
            this.inputElement.selectionStart = this.inputElement.selectionEnd = start + 1;
            this.onInput(); // Trigger update
        }
    }

    // This method is called by the editor to save data
    syncContentFromDOM() {
        if (this.inputElement) {
            this.content = this.inputElement.value;
        }
    }
    
    updateHighlight() {
        // 1. Get the plain text from the textarea
        const codeText = this.inputElement.value;

        // 2. Escape HTML characters to prevent XSS and rendering issues
        // A more robust way to set text content is to use .textContent
        // as it handles escaping automatically.
        this.highlightedElement.textContent = codeText;
        
        // 3. *** THE FIX: Remove the 'data-highlighted' attribute before re-highlighting. ***
        this.highlightedElement.removeAttribute('data-highlighted');

        // 4. Run highlight.js on the element
        // The library will automatically detect the language from the class name.
        hljs.highlightElement(this.highlightedElement);

        // 5. Sync scroll positions
        this.syncScroll();
    }
    
    syncScroll() {
        // Sync scroll from input to highlighted pre element
        const pre = this.highlightedElement.parentElement;
        pre.scrollTop = this.inputElement.scrollTop;
        pre.scrollLeft = this.inputElement.scrollLeft;
    }

    get toolbarButtons() {
        const buttons = [
            {
                // We use a special property 'html' to create a custom button with text
                html: `<span class="toolbar-lang-icon"></span> ${this.properties.language}`,
                title: 'Change Language',
                action: 'changeLanguage'
            }
        ];
        buttons.push(...super.toolbarButtons);
        return buttons;
    }
    
    // *** NEW: Handle the toolbar action ***
    handleToolbarAction(action, buttonElement) {
        if (action === 'changeLanguage') {
            this.showLanguagePicker(buttonElement);
        }
    }
    
    showLanguagePicker(buttonElement) {
        // --- MODIFIED: This now calls the new, dedicated popover function in main.js ---
        this.editor.popoverManager.showLanguagePicker({
            targetElement: buttonElement,
            availableLanguages: this.availableLanguages,
            callback: (selectedLanguage) => {
                this.setLanguage(selectedLanguage);
            }
        });
    }
    
    setLanguage(lang) {
        this.properties.language = lang;
        // No need to update button text here, the toolbar will be re-rendered on next hover
        this.highlightedElement.className = `language-${lang}`;
        this.updateHighlight();
        this.editor.emitChange(true, 'change-language', this);
        
        // Force the toolbar to redraw to show the new language name
        if (this.editor.activeToolbarBlock === this) {
            this.editor._populateToolbar(this);
        }
    }


    // --- NEW: Implement Export API ---

    /**
     * Specifies the vendor libraries that this block depends on for export.
     * The main export process will collect these and include them in the final HTML.
     */
    static get requiredExportLibs() {
        return [
            'vendor/highlight/highlight.min.js',
            'vendor/highlight/theme.css'
        ];
    }

    /**
     * Provides a script to initialize syntax highlighting on the exported page.
     * This static method is used so the main export process only needs to include
     * the script once, even if there are many code blocks on the page.
     */
    static getExportScripts() {
        // This script will run once per exported page.
        return `
            if (typeof hljs !== 'undefined') {
                hljs.highlightAll();
            }
        `;
    }

    /**
     * Modifies the block's DOM element for export.
     * For CodeBlock, the default rendered HTML is already perfect for export,
     * so no modifications are needed here.
     */
    async getExportHtml(blockElement, options) {
        // The default `render()` method already produces clean <pre><code>...</code></pre>
        // which is exactly what highlight.js needs. So, no changes are required.
        return blockElement;
    }
}