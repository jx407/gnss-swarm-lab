# GNSS 蜂群工作台 —— 交接说明（2026-10-06 更新）

## 交付物（**全部在项目文件夹内**；2026-10-07 按用户要求整理）

- 独立可直开版：`D:\codex\2026-10-05\new-chat\outputs\gnss-swarm-lab.html`
- 宿主内联片段（宿主渲染用）：`D:\codex\2026-10-05\new-chat\outputs\gnss-swarm-lab.inline.html`
- 工程目录：`D:\codex\2026-10-05\new-chat\work\gnss-swarm\`
- 审计报告：`D:\codex\2026-10-05\new-chat\review\ds41\`
- **一键重建**（全部写进本项目 `outputs/`，不需要任何项目外路径）：
  `bash D:\codex\2026-10-05\new-chat\work\gnss-swarm\build-all.sh`
  实测逐字节复现：独立版 `42d67300…`、内联片段 `c7b2c2c0…`

> ⚠️ **面板挂载副本已删除**：此前 Codex 面板通过
> `C:\Users\31040\.codex\visualizations\2026\10\05\01a10c98-…\gnss-swarm-lab.html` 渲染本页；
> 用户要求"项目文件只能在当前文件夹"，故该副本已**移入** `outputs/gnss-swarm-lab.inline.html` 并删除外部那份。
> 代价：**聊天面板不再渲染本页**（它只能从那个固定路径加载）。若需要恢复面板显示，把那两个产物之一复制回该路径即可
> （会重新产生一个项目外文件，需用户确认）。

## 🌐 第九轮：开源到 GitHub（2026-10-08）

- 仓库：**https://github.com/jx407/gnss-swarm-lab**（public，MIT，topics: gnss / gnss-teaching / canvas / offline-first / education / javascript）
- 在线试用（GitHub Pages，source = `main` / `docs`）：**https://jx407.github.io/gnss-swarm-lab/**
  - 线上实测：`loadMs=1683`、10 tab / 10 panel / 26 canvas、`#gl-sky-pdop=2.81`、天空图非空像素 8678、**0 控制台问题**（`qa/probe-pages.js`）
- 首次提交 `f5d42bc`（315 文件 / 3.87 MB）：源码 `work/gnss-swarm/`（app+winners+tests+qa）、交付物 `outputs/`、
  Pages 入口 `docs/index.html`（由 `build-all.sh` 生成）、README/LICENSE/.gitignore、审计报告 `review/ds41/*.md`
- **未入库**（`.gitignore`）：所有截图与抓取页（156 MB）、各审计代理的中间目录（含误留的浏览器 profile 缓存）、
  `work/gnss-swarm/review/` 与一次性 `apply-*.js`、`candidates/`、`build/`
- 公开前的安全扫描：`git ls-files` 全量 grep 无 `gho_/github_pat_/sk-/AKIA/PRIVATE KEY/password` 命中、无 `.env`/凭据文件；
  只有 163 个探头文件含本机绝对路径（已在 README 说明，无密钥）
- 更新仓库的流程：`bash work/gnss-swarm/build-all.sh` → `git add -A && git commit && git push`（Pages 会自动重新构建）

## 🎨 v22 第八轮：Kimi 三路并行视觉打磨（2026-10-07）

**用户授权改用 Kimi 子代理做美化**；三个 Kimi 代理在**互不重叠的写权限**下并行（全部已 `close_agent`）：

| 代理 | 权限范围 | 主要改动 | 报告 |
|---|---|---|---|
| Turing | 只改 `app/00-style.css`、`app/99-standalone.css` | 30 张统计卡改「描边 + 极轻投影 + 数值字重 600」；当前 tab 改 `--accent` 主题色胶囊（inset 描边，不占布局）；`.gl-h2` 加 3px 主题色刻度条 + 发丝线；分组标题加分隔线 | `review/ds41/kimi-style.md` |
| Huygens | 只改绘图层（`app/00-core.js` + 13 个 draw/chart 模块） | 新增 `gridH/gridV/axis0H/axis0V` 四个基元：网格从散落的 6 档透明度统一为 **0.5**；绘图区外框改成 `mix(border,fg,0.24)` 加深；主线统一 **1.8px**；虚线统一 `[4,3]`；DOP/ATM 图例改「**13px 色样 + 中性灰文字**」；RAIM/CA/ATM 长标题改 `labelFit` 自适应 | `review/ds41/kimi-charts.md` |
| Sartre | 只改 `shell.html` | **15 处文案**：冷启动读法去掉重复的「先」，改成卡片名（累计捕获耗时/首次定位误差）；ca/raim/mp/atm 的读法与**界面控件名对齐**；术语表纠错（信噪比条目改成 −30 dB 口径、HPL/VPL 改「保护限」）；导语改写 | `review/ds41/kimi-copy.md` |

**合并后的最终产物**：独立版 `9e3150ad50ad2a3497cb3aede7dcc1bd8089a306bebbab34ed16211501a4cf07`（555 608 B）、
内联片段 `a28b531342e40feb29ebf269b58625ae1f28dc60eb0cdba7e04df69c58ababac`（551 154 B）。共 17 个源文件、约 190 行改动。

**我在合并产物上复跑的全量判据（全部通过）**：
- 图表文字体检 320 / 360 / 420+980：`CANVAS=26/26/52`、`FATAL=0`、**`CLIP=0`、`TCOLL=0`**
- Node 判据 **21 套全绿**；浏览器判据 **check14–25 全通过**（每套控制台 0）
- 极端参数档扫描（2 宽度 × 15 场景）：**0 越界 / 0 互压**
- 吸顶 2/2、读法 20/20、5 宽度无溢出、内部溢出 8/8=0、暗色 2/2 干净
- **冷启动数值逐位不变**（err `19.653481214079026` / chips `11.430302054379103` / hatch `10.718093657481894` / kf `8.925264495810556`）

改前/改后截图：`qa/before-kimi/{sky,pos,cold}-{420,980,1280}.png` ↔ `qa/after-kimi/` 同名文件。

**未验证（如实记录）**：真机触摸、宿主嵌入页在改样式后的表现、打印样式未复测（Huygens/Sartre 各自列的边界见其报告）；
三位代理各自只跑了自己范围内的判据，**合并后的全量判据由我复跑**（上面那组数字）。

## 🧪 v22 第七轮：极端参数扫描 + 交互鲁棒性 + 采集分片可行性（2026-10-07）

**这一轮把"图表判据"从默认场景扩到参数扫描，又抓出 6 个只有极端档才会出现的排版缺陷。**

### 1) 极端参数扫描（我新增的判据 `qa/probe-sweep.js`）
把每页控件推到极端档（`select` 取末项、滑杆取 `max`/`min`、勾选全开，并点运行），再对全部 canvas 做
"文字越界 + 文字互压"体检：**2 宽度 × 15 场景**。默认档从来不会出现的问题如下，**全部已修**：

| # | 现象（触发场景） | 修法 |
|---|---|---|
| 1 | `gl-geo-canvas` 标题字顶被画布上边缘裁掉 | 整张图 `y` 30 → 36 |
| 2 | `gl-mp-canvas`「墙 120 m」右溢 2.6 px（墙贴右边界） | 空间不够改右对齐往左放（`measureText` 判定） |
| 3 | `gl-doppler-canvas`「t (h)」与末端刻度「24」互压 51.6 px² | 单位标注移到轴上方右侧（与标题同行） |
| 4 | `gl-acq-canvas` 峰值标签压住「色彩按…」说明 304 px² | 峰值落在底部时把说明换到左上 |
| 5 | `gl-pos-iono-canvas` 数值标签压住底部图例（最多 284.5 px²） | 数值标签 y 夹到图例上方（−36） |
| 6 | `gl-cold-epoch-canvas` 只有 1 个历元时「N=1 → …」越出左边界 | 会越界时改左对齐，且从 `box.x + 4` 起（避开 y 轴刻度） |

**最终**：极端档 **2 × 15 场景 = 0 越界 / 0 互压**；默认档 **320 / 360 / 420 / 980 四档也是 0 / 0**。

### 2) 交互鲁棒性压力测试（ds4.1 代理 Plato）
50 次标签风暴、4×40 次滑杆风暴、12 次缩放风暴、20 次 details 风暴、冷启动中途切换、键盘-only 遍历：
**err/warn/pageerror/requestfailed 全 0**；面板恰好 1 可见（9 hidden）；26/26 canvas 非空；
滑杆后的状态与控件值精确一致（4/4）；缩放风暴后导航几何与静态加载**逐字节一致**；details 风暴后高度回到基线 Δ=0。
**P0/P1 = 0/0**；两条 P2 都是**测量口径**差异（① nav 高度差 −10 px：我把 padding 移到了 `<nav>` 外壳；
② 冷启动收尾窗口期取基线会读到 2127 vs 静态 2303 px），不是应用缺陷。

### 3) 冷启动"首历元二维捕获"分片可行性（ds4.1 代理 Rawls，只读研究）
结论 **有条件可行（置信度 0.90）**：所有依赖整张相关面的统计量必须**推迟到全部分片跑完、在完整 `surface` 上按原顺序重算**，
不能在片内合并。满足这一条后**逐位不变已被实测证明**（6 组信号 × 7 种粒度 = **42/42 次 `surface` 逐 bit 相同**，
9 个字段含 Stage-2 精修后的 `codePhaseSamples` 全部 `Object.is` 相等）。
- 收益：`N=8 + 缓冲复用` 可把单块 **~150 ms → 28–40 ms**（1/4–1/5），总时长仅 **+5~10%**；
  每次调用的 16–25 ms 固定成本（有限性扫查 + 7 个 typed array 分配）放进 state 即消失。
- 代价：**4 个文件、约 140–200 行**（`winners/acquisition-v2.js` 60–90、`app/80-coldstart.js` 30–50、两个测试文件）；
  真正的工作量与风险在把 `acquireOne` 改成**续跑状态机**。
- 最大风险（在片内先算次峰再合并）**在当前路径上不存在**——生效的 v2 不使用次峰。
- **本轮决定不做**：收益是"再削 0.25 s 卡顿"，代价是重构判据化实现 + 冷启动主链路的续跑协议，**风险收益不划算**；
  方案与边界已在 `review/ds41/w3i-acqchunk.md` 完整留档，将来要做可直接照做。

### 4) 我自己的判据错在哪（本轮，三条）
1. **扫描器第一版读数全错**：用 `getComputedStyle(canvas).width` 量画布宽度，隐藏面板里它返回 **`"100%"`**，
   `parseFloat` 成 100 px ⇒ 所有文字都"越界"（一次报出 113 处假违规）。改用 `getBoundingClientRect()` 并跳过 <5 px 的 canvas。
2. **`build-all.sh` 写错目录**：脚本里 `OUT="../outputs"` 从 `work/gnss-swarm/` 解析出来是 `work/outputs/`，
   **不是项目根的 `outputs/`**。⇒ 有一整轮"重建 + 极端档扫描"其实跑在**旧产物**上（我差点得出"修复无效"的错误结论）。
   已改成用脚本自身位置推导项目根（先 cd 到脚本目录，再取上一级的上一级），并把错位的 `work/outputs/` 删掉；
   现在重建会**真的**写进 `D:\codex\2026-10-05\new-chat\outputs\`。
3. **修极端档时引入两个回归**：`C.labelTick` 默认是**居中**（破坏原来的右对齐）；「t (h)」下移一行会**撞画布底边**。
   两处都被默认档判据抓回来（`CLIP 0 → 4 → 0`）。

### 5) 长任务数字随机器负载波动（如实记录）
同一份产物、同一个探针，最长主线程块实测在 **~300 ms（空载）到 708–769 ms（同时跑 QQ/Edge/WebView2 等）** 之间波动，
TBT 1.7 s ↔ 8.8 s。**结构性结论不受影响**：第六轮那次"收尾分片"是**背靠背 A/B** 测的（1514 → ~300 ms，同一机器状态），
而绝对数字必须在空载下比较——报告里引用时请带条件。

### 仍未做 / 未验证
1. 冷启动采集分片（方案已备，见上；决定不做）。
2. 打印只含当前标签页（有意）。
3. 真机触摸 / DPR>1 / 非 headless GPU / 长时 soak 未验证（Plato 列了 8 条边界）。

## 🌍 v22 第六轮：三引擎验证 + 独立完成度审计 + 反例清零（2026-10-07）

**最终成品**：独立版 SHA-256 `42d67300e623c6b81480c8edbbc4d376d850a1836c05dba400c1dc92c9905b16`（宿主片段同步重建）。

**派发**（全部 ds4.1，**已全部 close**）

| 昵称 | 任务 | 报告 |
|---|---|---|
| Jason | 完成度审计：5 条要求逐条"已证明 / 未证明 / 反例" | `review/ds41/w3g-audit.md` |
| Kepler | 三引擎（Blink/Gecko/WebKit）渲染与行为一致性 | `review/ds41/w3g-engines.md` |
| Gauss | 反例复核（专查上一轮 5 条反例，并新开角度） | `review/ds41/w3h-recheck.md` |

**曾用的本机依赖（已删）**：为做跨引擎验证装过 WebKit 26.5 + Firefox 153 到
`D:\codex\2026-10-05\new-chat\.pw-browsers`（511 MB）；**2026-10-07 按用户要求已删除**（项目文件夹随之 758 MB → 248 MB）。
需要复跑跨引擎判据时先重装（约 1 分钟），再跑 `qa/probe-gecko.js`、`qa/probe-webkit.js`：

```bash
export PLAYWRIGHT_BROWSERS_PATH=/d/codex/2026-10-05/new-chat/.pw-browsers
"NODE" "C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/cli.js" install firefox webkit
```
（`NODE` = `C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`）

### 三引擎证据（Kepler）

Blink 151 / Gecko 153 / WebKit 26.5 × 420×844、980×900 共六组：console error/warning、pageerror、requestfailed **全 0**；
导航几何三引擎一致（420 → 2 行/101 px；980 → 1 行/43 px）；单面板高度最大差 **30 px**、`#gnss-lab` 总高最大差 **19 px**（字体度量差）；
canvas 逐像素差属**抗锯齿/光栅化级**（最大 MAE **1.86/255**、显著差异像素 1.61%、非空像素包围盒差 ≤3 px、位图尺寸逐字节一致）；
冷启动数值相对差 ≤ **6.33e-8**（判为浮点实现差异：与视口无关、分支/检出一致、`pllLocked` 三引擎都是 6/6）。
Kepler 还**纠正了自己一次误判**（"WebKit 换行不同"经受控复测证明是测量时刻差异）。

