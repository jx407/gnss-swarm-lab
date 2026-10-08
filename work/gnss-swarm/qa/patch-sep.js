'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/tests/test-ephemeris.js';
let s = fs.readFileSync(p, 'utf8');
const find = "let sepMin = Infinity, sepWorst = '';\nfor (let step2 = 0; step2 < 120; step2++) {\n  const t2 = step2 * (T / 120);";
const n = s.split(find).length - 1;
if (n !== 1) throw new Error('expected 1, got ' + n);
/* 这里在 const T 之前，必须自己算周期（TDZ 会抛 Cannot access before initialization） */
s = s.split(find).join("const Tsep = 2 * Math.PI / Math.sqrt(MU / (A * A * A));\nlet sepMin = Infinity, sepWorst = '';\nfor (let step2 = 0; step2 < 120; step2++) {\n  const t2 = step2 * (Tsep / 120);");
fs.writeFileSync(p, s);
console.log('separation check fixed');
