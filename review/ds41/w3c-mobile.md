# ds4.1 只读审计：GNSS 蜂群工作台移动端/触屏模拟

## 0. 绑定对象与 SHA-256

- 受审对象：`D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html`
- 打开方式：独立版 `file://` 直开
- 开始 SHA-256（2026-10-07 02:05:59 +08，脚本开始前）：`90d7b1763858988055b546a55b22da0c6119c86c9c4b070ecdb27221bb83bbce`
- 结束 SHA-256（2026-10-07 02:09:46 +08，全部实测与附件复验后）：`90d7b1763858988055b546a55b22da0c6119c86c9c4b070ecdb27221bb83bbce`
- 一致性：**开始/结束一致，审计期间未检测到页面重建**。

### 结论计数

- **P0：0**
- **P1：1**（触控命中框普遍不足 44×44）
- **P2：2**（吸顶导航可遮挡使用 `scrollIntoView({block:'start'})` 定位的控件；viewport 未限制双击/捏合缩放，且真实移动 OS 行为未验证）

---

## 1. 方法

### 1.1 环境与设备模拟

- Node：`C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`
- Playwright：`C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`
- Chromium 参数：`isMobile:true`、`hasTouch:true`、`deviceScaleFactor:3`
- 视口：
  - `360 × 640`
  - `390 × 844`
- 每个视口实测全部 10 个标签：`sky, ca, acq, pos, mp, raim, geo, atm, cold, pll`
- 页面日志：两个视口均 **0 个 console warning/error、0 个 pageerror**。

### 1.2 可复现命令

在 `D:/codex/2026-10-05/new-chat` 下执行：

```bash
NODE='C:/Users/31040/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
"$NODE" review/ds41/w3c-mobile/audit-mobile.js
"$NODE" review/ds41/w3c-mobile/mobile-extra.js

sha256sum outputs/gnss-swarm-lab.html
```

审计脚本只读页面；输出仅写入：

- `review/ds41/w3c-mobile.md`
- `review/ds41/w3c-mobile/`

原始证据：

- `review/ds41/w3c-mobile/audit-mobile.json`
- `review/ds41/w3c-mobile/mobile-extra.json`
- `review/ds41/w3c-mobile/checkbox-label-tap.json`
- `review/ds41/w3c-mobile/checkbox-sticky.json`

---

## 2. 逐条结论

## 2.1 `(pointer: coarse)` 与 coarse CSS 是否生效

**结论：已验证，粗指针媒体查询生效。**

数值证据：

| 项目 | 360×640 | 390×844 |
|---|---:|---:|
| `matchMedia('(pointer: coarse)').matches` | `true` | `true` |
| `navigator.maxTouchPoints` | `1` | `1` |
| `devicePixelRatio` | `3` | `3` |
| `#gl-lat` computed height | `28px` | `28px` |
| `#gl-lat` rect height / width | `28 / 154` | `28 / 169` |
| checkbox computed / rect | `18×18px` | `18×18px` |
| checkbox 实测页面 | `pos #gl-pos-isb`、`cold #gl-cold-kf`、`pll #gl-pll-flip`、`pll #gl-hatch-slip` | 同上 |

来源位置：

- viewport meta：页面第 5 行：`width=device-width, initial-scale=1`
- coarse 规则：页面第 859–862 行：
  - `#gnss-lab .form-range { height: 28px; }`
  - `#gnss-lab input[type=checkbox] { width: 18px; height: 18px; }`

复现命令：

```bash
"$NODE" review/ds41/w3c-mobile/audit-mobile.js
```

**建议：** 无需修 coarse 查询本身；滑杆 28px 只解决了控件外形，仍不足以达到 44px 触控高度，见 P1。

---

## 2.2 全部可点元素的 `<44×44` 清单

**结论：按 44×44 CSS px 触控基线，页面有大量不达标命中框。**

统计口径：

- 对一个元素，只要 `width < 44` **或** `height < 44` 即列入。
- 10 个面板内去重后每个视口约 **64 个**不达标元素。
- 再加 10 个 tab 按钮（`#gl-tab-*`）和 1 个顶部“术语速查”summary，整页去重约 **76 个**。
- 下表给出所有控件 ID；宽度按 `360 / 390` 两个视口分别标注。

### 全局元素（两个视口均存在）

