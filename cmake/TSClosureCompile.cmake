# cmake/TSClosureCompile.cmake
message(STATUS "[TS Pipeline] Starting TypeScript processing in ${PROCESSED_DIR}")

# 1. 编译前端 components 的 TS 代码 (就地输出 JS 到处理目录)
message(STATUS "[TS Pipeline] Compiling components TypeScript...")
execute_process(
    COMMAND "${TSGO_CMD}.cmd" -p "${PROCESSED_DIR}/components/tsconfig.json"
    WORKING_DIRECTORY "${PROCESSED_DIR}/components"
    RESULT_VARIABLE ts_result
    ERROR_VARIABLE ts_err
)
if(NOT ts_result EQUAL 0)
    message(FATAL_ERROR "[TS Pipeline] Project TS compile failed:\n${ts_err}")
endif()


# 2. 删除 processed_assets 中的所有 .ts 文件 (保留纯净的JS用于后续处理)
file(GLOB_RECURSE TS_FILES "${PROCESSED_DIR}/*.ts")
foreach(TS_FILE ${TS_FILES})
    file(REMOVE "${TS_FILE}")
endforeach()
message(STATUS "[TS Pipeline] Removed raw .ts files from processed assets.")


# 3. 检查 TS_CLOSURE_TOOL_DIR 下是否存在 typescript 模块
if(NOT EXISTS "${TS_CLOSURE_TOOL_DIR}/node_modules/typescript")
    message(STATUS "[TS Pipeline] typescript module not found in ${TS_CLOSURE_TOOL_DIR}, installing...")

    # 执行 npm install typescript
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

# 4. 运行 cli.js 生成 externs.js
# 输入参数使用 SRC 的 tsconfig，输出到 PROCESSED_DIR 供 GCC 读取
set(EXTERNS_OUT "${PROCESSED_DIR}/components/externs.js")
message(STATUS "[TS Pipeline] Generating Closure externs to ${EXTERNS_OUT}...")
execute_process(
    COMMAND ${NODE_CMD} "${TS_CLOSURE_TOOL_DIR}/cli.js" generate-externs --project "${SRC_WEB_ASSETS_DIR}/components/tsconfig.json" --out "${EXTERNS_OUT}"
    RESULT_VARIABLE extern_result
    ERROR_VARIABLE extern_err
)
if(NOT extern_result EQUAL 0)
    message(FATAL_ERROR "[TS Pipeline] externs.js generation failed:\n${extern_err}")
endif()

message(STATUS "[TS Pipeline] TypeScript processing and Externs generation complete.")