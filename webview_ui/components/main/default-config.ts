import { FileType } from './file-types.js';

export const INHERIT_VALUE = "inherit";

const DEFAULT_PAGE_CONFIG: Record<string, any> = {
    // CSS Variables (keys match CSS --page- vars without the prefix)
    "font-family-sans": "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", Arial, sans-serif",
    "font-family-monospace": "\"Courier New\", Courier, monospace",
    "background": { "type": "color", "value": "rgb(24, 24, 24)" },
    "text-primary": "#cccccc",
    "text-secondary": "#8c8c8c",
    "text-accent": "#569cd6",
    "bg-highlight": "rgba(86, 156, 214, 0.12)",

    // Non-CSS Settings
    "max-width": "900px",
    "line-height": "1.6"
};

const DEFAULT_DATABASE_CONFIG: Record<string, any> = {
    "p-l-a-c-e-h-o-l-d-e-r": "placeholder",
};

// 未来可以添加其他文件类型的默认配置
// const DEFAULT_GRAPH_CONFIG = { ... };
export const DEFAULT_CONFIG: Partial<Record<FileType/* 将 enum FileType 的值（如'page', 'database'，通过enum的键动态访问）作为Record的键 */, Record<string, any>>> = {
    [FileType.Page]: DEFAULT_PAGE_CONFIG,
    [FileType.Database]: DEFAULT_DATABASE_CONFIG
};
