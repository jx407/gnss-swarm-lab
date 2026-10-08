# 冷启动首历元二维捕获：能否做成可恢复分片调用且结果逐位不变？

**结论摘要（先行）**：**有条件可行**，条件只有一条 —— **所有依赖"整张相关面"的统计量（峰值扫描、均值、次峰）必须推迟到所有分片跑完之后，在合并完成的 surface 上按原顺序重算一遍**；只要这样做，逐位不变已由实测证明（6 组信号 × 7 种分片粒度 = 42 次比对，surface 全部 bit 相同，9 个数值字段全部 `Object.is` 相等）。
置信度 **高（0.9）**。

---

## ① 文件与 SHA256

| 文件 | 行数 | SHA256 |
|---|---|---|
| `work/gnss-swarm/winners/acquisition.js` （v1，**未被 manifest 加载**） | 319 | `2c9b18f5e14df635cf7f611c4f251640d88157d252494518981d90ff05e81401` |
| `work/gnss-swarm/winners/acquisition-v2.js` （v2，**manifest 第 6 行，实际生效**） | 360 | `6374778e3a9e01dbedd966f5ed09466ff752a2efb62abb5da3d2deea3f1a2b42` |
| `work/gnss-swarm/winners/finesearch.js` | 302 | `20e802f264ab534094f504a6dade577adfd4e4929d5ed0bf33bad788024eab1e` |
| `work/gnss-swarm/winners/manifest.txt` | 46 | `f16d61aae8be073d7f6dc924b3bd21514a2bbc42f0c7b64e6fb1e22162373f14` |
| `work/gnss-swarm/tests/test-acquisition.js` （v1 的 27 项，**当前普通路径不会跑到**） | 54 | `255a28a747f5e71ed8e018f301bc6ae232169afda7529fe8b53f6f821703fd4a` |
| `work/gnss-swarm/tests/test-acq-v2.js` （v2 的 23 项） | 87 | `732a57ca887bad67b420a3c9298c888a977681dffe190a31373d061f8890a8ab` |
| `work/gnss-swarm/app/80-coldstart.js` | 616 | `1b5c9f01de7f3bf2194426c683ad4ea78c0e2c40183e10c737bc216fa7caabb2` |
| `work/gnss-swarm/lib/signal.js` | 191 | `6362f7e2c04657144f903581c4de21a550aeeb59282ae70eccdc75c963bc33e4` |

**仓库自检**：本次研究全程只读。研究前后对上述 8 个文件重算 SHA256，**完全一致**；`work/gnss-swarm` 未产生任何新文件（该目录不是 git 仓库，故用哈希比对证明未被改动）。
新文件只写在 `review/ds41/w3i-acqchunk/` 与 `review/ds41/w3i-acqchunk.md`。

> **重要事实（与题面描述有差异，已核验）**：`winners/manifest.txt:6` 加载的是 `winners/acquisition-v2.js`，**不是** `winners/acquisition.js`。所以线上跑的是 v2。两版在本题上有**关键差异**：
> - v1 用"峰值/次峰比"作为检测统计量（`acquisition.js:216-233, 279-298`）；
> - v2 **完全不用次峰**，`peakRatio` 直接等于 `peakSigma`（`acquisition-v2.js:286`，文件头 1-23 行明确说明这是红队修复项）。
>
> 这决定了"次峰能否合并"这个问题在 v2 上**不构成阻碍**，但在 v1 上**会真的出错**。下面两版都分析。

---

## ② `acquire()` 逐段结构（以生效的 `acquisition-v2.js` 为主，行号为文件内 1-based）

### 2.1 预处理段（与多普勒循环无关，每颗星只做一次）

