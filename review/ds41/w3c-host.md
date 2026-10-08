# ds4.1 只读审计：宿主嵌入（inline fragment）健壮性

- 审计时间：2026-10-07 02:05–02:19（Asia/Shanghai）
- 审计者：ds4.1 只读审计代理
- 只读约束遵守情况：未修改 `outputs/`、`work/gnss-swarm/**`、`~/.codex/visualizations/**` 中任何文件；全部写入均落在 `review/ds41/w3c-host/` 内。
- 证据目录：`D:/codex/2026-10-05/new-chat/review/ds41/w3c-host/`

## ① 两个产物的 SHA-256

两个时间点（审计开始、审计结束）各算一次，**四次结果完全一致**，说明审计期间两份产物没有被重建。

| 产物 | 字节数 | SHA-256（开始 = 结束） |
|---|---|---|
| 内联片段 `C:/Users/31040/.codex/visualizations/2026/10/05/01a10c98-950b-7151-a024-b4d3630dcd87/gnss-swarm-lab.html` | 534 846 | `c46810df8e037aac30e3eb98f0844d712ba14c2136aae005e1a0261d016a692a` |
| 独立版 `D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html` | 538 042 | `90d7b1763858988055b546a55b22da0c6119c86c9c4b070ecdb27221bb83bbce` |

文件 mtime 也佐证：两份均为 `2026-10-07 02:02:17 (+0800)`，早于本次审计首个命令（02:05）。

SHA 采集命令与原始输出（写入 `sha-before.txt` / `sha-after.txt`）：

```
sha256sum "<fragment>" "<outputs>"
# c46810df8e037aac30e3eb98f0844d712ba14c2136aae005e1a0261d016a692a *.../gnss-swarm-lab.html
# 90d7b1763858988055b546a55b22da0c6119c86c9c4b070ecdb27221bb83bbce *D:/codex/.../outputs/gnss-swarm-lab.html
```

## ② 方法（全部为实测，非推断）

产物结构先以源码反查确认：

- 片段文件 1–742 行 = `<div id="gnss-lab">…</div>`（含 10 个 tab、10 个 panel、26 个 `<canvas>`）
- 743–820 行 = `<style>`（`app/00-style.css` 原样内联）
- 821–10558 行 = `<script>`（全部 lib + panel 代码内联）
- 行号与计数由 `grep -o '<canvas' | wc -l` → **26**、`grep -o 'id="gnss-lab"'` → **1** 得出

宿主降级实验：

1. `build-hosts.js` 读取**同一份片段文件**（只读），生成 4 个宿主页：
   - `host-a-full.html`：`app/99-standalone.css` 的 class 规则 + `:root` 全部变量（模拟正常宿主）
   - `host-b-none.html`：**不含任何宿主 CSS / 变量**（只有片段自带 `<style>`）
   - `host-c-missing-s1.html`：除 `--viz-series-1` 外，其余 class 与变量齐全
   - `host-d-double.html`：同一份片段**注入两次**（观察题）
2. `probe.js`（Playwright 1.62.1 + 自带 Chromium 1234，headless，viewport 1180×900，DSF=1）逐页采集：
   `pageerror` / `console` 错误计数、`getBoundingClientRect()`、canvas `width/height` 属性、`getImageData` 非白/非空像素占比、计算样式探针、tab 点击与滑杆 input 行为、截图。
3. `tabs2-run.js`：因为**未激活面板带 `hidden`，其 canvas 的 rect 必然为 0**，所以额外逐个点击 10 个 tab、每切一次等 1.5 s 再测该面板内 canvas，得到「26 个 canvas 在可见状态下的真实尺寸」。这是"非零几个"的正确口径，两套数据都在下面给出。
4. `dbl.js`：双注入页里对**两份副本分别**取样，并分别点击两份副本的「定位解算」tab。
5. `dist.js`：在 1180 / 700 / 420 三个视口下核对 canvas 是否被拉伸失真。
6. `colortrace.js` / `px.js`：读取解析后的 CSS 变量值与 canvas 实际绘制颜色。

## ③ 片段对宿主的依赖：最小宿主契约清单

### 3.1 CSS 变量（逐条为实测反查结果）

片段的 CSS 变量一共只出现两种用法，覆盖面完全不同：

**(A) 片段 `<style>` 里用 `var()` 直接引用、浏览器不会给你 fallback 的（3 个）**

命令：`sed -n '743,820p' "<fragment>" | grep -o 'var(--[a-z0-9-]*' | sort -u`，输出仅三行：

