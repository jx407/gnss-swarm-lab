# ds4.1 只读审计：第二浏览器引擎/发行版可用性验证

- 审计日期：2026-10-07（Asia/Shanghai）
- 受审页面：`D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html`
- 页面 URL：`file:///D:/codex/2026-10-05/new-chat/outputs/gnss-swarm-lab.html`
- 页面性质：独立 HTML、`file://` 直开、纯本地；本轮未执行安装或下载命令。
- 审计方式：Node/Playwright 只读探针；viewport 1600×900；light 主题；deviceScaleFactor=1。
- 证据文件：
  - `review/ds41/w3c-browser/browser-probe.json`
  - `review/ds41/w3c-browser/browser-probe-additional.json`
  - `review/ds41/w3c-browser/browser-compare.js`
  - `review/ds41/w3c-browser/comparison.json`
  - `review/ds41/w3c-browser/comparison.stdout.txt`

## ① 页面 SHA-256 绑定

审计前：

```text
90d7b1763858988055b546a55b22da0c6119c86c9c4b070ecdb27221bb83bbce
```

三套浏览器探针启动前/全部结束后，探针再次计算：

```text
sha256Initial = 90d7b1763858988055b546a55b22da0c6119c86c9c4b070ecdb27221bb83bbce
sha256Final   = 90d7b1763858988055b546a55b22da0c6119c86c9c4b070ecdb27221bb83bbce
sha256Unchanged = true
```

结论：报告绑定的页面在本次审计期间未变化。

## ② 本机浏览器探测

### 2.1 按指定路径探测

Node 使用 `fs.existsSync()` 探测；存在的文件再由 `child_process.spawnSync(path, ['--version'])` 调用。

| 类型 | 路径 | 存在 | 原始结果 |
|---|---|---:|---|
| Edge | `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` | 是 | status=0；stdout=`正在现有浏览器会话中打开。\r\n`；stderr=空 |
| Edge | `C:\Program Files\Microsoft\Edge\Application\msedge.exe` | 否 | 不适用 |
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe` | 是 | status=0；stdout=`正在现有的浏览器会话中打开。\r\n`；stderr=空 |
| Chrome | `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe` | 否 | 不适用 |
| Firefox | `C:\Program Files\Mozilla Firefox\firefox.exe` | 否 | 不适用 |

**重要限制：** 在本机当前 Windows 登录会话中，Edge/Chrome 的 `--version` 没有返回版本号，只把命令转发到现有浏览器会话。因此“原始 `--version` 输出”不能作为版本证据；下面的版本来自 exe 的文件元数据，标记为补充探测，而不是伪装成 `--version` 输出。

补充文件版本：

```text
Path           : C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
FileVersion    : 149.0.4022.52
ProductVersion : 149.0.4022.52
ProductName    : Microsoft Edge

Path           : C:\Program Files\Google\Chrome\Application\chrome.exe
FileVersion    : 154.0.8037.58
ProductVersion : 154.0.8037.58
ProductName    : Google Chrome
```

### 2.2 隔离 profile 重试的原始行为

为避免误读“现有会话”提示，曾用新的 `--user-data-dir` 重试 `--version`。结果是浏览器被实际启动，20 秒后被探针以 SIGTERM 终止，仍未打印版本：

- Edge：`status=null`、`signal=SIGTERM`、`error=Error: spawnSync ... ETIMEDOUT`；stderr 原文首段：

```text
[11068:70224:1007/020402.868:ERROR:chrome\browser\task_manager\providers\fallback_task_provider.cc:126] Every renderer should have at least one task provided by a primary task provider. If a "Renderer" fallback task is shown, it is a bug. If you have repro steps, please file a new bug and tag it as a dependency of crbug.com/40528867.
```

- Chrome：`status=null`、`signal=SIGTERM`、`error=Error: spawnSync ... ETIMEDOUT`；stderr 原文包含：

```text
[62756:22096:1007/020422.496:ERROR:google_apis\gcm\engine\registration_request.cc:291] Registration response error message: DEPRECATED_ENDPOINT
Created TensorFlow Lite XNNPACK delegate for CPU.
[62756:31608:1007/020434.629:ERROR:chrome\updater\ipc\update_service_dialer_win.cc:75] Failed to open named pipe server process 10576: 拒绝访问。 (0x5)
```

说明：上述重试是 `--version` 在 Windows 上被误当成启动参数这一探测事实的原始证据；探针没有执行安装或下载命令。之后 Playwright 正式对比均设置了 `--disable-background-networking`、`--disable-component-update`、`--disable-sync`、`--no-first-run`。

### 2.3 Firefox 与 PATH 补充检查

未发现 Program Files 的 Firefox；再检查常见 x86/用户目录也为否：

```text
C:/Program Files/Firefox/firefox.exe                          false
C:/Program Files (x86)/Mozilla Firefox/firefox.exe            false
C:/Users/31040/AppData/Local/Mozilla Firefox/firefox.exe      false
```

`where.exe` 检查：

```text
msedge.exe  status=1  stderr="信息: 用提供的模式无法找到文件。\r\n"
chrome.exe  status=1  stderr="信息: 用提供的模式无法找到文件。\r\n"
firefox.exe status=1  stderr="信息: 用提供的模式无法找到文件。\r\n"
```

这里不矛盾：Edge/Chrome 存在于固定安装路径，但未加入 PATH。最终判定：**本机没有 Firefox 可执行文件，因此 Firefox 未验证；没有执行 Firefox 启动。**

## ③ 逐项对比表

三套均通过 Playwright 成功启动：

| 项 | 自带 Chromium | Microsoft Edge | Google Chrome |
|---|---:|---:|---:|
| 浏览器版本 | 151.0.7922.34 | 149.0.4022.52 | 154.0.8037.58 |
| 启动方式 | Playwright bundled Chromium | `channel: 'msedge'` | `channel: 'chrome'` |
| 启动成功 | 是 | 是 | 是 |
| fatalError | null | null | null |
| console error 数 | 0 | 0 | 0 |
| console warning 数 | 0 | 0 | 0 |
| pageerror 数 | 0 | 0 | 0 |
| requestfailed 数 | 0 | 0 | 0 |
| load 事件（ms） | 66.10000014305115 | 102.0 | 513.5 |
| 首次 rAF（ms） | 68.20000004768372 | 103.70000001430511 | 514.2000000476837 |
| first-paint（ms） | 84 | 504 | 648 |
| first-contentful-paint（ms） | 84 | 504 | 648 |
| 打开成功的标签页 | 10/10 | 10/10 | 10/10 |
| canvas 总数 | 26 | 26 | 26 |
| 零尺寸 canvas | 0 | 0 | 0 |
| 像素读取成功 | 26 | 26 | 26 |
| 像素读取错误/未验证 | 0 | 0 | 0 |
| 非空白 canvas | 26 | 26 | 26 |
| 空白 canvas | 0 | 0 | 0 |
| 横向溢出 | false | false | false |
| `#gl-sky-pdop` | `2.81` | `2.81` | `2.81` |
| `#gl-cold-err` | `—` | `—` | `—` |

