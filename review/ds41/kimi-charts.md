# kimi-charts：GNSS 蜂群工作台 Canvas 图表美化报告

- 日期：2026-10-07 ｜ 代理：Kimi（图表设计）
- 产物（不动 outputs/，合并后统一重建）：`review/kimi-B/standalone.html`（555 608 B）

## ① 基线 SHA

```
3c4dbda11e6e26515b8e643585047f1ff9ccbf90632a1915d3c1d9989e8bcd34  outputs/gnss-swarm-lab.html
```
（与任务给定 `3c4dbda1…` 前缀一致；备份在 `work/gnss-swarm/qa/backup-outputs-kimi/gnss-swarm-lab.baseline.html`。
任务结束后 outputs/ SHA 复测仍是该值，未触碰。）

## ② 改动清单（文件 / 行 / 理由）

全部是**绘制样式**；未改任何数值、公式、文案、id/class、DOM。

| 文件 | 行 | 改动 | 理由 |
|---|---|---|---|
| `app/00-core.js` | 103 | `frame` 描边 `th.border` → `mix(th.border, th.fg, 0.24)` | 全 26 画布的绘图区外框统一更清晰（原来偏浅，与轻网格几乎分不开） |
| 〃 | 106–111 | 新增 `gridH/gridV`（border α=0.5）、`axis0H/axis0V`（fg α=0.34） | 网格透明度原本散布在 0.5/0.6/0.65/0.7/0.9/1.0 六种，统一成"网格 0.5、零轴 fg 0.34"两档 |
| 〃 | 124 | `APP.core` 导出四个新基元 | — |
| `app/11-sky-chart.js` | 21/26 | 网格 → `gridH/gridV` | 0.65 → 0.5，网格更轻 |
| 〃 | 33 | 主线宽 1.5 → 1.8 | DOP 曲线是面板主视觉，细线发虚 |
| 〃 | 42–45 | 图例：色样线（2 px）＋中性文字，`box.x+26+k*52` | 原图例文字直接用序列色，三色并列时偏花；色样＋中性字更整齐 |
| `app/13-sky-doppler.js` | 61/64/66 | 网格 → `gridH`；零线 0.45 → `axis0H`；主线 1.6 → 1.8 | 同上 |
| `app/14-geo-scan.js` | 102 | 竖网格 0.6 → `gridV` | 同上 |
| `app/20-ca.js` | 47/54/55/53 | 零轴 → `axis0H`；lag 网格 0.5 → `gridV`；主线 1.5 → 1.8；标题 `label` → `labelFit(maxW=box.w-96)` | 自/互相关图标题换自适应，右侧给 note 留位 |
| `app/31-acq-draw.js` | 64–65, 109 | 热力图内框 0.9 → `mix(border,fg,0.24)`；剖面主线 1.4 → 1.8 | 与 frame 一致；剖面线最细，加粗 |
| `app/41-pos-draw.js` | 29–30, 34, 82 | 散点十字零轴 1.0 → `axis0H/axis0V`；DRMS 虚线 [3,3] → [4,3]；残差零轴 1.0 → `axis0H` | 十字线原来和边框同色同粗，散点里发闷 |
| `app/51-mp-draw.js` | 37, 55, 59, 95, 99 | 地面线 1.0 → `axis0H`；直达/反射射线 1.6 → 1.8；网格 0.6 → `gridH` | 射线是教学主体 |
| `app/61-raim-draw.js` | 12, 31, 32, 72, 73, 77, 117 | 长标题 → `labelFit`（右端留 38 px 给"PRN"角标）；零轴 → `axis0H/axis0V`；阈值/PL 虚线 [3,3] → [4,3]；散点描边 1.4 → 1.8 | 320 px 实测长标题与"PRN"互压 43.2 px²（第一轮 after 探针 TCOLL=1 抓到，已修并复测 0） |
| `app/71-atm-draw.js` | 12, 39, 47, 53–56 | 标题 → `labelFit`（右端留图例位）；网格 → `gridH`；主线 1.6 → 1.8；图例改为"色样＋中性字"（文字原位不动） | 同 DOP 图 |
| `app/81-coldstart-draw.js` | 25, 66, 101, 70, 114, 128 | 网格 → `gridH/gridV`；TTFF 阶梯与实测/码相位曲线 1.6 → 1.8 | 冷启动三张主图 |
| `app/82-dll-demo.js` | 82 | 满 opacity `th.border` 网格 → `gridH` | 这是全页最重的网格（不透明），现在与全站一致 |
| `app/84-pll-draw.js` | 57, 60 | 网格 0.7 → `gridH`；零轴 `th.mutedFg` 不透明 → `axis0H` | — |
| `app/85-hatch.js` | 74, 90 | 网格 0.7 → `gridH`；重置虚线 [3,3] → [4,3] | — |