| 变量 | 用在 | 缺了会怎样（实测） |
|---|---|---|
| `--border` | `#gnss-lab .gl-group` 的 1px 边框 | 边框变 `currentColor`（黑），不是消失 |
| `--muted-foreground` | `.gl-legend` / `.gl-about>summary` / `.gl-glossary>summary` 文字色，及 `.form-select`、`.btn` 的 `border-color` | 落到继承色（host-b 实测：正文纯黑，见 `shots-clean/b-none-viewport.png`） |
| `--background` | `#gnss-lab > .nav.nav-pills` 吸顶条的背景 | 吸顶条变透明；滚动时下方内容会从它背后穿过（本题未做滚动截图，属**未验证边界**） |

**(B) 片段 JS 在运行时通过 `getComputedStyle` 读取、但**自带硬编码 fallback**的（9 个）**

反查命令：`grep -o "color('--[a-z0-9-]*'" "<fragment>" | sort -u`，共 11 次调用、9 个不同变量（`--viz-series-1..4` 各 1 次）。实现见 `<fragment>:6941-6962`：

```js
function color(name, fallback) {
  var p = probeEl();
  p.style.color = 'var(' + name + ')';
  var v = getComputedStyle(p).color;
  if (!v || v === 'var(' + name + ')' || v.indexOf('var(') === 0) return fallback;   // ← 变量缺失走这里
  return v;
}
...
fg: color('--foreground', '#111111'),      mutedFg: color('--muted-foreground', '#666666'),
border: color('--border', '#dddddd'),      muted: color('--muted', '#eeeeee'),
card: color('--card', '#ffffff'),          primary: color('--primary', '#2563eb'),
accent: color('--accent', '#eef2ff'),
s1: color('--viz-series-1', '#2563eb'),    s2: color('--viz-series-2', '#e07b39'),
s3: color('--viz-series-3', '#2f9e6b'),    s4: color('--viz-series-4', '#a855f7')
```

变量清单：`--foreground`、`--muted-foreground`、`--border`、`--muted`、`--card`、`--primary`、`--accent`、`--viz-series-1`、`--viz-series-2`、`--viz-series-3`、`--viz-series-4`（**11 个读取点，其中 `--muted-foreground`、`--border` 与 (A) 重叠**）。

> 注意：片段**不读** `--viz-series-5`、`--viz-series-6`，也不读 `--primary-foreground`、`--card-foreground`、`--accent-foreground`、`--font-size-base`。独立版的 `99-standalone.css:6` 定义了 `--viz-series-5/6` 与 `--font-size-base`，但片段本身用不到 —— 这两项对嵌入**不是**必需。

**(C) 实测的 fallback 后果**（`colortrace.js` + `px.js` 输出）

| 页面 | 解析后的 `--viz-series-1` | `gl-sky-canvas` 实际绘出的主色 |
|---|---|---|
| host-a-full | `#2f6fed` | `rgb(47,111,237)`（= `#2f6fed`） |
| host-b-none | `null`（未定义） | **`rgb(0,0,0)`，全画布只有纯黑一种颜色（8680 px）** |
| host-c-missing-s1 | `null` | `rgb(27,29,34)`（= `#1b1d22`，即 `--foreground` 的值） |

即：缺 `--viz-series-1` 时不会报错、不会白屏，但那一系列图线/点会从蓝色掉成**前景色（接近黑）**，与 `--foreground` 画出的坐标轴撞色 —— 属于**视觉退化**而非功能故障。

### 3.2 宿主必须提供的 CSS class（23 个）

反查命令：`sed -n '1,742p' "<fragment>" | grep -o 'class="[^"]*"' | ...` → 去掉 `gl-*` 私有类后得到下列 23 个，片段自身 `<style>` **一条都没定义它们的基样式**（片段只写了 `#gnss-lab .gl-stats`、`#gnss-lab .gl-group > .gl-field` 这类**后代微调**）：

    card  viz-grid  viz-controls  viz-stat  viz-stat-value
    nav  nav-pills  nav-link  active
    btn  btn-primary
    form-label  form-select  form-range  form-check  form-check-input  form-check-label
    text-small  text-muted  tabular-nums
    progress  progress-bar

其中三档重要度：

