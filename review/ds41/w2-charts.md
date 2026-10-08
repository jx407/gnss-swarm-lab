# ds4.1 W2：GNSS 蜂群工作台图表可读性复核

审计范围：**只读**。未修改 `outputs/`、`work/gnss-swarm/app/`、`shell.html`、`lib/`、`winners/`、`tests/`、`qa/`、`CONTRACT*`。新增内容仅在 `review/ds41/`。

## 0. 本轮对应版本与运行证据

- 最终成品：`D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html`
- 最终 SHA-256：`173353eea691c637b1baa6acf7a7ad54319ecd0cd42953528c6e92e3cbf4717c`
- 最终 MD5：`bb6486f75fc9bc449d8964947f24e9ab`
- 最终 mtime：`2026-10-07 00:31:17 +0800`
- 注意：审计期间成品曾从 `046894df...` 重建/变更为 `173353ee...`。本报告最后一段所有截图和指标均为变更后重新采集的同源快照；若之后又重建，需要重跑。
- 探针：`review/ds41/w2-charts.js`
- 完整真实 stdout：`review/ds41/w2-charts/stdout.txt`
- 机器结果：`review/ds41/w2-charts/metrics.json`
- 截图：52 张 26 canvas × 420/980 裁剪图；另有 2 张末端标注重叠放大图。

方法：把成品 HTML 复制到审计目录，在 `app/*.js` 执行前注入只读 Canvas 2D 探针，记录每个 `clearRect` 帧内的 `fillText` 包围盒、`stroke` 线段和 `strokeRect` 框；用 420/980 两个 light 主题视口、`deviceScaleFactor=2` 截图并比较。文字包围盒用浏览器 `measureText()` 的真实 ascent/descent，不用 OCR。运行时 console error / page error 均为 0。

## 1. 五处逐条结论

| # | 结论 | 关键证据 | 代码逻辑 |
|---|---|---|---|
| ① 420 冷启动「误差 vs 历元」末端标注 | **部分修** | 420 下主标注不再互相重叠；但底部图例仍越出画布：`css=380x244`，`clip=1`，图例 bbox `l=42.0, r=437.3`；见 `420-01-cold-epoch.png`。980 下还出现 `载波平滑 6 m` 与 `卡尔曼 4 m` 包围盒相交（`area=204.1`），见 `980-01-cold-epoch-endlabel-zoom.png`。 | 420 的 `np2` 分支确实抑制了 chip/hatch/KF 三条末端小标注，画布从 210 加到 244；但底部总图例仍是单行长文本，没有换行/移出画布。见成品 `outputs/gnss-swarm-lab.html:9757-9760,9802-9824`；工作源码 `app/81-coldstart-draw.js:81-83,125-147`。 |
| ② 420「每颗星捕获耗时」行高/绘图区 | **已修** | `gl-cold-canvas` 在 420 为 `css=380x340`、`clip=0`、`textColl=0`；单行说明和五档 x 轴刻度均在画布内。见 `420-02-cold-persat.png`。 | 窄屏使用 `n*46+64` 高、`x=46`、`w-58`；说明只在条形下方画一行。见成品 `outputs/gnss-swarm-lab.html:9687-9689,9709-9714`；工作源码 `app/81-coldstart-draw.js:10-12,32-37`。 |
| ③ 420 捕获剖面 1023 与「码相位 (chip)」 | **部分修（标题仍被裁）** | 420/980 两个宽度都没有 1023 与标题的可见重叠；但标题实际在画布外：`gl-acq-profile css=380x140/940x140`，标题 bbox `top=136.9, bottom=147.9`，垂直方向越出 7.9 px；截图中标题只露出/完全看不到。见 `420-03-acq-profile.png`、`980-03-acq-profile.png`。 | `1023` 和 `0` 仍在 `box.y+box.h+13`；标题被放到 `box.y+box.h+29`，但 profile 画布高度仍由 `APP.panels.acq.draw` 固定为 140。见成品 `outputs/gnss-swarm-lab.html:7912-7914,7920`；工作源码 `app/31-acq-draw.js:119,127`。 |
| ④ acq/atm/ca 右端刻度裁切 | **已修（针对刻度）** | `gl-acq-canvas`、`gl-atm-canvas`、`gl-auto-canvas`、`gl-cross-canvas` 在 420/980 均 `clip=0`；1023、90、64 等右端刻度完整。见 `420-04-*`、`980-04-*`。 | `C.labelTick` 在 `x<=x0+3` 时 left 对齐、`x>=x1-3` 时 right 对齐。见成品 `outputs/gnss-swarm-lab.html:6995-6999`；工作源码 `app/00-core.js:71-76`。注意：`gl-atm-err-canvas` 在 420 仍有一个动态「当前 70% → 1.01 m」标注轻微越界（不是刻度）。 |
| ⑤ 多径侧视图文字压射线 | **已修** | 420/980 的 `gl-mp-canvas` 均 `textColl=0`；`直达…`、`反射点…` 已移到绘图框下方，未命中任何射线/反射线段。见 `420-05-mp-side.png`、`980-05-mp-side.png`。 | 线条仍在绘图区内，两个说明改到 `box.y+box.h+17/+31`。见成品 `outputs/gnss-swarm-lab.html:8460-8465`；工作源码 `app/51-mp-draw.js:62-67`。`接收机` 的线段命中是检测器 1 px 膨胀造成的边界假阳性；几何检查显示射线在文本 bbox 外约 0.7 px。 |

