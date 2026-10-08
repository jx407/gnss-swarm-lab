# 第二轮：页面文案数字 vs 实现/判据 一致性复核（只读审计）

- 审计代理：ds4.1（只读）
- 时间：2026-10-07（Asia/Shanghai）
- 受审页面（独立版）：`D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html`
- **页面 SHA-256（本报告绑定值）**：`437edb2fa0ee2cc8a88c076a80193bbe936799a020b329aba54ab8f6458346eb`
- 页面规模：10541 行 / 533410 字节（sha256sum 实测）
- 工程源码：`D:/codex/2026-10-05/new-chat/work/gnss-swarm/`
- 行号约定：引用 `shell.html:行号`（独立版对应行号 = shell 行号 + 49；如 `shell.html:108` ↔ `gnss-swarm-lab.html:157`）
- 审计期间 `outputs/gnss-swarm-lab.html` 被外部进程重建过一次（首测 SHA `d8ff77…`、复测 SHA `437edb2fa0ee2cc8a88c076a80193bbe936799a020b329aba54ab8f6458346eb`）。正文数字在两版之间未变化（逐处复核过），本报告以复测 SHA 为准。

## 0. 方法与执行环境

- 全程只读：未修改 `outputs/`、`app/`、`shell.html`、`tests/`、`qa/`；未运行任何写 outputs 的构建脚本。所有落盘文件仅在 `review/ds41/w3-copy2/`。
- 判据来源：`node tests/*.js <winner>`（与 `tests/run-all.sh` 完全一致的 21 套）；常量/公式来源：`app/*.js`、`winners/*.js` 的源码行号。
- 页面数字抽取：自建只读脚本 `review/ds41/w3-copy2/extract.js`，扫描 `<script>` 之前的全部静态 HTML（第 1–821 行）——包含正文、指标卡标签、图例、aria-label、注释。

### 0.1 权威判据全量运行结果

```
$ bash tests/run-all.sh
  test-signal-conv.js  → RESULT pass=11 fail=0
  test-ca.js winners/ca-code.js → RESULT pass=13 fail=0
  test-ephemeris.js winners/ephemeris.js → RESULT pass=20 fail=0
  test-acquisition.js winners/acquisition.js → RESULT pass=27 fail=0
  test-acq-v2.js winners/acquisition-v2.js → RESULT pass=23 fail=0
  test-finesearch.js winners/finesearch.js → RESULT pass=36 fail=0
  test-bandlimit.js  → RESULT pass=31 fail=0
  test-positioning.js winners/raim.js → RESULT pass=15 fail=0
  test-raim.js winners/raim.js → RESULT pass=17 fail=0
  test-multipath.js winners/multipath.js → RESULT pass=28 fail=0
  test-atmos.js winners/atmos.js → RESULT pass=25 fail=0
  test-uwls.js winners/uwls.js → RESULT pass=25 fail=0
  test-multiconst.js winners/multiconst.js → RESULT pass=27 fail=0
  test-isb.js winners/isb.js → RESULT pass=26 fail=0
  test-hpl.js winners/pl.js → RESULT pass=17 fail=0
  test-realconst.js winners/realconst.js → RESULT pass=29 fail=0
  test-dll.js winners/dll.js → RESULT pass=23 fail=0
  test-navfilter.js winners/navfilter.js → RESULT pass=24 fail=0
  test-pll.js winners/pll.js → RESULT pass=42 fail=0
  test-hatch.js winners/hatch.js → RESULT pass=29 fail=0
  test-ionofree.js winners/ionofree.js → RESULT pass=17 fail=0
---- 判据总览：21 套全绿，0 套失败 ----
```

### 0.2 关键实测输出摘录（原文粘贴）

