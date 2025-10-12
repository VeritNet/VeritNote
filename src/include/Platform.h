// src/include/Platform.h
#pragma once

#include <string>

// 根据平台定义调试日志宏
#if defined(WIN32) || defined(_WIN32)
#include <windows.h>
#define LOG_DEBUG(message) OutputDebugStringA(message)
#elif defined(__ANDROID__)
#include <android/log.h>
// 定义一个日志标签，方便在 logcat 中过滤
#define APP_LOG_TAG "VeritNoteCore"
#define LOG_DEBUG(message) __android_log_print(ANDROID_LOG_DEBUG, APP_LOG_TAG, "%s", message)
#else
    // 为其他平台（如 Linux, macOS）提供一个默认实现，打印到标准输出
#include <iostream>
#define LOG_DEBUG(message) std::cout << "[DEBUG] " << (message) << std::endl
#endif