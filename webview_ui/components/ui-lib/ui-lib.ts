// Tools
import { createKvForm } from './tools/kv-form.js';


/**
 * 暴露所有 UI 工具接口
 */
export const UiTools = {
    createKvForm
};


/**
 * 初始化 UI 库的全局事件监听和交互逻辑接口
 */
export const initUiLib = () => {
    // 使用事件委托监听全局

    /**
     *  Menu 鼠标滑动高亮效果
     */

    // 处理鼠标在菜单项上的悬浮和移动
    document.addEventListener('mouseover', (e:any) => {
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

        // 处理危险按钮（.danger）的高亮背景色
        const isDanger = item.classList.contains('danger');
        menu.style.setProperty('--hl-bg', isDanger ? 'var(--bg-err-hv)' : 'var(--bg-inv-op)');
    });

    // 处理鼠标离开整个菜单区域的渐隐
    document.addEventListener('mouseout', (e:any) => {
        // 寻找鼠标刚刚离开的元素所属的 menu
        const menu = e.target.closest('.menu');
        if (!menu || menu.contains(e.relatedTarget)) return;

        // e.relatedTarget 是鼠标将要进入的新元素
        // 如果新元素不在当前的 menu 内部，说明鼠标彻底移出了菜单
        menu.style.setProperty('--hl-op', '0');
    });



    /**
     * Seg 分段控制器滑动逻辑
     */

    const updateSeg = (item) => {
        const seg = item.closest('.seg');
        if (!seg) return;
        seg.style.setProperty('--seg-x', `${item.offsetLeft}px`);
        seg.style.setProperty('--seg-w', `${item.offsetWidth}px`);
    };

    // 页面加载时初始化现有的 Seg
    document.querySelectorAll('.seg-item[act="true"]').forEach(updateSeg);

    document.addEventListener('click', (e:any) => {
        const item = e.target.closest('.seg-item');
        if (!item) return;
        const seg = item.closest('.seg');
        if (!seg) return;

        // 移除兄弟节点的激活状态
        Array.from(seg.querySelectorAll('.seg-item') as Array<HTMLElement>).forEach(el => el.removeAttribute('act'));
        item.setAttribute('act', 'true');
        updateSeg(item);
    });

    // 窗口尺寸变化时重新计算 Seg 位置
    window.addEventListener('resize', () => {
        document.querySelectorAll('.seg-item[act="true"]').forEach(updateSeg);
    });



    /**
     * 拖拽数字输入框
     */

    const updateNumSliderPct = (input) => {
        const minAttr = parseFloat(input.getAttribute('min'));
        const maxAttr = parseFloat(input.getAttribute('max'));
        const min = isNaN(minAttr) ? 0 : minAttr;
        const max = isNaN(maxAttr) ? 100 : maxAttr;
        const val = parseFloat(input.value) || 0;
        const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
        input.style.setProperty('--val-pct', `${pct}%`);
    };

    // 初始化现有的进度条
    document.querySelectorAll('.inp.num-slider').forEach(updateNumSliderPct);

    // 拖拽逻辑
    // 拖拽逻辑与单击区分
    document.addEventListener('mousedown', (e:any) => {
        if (!e.target.matches('.inp.num-slider')) return;
        const input = e.target;

        const startX = e.clientX;
        const startVal = parseFloat(input.value) || 0;
        const minAttr = parseFloat(input.getAttribute('min'));
        const maxAttr = parseFloat(input.getAttribute('max'));
        const stepAttr = parseFloat(input.getAttribute('step'));

        const min = isNaN(minAttr) ? -Infinity : minAttr;
        const max = isNaN(maxAttr) ? Infinity : maxAttr;
        const step = isNaN(stepAttr) ? 1 : stepAttr;
        const decimals = (step.toString().split('.')[1] || '').length;

        let isDragging = false;

        const onMouseMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            // 移动超过 2px 才判定为拖拽，否则保留为点击操作
            if (Math.abs(deltaX) > 2) {
                isDragging = true;
                input.blur(); // 确认为拖拽时，主动失去焦点隐藏光标

                let newVal = startVal + (deltaX * step);
                if (newVal < min) newVal = min;
                if (newVal > max) newVal = max;

                input.value = newVal.toFixed(decimals);
                updateNumSliderPct(input);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    // 手动输入时也要更新背景进度条
    document.addEventListener('input', (e:any) => {
        if (e.target.matches('.inp.num-slider')) updateNumSliderPct(e.target);
    });



    /**
     * 下拉组合框 (Combo Box) 全局逻辑
     */

    // 组合框聚焦/点击显示逻辑
    const openMenu = (box, menu, trigger) => {
        if (menu.classList.contains('show')) return; // 避免重复触发

        document.querySelectorAll('.combo-box .menu.dropdown.show').forEach(m => m !== menu && m.classList.remove('show'));
        menu.classList.add('show');
        menu._blockToggle = true; // 标识菜单刚被聚焦开启，拦截接下来的同步 click 事件

        // 自动把当前选中项放到菜单第一项的位置
        // 优先匹配 value 属性，其次匹配文字内容
        const currentVal = trigger.tagName === 'INPUT'
            ? trigger.value.trim().toLowerCase()
            : (box.getAttribute('value') || "").trim().toLowerCase();

        const items = menu.querySelectorAll('.menu-item') as Array<HTMLElement>;
        const match = Array.from(items).find(i =>
            (i.getAttribute('value') || "").toLowerCase() === currentVal ||
            i.innerText.trim().toLowerCase() === currentVal
        );
        menu.scrollTop = match ? match.offsetTop - 4 : 0;
    };

    // 点击显示
    document.addEventListener('click', (e:any) => {
        // 点击下拉按钮或普通下拉框(.sel)展开/收缩
        const trigger = e.target.closest('.combo-box .btn.sq, .combo-box .sel');
        if (trigger) {
            const box = trigger.closest('.combo-box');
            const menu = box.querySelector('.menu.dropdown');

            // 状态守卫：如果 menu 刚刚被 focusin 开启，则本次 click 不执行反向切换(关闭)
            if (menu._blockToggle) {
                menu._blockToggle = false;
                return;
            }

            if (menu.classList.contains('show')) {
                menu.classList.remove('show');
            } else {
                openMenu(box, menu, box.querySelector('.inp, .sel'));
            }
            return;
        }

        // 点击菜单项赋值与功能触发
        const item = e.target.closest('.combo-box .menu-item');
        if (item) {
            const box = item.closest('.combo-box');
            const triggerEl = box.querySelector('.inp, .sel');
            const menu = box.querySelector('.menu.dropdown');

            // 显式区分两者：val 用于数据，text 用于显示
            const val = item.getAttribute('value') || item.innerText.trim();
            const text = item.innerText.trim();

            if (item.getAttribute('action') === 'clear') {
                if (triggerEl.tagName === 'INPUT') triggerEl.value = '';
                else { triggerEl.innerText = ''; box.removeAttribute('value'); }
                triggerEl.dispatchEvent(new Event('input', { bubbles: true }));
                triggerEl.focus();
                return;
            }

            // 关键修复：根据元素类型决定显示内容
            if (triggerEl.tagName === 'INPUT') {
                triggerEl.value = val; // 组合框输入框显示实际值 (value)
            } else {
                triggerEl.innerText = text; // 单选框触发器显示显示名 (display/text)
                box.setAttribute('value', val); // 实际值存在外层属性上
            }

            triggerEl.dispatchEvent(new Event('input', { bubbles: true }));
            menu.classList.remove('show');
            return;
        }

        // 点击外部关闭
        if (!e.target.closest('.combo-box')) {
            document.querySelectorAll('.combo-box .menu.dropdown.show').forEach(m => m.classList.remove('show'));
        }
    });

    // 聚焦显示
    document.addEventListener('focusin', (e:any) => {
        const trigger = e.target.closest('.combo-box .inp, .combo-box .sel');
        if (trigger) openMenu(trigger.closest('.combo-box'), trigger.closest('.combo-box').querySelector('.menu.dropdown'), trigger);
    });


    // 组合框输入搜索逻辑
    document.addEventListener('input', (e:any) => {
        const box = e.target.closest('.combo-box');
        if (box && e.target.classList.contains('inp')) {
            const keyword = e.target.value.toLowerCase();
            const menu = box.querySelector('.menu.dropdown');
            const items = menu.querySelectorAll('.menu-item:not(.danger)');

            items.forEach(item => {
                // 同时获取显示文字和实际值进行复合搜索
                const itemText = item.innerText.toLowerCase();
                const itemVal = (item.getAttribute('value') || "").toLowerCase();
                const isMatch = itemText.includes(keyword) || itemVal.includes(keyword);

                item.style.display = isMatch ? 'flex' : 'none';
            });
            menu.classList.add('show');
            menu.style.setProperty('--hl-op', '0'); // 高度变化重置滑块防止错位
        }
    });
};