未触碰：`winners/**`、`shell.html`、`app/00-style.css`、`app/99-standalone.css`、`tests/**`、`outputs/**`。

## ③ before / after 截图对比

`review/kimi-B/`（before 在 `work/gnss-swarm/qa/before-kimi/`，驱动脚本 `review/kimi-B/shot-after.js` 与 qa/shot-before.js 逐行同驱动）：

| 面板 | 420 | 980 | 1280 |
|---|---|---|---|
| sky | `sky-420-after.png` vs `before-kimi/sky-420.png` | `sky-980-after.png` | `sky-1280-after.png` |
| pos | `pos-420-after.png` | `pos-980-after.png` | `pos-1280-after.png` |
| cold | `cold-420-after.png` | `cold-980-after.png` | `cold-1280-after.png` |

## ④ 探针原始结果

全部探针用 Codex 运行时 Playwright（headless Chromium, dSF=2, light）实跑，非复用旧日志。

| 探针 | 目标页面 | 结果 |
|---|---|---|
| `charts-420980`（w3-charts-recheck 副本） | 基线 | CANVAS=52 行（26×2），CLIP=0，TCOLL=0，FATAL=0，consoleErrors=0 |
| `charts-320` / `charts-360` | 基线 | CANVAS=26 / 26，CLIP=0，TCOLL=0 |
| `charts-420980` | **after（第 4 轮，最终产物）** | CANVAS=52，CLIP=0，TCOLL=0，FATAL=0，consoleErrors=0 |
| `charts-320` | after | CANVAS=26，CLIP=0，TCOLL=0 |
| `charts-360` | after | CANVAS=26，CLIP=0，TCOLL=0 |
| `qa/probe-sweep.js`（极端参数档扫描，360/980×max/min×10 面板） | after | 全场景 `clip=0 coll=0`，"全部场景 0 越界 / 0 互压" |
| `tests/run-all.sh`（21 套判据） | — | 21 套全绿，0 失败（EXIT=0；winners/ 未动） |
| `qa/probe-layout2.js` 布局对比（1280/980/420 × 10 面板） | 基线 vs after | 面板高度最大 +0.41 %（980-raim 750→752，420-geo 799→819 +2.5 % 是该面板，非页面总高；cold 面板 1629→1615 反而下降）；无横向溢出 |

中间迭代记录：第 2 轮 after 探针 320 px 下 `gl-raim-resid` 出现 1 处 TCOLL（长标题与"PRN"角标互压 43.2 px²），已在 61-raim-draw.js L12 收窄 labelFit 右端留白修复，第 3、4 轮复测 TCOLL=0。

原始日志：`review/kimi-B/{baseline,after4}-{420980,320,360}.log`、`sweep-after4.log`、`layout2-{baseline,after}.log`、`tests-final.log`。

## ⑤ 未验证边界

- **暗色主题**：所有探针与截图均 light。新样式全部走 `theme()` 解析后的变量（无硬编码色），理论上暗色自动适配，但未实跑 dark 探针。
- **多系统/真实 GPS 星座切换后**的 sky/ca 面板：sweep 覆盖了 select 末项/min-max 档，但"真实 GPS 在轨构型"与多系统组合下的 sky 图未单独截图复核。
- **cold 面板逐历元播放中**的中间帧：探针等运行结束后取末帧，运行中的逐帧状态未测。
- 1280 截图只做了 sky/pos/cold 三面板目视，未逐 canvas 跑 1280 宽度文字探针（任务只要求 320/360/420/980）。
- 页面总高的严格"≤3 %"判据以 probe-layout2 面板高度对比替代（最大 +0.41 %，cold 面板下降），未做整页 fullPage 高度测量。
