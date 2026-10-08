# GNSS 蜂群教学页：多宽度版面与拥挤度量化审计（ds4.1 / W3）

> **哈希变化说明**：live `outputs/gnss-swarm-lab.html` 在审计期间被并发改写，先后观测到 `d8ff778b…` → `1766372e…` → `0eb721e1…` → `7629ea94…` → `437edb2f…`。为避免混用不同版本，最终测量绑定稳定冻结副本 `review/ds41/w3-resp/audited-snapshot.html`；live 最终版需以新 SHA 重跑才能给出同等结论。

- 受审文件：`D:/codex/2026-10-05/new-chat/review/ds41/w3-resp/audited-snapshot.html`
- SHA-256（审计开始）：`7629ea947e13e8630f2e95fb3cee6b05163bd28708ea18047335a8b4c6650fe1`
- SHA-256（审计结束）：`7629ea947e13e8630f2e95fb3cee6b05163bd28708ea18047335a8b4c6650fe1`
- 哈希稳定：**是**；字节数：532821
- 生成时间：2026-10-06T17:29:50.138Z
- 实测矩阵：10 个标签页 × 4 宽度 × 2 主题 = 80 组；视口高统一 900px，deviceScaleFactor=1。
- 主题：页面仅有 `@media (prefers-color-scheme: dark)`（第 15–23 行）；未发现页面自带主题切换按钮。light/dark 均以 Playwright `colorScheme` 驱动 `prefers-color-scheme` 实测。

## 方法

1. 只读 `file://` 打开冻结副本；注入仅运行期 CSS，禁用 transition/animation。live 每次变化都不混用其结果。
2. 每组合先触发各面板运行/绘制，再切换目标标签页测量；文档高度取 `documentElement.scrollHeight`。
3. 水平溢出同时检查根元素 `scrollWidth-clientWidth` 和面板内所有可见节点的 `getBoundingClientRect()` 越界。
4. 触控目标检查可见 `button/select/input[type=range]/input[type=checkbox]/summary/[role=button]/a[href]`，按“宽或高 < 44 CSS px”列清单。
5. 拥挤度按控件顶边 ±4px 聚合视觉行；垂直间距为上一行底到下一行顶，行宽占用率为该行外接宽度/面板 clientWidth；压盖为候选块两两矩形交面积 ≥20px² 且 ≥较小面积 5%。
6. 文字截断为可见元素 `scrollWidth > clientWidth + 1`；再按 `ellipsis/nowrap/hidden/clip + 自有文本` 标为文字截断。
7. dark 模式额外计算文字/有效背景 WCAG 对比、浅背景残留，并抽取可见 canvas 40×40 像素统计主色与浅色面。

复现命令：
```bash
node review/ds41/w3-resp/audit.js
```

## 结论摘要

- **P0 实例：0 组**（根水平溢出、元素压盖、暗色低对比/浅色 canvas 任一命中）
- **P1 实例：80 组**（≥4 屏、文字截断、命中框不足 44×44 任一命中）
- **P2 实例：64 组**（原始 `scrollWidth > clientWidth` 复核项；均为 +4px 轻微尺寸越出，`overflow-x: visible`，未形成省略号或视口横滚。相邻行垂直间距/单行占用率阈值本身为 0 组命中。）
- 根水平溢出：0/80 组；最大根溢出 0.0px。
- ≥4 屏：0/80 组；最大 3.35 屏。
- 元素压盖：0/80 组；最大交叠面积 0.0px²。
- 小触控目标：80/80 组；单页最多 15 个。
- 文字截断：0/80 组；原始 `scrollWidth>clientWidth` 元素最多 5 个/组。
- 暗色低对比文本：0/40 组；浅色 canvas：0/40 组。

## 最严重问题（按实测数值）

### P0 / P1 / P2 排序

- **P0**：未发现根水平溢出、元素矩形压盖、暗色正文低对比或浅色 canvas。根溢出 0/80；压盖 0/80；暗色低对比 0/40；浅色 canvas 0/40。
- **P1（系统性触控问题）**：80/80 组合至少 1 个可点元素小于 44×44。最小为 #gl-pos-isb / #gl-cold-kf / #gl-pll-flip / #gl-hatch-slip 的 **13×13px**；滑杆命中框高度为 **16px**；单页最多 **15 个**小目标。
- **P1 高度**：无组合达到 ≥4 屏；最高为 cold / 360px：**3017px = 3.35 屏**，420px 为 2783px = 3.09 屏。
- **P2（轻微尺寸越出）**：64/80 组合出现 `scrollWidth-clientWidth=4px` 的原始元素溢出（最多 5 个/组），但 CSS 为 `overflow-x: visible`，0 组形成省略号，根横向滚动仍为 0。
- **P2 拥挤度**：同列最近控件最小垂直间距为 **9px**（cold / 360px）；最大单行外接占用为 **100.6%**（360px acq/mp/raim/atm/pll，含边框/测量取整），未达 >102% 阈值，元素两两压盖为 0。

