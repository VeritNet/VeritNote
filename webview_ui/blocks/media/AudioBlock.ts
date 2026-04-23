// blocks/media/AudioBlock.js
class AudioBlock extends Block {
    static override type = 'audio';
    static override icon = '🎵';
    static override label = 'Audio';
    static override description = 'Embed an audio track or podcast.';
    static override keywords = ['audio', 'sound', 'music', 'mp3', 'podcast'];
    static override canBeToggled = true;

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

    static override getPropertiesSchema() {
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
        while (this.contentElement.firstChild) {
            this.contentElement.removeChild(this.contentElement.firstChild);
        }

        if (!p.src) {
            const placeholder = document.createElement('div');
            placeholder.className = 'media-placeholder audio-placeholder';
            placeholder.textContent = 'Click 🎵 to add an audio file';
            this.contentElement.appendChild(placeholder);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'audio-block-wrapper';

        const deco = document.createElement('div');
        deco.className = 'audio-icon-deco';
        deco.textContent = '🎵';
        wrapper.appendChild(deco);

        const audio = document.createElement('audio');
        audio.src = p.src;
        audio.controls = !!p.controls;
        audio.autoplay = !!p.autoplay;
        audio.loop = !!p.loop;
        audio.muted = !!p.muted;
        wrapper.appendChild(audio);

        if (p.href) {
            const link = document.createElement('a');
            link.href = p.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'audio-link';
            link.title = 'Visit Link';

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '16');
            svg.setAttribute('height', '16');
            svg.setAttribute('viewBox', '0 0 24 24');
            svg.setAttribute('fill', 'none');
            svg.setAttribute('stroke', 'currentColor');
            svg.setAttribute('stroke-width', '2');
            svg.setAttribute('stroke-linecap', 'round');
            svg.setAttribute('stroke-linejoin', 'round');
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
            const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            polyline.setAttribute('points', '15 3 21 3 21 9');
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '10'); line.setAttribute('y1', '14');
            line.setAttribute('x2', '21'); line.setAttribute('y2', '3');

            svg.appendChild(path);
            svg.appendChild(polyline);
            svg.appendChild(line);
            link.appendChild(svg);
            wrapper.appendChild(link);
        }

        this.contentElement.appendChild(wrapper);
    }

    override onInput(e) { /* no-op */ }
    override onKeyDown(e) { /* no-op */ }

    override get toolbarButtons() {
        const buttons = [
            { icon: '🎵', title: 'Set Audio Source', action: 'editAudio' },
            { icon: '🔗', title: 'Set External Link', action: 'linkAudio' }
        ];
        buttons.push(...super.toolbarButtons as any);
        return buttons;
    }

    override handleToolbarAction(action, buttonElement) {
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