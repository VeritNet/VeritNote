/**
 * @fileoverview 临时解决方案，未来应由各自模块声明自身的导出类型
 */

import { Editor } from './editor.js';

declare global {
    interface Window {
        blockRegistry: Map<string, typeof Block>;
        [key: string]: any;
    }

    var chrome: {
        webview?: {
            postMessage?: (message: any) => void;
            [key: string]: any;
        }
    };

    /**
     * VeritNote C++ 交互关键词 Payload
     */
    var payload: {
        path?: string;
        success?: boolean;
        error?: string;
        quoteBlockId?: string;
        dataBlockId?: string;
        content?: {
            presets?: Array<{
                id: string | null;
                type: string | null;
                name: string | null;
            }>;
            [key: string]: any;
        };
        config?: any;
        [key: string]: any;
    };

    /**
     * 核心 Block 基类
     */
    class Block {
        constructor(data: any, editor: Editor);

        get data(): object;

        toolbarButtons(): Array<{
            icon?: string;
            title: string;
            action: string;
            arg?: string;
            html: string;
        }>;

        handleToolbarAction(action: string, buttonElement?: HTMLElement): void;
        syncContentFromDOM(): void;
        render(): HTMLElement;
        focus(): void;
        onInput(e: InputEvent): void;
        onKeyDown(e: KeyboardEvent): void;
        renderDetailsPanel(): string;
        onDetailsPanelOpen(container: HTMLElement): void;
        getExportScripts(exportContext: any): string | null;

        // --- 静态属性 (Static Properties) ---
        static canBeToggled: boolean;
        static previewExclusionSelectors: string[];
        static exportExclusionSelectors: string[];
        static type: string;
        static icon: string;
        static label: string;
        static description: string;
        static keywords: string[];

        static get requiredExportLibs(): string[];

        // --- 实例属性 (Instance Properties) ---
        exportReadyPromise: Promise<any>;

        id: string;
        type: string;
        label?: string;
        description?: string;
        keywords?: string[];

        element: HTMLElement | null;
        content: string | null;

        /**
         * Properties 被声明为特定的解构，以防止 GCC 破坏如 referenceLink, width, presetId 等键名
         */
        properties: {
            referenceLink?: any;
            width?: any;
            presetId?: string; // 来源于 DataBlock.properties.presetId
            customCSS?: Array<{ selector: string; rules: Array<{ prop: string; val: string }> }>;
            [key: string]: any;
        };

        contentElement: HTMLElement | null;
        childrenContainer: HTMLElement | null;
        children: Block[];
        parent?: Block;
    }

    /**
     * 文本块
     */
    class TextBlock extends Block { }

    /**
     * 数据视图块
     */
    class DataBlock extends Block {
        /**
         * 缓存的数据库 JSON 数据
         */
        _dbJsonCache: any;

        /**
         * @param preset 当前选中的 preset 视图数据
         * @param markDirtyCallback 标记数据脏状态的回调
         */
        renderPresetConfigPanel(
            preset: object,
            markDirtyCallback: Function
        ): Promise<HTMLElement>;
    }
}