// cli.js
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const { generateExterns, getGeneratedExterns } = require('./generate_externs');

function printUsage() {
    console.error("Usage: node cli.js <mode> [options]");
    console.error("\nAvailable modes:");
    console.error("  generate-externs --project <path/to/tsconfig.json> --out <path/to/externs.js>");
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

        // 为 .d.ts 文件生成 externs
        if (sourceFile.isDeclarationFile) {
            const externOutput = generateExterns(typeChecker, sourceFile);
            if (externOutput.trim() !== '') {
                externsOutputs[sourceFile.fileName] = externOutput;
            }
        }
    }

    // 拼接并输出
    const finalExterns = getGeneratedExterns(externsOutputs, path.dirname(tsconfigPath));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, finalExterns, 'utf8');
    console.log(`[Success] Generated closure externs at: ${outputPath}`);
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
        default:
            console.error(`Unknown mode: ${mode}`);
            printUsage();
            process.exit(1);
    }
}

main();