### 独立完成度审计（Jason）+ 本轮反例处置

| 要求 | Jason 判定 | 反例 | 本轮处置 |
|---|---|---|---|
| 结构完整 | 已证明 | 缺 `<nav>`/`<main>` landmark | tablist 包 `<nav aria-label="工作台标签页">`；**独立版**由 `build-standalone.js` 包 `<main>`（宿主片段不加，避免与宿主重复 landmark） |
| 无错误 | 已证明 | 21 套 + check14–25 = **344/344**，各环节 0 报错 | 保持 |
| 无打开问题 | 已证明 | load 68 ms、仅 1 条请求且 0 外部、离线可切 10 页、30 次切换 0 错 | 保持 |
| 美观不拥挤 | **反例** | ①420 `gl-cold-canvas` 右端刻度 `1000` 溢出 0.90 px；②`gl-auto/gl-cross` 同坐标重复画 `0`（51.6 px²） | ①刻度改 `C.labelTick`；②删掉冗余绘制 ⇒ 两档宽度 `CLIP=0 / TCOLL=0` |
| 易懂清晰 | **未证明（字面）** | 12 条读法里"所以"=0、"先看"=9/12；`ISB/ACQ` 未收 | 10 条读法显式含"所以"与"先看"；术语表 41 → **44**（ISB/ACQ/LS） |

Jason 另外**新开了 3 个角度**：**320 px**（发现 9 CLIP + 5 TCOLL）、键盘-only + 200% 缩放（无反例）、打印（PDF 只含当前标签页）。

### 本轮修复（含我自己引入又修掉的回归）

1. **420 右端刻度溢出**：`perSat` 的 x 轴刻度改用 `C.labelTick`（边缘感知）⇒ `CLIP 1 → 0`。
2. **同坐标重复绘制 `0`**：`app/20-ca.js` 里刻度循环已画过，后面又画一次 ⇒ 删掉 ⇒ `TCOLL 4 → 0`。
3. **landmark**：`<nav>` + 独立版 `<main>` ⇒ landmark = nav / main / region 各 1。
   ⚠️ **回归并已修**：`<nav>` 包住 tablist 后，sticky 的**包含块**变成只有一行高的 `<nav>` ⇒ **吸顶失效**
   （Gauss 实测 `scrollY=300` 时 `top=-122.125`）；把 sticky 挂到 `#gnss-lab > nav` 后 **420/980 均 `top=0`**（我复测）。
4. **360 px（常见手机宽）4 处 canvas 标题裁切、320 px 9 处**（此前我只在 420/980 验过文字越界）：
   新增 `C.labelFit`（先缩小字号到 9 px，仍放不下就截断加省略号），接到 **11 处**调用点。
   ⚠️ **我自己踩的坑**：第一版把 `w` 用在没有该变量的 `85-hatch.js`，探针直接 FATAL；而我当时只看
   `grep -c 'CLIP '`=0 就以为通过 —— **教训：判据必须断言探针真的跑完**；现在每个图表判据都断言
   `CANVAS` 行数 = 26×宽度数 且 `FATAL=0`，再看 `CLIP`/`TCOLL`。
5. **320 px 剩余 4 处标签互压**：给窄屏（<340 px）加短标签（atm 标题与图例、pos 电离层条形、pos 残差标题与 RMS 文本、raim 残差标题）。
6. **打印样式**：`@media print` 下不吸顶、画布不跨页断开；**仍只打印当前标签页**（未跑过的面板本来就是空画布）——记为有意行为。

### 最终判据（绑定 `42d67300`）

- 图表文字体检（4 档宽度，**带"探针跑完"断言**）：**320 / 360 / 420 / 980 全部 `CLIP=0`、`TCOLL=0`**
- Node 判据 **21 套全绿**；浏览器判据 **check14–25 全通过**（每套控制台问题 0）
- 吸顶 `top=0`（420/980）；10 页读法 `order=ok`（20/20）；冷启动数值逐位不变（最长主线程块 ~304 ms、TBT ~1.9 s、`pageerror=0`）
- 5 宽度无横向溢出；内部溢出 8/8 = 0；暗色 / Gecko / WebKit 各 0 报错

### 仍未做 / 未验证（如实记录）

1. **冷启动总时长 4.5–6 s**：分片只削掉最长块；历元 0 的 6 次二维捕获各 240–380 ms 是主要 TBT，
   `G.acquire` 的峰值/次峰指标需要整张相关面、**不可分片**（要动判据化的 `winners/acquisition*.js`）。
2. **打印只含当前标签页**（有意）。
3. **真机触摸**未验证（只在 Playwright 设备模拟里验过 44 px 命中区）；DPR>1 与 620 px 附近中间宽度未单测（Kepler 列的边界）。
4. `.pw-browsers`（Firefox + WebKit，511 MB）**已于 2026-10-07 按用户要求删除**；需要复跑跨引擎判据时按本节开头的命令重装即可（结论本身已落盘在 `review/ds41/w3g-engines.md`）。

## 🧭 v22 第五轮：逐页"看得懂吗"清单 + 420px 压缩 + 真跨引擎（2026-10-07）

**最终成品**：独立版 SHA-256 `b1cc2db67ac5800d54eb621599636ba722ee61156abd24d2f27b144635683939`。

**派发**：2 个 ds4.1 子代理（Feynman 逐页清单 / Sagan 420px 压缩方案），**已 close**。
**另外**：为补"真·跨引擎"证据，把 Playwright **Firefox 153（Gecko）** 装进工作区目录
`D:\codex\2026-10-05\new-chat\.pw-browsers`（≈90 MB，**可随时删除**；删后跨引擎验证需重装）。

### 修的问题（都有改前 → 改后实测）

| # | 问题（谁抓到） | 改法 | 改后证据 |
|---|---|---|---|
| 1 | **每页没说"这页在研究什么"**：Feynman 清单 C1 判否 **9/10**、C5（所以呢）判否 4/10；C2（先看哪个数）10/10 通过 | 把 10 页读法改写成 **"这一页在…；先看…——所以…"** 三合一（每页一行，不加行） | 10/10 页 `h2.nextElementSibling === p.gl-lead` |
| 2 | **420×844 下 10/10 页的读法句都在首屏外**（读者先看到一堆控件） | `app/90-boot.js` 6 行 JS：把每页 direct-child 的 `p.gl-lead` 移到 `h2` 之后 | 10/10 页 `leadTop=265px` ⇒ 首屏内；**面板高度净零变化** |
| 3 | 定位页读法写"再切换等权/加权"，但该页**没有开关**（只有 `#gl-pos-hrms` / `#gl-pos-hrms-w` 两张卡） | 文案改成"比两张卡（同一批数据上两种估计量，没有开关）" | 文案与 DOM 一致（Feynman C3 的 2 处之一） |
| 4 | 全球几何页 C3 缺：该页**本来就没有自己的控件** | 读法补一句"（本页没有自己的控件，纬度与历元用「星座几何」页的）" | 同上 |
| 5 | **术语表条数我说错了**：Feynman 实测 DOM 里是 **15 条**，我口述 17 条 | 补 8 条高频词（伪距 / PRN / 多普勒 / 电离层 / 最小二乘 / 相干积分 / 周跳 / 相关器） | 现 **23 条**，仍是折叠一行（展开态才占版面） |
| 6 | **420px 冷启动页过长**（Sagan 量化了 6 条方案） | 采纳两条无损方案：**窄屏画布降高**（ttff 210→170、epoch 244→214、dll 230→190）+ **窄屏把①②③参数组折成 `<details>`**（④"算法与执行"与执行按钮始终可见；桌面 >620px 由 JS 自动展开） | 同口径（420×844、运行完成后）：**2455 → 1988 px（−467 px / −19.0%）**；980：1799 → **1769**（略降） |
| 7 | **实现坑（我自己踩的）**：第一版把 `<details>` 自己当 flex 容器 ⇒ 内部 `.gl-field` 不再是 flex 项，980 下每字段只剩 **129 px**、竖排，面板反而涨到 **2051 px** | 改成 **details 外壳 + 内部保留 `.gl-group` flex 容器**（外壳只管边框/折叠） | 字段恢复同行（293 px × 3 同行），980 面板 2051 → **1769** |

### 新证据：真·跨引擎（Gecko/Firefox 153）

- `file://` 直开 420/980：**load 147–225 ms**、console/pageerror/requestfailed **0/0/0**、10/10 标签页、26 canvas 非空（sky 8114 个非透明像素）、`#gl-sky-pdop` = **2.81**（与 Chromium 相同）、无横向溢出、`scroll-margin-top`/`aria-live` 生效、`CSS.supports(':has()')` = true。
- **冷启动整条链路在 Gecko 跑通**：**3.71 s** 完成、PLL 6/6 锁定、0 报错；数值与 Chromium 一致到 ~1e-7：
  err `19.6534800` vs `19.6534812`；chips `11.4303014` vs `11.4303021`；hatch `10.7180943` vs `10.7180937`；kf `8.9252645` vs `8.9252645`（浮点/Math 实现差异，不是逻辑差异）。
- 未测 **WebKit/Safari**：本机是 Windows、Safari 不存在，未安装 WebKit ⇒ 如实记为未验证。

### 第五轮的两轮独立复核（Meitner → 修 → Peirce）

**Meitner 在 `b1cc2db6` 上的复核（同一份清单）**：C1 **1/10 → 10/10**、C2 10/10、C5 **6/10 → 10/10**、
420×844 首屏读法 **0/10 → 10/10**（`leadTop` 285）；但 **C3 因果 8/10 → 5/10（回归！）** —— 我改写读法时把
"改哪个控件 → 看什么变化"挤掉了；C4 术语 0/10（表从 15 → 23 条）；且 `cold` / `pll` 各有**两条**可见 `p.gl-lead`。

**据此再修**（最终构建 `40c0b4a8ae33102e3c9e3656283c912e918df42eac89f2179bd039c7cc05ce31`）：

| 修法 | 证据 |
|---|---|
| 给 ca / acq / pos / mp / raim 五页读法**补回因果句**（例：`把「信噪比」往下拖，看亮点会不会沉进噪声`；控件 id 与文案一一对应） | grep 复核 **5/5 命中** |
| 术语表 23 → **38 条**（补 Walker/MEO/掩膜/自相关·互相关/旁瓣/信噪比/双频消电离层/数据位翻转·IQ/窄相关·早迟门 + 卡尔曼滤波/蒙特卡洛·分位数/采样格点/抖动/Klobuchar·α 系数/CelesTrak） | DOM 实读 `38` |
| `cold` / `pll` 的第二条读法句加**范围限定**（"这一段怎么用：…" / "这一段（载波平滑）怎么读：…"） | Peirce 复核：两条"各有明确范围限定" |

**Peirce 在 `477fbe42` 上的第三次复核**：C1 **10/10**、C2 **10/10**、**C3 10/10**（geo 无自有控件算 9/10）、
C5 **10/10**、420 首屏 **10/10**（`leadTop` 285.4）；C4 **1/10**（术语仍非全覆盖 —— 这是"清单型判据"的固有性质：
只要页面还有任意一个未收进术语表的词就算不达标；残余为 `LS/蒙特卡洛/α 系数/卡尔曼滤波/max|d|/环路阶数/CelesTrak/根数/双峰`
等，本轮已把其中最常用的 6 个补进 38 条里）。
Peirce 另指出两处**非硬缺口**：sky 的 C3 只写了因果链、没逐字写"改 X"；atm 的动作句仍在折叠详情里。

### 仍未做 / 未验证

1. **冷启动总时长仍 4.5–6 s**：分片只削掉最长块；历元 0 的 6 次二维捕获各 240–380 ms 是主要 TBT，而 `G.acquire` 的峰值/次峰指标需要整张相关面、**不可分片**（要动判据化的 `winners/acquisition*.js`）。
2. 触屏导航 **101 px**（2 行 × 44 px）与桌面上 details 外壳多出的 3 行组标题：都是"44px 触控基线 / 可发现性 vs 省竖向空间"的权衡，本轮按无障碍与可发现性优先。
3. **明确不采纳**的 Sagan 方案（留档在 `review/ds41/w3d-density.md`）：select 两列（会让 `gl-cold-frontbw/fine/iono` 三个下拉截断）、把可见读法整段塞进 details（首屏信息量下降）、把运行后长诊断 `#gl-cold-detail` 默认折叠（可再省 ~206 px，但把"数字为什么这样"藏起来）。
4. 同页注入两份片段时第二份不可用（Kuhn P2-1）；未测真实读屏器与真机触摸。

## ⚡ v22 第四轮：冷启动收尾分片 + 触屏/宿主降级修复（2026-10-07）

