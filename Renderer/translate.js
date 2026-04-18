const ts = require('typescript');
const common = require('./common');

class ScopeManager {
    constructor() {
        this.scopes = [new Map()]; // 栈顶是当前局部作用域，栈底是全局/类作用域
    }
    pushScope() { this.scopes.push(new Map()); }
    popScope() { this.scopes.pop(); }
    declareVar(name, type, isDomElement = false) {
        this.scopes[this.scopes.length - 1].set(name, { type, isDomElement });
    }
    getVar(name) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            if (this.scopes[i].has(name)) return this.scopes[i].get(name);
        }
        throw new Error(`Translation Error: Variable "${name}" is accessed before definition or not defined in current scope.`);
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
            scopeManager.declareVar(`this.${propName}`, 'Member', propName.toLowerCase().includes('element'));
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
    cppCode += `#include "BlockDomTypes.h"\n`; // 假设的 C++ DOM 结构头文件
    cppCode += `#include <string>\n\n`;

    cppCode += `std::string ${className}_Render(const nlohmann::json& properties) {\n`;
    cppCode += `    // [Virtual DOM Context Initialization]\n`;
    cppCode += `    CppDomElement* contentElement = new CppDomElement("div", "block-content");\n`;

    // 注册内置变量
    scopeManager.declareVar('this.contentElement', 'CppDomElement*', true);
    scopeManager.declareVar('this.properties', 'nlohmann::json');
    scopeManager.declareVar('this.childrenContainer', 'CppDomElement*', true); // 占位，未来处理子块

    // 2. 翻译 _renderContent 函数体
    scopeManager.pushScope();
    cppCode += translateBlock(renderContentMethod.body, sourceFile, scopeManager, customMethods);
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
function translateBlock(blockNode, sourceFile, scope, customMethods) {
    let code = "";
    if (!blockNode || !blockNode.statements) return code;

    for (const statement of blockNode.statements) {
        // --- 核心 DOM 操作拦截逻辑 ---

        if (ts.isExpressionStatement(statement)) {
            const expr = statement.expression;

            // 拦截赋值操作：如 this.contentElement.innerHTML = `...`
            if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
                const leftStr = expr.left.getText(sourceFile);

                // 拦截 innerHTML
                if (leftStr.endsWith('.innerHTML')) {
                    const targetDom = leftStr.replace('.innerHTML', '');
                    // 验证该变量是否存在且为 DOM 元素
                    scope.getVar(targetDom);

                    const rightStr = expr.right.getText(sourceFile);
                    code += `    // [DOM Translator] Parse and attach innerHTML\n`;
                    code += `    ${targetDom}->setInnerHTML(ParseHTMLToCppDom(${rightStr}));\n`;
                    continue;
                }

                // 拦截 style 设置：如 this.contentElement.style.display = 'flex'
                if (leftStr.includes('.style.')) {
                    const parts = leftStr.split('.style.');
                    const targetDom = parts[0];
                    const styleProp = parts[1];
                    scope.getVar(targetDom);

                    code += `    // [DOM Translator] Set Style\n`;
                    code += `    ${targetDom}->setStyle("${styleProp}", ${common.translateExpression(expr.right, sourceFile)});\n`;
                    continue;
                }

                // 拦截普通属性赋值，如 this.iconElement = this.contentElement.querySelector(...)
                if (ts.isPropertyAccessExpression(expr.left) || ts.isIdentifier(expr.left)) {
                    if (expr.right.getText(sourceFile).includes('.querySelector')) {
                        code += `    // [DOM Translator] Query Selector\n`;
                        code += `    ${leftStr} = ${common.translateExpression(expr.right, sourceFile)};\n`;
                        continue;
                    }
                }
            }

            // 拦截方法调用：如 this.someCustomMethod()
            if (ts.isCallExpression(expr)) {
                const callText = expr.expression.getText(sourceFile);
                if (callText.startsWith('this.')) {
                    const methodName = callText.replace('this.', '');
                    if (customMethods.has(methodName)) {
                        code += `    // [Call Custom Method: ${methodName}]\n`;
                        // 递归深入翻译自定义函数
                        scope.pushScope();
                        code += translateBlock(customMethods.get(methodName).body, sourceFile, scope, customMethods);
                        scope.popScope();
                        continue;
                    }
                }
            }
        }

        // --- 其他非 DOM 操作交由 common.js 处理 ---
        code += `    ${common.translateStatement(statement, sourceFile)}\n`;
    }

    return code;
}

module.exports = { translateClass };