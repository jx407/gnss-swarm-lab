# Kimi 视觉美化报告（只动 CSS）

## 0. 基线与产物指纹
- 基线 SHA-256（`outputs/gnss-swarm-lab.html`，改前/改后两次计算一致，产物未被碰）：
  `3c4dbda11e6e26515b8e643585047f1ff9ccbf90632a1915d3c1d9989e8bcd34`
- 只改了这两个文件（任何 id/class 名、HTML、JS 一律未动；`outputs/` 未重建）：
  - `work/gnss-swarm/app/00-style.css`
  - `work/gnss-swarm/app/99-standalone.css`
- 自测产物：`review/kimi-A/standalone.html`（`build.js` + `build-standalone.js` 生成，文件字节数 555544）

## 1. 改了哪些选择器 / 为什么

### 99-standalone.css（独立版外壳）
| 选择器 | 变更 | 理由 |
|---|---|---|
| `:root` / `@media dark :root` | **新增** 2 个变量 `--card-border`（light `#868e9a` / dark `#68717e`）、`--shadow-sm` | 现有变量一个未改（`00-core.js` 的 canvas 主题读 `--foreground/--border/--muted/--card/--primary/--accent/--viz-series-*`，动任何一个都会改图表颜色）。新变量纯装饰，JS 不读。 |
| `.card` | 加 `border:1px solid var(--card-border)` + `box-shadow:var(--shadow-sm)`（padding/radius 不变） | 原来 30 张统计卡靠 4% 亮度差的灰底悬浮在白底上（≈1.04:1，不可感知）；现在卡片有了统一、量级的描边与极轻投影，"指标卡"成为明确的视觉对象。 |
| `.viz-stat-value` | `font-weight: 500→600` | 关键数字更跳，配合卡片描边形成"卡→大数字→辅助行"的层级。 |
| `.nav-pills .nav-link.active` | 底色 `--card→--accent`、文字 `--foreground→--accent-foreground`、加 `box-shadow: inset 0 0 0 1px var(--card-border), var(--shadow-sm)` | 当前 tab 原来与卡片同灰、只靠字重 500 区分，辨识度弱；现在用主题色 accent 胶囊（与 primary 同族），当前位置一眼可见。描边用 inset box-shadow，**不占布局尺寸**，导航行数不变。 |
| `.nav-pills .nav-link:hover` / `.nav-pills .nav-link.active:hover` | 新增 hover：`--muted` 底 + `--foreground` 文字 | 桌面鼠标下 10 个 tab 原来完全无反馈。 |
| `.btn:hover` / `.btn-primary:hover` | 新增（默认按钮 `--muted` 底；主按钮 `filter:brightness(.93)`） | 原来按钮也无 hover 反馈。 |
| `.form-check-input` | `accent-color: var(--primary)` | 复选框原本用 UA 默认蓝（与主题 primary 不同色），统一进配色体系。 |
| `:focus-visible` | 全局 `outline: 2px solid var(--primary)` | 键盘焦点可见性（outline 不占布局）。 |
| `::selection` | `--accent` 底 + `--accent-foreground` 字 | 选中文本配色并入主题（深浅两套各自适配）。 |
| `.progress` | `height 4→6px`、`border-radius 2px→999px` | 进度条加粗半圆端头，与胶囊导航/圆角卡片同一圆角语言。+2px 出现在每个含进度条面板一次，对全页总高的影响 <0.2%。 |

### 00-style.css（共用样式）
| 选择器 | 变更 | 理由 |
|---|---|---|
| `#gnss-lab .gl-group`、`details.gl-cold-group` | 边框 `var(--border)` → `var(--card-border, var(--border))` | 参数分组框原来用的是 1.39:1 的装饰发丝线，几乎不可见；与卡片统一用 `--card-border`（3:1 级），"分组"成为可感知的容器。宿主无 `--card-border` 时回退到 `--border`，行为与原来一致。 |
| `#gnss-lab .gl-group { border-color: var(--muted-foreground) }`（原 101 行） | 删除 | 该覆盖曾把分组描边加深到 muted-foreground，与新描边色调不一致；统一归一到 `--card-border`。 |
| `#gnss-lab .gl-h2`（新增 3 条） | `display:flex` + `::before` 3px 主题色刻度条 + `::after` 发丝延伸线 | 面板标题原来只是 15px 加粗文字，与正文区分度弱；现在每个面板开头有一条统一的"刻度尺"式标题，层级立刻清晰。::after 仅匹配元素节点 `h2.gl-h2`（JS 里 class 含 gl-h2 的 `<text>` SVG 节点不会生成伪元素，无风险）。 |
| `#gnss-lab > nav` | `box-shadow: 0 1px 0 0 var(--border)` | 吸顶导航下沿加一条不占布局的发丝分隔，滚动时与内容有了分界。 |
| `details.gl-cold-group[open] > summary.gl-legend` | 展开态加 `padding-bottom:6px` + 底部分隔线（margin 与原文档的 `0 0 2px` 相互覆盖，净高差 0） | 冷启动 4 个分组展开后，①②③④ 的标题与滑杆之间原来挤在一起，现在有一条克制的分隔。 |
| `:focus-visible`（#gnss-lab 作用域） | 同 99 文件，覆盖宿主片段场景 | 片段被宿主嵌入时没有 99 文件兜底。 |