- **决定"是否还能看"**：`card`（卡片底色）、`viz-grid`（`display:grid` 三栏指标卡）、`viz-controls`（`display:flex` 控件排布）、`nav/nav-pills/nav-link/active`（tab 胶囊）、`btn/btn-primary`、`form-label/form-select/form-range`
- **只影响可读性**：`text-small`（12px，缺失变 16px）、`text-muted`（次要文字色）、`tabular-nums`（数字等宽）
- **进度条**：`progress` / `progress-bar` —— 缺失时高度胶囊也消失，但 `style="width:0%"` 还在，属于纯装饰
- **独立版也没定义、必须宿主提供（或容忍原生外观）**：`form-check`、`form-check-input`、`form-check-label` —— 这 3 个在片段 `<style>` 和 `app/99-standalone.css` 里**都没有规则**。实测 host-a 下 4 个复选框是浏览器原生样式（`shots-clean/a-full-viewport.png` 中复选框为标准 UA 外观）。

### 3.3 必须保留的 DOM/行为前提

- `#gnss-lab` 这个 id 必须存在且**唯一**（脚本全部用 `document.getElementById('gl-*')` 取元素，见 `<fragment>:10425-10555`）。
- 未激活面板靠 `hidden` 属性控显隐（`activate()` 里 `panel.setAttribute('hidden','')` / `removeAttribute('hidden')`）。宿主**不能**用 `display:block !important` 之类的规则强制展开 —— 那样 10 个面板会同时可见，26 个 canvas 全部按 0 高或超长排布（**未验证边界**，见 ⑥）。

## ④ 三种宿主实测对比

共同条件：同一份片段字节（sha `c46810df…692a`）、Chromium headless、viewport 1180×900、`deviceScaleFactor=1`、加载后等 9 s（冷启动默认会跑一次）、随后逐 tab 激活再测。

### 4.1 汇总表

| 指标 | (a) host-a-full | (b) host-b-none | (c) host-c-missing-`--viz-series-1` |
|---|---|---|---|
| `pageerror` 计数 | **0** | **0** | **0** |
| `console.error` 计数 | **0** | **0** | **0** |
| `console.warning` 计数 | **0** | **0** | **0** |
| 是否白屏 | **否** | **否** | **否** |
| `#gnss-lab` 数量 / canvas 数量 | 1 / 26 | 1 / 26 | 1 / 26 |
| canvas 非零尺寸（**默认 sky 面板可见时**） | 3 / 26 | 3 / 26 | 3 / 26 |
| canvas 非零尺寸（**逐个激活 10 个 tab 后逐面板统计**） | **26 / 26** | **26 / 26** | **26 / 26** |
| 26 个 canvas 中宽×高为 0 的（可见态） | **0** | **0** | **0** |
| sky canvas 属性尺寸 | 560×300 | 572×300 | 560×300 |
| sky canvas 显示尺寸 | 560×300 | 572×300 | 560×300 |
| 显示尺寸/属性尺寸（拉伸比） | 1.000 / 1.000 | 1.000 / 1.000 | 1.000 / 1.000 |
| sky canvas 已绘制非空像素占比 | 5.1 % | 4.8 % | 5.1 % |
| 卡片底色 `cardBg` | `rgb(244,245,247)` | `rgba(0,0,0,0)` | `rgb(244,245,247)` |
| 卡片圆角 `cardRadius` | `10px` | `0px` | `10px` |
| 指标网格 `vizGridDisplay` | `grid` | `block` | `grid` |
| `text-small` 字号 | `12px` | `16px` | `12px` |
| 解析后 `--viz-series-1` | `#2f6fed` | *(不存在)* | *(不存在)* |
| tab 点击可交互 | ✅ 面板 `hidden: true→false`，`aria-selected=true`，`.active` 生效 | ✅ 同上 | ✅ 同上 |
| 滑杆 `input` 事件 | ✅ 值 45 生效 | ✅ | ✅ |
| `window.GLAPP` | 存在，`core` 有，13 个 `panels` 键 | 同左 | 同左 |
| 截图（视口） | `shots-clean/a-full-viewport.png` | `shots-clean/b-none-viewport.png` | `shots-clean/c-missing-s1-viewport.png` |
| 截图（整页） | `shots-clean/a-full-full.png` | `shots-clean/b-none-full.png` | `shots-clean/c-missing-s1-full.png` |
| 截图（逐 tab ×10） | `shots-tabs/a-full-tab-<tab>.png` | `shots-tabs/b-none-tab-<tab>.png` | `shots-tabs/c-missing-s1-tab-<tab>.png` |
| 原始数据（JSON） | `probe-result-both.json`、`probe2-tabs.json` |||

**结论（实测，非推断）**：三种宿主下**都不白屏、都不报错、元素都可点、26 个 canvas 在各自面板可见时全部拿到非零尺寸并成功绘制**。差异**纯在视觉**：host-b 退化成浏览器默认排版（无卡片底色/无网格/无胶囊 tab/字号变大/图表主色变黑）。

