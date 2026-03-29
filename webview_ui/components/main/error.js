export const init_error_handle = function () {
    const createToast = (shortMsg, fullDetail) => {
        const container = document.getElementById('error-toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <svg style="flex-shrink:0;color:#ff4d4f" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span style="flex-grow:1; white-space: nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:bold;">${shortMsg}</span>
            <button class="copy-detail-btn" title="Copy full stack trace" style="background:none;border:none;color:var(--tc-2);cursor:pointer;padding:2px;display:flex;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <span class="close-btn" style="padding-left:4px; font-size:16px; cursor:pointer; opacity:0.6;">&times;</span>
        `;

        // 复制逻辑
        toast.querySelector('.copy-detail-btn').onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(fullDetail).then(() => {
                const btn = toast.querySelector('.copy-detail-btn');
                const oldHtml = btn.innerHTML;
                btn.innerHTML = '<span style="font-size:10px;color:#52c41a">Done!</span>';
                setTimeout(() => btn.innerHTML = oldHtml, 1500);
            });
        };

        toast.querySelector('.close-btn').onclick = () => toast.remove();
        container.appendChild(toast);
    };

    // 1. 运行时错误 (包含 stack)
    window.addEventListener('error', (e) => {
        const detail = `[RUNTIME ERROR]\nMessage: ${e.message}\nFile: ${e.filename}\nLine: ${e.lineno}:${e.colno}\nStack: ${e.error?.stack || 'No stack'}`;
        createToast(e.message, detail);
    });

    // 2. Promise 错误
    window.addEventListener('unhandledrejection', (e) => {
        const reason = e.reason;
        const detail = `[PROMISE REJECTION]\nReason: ${reason?.message || reason}\nStack: ${reason?.stack || 'No stack'}`;
        createToast(reason?.message || 'Promise failed', detail);
    });

    // 3. Console.error 拦截 (尝试寻找参数中的 Error 对象)
    const rawError = console.error;
    console.error = (...args) => {
        rawError.apply(console, args);
        const stackObj = args.find(a => a instanceof Error);
        const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        const detail = `[CONSOLE ERROR]\nContent: ${text}\nStack: ${stackObj?.stack || new Error().stack}`;
        createToast(args[0]?.message || args[0] || 'Console Error', detail);
    };
};