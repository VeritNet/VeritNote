# CMake 最低版本要求
cmake_minimum_required(VERSION 3.15)

# 项目名称和 C++ 标准
project(VeritNote LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_definitions(-D_UNICODE -DUNICODE)


# --- 平台检测和设置 ---
if(ANDROID)
    message(STATUS "Configuring for Android")
    # 为 Android 设置特定的编译选项
    set(CMAKE_ANDROID_STL_TYPE "c++_static")
elseif(WIN32)
    message(STATUS "Configuring for Windows")
    enable_language(RC)
    add_definitions(-D_UNICODE -DUNICODE)
    set(CMAKE_WINDOWS_KIND "WINDOWSEXE")
else()
    message(WARNING "Unsupported platform!")
endif()


# --- 路径定义 ---
set(VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vendor")
set(WEB_ASSETS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/webview_ui")
set(PROCESSED_ASSETS_DIR "${CMAKE_CURRENT_BINARY_DIR}/processed_assets")
set(RESOURCE_H "${CMAKE_CURRENT_BINARY_DIR}/resources.h")
set(RESOURCE_RC "${CMAKE_CURRENT_BINARY_DIR}/resources.rc")


# --- 自动化前端资源嵌入 ---

# 这个自定义目标总是会被定义，但它的具体命令取决于主机平台
add_custom_target(preprocess_web_assets ALL) 

# --- 主机工具的查找和配置 ---
# 这段逻辑只在运行CMake的主机是Windows时执行
if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Windows")
    message(STATUS "Host is Windows, configuring web asset preprocessing...")

    # 1. 查找主机上的Node.js
    find_program(NODE_EXECUTABLE node NO_CMAKE_FIND_ROOT_PATH)
    if(NOT NODE_EXECUTABLE)
        message(FATAL_ERROR "node.exe not found. Please ensure Node.js is installed and in your PATH.")
    endif()
    message(STATUS "Found Node.js executable: ${NODE_EXECUTABLE}")

    # 2. 查找主机上的UglifyJS
    find_file(UGLIFYJS_DEFAULT_SCRIPT_PATH
        NAMES uglifyjs # 脚本名通常就是 uglifyjs
        PATHS
            "$ENV{APPDATA}/npm/node_modules/uglify-js/bin" # 全局安装 (Windows)
        NO_CMAKE_FIND_ROOT_PATH
        NO_DEFAULT_PATH
    )
    # 注意：我们保留了set和if的逻辑，但让find_file更精确
    set(VERITNOTE_UGLIFYJS_SCRIPT_PATH "${UGLIFYJS_DEFAULT_SCRIPT_PATH}"
        CACHE FILEPATH "Path to the main uglifyjs script file.")
    if(NOT VERITNOTE_UGLIFYJS_SCRIPT_PATH) # <-- 【关键修改】检查变量是否为空
        # 如果 find_file 没找到，UGLIFYJS_DEFAULT_SCRIPT_PATH 会是空
        # 我们需要明确处理这种情况
        message(FATAL_ERROR "Could not find uglifyjs script automatically. Searched in common global npm locations. Please run 'npm install -g uglify-js' or specify its location manually using the CMake variable VERITNOTE_UGLIFYJS_SCRIPT_PATH.")
    elseif(NOT EXISTS "${VERITNOTE_UGLIFYJS_SCRIPT_PATH}")
        # 这个检查用于处理用户手动设置了一个错误路径的情况
        message(FATAL_ERROR "UglifyJS script path is set to '${VERITNOTE_UGLIFYJS_SCRIPT_PATH}', but the file does not exist. Please check the path.")
    endif()
    message(STATUS "Using UglifyJS script: ${VERITNOTE_UGLIFYJS_SCRIPT_PATH}")

    # 3. 定义预处理命令
    file(GLOB_RECURSE WEB_ASSETS_SOURCES "${WEB_ASSETS_DIR}/*")
    
    # 使用 add_custom_command 来给之前定义的目标添加具体的构建步骤
    # --- 差异化资源生成 ---
    if(WIN32)
        set(GENERATED_RESOURCE_FILES ${RESOURCE_H} ${RESOURCE_RC})
        set(PLATFORM_FLAG "-DTARGET_IS_WINDOWS=1")
    else()
        # 对于 Android 和其他平台，我们只需要头文件
        set(GENERATED_RESOURCE_FILES ${RESOURCE_H})
        set(PLATFORM_FLAG "-DTARGET_IS_ANDROID=1") # 或者其他你喜欢的名字
    endif()
    add_custom_command(
        TARGET preprocess_web_assets
        PRE_BUILD # 确保在编译任何源文件之前运行
        COMMAND ${CMAKE_COMMAND} -E rm -rf "${PROCESSED_ASSETS_DIR}"
        COMMAND ${CMAKE_COMMAND} -E make_directory "${PROCESSED_ASSETS_DIR}"
        COMMAND ${CMAKE_COMMAND} -E copy_directory "${WEB_ASSETS_DIR}/" "${PROCESSED_ASSETS_DIR}/"
        COMMAND ${CMAKE_COMMAND}
            -D "PROCESSED_DIR=${PROCESSED_ASSETS_DIR}"
            -D "NODE_CMD=${NODE_EXECUTABLE}"
            -D "UGLIFYJS_SCRIPT=${VERITNOTE_UGLIFYJS_SCRIPT_PATH}"
            -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/UglifyScripts.cmake"
        COMMAND ${CMAKE_COMMAND}
            -D "WEB_ASSETS_DIR_SRC=${WEB_ASSETS_DIR}"
            -D "PROCESSED_ASSETS_DIR_DST=${PROCESSED_ASSETS_DIR}"
            -D "RESOURCE_H=${RESOURCE_H}"
            -D "RESOURCE_RC=${RESOURCE_RC}" # 仍然传递路径，但在脚本内部决定是否写入
            ${PLATFORM_FLAG}               # <--- 传递平台标志
            -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/GenerateResources.cmake"
        DEPENDS ${WEB_ASSETS_SOURCES}
        BYPRODUCTS ${GENERATED_RESOURCE_FILES} # <--- 使用变量
        COMMENT "Preprocessing web assets on Windows host for target ${CMAKE_SYSTEM_NAME}..."
    )

elseif(CMAKE_HOST_SYSTEM_NAME STREQUAL "Linux")
    # TODO: 为Linux主机添加工具查找逻辑
    message(WARNING "Web asset preprocessing for Linux host is not yet configured.")

else()
    message(WARNING "Unsupported host system for web asset preprocessing: ${CMAKE_HOST_SYSTEM_NAME}")
endif()


# --- 定义不同平台的源文件 ---

# 1. 平台无关的核心源文件
set(CORE_SOURCES
    src/core/Backend.cpp
)

# 2. Windows 平台专属源文件
set(WINDOWS_SOURCES
    src/platform/windows/Win_Main.cpp
    src/platform/windows/Win_Backend.cpp
    ${RESOURCE_RC} # .rc 文件是 Windows 特有的
)

# 3. Android 平台专属源文件 (目前为空，占位)
set(ANDROID_SOURCES
    src/platform/android/Android_Backend.cpp
    src/platform/android/JNI_Bridge.cpp
)


# --- 添加可执行文件 (仅限 Windows) ---
if(WIN32)
    add_executable(VeritNote WIN32
        ${CORE_SOURCES}
        ${WINDOWS_SOURCES}
    )

    # --- 【修改】更新头文件包含路径 ---
    target_include_directories(VeritNote PUBLIC
        "${CMAKE_CURRENT_BINARY_DIR}" # for resources.h
        "${CMAKE_CURRENT_SOURCE_DIR}/src" # for "include/Backend.h"
        "${VENDOR_DIR}"
        "${VENDOR_DIR}/WebView2/include"
        "${VENDOR_DIR}/wil/include"
    )

    # --- 链接库 (保持不变) ---
    target_link_libraries(VeritNote PRIVATE
        "${VENDOR_DIR}/WebView2/x64/WebView2LoaderStatic.lib"
        user32.lib
        gdi32.lib
        shell32.lib
        version.lib
    )

    # --- 编译和链接选项 (保持不变) ---
    if(MSVC)
        target_compile_options(VeritNote PRIVATE
            $<$<CONFIG:Release>:/O2 /Oi /Ot /GL /Gy /fp:fast /EHsc /GR->
        )
        target_link_options(VeritNote PRIVATE
            $<$<CONFIG:Release>:/LTCG /OPT:REF /OPT:ICF /INCREMENTAL:NO /SUBSYSTEM:WINDOWS,6.00>
        )
        set_target_properties(VeritNote PROPERTIES
            MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>"
        )
        set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} /MT")
        set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} /MTd")
    endif()
elseif(ANDROID)
    # 对于 Android，我们构建一个共享库 (.so)
    # 库的名称 "VeritNote" 必须和 Java/Kotlin 中 System.loadLibrary("VeritNote") 的名称一致
    add_library(VeritNote SHARED
        ${CORE_SOURCES}
        ${ANDROID_SOURCES}
        # <-- JNI_Bridge.cpp 已经通过 ${ANDROID_SOURCES} 变量添加进来了
    )
    
    # 链接 Android 平台必需的库
    target_link_libraries(VeritNote PRIVATE
        log     # 用于 android/log.h 的 __android_log_print
        android # Android NDK 支持库
    )
    
    # 为 Android 目标添加 include 目录
    target_include_directories(VeritNote PUBLIC
        "${CMAKE_CURRENT_BINARY_DIR}"     # <--- 为 resources.h 添加路径
        "${CMAKE_CURRENT_SOURCE_DIR}/src" # for "include/Backend.h"
        "${VENDOR_DIR}"
        # Android Backend 可能需要 JNI.h
        # NDK 会自动处理 include 路径，通常不需要手动添加
    )
endif()

# 建立依赖关系
add_dependencies(VeritNote preprocess_web_assets)


# 告诉 VS 在项目文件浏览器中显示前端文件 (保持不变)
file(GLOB_RECURSE UI_FILES "webview_ui/*")
source_group("webview_ui" FILES ${UI_FILES})