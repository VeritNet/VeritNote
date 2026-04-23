// blocks/media/VideoBlock.js
class VideoBlock extends Block {
    static override type = 'video';
    static override icon = '🎬';
    static override label = 'Video';
    static override description = 'Embed a video from a URL or local file.';
    static override keywords = ['video', 'vid', 'movie', 'media', 'mp4'];
    static override canBeToggled = true;

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
    }

    static override getPropertiesSchema() {
        return [
            { name: 'src', display: 'Video Source', type: 'text' },
            { name: 'poster', display: 'Poster Image', type: 'text', placeholder: 'Thumbnail URL' },
            { name: 'href', display: 'Link URL', type: 'text', placeholder: 'External link' },

            // 视频播放控制 (Toggle)
            { name: 'controls', display: 'Show Controls', type: 'tgl' },
            { name: 'autoplay', display: 'Autoplay', type: 'tgl' },
            { name: 'loop', display: 'Loop', type: 'tgl' },
            { name: 'muted', display: 'Muted', type: 'tgl' },

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
        while (this.contentElement.firstChild) {
            this.contentElement.removeChild(this.contentElement.firstChild);
        }

        if (!p.src) {
            const placeholder = document.createElement('div');
            placeholder.className = 'media-placeholder video-placeholder';
            placeholder.textContent = 'Click 🎬 to add a video';
            this.contentElement.appendChild(placeholder);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'video-block-wrapper';

        const video = document.createElement('video');
        video.src = p.src;
        video.style.display = 'block';
        video.style.maxWidth = '100%';
        video.style.width = p.width || '100%';
        if (p.height) video.style.height = p.height;
        if (p.objectFit) video.style.objectFit = p.objectFit;
        if (p.borderRadius) video.style.borderRadius = p.borderRadius;

        video.controls = !!p.controls;
        video.autoplay = !!p.autoplay;
        video.loop = !!p.loop;
        video.muted = !!p.muted;
        if (p.poster) video.poster = p.poster;
        
        wrapper.appendChild(video);

        if (p.href) {
            const link = document.createElement('a');
            link.href = p.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'media-external-link video-link';
            link.title = 'Visit Link';

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
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
            svg.appendChild(path); svg.appendChild(polyline); svg.appendChild(line);

            const span = document.createElement('span');
            span.textContent = 'Visit Link';

            link.appendChild(svg);
            link.appendChild(span);
            wrapper.appendChild(link);
        }

        this.contentElement.appendChild(wrapper);
    }

    override onInput(e) { /* no-op */ }
    override onKeyDown(e) { /* no-op */ }

    override get toolbarButtons() {
        const buttons = [
            { icon: '🎬', title: 'Set Video Source', action: 'editVideo' },
            { icon: '🔗', title: 'Set External Link', action: 'linkVideo' }
        ];
        buttons.push(...super.toolbarButtons as any);
        return buttons;
    }

    override handleToolbarAction(action, buttonElement) {
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
}

window['registerBlock'](VideoBlock);