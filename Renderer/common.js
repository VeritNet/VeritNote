const ts = require('typescript');

/**
 * 翻译普通的表达式 (如变量访问、加减乘除、三元运算符等)
 * 注意：目前仅提供结构占位，实际逻辑需根据 C++ 侧的基础类型进行完善
 */
function translateExpression(node, sourceFile) {
    if (!node) return "";

    const text = node.getText(sourceFile);

    // 拦截 this.properties 的访问
    if (text.startsWith('this.properties.')) {
        const propKey = text.replace('this.properties.', '');
        return `properties.value("${propKey}", "")`; // 假设使用 nlohmann/json
    }

    if (text === 'this.properties') {
        return 'properties';
    }

    // 字符串字面量
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return `"${node.text}"`;
    }

    // 标识符
    if (ts.isIdentifier(node)) {
        return text;
    }

    // 默认回退（在完善语法树映射前，暂时返回原始文本作为注释）
    return `/* TODO: Translate Expr */ ${text}`;
}

/**
 * 翻译普通的语句 (如 let, const 声明, if 语句, for 循环等)
 */
function translateStatement(node, sourceFile) {
    if (!node) return "";

    // 变量声明 (let/const)
    if (ts.isVariableStatement(node)) {
        const decl = node.declarationList.declarations[0];
        const varName = decl.name.getText(sourceFile);
        const initExpr = translateExpression(decl.initializer, sourceFile);

        // 简单推断 auto
        return `auto ${varName} = ${initExpr};`;
    }

    // If 语句
    if (ts.isIfStatement(node)) {
        const cond = translateExpression(node.expression, sourceFile);
        // 暂时返回注释表示
        return `if (${cond}) { /* TODO: If Block */ }`;
    }

    const text = node.getText(sourceFile);
    return `/* TODO: Translate Stmt */ ${text.split('\n')[0]}`;
}

module.exports = {
    translateExpression,
    translateStatement
};