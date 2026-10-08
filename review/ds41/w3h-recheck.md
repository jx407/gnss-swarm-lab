# ds4.1 只读复核：2abb02a7 五条反例是否修好

- 复核时间：2026-10-07（Asia/Shanghai）
- 受审文件：
  - 独立版：`D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html`
  - 内联片段：`C:/Users/31040/.codex/visualizations/2026/10/05/01a10c98-950b-7151-a024-b4d3630dcd87/gnss-swarm-lab.html`
- 只读边界：没有修改受审 HTML。复核产物在 `review/ds41/w3h-recheck/`。

## ① SHA-256（开始/结束一致）

开始与全部探针结束后各执行一次：

```bash
sha256sum outputs/gnss-swarm-lab.html \
  "C:/Users/31040/.codex/visualizations/2026/10/05/01a10c98-950b-7151-a024-b4d3630dcd87/gnss-swarm-lab.html"
```

| 对象 | SHA-256（开始=结束） | 字节 |
|---|---|---:|
| 独立版 | `5e3f188ae9c93e48df0a51313cb01d4c96b5fd949329873d160eccd95cf36f05` | 548563 |
| 内联片段 | `a8b3d3069c0afec7dd249797dd59e62bdbc46bd651e490e846bae860dafdcd52` | 545352 |

## ② 五条逐项结论

### 1. 图表越界：已修

- 运行：`review/ds41/w3h-recheck/w3-charts-recheck.redirected.js`
- 输出：`review/ds41/w3h-recheck/charts-recheck.out.txt`
- 原始计数：`CLIP=0`、`TCOLL=0`（420 与 980 全画布扫描）。
- 420：`gl-cold-canvas ... clip=0 textColl=0 ... css=380x340`
- 980：`gl-cold-canvas ... clip=0 textColl=0 ... css=460x340`
- 没有 `1000` 越界行。
- 环境说明：`D:/.../.pw-browsers` 中没有探针所需的 `chromium_headless_shell-1234`；重定向副本仅改了 `OUT` 与 `executablePath`，改用本机系统 Chrome（Chromium 内核），探针逻辑未改。

结论：**已修**。420/980 在系统 Chrome 下均无 CLIP。

### 2. 同坐标文字重叠：已修

同一轮 `w3-charts-recheck` 原始输出：

- `TCOLL` 行数：`0`
- 420：`gl-auto-canvas ... text=8 clip=0 textColl=0`
- 420：`gl-cross-canvas ... text=8 clip=0 textColl=0`
- 980：`gl-auto-canvas ... text=8 clip=0 textColl=0`
- 980：`gl-cross-canvas ... text=8 clip=0 textColl=0`

静态对照：`work/gnss-swarm/app/20-ca.js:48` 明确注明删去 t=0 的重复绘制，代码只剩一次循环绘制。

结论：**已修**。

### 3. landmark + 吸顶：未修（landmark 已修；吸顶实测回归）

DOM/可访问性实测（420/980 相同）：

- `<main>`：1 个
- `<nav aria-label>`：1 个，名称 `工作台标签页`
- `role=region`：1 个，`id=gl-panels`，名称 `实验面板（10 个标签页）`
- Aria snapshot：`main` / `navigation "工作台标签页"` / `region "实验面板（10 个标签页）"`
- 片段文件：`<main>` 0 个、`<nav aria-label>` 1 个，符合“宿主片段不重复 main”。

`#gnss-lab nav > .nav.nav-pills` 的高度与行数：

| 宽度 | height | rows | computed position |
|---|---:|---:|---|
| 420 | 73 px | 2 | `sticky` / `top:0px` |
| 980 | 43 px | 1 | `sticky` / `top:0px` |

但实际吸顶失效。滚动后实测：

| 宽度 | scrollY | nav rect.top | 期望 |
|---|---:|---:|---:|
| 420 | 300 | `-122.125` | `0` |
| 980 | 300 | `-158.719` | `0` |

原因边界（已验证结构，机制为推断）：被设 sticky 的 `.nav` 是新 `<nav>` 的唯一子元素，父 `<nav>` 高度分别只有 73/43 px；滚动超出这 73/43 px 后，sticky 的包含块已经结束，元素随父级滚走。

结论：**未修（部分）**。landmark 修好了，但“吸顶样式仍然生效”的实际行为没有满足。

### 4. “先看 / 所以”：已修

口径：面板激活、`<details>` 收起，读取每个 tab 面板内第一个 `p.gl-lead` 的完整文本；逐页布尔结果：

| 页 | 先看 | 所以 |
|---|---:|---:|
| 星座几何 | 是 | 是 |
| C/A 码 | 是 | 是 |
| 捕获搜索 | 是 | 是 |
| 定位解算 | 是 | 是 |
| 多径与遮挡 | 是 | 是 |
| RAIM 检核 | 是 | 是 |
| 全球几何 | 是 | 是 |
| 误差预算 | 是 | 是 |
| 冷启动 | 是 | 是 |
| 载波跟踪 | 是 | 是 |

