# 契约增补 v14（2026-10-06）——§16.3 `locked` 口径修正（Costas 的假锁与失锁）

## 问题（ds4.1 子代理独立复核 + 主代理复现，`review/probe-pll-epoch-rate.js`）
归一化 Costas 鉴相 `d = I·Q/(I²+Q²) = 0.5·sin(2Δφ)` **数学上恒有 |d| ≤ 0.5**，所以 v10 §16.1 定的
"后半段 `max|d| ≤ 0.5` ⇒ locked" 对 Costas **永远成立**——实测：把 prompt 码相位故意写错 300 chip
（相关退化成一堆噪声），`disc:'costas'` 仍报 `locked=true`（d=-0.188），而 `disc:'atan'` 正确报
`locked=false`（d=2.949）。**这是判据缺陷，必须修**，否则上层"PLL 锁定 6/6"这类结论毫无意义。
另外 Costas 在正交零点（Δφ = ±π/2，Q 最大而 I≈0）也会给出 d≈0——那也是一种**假锁**。

## 修订（取代 v10 §16.1 最后一条）
`locked` = 所有输出有限 **且** 后半段历元同时满足：
1. `max|disc| ≤ 0.5`（原来的条件，对 atan 有效；对 costas 恒真但保留）；
2. **`mean(|I| / amp) ≥ 0.8`**（`amp = hypot(I,Q)`）：真锁时几乎全部能量在 I 支路（≈1），
   正交假锁 ≈0、纯噪声 ≈0.64（E|cosθ| = 2/π），所以 0.8 能把两者分开。
   （Costas 对数据位翻转不敏感 ⇒ 用 |I| 而不是 I。）
返回对象额外给出 `lockQual`（后半段 `mean(|I|/amp)`）与 `maxSteadyDisc`，便于上层显示与诊断。

## 判据（`tests/test-pll.js` 新增 3 项）
1. 正常跟踪（静态）→ `locked = true`、`lockQual ≥ 0.9`；
2. **码相位完全失配**（prompt 退化为噪声，±300 chip）→ `locked = false`（**costas 与 atan 都要**）；
3. **正交假锁**（把相位轨迹整体 +π/2 而本振仍锁在 0）→ `locked = false`（`lockQual` 很小）。