## 全矩阵结论表

| 标签页 | 宽度 | 主题 | 高度(px) | 屏数 | 根溢出(px) | 越界节点 | 最小行距(px) | 最大行占用 | 压盖 | 小触控(<44) | 文字截断 | dark低对比/浅canvas | 代表截图 |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| sky | 360 | light | 1850 | 2.06 | 0 | 0 | 31.5 | 100.0% | 0 | 9 | 0 | — | [360-light-sky.jpg](w3-resp/360-light-sky.jpg) |
| ca | 360 | light | 1265 | 1.41 | 0 | 0 | 815.0 | 100.0% | 0 | 3 | 0 | — | [360-light-ca.jpg](w3-resp/360-light-ca.jpg) |
| acq | 360 | light | 1257 | 1.40 | 0 | 0 | 31.5 | 100.6% | 0 | 6 | 0 | — | [360-light-acq.jpg](w3-resp/360-light-acq.jpg) |
| pos | 360 | light | 1856 | 2.06 | 0 | 0 | 55.0 | 100.0% | 0 | 6 | 0 | — | [360-light-pos.jpg](w3-resp/360-light-pos.jpg) |
| mp | 360 | light | 1578 | 1.75 | 0 | 0 | 31.5 | 100.6% | 0 | 6 | 0 | — | [360-light-mp.jpg](w3-resp/360-light-mp.jpg) |
| raim | 360 | light | 1594 | 1.77 | 0 | 0 | 31.5 | 100.6% | 0 | 5 | 0 | — | [360-light-raim.jpg](w3-resp/360-light-raim.jpg) |
| geo | 360 | light | 1258 | 1.40 | 0 | 0 | — | 100.0% | 0 | 1 | 0 | — | [360-light-geo.jpg](w3-resp/360-light-geo.jpg) |
| atm | 360 | light | 1641 | 1.82 | 0 | 0 | 37.5 | 100.6% | 0 | 7 | 0 | — | [360-light-atm.jpg](w3-resp/360-light-atm.jpg) |
| cold | 360 | light | 3017 | 3.35 | 0 | 0 | 9.0 | 100.0% | 0 | 14 | 0 | — | [360-light-cold.jpg](w3-resp/360-light-cold.jpg) |
| pll | 360 | light | 2200 | 2.44 | 0 | 0 | 11.0 | 100.6% | 0 | 12 | 0 | — | [360-light-pll.jpg](w3-resp/360-light-pll.jpg) |
| sky | 360 | dark | 1850 | 2.06 | 0 | 0 | 31.5 | 100.0% | 0 | 9 | 0 | 0 / 0 | [360-dark-sky.jpg](w3-resp/360-dark-sky.jpg) |
| ca | 360 | dark | 1265 | 1.41 | 0 | 0 | 815.0 | 100.0% | 0 | 3 | 0 | 0 / 0 | [360-dark-ca.jpg](w3-resp/360-dark-ca.jpg) |
| acq | 360 | dark | 1257 | 1.40 | 0 | 0 | 31.5 | 100.6% | 0 | 6 | 0 | 0 / 0 | [360-dark-acq.jpg](w3-resp/360-dark-acq.jpg) |
| pos | 360 | dark | 1856 | 2.06 | 0 | 0 | 55.0 | 100.0% | 0 | 6 | 0 | 0 / 0 | [360-dark-pos.jpg](w3-resp/360-dark-pos.jpg) |
| mp | 360 | dark | 1578 | 1.75 | 0 | 0 | 31.5 | 100.6% | 0 | 6 | 0 | 0 / 0 | [360-dark-mp.jpg](w3-resp/360-dark-mp.jpg) |
| raim | 360 | dark | 1594 | 1.77 | 0 | 0 | 31.5 | 100.6% | 0 | 5 | 0 | 0 / 0 | [360-dark-raim.jpg](w3-resp/360-dark-raim.jpg) |
| geo | 360 | dark | 1258 | 1.40 | 0 | 0 | — | 100.0% | 0 | 1 | 0 | 0 / 0 | [360-dark-geo.jpg](w3-resp/360-dark-geo.jpg) |
| atm | 360 | dark | 1641 | 1.82 | 0 | 0 | 37.5 | 100.6% | 0 | 7 | 0 | 0 / 0 | [360-dark-atm.jpg](w3-resp/360-dark-atm.jpg) |
| cold | 360 | dark | 3017 | 3.35 | 0 | 0 | 9.0 | 100.0% | 0 | 14 | 0 | 0 / 0 | [360-dark-cold.jpg](w3-resp/360-dark-cold.jpg) |
| pll | 360 | dark | 2200 | 2.44 | 0 | 0 | 11.0 | 100.6% | 0 | 12 | 0 | 0 / 0 | [360-dark-pll.jpg](w3-resp/360-dark-pll.jpg) |
| sky | 420 | light | 1688 | 1.88 | 0 | 0 | 31.5 | 100.0% | 0 | 9 | 0 | — | [420-light-sky.jpg](w3-resp/420-light-sky.jpg) |
| ca | 420 | light | 1150 | 1.28 | 0 | 0 | 751.0 | 100.0% | 0 | 3 | 0 | — | [420-light-ca.jpg](w3-resp/420-light-ca.jpg) |
| acq | 420 | light | 1142 | 1.27 | 0 | 0 | 31.5 | 100.5% | 0 | 6 | 0 | — | [420-light-acq.jpg](w3-resp/420-light-acq.jpg) |
| pos | 420 | light | 1709 | 1.90 | 0 | 0 | 43.5 | 100.0% | 0 | 6 | 0 | — | [420-light-pos.jpg](w3-resp/420-light-pos.jpg) |
| mp | 420 | light | 1416 | 1.57 | 0 | 0 | 31.5 | 100.5% | 0 | 6 | 0 | — | [420-light-mp.jpg](w3-resp/420-light-mp.jpg) |
| raim | 420 | light | 1450 | 1.61 | 0 | 0 | 31.5 | 100.5% | 0 | 5 | 0 | — | [420-light-raim.jpg](w3-resp/420-light-raim.jpg) |
| geo | 420 | light | 1078 | 1.20 | 0 | 0 | — | 100.0% | 0 | 1 | 0 | — | [420-light-geo.jpg](w3-resp/420-light-geo.jpg) |
| atm | 420 | light | 1497 | 1.66 | 0 | 0 | 37.5 | 100.5% | 0 | 7 | 0 | — | [420-light-atm.jpg](w3-resp/420-light-atm.jpg) |
| cold | 420 | light | 2783 | 3.09 | 0 | 0 | 9.0 | 100.0% | 0 | 14 | 0 | — | [420-light-cold.jpg](w3-resp/420-light-cold.jpg) |
| pll | 420 | light | 1945 | 2.16 | 0 | 0 | 11.0 | 100.5% | 0 | 12 | 0 | — | [420-light-pll.jpg](w3-resp/420-light-pll.jpg) |
| sky | 420 | dark | 1688 | 1.88 | 0 | 0 | 31.5 | 100.0% | 0 | 9 | 0 | 0 / 0 | [420-dark-sky.jpg](w3-resp/420-dark-sky.jpg) |
| ca | 420 | dark | 1150 | 1.28 | 0 | 0 | 751.0 | 100.0% | 0 | 3 | 0 | 0 / 0 | [420-dark-ca.jpg](w3-resp/420-dark-ca.jpg) |
| acq | 420 | dark | 1142 | 1.27 | 0 | 0 | 31.5 | 100.5% | 0 | 6 | 0 | 0 / 0 | [420-dark-acq.jpg](w3-resp/420-dark-acq.jpg) |
| pos | 420 | dark | 1709 | 1.90 | 0 | 0 | 43.5 | 100.0% | 0 | 6 | 0 | 0 / 0 | [420-dark-pos.jpg](w3-resp/420-dark-pos.jpg) |
| mp | 420 | dark | 1416 | 1.57 | 0 | 0 | 31.5 | 100.5% | 0 | 6 | 0 | 0 / 0 | [420-dark-mp.jpg](w3-resp/420-dark-mp.jpg) |
| raim | 420 | dark | 1450 | 1.61 | 0 | 0 | 31.5 | 100.5% | 0 | 5 | 0 | 0 / 0 | [420-dark-raim.jpg](w3-resp/420-dark-raim.jpg) |
| geo | 420 | dark | 1078 | 1.20 | 0 | 0 | — | 100.0% | 0 | 1 | 0 | 0 / 0 | [420-dark-geo.jpg](w3-resp/420-dark-geo.jpg) |
| atm | 420 | dark | 1497 | 1.66 | 0 | 0 | 37.5 | 100.5% | 0 | 7 | 0 | 0 / 0 | [420-dark-atm.jpg](w3-resp/420-dark-atm.jpg) |
| cold | 420 | dark | 2783 | 3.09 | 0 | 0 | 9.0 | 100.0% | 0 | 14 | 0 | 0 / 0 | [420-dark-cold.jpg](w3-resp/420-dark-cold.jpg) |
| pll | 420 | dark | 1945 | 2.16 | 0 | 0 | 11.0 | 100.5% | 0 | 12 | 0 | 0 / 0 | [420-dark-pll.jpg](w3-resp/420-dark-pll.jpg) |
| sky | 768 | light | 1210 | 1.34 | 0 | 0 | 37.5 | 100.3% | 0 | 9 | 0 | — | [768-light-sky.jpg](w3-resp/768-light-sky.jpg) |
| ca | 768 | light | 900 | 1.00 | 0 | 0 | 479.0 | 100.0% | 0 | 3 | 0 | — | [768-light-ca.jpg](w3-resp/768-light-ca.jpg) |
| acq | 768 | light | 1021 | 1.13 | 0 | 0 | 35.5 | 100.3% | 0 | 6 | 0 | — | [768-light-acq.jpg](w3-resp/768-light-acq.jpg) |
| pos | 768 | light | 1198 | 1.33 | 0 | 0 | 67.0 | 100.0% | 0 | 6 | 0 | — | [768-light-pos.jpg](w3-resp/768-light-pos.jpg) |
| mp | 768 | light | 988 | 1.10 | 0 | 0 | 37.5 | 100.3% | 0 | 6 | 0 | — | [768-light-mp.jpg](w3-resp/768-light-mp.jpg) |
| raim | 768 | light | 1029 | 1.14 | 0 | 0 | 641.0 | 100.0% | 0 | 5 | 0 | — | [768-light-raim.jpg](w3-resp/768-light-raim.jpg) |
| geo | 768 | light | 995 | 1.11 | 0 | 0 | — | 100.0% | 0 | 1 | 0 | — | [768-light-geo.jpg](w3-resp/768-light-geo.jpg) |
| atm | 768 | light | 1028 | 1.14 | 0 | 0 | 41.5 | 100.3% | 0 | 7 | 0 | — | [768-light-atm.jpg](w3-resp/768-light-atm.jpg) |
| cold | 768 | light | 2126 | 2.36 | 0 | 0 | 85.5 | 100.0% | 0 | 15 | 0 | — | [768-light-cold.jpg](w3-resp/768-light-cold.jpg) |
| pll | 768 | light | 1500 | 1.67 | 0 | 0 | 13.0 | 100.3% | 0 | 12 | 0 | — | [768-light-pll.jpg](w3-resp/768-light-pll.jpg) |
| sky | 768 | dark | 1210 | 1.34 | 0 | 0 | 37.5 | 100.3% | 0 | 9 | 0 | 0 / 0 | [768-dark-sky.jpg](w3-resp/768-dark-sky.jpg) |
| ca | 768 | dark | 900 | 1.00 | 0 | 0 | 479.0 | 100.0% | 0 | 3 | 0 | 0 / 0 | [768-dark-ca.jpg](w3-resp/768-dark-ca.jpg) |
| acq | 768 | dark | 1021 | 1.13 | 0 | 0 | 35.5 | 100.3% | 0 | 6 | 0 | 0 / 0 | [768-dark-acq.jpg](w3-resp/768-dark-acq.jpg) |
| pos | 768 | dark | 1198 | 1.33 | 0 | 0 | 67.0 | 100.0% | 0 | 6 | 0 | 0 / 0 | [768-dark-pos.jpg](w3-resp/768-dark-pos.jpg) |
| mp | 768 | dark | 988 | 1.10 | 0 | 0 | 37.5 | 100.3% | 0 | 6 | 0 | 0 / 0 | [768-dark-mp.jpg](w3-resp/768-dark-mp.jpg) |
| raim | 768 | dark | 1029 | 1.14 | 0 | 0 | 641.0 | 100.0% | 0 | 5 | 0 | 0 / 0 | [768-dark-raim.jpg](w3-resp/768-dark-raim.jpg) |
| geo | 768 | dark | 995 | 1.11 | 0 | 0 | — | 100.0% | 0 | 1 | 0 | 0 / 0 | [768-dark-geo.jpg](w3-resp/768-dark-geo.jpg) |
| atm | 768 | dark | 1028 | 1.14 | 0 | 0 | 41.5 | 100.3% | 0 | 7 | 0 | 0 / 0 | [768-dark-atm.jpg](w3-resp/768-dark-atm.jpg) |
| cold | 768 | dark | 2126 | 2.36 | 0 | 0 | 85.5 | 100.0% | 0 | 15 | 0 | 0 / 0 | [768-dark-cold.jpg](w3-resp/768-dark-cold.jpg) |
| pll | 768 | dark | 1500 | 1.67 | 0 | 0 | 13.0 | 100.3% | 0 | 12 | 0 | 0 / 0 | [768-dark-pll.jpg](w3-resp/768-dark-pll.jpg) |
| sky | 1280 | light | 1127 | 1.25 | 0 | 0 | 46.0 | 100.0% | 0 | 9 | 0 | — | [1280-light-sky.jpg](w3-resp/1280-light-sky.jpg) |
| ca | 1280 | light | 900 | 1.00 | 0 | 0 | 479.0 | 100.0% | 0 | 3 | 0 | — | [1280-light-ca.jpg](w3-resp/1280-light-ca.jpg) |
| acq | 1280 | light | 900 | 1.00 | 0 | 0 | 549.0 | 100.0% | 0 | 6 | 0 | — | [1280-light-acq.jpg](w3-resp/1280-light-acq.jpg) |
| pos | 1280 | light | 1058 | 1.18 | 0 | 0 | 707.0 | 100.0% | 0 | 6 | 0 | — | [1280-light-pos.jpg](w3-resp/1280-light-pos.jpg) |
| mp | 1280 | light | 900 | 1.00 | 0 | 0 | 509.0 | 100.2% | 0 | 6 | 0 | — | [1280-light-mp.jpg](w3-resp/1280-light-mp.jpg) |
| raim | 1280 | light | 974 | 1.08 | 0 | 0 | 623.0 | 100.0% | 0 | 5 | 0 | — | [1280-light-raim.jpg](w3-resp/1280-light-raim.jpg) |
| geo | 1280 | light | 940 | 1.04 | 0 | 0 | — | 100.0% | 0 | 1 | 0 | — | [1280-light-geo.jpg](w3-resp/1280-light-geo.jpg) |
| atm | 1280 | light | 900 | 1.00 | 0 | 0 | 513.0 | 100.0% | 0 | 7 | 0 | — | [1280-light-atm.jpg](w3-resp/1280-light-atm.jpg) |
| cold | 1280 | light | 1921 | 2.13 | 0 | 0 | 85.5 | 100.0% | 0 | 15 | 0 | — | [1280-light-cold.jpg](w3-resp/1280-light-cold.jpg) |
| pll | 1280 | light | 1360 | 1.51 | 0 | 0 | 13.0 | 100.0% | 0 | 12 | 0 | — | [1280-light-pll.jpg](w3-resp/1280-light-pll.jpg) |
| sky | 1280 | dark | 1127 | 1.25 | 0 | 0 | 46.0 | 100.0% | 0 | 9 | 0 | 0 / 0 | [1280-dark-sky.jpg](w3-resp/1280-dark-sky.jpg) |
| ca | 1280 | dark | 900 | 1.00 | 0 | 0 | 479.0 | 100.0% | 0 | 3 | 0 | 0 / 0 | [1280-dark-ca.jpg](w3-resp/1280-dark-ca.jpg) |
| acq | 1280 | dark | 900 | 1.00 | 0 | 0 | 549.0 | 100.0% | 0 | 6 | 0 | 0 / 0 | [1280-dark-acq.jpg](w3-resp/1280-dark-acq.jpg) |
| pos | 1280 | dark | 1058 | 1.18 | 0 | 0 | 707.0 | 100.0% | 0 | 6 | 0 | 0 / 0 | [1280-dark-pos.jpg](w3-resp/1280-dark-pos.jpg) |
| mp | 1280 | dark | 900 | 1.00 | 0 | 0 | 509.0 | 100.2% | 0 | 6 | 0 | 0 / 0 | [1280-dark-mp.jpg](w3-resp/1280-dark-mp.jpg) |
| raim | 1280 | dark | 974 | 1.08 | 0 | 0 | 623.0 | 100.0% | 0 | 5 | 0 | 0 / 0 | [1280-dark-raim.jpg](w3-resp/1280-dark-raim.jpg) |
| geo | 1280 | dark | 940 | 1.04 | 0 | 0 | — | 100.0% | 0 | 1 | 0 | 0 / 0 | [1280-dark-geo.jpg](w3-resp/1280-dark-geo.jpg) |
| atm | 1280 | dark | 900 | 1.00 | 0 | 0 | 513.0 | 100.0% | 0 | 7 | 0 | 0 / 0 | [1280-dark-atm.jpg](w3-resp/1280-dark-atm.jpg) |
| cold | 1280 | dark | 1921 | 2.13 | 0 | 0 | 85.5 | 100.0% | 0 | 15 | 0 | 0 / 0 | [1280-dark-cold.jpg](w3-resp/1280-dark-cold.jpg) |
| pll | 1280 | dark | 1360 | 1.51 | 0 | 0 | 13.0 | 100.0% | 0 | 12 | 0 | 0 / 0 | [1280-dark-pll.jpg](w3-resp/1280-dark-pll.jpg) |