420×844 下首句 `top`：10 页全部为 `285.38 px`；同级 nav bottom 为 `250.88 px`，初始视口中没有压住首句。

结论：**已修**。10/10 同时命中“先看”和“所以”。

### 5. 术语覆盖：已修

从 DOM 真实读取 `details.gl-glossary`：

- 条目数：`44`
- `termStrongs` 中已存在：`ISB`、`ACQ`、`LS`
- 原文依次为：
  - `ISB：系统间偏差（inter-system bias）——不同星座之间的钟差偏差。`
  - `ACQ：捕获（acquisition），即"在二维面上找相关峰"这一步。`
  - `LS：最小二乘（least squares）的缩写，见上面「最小二乘」。`

结论：**已修**。

## ③ 新角度结果

### A. 320px 全画布扫描：发现新问题

- 探针：420/980 同逻辑，仅 `WIDTHS=[320]`；stdout：`review/ds41/w3h-recheck/charts-320.out.txt`
- 原始计数：**CLIP=9、TCOLL=5**
- 明确例子：
  - `gl-acq-profile`：`多普勒 2250 Hz 这一行的相关剖面` 右端 `355.098 > canvas 280`
  - `gl-cold-epoch-canvas`：定位误差行右端 `333.398 > canvas 280`
  - `gl-doppler-canvas`：说明文字右端 `316.829 > canvas 280`
  - `gl-mp-canvas`：说明文字右端 `301.397 > canvas 280`
  - `gl-raim-pl`：文字右端 `297.749 > canvas 280`
- TCOLL 仍出现于 `gl-atm-canvas`、`gl-cross-canvas`、`gl-pos-iono-canvas`、`gl-pos-resid`、`gl-raim-resid`。
- 结论：320px 下存在可复现的图表文字越界/碰撞；没有 pre-fix 320 基线，故不能证明“本轮引入”。它至少是一个未覆盖的新反例。

### B. hasTouch:true + 420：该角度未发现新反例

- 实测 tap `#gl-tab-acq` 成功：`acqSelected=true`、`acqHidden=false`、`skyHidden=true`
- 所有 10 个 tab 的命中高度均为 `44 px`，最小宽度 `52 px`
- 文档横向溢出：`0`
- nav：height `101 px`、2 行、`position:sticky`
- console/page errors：0

### C. `<details>` 展开：该角度未发现横向反例

- 320：closed `36 px` → open `1694 px`，`scrollWidth=clientWidth=280`，文档溢出 0
- 420：open `1442 px`，`scrollWidth=clientWidth=380`，文档溢出 0
- 两个宽度均无 console/page errors。

### D. 打印 PDF：条件性新观察

- 文件：`review/ds41/w3h-recheck/standalone-print.pdf`
- `pdfinfo`：`Pages: 2`，A4
- 渲染：第 2 页只剩页尾按钮/折叠说明，主体仍是当前激活面板。
- 判断：如果“打印”只期望当前面板，则不是缺陷；如果期望一次打印 10 个 tab，则当前实现不满足。

## ④ 新发现的问题

1. **最重要：新增 `<nav>` 后吸顶实际失效**。420 scrollY=300 时 nav `top=-122.125`；980 为 `-158.719`，不是 0。
2. **320px 图表仍有 9 个 CLIP、5 个 TCOLL**。该宽度没有上一版基线，不能证明由本轮引入，但不能算被这轮五条修复覆盖。
3. **打印 PDF 只呈现当前激活面板**，生成 2 页；是否算缺陷取决于打印预期。
4. 420/980 的文档本身没有横向溢出；hasTouch 组合和 details 展开未发现新横向溢出。

## ⑤ 未验证边界

- 指定 `.pw-browsers` 没有 Chromium headless shell 1234；1/2 项结论为系统 Chrome 下复现，不是指定 Playwright bundled Chromium 的 bit-for-bit 运行。
- 320px 探针没有 pre-fix 快照，故只能报告“存在”，不能判定“由本轮引入”。
- `<details>` 只检查展开后的横向尺寸和错误，不判定所有长文本在视觉上是否舒适。
- 打印只验证页数、PDF 生成及第 1/2 页渲染，不验证分页符位置是否最优。
- Firefox/WebKit 未跑图表探针；本报告结论仅覆盖 Chromium/系统 Chrome 实测。

## 产物

- `review/ds41/w3h-recheck/charts-recheck.out.txt`
- `review/ds41/w3h-recheck/new-angles.out.txt`
- `review/ds41/w3h-recheck/new-angles.json`
- `review/ds41/w3h-recheck/charts-320.out.txt`
- `review/ds41/w3h-recheck/standalone-print.pdf`
- `review/ds41/w3h-recheck/print-page-1.png`
- `review/ds41/w3h-recheck/print-page-2.png`