**最终成品**：独立版 SHA-256 `cc2aa2356e083ce0201e208116caa0f7b0aef0f8ddfc0cecf043f8feedbcfc00`；宿主内联片段同步重建。

**派发**：4 个 ds4.1 子代理（**全部 `close_agent`**）。

| 昵称 | 任务 | 交付 |
|---|---|---|
| Nietzsche | 冷启动首次进入的性能/体验复核（22 次页面运行、归因到函数级） | `review/ds41/w3c-coldperf.md` |
| Linnaeus | 移动端/触屏模拟审计（360/390 × 触摸） | `review/ds41/w3c-mobile.md` |
| Kuhn | 宿主嵌入健壮性（3 档宿主、46 张截图） | `review/ds41/w3c-host.md` |
| Hilbert | 第二浏览器引擎探测与验证 | `review/ds41/w3c-browser.md` |

### 这一轮修的问题（改前 → 改后都有实测）

| # | 问题（谁抓到） | 改法 | 改后证据 |
|---|---|---|---|
| 1 | **冷启动收尾是一个 1.0–2.0 s 的同步长块**（Nietzsche 归因：其中 6 次 `G.pllTrack` 占 **99.9%**，单次 ~180 ms。**我上一轮"按细块分片"切错了地方**——细块生成在 `step()`，不在 `finish()`） | `finish()` 改成**跨调用分片**：一次只算一颗星的载波环，`setTimeout` 让出；进度条走最后 10%，但**不**改 live region 文本 | 最长 longtask **1514 → 303 ms**、TBT **3272 → 1700 ms**；**数值逐位不变**（err `19.653481214079026` / chips `11.430302054379103` / hatch `10.718093657481894` / kf `8.925264495810556`） |
| 2 | **我上一轮加的收尾状态行从未上屏**（Nietzsche 逐帧实测 9 次运行 0 帧：setter 写了 DOM，但同一任务内立刻进同步块，块尾 `render()` 又把它覆盖） | `finish(info)` 包进 `setTimeout(...,0)` | rAF 逐帧现在能采到 5 档百分比 + 「正在做载波环/ Hatch / 卡尔曼后处理」+「上次计算完成」三态 |
| 3 | **我自己引入的回归**：`m is not defined` —— `m()` 是 `updateStats()` 的**内部**声明，我在模块级的 `updateProgressUI()` 里调它 ⇒ 每次冷启动收尾 `render()` 抛错、最终 `updateStats()` 被跳过 | 改用局部格式化（`st.err.toFixed(1) + ' m'`） | `pageerror` / console error **0/0**；收尾文案与精度阶梯恢复正常 |
| 4 | 触控目标普遍 < 44px（Linnaeus 实测：tab 30px、滑杆 28px、select 30px、btn 35px、summary 18px） | `@media (pointer: coarse)` 下统一抬到 **44px**（滑杆/下拉/按钮/tab/summary；复选框保持 18×18 且 label 覆盖整行） | iPhone 12 设备模拟 360/390：tab **44px/2 行**、滑杆 **44px**、select **44px**、summary **62px**、无溢出、0 报错 |
| 5 | 吸顶导航遮挡 `scrollIntoView({block:'start'})` 的目标（Linnaeus：`#gl-lat` 被定位到 0–28px，中心命中 `#gl-tab-ca`） | `#gnss-lab [id] { scroll-margin-top: 88px }`（触屏 104px） | 规则随产物发布（未再单独复测遮挡，见未验证） |
| 6 | **宿主不提供 `--viz-series-*` 时整张图只剩 `rgb(0,0,0)`**（Kuhn 的 host-b 实测 8680 px 单一颜色）：`theme()` 虽有 fallback，但变量未定义时浏览器把 `var()` 解析成**继承值**，不会保留字面量 | `color()` 改用 `var(name, 哨兵)` 探测（哨兵 `rgb(1,2,3)`） | 无宿主变量时系列色 = `#2563eb / #e07b39 / #2f9e6b / #a855f7`，黑色 **0** 条 |
| 7 | 片段 `<style>` 里 7 处裸 `var()`（`--border` ×1、`--muted-foreground` ×5、`--background` ×1）无 fallback（Kuhn P1-2） | 全部加 fallback | 片段里已无裸 `var()`（`grep -c` 复核） |
| 8 | live region 更新粒度太密（每 10% 一次 = 10 次播报） | 改为 **25% 一档**（4 次里程碑） | 状态行仍覆盖全过程，播报次数降 60% |

### 跨浏览器 / 暗色 / 触屏的独立证据

- **Hilbert**：本机 Edge `149.0.4022.52`、Chrome `154.0.8037.58`、Playwright Chromium `151.0.7922.34` 三种 Blink 引擎：`console error/warning = 0`、`pageerror = 0`、`requestfailed = 0`、10/10 标签页可打开、26/26 canvas 位图非零且采样非空白、无横向溢出、`#gl-sky-pdop` 都是 `2.81`。**本机无 Firefox/Gecko/WebKit ⇒ 跨引擎仍未验证**（未下载安装）。
- **真暗色**（我补的，上一轮 Harvey 只能做 token 覆盖）：`colorScheme:'dark'` → body `#15171c` / fg `#e9eaee` / border `#383d47`、canvas 正常绘制（920×600 位图）、0 报错、无溢出；截图 `qa/v23-dark-dark.png`。

### 仍未做 / 未验证

1. **冷启动总时长仍是 4.5–6 s**：分片只削掉最长块，没减总量。4.2 s 步进阶段里历元 0 的 6 次二维捕获各 240–380 ms 是主要 TBT，而 `G.acquire` 的 `dopplerMinHz/MaxHz/StepHz` 只能整段搜索（峰值/次峰指标要整张相关面），**要分片必须改 `winners/acquisition*.js`**——属判据化实现，未动。
2. 触屏导航因此变成 **101px 高**（2 行 × 44px）：这是"44px 触控基线 vs 省竖向空间"的直接冲突，本轮选前者。
3. 同页注入两份片段时第二份不可用（Kuhn P2-1，`getElementById` 只命中第一份）：宿主每页应只注入一份；**未修**（需要 id 作用域化，成本高）。
4. `--border` 原始 token 对背景只有 1.39:1 / 1.65:1：它同时给画布网格线用，**有意保留**（控件边界已用 `--muted-foreground`）。
5. 未测 Firefox/WebKit、真实读屏器、**真机触摸**（只在设备模拟里验）；缩放限制未做（保留捏合缩放 = 对可访问性有利）。

### 本轮"我自己的判据错在哪"（如实记录）

- 我第一版把 `step()` 里的**细块生成**按 5 块分片：总时长 4.53 → **5.61 s（+24%）**，最长块几乎不变（1003 → 987 ms）⇒ **切错了地方，已回退**（Nietzsche 的归因指出真正的 99.9% 在 `finish()` 的 `G.pllTrack`）。
- 我加的收尾状态行第一版**根本没上屏**（同任务内写完即进同步块）；靠 Nietzsche 的逐帧 rAF 实测才发现。
- 我在模块级新函数里调了 `updateStats()` 内部的 `m()`，引入 `m is not defined`，导致收尾统计更新被跳过；我自己的探针**一开始没监听 `pageerror`**，只看到"文案没变"，绕了一圈才定位。

## 🧪 v22 第三轮：五个 ds4.1 并行复核 + 收口（2026-10-07）

**最终成品**：独立版 SHA-256 `7a4978615513e83ef01809b2bb531ebde4e9d3771dd275525d1315c1d2e45ac1`（**535 480 B**）；
宿主内联片段 **532 284 B**（45 模块）。**下面所有实测数字都绑定这个哈希**（子代理报告绑的是更早的中间版，见文末"方法教训"）。

**派发方式**：`multi_agent_v1__spawn_agent(fork_context=false, model="deepseek-v4.1-flash", …)`；本轮共 7 个 ds4.1 子代理，**全部已 `close_agent`**（用户明确要求不留已完成的子代理）。

| 昵称 | 任务 | 交付 | 状态 |
|---|---|---|---|
| Ramanujan | 版面/拥挤度（10 页 × 宽度 × 明暗，DOM 几何 + 219 张截图） | `review/ds41/w2-layout.md` | ✅ 已关 |
| Nash | 图表可读性（Canvas 内文字包围盒 / 越界 / 互压） | `review/ds41/w2-charts.md` | ✅ 已关 |
| Mencius | 可访问性 / 键盘 / 对比度 | `review/ds41/w3-a11y.md` | ✅ 已关 |
| Harvey | 4 宽度 × 明暗 × 10 页 = **80 组**版面 | `review/ds41/w3-resp.md` + 80 张 | ✅ 已关 |
| Gibbs | 打开路径 / 离线 / 缩放 / 打印 | `review/ds41/w3-open.md` | ✅ 已关 |
| Lovelace | 文案数字第二轮（42 个"页面声明"逐个核对） | `review/ds41/w3-copy2.md` | ✅ 已关 |
| Ohm | 初学者可读性（术语 / 三问） | `review/ds41/w3-learn.md` | ✅ 已关 |

### 这一轮修的真问题（改前 → 改后都有实测）

| # | 问题（抓到的代理） | 改法 | 改后证据 |
|---|---|---|---|
| 1 | `gl-sky-canvas` PRN 标签互压 **4 对**（Nash：420 与 980 各 4 对） | `app/10-sky.js` 改两遍绘制 + 候选位打分（文字×文字 ×14 + 文字×星点），仰角圈刻度与 N/E/S/W 也当障碍、越界候选剔除 | 探针 `gl-sky-canvas textColl 4 → 0`（两个宽度），31 个标签一个没丢 |
| 2 | 冷启动误差图**图例画在绘图框内**、压住曲线（Ramanujan：≥560 px 必现） | `app/81-coldstart-draw.js` 画布 210→**234**、图例一律画到框下（宽度够一行、不够两行） | 探针 `clip=0 / textColl=0`；980 px 截图肉眼确认图例在框外 |
| 3 | 全页 **0 个 `<h1>`**（Ramanujan） | `shell.html` 加 `<h1 class="gl-h1">GNSS 蜂群工作台</h1>`（17 px） | Mencius 复核：h1×1 + h2×10，无跳级、无重复 h1 |
| 4 | 窄屏导航占 **117 px / 3 行**（Ramanujan、Harvey） | `app/00-style.css` ≤620 px 收 padding+字号，≤400 px 再收一次 | `probe-chrome`：**420 → 73 px/2 行**、**360 → 73 px/2 行**（改前 106/3 行）；980/1280 → 43 px/1 行；10 个 tab 全部仍可见 |
| 5 | **12 个术语**首次出现未解释（Ohm） | `shell.html` 首屏加折叠「术语速查」（17 条一行释义：PDOP/RAIM/HPL/VPL/nmr/杠杆/chip/spc/C\/N0/σ/RMS/DRMS/TTFF/NEES/Costas/DLL/PLL/lag/历元） | 折叠态仅 **18–36 px**；Mencius 的顶部 Tab 探针命中该 summary |
| 6 | a11y **P2×3**（Mencius）：10 个 tab 全在 Tab 序列 / 无 landmark / 26 个 range 无 `aria-valuetext` | `activate()` 里设 roving tabindex；`#gl-panels` 加 `role="region" aria-label`；boot 里按 label 内动态值 span 同步 `aria-valuetext`（冒泡阶段，值先更新） | 片段内 `tabindex="-1"` ×9 + 当前 tab `tabindex="0"`；`syncRangeAria` ×5 处引用 |
| 7 | **+4 px 内部溢出**（Harvey 64/80 组、Gibbs 缩放档） | 根因：UA 样式 `input[type=range] { margin: 2px }` × 控件 `width: 100%` ⇒ `#gnss-lab .form-range { margin: 0 }` | `qa/probe-xoverflow.js`：420/1280 × 4 个标签页 `labScroll` **4 → 0** |
| 8 | 触控命中区太小（Harvey P1：滑杆命中高 16 px、复选框 13×13） | `@media (pointer: coarse)` 下滑杆 →28 px、复选框 →18×18（桌面布局不变） | 桌面实测数字不受影响；触屏档**未在真机触摸验证**（见未验证） |
| 9 | 文案 3 处与实现不符（Lovelace） | ①误差预算 σ 交叉点 `1 m` → **`0.5 m`**（σ=1 m 时模型 8.0 仍赢双频 11.1；σ=0.5 时双频 5.5 赢 7.2）②DLL 面板「采样量化下限 ±37 m」→「**4 spc 量化误差上限 ±37 m（平台中心 RMS 下限 21 m）**」③Hatch 读法 `0.36 m/83×` → **`0.34 m/≈89×`** | σ 用 `qa/iono-sweep.final.txt` 实测表；Hatch 用页面自身卡片读数（`qa` 探针：增长窗口 std 0.34 m、降噪 89×） |
| 10 | 冷启动「载波平滑/卡尔曼」两列是**单次实现**，换种子会翻转（Franklin 建议 A 的替代处置） | 不改算法（Franklin 明确不要改 `dll.js` dopplerHz / `pll.js` 增益），把口径写进冷启动折叠说明：本页固定种子可复现、判据用 40 组独立噪声取均值 | 文案（`shell.html` 冷启动 details 的"单次实现的方差（勘误）"） |

### 我自己的判据错在哪（如实记录）

