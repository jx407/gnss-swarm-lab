# w3d-density：420 px 冷启动页最便宜压缩方案（只读审计）

## ① SHA-256

- 目标文件：`D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html`
- 开始 SHA-256：`cc2aa2356e083ce0201e208116caa0f7b0aef0f8ddfc0cecf043f8feedbcfc00`
- 结束 SHA-256：`bb24d388edd23c6095abe37ba2ae2b7d46c33e2fa18abbf2946ca2e717d87740`
- 快照一致性说明：开始复制 `base.html` 后，目标文件在审计期间被外部进程再次写入（mtime `2026-10-07 02:43:29 +0800`，大小 `540593 -> 542386` bytes）。本审计没有写 `outputs/`；发现后把结束快照复制为 `base-current.html`，并用同一探针重跑，所有高度/截断/越界结果与开始快照一致。当前报告以两份快照的共同实测值为准。
- 本报告与全部探针产物只写入：`D:/codex/2026-10-05/new-chat/review/ds41/w3d-density.md` 与 `.../review/ds41/w3d-density/`。`outputs/`、`work/gnss-swarm/**` 未修改。

## ② 方法

### 副本与运行环境

- 开始快照复制为 `review/ds41/w3d-density/base.html`；发现目标页被外部改动后，把结束快照复制为 `base-current.html`。两份快照都跑过同一套探针。
- 浏览器：Playwright Chromium，headless，`file://` 加载副本；视口 `420 x 844`，`deviceScaleFactor=1`，`colorScheme=light`，`reducedMotion=reduce`，无触摸模拟（fine pointer）。
- 探针只在副本运行时注入 DOM/内联样式；原页与源码未改。

### 高度口径

- 所有高度均为 `#gl-panel-cold.getBoundingClientRect().height`，不是 `scrollHeight`。
- 静态基线：先真实运行一次默认冷启动（6 颗星，使 `gl-cold-canvas.clientHeight = 340`），再把状态行、三张 `.gl-stats` 卡和 `#gl-cold-detail` 还原为初始文案，测得 **2310.5 px**。
- 你给的背景值是 **2297 px**；本次同环境复现值为 **2310.5 px**，相差 **13.5 px（0.58%）**。差异来自当前 Chromium/字体下状态行或初始详情文案的换行。收益用同一探针的差值，避免换行差异放大。
- 自动计算真实完成后的 postrun 状态实测为 **2490.5 px**；主要增量是 `#gl-cold-detail` 从 36 px 变为 198 px，`.gl-stats` 从 84.5 px 变为 120.5 px。

### 下拉框文本截断探针

- 对每个 `select.form-select` 执行：
  - `const ctx = canvas.getContext('2d')`
  - `ctx.font = getComputedStyle(select).font`
  - `ctx.measureText(longestOptionText).width`
  - 与 `select.clientWidth` 及内容宽度 `clientWidth - paddingLeft - paddingRight` 比较。
- 同时记录当前 `selectedOptions[0]` 的宽度，以区分“仅最长 option 截断”和“当前选中项已经截断”。

### Canvas 文字越界探针

- 拦截 `CanvasRenderingContext2D.prototype.fillText`。
- 每个 `fillText` 用 `measureText`、`textAlign`、`textBaseline` 计算 CSS 像素包围盒，再与 `canvas.clientWidth/clientHeight` 比较；超出任一方向即记为越界。
- 按要求调用 `GLAPP.panels.cold.draw()`；另外因为 `gl-dll-canvas` 不由 `cold.draw()` 绘制，额外运行 `GLAPP.panels.dll.run()` 后调用 `GLAPP.panels.dll.draw()`，避免只测到 DLL 画布的占位文字。
- 测试高度：`gl-cold-ttff 210 -> 170`、`gl-cold-epoch-canvas 244 -> 214`、`gl-dll-canvas 230 -> 190`；`gl-cold-canvas` 保持 340。

### 测量命令

```bash
cp "D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html" \
   "D:/codex/2026-10-05/new-chat/review/ds41/w3d-density/base.html"

node "D:/codex/2026-10-05/new-chat/review/ds41/w3d-density/probe2.js"
node "D:/codex/2026-10-05/new-chat/review/ds41/w3d-density/dll-canvas-probe.js"

# 结束快照复核（发现 outputs 被外部改动后执行）
cp "D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html" \
   "D:/codex/2026-10-05/new-chat/review/ds41/w3d-density/base-current.html"
node "D:/codex/2026-10-05/new-chat/review/ds41/w3d-density/probe-current.js"

sha256sum "D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html"
```

