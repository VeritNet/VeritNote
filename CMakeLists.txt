# CMake 最低版本要求
cmake_minimum_required(VERSION 3.15)

# 项目名称和 C++ 标准
project(VeritNote LANGUAGES CXX RC)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_definitions(-D_UNICODE -DUNICODE)
set(CMAKE_WINDOWS_KIND "WINDOWSEXE")


# 定义 Vendor 目录
set(VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vendor")
set(WEB_ASSETS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/webview_ui")


# --- 自动化前端资源嵌入 ---
# 1. 读取关键CSS文件的内容
file(READ "${WEB_ASSETS_DIR}/css/style.css" STYLE_CSS_CONTENT)
# 对CSS内容进行转义，以安全地插入到HTML的<style>标签中
string(REPLACE "\\" "\\\\" STYLE_CSS_CONTENT "${STYLE_CSS_CONTENT}")
string(REPLACE "`" "\\`" STYLE_CSS_CONTENT "${STYLE_CSS_CONTENT}")
string(REPLACE "$" "\\$" STYLE_CSS_CONTENT "${STYLE_CSS_CONTENT}")


# 2. 查找 webview_ui 目录下的所有文件
file(GLOB_RECURSE WEB_ASSETS "${WEB_ASSETS_DIR}/*")

# 3. 准备生成的资源文件路径
set(RESOURCE_H "${CMAKE_CURRENT_BINARY_DIR}/resources.h")
set(RESOURCE_RC "${CMAKE_CURRENT_BINARY_DIR}/resources.rc")

# 4. 生成头文件和资源脚本的开头
file(WRITE ${RESOURCE_H} "#pragma once\n\n#include <map>\n#include <string>\n\n")
file(WRITE ${RESOURCE_RC} "#include \"resources.h\"\n\n")

# 5. 遍历每个资源文件，为它们生成唯一的ID和RC文件中的条目
set(RESOURCE_ID_COUNTER 1000)
set(RESOURCE_MAP_CONTENT "static std::map<std::wstring, int> g_resource_map = {\n")

foreach(ASSET_PATH ${WEB_ASSETS})
    file(RELATIVE_PATH RELATIVE_ASSET_PATH "${WEB_ASSETS_DIR}" "${ASSET_PATH}")
    string(REPLACE "\\" "/" URL_PATH "/${RELATIVE_ASSET_PATH}")
    string(TOUPPER ${RELATIVE_ASSET_PATH} ID_NAME)
    string(REGEX REPLACE "[^A-Z0-9]" "_" ID_NAME "IDR_${ID_NAME}")
    file(APPEND ${RESOURCE_H} "#define ${ID_NAME} ${RESOURCE_ID_COUNTER}\n")
    string(REPLACE "\\" "\\\\" URL_PATH_ESCAPED ${URL_PATH})
    set(RESOURCE_MAP_CONTENT "${RESOURCE_MAP_CONTENT}    {L\"${URL_PATH_ESCAPED}\", ${ID_NAME}},\n")

    # --- 核心修改：对HTML文件进行预处理 ---
    string(REPLACE "\\" "/" ASSET_PATH_FOR_CMP ${ASSET_PATH})
    if(ASSET_PATH_FOR_CMP MATCHES ".*/(index|dashboard)\\.html$")
        # 这是我们需要处理的HTML文件
        file(READ "${ASSET_PATH}" HTML_CONTENT)
        # 将外部CSS链接替换为内联<style>标签
        string(REGEX REPLACE "<link rel=\"stylesheet\" href=\"[^\"]*style.css\">"
               "<style>${STYLE_CSS_CONTENT}</style>"
               PROCESSED_HTML_CONTENT "${HTML_CONTENT}")
        
        # 将处理后的HTML内容写入build目录下的一个临时文件
        get_filename_component(FILENAME ${ASSET_PATH} NAME)
        set(TEMP_HTML_PATH "${CMAKE_CURRENT_BINARY_DIR}/${FILENAME}")
        file(WRITE ${TEMP_HTML_PATH} "${PROCESSED_HTML_CONTENT}")

        # 让RC文件指向这个处理过的临时文件
        string(REPLACE "\\" "\\\\" TEMP_HTML_PATH_ESCAPED ${TEMP_HTML_PATH})
        file(APPEND ${RESOURCE_RC} "${ID_NAME} RCDATA \"${TEMP_HTML_PATH_ESCAPED}\"\n")
    else()
        # 对于非HTML文件，或者其他HTML文件，保持原样
        string(REPLACE "\\" "\\\\" ASSET_PATH_ESCAPED ${ASSET_PATH})
        file(APPEND ${RESOURCE_RC} "${ID_NAME} RCDATA \"${ASSET_PATH_ESCAPED}\"\n")
    endif()

    math(EXPR RESOURCE_ID_COUNTER "${RESOURCE_ID_COUNTER} + 1")
endforeach()

# 6. 完成资源映射map并写入头文件
set(RESOURCE_MAP_CONTENT "${RESOURCE_MAP_CONTENT}};\n")
file(APPEND ${RESOURCE_H} "\n${RESOURCE_MAP_CONTENT}")

# --- 添加可执行文件 ---
add_executable(VeritNote WIN32
    src/main.cpp
    src/Backend.cpp
    ${RESOURCE_RC} # <--- 将生成的RC文件添加到编译目标
)

if(MSVC)
    target_compile_options(VeritNote PRIVATE
        $<$<CONFIG:Release>:/O2 /Oi /Ot /GL /Gy /fp:fast /GR->
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

# 检查依赖文件是否存在
if (NOT EXISTS "${WebView2_INCLUDE_DIR}")
    message(FATAL_ERROR "WebView2 SDK include directory not found. Please check the path: ${WebView2_INCLUDE_DIR}")
endif()
if (NOT EXISTS "${WIL_INCLUDE_DIR}")
    message(FATAL_ERROR "WIL include directory not found. Please check the path: ${WIL_INCLUDE_DIR}")
endif()

# 为项目添加所有头文件目录
target_include_directories(VeritNote PUBLIC
    "${CMAKE_CURRENT_BINARY_DIR}" # <--- 新增：为了能找到生成的 resources.h
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

# --- 资源文件处理 (旧逻辑已移除) ---

# 告诉 VS 在项目文件浏览器中显示前端文件 (仍然有用)
file(GLOB_RECURSE UI_FILES "webview_ui/*")
source_group("webview_ui" FILES ${UI_FILES})