### 4.2 26 个 canvas 的实测尺寸（host-a-full，逐 tab 激活后）

| tab | canvas id | 显示尺寸 (w×h) | 属性尺寸 |
|---|---|---|---|
| sky | gl-sky-canvas | 560×300 | 560×300 |
| sky | gl-dop-canvas | 560×300 | 560×300 |
| sky | gl-doppler-canvas | 1140×156 | 1140×156 |
| ca | gl-chip-canvas | 1140×74 | 1140×74 |
| ca | gl-auto-canvas | 560×216 | 560×216 |
| ca | gl-cross-canvas | 560×216 | 560×216 |
| acq | gl-acq-canvas | 1140×208 | 1140×208 |
| acq | gl-acq-profile | 1140×140 | 1140×140 |
| pos | gl-pos-scatter | 560×320 | 560×320 |
| pos | gl-pos-resid | 560×320 | 560×320 |
| pos | gl-pos-iono-canvas | 1140×180 | 1140×180 |
| mp | gl-mp-canvas | 560×320 | 560×320 |
| mp | gl-mp-curve | 560×320 | 560×320 |
| raim | gl-raim-resid | 560×300 | 560×300 |
| raim | gl-raim-scatter | 560×300 | 560×300 |
| raim | gl-raim-pl | 1140×116 | 1140×116 |
| geo | gl-geo-canvas | 1140×432 | 1140×432 |
| atm | gl-atm-canvas | 560×300 | 560×300 |
| atm | gl-atm-err-canvas | 560×300 | 560×300 |
| cold | gl-cold-canvas | 560×214 | 560×214 |
| cold | gl-cold-ttff | 560×210 | 560×210 |
| cold | gl-cold-epoch-canvas | 1140×234 | 1140×234 |
| cold | gl-dll-canvas | 1140×230 | 1140×230 |
| pll | gl-pll-iq | 560×250 | 560×250 |
| pll | gl-pll-phase | 560×250 | 560×250 |
| pll | gl-hatch-canvas | 1140×240 | 1140×240 |

**host-b-none** 的对应值只差 1.4 %（左右各 4 px 的 UA 默认 `body` 边距）：成对出现的 canvas 从 560 → **572**，跨栏的从 1140 → **1164**，高度逐项完全一致（`probe2-tabs.json`）。**host-c** 与 host-a 逐项完全相同。

### 4.3 canvas 拉伸失真检查（`dist.js`）

在 1180 / 700 / 420 三个视口下，host-a 与 host-b 的 sky canvas 显示尺寸与属性尺寸之比**始终为 1.000 / 1.000**（例如 700 px 视口：host-a 320×300 / attr 320×300；host-b 332×300 / attr 332×300）。即脚本已经把 canvas 的 `width/height` 属性同步成 CSS 像素尺寸，**没有出现位图缩放模糊**。

## ⑤ 问题 3：片段是否依赖宿主提供的全局对象

`grep` 反查结果（片段全文）：

| 全局对象 | 出现位置 | 是否必需 | 缺失时的实测/静态结论 |
|---|---|---|---|
| `window.openai` | `:10418` `:10421` `:10492` `:10536` | **否** | 全部有守卫：`:10418` 先 `if (!(window.openai && window.openai.setWidgetState)) return;`；`:10492` / `:10536` 是 `window.openai && window.openai.widgetState` 短路。**实测**：把 `window.openai` 删掉后重跑 host-a / host-b，`pageerror` 0、`console.error` 0，canvas 尺寸与像素数据与删除前**完全一致**（`shots/a-full-noopenai.png`、`shots/b-none-noopenai.png`、`probe-result-both.json` 里的 `[no window.openai]` 组）。唯一后果：宿主若指望 `<div id="gnss-lab">` 里的状态回写 widget state，则不会发生 —— 纯降级。 |
| `ResizeObserver` | `:10478` | **否** | `if (window.ResizeObserver) { … }`，缺失时只是不注册"尺寸变化后重绘"。**实测**（`globals.js`，`delete window.ResizeObserver`）：`pageerror` 0、`console.error` 0，sky canvas 仍为 470×300 / attr 470×300，`GLAPP` 正常。 |
| `matchMedia` | `:7752`（`reduced()`）、`:10487` | **否** | `:7752` 用 `try/catch` 包住，`:10487` 同样 `try{}catch(e){}`。**实测**（`delete window.matchMedia`）：`pageerror` 0、`console.error` 0，尺寸与像素正常。 |
| `performance` | `:2134` `:7577` `:7786` `:7803-7805` `:8978` `:8999` `:9340-9366` `:9492` `:9573` `:10091-10093` | **否** | 有内联 fallback，例如 `:2134` `function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }`、`:7577` `function now() { … }` 同形。**实测**（`Object.defineProperty(window,'performance',{value:undefined})`）：`pageerror` 0、`console.error` 0，尺寸正常 —— fallback 路径实测走通。 |
| `requestAnimationFrame` | `:7792` `:7794` `:10411` `:10481` | **是**（浏览器均有，未做剔除实验） | **未验证边界**：片段**没有** rAF polyfill，若宿主在一个没有 rAF 的环境（极老浏览器 / 被裁剪的 WebView）里跑，`:7792` 等处会直接 ReferenceError。现代宿主不成问题。 |
| `getComputedStyle` | `:6944` | **是** | 同上，无 polyfill；现代浏览器均提供。 |