- `probe2.js` 输出：`review/ds41/w3d-density/probe2-results.json`
- `probe-current.js` 输出：`review/ds41/w3d-density/probe2-current-results.json`；在结束快照 `base-current.html` 上重跑，所有高度与开始快照一致。
- `dll-canvas-probe.js` 输出 DLL 画布真实数据文字包围盒。
- `probe.js`、`select-selected.js` 为辅助复核脚本，结果保留在同目录。

## ③ 方案表

以静态基线 **2310.5 px** 为统一改前值；涉及自动运行后长详情的方案另列 postrun 值。所有“收益”为同探针高度差。

| 方案 | 改前高度 | 改后高度 | 收益 | 实测风险 | 建议 |
|---|---:|---:|---:|---|---|
| 1. 下拉框两列：`@media(max-width:620px) .gl-group > .gl-field:has(.form-select) { flex:1 1 calc(50% - 9px); }` | 2310.5 px | 2195.5 px | -115.0 px（4.98%） | 3 个 select 被压到 `clientWidth=174 px` 后最长文本截断：`gl-cold-frontbw` 207.66>174，`gl-cold-fine` 300.08>174，`gl-cold-iono` 243.30>174；`gl-cold-iono-act` 72.95<174 安全；`gl-cold-snr`、`gl-cold-mode` 在该 flex 换行下仍为 360 px。默认选中项 `gl-cold-frontbw=207.66`、`gl-cold-fine=296.71` 也已经超 174 px。 | 不采纳（除下方组合外，不建议单独上线） |
| 2. 窄屏画布降高：TTFF 210->170、epoch 244->214、DLL 230->190；`gl-cold-canvas` 保持 340 | 2310.5 px | 2200.5 px | -110.0 px（4.76%） | Canvas 2D `fillText` 包围盒探针：越界条目 **0**；TTFF/epoch 用真实冷启动数据，DLL 用真实 20 历元数据。风险仅是图表变矮后的可读性未做主观验收，不在本次边界内。 | 采纳 |
| 3. 把两段可见“读法”移进已有 `<details>` | 2310.5 px | 2182.5 px | -128.0 px（5.54%） | 首屏少掉 36 px + 72 px 两段文字；用户需点开“继续读/详细说明”才能看到。内容未删除，但首屏可读性下降。 | 采纳（若产品接受首屏只保留数字和图表） |
| X1. 窄屏把①–③三个 `.gl-group` 折进三个 `<details>`，④“算法与执行”保持展开 | 2310.5 px | 1879.0 px | -431.5 px（18.68%） | 8 个控件被默认隐藏，需额外点击展开；执行按钮仍在首屏。摘要行使用完整分组标题，折叠后控制区 702.5->271.0 px。发现性与可访问性语义需产品确认；小屏默认折叠值是否合适需确认。 | 采纳（达到 2 屏内的关键方案） |
| X2. 把动态 `#gl-cold-detail` 移进已有 details | 静态：2310.5 px；postrun：2490.5 px | 静态：2266.5 px；postrun：2284.5 px | 静态 -44.0 px（1.90%）；postrun -206.0 px（8.92%） | 运行后的详细诊断被隐藏，用户需展开 details 才能看全部数字；自动状态行仍保留摘要。内容未删除。 | 采纳 |
| X3. 窄屏隐藏 `.gl-stats` 卡的第三行上下文（仅保留标题和数值） | 静态：2310.5 px；postrun：2490.5 px | 静态：2292.5 px；postrun：2436.5 px | 静态 -18.0 px（0.78%）；postrun -54.0 px（2.34%） | 丢失“跟踪态/全程锁定/平均峰”等上下文，收益与信息损失不成比例。 | 不采纳，除非还需要再抠几十像素 |
| 组合（推荐）：X2 + V3 + X1 + V2；不含 V1 | 静态：2310.5 px；postrun：2490.5 px | 静态：1597.0 px；postrun：1615.0 px | 静态 **-713.5 px（30.88%）**；postrun **-875.5 px（35.15%）** | 成本是 X1 的默认隐藏、V3/X2 的首屏文字减少、V2 的图表变矮；均不删除内容。相对 2×844=1688 px 的阈值，静态与 postrun 都低于 2 屏。 | **推荐** |

### 方案 1 的 select 逐项实测

| select id | 两列后 clientWidth | 内容宽（减 padding） | 最长 option | `measureText` 宽度 | 截断 |
|---|---:|---:|---|---:|---|
| `gl-cold-frontbw` | 174 | 158 | 理想方波（旧模型 · 峰顶是平台） | 207.66 | 是 |
| `gl-cold-fine` | 174 | 158 | 40 采样/chip（平台宽 7.3 m · 两级搜索+跟踪） | 300.08 | 是 |
| `gl-cold-snr` | 360 | 344 | −8 dB（码噪声 ~6 m，看得见电离层） | 248.47 | 否 |
| `gl-cold-iono` | 174 | 158 | L1/L2 双频（消电离层 · 噪声 ×2.978） | 243.30 | 是 |
| `gl-cold-iono-act` | 174 | 158 | ×20 强扰动 | 72.95 | 否 |
| `gl-cold-mode` | 360 | 344 | 首历元捕获 + 跟踪环（真实接收机） | 228.67 | 否 |

