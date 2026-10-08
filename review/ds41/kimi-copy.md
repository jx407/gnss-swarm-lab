# Kimi 文案与信息层级改动报告（shell.html）

## 范围与基线

- 唯一改动文件：`D:/codex/2026-10-05/new-chat/work/gnss-swarm/shell.html`
  - 改前 sha256：`1d577e073351770fa3accf2e3ce658dd30997a39461b7c721074d8562f18d8eb`（与 `qa/backup-before-kimi/shell.html` 逐字节一致）
  - 改后 sha256：`2f5c102dd82da514e6d3420321f09ef7c6612ea641c5a81229145c35479cfab3`
- ① 基线产物 SHA：`outputs/gnss-swarm-lab.html` = `3c4dbda11e6e26515b8e643585047f1ff9ccbf90632a1915d3c1d9989e8bcd34`（与任务给定 `3c4dbda1…` 一致；**未改动 outputs/ 任何文件**）
- 未动 `app/**`、`winners/**`、`tests/**`、`qa/**`（qa 下只做读取与复制）。
- 自测产物：`review/kimi-C/inline.html`、`review/kimi-C/standalone.html`（`build.js` + `build-standalone.js`，均一次成功）；探针为 `qa/` 三个探针的副本，仅改 `PAGE`/`PAGE_URL`/`OUT` 常量指向 `review/kimi-C/standalone.html`。

## ② 逐处改动（共 15 处，全部只动文字，未动任何 id/class/role/aria-*）

原则：10 条面板读法句保留「在…；先看…——所以…」三要素，且每条「先看」「所以」各恰好 1 次；所有数字/单位/判据口径原样保留；把控件名改成与界面标签逐字一致。

### 导语（1 处）

1. `p.gl-intro`
   - 原：这页把 GNSS 从星座、捕获到跟踪串成可动手比较的实验。先看每页的短读法，再看图上的实际变化；需要推导与实测口径时再展开「详细说明」。切换参数时，只比较相同设置下的结果，避免把不同条件混在一起。
   - 新：这是一套可动手比较的 GNSS 实验，覆盖星座、捕获到跟踪的完整链路。每页开头有一句话读法，先看那句再看图；需要推导与实测数字时，再展开页尾的「详细说明」。比较结果时只动一个参数，避免把不同条件混在一起。
   - 理由：先给定位（一套实验）再给操作顺序，「一句话读法」直接告诉读者去读什么；「只动一个参数」比「相同设置下比较」更可执行。

### 每页首屏读法句（11 处：10 条读法 + 冷启动页第二段用法提示）

2. sky 读法
   - 原：这一页看卫星分布与几何好坏；先看可见星数与 PDOP——星越多、分布越开，PDOP 越小。所以切「卫星系统 / 星座来源」就能直接改善几何，看这两个数怎么变。
   - 新：这一页看卫星分布如何决定几何好坏；先看可见星数与 PDOP——星越多、分布越开，PDOP 越小。所以切换「卫星系统」或「星座来源」，看这两个数怎么跟着变。
   - 理由：补出因果主语（分布→几何）；「就能直接改善几何」是结论前置，改成「看这两个数怎么跟着变」把验证动作还给读者。
3. ca 读法
   - 原：这一页看 C/A 码的自相关尖峰与互相关底噪；先看中心尖峰有多高——峰远高于旁瓣，码才容易分开。所以改「PRN 1 / PRN 2」看互相关峰有多低。
   - 新：这一页看 C/A 码的自相关尖峰与互相关底噪；先看中心尖峰有多高——峰远高于旁瓣，各星才容易区分。所以换「对比 PRN」，看互相关峰有多低。
   - 理由：旧文案里「PRN 1 / PRN 2」在界面上不存在；界面控件叫「PRN」和「对比 PRN」，改成「对比 PRN」与控件逐字对应。
4. acq 读法
   - 原：这一页在二维面上搜码相位与多普勒、找相关峰；先看亮点——峰越高、背景越平，检测越可信。所以把「信噪比」往下拖，看亮点会不会沉进噪声。
   - 新：这一页在码相位 × 多普勒的二维面上找相关峰；先看亮点——峰越高、背景越平，检测越可信。所以把「信噪比」一路往下拖，看亮点会不会沉进噪声。
   - 理由：把「二维面」的两根轴直接点名，读者看图时知道横纵轴是什么。
5. pos 读法
   - 原：这一页用多颗星解位置；先看误差圈，再比"等权"与"高程加权"两张卡——同一批噪声下，加权那张通常更稳。所以拖「伪距噪声 σ」或改「卫星数」，看两张卡怎么变。
   - 新：这一页用多颗星联立解位置；先看散点误差圈，再比「等权」与「高程加权」两张卡——同一批噪声下，加权那张通常更稳。所以拖「伪距噪声 σ」或改「卫星数」，看两张卡怎么跟着变。
   - 理由：直引号统一为「」；「散点误差圈」指明看图位置（散点图上的虚线圈）。
