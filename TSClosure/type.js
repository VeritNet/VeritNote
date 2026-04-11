const ts = require('typescript');

// --- Type Translator ---
// 递归解析复杂的 TypeScript 类型并转换为 Closure JSDoc 类型
function typeToClosure(node, sourceFile) {
    if (!node) return '*';

    // 初始化一个全局静态 Printer 和虚拟 SourceFile，提供给复杂类型打印用 (完全无副作用，不依赖真实 AST 关系)
    const printer = ts.createPrinter();
    const dummySf = ts.createSourceFile('dummy.ts', '', ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);

    // 标准安全获取文本方法
    const safeGetText = (n) => {
        if (!n) return '';
        // 1. 标识符直接取自带属性
        if (ts.isIdentifier(n)) return n.text || n.escapedText;
        // 2. 字面量直接取内容
        if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
        // 3. 命名空间路径安全拼接
        if (ts.isQualifiedName(n)) return `${safeGetText(n.left)}.${safeGetText(n.right)}`;

        // 4. 标准方法：其余复杂节点丢给 Printer 解析出干净的字符串
        try {
            return printer.printNode(ts.EmitHint.Unspecified, n, sourceFile || dummySf);
        } catch (e) {
            return 'unknown_type';
        }
    };

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
            const typeName = safeGetText(node.typeName);
            // 处理泛型参数, 例如 Array<{...}> 或 Promise<...>
            if (node.typeArguments && node.typeArguments.length > 0) {
                const args = node.typeArguments.map(n => typeToClosure(n, sourceFile)).join(', ');
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
                    props.push(`${safeGetText(member.name)}: ${t}`);
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


module.exports = {
    typeToClosure
}