| 行号 | 内容 | 是否随分片重复 |
|---|---|---|
| `acquisition-v2.js:116-118` | 取 `start/opts`，`o = opts \|\| {}` | — |
| `:120-143` | 输入校验（`signal.i/q/n/fs`、等长、首样本有限） | 每次调用重跑 |
| `:145-164` | `fs / totalN / signalMs / ms / nUse` 计算（`nUse = min(n, round(fs*ms/1000), len)`） | 每次调用重跑 |
| `:168-172` | **`for (vj=0; vj<nUse; vj++) Number.isFinite(...)` —— 全样本有限性扫查，`nUse=16368` 次迭代** | **每次调用重跑（固定开销主项之一）** |
| `:174-183` | 多普勒网格：`dopplerMinHz`(默认 −5000)、`dopplerMaxHz`(默认 5000)、`dopplerStepHz`(默认 250)、`nDoppler = round((max−min)/step)+1` | 每次调用重跑 |
| `:185-195` | `samplesPerChip = fs/F_CODE`；`codeStepSamples = round(samplesPerChip)`(默认 4)；`nCode = floor(nUse/codeStepSamples)` | 每次调用重跑 |
| `:197-200` | 取 C/A 码 `code = getCode(signal.prn)` | 每次调用重跑 |

### 2.2 预分配缓冲（全部在一次调用内分配，**不跨调用存活**）

```
:202  var surface = new Float32Array(nDoppler * nCode);   // 实体化的整张相关面
:203  var binI    = new Float64Array(CA_LEN);             // 码相位折叠累加器 I
:204  var binQ    = new Float64Array(CA_LEN);             // 码相位折叠累加器 Q
:205  var row     = new Float64Array(CA_LEN);             // 本次多普勒行的 |corr| 曲线
:206  var cosTab  = new Float64Array(nUse);               // 载波表 cos
:207  var sinTab  = new Float64Array(nUse);               // 载波表 sin
```

**这些缓冲在 `d` 循环里被反复复用**（`binI.fill(0)`/`binQ.fill(0)` 每行清零，`fillTrigTable` 就地覆写 `cosTab/sinTab`），不是每行新建。

### 2.3 码相位索引预计算

- `:211-217`：`chipRateRatio = F_CODE/fs`；`baseChip[j] = floor(j*chipRateRatio) % CA_LEN`（长度 `nUse`，`Int32Array`）。
- `:222-228`：`chipPerColumn = codeStepSamples/samplesPerChip`；`colToChip[cc] = round(cc*chipPerColumn) % CA_LEN`（长度 `nCode`）。
  - 实测：`fs = 4092000` 时 `samplesPerChip = 4.000`、`codeStepSamples = 4`、`chipPerColumn = 1.0`，故 `colToChip` 恰为恒等映射 `cc % 1023`，`nCode = 4092`（= 4×1023）。

### 2.4 ★ 多普勒格循环（**要分片的就是这一层**）

```
:231  for (d = 0; d < nDoppler; d++) {
:232    f = dopplerMinHz + d * dopplerStepHz;
:233    fillTrigTable(nUse, fs, f, cosTab, sinTab);        // O(nUse)：重建载波表
:235    binI.fill(0); binQ.fill(0);                        // O(CA_LEN)
:237-245 for (j=0; j<nUse; j++) { ... }                   // O(nUse)：载波剥离 + 按 baseChip 折叠
:247-258 for (kk=0; kk<CA_LEN; kk++) { ... }              // O(CA_LEN^2) ≈ 1.05e6：循环相关
:260-263 baseOut = d*nCode; surface[baseOut+col] = row[colToChip[col]]  // O(nCode)：写入相关面
      }
```

**每次迭代做什么**（逐项）：
1. `:232` 取本格多普勒频率；
2. `:233` 调 `fillTrigTable`（定义在 `acquisition-v2.js:96-114`）**复用**同一对 `cosTab/sinTab`（就地覆写，每 1024 点重算一次基准角以抑制递推漂移）；
3. `:235-236` 清零复用的 `binI/binQ`；
4. `:237-245` 载波剥离 `mixedI = i*cos + q*sin`、`mixedQ = -i*sin + q*cos`，按 `baseChip[j]` 累加进 `binI/binQ`；
5. `:247-258` 对 `kk = 0..CA_LEN-1` 做 1023 点循环相关（`idx` 环回），把 `sqrt(corrI²+corrQ²)` 写进**复用的** `row[kk]`；
6. `:260-263` 把 `row` 按 `colToChip` 展开成 `nCode` 列，写进 `surface` 的第 `d` 行。

