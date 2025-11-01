package com.veritnet.veritnote

import android.content.Intent
import android.content.ContentResolver
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.DocumentsContract
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import androidx.webkit.WebViewAssetLoader
import com.veritnet.veritnote.databinding.ActivityMainBinding
import android.webkit.CookieManager

import android.webkit.ConsoleMessage
import android.webkit.WebChromeClient
import android.util.Log
import java.io.File

import androidx.documentfile.provider.DocumentFile // <-- 新增 import
import java.io.BufferedReader // <-- 新增 import
import java.io.FileOutputStream // <-- 新增 import
import java.io.InputStreamReader // <-- 新增 import
import java.nio.charset.StandardCharsets
import org.json.JSONArray // <-- 新增 import
import org.json.JSONObject // <-- 新增 import


class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var webView: WebView

    // --- 生命周期 ---
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        // SOFT_INPUT_ADJUST_RESIZE 通常与 Insets API 配合得更好
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupKeyboardHandling() // 调用新的处理函数

        webView = binding.webView

        configureWebView()

        // JNI Calls
        nativeInit()
        nativeOnUiReady()

        binding.root.post {
            setupFullscreen()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        nativeDestroy()
    }

    // --- JNI 声明 ---
    private external fun nativeInit()
    private external fun nativeDestroy()
    private external fun nativeOnExternalLinkNavigation(url: String)
    private external fun nativeOnUiReady()
    private external fun nativeOnPlatformServiceResult(resultJson: String)
    private external fun nativeOnWebMessage(message: String)
    private external fun nativeGetPendingWorkspacePath(): String?
    private external fun nativeClearPendingWorkspacePath()

    companion object {
        init {
            System.loadLibrary("VeritNote")
        }
    }


    // --- UI 设置 ---
    // [NEW] 新增函数来处理键盘和系统栏的 Insets
    private fun setupKeyboardHandling() {
        val decorView = window.decorView
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            // 获取键盘的 Insets
            val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
            // 获取系统导航栏（通常在底部）的 Insets
            val navBarInsets = insets.getInsets(WindowInsetsCompat.Type.navigationBars())

            // [CRITICAL CHANGE]
            // 我们只关心底部的边距。这个边距应该是键盘高度和导航栏高度中的最大值。
            // 当键盘弹出时，imeInsets.bottom > navBarInsets.bottom。
            // 当键盘收起时，imeInsets.bottom = 0，我们需要避开底部导航栏。
            val bottomPadding = Math.max(imeInsets.bottom, navBarInsets.bottom)

            // 只更新根视图的底部 padding。顶部、左侧和右侧的 padding 保持为0。
            view.updatePadding(bottom = bottomPadding)

            // 返回原始 insets，但不消费它们，让子视图也能接收到
            insets
        }
    }

    private fun setupFullscreen() {
        // [MODIFIED] 这个函数现在只负责隐藏 UI
        val insetsController = WindowCompat.getInsetsController(window, window.decorView)
        insetsController.hide(WindowInsetsCompat.Type.systemBars())
        insetsController.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }


    // --- WebView 配置 ---
    private fun configureWebView() {
        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain("veritnote.app")
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                val url = request.url

                // [NEW] Handle our special local-file URIs for images
                val localFilePrefix = "https://veritnote.app/local-file/"
                if (url.toString().startsWith(localFilePrefix)) {
                    try {
                        // Decode the content URI from the URL path
                        val encodedContentUri = url.toString().substring(localFilePrefix.length)
                        val contentUriString = java.net.URLDecoder.decode(encodedContentUri, "UTF-8")
                        val contentUri = Uri.parse(contentUriString)

                        // Open an InputStream to the content URI
                        val inputStream = contentResolver.openInputStream(contentUri)
                        if (inputStream != null) {
                            // Get the MIME type from the content resolver
                            val mimeType = contentResolver.getType(contentUri) ?: "application/octet-stream"
                            return WebResourceResponse(mimeType, "UTF-8", inputStream)
                        }
                    } catch (e: Exception) {
                        Log.e("VeritNoteWebView", "Error intercepting local file request: $url", e)
                        // Fallback to asset loader or return null to indicate an error
                    }
                }

                // Fallback for all other veritnote.app requests
                return assetLoader.shouldInterceptRequest(url)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url ?: return false

                if (url.host == "veritnote.app") {
                    // Internal link, let WebView handle it.
                    return false
                }

                // External link. Notify C++ backend directly.
                nativeOnExternalLinkNavigation(url.toString())

                // Return true to prevent WebView from loading the URL.
                return true
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)

                // Check if the loaded page is our main editor page
                if (url != null && url.endsWith("index.html")) {
                    // Ask C++ if there's a workspace path to inject
                    val pathToInject = nativeGetPendingWorkspacePath()
                    if (!pathToInject.isNullOrEmpty()) {
                        // Path found, inject it into the WebView
                        injectWorkspacePath(pathToInject)
                        // Clear the path in C++ so it's not injected again on refresh
                        nativeClearPendingWorkspacePath()
                    }
                }
            }
        }

        // [新增] 设置 WebChromeClient 来捕获控制台日志
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                val logMessage = "WebViewConsole: ${consoleMessage.message()} -- From line ${consoleMessage.lineNumber()} of ${consoleMessage.sourceId()}"

                // 根据日志级别选择不同的 Logcat 方法
                when (consoleMessage.messageLevel()) {
                    ConsoleMessage.MessageLevel.ERROR -> Log.e("VeritNoteWebView", logMessage)
                    ConsoleMessage.MessageLevel.WARNING -> Log.w("VeritNoteWebView", logMessage)
                    ConsoleMessage.MessageLevel.LOG -> Log.i("VeritNoteWebView", logMessage)
                    ConsoleMessage.MessageLevel.TIP -> Log.i("VeritNoteWebView", logMessage)
                    ConsoleMessage.MessageLevel.DEBUG -> Log.d("VeritNoteWebView", logMessage)
                }
                return true // 返回 true 表示我们已经处理了这条消息
            }
        }

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false

        // [新增] 添加 JS Bridge，让 JS 可以调用 Android 的方法
        webView.addJavascriptInterface(WebAppInterface(), "AndroidBridge")
    }

    // [新增] JS Bridge 类
    inner class WebAppInterface {
        @JavascriptInterface
        fun postMessage(message: String) {
            // 将来自 JS 的消息转发给 C++ 后端
            nativeOnWebMessage(message)
        }
    }


    // --- 与 C++ 交互的 Android 方法 ---

    /**
     * 由 C++ 调用，用于导航到指定的 URL
     */
    fun navigateToUrl(url: String) {
        runOnUiThread {
            webView.loadUrl(url)
        }
    }

    /**
     * [新增] 由 C++ 调用，用于向 WebView 的 JS 上下文发送消息
     */
    fun postMessageToJs(jsonMessage: String) {
        runOnUiThread {
            // 对 JSON 字符串中的特殊字符进行转义，以安全地注入 JS 字符串
            val escapedJson = jsonMessage.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("'", "\\'")
                .replace("\n", "\\n")
                .replace("\r", "") // 移除回车符
            val script = "window.chrome.webview.messageHandler('$escapedJson');"
            webView.evaluateJavascript(script, null)
        }
    }


    /**
     * [NEW] C++ 调用此通用函数来请求任何 Android 平台服务
     */
    fun requestPlatformService(requestJson: String) {
        runOnUiThread {
            try {
                val request = JSONObject(requestJson)
                val action = request.getString("action")
                val callbackId = request.getInt("callbackId")
                val payload = request.optJSONObject("payload") ?: JSONObject()

                when (action) {
                    "openWorkspaceDialog" -> {
                        pendingServiceRequest[action] = callbackId
                        openFolderPicker()
                    }
                    "listDirectory" -> {
                        val uriString = request.getJSONObject("payload").getString("uri")
                        val fileList = listDirectory(uriString)
                        val data = JSONObject().put("files", fileList)
                        sendSuccessResult(callbackId, data)
                    }
                    "readFile" -> {
                        val uriString = request.getJSONObject("payload").getString("uri")
                        val childFilename = payload.optString("childFilename", null)
                        val content = readFile(uriString)
                        if (content != null) {
                            val data = JSONObject().put("content", content)
                            sendSuccessResult(callbackId, data)
                        } else {
                            sendErrorResult(callbackId, "Failed to read file.")
                        }
                    }
                    "writeFile" -> {
                        val uriString = payload.getString("uri")
                        val content = payload.getString("content")
                        val childFilename = payload.optString("childFilename", null)
                        val success = writeFile(uriString, content, childFilename)
                        if (success) {
                            sendSuccessResult(callbackId, JSONObject())
                        } else {
                            sendErrorResult(callbackId, "Failed to write file.")
                        }
                    }
                    "createItem" -> {
                        val parentUriString = payload.getString("parentUri")
                        val name = payload.getString("name")
                        val isDirectory = payload.getBoolean("isDirectory")
                        val newUri = createItem(parentUriString, name, isDirectory)
                        if (newUri != null) {
                            val data = JSONObject().put("uri", newUri)
                            sendSuccessResult(callbackId, data)
                        } else {
                            sendErrorResult(callbackId, "Failed to create item.")
                        }
                    }
                    "deleteItem" -> {
                        val uriString = payload.getString("uri")
                        val success = deleteItem(uriString)
                        if (success) {
                            sendSuccessResult(callbackId, JSONObject())
                        } else {
                            sendErrorResult(callbackId, "Failed to delete item.")
                        }
                    }
                    "listAllSubdirectories" -> {
                        val rootUriString = payload.getString("rootUri")
                        val subdirectories = listAllSubdirectories(rootUriString)
                        val data = JSONObject().put("directories", subdirectories)
                        sendSuccessResult(callbackId, data)
                    }
                    "openImagePicker" -> {
                        pendingServiceRequest[action] = callbackId
                        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "image/*" // We only want images
                        }
                        imagePickerLauncher.launch(intent)
                    }
                    "openExternalLink" -> {
                        try {
                            val url = payload.getString("url")
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                            startActivity(intent)
                            // This is fire-and-forget, so we can succeed immediately
                            sendSuccessResult(callbackId, JSONObject())
                        } catch (e: Exception) {
                            sendErrorResult(callbackId, "Failed to open external link.")
                        }
                    }
                    "doesItemExist" -> {
                        val parentUriString = payload.getString("parentUri")
                        val name = payload.getString("name")
                        val exists = doesItemExist(parentUriString, name)
                        val data = JSONObject().put("exists", exists)
                        sendSuccessResult(callbackId, data)
                    }
                    "getParentUri" -> {
                        val uriString = payload.getString("uri")
                        val parentUri = getParentUri(uriString)
                        if (parentUri != null) {
                            val data = JSONObject().put("parentUri", parentUri)
                            sendSuccessResult(callbackId, data)
                        } else {
                            sendErrorResult(callbackId, "Could not find parent URI.")
                        }
                    }
                }
            } catch (e: org.json.JSONException) {
                Log.e("VeritNoteService", "JSON Error in requestPlatformService", e)
            }
        }
    }

    // [NEW] 用于存储待处理请求的 callbackId
    private val pendingServiceRequest = mutableMapOf<String, Int>()


    // --- 平台服务回调辅助函数 ---
    private fun sendSuccessResult(callbackId: Int, data: JSONObject) {
        val response = JSONObject()
        response.put("callbackId", callbackId)
        response.put("success", true)
        response.put("data", data)
        nativeOnPlatformServiceResult(response.toString())
    }

    private fun sendErrorResult(callbackId: Int, errorMsg: String) {
        val response = JSONObject()
        response.put("callbackId", callbackId)
        response.put("success", false)
        response.put("error", errorMsg)
        nativeOnPlatformServiceResult(response.toString())
    }



    /**
     * [新增] 用于打开文件夹选择器
     */
    private fun openFolderPicker() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)

        try {
            val rootUri = DocumentsContract.buildTreeDocumentUri(
                "com.android.externalstorage.documents",
                "primary:" // "primary:" 是一个标准的 ID，代表主共享存储
            )
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, rootUri)
        } catch (e: Exception) {
            Log.e("VeritNotePicker", "Could not set initial URI for folder picker", e)
        }

        folderPickerLauncher.launch(intent)
    }

    // [新增] 现代的 Activity Result API，用于处理文件夹选择器的返回结果
    private val folderPickerLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callbackId = pendingServiceRequest.remove("openWorkspaceDialog") ?: -1
            if (callbackId == -1) return@registerForActivityResult

            val response = org.json.JSONObject()
            response.put("callbackId", callbackId)

            if (result.resultCode == RESULT_OK) {
                result.data?.data?.let { uri ->
                    contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    )

                    val data = org.json.JSONObject()
                    // [CRITICAL CHANGE] 我们直接返回 URI 字符串，不再尝试转换成文件路径
                    data.put("uri", uri.toString())

                    response.put("success", true)
                    response.put("data", data)
                } ?: run {
                    response.put("success", false)
                    response.put("error", "Failed to get data from intent.")
                }
            } else {
                response.put("success", false)
                response.put("error", "User cancelled the operation.")
            }

            // 将结果发送回 C++
            nativeOnPlatformServiceResult(response.toString())
        }

    // [新增] 一个辅助函数，尝试将 SAF 返回的 URI 转换为文件系统路径
    // 注意：这个方法主要对 /storage/emulated/0/ 下的路径有效
    private fun getPathFromUri(uri: Uri): String? {
        if (DocumentsContract.isDocumentUri(this, uri)) {
            if ("com.android.externalstorage.documents" == uri.authority) {
                val docId = DocumentsContract.getDocumentId(uri)
                val split = docId.split(":".toRegex()).dropLastWhile { it.isEmpty() }.toTypedArray()
                val type = split[0]
                if ("primary".equals(type, ignoreCase = true)) {
                    return Environment.getExternalStorageDirectory().toString() + "/" + split[1]
                }
            }
        }
        return null
    }


    // [NEW] Launcher for the image picker
    private val imagePickerLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callbackId = pendingServiceRequest.remove("openImagePicker") ?: -1
            if (callbackId == -1) return@registerForActivityResult

            if (result.resultCode == RESULT_OK) {
                result.data?.data?.let { uri ->
                    // For image picker, we don't need persistent permissions for viewing.
                    // If we needed to edit the image later, we would take them here.
                    // The permission is granted temporarily to our app.
                    val data = JSONObject().put("uri", uri.toString())
                    sendSuccessResult(callbackId, data)
                } ?: run {
                    sendErrorResult(callbackId, "Failed to get image URI from intent.")
                }
            } else {
                // User cancelled
                sendErrorResult(callbackId, "User cancelled image selection.")
            }
        }


    // [NEW] Helper function to execute the injection script
    private fun injectWorkspacePath(path: String) {
        // Escape the path string for safe injection into a JS string literal
        val escapedPath = path.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "")

        val script = """
            window.pendingWorkspacePath = "$escapedPath";
            window.dispatchEvent(new Event('workspacePathReady'));
        """.trimIndent()

        webView.evaluateJavascript(script, null)
    }


    // --- [NEW] 文件操作服务实现 ---

    private fun listDirectory(dirUriString: String): JSONArray {
        val dirUri = Uri.parse(dirUriString)
        val dir = DocumentFile.fromTreeUri(this, dirUri)
        val fileList = JSONArray()

        dir?.listFiles()?.forEach { file ->
            val fileInfo = JSONObject()
            fileInfo.put("name", file.name)
            fileInfo.put("uri", file.uri.toString())
            fileInfo.put("isDirectory", file.isDirectory)
            fileList.put(fileInfo)
        }
        return fileList
    }

    private fun readFile(uriString: String, childFilename: String? = null): String? {
        return try {
            val targetUri = if (childFilename != null) {
                val parentUri = Uri.parse(uriString)
                val parentDir = DocumentFile.fromTreeUri(this, parentUri)
                parentDir?.findFile(childFilename)?.uri ?: return null // Return null if child not found
            } else {
                Uri.parse(uriString)
            }

            contentResolver.openInputStream(targetUri)?.use { inputStream ->
                var bytes = inputStream.readBytes()

                // [CRITICAL CHANGE] 检查并移除 UTF-8 BOM
                if (bytes.size >= 3 &&
                    bytes[0] == 0xEF.toByte() &&
                    bytes[1] == 0xBB.toByte() &&
                    bytes[2] == 0xBF.toByte()) {
                    // 如果存在BOM，创建一个不包含BOM的新字节数组
                    bytes = bytes.copyOfRange(3, bytes.size)
                }

                return String(bytes, StandardCharsets.UTF_8)
            }
        } catch (e: Exception) {
            Log.e("VeritNoteFileOps", "Error reading file: $uriString (child: $childFilename)", e)
            null
        }
    }

    private fun writeFile(uriString: String, content: String, childFilename: String? = null): Boolean {
        return try {
            val targetUri = if (childFilename != null) {
                // This is a write operation for a config file inside a directory
                val parentUri = Uri.parse(uriString)
                val parentDir = DocumentFile.fromTreeUri(this, parentUri)

                // Find the file. If it doesn't exist, create it.
                val targetFile = parentDir?.findFile(childFilename)
                    ?: parentDir?.createFile("application/octet-stream", childFilename)

                targetFile?.uri ?: return false // If creation fails, return false
            } else {
                // This is a direct write to a page file URI
                Uri.parse(uriString)
            }

            // The rest of the write logic is the same
            contentResolver.openFileDescriptor(targetUri, "wt")?.use { pfd ->
                FileOutputStream(pfd.fileDescriptor).use { fos ->
                    fos.write(content.toByteArray(StandardCharsets.UTF_8))
                }
            }
            true
        } catch (e: Exception) {
            Log.e("VeritNoteFileOps", "Error writing file: $uriString, child: $childFilename", e)
            false
        }
    }

    // --- [NEW] 新增文件操作服务实现 ---
    private fun createItem(parentUriString: String, name: String, isDirectory: Boolean): String? {
        return try {
            val parentUri = Uri.parse(parentUriString)
            val parentDir = DocumentFile.fromTreeUri(this, parentUri)
            if (parentDir?.exists() == true && parentDir.isDirectory) {
                val existingFile = parentDir.findFile(name)
                if (existingFile != null) {
                    Log.w("VeritNoteFileOps", "Item '$name' already exists.")
                    return null // Or return existing URI: existingFile.uri.toString()
                }

                val newFile = if (isDirectory) {
                    parentDir.createDirectory(name)
                } else {
                    // [MODIFIED] 使用不同的MIME类型来避免系统自动添加json
                    val mimeType = "application/octet-stream" // Use a generic mime type
                    parentDir.createFile(mimeType, name)
                }
                newFile?.uri?.toString()
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e("VeritNoteFileOps", "Error creating item '$name'", e)
            null
        }
    }

    private fun deleteItem(uriString: String): Boolean {
        return try {
            val uri = Uri.parse(uriString)
            val file = DocumentFile.fromSingleUri(this, uri)
            if (file?.exists() == true) {
                file.delete()
            } else {
                Log.w("VeritNoteFileOps", "Item to delete not found: $uriString")
                false
            }
        } catch (e: Exception) {
            Log.e("VeritNoteFileOps", "Error deleting item $uriString", e)
            false
        }
    }

    // --- [NEW] 新增 listAllSubdirectories 服务实现 ---
    private fun listAllSubdirectories(rootUriString: String): JSONArray {
        val directoryList = JSONArray()
        try {
            val rootUri = Uri.parse(rootUriString)
            val rootDir = DocumentFile.fromTreeUri(this, rootUri)

            // 使用队列进行广度优先遍历
            val queue = ArrayDeque<DocumentFile>()
            if (rootDir != null && rootDir.isDirectory) {
                queue.add(rootDir)
            }

            while (queue.isNotEmpty()) {
                val currentDir = queue.removeFirst()
                // 将所有子目录加入队列，并将其URI添加到结果列表中
                currentDir.listFiles().forEach {
                    if (it.isDirectory) {
                        queue.add(it)
                        directoryList.put(it.uri.toString())
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("VeritNoteFileOps", "Error in listAllSubdirectories", e)
            // On error, return whatever was found
        }
        return directoryList
    }

    private fun doesItemExist(parentUriString: String, name: String): Boolean {
        return try {
            val parentUri = Uri.parse(parentUriString)
            val parentDir = DocumentFile.fromTreeUri(this, parentUri)
            parentDir?.findFile(name)?.exists() ?: false
        } catch (e: Exception) {
            Log.e("VeritNoteFileOps", "Error checking existence of '$name'", e)
            false
        }
    }

    private fun getParentUri(uriString: String): String? {
        return try {
            val uri = Uri.parse(uriString)
            val docFile = DocumentFile.fromSingleUri(this, uri)
            docFile?.parentFile?.uri?.toString()
        } catch (e: Exception) {
            Log.e("VeritNoteFileOps", "Error getting parent URI for $uriString", e)
            null
        }
    }
}