# cmake/TSClosureCompile.cmake
message(STATUS "[TS Pipeline] Starting TypeScript processing in ${PROCESSED_DIR}")


# 1. 检查 TS_CLOSURE_TOOL_DIR 下是否存在 typescript 模块
if(NOT EXISTS "${TS_CLOSURE_TOOL_DIR}/node_modules/typescript")
    message(STATUS "[TS Pipeline] typescript module not found in ${TS_CLOSURE_TOOL_DIR}, installing...")

    # 执行 npm install typescript
    message(STATUS "[TS Pipeline][Execute] \"${NPM_CMD}.cmd\" install typescript")
    execute_process(
        COMMAND "${NPM_CMD}.cmd" install typescript
        WORKING_DIRECTORY "${TS_CLOSURE_TOOL_DIR}"
        RESULT_VARIABLE npm_result
        ERROR_VARIABLE npm_err
    )

    if(NOT npm_result EQUAL 0)
        message(FATAL_ERROR "[TS Pipeline] Failed to install typescript via npm:\n${npm_err}\n${npm_result}")
    endif()
    message(STATUS "[TS Pipeline] typescript installed successfully.")
endif()


# 2. 生成JSDoc
message(STATUS "[TS Pipeline] Generating JSDoc...")
message(STATUS "[TS Pipeline][Execute] ${NODE_CMD} \"${TS_CLOSURE_TOOL_DIR}/cli.js\" generate-jsdoc --project \"${PROCESSED_DIR}/components/tsconfig.json\" --overwrite")
execute_process(
    COMMAND ${NODE_CMD} "${TS_CLOSURE_TOOL_DIR}/cli.js" generate-jsdoc --project "${PROCESSED_DIR}/components/tsconfig.json" --overwrite
    RESULT_VARIABLE jsdoc_result
    ERROR_VARIABLE jsdoc_err
)
if(NOT jsdoc_result EQUAL 0)
    message(FATAL_ERROR "[TS Pipeline] JSDoc generation failed:\n${jsdoc_err}")
endif()


# 3.1 编译前端 components 的 TS 代码 (就地输出 JS 到处理目录)
message(STATUS "[TS Pipeline] Compiling components TypeScript...")
message(STATUS "[TS Pipeline][Execute] \"${TSGO_CMD}.cmd\" -p \"${PROCESSED_DIR}/components/tsconfig.json\"")
execute_process(
    COMMAND "${TSGO_CMD}.cmd" -p "${PROCESSED_DIR}/components/tsconfig.json"
    WORKING_DIRECTORY "${PROCESSED_DIR}/components"
    RESULT_VARIABLE ts_result
    ERROR_VARIABLE ts_err
)
if(NOT ts_result EQUAL 0)
    message(FATAL_ERROR "[TS Pipeline] Project TS compile failed:\n${ts_err}")
endif()


# 3.2 编译前端 blocks 的 TS 代码
message(STATUS "[TS Pipeline] Compiling blocks TypeScript...")
if(EXISTS "${PROCESSED_DIR}/blocks/tsconfig.json")
    message(STATUS "[TS Pipeline][Execute] \"${TSGO_CMD}.cmd\" -p \"${PROCESSED_DIR}/blocks/tsconfig.json\"")
    execute_process(
        COMMAND "${TSGO_CMD}.cmd" -p "${PROCESSED_DIR}/blocks/tsconfig.json"
        WORKING_DIRECTORY "${PROCESSED_DIR}/blocks"
        RESULT_VARIABLE ts_blocks_result
        ERROR_VARIABLE ts_blocks_err
    )
    if(NOT ts_blocks_result EQUAL 0)
        message(FATAL_ERROR "[TS Pipeline] Blocks TS compile failed:\n${ts_blocks_err}")
    endif()
else()
    message(WARNING "[TS Pipeline] blocks/tsconfig.json not found, skipping.")
endif()


# 4. 处理 enum 枚举
message(STATUS "[TS Pipeline] Processing enums...")
message(STATUS "[TS Pipeline][Execute] ${NODE_CMD} \"${TS_CLOSURE_TOOL_DIR}/cli.js\" transform-enum --src \"${PROCESSED_DIR}/components/\" --overwrite")
execute_process(
    COMMAND ${NODE_CMD} "${TS_CLOSURE_TOOL_DIR}/cli.js" transform-enum --src "${PROCESSED_DIR}/components/" --overwrite
    RESULT_VARIABLE enum_result
    ERROR_VARIABLE enum_err
)
if(NOT enum_result EQUAL 0)
    message(FATAL_ERROR "[TS Pipeline] Enum processing failed:\n${enum_err}")
endif()


# 5. 运行 cli.js 生成 externs.js
# 输入参数使用 SRC 的 tsconfig，输出到 PROCESSED_DIR 供 GCC 读取
set(EXTERNS_OUT "${PROCESSED_DIR}/components/externs.js")
message(STATUS "[TS Pipeline] Generating Closure externs to ${EXTERNS_OUT}...")
message(STATUS "[TS Pipeline][Execute] ${NODE_CMD} \"${TS_CLOSURE_TOOL_DIR}/cli.js\" generate-externs --project \"${PROCESSED_DIR}/components/tsconfig.json\" --out \"${EXTERNS_OUT}\"")
execute_process(
    COMMAND ${NODE_CMD} "${TS_CLOSURE_TOOL_DIR}/cli.js" generate-externs --project "${PROCESSED_DIR}/components/tsconfig.json" --out "${EXTERNS_OUT}"
    RESULT_VARIABLE extern_result
    ERROR_VARIABLE extern_err
)
if(NOT extern_result EQUAL 0)
    message(FATAL_ERROR "[TS Pipeline] externs.js generation failed:\n${extern_err}")
endif()


# 6. 删除 processed_assets 中的所有 .ts 文件 (保留纯净的JS用于后续处理)
file(GLOB_RECURSE TS_FILES "${PROCESSED_DIR}/*.ts")
foreach(TS_FILE ${TS_FILES})
    file(REMOVE "${TS_FILE}")
endforeach()
message(STATUS "[TS Pipeline] Removed raw .ts files from processed assets.")

message(STATUS "[TS Pipeline] TypeScript processing and Externs generation complete.")