### 1.1 真实 stdout（最终运行摘录）

```text
PAGE D:\codex\2026-10-05\new-chat\outputs\gnss-swarm-lab.html hash=173353eea691 bytes=525735
WIDTH 420 loadMs=35754 consoleErrors=0 pageErrors=0
CANVAS 420 gl-acq-profile text=5 clip=1 textColl=0 segHits=0 css=380x140
  CLIP 码相位 (chip) {"l":54,"t":136.890625,"r":119.84423828125,"b":147.890625} canvas {"w":380,"h":140}
CANVAS 420 gl-cold-canvas text=18 clip=0 textColl=0 segHits=18 css=380x340
CANVAS 420 gl-cold-epoch-canvas text=16 clip=1 textColl=0 segHits=3 css=380x244
  CLIP — 定位误差（跟踪态逐历元） · ⋯ 载波平滑 · — 码相位 RMS · ⋯ 8 维卡尔曼滤波 {"l":42,"t":204.890625,"r":437.333984375,"b":216.890625} canvas {"w":380,"h":244}
CANVAS 420 gl-atm-err-canvas text=15 clip=1 textColl=0 segHits=2 css=380x300
  CLIP 当前 70% → 1.01 m {"l":279.8,"t":202.33,"r":380.814,"b":212.33} canvas {"w":380,"h":300}
CANVAS 420 gl-geo-canvas text=42 clip=0 textColl=1 segHits=0 css=380x432
  TCOLL 472.5 24 h 中位 PDOP（细须＝95 分位）@106.0,18.0 <> 当前 2.93@177.1,18.0
CANVAS 420 gl-raim-pl text=5 clip=1 textColl=1 segHits=2 css=380x116
  CLIP VPL 77.5 {"l":343.47,"t":81.89,"r":388.53,"b":89.89} canvas {"w":380,"h":116}
  TCOLL 50.5 HPL 33.6@260.3,73.0 <> 告警限 40@301.6,73.0
CANVAS 420 gl-raim-resid text=18 clip=0 textColl=1 segHits=1 css=380x300
  TCOLL 78.6 阈值 5.0@366.0,115.0 <> 5.5@348.3,111.1
CANVAS 420 gl-pos-iono-canvas text=8 clip=1 textColl=0 segHits=1 css=380x180
  CLIP 纵轴 0 → 100.0 m · 活跃度 ×1 · L1 最大斜距延迟 25.8 m · 组合噪声放大 2.98× {"l":60,"t":139.63,"r":413.77,"b":150.63} canvas {"w":380,"h":180}
WIDTH 980 loadMs=35498 consoleErrors=0 pageErrors=0
CANVAS 980 gl-acq-profile text=5 clip=1 textColl=0 segHits=0 css=940x140
  CLIP 码相位 (chip) {"l":54,"t":136.890625,"r":119.84423828125,"b":147.890625} canvas {"w":940,"h":140}
CANVAS 980 gl-cold-epoch-canvas text=19 clip=0 textColl=1 segHits=7 css=940x210
  TCOLL 204.1 载波平滑 6 m@918.0,175.4 <> 卡尔曼 4 m@918.0,181.7
CANVAS 980 gl-raim-pl text=5 clip=1 textColl=0 segHits=0 css=940x116
  CLIP VPL 77.5 {"l":903.47,"t":81.89,"r":948.53,"b":89.89} canvas {"w":940,"h":116}
CANVAS 980 gl-raim-resid text=18 clip=0 textColl=1 segHits=1 css=460x300
  TCOLL 78.6 阈值 5.0@446.0,115.0 <> 5.5@423.9,111.1
CANVAS 980 gl-sky-canvas text=31 clip=0 textColl=4 segHits=40 css=460x300
  TCOLL 50.2 G16@331.1,168.8 <> G03@335.9,173.7
  TCOLL 53.4 G22@291.9,244.4 <> G04@298.8,240.2
```