6. mp 读法
   - 原：这一页看反射路径怎么把码相位推偏；先看反射比直达多走多远——一颗星的反射就足以把解算位置推偏。所以拖「墙距 / 墙高」看偏差卡怎么变。
   - 新：这一页看反射如何把码相位推偏；先看反射路径比直达多走多远——一颗星就足以把定位推偏。所以拖「接收机到墙」与「墙高」，看「伪距偏差」卡怎么变。
   - 理由：去掉同句内「推偏」重复；「墙距」改成控件标签原文「接收机到墙」，并点名要看的那张卡「伪距偏差」。
7. raim 读法
   - 原：这一页用多余观测挑坏星；先看哪颗残差最大——剔除后误差下降，才说明它是真粗差。所以给某颗星加「粗差」再重算，看它会不会被剔除。
   - 新：这一页用多余观测投票挑坏星；先看哪颗残差最大——剔除后误差明显下降，才说明它是真粗差。所以选一颗星注入「粗差」、点「运行检核」，看它会不会被揪出来。
   - 理由：把操作步骤写成界面上的两个真实动作（控件「注入粗差的卫星」＋按钮「运行检核」），不再是笼统的「加粗差再重算」。
8. geo 读法
   - 原：这一页比较不同纬度的几何好坏；先看各站点 24 h 中位 PDOP——所以同一星座换纬度，几何就明显不同。（本页没有自己的控件，纬度与历元用"星座几何"页的）
   - 新：这一页比较不同纬度的几何好坏；先看各站点 24 h 中位 PDOP 的条形差——所以同一星座换到另一个纬度，几何好坏会跟着翻转。（本页没有自己的控件：纬度与历元沿用「星座几何」页的）
   - 理由：旧句「先看……——所以……」中间缺少观察对象，因果跳；补「条形差」作观察对象，结论「跟着翻转」与图（条形高低差）对应。
9. atm 读法
   - 原：这一页比较电离层改正的取舍；先看低仰角延迟有多高——只有模型残差大于噪声代价时，双频才更划算。所以拖「改正比例」看误差怎么收窄。
   - 新：这一页比较电离层改正的取舍；先看低仰角的总延迟——只有模型残差大于双频的噪声代价时，双频才更划算。所以拖「改正比例」看误差收窄，或直接点「看双频反超」预设。
   - 理由：指出「噪声代价」属于双频（否则读者以为噪声是模型的）；把页内预设按钮「看双频反超」写进读法，省去读者自己凑参数。
10. cold 读法（第一条）
    - 原：这一页从零跑一次冷启动（捕获 → 跟踪 → 定位）；先执行默认计算，先看 TTFF 与定位 RMS——所以精度主要由采样率与前端带宽决定。
    - 新：这一页从零跑一次完整冷启动（捕获 → 跟踪 → 定位）；先看「累计捕获耗时」（TTFF）与「首次定位误差」两张卡——点「执行冷启动」跑一次就有。所以精度上限主要由采样率与前端带宽决定。
    - 理由：旧句「先执行默认计算，先看……」连用两个「先」且动作含糊；改成「先看卡——点按钮就有」，卡片名与界面逐字一致。
11. pll 读法
    - 原：这一页看载波环怎么跟上信号；先看 IQ 星座是否收敛——所以换环路阶数与数据位翻转会明显改变锁定表现。
    - 新：这一页看载波环怎么跟上信号；先看 IQ 星座收没收敛、相位误差压到多低——所以切「环路阶数」或勾选「数据位翻转」，锁定表现会明显不同。
    - 理由：旧句「先看是否收敛——所以换参数」中间缺观察量；补「相位误差压到多低」，并把两个操作对应到控件名「环路阶数」「数据位翻转」。
12. cold 页第二段用法提示（`p.gl-lead` 共 2 段中的第 2 段，位于下方 DLL 区）
    - 原：这一段怎么用：先调 ②前端 与 ①场景 两个框，点「执行冷启动」，看上面三个数字和三张图怎么变 —— 一句话：采样率与前端带宽决定码相位精度上限，电离层档只有在码相位足够准（或扰动足够强）时才看得出差别。（窄屏上 ①②③ 默认收起，点标题展开再调参）
    - 新：这一段怎么用：先调 ②前端 与 ①场景 两个框，点「执行冷启动」，对照上面三个数字和三张图的变化；想看清因果就一次只改一个档再重跑。（窄屏上 ①②③ 默认收起，点组标题展开再调参）
    - 理由：删去与第 10 条读法明显重复的结论句（「采样率与前端带宽决定……」已在新读法里），换成可执行的对照方法；窄屏提示保留。
    - 备注：该段本就不含「先看」「所以」，改动后仍不含，计数不受影响。

