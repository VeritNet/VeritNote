// --- Converts any valid color string to #rrggbb format ---
function toHexColor(colorStr) {
    if (!colorStr || typeof colorStr !== 'string') return '#000000';
    if (colorStr.startsWith('#')) {
        if (colorStr.length === 4) { // Expand #rgb to #rrggbb
            return `#${colorStr[1]}${colorStr[1]}${colorStr[2]}${colorStr[2]}${colorStr[3]}${colorStr[3]}`;
        }
        return colorStr;
    }
    // For rgb() and others, we need to draw it to a canvas to get the hex value
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = colorStr;
    return ctx.fillStyle;
}


class ConfigModal {
    constructor({ title, configData, defaults, onSave, onClose }) {
        this.title = title;
        this.configData = JSON.parse(JSON.stringify(configData)); // Deep copy
        this.defaults = defaults;
        this.onSave = onSave;
        this.onClose = onClose;
        this.element = null;
        this.activeDropdown = null;

        this._create();
        document.addEventListener('click', this._handleGlobalClick.bind(this), true);
    }

    _create() {
        this.element = document.createElement('div');
        this.element.className = 'export-overlay';
        this.element.style.userSelect = 'none';

        let categoriesHtml = '';
        for (const category in this.defaults) {
            categoriesHtml += `<div class="config-category-title">${category}</div>`;
            for (const key in this.defaults[category]) {
                categoriesHtml += this._renderConfigItem(category, key);
            }
        }
        
        // Use the new footer class
        this.element.innerHTML = `
            <div class="config-modal-content">
                <div class="config-modal-header"><h3>${this.title}</h3></div>
                <div class="config-content-area">${categoriesHtml}</div>
                <div class="config-modal-footer"> 
                    <button id="cancel-config-btn">Cancel</button>
                    <button id="save-config-btn" class="primary-btn">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.element);
        this._addListeners();
    }
    
    _renderConfigItem(category, key) {
        let currentValue = this.configData[category]?.[key] || INHERIT_VALUE;
        const defaultValue = this.defaults[category][key];
        const isInherit = currentValue === INHERIT_VALUE;

        // --- RENDERER FOR COLOR & BACKGROUND ---
        if (key === 'background' || (typeof defaultValue === 'string' && (defaultValue.startsWith('#') || defaultValue.startsWith('rgb')))) {
            const renderControlGroup = (controlHtml) => `
                <div class="btn-group">
                    <button data-mode="inherit" class="${isInherit ? 'active' : ''}">Inherit</button>
                    <button data-mode="custom" class="${!isInherit ? 'active' : ''}">Custom</button>
                </div>
                <div class="config-custom-control" style="display:${!isInherit ? 'flex' : 'none'};">
                    ${controlHtml}
                </div>
            `;
            
            let controlHtml = '';
            if (key === 'background') {
                const bgValue = isInherit ? defaultValue : currentValue;
                const isColor = bgValue.type === 'color';
                // --- Add placeholder and new class for text input ---
                const inputValue = isColor ? toHexColor(bgValue.value) : bgValue.value;
                const placeholder = isColor ? '' : 'placeholder="Enter image URL"';
                const inputClass = isColor ? 'config-custom-input' : 'config-custom-input is-text-like'; // New class
                
                controlHtml = `
                    <div class="btn-group background-type-toggle">
                        <button data-type="color" class="${isColor ? 'active' : ''}">Color</button>
                        <button data-type="image" class="${!isColor ? 'active' : ''}">Image</button>
                    </div>
                    <input type="${isColor ? 'color' : 'text'}" class="${inputClass}" value="${inputValue}" ${placeholder}>
                `;
            } else { // It's a simple color property
                const colorValue = isInherit ? defaultValue : currentValue;
                controlHtml = `<input type="color" class="config-custom-input" value="${toHexColor(colorValue)}">`;
            }

            return `
                <div class="config-item" data-category="${category}" data-key="${key}">
                    <div class="config-item-label">${key.replace(/-/g, ' ')}</div>
                    <div class="config-item-control">
                        ${renderControlGroup(controlHtml)}
                    </div>
                </div>
            `;
        }

        // --- RENDERER FOR TEXT/SEARCHABLE PROPERTIES (e.g., font, width) ---
        const presets = {
            "font-family-sans": ["-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif", "Georgia, serif", "Verdana, sans-serif"],
            "font-family-monospace": ["Courier New, Courier, monospace", "Consolas, monaco, monospace"],
            "max-width": ["900px", "1200px", "720px"],
            "line-height": ["1.6", "1.5", "1.7"]
        };

        let dropdownItems = `<div class="combobox-item" data-value="${INHERIT_VALUE}">Inherit</div>`;
        if (presets[key] && presets[key].length > 0) {
            dropdownItems += `<div class="combobox-item separator"></div>`;
            presets[key].forEach(p => dropdownItems += `<div class="combobox-item" data-value="${p}">${p.split(',')[0]}</div>`);
        }
        
        return `
            <div class="config-item" data-category="${category}" data-key="${key}">
                <div class="config-item-label">${key.replace(/-/g, ' ')}</div>
                <div class="config-item-control">
                    <div class="input-combobox">
                        <input type="text" value="${isInherit ? 'Inherit' : currentValue}">
                        <div class="input-combobox-arrow">▼</div>
                        <div class="input-combobox-dropdown">${dropdownItems}</div>
                    </div>
                </div>
            </div>
        `;
    }

    _addListeners() {
        this.element.querySelector('#cancel-config-btn').addEventListener('click', () => this.hide());
        this.element.querySelector('#save-config-btn').addEventListener('click', () => this._save());

        // Listener for Inherit/Custom toggles
        this.element.querySelectorAll('.config-item-control > .btn-group').forEach(group => {
            group.addEventListener('click', (e) => {
                const button = e.target.closest('button');
                if (!button) return;
                
                group.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                const customControl = group.parentElement.querySelector('.config-custom-control');
                customControl.style.display = button.dataset.mode === 'custom' ? 'flex' : 'none';
            });
        });

        // Listener for searchable ComboBox
        this.element.querySelectorAll('.input-combobox').forEach(combo => {
            const input = combo.querySelector('input');
            const arrow = combo.querySelector('.input-combobox-arrow');
            const dropdown = combo.querySelector('.input-combobox-dropdown');

            const toggleDropdown = (show) => {
                const shouldShow = typeof show === 'boolean' ? show : dropdown.style.display !== 'block';
                if (shouldShow) {
                    if (this.activeDropdown && this.activeDropdown !== dropdown) {
                        this.activeDropdown.style.display = 'none';
                    }
                    dropdown.style.display = 'block';
                    this.activeDropdown = dropdown;
                } else {
                    dropdown.style.display = 'none';
                    if (this.activeDropdown === dropdown) {
                        this.activeDropdown = null;
                    }
                }
            };
            
            arrow.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleDropdown();
            });

            input.addEventListener('focus', () => {
                this._filterComboBox(input, dropdown);
                toggleDropdown(true);

            });
            input.addEventListener('input', () => this._filterComboBox(input, dropdown));
            
            dropdown.addEventListener('mousedown', e => {
                e.preventDefault(); 
                const item = e.target.closest('.combobox-item:not(.separator)');
                if (item) {
                    const value = item.dataset.value;
                    input.value = value === INHERIT_VALUE ? 'Inherit' : value;
                    toggleDropdown(false);
                }
            });
        });

        // --- background type toggle ---
        // Listener for Background Type (Color/Image) toggle
        this.element.querySelectorAll('.background-type-toggle').forEach(group => {
            group.addEventListener('click', e => {
                const button = e.target.closest('button');
                if (!button) return;

                // 1. Update active class on buttons
                group.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // 2. Get the input element
                const input = group.parentElement.querySelector('.config-custom-input');
                const selectedType = button.dataset.type;

                // 3. Update all relevant attributes based on the selected type
                if (selectedType === 'color') {
                    // Switching TO Color
                    const lastTextValue = input.value;
                    input.type = 'color';
                    // Try to preserve value if it was a valid color, otherwise default
                    input.value = toHexColor(lastTextValue) || '#000000'; 
                    input.removeAttribute('placeholder');
                    input.classList.remove('is-text-like');
                } else {
                    // Switching TO Image
                    input.type = 'text';
                    input.setAttribute('placeholder', 'Enter image URL');
                    input.classList.add('is-text-like');
                    // We don't change the value, user might want to edit a previously entered URL
                }
            });
        });
    }

    _filterComboBox(input, dropdown) {
        const filter = input.value.toLowerCase();
        // If the input is 'Inherit', don't filter, just show all
        const searchTerm = (filter === 'inherit') ? '' : filter;
        let hasVisibleItems = false;
        
        dropdown.querySelectorAll('.combobox-item').forEach(item => {
            const itemValue = item.dataset.value || '';
            const itemText = item.textContent.toLowerCase();
            const isVisible = item.classList.contains('separator') || itemText.includes(searchTerm) || itemValue.toLowerCase().includes(searchTerm);
            item.style.display = isVisible ? '' : 'none';
            if (isVisible && !item.classList.contains('separator')) hasVisibleItems = true;
        });

        // Only show dropdown if there are items to show
        if (dropdown.style.display === 'block' && !hasVisibleItems) {
            dropdown.style.display = 'none';
            this.activeDropdown = null;
        }
    }

    _save() {
        const finalConfig = {};
        this.element.querySelectorAll('.config-item').forEach(item => {
            const category = item.dataset.category;
            const key = item.dataset.key;
            if (!finalConfig[category]) finalConfig[category] = {};

            const isColorControl = !!item.querySelector('.config-item-control > .btn-group');
            
            if (isColorControl) {
                // Logic for color/background controls
                const mode = item.querySelector('.config-item-control > .btn-group button.active').dataset.mode;
                if (mode === 'inherit') {
                    finalConfig[category][key] = INHERIT_VALUE;
                } else { // Custom
                    if (key === 'background') {
                        const typeBtn = item.querySelector('.background-type-toggle button.active');
                        const input = item.querySelector('.config-custom-control input');
                        finalConfig[category][key] = { type: typeBtn.dataset.type, value: input.value };
                    } else {
                        const input = item.querySelector('.config-custom-control input, .config-custom-control .input-combobox input');
                        finalConfig[category][key] = input.value;
                    }
                }
            } else {
                // Logic for InputComboBox
                const input = item.querySelector('.input-combobox input');
                finalConfig[category][key] = input.value === 'Inherit' ? INHERIT_VALUE : input.value;
            }
        });
        this.onSave(finalConfig);
        this.hide();
    }

    _handleGlobalClick(e) {
        if (this.activeDropdown && !this.activeDropdown.parentElement.contains(e.target)) {
            this.activeDropdown.style.display = 'none';
            this.activeDropdown = null;
        }
    }

    hide() {
        document.removeEventListener('click', this._handleGlobalClick, true);
        this.element.remove();
        this.onClose();
    }
}