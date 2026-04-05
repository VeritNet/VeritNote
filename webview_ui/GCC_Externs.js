/**
 * @fileoverview Google Closure Compiler Externs
 * @externs
 */

// 声明全局变量 chrome
/** @type {Object} */
var chrome = {};

// 声明 webview 对象
/** @type {Object} */
chrome.webview = {};

// 声明 postMessage 方法
/**
 * @param {*} message
 * @return {undefined}
 */
chrome.webview.postMessage = function (message) { };


// VeritNote C++ 交互关键词
/** @type {Object<string, *>} */
var payload = {};
payload.path;
payload.success;
payload.error;
payload.quoteBlockId;
payload.dataBlockId;
payload.content.presets = [
    { id: null, type: null, name: null }
];
payload.content;
payload.config;



class Block {
    /**
     * @param {object} data
     * @param {Editor} editor
     */
    constructor(data, editor) {
    }

    /**
     * @returns {object}
     */
    get data() {
    }
    /**
     * @return {{icon: string, title: string, action: string, arg: string, html: string}}
     */
    toolbarButtons() { }
    handleToolbarAction() { }
    syncContentFromDOM() { }
    /**
     * @returns {HTMLElement}
     */
    render() {
    }
    focus() {
    }
    /**
     * @param {InputEvent} e
     */
    onInput(e) {
    }
    /**
     * @param {KeyboardEvent} e
     */
    onKeyDown(e) {
    }
    /**
     * @returns {string}
     */
    renderDetailsPanel() {
    }
    /**
     * @param {HTMLElement} container
     */
    onDetailsPanelOpen(container) {
    }
    /**
     * @param {Object} exportContext
     * @returns {string|null}
     */
    getExportScripts(exportContext) {
    }
    /**
     * @returns {Array<string>}
     */
    static requiredExportLibs() {
    }
}

Block.canBeToggled;
Block.previewExclusionSelectors;
Block.exportExclusionSelectors;
Block.exportReadyPromise;
Block.type;
Block.label;
Block.description;
Block.keywords;
Block.element;
Block.content;
Block.properties;
Block.properties.referenceLink;
Block.properties.width;
Block.contentElement;
Block.childrenContainer;
Block.children;

class TextBlock extends Block { }
class DataBlock extends Block {
    /**
     * @param {object} preset
     * @param {Function} markDirtyCallback
     * @return {Promise<HTMLElement>}
     */
    async renderPresetConfigPanel(preset, markDirtyCallback) {
    }
}
DataBlock._dbJsonCache;
DataBlock.properties.presetId;