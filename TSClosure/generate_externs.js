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
    // 递归解析复杂的 TypeScript 类型并转换为 Closure JSDoc 类型
    function typeToClosure(node) {
        if (!node) return '*';
        switch (node.kind) {
            case ts.SyntaxKind.StringKeyword: return 'string';
            case ts.SyntaxKind.NumberKeyword: return 'number';
            case ts.SyntaxKind.BooleanKeyword: return 'boolean';
            case ts.SyntaxKind.AnyKeyword: return '*';
            case ts.SyntaxKind.UnknownKeyword: return '*';
            case ts.SyntaxKind.VoidKeyword: return 'void';
            case ts.SyntaxKind.NullKeyword: return 'null';
            case ts.SyntaxKind.UndefinedKeyword: return 'undefined';
            case ts.SyntaxKind.SymbolKeyword: return 'symbol';
            case ts.SyntaxKind.ObjectKeyword: return 'Object';
            case ts.SyntaxKind.TypeReference:
                const typeName = node.typeName.getText();
                // 处理泛型参数, 例如 Array<{...}> 或 Promise<...>
                if (node.typeArguments && node.typeArguments.length > 0) {
                    const args = node.typeArguments.map(typeToClosure).join(', ');
                    return `${typeName}<${args}>`;
                }
                return typeName;
            case ts.SyntaxKind.ArrayType:
                return `Array<${typeToClosure(node.elementType)}>`;
            case ts.SyntaxKind.UnionType:
                const types = node.types.map(typeToClosure);
                return `(${Array.from(new Set(types)).join('|')})`;
            case ts.SyntaxKind.FunctionType:
                return 'Function';
            case ts.SyntaxKind.TypeLiteral: // 处理 { path?: string, config: any } 等内联对象
                const props = [];
                for (const member of node.members) {
                    if (ts.isPropertySignature(member) && member.name) {
                        let t = typeToClosure(member.type);
                        if (member.questionToken) t = `(${t}|undefined)`;
                        props.push(`${member.name.getText()}: ${t}`);
                    }
                }
                // 如果对象包含属性，则生成 Closure 记录类型，否则返回 Object 兜底
                return props.length > 0 ? `{${props.join(', ')}}` : 'Object';
            case ts.SyntaxKind.TupleType:
                return 'Array'; // GCC 对元组支持有限，用 Array 兜底最安全
            case ts.SyntaxKind.LiteralType:
                if (ts.isStringLiteral(node.literal)) return 'string';
                if (ts.isNumericLiteral(node.literal)) return 'number';
                if (node.literal.kind === ts.SyntaxKind.TrueKeyword || node.literal.kind === ts.SyntaxKind.FalseKeyword) return 'boolean';
                return '*';
            case ts.SyntaxKind.ParenthesizedType:
                return typeToClosure(node.type);
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

    // 核心函数：提取参数和返回类型并输出标准的 JSDoc 注释及函数桩代码
    function writeFunctionFromNode(nameText, node, namespace, extraJsDoc = []) {
        const params = [];
        const jsdoc = [...extraJsDoc];

        // 提取并解析参数
        if (node.parameters) {
            for (const p of node.parameters) {
                const pName = p.name.getText();
                params.push(pName);
                let typeStr = typeToClosure(p.type);
                if (p.questionToken) {
                    typeStr = `${typeStr}=`; // GCC 可选参数语法
                } else if (p.dotDotDotToken) {
                    typeStr = `...${typeStr}`; // GCC Rest 参数语法
                }
                jsdoc.push(`@param {${typeStr}} ${pName}`);
            }
        }

        // 提取返回值
        if (node.type && !extraJsDoc.includes('@constructor')) {
            const retType = typeToClosure(node.type);
            if (retType !== 'void') {
                jsdoc.push(`@return {${retType}}`);
            }
        }

        // 输出 JSDoc 注释块
        if (jsdoc.length > 0) {
            emit(`/**\n`);
            jsdoc.forEach(line => emit(` * ${line}\n`));
            emit(` */\n`);
        }

        const paramsStr = params.join(', ');
        if (namespace && namespace.length > 0) {
            const fqn = namespace.concat([nameText]).join('.');
            emit(`${fqn} = function(${paramsStr}) {};\n`);
        } else {
            emit(`function ${nameText}(${paramsStr}) {}\n`);
        }
    }

    function writeType(decl, namespace) {
        if (!decl.name) return;
        const nameText = decl.name.getText();
        const typeName = namespace.concat([nameText]).join('.');
        if (PREDECLARED_CLOSURE_EXTERNS_LIST.includes(typeName)) return;

        const isClass = ts.isClassDeclaration(decl);

        // 查找显式构造函数以获取准确参数，若无则使用空参数
        const ctor = decl.members.find(ts.isConstructorDeclaration) || { parameters: [] };

        // 声明类/接口的根 (通过构造函数模式)
        emit(`\n`);
        writeFunctionFromNode(nameText, ctor, namespace, [
            isClass ? '@constructor' : '@record',
            '@struct'
        ]);

        // 遍历属性和方法
        for (const member of decl.members) {
            if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) {
                if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
                    let type = typeToClosure(member.type);
                    if (member.questionToken) type = `(${type}|undefined)`;

                    emit(`/** @type {${type}} */\n`);
                    const isStatic = ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static;
                    const target = isStatic ? typeName : `${typeName}.prototype`;
                    emit(`${target}.${member.name.getText()};\n`);
                }
            } else if (ts.isMethodSignature(member) || ts.isMethodDeclaration(member)) {
                if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
                    const isStatic = ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static;
                    const methodNamespace = namespace.concat([nameText]);
                    if (!isStatic) methodNamespace.push('prototype');

                    writeFunctionFromNode(member.name.getText(), member, methodNamespace);
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
                        // 注意这里会自动外包一层 {} 以适配 JSDoc 语法格式，如 /** @type {{a: string}} */
                        emit(`\n/** @type {${typeToClosure(decl.type)}} */\n`);
                        writeVariableStatement(name, namespace);
                    }
                }
                break;
            case ts.SyntaxKind.FunctionDeclaration:
                const fnDecl = node;
                if (fnDecl.name) {
                    writeFunctionFromNode(fnDecl.name.getText(), fnDecl, namespace);
                }
                break;
            case ts.SyntaxKind.EnumDeclaration:
                writeEnum(node, namespace);
                break;
            case ts.SyntaxKind.ModuleDeclaration:
                const modDecl = node;
                if (modDecl.body) {
                    const modName = modDecl.name.getText().replace(/['"]/g, '');
                    // 判断是否为 global (修复 Bug 1)
                    const isGlobal = modName === 'global' || (modDecl.flags & ts.NodeFlags.GlobalAugmentation);

                    if (isGlobal) {
                        // 如果是全局增强，抹除命名空间直接继续解析
                        visitor(modDecl.body, []);
                    } else {
                        const newNamespace = namespace.concat([modName]);
                        emit('\n/** @const */\n');
                        writeVariableStatement(modName, namespace, '{}');
                        visitor(modDecl.body, newNamespace);
                    }
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