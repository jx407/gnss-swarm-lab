# ds4.1 单文件教学网页“打开路径”健壮性审计

审计对象：`D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html`  
审计类型：只读；未修改 `outputs/`、`work/gnss-swarm/app/`、`shell.html`、`tests/`、`qa/`、`HANDOFF.md`。  
审计时间：2026-10-07 约 01:16–01:29（Asia/Shanghai）  
浏览器/运行方式：Chromium headless + Playwright；Node `v24.11.1`；`file://` 直开。  
最终评级：P0=0，P1=0，P2=3（2 条页面轻量观察，1 条交付/复现风险：SHA 未冻结）。

## 1. 绑定 SHA 与变更记录

最终结论绑定的 SHA-256：

```text
437edb2fa0ee2cc8a88c076a80193bbe936799a020b329aba54ab8f6458346eb  outputs/gnss-swarm-lab.html
```

文件大小/修改时间（最后核对）：

```text
533410 bytes
2026-10-07 01:26:07.563205400 +0800
```

哈希中途确有变化，按用户要求重测。观察到的时间线：

| 时间 | SHA-256 前 8 位 | 处理 |
|---|---:|---|
| 初次读取 | `d8ff778b` | 后续文件被外部改动，旧结果作废 |
| 约 01:17:58 | `1766372e` | 曾重测；后续再次变化 |
| 约 01:20:12 | `0eb721e1` | 曾重测；后续再次变化 |
| 约 01:22:30 | `7629ea94` | 曾重测；后续再次变化 |
| 约 01:26:07 | `437edb2f` | 最终重测；`raw-results.json`、`zero-clean.json`、`pll-breakdown.json`、`refresh-history.json`、`cold-background-probe.json` 的 start/end SHA 均为该值 |

最终五个审计产物的 `sha256Start == sha256End == 437edb2f...`，未在各自审计期间变化。若当前页面 SHA 不是 `437edb2f...`，本报告结论不自动适用，应重新运行。

## 2. 方法

核心命令：

```bash
cd D:/codex/2026-10-05/new-chat
sha256sum outputs/gnss-swarm-lab.html
node review/ds41/w3-open/audit-open-path.js
node review/ds41/w3-open/clean-zero.js
node review/ds41/w3-open/pll-breakdown.js
node review/ds41/w3-open/refresh-history.js
node review/ds41/w3-open/cold-background-probe.js
pdfinfo review/ds41/w3-open/print.pdf
```

关键口径：

- 冷启动：3 次全新 Playwright `browser context`，1280x900，DPR=1，`file://` 直开。
- `domContentLoaded`：取页面 `performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd`。
- 首帧可见：默认 `sky` 面板第一个 canvas 出现非透明像素。
- “全部 10 个面板绘制完成”：依次点击 10 个标签页，并等待当前面板所有 canvas 出现非透明像素；不等价于所有后台异步计算完全结束。
- 零错误：另跑 `clean-zero.js`，不使用 `getImageData` 读取 canvas，避免审计工具自身触发的 Canvas2D warning。
- 离线：`context.setOffline(true)`；全部 request/route 记录；外链判定正则 `^(https?|wss?|ftp):`。
- 重复切换：10 个标签页 2 轮，随后对 `#gl-pos-run` 程序化快速点击 20 次。
- 缩放：CSS zoom 0.5/2，以及 `deviceScaleFactor` 0.5/2。
- 打印：`page.pdf({ format: 'A4', printBackground: true })`，并用 `pdfinfo`/`pdftoppm` 观察。

原始产物：

- `D:/codex/2026-10-05/new-chat/review/ds41/w3-open/raw-results.json`
- `D:/codex/2026-10-05/new-chat/review/ds41/w3-open/zero-clean.json`
- `D:/codex/2026-10-05/new-chat/review/ds41/w3-open/pll-breakdown.json`
- `D:/codex/2026-10-05/new-chat/review/ds41/w3-open/refresh-history.json`
- `D:/codex/2026-10-05/new-chat/review/ds41/w3-open/cold-background-probe.json`
- `D:/codex/2026-10-05/new-chat/review/ds41/w3-open/nojs-fullpage.png`
- `D:/codex/2026-10-05/new-chat/review/ds41/w3-open/print.pdf`

## 3. 逐项结论

### 3.1 冷启动时间

纯页面自身耗时（`performance.now()` 时间轴，单位 ms）：

