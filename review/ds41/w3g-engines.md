# Blink vs Gecko vs WebKit 渲染/行为一致性审计（w3g-engines）

审计对象：`D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html`（独立版，`file://` 直开）
审计时间：2026-10-07（本机，headless）
方式：**只读**。原文件与 `outputs/`、`work/gnss-swarm/**`、`review/ds41/` 既有文件均未修改；本次全部新增产物只写入 `review/ds41/w3g-engines.md` 与 `review/ds41/w3g-engines/`。

---

## ① SHA-256

| 时点 | SHA-256 |
|---|---|
| 审计开始前 | `2abb02a7d803ea38b6263da030ac87b3dda7029b42ca80bc800fdac4c7aa0c22` |
| 审计结束后 | `2abb02a7d803ea38b6263da030ac87b3dda7029b42ca80bc800fdac4c7aa0c22` |

两次一致 → 受审文件在整个审计过程中未被改动（已核对）。

---

## ② 方法

**引擎与版本（均为本机实测启动成功）**

| 引擎 | 标识 | 版本 | 运行来源 |
|---|---|---|---|
| Blink | `chromium` | 151.0.7922.34 | `%LOCALAPPDATA%\ms-playwright\chromium_headless_shell-1234\...\chrome-headless-shell.exe`（显式 executablePath） |
| Gecko | `firefox` | 153.0 | `D:/codex/2026-10-05/new-chat/.pw-browsers/firefox-1538/firefox/firefox.exe` |
| WebKit | `webkit` | 26.5 | `D:/codex/2026-10-05/new-chat/.pw-browsers/webkit-2336/Playwright.exe` |

偏离说明：按给定片段设置 `PLAYWRIGHT_BROWSERS_PATH=<workspace>/.pw-browsers` 后，Firefox/WebKit 可正常启动，但该目录下**没有** `chromium*` 目录（只有 firefox/webkit/ffmpeg/winldd），Chromium 因此改用默认缓存中的 headless shell 并显式传 `executablePath`；其余完全按给定方式（`createRequire` + `req('playwright')`）。

**视口与上下文**：420×844（`hasTouch:true`）、980×900（`hasTouch:false`），`deviceScaleFactor:1`，headless。

**脚本（均在 `review/ds41/w3g-engines/`）**

- `audit.js`：几何 / 字体 / 行为 / 冷启动数值；原始结果 `results.json`
- `audit2.js`：canvas 详细统计（alpha 直方图、透明/半透明分离）+ 触控尺寸；`results2.json`
- `audit3.js`：4 张 canvas 的**逐像素**跨引擎 diff（仅 980×900）；`canvas-raw/*.bin`、`canvas-diff.json`
- `audit4.js`：固定文本 × 固定容器宽度的受控换行测量；`text-wrap.json`
- `analyze.js` / `analysis.txt`：汇总

**冷启动口径**：切到 `#gl-tab-cold` 触发首绘即自动运行一次，轮询页面暴露的 `GLAPP.panels.cold.state`，判据 `state.running===false && (phase==='完成' || progress>=1 || items>0)`（即题目要求的 `state.running===false`，state 对象经 `GLAPP.panels.cold.state` 访问，非 `window.state`）。页面随机源是 `mulberry32(seed)` 固定种子（seed 由 `k/e/j` 派生），**不使用 `Math.random`/时间**，因此三引擎的随机输入序列相同，数值差异只能来自浮点实现或逻辑。

**几何口径**：每个标签页首次显示后约 300 ms 测量该面板高度（`getBoundingClientRect().height`，取整）；`cold` 面板该时刻正处于冷启动运行中。`#gnss-lab` 总高/滚动宽用"全部 10 页都已渲染过、回到 sky 后"的稳定状态。

---

## ③ 三引擎对照表

### 3.1 布局几何

**面板高度（px，取整；顺序 Blink / Gecko / WebKit）**