### 术语速查（2 处，44 条术语一条未删，`<strong>` 词条 diff 为空）

13. HPL / VPL 条目
    - 原：水平 / 垂向保护限级，即误差的置信上界（本页对照 40 m 水平告警限）。
    - 新：水平 / 垂向保护限——由几何与噪声推出来的误差置信上界（本页对照 40 m 水平告警限）。
    - 理由：「保护限级」是生硬直译；补「由几何与噪声推出来」让读者知道它不是拍脑袋的常数。40 m 数字原样保留。
14. 信噪比条目
    - 原：信号与噪声的功率比（dB）；本页 −8 dB 档才看得见电离层。
    - 新：信号与噪声的功率比（dB）；数值越低信号越弱——捕获页拖到 −30 dB 以下能看到相关峰被噪声淹没。
    - 理由：旧句「−8 dB 档才看得见电离层」与冷启动页实测口径相冲突（HANDOFF 已记录：信噪比档看不出电离层交叉点，原因在采样格平台而非 SNR 上限），词典不该保留一条有争议的声称；换成捕获页正文已有的实测现象（−30 dB 以下峰被淹没，该数字本就存在于页面）。

### 卡片副标题（1 处）

15. pos 页「水平 RMS（高程加权）」卡副标题（`#gl-pos-hrms-w-ctx`）
    - 原：按 uereSigma 降权
    - 新：低仰角卫星自动降权
    - 理由：`uereSigma` 是代码变量名，读者看不懂；改成实现行为的白话描述（与全局附录 σ(el)² 公式口径一致）。

## ③ 探针原始结果

探针 = `qa/probe-leadfold.js`、`probe-chrome.js`、`probe-layout2.js` 复制到 `review/kimi-C/` 后仅改 PAGE/PAGE_URL/OUT 指向 `review/kimi-C/standalone.html`。完整输出已存：`review/kimi-C/leadfold.out.txt`、`chrome.out.txt`、`layout2.out.txt`。

### probe-leadfold（原文输出）

```
=== 420x844 ===
sky order=ok leadTop=284 firstScreen=true chars=77 panelH=1406
ca order=ok leadTop=284 firstScreen=true chars=70 panelH=871
acq order=ok leadTop=284 firstScreen=true chars=69 panelH=861
pos order=ok leadTop=284 firstScreen=true chars=84 panelH=1429
mp order=ok leadTop=284 firstScreen=true chars=70 panelH=1134
raim order=ok leadTop=284 firstScreen=true chars=74 panelH=1171
geo order=ok leadTop=284 firstScreen=true chars=91 panelH=799
atm order=ok leadTop=284 firstScreen=true chars=78 panelH=1198
cold order=ok leadTop=284 firstScreen=true chars=92 panelH=1814
pll order=ok leadTop=284 firstScreen=true chars=67 panelH=1665
consoleIssues=0
=== 980x900 ===
sky order=ok leadTop=199 firstScreen=true chars=77 panelH=949
ca order=ok leadTop=199 firstScreen=true chars=70 panelH=601
acq order=ok leadTop=199 firstScreen=true chars=69 panelH=696
pos order=ok leadTop=199 firstScreen=true chars=84 panelH=867
mp order=ok leadTop=199 firstScreen=true chars=70 panelH=649
raim order=ok leadTop=199 firstScreen=true chars=74 panelH=750
geo order=ok leadTop=199 firstScreen=true chars=91 panelH=716
atm order=ok leadTop=199 firstScreen=true chars=78 panelH=659
cold order=ok leadTop=199 firstScreen=true chars=92 panelH=1613
pll order=ok leadTop=199 firstScreen=true chars=67 panelH=1175
consoleIssues=0
```

结论：10/10 `order=ok`，420×844 下 10/10 `firstScreen=true`（leadTop 全部 284 < 844），两视口 consoleIssues=0。

### probe-chrome（原文输出）