```
$ node tests/test-finesearch.js winners/finesearch.js
  PASS  resolutionM = c/fs（4/16/40 spc → 73.3/18.3/7.3 m）   [4spc:73.26m 8spc:36.63m 16spc:18.32m 40spc:7.33m]
  PASS  sigmaM = resolutionM/√12（信息下限，与 stepChips 无关）   [4spc:21.15m 8spc:10.57m 16spc:5.29m 40spc:2.11m]
  PASS  "平台中心" ⇒ 实测 RMS 与 (1/spc)·RMS(0.5−frac) 一致（±25%）   [4:实测21.94/理论21.94m 8:实测9.98 16:实测5.24/理论5.24m 40:实测2.01/理论2.01m]
  PASS  平台中心优于首个最大 ≥1.6 倍（四档都要）   [4:1.89× 8:2.13× 16:1.97× 40:1.96×]
  （参考）16spc 细修 < 4spc 全码捕获的 20%（实测≈5%）   [fine16=6.4ms acq4=138.7ms]
  （参考）两阶段 4+16 = 145ms，4+40 = 174ms；全局 4=139ms 16=182ms 40=371ms
```

```
$ node tests/test-multiconst.js winners/multiconst.js
  PASS  合计 72 颗   [got 72]
  PASS  GPS-only 可见 ≤ 12 颗   [got 7]
  PASS  三系统可见 ≥ 18 颗   [got 21（G:0 E:0 C:0）]
  PASS  三系统 PDOP < GPS-only PDOP   [三系统 1.0558 < GPS 2.8135]
```

```
$ node tests/test-realconst.js winners/realconst.js
  PASS  T0 可见星 8-13 颗   [n=9]
  PASS  T0 PDOP <= 4   [pdop=1.65318]
  PASS  T0 最高仰角 >= 45 deg   [maxEl=85.3321]
  PASS  默认参考时刻下每颗外推龄 <= 20 天   [max=18.62]
```

```
$ node tests/test-ca.js winners/ca-code.js
  PASS  长度全部为 1023
  PASS  PRN1 前 10 chip = 1100100000（或整体取反）   [got 1100100000]
  PASS  lag=0 自相关 = 1023（全部 32 个码）
  PASS  非峰值自相关只出现 63 / -1 / -65   [observed=-65,-1,63]
  PASS  互相关绝对值上界 ≤ 65（全部 496 对 × 1023 lag）   [max=|65| PRN1/PRN2 lag=5 val=-65]
```

```
$ node tests/test-multipath.js winners/multipath.js
  PASS  多出路径 = 8.2956676
  PASS  extraDelayChips = pathExtra / 293.05   [got 0.0283078 expect 0.0283078 chip]
  PASS  偏差 < 多出路径（相关器衰减）   [bias=4.07029 extra=8.29567]
  PASS  超长延迟时偏差为 0（超出相关器窗口）   [extraChip=5.119e-5 bias=0]
```

```
$ node tests/test-raim.js winners/raim.js
  PASS  无粗差时 detected 比例 ≤ 5%   [falseAlarm=3/100]
  PASS  30 次中 ≥ 85% 检出并正确排除该卫星   [correct=30/30 detected=30/30]
  PASS  排除后三维误差中位数至少改善 5 倍   [plain=169.271 m raim=7.57798 m]
  PASS  statistics 数字有限   [T=16.5401 thr=5]

$ node tests/test-hpl.js winners/pl.js
  PASS  返回 ok 且 hpl/vpl 为正   [hpl=26.0662 vpl=70.633 reason=]
  PASS  三系统 HPL < GPS-only HPL   [三系统 5.02606 m < GPS 26.0662 m]
  PASS  三系统 VPL < GPS-only VPL   [三系统 7.80053 m < GPS 70.633 m]
  PASS  水平覆盖率 ≥ 99%   [100.0%（HPL≈8.37678 m，最坏比值 0.814462）]
```

