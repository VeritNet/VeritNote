// transform_enum.js
function transformEnumInContent(content) {
    // 匹配带有 @enum 注释的 TS 生成的 enum IIFE 结构
    // Group 1: 完整 JSDoc 注释块 (/** ... @enum ... */)
    // Group 2: export 修饰符 (如果有 ES/TS 导出)
    // Group 3: Enum 名字
    // Group 4: IIFE 内部的代码块
    const enumRegex = /(\/\*\*[\s\S]*?@enum[\s\S]*?\*\/)\s*(export\s+)?var\s+([a-zA-Z_$][0-9a-zA-Z_$]*);\s*\(\s*function\s*\(\s*\3\s*\)\s*\{([\s\S]*?)\}\s*\)\s*\(\s*\3\s*\|\|\s*\(\s*(?:exports\.\3\s*=\s*|[a-zA-Z_$][0-9a-zA-Z_$.]*\s*=\s*)?\3\s*=\s*\{\}\s*\)\s*\)\s*;/g;

    return content.replace(enumRegex, (match, jsdoc, exportModifier, enumName, body) => {
        const members = [];
        // 解析内部成员
        // 兼容单双引号。
        // 数字枚举长这样: EnumName[EnumName["key"] = 0] = "key";
        // 字符串枚举长这样: EnumName["key"] = "value";
        const lineRegex = /\[(?:[a-zA-Z_$][0-9a-zA-Z_$]*\[(["'])([^"']+)\1\]\s*=\s*([^\]]+)|(["'])([^"']+)\4)\]\s*=\s*(.*?);/g;

        let lineMatch;
        while ((lineMatch = lineRegex.exec(body)) !== null) {
            if (lineMatch[2] !== undefined) {
                // 匹配到数字枚举: [EnumName["key"] = 0] = "key"
                members.push(`    "${lineMatch[2]}": ${lineMatch[3]}`);
            } else if (lineMatch[5] !== undefined) {
                // 匹配到字符串枚举: ["key"] = "value"
                members.push(`    "${lineMatch[5]}": ${lineMatch[6]}`);
            }
        }

        const exportPrefix = exportModifier ? 'export ' : '';
        // 组装成 closure compiler 认识的常量对象
        return `${jsdoc}\n${exportPrefix}const ${enumName} = {\n${members.join(',\n')}\n};`;
    });
}

module.exports = {
    transformEnumInContent
};