**结论**：`window.openai` 是**唯一的"宿主 API"**，且是**可选增强**（状态持久化），缺失不产生任何报错。`ResizeObserver` / `matchMedia` / `performance` 三个都有显式守卫或 fallback，实测剔除后功能与绘制均保持。真正被硬依赖的只有 `requestAnimationFrame` 与 `getComputedStyle` 这两个所有现代浏览器都自带的标准 API。

## ⑥ 问题 4：同一份片段在同页注入两次（只做观察，如实记录）

构造页 `host-d-double.html`（片段字节连续出现 **2 次**，`1072024 = 534846×2 + 2332` 字节宿主骨架；校验：`python` 读取片段字节后 `d.count(frag) == 2`）。

观察结果（`dbl.js` + `probe.js` 的 `d-double` 组）：

| 观察项 | 实测值 |
|---|---|
| `pageerror` / `console.error` | **0 / 0** |
| `console.warning` | **0** |
| `#gnss-lab` 数量 | **2**（id 重复） |
| `#gnss-lab canvas` 总数 | **52** |
| `<script>` 数量 | 2 |
| `<style>` 数量 | 3（片段自带 ×2 + 宿主 ×1） |
| `window.GLAPP` | 存在（被第二份脚本覆盖为第二个实例），`core` 有、`panels` 13 键 |
| 副本 1 的 `gl-sky-canvas` | attr **560×300**，非白像素 100 %（被绘制） |
| 副本 2 的 `gl-sky-canvas` | attr **300×150**（= canvas 默认尺寸，**从未被绘制/定尺寸**） |
| 点击**副本 1** 的「定位解算」tab | 面板 `hidden: true → false`，**正常切换** |
| 点击**副本 2** 的「定位解算」tab | 面板 `hidden: true → true`，**无任何反应** |
| 页面总高 | 2610 px（两份片段垂直堆叠，**不是并排**） |

**机制（静态推断 + 与实测一致）**：脚本全程用 `document.getElementById('gl-tab-*')` / `getElementById('gl-panel-*')` 取元素（`:10425-10434`、`:10529`），`getElementById` 只会返回**文档里第一个**匹配 id 的元素。所以：

- 两份脚本各自注册的监听器都绑到了**副本 1** 的按钮上；副本 2 的按钮永远收不到处理逻辑 → 副本 2 的 tab 点击无效。
- `activateTab` 只操作副本 1 的 10 个面板。
- 副本 2 的 26 个 canvas 从未进入 `redrawVisible` 的绘制循环 → 保持 canvas 默认 300×150 白板。
- 副本 1 的 canvas 仍被正确绘制（因为 `document.querySelectorAll('#gnss-lab canvas')` 命中的是**两个副本的全部 52 个**，但 `ResizeObserver` 的 `:10483-10484` 遍历会覆盖 52 个；真正定尺寸靠各 panel 自己的 `render` 用 `getElementById` 找 canvas，故只有副本 1 被定尺寸）。

**结论**：双注入**不崩溃、不报错、不白屏**，但**第二份是不可用副本**（按钮无效、canvas 停在 300×150 空白）。`GLAPP` 会被覆盖成第二个实例，不过因为两份脚本逻辑等价、且都指向副本 1 的 DOM，实践中没有观察到额外故障 —— 这一条**如实记录为"未发现额外故障"，而非"安全"**。

## ⑦ 最小宿主契约清单（放行阈值）

### 7.1 必须提供（给不到就会"坏"）