原始尺寸/溢出值：

| 项 | 自带 Chromium | Edge | Chrome |
|---|---:|---:|---:|
| `documentElement.scrollWidth` | 1600 | 1600 | 1600 |
| `documentElement.clientWidth` | 1600 | 1600 | 1600 |
| `body.scrollWidth` | 1600 | 1600 | 1600 |
| `body.clientWidth` | 1600 | 1600 | 1600 |

### 方法定义

- load 事件耗时：`performance.getEntriesByType('navigation')[0].loadEventEnd - navigationStart`。
- 首帧：同时记录 addInitScript 的首个 `requestAnimationFrame`、`first-paint`、`first-contentful-paint`；没有只用“首帧”一个模糊值。
- 标签页打开：点击 `#gl-tab-<name>` 后，要求 `aria-selected="true"` 且对应 panel display 非 none、尺寸大于 0.5px。
- canvas 非空白：对 canvas 执行 `getImageData()`，以不超过 64×64 的网格采样；4-bit RGBA 组合去重后 `distinctColors4bit > 1` 才算非空白。此规则可识别“透明/单色空画布”，但不能证明图像语义正确。
- 横向溢出：`documentElement.scrollWidth > documentElement.clientWidth`。

### canvas 逐项结果

三种浏览器都得到同一组 26 个 canvas，全部零尺寸计数为 0、读取错误计数为 0、非空白计数为 26。采样到的 4-bit 颜色数范围为：

- 自带 Chromium：最小 10，最大 79。
- Edge：最小 10，最大 88。
- Chrome：最小 10，最大 88。

因此，就“位图尺寸非零、可读取像素、采样存在多个颜色”的判据而言，26/26 通过；这不是逐像素一致性证明。

### 关键文本一致性

- `#gl-sky-pdop`：三套均为 `2.81`。
- `#gl-cold-err`：三套均为 `—`。页面源码表明这是未启动冷启动计算时的占位值；因此本轮只证明了初始占位文本一致，**没有证明冷启动计算后的结果在三套浏览器中一致**。

## ④ 这份证据能支持/不能支持什么

### 能支持

1. Edge 和 Chrome 在指定固定路径真实存在，版本分别为 149.0.4022.52 和 154.0.8037.58；Playwright 能通过 channel 启动并打开受审页面。
2. 在本次 headless、1600×900、light、`file://` 场景下，自带 Chromium、Edge、Chrome 均打开 10/10 标签页，未出现 console error/warning、pageerror、requestfailed，也没有致命探针错误。
3. 同一探针下，三套浏览器均找到 26 个 canvas；26/26 位图尺寸非零，26/26 像素读取成功且采样非空白，26/26 无读取错误。
4. 三套浏览器均无横向文档溢出，两个关键统计文本与自带 Chromium 一致。
5. 在这三套 Chromium 发行版之间，本轮页面加载、标签页切换和 canvas 初始渲染路径表现一致。

### 不能支持

1. **不能声称完成了独立浏览器引擎验证。** Edge 与 Chrome 都是 Chromium/Blink 系发行版；本机 Firefox 不存在，WebKit 未安装，也没有启动其它 Gecko/WebKit 引擎。因此“跨引擎”仍未验证。
2. 不能把本次结果推广到真实有 GPU、不同显卡驱动、缩放比例、扩展、代理、企业策略或真实用户 profile 的桌面显示环境；本轮是 headless 自动化和固定 viewport。
3. 不能证明动画长期稳定性、所有交互路径、辅助功能、性能基准或数值计算正确性。load 数值是单次冷启动探针，不是可重复基准。
4. 不能证明 26 个 canvas 的图形语义正确；只证明位图非零、可读且采样非单色/透明。
5. 不能证明 `#gl-cold-err` 的冷启动计算值跨浏览器一致；三套看到的都只是初始占位符 `—`。
6. 不能把 exe 文件元数据版本当作 `--version` 输出；本机 Windows 会话中 `--version` 没有正常打印版本，这一点已明确保留原始输出。

## ⑤ 严重度计数

- P0：0
- P1：0
- P2：1

P2 内容：本机可用的第二浏览器只有 Chromium 系发行版（Edge/Chrome），没有 Firefox/Gecko，也没有 WebKit；所以当前证据仍不能覆盖真正的独立引擎兼容性。这是验证覆盖缺口，不是页面已发现的功能故障。