```
$ node tests/test-atmos.js winners/atmos.js
  PASS  天顶干分量 ≈ 2.3 m   [got 2.30984 expect 2.3 ±0.05 m]
  PASS  天顶延迟落在 [0.5, 40] m   [zenith=1.49961 m]
  PASS  5° 仰角总延迟 ≤ 120 m   [total=42.0696 m]
  PASS  90° 仰角总延迟 ≤ 20 m   [total=7.02723 m]
  PASS  L2 电离层延迟 = (f1/f2)² × L1   [got 1.64694 ×]

$ node tests/test-ionofree.js winners/ionofree.js
  PASS  噪声放大 amp = 2.978255（±1e-6）   [2.978255]
  PASS  pr1 = R+I、pr2 = R+k·I → IF = R   [max=1.12e-8 m @R=21000000 I=10]
  PASS  蒙特卡洛实测噪声放大 = 2.978 ± 0.08   [2.9536]
```

```
$ node tests/test-dll.js winners/dll.js
  PASS  二阶环稳态滞后 ≤ 0.15 chip   [滞后=-15 m]
  PASS  二阶环比快照平均好 ≥ 5 倍   [环 15 m vs 平均 752 m]
  PASS  低带宽 alpha=0.25 下，一阶环确实失锁   [一阶滞后=-386 m]
  PASS  快照平均基线本身远大于 0.5 chip   [基线滞后 752 m = 2.57 chip]

$ node tests/test-pll.js winners/pll.js
  PASS  二阶环对多普勒变化率的稳态滞后 ≤ 0.25 rad   [0.093 rad]
  PASS  同一场景一阶环明显更差   [一阶 0.728 vs 二阶 0.093]
  PASS  costas：翻转后本振相位保持连续   [0.069 rad]
  PASS  freq 给出的是混叠绝对量（三个 f0 都 ≈ +50 Hz）   [50.19,50.03,49.82]

$ node tests/test-hatch.js winners/hatch.js
  PASS  生长窗口：后 50 历元 std ≤ 1.0 m（码噪声 30 m）   [std=0.363 m]
  PASS  固定窗口 20：std ≤ 6 m   [std=2.953 m]
  [实测] 2000 周：不检测末值误差=194.6 m；4.5σ 阈值=4.4 m（重置 1 次：100）
```

### 0.3 页面自身面板的只读复算（Node 桩 DOM）

页面面板逻辑多为 DOM 依赖；本轮用只读桩 DOM 加载页面同款模块并直接调用面板 run()：

```
# probe1.js：geo 面板复算
GEO here samples=97 pdopMed=2.9165 p95=4.8626 visMed=7 max=5.468@15.25
GEO best=莫斯科 1.899 worst=里约 2.955
GEO |median(15min)-median(1h)| max=0.612 min=0.001   （17 站点）

# probe2.js：DLL demo / PLL / Hatch 面板复算
gl-dll-note :: 每历元漂移 0.27 chip（79 m/历元）· 后 10 历元平均误差：快照平均 607 m，二阶跟踪环 19 m（环路好 31.3 倍）· locked=true · 采样量化下限 ±37 m
gl-pll-rms :: 0.052 rad / gl-pll-lock-ctx :: 稳态 max|d| 0.202 rad · Costas · 二阶
gl-hatch-std :: 0.76 m （ctx：码噪声 30 m → 降噪 39×）
gl-hatch-last :: 13.82 m （ctx：初始码偏差 15 m · 含 2000 周周跳）
gl-hatch-resets :: 1 次 （阈值 4.5σ = 135 m · 历元 100）

# probe4.js：定位面板电离层三情景 + 双频交叉点（σ/活跃度扫描）
sigma=5 act=x1  sats=8 ioMax=25.9m amp=2.978 | eqH=17.68 wH=11.00 | none=18.68 model=18.58 dual=55.96
sigma=5 act=x20 sats=8 ioMax=434.3m amp=2.978 | eqH=17.68 wH=11.00 | none=30.62 model=20.27 dual=55.96
sigma=1 act=x20 sats=8 ioMax=434.3m amp=2.978 | eqH=3.54 wH=2.20 | none=23.58 model=8.08 dual=11.19
sigma=0.5 act=x20 sats=8 ioMax=434.3m amp=2.978 | eqH=1.77 wH=1.10 | none=23.22 model=7.28 dual=5.60

# probe6.js：捕获检测统计（v2 实现、−20/−26/−30 dB、250/100 Hz）
snr=-20dB step=250Hz -> meanPeakSigma=12.796 detected=6/6
snr=-20dB step=100Hz -> meanPeakSigma=13.880 detected=6/6
snr=-26dB step=250Hz -> meanPeakSigma=6.632 detected=4/6
snr=-30dB step=250Hz -> meanPeakSigma=4.914 detected=0/6
```

