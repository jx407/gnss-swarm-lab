# ds4.1 只读审计报告 —— GNSS 蜂群工作台交付物（w3g 轮）

- 审计时间：2026-10-07 03:36–03:59（Asia/Shanghai），全程 ≤ 20 分钟。
- 角色：ds4.1 只读审计代理。**未修改任何交付物**；写入仅限 `review/ds41/w3g-audit.md` 与 `review/ds41/w3g-audit/`。
- 未运行任何会写 `outputs/` 的构建脚本（`build.js` / `build-standalone.js` / `app/` 下的 patch-*.js 一律未执行）。
- 证据目录：`D:/codex/2026-10-05/new-chat/review/ds41/w3g-audit/`

---

## ① 两个 SHA-256（开始 / 结束各一次，两次一致）

| 产物 | 开始（03:38） | 结束（03:55） | 字节 | 结论 |
|---|---|---|---|---|
| 独立版 `D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html` | `2abb02a7d803ea38b6263da030ac87b3dda7029b42ca80bc800fdac4c7aa0c22` | `2abb02a7d803ea38b6263da030ac87b3dda7029b42ca80bc800fdac4c7aa0c22` | 547 599 | 未变动 |
| 内联片段 `C:/Users/31040/.codex/visualizations/2026/10/05/01a10c98-950b-7151-a024-b4d3630dcd87/gnss-swarm-lab.html` | `a6da7ff9bc0b89b4f746bf7e6182a5cfd2ce8e683921588b364164ac76687e38` | `a6da7ff9bc0b89b4f746bf7e6182a5cfd2ce8e683921588b364164ac76687e38` | 544 403 | 未变动 |

原始证据：`w3g-audit/sha-final.txt`（`sha256sum` 输出）。
> 注：`review/ds41/w3c-host.md` 里记录的是 02:02 的旧 SHA（`90d7b176…` / `c46810df…`），**不是**本轮判据，本轮以 `2abb02a7…` / `a6da7ff9…` 为准。

---

## ② 方法

1. **起始/结束 SHA**：`sha256sum` 对两个产物各跑一次，比对是否被写入。
2. **静态结构审计**：`w3g-audit/src-structure.js`（自写，只读）正则抽取 tab/panel/ARIA/重复 id/glossary/`这一页`/canvas；`w3g-audit/finish.js` 再在运行时用 `querySelectorAll` 复核。
3. **工程既有判据（只读跑）**：
   - `bash tests/run-all.sh`（21 套）——在本轮开始前由同一 shell 调用（PID 任务 `j-hgibxx`）跑完；日志与本轮绑定 SHA 相同，完整输出留档 `w3g-audit/prior-run-all-and-checks.log`。
   - `qa/check14.js … check25.js`（12 个，同一任务串行）。
4. **浏览器实测**：用工作区自带 Playwright（`C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`），**不经过 cua_repl**（本机已知故障）：
   - `w3g-audit/browser-audit.js`：`file://` 直开耗时、请求清单、26 canvas、离线 `context.setOffline(true)`、3×10 次标签切换、420×844 每页首句 top、最小宿主页实测。
   - `w3g-audit/angles.js`：320px、200% 缩放、键盘-only、打印/PDF、深色+420+触摸、50 次快速点击、术语扫描。
   - `w3g-audit/finish.js`：内部溢出 `#gnss-lab.scrollWidth-clientWidth` + 每面板 + 每宽度、序数一致性、token 计数、canvas 属性尺寸 vs CSS 尺寸。
5. **最小宿主页**：`w3g-audit/host-minimal.html` = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" …><title>minimal host</title></head><body>` + 内联片段原文 + `</body></html>`（544 590 B）。宿主**不写任何 CSS、不定义任何 CSS 变量**，只补 `charset`/`viewport`（这是任何宿主都该有的，且片段自身是 `<div id="gnss-lab">` + 内联 `<style>`）。
6. **既有探针**：`qa/probe-layout2.js`、`qa/probe-chrome.js`、`review/ds41/w3-charts-recheck.js` 原样跑，不修改。

---

## ③ 五条要求逐条结论表

### 要求 1 —— 结构完整

