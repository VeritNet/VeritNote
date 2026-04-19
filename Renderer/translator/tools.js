import * as ts from 'typescript';

// 驼峰转短横线 (例如 flexDirection -> flex-direction)
export function toKebabCase(str) {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

// 深度解析属性访问 AST，返回路径数组。例如 a.style.flexDirection 返回 ['a', 'style', 'flexDirection']
// 深度解析属性访问 AST，返回路径数组。例如 a.style.flexDirection 返回 ['a', 'style', 'flexDirection']
export function getPropertyPath(node, sourceFile) {
    let path = [];
    let curr = node;
    while (ts.isPropertyAccessExpression(curr) || ts.isElementAccessExpression(curr)) {
        // 遇到 this.xxx 时停止拆分，将其作为一个整体基础变量
        if (ts.isPropertyAccessExpression(curr) && curr.expression.kind === ts.SyntaxKind.ThisKeyword) {
            break;
        }

        if (ts.isPropertyAccessExpression(curr)) {
            path.unshift(curr.name.getText(sourceFile));
        } else {
            // 处理 ['xxx'] 或 ["xxx"] 形式
            path.unshift(curr.argumentExpression.getText(sourceFile).replace(/['"]/g, ''));
        }
        curr = curr.expression;
    }
    // 基础对象 (如 'this.iconElement' 或 'myVar')
    path.unshift(curr.getText(sourceFile));
    return path;
}