const ts = require('typescript');
const common = require('./common');
const tools = require('./tools');

class ScopeManager {
    constructor() {
        this.scopes = [new Map()]; // 栈顶是当前局部作用域，栈底是全局/类作用域
    }
    pushScope() {
        this.scopes.push(new Map());
    }
    popScope() {
        this.scopes.pop();
    }

    // tsName: TypeScript中的名字 (如 'this.iconElement')
    // cppName: 映射到 C++ 的名字 (如 'iconElement')
    declareVar(tsName, cppName, type, isDomElement = false) {
        this.scopes[this.scopes.length - 1].set(tsName, {
            cppName, type, isDomElement
        });
    }

    getVar(tsName) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            if (this.scopes[i].has(tsName)) {
                return this.scopes[i].get(tsName);
            }
        }
        throw new Error(`Translation Error: Variable "${tsName}" is accessed before definition or not defined in current scope.`);
    }
}

function translateClass(classNode, sourceFile) {
    const scopeManager = new ScopeManager();
    const className = classNode.name.text;

    let renderContentMethod = null;
    let createWrapper = true; // 默认 true
    const customMethods = new Map();

    // 1. 扫描类成员，记录类作用域变量和方法
    for (const member of classNode.members) {
        if (ts.isPropertyDeclaration(member)) {
            const propName = member.name.getText(sourceFile);
            const isStatic = member.modifiers && member.modifiers.some(m => m.kind === ts.SyntaxKind.StaticKeyword);

            if (isStatic && propName === 'createWrapper') {
                createWrapper = member.initializer.kind === ts.SyntaxKind.TrueKeyword;
            }
            // 记录类的成员变量
            const isDom = propName.toLowerCase().includes('element');
            scopeManager.declareVar(`this.${propName}`, propName, isDom ? 'DomElement*' : 'auto', isDom);
        } else if (ts.isMethodDeclaration(member)) {
            const methodName = member.name.getText(sourceFile);
            if (methodName === '_renderContent') {
                renderContentMethod = member;
            } else {
                customMethods.set(methodName, member);
            }
        }
    }

    if (!renderContentMethod) {
        throw new Error(`Method _renderContent() not found in class ${className}.`);
    }

    // 初始化 C++ 翻译上下文
    let cppCode = `// Generated C++ code for ${className}\n`;
    cppCode += `#include "DomElement.h"\n`;
    cppCode += `#include <string>\n\n`;

    // 增加 const std::string& content 参数
    cppCode += `std::string ${className}_Render(const nlohmann::json& properties, const std::string& content) {\n`;
    cppCode += `    // [Virtual DOM Context Initialization]\n`;
    cppCode += `    DomElement* contentElement = new DomElement("div");\n`;
    cppCode += `    contentElement->setAttribute("class", "block-content");\n`;

    // 注册内置变量 (tsName, cppName, type, isDom)
    scopeManager.declareVar('this.contentElement', 'contentElement', 'DomElement*', true);
    scopeManager.declareVar('this.properties', 'properties', 'nlohmann::json');
    scopeManager.declareVar('this.content', 'content', 'std::string');
    scopeManager.declareVar('this.childrenContainer', 'childrenContainer', 'DomElement*', true);

    // 提前声明类成员变量 (将 this.xxx 映射为 C++ 局部变量)
    for (const member of classNode.members) {
        if (ts.isPropertyDeclaration(member)) {
            const propName = member.name.getText(sourceFile);
            const isStatic = member.modifiers && member.modifiers.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
            if (!isStatic && !['contentElement', 'properties', 'content', 'childrenContainer'].includes(propName)) {
                const isDom = propName.toLowerCase().includes('element');
                const cppType = isDom ? 'DomElement*' : 'auto'; // 简化类型推断
                scopeManager.declareVar(`this.${propName}`, propName, cppType, isDom);
                cppCode += `    ${cppType} ${propName} = ${isDom ? 'nullptr' : '0'}; // Class member mapping\n`;
            }
        }
    }

    // 2. 翻译 _renderContent 函数体
    scopeManager.pushScope();
    cppCode += translateBlockStatements(renderContentMethod.body.statements, sourceFile, scopeManager, customMethods);
    scopeManager.popScope();

    // 3. 组装最终的 HTML 生成逻辑
    cppCode += `\n    // [Final Assembly]\n`;
    cppCode += `    std::string finalHtml = "";\n`;

    if (createWrapper) {
        cppCode += `    finalHtml += "<div class=\\"block-container\\">";\n`;
        cppCode += `    finalHtml += "<div class=\\"block-controls\\"><span class=\\"drag-handle\\">⠿</span></div>";\n`;
        cppCode += `    finalHtml += contentElement->toHTML();\n`;
        cppCode += `    finalHtml += "</div>";\n`;
    } else {
        cppCode += `    finalHtml += contentElement->toHTML();\n`;
    }

    // Custom CSS 附加逻辑 (假设在 C++ 层面 properties["customCSS"] 是可用的)
    cppCode += `\n    // [Custom CSS Injection]\n`;
    cppCode += `    if (properties.contains("customCSS")) {\n`;
    cppCode += `        finalHtml += GenerateCustomCSSStyleTag(properties["customCSS"]);\n`;
    cppCode += `    }\n`;

    cppCode += `\n    delete contentElement;\n`;
    cppCode += `    return finalHtml;\n`;
    cppCode += `}\n`;

    return cppCode;
}

