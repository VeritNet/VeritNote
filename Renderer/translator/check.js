const ts = require('typescript');
const config = require('./config.json');

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

            if (baseClassName && config.allowedBaseClasses.includes(baseClassName)) {
                targetClass = node;
            }
        }
    });

    if (!targetClass) {
        throw new Error(`No valid class extending ${config.allowedBaseClasses.join(', ')} found (abstract classes are ignored).`);
    }

    const className = targetClass.name.text;

    // 3. 检查命名规范 (首字母大写，以 Block 结尾)
    if (!/^[A-Z]\w*Block$/.test(className)) {
        throw new Error(`Class name "${className}" is invalid. It must start with a capital letter and end with "Block".`);
    }

    // 4. 检查成员变量
    const propertyMap = new Map();

    for (const member of targetClass.members) {
        if (ts.isPropertyDeclaration(member)) {
            const propName = member.name.getText(sourceFile);
            const isStatic = member.modifiers && member.modifiers.some(m => m.kind === ts.SyntaxKind.StaticKeyword);

            propertyMap.set(propName, { isStatic, node: member });
        }
    }

    // 检查必须存在的静态变量
    for (const reqProp of config.requiredStaticOverrides) {
        const propInfo = propertyMap.get(reqProp);
        if (!propInfo) {
            throw new Error(`Missing required property: "${reqProp}". It must be defined in class ${className}.`);
        }
        if (!propInfo.isStatic) {
            throw new Error(`Property "${reqProp}" in class ${className} MUST be static. (Found instance property instead, which causes ambiguity).`);
        }
    }

    // 检查可选的静态变量（如果存在，必须是 static）
    for (const optProp of config.optionalStaticOverrides) {
        const propInfo = propertyMap.get(optProp);
        if (propInfo && !propInfo.isStatic) {
            throw new Error(`Optional property "${optProp}" in class ${className} was found, but it is NOT static. Subclass instance variables cannot share names with base class static variables.`);
        }
    }

    return targetClass;
}

module.exports = { checkFile };