| 页面 | 元素 | 实测尺寸（360 / 390） |
|---|---|---:|
| 全部 tab | `#gl-tab-sky` | `60×30 / 60×30` |
| 全部 tab | `#gl-tab-ca` | `49.2×30 / 49.2×30` |
| 全部 tab | `#gl-tab-acq` | `60×30 / 60×30` |
| 全部 tab | `#gl-tab-pos` | `60×30 / 60×30` |
| 全部 tab | `#gl-tab-mp` | `72×30 / 72×30` |
| 全部 tab | `#gl-tab-raim` | `71.1×30 / 71.1×30` |
| 全部 tab | `#gl-tab-geo` | `60×30 / 60×30` |
| 全部 tab | `#gl-tab-atm` | `60×30 / 60×30` |
| 全部 tab | `#gl-tab-cold` | `48×30 / 48×30` |
| 全部 tab | `#gl-tab-pll` | `60×30 / 60×30` |
| 顶部 | 术语速查 summary | `320×36 / 350×36` |

### `sky` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| `#gl-const-src` | `154×30 / 169×30` |
| `#gl-sys` | `154×30 / 169×30` |
| `#gl-lat` | `154×28 / 169×28` |
| `#gl-lon` | `154×28 / 169×28` |
| `#gl-mask` | `154×28 / 169×28` |
| `#gl-hours` | `154×28 / 169×28` |
| `#gl-sky-prn` | `320×30 / 350×30` |
| `#gl-dop-to-acq` | `128×35 / 128×35` |
| “完整读法”summary | `320×18 / 350×18` |

### `ca` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| `#gl-prn` | `154×30 / 169×30` |
| `#gl-prn2` | `154×30 / 169×30` |
| “完整读法”summary | `320×18 / 350×18` |

### `acq` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| `#gl-acq-prn` | `148.5×30 / 156×30` |
| `#gl-acq-phase` | `159.5×28 / 182×28` |
| `#gl-acq-dop` | `154×28 / 169×28` |
| `#gl-acq-snr` | `154×28 / 169×28` |
| `#gl-acq-run` | `86×35 / 86×35` |
| “完整读法”summary | `320×18 / 350×18` |

### `pos` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| `#gl-pos-sigma` | `154×28 / 169×28` |
| `#gl-pos-n` | `154×28 / 169×28` |
| `#gl-pos-isb` checkbox | `18×18 / 18×18` |
| `#gl-pos-iono-act` | `154×30 / 169×30` |
| `#gl-pos-run` | `124.7×35 / 124.7×35` |
| “继续读”summary | `320×18 / 350×18` |

### `mp` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| `#gl-mp-prn` | `148.5×30 / 156×30` |
| `#gl-mp-azim` | `159.5×28 / 182×28` |
| `#gl-mp-dist` | `154×28 / 169×28` |
| `#gl-mp-height` | `154×28 / 169×28` |
| `#gl-mp-refl` | `320×28 / 350×28` |

### `raim` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| `#gl-raim-prn` | `148.5×30 / 156×30` |
| `#gl-raim-bias` | `159.5×28 / 182×28` |
| `#gl-raim-sigma` | `159.5×28 / 182×28` |
| `#gl-raim-run` | `86×35 / 86×35` |
| “完整读法”summary | `320×18 / 350×18` |

### `geo` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| “完整读法”summary | `320×18 / 350×18` |

### `atm` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| `#gl-atm-freq` | `148.5×30 / 156×30` |
| `#gl-atm-rh` | `159.5×28 / 182×28` |
| `#gl-atm-act` | `154×28 / 169×28` |
| `#gl-atm-sig` | `154×28 / 169×28` |
| `#gl-atm-corr` | `159.5×28 / 182×28` |
| `#gl-atm-preset` | `100×35 / 100×35` |

### `cold` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| `#gl-cold-n` | `146×28 / 161×28` |
| `#gl-cold-epochs` | `146×28 / 161×28` |
| `#gl-cold-step` | `302×28 / 332×28` |
| `#gl-cold-frontbw` | `302×30 / 332×30` |
| `#gl-cold-fine` | `302×30 / 332×30` |
| `#gl-cold-snr` | `302×30 / 332×30` |
| `#gl-cold-iono` | `302×30 / 332×30` |
| `#gl-cold-iono-act` | `302×30 / 332×30` |
| `#gl-cold-mode` | `302×30 / 332×30` |
| `#gl-cold-kf` checkbox | `18×18 / 18×18` |
| `#gl-cold-run` | `100×35 / 100×35` |
| `#gl-dll-slope` | `159.5×28 / 182×28` |
| “详细说明”summary | `320×36 / 350×36` |

### `pll` 面板

