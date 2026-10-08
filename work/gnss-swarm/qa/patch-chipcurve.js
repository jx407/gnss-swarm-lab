'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
function sub(file, find, rep) {
  let s = fs.readFileSync(file, 'utf8');
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' in ' + file + ' :: ' + find.slice(0, 70));
  fs.writeFileSync(file, s.split(find).join(rep));
  console.log('patched ' + file);
}
/* 逻辑：记录真值码相位，并给出"平均后码相位误差 RMS"随 N 的曲线 */
sub(root + 'app/80-coldstart.js',
  "    return { prn: sat.prn, ms: ms, chips: chips, dopErr: Math.abs(r.dopplerHz - dop), peakSigma: r.peakSigma, detected: r.detected };",
  "    var chipsErrM = wrapChip(chips - trueChips) * chipM();\n    return { prn: sat.prn, ms: ms, chips: chips, trueChips: trueChips, chipsErrM: chipsErrM, dopErr: Math.abs(r.dopplerHz - dop), peakSigma: r.peakSigma, detected: r.detected };");
sub(root + 'app/80-coldstart.js',
  "    st.errCurve = [];\n    var last = null;",
  "    st.errCurve = []; st.chipCurve = [];\n    var last = null;");
sub(root + 'app/80-coldstart.js',
  "      st.errCurve.push({ n: N, err: err });\n      last = out;",
  "      st.errCurve.push({ n: N, err: err });\n      var sq = 0;\n      for (var q = 0; q < info.sats.length; q++) { var dq = wrapChip(averageChips(st.est[q], N) - st.items[q].trueChips) * chipM(); sq += dq * dq; }\n      st.chipCurve.push({ n: N, rms: Math.sqrt(sq / info.sats.length) });\n      last = out;");
sub(root + 'app/80-coldstart.js', "st.running = true; st.items = []; st.est = []; st.errCurve = [];",
  "st.running = true; st.items = []; st.est = []; st.errCurve = []; st.chipCurve = [];");
/* 绘制：叠加码相位 RMS 曲线 + 两条 √N 参考 */
sub(root + 'app/81-coldstart-draw.js',
  "    var ymax = C.niceMax(Math.max.apply(null, pts.map(function (p) { return p.err; })) * 1.12);",
  "    var chips = (st.chipCurve || []).filter(function (p) { return isFinite(p.rms); });\n    var allVals = pts.map(function (p) { return p.err; }).concat(chips.map(function (p) { return p.rms; }));\n    var ymax = C.niceMax(Math.max.apply(null, allVals) * 1.12);");
sub(root + 'app/81-coldstart-draw.js',
  "    C.label(ctx, '虚线＝' + C.fmt(e1, 0) + '/√N 参考', box.x + 4, box.y + box.h - 10, th.mutedFg, 'left', 11);",
  `    /* 码相位误差 RMS（6 颗星平均，收敛更平滑） */
    if (chips.length) {
      ctx.strokeStyle = th.s2; ctx.lineWidth = 1.6; ctx.beginPath();
      for (var c2 = 0; c2 < chips.length; c2++) { var xc = X(chips[c2].n), yc = Y(chips[c2].rms); if (c2 === 0) ctx.moveTo(xc, yc); else ctx.lineTo(xc, yc); }
      ctx.stroke();
      ctx.fillStyle = th.s2;
      for (var c3 = 0; c3 < chips.length; c3++) { ctx.beginPath(); ctx.arc(X(chips[c3].n), Y(chips[c3].rms), 2.6, 0, Math.PI * 2); ctx.fill(); }
      C.label(ctx, '码相位误差 RMS ' + C.fmt(chips[chips.length - 1].rms, 0) + ' m', X(chips[chips.length - 1].n) - 8, Y(chips[chips.length - 1].rms) - 11, th.s2, 'right', 11, 500);
    }
    C.label(ctx, '— 定位误差 · — 码相位 RMS · 虚线＝' + C.fmt(e1, 0) + '/√N 参考', box.x + 4, box.y + box.h - 10, th.mutedFg, 'left', 11);`);
