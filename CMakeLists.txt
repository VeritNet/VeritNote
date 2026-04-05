## npm install @typescript/native-preview
## npm install typescript
## npm install google-closure-compiler

# CMake 最低版本要求
cmake_minimum_required(VERSION 3.15)

# 项目名称和 C++ 标准
project(VeritNote LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(CLOSURE_OPTIMIZATION "Enable Advanced JS Optimization" OFF) 

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

# --- 版本信息 ---
# 读取 version.txt，提取 NAME，并生成 version.js
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/version.txt" VERSION_TXT_CONTENT)
string(REGEX MATCH "VERSION=([^\n\r]*)" _VERSION_NUM_LINE "${VERSION_TXT_CONTENT}")
string(REGEX REPLACE "VERSION=" "" VERSION_NUM "${_VERSION_NUM_LINE}")
string(REGEX MATCH "NAME=([^\n\r]*)" _VERSION_NAME_LINE "${VERSION_TXT_CONTENT}")
string(REGEX REPLACE "NAME=" "" VERSION_NAME "${_VERSION_NAME_LINE}")
file(WRITE "${CMAKE_CURRENT_SOURCE_DIR}/webview_ui/components/version.js" "// Auto Generated File & Don't Edit\nwindow.VERITNOTE_VERSION_NAME = \"${VERSION_NAME}\";")


set(VERSION_HEADER "${CMAKE_CURRENT_BINARY_DIR}/version_info.h")
file(WRITE "${VERSION_HEADER}" "#pragma once\n#define APP_VERSION_NAME \"${VERSION_NAME}\"\n#define APP_VERSION_NUM \"${VERSION_NUM}\"\n")

# 生成 Windows 版本资源文件 (仅 Windows UI 显示用)
if(WIN32)
    string(REPLACE "." "," VERSION_COMMA "${VERSION_NUM}") # 将 1.0.0.0 转为 1,0,0,0
    set(VERSION_RC_FILE "${CMAKE_CURRENT_BINARY_DIR}/version_info.rc")
    file(WRITE "${VERSION_RC_FILE}" "
#include <windows.h>
VS_VERSION_INFO VERSIONINFO
FILEVERSION    ${VERSION_COMMA}
PRODUCTVERSION ${VERSION_COMMA}
FILEFLAGSMASK  0x3fL
FILEFLAGS      0x0L
FILEOS         0x40004L
FILETYPE       0x1L
FILESUBTYPE    0x0L
BEGIN
    BLOCK \"StringFileInfo\"
    BEGIN
        BLOCK \"040904b0\"
        BEGIN
            VALUE \"CompanyName\",      \"VeritNet\"
            VALUE \"FileDescription\",  \"VeritNote Main Program\"
            VALUE \"FileVersion\",      \"${VERSION_NUM}\"
            VALUE \"InternalName\",     \"VeritNote\"
            VALUE \"OriginalFilename\", \"VeritNote.exe\"
            VALUE \"ProductName\",      \"VeritNote\"
            VALUE \"ProductVersion\",   \"${VERSION_NAME}\"
        END
    END
    BLOCK \"VarFileInfo\"
    BEGIN
        VALUE \"Translation\", 0x409, 1200
    END
END
")
endif()


# --- 主机工具的统一查找和配置 ---
message(STATUS "Configuring toolchain and web asset preprocessing...")

# 1. 查找 Node.js 和 npm
if(VERITNOTE_NODE_PATH AND EXISTS "${VERITNOTE_NODE_PATH}")
    set(NODE_EXECUTABLE "${VERITNOTE_NODE_PATH}")
else()
    find_program(NODE_EXECUTABLE node NO_CMAKE_FIND_ROOT_PATH)
endif()
if(NOT NODE_EXECUTABLE OR NOT EXISTS "${NODE_EXECUTABLE}")
    message(FATAL_ERROR "Node.js not found! Please define VERITNOTE_NODE_PATH in CMakeUserPresets.json or ensure 'node' is in your PATH.")
endif()
message(STATUS "Using Node.js: ${NODE_EXECUTABLE}")

if(VERITNOTE_NPM_PATH AND EXISTS "${VERITNOTE_NPM_PATH}")
    set(NPM_EXECUTABLE "${VERITNOTE_NPM_PATH}")
else()
    find_program(NPM_EXECUTABLE NAMES npm NO_CMAKE_FIND_ROOT_PATH)
endif()
if(NOT NPM_EXECUTABLE OR NOT EXISTS "${NPM_EXECUTABLE}")
    message(FATAL_ERROR "npm not found! Please define VERITNOTE_NPM_PATH in CMakeUserPresets.json or ensure 'npm' is in your PATH.")
endif()
message(STATUS "Using npm: ${NPM_EXECUTABLE}")

# 2. 查找 TSGO (TS7 编译器)
if(VERITNOTE_TSGO_PATH AND EXISTS "${VERITNOTE_TSGO_PATH}")
    set(TSGO_EXECUTABLE "${VERITNOTE_TSGO_PATH}")
else()
    find_program(TSGO_EXECUTABLE tsgo NO_CMAKE_FIND_ROOT_PATH)
endif()
if(NOT TSGO_EXECUTABLE OR NOT EXISTS "${TSGO_EXECUTABLE}")
    message(FATAL_ERROR "tsgo not found! Please define VERITNOTE_TSGO_PATH in CMakeUserPresets.json or install it globally.")
endif()
message(STATUS "Using tsgo: ${TSGO_EXECUTABLE}")

# 3. 查找 Google Closure Compiler
if(NOT VERITNOTE_CLOSURE_COMPILER_PATH OR NOT EXISTS "${VERITNOTE_CLOSURE_COMPILER_PATH}")
    find_file(CLOSURE_COMPILER_DEFAULT_SCRIPT_PATH
        NAMES cli.js
        PATHS "$ENV{APPDATA}/npm/node_modules/google-closure-compiler"
              "/usr/local/lib/node_modules/google-closure-compiler"
        NO_CMAKE_FIND_ROOT_PATH NO_DEFAULT_PATH
    )
    if(CLOSURE_COMPILER_DEFAULT_SCRIPT_PATH)
        set(VERITNOTE_CLOSURE_COMPILER_PATH "${CLOSURE_COMPILER_DEFAULT_SCRIPT_PATH}" CACHE FILEPATH "Path to GCC" FORCE)
    else()
        message(FATAL_ERROR "google-closure-compiler not found! Please define VERITNOTE_CLOSURE_COMPILER_PATH in CMakeUserPresets.json or install it via npm.")
    endif()
endif()
message(STATUS "Using Closure Compiler: ${VERITNOTE_CLOSURE_COMPILER_PATH}")

# 4. 查找 UPX (占位)
if(VERITNOTE_UPX_PATH AND EXISTS "${VERITNOTE_UPX_PATH}")
    set(UPX_EXECUTABLE "${VERITNOTE_UPX_PATH}")
else()
    find_program(UPX_EXECUTABLE upx NO_CMAKE_FIND_ROOT_PATH)
endif()
if(NOT UPX_EXECUTABLE OR NOT EXISTS "${UPX_EXECUTABLE}")
    message(WARNING "upx not found. Executable packing will be skipped. (Define VERITNOTE_UPX_PATH to enable later)")
else()
    message(STATUS "Using UPX: ${UPX_EXECUTABLE}")
endif()

# --- 前端自动化预处理管道 ---
file(GLOB_RECURSE WEB_ASSETS_SOURCES "${WEB_ASSETS_DIR}/*")

if(WIN32)
    set(GENERATED_RESOURCE_FILES ${RESOURCE_H} ${RESOURCE_RC})
    set(PLATFORM_FLAG "-DTARGET_IS_WINDOWS=1")
else()
    set(GENERATED_RESOURCE_FILES ${RESOURCE_H})
    set(PLATFORM_FLAG "-DTARGET_IS_ANDROID=1")
endif()

# 定义包含TS编译、Externs生成、闭包编译、资源生成的完整工作流
add_custom_command(
    TARGET preprocess_web_assets
    PRE_BUILD
    # 1. 拷贝原始文件到处理目录
    COMMAND ${CMAKE_COMMAND} -E rm -rf "${PROCESSED_ASSETS_DIR}"
    COMMAND ${CMAKE_COMMAND} -E make_directory "${PROCESSED_ASSETS_DIR}"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${WEB_ASSETS_DIR}/" "${PROCESSED_ASSETS_DIR}/"
    
    # 2. 调用 TS 编译和 Externs 生成 模块
    COMMAND ${CMAKE_COMMAND}
        -D "TSGO_CMD=${TSGO_EXECUTABLE}"
        -D "NODE_CMD=${NODE_EXECUTABLE}"
        -D "NPM_CMD=${NPM_EXECUTABLE}"
        -D "SRC_WEB_ASSETS_DIR=${WEB_ASSETS_DIR}"
        -D "PROCESSED_DIR=${PROCESSED_ASSETS_DIR}"
        -D "TS_CLOSURE_TOOL_DIR=${CMAKE_CURRENT_SOURCE_DIR}/TSClosure"
        -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/TSClosureCompile.cmake"
        
    # 3. 调用 JS闭包编译 模块
    COMMAND ${CMAKE_COMMAND}
        -D "PROCESSED_DIR=${PROCESSED_ASSETS_DIR}"
        -D "NODE_CMD=${NODE_EXECUTABLE}"
        -D "CLOSURE_COMPILER_SCRIPT=${VERITNOTE_CLOSURE_COMPILER_PATH}"
        -D "USE_ADVANCED_MODE=${CLOSURE_OPTIMIZATION}"
        -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/JSClosureCompile.cmake"
        
    # 4. 生成 C++ 资源头文件和RC
    COMMAND ${CMAKE_COMMAND}
        -D "WEB_ASSETS_DIR_SRC=${WEB_ASSETS_DIR}"
        -D "PROCESSED_ASSETS_DIR_DST=${PROCESSED_ASSETS_DIR}"
        -D "RESOURCE_H=${RESOURCE_H}"
        -D "RESOURCE_RC=${RESOURCE_RC}"
        ${PLATFORM_FLAG}
        -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/GenerateResources.cmake"
        
    DEPENDS ${WEB_ASSETS_SOURCES}
    BYPRODUCTS ${GENERATED_RESOURCE_FILES}
    COMMENT "Processing Web Assets Resources..."
)


# --- 定义不同平台的源文件 ---

# 1. 平台无关的核心源文件
set(CORE_SOURCES
    src/core/Backend.cpp
)

# 2. Windows 平台专属源文件
set(WINDOWS_SOURCES
    src/platform/windows/Win_Main.cpp
    src/platform/windows/Win_Backend.cpp
    ${RESOURCE_RC}
    ${VERSION_RC_FILE}
)

# 3. Android 平台专属源文件
set(ANDROID_SOURCES
    src/platform/android/Android_Backend.cpp
    src/platform/android/JNI_Bridge.cpp
)


# --- 添加可执行文件 (仅限 Windows) ---
message(STATUS "==== Setting Executable ====")
if(WIN32)
    add_executable(VeritNote WIN32
        ${CORE_SOURCES}
        ${WINDOWS_SOURCES}
    )

    # --- 更新头文件包含路径 ---
    target_include_directories(VeritNote PUBLIC
        "${CMAKE_CURRENT_BINARY_DIR}" # for resources.h
        "${CMAKE_CURRENT_SOURCE_DIR}/src" # for "include/Backend.h"
        "${VENDOR_DIR}"
        "${VENDOR_DIR}/WebView2/include"
        "${VENDOR_DIR}/wil/include"
    )

    # --- 链接库 ---
    target_link_libraries(VeritNote PRIVATE
        "${VENDOR_DIR}/WebView2/x64/WebView2LoaderStatic.lib"
        user32.lib
        gdi32.lib
        shell32.lib
        version.lib
    )

    # --- 编译和链接选项 ---
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
    # 对于 Android，构建一个共享库 (.so)
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