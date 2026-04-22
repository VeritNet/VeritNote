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

    for (const filePath of args) {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath)) {
            console.error(`Error: File not found - ${filePath}`);
            continue;
        }

        const code = fs.readFileSync(absolutePath, 'utf-8');
        
        // 使用 TS 编译器 API 生成 AST
        const sourceFile = ts.createSourceFile(
            filePath,
            code,
            ts.ScriptTarget.Latest,
            true
        );

        console.log(`\n--- Processing: ${filePath} ---`);

        try {
            // 1. 检查阶段
            const targetClassNode = checkFile(sourceFile, filePath);
            console.log("[Check] Passed successfully.");

            // 2. 翻译阶段
            const cppCode = translateClass(targetClassNode, sourceFile, globalBaseClasses);
            
            // 3. 输出结果
            console.log("\n--- Generated C++ Code ---");
            console.log(cppCode);
            console.log("--------------------------\n");

        } catch (error) {
            console.error(`\n[Check/Translate Failed in ${filePath}]`);
            console.error(error.message);
            process.exit(1);
        }
    }
}

main();