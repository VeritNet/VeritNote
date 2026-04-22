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
    /**
     * @param {any} tsName TypeScript中的名字 (如 'this.iconElement')
     * @param {any} cppName 映射到 C++ 的名字 (如 'iconElement')
     * @param {any} type C++变量类型 (如 'DomElement*' 或 'auto')
     * @param {any} isDomElement 是否是 DOM 元素 (用于特殊处理属性赋值)
     * @param {any} domAlias 如果是 DOM 元素，支持宏别名机制，如 this.contentElement.style 或 this.contentElement.dataset 等
     */
    declareVar(tsName, cppName, type, isDomElement = false, domAlias = null) {
        if (!isDomElement && domAlias) {
            console.error(`Warning: domAlias "${domAlias}" is only applicable for DOM elements.`);
        }
        this.scopes[this.scopes.length - 1].set(tsName, {
            cppName, type, isDomElement, domAlias
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

function translateClass(classNode, sourceFile, globalBaseClasses) {
    const scopeManager = new ScopeManager();
    const className = classNode.name.text;

    let renderContentMethod = null;
    let createWrapper = true; // 默认 true
    let blockType = "";
    const customMethods = new Map();
    const superMethods = new Map(); // 用于存储被当前类覆写的父类方法

    // --- 1.1. 构建继承链 (从顶层基类到当前类) ---
    const inheritanceChain = [];
    let currentBase = null;
    if (classNode.heritageClauses) {
        for (const clause of classNode.heritageClauses) {
            if (clause.token === ts.SyntaxKind.ExtendsKeyword) currentBase = clause.types[0].expression.getText(sourceFile);
        }
    }

    while (currentBase && globalBaseClasses.has(currentBase)) {
        const baseData = globalBaseClasses.get(currentBase);
        inheritanceChain.unshift(baseData); // 顶层类插在前面
        let nextBase = null;
        if (baseData.classNode.heritageClauses) {
            for (const clause of baseData.classNode.heritageClauses) {
                if (clause.token === ts.SyntaxKind.ExtendsKeyword) nextBase = clause.types[0].expression.getText(baseData.sf);
            }
        }
        currentBase = nextBase;
    }

    const allNodesToScan = [
        ...inheritanceChain.map(data => ({ members: data.classNode.members, sf: data.sf, isParent: true })),
        { members: classNode.members, sf: sourceFile, isParent: false }
    ];

    // --- 1.2. 扫描所有层级的类成员 ---
    for (const scanItem of allNodesToScan) {
        for (const member of scanItem.members) {
            // 跳过父类的 private 成员
            if (scanItem.isParent && member.modifiers && member.modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword)) continue;

            if (ts.isPropertyDeclaration(member)) {
                const propName = member.name.getText(scanItem.sf);
                const isStatic = member.modifiers && member.modifiers.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
                if (isStatic) {
                    if (propName === 'createWrapper') {
                        createWrapper = member.initializer.kind === ts.SyntaxKind.TrueKeyword;
                    }
                    if (propName === 'type' && member.initializer && ts.isStringLiteral(member.initializer)) {
                        blockType = member.initializer.text;
                    }

                    // 记录静态变量供 this.constructor 使用 (直接保存字面量源码)
                    // 使用 common.translateExpression 映射静态变量的值
                    // 这样可以确保单引号被统一转换为双引号，且处理了转义和类型转换
                    if (member.initializer) {
                        try {
                            const translatedValue = common.translateExpression(member.initializer, scanItem.sf, scopeManager);
                            scopeManager.declareVar(`STATIC_${propName}`, translatedValue, 'auto');
                        } catch (e) {
                            // 如果是过于复杂的表达式，则降级保留原样
                            scopeManager.declareVar(`STATIC_${propName}`, member.initializer.getText(scanItem.sf), 'auto');
                        }
                    }
                } else {
                    const isDom = propName.toLowerCase().includes('element');
                    scopeManager.declareVar(`this.${propName}`, propName, isDom ? 'DomElement*' : 'auto', isDom);
                }
            } else if (ts.isMethodDeclaration(member)) {
                const methodName = member.name.getText(scanItem.sf);
                if (!scanItem.isParent && methodName === '_renderContent') {
                    renderContentMethod = member;
                } else if (methodName !== '_renderContent') {
                    // 如果子类覆盖了父类方法，将旧方法移动到 superMethods
                    if (!scanItem.isParent && customMethods.has(methodName)) {
                        superMethods.set(methodName, customMethods.get(methodName));
                    }
                    // 绑定方法节点及它所归属的源文件
                    customMethods.set(methodName, { node: member, sf: scanItem.sf });
                }
            }
        }
    }

    if (!renderContentMethod) {
        throw new Error(`Method _renderContent() not found in class ${className}.`);
    }

    // 初始化 C++ 翻译上下文
    let cppCode = `// Generated C++ code for ${className}\n`;
    //cppCode += `#include "DomElement.h"\n`;
    //cppCode += `#include <string>\n\n`;

    cppCode += `std::string ${className}_Render(const std::string& id, const nlohmann::json& properties, const std::string& content) {\n`;
    cppCode += `    // [Virtual DOM Context Initialization]\n`;
    cppCode += `    DomElement* contentElement = new DomElement("div");\n`;
    cppCode += `    contentElement->setAttribute("class", "block-content");\n`;
    cppCode += `    contentElement->setDataset("id", id);\n`;
    cppCode += `    contentElement->setDataset("type", "${blockType}");\n`;

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
    cppCode += translateBlockStatements(renderContentMethod.body.statements, sourceFile, scopeManager, customMethods, superMethods);
    scopeManager.popScope();

    // 3. 组装最终的 HTML 生成逻辑
    cppCode += `\n    // [Final Assembly]\n`;
    cppCode += `    std::string finalHtml = "";\n`;

    if (createWrapper) {
        // 调用 C++ 助手函数，传入 id 和 contentElement 转换后的 HTML
        cppCode += `    finalHtml += CreateBlockWrapper(id, contentElement->toHTML());\n`;
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
function translateBlockStatements(statements, sourceFile, scope, customMethods, superMethods = new Map()) {
    let code = "";
    if (!statements) return code;

    // 定义供 common.js 递归处理 block (如 if/for 内部) 的回调函数
    const processBlock = (stmts, sf, sc) => translateBlockStatements(stmts, sf, sc, customMethods, superMethods);

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

                    // 如果基础变量是 DOM 元素，或是其 style/dataset 的别名
                    if (targetVar) {
                        let isDomContext = targetVar.isDomElement;
                        let effectivePath = path;
                        let cppBaseName = targetVar.cppName;

                        // 别名展开映射
                        if (targetVar.type === 'alias') {
                            isDomContext = true;
                            effectivePath = [targetVar.cppName, targetVar.domAlias, ...path.slice(1)];
                        }

                        if (isDomContext) {
                            const rightCode = common.translateExpression(expr.right, sourceFile, scope);

                            // 1. 禁止 innerHTML 赋值
                            if (effectivePath[1] === 'innerHTML') {
                                throw new Error(`Translation Error: Assigning to innerHTML is strictly forbidden. Use DOM operations instead. Found: ${expr.getText(sourceFile)}`);
                            }

                            // 2. 拦截 style 设置 (如 this.contentElement.style.display = 'flex')
                            if (effectivePath.length === 3 && effectivePath[1] === 'style') {
                                code += `    ${cppBaseName}->setStyle("${tools.toKebabCase(effectivePath[2])}", ${rightCode});\n`;
                                continue;
                            }

                            // 3. 拦截 dataset 设置 (如 element.dataset.foo = ... 或 element.dataset['foo'] = ...)
                            if (effectivePath.length === 3 && effectivePath[1] === 'dataset') {
                                code += `    ${cppBaseName}->setDataset("${tools.toKebabCase(effectivePath[2])}", ${rightCode});\n`;
                                continue;
                            }

                            if (effectivePath.length === 2) {
                                if (effectivePath[1] === 'textContent') {
                                    code += `    ${cppBaseName}->textContent = ${rightCode};\n`;
                                } else if (effectivePath[1] === 'className') {
                                    code += `    ${cppBaseName}->setAttribute("class", ${rightCode});\n`;
                                } else {
                                    // 泛用 HTML 属性兜底 (如 value, id, src 等)
                                    code += `    ${cppBaseName}->setAttribute("${effectivePath[1]}", ${rightCode});\n`;
                                }
                                continue;
                            }
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

                // 4. 自定义方法调用展开 (包含作用域隔离与参数传递)
                if (callText.startsWith('this.') || callText.startsWith('super.')) {
                    const isSuper = callText.startsWith('super.');
                    const methodName = callText.replace(isSuper ? 'super.' : 'this.', '');
                    const targetMethodMap = isSuper ? superMethods : customMethods;

                    if (targetMethodMap.has(methodName)) {
                        code += `    // [Call ${isSuper ? 'Super' : 'Custom'} Method: ${methodName}]\n`;
                        code += `    {\n`; // [关键]: 开启 C++ 局部块级作用域，防止局部变量重名冲突
                        scope.pushScope();

                        const tMethod = targetMethodMap.has(methodName) ? targetMethodMap.get(methodName) : customMethods.get(methodName);

                        // 解析形参并映射实参传递
                        const params = tMethod.node.parameters;
                        const args = expr.arguments;
                        for (let i = 0; i < params.length; i++) {
                            const paramName = params[i].name.getText(tMethod.sf);
                            let argCode = '""';
                            let cppType = "auto";
                            let isDom = false;

                            if (args && args[i]) {
                                const argText = args[i].getText(sourceFile);
                                argCode = common.translateExpression(args[i], sourceFile, scope);
                                // 尝试从实参推断类型和是否为 DOM
                                try {
                                    const srcVar = scope.getVar(argText);
                                    if (srcVar) { cppType = srcVar.type; isDom = srcVar.isDomElement; }
                                } catch (e) {
                                    if (argCode.startsWith('new DomElement')) { cppType = 'DomElement*'; isDom = true; }
                                    else if (argCode.startsWith('nlohmann::json')) cppType = 'nlohmann::json';
                                    else if (argCode.startsWith('"') || argCode.startsWith('std::string')) cppType = 'std::string';
                                }
                            }

                            // 在新的 C++ 块级作用域顶部声明并赋值形参
                            code += `        ${cppType} ${paramName} = ${argCode};\n`;
                            // 注册形参到当前局部作用域
                            scope.declareVar(paramName, paramName, cppType, isDom);
                        }

                        // 递归展开方法体
                        code += translateBlockStatements(tMethod.node.body.statements, tMethod.sf, scope, customMethods, superMethods);

                        scope.popScope();
                        code += `    }\n`; // 结束 C++ 局部块级作用域
                        continue;
                    } else {
                        throw new Error(`Translation Error: Unknown method "${methodName}" called.`);
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