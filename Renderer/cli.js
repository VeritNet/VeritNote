const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const { checkFile } = require('./check');
const { translateClass } = require('./translate');

function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error("Usage: node cli.js <file1.ts> <file2.ts> ...");
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
            const cppCode = translateClass(targetClassNode, sourceFile);
            
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