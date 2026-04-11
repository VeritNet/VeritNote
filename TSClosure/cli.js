// cli.js
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const { generateExterns, getGeneratedExterns } = require('./generate_externs');
const { generateJSDocForFile } = require('./generate_jsdoc');

function printUsage() {
    console.error("Usage: node cli.js <mode> [options]");
    console.error("\nAvailable modes:");
    console.error("  generate-externs --project <path/to/tsconfig.json> --out <path/to/externs.js> [--allowStructuralType]");
    console.error("  generate-jsdoc   --project <path/to/tsconfig.json> [--outDir <path/to/dir>] [--overwrite]");
}

function handleGenerateExterns(args) {
    const tsconfigIndex = args.indexOf('--project');
    const outIndex = args.indexOf('--out');

    if (tsconfigIndex === -1 || outIndex === -1) {
        printUsage();
        process.exit(1);
    }

    const tsconfigPath = args[tsconfigIndex + 1];
    const outputPath = args[outIndex + 1];
    const allowStructuralType = args.includes('--allowStructuralType');

    // 读取 TSConfig
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
        console.error(ts.formatDiagnostic(configFile.error, {
            getCanonicalFileName: f => f,
            getCurrentDirectory: process.cwd,
            getNewLine: () => '\n'
        }));
        process.exit(1);
    }

    const parsedCommandLine = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath)
    );

    // 创建 TS Program
    const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options);
    const typeChecker = program.getTypeChecker();

    const externsOutputs = {};

    // 遍历所有源码文件
    for (const sourceFile of program.getSourceFiles()) {
        // 忽略 node_modules 和标准库
        if (sourceFile.fileName.includes('node_modules') || program.isSourceFileDefaultLibrary(sourceFile)) {
            continue;
        }

        // 为所有包含 declare 声明的文件生成 externs
        const externOutput = generateExterns(typeChecker, sourceFile, { allowStructuralType });
        if (externOutput.trim() !== '') {
            externsOutputs[sourceFile.fileName] = externOutput;
        }
    }

    // 拼接并输出
    const finalExterns = getGeneratedExterns(externsOutputs, path.dirname(tsconfigPath));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, finalExterns, 'utf8');
    console.log(`[Success] Generated closure externs at: ${outputPath}`);
}


function handleGenerateJSDoc(args) {
    const tsconfigIndex = args.indexOf('--project');
    if (tsconfigIndex === -1) {
        printUsage();
        process.exit(1);
    }

    const tsconfigPath = args[tsconfigIndex + 1];
    const isOverwrite = args.includes('--overwrite');

    // 解析输出目录，不传则默认使用当前命令执行目录下的 ts-jsdoc-out
    let outDir = path.resolve(process.cwd(), './ts-jsdoc-out');
    const outDirIndex = args.indexOf('--outDir');
    if (outDirIndex !== -1 && args[outDirIndex + 1]) {
        outDir = path.resolve(process.cwd(), args[outDirIndex + 1]);
    }

    // 读取并解析 TSConfig
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (configFile.error) {
        console.error(ts.formatDiagnostic(configFile.error, { getCanonicalFileName: f => f, getCurrentDirectory: process.cwd, getNewLine: () => '\n' }));
        process.exit(1);
    }

    const parsedCommandLine = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath)
    );

    const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options);
    const basePath = path.dirname(tsconfigPath);
    let count = 0;

    for (const sourceFile of program.getSourceFiles()) {
        // 忽略 node_modules、标准库，且忽略 .d.ts 文件
        if (sourceFile.fileName.includes('node_modules') || program.isSourceFileDefaultLibrary(sourceFile) || sourceFile.isDeclarationFile) {
            continue;
        }

        const newContent = generateJSDocForFile(sourceFile);

        let outputPath;
        if (isOverwrite) {
            outputPath = sourceFile.fileName;
        } else {
            const relativePath = path.relative(basePath, sourceFile.fileName);
            outputPath = path.join(outDir, relativePath);
        }

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, newContent, 'utf8');
        count++;
    }

    console.log(`[Success] Processed ${count} files. JSDoc generated ${isOverwrite ? 'in-place (overwritten)' : `at: ${outDir}`}`);
}


function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        printUsage();
        process.exit(1);
    }

    const mode = args[0];
    const remainingArgs = args.slice(1);

    switch (mode) {
        case 'generate-externs':
            handleGenerateExterns(remainingArgs);
            break;
        case 'generate-jsdoc':
            handleGenerateJSDoc(remainingArgs);
            break;
        default:
            console.error(`Unknown mode: ${mode}`);
            printUsage();
            process.exit(1);
    }
}

main();