const ts = require('typescript');
const tools = require('./tools');

function translateExpression(node, sourceFile, scope) {
    if (!node) return "";
    const text = node.getText(sourceFile);

    // 1. 尝试直接从 Scope 中匹配已知变量
    try {
        const varInfo = scope.getVar(text);
        return varInfo.cppName;
    } catch (e) { /* 继续解析 */ }

    // 2. 拦截方法调用 (包括 createElement 和 DOM 方法)
    if (ts.isCallExpression(node)) {
        const callExpr = node.expression;

        // 拦截 document.createElement
        if (callExpr.getText(sourceFile) === 'document.createElement') {
            const tagArg = translateExpression(node.arguments[0], sourceFile, scope);
            return `new DomElement(${tagArg})`;
        }

        // 拦截 DOM 实例方法 (如 .hasChildNodes())
        if (ts.isPropertyAccessExpression(callExpr)) {
            const path = tools.getPropertyPath(callExpr, sourceFile);
            const baseVarName = path[0];
            let targetVar;
            try { targetVar = scope.getVar(baseVarName); } catch (e) { }

            if (targetVar && targetVar.isDomElement) {
                if (path[1] === 'hasChildNodes') {
                    return `(!${targetVar.cppName}->children.empty())`;
                }
                // 未来可在此处扩展更多 DOM 读取方法
            }
        }
    }

    // 3. 字面量处理
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return `"${node.text}"`;
    if (ts.isNumericLiteral(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return "true";
    if (node.kind === ts.SyntaxKind.FalseKeyword) return "false";
    if (node.kind === ts.SyntaxKind.NullKeyword) return "nullptr";

    // 4. 模板字符串 (如 `${size}px`)
    if (ts.isTemplateExpression(node)) {
        let result = `std::string("${node.head.text}")`;
        for (const span of node.templateSpans) {
            const exprCode = translateExpression(span.expression, sourceFile, scope);
            result += ` + std::string(${exprCode}) + "${span.literal.text}"`;
        }
        return result;
    }

    // 5. 属性读取与 DOM 拦截 (如 a.b, a.dataset.b)
    // 拦截一元前缀表达式 (如 !myvar)
    if (ts.isPrefixUnaryExpression(node)) {
        const op = ts.tokenToString(node.operator); // e.g., '!'
        const operand = translateExpression(node.operand, sourceFile, scope);
        return `${op}${operand}`;
    }

    // 拦截对象字面量 (如 var a = { style: {test: 'hi'} })
    // C++ 中为了泛用，将其映射为 nlohmann::json 结构
    if (ts.isObjectLiteralExpression(node)) {
        let jsonProps = [];
        for (const prop of node.properties) {
            if (ts.isPropertyAssignment(prop)) {
                const key = prop.name.getText(sourceFile).replace(/['"]/g, '');
                const val = translateExpression(prop.initializer, sourceFile, scope);
                jsonProps.push(`{"${key}", ${val}}`);
            }
        }
        return `nlohmann::json{${jsonProps.join(', ')}}`;
    }

    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const path = tools.getPropertyPath(node, sourceFile);
        const baseVarName = path[0];

        let targetVar;
        try { targetVar = scope.getVar(baseVarName); } catch (e) { }

        // 仅当基础变量确定是 DOM 元素时，才拦截 style/dataset/className
        if (targetVar && targetVar.isDomElement) {
            if (path.length === 3 && path[1] === 'style') {
                return `${targetVar.cppName}->getStyle("${tools.toKebabCase(path[2])}")`;
            }
            if (path.length === 3 && path[1] === 'dataset') {
                return `${targetVar.cppName}->getDataset("${tools.toKebabCase(path[2])}")`;
            }
            if (path.length === 2 && path[1] === 'className') {
                return `${targetVar.cppName}->getAttribute("class")`;
            }
            // 普通 DOM 属性读取 (如 .value, .id)
            if (path.length === 2) {
                return `${targetVar.cppName}->getAttribute("${path[1]}")`;
            }
        }

        // JSON 读取拦截 (支持任意深度的嵌套，如 abc.testa.icon 或 this.properties.iconSize)
        if (targetVar && targetVar.type === 'nlohmann::json') {
            let jsonResult = targetVar.cppName;

            // 1. 遍历并拼接中间路径 (例如 abc.testa.icon 中的 testa -> abc["testa"])
            for (let i = 1; i < path.length - 1; i++) {
                jsonResult += `["${path[i]}"]`;
            }

            // 2. 最后一层使用 .value() 提供默认空字符串，保证 C++ 类型安全
            const lastProp = path[path.length - 1];
            return `${jsonResult}.value("${lastProp}", "")`;
        }

        // --- 普通对象属性访问降级 ---
        if (ts.isPropertyAccessExpression(node)) {
            const leftCode = translateExpression(node.expression, sourceFile, scope);
            const propName = node.name.getText(sourceFile);
            return `${leftCode}.${propName}`; // C++ 结构体或类访问
        }
    }

    // 6. 二元运算符 (加减乘除、比较、逻辑与或)
    if (ts.isBinaryExpression(node)) {
        const left = translateExpression(node.left, sourceFile, scope);
        const right = translateExpression(node.right, sourceFile, scope);
        let op = node.operatorToken.getText(sourceFile);

        // 特殊处理 JS 常用的默认值赋法: p.icon || '💡'
        // 在 C++ 中对 std::string 我们简化为: (a != "" ? a : b)
        if (op === '||') {
            return `(${left} != "" ? ${left} : ${right})`;
        }

        // 将 JS 的严格相等/不等转换为 C++ 标准运算符
        if (op === '===') op = '==';
        if (op === '!==') op = '!=';

        return `(${left} ${op} ${right})`;
    }

    // 7. 三元表达式 (cond ? a : b)
    if (ts.isConditionalExpression(node)) {
        const cond = translateExpression(node.condition, sourceFile, scope);
        const trueExpr = translateExpression(node.whenTrue, sourceFile, scope);
        const falseExpr = translateExpression(node.whenFalse, sourceFile, scope);
        return `(${cond} ? ${trueExpr} : ${falseExpr})`;
    }

    // 8. 括号表达式
    if (ts.isParenthesizedExpression(node)) {
        return `(${translateExpression(node.expression, sourceFile, scope)})`;
    }

    if (ts.isIdentifier(node)) {
        throw new Error(`Translation Error: Unrecognized or undeclared identifier "${text}".`);
    }

    throw new Error(`Translation Error: Unsupported expression type: ${text}`);
}

function translateStatement(node, sourceFile, scope, processBlock) {
    if (!node) return "";

    // 1. 变量声明 (let/const)
    if (ts.isVariableStatement(node)) {
        const decl = node.declarationList.declarations[0];
        const varTsName = decl.name.getText(sourceFile);

        let initExpr = "";
        let inferredType = 'auto';
        let isDom = false;

        if (decl.initializer) {
            initExpr = ` = ${translateExpression(decl.initializer, sourceFile, scope)}`;
            const initText = decl.initializer.getText(sourceFile);

            if (initText === 'this.properties') {
                inferredType = 'nlohmann::json';
            } else if (initExpr.includes('new DomElement')) {
                inferredType = 'DomElement*';
                isDom = true;
            } else if (initExpr.includes('nlohmann::json')) {
                // 识别对象字面量生成的 nlohmann::json
                inferredType = 'nlohmann::json';
            } else {
                // 尝试从赋值来源继承类型信息
                try {
                    const srcVar = scope.getVar(initText);
                    if (srcVar) {
                        inferredType = srcVar.type;
                        isDom = srcVar.isDomElement;
                    }
                } catch (e) { }
            }
        }

        scope.declareVar(varTsName, varTsName, inferredType, isDom);
        return `${inferredType} ${varTsName}${initExpr};`;
    }

    // 2. 独立表达式语句 (如单纯的函数调用)
    if (ts.isExpressionStatement(node)) {
        return `${translateExpression(node.expression, sourceFile, scope)};`;
    }

    // 3. Return 语句
    if (ts.isReturnStatement(node)) {
        const expr = node.expression ? translateExpression(node.expression, sourceFile, scope) : "";
        return `return ${expr};`;
    }

    // 4. If / Else 语句
    if (ts.isIfStatement(node)) {
        const cond = translateExpression(node.expression, sourceFile, scope);
        let code = `if (${cond}) {\n`;

        scope.pushScope();
        if (ts.isBlock(node.thenStatement)) {
            code += processBlock(node.thenStatement.statements, sourceFile, scope);
        } else {
            code += processBlock([node.thenStatement], sourceFile, scope);
        }
        scope.popScope();
        code += `    }`;

        if (node.elseStatement) {
            code += ` else {\n`;
            scope.pushScope();
            if (ts.isBlock(node.elseStatement)) {
                code += processBlock(node.elseStatement.statements, sourceFile, scope);
            } else if (ts.isIfStatement(node.elseStatement)) {
                // 处理 else if
                code += `        ${translateStatement(node.elseStatement, sourceFile, scope, processBlock)}\n`;
            } else {
                code += processBlock([node.elseStatement], sourceFile, scope);
            }
            scope.popScope();
            code += `    }`;
        }
        return code;
    }

    // 5. For 循环 (经典 for 循环)
    if (ts.isForStatement(node)) {
        scope.pushScope(); // 循环自身的块作用域
        const init = node.initializer ? translateStatement(ts.factory.createExpressionStatement(node.initializer), sourceFile, scope, processBlock).replace(';', '') : '';
        const cond = node.condition ? translateExpression(node.condition, sourceFile, scope) : '';
        const inc = node.incrementor ? translateExpression(node.incrementor, sourceFile, scope) : '';

        let code = `for (${init}; ${cond}; ${inc}) {\n`;
        if (ts.isBlock(node.statement)) {
            code += processBlock(node.statement.statements, sourceFile, scope);
        } else {
            code += processBlock([node.statement], sourceFile, scope);
        }
        code += `    }`;
        scope.popScope();
        return code;
    }

    throw new Error(`Translation Error: Unsupported statement type in common.js: ${node.getText(sourceFile)} (Kind: ${node.kind})`);
}

module.exports = {
    translateExpression,
    translateStatement
};