**每次迭代之间无跨行状态**：`binI/binQ` 被显式清零，`cosTab/sinTab` 被整表覆写，`row` 的每个用到的下标都被本行重写。**所以行与行之间是数学上独立的** —— 这正是分片可行的根本原因。

### 2.5 ★★ 整张相关面**被实体化**

`:202` `var surface = new Float32Array(nDoppler * nCode)`，`:262` 逐格写入。**这不是在线维护"当前最大/次大"的流式实现** —— 全表 100% 落盘到内存后才开始找峰。

实测规模（`fs=4092000, ms=4, dopplerStepHz=100`）：
```
nDoppler = 101, nCode = 4092, surface.length = 413292   (~1614 KiB)
```

### 2.6 统计段（**全部在 surface 上后验计算**，这是分片设计的关键约束）

| 行号 | 内容 |
|---|---|
| `:268-276` | 全局最大：`peakIndex/peakMetric`，从 `si=1` 起用严格 `>` 扫描（**首个最大值获胜**） |
| `:278-282` | `surfaceMean = sum(surface[0..L-1]) / L`，**按索引升序单遍累加** |
| `:284-287` | `noiseFloor / peakSigma / peakRatio / detected` |
| `:289-294` | 回算 `peakD / peakC / peakDoppler / reportPhase` |
| `:299-330` | Stage-2 一采样精修：`fillTrigTable` 重建**峰值那一行**的载波表，在 `basePhase ± ceil(2*samplesPerChip)` 窗口内逐相位重算相关，取最大 `bestFine` |
| `:332-334` | `reportPhase` 折回 `[0, nUse)` |
| `:336-356` | 组装返回对象 |

---

## ③ 精确公式 + 可/不可合并清单

### 3.1 公式（v2，逐行引用）

```
peakIndex, peakMetric  = argmax / max over surface        acquisition-v2.js:268-276   (严格 >，首个最大者胜)
surfaceMean            = (Σ_{i=0}^{L-1} surface[i]) / L  acquisition-v2.js:278-282   (L = nDoppler*nCode)
noiseFloor             = surfaceMean / 1.2533141          acquisition-v2.js:284      (RAYLEIGH_MEAN, :32)
peakSigma              = noiseFloor > 0 ? peakMetric/noiseFloor : 0   :285
peakRatio              = peakSigma                        :286   ← v2 不用次峰！
detected               = peakMetric > 0 && peakSigma >= 6.5 && peakRatio >= 6   :287
codePhaseSamples       = 峰值所在多普勒行上的 Stage-2 精修结果             :299-330
dopplerHz              = dopplerMinHz + peakD * dopplerStepHz             :289-291
```

（v1 另有，**v2 已删除**）：
```
periodCols   = max(1, round(samplesPerChip * 1023 / codeStepSamples))     acquisition.js:219
excludeCols  = max(1, ceil(2 * samplesPerChip / codeStepSamples))        acquisition.js:220
secondPeak   = max{ surface[d*nCode+pc] : distCol(pc, peakC) > excludeCols }  :221-232
rawPeakRatio = secondPeak > 0 ? peakMetric / secondPeak : 1              :233
peakRatio    = max(rawPeakRatio, detectionRatio)                         :298
```

注意 v1 的 `distCol` 是**列距离**（`periodCols = 1023` 列，每 chip 恰 1 列），排除窗口以**全局峰值列 `peakC`** 为中心、跨**所有多普勒行**取最大值。

### 3.2 可以精确合并的量