| 标签页 | 420×844 | 最大差 | 980×900 | 最大差 |
|---|---|---|---|---|
| sky 星座几何 | 1528 / 1528 / 1540 | 12 | 949 / 946 / 967 | 21 |
| ca C/A 码 | 911 / 912 / 918 | 7 | 601 / 600 / 610 | 10 |
| acq 捕获搜索 | 947 / 947 / 947 | 0 | 696 / 697 / 696 | 1 |
| pos 定位解算 | 1509 / 1509 / 1504 | 5 | 867 / 866 / 876 | 10 |
| mp 多径与遮挡 | 1236 / 1235 / 1235 | 1 | 649 / 648 / 658 | 10 |
| raim RAIM 检核 | 1214 / 1214 / 1214 | 0 | 750 / 751 / 754 | 4 |
| geo 全球几何 | 825 / 826 / 825 | 1 | 716 / 717 / 716 | 1 |
| atm 误差预算 | 1269 / 1269 / 1249 | 20 | 659 / 663 / 662 | 4 |
| cold 冷启动 | 1985 / 1986 / 1991 | 6 | 1631 / 1631 / 1654 | 23 |
| pll 载波跟踪 | 1785 / 1786 / 1756 | 30 | 1175 / 1177 / 1175 | 2 |
| **`#gnss-lab` 总高** | **1864 / 1866 / 1858** | **8** | **1151 / 1150 / 1169** | **19** |

**导航与横向溢出**

| 指标 | 420×844 | 980×900 |
|---|---|---|
| 导航高度 | 101 / 101 / 101 | 43 / 43 / 43 |
| 导航行数 | 2 / 2 / 2 | 1 / 1 / 1 |
| nav-link 高度 | 44 / 44 / 44 | 33 / 33 / 33 |
| `#gnss-lab.scrollWidth − clientWidth` | 0 / 0 / 0 | 0 / 0 / 0 |
| `documentElement.scrollWidth − clientWidth` | 0 / 0 / 0 | 0 / 0 / 0 |

→ 导航换行行为与横向溢出**完全一致**；面板高度存在字体/行高/图表尺寸累积的小差异。

### 3.2 字体与排版

**受控测量（同一元素 `#gl-cold-phase`、同一容器宽度、同一文本，`audit4.js`）**

| 视口 | 文本 | 行数 B/G/W | 盒高 B/G/W | 文本实测宽 B/G/W (px) |
|---|---|---|---|---|
| 420 | 初始提示（42 字） | 2 / 2 / 2 | 36 / 36 / 36 | 471.7 / 471.6 / 469.5 |
| 420 | 完成态（46 字） | 1 / 1 / 1 | 18 / 18 / 18 | 367.6 / 367.5 / 355.4 |
| 420 | 运行中（29 字） | 1 / 1 / 1 | 18 / 18 / 18 | 283.6 / 283.6 / 279.1 |
| 980 | 上述 3 段 | 1 / 1 / 1 | 18 / 18 / 18 | 同上（容器 940 不换行） |

**真实页面元素**

| 元素 | 视口 | 宽 B/G/W | 高 B/G/W | 行数 B/G/W |
|---|---|---|---|---|
| `#gl-panel-sky > p.gl-lead` | 420 | 380 / 380 / 380 | 54 / 54 / 54 | 3 / 3 / 3 |
| 同上 | 980 | 548.9 / 548.6 / **504.6** | 36 / 36 / 36 | 2 / 2 / 2 |
| `#gl-panel-cold > p.gl-lead` | 420 | 380 / 380 / 380 | 36 / 36 / 36 | 2 / 2 / 2 |

- 字体族三引擎解析到同一族（`ui-sans-serif, system-ui, … "Microsoft YaHei"`, CSS 序列化格式略有不同），`document.fonts.size===0`（无 @font-face，全部走系统字体）。
- 单行文本实测宽 WebKit 比 Blink/Gecko 窄 **1.2%**（751.6 vs 760.5）～**3.3%**（355.4 vs 367.6）；行高 WebKit 为 16px、Blink/Gecko 为 15px。
- `.gl-lead` 宽度差异来自 `max-width:78ch`（`ch` 依赖字体 "0" 宽）——**推断**（未直接测量 `ch` 值），实测 548.9/78=7.04px vs 504.6/78=6.47px。

### 3.3 Canvas 渲染（980×900；尺寸与统计）

