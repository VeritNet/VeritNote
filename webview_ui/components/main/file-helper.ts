import { DEFAULT_CONFIG } from './default-config.js';
import { INHERIT_VALUE } from './default-config.js';

import { FileType } from '../types.js';


// --- Helper Functions for Path resolution ---

export function makePathRelativeToWorkspace(absolutePath: string) {
    if (!window.workspaceRootPath || !absolutePath || !absolutePath.startsWith(window.workspaceRootPath)) {
        return absolutePath;
    }
    let relative = absolutePath.substring(window.workspaceRootPath.length);
    if (relative.startsWith('\\') || relative.startsWith('/')) {
        relative = relative.substring(1);
    }
    return relative;
};

export function resolveWorkspacePath(path: string) {
    if (!path || !window.workspaceRootPath) {
        return path;
    }
    if (/^([a-zA-Z]:\\|\\\\|\/|https?:\/\/|file:\/\/\/)/.test(path)) {
        return path;
    }
    return [window.workspaceRootPath, path.replace(/\//g, '\\')].join('\\');
};


// --- Helper Functions ---
export function computeFinalConfig(resolvedConfig: Record<string, any>, fileType: FileType) {
    const finalConfig: Record<string, any> = {};

    if (!DEFAULT_CONFIG[fileType]) return {};

    for (const key in DEFAULT_CONFIG[fileType]) {
        const categoryConfig = resolvedConfig[fileType] || {};
        const value = categoryConfig[key];

        if (value && value !== INHERIT_VALUE) {
            finalConfig[key] = value;
        } else {
            finalConfig[key] = DEFAULT_CONFIG[fileType][key];
        }
    }
    return finalConfig;
}


/**
 * 递归遍历树节点，收集指定类型的所有文件
 */
export function collectFilesByType(node: WorkspaceTreeNode, type: FileType, collection: { name: string, path: string }[]) {
    if (!node) return;

    // 如果当前节点匹配类型，加入列表
    // 注意：我们的树节点结构是 { name, path, type, children? }
    if (node.type === type) {
        collection.push({
            name: node.name,
            path: node.path
        });
    }

    // 如果有子节点，递归查找
    if (node.children && node.children.length > 0) {
        node.children.forEach(child => collectFilesByType(child, type, collection));
    }
}