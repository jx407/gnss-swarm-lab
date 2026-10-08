'use strict';
const fs = require('fs');
const root = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/';
const raw = JSON.parse(fs.readFileSync(root + 'data/gps-tle.json', 'utf8'));
const MU = 3.986005e14, TWO_PI = Math.PI * 2;
const els = raw.map((o, i) => {
  const m = /\(PRN\s*(\d+)\)/.exec(o.OBJECT_NAME);
  const prn = m ? parseInt(m[1], 10) : 200 + i;
  const nRad = o.MEAN_MOTION * TWO_PI / 86400;
  const a = Math.cbrt(MU / (nRad * nRad));
  return {
    prn: prn, name: o.OBJECT_NAME, norad: o.NORAD_CAT_ID, epoch: o.EPOCH,
    nRadPerSec: nRad, aM: a, e: o.ECCENTRICITY, iDeg: o.INCLINATION,
    raanDeg: o.RA_OF_ASC_NODE, argpDeg: o.ARG_OF_PERICENTER, m0Deg: o.MEAN_ANOMALY
  };
}).sort((x, y) => x.prn - y.prn);
const out = '/* 真实 GPS 星座轨道根数（来源：CelesTrak gp.php?GROUP=gps-ops&FORMAT=json，\n' +
  ' * 抓取时间 2026-10-05，历元见每条 epoch；TLE 平均根数 + 简化开普勒传播，\n' +
  ' * 未做 SGP4 摄动，数小时内位置误差量级为公里级——教学用途，已在页面注明。 */\n' +
  '(function () {\n  \'use strict\';\n  var G = globalThis.GNSS = globalThis.GNSS || {};\n  G.REAL_GPS_ELEMENTS = ' + JSON.stringify(els, null, 0) + ';\n})();\n';
fs.writeFileSync(root + 'winners/real-sat-elements.js', out);
console.log('写入 ' + els.length + ' 颗真实卫星根数');
console.log('  PRN 列表: ' + els.map(e => e.prn).join(','));
console.log('  半长轴范围: ' + Math.min.apply(null, els.map(e => e.aM)).toFixed(0) + ' – ' + Math.max.apply(null, els.map(e => e.aM)).toFixed(0) + ' m');
console.log('  倾角范围: ' + Math.min.apply(null, els.map(e => e.iDeg)).toFixed(2) + ' – ' + Math.max.apply(null, els.map(e => e.iDeg)).toFixed(2) + '°');
console.log('  偏心率范围: ' + Math.min.apply(null, els.map(e => e.e)).toFixed(5) + ' – ' + Math.max.apply(null, els.map(e => e.e)).toFixed(5));
console.log('  历元样本: ' + els[0].epoch);
