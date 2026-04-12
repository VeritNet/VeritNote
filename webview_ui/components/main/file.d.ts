import { FileType } from './file-types.js';

declare global {
    interface WorkspaceTreeNode {
        name: string;
        path: string;
        type: FileType;
        children?: WorkspaceTreeNode[];
    }

    /*enum FileType {
        folder = 'folder',
        page = 'page',
        graph = 'graph',
        database = 'database'
    }*/
}