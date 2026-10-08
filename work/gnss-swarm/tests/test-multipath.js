'use strict';
const H = require('./harness.js');
const target = process.argv[2];
if (!target) { console.error('usage: node test-multipath.js <candidate.js>'); process.exit(2); }
const G = H.load(__dirname + '/../lib/signal.js', target);

const WALL = {
  point: { x: 0, y: 0, z: 0 },
  normal: { x: 1, y: 0, z: 0 },
  along: { x: 0, y: 1, z: 0 },
  halfWidthM: 10, zMinM: 0, zMaxM: 10
};
const REC = { x: 5, y: 0, z: 0 }, SAT = { x: 30, y: 0, z: 20 };
const norm = v => Math.hypot(v.x, v.y, v.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

H.section('接口');
for (const f of ['rayBlocked', 'reflectPoint', 'multipathBias']) H.check('存在 ' + f, typeof G[f] === 'function');

H.section('解析算例（墙 x=0，接收机 (5,0,0)，卫星 (30,0,20)）');
const rp = G.reflectPoint(REC, SAT, WALL);
H.check('valid = true', rp && rp.valid === true, rp && rp.reason);
H.approx('反射点 z = 20/7', rp.point.z, 20 / 7, 1e-6, 'm');
H.approx('反射点 x = 0', rp.point.x, 0, 1e-6, 'm');
H.approx('直达路径 = sqrt(1025)', rp.directPathM, Math.sqrt(1025), 1e-6, 'm');
H.approx('反射路径 = sqrt(1625)', rp.reflectedPathM, Math.sqrt(1625), 1e-6, 'm');
H.approx('多出路径 = 8.2956676', rp.pathExtraM, Math.sqrt(1625) - Math.sqrt(1025), 1e-6, 'm');
H.check('非法向（几何一致性）', Math.abs(dot(sub(REC, rp.point), WALL.normal)) > 0 && Math.abs(dot(sub(SAT, rp.point), WALL.normal)) > 0);
const inc = Math.acos(Math.abs(dot(sub(REC, rp.point), WALL.normal)) / norm(sub(REC, rp.point)));
const ref = Math.acos(Math.abs(dot(sub(SAT, rp.point), WALL.normal)) / norm(sub(SAT, rp.point)));
H.approx('反射点处入射角 = 反射角', inc, ref, 1e-9, 'rad');
if (Number.isFinite(rp.incidenceDeg) && Number.isFinite(rp.reflectionDeg)) H.approx('报告的角度与向量计算一致', rp.incidenceDeg, rp.reflectionDeg, 1e-6, 'deg');

H.section('遮挡与范围');
H.check('卫星在墙后 -> rayBlocked = true', G.rayBlocked(REC, { x: -10, y: 0, z: 20 }, WALL) === true);
H.check('同一侧直视 -> rayBlocked = false', G.rayBlocked(REC, SAT, WALL) === false);
/* 选定卫星 (30, 100, 20)：镜像法下反射点 y = 100·5/(30+5) = 14.286 m > halfWidth 10 m，
 * 才是真正"反射点落在墙外"的算例。（早期版本误用 y=40，那时反射点 y=5.71 m 其实在墙内——
 * 是我测试算错了，不是实现错了。） */
const outside = G.reflectPoint(REC, { x: 30, y: 100, z: 20 }, WALL);
H.check('反射点落在墙外 -> valid=false', outside.valid === false, 'reason=' + outside.reason + ' y=' + (outside.point && outside.point.y));
const low = G.reflectPoint(REC, { x: 30, y: 0, z: 20 }, Object.assign({}, WALL, { zMaxM: 2 }));
H.check('反射点高于墙顶 -> valid=false', low.valid === false, 'reason=' + low.reason);
H.check('墙后卫星的反射点结果 valid=false（遮挡优先）', G.reflectPoint(REC, { x: -10, y: 0, z: 20 }, WALL).valid === false);

H.section('伪距偏差模型');
const b = G.multipathBias(REC, SAT, WALL, { reflectionCoef: 0.5, corrLoss: 1.0 });
H.check('valid = true 且有伪距偏差', b && b.valid === true && b.pseudorangeBiasM > 0, b && ('extraDelayChips=' + H.fmt(b.extraDelayChips, 3) + ' bias=' + H.fmt(b.pseudorangeBiasM, 3)));
H.approx('extraDelayChips = pathExtra / 293.05', b.extraDelayChips, rp.pathExtraM / (299792458 / 1.023e6), 1e-9, 'chip');
H.check('偏差 < 多出路径（相关器衰减）', b.pseudorangeBiasM <= b.pathExtraM + 1e-9, 'bias=' + H.fmt(b.pseudorangeBiasM, 3) + ' extra=' + H.fmt(b.pathExtraM, 3));
const b25 = G.multipathBias(REC, SAT, WALL, { reflectionCoef: 0.25 }), b75 = G.multipathBias(REC, SAT, WALL, { reflectionCoef: 0.75 });
H.approx('偏差随反射系数线性（0.25→0.5→0.75）', b75.pseudorangeBiasM - b.pseudorangeBiasM, b.pseudorangeBiasM - b25.pseudorangeBiasM, 1e-9, 'm');
H.approx('偏差 ∝ reflectionCoef', b.pseudorangeBiasM, 2 * b25.pseudorangeBiasM, 1e-9, 'm');
const far = G.multipathBias(REC, { x: 30, y: 0, z: 20000 }, WALL, { reflectionCoef: 0.5 });
H.check('超长延迟时偏差为 0（超出相关器窗口）', far.pseudorangeBiasM === 0, 'extraChip=' + H.fmt(far.extraDelayChips, 2) + ' bias=' + H.fmt(far.pseudorangeBiasM, 4));
const mid = G.multipathBias(REC, { x: 30, y: 0, z: 60 }, WALL, { reflectionCoef: 0.5 });
const near = G.multipathBias(REC, SAT, WALL, { reflectionCoef: 0.5 });
H.check('偏差随延迟增加而单调减小', mid.pseudorangeBiasM < near.pseudorangeBiasM, 'near=' + H.fmt(near.pseudorangeBiasM, 2) + ' mid=' + H.fmt(mid.pseudorangeBiasM, 2));

H.section('健壮性与确定性');
const badWall = { point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 0 }, along: { x: 0, y: 1, z: 0 }, halfWidthM: 10, zMinM: 0, zMaxM: 10 };
let threw = false, bad = null;
try { bad = G.reflectPoint(REC, SAT, badWall); } catch (e) { threw = true; }
H.check('零法向量不抛异常', !threw);
H.check('零法向量返回 valid=false', bad && bad.valid === false, bad && bad.reason);
const before = JSON.stringify(WALL) + JSON.stringify(REC) + JSON.stringify(SAT);
const r1 = G.reflectPoint(REC, SAT, WALL), r2 = G.reflectPoint(REC, SAT, WALL);
H.check('两次调用逐位一致', r1.point.x === r2.point.x && r1.point.y === r2.point.y && r1.point.z === r2.point.z && r1.pathExtraM === r2.pathExtraM);
H.check('未修改入参', JSON.stringify(WALL) + JSON.stringify(REC) + JSON.stringify(SAT) === before);
H.summary();
