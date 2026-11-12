/* 계산 코어: 화면과 분리된 순수 함수 모음.
   웹, 설치형 웹앱(PWA), 스토어 앱(Capacitor)에서 이 파일을 그대로 다시 쓴다. */
const Core = (() => {
  /* ── 런지수: Daniels & Gilbert (1979) 산소 소비량 식. v: 분속(m/min), t: 지속 시간(분) ── */
  const A = -4.60, B = 0.182258, C = 0.000104;
  const vo2AtSpeed = v => A + B * v + C * v * v;
  const sustainFrac = t => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  const speedAtVo2 = x => (-B + Math.sqrt(B * B - 4 * C * (A - x))) / (2 * C);

  /** 레이스 기록 → 런지수 */
  const runIndex = (meters, minutes) => vo2AtSpeed(meters / minutes) / sustainFrac(minutes);

  /** 런지수 → 해당 거리 예상 기록(분). 이분법 */
  function raceMinutes(index, meters) {
    let lo = meters / 1000 * 1.5, hi = meters / 1000 * 20;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (runIndex(meters, mid) > index) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  const secPerKm = v => 60000 / v;            // 분속 → km당 초
  const kmh = sec => 3600 / sec;              // km당 초 → 시속

  /** 런지수 → 훈련 페이스(km당 초) */
  function paces(index) {
    const eSlow = secPerKm(speedAtVo2(index * 0.62));
    const eFast = secPerKm(speedAtVo2(index * 0.70));
    const m = raceMinutes(index, 42195) * 60 / 42.195;
    const t = secPerKm(speedAtVo2(index * 0.88));
    const i = secPerKm(speedAtVo2(index * 0.975));
    const r = i - 15;                          // 400m당 6초 빠르게 = km당 15초
    return { eSlow, eFast, m, t, i, r };
  }

  const RACES = [
    { id: '5k', label: '5K', m: 5000 },
    { id: '10k', label: '10K', m: 10000 },
    { id: 'half', label: '하프', m: 21097.5 },
    { id: 'full', label: '풀', m: 42195 },
  ];
  const predictions = index => RACES.map(r => ({ ...r, minutes: raceMinutes(index, r.m) }));

  /* ── 대회 계획: 목표 기록을 구간표로 ── */
  /** mode 'even' 고르게, 'neg' 전반을 1.5% 느리게 가고 후반에 그만큼 당긴다 */
  function splits(meters, goalMin, mode) {
    const seg = meters <= 10000 ? 1000 : 5000;
    const avg = goalMin * 60 / (meters / 1000);
    const d = mode === 'neg' ? 0.015 : 0;
    const half = meters / 2;
    const rows = [];
    let pos = 0, t = 0;
    while (pos < meters - 0.5) {
      const end = Math.min(pos + seg, meters);
      const a = Math.max(0, Math.min(end, half) - pos), b = (end - pos) - a;
      const dt = (a * avg * (1 + d) + b * avg * (1 - d)) / 1000;
      t += dt;
      rows.push({ from: pos, to: end, sec: dt, pace: dt / ((end - pos) / 1000), cum: t });
      pos = end;
    }
    return { avg, first: avg * (1 + d), second: avg * (1 - d), rows };
  }

  /** 목표 기록에 필요한 런지수와 지금 런지수의 차이. level 0 가능, 1 도전, 2 무리 */
  function goalCheck(index, meters, goalMin) {
    const need = runIndex(meters, goalMin), gap = need - index;
    return { need, gap, level: gap <= 0.3 ? 0 : gap <= 1.5 ? 1 : 2 };
  }

  /* ── 주간 훈련표 ── */
  const RUN_DAYS = { 3: [1, 3, 6], 4: [1, 3, 5, 6], 5: [1, 2, 4, 5, 6], 6: [0, 1, 2, 4, 5, 6] };  // 0 월 … 6 일
  const LONG_SHARE = { 3: 0.40, 4: 0.33, 5: 0.30, 6: 0.27 };
  const GOAL_KINDS = { base: [], '10k': ['I', 'T'], half: ['T', 'I'], full: ['T', 'M'] };
  const half5 = x => Math.round(x * 2) / 2;
  const tenth = x => Math.round(x * 10) / 10;

  function buildSession(kind, W, z) {
    const wu = W < 30 ? 1.5 : 2, cd = wu;
    if (kind === 'T') {                       // 1km 반복, 사이 1분. 합계는 주간 거리의 10% 이내
      const n = Math.max(2, Math.min(10, Math.floor(W * 0.10)));
      return { kind, reps: n, repM: 1000, restSec: 60, work: n, wu, cd, km: half5(wu + n + cd) };
    }
    if (kind === 'I') {                       // 한 번에 약 4분, 합계는 주간 거리의 8%와 10km 가운데 작은 쪽 이내
      const budget = Math.min(W * 0.08, 10);
      const repM = Math.max(600, Math.min(1200, Math.round(240 / z.i * 5) * 200));
      const n = Math.max(2, Math.floor(budget * 1000 / repM));
      const repSec = z.i * repM / 1000;
      const jog = (n - 1) * repSec / z.eSlow;  // 달린 시간만큼 천천히 조깅
      const work = n * repM / 1000;
      return { kind, reps: n, repM, restSec: repSec, work, wu, cd, km: half5(wu + work + jog + cd) };
    }
    const m = Math.max(3, Math.min(16, half5(W * 0.15)));   // M: 주간 거리의 15% 안팎
    return { kind: 'M', work: m, wu, cd, km: half5(wu + m + cd) };
  }

  /** 한 주 훈련표. W 주간 거리(km), days 달리는 날 수(3~6), goal base|10k|half|full.
      하루 평균이 3km에 못 미치면 달리는 날을 줄이고, 가벼운 날이 장거리보다 길어지면 늘린다(adjustedFrom에 원래 값). */
  function weekPlan(index, W, daysAsked, goal) {
    if (!(index > 0) || !(W >= 10 && W <= 160) || !RUN_DAYS[daysAsked] || !GOAL_KINDS[goal]) return null;
    const z = paces(index), eMid = (z.eSlow + z.eFast) / 2;
    const cap150 = Math.floor(150 * 60 / eMid * 2) / 2;      // E 페이스로 150분 안에 가는 거리(0.5km 단위 내림)

    function build(days) {
      let longKm = half5(W * LONG_SHARE[days]), longCapped = false;
      if (longKm > cap150) { longKm = cap150; longCapped = true; }
      let q = 0;
      if (goal !== 'base' && W >= 20) q = (days >= 5 && W >= 40) ? 2 : 1;
      let sessions, easyDays, rest;
      for (;;) {
        sessions = GOAL_KINDS[goal].slice(0, q).map(k => buildSession(k, W, z));
        easyDays = days - 1 - q;
        rest = W - longKm - sessions.reduce((s, x) => s + x.km, 0);
        if (q === 0 || rest / easyDays >= 3) break;
        q--;                                   // 가벼운 날이 3km도 안 남으면 강도 훈련을 줄인다
      }
      const each = Math.floor(rest / easyDays * 2) / 2;
      const easyKm = Array.from({ length: easyDays }, (_, k) => k < easyDays - 1 ? each : tenth(rest - each * (easyDays - 1)));
      return { days, longKm, longCapped, q, sessions, easyKm, maxEasy: Math.max.apply(null, easyKm) };
    }

    let days = Math.max(3, Math.min(daysAsked, Math.floor(W / 3)));
    let b = build(days);
    while (b.maxEasy > b.longKm && days < 6) { days++; b = build(days); }

    const order = RUN_DAYS[days], out = [];
    let e = 0;
    for (let d = 0; d < 7; d++) {
      if (!order.includes(d)) { out.push({ dow: d, role: 'rest', km: 0 }); continue; }
      if (d === 6) out.push({ dow: d, role: 'L', km: b.longKm });
      else if (d === 1 && b.sessions[0]) out.push({ dow: d, role: b.sessions[0].kind, km: b.sessions[0].km, session: b.sessions[0] });
      else if (d === 4 && b.sessions[1]) out.push({ dow: d, role: b.sessions[1].kind, km: b.sessions[1].km, session: b.sessions[1] });
      else out.push({ dow: d, role: 'E', km: b.easyKm[e++] });
    }
    if (goal === 'base') { const firstE = out.find(x => x.role === 'E'); if (firstE) firstE.strides = true; }
    const hard = b.sessions.reduce((s, x) => s + x.work, 0);
    const total = tenth(out.reduce((s, x) => s + x.km, 0));
    return {
      days: out, runDays: days, adjustedFrom: days !== daysAsked ? daysAsked : null,
      overload: b.maxEasy > b.longKm,          // 6일로도 하루가 150분을 넘는 주간 거리
      longKm: b.longKm, longCapped: b.longCapped, longShare: b.longKm / W, longMin: b.longKm * eMid / 60,
      quality: b.q, hardKm: hard, easyShare: (total - hard) / total, total, paces: z,
    };
  }

  /* ── 달리기 기록 ── */
  const dayNum = s => { const p = String(s).split('-').map(Number); return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000); };
  const weekIdx = n => Math.floor((n + 3) / 7);            // 월요일 시작
  const dayLabel = n => { const d = new Date(n * 86400000); return (d.getUTCMonth() + 1) + '/' + d.getUTCDate(); };

  /** 최근 nWeeks 주의 주간 거리와 최근 30일 최장 거리 */
  function logStats(runs, today, nWeeks) {
    const t = dayNum(today), w = weekIdx(t), n = nWeeks || 8;
    const weeks = [];
    for (let k = n - 1; k >= 0; k--) weeks.push({ w: w - k, start: (w - k) * 7 - 3, km: 0, count: 0 });
    let longest30 = 0, total30 = 0;
    (runs || []).forEach(r => {
      const dn = dayNum(r.d), wk = weeks.find(x => x.w === weekIdx(dn));
      if (wk) { wk.km += r.km; wk.count++; }
      if (dn <= t && dn > t - 30) { total30 += r.km; if (r.km > longest30) longest30 = r.km; }
    });
    weeks.forEach(x => { x.km = tenth(x.km); x.label = dayLabel(x.start); });
    const thisWeek = weeks[n - 1].km, lastWeek = n > 1 ? weeks[n - 2].km : 0;
    return { weeks, thisWeek, lastWeek, change: lastWeek > 0 ? (thisWeek - lastWeek) / lastWeek * 100 : null, longest30, total30: tenth(total30), cap: longest30 * 1.1 };
  }

  /* ── 체력 나이: FRIEND 등록 연구(Kaminsky 2015) 트레드밀 VO2max 백분위, ml/kg/min ── */
  const FRIEND = {
    pct: [5, 10, 25, 50, 75, 90, 95],
    M: { 20: [29.0, 32.1, 40.1, 48.0, 55.2, 61.8, 66.3], 30: [27.2, 30.2, 35.9, 42.4, 49.2, 56.5, 59.8], 40: [24.2, 26.8, 31.9, 37.8, 45.0, 52.1, 55.6], 50: [20.9, 22.8, 27.1, 32.6, 39.7, 45.6, 50.7], 60: [17.4, 19.8, 23.7, 28.2, 34.5, 40.3, 43.0], 70: [16.3, 17.1, 20.4, 24.4, 30.4, 36.6, 39.7] },
    F: { 20: [21.7, 23.9, 30.5, 37.6, 44.7, 51.3, 56.0], 30: [19.0, 20.9, 25.3, 30.2, 36.1, 41.4, 45.8], 40: [17.0, 18.8, 22.1, 26.7, 32.4, 38.4, 41.7], 50: [16.0, 17.3, 19.9, 23.4, 27.6, 32.0, 35.9], 60: [13.4, 14.6, 17.2, 20.0, 23.8, 27.0, 29.4], 70: [13.1, 13.6, 15.6, 18.3, 20.8, 23.1, 24.1] },
  };
  const peerRow = (sex, age) => (FRIEND[sex] && age >= 20 && age < 80) ? { decade: Math.floor(age / 10) * 10, pct: FRIEND.pct, v: FRIEND[sex][Math.floor(age / 10) * 10] } : null;

  /** 같은 연령대 안에서의 백분위(아래에서부터). 20~79세만 */
  function peerPercentile(index, sex, age) {
    const pr = peerRow(sex, age);
    if (!pr) return null;
    const row = pr.v, p = pr.pct, decade = pr.decade;
    if (index <= row[0]) return { decade, pct: 5, edge: 'low' };
    if (index >= row[row.length - 1]) return { decade, pct: 95, edge: 'high' };
    for (let k = 1; k < row.length; k++) {
      if (index <= row[k]) {
        const f = (index - row[k - 1]) / (row[k] - row[k - 1]);
        return { decade, pct: p[k - 1] + f * (p[k] - p[k - 1]), edge: null };
      }
    }
    return null;
  }

  /** 값이 어느 연령대 중앙값과 같은지(연령대 중간 나이 기준 보간) */
  function fitnessAge(index, sex) {
    if (!FRIEND[sex]) return null;
    const pts = [20, 30, 40, 50, 60, 70].map(d => ({ age: d + 5, v: FRIEND[sex][d][3] }));
    if (index >= pts[0].v) return { age: 25, edge: 'young' };
    if (index <= pts[pts.length - 1].v) return { age: 75, edge: 'old' };
    for (let k = 1; k < pts.length; k++) {
      if (index >= pts[k].v) {
        const f = (pts[k - 1].v - index) / (pts[k - 1].v - pts[k].v);
        return { age: pts[k - 1].age + f * 10, edge: null };
      }
    }
    return null;
  }

  /** 또래 표에서 바로 위 단계(25·50·75·90·95백분위)와 그 값 */
  function nextTier(index, sex, age) {
    const pr = peerRow(sex, age);
    if (!pr) return null;
    for (let k = 2; k < pr.v.length; k++) if (index < pr.v[k]) return { pct: pr.pct[k], value: pr.v[k], gap: pr.v[k] - index };
    return null;
  }

  /** 12분 달리기(Cooper 1968): 달린 거리(m) → VO2max 추정 */
  const cooper = meters => (meters - 504.9) / 44.73;
  /** 1.6km 빨리 걷기(Kline 1987, Rockport): 체중 kg, 나이, 성별, 걸린 시간(분), 직후 심박 */
  const rockport = o => 132.853 - 0.0769 * (o.kg * 2.20462) - 0.3877 * o.age + 6.315 * (o.sex === 'M' ? 1 : 0) - 3.2649 * o.min - 0.1565 * o.hr;

  /* ── 심박: 최대심박 추정(Tanaka 2001)과 다니엘스 강도별 최대심박 비율 ── */
  const estMaxHr = age => 208 - 0.7 * age;
  const HR_ZONES = [
    { z: 'E', lo: 0.65, hi: 0.79 },
    { z: 'M', lo: 0.80, hi: 0.89 },
    { z: 'T', lo: 0.88, hi: 0.92 },
    { z: 'I', lo: 0.98, hi: 1.00 },
  ];
  const hrZones = max => HR_ZONES.map(o => ({ z: o.z, lo: Math.round(max * o.lo), hi: Math.round(max * o.hi) }));

  /* ── 한 번에 뛰는 거리 급증 분류(Frandsen 2025, BJSM) ── */
  function spike(longest, planned) {
    if (!(longest > 0) || !(planned > 0)) return null;
    const pct = (planned - longest) / longest * 100;
    let level, hrr;
    if (pct <= 10) { level = 0; hrr = 1; }
    else if (pct <= 30) { level = 1; hrr = 1.64; }
    else if (pct <= 100) { level = 2; hrr = 1.52; }
    else { level = 3; hrr = 2.28; }
    return { pct, level, hrr, cap: longest * 1.1 };
  }

  /* ── 신발 ── */
  const SHOE_TYPES = {
    daily: { label: '데일리 쿠션화·안정화', lo: 500, hi: 800 },
    light: { label: '경량·레이싱화', lo: 400, hi: 600 },
    trail: { label: '트레일화', lo: 500, hi: 800 },
  };
  /** 신발 누적 거리 상태. 0 여유, 1 점검 시작, 2 교체 구간, 3 교체 권장 */
  function shoeStatus(type, km) {
    const t = SHOE_TYPES[type] || SHOE_TYPES.daily;
    const level = km > t.hi ? 3 : km >= t.lo ? 2 : km >= t.lo * 0.8 ? 1 : 0;
    return { level, lo: t.lo, hi: t.hi, toLo: Math.max(0, t.lo - km), toHi: Math.max(0, t.hi - km) };
  }

  /* ── 표시 형식 ── */
  const pad = n => String(n).padStart(2, '0');
  function fmtPace(sec) { const s = Math.round(sec); return Math.floor(s / 60) + ':' + pad(s % 60); }
  function fmtTime(minutes) {
    const s = Math.round(minutes * 60), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
    return h ? h + ':' + pad(m) + ':' + pad(s % 60) : m + ':' + pad(s % 60);
  }

  return {
    runIndex, raceMinutes, paces, predictions, RACES, kmh,
    splits, goalCheck, weekPlan,
    dayNum, weekIdx, dayLabel, logStats,
    FRIEND, peerRow, peerPercentile, fitnessAge, nextTier, cooper, rockport,
    estMaxHr, hrZones, spike, shoeStatus, SHOE_TYPES,
    fmtPace, fmtTime,
  };
})();
if (typeof module !== 'undefined') module.exports = Core;