| 元素 | 尺寸（360 / 390） |
|---|---:|
| `#gl-pll-order` | `154×30 / 169×30` |
| `#gl-pll-disc` | `154×30 / 169×30` |
| `#gl-pll-fres` | `154×28 / 169×28` |
| `#gl-pll-snr` | `154×28 / 169×28` |
| `#gl-pll-flip` checkbox | `18×18 / 18×18` |
| `#gl-pll-run` | `86×35 / 86×35` |
| `#gl-hatch-window` | `148.5×30 / 156×30` |
| `#gl-hatch-bias` | `159.5×28 / 182×28` |
| `#gl-hatch-slip` checkbox | `18×18 / 18×18` |
| `#gl-hatch-run` | `100×35 / 100×35` |

### label/包裹元素放大证据

这些不是“元素本身变大”，而是关联 label 实际把可点/可聚焦区域扩大。`elementFromPoint` 与触摸实测如下：

- `<select>`：
  - `#gl-const-src` 在 390px 下自身 `169×30`，关联 `label[for=gl-const-src]` 为 `169×19.5`；label 中心 `elementFromPoint` 返回 `LABEL.form-label`。
  - `#gl-sys` 同理：自身 `169×30`，label `169×19.5`，命中 `LABEL.form-label`。
- 滑杆：
  - `#gl-lat` 在 390px 下自身 `169×28`，关联 label `169×19.5`；label 中心命中 `LABEL.form-label`。
  - `#gl-hours` 的 label 文本区域命中其 `SPAN#gl-hours-val`，仍在 label 内。
- checkbox：label 比 raw input 大：
  - `#gl-pos-isb`：input `18×18`，label `151×39`（360）/ `165×18`（390）。
  - `#gl-cold-kf`：input `18×18`，label `181.5×18`。
  - `#gl-pll-flip`：input `18×18`，label `119.7×39`（360）/ `154.2×39`（390）。
  - `#gl-hatch-slip`：input `18×18`，label `127.9×39`（360）/ `164.9×39`（390）。
  - 实测在 label 的非 input 区域触摸，8/8 次 `checked` 均发生翻转（`checkbox-label-tap.json`）。
- 结论：
  - **滑杆/下拉框靠 label 关联扩大的是聚焦区域，不是滑杆有效拖动轨道本身。**
  - **checkbox 的确靠 label/wrapper 明显扩大整个开关命中区。**
  - tab 按钮、summary、普通 `.btn` 没有实测到同等的包裹放大机制。

复现命令：

```bash
"$NODE" review/ds41/w3c-mobile/audit-mobile.js
"$NODE" review/ds41/w3c-mobile/mobile-extra.js
```

**缺陷与修法（P1）：**

- 具体选择器/文件：
  - `#gnss-lab > .nav.nav-pills .nav-link`：当前 `height:30px`（页面第 840–845 行附近）。
  - `#gnss-lab .form-select`：当前实测 `height:30px`（基础样式在页面第 39 行）。
  - `#gnss-lab .form-range`：coarse 模式下 `height:28px`（页面第 859–862 行）。
  - `#gnss-lab .btn`：当前实测 `height:35px`。
  - `.gl-glossary > summary`、`.gl-about > summary`：当前实测 `height:18px` 或 `36px`（页面第 815、833 行附近）。
- 建议修法：
  - 触屏布局为上述选择器设置 `min-height:44px`（滑杆可用外高 44px、内部轨道保持细线）。
  - summary 用 `display:flex; align-items:center; min-height:44px;`。
  - tab 可保持 2 行；若 44px 后破坏布局，可降低字号或改横向可滚动 tab 轨道，但不要只靠 30px 高的按钮。

---

## 2.3 10 个标签页在 360/390 下的导航行数、高度、总高、横向溢出

**结论：两个宽度均为 2 行导航、导航高 73px、页面与 `#gnss-lab` 横向溢出均为 0。**

| 标签 | 360 页面总高 | 360 nav 行/高/溢出 | 390 页面总高 | 390 nav 行/高/溢出 |
|---|---:|---|---:|---|
| `sky` | `1837px` | `2 / 73px / 0` | `1745px` | `2 / 73px / 0` |
| `ca` | `1232px` | `2 / 73px / 0` | `1176px` | `2 / 73px / 0` |
| `acq` | `1238px` | `2 / 73px / 0` | `1192px` | `2 / 73px / 0` |
| `pos` | `1838px` | `2 / 73px / 0` | `1756px` | `2 / 73px / 0` |
| `mp` | `1569px` | `2 / 73px / 0` | `1495px` | `2 / 73px / 0` |
| `raim` | `1565px` | `2 / 73px / 0` | `1508px` | `2 / 73px / 0` |
| `geo` | `1225px` | `2 / 73px / 0` | `1132px` | `2 / 73px / 0` |
| `atm` | `1586px` | `2 / 73px / 0` | `1547px` | `2 / 73px / 0` |
| `cold` | `2853px` | `2 / 73px / 0` | `2761px` | `2 / 73px / 0` |
| `pll` | `2199px` | `2 / 73px / 0` | `2014px` | `2 / 73px / 0` |

