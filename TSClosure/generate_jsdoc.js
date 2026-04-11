// generate_jsdoc.js
const ts = require('typescript');
const { typeToClosure } = require('./type.js');

function transformJSDoc(context) {
    return (rootNode) => {
        const sourceFile = rootNode;

        function visit(node) {
            let jsdocLines = [];

            // 1. 处理类的成员变量 (Class Properties)
            if (ts.isPropertyDeclaration(node) && node.type) {
                jsdocLines.push(`@type {${typeToClosure(node.type, sourceFile)}}`);
            }
            // 2. 处理普通变量声明 (Variables)
            else if (ts.isVariableStatement(node)) {
                const decl = node.declarationList.declarations[0];
                if (decl && decl.type) {
                    jsdocLines.push(`@type {${typeToClosure(decl.type, sourceFile)}}`);
                }
            }
            // 3. 处理函数、方法、构造函数 (Functions, Methods, Constructors)
            else if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node)) {
                if (node.parameters && node.parameters.length > 0) {
                    node.parameters.forEach(p => {
                        let t = typeToClosure(p.type, sourceFile);
                        if (p.questionToken) t = `${t}=`;
                        else if (p.dotDotDotToken) t = `...${t}`;

                        let pName = 'arg';
                        if (p.name) {
                            if (ts.isIdentifier(p.name)) {
                                pName = p.name.text || p.name.escapedText;
                            } else {
                                // 当遇到解构参数 (例如 function({a, b}: Config))，Google Closure 也不支持在 JSDoc 中写解构模式
                                // 因此使用索引递增生成合法的占位符，如 arg0, arg1 防止命名冲突
                                pName = `arg${node.parameters.indexOf(p)}`;
                            }
                        }
                        jsdocLines.push(`@param {${t}} ${pName}`);
                    });
                }
                if (node.type && !ts.isConstructorDeclaration(node)) {
                    let retType = typeToClosure(node.type, sourceFile);
                    if (retType !== 'void') {
                        jsdocLines.push(`@return {${retType}}`);
                    }
                }
            }

            // 先遍历所有子节点，这样我们修改的父节点能包含已经被转换过的子节点
            const visitedNode = ts.visitEachChild(node, visit, context);

            // 如果收集到了类型信息，则组装并注入
            if (jsdocLines.length > 0) {
                const commentText = "*\n " + jsdocLines.map(line => "* " + line).join("\n ") + "\n ";

                // 【核心修复】：克隆节点。生成一个允许挂载注释的“虚拟/合成节点”
                // ts.factory.cloneNode 是 TS 4+ 的标准 API，为了兼容老版本加上 fallback
                const newNode = ts.factory ? ts.factory.cloneNode(visitedNode) : ts.getMutableClone(visitedNode);

                // 给新节点加上合成的头部注释
                ts.addSyntheticLeadingComment(
                    newNode,
                    ts.SyntaxKind.MultiLineCommentTrivia, // 生成 /** ... */ 格式的多行注释
                    commentText,
                    true
                );

                // 返回克隆后带着注释的新节点替代旧节点
                return newNode;
            }

            // 如果没有任何变动，直接返回遍历后的结果
            return visitedNode;
        }
        return ts.visitNode(rootNode, visit);
    };
}

function generateJSDocForFile(sourceFile) {
    // 运行 AST 转换器
    const result = ts.transform(sourceFile, [transformJSDoc]);
    const transformedFile = result.transformed[0];

    // 使用 Printer 将修改后的 AST 重新打印为源码文本
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    return printer.printNode(ts.EmitHint.SourceFile, transformedFile, sourceFile);
}

module.exports = {
    generateJSDocForFile
};