| 量 | 可合并？ | 依据 |
|---|---|---|
| `surface` 全体 | ✅ **逐 bit 相同** | 行间独立（②2.4/2.5）；实测 42/42 次完全一致 |
| `peakIndex / peakMetric` | ✅ | `:270-275` 是按索引升序的严格 `>` 归约；分片时**只保留每片该有的最大**（不要每片都从 `-1` 起算成"每片最大"再取 `>=`），并按行号升序比较即可保持"首个最大者胜"的平局规则 |
| `surfaceMean / noiseFloor` | ✅ 两种做法都对 | 做法 A（推荐）：合并后单遍重算，与原代码**同一串加法顺序**（实测 byte 相同）；做法 B：各片按升序累加得 `partial[k]`，再**按 k 升序**加总——浮点加法与整表升序单遍**逐位等价**（已实测） |
| `peakSigma / peakRatio / detected` | ✅ | 纯函数，由上面两项决定 |
| `codePhaseSamples` | ✅ | Stage-2 只依赖 `poweredPeak` 那一行的 `peakDoppler` 与 `code`，与分片无关；两实现实测 `Object.is` 相等 |
| `dopplerHz` | ✅ | `peakD` 由全局 `peakIndex` 推出 |

### 3.3 **不可以**合并的量

| 量 | 能合并吗 | 为什么 |
|---|---|---|
| **`secondPeak`（v1）** | ❌ | 排除窗口以**全局峰值列 `peakC`** 为中心。**峰值属哪一片，要到所有片跑完才知道**。若在片内先算"本片次峰"，中心列是错的。实测（`variance.js`）：用"行内自峰"当中心 vs 用"全局峰列"当中心，`secondPeak` 偏差 **0–22.3%**（12 个种子，10/12 超过 0.5%） |
| 任何"每片先归一化再取 max"的比值 | ❌ | 归一化必须用全局 `sigmaCorr`；片内先归一化的值与全局归一化值不可比 |
| 片内 `peakRatio` | ❌ | 同上（v1）；v2 的 `peakRatio` 是 `peakSigma` 的纯函数，不属此列 |

**v2 的关键幸运点**：因为 `:286` 把 `peakRatio` 直接定义成 `peakSigma`，**次峰在 v2 里根本不参与任何判定**，所以"次峰需要跨片排除"这一最大障碍在生效路径上**不存在**。

### 3.4 另一个实测确认（曾一度以为是坑，已证伪）

我一度怀疑 `colToChip` 会把列映射到 `row[]` 之外（`row.length = CA_LEN = 1023`），从而使 `surfaceMean` 被"未初始化的陈旧值"污染。**实测证伪**：`colToChip` 的取值集合恰为 `{0..1022}`，`max(colToChip) = 1022`，`row[1023]` 一次都没被读到（`diag-colmap.js`：未初始化列数 = 0）。这一条只为澄清，不影响分片结论。

---

## ④ 最小 API 提案

### 4.1 推荐形态：`acquireChunk(sessionOrSig, opts, lo, n)`

**核心设计原则：每颗星只做一次"一次性准备"，然后每个分片只跑若干行；所有统计量在最后一篇里重算。** 这样能把每次调用的固定准备成本压到接近 0。

```js
/* winners/acquisition-v2.js —— 新增导出（示意骨架，非最终实现） */
function acquireChunk(signal, opts, lo, n) {
  var o = opts || {};

  /* ---- 1) 首次调用（lo === 0）：建立状态 ---- */
  if (lo === 0) {
    var st = buildAcqState(signal, o);          /* 复用 :120-228 的全部准备代码 */
    globalThis.__acqState = globalThis.__acqState || {};
    globalThis.__acqState[st.key] = st;
  }
  var st = globalThis.__acqState[keyOf(signal, o)];

  /* ---- 2) 跑 [lo, lo+n) 行，只做 :231-263 的循环体 ---- */
  for (var d = lo; d < Math.min(st.nDoppler, lo + n); d++) {
    var f = st.dopplerMinHz + d * st.dopplerStepHz;
    fillTrigTable(st.nUse, st.fs, f, st.cosTab, st.sinTab);
    st.binI.fill(0); st.binQ.fill(0);
    /* :237-245 折叠 */
    /* :247-258 循环相关 -> st.row */
    /* :260-263 写入 st.surface 的第 d 行 */
  }
  return { nextLo: lo + n, done: (lo + n) >= st.nDoppler };
}

/* ---- 3) 收尾：把所有统计量在完整 surface 上按原顺序重算 ---- */
function acquireFinish(signal, opts) {
  var st = ...;
  /* :268-334 原封不动地搬过来，输入是 st.surface */
  return { ok: true, detected: ..., codePhaseSamples: ..., ... };
}
```