1. 我以为「±37 m」已在页面上全局改正，其实 `app/82-dll-demo.js` 的**指标行与图注**里还在用（Lovelace 抓到，已改）。
2. Lovelace 报 Hatch「0.76 m / 39×」，与我**实测页面显示值 0.34 m / 89×** 不符 ⇒ **子代理给的数字也必须复核**；我按页面读数改文案。
3. Ohm 说"10/10 页缺导语"，但每页其实**已有**「读法：先看…」一行（`shell.html:86/127/180/237/289/338/365/424/547/719`）——只采纳它的术语清单与两处标签建议。
4. Ramanujan 与 Harvey 都指出「审计期间产物被重建」（本轮哈希依次 `d8ff778b → 1766372e → 0eb721e1 → 7629ea94 → 437edb2f → 074e32c5 → 7a497861`）。这是**我这轮的方法问题**：边审边改，导致子代理报告绑定的不是最终版。下一轮要么先冻结快照、要么审计期间不重建。
5. Ramanujan 报的"420 px 冷启动 2790 px"与我改前的 `probe-layout2` 口径（2275 px）不一致——它自己说明旧基线不可复现、**差值不能单独归因**；这类跨口径比较我以后不再合并引用。

### 最终验收（全部绑定 `7a497861…`）

- **Node 判据**：`bash tests/run-all.sh` → **21 套全绿，0 套失败**
- **浏览器判据**：`qa/check14…check25` **全部通过**（18/18、12/12、16/16、10/10、14/14、12/12、12/12、13/13、8/8、8/8、11/11、10/10），每套「控制台问题 **0** 条」
- **版面**：`qa/probe-layout2.js` 10 页 × 3 宽度 → **横向溢出 0 / 控制台 0**（sky·cold：1280 → 885·1625，980 → 931·1643，420 → 1388·**2271**）
- **骨架**：`qa/probe-chrome.js` 5 宽度 → `overflowX=false` 全部、h1 ✓、导航 1–2 行、**控制台 0**
- **图表**：`review/ds41/w3-charts-recheck.js` 26 canvas × 420/980 → **`clip=0` 全通过**；唯一残留是 `gl-auto-canvas`/`gl-cross-canvas` 同一字符重复绘制的**探测器假阳性**
- **内部溢出**：`qa/probe-xoverflow.js` → `labScroll=0`（420/1280 × sky/mp/cold/pll）
- **打开路径**（Gibbs）：`console error/warning=0、pageerror=0、requestfailed=0、非 2xx=0、外部请求=0`；**首帧 84.9 ms**、10 个面板绘制完成 ≈3 s

### 仍未做 / 未验证（如实记录）

1. **420 px 冷启动 2271 px（≈2.7 屏）**：再压需要「分步向导」级重构（成本中等，仍列为候选）；Harvey 用 844 px 视口高量到 360 px 冷启动 3017 px（≈3.35 屏）。
2. 触屏命中区只在 `pointer: coarse` 里放大，**未在真机触摸验证**；移动端 44×44 px 的建议仍未完全满足（复选框 18×18）。
3. `--border` 原始 token 对背景只有 1.39:1 / 1.65:1（Mencius 记为残余风险）：它同时给**画布网格线**用，改成 3:1 会让所有图的网格变重，**有意保留**；控件边界已单独用 `--muted-foreground`（6.4:1 / 7.8:1）。
4. 未测 **Firefox / Safari / 真实读屏器**（NVDA/JAWS/VoiceOver）、未做色盲模拟、未做 400% 缩放重排。
5. 面板**首绘 ≈3 s**（首帧 84.9 ms 不阻断）；冷启动面板点一次"执行"仍是秒级真计算，未做后台化/分片。

## 🔍 v22 第二轮：三个 ds4.1 复核代理（2026-10-07）

对**当前构建**再派 3 个 ds4.1 独立复核（前一轮审计绑定的是旧 md5）：
**Ramanujan**（版面/拥挤度复核，运行中）、**Nash**（图表可读性复核）、**Copernicus**（文案数字一致性）。

**Copernicus 抓到 8 处"页面文案与当前实现不符" + 2 处可疑数字，已全部改正**（逐条有 `shell.html:行` + 对照出处）：
`±37/±18/±3.7 m` → 改成"平台宽 73.3/18.3/7.3 m、平台中心下限 21.2/5.3/2.1 m"；鉴相器口径（默认 **Costas**，
不是 atan2）；多径模型（`exp(−额外延迟/1.5 chip)` + >6 chip 截断，不是"±1 chip=293 m 的 1/10"）；
双频残差 `1e-15 m` → **1.1e-8 m（相对 5e-16）**、放大 `2.98×` → **2.978255×**；冷启动 `41 格` → **101 格**（100 Hz 步长）、
TTFF 只计捕获；`0.12 chip≈36 m` → 首历元精修 RMS **6.35 m（理想）/2.53 m（4 MHz）**；KF 判据数字
→ **LS 84.3 → KF 40.5 m、NEES 2.78、覆盖率 96.5%**（本轮 `tests/test-navfilter.js` 实测）；`T0` 补到毫秒
（`22:32:31.853Z`）；Hatch `0.4 m/≈75×` → **0.36 m/≈83×**；`113→37 m` → **28.8→8.9 m（3.2×）**；
"4.2 万格"注明是**折叠后等效**（原始 4092×41）；误差预算的"天顶 4 m/5° 25 m"改为给条件并标注本页当前场景 ≈7/≈42 m。

**Nash 的图表复核（给出 canvas 级包围盒证据）与处置**：
| Nash 结论 | 处置 |
|---|---|
| ② 420 每颗星捕获耗时 **已修**（380×340、clip=0、textColl=0） | 保持 |
| ④ 右端刻度 **已修**（acq/atm/ca/auto/cross 的 1023/90/64 完整） | 保持 |
| ⑤ 多径侧视图 **已修**（说明移到框下、无相交） | 后来我又把它改成"图例在框下"（420/980 均干净） |
| ① 冷启动误差图：420 主标注已不重叠；**980 末端标注仍相交**（载波平滑 vs 卡尔曼，area=204） | 彻底修：**删掉 3 条末端标注**，数值并入图例（宽屏 1 行、窄屏拆 2 行）⇒ clip=0、textColl=0 |
| ③ 捕获剖面：`1023` 已不重叠，但**轴标题被画到画布外**（143 > 140） | 修：底部留白 52→**76** ⇒ clip=0 |
| 新 P1 `gl-geo-canvas` 420 "当前 2.93"与标题相交 472 px² | 修：改右对齐到框右端 |
| 新 P1 `gl-pos-iono-canvas` 底部说明右越界 33.8 px | 修：图例缩短（"空心＝等权 · 实心＝高程加权（偏移 a / b m）"） |
| 新 P1 `gl-raim-pl` VPL 被裁、420 下 HPL 与告警限相交 | 修：用 `C.labelTick`（边缘感知）+ 三行错开 ⇒ clip=0 |
| 新 P2 `gl-raim-resid` 阈值标注与刻度互压 | 修：阈值标注改左对齐 |
| 新 P2 `gl-mp-curve` "偏差 (m)" 左越界 0.9 px | 修：单位并入标题，删掉该独立标注 |
| 新 P2 `gl-atm-err-canvas` "当前 70% → 1.01 m" 右越界 0.8 px | 修：左/右对齐按**剩余宽度**判定（阈值由固定 0.7 改为 `box.x+box.w-132`） |
| 单位缺失：C/A 相关图 lag 轴 | 修：加 `时延 lag (chip)` |

**结构性修正**：那个"这些数是怎么算出来的"全局折叠块原先夹在 `pos` 与 `mp` 面板之间（会出现在 cold 等页面的**面板上方**），
已移到 `#gnss-lab` **末尾**；现在 DOM 顺序是 `intro → nav → 10 个面板 → 附录折叠块`（实测确认）。

**第三批修复（Nash 探针第二轮发现）**：`gl-geo-canvas` 的"当前 PDOP"并入左侧标题（原来与"可见星"完全同位 → 330 px² 相交）；
`gl-pos-iono-canvas` 的说明在窄屏（box.w<430）**拆两行**（原 420 下右越界 33.8 px）；
C/A 相关图 canvas 200→**216**（新增的 `时延 lag (chip)` 竖直越界 2.9 px）。
复测结果与最终清单见下一节的"最终越界/碰撞清单"。

**第四批（最终）修复**：C/A 相关图的单位标注先后试了"x 轴下方"（竖直被裁 2.9 px）与"标题行右端"（与右侧副标题相交 721 px²），
最终落在**绘图区左上角**（`横轴：时延 lag (chip)`，10px）——Nash 探针与截图双重确认无相交/无裁切；
全球几何图的标题与"当前 PDOP"改为两行、"可见星"独立一行（消除 330 px² 相交）。

**最终图表体检（Nash 探针在最新构建上的输出）**：**26 个 canvas 在 420 与 980 两个宽度下全部 `clip=0`**（无任何文字越界）；
`textColl` 只剩 `gl-sky-canvas` 的 4 对 PRN 标签（极坐标密集标签，纯外观）；
`segHits`（文字与线段的相交计数，如冷启动条形图的网格线）属外观统计，不影响可读性。

**仍未处理（如实记录）**：`gl-sky-canvas` 在 420 下有 4 对 PRN 标签互相压（极坐标密集标签，属外观瑕疵）；
`gl-raim-pl` 的"RAIM 后最大…"文字与保护限级竖线相交（segHits，不影响数值可读）。

## 🎨 v22 页面质量轮（2026-10-06，进行中）

用户新目标：**结构完整、无错误、无打开问题、页面美观不拥挤、简单易懂、清晰明了**。

**已实测的现状（`qa/probe-layout.js` / `qa/probe-layout2.js`，Chromium 5 宽度 × 明暗）**
- 页面共 **10 个标签页**（此前文档误写 13，已更正）；`file://` 直开、控制台 **0 问题**；**5 档宽度均无横向溢出**。
- 改前的"拥挤"客观指标：冷启动页 **13 个控件 / 8 段 / 最长 840 字 / 980 px 下高 2883 px**；载波页最长段 **1041 字**；定位页 634 字。

**已做的改法（只动排版与文案，不动任何数字）**
1. 控制分组：冷启动的 11 个控件装进 **4 个带标题的框**（① 场景 ② 接收机前端 ③ 电离层 ④ 算法与执行），
   新增 `#gnss-lab .gl-group/.gl-legend` 样式；窄屏（≤620 px）自动单列。
2. 长文折叠：**5 处长段**（>300 字）机械拆成「首句可见 + `<details>` 折叠其余」——
   不新增/不改任何数字，只是把推导、实测、边界收进折叠块；展开后原文一字不少。
3. 引导句：采纳 ds4.1 子代理（Carson）给出的 4 条 ≤90 字"先看什么"读法（定位 / 误差预算 / 冷启动 / 载波），
   替换我机械拆出的、过短或过长的首句。
4. 口径修正（Carson 攻出的文案问题）：`×20` 那句补成"活跃度 ×20 档、实测比 ≈16.8×"；`噪声 ×2.98`→`×2.978`；
   Hatch 的"~80 倍"→"≈75 倍"；冷启动折叠里新增一条**量纲说明**（平台宽 73.3/18.3/7.3 m ↔ 平台中心下限 21.2/5.3/2.1 m，
   老文案的 ±37 m 是平台半宽）。

**改后实测**：冷启动页 980 px 下 **2883 → 1829 px（−36%）**，仍无横向溢出；`check20 12/12`、`check19 12/12`、
`check25 10/10`、`check24 11/11`、`check16 16/16` 全绿（文案改动未碰任何判据依赖的 id 与数字）。

**本轮 ds4.1 子代理（全部用 `spawn_agent(model="deepseek-v4.1-flash")` 派发，会话记录核实为 ds4.1）**
| 昵称 | 任务 | 状态 |
|---|---|---|
| Carson | 文案简化候选（每页 ≤90 字读法 + 折叠要点 + 数字溯源） | ✅ 已交付并采纳 4 条，已关闭 |
| Poincare | UI/UX 独立审计（5 宽度 × 明暗截图 + 拥挤/溢出/重叠指标） | 运行中 |
| Aquinas | 结构完整性 / id 引用 / 打开方式 / 可访问性审计 | 运行中 |
| Pascal | **上一轮未完成项**：带限档下 PLL/Hatch 与前端带宽不一致（量化 + 候选实现） | 运行中 |

**Poincare（UI/UX 独立审计）的客观结果**：114 张截图（5 宽度 × 明暗 × 10 页 + 定向取证）；
**error/warning/pageerror/失败请求 = 0/0/0/0**（100 个页面实例）；`file://` 加载 1276–1342 ms；
页面级横向溢出 **0**；文字被裁 **0**；真实可见重叠 **0**；26 个 canvas 无零尺寸/无压扁；
深色文字对比度全部合格（最差 6.75:1）；交互 100 次无卡死。它同时独立发现了我修的 `gl-dll-canvas` 空白块缺陷
（"冷启动面板 2155 → 1605 px"）。

**对它 5 条建议的处置**

| Poincare 建议 | 处置 |
|---|---|
| ① 标签页口径 10 vs 13 | **定死为 10 个标签页**：`[role=tab]` 10 个；DLL 对比 / Hatch 平滑 / 双频消电离层分别是**冷启动 / 载波跟踪 / 误差预算**面板内的子块。页面与文档里从未写过"13"（"13"只出现在我早期口述的误计里，已更正） |
| ② 420 宽冷启动 11 控件排 11 行、2543 px | 已做：窄屏密度收紧（`@media ≤620px` 缩小分组内边距与标签间距）；**控件分 4 组**；**未做**向导式分步（成本/收益待定，列为下轮候选） |
| ③ 各面板首段"读法"纳入 `<details>` | 已做：共 **13 个 `<details>`**；每页保留 ≤90 字短读法（可见）+ 完整读法/推导折叠（原文字与数字一字不改） |
| ④ 导航吸顶 + 补 `<h2>` | 已做：`#gnss-lab > .nav.nav-pills { position: sticky; top: 0 }`；**10 个面板各加一个 `<h2 class="gl-h2">`**（此前 h1/h2/h3 = 0） |
| ⑤ 分组与边界（描边对比度 1.39/1.64） | 已做：`#gnss-lab .form-select/.btn` 与 `.gl-group` 的边框改用 `var(--muted-foreground)`（light 6.4:1 / dark 4.0:1 量级）；其余 9 个面板的分组**未做**（它们的控件数 ≤8，分组收益低） |