补充：

- 360px 首屏 `documentElement.scrollWidth` = `360`，`clientWidth` = `360`。
- 360px `#gnss-lab.scrollWidth - clientWidth` = `0`。
- 390px 首屏 `documentElement.scrollWidth` = `390`，`clientWidth` = `390`。
- 390px `#gnss-lab.scrollWidth - clientWidth` = `0`。
- 没有检出固定定位元素；唯一固定/吸顶类是 `#gnss-lab > .nav.nav-pills`，`position:sticky`、`top:0`、`z-index:6`（页面第 852–853 行）。

复现命令：

```bash
"$NODE" review/ds41/w3c-mobile/audit-mobile.js
```

**结论：横向滚动条风险已通过当前两视口验证，未发现水平溢出。**

---

## 2.4 触屏拖拽滑杆与 `<select>` 可点性

**结论：滑杆触摸点击/拖动均已改变 value；`select` 触摸后能聚焦，但原生展开列表在 headless Chromium 中不可直接观察。**

### 滑杆

使用 `page.touchscreen.tap()` 与 CDP `Input.dispatchTouchEvent` 的 touchstart/touchmove/touchend 实测 `#gl-lat`：

| 视口 | 初始值 | touchscreen.tap 后 | 合成拖动后 |
|---|---:|---:|---:|
| 360×640 | `31` | `44.5` | `53.5` |
| 390×844 | `31` | `44` | `53` |

结论：**触屏可改值，已验证。**

### `<select>`

对 `#gl-const-src` 触摸中心点：

- 360：tap 后 `document.activeElement.id === "gl-const-src"`。
- 390：同上。
- `aria-expanded` 为 `null`（该原生 `<select>` 没有此属性）。

结论边界：

- **“可点/可聚焦”已验证。**
- **“原生 option 列表视觉展开”未验证**：headless Chromium 不把 Android/iOS 原生选择器作为 DOM popup 暴露；这不是页面 DOM 可观测行为。

**建议修法：** 若必须验证真实移动端 option 展开，应补一次真机 Android Chrome/Safari 交互测试；当前无需因为 headless 不可见而改代码。

---

## 2.5 真机常见坑

### 100vh / 动态视口单位

- 对页面内 CSS/源码检索 `100vh`、`dvh`、`svh`、`lvh`：**未检出**。
- 结论：该页面没有依赖 `100vh` 做移动端满屏布局；移动浏览器地址栏折叠导致的高度跳变范围，当前代码路径下**未发现**。

复现命令：

```bash
grep -nE '100vh|dvh|svh|lvh' outputs/gnss-swarm-lab.html
```

### fixed/sticky 遮挡

- 唯一检出吸顶元素：`#gnss-lab > .nav.nav-pills`，高度 `73px`，`position:sticky; top:0; z-index:6`。
- 实测 `#gl-lat.scrollIntoView({block:'start'})` 后：
  - `#gl-lat` top/bottom：`0 / 28`
  - nav top/bottom：`0 / 73`
  - 触摸中心点 `elementFromPoint` 返回 `BUTTON#gl-tab-ca`，不是 range 自身。
- 解释：这是**程序化 strict-start 定位**下的实测遮挡；真实手指滚动可把控件再往下滚开，因此仅标为 **P2 风险/推断**，不把它当作所有用户的必然 P0/P1 功能失效。
- 修法：给控件/目标区补 `scroll-margin-top`，例如：
  - `html { scroll-padding-top: 80px; }`，或
  - `#gnss-lab .viz-controls, #gnss-lab .gl-group, #gnss-lab .gl-field, #gnss-lab input, #gnss-lab select, #gnss-lab button, #gnss-lab summary { scroll-margin-top: 80px; }`

### 双击缩放 / viewport meta

- 页面 meta 实测内容：`width=device-width, initial-scale=1`
- 没有 `maximum-scale`、没有 `user-scalable=no`。
- Playwright headless 下快速双击前后：
  - 360：`visualViewport.scale` 前后均为 `1`
  - 390：`visualViewport.scale` 前后均为 `1`
- 结论：
  - **viewport 没有显式禁止双击/捏合缩放，P2。**
  - **真实 Android Chrome / iOS Safari 的双击缩放行为未验证**；headless 结果显示 1 不能代替真机结论。
