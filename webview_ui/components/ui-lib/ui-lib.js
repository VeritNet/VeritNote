export const initUiLib = () => {
    // 使用事件委托监听全局，完美支持后期动态添加的 .menu

    // 1. 处理鼠标在菜单项上的悬浮和移动
    document.addEventListener('mouseover', (e) => {
        // 寻找鼠标当前悬浮的是否是 menu-item
        const item = e.target.closest('.menu-item');
        if (!item) return;

        // 寻找该 item 所属的 menu 容器
        const menu = item.closest('.menu');
        if (!menu) return;

        // 动态赋值 CSS 变量，驱动伪元素滑块
        menu.style.setProperty('--hl-y', `${item.offsetTop}px`);
        menu.style.setProperty('--hl-height', `${item.offsetHeight}px`);
        menu.style.setProperty('--hl-op', '1');

        // 智能处理危险按钮（.danger）的高亮背景色
        const isDanger = item.classList.contains('danger');
        menu.style.setProperty('--hl-bg', isDanger ? 'var(--bg-err-hv)' : 'var(--bg-3)');
    });

    // 2. 处理鼠标离开整个菜单区域的渐隐
    document.addEventListener('mouseout', (e) => {
        // 寻找鼠标刚刚离开的元素所属的 menu
        const menu = e.target.closest('.menu');
        if (!menu) return;

        // e.relatedTarget 是鼠标将要进入的新元素
        // 如果新元素不在当前的 menu 内部，说明鼠标彻底移出了菜单
        if (!menu.contains(e.relatedTarget)) {
            menu.style.setProperty('--hl-op', '0');
        }
    });
};