| canvas | 指标 | Blink | Gecko | WebKit | 三引擎最大差 |
|---|---|---|---|---|---|
| `gl-sky-canvas` 460×300 | 非透明像素 | 8678 (6.29%) | 8114 (5.88%) | 7970 (5.78%) | 708（8.9%） |
| | 不同颜色数 | 855 | 803 | 824 | 52（6.5%） |
| | 非空 bbox (w×h) | 286×285 | 285×285 | 285×285 | 1px |
| `gl-dop-canvas` 460×300 | 非透明像素 | 11844 (8.58%) | 11534 (8.36%) | 11527 (8.35%) | 317（2.7%） |
| | 不同颜色数 | 674 | 688 | 638 | 50（7.8%） |
| | 非空 bbox | 441×286 | 440×286 | 438×286 | 3px |
| `gl-cold-epoch-canvas` 940×234 | 非透明像素 | 18247 (8.30%) | 17639 (8.02%) | 17584 (7.99%) | 663（3.8%） |
| | 不同颜色数 | 811 | 780 | 763 | 48（6.3%） |
| | 非空 bbox | 894×204 | 894×204 | 893×204 | 1px |
| `gl-dll-canvas` 940×230 | 非透明像素 | 2936 (1.36%) | 2791 (1.29%) | 2800 (1.30%) | 145（5.2%） |
| | 不同颜色数 | 13 | 8 | 6 | 7 |
| | 非空 bbox | 881×185 | 881×185 | 881×185 | 0px |

画布 backing store 尺寸三引擎**逐字节一致**（460×300 / 940×234 / 940×230），与 CSS 尺寸一致。

**逐像素 diff（`audit3.js`，任意通道差>0 的像素占比 / 每通道 MAE / 通道差>16 占比 / 显著差占比*）**

| canvas | B vs G | B vs W | G vs W |
|---|---|---|---|
| sky | 5.54% / 1.27 / 1.38% / 0.61% | 5.93% / 1.71 / 2.23% / 1.61% | 6.06% / 1.86 / 2.03% / 1.54% |
| dop | 4.53% / 0.32 / 0.30% / 0.07% | 4.86% / 0.98 / 1.04% / 0.67% | 5.36% / 0.96 / 1.00% / 0.76% |
| cold-epoch | 5.78% / 0.49 / 0.55% / 0.29% | 4.95% / 1.40 / 1.79% / 1.40% | 6.88% / 1.40 / 1.74% / 1.51% |
| dll | 0.46% / 0.25 / 0.26% / 0.21% | 0.52% / 0.36 / 0.37% / 0.33% | 0.46% / 0.32 / 0.32% / 0.32% |

\* 显著差 = 该像素至少一侧 alpha≥32 且 RGB 通道最大差>16（即"肉眼可见内容不同"，排除近乎全透明的边缘像素）。

### 3.4 行为一致性

**`details`（`gl-cold-group` ①②③）折叠/展开**

| 视口 | 初始 | 点第 1 次 | 点第 2 次 | 三引擎是否一致 |
|---|---|---|---|---|
| 420（粗指针） | `[false,false,false]`（默认收起） | `[true,true,true]` | `[false,false,false]` | 一致 |
| 980 | `[true,true,true]`（默认展开） | `[false,false,false]` | `[true,true,true]` | 一致 |

**`scrollIntoView({block:'start'})` 遮挡（top 值；occlusion = navBottom − top，负值即未遮挡）**

| 视口 | 目标 | Blink top | Gecko top | WebKit top | 吸顶导航 bottom | 最小间隙 |
|---|---|---|---|---|---|---|
| 420 | `#gl-cold-run` | 104.4 | 103.9 | 104.4 | 101 | **+2.9 px（无遮挡，余量最小）** |
| 420 | `#gl-cold-epoch-canvas` | 103.9 | 104.4 | 103.9 | 101 | +2.9 px |
| 980 | `#gl-cold-run` | 87.8 | 88.3 | 87.8 | 43 | +44.8 px |
| 980 | `#gl-cold-epoch-canvas` | 87.8 | 88.3 | 87.8 | 43 | +44.8 px |

`scroll-margin-top` 实际生效值为 104px（粗指针）/88px（细指针），三引擎一致；三个目标均**未被吸顶导航遮挡**。

**`matchMedia` 与触控规则**

| 视口 | 查询 | Blink | Gecko | WebKit |
|---|---|---|---|---|
| 420 (hasTouch) | `(pointer: coarse)` | true | true | true |
| 420 | `(pointer: fine)` / `(any-pointer: coarse)` | false / true | false / true | false / true |
| 980 | `(pointer: coarse)` | false | false | false |
| 980 | `(any-pointer: coarse)` | false | **true** | false |
| 420 | `maxTouchPoints` | 1 | 0 | 0 |