- 修法：只有在产品明确要求“禁止页面缩放”时才考虑在页面第 5 行改为 `maximum-scale=1, user-scalable=no`；否则保留可访问性缩放更合适。不要把“未限制”自动判为缺陷。

### 横向滚动条

- 360：`documentElement.scrollWidth - clientWidth = 0`，`#gnss-lab.scrollWidth - clientWidth = 0`。
- 390：两者均为 `0`。
- 结论：**两视口没有水平滚动条。**

---

## 2.6 截图

每个宽度 4 张，满足 3–5 张要求。目录：

`D:/codex/2026-10-05/new-chat/review/ds41/w3c-mobile/`

### 360×640

- `360-01-first-screen.png`
- `360-02-cold-start.png`
- `360-03-widest-controls.png`
- `360-04-slider-touch.png`

### 390×844

- `390-01-first-screen.png`
- `390-02-cold-start.png`
- `390-03-widest-controls.png`
- `390-04-slider-touch.png`

视觉复核：

- 首屏、冷启动页、最宽控件区、触屏滑杆区均已打开查看。
- 360/390 首屏和控件区均未看到横向截断。
- 冷启动页在截图等待时刻仍显示“正在计算：20%”，说明冷启动是异步/长任务；截图用于版面而非计算完成证据。

---

## 3. 问题 / 数值证据 / 复现 / 建议汇总

| 级别 | 问题 | 数值证据 | 复现命令 | 建议修法 |
|---|---|---|---|---|
| P1 | 触控命中框普遍 `<44×44` | nav tab `30px` 高；summary `18px/36px` 高；滑杆 `28px` 高；select `30px` 高；btn `35px` 高；整页约 76 个去重元素不达标 | `"$NODE" review/ds41/w3c-mobile/audit-mobile.js`；`"$NODE" review/ds41/w3c-mobile/mobile-extra.js` | 对 `#gnss-lab > .nav.nav-pills .nav-link`、`#gnss-lab .form-select`、`#gnss-lab .form-range`、`#gnss-lab .btn`、`#gnss-lab summary` 设置 `min-height:44px`；checkbox 保持 18px，但确保其 label 继续覆盖整行 |
| P2 | sticky nav 可遮挡 `scrollIntoView({block:'start'})` 的目标控件 | nav `0–73px`；`#gl-lat` `0–28px`；中心命中 `#gl-tab-ca` | `"$NODE" review/ds41/w3c-mobile/mobile-extra.js` | 增加 `scroll-padding-top:80px` 或给目标控件/分组加 `scroll-margin-top:80px` |
| P2 | viewport 不限制双击/捏合缩放；真实 OS 行为未验证 | meta = `width=device-width, initial-scale=1`；Playwright double-tap 前后 scale 均为 `1` | `"$NODE" review/ds41/w3c-mobile/audit-mobile.js` | 若产品要求禁止缩放，改第 5 行；否则保留缩放能力，结论标注为“行为未验证”而非缺陷 |

---

## 4. 未验证边界

1. **真实手机/平板硬件未验证。** 本报告使用 Playwright Chromium 设备模拟，不是实体 Android/iOS 设备。
2. **iOS Safari、Android Chrome 原生 `<select>` 展开 UI 未验证。** 只验证了触屏聚焦和 `activeElement`。
3. **真实双击缩放/捏合缩放未验证。** Headless 下 scale 保持不变，但不能代替真机浏览器行为。
4. **触屏事件使用 CDP 合成 touchstart/touchmove/touchend，不是物理手指。** 滑杆 `value` 变化已被实测，但真实设备滑动阻尼、系统手势冲突未验证。
5. **页面冷启动计算完成状态未完整验证。** 截图时刻页面显示 `20%`；本次审计目标是移动布局/触控，不是冷启动算法正确性。
6. **cua_repl / in-app browser 未使用。** 本报告完全使用 Playwright 的 Chromium `file://` 加载。
7. **页面生命周期中未重新构建。** 开始和结束 SHA 相同；若之后重建，本报告 SHA 绑定失效，需要重跑受影响的数值项。

---

## 5. 最终结论

最严重的三条：

1. **P1：触控命中框不足。** 10 个 tab 高 `30px`，滑杆高 `28px`，多数 select 高 `30px`，普通按钮高 `35px`，summary 低至 `18px`。
2. **P2：sticky 导航可在 strict-start 滚动定位时覆盖控件。** nav 高 `73px`，`#gl-lat` 被定位到 `0–28px` 后中心命中 `#gl-tab-ca`。
3. **P2：viewport 未限制双击/捏合缩放。** meta 仅 `width=device-width, initial-scale=1`；真实移动 OS 行为未验证。

未发现 **P0** 问题。
