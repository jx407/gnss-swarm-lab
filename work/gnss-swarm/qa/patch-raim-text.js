'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/app/60-raim.js';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 occurrence, got ' + n + ' for: ' + find.slice(0, 50));
  s = s.split(find).join(rep);
}
sub("runs.push({ pE: pE, rE: rE, hit: hit, mode: raim.mode, stats: raim.statistics, sats: geo.sats, residuals: raim.residuals, nl: hit && raim.excluded[0] && raim.excluded[0].normalizedResidual });",
    "runs.push({ pE: pE, rE: rE, hit: hit, mode: raim.mode, stats: raim.statistics, sats: geo.sats, residuals: raim.residuals, rms: raim.rms, nl: hit && raim.excluded[0] && raim.excluded[0].normalizedResidual });");
sub("setText('gl-raim-detail', s\n      ? 'PRN ' + st.prn + ' 注入 ' + st.bias + ' m 粗差（σ=' + C.fmt(st.sigma, 1) + ' m）：检验量 max|nmr| = ' + C.fmt(s.maxNormalizedResidual, 2) + '，阈值 ' + C.fmt(s.threshold, 1) + '，自由度 ' + s.dof + '，σ̂ = ' + C.fmt(s.sigmaHat, 2) + ' m。'\n      : '调粗差大小，看它多大才被检出来。');",
    "setText('gl-raim-detail', s\n      ? 'PRN ' + st.prn + ' 注入 ' + st.bias + ' m 粗差（σ=' + C.fmt(st.sigma, 1) + ' m）：检出阶段 max|nmr| = ' + C.fmt(s.maxNormalizedResidual, 2) +\n        '（阈值 ' + C.fmt(s.threshold, 1) + '，n = ' + s.n + '，σ̂ = ' + C.fmt(s.sigmaHat, 2) + ' m）→ ' +\n        (st.det > 0 ? '已判定并剔除该星后重解' : '低于阈值，本次无法判定') +\n        '；剔除后残差 RMS = ' + C.fmt(st.last && st.last.rms, 2) + ' m。'\n      : '调粗差大小，看它多大才被检出来。');");
fs.writeFileSync(p, s);
console.log('raim panel text patched');