**44px 触控规则（420 视口实测高度 px）**

| 元素 | Blink | Gecko | WebKit | 规则值 |
|---|---|---|---|---|
| nav-link | 44 | 44 | 44 | `min-height:44px` ✓ |
| `.btn`（冷启动执行） | 47 | 47 | 47 | `min-height:44px` ✓ |
| `.form-range` | 44 | 44 | 44 | `height:44px` ✓ |
| `.form-select` | 44 | 44 | **51** | `min-height:44px` ✓（≥44） |
| `summary` | 44 | 44 | 44 | padding 13px ✓ |
| checkbox | 18×18 | 18×18 | 18×18 | ✓ |

980 视口下这些规则不生效（nav-link 33、btn 35、range 16–20、select 28–39、summary 18），三引擎一致（select/checkbox 有 1–11px 的引擎固有高度差）。

### 3.5 冷启动数值（默认参数 n=6, epochs=8, dll, −20 dB, 理想前端）

| 引擎 | err (m) | chipsRms | hatchRms | kfRms | pllLocked | rawRms | 检出 |
|---|---|---|---|---|---|---|---|
| Blink | 19.653481214079026 | 11.430302054379103 | 10.718093657481894 | 8.925264495810556 | 6 / 6 | 28.768202677849157 | 6/6 |
| Gecko | 19.653480072375960 | 11.430301432427806 | 10.718094336465136 | 8.925264475681296 | 6 / 6 | 28.768203249469504 | 6/6 |
| WebKit | 19.653480072375960 | 11.430301432827140 | 10.718094336465136 | 8.925264475681296 | 6 / 6 | 28.768203249469504 | 6/6 |

**相对误差（以 Blink 为基准）**

| 量 | Gecko | WebKit |
|---|---|---|
| err | 5.81e-8 | 5.81e-8 |
| chipsRms | 5.44e-8 | 5.44e-8 |
| hatchRms | **6.33e-8（本次最大）** | **6.33e-8** |
| kfRms | 2.26e-9 | 2.26e-9 |
| rawRms | 1.99e-8 | 1.99e-8 |
| pllLocked | 完全相同（6） | 完全相同（6） |

- Gecko 与 WebKit 在本组参数下**逐位一致**（`chipsRms` 仅差约 4e-13 相对量级），Blink 略不同。
- 同一引擎在 420 与 980 两个视口下数值**逐位相同** → 与布局/渲染无关。
- 判断：**浮点实现差异**（推断）。依据：① 相对误差量级 1e-8~6e-8，远小于任何逻辑分支阈值；② `pllLocked`、检出数 `items`、`phase`、`n/epochs` 完全相同，无逻辑分叉；③ 与视口无关；④ 页面数学链含 `Math.hypot/sin/cos/exp/sqrt`，V8 与非 V8 数学库实现不同，误差经多历元迭代放大到 1e-8 量级符合预期。
- 页面显示的 TTFF/单次跟踪耗时三引擎不同（如 TTFF：Blink 1661 ms、Gecko 1217 ms、WebKit 1079/1844 ms），那是 `performance.now()` 实测计算耗时，属性能差异而非数值/逻辑差异；同一引擎两次运行也不同。

### 3.6 运行期错误与请求

| 组合 | console error | console warning | pageerror | requestfailed | console 全部消息 |
|---|---|---|---|---|---|
| Blink 420 / 980 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 |
| Gecko 420 / 980 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 |
| WebKit 420 / 980 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 |

（页面无外链资源，`file://` 直开，全程 0 网络请求失败。）

---

## ④ 差异清单

### A. 抗锯齿/光栅化级差异（不构成缺陷）

1. 4 张 canvas 的逐像素差异：平均每通道 MAE ≤ **1.86/255**，显著差异像素 ≤ **1.61%**，画布尺寸与内容 bbox 一致（±3px 内，其中 2 张完全一致）。
2. 颜色数差异（sky 855/803/824、dop 674/688/638）：来自边缘混合色取值不同。
3. 非透明像素数差（sky 最大 8.9%）集中在极低 alpha 像素跨越 `alpha>0` 阈值处；以"显著差异"口径衡量只有 0.6%~1.6%，且 `gl-dll-canvas`（线条少、边缘少）差异仅 0.46% → **差异随边缘密度增大**，是抗锯齿特征而非数据结构差异。
4. canvas 尺寸/布局完全一致，说明不是缩放或 DPR 引起的差异。