## 明细与建议

### 水平溢出

未发现根水平溢出或视口越界节点。

### 触控目标不足

- `#gl-panel-sky details.gl-about > summary`：1240×18px，“完整读法（268 字，点开）”；2 组，例：sky@1280/light、sky@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-ca details.gl-about > summary`：1240×18px，“完整读法（116 字，点开）”；2 组，例：ca@1280/light、ca@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-acq details.gl-about > summary`：1240×18px，“完整读法（107 字，点开）”；2 组，例：acq@1280/light、acq@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-pos details.gl-about > summary`：1240×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；2 组，例：pos@1280/light、pos@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-mp details.gl-about > summary`：1240×18px，“完整读法（116 字，点开）”；2 组，例：mp@1280/light、mp@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-raim details.gl-about > summary`：1240×18px，“完整读法（145 字，点开）”；2 组，例：raim@1280/light、raim@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-geo details.gl-about > summary`：1240×18px，“完整读法（244 字，点开）”；2 组，例：geo@1280/light、geo@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-atm details.gl-about > summary`：1240×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；2 组，例：atm@1280/light、atm@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-cold details.gl-about > summary`：1240×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；4 组，例：cold@1280/light、cold@1280/light、cold@1280/dark、cold@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-pll details.gl-about > summary`：1240×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；4 组，例：pll@1280/light、pll@1280/light、pll@1280/dark、pll@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-mp-refl`：728×16px，无文本；2 组，例：mp@768/light、mp@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-sky details.gl-about > summary`：728×18px，“完整读法（268 字，点开）”；2 组，例：sky@768/light、sky@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-ca details.gl-about > summary`：728×18px，“完整读法（116 字，点开）”；2 组，例：ca@768/light、ca@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-acq details.gl-about > summary`：728×18px，“完整读法（107 字，点开）”；2 组，例：acq@768/light、acq@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-pos details.gl-about > summary`：728×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；2 组，例：pos@768/light、pos@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-mp details.gl-about > summary`：728×18px，“完整读法（116 字，点开）”；2 组，例：mp@768/light、mp@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-raim details.gl-about > summary`：728×18px，“完整读法（145 字，点开）”；2 组，例：raim@768/light、raim@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-geo details.gl-about > summary`：728×18px，“完整读法（244 字，点开）”；2 组，例：geo@768/light、geo@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-atm details.gl-about > summary`：728×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；2 组，例：atm@768/light、atm@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-cold details.gl-about > summary`：728×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；4 组，例：cold@768/light、cold@768/light、cold@768/dark、cold@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-pll details.gl-about > summary`：728×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；4 组，例：pll@768/light、pll@768/light、pll@768/dark、pll@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-dll-slope`：611×16px，无文本；2 组，例：cold@1280/light、cold@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-cold-n`：392.7×16px，无文本；2 组，例：cold@1280/light、cold@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-cold-epochs`：392.7×16px，无文本；2 组，例：cold@1280/light、cold@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-cold-step`：392.7×16px，无文本；2 组，例：cold@1280/light、cold@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-mp-refl`：380×16px，无文本；2 组，例：mp@420/light、mp@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-cold-step`：362×16px，无文本；2 组，例：cold@420/light、cold@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-atm-corr`：355×16px，无文本；2 组，例：atm@768/light、atm@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-dll-slope`：355×16px，无文本；2 组，例：cold@768/light、cold@768/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-sky details.gl-about > summary`：380×18px，“完整读法（268 字，点开）”；2 组，例：sky@420/light、sky@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-ca details.gl-about > summary`：380×18px，“完整读法（116 字，点开）”；2 组，例：ca@420/light、ca@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-acq details.gl-about > summary`：380×18px，“完整读法（107 字，点开）”；2 组，例：acq@420/light、acq@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-pos details.gl-about > summary`：380×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；2 组，例：pos@420/light、pos@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-mp details.gl-about > summary`：380×18px，“完整读法（116 字，点开）”；2 组，例：mp@420/light、mp@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-raim details.gl-about > summary`：380×18px，“完整读法（145 字，点开）”；2 组，例：raim@420/light、raim@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-geo details.gl-about > summary`：380×18px，“完整读法（244 字，点开）”；2 组，例：geo@420/light、geo@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-atm details.gl-about > summary`：380×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；2 组，例：atm@420/light、atm@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-cold details.gl-about > summary`：380×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；4 组，例：cold@420/light、cold@420/light、cold@420/dark、cold@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-panel-pll details.gl-about > summary`：380×18px，“继续读：推导 · 实测数字 · 已知边界（点开）”；4 组，例：pll@420/light、pll@420/light、pll@420/dark、pll@420/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。
- `#gl-prn`：611×30px，“PRN 1PRN 2PRN 3PRN 4PRN 5PRN 6”；2 组，例：ca@1280/light、ca@1280/dark。建议：给交互元素设置 `min-height:44px`，滑杆用包裹层 `padding:12px 0` 扩大命中区；按钮建议 `padding:10px 14px`。

