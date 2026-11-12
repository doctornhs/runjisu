// node test/core.test.js
const Core = require('../src/core.js');
let fail = 0;
const ok = (name, cond, extra) => { if (!cond) fail++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra !== undefined ? '  → ' + extra : '')); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 런지수
const idx = Core.runIndex(10000, 55);
ok('10K 55:00 런지수 ≈ 35.8', near(idx, 35.8, 0.06), idx.toFixed(2));
ok('5K 20:00 런지수 ≈ 49.8', near(Core.runIndex(5000, 20), 49.8, 0.1), Core.runIndex(5000, 20).toFixed(2));
ok('풀 3:00:00 런지수 ≈ 53.5', near(Core.runIndex(42195, 180), 53.5, 0.2), Core.runIndex(42195, 180).toFixed(2));
ok('예상 기록 왕복 일치', near(Core.raceMinutes(idx, 10000), 55, 0.001));
const z = Core.paces(idx);
ok('페이스 순서 E느림 > E빠름 > M > T > I > R', z.eSlow > z.eFast && z.eFast > z.m && z.m > z.t && z.t > z.i && z.i > z.r,
  ['eSlow', 'eFast', 'm', 't', 'i', 'r'].map(k => k + ' ' + Core.fmtPace(z[k])).join(', '));

// 구간표
for (const mode of ['even', 'neg']) {
  for (const [m, g] of [[5000, 25], [10000, 55], [21097.5, 120], [42195, 240]]) {
    const s = Core.splits(m, g, mode), last = s.rows[s.rows.length - 1];
    ok(`구간표 ${mode} ${m}m 합계 = 목표`, near(last.cum, g * 60, 0.01) && near(last.to, m, 0.01), `${s.rows.length}구간, 끝 ${Core.fmtTime(last.cum / 60)}`);
  }
}
const neg = Core.splits(42195, 240, 'neg');
ok('후반 가속: 전반이 후반보다 느림', neg.rows[0].pace > neg.rows[neg.rows.length - 1].pace);
const gc = Core.goalCheck(idx, 10000, 50);
ok('목표 점검: 10K 50분은 지금보다 높은 런지수 필요', gc.gap > 1.5 && gc.level === 2, `필요 ${gc.need.toFixed(1)}, 차이 ${gc.gap.toFixed(1)}`);
ok('목표 점검: 같은 기록이면 level 0', Core.goalCheck(idx, 10000, 55).level === 0);

// 주간 훈련표: 모든 조합에서 합계와 규칙 확인
let combos = 0, bad = [];
for (const index of [28, 35.8, 45, 55, 65]) for (let W = 10; W <= 160; W += 1) for (const days of [3, 4, 5, 6]) for (const goal of ['base', '10k', 'half', 'full']) {
  const p = Core.weekPlan(index, W, days, goal); combos++;
  const tag = `${index}/${W}/${days}/${goal}`;
  if (!p) { bad.push(tag + ' null'); continue; }
  const runDays = p.days.filter(d => d.role !== 'rest');
  if (runDays.length !== p.runDays || p.runDays < 3 || p.runDays > 6) bad.push(tag + ' 날 수');
  if (W / days >= 3 && !p.overload && p.runDays < days) bad.push(tag + ' 이유 없이 줄임');
  const easyMax = Math.max(0, ...p.days.filter(d => d.role === 'E').map(d => d.km));
  if (!p.overload && easyMax > p.longKm) bad.push(tag + ' 가벼운 날이 장거리보다 김');
  if (p.overload && p.runDays !== 6) bad.push(tag + ' 과부하 표시');
  if (!near(p.total, W, 0.11)) bad.push(tag + ' 합계 ' + p.total);
  if (runDays.some(d => !(d.km >= 2.5))) bad.push(tag + ' 너무 짧은 날 ' + runDays.map(d => d.km).join(','));
  p.days.forEach(d => {
    if (d.role === 'T' && d.session.work > W * 0.10 + 1e-9 && d.session.reps > 2) bad.push(tag + ' T 상한');
    if (d.role === 'I' && d.session.work > Math.min(W * 0.08, 10) + 1e-9 && d.session.reps > 2) bad.push(tag + ' I 상한');
    if (d.role === 'I' && (d.session.restSec < 150 || d.session.restSec > 330)) bad.push(tag + ' I 반복 시간 ' + d.session.restSec.toFixed(0));
  });
  // 힘든 날(강도·장거리)이 이틀 연속이면 안 된다
  const hardDay = d => d.role !== 'rest' && d.role !== 'E';
  for (let k = 0; k < 7; k++) if (hardDay(p.days[k]) && hardDay(p.days[(k + 1) % 7])) bad.push(tag + ' 연속 강도');
  const e = Core.paces(index); if (p.longKm * (e.eSlow + e.eFast) / 2 / 60 > 150.01) bad.push(tag + ' 장거리 150분 초과');
}
const cats = {}; bad.forEach(b => { const k = b.split(' ').slice(1, 3).join(' ').replace(/[0-9.,]+/g, ''); cats[k] = (cats[k] || 0) + 1; });
if (bad.length) console.log('     실패 유형', cats);
ok(`주간 훈련표 ${combos}개 조합 검사`, bad.length === 0, bad.length ? bad.slice(0, 8).join(' | ') + ` … 총 ${bad.length}` : '전부 통과');
const sample = Core.weekPlan(idx, 30, 4, '10k');
const ov = []; for (const index of [28, 35.8, 45, 55, 65]) { let w = null; for (let W = 10; W <= 160; W++) { if (Core.weekPlan(index, W, 6, 'base').overload) { w = W; break; } } ov.push(index + ':' + (w || '없음')); }
console.log('     6일로도 과부하가 되는 주간 거리(런지수:km)', ov.join(' '));
console.log('     예: 런지수 35.8, 주 30km, 4일, 10K →', sample.days.map(d => ['월', '화', '수', '목', '금', '토', '일'][d.dow] + ':' + d.role + (d.km ? d.km : '')).join(' '), '| E 비율', (sample.easyShare * 100).toFixed(0) + '%');

