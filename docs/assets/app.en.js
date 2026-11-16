/* 화면 동작. 화면에 있는 도구만 초기화하므로 한 장짜리 미리보기와 도구별 페이지에서 같은 파일을 쓴다. */
(() => {
  'use strict';

  /* 사이트 설정은 site.config.json에서 빌드할 때 window.SITE로 들어온다 */
  const SITE = Object.assign({ mode: 'artifact', lang: 'ko', brand: 'Runjisu', siteUrl: '', partnerLinks: {}, paths: null, pwa: false }, window.SITE || {});
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
    try { navigator.clipboard.writeText(text).then(() => done('Copied'), () => done('Couldn\'t copy')); }
    catch (err) { done('Couldn\'t copy'); }
  }
  const sourceLine = () => BRAND + (SITE.siteUrl ? ' ' + SITE.siteUrl : '');

  /* ── 모든 도구가 함께 쓰는 값: 첫 화면에서 넣은 기록과 런지수 ── */
  const DIST_LABEL = { '3000': '3K', '5000': '5K', '10000': '10K', '21097.5': 'Half', '42195': 'Full' };
  const HOME_DEFAULT = { dist: '10000', km: '', h: '', m: '55', s: '00', age: '', sex: '', example: true };
  const loadHome = () => Object.assign({}, HOME_DEFAULT, store.get('home', null) || {});
  function evalHome(h) {
    const custom = h.dist === 'custom';
    const meters = custom ? num(h.km) * 1000 : parseFloat(h.dist);
    const minutes = (num(h.h) || 0) * 60 + (num(h.m) || 0) + (num(h.s) || 0) / 60;
    let msg = '';
    if (custom && !(meters > 0)) msg = 'Enter the distance in km.';
    else if (meters < 800 || meters > 100000) msg = 'Enter a distance between 0.8 and 100 km.';
    else if (!(minutes > 0)) msg = 'Enter your time.';
    else {
      const sec = minutes * 60 / (meters / 1000);
      if (sec < 120) msg = 'That\'s faster than 2 minutes per km. Check the distance and time.';
      else if (sec > 900) msg = 'Times slower than 15 minutes per km can\'t be calculated. Check the distance and time.';
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
      el.innerHTML = `${esc(BRAND)} <b>${c.idx.toFixed(1)}</b><span>${esc(c.basis)} ${c.example ? ' · example result' : ''}</span><a href="${href('home')}">${c.example ? 'Enter my result' : 'Change result'} →</a>`;
    });
    return c;
  }

  const refreshers = {};      // 화면 이름 → 다시 그리기 (한 장짜리에서 화면을 옮길 때 쓴다)

  /* ── 제휴 링크 ── */
  $$('.shop').forEach(a => { const u = SITE.partnerLinks[a.dataset.shop]; if (u) { a.href = u; a.rel = 'noopener sponsored'; } });

  /** lower: 달리기 기록에서 나온 값. 실험실 VO2max보다 낮게 나오는 편이라 '적어도 이 순위'로 적는다 */
  function pctText(pp, lower) {
    const top = 100 - pp.pct;
    if (pp.edge === 'high') return 'Top 5% or better';
    if (pp.edge === 'low') return lower ? 'Around the bottom 5%' : 'Bottom 5%';
    if (lower) return 'Top ' + Math.round(top) + '% or better';
    return top <= 50 ? 'Top ' + Math.round(top) + '%' : 'Bottom ' + Math.round(pp.pct) + '%';
  }
  const ageText = (fa, lower) => fa.edge === 'young' ? 'Above the average for your 20s' : fa.edge === 'old' ? 'Below the average for your 70s' : 'About {n}'.replace('{n}', Math.round(fa.age)) + (lower ? ' or younger' : '');
  const LOWER_NOTE = 'Values from race results tend to come out lower than lab-measured VO2max, so your true fitness age is likely younger and your ranking higher.';
  const LONG_NOTE = ' Half and full marathon results in particular mix in endurance and fueling, so they tend to come out even lower than 5K or 10K results. If you have an all-out 5K or 10K, recalculate with that.';

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
      const base = 'The comparison uses stress-test data from 7,783 US adults (FRIEND, 2015).';
      if (idx == null || !sex || !Number.isFinite(age)) {
        elAge.textContent = '–'; elPct.textContent = '–'; elGroup.textContent = 'Your age group';
        $('#peer-note').textContent = `Enter your age and sex to see which age group's average your ${J(BRAND, '가')} matches and where you stand among your peers. ` + base;
        return;
      }
      const fa = Core.fitnessAge(idx, sex), pp = Core.peerPercentile(idx, sex, age);
      const r = evalHome(home), long = !r.msg && r.meters >= 21000;
      elAge.textContent = ageText(fa, true);
      if (!pp) { elPct.textContent = '–'; elGroup.textContent = 'Only ages 20–79 can be compared'; }
      else { elPct.textContent = pctText(pp, true); elGroup.textContent = pp.decade + 's ' + (sex === 'M' ? 'men' : 'women') + ' '; }
      $('#peer-note').textContent = LOWER_NOTE + (long ? LONG_NOTE : '') + ' ' + base;
    }
    function renderGates(pr) {
      pr.forEach(p => {
        const el = $('#gate-' + p.id); if (!el) return;
        const g = Core.gate(p.id, p.minutes);
        $('.k', el).textContent = p.label + ' ' + Core.fmtTime(p.minutes);
        $('.big', el).textContent = g.passed ? g.passedLabel : 'Before the first milestone';
        $('.cap', el).textContent = g.next ? g.nextLabel + ' needs ' + Core.fmtTime(g.gapSec / 60) + ' off' : 'Past the fastest milestone';
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
      const ko = BRAND + ' Training paces Predicted times Half Full Custom With equal preparation One result, your';
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
      text(d.basis + ' ', cx + cw - 76, cy + 68, '600 30px ' + F_BODY, '#fff', 'right', cw * 0.42);
      text(d.idx.toFixed(1), mid, cy + 500, '800 440px ' + F_NUM, INK, 'center', cw - 150);
      text(BRAND, mid, cy + 592, '400 66px ' + F_HEAD, INK);
      dash(cy + 640, cx + 40, cx + cw - 40);
      text('Predicted times with equal preparation', mid, cy + 692, '600 28px ' + F_BODY, SUB);
      const pw = (cw - 80) / 4;
      d.pr.forEach((p, i) => {
        const px = cx + 40 + pw * i + pw / 2;
        if (i) vdash(cx + 40 + pw * i, cy + 716, cy + 826);
        text(p.label, px, cy + 748, '700 30px ' + F_BODY, SUB);
        text(Core.fmtTime(p.minutes), px, cy + 818, '700 66px ' + F_NUM, INK, 'center', pw - 26);
      });
      dash(cy + 856, cx + 40, cx + cw - 40);
      text('Training paces /km', mid, cy + 908, '600 28px ' + F_BODY, SUB);
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
      text('One result, your ' + BRAND, cx + cw - 6, cy + ch + 92, '500 30px ' + F_BODY, '#9aa8be', 'right', cw * 0.46);
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
      $('#bib-basis').textContent = r.basis + ' ';
      pr.forEach(p => { $('#pr-' + p.id).textContent = Core.fmtTime(p.minutes); });
      setLane('e', z.eFast, z.eSlow, z.r); setLane('m', z.m, null, z.r); setLane('t', z.t, null, z.r); setLane('i', z.i, null, z.r); setLane('r', z.r, null, z.r);
      $('#range-note').textContent = (r.minutes < 3.5 || r.minutes > 240)
        ? 'This result is outside the range where the formula works well (about 3:30 to 4 hours), so errors may be large.'
        : `${J(BRAND, '는')} is an aerobic fitness index worked backward from a race result.`;
      renderPeer(idx);
      renderGates(pr);
      lastData = { idx, basis: r.basis, z, pr }; hideShare();
      lastSummary = [
        `My ${BRAND} ${idx.toFixed(1)} (${r.basis} )`,
        `Training paces /km  E ${range(z.eFast, z.eSlow, Core.fmtPace)} · M ${Core.fmtPace(z.m)} · T ${Core.fmtPace(z.t)} · I ${Core.fmtPace(z.i)} · R ${Core.fmtPace(z.r)}`,
        'Predicted times  ' + pr.map(p => p.label + ' ' + Core.fmtTime(p.minutes)).join(' · '),
        sourceLine(),
      ].join('\n');
    }
    function onInput() { read(); home.example = false; store.set('home', home); render(); }
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('submit', e => e.preventDefault());
    function onPeer() { read(); store.set('home', home); renderPeer(lastIndex); }
    ['age', 'sex-m', 'sex-f'].forEach(id => { const el = $('#' + id); el.addEventListener('input', onPeer); el.addEventListener('change', onPeer); });
    $('#copy-result').addEventListener('click', e => copyText(e.currentTarget, lastSummary));
    const shareBtn = $('#share-img');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        if (!lastData) return;
        const d = lastData, name = LATIN.toLowerCase().replace(/[^a-z0-9]+/g, '') + '-' + d.idx.toFixed(1) + '.png';
        shareBtn.disabled = true;
        fontsReady().then(() => {
          const cv = drawShare(d), url = cv.toDataURL('image/png');
          const pic = $('#share-pic'), save = $('#share-save'), send = $('#share-send'), out = $('#share-out');
          pic.src = url; pic.alt = `My ${BRAND} ${d.idx.toFixed(1)} result image`;
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
        if (shareFile && navigator.share) navigator.share({ files: [shareFile], title: `My ${BRAND} ${lastData.idx.toFixed(1)}`, text: sourceLine() }).catch(() => { /* 닫으면 그대로 둔다 */ });
      });
    }
    refreshers.home = () => { Object.assign(home, loadHome()); fill(); render(); };
    fill(); render();
  })();


  /* ───────── 목표 대회: 대회 일정에서 고르고 대회 계획에서 이어 쓴다 ───────── */
  const daysTo = d => Core.dayNum(d) - Core.dayNum(today());
  const ddayText = n => n > 0 ? 'D-' + n : n === 0 ? 'D-DAY' : 'Ended';
  const getGoal = () => { const g = store.get('goal', null); return g && g.date && daysTo(g.date) >= 0 ? g : null; };
  function renderGoalLine() {
    const el = $('#rc-goal'); if (!el) return;
    const g = getGoal();
    el.hidden = !g;
    if (g) el.innerHTML = `Goal race <b>${ddayText(daysTo(g.date))}</b><span>${esc(g.name)}</span><a href="${href('calendar')}">Race calendar →</a>`;
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
        if (btn) { btn.hidden = n < 0; btn.textContent = isGoal ? (btn.dataset.on || 'Remove goal race') : (btn.dataset.off || 'Set as goal race'); btn.setAttribute('aria-pressed', isGoal ? 'true' : 'false'); }
      });
      box.innerHTML = g
        ? `My goal race <b>${ddayText(daysTo(g.date))}</b><span>${esc(g.name)}</span><a href="${href('race')}" id="goal-plan">Make splits →</a>`
        : '<span>Tap ☆ Goal next to a race to start a countdown and carry it over to the race plan.</span>';
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
    const NAME = { '5000': '5K', '10000': '10K', '21097.5': 'Half', '42195': 'Marathon' };
    const FINISH = { '5000': '5km', '10000': '10km', '21097.5': '21.0975km', '42195': '42.195km' };
    const PILL = ['Within your fitness', 'Challenging goal', 'Too fast for now'];
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
      if (!(minutes > 0)) msg = 'Enter a goal time.';
      else {
        const sec = minutes * 60 / (meters / 1000);
        if (sec < 120) msg = 'That goal is faster than 2 minutes per km. Check the time.';
        else if (sec > 900) msg = 'Goals slower than 15 minutes per km can\'t be calculated. Check the time.';
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
      const both = `This goal needs ${J(BRAND, '는')} ${need}; you have ${J(BRAND, '는')} ${cur}.`;
      if (g.level === 0 && g.gap < -1.5) text = both + ' It\'s a goal with room to spare.';
      else if (g.level === 0) text = both + ' They\'re nearly equal, so it\'s worth going for if your preparation is right.';
      else if (g.level === 1) text = both + ` ${gap} short, but a few more weeks of training could close the gap. On race day, don't run the first few km faster than your splits.`;
      else text = both + ` ${gap} short. Starting at this pace, you're likely to slow down badly in the second half. Your current ${J(BRAND, '로')}  gives a ${NAME[st.dist]}  prediction of ${Core.fmtTime(Core.raceMinutes(c.idx, meters))}.`;
      $('#rc-msg').textContent = text;
      const notes = [];
      if (st.mode === 'neg') notes.push(`First half ${Core.fmtPace(sp.first)}/km, second half ${Core.fmtPace(sp.second)}/km: 1.5% slower and 1.5% faster than your average pace.`);
      if (st.dist === '42195') notes.push(`A marathon goal based on ${J(BRAND, '로')}  from a short-race result only holds if it's backed by long runs of 30 km or more.`);
      $('#rc-note').textContent = notes.join(' ');
      $('#rc-note').hidden = !notes.length;

      const half = meters / 2;
      const rows = sp.rows.map(r => {
        const last = Math.abs(r.to - meters) < 0.5, label = last ? 'Finish ' + FINISH[st.dist] : (r.to / 1000) + 'km';
        const mid = st.mode === 'neg' && r.from >= half - 0.5 && r.from - half < (r.to - r.from) - 0.5;
        return { label, pace: Core.fmtPace(r.pace), cum: Core.fmtTime(r.cum / 60), mid };
      });
      $('#split-rows').innerHTML = rows.map(r => `<tr${r.mid ? ' class="mid"' : ''}><td>${r.label}</td><td class="n">${r.pace}</td><td class="n">${r.cum}</td></tr>`).join('');
      splitText = [`${NAME[st.dist]} Goal ${Core.fmtTime(minutes)} · avg ${Core.fmtPace(sp.avg)}/km`].concat(rows.map(r => `${r.label}  ${r.cum}  (${r.pace}/km)`), [sourceLine()]).join('\n');
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
    const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const CHIP = { E: 'e', L: 'e', T: 't', I: 'i', M: 'm' }, LETTER = { E: 'E', L: 'E', T: 'T', I: 'I', M: 'M' };
    let planText = '';

    function describe(d, p) {
      const z = p.paces, eR = range(z.eFast, z.eSlow, Core.fmtPace);
      if (d.role === 'rest') return { title: 'Rest day', pace: '', detail: 'Just walking or light stretching.' };
      if (d.role === 'E') return { title: 'Easy run', pace: eR, detail: 'At a conversational pace.' + (d.strides ? ' Finish with 4–6 × 20-second strides (about 90% effort, walk fully between).' : '') };
      if (d.role === 'L') return { title: 'Long run', pace: eR, detail: `About ${Math.round(p.longMin)} min. Start at the slow end of the E range.` };
      const s = d.session;
      if (d.role === 'T') return { title: 'Threshold', pace: Core.fmtPace(z.t), detail: `Warm-up ${km1(s.wu)}km easy → T pace 1 km × ${s.reps} reps, 1-min walk between → cool-down ${km1(s.cd)}km easy.` };
      if (d.role === 'I') return { title: 'Intervals', pace: Core.fmtPace(z.i), detail: `Warm-up ${km1(s.wu)}km easy → I pace ${s.repM}m × ${s.reps} reps (about ${Core.fmtPace(s.restSec)} each), jog slowly for as long as each rep between → cool-down ${km1(s.cd)}km easy.` };
      return { title: 'Marathon-pace run', pace: Core.fmtPace(z.m), detail: `Warm-up ${km1(s.wu)}km easy → M pace ${km1(s.work)}km continuous → cool-down ${km1(s.cd)}km easy.` };
    }
    function render() {
      const c = renderBasis(), W = num(st.km);
      $('#pl-ex').hidden = !(st.example && c.example);
      const p = Core.weekPlan(c.idx, W, parseInt(st.days, 10), st.goal);
      showErr($('#plan-err'), p ? '' : 'Enter a weekly distance between 10 and 160 km.');
      if (!p) return;
      $('#pl-total').innerHTML = km1(p.total) + '<small>km</small>';
      $('#pl-days-cap').textContent = '{n} days a week'.replace('{n}', p.runDays);
      $('#pl-easy').innerHTML = Math.round(p.easyShare * 100) + '<small>%</small>';
      $('#pl-long').innerHTML = km1(p.longKm) + '<small>km</small>';
      $('#pl-long-cap').textContent = `Long run · about ${Math.round(p.longMin)} min`;
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
      if (p.adjustedFrom && p.runDays < p.adjustedFrom) notes.push(`Splitting ${km1(W)}km a week into ${p.adjustedFrom} days leaves under 3 km a day, so we reduced it to ${p.runDays} days.`);
      if (p.adjustedFrom && p.runDays > p.adjustedFrom) notes.push(`Splitting ${km1(W)}km a week into ${p.adjustedFrom} days would make a weekday run longer than the long run, so we increased it to ${p.runDays} days.`);
      if (p.overload) notes.push(`At this pace, ${km1(W)}km a week is over 150 minutes a day even across 6 days. Split into two runs a day or recheck your weekly distance.`);
      if (p.longCapped) notes.push('Long run capped at 150 minutes. Beyond that, recovery costs more than you gain.');
      else if (p.longShare > 0.31) notes.push(`The long run is ${Math.round(p.longShare * 100)}% of weekly distance. That comes from having few running days, so just make sure it stays under 150 minutes.`);
      if (st.goal !== 'base' && p.quality === 0) notes.push(W < 20 ? 'Under 20 km a week, so the plan has no quality sessions. Rebuild it as your distance grows.' : 'Easy days were getting too short, so the quality session was dropped.');
      $('#plan-notes').textContent = notes.join(' ');
      $('#plan-notes').hidden = !notes.length;
      planText = [`Weekly plan · ${km1(p.total)}km · ${BRAND} ${c.idx.toFixed(1)}`].concat(lines, [sourceLine()]).join('\n');
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
  const EXAMPLE_SHOES = [{ id: 'ex', name: 'Daily trainer', type: 'daily', km: 430, wk: 30 }];
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
    const KIND = { E: 'Easy run', L: 'Long run', T: 'Threshold', I: 'Intervals · reps', M: 'Marathon pace', X: 'Race' };
    const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let showN = 8;

    function fillShoeSelect() {
      const shoes = getShoes(), sel = $('#lg-shoe'), keep = sel.value;
      sel.innerHTML = '<option value="">None</option>' + shoes.map(s => `<option value="${esc(s.id)}">${esc(s.name)} (${km1(s.km)}km)</option>`).join('');
      if (shoes.some(s => s.id === keep)) sel.value = keep;
      $('#lg-shoe-note').innerHTML = shoes.length ? 'Pick a shoe to add this run to its mileage.' : `Add shoes to your shoe rack to pick them here. <a href="${href('shoes')}">Add a shoe →</a>`;
    }
    function render() {
      const real = getRuns(), isEx = !real.length, runs = isEx ? exampleRuns() : real;
      $('#lg-ex').hidden = !isEx;
      const s = Core.logStats(runs, today(), 8);
      $('#lg-week').innerHTML = km1(s.thisWeek) + '<small>km</small>';
      $('#lg-week-cap').textContent = 'This week so far · Last week ' + km1(s.lastWeek) + 'km';
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
          ${isEx ? '' : '<button type="button" class="btn ghost small" data-act="del">Delete</button>'}
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) msg = 'Pick a date.';
      else if (d > today()) msg = 'You can\'t log a future date.';
      else if (!(km >= 0.1 && km <= 200)) msg = 'Enter a distance between 0.1 and 200 km.';
      else if (min > 0 && (min * 60 / km < 120 || min * 60 / km > 1500)) msg = 'Distance and time don\'t match. Pace must be between 2 and 25 minutes per km.';
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
        b.dataset.confirm = '1'; b.textContent = 'Once more';
        setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = 'Delete'; } }, 3000);
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
      if (!o || !Array.isArray(o.runs) || !Array.isArray(o.shoes)) { showErr($('#restore-err'), 'Couldn\'t read the backup. Make sure you pasted the whole copied text.'); return; }
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
      { pill: 'Reference range', msg: p => p <= 0 ? 'Doesn\'t exceed your recent longest run. This is the reference range in the study.' : 'Up to 10% beyond your longest run. This is the reference range in the study, though the risk here isn\'t zero either.' },
      { pill: 'Small spike', msg: () => 'In this range, the overuse injury rate was about 1.6× the reference range.' },
      { pill: 'Moderate spike', msg: () => 'In this range, the overuse injury rate was about 1.5× the reference range.' },
      { pill: 'Large spike', msg: () => 'More than double your longest run. In this range, the overuse injury rate was about 2.3× the reference range.' },
    ];
    function fill() { $('#sp-long').value = sp.long; $('#sp-plan').value = sp.plan; $('#wk-last').value = sp.last; $('#wk-plan').value = sp.week; }
    function render() {
      $('#sp-ex').hidden = !sp.example;
      const r = Core.spike(num(sp.long), num(sp.plan));
      showErr($('#spike-err'), r ? '' : 'Enter both distances as numbers greater than 0.');
      if (r) {
        const pct = Math.round(r.pct);
        $('#spike-res').dataset.level = r.level;
        $('#sp-pct').textContent = (pct > 0 ? '+' : '') + pct + '%';
        $('#sp-pill').textContent = SPIKE[r.level].pill;
        $$('#spike-res .scale div').forEach((d, k) => d.classList.toggle('on', k === r.level));
        $('#sp-msg').textContent = SPIKE[r.level].msg(r.pct);
        $('#sp-cap').textContent = `The suggested cap for this run is ${km1(r.cap)}km: your recent longest run of ${km1(num(sp.long))}km plus 10%.`;
      }
      const a = num(sp.last), b = num(sp.week);
      if (a > 0 && b > 0) {
        const w = Math.round((b - a) / a * 100);
        $('#wk-msg').textContent = `Change from last week: ${w > 0 ? '+' : ''}${w}%. ` + (w <= 10 ? 'Within the 10% weekly rule.' : w <= 30 ? 'Over the 10% weekly rule. Spread the extra distance instead of piling it into one day.' : 'That\'s more than 30% in a week. Spread the extra distance instead of piling it into one day.');
      } else $('#wk-msg').textContent = 'Enter last week\'s distance and this week\'s plan to see the change.';
      const runs = getRuns(), box = $('#sp-from-log');
      box.hidden = !runs.length;
      if (runs.length) {
        const s = Core.logStats(runs, today(), 8);
        $('#sp-pull').disabled = !(s.longest30 > 0);
        $('#sp-pull-note').textContent = s.longest30 > 0 ? `Longest in 30 days ${km1(s.longest30)}km, last week ${km1(s.lastWeek)}km` : 'No runs in the last 30 days.';
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
    const SHOE_PILL = ['Plenty left', 'Start checking', 'Replacement range', 'Replace now'];
    function shoeMsg(s, st) {
      const weeks = d => (s.wk > 0 && d > 0) ? ` At ${km1(s.wk)}km a week, that's about ${Math.ceil(d / s.wk)} weeks away.` : '';
      if (st.level === 0) return `${Math.round(st.toLo)}km more puts them in the replacement range (${st.lo}~${st.hi}km).` + weeks(st.toLo);
      if (st.level === 1) return `Replacement range in ${Math.round(st.toLo)}km. Start checking the outsole and midsole now.` + weeks(st.toLo);
      if (st.level === 2) return `In the replacement range. Replace them if any item below applies. The upper limit of ${st.hi}km is ${Math.round(st.toHi)}km away.` + weeks(st.toHi);
      return `${st.hi}km exceeded. Get a new pair ready.`;
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
          <div class="shoe-km">${esc(Core.SHOE_TYPES[s.type].label)} · Total<b>${km1(s.km)}</b>km</div>
          <div class="meter" aria-hidden="true"><span class="band" style="left:${p(st.lo)};width:${((st.hi - st.lo) / max * 100).toFixed(1)}%"></span><span class="fill" style="width:${p(s.km)}"></span></div>
          <div class="meter-lab" aria-hidden="true"><span>0</span><span style="left:${p(st.lo)}">${st.lo}</span><span style="left:${p(st.hi)}">${st.hi}km</span></div>
          <p>${shoeMsg(s, st)}</p>
          ${isEx ? '' : `<div class="shoe-act"><label class="sr" for="add-${esc(s.id)}">Add distance (km)</label><input type="text" id="add-${esc(s.id)}" inputmode="decimal" autocomplete="off" maxlength="5" placeholder="km run today"><button type="button" class="btn" data-act="add">Add</button><button type="button" class="btn ghost" data-act="del">Delete</button></div>`}
        </li>`;
      }).join('');
      $('#shoe-cta').hidden = isEx || worst < 2;
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
        b.dataset.confirm = '1'; b.textContent = 'Tap again to delete';
        setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = 'Delete'; } }, 3000);
        return;
      }
      store.set('shoes', shoes); render();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#sh-name').value.trim(), km = $('#sh-km').value.trim() === '' ? 0 : num($('#sh-km').value), wk = num($('#sh-wk').value);
      if (!name) { showErr($('#shoe-err'), 'Enter a shoe name.'); $('#sh-name').focus(); return; }
      if (!(km >= 0 && km <= 5000)) { showErr($('#shoe-err'), 'Enter a distance between 0 and 5000 km.'); $('#sh-km').focus(); return; }
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
    const HR_NAME = { E: 'Easy', M: 'Marathon', T: 'Threshold', I: 'Intervals' }, HR_PCT = { E: '65~79%', M: '80~89%', T: '88~92%', I: '98~100%' };
    function render() {
      $('#hr-ex').hidden = !hr.example;
      const age = num(hr.age), measured = num(hr.max);
      let max, msg = '';
      if (hr.max !== '') { if (measured >= 120 && measured <= 230) max = measured; else msg = 'Enter a max heart rate between 120 and 230.'; }
      else if (age >= 10 && age <= 90) max = Math.round(Core.estMaxHr(age));
      else msg = 'Enter an age between 10 and 90.';
      showErr($('#heart-err'), msg);
      if (!max) return;
      $('#hr-note').textContent = hr.max !== ''
        ? `Calculated from your measured max heart rate of ${max} bpm.`
        : `Max heart rate estimated at ${max} bpm (208 − 0.7 × age). Estimates vary by about 10 beats from person to person. If you have a value measured after an all-out run, enter it.`;
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
    const PACE_ROWS = [['400m', 0.4], ['1km', 1], ['5K', 5], ['10K', 10], ['Half', 21.0975], ['Full', 42.195]];
    const st = Object.assign({ sec: 360 }, store.get('pace', null) || {});
    function render(src) {
      const sec = st.sec;
      if (src !== 'pace') { const s = Math.round(sec); $('#pc-m').value = Math.floor(s / 60); $('#pc-s').value = pad(s % 60); }
      if (src !== 'kmh') $('#pc-kmh').value = (3600 / sec).toFixed(1);
      $('#pace-rows').innerHTML = PACE_ROWS.map(r => `<tr><td>${r[0]}</td><td class="n">${Core.fmtTime(sec * r[1] / 60)}</td></tr>`).join('');
    }
    function onInput(src) {
      const sec = src === 'pace' ? (num($('#pc-m').value) || 0) * 60 + (num($('#pc-s').value) || 0) : 3600 / num($('#pc-kmh').value);
      if (!(sec >= 120 && sec <= 1200)) { showErr($('#pace-err'), 'Enter a pace between 2 and 20 minutes per km (3–30 km/h).'); return; }
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
    const TICK = ['5%', '10%', '25%', 'Mid', '75%', '90%', '95%'];
    const TIER = { 25: 'The peer bottom-25% mark', 50: 'The peer median', 75: 'The peer top-25% mark', 90: 'The peer top-10% mark', 95: 'The peer top-5% mark' };
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
        if (st.cm === '') msg = 'Enter the distance covered in 12 minutes, in meters.';
        else if (!(m >= 1000 && m <= 5000)) msg = 'Enter a distance between 1000 and 5000 m.';
        else v = Core.cooper(m);
      } else {
        const min = (num(st.wm) || 0) + (num(st.ws) || 0) / 60, hr = num(st.hr), kg = num(st.kg);
        if (st.wm === '' || st.hr === '' || st.kg === '') msg = 'Enter your time, finish heart rate and weight.';
        else if (!(min >= 8 && min <= 30)) msg = 'Enter a 1.6 km walk time between 8 and 30 minutes.';
        else if (!(hr >= 60 && hr <= 220)) msg = 'Enter a heart rate between 60 and 220.';
        else if (!(kg >= 30 && kg <= 200)) msg = 'Enter a weight between 30 and 200 kg.';
        else if (!(age >= 18 && age <= 90) || !sex) msg = 'The walk test needs your age and sex.';
        else v = Core.rockport({ kg, age, sex, min, hr });
      }
      if (!msg && !sex) msg = 'Select your sex.';
      if (!msg && v != null && !(v > 5)) msg = 'Can\'t calculate with these values. Please check the numbers.';
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
        if (diff >= 3 && fa.edge !== 'old') { level = '0'; pillText = 'Younger than your age'; }
        else if (diff <= -3 && fa.edge !== 'young') { level = '2'; pillText = 'Older than your age'; }
        else pillText = 'Close to your age';
      }
      if (level) res.dataset.level = level; else delete res.dataset.level;
      pill.textContent = pillText; pill.hidden = !pillText;
      $('#ft-vlab').textContent = st.method === 'index' ? BRAND : 'Estimated VO2max';
      $('#ft-v').textContent = v.toFixed(1);
      $('#ft-pct').textContent = pp ? `${pp.decade}s ${sex === 'M' ? 'men' : 'women'} ${pctText(pp, lower)}` : 'Ages 20–79 only';

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
        $('b', me).textContent = 'You ' + v.toFixed(1);
        $('#ft-ticks').innerHTML = row.v.map((x, k) => `<div>${x.toFixed(1)}<span>${TICK[k]}</span></div>`).join('');
        $('#ft-scale-cap').textContent = `${row.decade}s ${sex === 'M' ? 'men' : 'women'} — where you'd stand among 100 people lined up from lowest. Large numbers are the VO2max (ml/kg/min) at each point.`;
      }
      const nt = Core.nextTier(v, sex, age);
      let text = '';
      if (row && !nt) text = 'You\'re above the peer top-5% mark. Your goal now is to keep it.';
      else if (nt) {
        text = `${TIER[nt.pct]} is ${nt.value.toFixed(1)}. That's ${nt.gap.toFixed(1)} higher than you are now.`;
        if (st.method !== 'walk') text += ` In 5K terms that's about ${Core.fmtTime(Core.raceMinutes(nt.value, 5000))}.`;
      }
      $('#ft-msg').textContent = text; $('#ft-msg').hidden = !text;
      $('#ft-note').textContent = st.method === 'index' ? LOWER_NOTE + (c.long ? LONG_NOTE : '')
        : st.method === 'cooper' ? 'The 12-minute run equation only holds for an all-out effort.'
        : 'The walk equation has an error of about 4–6.' + ((age < 30 || age > 69) ? ' Errors may be larger outside ages 30–69.' : '');
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
    const CITIES = [['Seoul', 37.57, 126.98], ['Incheon', 37.46, 126.71], ['Suwon', 37.26, 127.03], ['Chuncheon', 37.88, 127.73], ['Gangneung', 37.75, 128.88], ['Cheongju', 36.64, 127.49], ['Daejeon', 36.35, 127.38], ['Sejong', 36.48, 127.29],
      ['Jeonju', 35.82, 127.15], ['Gwangju', 35.16, 126.85], ['Daegu', 35.87, 128.6], ['Pohang', 36.02, 129.34], ['Ulsan', 35.54, 129.31], ['Busan', 35.18, 129.08], ['Changwon', 35.23, 128.68], ['Jeju', 33.5, 126.53]];
    const WX = 'https://api.open-meteo.com/v1/forecast?', AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality?';
    const SRC_NOTE = 'Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> · Air quality from CAMS forecasts. Particulate values are model forecasts, not station readings, so they may differ from <a href="https://www.airkorea.or.kr/" target="_blank" rel="noopener">AirKorea</a> measurements. Grades follow Korea\'s Ministry of Environment forecast standard; forecast cells show the daily average (㎍/㎥).';
    const sel = $('#wx-city'), hereBtn = $('#wx-here'), note = $('#wx-note');
    const st = Object.assign({ city: 'Seoul', here: false }, store.get('wx', null) || {});
    const useHere = () => !!st.here && Number.isFinite(st.lat) && Number.isFinite(st.lon);
    const place = () => {
      if (useHere()) return { name: 'My location', lat: st.lat, lon: st.lon };
      const c = CITIES.find(x => x[0] === st.city) || CITIES[0];
      return { name: c[0], lat: c[1], lon: c[2] };
    };
    function fillSel() {
      sel.innerHTML = (useHere() ? '<option value="@">My location</option>' : '') + CITIES.map(c => `<option value="${c[0]}">${c[0]}</option>`).join('');
      sel.value = useHere() ? '@' : place().name;
    }
    const hm = iso => (typeof iso === 'string' && iso.length >= 16) ? iso.slice(11, 16) : '–';
    const one = v => Number.isFinite(v) ? v.toFixed(1) : '–';
    const clock = at => { const d = new Date(at); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    function getJson(url) {
      const ac = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { if (ac) ac.abort(); }, 12000);
      const done = x => { clearTimeout(timer); return x; };
      return fetch(url, ac ? { signal: ac.signal } : {})
        .then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(j => { throw new Error('HTTP ' + r.status + (j && j.reason ? ' · ' + j.reason : '')); }))
        .then(done, e => { done(); throw e; });
    }
    const wait = ms => new Promise(res => setTimeout(res, ms));
    const why = e => (e && e.name === 'AbortError') ? 'Request timed out' : String((e && e.message) || e).slice(0, 140);
    let wxErr = '';
    /* 기온: 실패하면 잠깐 뒤 한 번 더, 그래도 안 되면 일출·일몰을 뺀 가장 단순한 요청으로 */
    function getWeather(q) {
      const cur = '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code';
      const full = WX + q + cur + '&daily=sunrise,sunset&wind_speed_unit=ms&forecast_days=1', lite = WX + q + cur;
      wxErr = '';
      return getJson(full)
        .catch(e => /^HTTP 4/.test(e.message) ? getJson(lite) : wait(1200).then(() => getJson(full)).catch(() => getJson(lite)))
        .catch(e => { wxErr = why(e); return null; });
    }
    function getAir(q) {
      const u = AQ + q + '&current=pm10,pm2_5&hourly=pm10,pm2_5&forecast_days=5';
      return getJson(u).catch(() => wait(1200).then(() => getJson(u))).catch(() => null);
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
    const chip = (kind, v) => { const g = Core.pmGrade(kind, v); return g ? `<span class="pmc" data-g="${g.level}"><b>${g.value}</b><i>${g.label}</i></span>` : '<span class="pmc"><b>–</b><i>N/A</i></span>'; };
    const nowTxt = (kind, v, name) => { const g = Core.pmGrade(kind, v); return g ? `<span>${name} <b>${g.value}</b><em data-g="${g.level}">${g.label}</em></span>` : ''; };
    const dayHead = d => { const dt = new Date(d + 'T00:00:00'), wd = '<small>' + 'Sun,Mon,Tue,Wed,Thu,Fri,Sat'.split(',')[dt.getDay()] + '</small>'; return (d === today() ? 'Today' : (dt.getMonth() + 1) + '/' + dt.getDate()) + wd; };
    function paint(data, at, stale) {
      const n = data.now, a = data.air && data.air.d10 && data.air.d10.length ? data.air : null;
      $('#wx-t').textContent = n ? n.t.toFixed(1) + '°' : '–';
      $('#wx-sky').textContent = n ? Core.skyText(n.code) : '';
      $('#wx-facts').innerHTML = n
        ? [['Feels like', one(n.feels) + '°'], ['Humidity', Number.isFinite(n.hum) ? Math.round(n.hum) + '%' : '–'], ['Wind', one(n.wind) + 'm/s'], ['Sunrise', n.rise], ['Sunset', n.set]].map(f => `<li>${f[0]}<b>${f[1]}</b></li>`).join('')
        : '<li>Couldn\'t load the temperature. <button type="button" class="linkish" data-wx-retry>Try again</button></li>';
      const tip = $('#wx-tip'), t = Core.runTip({ feels: n ? n.feels : NaN, code: n ? n.code : NaN, pm10: a ? a.pm10 : null, pm25: a ? a.pm25 : null });
      tip.hidden = !t;
      if (t) { tip.textContent = t.text; tip.dataset.level = t.level; }
      if (a) {
        const days = a.d10.slice(0, 5), m25 = {};
        a.d25.forEach(x => { m25[x.date] = x.mean; });
        const nowLine = [nowTxt('pm10', a.pm10, 'PM10'), nowTxt('pm25', a.pm25, 'PM2.5')].filter(Boolean).join('');
        $('#wx-air').innerHTML = (nowLine ? `<p class="wx-airnow"><i>Now</i>${nowLine}</p>` : '') +
          '<div class="tbl-wrap"><table class="pm"><caption class="sr">Five-day particulate forecast, daily average</caption><thead><tr><th scope="col"><span class="sr">Item</span></th>' +
          days.map(x => `<th scope="col">${dayHead(x.date)}</th>`).join('') + '</tr></thead><tbody>' +
          `<tr><th scope="row">Fine dust<small>PM10</small></th>${days.map(x => `<td>${chip('pm10', x.mean)}</td>`).join('')}</tr>` +
          `<tr><th scope="row">Ultrafine<small>PM2.5</small></th>${days.map(x => `<td>${chip('pm25', m25[x.date])}</td>`).join('')}</tr></tbody></table></div>`;
      } else $('#wx-air').innerHTML = '<p class="note">Couldn\'t load the particulate forecast.</p>';
      note.innerHTML = clock(at) + ' ' + (stale ? ' · Couldn\'t refresh; showing saved values' : '') + (!n && wxErr ? ' · Temperature error: ' + esc(wxErr) : '') + ' · ' + SRC_NOTE;
    }
    function fail() {
      $('#wx-t').textContent = '–'; $('#wx-sky').textContent = ''; $('#wx-tip').hidden = true; $('#wx-air').innerHTML = '';
      $('#wx-facts').innerHTML = '<li>' + (SITE.mode === 'site' ? 'Couldn\'t load the weather. <button type="button" class="linkish" data-wx-retry>Try again</button>' : 'Weather can\'t load in this preview. It appears on the published site.') + '</li>';
      note.innerHTML = (wxErr ? 'Error: ' + esc(wxErr) + ' · ' : '') + SRC_NOTE;
    }
    let seq = 0;
    function load(force) {
      const p = place(), key = p.lat.toFixed(2) + ',' + p.lon.toFixed(2), hit = store.get('wxc', null), mine = ++seq;
      const cached = hit && hit.key === key && hit.data ? hit : null;
      const fresh = !!cached && Date.now() - cached.at < 20 * 60000;
      // 기온과 대기질을 둘 다 받아 둔 경우에만 20분 동안 다시 묻지 않는다. 한쪽이 비었으면 열 때마다 다시 받는다
      if (!force && fresh && cached.data.now && cached.data.air) { paint(cached.data, cached.at, false); return; }
      if (typeof fetch !== 'function') { fail(); return; }
      if (cached) paint(cached.data, cached.at, false);
      if (force || !cached) $('#wx-facts').innerHTML = '<li>Loading…</li>';
      const q = 'latitude=' + p.lat + '&longitude=' + p.lon + '&timezone=Asia%2FSeoul';
      Promise.all([getWeather(q), getAir(q)]).then(r => {
        if (mine !== seq) return;
        const got = pack(r[0], r[1]), old = fresh ? cached.data : null;
        const data = { now: got.now || (old && old.now) || null, air: got.air || (old && old.air) || null };
        if (!data.now && !data.air) { if (cached) paint(cached.data, cached.at, true); else fail(); return; }
        const at = Date.now();
        store.set('wxc', { key, at, data });
        paint(data, at, false);
      }).catch(fail);
    }
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
        hereBtn.disabled = false; hereBtn.textContent = 'Couldn\'t get your location';
        setTimeout(() => { hereBtn.textContent = 'My location'; }, 2500);
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
      $('#rl-count').textContent = n + ' races' + (st.tab === 'last' ? ' · by 2026 race date' : '');
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
    if (sel && e.clipboardData) e.clipboardData.setData('text/plain', sel + '\n\nSource: ' + BRAND + ' ' + (SITE.siteUrl ? SITE.siteUrl.replace(/\/$/, '') + location.pathname : location.href));
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
