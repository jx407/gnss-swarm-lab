'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(root + file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 70));
  fs.writeFileSync(root + file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* ① 契约：参考系统口径与测试断言对齐（两个变体都独立选了"有 G 则以 G 为基准"） */
sub('CONTRACT-v5.md', '- **参考系统** = `meas` 中首次出现的系统；其余每个系统对应一个额外未知量（ISB，米）。',
`- **参考系统**：**若 `meas` 含 GPS（'G'）则以 G 为参考系，否则取 `meas` 中首次出现的系统**；其余每个系统对应一个额外未知量（ISB，米）。
  （2026-10-06 修订：原文写"首次出现的系统"，但权威测试的数据经 `GNSS.visible()` 按仰角排序后首项是 C，与"ISB(E)=+20、ISB(C)=−35"的断言矛盾；
   A/B 两个独立变体都自发选择了"有 G 用 G"，故以本条为准。）`);
/* ② boot：几何变化时把"当时不可见"的面板标脏，下次切回来重新计算 */
sub('app/90-boot.js', `        if (APP.panels.pos && !document.getElementById('gl-panel-pos').hidden) APP.panels.pos.run();
        if (APP.panels.raim && !document.getElementById('gl-panel-raim').hidden) APP.panels.raim.run();`,
`        if (APP.panels.pos && !document.getElementById('gl-panel-pos').hidden) APP.panels.pos.run();
        if (APP.panels.raim && !document.getElementById('gl-panel-raim').hidden) APP.panels.raim.run();
        /* 当时不可见的面板标脏：切回来时要按新的几何重算，而不是继续显示旧结果 */
        ['pos', 'raim', 'acq', 'geo', 'mp', 'atm', 'ca'].forEach(function (name) {
          var panelId = { pos: 'gl-panel-pos', raim: 'gl-panel-raim', acq: 'gl-panel-acq', geo: 'gl-panel-geo', mp: 'gl-panel-mp', atm: 'gl-panel-atm', ca: 'gl-panel-ca' }[name];
          var el2 = document.getElementById(panelId);
          if (el2 && el2.hidden) drawn[name] = false;
        });`);
/* ③ 文案：加权反而更差时不要写成"改善 -61%" */
sub('app/40-pos.js', "C.fmt(st.ratio, 1) + '×），两种估计量吃同一批数据——等权水平 RMS ' + C.fmt(ru, 2) + ' m，高程加权 ' + C.fmt(rw, 2) + ' m（' +\n      (isFinite(rw) && isFinite(ru) ? '改善 ' + C.fmt((1 - rw / ru) * 100, 1) + '%' : '—') +",
  "C.fmt(st.ratio, 1) + '×），两种估计量吃同一批数据——等权水平 RMS ' + C.fmt(ru, 2) + ' m，高程加权 ' + C.fmt(rw, 2) + ' m（' +\n      (isFinite(rw) && isFinite(ru) ? ((1 - rw / ru) >= 0 ? '改善 ' + C.fmt((1 - rw / ru) * 100, 1) + '%' : '反而变差 ' + C.fmt((rw / ru - 1) * 100, 1) + '%（模型存在系统偏差时，加权会放大它——这正是 ISB 必须估计的原因）') : '—') +");
sub('app/40-pos.js', "setText('gl-pos-hrms-w-ctx', isFinite(rw) && isFinite(ru) ? '同批数据改善 ' + C.fmt((1 - rw / ru) * 100, 1) + '% · 三维 ' + C.fmt(rw3, 2) + ' m' : '按 uereSigma 降权');",
  "setText('gl-pos-hrms-w-ctx', isFinite(rw) && isFinite(ru) ? ((1 - rw / ru) >= 0 ? '同批数据改善 ' + C.fmt((1 - rw / ru) * 100, 1) + '%' : '反而变差 ' + C.fmt((rw / ru - 1) * 100, 1) + '%') + ' · 三维 ' + C.fmt(rw3, 2) + ' m' : '按 uereSigma 降权');");
