# CMake 最低版本要求
cmake_minimum_required(VERSION 3.15)

# 项目名称和 C++ 标准
project(VeritNote LANGUAGES CXX RC)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_definitions(-D_UNICODE -DUNICODE)
set(CMAKE_WINDOWS_KIND "WINDOWSEXE")

# --- 路径定义 ---
set(VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vendor")
set(WEB_ASSETS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/webview_ui")
# 定义处理后资源的存放目录（在构建目录下）
set(PROCESSED_ASSETS_DIR "${CMAKE_CURRENT_BINARY_DIR}/processed_assets")

# --- 准备生成的资源文件路径 ---
set(RESOURCE_H "${CMAKE_CURRENT_BINARY_DIR}/resources.h")
set(RESOURCE_RC "${CMAKE_CURRENT_BINARY_DIR}/resources.rc")


# --- 自动化前端资源嵌入 ---

# 1. 查找 node.exe 和 uglifyjs 的主脚本
find_program(NODE_EXECUTABLE node)
if(NOT NODE_EXECUTABLE)
    message(FATAL_ERROR "node.exe not found. Please ensure Node.js is installed and its path is in the system PATH environment variable.")
endif()
message(STATUS "Found Node.js executable: ${NODE_EXECUTABLE}")


# !! 需要您手动确认此路径 !!
# 尝试在 npm 全局模块的通用位置自动查找 uglifyjs 脚本
find_file(UGLIFYJS_DEFAULT_SCRIPT_PATH
    NAMES uglifyjs
    PATHS "$ENV{APPDATA}/npm/node_modules/uglify-js/bin" # Windows
          "$ENV{HOME}/.nvm/versions/node/v*/lib/node_modules/uglify-js/bin" # Linux/macOS with NVM
          "/usr/local/lib/node_modules/uglify-js/bin" # Linux/macOS global
    NO_DEFAULT_PATH
)

# 定义一个缓存变量，允许用户通过 Preset 或 CMake GUI 覆盖它
set(VERITNOTE_UGLIFYJS_SCRIPT_PATH "${UGLIFYJS_DEFAULT_SCRIPT_PATH}"
    CACHE FILEPATH "Path to the main uglifyjs script file (not the .cmd wrapper).")

# 检查最终确定的路径是否存在
if(NOT EXISTS "${VERITNOTE_UGLIFYJS_SCRIPT_PATH}")
    message(FATAL_ERROR "UglifyJS script not found. Please specify its location using the VERITNOTE_UGLIFYJS_SCRIPT_PATH cache variable in your CMakeUserPresets.json or the CMake GUI. Searched default location: ${UGLIFYJS_DEFAULT_SCRIPT_PATH}")
endif()
message(STATUS "Using UglifyJS script: ${VERITNOTE_UGLIFYJS_SCRIPT_PATH}")


# 2. 查找所有源 webview_ui 文件，用于依赖性检查
file(GLOB_RECURSE WEB_ASSETS_SOURCES "${WEB_ASSETS_DIR}/*")

# 3. 创建一个自定义目标来处理所有前端资源
# 这个目标将负责复制、压缩JS，并生成RC和H文件
add_custom_target(preprocess_web_assets
    
    # 步骤 A: 清理并复制资源到处理目录
    COMMAND ${CMAKE_COMMAND} -E rm -rf "${PROCESSED_ASSETS_DIR}"
    COMMAND ${CMAKE_COMMAND} -E make_directory "${PROCESSED_ASSETS_DIR}"
    COMMAND ${CMAKE_COMMAND} -E copy_directory "${WEB_ASSETS_DIR}/" "${PROCESSED_ASSETS_DIR}/"
    
    # 步骤 B: *** 核心修改 *** 
    # 我们传递 node.exe 和 uglifyjs 脚本的路径给处理脚本
    COMMAND ${CMAKE_COMMAND} 
        -D "PROCESSED_DIR=${PROCESSED_ASSETS_DIR}" 
        -D "NODE_CMD=${NODE_EXECUTABLE}" 
        -D "UGLIFYJS_SCRIPT=${VERITNOTE_UGLIFYJS_SCRIPT_PATH}"
        -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/UglifyScripts.cmake"

    # 步骤 C: 基于处理后的资源，生成 resources.h 和 resources.rc
    COMMAND ${CMAKE_COMMAND} -D "WEB_ASSETS_DIR_SRC=${WEB_ASSETS_DIR}" -D "PROCESSED_ASSETS_DIR_DST=${PROCESSED_ASSETS_DIR}" -D "RESOURCE_H=${RESOURCE_H}" -D "RESOURCE_RC=${RESOURCE_RC}" -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/GenerateResources.cmake"

    # 依赖项：如果源文件发生变化，则重新运行此目标
    DEPENDS ${WEB_ASSETS_SOURCES}
    
    # 注释：告知构建系统这个目标会生成这些文件
    BYPRODUCTS ${RESOURCE_H} ${RESOURCE_RC}

    COMMENT "Preprocessing web assets: copying, uglifying JS, and generating resource files..."
)


# --- 添加可执行文件 ---
add_executable(VeritNote WIN32
    src/main.cpp
    src/Backend.cpp
    ${RESOURCE_RC} # <--- 仍然添加生成的RC文件
)

# 建立依赖关系：VeritNote 依赖于 preprocess_web_assets 的完成
add_dependencies(VeritNote preprocess_web_assets)


if(MSVC)
    target_compile_options(VeritNote PRIVATE
        $<$<CONFIG:Release>:/O2 /Oi /Ot /GL /Gy /fp:fast /EHsc /GR->
    )
    target_link_options(VeritNote PRIVATE
        $<$<CONFIG:Release>:/LTCG /OPT:REF /OPT:ICF /INCREMENTAL:NO /SUBSYSTEM:WINDOWS,6.00>
    )
endif()


set_target_properties(VeritNote PROPERTIES
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>"
)

if(MSVC)
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} /MT")
    set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} /MTd")
