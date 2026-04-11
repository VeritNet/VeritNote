import { FileType } from './main.js';

declare global {
    interface WorkspaceTreeNode {
        name: string;
        path: string;
        type: FileType;
        children?: WorkspaceTreeNode[];
    }
}