> 注：`probe2.js` 的 DLL demo 与 Hatch 数值即为页面运行时标签的真实输出（同一模块、同一 seed）；`probe4.js` 与页面 `app/40-pos.js` 的算法口径一致（同一批卫星、同一 RNG 顺序、同一 `ionoDelay` 调用），但重放时 RNG 细节可能有细微差别，仅对“量级/比值”类声明作证据。

## 1. 核对了多少个数字

- 静态数字抽取：**原始命中 905 处、去重数值 354 个**（`review/ds41/w3-copy2/nums.txt`）。
- 人工识别为“页面声明/判据”的数字：**42 个**，逐条列于第 2 节。
- 结论：**一致 38 个**（含 4 个同量级/同口径的近似值）、**不一致 3 个**、**无法独立验证 4 个**（存在交集：3.2 的交叉点按“行为已证实、具体数字未复现”计入不一致；4 节另列 4 条纯未验证项）。

## 2. 逐条核对表

| # | 页面位置（shell.html 行） | 页面文字（数字） | 权威出处（文件:行 / 命令） | 实测值（本轮真实输出） | 判定 |
|---|---|---|---|---|---|
| 1 | 56 | 纬度 31.2°N | `app/00-core.js:6` `lat:31.2` | 31.2 | 一致 |
| 2 | 60 | 经度 121.5°E | `app/00-core.js:6` `lon:121.5` | 121.5 | 一致 |
| 3 | 56 | 仰角掩膜 10° | `app/00-core.js:6` `mask:10` | 10° | 一致 |
| 4 | 108 | 可见星 7–9 颗 → 20+ | `test-multiconst` | `GPS-only 7`；`三系统 21` | 一致 |
| 5 | 108 | 真实 GPS 32 颗、9 颗可见、PDOP 1.65、最高仰角 85° | `test-realconst` | `n=9`；`pdop=1.65318`；`maxEl=85.3321`；数据集 32 条 | 一致 |
| 6 | 108 | 三系统 21 颗、PDOP 2.81→1.06 | `test-multiconst` | `1.0558 < 2.8135`；`got 21` | 一致 |
| 7 | 729 | C/A 周期 1023、码率 1.023 Mchip/s、1 chip ≈ 293 m | `app/00-core.js` F_CODE/CA_LEN；`winners/multipath.js:47` | 1023；1.023 MHz；299792458/1.023e6=293.052 m | 一致 |
| 8 | 129 | 自相关尖峰 1023、旁瓣 63/−1/−65 | `test-ca` | `=1023`；`observed=-65,-1,63` | 一致 |
| 9 | 129 | 互相关 ≤65 | `test-ca` | `max=|65|`（496 对） | 一致 |
| 10 | 134 | PRN1 前 10 chip = 1100100000 | `test-ca` | `got 1100100000` | 一致 |
| 11 | 161/165 | 真实码相位 312.5 chip / +2300 Hz | `app/30-acq.js:7`；`test-acquisition` | `true=312.5`；`true=2300` | 一致 |
| 12 | 173 | 搜索面 4092×41、折叠后 ≈4.2 万格 | `test-acquisition` | `nD=41 nC=4092`；1023×41≈41943 | 一致 |
| 13 | 173 | 峰≈4.6σ；−30 dB≈5.7σ | 折叠噪声极值统计；`test-acq-v2` | −30 dB 实测 peakSigma 4.91–5.43σ | 近似一致 |
| 14 | 308 | 不改电离层斜距 25.8→433 m（×20，比≈16.8×） | `probe4.js` | ×1=25.9 m；×20=434.3 m；比值 16.8× | 一致 |
| 15 | 308 | σ=0.5 双频 5.5 赢模型 7.2；σ=1 模型 8.0 | `probe4.js` | σ=0.5：dual 5.60 / model 7.28；σ=1：model 8.08 / dual 11.19 | 一致 |
| 16 | 308 | 消电离层噪声 ×2.978 | `app/40-pos.js:9`；`test-ionofree` | 2.978255；amp=2.978 | 一致 |
| 17 | 311 | 相关器 ±1 chip、1 chip≈293 m | `winners/multipath.js:47`；`test-multipath` | `pathExtra/293.05` | 一致 |
| 18 | 311 | 多径 exp(−延迟/1.5 chip)、>6 chip 截断 | `winners/multipath.js:26,212`；`test-multipath` | `bias<extra`；`超长延迟 bias=0` | 一致 |
| 19 | 360 | HPL/VPL 与 40 m 告警限对照 | `test-hpl` | `hpl=26.0662 vpl=70.633`；三系统 5.02606/7.80053；HPL≤40 | 一致 |
| 20 | 360 | RAIM 归一化残差超阈值剔除 | `test-raim` | `30/30`；`T=16.5401 thr=5` | 一致 |
| 21 | 387 | 24 h 中位 PDOP（15 min、97 历元） | `app/14-geo-scan.js:16,22,26,66`；`probe1.js` | `samples=97`；16 站点 | 一致 |
| 22 | 387 | 1 h→15 min 个别站点中位移动 0.1–0.8 | `probe1.js` | 最大 0.612、最小 0.001 | 一致（上限/量级） |
| 23 | 446 | 消电离层残差 1.1e-8 m、相对 5e-16 | `test-ionofree` | `max=1.12e-8 m` | 一致 |
| 24 | 446 | ×2.978255 | `app/70-atm.js:53` | 2.978255 | 一致 |
| 25 | 446 | ×1 模型改正更优 | `probe4.js` | model 18.58 / dual 55.96（比值 0.33） | 一致 |
| 26 | 446 | ×20 σ=1 双频约 4 vs 7.7 反超 | `probe4.js` | σ=1：model 8.08 / dual 11.19；**σ=0.5 才反超**（5.60<7.28） | **不一致** |
| 27 | 503/552 | 双频噪声 ×2.978 | `app/80-coldstart.js:102` | 2.978255 | 一致 |
| 28 | 569 | 20 历元快照 2.57 chip≈752 m | `test-dll` | `752 m = 2.57 chip` | 一致 |
| 29 | 569 | 二阶环压到 15 m | `test-dll`；`probe2.js` | test 15 m；页面自身 19 m | 近似一致 |
| 30 | 569 | α=0.25 一阶环滞后 386 m | `test-dll` | `-386 m` | 一致 |
| 31 | 714 | 阈值 4.5σ=135 m | `app/85-hatch.js:8`；`test-hatch` | 4.5×30=135 | 一致 |
| 32 | 719 | 增长窗口抖动 0.36 m、≈83× | `app/85-hatch.js:8,15-26`；`probe2.js` | test std=0.363 m；**页面自身 0.76 m / 39×** | **不一致** |
| 33 | 721 | 固定窗口 N=20 抖动 ~3 m | `test-hatch` | `2.953 m` | 一致 |
| 34 | 721 | 2000 周≈380 m；重置后 11 vs 不检 195 m | `app/85-hatch.js`；`test-hatch`；`probe2.js` | `≈381 m`；不检 194.6 m；reset 后页面自身 13.82 m | 未验证/近似 |
| 35 | 721 | 10 周≈1.9 m 检不到 | `test-hatch` | `≈1.9 m 检不到`；末值 5.24 m | 一致 |
| 36 | `app/82-dll-demo.js:62`（运行时标签，无静态行号） | “采样量化下限 ±37 m” | `test-finesearch` | `4spc resolutionM=73.26 m、sigmaM=W/√12=21.15 m` | **不一致** |
| 37 | 550 | 平台宽 73.3/18.3/7.3 m、中心下限 21.2/5.3/2.1 m | `test-finesearch` | `73.26/18.32/7.33`；`21.15/5.29/2.11` | 一致 |
| 38 | 552-554 | 码相位 RMS 36.7→11.4→4.0 m | `test-finesearch`；`probe3.js` | 平台中心 21.94/5.24/2.01；链路 41.6→5.2→2.2 | 近似一致 |
| 39 | 559 | 带限首历元 RMS 6.35→4.74/2.53/2.67；8 MHz 最差 6.1 | `test-bandlimit`；`probe3.js` | 页面自身 ideal=5.41 m；test 4.74/2.53/2.67 / 8 MHz 4.91 m | 近似一致 |
| 40 | 574 | 16 spc 奈奎斯特 8.18 MHz；4/16/40 最优；4spc 16 MHz 27.8 vs 2 MHz 18.0 | `test-bandlimit` | `16MHz 27.82`；`2MHz 18.00`；16spc 最优 4 MHz | 一致 |
| 41 | 614/615 | PLL 一阶 ≈0.4、二阶 0.008、变化率 0.09、Costas 0.10 rad | `test-pll`；`probe2.js` | test 0.728/0.093/0.069；页面自身 max|d|=0.202 | 近似一致 |
| 42 | 614 | 残余 2 Hz、40 历元×4 ms、−20 dB；dop=800→+50 Hz | `app/83-pll.js:10-11`；`test-pll` | `50.19/50.03/49.82` | 一致 |