### 文字截断与滚动溢出

- **sky / 360 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-sky div.viz-controls` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **acq / 360 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-acq div.viz-controls` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pos / 360 / light**：文字截断 0，原始横向溢出 3。`#gl-panel-pos div.viz-controls` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **mp / 360 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-mp div.viz-controls` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **raim / 360 / light**：文字截断 0，原始横向溢出 3。`#gl-panel-raim div.viz-controls` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **atm / 360 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-atm div.viz-controls` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **cold / 360 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pll / 360 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-pll div.viz-controls` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **sky / 360 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-sky div.viz-controls` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **acq / 360 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-acq div.viz-controls` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pos / 360 / dark**：文字截断 0，原始横向溢出 3。`#gl-panel-pos div.viz-controls` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **mp / 360 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-mp div.viz-controls` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **raim / 360 / dark**：文字截断 0，原始横向溢出 3。`#gl-panel-raim div.viz-controls` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **atm / 360 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-atm div.viz-controls` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **cold / 360 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pll / 360 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-pll div.viz-controls` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **sky / 420 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-sky div.viz-controls` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **acq / 420 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-acq div.viz-controls` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pos / 420 / light**：文字截断 0，原始横向溢出 3。`#gl-panel-pos div.viz-controls` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **mp / 420 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-mp div.viz-controls` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **raim / 420 / light**：文字截断 0，原始横向溢出 3。`#gl-panel-raim div.viz-controls` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **atm / 420 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-atm div.viz-controls` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **cold / 420 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pll / 420 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-pll div.viz-controls` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **sky / 420 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-sky div.viz-controls` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **acq / 420 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-acq div.viz-controls` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pos / 420 / dark**：文字截断 0，原始横向溢出 3。`#gl-panel-pos div.viz-controls` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **mp / 420 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-mp div.viz-controls` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **raim / 420 / dark**：文字截断 0，原始横向溢出 3。`#gl-panel-raim div.viz-controls` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **atm / 420 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-atm div.viz-controls` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **cold / 420 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pll / 420 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-pll div.viz-controls` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **sky / 768 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-sky div.viz-controls` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **acq / 768 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-acq div.viz-controls` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pos / 768 / light**：文字截断 0，原始横向溢出 2。`#gl-panel-pos div.viz-controls > div.gl-field` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **mp / 768 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-mp div.viz-controls` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **raim / 768 / light**：文字截断 0，原始横向溢出 2。`#gl-panel-raim div.viz-controls > div.gl-field` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **atm / 768 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-atm div.viz-controls` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **cold / 768 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pll / 768 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-pll div.viz-controls` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **sky / 768 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-sky div.viz-controls` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **acq / 768 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-acq div.viz-controls` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pos / 768 / dark**：文字截断 0，原始横向溢出 2。`#gl-panel-pos div.viz-controls > div.gl-field` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **mp / 768 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-mp div.viz-controls` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **raim / 768 / dark**：文字截断 0，原始横向溢出 2。`#gl-panel-raim div.viz-controls > div.gl-field` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **atm / 768 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-atm div.viz-controls` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **cold / 768 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pll / 768 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-pll div.viz-controls` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **sky / 1280 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **acq / 1280 / light**：文字截断 0，原始横向溢出 3。`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pos / 1280 / light**：文字截断 0，原始横向溢出 2。`#gl-panel-pos div.viz-controls > div.gl-field` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **mp / 1280 / light**：文字截断 0，原始横向溢出 5。`#gl-panel-mp div.viz-controls` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **raim / 1280 / light**：文字截断 0，原始横向溢出 2。`#gl-panel-raim div.viz-controls > div.gl-field` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **atm / 1280 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **cold / 1280 / light**：文字截断 0，原始横向溢出 4。`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pll / 1280 / light**：文字截断 0，原始横向溢出 3。`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **sky / 1280 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px；`#gl-panel-sky div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **acq / 1280 / dark**：文字截断 0，原始横向溢出 3。`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px；`#gl-panel-acq div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pos / 1280 / dark**：文字截断 0，原始横向溢出 2。`#gl-panel-pos div.viz-controls > div.gl-field` +4px；`#gl-panel-pos div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **mp / 1280 / dark**：文字截断 0，原始横向溢出 5。`#gl-panel-mp div.viz-controls` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px；`#gl-panel-mp div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **raim / 1280 / dark**：文字截断 0，原始横向溢出 2。`#gl-panel-raim div.viz-controls > div.gl-field` +4px；`#gl-panel-raim div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **atm / 1280 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px；`#gl-panel-atm div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **cold / 1280 / dark**：文字截断 0，原始横向溢出 4。`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px；`#gl-panel-cold div.viz-controls > div.gl-group > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。
- **pll / 1280 / dark**：文字截断 0，原始横向溢出 3。`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px；`#gl-panel-pll div.viz-controls > div.gl-field` +4px。建议：这是 +4px 的不可见布局量差；若非刻意，检查 `.form-select/.form-range` 的 width+border/padding 与父级 clientWidth 取整，不为它启用 `overflow:hidden`。

