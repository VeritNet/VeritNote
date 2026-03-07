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
     * @returns {string}
     */
    getCustomCSSString() {
    }
    /**
     * @param {HTMLElement} blockElement
     * @param {object} options
     * @param {object} imageSrcMap
     * @param {string} pathPrefix
     * @return {Promise<string>}
     */
    async getExportHtml(blockElement, options, imageSrcMap, pathPrefix) {
    }
    /**
     * @returns {string|null}
     */
    static getExportScripts() {
    }
    /**
     * @returns {Array<string>}
     */
    static requiredExportLibs() {
    }
}

Block.canBeToggled;
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
class DataBlock extends Block { }
DataBlock._dbJsonCache;
DataBlock.properties.presetId;
class ParagraphBlock extends TextBlock { }