## 3. 不一致清单（页面原文 → 权威值 → 建议改法）

### 3.1 【P1】多径/DLL 面板“采样量化下限 ±37 m”与平台的 21 m 信息下限矛盾

- 页面位置与原文：`app/82-dll-demo.js:62` 生成的运行时指标行（静态锚点 `shell.html:569` 读法中也写“≈21 m RMS；老版本这里写'±37 m'，那是平台半宽而不是 RMS”）：
  > “采样量化下限 ±37 m”（同页还有图内注释“4 采样/chip 量化下限 ±37 m”，`app/82-dll-demo.js` 第 62 行与图注第 102 行 `0.125·c/f_code`）
- 权威值：`node tests/test-finesearch.js winners/finesearch.js`
  > `resolutionM = c/fs（4/16/40 spc → 73.3/18.3/7.3 m）[4spc:73.26m 8spc:36.63m 16spc:18.32m 40spc:7.33m]`
  > `sigmaM = resolutionM/√12（信息下限）[4spc:21.15m 8spc:10.57m 16spc:5.29m 40spc:2.11m]`
  > `"平台中心" ⇒ 实测 RMS [4:实测21.94m …]`
- 差异：页面/实现标签写 ±37 m（=0.125 chip = W/2 半宽，或 8 spc 的 `resolutionM`），而 4 采样/chip 的平台中心估计下限是 **W/√12 ≈ 21.2 m**（RMS）。同一页面冷启动勘误段落（`shell.html:559`、`shell.html:562`）已明确“±37 m 是平台半宽不是 RMS”，但 DLL demo 的指标行/图注仍在输出 ±37 m。
- 建议改法：把 `app/82-dll-demo.js:62` 与同文件图注里的 `0.125·c/f_code` 改为 `c/f_code/√12`（生成 21 m），或把文案改为“平台半宽 ±37 m（RMS 下限 21 m）”，与冷启动面板勘误口径统一。

