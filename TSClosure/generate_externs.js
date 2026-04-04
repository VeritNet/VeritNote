// generate_externs.js
const ts = require('typescript');

const PREDECLARED_CLOSURE_EXTERNS_LIST = [
    'exports', 'global', 'module', 'ErrorConstructor', 'Symbol', 'WorkerGlobalScope', 'Window', 'Document'
];

const EXTERNS_HEADER = `/**
 * @externs
 * @suppress {checkTypes,const,duplicate,missingOverride}
 */
`;

function getGeneratedExterns(externs, rootDir) {
    let allExterns = EXTERNS_HEADER;
    for (const fileName of Object.keys(externs)) {
        allExterns += `\n// Generated from: ${fileName}\n`;
        allExterns += externs[fileName];
    }
    return allExterns;
}

// 模块名 Mangling (将路径转换为合法的 JS 标识符)
function moduleNameAsIdentifier(fileName) {
    return fileName.replace(/^.*[/\\]/, '').replace(/\.d\.ts$/, '').replace(/[^a-zA-Z0-9]/g, '_');
}

function generateExterns(typeChecker, sourceFile) {
    let output = '';
    const isExternalModule = ts.isExternalModule(sourceFile);
    let moduleNamespace = isExternalModule ? moduleNameAsIdentifier(sourceFile.fileName) : '';
    let rootNamespace = moduleNamespace;

    const exportAssignment = sourceFile.statements.find(ts.isExportAssignment);
    const hasExportEquals = exportAssignment && exportAssignment.isExportEquals;
    if (hasExportEquals) {
        rootNamespace += '_';
    }

    function emit(str) { output += str; }

    // --- Type Translator ---
    function typeToClosure(node) {
        if (!node) return '*';
        switch (node.kind) {
            case ts.SyntaxKind.StringKeyword: return 'string';
            case ts.SyntaxKind.NumberKeyword: return 'number';
            case ts.SyntaxKind.BooleanKeyword: return 'boolean';
            case ts.SyntaxKind.AnyKeyword: return '*';
            case ts.SyntaxKind.VoidKeyword: return 'void';
            case ts.SyntaxKind.TypeReference:
                const ref = node;
                return ref.typeName.getText();
            case ts.SyntaxKind.ArrayType:
                return `Array<${typeToClosure(node.elementType)}>`;
            case ts.SyntaxKind.UnionType:
                return `(${node.types.map(typeToClosure).join('|')})`;
            case ts.SyntaxKind.FunctionType:
                return 'Function';
            default:
                return '?';
        }
    }

    function writeVariableStatement(name, namespace, value) {
        const qualifiedName = namespace.length > 0 ? namespace.concat([name]).join('.') : name;
        if (namespace.length === 0) emit(`var `);
        emit(qualifiedName);
        if (value) emit(` = ${value}`);
        emit(';\n');
    }

    function writeFunction(name, params, namespace) {
        const paramsStr = params.join(', ');
        if (namespace.length > 0) {
            let fqn = namespace.join('.');
            if (ts.isIdentifier(name)) fqn += `.${name.getText()}`;
            emit(`${fqn} = function(${paramsStr}) {};\n`);
        } else {
            emit(`function ${name.getText()}(${paramsStr}) {}\n`);
        }
    }

    function writeType(decl, namespace) {
        if (!decl.name) return;
        const nameText = decl.name.getText();
        const typeName = namespace.concat([nameText]).join('.');
        if (PREDECLARED_CLOSURE_EXTERNS_LIST.includes(typeName)) return;

        // 生成类或接口构造函数声明
        const isClass = ts.isClassDeclaration(decl);
        emit(`\n/**\n * @${isClass ? 'constructor' : 'record'}\n * @struct\n */\n`);
        writeFunction(decl.name, [], namespace);

        // 遍历属性和方法
        for (const member of decl.members) {
            if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
                if (ts.isIdentifier(member.name)) {
                    let type = typeToClosure(member.type);
                    if (member.questionToken) type = `${type}|undefined`;
                    emit(`/** @type {${type}} */\n`);
                    const isStatic = ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static;
                    emit(`${typeName}${isStatic ? '' : '.prototype'}.${member.name.getText()};\n`);
                }
            } else if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
                if (ts.isIdentifier(member.name)) {
                    const params = member.parameters.map(p => p.name.getText());
                    const isStatic = ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static;
                    const methodNamespace = namespace.concat([nameText]);
                    if (!isStatic) methodNamespace.push('prototype');

                    emit(`/**\n * @return {${typeToClosure(member.type)}}\n */\n`);
                    writeFunction(member.name, params, methodNamespace);
                }
            }
        }
    }

    function writeEnum(decl, namespace) {
        const name = decl.name.getText();
        emit(`\n/** @enum {number} */\n`);
        let members = '';
        for (const member of decl.members) {
            if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
                members += `  ${member.name.getText()}: 1,\n`;
            }
        }
        writeVariableStatement(name, namespace, `{\n${members}}`);
    }

    // --- AST 遍历逻辑 ---
    function visitor(node, namespace) {
        // 遇到全局声明恢复命名空间
        if (ts.isModuleDeclaration(node) && (node.flags & ts.NodeFlags.GlobalAugmentation)) {
            namespace = [];
        }

        switch (node.kind) {
            case ts.SyntaxKind.ClassDeclaration:
            case ts.SyntaxKind.InterfaceDeclaration:
                writeType(node, namespace);
                break;
            case ts.SyntaxKind.VariableStatement:
                const varStmt = node;
                for (const decl of varStmt.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name)) {
                        const name = decl.name.getText();
                        if (PREDECLARED_CLOSURE_EXTERNS_LIST.includes(name)) continue;
                        emit(`/** @type {${typeToClosure(decl.type)}} */\n`);
                        writeVariableStatement(name, namespace);
                    }
                }
                break;
            case ts.SyntaxKind.FunctionDeclaration:
                const fnDecl = node;
                if (fnDecl.name) {
                    const params = fnDecl.parameters.map(p => p.name.getText());
                    emit(`/** @return {${typeToClosure(fnDecl.type)}} */\n`);
                    writeFunction(fnDecl.name, params, namespace);
                }
                break;
            case ts.SyntaxKind.EnumDeclaration:
                writeEnum(node, namespace);
                break;
            case ts.SyntaxKind.ModuleDeclaration:
                const modDecl = node;
                if (modDecl.body) {
                    const modName = modDecl.name.getText().replace(/['"]/g, '');
                    const newNamespace = namespace.concat([modName]);
                    emit('/** @const */\n');
                    writeVariableStatement(modName, namespace, '{}');
                    visitor(modDecl.body, newNamespace);
                }
                break;
            case ts.SyntaxKind.ModuleBlock:
                ts.forEachChild(node, child => visitor(child, namespace));
                break;
        }
    }

    if (isExternalModule) {
        emit(`/** @const */\nvar ${rootNamespace} = {};\n`);
        if (hasExportEquals && exportAssignment) {
            emit(`var ${moduleNamespace} = ${rootNamespace};\n`);
        }
    }

    for (const stmt of sourceFile.statements) {
        // 仅处理 Ambient 声明 (.d.ts 默认全都是，或 .ts 中的 declare)
        const isAmbient = (ts.getCombinedModifierFlags(stmt) & ts.ModifierFlags.Ambient) !== 0;
        if (sourceFile.isDeclarationFile || isAmbient) {
            const startNamespace = isExternalModule ? [rootNamespace] : [];
            visitor(stmt, startNamespace);
        }
    }

    return output;
}

// CommonJS 导出
module.exports = {
    EXTERNS_HEADER,
    getGeneratedExterns,
    generateExterns
};