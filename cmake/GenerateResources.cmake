# cmake/GenerateResources.cmake
# 这个脚本在构建时运行，用于生成 resource.h 和 resource.rc

# 1. 查找所有源文件以确定相对路径和ID
file(GLOB_RECURSE ASSET_PATHS_SRC "${WEB_ASSETS_DIR_SRC}/*")

# 2. 生成头文件和资源脚本的开头
file(WRITE ${RESOURCE_H} "#pragma once\n\n#include <map>\n#include <string>\n\n")
file(WRITE ${RESOURCE_RC} "#include \"resources.h\"\n\n")

# 3. 遍历每个资源文件，为它们生成唯一的ID和RC文件中的条目
set(RESOURCE_ID_COUNTER 1000)
set(RESOURCE_MAP_CONTENT "static std::map<std::wstring, int> g_resource_map = {\n")

foreach(ASSET_PATH ${ASSET_PATHS_SRC})
    # 计算相对路径，用于URL和ID
    file(RELATIVE_PATH RELATIVE_ASSET_PATH "${WEB_ASSETS_DIR_SRC}" "${ASSET_PATH}")
    string(REPLACE "\\" "/" URL_PATH "/${RELATIVE_ASSET_PATH}")
    string(TOUPPER ${RELATIVE_ASSET_PATH} ID_NAME)
    string(REGEX REPLACE "[^A-Z0-9]" "_" ID_NAME "IDR_${ID_NAME}")

    # 写入头文件
    file(APPEND ${RESOURCE_H} "#define ${ID_NAME} ${RESOURCE_ID_COUNTER}\n")

    # 准备map内容
    string(REPLACE "\\" "\\\\" URL_PATH_ESCAPED ${URL_PATH})
    set(RESOURCE_MAP_CONTENT "${RESOURCE_MAP_CONTENT}    {L\"${URL_PATH_ESCAPED}\", ${ID_NAME}},\n")

    # --- 核心修复：生成 RC 文件所需的、经过转义的 Windows 路径 ---

    # 1. 构造指向处理后副本的完整路径
    set(PROCESSED_ASSET_PATH "${PROCESSED_ASSETS_DIR_DST}/${RELATIVE_ASSET_PATH}")
    
    # 2. 将路径转换为 Windows 本机格式 (使用单个反斜杠)
    file(TO_NATIVE_PATH "${PROCESSED_ASSET_PATH}" PROCESSED_ASSET_PATH_RC_TEMP)

    # 3. 为 RC 编译器转义所有反斜杠 (将 \ 替换为 \\)
    string(REPLACE "\\" "\\\\" PROCESSED_ASSET_PATH_RC "${PROCESSED_ASSET_PATH_RC_TEMP}")

    # 4. 将最终的、安全的路径写入 RC 文件
    file(APPEND ${RESOURCE_RC} "${ID_NAME} RCDATA \"${PROCESSED_ASSET_PATH_RC}\"\n")

    math(EXPR RESOURCE_ID_COUNTER "${RESOURCE_ID_COUNTER} + 1")
endforeach()

# 4. 完成资源映射map并写入头文件
set(RESOURCE_MAP_CONTENT "${RESOURCE_MAP_CONTENT}};\n")
file(APPEND ${RESOURCE_H} "\n${RESOURCE_MAP_CONTENT}")

message(STATUS "Generated resource files: ${RESOURCE_H} and ${RESOURCE_RC}")