| 判据 | 原始证据 | 结论 |
|---|---|---|
| 10 个标签页 | `src-structure.js`：`tab buttons: 10 gl-tab-sky,gl-tab-ca,gl-tab-acq,gl-tab-pos,gl-tab-mp,gl-tab-raim,gl-tab-geo,gl-tab-atm,gl-tab-cold,gl-tab-pll`；`tabpanels: 10 …` | ✅ |
| 面板/标题层级 | `h1 count: 1, h2 count: 10, h3 count: 0`；每个 panel 有 `role="tabpanel"` + `aria-labelledby` | ✅ |
| landmark / ARIA 对应 | `role=tablist count: 1`；`aria-controls dangling: (none) / total 10`；`aria-labelledby dangling: (none) / total 10`；`duplicate ids: (none)` | ✅ |
| **无 `<main>` / 无 `<nav aria-label>`** | `main[role=main] | <main>: false`；`nav[aria-label]: 0`（标签条是 `div[role=tablist]`，不是 `<nav>`） | ⚠️ 结构反例（非致命） |
| id 引用无悬空 | 同上：`aria-controls`/`aria-labelledby` 各 10 条，0 悬空；重复 id 0 | ✅ |
| 术语速查存在 | `<details class="gl-glossary">` 存在，`li count: 41`；摘要文案 `术语速查（PDOP / RAIM / HPL / C/N0 / NEES / chip / spc …，点开）` | ✅ |
| 各页读法存在 | 源文件 12 条 `.gl-lead`（10 条 tab 读法 + 冷启动/载波跟踪各多 1 条分段读法）；10 个 tab 每页第 1 条 `.gl-lead` 全部命中 | ✅ |
| 顺序正确 | tab 按钮顺序 = panel 顺序 = `TABS` 数组顺序：sky→ca→acq→pos→mp→raim→geo→atm→cold→pll；13 个「完整读法/继续读」summary 按面板出现序排列 | ✅ |
| 最小宿主页：白屏？ | `bodyTextLen=1018`，`#gnss-lab` present；`whiteScreen=false` | ✅ 不白屏 |
| 最小宿主页：26 canvas 有尺寸？ | `canvases: 26, zero-attr: 0, zero-client: 23`；**逐 tab 激活后** `nonzero canvases: 26`（离线段实测） | ✅ |
| 最小宿主页：4 系列色互不相同？ | `GLAPP.core.theme() = {s1:"#2563eb", s2:"#e07b39", s3:"#2f9e6b", s4:"#a855f7", uniq:4}` → `theme 4 系列色互不相同: true` | ✅ |
| 最小宿主页 console | `console/pageerror/requestfailed: 0` | ✅ |

**要求 1 结论：已证明（含 1 条结构反例：缺 `<main>` landmark 与 `<nav aria-label>`；不影响 tab/ARIA 对应关系与 26 canvas）。**

### 要求 2 —— 无错误

| 判据 | 原始证据 | 结论 |
|---|---|---|
| `bash tests/run-all.sh`（21 套） | `---- 判据总览：21 套全绿，0 套失败 ----`（`w3g-audit/prior-run-all-and-checks.log:5`） | ✅ |
| check14–check25（12 个） | check14 18/18、check15 12/12、check16 16/16、check17 10/10、check18 14/14、check19 12/12、check20 12/12、check21 13/13、check22 8/8、check23 8/8、check24 11/11、check25 10/10；每个后面都带「控制台问题 0 条」→ 合计 **344/344** | ✅ |
| 浏览器 console/pageerror/requestfailed 计数 | `browser-audit.js`：A 段 `console/pageerror/requestfailed: 0 []`；B 段（最小宿主）0；C 段（离线）0；D 段 0。`angles.js`：A1 0、A2 0、A3 0、A5 0、A6 0。`qa/probe-chrome.js`：5 个宽度全部 `consoleIssues=0` | ✅ 累计 0 |

**要求 2 结论：已证明。**

### 要求 3 —— 无打开问题

| 判据 | 原始证据 | 结论 |
|---|---|---|
| `file://` 直开首帧/load 时间 | `load(ms)=68`（`waitUntil:'load'`，1280×900，冷启动 Chromium）；首个 canvas 在 load 事件时已建立：`{w:610,h:300,cw:610,ch:300}` | ✅ |
| 外部请求 | `requests(1): ["file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html"]`；`external(non-file): []` | ✅ 0 外部请求 |
| 离线可用 | `context.setOffline(true)` 下仍能 load；10 页切换 `offline switch ok: true`；`external requests while offline: []`；`active tab after loop: 载波跟踪, nonzero canvases: 26` | ✅ |
| 连续切换 10 页 | 3 轮共 30 次点击，`switch errors: 0`；单次耗时除首次 `pll` 2091 ms / 第二轮 `pll` 684 ms 外均 ≤ 527 ms | ✅ |
| console/pageerror/requestfailed | 同上均为 0 | ✅ |

**要求 3 结论：已证明。**

### 要求 4 —— 页面美观不拥挤

