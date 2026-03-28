## 📦 1. 快速开始

将以下文件引入你的 HTML 页面中：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <link rel="stylesheet" href="theme.css">
    <link rel="stylesheet" href="ui-lib.css">
</head>
<body>
    <!-- 你的内容 -->

    <script type="module">
        import { initUiLib } from './ui-lib.js';
        // 初始化 JS 交互（如菜单滑动高亮效果）
        initUiLib();
    </script>
</body>
</html>
```

---

## 🌗 2. 主题系统 (Theme System)

库默认使用 **暗色模式 (Dark Theme)**。所有的颜色、间距、圆角和阴影都受控于 `theme.css` 中的 CSS 变量。

### 切换浅色模式 (Light Theme)
只需在 `<body>` 或任何父容器上添加 `.light-theme` 类名，内部所有组件将自动切换至浅色模式。

```html
<body class="light-theme">
    <!-- 浅色模式生效 -->
</body>
```

### 核心设计变量清单
- **背景色 (`--bg-*`)**: `1` (底层), `2` (卡片层), `3` (悬浮/强调层), `4` (深层), `act` (激活), `err` (错误色), `pop` (毛玻璃层), `inv` (反色), `inv-op` (反色半透明)
- **文本色 (`--tc-*`)**: `1` (主文本), `2` (次文本), `3` (禁用/占位), `act` (激活), `err` (错误色), `inv` (反色/白色)
- **边框色 (`--bd-*`)**: `1` (基础边框), `2` (深色边框), `act` (激活), `err` (错误色)
- **间距 (`--sp-*`)**: `xs` (4px), `s` (8px), `m` (12px), `l` (16px), `xl` (24px)
- **圆角 (`--rd-*`)**: `s` (4px), `m` (6px), `l` (10px), `f` (9999px / 全圆角)
- **阴影 (`--sh-*`)**: `1` (小阴影), `2` (中阴影), `3` (大阴影/弹窗)

---

## 📐 3. 原子化布局系统 (Layout Attributes)

摒弃繁琐的 class，使用直观的自定义属性来进行 Flexbox 布局。

### `fx` 属性 (Flex 布局模式)
| 属性写法 | 对应的 CSS 效果 | 说明 |
| :--- | :--- | :--- |
| `fx="row"` | `flex-direction: row; align-items: center;` | 水平排列，垂直居中 |
| `fx="col"` | `flex-direction: column;` | 垂直排列 |
| `fx="c"` | `justify-content: center; align-items: center;` | 水平垂直完全居中 |
| `fx="sb"` | `justify-content: space-between; align-items: center;` | 两端对齐 |
| `fx="fs"` | `justify-content: flex-start; align-items: center;` | 起点对齐 |
| `fx="fe"` | `justify-content: flex-end; align-items: center;` | 终点对齐 |

### `gap` 属性 (元素间距)
配合 `fx` 使用，控制子元素之间的间距：
- `gap="xs"` (4px)
- `gap="s"` (8px)
- `gap="m"` (12px)
- `gap="l"` (16px)

**使用示例：**
```html
<div fx="row" gap="m">
    <div>项目 1</div>
    <div>项目 2</div>
