# CMake 最低版本要求
cmake_minimum_required(VERSION 3.15)

# 项目名称和 C++ 标准
project(VeritNote LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_definitions(-D_UNICODE -DUNICODE)
set(CMAKE_WINDOWS_KIND "WINDOWSEXE")


# 定义 Vendor 目录
set(VENDOR_DIR "${CMAKE_CURRENT_SOURCE_DIR}/vendor")

# 添加可执行文件
add_executable(VeritNote WIN32
    src/main.cpp
 "src/Backend.cpp")

set_target_properties(VeritNote PROPERTIES
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>"
)

if(MSVC)
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} /MT")
    set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} /MTd")
endif()

# --- 包含所有第三方库头文件 ---
set(WebView2_INCLUDE_DIR "${VENDOR_DIR}/WebView2/include")
set(WIL_INCLUDE_DIR "${VENDOR_DIR}/wil/include") # <--- 新增 WIL 的路径

# 检查依赖文件是否存在
if (NOT EXISTS "${WebView2_INCLUDE_DIR}")
    message(FATAL_ERROR "WebView2 SDK include directory not found. Please check the path: ${WebView2_INCLUDE_DIR}")
endif()
if (NOT EXISTS "${WIL_INCLUDE_DIR}")
    message(FATAL_ERROR "WIL include directory not found. Please check the path: ${WIL_INCLUDE_DIR}")
endif()

# 为项目添加所有头文件目录
target_include_directories(VeritNote PUBLIC
    "${VENDOR_DIR}"             # for nlohmann/json.hpp
    "${WebView2_INCLUDE_DIR}"   # for WebView2.h
    "${WIL_INCLUDE_DIR}"        # for wil/com.h  <--- 新增
)


# --- 链接所有库 ---
# 注意: 官方SDK包的 lib 路径可能是 build/native/x64/。请确保你的路径正确。
set(WebView2_LIBRARY_PATH "${VENDOR_DIR}/WebView2/x64/WebView2LoaderStatic.lib")

if (NOT EXISTS "${WebView2_LIBRARY_PATH}")
    message(FATAL_ERROR "WebView2 static library not found. Please check the path: ${WebView2_LIBRARY_PATH}")
endif()

target_link_libraries(VeritNote PRIVATE
    # 链接你手动指定的 WebView2 静态库
    "${WebView2_LIBRARY_PATH}"
    
    # Windows API 库
    user32.lib
    gdi32.lib
    shell32.lib
    
    # 静态链接 WebView2LoaderStatic.lib 时需要 version.lib
    version.lib
)

# --- 资源文件处理 ---
set(WEB_ASSETS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/webview_ui")
set(DEST_ASSETS_DIR "${CMAKE_BINARY_DIR}/webview_ui")

add_custom_command(
    TARGET VeritNote POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${CMAKE_CURRENT_SOURCE_DIR}/webview_ui"
            "${CMAKE_BINARY_DIR}/webview_ui"
    COMMENT "Copying web assets to build directory"
)

# 告诉 VS 在项目文件浏览器中显示前端文件
file(GLOB_RECURSE UI_FILES "webview_ui/*")
source_group("webview_ui" FILES ${UI_FILES})