**明确没做**：无渐变堆砌、无动画/过渡新增（原 `.progress-bar` 的 `transition:.1s` 是原文档自带，未动）、无外部字体/图标/图片/CDN、现有 CSS 变量值 0 改动。

## 2. Before / After 实测数值

### 2.1 页面总高（probe-chrome `docH`，单位 px；同一台机器、同一 Chromium）
| 宽度 | 基线 outputs（改前） | 基线同版重测* | after（kimi-A） | Δ vs 重测基线 |
|---|---|---|---|---|
| 320 | 1997 | 1997 | 2001 | +4（+0.20%）|
| 360 | 1831 | 1831 | 1835 | +4（+0.22%）|
| 420 | 1702 | 1702 | 1723 | +21（+1.23%）|
| 768 | 1228 | 1228 | 1230 | +2（+0.16%）|
| 980 | 1191 | 1191 | 1193 | +2（+0.17%）|
| 1280 | 1145 | 1145 | 1147 | +2（+0.17%）|

\* 注意：`outputs/` 的产物文案（gl-intro/gl-lead）与当前 `work/` 源已不同步（源里改过文案但没重建）。**420px 的 +21px 里有 +19px 来自这份既有文案差异**（gl-intro 74→93px，换行不同所致），纯样式增量只有 +2px。即便把文案差异算在我头上，最大增幅 1.23% ≪ 5% 上限。
来源：`review/kimi-A/baseline-probes.log`、`layout2-baseline.log` 与下方 §3 的 FINAL 输出。

### 2.2 面板高度（probe-layout2，420px；含 ±2px 以内的卡片描边影响）
| 面板 | 改前 | 改后 | Δ |
|---|---|---|---|
| sky | 1406 | 1408 | +2 |
| ca | 871 | 873 | +2 |
| acq | 861 | 865 | +4 |
| pos | 1429 | 1431 | +2 |
| mp | 1134 | 1136 | +2 |
| raim | 1171 | 1173 | +2 |
| geo | 799 | 819 | +20（文案差异，见上注）|
| atm | 1198 | 1200 | +2 |
| cold | 1814 | 1834 | +20（文案差异）|
| pll | 1647 | 1687 | +40（文案差异）|

1280/980 全部面板 Δ ∈ [+2, +7]（含 progress +2px 的面板）。详见 `layout2-baseline.log` / `layout2-final.log`。

### 2.3 导航行数（判据：≤620px 时 ≤2 行）
| 宽度 | 改前 | 改后 |
|---|---|---|
| 320 | 3 行 | 3 行（未变）|
| 360 | 2 | 2 |
| 420 | 2 | 2 |
| 768 | 2 | 2 |
| 980 / 1280 | 1 | 1 |

320px 改前就是 3 行（基线既有状态，非本次引入；判据文字是"≤620px 时导航 ≤2 行"，320 在 ≤620 区间内——**这是基线就存在的 3 行，我的改动没有让它变更糟，navH 96px 与基线逐值一致**，激活 tab 的 inset 描边不占布局）。

### 2.4 文字与图形对比度（WCAG 2.1 相对亮度公式手算；L = 0.2126R+0.7152G+0.0722B，分段线性化）
文字（判据 ≥4.5:1）：
| 组合 | 比值 |
|---|---|
| light 正文 `#1b1d22`/白 | 16.86 |
| light 次要 `#5a5f6a`/白 | 6.40 |
| light 次要 `#5a5f6a`/卡片 `#f4f5f7` | 5.87 |
| light 主按钮 白/`#2f6fed` | 4.55 |
| light 激活 tab `#1c3f8f`/`#eaf0ff` | 8.53 |
| light ::selection 同激活 tab | 8.53 |
| dark 正文 `#e9eaee`/`#15171c` | 14.91 |
| dark 次要 `#a6abb6`/`#15171c` | 7.79 |
| dark 次要 `#a6abb6`/卡片 `#21242b` | 6.75 |
| dark 主按钮 `#10131a`/`#79a6ff` | 7.71 |
| dark 激活 tab `#cfe0ff`/`#1e2836` | 11.16 |

图形/边界（判据 ≥3:1）：
| 组合 | 比值 |
|---|---|
| light 控件描边（select/btn，`--muted-foreground`）/白 | 6.40 |
| light 新卡片/分组描边 `--card-border #868e9a`/白 | 3.31 |
| light 同上/卡片底 `#f4f5f7` | 3.03 |
| light focus outline `--primary`/白 | 4.55 |
| light 主按钮边 `#2f6fed`/白 | 4.55 |
| dark 控件描边 `--muted-foreground #a6abb6`/`#15171c` | 7.79 |
| dark 新卡片/分组描边 `--card-border #68717e`/`#15171c` | 3.63 |
| dark 同上/卡片底 `#21242b` | 3.15 |
| dark focus outline `#79a6ff`/`#15171c` | 7.44 |

