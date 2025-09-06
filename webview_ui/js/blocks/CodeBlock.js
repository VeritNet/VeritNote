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
    }
    
    onInput() {
        this.updateHighlight();
        // Use 'typing' action type to get coalescing for free
        this.editor.emitChange(true, 'typing');
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
        return [
            {
                // We use a special property 'html' to create a custom button with text
                html: `<span class="toolbar-lang-icon"></span> ${this.properties.language}`,
                title: 'Change Language',
                action: 'changeLanguage'
            }
        ];
    }
    
    // *** NEW: Handle the toolbar action ***
    handleToolbarAction(action, buttonElement) {
        if (action === 'changeLanguage') {
            // It passes the button element to showLanguagePicker
            this.showLanguagePicker(buttonElement);
        }
    }
    
    showLanguagePicker(buttonElement) { // Let's call it `buttonElement` to be explicit
        const popoverContent = `
            <div id="popover-language-picker">
                <input type="text" id="popover-language-search" placeholder="Search language...">
                <div id="popover-language-list"></div>
            </div>
        `;

        const renderList = (filter = '') => {
            const listEl = document.getElementById('popover-language-list');
            if (!listEl) return;
            const filteredLangs = this.availableLanguages.filter(lang => lang.toLowerCase().includes(filter.toLowerCase()));
            listEl.innerHTML = filteredLangs.map(lang => `<div class="language-item" data-lang="${lang}">${lang}</div>`).join('');
        };
        
        // Use the received parameter `buttonElement` directly
        this.editor.showCustomPopover({
            targetElement: buttonElement, // <--- This now refers to the function's parameter
            content: popoverContent,
            onOpen: () => {
                const searchInput = document.getElementById('popover-language-search');
                const listEl = document.getElementById('popover-language-list');
                
                if(!searchInput || !listEl) return;

                searchInput.addEventListener('input', () => renderList(searchInput.value));
                listEl.addEventListener('mousedown', (event) => {
                    event.preventDefault();
                    const item = event.target.closest('.language-item');
                    if (item) {
                        this.setLanguage(item.dataset.lang);
                        this.editor.hidePopover();
                    }
                });
                
                renderList('');
                searchInput.focus();
            }
        });
    }
    
    setLanguage(lang) {
        this.properties.language = lang;
        // No need to update button text here, the toolbar will be re-rendered on next hover
        this.highlightedElement.className = `language-${lang}`;
        this.updateHighlight();
        this.editor.emitChange(true, 'change-language');
        
        // Force the toolbar to redraw to show the new language name
        if (this.editor.activeToolbarBlock === this) {
            this.editor._populateToolbar(this);
        }
    }
    
    // Code blocks do not have a standard toolbar
    get toolbarButtons() {
        return [
            {
                html: `<span class="toolbar-lang-icon"></span> ${this.properties.language || 'plaintext'}`,
                title: 'Change Language',
                action: 'changeLanguage'
            }
        ];
    }
}