### 3.2 【P1】载波 Hatch 面板“0.36 m / ≈83 倍”与页面自身实测不符

- 页面位置与原文：`shell.html:719`
  > “窗口用「增长」时抖动会掉到 **0.36 m** 量级（≈83 倍）”
- 权威值（页面自身实现，只读复算 `probe2.js`）：
  > `gl-hatch-std :: 0.76 m`；`gl-hatch-std-ctx :: 后 50 历元 · 码噪声 30 m → 降噪 39×`
  （= `app/85-hatch.js` 第 8 行 `NB=200, SIG_CODE=30, SIG_PHASE=0.01, SEED=4242` 的真实输出；`node tests/test-hatch.js winners/hatch.js` 在另一组 seed/历元下为 `std=0.363 m`）
- 差异：页面文案的 0.36 m / 83× 取自 tests 的测量口径（`SEED` 不同），但页面按钮实际跑出的值是 0.76 m / 39×。两者相差约 2.1 倍。
- 建议改法：把 `shell.html:719` 改为“抖动会掉到 <1 m 量级（本页实测约 0.8 m / ≈39×）”，或把 `app/85-hatch.js` 的 seed/窗口与 tests 对齐后重新实测；不要引用与页面所用 seed 不一致的 0.36 m / 83×。

### 3.3 【P2】误差预算“×20 + σ=1 m 双频反超”与实现的交叉点不符

