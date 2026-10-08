'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/shell.html';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 50));
  s = s.split(find).join(rep);
}
sub('<li><strong>定位与检核</strong>：对 [x, y, z, c·dt] 做线性化最小二乘（Householder QR）；RAIM 用帽子矩阵对角元把残差归一化，超过阈值就判定并剔除一颗粗差卫星后重解。</li>',
  '<li><strong>定位与检核</strong>：对 [x, y, z, c·dt] 做线性化最小二乘（Householder QR）；定位面板在<b>同一批数据</b>上跑两种估计量——等权与高程加权（σ(el)² = σ<sub>z</sub>² + (σ<sub>h</sub>/sin el)²，低仰角自动降权，加权 DOP 用 (GᵀW̃G)⁻¹）。RAIM 用帽子矩阵对角元把残差归一化，超过阈值就剔除一颗粗差卫星后重解，下拉里给出每颗星的<b>杠杆</b>（越接近 1，这颗星的粗差越容易被解自己吸收、越难检出）。</li>');
sub('<li><strong>误差量级</strong>：−30 dB 时 4 ms 相干积分的理论峰仅约 5.7σ，而 4.2 万个搜索格的最大噪声约 4.6σ，所以那是「边缘检测」；真实接收机靠多历元累加或多普勒辅助把它拉回来。城市多径会让伪距多出一段反射路径长度（面板里能看到它如何按几何衰减）。</li>',
  '<li><strong>误差量级</strong>：−30 dB 时 4 ms 相干积分的理论峰仅约 5.7σ，而 4.2 万个搜索格的最大噪声约 4.6σ，所以那是「边缘检测」；真实接收机靠多历元累加或多普勒辅助把它拉回来。城市多径会让伪距多出一段反射路径长度（按几何衰减）。误差预算面板把大气也算进来：天顶约 4 m、5° 低仰角可达 25 m（电离层 Klobuchar + 对流层 Saastamoinen），但所有卫星<b>共同</b>的那部分会被接收机钟差吸收，真正影响定位的是各方向延迟的不一致。</li>');
sub('读法：原点是真实位置，每个点是一次含噪的最小二乘解，虚线圈是 1×/2×DRMS（二维均方根半径）。误差量级 ≈ 伪距噪声 σ × DOP，所以同样 σ 下几何越差点越散。',
  '读法：原点是真实位置。伪距噪声按仰角放大（低仰角卫星的信噪比、大气残差、多径都更差），因此同一批数据上可以比较两种估计量：<b>空心点＝等权解</b>、<b>实心点＝高程加权解</b>，虚线圈是各自的 1×DRMS；误差量级 ≈ σ × DOP，低仰角降权后加权 DOP 会小于等权 DOP，散点也更紧。');
fs.writeFileSync(p, s);
console.log('about + pos read-line updated, bytes=' + Buffer.byteLength(s));