**ds4.1 子代理审计 → 已修的 4 个真问题（Aquinas 结构审计 + 我自己的截图复核）**

| # | 问题（证据） | 修法 | 效果 |
|---|---|---|---|
| 1 | `gl-atm-freq-val` 悬空引用：`app/70-atm.js:147` 调 `setText('gl-atm-freq-val', …)`，但页面没有该节点（`setText` 有 `if(e)` 保护 ⇒ 静默失效，L1/L2 动态标签永不显示） | 在 `shell.html` 的「载波」label 里补 `<span id="gl-atm-freq-val">L1</span>` | 动态标签恢复显示 |
| 2 | `role="tab"` 只有 Tab 可达，**方向键不切换**（Aquinas 实测：聚焦后按 → 焦点与 `aria-selected` 都不动） | `app/90-boot.js` 给每个 tab 加 keydown：←/→/↑/↓/Home/End（按 ARIA tablist 约定） | 键盘导航可达 |
| 3 | **`gl-dll-canvas` 从未被绘制**：位图还是默认 **300×150**、无显式高度 ⇒ 被 CSS 拉成 **940×470 的空画布**（截图里那片大空白）。根因：`app/90-boot.js` 的绘制调度表里**没有 `dll` 分支**，`APP.panels.dll.draw()` 永远不被调用 | 在 `cold` 分支里一并调用 `APP.panels.dll.draw()` | 画布 **940×470 → 940×230**、位图 300×150 → 940×230（不再模糊拉伸）；**冷启动页 980 px 下 1829 → 1589 px** |
| 4 | TTFF 阶梯图的"纵轴＝累计毫秒"画在**图内左下**，压住 y 轴刻度与台阶线（截图可见） | 该说明并入图标题，删掉画内那行 | 刻度不再被压 |

**冷启动页总效果**：980 px 宽下 **2883 → 1589 px（−45%）**；420 px 下 2477 →（待本轮末重测）px；**所有宽度仍无横向溢出、控制台 0 问题**。

**Aquinas 审计的"通过项"**（可作为验收证据）：10/10 标签页可打开；`aria-controls`/`aria-labelledby`/`hidden` 一一对应；
209 个 id 无重复、代码引用的 id 全部存在（除上面第 1 条已修）；**26/26 canvas 有 `role="img"` + 非空 `aria-label`**；
**49/49 表单控件有可访问名称**；7/7 `details/summary` 可 Enter 展开；无 tabindex 陷阱；
`.text-muted` 对比度 light 5.87–6.40:1、dark 6.75–7.79:1（均 >4.5:1）。

**口径澄清（Aquinas 提出）**：① 页面就是 **10 个标签页**（不是 13；文档已更正）；② `gl-panel-geo` 本地控件数为 0 是
**有意设计**（复用星座面板的输入）；③ 宿主内联片段本身不是完整 HTML 文档，**只能嵌在宿主里用**；
独立验收请用 `outputs/gnss-swarm-lab.html`（含 `99-standalone.css`，file:// 直开）。

**Volta（图表可读性独立审计）结果与处置**：26 个 canvas 全部有 `role="img"` + 非空 `aria-label`；
位图/CSS 比例 0.999–1.001（**无模糊拉伸**）；无 <10px 字号（但 pos/iono/dll/pll/hatch 用 10px 小字）；
`gl-chip-canvas` 940×74（码片条，可接受）。它给的 5 条优先项与处置：

| Volta 优先项（文件:行） | 处置 |
|---|---|
| ① 420 宽「误差 vs 历元」多条末端标注重叠（`81-coldstart-draw.js:102,110,119,129,131`） | 已修：窄屏（<560px）**只保留主标注** `N=…→… m`，其余三条略去；图例移出绘图区到框下；画布 210→244 |
| ② 420 宽「每颗星捕获耗时」绘图区仅 ~155px、行说明溢出（`81-coldstart-draw.js:10,13,30-31`） | 已修：窄屏行高 30→46、条在上说明在下（**单行紧凑标注**：`203 ms · 峰 13.5σ · 码 6 m · 多普勒 26 Hz`）、绘图区左边界 74→46、标题缩短 |
| ③ 420 宽捕获剖面 `1023` 与「码相位 (chip)」轴标题重叠（`31-acq-draw.js:119-121`） | 已修：轴标题移到刻度**下一行**（+13 → +29），`1023` 改为右对齐贴轴端 |
| ④ 右端刻度居中导致系统性裁切（`31-acq-draw.js:88`、`71-atm-draw.js:42,78`、`20-ca.js:36,48`） | 已修：新增 `C.labelTick()`（**边缘感知刻度**：贴左/贴右自动改 left/right 对齐），6 处刻度行全部替换 |
| ⑤ 多径侧视图文字压在射线/彼此之上（`51-mp-draw.js:53,63`） | **未修**（排最后，本轮时间用尽）——已记入待办 |

另外我自查发现并修掉一处**我自己引入**的问题：TTFF 图标题在 420 px 下过长被裁（我把纵轴说明并进标题造成）→ 改为窄屏短标题。

**v22 版面最终数字（`qa/probe-layout2.js`，改前 → 改后）**

| 宽度 | 冷启动页高 | 载波页高 | 星座页高 | 横向溢出 | 控制台 |
|---|---|---|---|---|---|
| 980 px | **2883 → 1603**（−44%） | 1142 → 1118 | 905 → 885 | 全页 0 | 0 |
| 420 px | **2543 → 2241**（−12%） | 1916 → 1649 | 1631 → 1392 | 全页 0 | 0 |

* **13 个 `<details>`**（每页 1 个「完整读法/详细说明」，冷启动与载波各 2 个）——长段全部折叠，短读法可见；
* **10 个 `<h2>`** 面板标题（此前 h1/h2/h3 = 0）；导航吸顶；控件边框对比度按 WCAG 非文本对比度加粗；
* 窄屏（≤620 px）：滑杆类控件两列、指标卡三列、分组留白收紧。

**本轮已验证**：Node **21 套全绿**；浏览器 **check14–25 全绿**（含 check25 冷启动 10/10）；check7/8/9 三档宽度
`overflow=false`；两个 layout 探针 5 宽度 × 明暗 **0 控制台问题、0 横向溢出、0 可见画布被压扁**。

**仍待办**（本轮结束前的目标）
1. **Hatch/KF 退化的根因（新第一优先）**：Pascal 已证伪"PLL/复制码不一致"（归一化斜率一致、Hatch RMS Δ=0.00 m），
   我的 S 曲线探针又**证伪了"DLL 多普勒陈旧"**（带限档过零点偏移恒 0.00 m，反而理想方波档会跳 −14.65 m）。
   ✅ **已结案（ds4.1 子代理 Franklin 复核，两条假设都被证伪，"退步"是假象）**：
   - DLL 残余多普勒：**带限档 S 曲线过零点对 Δf = 0…±200 Hz 恒为 0.000 m**（理想档反而跳 −14.65 m）；环路 ±50 Hz 只动 0.013 m。
   - 载波速率偏差：实测 **0.0021–0.0027 m/历元**（两档相同），不是 HANDOFF 里引的"G02 0.97 m/历元"——
     **那个数字已过期**（当前构建 `qa/probe-phi-share.js`：G21 0.010 / G02 0.002 / G05 0.003 m/历元）。
   - 真因：`hatchSmooth({window:0})` 严格等价于**码误差的滑动平均**（手工复算与 `st.smoothPrM` 逐历元差 0.00 m），
     两档该滑动平均量级相同（3.24 vs 3.18 m），差的是**方向**，再经高 DOP 几何投影（增益 ×1.9–4.4）。
     **决定性证据：换种子优劣翻转**（+1000 → 带限 8.39 vs 理想 16.40 m；+54321 → 6.46 vs 18.21 m）。
   - ⇒ **不要改** `winners/dll.js` 的 dopplerHz、`pll.js` 增益、`phaseM` 公式（Franklin 明确结论）。
   - **下一轮第一优先**：把 `hatchRms`/`kfRms` 从"单次实现"改成**多实现取均值**（推荐 ≥3 个种子偏移），
     否则两档比较会被方差（±15 m 量级）淹没。
2. 420 px 冷启动页仍 **2241 px**（约 5.3 屏）：继续压缩需要"分步向导"级别的重构（Poincare 建议②，成本中等，已列为候选）。
3. 分组（`.gl-group`）只做了冷启动页；其余 9 页控件 ≤8 个，分组收益低 —— **有意不做**（记录口径）。
4. Volta（图表可读性审计）仍在跑，其清单到货后按需修。

## 🅿️ 本轮收尾状态（2026-10-06，用户要求"完成这轮后整理一下，先停下来"）

**子代理已全部关闭**：`job_list` 无运行中任务。本轮共起 **4 轮 ds4.1**（全部用 `codex exec`，无 GPT/Claude 子代理）：

| 轮次 | 产物 | 状态 |
|---|---|---|
| A | `review/ds41/floor-model.md`（独立复现"平台"机制 + 提出平台中心估计器） | ✅ 已采纳 |
| B | `review/ds41/attack-finesearch.md`（6 条缺陷：edgeHit 只报 20%、4 类校验洞、跨档计时不可作判据、恒等式判据、SNR 口径、面板口径） | ✅ 6 条全处理 |
| C | `review/ds41/attack-bandlimit.md`（8 条：**σ↔3dB 换算错 2√2**、2×2 数字口径、估计器偏差、M 收敛、最优带宽口径、winChips=0、面板带宽漏点…） | ✅ 8 条全处理（其中"PLL 细块 bwHz"改为下一轮第一优先） |
| D | `review/ds41/prompt-D.txt`（复核改正后的常数与新结论） | ⛔ **被提前终止，未产出报告**；恢复时直接 `codex exec --skip-git-repo-check "$(cat review/ds41/prompt-D.txt)"` |

**权威验证状态（本轮结束时的真实现状）**

* Node：`bash tests/run-all.sh` → **21 套 / 505 项全绿**（新增 `test-bandlimit.js` 31 项、`test-finesearch.js` 36 项）
* 浏览器：check25 10/10、check24 11/11、check21 13/13、check22 8/8、check23 8/8、check16 16/16、check15 12/12
  （check14/17/18/19/20 在 v20 轮全绿；本轮改动不触及它们的路径。**所有浏览器判据都是 0 条控制台问题**）
* 产物已重建：内联片段 512,697 B ／ 独立版 515,893 B（都含「前端带宽（IF 滤波）」四档与改正后的 σ 常数 0.13251）

**本轮结论一句话**：相关峰顶那个"平台"有**两个**来源 —— 信号侧硬采样（物理）+ **复制码整数样本量化（我自己的实现伪影）**；
补齐"带限前端 + 分数延迟复制码"后，同一采样率下码相位 RMS 从 11.4 m 降到 **4.6 m**，原始定位 RMS 从 28.8 m 降到 **21.8 m**。

**未完成 / 下一轮第一优先**（停下来时的工作边界，按优先级）

1. **PLL 细块没吃到 `bwHz`**（`app/80-coldstart.js` 里那 25 个 4 ms 细块仍按理想方波生成），且 `winners/pll.js` 走
   `correlateIQ`（硬采样镜像复制码）⇒ 这是"带限档下**载波平滑/卡尔曼反而退步**（10.7→15.6 m、8.9→11.8 m）"的最可能原因。
   修完必须重测 check19/21/22 的门限（它们的基线是理想方波 + 4 采样/chip 细块）。
2. **4 spc 档的"带限 + 插值"格数值不稳**：模块给 21.84 m、ds4.1 自写估计器给 19.04 m（无表精确 18.80 m），
   都在 21.15 m 下限附近 ⇒ **定性结论（4 spc 不突破）稳**，但单个小数不能引用；要精确值须先固定 `stepChips` 口径与估计器。
3. **跨档计时不要当判据**（B 轮教训）：`acq16/acq4` 同一份代码能跑出 0.98×–4.52×；只保留"细修 < 同档全码捕获 20%"这类同档比较。
4. `winners/finesearch.js` 的 `plateauM` 只是"本次扫描观测到的等值段宽"（随 stepChips 变），物理量是 `resolutionM = c/fs`；
   引用时别混。

## ✅ 子代理政策（用户要求：只允许 ds4.1；2026-10-06 更正）

**`spawn_agent` 支持 ds4.1** —— 传 `model: "deepseek-v4.1-flash"` 会被真正采用。
证据（可复现）：子代理自己的会话记录 `C:\Users\31040\.codex\sessions\<日期>\rollout-<时间>-<agent_id>.jsonl`
第一行 session_meta 含 `"model_provider":"custom"`、`"model":"deepseek-v4.1-flash"`。
（我一度以为 `spawn_agent` 的模型清单没 deepseek 就不能用，是**错的**：那份清单只是"常用可覆盖模型"提示，
`model` 参数本身接受任意模型串。子代理**自报模型不可信**——实测两个探针都只能说"Codex"，环境里没有模型变量。）