| 项 | 具体内容 | 给不到的后果（实测） |
|---|---|---|
| 容器 | `<div id="gnss-lab">` 在宿主页里**唯一** | 重复 id → 只有第一份可用（见 ⑥） |
| 显隐机制 | 尊重面板的 `hidden` 属性（不要 `display:block !important`） | 未验证边界，推断会导致 10 个面板同时展开 |
| CSS 变量（3 个硬引用） | `--border`、`--muted-foreground`、`--background` | 边框变黑、次要文字变黑、吸顶条透明 |
| CSS class（8 个"决定是否还能看"） | `card`、`viz-grid`、`viz-controls`、`nav` + `nav-pills` + `nav-link` + `active`、`btn` + `btn-primary`、`form-label` + `form-select` + `form-range` | host-b 实测：无卡片底色、三栏指标卡塌成竖排、tab 变原生按钮、控件满行——**能用但很难看**（`shots-clean/b-none-viewport.png`） |

### 7.2 建议提供（给不到只是变丑/变挤）

| 项 | 内容 |
|---|---|
| CSS 变量（11 个 JS 读取点，均有 fallback） | `--foreground`、`--muted-foreground`、`--border`、`--muted`、`--card`、`--primary`、`--accent`、`--viz-series-1..4` |
| CSS class（其余 12 个） | `viz-stat`、`viz-stat-value`、`form-check`、`form-check-input`、`form-check-label`、`text-small`、`text-muted`、`tabular-nums`、`progress`、`progress-bar` |
| 宿主 API | `window.openai.setWidgetState` + `window.openai.widgetState`（可选增强，缺失纯降级） |

### 7.3 如果宿主不提供怎么办 —— 具体建议

**建议 1（最高性价比）：把 3 个硬引用变量的 fallback 写进片段的 `app/00-style.css`，一行就够。**

片段自己的 `<style>` 里目前是裸 `var()`：

```css
#gnss-lab .gl-group { border: 1px solid var(--border); }              /* ← 无 fallback */
#gnss-lab .gl-group > .gl-legend { color: var(--muted-foreground); }  /* ← 无 fallback */
#gnss-lab > .nav.nav-pills { background: var(--background); }         /* ← 无 fallback */
```

改成（与独立版 `99-standalone.css:1-7` 的浅色值一致）：

```css
#gnss-lab .gl-group { border: 1px solid var(--border, #d8dbe0); }
#gnss-lab .gl-group > .gl-legend,
#gnss-lab .gl-about > summary,
#gnss-lab .gl-glossary > summary { color: var(--muted-foreground, #5a5f6a); }
#gnss-lab > .nav.nav-pills { background: var(--background, #ffffff); }
#gnss-lab .form-select, #gnss-lab .btn { border-color: var(--muted-foreground, #5a5f6a); }
#gnss-lab .gl-group { border-color: var(--muted-foreground, #5a5f6a); }
```

这样 (a)(b)(c) 三种宿主的**变量**维度就完全一致，(b) 与 (c) 之间的差异也消失。

**建议 2：给片段自己的 `<style>` 补一层最小 class 兜底。** 现在的片段对宿主 class 是"全有或全无"，缺了就从"设计过的界面"直接掉到"浏览器默认"。可以在片段 `<style>` 末尾追加一段**只在变量/规则缺失时生效的保守兜底**（用 `@supports` 或直接给同名规则近似值），至少覆盖这 6 条：`card`（底色+圆角）、`viz-grid` / `viz-controls`（grid / flex）、`nav-pills .nav-link` + `.active`（胶囊）、`btn` + `btn-primary`、`form-label` / `form-select` / `form-range`、`text-small`。注意：**这条建议会改变"宿主优先"的层叠关系**，如果宿主已经提供了完整 class，兜底规则必须放在**片段 `<style>` 内部且不带 `!important`**，否则会覆盖宿主的主题（例如暗色模式的 `--card`）。

**建议 3：如果不想改 CSS，就在宿主侧做"契约自检"。** 宿主加载片段后执行一次：

```js
const cs = getComputedStyle(document.querySelector('#gnss-lab'));
const missing = ['--background','--foreground','--border','--muted-foreground','--card']
  .filter(k => !cs.getPropertyValue(k).trim());
if (missing.length) console.warn('[gnss-lab] host contract missing:', missing);
```

**建议 4：明确记录"不支持同页注入两份"。** 因为 id 是硬编码的 `gl-*` 前缀，去重需要把 id、`getElementById`、`querySelectorAll('#gnss-lab …')` 全部改成"在根节点内查找 + 唯一前缀"，属于**大改**。当前最省事的做法是宿主侧保证"一个页面只渲染一份片段"，或者把第二份放进 `<iframe>` / shadow root 里做隔离（**未验证**：片段在 shadow root 内能否正常取到 `document.getElementById`，见 ⑨）。

