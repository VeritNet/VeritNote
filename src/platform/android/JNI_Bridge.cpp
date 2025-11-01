// src/platform/android/JNI_Bridge.cpp

#include <jni.h>
#include <string>
#include "Android_Backend.h"
#include "include/Platform.h"

// 全局持有一个 Backend 实例的指针
static AndroidBackend* g_backend = nullptr;

// 全局变量，用于 JNI 回调
JavaVM* g_jvm = nullptr;
static jobject g_main_activity_instance = nullptr;


extern "C" {
    // 在 nativeInit 中缓存 JavaVM 和 MainActivity 实例
    JNIEXPORT void JNICALL
        Java_com_veritnet_veritnote_MainActivity_nativeInit(
            JNIEnv* env,
            jobject thiz) { // 'thiz' 就是 MainActivity 的实例
        LOG_DEBUG("Java_com_veritnet_veritnote_MainActivity_nativeInit");
        if (g_backend == nullptr) {
            env->GetJavaVM(&g_jvm);
            g_main_activity_instance = env->NewGlobalRef(thiz);

            g_backend = new AndroidBackend();
            g_backend->SetMainActivityInstance(g_main_activity_instance);
        }
    }

    // 在 nativeDestroy 中释放全局引用
    JNIEXPORT void JNICALL
        Java_com_veritnet_veritnote_MainActivity_nativeDestroy(
            JNIEnv* env,
            jobject /* this */) {
        LOG_DEBUG("Java_com_veritnet_veritnote_MainActivity_nativeDestroy");
        if (g_backend != nullptr) {
            delete g_backend;
            g_backend = nullptr;
            if (g_main_activity_instance != nullptr) {
                env->DeleteGlobalRef(g_main_activity_instance);
                g_main_activity_instance = nullptr;
            }
        }
    }


    // [NEW] 从 Kotlin 接收通用的平台服务结果
    JNIEXPORT void JNICALL
        Java_com_veritnet_veritnote_MainActivity_nativeOnPlatformServiceResult(
            JNIEnv* env,
            jobject /* this */,
            jstring resultJson) {
        LOG_DEBUG("Java_com_veritnet_veritnote_MainActivity_nativeOnPlatformServiceResult");
        if (g_backend) {
            const char* result_chars = env->GetStringUTFChars(resultJson, nullptr);
            std::string result_str(result_chars);
            env->ReleaseStringUTFChars(resultJson, result_chars);
            g_backend->OnPlatformServiceResult(result_str);
        }
    }


    // UI 准备就绪
    JNIEXPORT void JNICALL
        Java_com_veritnet_veritnote_MainActivity_nativeOnUiReady(
            JNIEnv* env,
            jobject /* this */) {
        LOG_DEBUG("Java_com_veritnet_veritnote_MainActivity_nativeOnUiReady");
        if (g_backend) {
            g_backend->onUiReady();
        }
    }

    // [新增] 从 JS Bridge 接收消息
    JNIEXPORT void JNICALL
        Java_com_veritnet_veritnote_MainActivity_nativeOnWebMessage(
            JNIEnv* env,
            jobject /* this */,
            jstring message) {
        if (g_backend) {
            const char* msg_chars = env->GetStringUTFChars(message, nullptr);
            std::string msg_str(msg_chars);
            env->ReleaseStringUTFChars(message, msg_chars);

            g_backend->HandleWebMessage(msg_str);
        }
    }

    // [NEW] JNI function for Kotlin to get the pending path
    JNIEXPORT jstring JNICALL
        Java_com_veritnet_veritnote_MainActivity_nativeGetPendingWorkspacePath(
            JNIEnv* env,
            jobject /* this */) {
        if (g_backend) {
            std::wstring path_w = g_backend->GetNextWorkspacePath();
            if (!path_w.empty()) {
                std::string path_s = g_backend->wstring_to_string(path_w);
                return env->NewStringUTF(path_s.c_str());
            }
        }
        return nullptr; // Return null if no path is pending
    }

    // [NEW] JNI function for Kotlin to clear the path after injection
    JNIEXPORT void JNICALL
        Java_com_veritnet_veritnote_MainActivity_nativeClearPendingWorkspacePath(
            JNIEnv* env,
            jobject /* this */) {
        if (g_backend) {
            g_backend->ClearNextWorkspacePath();
        }
    }

    // [NEW] JNI function for MainActivity to report an external link navigation
    JNIEXPORT void JNICALL
        Java_com_veritnet_veritnote_MainActivity_nativeOnExternalLinkNavigation(
            JNIEnv* env,
            jobject /* this */,
            jstring url) {
        if (g_backend) {
            const char* url_chars = env->GetStringUTFChars(url, nullptr);
            std::string url_str(url_chars);
            env->ReleaseStringUTFChars(url, url_chars);

            // Call the platform-specific public method on AndroidBackend
            g_backend->OpenExternalLink(g_backend->string_to_wstring(url_str));
        }
    }
}