| 判据 | 原始证据 | 结论 |
|---|---|---|
| `qa/probe-layout2.js` 10 页 × 3 宽度 | 1280/980/420 三个宽度各 10 行，「溢出」列**全部为 `-`**；`可见但宽度<5px 的画布：0`（980 段）；`控制台问题 0 条` | ✅ |
| `qa/probe-chrome.js` 5 宽度 | W=360 navH=73/navRows=2；W=420 navH=73/2；W=768 navH=80/2；W=980 navH=43/1；W=1280 navH=43/1；每宽度 `overflowX:false, consoleIssues=0` | ✅ |
| 内部溢出 `#gnss-lab.scrollWidth-clientWidth` | `finish.js`：w=320/420/980/1280 四宽度 × 10 页，`lab max=0, panel max=0, doc max=0`（全部逐页 `lab=0,panel=0,doc=0`） | ✅ |
| `w3-charts-recheck.js` 26 canvas 文字越界 | 52 行 CANVAS（26 canvas × 2 宽度 420/980）：**`clip!=0` 1 行**（420 `gl-cold-canvas` text=18 clip=1）；**`textColl!=0` 4 行**（420/980 的 `gl-auto-canvas`、`gl-cross-canvas`，各 textColl=1） | ⚠️ 反例 |
| 该探针的退出码 | 脚本第 381 行 `catch(… process.exit(1))`，**只有 FATAL 才非零**，`clip>0` 不置退出码 → 本轮 `EXIT=0` **不能**当作“无越界”证据 | ⚠️ 判据不可用 |

反例细节：
- `CLIP 1000 {"l":355.0986328125,"t":322.890625,"r":380.9013671875,"b":330.890625} canvas {"w":380,"h":340}` —— 420 宽下 `gl-cold-canvas` 一个文本右边界超出画布 0.90 px。
- `TCOLL 51.6 0@204.0,200.0 <> 0@204.0,200.0` —— `gl-auto-canvas` / `gl-cross-canvas` 在同一坐标 `(204,200)`（980 宽为 `(244,200)`）各有一对同位置文本重叠 51.6 px²，同时 `segHits=1`（该文本压到图线）。两宽度都复现。

**要求 4 结论：发现反例（数量很小：1 处 clip + 4 处 textCollision）；横向/内部溢出与导航行数判据全部通过。**

### 要求 5 —— 简单易懂、清晰明了

| 判据 | 原始证据 | 结论 |
|---|---|---|
| 每页「这一页在…；先看…——所以…」首屏可见（420×844 给 top） | `browser-audit.js D 段`：10 页 lead `top=285`（raim/atm/cold/pll 为 285 起、bot 321；其余 bot 339），`vh=844`，`inFold=true` × 10 | ✅ 位置 |
| 字面模板「——所以」 | `finish.js`：`innerText 含 "——所以" 次数: 0`；源文件硬统计 `含"所以": 0 / 12 条 .gl-lead`；`含"先看": 9 / 12`（冷启动首条用「先执行默认计算」）；`含"——": 12 / 12` | ⚠️ 字面反例 |
| 术语速查条数 | `glossary <details> present, li count: 41` | ✅ 41 条 |
| 每页是否有未解释术语（只报可证明的） | `ISB` 全文出现 **15** 次，速查 **无** ISB 词条（但 `定位解算` 页内联解释了：`多系统时估计系统间钟差（ISB）` + `每系统一个钟差未知量`）；`ACQ` 出现在 `gl-acq-label`（`标签省略剪影 ACQ`），速查未收；`Hatch` 出现 3 次、速查**已**收（第 22 条） | 见下 |

术语缺口（可证明、仅这两条）：
- `ISB` —— 出现页：定位解算（速查无词条，但控件标签内有中文全称解释）。
- `ACQ` —— 出现页：捕获搜索（控件标签内出现，速查无词条，页内未见单独解释）。

**要求 5 结论：未证明（字面模板不成立）——「每页首句在 420×844 首屏可见」已证明（10/10，top=285，vh=844）；但用户原话里的 `先看…——所以…` 模板字面不成立：12 条读法句 `含"所以" = 0`、`含"——所以" = 0`，10 条中另有 1 条不含「先看」。另附 2 条可证明的术语缺口。**

---

## ④ 新找的 3 个角度（本轮首次做，不引用历史报告）

### 角度 1：320px 宽度 × 10 页
- 做什么：1280 下另设 `viewport{320,800}`，逐页点开量 `documentElement.scrollWidth-clientWidth`、`#gnss-lab` 溢出、`body` 溢出、以及每个元素 `getBoundingClientRect().right > innerWidth+1.5` 的越界清单。
- 结果：10 页全部 `docOverflow=0 labOverflow=0 bodyOverflow=0`，越界元素清单为空，`console issues: 0`。
- **该角度未发现反例。**

### 角度 2：键盘-only 走 10 页 + 200% 缩放
- 键盘：`document.getElementById('gl-tab-sky').focus()` 后连按 12 次 `ArrowRight`，逐次读 `document.activeElement.id` / `.nav-link.active` / `tabindex` / 对应 panel 是否 `hidden`。
  - 结果：`gl-tab-sky → ca → acq → pos → mp → raim → geo → atm → cold → pll → sky → ca → acq`，每次 `tabindex=0`、`visible=true`（roving tabindex + 面板跟随正常）；再按一次 `Tab` 焦点进入面板控件 `SELECT#gl-acq-prn`；console 0。
  - **该角度未发现反例。**
