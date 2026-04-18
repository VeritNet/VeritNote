// blocks/media/AudioBlock.js
class AudioBlock extends Block {
    static type = 'audio';
    static icon = '🎵';
    static label = 'Audio';
    static description = 'Embed an audio track or podcast.';
    static keywords = ['audio', 'sound', 'music', 'mp3', 'podcast'];
    static canBeToggled = true;

    constructor(data, editor) {
        super(data, editor);

        if (this.properties.src === undefined) this.properties.src = '';
        if (this.properties.href === undefined) this.properties.href = '';

        // 音频特有属性
        if (this.properties.controls === undefined) this.properties.controls = true;
        if (this.properties.autoplay === undefined) this.properties.autoplay = false;
        if (this.properties.loop === undefined) this.properties.loop = false;
        if (this.properties.muted === undefined) this.properties.muted = false;

        this.content = '';
    }

    get data() {
        return {
            id: this.id,
            type: this.type,
            content: '',
            properties: this.properties,
            children: [],
        };
    }

    static getPropertiesSchema() {
        return [
            { name: 'src', display: 'Audio Source', type: 'text' },
            { name: 'href', display: 'Link URL', type: 'text', placeholder: 'External link' },

            // 音频控制
            { name: 'controls', display: 'Show Controls', type: 'tgl' },
            { name: 'autoplay', display: 'Autoplay', type: 'tgl' },
            { name: 'loop', display: 'Loop', type: 'tgl' },
            { name: 'muted', display: 'Muted', type: 'tgl' },

            // 继承通用
            ...super.getPropertiesSchema()
        ];
    }

    _renderContent() {
        const p = this.properties;

        if (!p.src) {
            this.contentElement.innerHTML = `<div class="media-placeholder audio-placeholder">Click 🎵 to add an audio file</div>`;
            return;
        }

        let attrs = '';
        if (p.controls) attrs += ' controls';
        if (p.autoplay) attrs += ' autoplay';
        if (p.loop) attrs += ' loop';
        if (p.muted) attrs += ' muted';

        const audioHtml = `<audio src="${p.src}" ${attrs}></audio>`;

        // 音频的外链按钮，放置在播放器右侧
        let linkHtml = '';
        if (p.href) {
            linkHtml = `
                <a href="${p.href}" target="_blank" rel="noopener noreferrer" class="audio-link" title="Visit Link">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                </a>
            `;
        }

        // 使用 Flex 容器包裹，让 Audio 播放器和 Link 按钮同行排列
        this.contentElement.innerHTML = `
            <div class="audio-block-wrapper">
                <div class="audio-icon-deco">🎵</div>
                ${audioHtml}
                ${linkHtml}
            </div>
        `;
    }

    onInput(e) { /* no-op */ }
    onKeyDown(e) { /* no-op */ }

    get toolbarButtons() {
        const buttons = [
            { icon: '🎵', title: 'Set Audio Source', action: 'editAudio' },
            { icon: '🔗', title: 'Set External Link', action: 'linkAudio' }
        ];
        buttons.push(...super.toolbarButtons as any);
        return buttons;
    }

    handleToolbarAction(action, buttonElement) {
        if (action === 'editAudio') {
            this.BAPI_PE.popoverManager.showAudioSource(
                buttonElement,
                this.properties.src,
                (value) => {
                    this.properties.src = value || '';
                    this._renderContent();
                    this.BAPI_PE.emitChange(true, 'edit-audio-src', this);
                }
            );
        } else if (action === 'linkAudio') {
            this.BAPI_PE.popoverManager.showLink(
                buttonElement,
                this.properties.href,
                (value) => {
                    this.properties.href = value || '';
                    this._renderContent();
                    this.BAPI_PE.emitChange(true, 'edit-audio-link', this);
                }
            );
        }
    }
}

window['registerBlock'](AudioBlock);