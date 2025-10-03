# cmake/UglifyScripts.cmake

message(STATUS "Running UglifyJS processing in ${PROCESSED_DIR}")
file(GLOB_RECURSE JS_FILES "${PROCESSED_DIR}/*.js")

foreach(JS_FILE ${JS_FILES})
    message(STATUS "Uglifying: ${JS_FILE}")
    
    # *** 核心修改 ***
    # 直接使用 node.exe 调用 uglifyjs 的主脚本，绕过所有环境问题
    execute_process(
        COMMAND "${NODE_CMD}" "${UGLIFYJS_SCRIPT}" "${JS_FILE}" -c -m -o "${JS_FILE}"
        RESULT_VARIABLE result
        OUTPUT_VARIABLE output_msg
        ERROR_VARIABLE error_msg
    )

    if(NOT result EQUAL 0)
        message(FATAL_ERROR "UglifyJS failed for ${JS_FILE}:\n--- STDOUT ---\n${output_msg}\n--- STDERR ---\n${error_msg}\n")
    endif()
endforeach()