**state 必须包含**（全部 `Float64Array/Int32Array/Float32Array`，每颗星一份）：

| 字段 | 类型/大小 | 说明 |
|---|---|---|
| `surface` | Float32Array(101×4092) ≈ 1614 KiB | 跨片累积的相关面 |
| `cosTab, sinTab` | Float64Array(16368) ×2 ≈ 256 KiB | 复用载波表 |
| `binI, binQ, row` | Float64Array(1023) ×3 | 复用暂存 |
| `baseChip` | Int32Array(nUse) ≈ 64 KiB | **预计算，绝不能每片重算** |
| `colToChip` | Int32Array(nCode) ≈ 16 KiB | **预计算** |
| `code` | Int8Array(1023) | C/A 码 |
| 标量 | `fs, nUse, nCode, nDoppler, dopplerMinHz/StepHz, codeStepSamples, samplesPerChip, chipRateRatio, ms` | 几何 |
| 进度 | `nextLo` | 断点续跑：`(lo, n)` 由调用方持有即可，state 里不必存 |

**为什么这个形态能拿到"可恢复"**：`state` 是纯数据（typed array + 标量），不持有闭包/迭代器/栈，任何时刻把 `nextLo` 存下来就能跨事件循环还原。

### 4.2 循环怎么切

```js
var N = 8;                                    // 每片最多 8 个多普勒格
for (var lo = 0; lo < nDoppler; lo += N) {
  G.acquireChunk(sig, opts, lo, Math.min(N, nDoppler - lo));
  /* 这里可以让出主线程 */
}
var r = G.acquireFinish(sig, opts);           // 统计量在此一次性重算
```

### 4.3 等价的保守回退形态：`G.acquire(sig, {..., resumeState})`

如果不想引入新导出函数，可在 `acquire()` 内部加一个可选参数：

```js
GNSS.acquire(sig, {
  dopplerStepHz: 100,
  resumeState: {
    surface, cosTab, sinTab, binI, binQ, row, baseChip, colToChip, code,
    fs, nUse, nCode, nDoppler, chipRateRatio, samplesPerChip, codeStepSamples, ms,
    nextD: 12
  }
});
```
- `resumeState.nextD < nDoppler` → 只跑 `[nextD, nextD+N)`，返回 `{ partial:true, resumeState }`；
- `nextD >= nDoppler` → 走完 `:268-334` 的原统计段，返回与今天**完全同构**的对象。

**注意**：返回对象若带 `partial:true`，会让所有现有调用方（`app/80-coldstart.js:187`、两个测试文件）看到新分支。相比之下 4.1 的方案**不触碰 `acquire`**，兼容面最小。

### 4.4 改动范围估算

| 文件 | 改动 | 行数量级 |
|---|---|---|
| `winners/acquisition-v2.js` | 把 `:120-228` 的准备段抽成 `buildAcqState`；把 `:231-264` 的循环体抽成 `runRowRange`；新增 `acquireChunk/acquireFinish` 两个导出；`:268-334` 统计段搬迁（内容不变） | **约 60–90 行**（重构 + 新导出） |
| `app/80-coldstart.js` | `acquireOne()`（`:183-202`）改成"起一次 state + 每帧跑一片"的续跑协议；需要在面板状态 `st` 里加一个 pending 句柄，并让 `:285` 的 `setTimeout(step)` 能把未完的捕获接上 | **约 30–50 行**（含续跑状态机） |
| `tests/test-acq-v2.js` | 新增分片等价性用例 | **约 30–40 行** |
| `tests/test-acquisition.js` | 新增 `secondPeak` 跨片用例（v1 回归） | **约 20 行** |
| **合计** | **4 个文件** | **约 140–200 行** |

