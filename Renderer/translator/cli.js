const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { checkFile } = require('./check');
const { translateClass } = require('./translate');
const config = require('./config.json');

function loadClassAST(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`Base/Template file not found: ${filePath}`);
    const code = fs.readFileSync(filePath, 'utf-8');
    const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
    let classNode = null;
    ts.forEachChild(sf, node => {
        if (ts.isClassDeclaration(node)) classNode = node;
    });
    return { sf, classNode };
}

function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Usage: node cli.js <file1.ts> <file2.ts> ...");
        process.exit(1);
    }

    // 预加载依赖树
    const globalBaseClasses = new Map();
    try {
        globalBaseClasses.set(config.Base.Class, loadClassAST(config.Base.Path));
        for (const t of config.Templates) {
            globalBaseClasses.set(t.Class, loadClassAST(t.Path));
        }
    } catch (e) {
        console.error("Initialization Error:", e.message);
        process.exit(1);
    }

    const validBlocks = [];

    // 检查所有文件并收集元数据
    for (const filePath of args) {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath)) {
            console.error(`Error: File not found - ${filePath}`);
            continue;
        }

        const code = fs.readFileSync(absolutePath, 'utf-8');
        const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);

        try {
            const { classNode, blockType } = checkFile(sourceFile, filePath);
            validBlocks.push({
                filePath,
                sourceFile,
                classNode,
                className: classNode.name.text,
                blockType
            });
        } catch (error) {
            console.error(`\n[Check Failed in ${filePath}]`);
            console.error(error.message);
            process.exit(1);
        }
    }

    // 统一生成 C++ 代码
    let finalCppCode = `// --- Auto Generated Block Rendering Code ---\n`;
    //finalCppCode += `#include "DomElement.h"\n`;
    //finalCppCode += `#include <nlohmann/json.hpp>\n\n`;

    // 1. 声明全局路由函数
    finalCppCode += `DomElement* RenderBlockRegistry(const nlohmann::json& blockData);\n\n`;

    // 2. 翻译所有类并附加到代码中
    for (const block of validBlocks) {
        try {
            finalCppCode += translateClass(block.classNode, block.sourceFile, globalBaseClasses) + "\n";
        } catch (error) {
            console.error(`\n[Translation Failed in ${block.filePath}]`);
            console.error(error.message);
            process.exit(1);
        }
    }

    // 3. 生成对照表/路由函数实现
    finalCppCode += `// Block Type Registry Router\n`;
    finalCppCode += `DomElement* RenderBlockRegistry(const nlohmann::json& blockData) {\n`;
    finalCppCode += `    std::string type = blockData.value("type", "");\n`;

    for (let i = 0; i < validBlocks.length; i++) {
        const block = validBlocks[i];
        const condition = i === 0 ? "if" : "else if";
        finalCppCode += `    ${condition} (type == "${block.blockType}") {\n`;
        finalCppCode += `        return ${block.className}_Render(blockData);\n`;
        finalCppCode += `    }\n`;
    }

    finalCppCode += `    return nullptr; // Unknown type\n`;
    finalCppCode += `}\n`;

    // 输出最终结果
    console.log("\n--- Generated C++ Code ---");
    console.log(finalCppCode);
    console.log("--------------------------\n");
}

main();