| 轮次 | domContentLoaded | 首帧可见 | 10 面板 canvas 均见像素 |
|---|---:|---:|---:|
| 1 | 59.7 | 85.0 | 3073.7 |
| 2 | 59.9 | 78.6 | 2888.6 |
| 3 | 60.0 | 84.9 | 2960.8 |
| 中位数 | 59.9 | 84.9 | 2960.8 |

结论：默认首屏很快（中位 `84.9 ms`）。“全部 10 个面板绘制完成”中位 `2960.8 ms`，但 3 次里 1 次为 `3073.7 ms`，略超 3 秒。

各面板到达时间中位数：

```text
sky 131.1, ca 201.2, acq 355.6, pos 682.6, mp 752.4,
raim 861.2, geo 1012.6, atm 1077.9, cold 1372.5, pll 2959.8 ms
```

耗时定位：

- 最后 1,500 ms 主要落在 `cold -> pll` 段：`pll` 中位 2959.8 ms，`cold` 中位 1372.5 ms，差值约 1587.3 ms。
- 单独直开 `pll` 面板时，实际 PLL 面板墙钟约 227–243 ms；内部采样为 `makeSignal` 60.5–62.1 ms、`pllTrack` 32.8–34.3 ms、`correlateIQ` 64.1–66.2 ms、`hatchSmooth` 0.1–0.3 ms。
- 额外探针显示，切到 `pll` 时前一个 `cold` 面板仍在后台运行：`coldRunning=true, coldItems=2`；之后 `cold.state.running` 变 false 在同轮为 5479 ms，`pll.hasRun` 为 5481 ms。
- 推断：这不是 PLL 数学模块单独慢，而是前面 `cold` 面板的异步逐星任务仍在排队/运行，导致继续切到 PLL 时感知到约 1.5–5.5 s 的尾部耗时。该推断有上述运行时状态和采样耗时支持，但不是源码级火焰图结论。

### 3.2 零错误

清洁零错误测量（`zero-clean.js`，2 次，未用 canvas 像素采样）：

| 轮次 | console error/warning | pageerror | requestfailed | response 非 2xx | 外部请求 |
|---|---:|---:|---:|---:|---:|
| 1 | 0 | 0 | 0 | 0 | 0 |
| 2 | 0 | 0 | 0 | 0 | 0 |

结论：页面自身零错误/零 warning 通过。

审计脚本的 canvas 像素采样上下文另会触发 Chromium warning：

```text
Canvas2D: Multiple readback operations using getImageData are faster with the willReadFrequently attribute set to true.
```

计数：冷启动 3 次各 26 条；离线 6 条；重复切换 26 条；CSS zoom 26 条；DPR 0.5/2 各 10 条。`pageerror=0`、`requestfailed=0`、非 2xx=0 始终成立。页面源码 grep 未发现 `getImageData`/`willReadFrequently`，因此这些 warning 归因于审计采样，不归因于页面。

### 3.3 离线可用

`context.setOffline(true)` 后：

- `domContentLoaded` 68.4 ms；首帧可见 96.2 ms；切到 pos 后 canvas 可绘制 182.2 ms。
- 请求总数 1，scheme 为 `file`；外部请求清单 `[]`。
- `page.route('**')` 命中 1 次，均为本地 file；外部 route 请求清单 `[]`。
- `requestfailed=0`，非 2xx=0。

源码 grep 也未发现 `http/https`、`<script src>`、外链字体/图片、`fetch(`、`XMLHttpRequest`。  
边界：`navigator.onLine` 在 Playwright offline context 下仍返回 `true`，因此本报告不以 `navigator.onLine` 作为离线性证据，只采用 offline context + request/route 日志。

### 3.4 无 JS 降级

`javaScriptEnabled:false` 下截图：`nojs-fullpage.png`。

观察：

- 页面不是整页空白。
- `body.innerText` 长度 591，含标题、引导语、10 个标签文字、`sky` 面板的静态表单/文案。
- 可见面板：`gl-panel-sky`；其余 9 个面板因静态 `hidden` 保持隐藏。
- 26 个 canvas 均为默认 300×150，无明显图表绘制；JS 关闭时不期望 canvas 自动绘图。

结论：只作为降级观察，不作为缺陷；无 JS 时是“静态首屏 + 不可交互”，不是空白页。

### 3.5 重复打开/切换与快速连点