</div>
```

---

## 🎨 4. 样式属性 (Style Attributes)

直接在 HTML 标签上使用属性快速赋予系统级样式。

| 类别 | 属性名 | 可选值 | 示例 |
| :--- | :--- | :--- | :--- |
| **背景** | `bg` | `1`, `2`, `3`, `4`, `act`, `err`, `none` | `<div bg="2">卡片</div>` |
| **文本色** | `tc` | `1`, `2`, `3`, `act`, `err`, `inv` | `<span tc="err">错误文本</span>` |
| **边框** | `bd` | `1`, `2`, `act`, `err`, `none`, `b1` (仅底边), `r1` (仅右边), `b2`, `r2`, `b-act`, `r-act` | `<div bd="1">带边框</div>` |
| **圆角** | `rd` | `s`, `m`, `l`, `f` (完全圆角), `none` | `<img rd="f" src="...">` |
| **内边距** | `pd` | `0`, `xs`, `s`, `m`, `l` | `<div pd="m">内容</div>` |
| **阴影** | `sh` | `1`, `2`, `3` | `<div sh="2">悬浮层</div>` |

---

## 🖱️ 5. 交互状态系统 (Hover & Focus)

分离的 Hover 和 Focus 状态管理，以 `hv-*` 开头，支持在鼠标悬浮时动态改变样式。

### Hover 属性 (`hv-*`)
用法同基础样式属性，仅在 `:hover` 时触发。
- **背景**: `hv-bg="1"`, `hv-bg="2"`, `hv-bg="3"`, `hv-bg="4"`, `hv-bg="act"`, `hv-bg="err"`, `hv-bg="none"`
- **文本色**: `hv-tc="1"`, `hv-tc="2"`, `hv-tc="3"`, `hv-tc="act"`, `hv-tc="err"`, `hv-tc="inv"`
- **边框**: `hv-bd="1"`, `hv-bd="2"`, `hv-bd="act"`, `hv-bd="err"`, `hv-bd="none"`
- **圆角**: `hv-rd="s"`, `hv-rd="m"`, `hv-rd="l"`, `hv-rd="f"`, `hv-rd="none"`
- **内边距**: `hv-pd="0"`, `hv-pd="xs"`, `hv-pd="s"`, `hv-pd="m"`, `hv-pd="l"`
- **阴影**: `hv-sh="1"`, `hv-sh="2"`, `hv-sh="3"`, `hv-sh="none"`
- **特效**: 
  - `hv-op`: 悬浮时透明度降低至 0.8
  - `hv-scale`: 悬浮时放大至 1.05 倍

### Focus 属性 (`foc=*`)
- `foc="bd-act"`: 当元素本身或其子元素获得焦点时（`:focus-within`），边框变为激活色（主色调）。

**使用示例：**
```html
<!-- 悬浮时背景变色且放大 -->
<div bg="2" hv-bg="3" hv-scale pd="m" rd="m">互动卡片</div>
```

---

## 🛠️ 6. 通用工具类 (Utility Classes)

提供极简的 Class 补充特殊样式需求：

- `.bl`: 移除边框 (`border: none!important`)
- `.sq`: 正方形容器（默认32x32，自动居中），常用于图标按钮。
- `.cr`: 圆形容器（默认32x32，50%圆角，自动居中），常用于头像或圆按钮。
- `.fw`: 宽度 100% (`width: 100%`)
- `.fh`: 高度 100% (`height: 100%`)
- `.scroll-y` / `.scroll-x`: 启用垂直/水平滚动条（内部已深度美化滚动条样式）。
- `.glass`: 毛玻璃特效（背景半透明 + 背景模糊）。

---

## 🧩 7. UI 组件库 (Components)

所有核心组件的完整 HTML 结构与说明。

### 🔘 按钮 (`.btn`)
标准按钮，自带过渡动画、间距和禁止/激活状态。
```html
<button class="btn">普通按钮</button>
<button class="btn" disabled>禁用按钮</button>
<button class="btn" bg="act" hv-bg="act">激活按钮</button>
<button class="btn" bg="err" hv-bg="err">警告按钮</button>

<!-- 配合 .sq 变身为图标按钮 -->
<button class="btn sq">
    <svg>...</svg>
</button>
```

### ✍️ 输入框 (`.inp`)
自适应宽度的基础输入框。附加 `.num-slider` 配合 `min`/`max` 属性，即可变为数值拖动框：鼠标悬浮变为左右箭头，按住拖动快速调值，自带进度背景。
```html
<input type="text" class="inp" placeholder="请输入内容...">
<input type="number" class="inp num-slider" min="0" max="100" step="1" value="50">

### 🔽 下拉选择框 (`.sel`)
带有自定义下拉箭头的原生 Select。
```html
<select class="sel">
    <option>选项一</option>
    <option>选项二</option>
</select>
```

### 🔍 组合输入框 (Combobox, `.combo`)
输入框内嵌操作按钮（如清除内容或下拉展开）。
```html
<div class="combo">
    <input type="text" class="inp" placeholder="搜索...">
    <button class="btn sq">✖</button>
</div>
```