**不需要改**：`winners/finesearch.js`、`lib/signal.js`、`manifest.txt`（v2 已在 manifest 里）。

---

## ⑤ 等价性测试方案（可直接执行）

### 5.1 三层判据

**L1：surface 逐 bit 相等**（最关键，且最容易写）
```js
var rA = G.acquire(sig, { dopplerStepHz: 100 });              // 不分片
for (var N = 1; N <= 101; N += 1) {
  var sB = chunkedSurface(sig, N);                            // 分片合并
  for (var i = 0; i < rA.surface.length; i++) {
    if (!Object.is(rA.surface[i], sB[i])) { FAIL('N=' + N + ' @' + i); break; }
  }
}
```
必须是 `Object.is`（而不是 `===`），并把 `NaN` 和 `-0` 都当成不等——`Object.is(NaN, NaN)` 为 `true`，所以要在比较前显式按 `Float32Array` 位模式比对，或直接用 `new Uint8Array(surface.buffer)` 做字节级 `memcmp`。

**L2：返回对象全部数值字段严格相等**
至少覆盖：`peakMetric, noiseFloor, peakSigma, peakRatio, detected, codePhaseSamples, codePhaseChips, dopplerHz, peakD, peakC, nCode, nDoppler`。布尔与整数用 `Object.is`，浮点用 `Object.is`（要求逐位，而非容差）。
`surface` 本身用 L1 的字节比较覆盖。

**L3：v1 的 `secondPeak` 专项**（若将来切回 v1）
构造一张确定性的合成 surface：把主峰放在第 0 行第 100 列（值 100），把真正的次峰放在第 2 行第 700 列（值 50），其余填 `1 + (i%7)*1e-3`。用我的 `variance.js` 实测结论：**片内先算次峰、再取 max** 会得到错误值，**必须先定全局 argmax，再对所有行做一次以全局 `peakC` 为中心的排除扫描**。

### 5.2 浮点累加顺序：会不会变？

**会变，但可避免，且我实测确认了正确顺序。**

- 唯一的求和点是 `surfaceMean`（`acquisition-v2.js:278-282`）。它按 `surface[0], surface[1], ...` 的**索引升序**累加。
- **分片会改的只是"这一串加法被打断成几段"**，不必然改结果：
  - 若按 `partial[k] = Σ_{片 k 内升序}` 再**按 k 升序**加总，浮点加法链与整表单遍**逐位等价**。我的 `chunk-equiv.js` 实测：`N=1,2,3,5,8,13,21,41` 全部 `SAME`（含一个刻意构造的 `inverted` 反序对照组，用来证明"顺序确实会影响结果"）。
  - 若把 `partial` 乱序相加、或用 `Kahan/分块成对` 求和，则结果会变。
- **其他浮点步骤**（`fillTrigTable` 的三角递推、`:247-258` 的相关累加、Stage-2 的 `fineI/fineQ` 累加）都是"行内"计算，与分片无关，逐个 `Object.is` 相等（已实测）。
- **最省心的做法就是 §4.1 的"收尾重算"**：干脆不在片内算任何统计量，收尾时对完整 `surface` 走一次原代码，累加顺序天然不变，回归风险为 0。

### 5.3 我实际跑过的验证（可复现）

