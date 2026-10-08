/* 判别器符号自检：在无噪信号上验证"真值在 g 前方 ⇒ d > 0" */
'use strict';

require('./lib/signal.js');
require('./winners/ca-code.js');
require('./winners/acquisition-v2.js');
require('./candidates/dll/b.js');

const G = globalThis.GNSS;
const FS = 4092000, CHIP_M = G.CONST.c / G.CONST.F_CODE;

console.log('\n=== 判别器符号自检（无噪信号，SNR = +30 dB）===\n');

// 测试点：g = 500.0，真值分别在前方（+0.3 chip）和后方（-0.3 chip）
const testCases = [
  { g: 500.0, truth: 500.3, desc: '真值在前方 +0.3 chip' },
  { g: 500.0, truth: 499.7, desc: '真值在后方 -0.3 chip' },
  { g: 500.0, truth: 500.0, desc: '真值重合（零点）' }
];

testCases.forEach(tc => {
  // 生成 2 历元信号（第 0 历元初始化，第 1 历元测量判别器）
  const sigs = [tc.truth, tc.truth].map((cp, e) => 
    G.makeSignal({ prn: 1, codePhase: cp, dopplerHz: 0, snrDb: 30, ms: 4, seed: 1000 + e * 37, fs: FS })
  );
  
  // 注入初值 g，观察判别器输出
  const res = G.trackDll(sigs, { init: { chips: tc.g, dopplerHz: 0 } });
  const d1 = res.disc[1];  // 第 1 历元的判别器输出
  
  const delta = tc.truth - tc.g;
  console.log(tc.desc);
  console.log('  真值 = ' + tc.truth.toFixed(3) + ' chip，估计 g = ' + tc.g.toFixed(3) + ' chip');
  console.log('  偏差 Δ = ' + delta.toFixed(3) + ' chip = ' + (delta * CHIP_M).toFixed(1) + ' m');
  console.log('  判别器 d = ' + d1.toFixed(4));
  console.log('  符号检查：' + (delta > 0 ? 'd > 0 ✓' : delta < 0 ? 'd < 0 ✓' : 'd ≈ 0 ✓') + 
              (Math.sign(d1) === Math.sign(delta) || (delta === 0 && Math.abs(d1) < 0.05) ? ' [通过]' : ' [失败]'));
  console.log('');
});

console.log('判别器符号约定：d > 0 表示真值在估计前方（需要增大 g）。');
console.log('理论斜率 S = 2.0，实测在线性区 |Δ| = 0.3 chip 时 d/Δ ≈ ' + 
            (testCases[0].truth !== testCases[0].g ? 
             (G.trackDll([G.makeSignal({prn:1,codePhase:500.3,dopplerHz:0,snrDb:30,ms:4,seed:1000,fs:FS}),
                          G.makeSignal({prn:1,codePhase:500.3,dopplerHz:0,snrDb:30,ms:4,seed:1037,fs:FS})],
                         {init:{chips:500.0,dopplerHz:0}}).disc[1] / 0.3).toFixed(2) : '—'));