完整 161 行 stdout 原样保存在 `review/ds41/w2-charts/stdout.txt`，未人工删改。

## 2. 文字越界/碰撞检查说明

能做到：

- 记录每个 `fillText` 的真实字体、对齐、`measureText()` width/ascent/descent，再据此算包围盒。
- 判断文字包围盒是否越过 canvas 位图边界；这等价于 Canvas 自身裁剪后的“可见文字不完整”的可靠上界。
- 比较同帧文字包围盒两两相交面积。
- 记录 `stroke` 线段和 `strokeRect`，检查文字 bbox 与线段相交。

局限：

- 这是包围盒模型，不是字形像素连通域模型；字体 side bearing、下伸部和非矩形 glyph 可能让“bbox 相交”成为假阳性。
- `gl-auto-canvas`/`gl-cross-canvas` 的 `0` 是同一位置重复绘制同一个字符，报告中的该条 text collision 是假阳性。
- 线段网格/坐标轴穿过文本框会出现 `segHits`，未必是真正的“文字压线”；本轮只把 ⑤ 的射线作为缺陷判据。
- 没有做 OCR/逐字形像素分割，因此没有把“字形像素层”判断说成已验证。

## 3. 其余 26 个 canvas 扫描结果

26 个 canvas 全部在 420/980 各自采集了指标。除下表明确问题外，其余 canvas 本轮状态为 `clip=0` 且没有真实文字互相重叠；`gl-auto-canvas`/`gl-cross-canvas` 的重复 `0` 已按假阳性剔除。

| canvas | 420 | 980 | 判断 |
|---|---|---|---|
| `gl-acq-profile` | 标题越界 | 标题越界 | ③ 的残留问题；不是 1023 重叠，而是轴标题被裁 |
| `gl-cold-epoch-canvas` | 底部图例右越界 57.3 px | 两末端标注相交 204 px² | ① 只修了 420 主标注，980 仍有末端标注碰撞 |
| `gl-atm-err-canvas` | 动态当前值标注右越界 0.8 px | 无 | 新发现；刻度 `100` 本身已修 |
| `gl-pos-iono-canvas` | 底部说明右越界 33.8 px | 无 | 新发现；420 下说明截断 |
| `gl-raim-pl` | VPL 标签右越界 8.5 px；HPL/告警限相交 | VPL 标签右越界 8.5 px | 新发现；VPL 的 `.5` 在 420/980 都被裁 |
| `gl-geo-canvas` | `当前 2.93` 与标题相交 472.5 px² | 无 | 新发现；420 标题/当前值挤在同一行 |
| `gl-raim-resid` | `阈值 5.0` 与 `5.5` 相交 78.6 px² | 同左 | 新发现；粗差值贴着阈值文字 |
| `gl-sky-canvas` | G16/G03、G22/G04、G13/G10、G08/G11 四对相交 | 同左（相同坐标） | 新发现；卫星 PRN 标签在 460 px 横向画布内拥挤 |
| `gl-mp-curve` | `偏差 (m)` 左越界 0.9 px；与顶部 `10.0` 相交 | 同左 | 轻微边界裁切/贴字；非 ⑤ 的射线问题 |
| 其他 17 个 | 清洁或仅线段-网格命中 | 清洁或仅线段-网格命中 | 未发现明确的可见裁切或文字对相交 |

线段命中中，`gl-atm-canvas`「圆点＝当前参与解算的卫星」、`gl-dll-canvas`「4 采样/chip…」、`gl-hatch-canvas` 图例等会与网格线/图线相交，属于正常图内注释与线元素接触；本轮未把它们列为缺陷。

## 4. 单位与量纲清单

### 4.1 已明确带单位或有明确量纲说明

