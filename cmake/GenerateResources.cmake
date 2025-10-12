# cmake/GenerateResources.cmake
# ����ű��ڹ���ʱ���У��������� resource.h �� (�����Ҫ) resource.rc

# 1. ��������Դ�ļ���ȷ�����·����ID
file(GLOB_RECURSE ASSET_PATHS_SRC "${WEB_ASSETS_DIR_SRC}/*")

# 2. ����ͷ�ļ�����Դ�ű��Ŀ�ͷ
file(WRITE ${RESOURCE_H} "#pragma once\n\n#include <map>\n#include <string>\n\n")
if(TARGET_IS_WINDOWS)
    file(WRITE ${RESOURCE_RC} "#include \"resources.h\"\n\n")
endif()

# 3. ����ÿ����Դ�ļ�
set(RESOURCE_ID_COUNTER 1000)
set(RESOURCE_MAP_CONTENT "static std::map<std::wstring, int> g_resource_map = {\n")

foreach(ASSET_PATH ${ASSET_PATHS_SRC})
    # �������·��������URL��ID (�ⲿ���߼�������ƽ̨��һ��)
    file(RELATIVE_PATH RELATIVE_ASSET_PATH "${WEB_ASSETS_DIR_SRC}" "${ASSET_PATH}")
    string(REPLACE "\\" "/" URL_PATH "/${RELATIVE_ASSET_PATH}")
    string(TOUPPER ${RELATIVE_ASSET_PATH} ID_NAME)
    string(REGEX REPLACE "[^A-Z0-9]" "_" ID_NAME "IDR_${ID_NAME}")

    # д��ͷ�ļ� (����ƽ̨����Ҫ)
    file(APPEND ${RESOURCE_H} "#define ${ID_NAME} ${RESOURCE_ID_COUNTER}\n")

    # ׼��map���� (����ƽ̨����Ҫ)
    string(REPLACE "\\" "\\\\" URL_PATH_ESCAPED ${URL_PATH})
    set(RESOURCE_MAP_CONTENT "${RESOURCE_MAP_CONTENT}    {L\"${URL_PATH_ESCAPED}\", ${ID_NAME}},\n")

    # --- �������޸ġ�ֻ��Ŀ���� Windows ʱ������ RC �ļ����� ---
    if(TARGET_IS_WINDOWS)
        set(PROCESSED_ASSET_PATH "${PROCESSED_ASSETS_DIR_DST}/${RELATIVE_ASSET_PATH}")
        file(TO_NATIVE_PATH "${PROCESSED_ASSET_PATH}" PROCESSED_ASSET_PATH_RC_TEMP)
        string(REPLACE "\\" "\\\\" PROCESSED_ASSET_PATH_RC "${PROCESSED_ASSET_PATH_RC_TEMP}")
        file(APPEND ${RESOURCE_RC} "${ID_NAME} RCDATA \"${PROCESSED_ASSET_PATH_RC}\"\n")
    endif()

    math(EXPR RESOURCE_ID_COUNTER "${RESOURCE_ID_COUNTER} + 1")
endforeach()

# 4. �����Դӳ��map��д��ͷ�ļ� (����ƽ̨����Ҫ)
set(RESOURCE_MAP_CONTENT "${RESOURCE_MAP_CONTENT}};\n")
file(APPEND ${RESOURCE_H} "\n${RESOURCE_MAP_CONTENT}")

if(TARGET_IS_WINDOWS)
    message(STATUS "Generated Windows resource files: ${RESOURCE_H} and ${RESOURCE_RC}")
else()
    message(STATUS "Generated resource header for Android: ${RESOURCE_H}")
endif()