// 기록 통계
ok('2026-11-12은 목요일(월요일 기준 3)', ((Core.dayNum('2026-11-12') + 3) % 7) === 3);
const runs = [
  { d: '2026-11-12', km: 6 }, { d: '2026-11-10', km: 8 }, { d: '2026-11-08', km: 14 }, { d: '2026-11-05', km: 7 },
  { d: '2026-11-03', km: 6 }, { d: '2026-10-25', km: 12 }, { d: '2026-10-10', km: 18 },
];
const st = Core.logStats(runs, '2026-11-12', 8);
ok('이번 주(11/9~) 합계 14', st.thisWeek === 14, st.thisWeek);
ok('지난주(11/2~11/8) 합계 27', st.lastWeek === 27, st.lastWeek);
ok('최근 30일 최장 14 (10/10의 18은 범위 밖)', st.longest30 === 14, st.longest30);
ok('8주 표, 마지막 주 시작 라벨 11/9', st.weeks.length === 8 && st.weeks[7].label === '11/9', st.weeks.map(w => w.label + ':' + w.km).join(' '));

// 체력 나이
ok('Cooper 2800m ≈ 51.3', near(Core.cooper(2800), 51.3, 0.05), Core.cooper(2800).toFixed(2));
const rk = Core.rockport({ kg: 165 / 2.20462, age: 30, sex: 'M', min: 15, hr: 130 });
ok('Rockport 남 30세 165lb 15분 130회 ≈ 45.5', near(rk, 45.5, 0.1), rk.toFixed(2));
const rkF = Core.rockport({ kg: 60, age: 55, sex: 'F', min: 16, hr: 140 });
ok('Rockport 여 55세 60kg 16분 140회 (손계산 27.16)', near(rkF, 132.853 - 0.0769 * 132.2772 - 0.3877 * 55 - 3.2649 * 16 - 0.1565 * 140, 0.01), rkF.toFixed(2));
ok('40대 남 중앙값 37.8 → 50백분위', near(Core.peerPercentile(37.8, 'M', 45).pct, 50, 0.01));
ok('체력 나이: 남 37.8 → 45세', near(Core.fitnessAge(37.8, 'M').age, 45, 0.01));
const nt = Core.nextTier(35.8, 'M', 45);
ok('다음 단계: 40대 남 35.8 → 50백분위 37.8', nt.pct === 50 && near(nt.value, 37.8, 0.001), `+${nt.gap.toFixed(1)}`);
ok('다음 단계: 95백분위 이상이면 없음', Core.nextTier(60, 'M', 45) === null);

// 급증, 신발, 심박
ok('12km → 16km 는 +33% 중간 급증', Core.spike(12, 16).level === 2);
ok('신발 430km 데일리 = 점검 시작', Core.shoeStatus('daily', 430).level === 1);
ok('40세 최대심박 추정 180', Core.estMaxHr(40) === 180);

console.log(fail ? `\n${fail}개 실패` : '\n전부 통과');
process.exit(fail ? 1 : 0);