- 10 个标签页连续切换两轮：共 20 次切换；`blankOrUnpainted=0`。
- 每次切换后，当前可见面板 canvas 都有非透明像素；未出现“面板渲染出错”文本。
- 对 `#gl-pos-run` 快速程序化点击 20 次：95 ms 内 settled；结果文本仍为正常统计文本，`htmlHasRenderError=false`。
- 该上下文仍有上述 26 条审计 `getImageData` warning；`pageerror=0`、`requestfailed=0`、非 2xx=0。
- 未观察到需要重新加载。

### 3.6 缩放与打印

缩放观察（CSS zoom）：

- 200%：`sky/acq/mp/raim/atm/pll` 出现 `#gnss-lab.scrollWidth - clientWidth = 4 px` 的内部横向溢出；但 `document.scrollWidth == document.clientWidth == 1280`，页面文档本身不横向滚动。
- 50%：`mp` 出现同样 4 px 内部溢出；文档本身不横向滚动。

`deviceScaleFactor` 观察：

- DPR 0.5：`mp` 出现 4 px 内部溢出；文档本身不横向滚动。
- DPR 2：`mp` 出现 4 px 内部溢出；文档本身不横向滚动。

打印观察：

```text
print.pdf: 213843 bytes
Pages: 2
Page size: 595.92 x 842.88 pts (A4)
```

- `page.pdf()` 成功，无 JS 异常。
- `sky` 面板内容横向没有超过 1240 CSS px；首屏 canvas 未被横向裁切。
- PDF 为 2 页；第 1 页含 `sky` 面板主要内容，第 2 页为收尾详情。未观察到 `sky` canvas 被裁切。
- 打印时只有当前可见/默认 `sky` 面板进入 PDF，其余 9 个 `hidden` 面板不会出现在 PDF。这是打印行为观察，不判为打开路径缺陷。

### 3.7 刷新/前进后退

专项 `refresh-history.js`：

- 初始：`sky`，history length=2。
- 点击到 `geo`：`geo`，history length=2。
- 刷新：回到 `sky`，history length=2。
- Back：回到 `about:blank`；这不是页面异常，而是 file 页面历史栈中前一入口。
- Forward：回到 `file:///.../gnss-swarm-lab.html`，当前为 `sky`。

结论：刷新会回默认页；Back/Forward 记录如上，按要求只记录，不判缺陷。

## 4. 最严重问题清单

1. **P2：10 面板全部画完接近 3 秒，且 `cold` 后台任务可能拖尾。**  
   `allTenPanelsPainted` 原始值 3073.7 / 2888.6 / 2960.8 ms，中位 2960.8 ms；`cold -> pll` 中位增量约 1587.3 ms；后台探针中切 PLL 时 `coldRunning=true, coldItems=2`，`coldRunningFalseMs=5479`。默认首帧仍仅 84.9 ms。

2. **P2：缩放/DPR 下有少量内部横向溢出。**  
   CSS zoom 200% 时 6 个面板 `#gnss-lab.scrollWidth-clientWidth=4 px`；`mp` 在 50% CSS zoom、DPR 0.5、DPR 2 下同样为 4 px。`document.scrollWidth==clientWidth==1280`，未见文档级横向滚动。

3. **P2：审计期间 SHA 未冻结。**  
   页面 SHA 在审计过程中依次出现 `d8ff778b`、`1766372e`、`0eb721e1`、`7629ea94`、`437edb2f` 五个值。已按规则重测并最终绑定 `437edb2f...`；若交付链路继续修改该文件，当前报告会失效。

## 5. 未验证边界

- 未用真实资源管理器双击、系统默认浏览器、SmartScreen/杀毒软件弹窗或真实下载区策略验证；只验证了 Chromium `file://` 直开。
- 未验证 Edge/Firefox/Safari、移动端浏览器、屏幕阅读器、Windows 系统缩放/多显示器切换。
- 未做 OS 级冷启动；新 Playwright context 不等于清空 OS 文件缓存。
- 离线为 Playwright `setOffline(true)` + route/request 日志验证，不等于物理断网实验。
- 打印为 Chromium PDF 观察，不等于真实打印机纸张边距、分页驱动和地方字体环境验证。
- 无 JS 场景只截图和读取 DOM，不验证屏幕阅读器体验。
- 页面最终 SHA 若与 `437edb2f...` 不同，应重新执行第 2 节命令。