endif()

# --- 包含所有第三方库头文件 ---
set(WebView2_INCLUDE_DIR "${VENDOR_DIR}/WebView2/include")
set(WIL_INCLUDE_DIR "${VENDOR_DIR}/wil/include") 

if (NOT EXISTS "${WebView2_INCLUDE_DIR}")
    message(FATAL_ERROR "WebView2 SDK include directory not found. Please check the path: ${WebView2_INCLUDE_DIR}")
endif()
if (NOT EXISTS "${WIL_INCLUDE_DIR}")
    message(FATAL_ERROR "WIL include directory not found. Please check the path: ${WIL_INCLUDE_DIR}")
endif()

# 为项目添加所有头文件目录
target_include_directories(VeritNote PUBLIC
    "${CMAKE_CURRENT_BINARY_DIR}" # <--- 必须包含，为了能找到生成的 resources.h
    "${VENDOR_DIR}"             
    "${WebView2_INCLUDE_DIR}"   
    "${WIL_INCLUDE_DIR}"        
)


# --- 链接所有库 ---
set(WebView2_LIBRARY_PATH "${VENDOR_DIR}/WebView2/x64/WebView2LoaderStatic.lib")

if (NOT EXISTS "${WebView2_LIBRARY_PATH}")
    message(FATAL_ERROR "WebView2 static library not found. Please check the path: ${WebView2_LIBRARY_PATH}")
endif()

target_link_libraries(VeritNote PRIVATE
    "${WebView2_LIBRARY_PATH}"
    user32.lib
    gdi32.lib
    shell32.lib
    version.lib
)

# 告诉 VS 在项目文件浏览器中显示前端文件
file(GLOB_RECURSE UI_FILES "webview_ui/*")
source_group("webview_ui" FILES ${UI_FILES})