## ⑧ 未验证边界（明确列出，不计入结论）

1. **不提供宿主的 `--muted-foreground` 时的暗色模式行为** —— 本次三种宿主全部是浅色（`prefers-color-scheme` 未强制），暗色下 `99-standalone.css:8-16` 会定义另一套值；片段在暗色宿主里缺变量时的表现**未测**。
2. **吸顶导航滚动时的穿透**：`#gnss-lab > .nav.nav-pills { background: var(--background) }` 缺 `--background` 时会变透明。本例没有做"滚动中截图"，所以"内容从吸顶条后面穿过"是**推断**，不是观测。
3. **宿主用 `display:block !important` 强制展开所有 `.gl-panel`**：会同时暴露 10 个面板和 26 个 canvas 的真实布局后果，**未测**。
4. **`requestAnimationFrame` / `getComputedStyle` 被剔除**：二者片段无 polyfill，属于硬依赖；本次**没有**做剔除实验（现代浏览器均自带）。
5. **Shadow DOM / iframe 隔离下的双注入**：`getElementById` 在 shadow root 内的可见性未测；iframe 隔离也未测。
6. **`console.warning` 与网络请求**：片段不发起网络请求（全部计算在本地），本次未监听 `requestfailed`；冷启动涉及大批量同步计算，长任务/主线程阻塞指标（如 `PerformanceObserver` 的 longtask）未采集。
7. **长时间稳定性**：每页只观测约 9 s + 逐 tab 1.5 s，未做分钟级内存/泄漏观测。
8. **`--viz-series-5` / `--viz-series-6` / `--primary-foreground` / `--card-foreground` / `--accent-foreground` / `--font-size-base`**：静态反查确认片段**不读取**（`grep -o "color('--…'"` 与 `grep -o 'var(--…'` 均未命中），因此本次未做剔除实验；"提供与否都不影响"是**静态推断**。

## ⑨ P0 / P1 / P2 分级

按"宿主不配合时坏到什么程度"排序，全部有上文实测或反查支撑。

### P0 —— 0 条

没有发现任何会导致**报错、白屏、不可交互、canvas 尺寸为 0** 的问题。三档宿主 + `window.openai` 删除 + `ResizeObserver` / `matchMedia` / `performance` 逐一删除，共 8 个组合，`pageerror` 与 `console.error` **全部为 0**。

### P1 —— 2 条

**P1-1｜缺 `--viz-series-*` 时图表主色掉成"与坐标轴同色"，视觉语义丢失（实测）**
`color()` 的 fallback 是 `#2563eb`，但一旦变量缺失，host-b 下 `gl-sky-canvas` **整张画布只有 `rgb(0,0,0)` 一种非空颜色（8680 px）**；host-c（只缺 `--viz-series-1`）下主色变 `rgb(27,29,34)`（= `--foreground`）。前者是黑线画在"黑轴"上，后者是深色前景色与坐标轴撞色。**画面不坏、不报错，但多系列图的区分度归零。**
证据：`colortrace.js` 输出、`px.js` 输出、`shots-clean/b-none-viewport.png`（DOP 曲线全黑）、`shots-clean/c-missing-s1-viewport.png`。
修复建议：把片段 `color()` 调用里的 fallback 从 `#2563eb` 改成独立版同款的 `#2f6fed`，并在宿主契约里把 `--viz-series-1..4` 列为**建议提供**。

**P1-2｜片段 `<style>` 里 3 个裸 `var()` 没有 fallback，缺变量时边框/文字/吸顶底色直接劣化（实测 + 反查）**
`--border`、`--muted-foreground`、`--background` 在 `#gnss-lab .gl-group`、`.gl-legend`、`.gl-about>summary`、`.gl-glossary>summary`、`.form-select`、`.btn`、`#gnss-lab > .nav.nav-pills` 里都是无 fallback 的 `var()`。host-b 实测：`.gl-group` 边框变黑（`currentColor`）、次要文字变纯黑（`shots-clean/b-none-viewport.png` 中"掩膜 10°·在轨 24 颗"等辅助文字与正文同色）、吸顶条背景透明。
证据：`sed -n '743,820p' | grep -o 'var(--…'` 仅三行；host-b 计算样式 `cardBg: rgba(0,0,0,0)`、`textSmallSize` 16px。
修复建议：见 ⑦.3 建议 1。

### P2 —— 3 条