### B. 真差异（引擎实现不同，可解释，未影响功能）

5. **字体度量**：WebKit 单行文本实测宽比 Blink/Gecko 窄 1.2%~3.3%，行高 16px vs 15px。受控同文本测试下**换行行数三引擎一致**。
6. **`max-width:78ch` 的宽度差**：980 视口 `p.gl-lead` 元素宽 WebKit 504.6px vs Blink 548.9 / Gecko 548.6（差 44.3px），行数仍为 2（推断：`ch` 单位随字体 "0" 宽变化）。
7. **面板高度**：420 视口最大 30px（pll 1785/1786/1756）、980 视口最大 23px（cold 1631/1631/1654）；`#gnss-lab` 总高最大差 8px（420）/19px（980）。属字体行高 + canvas CSS 高度的累积。
8. **`(any-pointer: coarse)`**：980（hasTouch:false）下 Gecko 仍为 true（宿主设备带触摸屏），Blink/WebKit 为 false。本页 CSS 只用 `pointer: coarse`，无功能影响。
9. **粗指针下 select 高度**：WebKit 51px vs Blink/Gecko 44px（仍 ≥44px 基线）。
10. **计算耗时**：同一份 JS 的 TTFF/单次跟踪耗时三引擎不同（Gecko 明显快于 WebKit/Blink），是 JS 引擎性能差异，与数值结果无关。
11. **导航与横向溢出无差异**：2 行/101px（420）、1 行/43px（980），`scrollWidth−clientWidth` 恒为 0。

### C. 伪差异（测量口径造成，已用受控实验排除）

12. 首次未受控测量中 `#gl-cold-phase` 出现"WebKit 1 行 vs Blink/Gecko 2 行"；`audit4.js` 用**同一文本、同一容器宽度**复测后三引擎行数完全一致 → 原差异来自测量时刻文本状态不同（初始提示 42 字 2 行 vs 完成态 46 字 1 行），**不是引擎差异**。

### D. 可读性影响

13. **未发现影响可读性的差异**：10 个标签页在 420/980 下均可完整访问，`p.gl-lead` 换行行数三引擎一致，无横向溢出，文字未截断。
14. 唯一临界点（低风险）：420 宽、`hasTouch` 时 `#gl-cold-run` 经 `scrollIntoView({block:'start'})` 定位后与吸顶导航仅余 **2.9~3.4px** 间隙，当前未被遮挡；若导航在更窄宽度换成 3 行（高度 101px → 约 145px）而 `scroll-margin-top` 保持 104px，则会被遮挡（**推断，未验证**）。

---

## ⑤ 未验证边界

1. 全部为 **headless** 结果；未在真实设备、真实 GPU 加速路径下验证（headless shell 走软件光栅）。
2. 未测 `devicePixelRatio>1`、浏览器缩放、HiDPI。
3. 未测非默认字体环境；三引擎均无 @font-face（`document.fonts.size===0`），但未确认具体命中的系统字体文件。
4. 仅在 420 与 980 两个宽度测；未测 620px 断点附近及 768px 等中间宽度。
5. 未测深色主题、`prefers-reduced-motion`、键盘/读屏交互。
6. canvas 逐像素 diff 只在 980×900 下做；420 视口只有统计量（非透明/颜色/bbox），未做逐像素。
7. 冷启动数值仅覆盖默认参数组合（n=6、epochs=8、dll、−20 dB、理想前端、iono=model）；其他参数档未验证。
8. TTFF 等耗时未做多次重复取均值，受机器负载影响；仅代表单次观测。
9. 未验证 Playwright 打包版之外的浏览器（系统 Firefox/Safari/Chrome）。
10. `pllLocked` 只验证了"完全相同"的默认档，未构造会触发边界分支的参数。
11. 未修改页面代码或用注入脚本改变随机源（页面本身使用固定种子 PRNG，无需注入）。

---

## ⑥ 证据文件（均在 `review/ds41/w3g-engines/`）

`audit.js`, `audit2.js`, `audit3.js`, `audit4.js`, `analyze.js`, `results.json`, `results2.json`, `canvas-diff.json`, `canvas-meta.json`, `text-wrap.json`, `analysis.txt`, `canvas-raw/*.bin`（12 个原始 RGBA 帧）。