**首选**（用户偏好"用 codex 派发子代理的功能"）：
```
spawn_agent(model="deepseek-v4.1-flash", fork_context=false, message="<自包含任务书>")
```
* 有昵称、出现在面板；**完成后必须 `close_agent`**（否则面板一直留着，用户会看到）。
* 派发后第一件事：用上面的 session_meta 路径**核实它真是 ds4.1**（5 秒）。
* **可以多开**（用户明确鼓励）：并行跑独立的审计/候选任务，互不写同一文件。

**备选**（需要独立进程 / job 管理 / 超长任务）：`codex exec --skip-git-repo-check "<prompt>"`（默认配置 = ds4.1 + 本机 127.0.0.1:8318，命令行零凭据），
长任务用 FastCtx `run_background` + `job_output`。

**禁止**：`spawn_agent` 不指定 model（会落 claude/gpt）；用 GPT/Claude 当子代理；把 bearer token 写进命令行。

**任务书模板**（三轮 ds4.1 攻防验证有效）：①被审查对象的接口 + 当前数字 ②"必须自己写实现，不许拿我的模块当证据"
③只许写 `review/ds41/` ④"判据是恒等式 / 靠单样本侥幸 / 数字复现不出来，都要如实写出来并给证据"。

## 重建 / 验证
```bash
cd /d/codex/2026-10-05/new-chat/work/gnss-swarm
NODE="C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
FRAG="C:/Users/31040/.codex/visualizations/2026/10/05/01a10c98-950b-7151-a024-b4d3630dcd87/gnss-swarm-lab.html"
"$NODE" build.js "$FRAG"                       # 写内联片段（注意：该路径在工作区外，需提权）
"$NODE" build-standalone.js "$FRAG" "D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html" "GNSS 蜂群工作台"
bash tests/run-all.sh                          # 15 套权威判据（累计 322 项检查），全绿才算通过
"$NODE" qa/check14.js                          # 浏览器：真实星座开关 + 冷启动码相位（需提权启动 Chromium）
"$NODE" qa/check15.js                          # 浏览器：跟踪环 vs 快照平均（独立对比面板）
"$NODE" qa/check16.js                          # 浏览器：冷启动主流程（首历元捕获+跟踪）vs（独立捕获+平均）
"$NODE" qa/check17.js                          # 浏览器：跟踪态 + 8 维卡尔曼滤波
"$NODE" qa/check18.js                          # 浏览器：载波跟踪面板（Costas PLL vs atan2、数据位翻转）
"$NODE" qa/check19.js                          # 浏览器：载波平滑（Hatch）区块
"$NODE" qa/check20.js                          # 浏览器：定位面板的电离层三情景蒙特卡洛
"$NODE" qa/check21.js                          # 浏览器：冷启动精度阶梯（原始→载波平滑→卡尔曼）
```

## 权威判据（tests/，21 套 / 505 项；另有浏览器判据 check14–check25（check24=11 项、check25=10 项））
| 判据 | 目标模块 | pass |
|---|---|---|
| test-signal-conv.js | lib/signal.js（码相位镜像约定 + 采样量化下限） | 11 |
| test-ca.js | winners/ca-code.js | 13 |
| test-ephemeris.js | winners/ephemeris.js | 20 |
| test-acquisition.js / test-acq-v2.js | winners/acquisition.js / acquisition-v2.js | 27 / 23 |
| test-finesearch.js | winners/finesearch.js（码相位平台 / 平台中心 / 两级搜索 / 幅度门） | 36 |
| test-bandlimit.js | lib/signal.js（带限前端）+ finesearch（分数延迟复制码 / auto 估计器） | 31 |
| test-positioning.js / test-raim.js | winners/raim.js | 15 / 17 |
| test-multipath.js | winners/multipath.js | 28 |
| test-atmos.js | winners/atmos.js | 25 |
| test-uwls.js | winners/uwls.js | 25 |
| test-multiconst.js | winners/multiconst.js | 27 |
| test-isb.js | winners/isb.js | 26 |
| test-hpl.js | winners/pl.js | 17 |
| test-realconst.js | winners/realconst.js（+ real-sat-elements.js 数据） | 29 |
| test-dll.js | winners/dll.js | 23 |
| test-navfilter.js | winners/navfilter.js（8 维 CV 卡尔曼） | 24 |
| test-pll.js | winners/pll.js（Costas 载波环 + 逐历元码相位）+ lib/signal.js 基元 | 42 |
| test-hatch.js | winners/hatch.js（载波相位平滑码 / Hatch 滤波） | 29 |
| test-ionofree.js | winners/ionofree.js（双频消电离层组合基元） | 17 |
| qa/check24.js | 浏览器：接收机采样率（ADC 档）4/16/40 | 11 |

## 本轮新增（2026-10-06）
1. **真实 GPS 星座**（`winners/realconst.js` + `winners/real-sat-elements.js`）：CelesTrak 32 颗在轨 GPS
   平均根数（抓取于 2026-10-05）+ 简化开普勒传播。契约见 `CONTRACT-v7.md` §13-rev（**时间口径被修订**：
   统一参考时刻 T0 = 2026-10-05T22:32:31.853Z，逐星各用自身历元 θ 的旧口径已被实测证伪）。
   页面：星座面板新增「星座来源」下拉（合成 Walker ↔ 真实 GPS）。
2. **码相位镜像约定修正**（真 bug）：`correlateAt` 的复制码延迟与 `makeSignal/acquire` 的码相位方向相反。
   原先冷启动面板的「精修」是在去相关区搜噪声，实测逐颗码相位误差 100–200 m → 修正后 36 m。
   新增 `GNSS.chipsToCorrelateOffset / correlateOffsetToChips` 与 `tests/test-signal-conv.js`。
3. **采样量化下限（模型性质，已判据化）**：4 采样/chip、C/A 码每 chip 取值恒定 ⇒ 码相位不可区分区间
   0.25 chip ≈ 73 m，任何估计器误差下限 ±37 m；16 采样/chip 时降到 0.010 chip。页面文案已据此改写
   （原先"多历元按 √N 变准"的说法被实测证伪：残差是量化偏差，平均消不掉）。
4. **带环路滤波的 DLL 跟踪环**（`winners/dll.js` + 面板九附的对比图）：二阶 PI 环路（α=0.4, β=0.06）。
   实测：静态 15 m；0.27 chip/历元动态下环路 19 m vs 快照平均 604 m（**32 倍**）；低带宽 α=0.25 时
   一阶环失锁（386 m）而二阶环仍锁在 55 m。契约 `CONTRACT-v8.md` §14（含被实测证伪的教科书公式的更正文）。

5. **冷启动主流程改成"首历元捕获 + 后续跟踪"**（app/80-coldstart.js + 81/82）：
   新增「历元间策略」下拉（跟踪环 / 独立捕获+平均）与「历元间隔」滑块（0–300 ms，默认 100 ms）。
   历元间隔让卫星在历元之间真的跑起来（100 ms × 800 m/s ≈ 79 m ≈ 0.27 chip），于是：
   - **跟踪态**（默认）：TTFF = 6 颗首历元二维捕获共 ≈493 ms，之后每次跟踪更新只要 **1.85–1.98 ms**
     （比重新捕获便宜 ≈45×），码相位 RMS 28 m，定位误差 43 m，42 次更新全程锁定。
   - **对照**（每历元独立捕获 + 平均，同 100 ms 间隔）：定位误差随历元**单调变差** 35 → 347 m
     （结构性滞后，N 越大越差）。
   - 把历元间隔拖回 0：两者都回到 35 → 27 m 的采样量化下限附近，误差曲线变平。
   浏览器端逐条判据见 `qa/check16.js`（16 项，含"标签随模式切换"这类 UI 一致性检查）。

6. **8 维 CV 卡尔曼导航滤波器**（`winners/navfilter.js`，契约 `CONTRACT-v9.md` §15；竞标 winner = **B 版**，用 Cholesky 解 `S·X=HP` 求增益 + **Joseph 形式** `P←(I−KH)P(I−KH)ᵀ+KRKᵀ`，对 A 版（直接求逆 + `(I−KH)P`）与我的独立参考实现做交叉比对：状态与协方差最大差 2.6e-2（P 对角，量级 1e6），边界行为完全一致；选 B 是因为长历元下数值更稳）：
   状态 `[x,y,z,clk,vx,vy,vz,clkRate]`，标准 CV 离散化过程噪声 + 伪距量测 `H=[−u,1,0,0,0,0]`；
   观测 <4 颗时只预测并标 `degraded`；缺省用 `GNSS.solvePosition` 初始化（**注意它吃扁平 `{x,y,z,prM}`**）。
   Node 判据 24 项实测：静态 GPS-only LS 84.8 m → KF 40.3 m（2.11×）、三系统 30.5 → 18.0 m（1.70×）、
   动态 5 m/s 82.8 → 38.6 m（2.15×）；**一致性体检 NEES 2.88（理论 3）、95% 置信椭球覆盖率 95.8%（理论 95%）**；
   `solvePosition` 自身有 3.5% 历元不收敛（线搜索失败），而滤波解 0% 非有限。
   浏览器端（check17，10 项）：跟踪态勾选后逐历元 RMS **112.6 → 36.5 m（3.08×）**，抖动 43–219 m 收敛到 24–37 m；
   对照模式下滤波只能把 203.5 → 105.6 m（结构性滞后不是噪声，滤波修不掉）——"先跟踪、再滤波"各管一件事。

7. **载波跟踪环（Costas PLL）+ 第 10 个标签页**（`winners/pll.js`，契约 `CONTRACT-v10.md` §16；
   lib 新增 `makeSignal({carrierPhaseRad})` 与 `GNSS.correlateIQ`，两者都向后兼容——默认参数下既有 16 套判据逐位不变）：
   - 环路：prompt I/Q → 鉴相 → PI 环路（`acc += beta·d; phi += alpha·d + acc`），`freq` 输出残余频差；
   - 鉴相器可选：`disc:'atan'`（相位锁定型，**被 180° 数据位翻转踢走**）与 `disc:'costas'`（`I·Q/(I²+Q²)`，**复幅度整体取反不变 → 免疫翻转**）；
   - 契约里我最初把 `atan2` 说成 Costas 鉴相——**这是错的，实测推翻**：翻转后 atan 的 NCO 跑到 3.484 rad，
     Costas 只动 0.069 rad；
   - 实测（判据 29 项）：静态稳态 rms 0.045 rad；2 Hz 残余多普勒下一阶环滞后 **0.408–0.478 rad**（教科书 2πf·dt/α≈0.42）、
     二阶环 **0.008–0.046 rad**；多普勒变化率 0.002 rad/历元² 下二阶仍有 0.093 rad（要三阶环）；
     前提是**本振频率必须由捕获给出**（给 0 时 1200 Hz 多普勒在 4 ms 内转 4.8 圈，相关对消、锁不住）；
   - 竞标 winner = **B 版**（显式状态机 {phi, freqRadPerEpoch, slipCount}），与 A 版及我的参考实现
     交叉比对 **相位逐位一致（0.000e+0 rad）**，边界行为一致；B 还给出牵入边界（atan 0.2–3.0 rad 全收敛、
     Costas ≥1.6 rad 锁到错误吸引子）与增益表（Costas 在 1.0 rad 处增益 0.455）；
   - **已知局限（已写进契约）**：`locked` 只判断"稳态鉴别器小"，不能判断"锁到正确相位"——
     Costas 大初相下会锁到错误吸引子却仍报 locked=true；
   - 浏览器端（check18，14 项）：Costas+翻转 后 20 历元平均 |误差| 0.043 rad 且锁定；atan+翻转 2.883 rad 且判未锁；
     一阶滞后 0.478 rad vs 二阶 0.046 rad；频差估计 2.08 Hz（真值 2）。

8. **载波相位平滑码（Hatch 滤波）**（`winners/hatch.js`，契约 `CONTRACT-v11.md` §17；配套 `app/85-hatch.js` 区块）：
   用载波相位**差分**平滑码伪距（模糊度自动抵消）。判据 29 项 / 浏览器 check19 12 项实测：
   - 生长窗口把 **30 m 码噪声压到 0.36 m（≈83 倍）**；固定窗口 N=20 → 2.95 m（短窗统计口径，长程为 4.50 m，理论 4.80 m）；
   - **初始码偏差消不掉**：初始 15 m → 稳态均值 15.35 m（平滑只压噪声，不消多径/群延迟这类偏差）；
   - **周跳检测的阈值窗口很窄**：残差 std ≈ √2·σ_code ≈ 42 m（不是 30 m），所以 3σ=90 m 阈值会误报
     （2000 周场景 3 次、早先 500 周场景 8 次），推荐 4.5σ≈135 m（只误报 1 次且能抓住真跳变）；
   - 2000 周（≈380 m）大周跳：不检测末值误差 194.6 m；检测+重置后 4.4 m（A/B 版）~11.3 m（我的参考实现）——
     差别来自"重置那一帧码误差"是随机的，所以只能给期望量级；
   - **重置不是免费的**：重置后平滑从头开始，绝对误差回到码测量量级；
   - 10 周（1.9 m）小周跳低于码噪声，单历元判据看不见，会被悄悄吸收成偏差；
   - 竞标 winner = **B 版**（显式状态 {P_s, prevPhaseM, count} + 噪声传递推导注释），与 A 版及参考实现
     交叉比对 **逐位一致（0.000e+0 m）**，resets/usedN 边界一致；
   - 派生结论：**载波平滑不怕匀速动态**（rate 0/5/50 m/历元 实测结果完全相同，因为只用相位差分）。

