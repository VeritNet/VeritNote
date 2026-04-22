const ts = require('typescript');
const config = require('./config.json');


function verifyProperties(propertyMap, className, reqList, optList) {
    for (const reqProp of reqList) {
        const propInfo = propertyMap.get(reqProp);
        if (!propInfo) throw new Error(`Missing required property: "${reqProp}". It must be defined in class ${className}.`);
        if (!propInfo.isStatic) throw new Error(`Property "${reqProp}" in class ${className} MUST be static.`);
    }
    for (const optProp of optList) {
        const propInfo = propertyMap.get(optProp);
        if (propInfo && !propInfo.isStatic) throw new Error(`Optional property "${optProp}" in class ${className} was found, but it is NOT static.`);
    }
}

function checkFile(sourceFile, filename) {
    let targetClass = null;

    // 遍历文件的第一层节点，寻找类声明
    ts.forEachChild(sourceFile, node => {
        if (ts.isClassDeclaration(node)) {
            // 1. 检查是否跳过 abstract 类
            const isAbstract = node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.AbstractKeyword);
            if (isAbstract) return; // Skip abstract classes

            // 2. 检查基类
            let baseClassName = null;
            if (node.heritageClauses) {
                for (const clause of node.heritageClauses) {
                    if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                        baseClassName = clause.types[0].expression.getText(sourceFile);
                    }
                }
            }

            const allowedTemplates = config.Templates.map(t => t.Class);
            if (baseClassName && (baseClassName === config.Base.Class || allowedTemplates.includes(baseClassName))) {
                targetClass = { node, baseClassName };
            }
        }
    });

    if (!targetClass) {
        throw new Error(`No valid block class extending ${config.Base.Class} or defined Templates found (abstract classes are ignored).`);
    }

    const classNode = targetClass.node;
    const className = classNode.name.text;

    // 3. 检查命名规范 (首字母大写，以 Block 结尾)
    if (!/^[A-Z]\w*Block$/.test(className)) {
        throw new Error(`Class name "${className}" is invalid. It must start with a capital letter and end with "Block".`);
    }

    // 4. 检查成员变量
    const propertyMap = new Map();
    for (const member of classNode.members) {
        if (ts.isPropertyDeclaration(member)) {
            const propName = member.name.getText(sourceFile);
            const isStatic = member.modifiers && member.modifiers.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
            propertyMap.set(propName, { isStatic, node: member });
        }
    }

    // 1. 始终执行 Base 约束检查
    verifyProperties(propertyMap, className, config.Base.requiredStaticOverrides, config.Base.optionalStaticOverrides);

    // 2. 如果继承自具体模板，追加执行模板约束检查
    if (targetClass.baseClassName !== config.Base.Class) {
        const templateConfig = config.Templates.find(t => t.Class === targetClass.baseClassName);
        verifyProperties(propertyMap, className, templateConfig.requiredStaticOverrides, templateConfig.optionalStaticOverrides);
    }

    // 提取 blockType 供 CLI 构建对照表
    const typeNode = propertyMap.get('type').node;
    const blockType = typeNode.initializer.text;
    return { classNode, blockType };
}

module.exports = { checkFile };