**P2-1｜同页注入两份时，第二份不可用（实测）**
`#gnss-lab` ×2、canvas = 52、`pageerror` 0。但点击**副本 2** 的「定位解算」tab 后 `hidden` 仍为 `true`（无反应），副本 2 的 `gl-sky-canvas` 停在 canvas 默认 **300×150** 且从未被绘制。
证据：`dbl.js` 输出、`shots-clean/d-double-viewport.png`、`host-d-double.html`。

**P2-2｜`form-check` / `form-check-input` / `form-check-label` 三个 class 无任何样式定义（反查 + 实测）**
片段 `<style>`（743-820）与 `app/99-standalone.css`（1-40）都**没有**这 3 条规则。host-a 下 4 个复选框是浏览器原生外观（`shots-clean/a-full-viewport.png` 中「多系统时估计系统间钟差（ISB）」一行）。不报错，但独立版里这 4 处也是 UA 默认样式 —— 属于**独立版与片段共有的既有缺口**，不是嵌入引入的。
修复建议：在 `app/99-standalone.css` 里补 `form-check-label { display:inline-flex; align-items:center; gap:6px; }` 之类的最简规则（若采纳，需同时在片段的 `00-style.css` 里补同款，否则嵌入侧仍然没有）。

**P2-3｜`GLAPP` 是全局单例，双注入时被第二份覆盖（实测）**
`window.GLAPP` 在片段里用 `globalThis.GLAPP = globalThis.GLAPP || {}`（`:6926`、`:7031`、`:7523`、`:9161`）累积，两份脚本共存时后者沿用同一对象并覆盖 `core` / `panels`。本次实测**没有观察到因此产生的额外报错或错误绘制**（两份逻辑等价、且都指向副本 1 的 DOM），所以只记为 P2 观察项；若将来有人在宿主页里 `delete window.GLAPP.core` 后再注入第二份，行为**未验证**。

### 计数

| 级别 | 条数 |
|---|---|
| P0 | **0** |
| P1 | **2** |
| P2 | **3** |
| 合计 | **5** |

### 最严重 3 条

1. **P1-1** 缺 `--viz-series-*` → 图表主色掉成与坐标轴同色（host-b 实测整图只剩纯黑 `rgb(0,0,0)`），多系列图失去区分度。
2. **P1-2** 片段 `<style>` 里 `--border` / `--muted-foreground` / `--background` 三个裸 `var()` 无 fallback → 缺变量时边框、辅助文字、吸顶底色直接劣化。
3. **P2-1** 同页注入两份片段时，第二份的 tab 按钮完全无反应、canvas 停在 300×150 默认尺寸（`getElementById` 只命中第一份）。

## ⑩ 证据文件清单（全部位于 `D:/codex/2026-10-05/new-chat/review/ds41/w3c-host/`）

脚本（可复跑）：

- `build-hosts.js` —— 从只读片段生成 4 个宿主页
- `probe.js` —— 主探针（`node probe.js both`），输出 `probe-result-both.json`
- `tabs2.js` + `tabs2-run.js` —— 逐 tab 激活后测 26 个 canvas，输出 `probe2-tabs.json`
- `dbl.js` —— 双注入逐副本取样
- `dist.js` —— 三个视口下的拉伸比检查
- `colortrace.js` / `px.js` —— CSS 变量解析值与 canvas 实绘颜色
- `globals.js` —— `ResizeObserver` / `matchMedia` / `performance` 剔除实验
- `shots-clean.js` —— 统一视角截图

生成的宿主页：`host-a-full.html`、`host-b-none.html`、`host-c-missing-s1.html`、`host-d-double.html`

数据：`probe-result-both.json`（32 KB）、`probe2-tabs.json`（14 KB）、`probe-result-normal.json`

截图：

- `shots-clean/{a-full,b-none,c-missing-s1,d-double}-{viewport,full}.png`
- `shots-tabs/{a-full,b-none,c-missing-s1}-tab-<sky|ca|acq|pos|mp|raim|geo|atm|cold|pll>.png`（30 张）
- `shots/{a-full,b-none,c-missing-s1,d-double}.png`、`shots/{a-full,b-none}-noopenai.png`

复跑方式（应参考运行环境实际路径）：

```bash
cd D:/codex/2026-10-05/new-chat/review/ds41/w3c-host
node build-hosts.js
NODE_PATH="C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules" node probe.js both
NODE_PATH="…/node_modules" node tabs2-run.js
NODE_PATH="…/node_modules" node dbl.js
```

> 说明：这里用的是内置 runtime 的 `playwright@1.62.1`（`NODE_PATH` 指向 `…/dependencies/node/node_modules`），因为它与已安装的 `chromium-1234` 匹配；全局 `playwright@1.58.2` 会去找 `chromium_headless_shell-1208` 并失败。