9. **双频消电离层接进定位面板（蒙特卡洛）**（`winners/ionofree.js`，契约 `CONTRACT-v12.md` §18）：
   把原先只存在于误差预算面板、且只有**单次抽样**的"不改正／模型改正／双频"对照，做成有判据的基元 +
   定位面板的 50 次蒙特卡洛（**同批噪声**）。判据 17 项 / 浏览器 check20 12 项实测：
   - 权重 `k/(k−1)`、`−1/(k−1)` 是"共同项保留 + 电离层精确消掉"两个约束下的**唯一解**（与两频噪声无关——
     竞标 B 版纠正了我最初"可按 σ 最优加权"的说法；只有**放松**消电离层约束才有加权自由度）；
   - GPS L1/L2：amp = **2.978255**；频对差别很大：L1/L5 **2.588（最小）**、L1/L2 2.978、L1/E6 3.510、
     L2/L5 **16.64（频率太近，几乎不可用）**；
   - 定位面板实测交叉点（`qa/probe-iono-sweep.js` 扫参）：×1/σ=2 m → 不改正 7.5／模型 7.4／双频 22.1 m；
     ×20/σ=1 → 23.3／**8.0**／11.1 m；×20/**σ=0.5** → 23.0／7.2／**5.5 m（双频才反超）**；
   - 两条反直觉结论（已进判据）：①"不改正"的误差**不随活跃度线性放大**（斜距延迟 25.8→433 m，水平误差只 7.5→23.3 m，
     因为共同模态被接收机钟差吸收）；②双频反超要求 **σ 足够小**（实测 ≤0.5 m），否则 2.978× 噪声代价先把它拖垮；
   - 竞标 winner = **B 版**（从观测方程解约束系统得到权重），与 A 版及我的参考实现交叉比对
     **逐位一致（0.000e+0）**，边界行为（同频→NaN/ok:false）一致。

10. **冷启动链路的"精度阶梯"**（`CONTRACT-v13.md` §16.2 + `CONTRACT-v14.md` §16.3 + `app/80-coldstart.js`）：
   把码环 → Costas 载波环 → Hatch 平滑 → 导航滤波真正串起来。浏览器实测（check21，10 项）：
   **原始码 59.4 m → 载波平滑 26.7 m → 导航滤波 23.3 m**（6 颗星、8 历元、100 ms 历元间隔）。
   这条路走下来踩了 5 个坑，全部有实测证据：
   - **更新率**：0.1 s 历元只喂 1 个 4 ms 块时，环路要吸收 2π·f_d·0.1（可达 2640 rad/历元），
     而二阶环每次更新只能动 ~0.2 rad → 实测本振相位误差 2.8–3.1 rad、根本没跟住。
     修法：**每个 0.1 s 历元内跑 25 个连续 4 ms 细块**（`st.fine[k][e]`，载波相位连续累积）。
   - **捕获的相位/频率基准**：`acquire` **不做多普勒插值**（峰值只落在网格上，实测 250 Hz 网格频率误差可达 83 Hz），
     而 Costas 的 `|d|≤0.5` 使 4 ms 更新下的牵引范围只有 ~8 Hz → 牵不进去。修法：网格收到 **100 Hz**，
     并用**宽牵引的 atan 鉴相牵入**（±50 Hz），锁住后再切 Costas 抗比特翻转（真实接收机做法）。
   - **`locked` 判据原本形同虚设**（`CONTRACT-v14`）：Costas 的 `d=0.5·sin2Δφ` 恒有 |d|≤0.5，
     所以"max|d|≤0.5 ⇒ locked"永远成立——实测把 prompt 码相位故意偏 300 chip（相关退化成噪声）时
     仍报 `locked=true`。修法：加 `mean(|I|/amp) ≥ 0.8`（真锁≈1、纯噪声≈0.64、正交零点≈0），
     并导出 `lockQual`；实测失锁/无信号/极弱信号都能识别（判据 38 项）。
   - **两遍牵入**：第一遍宽牵引估出残余频差，第二遍拿它当本振初值（仅在第一遍未锁时执行，省一半开销）。
   - **相位误差口径**：诊断里"历元起点真值 vs 历元终点本振"会差一个 2π·f0·Δt（自己写错两次），
     必须按**历元终点 vs 历元终点**对齐；面板 `phaseM` 的负号经外部独立推导确认**正确**。
   - **增益调度（`CONTRACT-v15.md` §16.4）**：单遍标准增益实测只 2/6 牵入；加细块后 5/6（G12 半周滑失）；
     改成 **pass1 高增益宽牵引（atan, α=0.8/β=0.08）+ 仅在未锁时做 pass2（costas, 0.4/0.02, 本振初值用中位数频差）**
     → **6/6 牵入**，lockQual 0.9956–0.9974、max|相位误差| 0.088–0.670 rad，且更快（3.9 s，不必总跑两遍）。
   最终实测（`qa/check21.js` 11 项）：**原始码 58.8 m → 载波平滑 26.1 m → 导航滤波 23.5 m**；
   `check17/16/15/14/20/19/18` 全绿；`f0·t 项 + φ 项与真实 ΔR 的偏差 ≤1 m/历元`（G21 0.009、G05 0.004、G02 0.97 m），
   而只用先验 f0 时 G21 会偏 0.49 m/历元 —— 载波环确实在起作用（φ 项占比小是正常的：它=残差频差/f0）。

12. **✅ 根因修正：相位基准必须用"残余相位"（契约 `CONTRACT-v17.md` §16.6）**——这是本轮最重要的发现：
   `pllTrack` 的 φ 跟踪的是**调用方给的相位基准下的误差**。
   - 早期面板喂的是**绝对相位** θ(t)=2πf·t ⇒ φ 每块要吸收 `2π·f·T ≈ 53 rad`（GPS L1、T=4 ms），
     积分器要爬上这个量级得几百上千块 → 这才是"牵入 5/6、Monte Carlo 真实锁定率只有 47.9%/63.3%"的**根因**；
   - 改成**残余基准** `θ(t) − 2π·f₀·t`（f₀ 来自捕获，误差 ≤50 Hz）⇒ φ 每块只需吸收 ≤1.26 rad ⇒
     几十块内牵入。**实测：6/6 全锁、相位误差 0.088–0.626 rad，且全部由 pass1（高增益 atan）直接锁定**
     （`st.pllPass2Count = 0`，不依赖 Costas 回退 ⇒ 无假锁风险）。
   - 附带：`freq[]` 的语义随基准走（残余基准下它就是残余频差；绝对基准下是混叠绝对量），
     第二遍的本振重建公式必须跟着基准走（残余：`f₀+median`；绝对：`250·round(f₀/250)+median`）——
     换基准时这两处要同步改，否则会把频差修反（本轮踩过）。
   - 精度阶梯（`qa/check21.js` 13 项）：**原始码 58.8 m → 载波平滑 25.8 m → 导航滤波 24.0 m**
     （KF 吃的是已平滑伪距，RMS 提升有限但末历元 18.6 → 5.2 m，断言已按此改为"不劣化 + 末历元更准"）。

13. **⚠️ 仍存在的结构性限制：绝对基准下的 ±125 Hz 多普勒混叠**（ds4.1 子代理 Monte Carlo 机制分析，
   契约 `CONTRACT-v16.md` §16.5；判据 `tests/test-pll.js` 已把 `freq` 语义与边界限制锁死，全套 42 项）：
   - **`pllTrack` 的 `freq[]` 是混叠后的绝对多普勒**（决定性子实验：`dop=800`（混叠 +50 Hz）时
     `f0∈{700,800,900}` 都收敛到 **+50 Hz**；若按"残余"应是 +100/0/−100）→
     **`app/80` 原先的 pass2 公式 `f0 + median(freq)` 是错的**，已改为 `250·round(f0/250) + median(freq)`。
   - **牵入难度的真正驱动是 `|wrap125(f_dop)|`，不是 f0 的 ±50 Hz 误差**：固定 `dop=2123`（混叠 +123 Hz）时
     `f0∈{2000,2100,2123,2200,2300}` **全部牵不入**。
   - **Costas 会"假锁"**：混叠逼近 ±125 Hz 时每块相位推进≈π，相位误差在 0/π 间跳而 Costas 对 180° 不敏感
     → `d≈0`、`lockQual≈1`、`locked=true`，但相位不可用。所以 `app/80` 新增 **`st.pllPass2Count`**
     （有多少颗靠 Costas 第二遍补锁），`qa/check21.js` 断言**本场景 6/6 必须全靠 pass1（atan）锁定**。
   - **Monte Carlo（1200 个卫星-组样本，ds4.1 子代理）**：真实锁定率 (a) 单遍标准增益 47.9%、
     (b) 单遍高增益 **63.3%**、(c) 高增益+按需 Costas **63.4%** —— 高增益确有实效，
     但**第二遍只增加"锁定标志"、不增加可用锁定**（多出来的 107 个样本大多稳定在 |Δφ|≈π）。
     这就是"不要为了好看的 locked 数字而加 Costas 回退"的量化依据。
   - 彻底修法（下一轮第一优先）：**加 FLL（叉积鉴频器）**（无 ±1/2T 模糊、牵引范围宽），或把细块相干积分拉长到 10 ms
     （模糊 ±50 Hz），或让环路把频率积分器折算进块内本振频率。

   （历史记录 · 早期结论）
   细块只有 4 ms，而环路只更新**相位** φ（`state.fNco` 始终等于捕获给的初值），所以环路实际跟踪的是
   **混叠后的多普勒** `wrap125(f_dop)`；实测固定 `dop=2123 Hz`（wrap125=+123 Hz，接近 ±125 Hz 的模糊边界）时
   **任何 f0（2123/2100/2200/2000/2300）都牵不进去**，而 `f0` 的 ±50 Hz 误差本身几乎不影响牵入率。
   本面板当前 6 颗星的 wrap125 都较小（0/50/0/…）所以能 6/6 锁住，但这是**场景侥幸**。
   彻底修法（下一轮候选）：① 让环路把频率积分器的输出折算进 NCO 频率（`fNcoEff = fNco0 + acc/(2πt)`）；
   ② 或把细块相干积分拉长（10 ms → 模糊 ±50 Hz）；③ 或用 FLL（叉积鉴频器）先消除模糊再进 PLL。

11. **ds4.1 子代理的独立验证**（`review/verify-ladder.js` + `review/probe-pll-epoch-rate.js`）：
   - **符号独立复推**：从接收相位 θ=−2πR/λ+const 推出必须取负号；数值佐证 ΔR=35.31 m 时实测 Δθ(mod2π)=2.7426 rad，
     与 −(2π/λ)ΔR=2.7420 相符（取正号则差 2π 符号相反）✓ 代码正确。
   - **两种符号的残差对照**（常量 ΔR=−80 m/历元、σ_码=30 m）：取对号 17.3–34.3 m；
     取反号 421–437 m 且**逐历元与 (k+1)·ΔR 吻合**（末历元 ≈ −640 m = 8ΔR）——符号由数据唯一确定。
   - **改善倍数**：生长窗口下原始码 29.92 m → 平滑 17.37 m（**1.72×**），末历元 10.57 m（**2.83×**），
     与解析式 √(H_n/n) 一致。
   - 它提出的两条问题已在本轮修掉（0.1 s 更新率、`locked` 判据）；它提出的"载波环贡献<2% → 不是载波平滑"
     经我**复测判为误读**：φ 项占比小是期望行为（=残差频差/f0），关键量是 **f0+φ 合计与 ΔR 的偏差 ≤1 m/历元**，
     说明环路确实在跟踪。

14. **电离层三情景接进冷启动链路**（`CONTRACT-v18.md` §19 + `app/80-coldstart.js`，判据 `qa/check22.js` 8 项）：
   新增「电离层处理」（不改正／模型改正／双频）与「活跃度」（×1/×5/×20）两个下拉。
   两条踩过的实现约束：① **双频噪声不能实现成降信噪比**（真实接收机逐频捕获；降 9.48 dB 会让捕获失效、
   实测 176 km 错解），正确做法是保留 L1 的捕获/跟踪、只在**码相位测量值**上注入 70 m 额外噪声使总噪声 = 2.978×；
   ② **额外噪声不能进跟踪锚点**（否则逐历元累积成随机游走，末历元误差 263–291 m），实现上把干净锚点 `chips`
   与测量值 `chipsMeas` 分开。
   实测：模型改正 ×1（延迟 5.9 m）RMS 58.8 m ／ ×20（51.3 m）73.4 m ／ 不改正 ×20 66.7 m ／
   **双频 ×1 = ×20 = 233.1 m（逐位相同 ⇒ 电离层确实被消掉）**。
   诚实结论：本面板码噪声 ~25 m、PDOP≈2.8 ⇒ 位置噪声 70–200 m，**电离层影响被淹没**，"模型 vs 双频"的排序
   在冷启动档不可靠；要看交叉点须用低噪声接收机（定位面板结论：×20/σ=0.5 m 时双频才反超）。

15. **冷启动的「信号信噪比」档 —— 量到"量化下限"，不是 SNR 上限**（`CONTRACT-v19.md` §20 + `qa/check23.js` 8 项）：
   新增 SNR 下拉（−20/−14/−8 dB），本意是压低码噪声让电离层交叉点显形。**实测反直觉**：码相位 RMS
   在 −20/−14/−8 dB 分别是 24.7/17.4/19.5 m，**提高 12 dB 也降不到 30% 以下** —— 误差被
   4 采样/chip 的量化下限压住（不可区分区间 0.25 chip ≈ 73 m ⇒ 估计误差下限 ±37 m，
   见 `tests/test-signal-conv.js`）。所以：① SNR 不是这个面板的有效杠杆；② ×20 强扰动时电离层的
   十几米位置偏差被淹没，冷启动档看不到"模型 vs 双频"的交叉点（只在低噪声链路显形）。
   面板读法已写明这条，并被 check23 固定（三档 RMS ∈15–35 m、max/min ≤1.5、双频 ≥1.4× L1）。
   **下一轮第一优先的正确修法：两阶段码搜索**（4 采样/chip 全码粗捕 → ±1 chip 窄窗 16–40 采样/chip 精修）
   —— 把量化下限从 ±37 m 降到 ±18 m / ±3.7 m，而计算量只增加"窄窗×高采样"，避免全局 4 倍采样把 TTFF 拖到 ~25 s。

16. **✅ 根因修正 + 新模块：码相位的"平台"与两级搜索**（契约 `CONTRACT-v20.md` §21、`winners/finesearch.js`、
   `tests/test-finesearch.js` 35 项、`qa/check24.js` 11 项）。本节是**上一轮 §20 的勘误**，由我与 ds4.1 子代理**各自独立复现**：
   - **机制**：信号与接收机复制码都是**按采样格硬采样**的 ±1 方波 ⇒ 落在同一采样格内的所有 codePhase 给出
     **逐样本完全相同**的码序列 ⇒ 相关值**逐位相同**（不是"近似相等"）。所以峰顶是一段宽
     **W = 1 采样格 = (c/F_CODE)/spc 米** 的**平台**，真值落在平台内的哪个位置**信息量为 0**（费舍尔信息 = 0）。
   - **老做法（argmax = 平台左边缘）**：偏差 ≈ −W/2、RMS = **W/√3**；取**平台中心**才无偏、RMS = **W/√12**（好 2 倍）。
     三点抛物插值在这个台阶上**什么也没做**：平台内 `val[i−1] < val[i] = val[i+1]` 恒成立 ⇒ 恒给出 +半个细格。
   - **提高信噪比完全无效**：平台内是同一个浮点数，噪声不改变它——实测 −20 dB 与 60 dB 的估计**逐位相同**
     （4/16/40 三档，已判据化；ds4.1 在 192 次 × 2 档下也得到逐位相同的 RMS、0 次跑错平台，余量 4.4–4.7σ）。
     这才是上一轮"提高 12 dB 也降不到 30%"的根因，不是"SNR 上限"。
   - **两处口径勘误**：① §20 的"16 采样/chip 降到 0.010 chip"是"固定 g、第一次不等就 break"的 **min 型**扫法的偶然量，
     正确的平台半宽**上确界**是 1/(2·spc) = 0.03125 chip（解析式 vs 二分暴力偏差 1.7e−14）；
     ② **"±37 m 下限"是平台半宽，不是 RMS**——4 采样/chip 的平台中心 RMS 是 73.3/√12 = **21.2 m**。
   - **新模块** `winners/finesearch.js`：`fineSearch(sig, coarseChips, opts)` 在 ±0.5 chip 窄窗内按**整数采样格**扫描
     （相关评估只有 **17 / 41 次**，全码是 1023 格 × 41 个多普勒格），返回**平台中心**；约定与 `makeSignal/acquire`
     **同向**（不是 `correlateAt` 的镜像）；输出 `plateauM`（平台宽 = c/fs）、`sigmaM`（该采样率的 1σ 下限 = W/√12）、
     `edgeHit`（粗捕不可信）；6 类非法输入返回 `{ok:false, reason}`。
   - **标定（n=96 跨格真值）**：平台中心 RMS 实测 21.94 / 9.98 / 5.24 / 2.01 m（4/8/16/40 采样/chip），
     与解析式 (1/spc)·RMS(0.5−frac) **逐位吻合**；argmax 的 RMS/W 与 RMS(frac(t·spc)) 也逐位吻合。
   - **代价（独立进程 min-of-5，`review/probe-cost.js`）**：`acquire` 4/8/16/40 采样/chip = 111/122/152/755 ms
     （1.00/1.09/1.37/**6.79**×）。**我原先猜"代价由与 fs 无关的 1023² 循环相关主导 ⇒ 提采样率几乎不花钱"只对 16 档成立**：
     40 档的 cos/sin 表各 1.3 MB、超出 L2，混合循环变成内存带宽瓶颈。细修 16/40 档只花 5.1/65 ms，
     两阶段 4+16 = 116 ms（比全局 16 便宜 24%）、4+40 = 176 ms（比全局 40 便宜 4.3 倍）⇒ 两级搜索在**精度与代价上都占优**。
   - **面板集成**：新增「接收机采样率（ADC 档）」= 4/16/40（默认 16），语义是**接收机的采样率**：
     4 采样/chip 那路只做粗捕；`signalOf` 另生成 `sigHi`，**两级精修的细扫与二阶 DLL 跟踪都跑在 ADC 档上**
     （否则跟踪仍被 4 采样/chip 的平台卡住——DLL 判别器是平台型，平台内 E=L、环路就地停在平台里）。
     实测（Chromium，6 颗 × 8 历元）：码相位 RMS **36.7 → 11.4 → 4.0 m**，逐历元原始定位 RMS **74.1 → 28.8 → 12.8 m**
     （载波平滑 46.1→10.7→9.7 m，卡尔曼 39.7→8.9→8.2 m），TTFF ≈2.4–3.1 s（三次独立运行差 ±12%；细修只占 8/60/380 ms），
     PLL 三档都 6/6 且全靠 pass1。**在采样率这一维上，精度几乎是免费的。**
   - **本轮我自己的错（三处，全部写进判据注释）**：① `fineRefine` 统一返回 **chip**，而调用点沿用了老代码的
     `toChips()`（那是"采样→chip"，再除以 4）⇒ 码相位 RMS 爆到 **89 km**、定位 195 km、PLL 0/6（本项目第 3 次踩单位坑）；
     ② "镜像约定"判据被我写成 `correlateOffsetToChips(chipsToCorrelateOffset(g)) ≡ g`——**恒等式**，等于没测；
     ③ 用 12 个真值给 40 采样/chip 定标（样本 frac −2.4σ）导致判据假失败，且用**单次计时**做判据
     （同一份代码两次跑出 1.20× 与 3.96×），已改为 n=96 + 解析值入判据 + 热身 min-of-N + 只做同档比较。
   - **ds4.1 子代理 B 轮攻击（6 条，全部已修，详见 `CONTRACT-v20.md` §7）**：
     ① ⚠️ **最严重**：粗值故意偏 3 chip 时 `edgeHit` 只在 **40/200 = 20%** 的种子上报警，其余**静默给错答案**
     （RMS 903.8 m）——我原来那条判据只用 seed=4242，"侥幸通过"。修法：新增**幅度门** `ampPerSample = amp/n`
     （码对齐 ≈1、旁瓣/噪声 ≈0.03，阈值 0.35）→ 判据改成"40 种子下 ≥90% 被抓"，实测 **40/40**，
     并保留"仅 edgeHit 只有 8/40"作为反例判据；该门还能抓"本振多普勒给错"。`tests` 从 32 项增到 **35 项**。
     ② 4 类非法输入静默通过（winChips=0/−5 被夹成 0.05、未知 estimator 静默走平台中心、tol=1e300 把平台撑成 311 m）→ 全部改成拒绝，判据 10 类。
     ③ 跨档计时不可作判据（4+40 便宜倍数在 1.8–5.3 倍间跳、`acq16/acq4` 最坏 4.52×）→ 只做同档比较。
     ④ `plateauM ≡ c/fs` 与 `sigmaM ≡ codePhaseFloorM` 原是恒等式（喂噪声也过）→ 拆成 `resolutionM`（模型量）+
     `plateauM`（观测量，step 粗时可超过模型宽）+ `sigmaM`（=resolutionM/√12）三条独立判据。
     ⑤ **"提高 SNR 无效"应写成"已饱和"**：多径（|a₂|=0.9）会打破"码序列恒等"、−35 dB 起会跑错平台。
     ⑥ 面板"码相位 RMS"其实是**末历元 DLL** 的 RMS（首历元精修 RMS 是 13.0/6.4/1.9 m）→ 明细分行标注；兜底常数 21.2→21.1。
   - **诚实边界（ds4.1 的"反驳检查"）**：这个台阶是**"理想方波 + 收发用同一个参数化器"这个模型的性质**。真实前端带宽
     把方波磨成带限波形、相关峰是光滑圆顶，插值/多相关器确实能给出远优于 1/(2spc) 的码相位（工程上 0.01–0.1 chip）。
     所以本页演示的是"采样率如何决定信息下限"，**不是真实接收机的精度上限**——这条已写进网页说明段。

17. **✅ 平台还有第二个来源：复制码量化（我自己实现的伪影）+ 带限前端与分数延迟复制码**（契约 `CONTRACT-v21.md` §22、
   `tests/test-bandlimit.js`（31 项，含"精确无表复制码"对照）、`qa/check25.js` 10 项）。本轮把上一轮那句"真实接收机靠带限+插值突破"
   **从注脚做成了可运行、可判据化的模型**，并且**被 ds4.1 子代理打回重做了一轮**（见下）：
   - **机制**：相关值在一整格内逐位相同有两个来源 —— (i) 信号侧硬采样（物理）；(ii) **复制码侧把 g 量化到整数样本**（实现伪影）。
     **2×2 交叉实验**（无噪、12 真值、M=128、改正常数后重测）：硬复制码在 4/16 采样/chip 上恒定 **38.91 / 11.31 m**
     且**与信号是否带限逐位相同**（复制码量化把信号侧信息全遮住）；理想信号 + 插值复制码 = **22.064 / 5.685 m**
     （= 下限 1.04×/1.07×）⇒ **控制实验：只换复制码不能突破**；带限信号 + 插值复制码：
     **16 spc + 4 MHz → 1.160 m（0.22× 下限，突破成立）**，但 **4 spc + 4 MHz → 21.840 m（1.03×，不突破）**。
   - **⚠️ 常数勘误（ds4.1 C 轮攻出、我复核采纳并重测）**：`bwHz` 必须是**真的 −3 dB 带宽**，
     自洽常数是 **σ = 0.13251·R_CODE/bwHz**（高斯 `exp(−t²/2σ²)` 的 −3 dB 点在 `√(ln2)/(2πσ)`）。
     我原先写 0.3748，差了 **2√2** ⇒ "4 MHz 档"实际只有 1.41 MHz，**由此得到的"4 spc 也突破"是假的**——
     改正后 4 spc 红利消失（因为 4 MHz 超过 4 spc 的奈奎斯特 2.05 MHz，跳变比采样格还窄）。
     判据里加了一条自洽性检查（解析反算 |H(f₃dB)|=1/√2），以及一条"4 spc 不突破"的反转判据。
   - **带宽要与采样率匹配**（−20 dB、插值码、6 真值×2 种子）：4 spc 最优 **2 MHz**（18.00 m，16 MHz 档反而 27.82 m）；
     8 spc 最优 2 MHz（2.74）；16 spc 最优 **4 MHz**（2.35，vs 2 MHz 2.86 / 8 MHz 4.91）
     ⇒ **最优真实 3 dB 带宽在 f_s/4 ~ f_s/2 之间，绝不能超过奈奎斯特**（我原先那句"≈f_s/2"是口径污染，已改）。
   - **M 与"精确无表复制码"**（`replicaSubSamples: 0`）：M=128（1.160）与精确（1.239）只差 7% ⇒ 无噪残差**主要是三点抛物
     估计器的固有偏差，不是查表插值**；M 加密会**低于**精确值（非收敛），已写成判据并**撤回**我原来的"M≥128 收敛到 0.025 m"。
   - **面板**：新增「前端带宽（IF 滤波）」= 理想方波 / 8 / 4 / 2 MHz（真实 −3 dB），带宽同时传给粗捕信号、ADC 档信号与
     DLL 相关器（`winners/dll.js` 改用 `GNSS.codeEnv`）。实测（ADC 16、6 颗 × 8 历元）：
     首历元精修 RMS **6.35 → 4.74 / 2.53 / 2.67 m**，链路码相位 RMS **11.4 → 6.1 / 4.8 / 4.6 m**，
     逐历元原始定位 RMS **28.8 → 22.4 / 22.1 / 21.8 m**；PLL 三档 6/6、幅度门 0 次触发。
     **不是"越宽越好"**：8 MHz 档反而最差（链路 6.1 m）——16 spc 的最优点在 ≈4 MHz（f_s/4）。
   - **诚实标注（下一轮第一优先）**：载波平滑/卡尔曼那两段**反而退步**（10.7→15.6–16.0 m、8.9→11.8–12.6 m）——
     码相位准了 2.5 倍那条链路却退步 ⇒ 瓶颈已不在码相位：**PLL 的 25 个 4 ms 细块没吃到 bwHz**，
     且 `winners/pll.js` 走 `correlateIQ`（硬采样镜像复制码）。修法已写进契约 §6 与网页说明。
   - **口径重读**：§21 的"±37 m／21 m 下限"是"理想方波 + 硬复制码"这一格的结论，**不是 GNSS 的物理下限**；
     §21 那套"平台中心"估计器的真实定位是"把被自己量化出来的平台取中心"（仍比硬复制码好 1.7–2 倍，故保留）。
   - **ds4.1 子代理 C 轮的 8 条攻击全部处理**（常数换算、2×2 数字复现、控制实验、估计器偏差、M 收敛、最优带宽口径、
     `winChips=0`、面板带宽传递漏点），逐条见 `CONTRACT-v21.md` §9；C 轮还独立复现了前端波形（三条独立路径逐样本一致
     到 Float32 粒度，Δ≤3.5e-7）。**D 轮（复核改正后的常数与新结论）已在跑。**
