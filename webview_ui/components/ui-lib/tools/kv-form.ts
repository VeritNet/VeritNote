// tools/kv-form.js

export const createKvForm = (config, onChangeCallback) => {
    const container = document.createElement('div');
    container.className = 'kv-form-container';
    container.setAttribute('fx', 'col');

    // === 1. 构建独立控件的 HTML ===
    const buildControlHtml = (item) => {
        const val = item['value'];
        switch (item['type']) {
            case 'chk':
                return `<input type="checkbox" class="chk" ${val ? 'checked' : ''}>`;
            case 'tgl':
                return `<div class="tgl" on="${!!val}"></div>`;
            case 'text': case 'text':
                return `<input type="text" class="inp" value="${val || ''}" placeholder="${item.placeholder || ''}">`;
            case 'num':
                const min = item.min !== undefined ? `min="${item.min}"` : '';
                const max = item.max !== undefined ? `max="${item.max}"` : '';
                const step = item.step !== undefined ? `step="${item.step}"` : '';
                return `<input type="number" class="inp num-slider" ${min} ${max} ${step} value="${val || 0}">`;
            case 'sel':
                const selOptions = (item.values || []).map(v => {
                    const isObj = typeof v === 'object';
                    const valAttr = isObj ? v.value : v;
                    const display = isObj ? v.display : v;
                    return `<div class="menu-item" value="${valAttr}">${display}</div>`;
                }).join('');
                // 找到当前值对应的显示文本
                const currentObj = (item.values || []).find(v => (typeof v === 'object' ? v.value : v) == val);
                const displayText = currentObj ? (typeof currentObj === 'object' ? currentObj.display : currentObj) : (val || '');
                return `
                    <div class="combo-box" value="${val || ''}">
                        <div class="sel" tabindex="0">${displayText}</div>
                        <div class="menu dropdown anim-fade scroll-y" style="max-height: 40vh;">${selOptions}</div>
                    </div>`;
            case 'combo':
                const comboItems = (item.values || []).map(v => {
                    const isObj = typeof v === 'object';
                    return `<div class="menu-item" value="${isObj ? v.value : v}">${isObj ? v.display : v}</div>`;
                }).join('');
                return `
                    <div class="combo-box fw">
                        <div class="combo" foc="bd-act">
                            <input type="text" class="inp" value="${val || ''}">
                            <button class="btn sq">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" style="opacity: 0.6;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                            </button>
                        </div>
                        <div class="menu dropdown anim-fade scroll-y" style="max-height: 160px;">${comboItems}</div>
                    </div>`;
            case 'seg':
                const segItems = (item.values || []).map(v => {
                    const isObj = typeof v === 'object';
                    const valAttr = isObj ? v.value : v;
                    const display = isObj ? v.display : v;
                    return `<div class="seg-item" data-val="${valAttr}" ${valAttr == val ? 'act="true"' : ''}>${display}</div>`;
                }).join('');
                return `<div class="seg">${segItems}</div>`;
            case 'color':
                return `
                    <div class="kv-color-wrap">
                        <input type="color" value="${val || '#ffffff'}">
                        <div class="color-preview" style="background-color: ${val || '#ffffff'}"></div>
                    </div>`;
            default:
                return `<span>Unknown Type</span>`;
        }
    };

    // === 2. 递归构建整个表单 DOM ===
    const renderItems = (items, parentWrapper) => {
        items.forEach(item => {
            const itemEl = document.createElement('div');
            // 使用 fx="col" 保证行与子项容器垂直排列
            itemEl.className = 'kv-item';
            itemEl.setAttribute('fx', 'col');
            itemEl.setAttribute('data-name', item['name']);
            itemEl.setAttribute('data-type', item['type']);
            if (item['condition'] !== undefined) itemEl.setAttribute('data-condition', item['condition']);

            // fx="row" 水平对齐, fx="sb" 两端对齐, hv-bg="3" 悬浮高亮
            itemEl.innerHTML = `
                <div class="kv-row" fx="row" pd="xs" gap="s" hv-bg="3" rd="m" style="min-height:34px;" title="${item['describe'] || ''}">
                    <div class="kv-label" tc="2">${item['display'] || item['name']}</div>
                    <div class="kv-control" fx="row" fx="fe">${buildControlHtml(item)}</div>
                </div>
            `;

            if (item['children'] && item['children'].length > 0) {
                const childContainer = document.createElement('div');
                childContainer.className = 'kv-children';
                childContainer.setAttribute('fx', 'col');
                childContainer.setAttribute('gap', 'xs');
                renderItems(item['children'], childContainer);
                itemEl.appendChild(childContainer);
            }
            parentWrapper.appendChild(itemEl);
        });
    };

    renderItems(config, container);

    // === 3. 数据提取与视图控制 ===

    // 获取某一行的当前值
    const getRowValue = (itemEl) => {
        const type = itemEl.getAttribute('data-type');
        const controlWrap = itemEl.querySelector(':scope > .kv-row > .kv-control');

        switch (type) {
            case 'chk': return controlWrap.querySelector('.chk').checked;
            case 'tgl': return controlWrap.querySelector('.tgl').getAttribute('on') === 'true';
            case 'text':
            case 'num':
                const inp = controlWrap.querySelector('input, select');
                return type === 'num' ? Number(inp.value) : inp.value;
            case 'sel': return controlWrap.querySelector('.combo-box').getAttribute('value') || '';
            case 'combo': return controlWrap.querySelector('.inp').value;
            case 'seg':
                const activeSeg = controlWrap.querySelector('.seg-item[act="true"]');
                return activeSeg ? activeSeg.getAttribute('data-val') : '';
            case 'color': return controlWrap.querySelector('input[type="color"]').value;
            default: return null;
        }
    };

    // 根据父节点值更新所有子节点的显隐状态 (递归)
    const updateVisibility = (root) => {
        // 1. 先处理所有项的显隐状态
        const allItems = root.querySelectorAll('.kv-item');
        allItems.forEach(item => {
            const cond = item.getAttribute('data-condition');
            if (cond !== null) {
                const parentItem = item.parentElement.closest('.kv-item');
                const parentVal = String(getRowValue(parentItem));
                const isActive = (cond === parentVal);
                item.style.display = isActive ? 'flex' : 'none';
                item.setAttribute('data-active', isActive ? 'true' : 'false');
            } else {
                // 无条件的项默认激活
                item.setAttribute('data-active', 'true');
            }
        });

        // 2. 再处理子容器的装饰线显隐
        root.querySelectorAll('.kv-children').forEach(childContainer => {
            const hasVisibleChild = (Array.from(childContainer.querySelectorAll(':scope > .kv-item')) as Array<HTMLElement>)
                .some(i => i.style.display !== 'none');
            childContainer.style.display = hasVisibleChild ? 'flex' : 'none';

            // 同步给父级，方便 buildJson 判断是否需要进入递归
            const parentItem = childContainer.closest('.kv-item');
            parentItem.setAttribute('data-has-active-children', hasVisibleChild ? 'true' : 'false');
        });
    };

    // 初始化一次显隐状态
    updateVisibility(container);

    // 解决动态生成的 seg 缺少滑块位置初始化的问题
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);


    // === 4. 事件代理 (捕获交互并触发回调) ===

    const triggerChange = () => {
        updateVisibility(container);
        if (onChangeCallback) onChangeCallback();
    };

    // 监听输入和原生 change
    container.addEventListener('input', (e:any) => {
        // 同步颜色选择器背景
        if (e.target.type === 'color') {
            const preview = e.target.nextElementSibling;
            if (preview && preview.classList.contains('color-preview')) {
                preview.style.backgroundColor = e.target.value;
            }
        }
        triggerChange();
    });

    container.addEventListener('change', triggerChange);

    // 监听点击 (针对 ui-lib 自定义组件，如 tgl 和 seg)
    container.addEventListener('click', (e:any) => {
        // Tgl 开关手动切换逻辑
        const tgl = e.target.closest('.tgl');
        if (tgl) {
            const isOn = tgl.getAttribute('on') === 'true';
            tgl.setAttribute('on', isOn ? 'false' : 'true');
            triggerChange();
            return;
        }

        // Seg 切换逻辑 (ui-lib 核心已处理 act 状态更新，这里仅作延时捕获)
        if (e.target.closest('.seg-item')) {
            setTimeout(triggerChange, 0); // 延时让核心完成 act 赋值
            return;
        }

        // 菜单选择逻辑
        if (e.target.closest('.combo-box .menu-item')) {
            setTimeout(triggerChange, 0); // 延时等待核心填入值
        }
    });


    // === 5. 构建标准化 JSON 输出 ===

    const buildJson = (wrapper) => {
        const result = {};
        // 仅抓取当前容器下一级的 kv-item
        const items = wrapper.querySelectorAll(':scope > .kv-item');

        items.forEach(item => {
            // 如果节点未激活，则忽略
            if (item.getAttribute('data-active') === 'false') return;

            const name = item.getAttribute('data-name');
            const val = getRowValue(item);
            const hasActiveChildren = item.getAttribute('data-has-active-children') === 'true';

            if (hasActiveChildren) {
                const childContainer = item.querySelector(':scope > .kv-children');
                result[name] = [val, buildJson(childContainer)];
            } else {
                result[name] = val;
            }
        });
        return result;
    };

    // === 6. 暴露接口 ===
    return {
        dom: container,
        getValue: () => buildJson(container),
        destroy: () => {
            // 移除 DOM 并切断引用协助 GC 回收
            if (container.parentNode) container.parentNode.removeChild(container);
        }
    };
};