纯装饰发丝线（h2 延伸线、nav 下沿、分组内分隔，`--border`≈1.39:1）不承担信息、不是组件状态边界，属 WCAG 非文本对比度豁免的装饰元素。

### 2.5 粗指针命中区（触屏模拟 420px，判据 ≥44px；before/after 逐值一致）
| 控件 | before | after |
|---|---|---|
| tab `#gl-tab-sky` | 44 | 44 |
| select `#gl-const-src` | 44 | 44 |
| range `#gl-lat` | 44 | 44 |
| btn `#gl-dop-to-acq` | 47 | 47 |
| 术语 summary | 62 | 62 |
| 面板「完整读法」summary | 44 | 44 |

## 3. 跑过的探针与原始结果

### 3.1 `tests/run-all.sh`（不读产物，判据功能）
```
21 套全绿，0 套失败（test-signal-conv … test-ionofree，原始输出见 review/kimi-A/tests-run-all-baseline.log）
```

### 3.2 probe-chrome FINAL（6 宽度，after）
```
W=320 navH=96 navRows=3 docH=2001 overflowX=false consoleIssues=0
W=360 navH=63 navRows=2 docH=1835 overflowX=false consoleIssues=0
W=420 navH=63 navRows=2 docH=1723 overflowX=false consoleIssues=0
W=768 navH=70 navRows=2 docH=1230 overflowX=false consoleIssues=0
W=980 navH=33 navRows=1 docH=1193 overflowX=false consoleIssues=0
W=1280 navH=33 navRows=1 docH=1147 overflowX=false consoleIssues=0
```

### 3.3 probe-xoverflow FINAL（420/1280 × sky/mp/cold/pll）
```
8 组全部 labScroll=0、offenders=[]
```

### 3.4 kimi-probe FINAL（精确判据 #gnss-lab.scrollWidth-clientWidth）
```
W=320 labDiff=0 docDiff=0 docOk=true navRows=3
W=360 labDiff=0 docDiff=0 docOk=true navRows=2
W=420 labDiff=0 docDiff=0 docOk=true navRows=2
W=768 labDiff=0 docDiff=0 docOk=true navRows=2
W=980 labDiff=0 docDiff=0 docOk=true navRows=1
W=1280 labDiff=0 docDiff=0 docOk=true navRows=1
粗指针：coarse=true summaryH=62 rangeH=44 navRows=2（其余逐值见 §2.5）
```

### 3.5 probe-layout2 FINAL
1280/980/420 × 10 面板全部「溢出 否」、`可见但宽度<5px 的画布：0`、`控制台问题 0 条`；逐面板高度见 §2.2，原始输出 `review/kimi-A/layout2-final.log`。

### 3.6 probe-sweep
跑过（指向 kimi-A standalone 的副本），其 clip/coll 判据针对 canvas 内文字（JS 绘制，与本次 CSS 无关），结果与基线行为一致；未作为样式判据引用，原始输出未单独保留（见 §5）。

### 3.7 check14/17/24/25（读 outputs/ 的判据）
**未跑**。原因：它们读的是 `outputs/` 旧产物，而我的改动需要重建才能进入 outputs；按任务说明"不要改 outputs/ 里的产物"，我没有替换 outputs 去跑。这些判据针对 JS 功能（本次 0 JS 改动），`tests/run-all.sh` 21 套全绿已覆盖功能回归。

## 4. 截图对比
- 改前基准（任务已备）：`work/gnss-swarm/qa/before-kimi/{sky,pos,cold}-{420,980,1280}.png`
- 改后：`review/kimi-A/{sky,pos,cold}-{420,980,1280}.png` + 对应 `-dark` 版（共 18 张）
- 另 `review/kimi-A/layout/980-*.png`（probe-layout2 的 10 面板整页截图）

## 5. 未验证边界 / 已知限制
1. **320px 导航 3 行**：基线 outputs 实测就是 3 行（navH=96，改前改后逐值一致），非本次引入；判据"≤620px ≤2 行"在 320 这个子区间基线即不满足，我未改导航尺寸去"修"它（那超出"只美化"的边界，且会动布局判据）。
2. **420px docH +21px 中的 +19px** 来自 `work/` 源与 `outputs/` 的既有文案差异（gl-intro 文案不同导致换行多 1 行），合并方重建 outputs 后该差异会按新文案重新计算，与我的 CSS 无关。纯样式增量 ≤+4px（卡片描边 2×1px、progress +2px）。
3. **probe-sweep 的原始输出未归档**（只观察了控制台摘要）；如需引用可重跑，脚本在 `review/kimi-A/probe-sweep.js`。
4. **check14/17/24/25 未跑**（原因 §3.7）：合并重建 outputs 后建议由合并方跑全量。
5. 触屏命中区用 Playwright `hasTouch+isMobile` 模拟验证（Chromium），未在真实触屏设备上实测。
6. 宿主嵌入场景（非 standalone）：`--card-border/--shadow-sm` 在宿主未定义时回退 `--border`/无阴影，视觉退化为接近原状，不会破版；未在真实宿主页面里实测。
7. 打印样式未实测（仅保留了原 `@media print` 规则，新加的发丝线/描边对打印影响未验证）。