```
W=360 {"h1":"GNSS 蜂群工作台","h1px":"17px","navH":63,"navRows":2,"btnH":30,"navFontPx":"12px","glossary":true,"glossaryClosedH":36,"glossaryOpen":false,"labH":1791,"docH":1831,"overflowX":false,"canvases":26,"canvZero":23} consoleIssues=0
W=420 {"h1":"GNSS 蜂群工作台","h1px":"17px","navH":63,"navRows":2,"btnH":30,"navFontPx":"12px","glossary":true,"glossaryClosedH":36,"glossaryOpen":false,"labH":1681,"docH":1721,"overflowX":false,"canvases":26,"canvZero":23} consoleIssues=0
W=768 {"h1":"GNSS 蜂群工作台","h1px":"17px","navH":70,"navRows":2,"btnH":33,"navFontPx":"14px","glossary":true,"glossaryClosedH":18,"glossaryOpen":false,"labH":1188,"docH":1228,"overflowX":false,"canvases":26,"canvZero":23} consoleIssues=0
W=980 {"h1":"GNSS 蜂群工作台","h1px":"17px","navH":33,"navRows":1,"btnH":33,"navFontPx":"14px","glossary":true,"glossaryClosedH":18,"glossaryOpen":false,"labH":1151,"docH":1191,"overflowX":false,"canvases":26,"canvZero":23} consoleIssues=0
W=1280 {"h1":"GNSS 蜂群工作台","h1px":"17px","navH":33,"navRows":1,"btnH":33,"navFontPx":"14px","glossary":true,"glossaryClosedH":18,"glossaryOpen":false,"labH":1105,"docH":1191,"overflowX":false,"canvases":26,"canvZero":23} consoleIssues=0
```

结论：5 个宽度全部 `overflowX=false`、`consoleIssues=0`。与基线 `qa/chrome.final14.txt` 对照：360/768/980/1280 labH 完全一致；420 宽 labH 1662→1681（+19 px，+1.14%，导语多折一行），低于 3% 上限。

### probe-layout2（高度对照基线 `qa/layout2.final8.txt`；溢出与控制台见 `layout2.out.txt` 原文）

| 面板 | 1280 基线→新 | 980 基线→新 | 420 基线→新 |
|---|---|---|---|
| sky | 903→903 | 949→949 | 1406→1406 |
| ca | 601→601 | 601→601 | 871→871 |
| acq | 676→676 | 696→696 | 861→861 |
| pos | 834→834 | 867→867 | 1429→1429 |
| mp | 631→631 | 649→649 | 1134→1134 |
| raim | 750→750 | 750→750 | 1153→1171 (+1.6%) |
| geo | 716→716 | 716→716 | 799→799 |
| atm | 634→634 | 659→659 | 1180→1198 (+1.5%) |
| cold | 1621→1603 (−1.1%) | 1631→1613 (−1.1%) | 1812→1814 (+0.1%) |
| pll | 1118→1118 | 1175→1175 | 1647→1665 (+1.1%) |
| **合计** | 8484→8466 (−0.21%) | 8647→8629 (−0.21%) | 10892→10948 (+0.51%) |

结论：10 页 × 3 宽度全部「溢出=否」、控制台问题 0 条；逐面板最大增幅 +1.6%（raim@420，读法多折一行），三宽度合计均远低 3% 上限。980 截图见 `review/kimi-C/layout/980-*.png`。

## 不变式自证（shell.html 层面）

- 读法标记计数：`grep 'gl-lead' shell.html | grep -o 先看` = 10，`grep -o 所以` = 10；12 个 `p.gl-lead` 段落（含 cold 页 2 段、pll 页载波平滑段 1 段，后两者本就不含这两个标记，改后仍不含）。
- 术语条数：`.gl-glossary` 内 `<li>` = 44（≥44）；全部 `<strong>` 词条与改前 diff 为空（一条未删、未改名）。
- 结构不变式：全部 `id="…"` diff 为空；全部 `class="…"` diff 为空；全部 `aria-*` diff 为空；全部 `role="…"` diff 为空。
- 数字漂移检查：对改前/改后全文抽取数字 token 排序比较，唯一差异是多出 1 个「30」（来自信噪比条目新句「−30 dB 以下」，该数值复用捕获页正文已有口径）；无任何既有数字被改动。
- 改动规模：`diff` 改前/改后 = 15 行对（30 行 < / > 标记），即上表 15 处。

## ④ 未验证边界（如实声明）

1. **`qa/check25.js` 未跑**：它需要连跑 5 次完整冷启动（每次数十秒到数分钟）且其 `PAGE_URL` 指向 `outputs/gnss-swarm-lab.html`（本次未改动的基线产物）；它唯一的文案断言针对运行时由 `app/80-coldstart.js` 生成的 `#gl-cold-detail` 文本（含「前端」「光滑丘」），该文件我未改动。本次只动静态文案，三条指定探针（leadfold/chrome/layout2）已全部实跑通过。
2. **折叠正文未读改**：各 `.gl-about` 内 `.gl-read` 长文本次一字未动，因此「完整读法（N 字，点开）」的字数标注仍然成立；若后续有人改正文，需同步更新字数。
3. **阅读体验是文案判断**：「更短更清楚」由改写自证（字数、控件名一致性），没有读者实测；raim/atm/pll 在 420 px 各多一行折行是已知代价（换更准确的操作指引）。
4. **「看双频反超」预设按钮的可发现性提升未做 A/B**，仅为文案指引。
5. 本次自测全部在 `review/kimi-C/standalone.html` 上进行；`outputs/` 产物由合并方统一重建，重建后建议按同三探针复跑一次。
