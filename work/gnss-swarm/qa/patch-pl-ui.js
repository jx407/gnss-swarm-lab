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
/* shell：保护限级条 + 读法补充 */
sub('shell.html', `      <canvas id="gl-raim-scatter" role="img" aria-label="东-北误差散点：空心点为普通最小二乘解，实心点为 RAIM 排除后解"></canvas>
    </div>`,
`      <canvas id="gl-raim-scatter" role="img" aria-label="东-北误差散点：空心点为普通最小二乘解，实心点为 RAIM 排除后解"></canvas>
    </div>
    <canvas id="gl-raim-pl" role="img" aria-label="保护限级对照条：实测水平误差、HPL 与 40 m 告警限"></canvas>`);
sub('shell.html', '读法：RAIM 用冗余观测"投票"——把残差按各自权重归一化后，超过阈值的那颗最可疑，剔除后重解。',
  '读法：RAIM 用冗余观测"投票"——把残差按各自权重归一化后，超过阈值的那颗最可疑，剔除后重解；下面的保护限级条同时给出 HPL/VPL（当前几何与噪声下误差的界）与 40 m 水平告警限的对照。');
/* 60-raim.js：算保护限级 + 写进详情 */
sub('app/60-raim.js', "      st.runs = runs; st.det = det; st.last = runs[runs.length - 1]; st.busy = false;",
`      st.runs = runs; st.det = det; st.last = runs[runs.length - 1]; st.busy = false;
      /* 保护限级：用当前几何与 sigma 的先验噪声算 HPL/VPL（与告警限 40 m 对照） */
      st.pl = null;
      if (G.protectionLevels) {
        try {
          var cleanMeas = G.simulatePseudoranges(geo.sats, geo.rec, { clockBiasM: 120, noiseSigmaM: st.sigma, seed: 5000 + 19 });
          st.pl = G.protectionLevels(cleanMeas, { sigma0: st.sigma });
        } catch (e) { st.pl = null; }
      }`);
sub('app/60-raim.js', "        '；剔除后残差 RMS = ' + C.fmt(st.last && st.last.rms, 2) + ' m。'",
  "        '；剔除后残差 RMS = ' + C.fmt(st.last && st.last.rms, 2) + ' m。' +\n        (st.pl && st.pl.ok ? '保护限级 HPL ' + C.fmt(st.pl.hpl, 1) + ' m / VPL ' + C.fmt(st.pl.vpl, 1) + ' m（水平告警限 40 m：' + (st.pl.hpl <= 40 ? '可用 ✓' : '超限 ✗ 几何不足') + '）。' : '')");
/* 61-raim-draw.js：保护限级条 */
sub('app/61-raim-draw.js', "  APP.panels.raim.draw = function () {\n    var th = C.theme();\n    residBars(th);\n    scatter(th);\n  };",
`  function plStrip(th) {
    var st = APP.panels.raim.state;
    var g = C.prep(el('gl-raim-pl'), 96), ctx = g.ctx, w = g.w, h = g.h;
    var box = { x: 44, y: 26, w: Math.max(40, w - 58), h: 34 };
    C.frame(ctx, box, th);
    C.label(ctx, '水平误差 / HPL / 告警限 (m)', box.x, box.y - 12, th.fg, 'left', 11, 500);
    if (!st.pl || !st.pl.ok) { C.label(ctx, '保护限级不可用（几何不足或模块未加载）', box.x + box.w / 2, box.y + box.h / 2, th.mutedFg, 'center', 12); return; }
    var errs = [];
    for (var i = 0; i < st.runs.length; i++) { var p = st.runs[i].pE; if (p) errs.push(Math.hypot(p.e, p.n)); }
    if (!errs.length) return;
    var AL = 40, lim = C.niceMax(Math.max(st.pl.hpl, AL, Math.max.apply(null, errs)) * 1.12);
    function X(v) { return box.x + Math.min(v, lim) / lim * box.w; }
    var sorted = errs.slice().sort(function (a, b) { return a - b; });
    var p95 = sorted[Math.min(sorted.length - 1, Math.round(0.95 * (sorted.length - 1)))];
    var mx = sorted[sorted.length - 1];
    ctx.fillStyle = C.withAlpha(th.s1, 0.35);
    ctx.fillRect(box.x, box.y + 5, Math.max(1.5, X(p95) - box.x), box.h - 10);
    ctx.fillStyle = th.s1;
    ctx.beginPath(); ctx.arc(X(mx), box.y + box.h / 2, 3.5, 0, Math.PI * 2); ctx.fill();
    var lines = [[st.pl.hpl, th.s2, 'HPL ' + C.fmt(st.pl.hpl, 1)], [AL, th.mutedFg, '告警限 ' + AL], [st.pl.vpl, C.withAlpha(th.s3, 0.9), 'VPL ' + C.fmt(st.pl.vpl, 1)]];
    for (var k = 0; k < lines.length; k++) {
      var x = X(lines[k][0]);
      ctx.save(); ctx.setLineDash(k === 1 ? [5, 4] : [3, 3]); ctx.strokeStyle = lines[k][1]; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x, box.y - 4); ctx.lineTo(x, box.y + box.h + 4); ctx.stroke(); ctx.restore();
      C.label(ctx, lines[k][2], x, box.y + box.h + 13, lines[k][1], 'center', 11);
    }
    C.label(ctx, '实测最大 ' + C.fmt(mx, 1) + ' m（95 分位 ' + C.fmt(p95, 1) + ' m）', X(mx) + 8, box.y + 12, th.fg, 'left', 11, 500);
  }

  APP.panels.raim.draw = function () {
    var th = C.theme();
    residBars(th);
    scatter(th);
    plStrip(th);
  };`);