### 🔍 组合下拉框 (`.combo-box`)
库内置了完整的数据过滤与交互逻辑。
- **结构**: `.combo-box` > (`.combo` > `.inp` + `.btn`) + `.menu.dropdown`。
- **搜索**: 输入时自动根据 `data-val` 或文本内容过滤选项。
- **清除**: 菜单项若配置 `action="clear"`，点击将清空输入并保持菜单开启状态。
- **高度控制**: 可对 `.menu.dropdown` 使用 `.scroll-y` 及 CSS `max-height` 限制高度。
```html
<div class="combo-box">
            <div class="combo" foc="bd-act">
                <input type="text" class="inp" placeholder="搜索水果或点击右侧展开...">
                <button class="btn sq">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </button>
            </div>
            <div class="menu dropdown anim-fade scroll-y" style="max-height: 160px;">
                <div class="menu-item" data-val="Apple">🍎 苹果 (Apple)</div>
                <div class="menu-item" data-val="Banana">🍌 香蕉 (Banana)</div>
                <div class="menu-item" data-val="Cherry">🍒 樱桃 (Cherry)</div>
                <div class="menu-item" data-val="Grape">🍇 葡萄 (Grape)</div>
                <div class="menu-item" data-val="Orange">🍊 橙子 (Orange)</div>
                <div class="menu-item" data-val="Peach">🍑 桃子 (Peach)</div>
                <div class="menu-sep"></div>
<div class="menu-item danger" action="clear">🗑️ 清除选择</div>
            </div>
        </div>
```

### 🌳 树形节点 (`.tree-item`)
用于文件树、目录结构等场景。支持选中和展开状态。
- `act="true"`: 激活选中背景。
- `open="true"`: 展开状态（左侧图标会自动旋转90度）。
```html
<div class="tree-item" open="true">
    <div class="icon">▶</div>
    <span>文件夹 1</span>
</div>
<div class="tree-item" act="true">
    <div class="icon"></div>
    <span>文件.txt</span>
</div>
```

### 🎚️ 开关 (`.tgl`)
自定义拨动开关。使用 `on="true"` 控制开启状态。
```html
<div class="tgl" on="true"></div>
<div class="tgl"></div>
```

### ☑️ 复选框 (`.chk`)
深度美化的原生 checkbox，无需额外的包裹元素。
```html
<input type="checkbox" class="chk" checked>
```

### 📇 卡片 (`.card`)
具备基础层级、边框和圆角的容器。
```html
<div class="card">
    <h3 tc="1">卡片标题</h3>
    <p tc="2">这是卡片内部的内容区域。</p>
</div>
```

### 🏷️ 徽标 / 标签 (`.badge`)
用于展示状态或计数的细小文本标签。
```html
<span class="badge">v1.0.0</span>
<span class="badge" bg="act">New</span>
```

### 🎛️ 分段控制器 (`.seg` & `.seg-item`)
常用于模式切换按钮。
```html
<div class="seg">
    <div class="seg-item" act="true">列表视图</div>
    <div class="seg-item">网格视图</div>
</div>
```

### 📑 标签页 (`.tab-bar` & `.tab`)
底部带有高亮指示线的标签导航。
```html
<div class="tab-bar">
    <div class="tab" act="true">概览</div>
    <div class="tab">设置</div>
    <div class="tab">高级分析</div>
</div>
```

---

## 🪄 8. 智能菜单与 JS API (Menu & Popover)

基于鼠标跟随计算的智能高亮菜单（类似于原生系统菜单的顺滑高亮效果）。**必须调用 `initUiLib()` 才能激活滑动特效。**

### 菜单结构
- 容器: `.menu` (默认带有渐显动画 `.anim-fade`)
- 菜单项: `.menu-item`
  - 危险项: 附加 `.danger` 类，悬浮时高亮为红色。
- 分割线: `.menu-sep`

### 示例代码
```html
<div class="menu" style="width: 200px;">
    <div class="menu-item">
        <span>📄</span> 新建文件
    </div>
    <div class="menu-item">
        <span>📁</span> 新建文件夹
    </div>
    <div class="menu-sep"></div>
    <!-- 危险操作项 -->
    <div class="menu-item danger">
        <span>🗑️</span> 删除
    </div>
</div>
```

### JavaScript API 工作原理
`ui-lib.js` 中的 `initUiLib` 利用**事件委托**监听全局鼠标事件。
当鼠标移入 `.menu-item` 时，JS 会动态计算当前元素的高度和位置，并将其赋值给 `.menu` 的 CSS 变量 (`--hl-y`, `--hl-height`)，结合纯 CSS 的 `transform` 实现高性能的“滑块追踪”动画。

---

## 🎬 9. 动画与特效 (Animations)

通过简单的类名添加关键帧动画：

- `.anim-spin`: 线性无限旋转（1秒/圈）。常用于 Loading 图标。
  ```html
  <svg class="anim-spin">...</svg>
  ```
- `.anim-fade`: 向上平移并淡入（0.25秒）。默认已内置于 `.menu` 中，也可用于弹窗。
  ```html
  <div class="card anim-fade">出现动画</div>
  ```