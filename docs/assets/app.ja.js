/* 화면 동작. 화면에 있는 도구만 초기화하므로 한 장짜리 미리보기와 도구별 페이지에서 같은 파일을 쓴다. */
(() => {
  'use strict';

  /* 사이트 설정은 site.config.json에서 빌드할 때 window.SITE로 들어온다 */
  const SITE = Object.assign({ mode: 'artifact', lang: 'ko', brand: 'ランジス', siteUrl: '', partnerLinks: {}, paths: null, pwa: false }, window.SITE || {});
  const BRAND = SITE.brand;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  const pad = n => String(n).padStart(2, '0');
  const km1 = v => (Math.round(v * 10) / 10).toString();
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const range = (a, b, f) => f(Math.min(a, b)) + '~' + f(Math.max(a, b));
  const showErr = (el, msg) => { if (el) { el.textContent = msg || ''; el.hidden = !msg; } };
  const href = v => SITE.paths ? SITE.paths[v] : '#' + v;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const isoDay = n => new Date(n * 86400000).toISOString().slice(0, 10);
  const checked = name => { const el = $$('input[name="' + name + '"]').find(i => i.checked); return el ? el.value : ''; };
  const check = (name, value) => { $$('input[name="' + name + '"]').forEach(i => { i.checked = i.value === value; }); };

  /** 이름 뒤 조사 고르기: J('런지수', '는') → 런지수는 */
  const JOSA = { '는': ['는', '은'], '가': ['가', '이'], '를': ['를', '을'], '와': ['와', '과'], '로': ['로', '으로'] };
  function J(word, key) {
    if (SITE.lang && SITE.lang !== 'ko') return word;   // 영어·일본어판에는 조사가 없다
    const c = word.charCodeAt(word.length - 1), pair = JOSA[key];
    if (c < 0xAC00 || c > 0xD7A3) return word + pair[0];
    const jong = (c - 0xAC00) % 28;
    return word + ((jong === 0 || (key === '로' && jong === 8)) ? pair[0] : pair[1]);
  }

  /* 저장: 브라우저 저장소가 막혀 있어도 화면을 닫기 전까지는 기억한다 */
  const mem = Object.create(null);
  const store = {
    get(k, d) {
      if (k in mem) return mem[k];
      try { const v = localStorage.getItem('rj:' + k); if (v != null) return (mem[k] = JSON.parse(v)); } catch (e) { /* 저장 없이 동작 */ }
      return d;
    },
    set(k, v) { mem[k] = v; try { localStorage.setItem('rj:' + k, JSON.stringify(v)); } catch (e) { /* 저장 없이 동작 */ } },
  };

  function copyText(btn, text) {
    const label = btn.dataset.label || (btn.dataset.label = btn.textContent);
    const done = t => { btn.textContent = t; setTimeout(() => { btn.textContent = label; }, 1600); };
    if (!text) return;
    try { navigator.clipboard.writeText(text).then(() => done('コピーしました'), () => done('コピーできませんでした')); }
    catch (err) { done('コピーできませんでした'); }
  }
  const sourceLine = () => BRAND + (SITE.siteUrl ? ' ' + SITE.siteUrl : '');

  /* ── 모든 도구가 함께 쓰는 값: 첫 화면에서 넣은 기록과 런지수 ── */
  const DIST_LABEL = { '3000': '3K', '5000': '5K', '10000': '10K', '21097.5': 'ハーフ', '42195': 'フル' };
  const HOME_DEFAULT = { dist: '10000', km: '', h: '', m: '55', s: '00', age: '', sex: '', example: true };
  const loadHome = () => Object.assign({}, HOME_DEFAULT, store.get('home', null) || {});
  function evalHome(h) {
    const custom = h.dist === 'custom';
    const meters = custom ? num(h.km) * 1000 : parseFloat(h.dist);
    const minutes = (num(h.h) || 0) * 60 + (num(h.m) || 0) + (num(h.s) || 0) / 60;
    let msg = '';
    if (custom && !(meters > 0)) msg = '走った距離をkmで入力してください。';
    else if (meters < 800 || meters > 100000) msg = '距離は0.8kmから100kmの間で入力してください。';
    else if (!(minutes > 0)) msg = 'タイムを入力してください。';
    else {
      const sec = minutes * 60 / (meters / 1000);
      if (sec < 120) msg = 'キロ2分より速い記録です。距離とタイムを確認してください。';
      else if (sec > 900) msg = 'キロ15分より遅い記録は計算できません。距離とタイムを確認してください。';
    }
    if (msg) return { msg };
    const distLabel = custom ? (Math.round(meters / 10) / 100) + 'km' : DIST_LABEL[h.dist];
    return { idx: Core.runIndex(meters, minutes), meters, minutes, basis: distLabel + ' ' + Core.fmtTime(minutes) };
  }
  function currentIndex() {
    const h = loadHome();
    let r = evalHome(h), example = !!h.example;
    if (r.msg) { r = evalHome(HOME_DEFAULT); example = true; }
    return { idx: r.idx, basis: r.basis, example, long: r.meters >= 21000 };
  }
  /** 다른 도구 위에 놓이는 "지금 기준 런지수" 한 줄 */
  function renderBasis() {
    const c = currentIndex();
    $$('[data-basis]').forEach(el => {
      el.innerHTML = `${esc(BRAND)} <b>${c.idx.toFixed(1)}</b><span>${esc(c.basis)}基準${c.example ? '・例の記録' : ''}</span><a href="${href('home')}">${c.example ? '自分の記録を入れる' : '記録を変える'} →</a>`;
    });
    return c;
  }

  /* ── 방문 분석(GA4를 켰을 때만): 어떤 도구와 링크가 쓰이는지 ── */
  function track(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, Object.assign({ page_lang: SITE.lang }, params || {})); } catch (e) { /* 분석 실패는 무시 */ }
  }
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('a,button');
    if (!t) return;
    if (t.matches('.shop')) track('shop_click', { item: t.dataset.shop || '', partner: SITE.partnerLinks[t.dataset.shop] ? 1 : 0 });
    else if (t.matches('[data-ics]')) track('ics_download', { kind: t.dataset.ics });
    else if (t.matches('[data-carry]')) track('carry_click', { to: (t.getAttribute('href') || '').split('?')[0] });
    else if (t.matches('[data-goal]')) { const r = t.closest('[data-name]'); track('goal_race', { race: r ? r.dataset.name : '' }); }
    else if (['copy-result', 'copy-link', 'crew-copy', 'share-img'].includes(t.id)) track('share', { what: t.id });
    else if (t.tagName === 'A' && /^https?:/.test(t.href) && t.closest('.race, .rc, .race-facts')) track('race_link', { host: t.hostname });
  }, true);
  /* 카카오 애드핏: 좁은 화면은 320×100, 넓은 화면은 728×90 단위 */
  (function adfit() {
    const slots = $$('.ad-fit');
    if (!slots.length) return;
    const wide = !!(window.matchMedia && window.matchMedia('(min-width: 760px)').matches);
    let any = false;
    slots.forEach(el => {
      const useD = wide && el.dataset.d, unit = useD ? el.dataset.d : (el.dataset.m || el.dataset.d);
      if (!unit) return;
      const big = useD || (!el.dataset.m && el.dataset.d);
      el.innerHTML = `<ins class="kakao_ad_area" style="display:none" data-ad-unit="${esc(unit)}" data-ad-width="${big ? 728 : 320}" data-ad-height="${big ? 90 : 100}"></ins>`;
      any = true;
    });
    if (any) { const sc = document.createElement('script'); sc.async = true; sc.src = 'https://t1.daumcdn.net/kas/static/ba.min.js'; document.body.appendChild(sc); }
  })();

  /* ── 주소로 받은 기록: ?dist=10&time=3300(km·초), ?d=10000&t=3300(m·초), 나이·성별, 대회 계획 ?rd=42195&goal=14400, 훈련표 ?pg=full ── */
  (function readParams() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (!location.search) return;
    let used = false;
    const dm = num(q.get('d')), dk = num(q.get('dist')), t = num(q.get('t') || q.get('time'));
    const meters = dm > 0 ? dm : dk > 0 ? dk * 1000 : NaN;
    if (meters > 0 && t > 0) {
      const h = loadHome(), known = Object.keys(DIST_LABEL).find(k => Math.abs(parseFloat(k) - meters) < 1), sec = Math.round(t);
      Object.assign(h, { dist: known || 'custom', km: known ? '' : String(Math.round(meters / 10) / 100), h: String(Math.floor(sec / 3600)), m: pad(Math.floor(sec % 3600 / 60)), s: pad(sec % 60), example: false });
      if (!evalHome(h).msg) { store.set('home', h); used = true; }
    }
    const age = parseInt(q.get('age'), 10), sex = q.get('sex');
    if ((age >= 10 && age <= 99) || sex === 'M' || sex === 'F') {
      const h = loadHome();
      if (age >= 10 && age <= 99) h.age = String(age);
      if (sex === 'M' || sex === 'F') h.sex = sex;
      store.set('home', h); used = true;
    }
    const rd = q.get('rd'), goal = num(q.get('goal'));
    if (['5000', '10000', '21097.5', '42195'].includes(rd) && goal > 0) {
      const r = Object.assign({ mode: 'even' }, store.get('race', null) || {}), sec = Math.round(goal);
      Object.assign(r, { dist: rd, h: String(Math.floor(sec / 3600)), m: pad(Math.floor(sec % 3600 / 60)), s: pad(sec % 60), auto: false });
      store.set('race', r); used = true;
    }
    const pg = q.get('pg');
    if (['base', '10k', 'half', 'full'].includes(pg)) {
      store.set('plan', Object.assign({}, store.get('plan', null) || {}, { goal: pg, example: false })); used = true;
    }
    if (used && history.replaceState) { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* 그대로 둔다 */ } }
  })();
  /** 지금 기록을 주소 뒤에 붙일 값으로: dist=km, time=초 */
  function recordQuery() {
    const h = loadHome(), r = evalHome(h);
    if (r.msg || h.example) return '';
    let q = 'dist=' + (Math.round(r.meters) / 1000) + '&time=' + Math.round(r.minutes * 60);
    if (num(h.age) > 0) q += '&age=' + num(h.age);
    if (h.sex === 'M' || h.sex === 'F') q += '&sex=' + h.sex;
    return q;
  }

  /* ── 캘린더 파일(.ics): 대회일은 7일 전·전날 알림, 접수 알림은 전날 알림 ── */
  function icsFile(kind, date, title, url) {
    const d = date.replace(/-/g, ''), next = new Date(date + 'T00:00:00'); next.setDate(next.getDate() + 1);
    const d2 = next.getFullYear() + pad(next.getMonth() + 1) + pad(next.getDate());
    const now = new Date(), stamp = now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' + pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + '00Z';
    const clean = x => String(x).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const summary = kind === 'reg' ? title + ' — ' + 'エントリー時期を確認' : title;
    const desc = (kind === 'reg' ? '昨年のエントリー時期をもとにしたリマインダーです。正確なエントリー日は公式サイトで確認してください。' : '') + url + '\n' + sourceLine();
    const alarm = t => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + clean(summary), 'TRIGGER:' + t, 'END:VALARM'];
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + clean(BRAND) + '//race//KO', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:' + d + '-' + kind + '-' + Math.abs([...title].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)) + '@' + (SITE.siteUrl || 'runjisu').replace(/^https?:\/\//, ''),
      'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + d2, 'SUMMARY:' + clean(summary), 'DESCRIPTION:' + clean(desc), 'URL:' + url]
      .concat(kind === 'reg' ? alarm('-P1D') : alarm('-P7D').concat(alarm('-P1D')), ['END:VEVENT', 'END:VCALENDAR']);
    const fold = l => {            // 한 줄 75바이트 넘으면 접는다(달력 파일 규칙)
      let out = '', n = 0;
      for (const ch of l) { const w = ch.charCodeAt(0) < 128 ? 1 : ch.codePointAt(0) < 2048 ? 2 : ch.codePointAt(0) < 65536 ? 3 : 4; if (n + w > 74) { out += '\r\n '; n = 1; } out += ch; n += w; }
      return out;
    };
    return lines.map(fold).join('\r\n') + '\r\n';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ics]');
    if (!b) return;
    const text = icsFile(b.dataset.ics, b.dataset.icsDate, b.dataset.icsTitle, b.dataset.icsUrl || '');
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      a.download = (b.dataset.ics === 'reg' ? 'entry-' : 'race-') + b.dataset.icsDate + '.ics';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (err) { /* 내려받기를 막은 환경 */ }
  });

  const refreshers = {};      // 화면 이름 → 다시 그리기 (한 장짜리에서 화면을 옮길 때 쓴다)

  /* ── 제휴 링크 ── */
  $$('.shop').forEach(a => { const u = SITE.partnerLinks[a.dataset.shop]; if (u) { a.href = u; a.rel = 'noopener sponsored'; } });

  /** lower: 달리기 기록에서 나온 값. 실험실 VO2max보다 낮게 나오는 편이라 '적어도 이 순위'로 적는다 */
  function pctText(pp, lower) {
    const top = 100 - pp.pct;
    if (pp.edge === 'high') return '上位5%以内';
    if (pp.edge === 'low') return lower ? '下位5%付近' : '下位5%以内';
    if (lower) return '上位約' + Math.round(top) + '%以内';
    return top <= 50 ? '上位約' + Math.round(top) + '%' : '下位約' + Math.round(pp.pct) + '%';
  }
  const ageText = (fa, lower) => fa.edge === 'young' ? '20代平均以上' : fa.edge === 'old' ? '70代平均以下' : '約{n}歳'.replace('{n}', Math.round(fa.age)) + (lower ? '以下' : '');
  const LOWER_NOTE = 'レース記録から求めた値は実験室で測ったVO2maxより低く出がちなので、実際の体力年齢はこれより若く、順位はこれより高い可能性が高いです。';
  const LONG_NOTE = '特にハーフやフルの記録には持久力や補給も混ざるため、5K・10Kの記録から求めた値よりさらに低く出やすくなります。全力で走った5Kか10Kの記録があれば、その記録で計算し直してみてください。';

  /* ───────── 런지수 ───────── */
  (function initHome() {
    const form = $('#f-home'); if (!form) return;
    const home = loadHome();
    let lastIndex = null, lastSummary = '', shown = null, raf = 0, lastData = null, shareFile = null;

    function fill() {
      check('dist', DIST_LABEL[home.dist] || home.dist === 'custom' ? home.dist : '10000');
      $('#d-km').value = home.km; $('#t-h').value = home.h; $('#t-m').value = home.m; $('#t-s').value = home.s;
      $('#age').value = home.age; check('sex', home.sex);
    }
    function read() {
      home.dist = checked('dist') || '10000';
      home.km = $('#d-km').value.trim(); home.h = $('#t-h').value.trim(); home.m = $('#t-m').value.trim(); home.s = $('#t-s').value.trim();
      home.age = $('#age').value.trim(); home.sex = checked('sex');
    }
    function setBib(v) {
      const el = $('#bib-num'), to = Math.round(v * 10) / 10;
      cancelAnimationFrame(raf);
      if (shown == null || reduceMotion || shown === to) { el.textContent = to.toFixed(1); shown = to; return; }
      const from = shown, t0 = performance.now();
      shown = to;
      const step = now => {
        const k = Math.min(1, (now - t0) / 420), e = 1 - Math.pow(1 - k, 3);
        el.textContent = (from + (to - from) * e).toFixed(1);
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    function setLane(id, fast, slow, rSec) {
      const el = $('#lane-' + id), one = slow == null;
      const lap = s => Core.fmtPace(s * 0.4), k = s => Core.kmh(s).toFixed(1);
      $('.pace', el).textContent = one ? Core.fmtPace(fast) : range(fast, slow, Core.fmtPace);
      $('.lap', el).textContent = one ? lap(fast) : range(fast, slow, lap);
      $('.kmh', el).textContent = (one ? k(fast) : k(slow) + '~' + k(fast)) + 'km/h';
      el.style.setProperty('--w', Math.min(100, rSec / fast * 100).toFixed(1) + '%');
    }
    function renderPeer(idx) {
      const age = num(home.age), sex = home.sex;
      const elAge = $('#peer-age'), elPct = $('#peer-pct'), elGroup = $('#peer-group');
      const base = '比較の基準は米国成人7,783人の運動負荷試験データ（FRIEND、2015）です。';
      if (idx == null || !sex || !Number.isFinite(age)) {
        elAge.textContent = '–'; elPct.textContent = '–'; elGroup.textContent = '同じ年代が基準';
        $('#peer-note').textContent = `年齢と性別を入れると、あなたの${J(BRAND, '가')}がどの年代の平均と同じか、同年代の中でどのあたりかをお見せします。` + base;
        return;
      }
      const fa = Core.fitnessAge(idx, sex), pp = Core.peerPercentile(idx, sex, age);
      const r = evalHome(home), long = !r.msg && r.meters >= 21000;
      elAge.textContent = ageText(fa, true);
      if (!pp) { elPct.textContent = '–'; elGroup.textContent = '20〜79歳のみ比較できます'; }
      else { elPct.textContent = pctText(pp, true); elGroup.textContent = pp.decade + '代' + (sex === 'M' ? '男性' : '女性') + '基準'; }
      $('#peer-note').textContent = LOWER_NOTE + (long ? LONG_NOTE : '') + ' ' + base;
    }
    function renderGates(pr) {
      pr.forEach(p => {
        const el = $('#gate-' + p.id); if (!el) return;
        const g = Core.gate(p.id, p.minutes);
        $('.k', el).textContent = p.label + ' ' + Core.fmtTime(p.minutes);
        $('.big', el).textContent = g.passed ? g.passedLabel : '最初の関門の手前';
        $('.cap', el).textContent = g.next ? g.nextLabel + 'まで' + Core.fmtTime(g.gapSec / 60) + '短縮' : '最も速い関門を通過しました';
        $('.gbar i', el).style.setProperty('--w', (g.progress * 100).toFixed(0) + '%');
      });
    }
    /* 공유 이미지: 배번표를 1080×1350 그림으로 그린다 */
    const F_NUM = '"Barlow Condensed","Arial Narrow","Roboto Condensed",sans-serif';
    const F_BODY = '"IBM Plex Sans KR","Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    const F_HEAD = '"Black Han Sans",' + F_BODY;
    const LATIN = (($('.bib-top span') || {}).textContent || BRAND).trim();
    const HOST = SITE.siteUrl ? SITE.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : LATIN;
    function fontsReady() {
      if (!document.fonts || !document.fonts.load) return Promise.resolve();
      const ko = BRAND + 'トレーニングペース 予想タイム 基準 ハーフ フル 同じレベルで準備した場合 記録一つでわかるあなたの 直接入力';
      const all = Promise.all([
        document.fonts.load('800 100px "Barlow Condensed"', '0123456789.:~EMTIRK' + LATIN),
        document.fonts.load('700 100px "Barlow Condensed"', '0123456789.:~EMTIRK' + LATIN + HOST),
        document.fonts.load('400 60px "Black Han Sans"', BRAND),
        document.fonts.load('600 30px "IBM Plex Sans KR"', ko), document.fonts.load('500 30px "IBM Plex Sans KR"', ko), document.fonts.load('700 30px "IBM Plex Sans KR"', ko),
      ]).catch(() => { /* 기본 글꼴로 그린다 */ });
      return Promise.race([all, new Promise(res => setTimeout(res, 2500))]);
    }
    function drawShare(d) {
      const W = 1080, H = 1350, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const x = cv.getContext('2d');
      const INK = '#101a2b', SUB = '#51607a', LINE = '#c5ccd8', BAND = '#1f47e6', PAPER = '#fbfaf5';
      const cx = 70, cy = 76, cw = W - 140, ch = 1112, mid = W / 2;
      const box = (l, t, w, h, r) => { x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r); x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath(); };
      const sp = v => { if ('letterSpacing' in x) x.letterSpacing = v; };
      const text = (s, px, py, font, color, align, max) => {
        x.font = font;
        if (max) { const w = x.measureText(s).width; if (w > max) x.font = font.replace(/(\d+)px/, (m0, n) => Math.floor(n * max / w) + 'px'); }
        x.fillStyle = color; x.textAlign = align || 'center'; x.fillText(s, px, py);
      };
      const dash = (y, l, r) => { x.save(); x.setLineDash([14, 11]); x.strokeStyle = LINE; x.lineWidth = 3; x.beginPath(); x.moveTo(l, y); x.lineTo(r, y); x.stroke(); x.restore(); };
      const vdash = (px, t, b) => { x.save(); x.setLineDash([10, 9]); x.strokeStyle = LINE; x.lineWidth = 3; x.beginPath(); x.moveTo(px, t); x.lineTo(px, b); x.stroke(); x.restore(); };
      x.fillStyle = INK; x.fillRect(0, 0, W, H);
      x.textBaseline = 'alphabetic';
      box(cx, cy, cw, ch, 26); x.fillStyle = PAPER; x.fill();
      x.save(); box(cx, cy, cw, ch, 26); x.clip(); x.fillStyle = BAND; x.fillRect(cx, cy, cw, 112); x.restore();
      [[cx + 38, cy + 56], [cx + cw - 38, cy + 56], [cx + 38, cy + ch - 36], [cx + cw - 38, cy + ch - 36]].forEach(p => { x.beginPath(); x.arc(p[0], p[1], 11, 0, Math.PI * 2); x.fillStyle = INK; x.fill(); });
      sp('7px'); text(LATIN, cx + 76, cy + 72, '700 46px ' + F_NUM, '#fff', 'left', cw * 0.4); sp('0px');
      text(d.basis + '基準', cx + cw - 76, cy + 68, '600 30px ' + F_BODY, '#fff', 'right', cw * 0.42);
      text(d.idx.toFixed(1), mid, cy + 500, '800 440px ' + F_NUM, INK, 'center', cw - 150);
      text(BRAND, mid, cy + 592, '400 66px ' + F_HEAD, INK);
      dash(cy + 640, cx + 40, cx + cw - 40);
      text('同じレベルで準備した場合の予想タイム', mid, cy + 692, '600 28px ' + F_BODY, SUB);
      const pw = (cw - 80) / 4;
      d.pr.forEach((p, i) => {
        const px = cx + 40 + pw * i + pw / 2;
        if (i) vdash(cx + 40 + pw * i, cy + 716, cy + 826);
        text(p.label, px, cy + 748, '700 30px ' + F_BODY, SUB);
        text(Core.fmtTime(p.minutes), px, cy + 818, '700 66px ' + F_NUM, INK, 'center', pw - 26);
      });
      dash(cy + 856, cx + 40, cx + cw - 40);
      text('トレーニングペース /km', mid, cy + 908, '600 28px ' + F_BODY, SUB);
      const z = d.z, zones = [
        ['E', '#0f8f68', range(z.eFast, z.eSlow, Core.fmtPace), 1.7], ['M', '#0b7fb3', Core.fmtPace(z.m), 1],
        ['T', '#b57f00', Core.fmtPace(z.t), 1], ['I', '#dc5219', Core.fmtPace(z.i), 1], ['R', '#c81d57', Core.fmtPace(z.r), 1],
      ];
      const unit = (cw - 80) / zones.reduce((a, q) => a + q[3], 0);
      let left = cx + 40;
      zones.forEach(q => {
        const w = unit * q[3], px = left + w / 2;
        box(px - 30, cy + 932, 60, 50, 10); x.fillStyle = q[1]; x.fill();
        text(q[0], px, cy + 971, '700 38px ' + F_NUM, '#fff');
        text(q[2], px, cy + 1040, '700 54px ' + F_NUM, INK, 'center', w - 22);
        left += w;
      });
      sp('4px'); text(HOST, cx + 6, cy + ch + 96, '700 46px ' + F_NUM, '#fff', 'left', cw * 0.48); sp('0px');
      text('記録一つでわかるあなたの' + BRAND, cx + cw - 6, cy + ch + 92, '500 30px ' + F_BODY, '#9aa8be', 'right', cw * 0.46);
      return cv;
    }
    function hideShare() { const o = $('#share-out'); if (o) o.hidden = true; shareFile = null; }
    function render() {
      $('#custom-row').hidden = home.dist !== 'custom';
      $('#bib-ex').hidden = !home.example;
      const r = evalHome(home);
      showErr($('#home-err'), r.msg);
      $('#bib').classList.toggle('stale', !!r.msg);
      if (r.msg) { renderPeer(lastIndex); return; }
      const idx = r.idx, z = Core.paces(idx), pr = Core.predictions(idx);
      lastIndex = idx;
      setBib(idx);
      $('#bib-basis').textContent = r.basis + '基準';
      pr.forEach(p => { $('#pr-' + p.id).textContent = Core.fmtTime(p.minutes); });
      setLane('e', z.eFast, z.eSlow, z.r); setLane('m', z.m, null, z.r); setLane('t', z.t, null, z.r); setLane('i', z.i, null, z.r); setLane('r', z.r, null, z.r);
      $('#range-note').textContent = (r.minutes < 3.5 || r.minutes > 240)
        ? 'この記録は公式がよく当てはまる範囲（約3分30秒〜4時間）を外れているため、誤差が大きいことがあります。'
        : `${J(BRAND, '는')}は、レース記録から逆算した有酸素能力の指数です。`;
      renderPeer(idx);
      renderGates(pr);
      lastData = { idx, basis: r.basis, z, pr }; hideShare();
      lastSummary = [
        `あなたの${BRAND} ${idx.toFixed(1)} (${r.basis}基準）`,
        `トレーニングペース /km  E ${range(z.eFast, z.eSlow, Core.fmtPace)} · M ${Core.fmtPace(z.m)} · T ${Core.fmtPace(z.t)} · I ${Core.fmtPace(z.i)} · R ${Core.fmtPace(z.r)}`,
        '予想タイム' + pr.map(p => p.label + ' ' + Core.fmtTime(p.minutes)).join(' · '),
        sourceLine(),
      ].join('\n');
    }
    let tracked = false;
    function onInput() {
      read(); home.example = false; store.set('home', home); render();
      if (!tracked && lastData) { tracked = true; setTimeout(() => track('calc_record', { dist: home.dist }), 1500); }
    }
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('submit', e => e.preventDefault());
    /* 빠른 선택: 기록이 없는 사람도 바로 결과를 본다 */
    $$('.quick .chip', form).forEach(b => b.addEventListener('click', () => {
      const [d, h, m, sec] = b.dataset.q.split(' ');
      const r = form.querySelector(`input[name="dist"][value="${d}"]`); if (r) r.checked = true;
      $('#custom-row').hidden = true;
      $('#t-h').value = h; $('#t-m').value = m; $('#t-s').value = sec;
      form.dispatchEvent(new Event('input', { bubbles: true }));
      track('quick_pick', { value: b.dataset.q });
    }));
    const see = $('#see-result');
    if (see) see.addEventListener('click', () => { const b = $('#bib'); if (b) b.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); });
    function onPeer() { read(); store.set('home', home); renderPeer(lastIndex); }
    ['age', 'sex-m', 'sex-f'].forEach(id => { const el = $('#' + id); el.addEventListener('input', onPeer); el.addEventListener('change', onPeer); });
    $('#copy-result').addEventListener('click', e => copyText(e.currentTarget, lastSummary));
    function carryLinks() {
      const q = recordQuery();
      if (SITE.mode === 'site') $$('[data-carry]').forEach(a => { a.href = a.href.split('?')[0].split('#')[0] + (q ? '?' + q : ''); });
      const cl = $('#copy-link'); if (cl) cl.hidden = !q || SITE.mode !== 'site';
    }
    const linkBtn = $('#copy-link');
    if (linkBtn) linkBtn.addEventListener('click', e => {
      const q = recordQuery(); if (!q) return;
      copyText(e.currentTarget, location.origin + location.pathname + '?' + q);
    });
    form.addEventListener('input', () => setTimeout(carryLinks, 0));
    form.addEventListener('change', () => setTimeout(carryLinks, 0));
    carryLinks();
    const shareBtn = $('#share-img');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        if (!lastData) return;
        const d = lastData, name = LATIN.toLowerCase().replace(/[^a-z0-9]+/g, '') + '-' + d.idx.toFixed(1) + '.png';
        shareBtn.disabled = true;
        fontsReady().then(() => {
          const cv = drawShare(d), url = cv.toDataURL('image/png');
          const pic = $('#share-pic'), save = $('#share-save'), send = $('#share-send'), out = $('#share-out');
          pic.src = url; pic.alt = `あなたの${BRAND} ${d.idx.toFixed(1)}の結果画像`;
          save.href = url; save.download = name;
          send.hidden = true; out.hidden = false; shareBtn.disabled = false;
          if (out.scrollIntoView) out.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
          if (cv.toBlob && typeof File === 'function') cv.toBlob(b => {
            if (!b || out.hidden) return;
            try {
              const f = new File([b], name, { type: 'image/png' });
              if (navigator.canShare && navigator.canShare({ files: [f] })) { shareFile = f; send.hidden = false; }
            } catch (e) { /* 공유 기능이 없는 브라우저는 저장만 */ }
          }, 'image/png');
        }).catch(() => { shareBtn.disabled = false; });
      });
      $('#share-send').addEventListener('click', () => {
        if (shareFile && navigator.share) navigator.share({ files: [shareFile], title: `あなたの${BRAND} ${lastData.idx.toFixed(1)}`, text: sourceLine() }).catch(() => { /* 닫으면 그대로 둔다 */ });
      });
    }
    refreshers.home = () => { Object.assign(home, loadHome()); fill(); render(); };
    fill(); render();
  })();


  /* ───────── 목표 대회: 대회 일정에서 고르고 대회 계획에서 이어 쓴다 ───────── */
  const daysTo = d => Core.dayNum(d) - Core.dayNum(today());
  const ddayText = n => n > 0 ? 'D-' + n : n === 0 ? 'D-DAY' : '終了';
  const getGoal = () => { const g = store.get('goal', null); return g && g.date && daysTo(g.date) >= 0 ? g : null; };
  function renderGoalLine() {
    const el = $('#rc-goal'); if (!el) return;
    const g = getGoal();
    el.hidden = !g;
    if (g) el.innerHTML = `目標大会 <b>${ddayText(daysTo(g.date))}</b><span>${esc(g.name)}</span><a href="${href('calendar')}">大会日程 →</a>`;
  }

  (function initCalendar() {
    const box = $('#goal-box'); if (!box) return;
    function render() {
      const g = getGoal();
      $$('.race').forEach(li => {
        const d = li.dataset.date, pill = $('[data-dday]', li), btn = $('[data-goal]', li);
        if (!d) return;
        const n = daysTo(d), isGoal = !!g && g.id === li.dataset.id;
        pill.textContent = ddayText(n); pill.hidden = false;
        li.classList.toggle('past', n < 0);
        li.classList.toggle('goal', isGoal);
        if (btn) { btn.hidden = n < 0; btn.textContent = isGoal ? (btn.dataset.on || '目標大会を解除') : (btn.dataset.off || '目標大会に設定'); btn.setAttribute('aria-pressed', isGoal ? 'true' : 'false'); }
      });
      box.innerHTML = g
        ? `あなたの目標大会 <b>${ddayText(daysTo(g.date))}</b><span>${esc(g.name)}</span><a href="${href('race')}" id="goal-plan">区間表をつくる →</a><button type="button" class="linkish" data-ics="race" data-ics-date="${esc(g.date)}" data-ics-title="${esc(g.name)}" data-ics-url="">カレンダーに追加</button>`
        : '<span>大会の横の☆目標を押すと残り日数を数え、レース計画画面にも引き継ぎます。</span>';
    }
    document.addEventListener('click', e => {
      const btn = e.target.closest && e.target.closest('[data-goal]');
      if (btn) {
        const li = btn.closest('.race'), g = getGoal();
        if (g && g.id === li.dataset.id) store.set('goal', null);
        else {
          store.set('goal', { id: li.dataset.id, name: li.dataset.name, date: li.dataset.date, dist: li.dataset.dist });
          const rs = Object.assign({ dist: '42195', h: '', m: '', s: '', mode: 'even', auto: true }, store.get('race', null) || {});
          if (['5000', '10000', '21097.5', '42195'].includes(li.dataset.dist) && rs.dist !== li.dataset.dist) { rs.dist = li.dataset.dist; rs.auto = true; store.set('race', rs); }
        }
        render();
      }
    });
    refreshers.calendar = render;
    render();
  })();

  /* ───────── 대회 계획 ───────── */
  (function initRace() {
    const form = $('#f-race'); if (!form) return;
    const st = Object.assign({ dist: '42195', h: '', m: '', s: '', mode: 'even', auto: true }, store.get('race', null) || {});
    const NAME = { '5000': '5K', '10000': '10K', '21097.5': 'ハーフ', '42195': 'フルマラソン' };
    const FINISH = { '5000': '5km', '10000': '10km', '21097.5': '21.0975km', '42195': '42.195km' };
    const PILL = ['今の実力の範囲内', '挑戦的な目標', '今は速すぎる目標'];
    let splitText = '';

    function setTime(min) { const s = Math.round(min * 60); st.h = String(Math.floor(s / 3600)); st.m = pad(Math.floor(s % 3600 / 60)); st.s = pad(s % 60); }
    function fillTime() { $('#rg-h').value = st.h; $('#rg-m').value = st.m; $('#rg-s').value = st.s; }
    function render() {
      renderGoalLine();
      const c = renderBasis(), meters = parseFloat(st.dist);
      if (st.auto) { setTime(Core.raceMinutes(c.idx, meters)); fillTime(); }
      $('#rc-ex').hidden = !(st.auto && c.example);
      const minutes = (num(st.h) || 0) * 60 + (num(st.m) || 0) + (num(st.s) || 0) / 60;
      let msg = '';
      if (!(minutes > 0)) msg = '目標タイムを入力してください。';
      else {
        const sec = minutes * 60 / (meters / 1000);
        if (sec < 120) msg = 'キロ2分より速い目標です。タイムを確認してください。';
        else if (sec > 900) msg = 'キロ15分より遅い目標は計算できません。タイムを確認してください。';
      }
      showErr($('#race-err'), msg);
      if (msg) return;

      const sp = Core.splits(meters, minutes, st.mode), g = Core.goalCheck(c.idx, meters, minutes);
      $('#race-res').dataset.level = g.level;
      $('#rc-pace').innerHTML = Core.fmtPace(sp.avg) + '<small>/km</small>';
      $('#rc-pill').textContent = PILL[g.level];
      $('#rc-kmh').textContent = Core.kmh(sp.avg).toFixed(1) + 'km/h';
      $('#rc-lap').textContent = Core.fmtPace(sp.avg * 0.4);
      $('#rc-need').textContent = g.need.toFixed(1);
      const need = g.need.toFixed(1), cur = c.idx.toFixed(1), gap = Math.abs(g.gap).toFixed(1);
      let text;
      const both = `この目標に必要な${J(BRAND, '는')} ${need}、今の${J(BRAND, '는')} ${cur}です。`;
      if (g.level === 0 && g.gap < -1.5) text = both + '余裕のある目標です。';
      else if (g.level === 0) text = both + 'ほぼ同じなので、準備が整えば狙える目標です。';
      else if (g.level === 1) text = both + ` ${gap}足りませんが、あと数週間練習を積めば届く範囲です。レース当日、最初の数kmは区間表より速く行かないでください。`;
      else text = both + ` ${gap}足りません。このペースでスタートすると、後半に大きく失速する可能性が高いです。今の${J(BRAND, '로')}で見た${NAME[st.dist]}の予想タイムは${Core.fmtTime(Core.raceMinutes(c.idx, meters))}です。`;
      $('#rc-msg').textContent = text;
      const notes = [];
      if (st.mode === 'neg') notes.push(`前半はキロ${Core.fmtPace(sp.first)}、後半は${Core.fmtPace(sp.second)}に分けました。平均より1.5%ずつ遅い・速いペースです。`);
      if (st.dist === '42195') notes.push(`短い距離の記録から出た${J(BRAND, '로')}で見たフルの目標は、30km以上のロング走が裏付けているときにだけ当てはまります。`);
      $('#rc-note').textContent = notes.join(' ');
      $('#rc-note').hidden = !notes.length;

      const half = meters / 2;
      const rows = sp.rows.map(r => {
        const last = Math.abs(r.to - meters) < 0.5, label = last ? 'ゴール' + FINISH[st.dist] : (r.to / 1000) + 'km';
        const mid = st.mode === 'neg' && r.from >= half - 0.5 && r.from - half < (r.to - r.from) - 0.5;
        return { label, pace: Core.fmtPace(r.pace), cum: Core.fmtTime(r.cum / 60), mid };
      });
      $('#split-rows').innerHTML = rows.map(r => `<tr${r.mid ? ' class="mid"' : ''}><td>${r.label}</td><td class="n">${r.pace}</td><td class="n">${r.cum}</td></tr>`).join('');
      splitText = [`${NAME[st.dist]}目標${Core.fmtTime(minutes)}・平均${Core.fmtPace(sp.avg)}/km`].concat(rows.map(r => `${r.label}  ${r.cum}  (${r.pace}/km)`), [sourceLine()]).join('\n');
    }
    function save() { store.set('race', st); }
    $$('input[name="rdist"]').forEach(i => i.addEventListener('change', () => { st.dist = checked('rdist'); st.auto = true; save(); render(); }));
    $$('input[name="rmode"]').forEach(i => i.addEventListener('change', () => { st.mode = checked('rmode'); save(); render(); }));
    ['rg-h', 'rg-m', 'rg-s'].forEach(id => $('#' + id).addEventListener('input', () => {
      st.h = $('#rg-h').value.trim(); st.m = $('#rg-m').value.trim(); st.s = $('#rg-s').value.trim(); st.auto = false; save(); render();
    }));
    $('#rg-fill').addEventListener('click', () => { st.auto = true; save(); render(); });
    $('#split-copy').addEventListener('click', e => copyText(e.currentTarget, splitText));
    form.addEventListener('submit', e => e.preventDefault());

    const ck = store.get('check', {});
    $$('#race-check input').forEach(i => {
      i.checked = !!ck[i.dataset.ck];
      i.addEventListener('change', () => { ck[i.dataset.ck] = i.checked; store.set('check', ck); });
    });

    refreshers.race = () => { Object.assign(st, store.get('race', null) || {}); check('rdist', st.dist); check('rmode', st.mode === 'neg' ? 'neg' : 'even'); fillTime(); render(); };
    if (!NAME[st.dist]) st.dist = '42195';
    check('rdist', st.dist); check('rmode', st.mode === 'neg' ? 'neg' : 'even'); fillTime(); render();
  })();

  /* ───────── 주간 훈련표 ───────── */
  (function initPlan() {
    const form = $('#f-plan'); if (!form) return;
    const st = Object.assign({ km: '30', days: '4', goal: '10k', example: true }, store.get('plan', null) || {});
    const DOW = ['月', '火', '水', '木', '金', '土', '日'];
    const CHIP = { E: 'e', L: 'e', T: 't', I: 'i', M: 'm' }, LETTER = { E: 'E', L: 'E', T: 'T', I: 'I', M: 'M' };
    let planText = '';

    function describe(d, p) {
      const z = p.paces, eR = range(z.eFast, z.eSlow, Core.fmtPace);
      if (d.role === 'rest') return { title: '休養日', pace: '', detail: 'ウォーキングか軽いストレッチ程度に。' };
      if (d.role === 'E') return { title: 'イージーラン', pace: eR, detail: '会話できる速さで。' + (d.strides ? '最後に20秒の流し4〜6本（全力の90%ほど、間は十分に歩く）。' : '') };
      if (d.role === 'L') return { title: 'ロング走', pace: eR, detail: `約${Math.round(p.longMin)}分。E範囲の遅い側から始めます。` };
      const s = d.session;
      if (d.role === 'T') return { title: '閾値走', pace: Core.fmtPace(z.t), detail: `ウォームアップ${km1(s.wu)}kmイージー → Tペースで1km × ${s.reps}本、間に1分歩く → クールダウン${km1(s.cd)}kmイージー。` };
      if (d.role === 'I') return { title: 'インターバル', pace: Core.fmtPace(z.i), detail: `ウォームアップ${km1(s.wu)}kmイージー → Iペースで${s.repM}m × ${s.reps}本（1本あたり約${Core.fmtPace(s.restSec)}）、間は走った時間だけゆっくりジョグ → クールダウン${km1(s.cd)}kmイージー。` };
      return { title: 'マラソンペース走', pace: Core.fmtPace(z.m), detail: `ウォームアップ${km1(s.wu)}kmイージー → Mペースで${km1(s.work)}km続けて走る → クールダウン${km1(s.cd)}kmイージー。` };
    }
    function render() {
      const c = renderBasis(), W = num(st.km);
      $('#pl-ex').hidden = !(st.example && c.example);
      const p = Core.weekPlan(c.idx, W, parseInt(st.days, 10), st.goal);
      showErr($('#plan-err'), p ? '' : '週間距離は10kmから160kmの間で入力してください。');
      if (!p) return;
      $('#pl-total').innerHTML = km1(p.total) + '<small>km</small>';
      $('#pl-days-cap').textContent = '週{n}日'.replace('{n}', p.runDays);
      $('#pl-easy').innerHTML = Math.round(p.easyShare * 100) + '<small>%</small>';
      $('#pl-long').innerHTML = km1(p.longKm) + '<small>km</small>';
      $('#pl-long-cap').textContent = `ロング走・約${Math.round(p.longMin)}分`;
      const lines = [];
      $('#plan-week').innerHTML = p.days.map(d => {
        const x = describe(d, p), rest = d.role === 'rest';
        lines.push(DOW[d.dow] + '  ' + x.title + (rest ? '' : ` ${km1(d.km)}km · ${x.pace}/km · ${x.detail}`));
        return `<li class="wk${rest ? ' rest' : ''}">
          <span class="wk-dow">${DOW[d.dow]}</span>
          <div class="wk-title">${rest ? '<span class="z off">–</span>' : `<span class="z" style="--zc:var(--${CHIP[d.role]})">${LETTER[d.role]}</span>`}${x.title}${x.pace ? `<span class="pc">${x.pace}/km</span>` : ''}</div>
          <div class="wk-km">${rest ? '' : km1(d.km) + '<small>km</small>'}</div>
          <p class="wk-detail">${x.detail}</p>
        </li>`;
      }).join('');
      const notes = [];
      if (p.adjustedFrom && p.runDays < p.adjustedFrom) notes.push(`週${km1(W)}kmを${p.adjustedFrom}日に分けると1日が3km未満になるため、${p.runDays}日に減らしました。`);
      if (p.adjustedFrom && p.runDays > p.adjustedFrom) notes.push(`週${km1(W)}kmを${p.adjustedFrom}日で走ると平日の1日がロング走より長くなるため、${p.runDays}日に増やしました。`);
      if (p.overload) notes.push(`このペースで週${km1(W)}kmは、6日に分けても1日150分を超えます。1日2回に分けるか、週間距離を見直してください。`);
      if (p.longCapped) notes.push('ロング走は150分で打ち切りました。それより長いと、得るものより回復にかかる時間の方が大きくなります。');
      else if (p.longShare > 0.31) notes.push(`ロング走が週間距離の${Math.round(p.longShare * 100)}%です。走る日が少ないために生じる比重なので、150分以内かどうかだけ確認してください。`);
      if (st.goal !== 'base' && p.quality === 0) notes.push(W < 20 ? '週20kmに満たないため、ポイント練習なしで組みました。距離が積み上がったら組み直してみてください。' : '軽い日が短くなりすぎるため、ポイント練習を外しました。');
      $('#plan-notes').textContent = notes.join(' ');
      $('#plan-notes').hidden = !notes.length;
      planText = [`1週間のメニュー・週${km1(p.total)}km · ${BRAND} ${c.idx.toFixed(1)}`].concat(lines, [sourceLine()]).join('\n');
    }
    function onInput() { st.km = $('#pl-km').value.trim(); st.days = checked('pdays') || '4'; st.goal = checked('pgoal') || '10k'; st.example = false; store.set('plan', st); render(); }
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('submit', e => e.preventDefault());
    $('#plan-copy').addEventListener('click', e => copyText(e.currentTarget, planText));
    refreshers.plan = render;
    $('#pl-km').value = st.km; check('pdays', st.days); check('pgoal', st.goal); render();
  })();

  /* ───────── 신발장과 달리기 기록이 함께 쓰는 자료 ───────── */
  const EXAMPLE_SHOES = [{ id: 'ex', name: 'デイリーランニングシューズ', type: 'daily', km: 430, wk: 30 }];
  const getShoes = () => store.get('shoes', null) || [];
  const getRuns = () => store.get('runs', null) || [];
  function exampleRuns() {
    const t = Core.dayNum(today());
    return [[1, 6, 'E'], [3, 8, 'T'], [5, 5, 'E'], [8, 12, 'L'], [10, 6, 'E'], [12, 7, 'I'], [15, 11, 'L'], [17, 5, 'E'], [19, 7, 'E'], [22, 10, 'L'], [24, 6, 'E'], [26, 6, 'T'], [29, 9, 'L'], [31, 5, 'E'], [33, 6, 'E'], [36, 8, 'L'], [40, 5, 'E'], [43, 7, 'L'], [47, 6, 'E'], [50, 5, 'E']]
      .map((r, k) => ({ id: 'ex' + k, d: isoDay(t - r[0]), km: r[1], kind: r[2] }));
  }

  /* ───────── 달리기 기록 ───────── */
  (function initLog() {
    const form = $('#f-log'); if (!form) return;
    const KIND = { E: 'イージーラン', L: 'ロング走', T: '閾値走', I: 'インターバル・レペ', M: 'マラソンペース', X: '大会' };
    const WD = ['日', '月', '火', '水', '木', '金', '土'];
    let showN = 8;

    function fillShoeSelect() {
      const shoes = getShoes(), sel = $('#lg-shoe'), keep = sel.value;
      sel.innerHTML = '<option value="">選ばない</option>' + shoes.map(s => `<option value="${esc(s.id)}">${esc(s.name)} (${km1(s.km)}km)</option>`).join('');
      if (shoes.some(s => s.id === keep)) sel.value = keep;
      $('#lg-shoe-note').innerHTML = shoes.length ? 'シューズを選ぶと、そのシューズの累積距離に加算されます。' : `シューズ棚にシューズを入れておくと、ここで選べます。<a href="${href('shoes')}">シューズを追加 →</a>`;
    }
    function render() {
      const real = getRuns(), isEx = !real.length, runs = isEx ? exampleRuns() : real;
      $('#lg-ex').hidden = !isEx;
      const s = Core.logStats(runs, today(), 8);
      $('#lg-week').innerHTML = km1(s.thisWeek) + '<small>km</small>';
      $('#lg-week-cap').textContent = '今週これまで・先週' + km1(s.lastWeek) + 'km';
      $('#lg-long').innerHTML = s.longest30 > 0 ? km1(s.longest30) + '<small>km</small>' : '–';
      $('#lg-cap').innerHTML = s.longest30 > 0 ? km1(s.cap) + '<small>km</small>' : '–';
      const max = Math.max(1, ...s.weeks.map(w => w.km));
      $('#lg-bars').innerHTML = s.weeks.map((w, k) => `<div class="bar${k === s.weeks.length - 1 ? ' now' : ''}"><b>${w.km ? km1(w.km) : ''}</b><i style="height:${Math.round(w.km / max * 112)}px"></i></div>`).join('');
      $('#lg-bar-labs').innerHTML = s.weeks.map(w => `<span>${w.label}</span>`).join('');
      const shoes = getShoes();
      const sorted = runs.slice().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : (a.id < b.id ? 1 : -1));
      $('#lg-list').innerHTML = sorted.slice(0, showN).map(r => {
        const dn = Core.dayNum(r.d), wd = WD[new Date(dn * 86400000).getUTCDay()];
        const shoe = r.shoe ? shoes.find(x => x.id === r.shoe) : null;
        const pace = r.min > 0 ? `${Core.fmtPace(r.min * 60 / r.km)}/km` : '';
        return `<li class="run" data-id="${esc(r.id)}">
          <span class="run-date">${Core.dayLabel(dn)} ${wd}</span>
          <div class="run-main"><b>${km1(r.km)}km</b>${pace ? `<span>${pace}</span>` : ''}</div>
          <div class="run-sub">${KIND[r.kind] || KIND.E}${shoe ? ' · ' + esc(shoe.name) : ''}</div>
          ${isEx ? '' : '<button type="button" class="btn ghost small" data-act="del">削除</button>'}
        </li>`;
      }).join('');
      $('#lg-more').hidden = sorted.length <= showN;
      fillShoeSelect();
    }
    form.addEventListener('submit', e => {
      e.preventDefault();
      const d = $('#lg-date').value, km = num($('#lg-km').value);
      const mm = $('#lg-min').value.trim(), ss = $('#lg-sec').value.trim();
      const min = (mm === '' && ss === '') ? 0 : (num(mm) || 0) + (num(ss) || 0) / 60;
      let msg = '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) msg = '日付を選んでください。';
      else if (d > today()) msg = '今日より後の日付は記録できません。';
      else if (!(km >= 0.1 && km <= 200)) msg = '距離は0.1kmから200kmの間で入力してください。';
      else if (min > 0 && (min * 60 / km < 120 || min * 60 / km > 1500)) msg = '距離とタイムが合いません。キロ2分から25分の間である必要があります。';
      showErr($('#log-err'), msg);
      if (msg) return;
      const run = { id: 'r' + Date.now().toString(36), d, km: Math.round(km * 100) / 100, kind: $('#lg-kind').value };
      if (min > 0) run.min = Math.round(min * 100) / 100;
      const shoeId = $('#lg-shoe').value;
      if (shoeId) {
        const shoes = getShoes(), s = shoes.find(x => x.id === shoeId);
        if (s) { s.km = Math.round((s.km + run.km) * 10) / 10; run.shoe = shoeId; store.set('shoes', shoes); }
      }
      store.set('runs', getRuns().concat(run));
      $('#lg-km').value = ''; $('#lg-min').value = ''; $('#lg-sec').value = '';
      render();
    });
    $('#lg-list').addEventListener('click', e => {
      const b = e.target.closest('button[data-act="del"]'); if (!b) return;
      if (!b.dataset.confirm) {
        b.dataset.confirm = '1'; b.textContent = 'もう一度';
        setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = '削除'; } }, 3000);
        return;
      }
      const id = b.closest('.run').dataset.id, runs = getRuns(), r = runs.find(x => x.id === id);
      if (!r) return;
      if (r.shoe) { const shoes = getShoes(), s = shoes.find(x => x.id === r.shoe); if (s) { s.km = Math.max(0, Math.round((s.km - r.km) * 10) / 10); store.set('shoes', shoes); } }
      store.set('runs', runs.filter(x => x.id !== id));
      render();
    });
    $('#lg-more').addEventListener('click', () => { showN += 12; render(); });
    $('#lg-backup').addEventListener('click', e => copyText(e.currentTarget, JSON.stringify({ app: 'run-tools', v: 1, runs: getRuns(), shoes: getShoes() })));
    $('#lg-restore-btn').addEventListener('click', () => {
      let o = null;
      try { o = JSON.parse($('#lg-restore').value); } catch (err) { o = null; }
      if (!o || !Array.isArray(o.runs) || !Array.isArray(o.shoes)) { showErr($('#restore-err'), 'バックアップの内容を読み取れませんでした。コピーした文章をすべてそのまま貼り付けたか確認してください。'); return; }
      const shoes = o.shoes.filter(s => s && typeof s.name === 'string' && Core.SHOE_TYPES[s.type] && s.km >= 0 && s.km <= 5000)
        .map((s, k) => ({ id: String(s.id || 's' + k), name: s.name.slice(0, 30), type: s.type, km: +s.km, wk: s.wk > 0 ? +s.wk : 0 }));
      const runs = o.runs.filter(r => r && /^\d{4}-\d{2}-\d{2}$/.test(r.d) && r.km > 0 && r.km <= 200)
        .map((r, k) => { const x = { id: String(r.id || 'r' + k), d: r.d, km: +r.km, kind: KIND[r.kind] ? r.kind : 'E' }; if (r.min > 0) x.min = +r.min; if (r.shoe && shoes.some(s => s.id === String(r.shoe))) x.shoe = String(r.shoe); return x; });
      store.set('shoes', shoes); store.set('runs', runs);
      showErr($('#restore-err'), ''); $('#lg-restore').value = '';
      render(); if (refreshers.shoes) refreshers.shoes();
    });
    refreshers.log = render;
    $('#lg-date').value = today(); $('#lg-date').max = today();
    render();
  })();

  /* ───────── 거리 급증 체크 ───────── */
  (function initSpike() {
    const form = $('#f-spike'); if (!form) return;
    const sp = Object.assign({ long: '12', plan: '16', last: '30', week: '36', example: true }, store.get('spike', null) || {});
    const SPIKE = [
      { pill: '基準範囲', msg: p => p <= 0 ? '直近の最長距離を超えません。研究で比較の基準になった範囲です。' : '最長距離より10%以内で延ばします。研究で比較の基準になった範囲です。この範囲でもリスクはゼロではありません。' },
      { pill: '小幅な急増', msg: () => 'この範囲では、使いすぎによるケガの発生率が基準範囲の約1.6倍でした。' },
      { pill: '中程度の急増', msg: () => 'この範囲では、使いすぎによるケガの発生率が基準範囲の約1.5倍でした。' },
      { pill: '大幅な急増', msg: () => '最長距離の2倍を超えます。この範囲では、使いすぎによるケガの発生率が基準範囲の約2.3倍でした。' },
    ];
    function fill() { $('#sp-long').value = sp.long; $('#sp-plan').value = sp.plan; $('#wk-last').value = sp.last; $('#wk-plan').value = sp.week; }
    function render() {
      $('#sp-ex').hidden = !sp.example;
      const r = Core.spike(num(sp.long), num(sp.plan));
      showErr($('#spike-err'), r ? '' : '二つの距離をどちらも0より大きい数字で入力してください。');
      if (r) {
        const pct = Math.round(r.pct);
        $('#spike-res').dataset.level = r.level;
        $('#sp-pct').textContent = (pct > 0 ? '+' : '') + pct + '%';
        $('#sp-pill').textContent = SPIKE[r.level].pill;
        $$('#spike-res .scale div').forEach((d, k) => d.classList.toggle('on', k === r.level));
        $('#sp-msg').textContent = SPIKE[r.level].msg(r.pct);
        $('#sp-cap').textContent = `今回の推奨上限は${km1(r.cap)}kmです。直近の最長距離${km1(num(sp.long))}kmに10%を足した値です。`;
      }
      const a = num(sp.last), b = num(sp.week);
      if (a > 0 && b > 0) {
        const w = Math.round((b - a) / a * 100);
        $('#wk-msg').textContent = `先週より${w > 0 ? '+' : ''}${w}%です。` + (w <= 10 ? '週10%ルールの範囲内です。' : w <= 30 ? '週10%ルールを超えます。増えた距離を1日に集めず、分散させましょう。' : '1週間で30%以上増やしています。増えた距離を1日に集めず、分散させましょう。');
      } else $('#wk-msg').textContent = '先週の距離と今週の予定を入れると、変化率をお見せします。';
      const runs = getRuns(), box = $('#sp-from-log');
      box.hidden = !runs.length;
      if (runs.length) {
        const s = Core.logStats(runs, today(), 8);
        $('#sp-pull').disabled = !(s.longest30 > 0);
        $('#sp-pull-note').textContent = s.longest30 > 0 ? `直近30日の最長${km1(s.longest30)}km、先週${km1(s.lastWeek)}km` : '直近30日の記録がありません。';
      }
    }
    function onInput() {
      sp.long = $('#sp-long').value.trim(); sp.plan = $('#sp-plan').value.trim(); sp.last = $('#wk-last').value.trim(); sp.week = $('#wk-plan').value.trim();
      sp.example = false; store.set('spike', sp); render();
    }
    ['f-spike', 'f-week'].forEach(id => { $('#' + id).addEventListener('input', onInput); $('#' + id).addEventListener('submit', e => e.preventDefault()); });
    $('#sp-pull').addEventListener('click', () => {
      const s = Core.logStats(getRuns(), today(), 8);
      if (!(s.longest30 > 0)) return;
      sp.long = km1(s.longest30); if (s.lastWeek > 0) sp.last = km1(s.lastWeek);
      sp.example = false; store.set('spike', sp); fill(); render();
    });
    refreshers.spike = render;
    fill(); render();
  })();

  /* ───────── 신발장 ───────── */
  (function initShoes() {
    const form = $('#f-shoe'); if (!form) return;
    const SHOE_PILL = ['余裕あり', '点検開始', '交換範囲', '交換推奨'];
    function shoeMsg(s, st) {
      const weeks = d => (s.wk > 0 && d > 0) ? `週${km1(s.wk)}km基準で約${Math.ceil(d / s.wk)}週間後です。` : '';
      if (st.level === 0) return `${Math.round(st.toLo)}km走ると交換範囲（${st.lo}~${st.hi}km）に入ります。` + weeks(st.toLo);
      if (st.level === 1) return `交換範囲まで${Math.round(st.toLo)}kmです。今からアウトソールとミッドソールを確認しましょう。` + weeks(st.toLo);
      if (st.level === 2) return `交換範囲です。下の点検項目に一つでも当てはまれば交換しましょう。上限${st.hi}kmまで${Math.round(st.toHi)}kmです。` + weeks(st.toHi);
      return `${st.hi}kmを超えました。新しいシューズを用意しましょう。`;
    }
    function render() {
      const shoes = getShoes(), isEx = !shoes.length, list = isEx ? EXAMPLE_SHOES : shoes;
      $('#shoe-ex-note').hidden = !isEx;
      let worst = 0;
      $('#shoe-list').innerHTML = list.map(s => {
        const st = Core.shoeStatus(s.type, s.km), max = st.hi * 1.15, p = v => (Math.min(v, max) / max * 100).toFixed(1) + '%';
        worst = Math.max(worst, st.level);
        return `<li class="shoe" data-level="${st.level}" data-id="${esc(s.id)}">
          <div class="shoe-head"><b>${esc(s.name)}</b><span class="pill">${SHOE_PILL[st.level]}</span></div>
          <div class="shoe-km">${esc(Core.SHOE_TYPES[s.type].label)}・累積<b>${km1(s.km)}</b>km</div>
          <div class="meter" aria-hidden="true"><span class="band" style="left:${p(st.lo)};width:${((st.hi - st.lo) / max * 100).toFixed(1)}%"></span><span class="fill" style="width:${p(s.km)}"></span></div>
          <div class="meter-lab" aria-hidden="true"><span>0</span><span style="left:${p(st.lo)}">${st.lo}</span><span style="left:${p(st.hi)}">${st.hi}km</span></div>
          <p>${shoeMsg(s, st)}</p>
          ${isEx ? '' : `<div class="shoe-act"><label class="sr" for="add-${esc(s.id)}">走った距離を追加（km）</label><input type="text" id="add-${esc(s.id)}" inputmode="decimal" autocomplete="off" maxlength="5" placeholder="今日走ったkm"><button type="button" class="btn" data-act="add">追加</button><button type="button" class="btn ghost" data-act="del">削除</button></div>`}
        </li>`;
      }).join('');
      $('#shoe-cta').hidden = isEx || worst < 2;
      const shop = $('#shoe-shop'); if (shop) shop.hidden = isEx || worst < 2;
    }
    $('#shoe-list').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const li = b.closest('.shoe');
      let shoes = getShoes();
      const s = shoes.find(x => x.id === li.dataset.id); if (!s) return;
      if (b.dataset.act === 'add') {
        const v = num($('input', li).value);
        if (!(v > 0 && v <= 200)) { $('input', li).focus(); return; }
        s.km = Math.round((s.km + v) * 10) / 10;
      } else if (b.dataset.confirm) {
        shoes = shoes.filter(x => x.id !== s.id);
      } else {
        b.dataset.confirm = '1'; b.textContent = 'もう一度押すと削除';
        setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = '削除'; } }, 3000);
        return;
      }
      store.set('shoes', shoes); render();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#sh-name').value.trim(), km = $('#sh-km').value.trim() === '' ? 0 : num($('#sh-km').value), wk = num($('#sh-wk').value);
      if (!name) { showErr($('#shoe-err'), 'シューズの名前を入力してください。'); $('#sh-name').focus(); return; }
      if (!(km >= 0 && km <= 5000)) { showErr($('#shoe-err'), '走った距離は0から5000kmの間で入力してください。'); $('#sh-km').focus(); return; }
      showErr($('#shoe-err'), '');
      store.set('shoes', getShoes().concat({ id: 's' + Date.now().toString(36), name, type: $('#sh-type').value, km, wk: wk > 0 ? wk : 0 }));
      $('#sh-name').value = ''; $('#sh-km').value = ''; $('#sh-wk').value = '';
      render();
    });
    refreshers.shoes = render;
    render();
  })();

  /* ───────── 심박 존 ───────── */
  (function initHeart() {
    const form = $('#f-heart'); if (!form) return;
    const hr = Object.assign({ age: '40', max: '', example: true }, store.get('heart', null) || {});
    const HR_NAME = { E: 'イージー', M: 'マラソン', T: '閾値', I: 'インターバル' }, HR_PCT = { E: '65~79%', M: '80~89%', T: '88~92%', I: '98~100%' };
    function render() {
      $('#hr-ex').hidden = !hr.example;
      const age = num(hr.age), measured = num(hr.max);
      let max, msg = '';
      if (hr.max !== '') { if (measured >= 120 && measured <= 230) max = measured; else msg = '最大心拍は120から230の間で入力してください。'; }
      else if (age >= 10 && age <= 90) max = Math.round(Core.estMaxHr(age));
      else msg = '年齢は10から90の間で入力してください。';
      showErr($('#heart-err'), msg);
      if (!max) return;
      $('#hr-note').textContent = hr.max !== ''
        ? `実測の最大心拍${max}拍/分で計算しました。`
        : `最大心拍を${max}拍/分と推定しました（208 − 0.7 × 年齢）。推定値は人により10拍前後の差があります。全力で走った後に測った値があれば、その値を入れてください。`;
      $('#hr-rows').innerHTML = Core.hrZones(max).map(o =>
        `<tr><td><span class="z" style="--zc:var(--${o.z.toLowerCase()})">${o.z}</span> ${HR_NAME[o.z]}</td><td>${HR_PCT[o.z]}</td><td class="n">${o.lo}~${o.hi}</td></tr>`).join('');
    }
    form.addEventListener('input', () => { hr.age = $('#hr-age').value.trim(); hr.max = $('#hr-max').value.trim(); hr.example = false; store.set('heart', hr); render(); });
    form.addEventListener('submit', e => e.preventDefault());
    $('#hr-age').value = hr.age; $('#hr-max').value = hr.max; render();
  })();

  /* ───────── 페이스 변환 ───────── */
  (function initPace() {
    const form = $('#f-pace'); if (!form) return;
    const PACE_ROWS = [['400m', 0.4], ['1km', 1], ['5K', 5], ['10K', 10], ['ハーフ', 21.0975], ['フル', 42.195]];
    const st = Object.assign({ sec: 360 }, store.get('pace', null) || {});
    function render(src) {
      const sec = st.sec;
      if (src !== 'pace') { const s = Math.round(sec); $('#pc-m').value = Math.floor(s / 60); $('#pc-s').value = pad(s % 60); }
      if (src !== 'kmh') $('#pc-kmh').value = (3600 / sec).toFixed(1);
      $('#pace-rows').innerHTML = PACE_ROWS.map(r => `<tr><td>${r[0]}</td><td class="n">${Core.fmtTime(sec * r[1] / 60)}</td></tr>`).join('');
    }
    function onInput(src) {
      const sec = src === 'pace' ? (num($('#pc-m').value) || 0) * 60 + (num($('#pc-s').value) || 0) : 3600 / num($('#pc-kmh').value);
      if (!(sec >= 120 && sec <= 1200)) { showErr($('#pace-err'), 'ペースはキロ2分から20分の間（時速3〜30km）で入力してください。'); return; }
      showErr($('#pace-err'), '');
      st.sec = sec; store.set('pace', st); render(src);
    }
    $('#pc-m').addEventListener('input', () => onInput('pace'));
    $('#pc-s').addEventListener('input', () => onInput('pace'));
    $('#pc-kmh').addEventListener('input', () => onInput('kmh'));
    form.addEventListener('submit', e => e.preventDefault());
    render();
  })();

  /* ───────── 체력 나이 ───────── */
  (function initFit() {
    const form = $('#f-fit'); if (!form) return;
    const TICK = ['5%', '10%', '25%', '中央', '75%', '90%', '95%'];
    const TIER = { 25: '同年代の下位25%ライン', 50: '同年代の中央値', 75: '同年代の上位25%ライン', 90: '同年代の上位10%ライン', 95: '同年代の上位5%ライン' };
    const st = Object.assign({ method: 'index', age: '', sex: '', cm: '', wm: '', ws: '', hr: '', kg: '', example: true }, store.get('fit', null) || {});

    function sync() {                           // 첫 화면에서 넣은 나이·성별을 이어받는다
      const h = loadHome();
      if (st.example) { st.age = h.age || '45'; st.sex = h.sex || 'M'; }
      return h;
    }
    function fill() {
      check('fmethod', st.method); check('fsex', st.sex);
      $('#ft-age').value = st.age; $('#ft-cm').value = st.cm; $('#ft-wm').value = st.wm; $('#ft-ws').value = st.ws; $('#ft-hr').value = st.hr; $('#ft-kg').value = st.kg;
    }
    function render() {
      const h = sync(), c = renderBasis();
      $$('[data-method]', form).forEach(el => { el.hidden = el.dataset.method !== st.method; });
      const age = num(st.age), sex = st.sex;
      let v = null, msg = '';
      if (st.method === 'index') v = c.idx;
      else if (st.method === 'cooper') {
        const m = num(st.cm);
        if (st.cm === '') msg = '12分間に走った距離をmで入力してください。';
        else if (!(m >= 1000 && m <= 5000)) msg = '走った距離は1000mから5000mの間で入力してください。';
        else v = Core.cooper(m);
      } else {
        const min = (num(st.wm) || 0) + (num(st.ws) || 0) / 60, hr = num(st.hr), kg = num(st.kg);
        if (st.wm === '' || st.hr === '' || st.kg === '') msg = 'タイム、ゴール直後の心拍、体重をすべて入力してください。';
        else if (!(min >= 8 && min <= 30)) msg = '1.6kmウォークのタイムは8分から30分の間で入力してください。';
        else if (!(hr >= 60 && hr <= 220)) msg = '心拍は60から220の間で入力してください。';
        else if (!(kg >= 30 && kg <= 200)) msg = '体重は30kgから200kgの間で入力してください。';
        else if (!(age >= 18 && age <= 90) || !sex) msg = 'ウォークテストは年齢と性別が必要です。';
        else v = Core.rockport({ kg, age, sex, min, hr });
      }
      if (!msg && !sex) msg = '性別を選んでください。';
      if (!msg && v != null && !(v > 5)) msg = '入力した値では計算できません。数字をもう一度確認してください。';
      showErr($('#fit-err'), msg);
      const res = $('#fit-res');
      res.style.opacity = msg ? '.45' : '';
      if (msg) return;

      const isEx = st.example && !(h.age && h.sex && !c.example);
      $('#ft-ex').hidden = !isEx;
      const fa = Core.fitnessAge(v, sex), pp = Core.peerPercentile(v, sex, age), row = Core.peerRow(sex, age);
      const lower = st.method === 'index';
      $('#ft-agebig').textContent = ageText(fa, lower);
      const pill = $('#ft-pill');
      let level = '', pillText = '';
      if (Number.isFinite(age)) {
        const diff = age - fa.age;
        if (diff >= 3 && fa.edge !== 'old') { level = '0'; pillText = '実年齢より若い'; }
        else if (diff <= -3 && fa.edge !== 'young') { level = '2'; pillText = '実年齢より上'; }
        else pillText = '実年齢と同程度';
      }
      if (level) res.dataset.level = level; else delete res.dataset.level;
      pill.textContent = pillText; pill.hidden = !pillText;
      $('#ft-vlab').textContent = st.method === 'index' ? BRAND : '推定VO2max';
      $('#ft-v').textContent = v.toFixed(1);
      $('#ft-pct').textContent = pp ? `${pp.decade}代${sex === 'M' ? '男性' : '女性'} ${pctText(pp, lower)}` : '20〜79歳のみ比較';

      const scale = $('#ft-scale');
      scale.hidden = !row;
      if (row) {
        const n = row.v.length, step = 100 / n, at = k => (k + 0.5) * step;
        let pos;
        if (v <= row.v[0]) pos = at(0) - Math.min(1, (row.v[0] - v) / (row.v[1] - row.v[0])) * step * 0.5;
        else if (v >= row.v[n - 1]) pos = at(n - 1) + Math.min(1, (v - row.v[n - 1]) / (row.v[n - 1] - row.v[n - 2])) * step * 0.5;
        else { let k = 1; while (v > row.v[k]) k++; pos = at(k - 1) + (v - row.v[k - 1]) / (row.v[k] - row.v[k - 1]) * step; }
        const me = $('#ft-me');
        me.style.left = Math.max(7, Math.min(93, pos)).toFixed(1) + '%';
        $('b', me).textContent = 'あなた' + v.toFixed(1);
        $('#ft-ticks').innerHTML = row.v.map((x, k) => `<div>${x.toFixed(1)}<span>${TICK[k]}</span></div>`).join('');
        $('#ft-scale-cap').textContent = `${row.decade}代${sex === 'M' ? '男性' : '女性'}100人を低い順に並べたときの位置です。大きな数字はその位置のVO2max（ml/kg/min）です。`;
      }
      const nt = Core.nextTier(v, sex, age);
      let text = '';
      if (row && !nt) text = '同年代の上位5%ラインを超えました。今の水準を保つことが目標です。';
      else if (nt) {
        text = `${TIER[nt.pct]}は${nt.value.toFixed(1)}です。今より${nt.gap.toFixed(1)}高い値です。`;
        if (st.method !== 'walk') text += `5Kの記録でいえば約${Core.fmtTime(Core.raceMinutes(nt.value, 5000))}に当たります。`;
      }
      $('#ft-msg').textContent = text; $('#ft-msg').hidden = !text;
      $('#ft-note').textContent = st.method === 'index' ? LOWER_NOTE + (c.long ? LONG_NOTE : '')
        : st.method === 'cooper' ? '12分間走の式は、最後まで力を出し切って走ったときに当てはまります。'
        : 'ウォークの式の誤差は4〜6程度です。' + ((age < 30 || age > 69) ? '30〜69歳以外では誤差がさらに大きくなることがあります。' : '');
    }
    function onInput() {
      st.method = checked('fmethod') || 'index'; st.sex = checked('fsex');
      st.age = $('#ft-age').value.trim(); st.cm = $('#ft-cm').value.trim(); st.wm = $('#ft-wm').value.trim(); st.ws = $('#ft-ws').value.trim(); st.hr = $('#ft-hr').value.trim(); st.kg = $('#ft-kg').value.trim();
      st.example = false; store.set('fit', st);
      const h = loadHome();                     // 나이·성별은 첫 화면의 또래 비교와 같이 간다
      if (h.age !== st.age || h.sex !== st.sex) { h.age = st.age; h.sex = st.sex; store.set('home', h); }
      render();
    }
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('submit', e => e.preventDefault());
    refreshers.fitage = () => { sync(); fill(); render(); };
    sync(); fill(); render();
  })();

  /* ───────── 오늘 달리기 날씨: 첫 화면. 날씨는 Open-Meteo, 대기질은 CAMS 예보 ───────── */
  (function initWeather() {
    const box = $('#wx'); if (!box) return;
    const CITIES = [['ソウル', 37.57, 126.98], ['仁川', 37.46, 126.71], ['水原', 37.26, 127.03], ['春川', 37.88, 127.73], ['江陵', 37.75, 128.88], ['清州', 36.64, 127.49], ['大田', 36.35, 127.38], ['世宗', 36.48, 127.29],
      ['全州', 35.82, 127.15], ['光州', 35.16, 126.85], ['大邱', 35.87, 128.6], ['浦項', 36.02, 129.34], ['蔚山', 35.54, 129.31], ['釜山', 35.18, 129.08], ['昌原', 35.23, 128.68], ['済州', 33.5, 126.53]];
    const WX = 'https://api.open-meteo.com/v1/forecast?', AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality?', MET = 'https://api.met.no/weatherapi/locationforecast/2.0/compact?';
    const LIVE = SITE.mode === 'site';     // 미리보기(한 장짜리)는 바깥 주소를 막는 곳이 많아 한 번만 묻는다
    const SRC_MET = '気温は<a href="https://www.met.no/en/free-meteorological-data/Licensing-and-crediting" target="_blank" rel="noopener">ノルウェー気象研究所（MET Norway）</a>の予報（CC BY 4.0）、日の出・日の入りは計算値・大気質はCAMS予報（<a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>）。微小粒子状物質は観測所の値ではなく予報モデルの計算値のため、<a href="https://www.airkorea.or.kr/" target="_blank" rel="noopener">エアコリア</a>の実測とは異なることがあります。等級は韓国環境部の予報基準で、予報欄はその日の平均（㎍/㎥）です。';
    const SRC_NOTE = '天気データ <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a>・大気質はCAMS予報。微小粒子状物質は観測所の値ではなく予報モデルの計算値のため、<a href="https://www.airkorea.or.kr/" target="_blank" rel="noopener">エアコリア</a>の実測とは異なることがあります。等級は韓国環境部の予報基準で、予報欄はその日の平均（㎍/㎥）です。';
    const sel = $('#wx-city'), hereBtn = $('#wx-here'), note = $('#wx-note');
    const st = Object.assign({ city: 'ソウル', here: false }, store.get('wx', null) || {});
    const useHere = () => !!st.here && Number.isFinite(st.lat) && Number.isFinite(st.lon);
    const place = () => {
      if (useHere()) return { name: '現在地', lat: st.lat, lon: st.lon };
      const c = CITIES.find(x => x[0] === st.city) || CITIES[0];
      return { name: c[0], lat: c[1], lon: c[2] };
    };
    function fillSel() {
      sel.innerHTML = (useHere() ? '<option value="@">現在地</option>' : '') + CITIES.map(c => `<option value="${c[0]}">${c[0]}</option>`).join('');
      sel.value = useHere() ? '@' : place().name;
    }
    const hm = iso => (typeof iso === 'string' && iso.length >= 16) ? iso.slice(11, 16) : '–';
    const one = v => Number.isFinite(v) ? v.toFixed(1) : '–';
    const clock = at => { const d = new Date(at); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    function getJson(url, ms) {
      const ac = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { if (ac) ac.abort(); }, ms || 9000);
      const done = x => { clearTimeout(timer); return x; };
      return fetch(url, ac ? { signal: ac.signal } : {})
        .then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(j => { throw new Error('HTTP ' + r.status + (j && j.reason ? ' · ' + j.reason : '')); }))
        .then(done, e => { done(); throw e; });
    }
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const why = e => (e && e.name === 'AbortError') ? '応答タイムアウト' : String((e && e.message) || e).slice(0, 140);
    let wxErr = '', wxSrc = 'om';
    /* 기온: Open-Meteo → 안 되면 노르웨이 기상청(MET Norway) → 그래도 안 되면 잠깐 쉬고 Open-Meteo 가장 단순한 요청 */
    function getWeather(q, p) {
      const cur = '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code';
      const full = WX + q + cur + '&daily=sunrise,sunset&wind_speed_unit=ms&forecast_days=1', lite = WX + q + cur;
      const met = () => getJson(MET + 'lat=' + p.lat.toFixed(2) + '&lon=' + p.lon.toFixed(2)).then(j => {
        const w = Core.metNow(j, p.lat, p.lon, today()); if (!w) throw new Error('METデータなし'); wxSrc = 'met'; return w;
      });
      wxErr = ''; wxSrc = 'om';
      if (!LIVE) return getJson(full).catch(e => { wxErr = why(e); return null; });
      return met()
        .catch(e => { wxErr = why(e); wxSrc = 'om'; return getJson(full); })
        .catch(() => wait(1500).then(() => getJson(lite)))
        .then(w => { if (w) wxErr = ''; return w; }, () => null);
    }
    function getAir(q) {
      const u = AQ + q + '&current=pm10,pm2_5&hourly=pm10,pm2_5&forecast_days=5';
      return (LIVE ? getJson(u).catch(() => wait(1500).then(() => getJson(u))) : getJson(u)).catch(() => null);
    }
    function pack(w, a) {
      const c = w && w.current, d = w && w.daily, ac = a && a.current, h = a && a.hourly;
      const kmh = !!(w && w.current_units && /km/.test(String(w.current_units.wind_speed_10m || '')));   // 단위를 못 정한 요청이면 km/h 로 온다
      return {
        now: c && Number.isFinite(c.temperature_2m) ? { t: c.temperature_2m, feels: c.apparent_temperature, hum: c.relative_humidity_2m, wind: kmh && Number.isFinite(c.wind_speed_10m) ? c.wind_speed_10m / 3.6 : c.wind_speed_10m, code: c.weather_code,
          rise: hm(d && d.sunrise && d.sunrise[0]), set: hm(d && d.sunset && d.sunset[0]) } : null,
        air: h && Array.isArray(h.time) ? { pm10: ac ? ac.pm10 : null, pm25: ac ? ac.pm2_5 : null, d10: Core.dailyMeans(h.time, h.pm10 || []), d25: Core.dailyMeans(h.time, h.pm2_5 || []) } : null,
      };
    }
    const chip = (kind, v) => { const g = Core.pmGrade(kind, v); return g ? `<span class="pmc" data-g="${g.level}"><b>${g.value}</b><i>${g.label}</i></span>` : '<span class="pmc"><b>–</b><i>なし</i></span>'; };
    const nowTxt = (kind, v, name) => { const g = Core.pmGrade(kind, v); return g ? `<span>${name} <b>${g.value}</b><em data-g="${g.level}">${g.label}</em></span>` : ''; };
    const dayHead = d => { const dt = new Date(d + 'T00:00:00'), wd = '<small>' + '日,月,火,水,木,金,土'.split(',')[dt.getDay()] + '曜日</small>'; return (d === today() ? '今日' : (dt.getMonth() + 1) + '/' + dt.getDate()) + wd; };
    function paint(data, at, stale) {
      const n = data.now, a = data.air && data.air.d10 && data.air.d10.length ? data.air : null;
      $('#wx-t').textContent = n ? n.t.toFixed(1) + '°' : '–';
      $('#wx-sky').textContent = n ? Core.skyText(n.code) : '';
      $('#wx-facts').innerHTML = n
        ? [['体感', one(n.feels) + '°'], ['湿度', Number.isFinite(n.hum) ? Math.round(n.hum) + '%' : '–'], ['風', one(n.wind) + 'm/s'], ['日の出', n.rise], ['日の入り', n.set]].map(f => `<li>${f[0]}<b>${f[1]}</b></li>`).join('')
        : '<li>気温を読み込めませんでした。<button type="button" class="linkish" data-wx-retry>再読み込み</button></li>';
      const tip = $('#wx-tip'), t = Core.runTip({ feels: n ? n.feels : NaN, code: n ? n.code : NaN, pm10: a ? a.pm10 : null, pm25: a ? a.pm25 : null });
      tip.hidden = !t;
      if (t) { tip.textContent = t.text; tip.dataset.level = t.level; }
      if (a) {
        const days = a.d10.slice(0, 5), m25 = {};
        a.d25.forEach(x => { m25[x.date] = x.mean; });
        const nowLine = [nowTxt('pm10', a.pm10, 'PM10'), nowTxt('pm25', a.pm25, 'PM2.5')].filter(Boolean).join('');
        $('#wx-air').innerHTML = (nowLine ? `<p class="wx-airnow"><i>現在</i>${nowLine}</p>` : '') +
          '<div class="tbl-wrap"><table class="pm"><caption class="sr">5日間の微小粒子状物質予報、その日の平均</caption><thead><tr><th scope="col"><span class="sr">項目</span></th>' +
          days.map(x => `<th scope="col">${dayHead(x.date)}</th>`).join('') + '</tr></thead><tbody>' +
          `<tr><th scope="row">粒子状物質<small>PM10</small></th>${days.map(x => `<td>${chip('pm10', x.mean)}</td>`).join('')}</tr>` +
          `<tr><th scope="row">微小粒子<small>PM2.5</small></th>${days.map(x => `<td>${chip('pm25', m25[x.date])}</td>`).join('')}</tr></tbody></table></div>`;
      } else $('#wx-air').innerHTML = '<p class="note">微小粒子状物質の予報を読み込めませんでした。</p>';
      note.innerHTML = clock(at) + '基準' + (stale ? '・更新できなかったため保存した値です' : '') + (n && data.old ? '・気温は' + clock(data.nowAt) + 'の値です（再読み込み中）' : '')
        + (!n && wxErr ? '・気温エラー：' + esc(wxErr) : '') + ' · ' + (n && data.src === 'met' ? SRC_MET : SRC_NOTE);
    }
    function fail() {
      $('#wx-t').textContent = '–'; $('#wx-sky').textContent = ''; $('#wx-tip').hidden = true; $('#wx-air').innerHTML = '';
      $('#wx-facts').innerHTML = '<li>' + (SITE.mode === 'site' ? '天気を読み込めませんでした。<button type="button" class="linkish" data-wx-retry>再読み込み</button>' : 'プレビューでは天気を読み込めません。公開サイトで表示されます。') + '</li>';
      note.innerHTML = (wxErr ? 'エラー：' + esc(wxErr) + ' · ' : '') + SRC_NOTE;
      later();
    }
    /* 못 받은 쪽이 있으면 조용히 다시: 15초, 45초, 2분 뒤. 창으로 돌아오거나 인터넷이 다시 붙어도 */
    let retryTimer = 0, retries = 0;
    function later() {
      if (!LIVE || retries >= 3) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => { retries++; load(true, true); }, [15000, 45000, 120000][retries]);
    }
    let seq = 0;
    function load(force, quiet) {
      const p = place(), key = p.lat.toFixed(2) + ',' + p.lon.toFixed(2), hit = store.get('wxc', null), mine = ++seq;
      const cached = hit && hit.key === key && hit.data ? hit : null;
      const fresh = !!cached && Date.now() - cached.at < 20 * 60000, recent = !!cached && Date.now() - cached.at < 3 * 3600000;
      // 기온과 대기질을 둘 다 새로 받아 둔 경우에만 20분 동안 다시 묻지 않는다
      if (!force && fresh && cached.data.now && cached.data.air && !cached.data.old && !cached.data.airOld) { paint(cached.data, cached.at, false); return; }
      if (typeof fetch !== 'function') { fail(); return; }
      if (cached && recent) paint(cached.data, cached.at, false);
      if (!quiet && (force || !cached || !recent)) $('#wx-facts').innerHTML = '<li>読み込み中…</li>';
      const q = 'latitude=' + p.lat + '&longitude=' + p.lon + '&timezone=Asia%2FSeoul';
      Promise.all([getWeather(q, p), getAir(q)]).then(r => {
        if (mine !== seq) return;
        const got = pack(r[0], r[1]), at = Date.now();
        const data = { now: got.now, air: got.air, src: got.now ? wxSrc : '', nowAt: got.now ? at : 0 };
        // 이번에 못 받은 쪽은 세 시간 안에 받아 둔 값으로 채우고, 몇 시 값인지 밝힌다
        if (!data.now && recent && cached.data.now) Object.assign(data, { now: cached.data.now, src: cached.data.src || '', nowAt: cached.data.nowAt || cached.at, old: true });
        if (!data.air && recent && cached.data.air) Object.assign(data, { air: cached.data.air, airOld: true });
        if (!data.now && !data.air) { if (cached) paint(cached.data, cached.at, true); else fail(); later(); return; }
        store.set('wxc', { key, at, data });
        paint(data, at, false);
        if (got.now && got.air) { retries = 0; clearTimeout(retryTimer); } else later();
      }).catch(() => { fail(); });
    }
    let wasHidden = false;      // 다른 창에 갔다가 돌아왔을 때만
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { wasHidden = true; return; }
      if (wasHidden && LIVE) { wasHidden = false; retries = 0; load(false, true); }
    });
    window.addEventListener('online', () => { if (LIVE) { retries = 0; load(true, true); } });
    box.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-wx-retry]')) load(true); });
    sel.addEventListener('change', () => {
      if (sel.value === '@') return;
      st.city = sel.value; st.here = false; store.set('wx', st); fillSel(); load();
    });
    if (!navigator.geolocation || SITE.mode !== 'site') hereBtn.hidden = true;
    else hereBtn.addEventListener('click', () => {
      hereBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(pos => {
        hereBtn.disabled = false;
        st.here = true; st.lat = Math.round(pos.coords.latitude * 10) / 10; st.lon = Math.round(pos.coords.longitude * 10) / 10;   // 약 10km 단위로만 쓴다
        store.set('wx', st); fillSel(); load();
      }, () => {
        hereBtn.disabled = false; hereBtn.textContent = '位置情報を取得できませんでした';
        setTimeout(() => { hereBtn.textContent = '現在地'; }, 2500);
      }, { maximumAge: 600000, timeout: 8000 });
    });
    fillSel(); load();
  })();

  /* ───────── 전국 대회 목록: 다가오는 대회 / 2027 예상, 종목·지역·이름으로 거르기 ───────── */
  (function initRaceList() {
    const box = $('#rl'); if (!box) return;
    const st = Object.assign({ tab: 'up', ev: 'all', region: 'all' }, store.get('rl', null) || {});
    const lists = { up: $('#rl-up'), last: $('#rl-last') }, q = $('#rl-q'), sel = $('#rl-region');
    if (!$$('option', sel).some(o => o.value === st.region)) st.region = 'all';
    // 지난 대회는 처음부터 뺀다
    $$('li.rc', lists.up).forEach(li => { if (daysTo(li.dataset.date) < 0) li.dataset.gone = '1'; });
    const live = list => $$('li.rc', list).filter(li => !li.dataset.gone);
    $('#rl-n-up').textContent = live(lists.up).length;
    $('#rl-n-last').textContent = live(lists.last).length;
    function apply() {
      const k = (q.value || '').toLowerCase().replace(/\s+/g, '');
      Object.keys(lists).forEach(t => { lists[t].hidden = t !== st.tab; });
      $$('[data-rl-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.rlTab === st.tab ? 'true' : 'false'));
      $$('[data-rl-ev]').forEach(b => b.setAttribute('aria-pressed', b.dataset.rlEv === st.ev ? 'true' : 'false'));
      sel.value = st.region;
      $('#rl-hint-last').hidden = st.tab !== 'last';
      let n = 0, head = null, headHas = false;
      const close = () => { if (head) head.hidden = !headHas; };
      $$('li', lists[st.tab]).forEach(li => {
        if (li.classList.contains('rc-m')) { close(); head = li; headHas = false; return; }
        const ok = !li.dataset.gone && (st.ev === 'all' || li.dataset.ev.split(' ').includes(st.ev))
          && (st.region === 'all' || li.dataset.region === st.region) && (!k || li.dataset.q.includes(k));
        li.hidden = !ok;
        if (ok) { n++; headHas = true; }
      });
      close();
      $('#rl-count').textContent = n + '大会' + (st.tab === 'last' ? '・2026年の開催日基準' : '');
      $('#rl-none').hidden = n > 0;
      store.set('rl', { tab: st.tab, ev: st.ev, region: st.region });
    }
    box.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-rl-tab],[data-rl-ev]');
      if (!t) return;
      if (t.dataset.rlTab) st.tab = t.dataset.rlTab; else st.ev = t.dataset.rlEv;
      apply();
    });
    sel.addEventListener('change', () => { st.region = sel.value; apply(); });
    q.addEventListener('input', apply);
    refreshers.calendar = (prev => () => { if (prev) prev(); apply(); })(refreshers.calendar);
    apply();
  })();

  /* ───────── 첫 화면: 다가오는 대회 세 개 ───────── */
  (function initHomeRaces() {
    const list = $('#home-races'); if (!list) return;
    let shown = 0;
    $$('li', list).forEach(li => {
      const n = daysTo(li.dataset.date), on = n >= 0 && shown < 4;
      li.hidden = !on;
      if (on) { shown++; $('[data-dday]', li).textContent = ddayText(n); }
    });
    list.hidden = !shown;
    $('#home-races-none').hidden = !!shown;
  })();

  /* ───────── 러닝 용어: 입력한 말로 거르기 ───────── */
  (function initTerms() {
    const q = $('#term-q'); if (!q) return;
    const items = $$('[data-term]'), groups = $$('[data-term-group]');
    q.addEventListener('input', () => {
      const k = q.value.toLowerCase().replace(/[\s·]+/g, '');
      let any = false;
      items.forEach(el => { const hit = !k || el.dataset.term.includes(k); el.hidden = !hit; if (hit) any = true; });
      groups.forEach(g => { g.hidden = !$$('[data-term]', g).some(el => !el.hidden); });
      $('#term-none').hidden = any;
    });
  })();

  /* ───────── 마라톤 뉴스: 검색과 분류 ───────── */
  (function initNews() {
    const box = $('#news-list'); if (!box) return;
    const q = $('#news-q'), items = $$('.nitem', box); let tag = '';
    const apply = () => {
      const t = (q.value || '').trim().toLowerCase(); let n = 0;
      items.forEach(li => { const ok = (!tag || li.dataset.tag === tag) && (!t || li.dataset.text.toLowerCase().includes(t)); li.hidden = !ok; if (ok) n++; });
      $('#news-empty').hidden = n > 0;
    };
    q.addEventListener('input', apply);
    $$('[data-ntag]').forEach(b => b.addEventListener('click', () => { tag = b.dataset.ntag; $$('[data-ntag]').forEach(x => x.classList.toggle('on', x === b)); apply(); }));
    box.addEventListener('toggle', e => { const li = e.target.closest && e.target.closest('.nitem'); if (e.target.open && li) track('news_open', { id: li.dataset.id || '' }); }, true);
  })();

  /* ───────── 글자 크게 보기 ───────── */
  (function initSize() {
    const b = $('#size-tg'); if (!b) return;
    const sync = () => { const on = document.documentElement.classList.contains('big'); b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    sync();
    b.addEventListener('click', () => {
      const on = !document.documentElement.classList.contains('big');
      document.documentElement.classList.toggle('big', on); store.set('big', on); sync();
      track('big_text', { on: on ? 1 : 0 });
    });
  })();

  /* ───────── 앱처럼 쓰기: 두 번째 방문부터, 닫으면 30일 동안 안 보인다 ───────── */
  (function initInstallBar() {
    const bar = $('#install-bar'); if (!bar || SITE.mode !== 'site') return;
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    if (standalone) return;
    const visits = (store.get('visits', 0) || 0) + 1; store.set('visits', visits);
    const off = store.get('ibOff', 0) || 0;
    if (visits < 2 || Date.now() - off < 30 * 864e5) return;
    const ua = navigator.userAgent || '';
    const ios = /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios|kakaotalk|naver|instagram|fban|fbav|line\//i.test(ua);
    let deferred = null;
    const show = () => { bar.hidden = false; track('install_bar', { kind: ios ? 'ios' : 'prompt' }); };
    const hide = () => { bar.hidden = true; store.set('ibOff', Date.now()); };
    $('#ib-close').addEventListener('click', hide);
    if (ios) {
      $('#ib-text').textContent = 'Safari下部の共有ボタンを押し、「ホーム画面に追加」を選んでください。アプリのようにすぐ開き、オフラインでも計算できます。';
      $('#ib-add').hidden = true;
      setTimeout(show, 2500);
      return;
    }
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; setTimeout(show, 1500); });
    $('#ib-add').addEventListener('click', () => {
      if (!deferred) return hide();
      deferred.prompt();
      deferred.userChoice.then(c => { track('install', { outcome: c && c.outcome }); }).catch(() => {});
      deferred = null; bar.hidden = true;
    });
    window.addEventListener('appinstalled', () => { bar.hidden = true; });
  })();

  /* ───────── 크루 페이스 그룹 ───────── */
  (function initCrew() {
    const form = $('#f-crew'); if (!form) return;
    const EX = ['さくら 10k 55:00', 'けんた ハーフ 1:58:30', 'ゆい 5k 27:40', 'はると フル 3:50:00', 'あおい 10k 1:02:10', 'そうた 10k 48:30', 'みお ハーフ 2:15:00', 'れん 5k 24:50'].join('\n');
    const st = Object.assign({ text: '', dist: '10000', k: '0' }, store.get('crew', null) || {});
    const ta = $('#cr-list'), ds = $('#cr-dist'), ks = $('#cr-k'), out = $('#crew-out');
    ta.value = st.text || EX; ds.value = st.dist; ks.value = st.k;
    let text = '';
    const label = m => (DIST_LABEL[String(m)] || (m / 1000) + 'km');
    function render() {
      const isEx = !st.text;
      $('#crew-ex').hidden = !isEx;
      const r = Core.parseCrew(ta.value, num(ds.value)), groups = Core.crewGroups(r.members, parseInt(ks.value, 10) || 0);
      showErr($('#crew-err'), r.errors.length ? r.errors.slice(0, 3).map(x => '読み取れない行' + x.line + ': ' + x.text).join(' / ') + (r.errors.length > 3 ? ' (+' + (r.errors.length - 3) + ')' : '') : '');
      if (!groups.length) { out.innerHTML = '<p class="note">名前と記録を1行に1人ずつ書いてください。</p>'; text = ''; return; }
      out.innerHTML = groups.map((g, i) => `<div class="crew-g"> <div class="crew-h"><b>グループ${i + 1}</b><span>${g.members.length}人・${esc(BRAND)} ${g.low.toFixed(1)}~${g.top.toFixed(1)}</span></div> <p class="crew-p">イージー <b>${Core.fmtPace(g.easy[0])}~${Core.fmtPace(g.easy[1])}</b><small>/km</small></p>
          <ul>${g.members.map(m => `<li><span>${esc(m.name)}</span><small>${label(m.meters)} ${Core.fmtTime(m.minutes)} · ${m.idx.toFixed(1)}</small></li>`).join('')}</ul>
          ${g.spread > 6 ? '<p class="crew-warn">グループ内の実力差が大きめです。速い人が待つか、グループ数を増やしてみてください。</p>' : ''}
        </div>`).join('');
      text = ['クラブ練習のペース'].concat(groups.map((g, i) => `グループ${i + 1}・イージー${Core.fmtPace(g.easy[0])}~${Core.fmtPace(g.easy[1])}/km: ${g.members.map(m => m.name).join(', ')}`), [sourceLine()]).join('\n');
    }
    function save() { st.text = ta.value.trim() === EX.trim() ? '' : ta.value; st.dist = ds.value; st.k = ks.value; store.set('crew', st); render(); }
    form.addEventListener('input', save); form.addEventListener('change', save); form.addEventListener('submit', e => e.preventDefault());
    $('#crew-copy').addEventListener('click', e => copyText(e.currentTarget, text));
    render();
    let sent = false;
    ta.addEventListener('change', () => { if (!sent && st.text) { sent = true; track('crew_groups', { n: Core.parseCrew(ta.value, num(ds.value)).members.length }); } });
  })();

  /* ───────── 화면 전환: 한 장에 여러 화면이 들어 있을 때만 ───────── */
  const views = $$('[data-view]');
  if (views.length > 1) {
    const names = views.map(s => s.dataset.view);
    let first = true;
    const route = () => {
      const h = location.hash.replace('#', ''), v = names.includes(h) ? h : 'home';
      views.forEach(s => { s.hidden = s.dataset.view !== v; });
      $$('[data-nav]').forEach(a => {
        if (a.dataset.nav === v || (a.dataset.also || '').split(' ').includes(v)) { a.setAttribute('aria-current', 'page'); if (a.scrollIntoView && !first) a.scrollIntoView({ block: 'nearest', inline: 'center' }); }
        else a.removeAttribute('aria-current');
      });
      if (!first) { if (refreshers[v]) refreshers[v](); window.scrollTo(0, 0); }
      first = false;
    };
    window.addEventListener('hashchange', route);
    route();
  } else {
    const cur = $('.nav a[aria-current="page"]');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /* ───────── 보호: 복사·우클릭·끌기·인쇄 막기 (입력 칸과 메일 주소는 예외) ───────── */
  const isField = t => !!(t && t.closest && t.closest('input,textarea,select,a[href^="mailto:"]'));
  const savable = t => !!(t && t.closest && t.closest('.savable'));     // 저장하라고 만든 공유 이미지
  document.addEventListener('contextmenu', e => { if (!isField(e.target) && !savable(e.target)) e.preventDefault(); });
  document.addEventListener('dragstart', e => { if (!savable(e.target)) e.preventDefault(); });
  document.addEventListener('selectstart', e => { if (!isField(e.target)) e.preventDefault(); });
  document.addEventListener('copy', e => {
    if (isField(e.target)) return;
    const sel = String(window.getSelection ? window.getSelection() : '');
    e.preventDefault();
    if (sel && e.clipboardData) e.clipboardData.setData('text/plain', sel + '\n\n出典：' + BRAND + ' ' + (SITE.siteUrl ? SITE.siteUrl.replace(/\/$/, '') + location.pathname : location.href));
  });
  document.addEventListener('cut', e => { if (!isField(e.target)) e.preventDefault(); });
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = (e.key || '').toLowerCase();
    if (k === 's' || k === 'u' || k === 'p') e.preventDefault();
    else if ((k === 'c' || k === 'a') && !isField(e.target)) e.preventDefault();
  });

  /* ───────── 설치형 웹앱: 배포한 사이트에서만 ───────── */
  if (SITE.pwa && 'serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register(SITE.sw).catch(() => { /* 설치 없이 동작 */ }); });
    let deferred = null;
    const btn = $('#install');
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (btn) btn.hidden = false; });
    if (btn) btn.addEventListener('click', () => { if (!deferred) return; deferred.prompt(); deferred = null; btn.hidden = true; });
  }
})();