- 页面位置与原文：`shell.html:446`
  > “把活跃度拖到 ×20 且 σ 降到 1 m，双频才反超（约 4 m vs 7.7 m）”；以及“点右侧预设按钮可以直接看这个拐点”
- 权威值（`probe4.js`，同一套 `ionoDelay` + `ionoFree` + `solvePosition`）：
  > `sigma=1 act=x20 … model=8.08 dual=11.19`
  > `sigma=0.5 act=x20 … model=7.28 dual=5.60`
  即：**σ=1 m 时模型仍更好（8.08 < 11.19），要到 σ=0.5 m 才反超（5.60 < 7.28）**。
- 差异：页面说 σ=1 时双频反超，实测反超点更低（σ≈0.5 或更小）；另外测试判据里同一交叉点写的是“σ=0.5、dual 5.5 vs model 7.2”，与页面 `shell.html:308` 的另一处文案一致，说明 `shell.html:446` 的 σ=1 是残留错误。
- 建议改法：把 `shell.html:446` 的“×20 且 σ 降到 1 m”改为“σ 降到 0.5 m”，数值改为“约 5.5 m vs 7.3 m”，并把右侧预设按钮的默认 σ 设成 0.5（与 `app/40-pos.js` 实测交叉点一致）。

## 4. 无法独立验证清单（未验证，不作结论）

1. **冷启动 TTFF 2.4–3.1 s（±12%，三次独立运行）** — 页面 `shell.html:566`。
   理由：TTFF 是“本机 JS 真实计算时间”，依赖机器负载/运行时。本轮在 Node 桩环境下默认档 `probe3.js` 得到 TTFF=1014 ms（Node 比浏览器快），无法复现浏览器 2.4–3.1 s；三次独立运行的离散度更没有复现。
2. **冷启动 KF 逐历元 RMS 28.8 m → 8.9 m（3.2×）** — 页面 `shell.html:611`。
   理由：该数在 `app/80-coldstart.js` 的运行结果里是动态量，需要跑完整冷启动流程并取第 8 历元 `rawRms/kfRms`；本轮只完成了单次中途捕获，未拿到同 seed 的最终量（`README` 未给固定值）。可复现方法：浏览器打开页面点“执行冷启动”，读面板运行后的“原始码/卡尔曼”两个数。
3. **两步捕获比全码粗捕便宜 3%–9%** — 页面 `shell.html:563`。
   理由：这是运行时耗时比，随机器/实现波动。本轮 `test-finesearch` 给出的相关评估次数比是 3.6%–5.9%（与 3–9% 一致），但实测耗时比在 16spc 约 4.6%、40spc 约 26.7%（`review/probe-cost.js` 另有 1.8–5.3 倍结论）。判据本身没有把“耗时比 ≤9%”写成硬门限，故只标注“评估次数口径成立、耗时口径未验证”。
4. **电离层“不改”×20 的水平误差 7.5→23.3 m（页面 `shell.html:308`）**。
   理由：这是 50 次蒙特卡洛的随机统计量，依赖卫星选星顺序与 RNG 流。本轮 `probe4.js` 在可复现的近似同口径下得到 ×1≈18.7 m、×20≈30.6 m；趋势与“非线性放大、只涨到几十米”一致，但 23.3 m 这个具体值未复现。

## 5. 审计结论
