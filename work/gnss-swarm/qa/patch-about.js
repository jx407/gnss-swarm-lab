'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/shell.html';
let s = fs.readFileSync(p, 'utf8');
function sub(find, rep) {
  const n = s.split(find).length - 1;
  if (n !== 1) throw new Error('expected 1, got ' + n + ' :: ' + find.slice(0, 60));
  s = s.split(find).join(rep);
}
sub('<li><strong>定位与检核</strong>：对 [x, y, z, c·dt] 做线性化最小二乘（Householder QR）；RAIM 用帽子矩阵对角元把残差归一化，超过阈值就判定并剔除一颗粗差卫星后重解。</li>',
    '<li><strong>定位与检核</strong>：对 [x, y, z, c·dt] 做线性化最小二乘（Householder QR）；定位面板同一批数据上跑两种估计量——等权与<b>高程加权</b>（σ(el)² = σ<sub>z</sub>² + (σ<sub>h</sub>/sin el)²，低仰角自动降权，加权 DOP 用 (GᵀW̃G)⁻¹）；RAIM 用帽子矩阵对角元把残差归一化，超过阈值就判定并剔除一颗粗差卫星后重解，下拉里给出每颗星的杠杆（杠杆越接近 1，这颗星的粗差越容易被解自己吸收、越难检出）。</li>');
sub('<li><strong>误差量级</strong>：−30 dB 时 4 ms 相干积分的理论峰仅约 5.7σ，而 4.2 万个搜索格的最大噪声约 4.6σ，所以那是「边缘检测」；真实接收机靠多历元累加或多普勒辅助把它拉回来。城市多径会让伪距多出一道反射路径长度（面板里能看到它如何按几何衰减）。</li>',
    '<li><strong>误差量级</strong>：−30 dB 时 4 ms 相干积分的理论峰仅约 5.7σ，而 4.2 万个搜索格的最大噪声约 4.6σ，所以那是「边缘检测」；真实接收机靠多历元累加或多普勒辅助把它拉回来。城市多径会让伪距多出一道反射路径长度（按几何衰减，面板里能看到它如何变成位置误差）。误差预算面板把大气延迟也算进来：天顶约 4 m、5° 低仰角可达 25 m（电离层 Klobuchar + 对流层 Saastamoinen），但所有卫星共同的部分会被接收机钟差吸收，真正影响定位的是各方向延迟的<b>不一致</b>。</li>');
fs.writeFileSync(p, s);
console.log('about text updated, bytes=' + Buffer.byteLength(s));