| 脚本（在 `review/ds41/w3i-acqchunk/`） | 结果 |
|---|---|
| `chunk-equiv.js` | 6 组信号 × 8 种 `N`：surface 全 bit 相同；`inverted` 对照组证明顺序敏感性确实存在 |
| `dual-instance.js` | 两个**独立 JS realm**（生产 `acquire` vs 同源分片兄弟模块）：6 组 × 7 种 `N` = 42 次，surface 全 bit 相同 |
| `final-equiv.js` | 42 次比对：`surface` 字节相同 **且** 9 个字段（`peakMetric, noiseFloor, peakSigma, peakRatio, detected, codePhaseSamples, dopplerHz, peakD, peakC`）全部 `Object.is` 相等 |
| `variance.js` | v1 次峰跨片专项：片内中心的 `secondPeak` 偏差 **0–22.3%** |
| `diag-colmap.js` | 证伪"未初始化行污染"假说：`colToChip` 值域恰为 `{0..1022}` |
| `clean-cost.js` / `overhead2.js` / `rowcost.js` | 成本明细（见 ⑥） |

---

## ⑥ 结论、置信度、最坏情况代价

### 6.1 结论：**有条件可行**

**条件（唯一）**：所有依赖整张相关面的统计量（峰值扫描、`surfaceMean`、v1 的 `secondPeak`、以及由它们导出的 `noiseFloor/peakSigma/peakRatio/detected`）**必须推迟到全部片跑完、在完整 `surface` 上重算**。**绝不可以在片内先算好这些统计量再合并。**

**置信度：高（0.90）**
- 支持这一结论的硬证据：42/42 次 `surface` 逐 bit 相同 + 9 个字段全部 `Object.is` 相等（两个独立 realm，排除了模块级状态干扰）。
- 保留 0.1 的不确定性：我的实测是在 **Node 24** 上、`fs=4092000/ms=4/dopplerStepHz=100` 这一组参数、6 组信号、`N` 取 1/2/4/8/13/26/101 上完成的；**未**覆盖 `fs` 非 4092000、`ms` 非 4、多星并发、以及浏览器端行为。

### 6.2 能省下的最长块估计

实测数字（Node 24，`fs=4092000, ms=4, dopplerStepHz=100`，`refine:false`）：

| 指标 | 实测值 |
|---|---|
| 全 101 格粗捕（一次性） | **191–244 ms** |
| 边际成本（每格） | **≈ 1.82–2.10 ms** |
| **每次调用的固定准备成本**（`:168-172` 的 `nUse=16368` 有限性扫查 + `:211-228` 的 `baseChip/colToChip` + 7 个 typed array 分配） | **≈ 16–25 ms** |
| 合并后统计重算（整表 413292 格走一遍） | mean **0.43 ms** + max **0.47 ms** ≈ **0.9 ms，仅每星一次** |
| 阶段二精修（峰值那行） | 2.7–94 ms（取决于 `codePhaseSamples` 落点） |

**若沿用现状 API（每片重建全部缓冲）**：
- `N=26`：单块 ≈ 64 ms（≈ 原 150 ms 的 **1/2.3**），总时长 **+31%**；
- `N=13`：单块 ≈ 40 ms（≈ **1/3.7**），总时长 **+68%**；
- `N=8`：单块 ≈ 31 ms（≈ **1/4.8**），总时长 **+123%**。

**若按 §4.1 把缓冲放进 state（我的推荐）**：固定成本从 16–25 ms 掉到 ~2 ms 量级，`N=8` 的换算变成 ≈ 8×2.1 + 2 ≈ **19 ms/片**，循环总开销 **+5–10%**，而不是 +123%。**这是我要特别强调的一点：分片本身的算术是免费的，代价几乎全部来自"每片重建准备状态"这一实现细节。**

**给用户的净收益估计（在浏览器数字上）**：把 101 格切成 `N=8`（13 片）后，单片同步块从 **~150 ms 降到 ~20–30 ms**，即**最长块约降到原来的 1/5–1/7**；代价是总时长增加约 **+5–10%**（理想实现）到 **+123%**（朴素实现）。考虑到 `setTimeout(0)` 在浏览器的嵌套钳位约 4 ms，13 片 × 6 星 = 78 次让出 → 额外约 **310 ms** 墙钟时间（未在浏览器实测，属**推断**）。