| canvas / 轴 | 单位 | 结论 |
|---|---|---|
| `gl-sky-canvas` | 仰角环 `°`，N/E/S/W 方位 | 明确 |
| `gl-dop-canvas` | DOP 无量纲；`t (h)` | 明确 |
| `gl-doppler-canvas` | `(Hz)`、`t (h)`、当前值 `Hz` | 明确 |
| `gl-chip-canvas` | `chip` | 明确 |
| `gl-acq-canvas` | 码相位 `(chip)`、多普勒 `(Hz)` | 明确 |
| `gl-acq-profile` | 横轴 `chip`、纵轴 `|R|` 无量纲 | 单位明确，标题可见性有问题 |
| `gl-pos-resid` | `伪距残差 (m)`、RMS/最大值 `m` | 明确 |
| `gl-pos-iono-canvas` | RMS 条值 `m`，底部说明含 `m` | 420 说明被裁 |
| `gl-mp-canvas` | 墙高/路径差 `m`、角度 `°`、格距 `m` | 明确 |
| `gl-mp-curve` | `墙距 (m)`、`偏差 (m)` | 明确 |
| `gl-raim-resid` | `nmr` 归一化残差，无量纲 | 明确 |
| `gl-atm-canvas` | `延迟 (m)`、`仰角 (°)` | 明确 |
| `gl-atm-err-canvas` | `水平误差 (m)`、`改正比例 (%)` | 明确；动态标注 420 略裁 |
| `gl-cold-canvas` | `ms`、`σ`、码误差 `m`、多普勒 `Hz` | 明确 |
| `gl-cold-ttff` | `累计耗时 (ms)` | 明确 |
| `gl-cold-epoch-canvas` | 误差 `m`，横轴 `N/历元` | 明确 |
| `gl-dll-canvas` | 图例/刻度 `m`，横轴 `历元 N` | 数值单位有，轴标题未写 `(m)` |
| `gl-pll-iq` | `+I/+Q` 归一化幅度 | 明确为无量纲 |
| `gl-pll-phase` | `单位 rad`，横轴 `历元` | 明确 |
| `gl-hatch-canvas` | `误差 (m)`、横轴 `历元` | 明确 |

### 4.2 缺失/偏弱单位清单

1. `gl-auto-canvas`、`gl-cross-canvas`：`R(lag)` 和 x 轴 `-64/0/64` 没有写 `chip`；这里的 lag 实际按 chip 计。
2. `gl-pos-scatter`、`gl-raim-scatter`：东/北轴标题有 `(m)`，但轴上的 `±50.0`、`±100.0` 本身没有 `m`。
3. `gl-mp-curve`、`gl-dll-canvas`：轴标题未在标题内显式写 `(m)`（细节刻度或图例有 `m`），建议统一为 `偏差 (m)` / `码相位误差 (m)` 这类口径。
4. `gl-raim-pl`：标题有 `(m)`，但三条线标签 `HPL 33.6`、`告警限 40`、`VPL 77.5` 省略了 `m`；视觉上又发生 VPL 裁切。
5. `gl-cold-epoch-canvas`：末端 `码相位 RMS` 的数值由代码按米计算并显示为 `m`，但标签文字本身没有写 `(m)`；这只属于单位语义偏弱，不属于数值错误。
6. `gl-atm-canvas`：系列图例是“对流层/电离层/合计”，统称由标题 `延迟 (m)` 给出；若以后拆成多条独立图例，建议每条再加单位。

无量纲不应被误列为缺失：DOP、`|R|`、`nmr`、`σ`、`+I/+Q`、改正比例 `%` 都有含义说明或百分比符号。

## 5. 剩下的 5 条优先问题

1. **P1｜捕获剖面轴标题被裁（③ 未完全修）**：`gl-acq-profile` 在 420/980 均为 `clip=1`，标题 bbox 底部 147.9 > canvas 140。建议把 canvas 高度的 140 增加约 12–16 px，或把标题改到 plot 内/用外部 DOM 说明。
2. **P1｜冷启动误差图图例/末端标注仍拥挤（① 部分修）**：420 底部总图例右越界；980 `载波平滑 6 m` 与 `卡尔曼 4 m` 相交。建议 420 外置分两行，980 按 y 位置做冲突避让或只保留一个主标注。
3. **P1｜RAIM 保护限条 VPL 标签被裁且 420 标签相交**：420/980 的 `VPL 77.5` bbox 都越过右边界；420 还有 `HPL 33.6` 与 `告警限 40` 相交。建议对最右标签改为右对齐/left 移到边界内，并在窄屏错行。
4. **P1｜全球几何 420 标题与“当前 2.93”重叠**：`当前 2.93` 与标题相交 472.5 px²。建议把当前值标签移到图内右侧或下一行，不能继续以 `hx+6` 固定放。
5. **P2｜RAIM 残差阈值与粗差值相撞**：420/980 都有 `阈值 5.0` 与 `5.5` 的 bbox 相交。建议阈值标签放在阈值线左端，粗差值放到柱顶另一侧。

## 6. 未验证部分 / 方法学边界

- 只验证 Chromium headless 的 420/980 light 主题；未验证 Firefox/Safari、真机触摸、暗色主题的动态重绘。
- Canvas `fillText` bbox 不是像素级字形分割；极小边界命中（0.8–0.9 px）只能说明“存在裁剪风险/上界”，不能替代真实字体渲染的逐像素目测。
- 没有修改源码再验证最小修复；本报告只给出问题定位和建议。
- 如果 `outputs/gnss-swarm-lab.html` 再次重建，必须以其新 SHA-256 重跑 `node review/ds41/w2-charts.js`；当前结论仅对 `173353eea691...` 有效。
