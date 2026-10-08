'use strict';
const fs = require('fs');
const p = 'D:/codex/2026-10-05/new-chat/work/gnss-swarm/shell.html';
let s = fs.readFileSync(p, 'utf8');
const reads = {
  'gl-sky-detail': '读法：实心点高于掩膜、参与解算，空心点被掩膜剔除；PDOP &lt; 2 是好几何，&gt; 6 表示卫星挤在同一片天空，定位误差会被放大约 PDOP 倍。',
  'gl-ca-detail': '读法：R(lag) 是未归一化的相关和。C/A 码在 lag=0 有 1023 的唯一尖峰，其它 lag 只允许出现 63 / −1 / −65；任意两个不同 PRN 的互相关不超过 65 —— 这就是所有卫星能共用同一频点的原因。',
  'gl-acq-detail': '读法：横轴是一个 1 ms 码周期内的码相位，纵轴是多普勒，亮点就是相关峰。峰高必须明显超过「4.2 万个搜索格里噪声最大值 ≈ 4.6σ」才算可信检测；信噪比往下拖到 −30 dB 以下，能亲眼看到峰被噪声淹没。',
  'gl-pos-detail': '读法：原点是真实位置，每个点是一次含噪的最小二乘解，虚线圈是 1×/2×DRMS（二维均方根半径）。误差量级 ≈ 伪距噪声 σ × DOP，所以同样 σ 下几何越差点越散。'
};
let n = 0;
for (const [id, text] of Object.entries(reads)) {
  const anchor = '<p class="text-small text-muted gl-note" id="' + id + '">';
  const i = s.indexOf(anchor);
  if (i < 0) { console.log('MISS anchor ' + id); continue; }
  const end = s.indexOf('</p>', i) + 4;
  s = s.slice(0, end) + '\n    <p class="text-small text-muted gl-read">' + text + '</p>' + s.slice(end);
  n++;
}
const about = `
  <details class="gl-about">
    <summary class="text-small text-muted">这些数是怎么算出来的（点开）</summary>
    <ul class="text-small text-muted">
      <li><strong>星座几何</strong>：24 颗解析圆轨道（Walker 24/6/2，a = 26561.75 km，i = 55°），轨道面升交点随地球自转以 −Ωe·t 西漂；接收机位置用 WGS-84。DOP 来自观测矩阵 G = [−u, 1] 的 (GᵀG)⁻¹，HDOP/VDOP 是把位置协方差旋转到当地 ENU 后取对角。</li>
      <li><strong>C/A 码</strong>：G1/G2 两个 10 级 LFSR（1+x³+x¹⁰ 与 1+x²+x³+x⁶+x⁸+x⁹+x¹⁰），G2 按 IS-GPS-200 抽头表做异或选择，chip = G1 ⊕ G2，周期 1023，码率 1.023 Mchip/s，1 chip ≈ 293 m。</li>
      <li><strong>捕获</strong>：4 ms 中频信号按 41 个多普勒格混频（乘 e^(−j2πft)），对码相位做循环相关；相干积分 4 ms 相当于约 36 dB 处理增益，再在胜出的多普勒行精修到 1 个采样点。</li>
      <li><strong>定位与检核</strong>：对 [x, y, z, c·dt] 做线性化最小二乘（Householder QR）；RAIM 用帽子矩阵对角元把残差归一化，超过阈值就判定并剔除一颗粗差卫星后重解。</li>
      <li><strong>误差量级</strong>：−30 dB 时 4 ms 相干积分的理论峰仅约 5.7σ，而 4.2 万个搜索格的最大噪声约 4.6σ，所以那是「边缘检测」；真实接收机靠多历元累加或多普勒辅助把它拉回来。城市多径会让伪距多出一段反射路径长度（面板里能看到它如何按几何衰减）。</li>
    </ul>
  </details>`;
const last = s.lastIndexOf('</div>');
s = s.slice(0, last) + about + '\n' + s.slice(last);
fs.writeFileSync(p, s);
console.log('inserted read-lines=' + n + ', bytes=' + Buffer.byteLength(s));