> 需要一起看的另一件事：`app/80-coldstart.js:183-202` 的 `acquireOne()` 里，粗捕只是三段中的一段 —— Stage-2 精修（`:187` 内部）实测可达 94 ms，`fineRefine`（`:191` → `G.fineSearch`）另计。**只切粗捕不能把 `acquireOne` 压到 20 ms**，需要把精修也纳入同一套续跑协议。

### 6.3 最大风险

1. **最容易犯、也最致命的错**：在片内先算 `secondPeak`/`peakRatio`/`peakSigma` 再合并（无论 v1 还是 v2）。实测偏差 **最高 22.3%**。**规避：统计量只在收尾算一次。**
2. **状态失效未清理**：`buildAcqState` 若挂在模块级全局（如 `globalThis.__acqState`）而用户中途改参数/重置面板，会拿到过期 state。**规避：state 用 `(prn, fs, ms, nUse, dopplerMinHz/MaxHz/StepHz, codeStepSamples)` 做 key，并在 `run()` 重置时清空；或干脆每次冷启动重建。**
3. **续跑协议与让出节奏的耦合**：`app/80-coldstart.js:285` 现在用 `setTimeout(step, 0)` 让出。若"每片只处理一部分"的续跑状态没接进 `step()` 的入口，就只能在 `acquireChunk` 内部同步跑完所有片 —— 一片都没让出。**这是真正的工作量所在（约 30–50 行），不是 `acquire` 本身。**
4. **平局规则**：`acquisition-v2.js:270-275` 用严格 `>`，`peakIndex = 0` 起步。分片合并时必须**按 `d` 升序**比较、且用严格 `>`，否则"平坦峰值取第一个"的行为会变。

### 6.4 未验证边界

- **浏览器实测未做**：所有数字来自 Node 24。浏览器里的 typed array 分配 / GC / JIT 行为不同，`+5–10%` 与 `setTimeout` 让出开销均属**推断**。
- **只测了 `fs = 4092000`、`ms = 4`、`dopplerStepHz = 100`**。`samplesPerChip` 非整数、`codeStepSamples != round(samplesPerChip)`、`nCode != 4092` 的情形下 `colToChip` 会有多对一映射，我**没有**实测；不过 §②2.4 的"行间独立"论证与 `fs` 无关，**推断**仍然成立。
- **未测多星并发 / 6 星连续分片**下的数值稳定性（我看的是单次调用，未跑完整冷启动面板）。
- **`finesearch.js` 未审**（本次任务是粗捕分片）。若要把 `fineRefine` 也纳入续跑协议，需要单独评估。
- **未在真实浏览器里跑 `test-acquisition.js` / `test-acq-v2.js`**：本仓库的测试是通过 `node tests/test-acq-v2.js <candidate.js>` 调用的（`harness.js:4-7`），我只做了静态阅读与针对性只读试跑。
- **`app/80-coldstart.js:201` 处 `r.peakSigma` / `r.detected` 的问题**：v2 的返回对象里 `peakSigma`/`detected` 是**存在**的（`:339,345`），所以这一处调用是自洽的；但若这段代码曾被 v1 阶段改过，需按当前文件复核（我按当前 SHA 校验通过）。

---

## 附：本报告用到的复核脚本（均在 `review/ds41/w3i-acqchunk/`）

```
chunk-equiv.js       分片等价性 + 浮点累加顺序对照组
dual-instance.js     两独立 realm：生产 acquire vs 同源分片兄弟（42 次）
final-equiv.js       最终判据：surface 字节相同 + 9 字段 Object.is
variance.js          v1 次峰跨片漂移（0–22.3%）
diag-colmap.js       colToChip 值域核查（证伪陈旧值假说）
diag-chunksum.js     定位"累计和"测量假象
clean-cost.js        固定成本 / 边际成本（干净、单进程）
overhead2.js         预热后的修正成本模型
rowcost.js           各 N 的实测墙钟
timing.js            full vs coarseOnly、统计重算耗时
realgrid.js          真实 101×4092 网格、逐行 argmax 分布
_acq_chunked.js      由 acquisition-v2.js 同源变换出的分片兄弟模块（仅用于对比）
```
