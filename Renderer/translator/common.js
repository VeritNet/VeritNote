const ts = require('typescript');

function translateExpression(node, sourceFile, scope) {
    if (!node) return "";

    const text = node.getText(sourceFile);

    // 检查是否是被 ScopeManager 管理的变量 (例如 this.properties, this.content)
    try {
        const varInfo = scope.getVar(text);
        return varInfo.cppName;
    } catch (e) {
        // 如果不在 scope 中，则继续向下解析
    }

    // 字符串字面量
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return `"${node.text}"`;
    }

    // 数字字面量
    if (ts.isNumericLiteral(node)) {
        return node.text;
    }

    // 标识符 (如果运行到这里，说明它没在 scope 中注册，我们应当抛出错误)
    if (ts.isIdentifier(node)) {
        throw new Error(`Translation Error: Unrecognized or undeclared identifier "${text}".`);
    }

    // 逻辑运算符 (或 ||, 与 &&) - 这是一个占位示例，下一阶段细化
    if (ts.isBinaryExpression(node)) {
        const left = translateExpression(node.left, sourceFile, scope);
        const right = translateExpression(node.right, sourceFile, scope);
        const op = node.operatorToken.getText(sourceFile);
        return `(${left} ${op} ${right})`;
    }

    throw new Error(`Translation Error: Unsupported expression type in common.js: ${text} (Kind: ${node.kind})`);
}

function translateStatement(node, sourceFile, scope) {
    if (!node) return "";

    // 变量声明 (let/const)
    if (ts.isVariableStatement(node)) {
        const decl = node.declarationList.declarations[0];
        const varTsName = decl.name.getText(sourceFile);

        // 注册到 ScopeManager
        scope.declareVar(varTsName, varTsName, 'auto');

        let initExpr = "";
        if (decl.initializer) {
            initExpr = ` = ${translateExpression(decl.initializer, sourceFile, scope)}`;
        }

        return `auto ${varTsName}${initExpr};`;
    }

    // 下一阶段：if, for 等
    throw new Error(`Translation Error: Unsupported statement type in common.js: ${node.getText(sourceFile)} (Kind: ${node.kind})`);
}

module.exports = {
    translateExpression,
    translateStatement
};