补充：当前默认选中项宽度为 `gl-cold-frontbw 207.66`、`gl-cold-fine 296.71`，均大于 174；`gl-cold-iono` 当前选中项为 163.16，略大于内容宽 158、但小于原始 174。`gl-cold-iono-act` 当前选中项 50.74，安全。

### 方案 2 的 Canvas 文字越界实测

| canvas | 原高 | 新高 | 唯一真实 `fillText` 标签数 | 越界条目 |
|---|---:|---:|---:|---|
| `gl-cold-ttff` | 210 | 170 | 13 | 无（0） |
| `gl-cold-epoch-canvas` | 244 | 214 | 17 | 无（0） |
| `gl-dll-canvas` | 230 | 190 | 10 | 无（0） |
| `gl-cold-canvas` | 340 | 340（未改） | - | - |

DLL 画布的代表性实测包围盒：最高 `1000 m` 标签 `top=10,bottom=18`；最低 `历元 N` 标签 `top=165.5,bottom=174.5`；画布高 190，均在界内。

## ④ 推荐组合

推荐按顺序做：**X2（动态详情移入 details）+ V3（两段读法移入 details）+ X1（窄屏折叠①–③控制组）+ V2（TTFF/epoch/DLL 降高）**，不采纳 V1。

- 同源静态实测：**2310.5 -> 1597.0 px**，收益 **713.5 px（30.88%）**。
- 真实自动运行后实测：**2490.5 -> 1615.0 px**，收益 **875.5 px（35.15%）**。
- 组合低于 2×844=1688 px 阈值，剩余高度约 0.9–1.0 屏。
- 若必须使用你给出的 2297 px 作为起点，按同一差值做线性推算约为 1583.5 px；这是推算，不是本次实测值。

代价：

- ①–③共 8 个控件默认藏在 3 个摘要行后面，用户调整场景/前端/电离层前要多点一次；执行按钮和当前结果仍在首屏。
- 两段“读法”和运行后长诊断数字默认进入已有 details，首屏文字信息减少。
- 三张图变矮：TTFF、epoch、DLL；Canvas 文字包围盒未越界，但曲线视觉密度和触控阅读体验未做主观验收。
- 不采纳 V1，因此不会引入 `gl-cold-frontbw`、`gl-cold-fine`、`gl-cold-iono` 的最长 option 截断风险。
- 若不做 X1，仅做 V2+V3+X2（可再加 V1）的保守组合静态约为 2028.5 px；加 V1 约为 1913.5 px，但仍超过 2 屏，且带 select 截断风险。

## ⑤ 未验证边界

- **980 px 未实测**：所有方案都限定在 `max-width:620px`，980 px 理论不变，但本次没有在 980 px 重新跑全套探针。
- **触摸粗指针未实测**：本探针是 fine pointer；`@media (pointer:coarse)` 会把 select/btn/range/summary 抬高到 44 px，419/420 px 触屏设备的绝对高度和收益可能不同于本报告。
- **原生 select 弹出层未实测**：本报告只按 `canvas.measureText` 与 `select.clientWidth` 判定文本会截断，未验证 Chromium/宿主在原生长下拉列表中的 popup 宽度行为。
- **Chart 非文字图元未测**：Canvas 探针只检查 `fillText` 包围盒，不检查折线、条形、网格、点位之间的遮挡；也不检查图表变矮后的主观可读性。
- **折叠控件的可访问性未端到端验收**：未跑屏幕阅读器、键盘焦点与触摸展开回收测试；X1 的 details 摘要文案在实现时应避免过长换行。
- **字体差异**：本报告反复出现“你的 2297 px”和“本次 2310.5 px”的 13.5 px 差异；结束快照 `bb24…` 上重跑仍是 2310.5 px。若需要精确复现你的数字，应用你的 `qa/probe-layout2.js` 在同一宿主/字体环境重跑本报告的组合。
- **外部变更**：目标文件在审计期间被外部进程改写；本报告的组合结论同时覆盖开始快照 `cc2aa…` 和结束快照 `bb24…`，但若你继续在 `outputs/` 上编辑，剩余高度应重新跑 `probe-current.js`。
- **`gl-cold-canvas` 未纳入降高**：它仍是 340 px；如果以后要降低它，需要额外验证 6 行逐星文字与 46 px 行距是否会重叠，本次不作为推荐方案。
- **原始页面与源码未改**：报告中的“改后高度”都是副本运行时注入 DOM/内联样式后的实测值，不是已落地补丁的构建产物。