### 拥挤度与暗色细节

- 暗色截图复核：未发现白底黑字页面残留；visible canvas 像素主色均非浅底（浅色 canvas 0/40），正文低对比 0/40。
- `input[type=range]` 的 computed background 在 Chromium 中为 `rgb(255,255,255)`，但截图实际显示为深底上的蓝色轨道；该启发式结果判为误报，不计入缺陷。
- 同列最近控件最小垂直间距为 9px（cold / 360px）；其余组合 ≥11px；单行最大外接占用 100.6%，两两压盖 0。

## 未验证边界

- 未在真实触屏设备、iOS Safari、Android Chrome、Firefox 上复测；本报告仅在桌面 headless Chromium + Windows 字体栈上验证。
- 未验证 200%/400% 浏览器缩放、系统大字体、屏幕阅读器、键盘焦点顺序。
- 暗色对比依据 computed color/最接近不透明背景；渐变、阴影、半透明叠色和 canvas 内部文字仅用像素抽样辅助，不等同 WCAG 全量工具结论。
- 未验证打印、PDF、小屏横屏、视口高度非 900px；屏数为本报告 900px 视口定义下的相对值。
- `themeToggleCount=0` 仅表示未匹配到常见主题切换控件，不代表所有自定义主题实现均已证明不存在。
- 冻结副本结束 SHA 与开始一致，未触发重测；live 文件随后观测到 `437edb2fa0ee2cc8a88c076a80193bbe936799a020b329aba54ab8f6458346eb`，其后的布局、触控目标、主题与截图可能已变化，本报告对这些最新版变化**未验证**。