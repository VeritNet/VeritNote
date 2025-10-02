const INHERIT_VALUE = "inherit";

const DEFAULT_PAGE_CONFIG = {
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

// 未来可以添加其他文件类型的默认配置
// const DEFAULT_GRAPH_CONFIG = { ... };

window.DEFAULT_CONFIG = {
    page: DEFAULT_PAGE_CONFIG
    // graph: DEFAULT_GRAPH_CONFIG
};