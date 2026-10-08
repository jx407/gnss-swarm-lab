# 契约增补 v6（2026-10-06）——真实 GPS 星座（CelesTrak 轨道根数 + 简化开普勒传播）

阅读顺序：本文件 + `CONTRACT.md` §0。**不得修改** `allSats` / `multiconst` / 其它既有函数。

## 13. `GNSS.realConst`（真实 GPS 星座快照）

数据：`GNSS.REAL_GPS_ELEMENTS`（已内嵌，来源 CelesTrak `gp.php?GROUP=gps-ops&FORMAT=json`，
抓取于 2026-10-05；每条含 `prn, name, norad, epoch(ISO), nRadPerSec, aM, e, iDeg, raanDeg, argpDeg, m0Deg`）。
浏览器里不能联网，所以数据是常量；**TLE 是平均根数**，本模块只做简化开普勒传播（不含 SGP4 摄动），
数小时内位置误差为公里级——注释与页面必须写明这一点。

```js
GNSS.realConst(relSec, opts) -> [ { prn, norad, sys:'G', x, y, z, aM, e, iDeg, periodS } ]
```

- `relSec`：相对**该星自身历元**的秒数（`opts.refUnix` 给出整体参考 Unix 秒时可加偏移；
  默认 `relSec` 就是相对各自 epoch 的秒数，便于离线演示）。
- 传播步骤：
  1. `Δt = relSec`；`M = m0 + n·Δt`（n = `nRadPerSec`，弧度/秒），归一到 [0, 2π)；
  2. 解开普勒方程 `E − e·sinE = M`（牛顿迭代，初值 E₀ = M，收敛判据 |ΔE| < 1e-12，最多 30 次）；
  3. `ν = 2·atan2(√(1+e)·sin(E/2), √(1−e)·cos(E/2))`；`r = a·(1 − e·cosE)`；
     轨道平面内 `(r·cosν, r·sinν, 0)`；
  4. 依次绕 z 转 ω（`argpDeg`）、绕 x 转 i（`iDeg`）、绕 z 转 Ω（`raanDeg`）→ ECI（TEME 近似 ECI）；
  5. ECEF = Rz(−θ)·ECI，θ = **GMST**（由历元 UTC 时刻算：`θ = 280.46061837 + 360.98564736629·(JD − 2451545)` 度，
     `JD = epochUnix/86400 + 2440587.5`）。`opts.refUnix` 未给时用元素自带的 epoch。
- 返回 `prn`（数据里的真实 PRN）、`norad`、`sys:'G'`、ECEF 位置、以及 `aM/e/iDeg/periodS`（`periodS = 2π/n`）。
- 纯函数、确定性、不修改入参；非法输入（`REAL_GPS_ELEMENTS` 缺失、relSec 非有限）返回 `[]`，不抛异常。
- 另外必须导出 `GNSS.gmstFromUnix(unixSec)`（返回弧度），供 ECEF 转换与外部独立比对使用。

必须满足（`tests/test-realconst.js`）：
1. 返回 32 颗、PRN 唯一且都是 1..32 的整数、都带 `sys:'G'`。
2. 半长轴与数据一致（±1 m）；`|r|` 落在 `a(1−e)` 与 `a(1+e)` 之间（各留 200 m 容差）；周期 ∈ [43000, 43200] s。
3. 纬度幅值 ≤ 倾角 + 0.1°；同一颗卫星在两个时刻的距离变化不超过 `2a·e + 1 km`。
4. **惯性系周期性**：把 t 与 t+T 的 ECEF 位置各自反旋 GMST 回到 ECI，位置差 < 5 km（T 为该星周期）。
5. **真实几何**：上海 (31.2304°N, 121.4737°E, 50 m)、掩膜 10°、refUnix=0 时，可见星 ≥ 8 颗且 PDOP ≤ 4（真实 GPS 星座的正常水平）。
6. 独立解析 oracle：测试脚本自带一份相同公式的实现，逐颗比对 ≤ 1 m。
7. 确定性、入参不被修改、非法输入不抛异常。
