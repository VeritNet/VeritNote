// blocks/media/VideoBlock.js
class VideoBlock extends Block {
    static type = 'video';
    static icon = '🎬';
    static label = 'Video';
    static description = 'Embed a video from a URL or local file.';
    static keywords = ['video', 'vid', 'movie', 'media', 'mp4'];
    static canBeToggled = true;

    constructor(data, editor) {
        super(data, editor);

        // 初始化基础属性
        if (this.properties.src === undefined) this.properties.src = '';
        if (this.properties.href === undefined) this.properties.href = '';
        if (this.properties.poster === undefined) this.properties.poster = '';

        // 视频特有控制属性 (默认开启控制条)
        if (this.properties.controls === undefined) this.properties.controls = true;
        if (this.properties.autoplay === undefined) this.properties.autoplay = false;
        if (this.properties.loop === undefined) this.properties.loop = false;
        if (this.properties.muted === undefined) this.properties.muted = false;

        this.content = '';
    }

    static getPropertiesSchema() {
        return [
            { name: 'src', display: 'Video Source', type: 'text' },
            { name: 'poster', display: 'Poster Image', type: 'text', placeholder: 'Thumbnail URL' },
            { name: 'href', display: 'Link URL', type: 'text', placeholder: 'External link' },

            // 视频播放控制 (Checkbox)
            { name: 'controls', display: 'Show Controls', type: 'checkbox' },
            { name: 'autoplay', display: 'Autoplay', type: 'checkbox' },
            { name: 'loop', display: 'Loop', type: 'checkbox' },
            { name: 'muted', display: 'Muted', type: 'checkbox' },

            // 尺寸与适应
            { name: 'width', display: 'Width', type: 'text', placeholder: '100% or 500px' },
            { name: 'height', display: 'Height', type: 'text', placeholder: 'auto or 300px' },
            { name: 'objectFit', display: 'Object Fit', type: 'combo', values: [{display: 'fill', value: 'fill'}, {display: 'contain', value: 'contain'}, {display: 'cover', value: 'cover'}, {display: 'none', value: 'none'}, {display: 'scale-down', value: 'scale-down'}] },

            // 继承通用
            ...super.getPropertiesSchema()
        ];
    }

    _renderContent() {
        const p = this.properties;

        if (!p.src) {
            this.contentElement.innerHTML = `<div class="media-placeholder video-placeholder">Click 🎬 to add a video</div>`;
            return;
        }

        let style = `display: block; max-width: 100%;`;
        if (p.width) style += `width: ${p.width};`;
        else style += `width: 100%;`; // 默认全宽
        if (p.height) style += `height: ${p.height};`;
        if (p.objectFit) style += `object-fit: ${p.objectFit};`;
        if (p.borderRadius) style += `border-radius: ${p.borderRadius};`;

        // 拼接 HTML5 Video 属性
        let attrs = '';
        if (p.controls) attrs += ' controls';
        if (p.autoplay) attrs += ' autoplay';
        if (p.loop) attrs += ' loop';
        if (p.muted) attrs += ' muted';
        if (p.poster) attrs += ` poster="${p.poster}"`;

        const videoHtml = `<video src="${p.src}" style="${style}" ${attrs}></video>`;

        // 如果存在外部链接，在右上角悬浮一个现代化的跳转按钮，防止包裹 <a> 破坏视频控件
        let linkHtml = '';
        if (p.href) {
            linkHtml = `
                <a href="${p.href}" target="_blank" rel="noopener noreferrer" class="media-external-link video-link" title="Visit Link">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    <span>Visit Link</span>
                </a>
            `;
        }

        // 使用 wrapper 包裹，方便定位 Link
        this.contentElement.innerHTML = `
            <div class="video-block-wrapper">
                ${videoHtml}
                ${linkHtml}
            </div>
        `;
    }

    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }

    get toolbarButtons() {
        const buttons = [
            { icon: '🎬', title: 'Set Video Source', action: 'editVideo' },
            { icon: '🔗', title: 'Set External Link', action: 'linkVideo' }
        ];
        buttons.push(...super.toolbarButtons as any);
        return buttons;
    }

    handleToolbarAction(action, buttonElement) {
        if (action === 'editVideo') {
            this.BAPI_PE.popoverManager.showVideoSource(
                buttonElement,
                this.properties.src,
                (value) => {
                    this.properties.src = value || '';
                    this._renderContent();
                    this.BAPI_PE.emitChange(true, 'edit-video-src', this);
                }
            );
        } else if (action === 'linkVideo') {
            this.BAPI_PE.popoverManager.showLink(
                buttonElement,
                this.properties.href,
                (value) => {
                    this.properties.href = value || '';
                    this._renderContent();
                    this.BAPI_PE.emitChange(true, 'edit-video-link', this);
                }
            );
        }
    }


    renderDetailsPanel_custom() { return ''; }
    onDetailsPanelOpen_custom(container: HTMLElement) { }
}

window['registerBlock'](VideoBlock);