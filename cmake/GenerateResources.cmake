# cmake/GenerateResources.cmake
# ����ű��ڹ���ʱ���У��������� resource.h �� resource.rc

# 1. ��������Դ�ļ���ȷ�����·����ID
file(GLOB_RECURSE ASSET_PATHS_SRC "${WEB_ASSETS_DIR_SRC}/*")

# 2. ����ͷ�ļ�����Դ�ű��Ŀ�ͷ
file(WRITE ${RESOURCE_H} "#pragma once\n\n#include <map>\n#include <string>\n\n")
file(WRITE ${RESOURCE_RC} "#include \"resources.h\"\n\n")

# 3. ����ÿ����Դ�ļ���Ϊ��������Ψһ��ID��RC�ļ��е���Ŀ
set(RESOURCE_ID_COUNTER 1000)
set(RESOURCE_MAP_CONTENT "static std::map<std::wstring, int> g_resource_map = {\n")

foreach(ASSET_PATH ${ASSET_PATHS_SRC})
    # �������·��������URL��ID
    file(RELATIVE_PATH RELATIVE_ASSET_PATH "${WEB_ASSETS_DIR_SRC}" "${ASSET_PATH}")
    string(REPLACE "\\" "/" URL_PATH "/${RELATIVE_ASSET_PATH}")
    string(TOUPPER ${RELATIVE_ASSET_PATH} ID_NAME)
    string(REGEX REPLACE "[^A-Z0-9]" "_" ID_NAME "IDR_${ID_NAME}")

    # д��ͷ�ļ�
    file(APPEND ${RESOURCE_H} "#define ${ID_NAME} ${RESOURCE_ID_COUNTER}\n")

    # ׼��map����
    string(REPLACE "\\" "\\\\" URL_PATH_ESCAPED ${URL_PATH})
    set(RESOURCE_MAP_CONTENT "${RESOURCE_MAP_CONTENT}    {L\"${URL_PATH_ESCAPED}\", ${ID_NAME}},\n")

    # --- �����޸������� RC �ļ�����ġ�����ת��� Windows ·�� ---

    # 1. ����ָ����󸱱�������·��
    set(PROCESSED_ASSET_PATH "${PROCESSED_ASSETS_DIR_DST}/${RELATIVE_ASSET_PATH}")
    
    # 2. ��·��ת��Ϊ Windows ������ʽ (ʹ�õ�����б��)
    file(TO_NATIVE_PATH "${PROCESSED_ASSET_PATH}" PROCESSED_ASSET_PATH_RC_TEMP)

    # 3. Ϊ RC ������ת�����з�б�� (�� \ �滻Ϊ \\)
    string(REPLACE "\\" "\\\\" PROCESSED_ASSET_PATH_RC "${PROCESSED_ASSET_PATH_RC_TEMP}")

    # 4. �����յġ���ȫ��·��д�� RC �ļ�
    file(APPEND ${RESOURCE_RC} "${ID_NAME} RCDATA \"${PROCESSED_ASSET_PATH_RC}\"\n")

    math(EXPR RESOURCE_ID_COUNTER "${RESOURCE_ID_COUNTER} + 1")
endforeach()

# 4. �����Դӳ��map��д��ͷ�ļ�
set(RESOURCE_MAP_CONTENT "${RESOURCE_MAP_CONTENT}};\n")
file(APPEND ${RESOURCE_H} "\n${RESOURCE_MAP_CONTENT}")

message(STATUS "Generated resource files: ${RESOURCE_H} and ${RESOURCE_RC}")