- 200% 缩放：`viewport{640,800}` + `html{zoom:2}`（Playwright 无法设真实浏览器 zoom，**这是代理手段，非等价**）。sky/cold/pll 三级：`docOverflow=0`，可见但 <5px 的 canvas = 0。
  - **代理手段下未发现反例**（真实浏览器 200% UI 缩放的等价性未验证）。

### 角度 3：打印/PDF + 深色+420px+触摸 + 50 次快速点击
- 打印：`emulateMedia({media:'print'})` 后 `navDisplay:"flex", navH:43, panels:10, hiddenPanels:9, printH:1145`，并成功写出 `w3g-audit/print.pdf`（232 764 B）。
  - **反例**：打印/PDF 只输出当前激活的 1 个面板，其余 9 个仍是 `hidden` → 打印件不含其余 9 页内容。
- 深色+420+触摸：`colorScheme:'dark', hasTouch:true, isMobile:true, deviceScaleFactor:2`；计算样式 `bg=rgb(21,23,28) fg=rgb(233,234,238)`，`--viz-series-1..4 = #79a6ff/#f0a35e/#5cc79b/#b79bff`；`tap` 走完 10 页，console 0。
  - **该角度未发现反例。**
- 50 次快速点击：10 页 × 5 轮连续 `click`（不插入等待），总 8 630 ms；结束时 `active=gl-tab-pll, visiblePanels=1, sub5px=0`，console 0。
  - **该角度未发现反例。**

---

## ⑤ 仍然未证明的部分

1. **真实浏览器 200% UI 缩放**：只用 `html{zoom:2}` + 视口减半代理；真实 Chrome/Edge 的 `Ctrl+=` 缩放布局是否一致**未验证**。
2. **打印/PDF 的期望语义**：本轮只证明「9 个面板在 print 媒体下仍 hidden、PDF 1 页高 1145px」，**没有**验证用户是否本就期望只打印当前页；是否算缺陷取决于验收口径。
3. **`gl-cold-canvas` 那 0.90 px 的 clip 是否为可读性缺陷**：探针给的是绘图 API bbox 越界；未截图逐像素核对文字是否真的被切掉、是否只切到半个数字。
4. **`textCollision 51.6 px² @ (204,200)` 的肉眼可辨程度**：未做像素级截图比对，只能证明两段相同文本在同一坐标重叠。
5. **`ISB` / `ACQ` 是否算“未解释术语”**：`ISB` 的控件标签内确有中文全称；`ACQ` 无。是否达到“缺口”标准取决于验收口径，**未验证**。
6. **`<main>` / `<nav aria-label>` landmark**：已证明不存在；是否违反验收方对“landmark”的定义**未验证**。
7. **移动端真机**（iOS Safari / Android Chrome）：只用 Chromium 模拟 `isMobile/hasTouch`，**未验证**。
8. **`GLAPP.core.theme()` 缺变量时的降级色与页面其它元素是否撞色**：本轮只验证 4 个系列色互不相同（`#2563eb/#e07b39/#2f9e6b/#a855f7`）；与 `--foreground`（宿主默认黑）是否撞色**未验证**（历史 `w3c-host.md` 有相关观察，本轮未复测）。
   - 另注：最小宿主页 `zero-client: 23` 全部是**未激活面板的 hidden canvas**（`getBoundingClientRect` 为 0 属预期），逐 tab 激活后 `nonzero canvases: 26`；这条不构成反例。
9. **21 套测试的逐套 pass 明细在本地 `run-all.out.txt` 只落了前 6 套**（`head` 截断）；完整「21 套全绿」来自同 SHA 的 `prior-run-all-and-checks.log` 汇总结论行 + 该任务退出码 0。逐套逐项明细**未在本轮重新落盘**。

---

## 结论速览

| # | 要求 | 判定 |
|---|---|---|
| 1 | 结构完整（含最小宿主页实测） | **已证明**（附反例：无 `<main>` / `<nav aria-label>`；其余全过） |
| 2 | 无错误 | **已证明**（21 套全绿；check14–25 = 344/344；console/pageerror/requestfailed = 0） |
| 3 | 无打开问题 | **已证明**（68 ms、0 外部请求、离线可用、30 次切换 0 错） |
| 4 | 页面美观不拥挤 | **发现反例**（1 处 clip + 4 处 textCollision；其余溢出/导航判据全过） |
| 5 | 简单易懂、清晰明了 | **未证明**（首屏可见性 10/10 通过，但「——所以」字面 0/12） |