// 遍历和翻译代码块
function translateBlockStatements(statements, sourceFile, scope, customMethods) {
    let code = "";
    if (!statements) return code;

    // 定义供 common.js 递归处理 block (如 if/for 内部) 的回调函数
    const processBlock = (stmts, sf, sc) => translateBlockStatements(stmts, sf, sc, customMethods);

    for (const statement of statements) {
        if (ts.isExpressionStatement(statement)) {
            const expr = statement.expression;

            // 拦截赋值操作
            if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                // --- 基于 AST 的赋值拦截 ---
                if (ts.isPropertyAccessExpression(expr.left) || ts.isElementAccessExpression(expr.left)) {
                    const path = tools.getPropertyPath(expr.left, sourceFile);
                    const baseVarName = path[0];

                    let targetVar;
                    try { targetVar = scope.getVar(baseVarName); } catch (e) { }

                    // 如果基础变量是 DOM 元素，进入泛型 DOM 属性拦截逻辑
                    if (targetVar && targetVar.isDomElement) {
                        const rightCode = common.translateExpression(expr.right, sourceFile, scope);

                        // 1. 禁止 innerHTML 赋值
                        if (path[1] === 'innerHTML') {
                            throw new Error(`Translation Error: Assigning to innerHTML is strictly forbidden. Use DOM operations instead. Found: ${expr.getText(sourceFile)}`);
                        }

                        // 2. 拦截 style 设置 (如 this.contentElement.style.display = 'flex')
                        if (path.length === 3 && path[1] === 'style') {
                            code += `    ${targetVar.cppName}->setStyle("${tools.toKebabCase(path[2])}", ${rightCode});\n`;
                            continue;
                        }

                        // 3. 拦截 dataset 设置 (如 element.dataset.foo = ... 或 element.dataset['foo'] = ...)
                        if (path.length === 3 && path[1] === 'dataset') {
                            code += `    ${targetVar.cppName}->setDataset("${tools.toKebabCase(path[2])}", ${rightCode});\n`;
                            continue;
                        }

                        if (path.length === 2) {
                            if (path[1] === 'textContent') {
                                code += `    ${targetVar.cppName}->textContent = ${rightCode};\n`;
                            } else if (path[1] === 'className') {
                                code += `    ${targetVar.cppName}->setAttribute("class", ${rightCode});\n`;
                            } else {
                                // 泛用 HTML 属性兜底 (如 value, id, src 等)
                                code += `    ${targetVar.cppName}->setAttribute("${path[1]}", ${rightCode});\n`;
                            }
                            continue;
                        }
                    }
                }

                // 普通变量赋值映射
                const leftStr = expr.left.getText(sourceFile);
                let targetCppName;
                try {
                    targetCppName = scope.getVar(leftStr).cppName;
                } catch (e) {
                    throw new Error(`Translation Error: Assignment to undeclared variable "${leftStr}".`);
                }
                code += `    ${targetCppName} = ${common.translateExpression(expr.right, sourceFile, scope)};\n`;
                continue;
            }

            // 拦截方法调用
            if (ts.isCallExpression(expr)) {
                const callText = expr.expression.getText(sourceFile);

                // 1. 拦截 appendChild
                if (callText.endsWith('.appendChild')) {
                    const targetTsName = callText.replace('.appendChild', '');
                    const targetVar = scope.getVar(targetTsName);
                    const childTsName = expr.arguments[0].getText(sourceFile);
                    const childVar = scope.getVar(childTsName);

                    code += `    ${targetVar.cppName}->appendChild(${childVar.cppName});\n`;
                    continue;
                }

                // 2. 拦截 remove
                if (callText.endsWith('.remove')) {
                    const targetTsName = callText.replace('.remove', '');
                    const targetVar = scope.getVar(targetTsName);
                    code += `    ${targetVar.cppName}->removeFromParent();\n`;
                    continue;
                }

                // 3. 拦截 querySelector (抛出错误，因为在纯 C++ DOM 构建树中，不应使用 querySelector，应该直接操作局部变量)
                if (callText.endsWith('.querySelector')) {
                    throw new Error(`Translation Error: DOM querySelector is forbidden in translation logic. Store references in variables during creation. Found: ${callText}`);
                }

                // 4. 自定义方法调用展开
                if (callText.startsWith('this.')) {
                    const methodName = callText.replace('this.', '');
                    if (customMethods.has(methodName)) {
                        code += `    // [Call Custom Method: ${methodName}]\n`;
                        scope.pushScope();
                        // 递归调用替换为 translateBlockStatements
                        code += translateBlockStatements(customMethods.get(methodName).body.statements, sourceFile, scope, customMethods);
                        scope.popScope();
                        continue;
                    } else {
                        throw new Error(`Translation Error: Unknown custom method "${methodName}" called.`);
                    }
                }
            }
        }

        // --- 其他非 DOM 操作交由 common.js 处理 ---
        code += `    ${common.translateStatement(statement, sourceFile, scope, processBlock)}\n`;
    }

    return code;
}

module.exports = { translateClass };