/* 화면 동작. 화면에 있는 도구만 초기화하므로 한 장짜리 미리보기와 도구별 페이지에서 같은 파일을 쓴다. */
(() => {
  'use strict';

  /* 사이트 설정은 site.config.json에서 빌드할 때 window.SITE로 들어온다 */
  const SITE = Object.assign({ mode: 'artifact', brand: '런지수', siteUrl: '', partnerLinks: {}, paths: null, pwa: false }, window.SITE || {});
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
    try { navigator.clipboard.writeText(text).then(() => done('복사했습니다'), () => done('복사하지 못했습니다')); }
    catch (err) { done('복사하지 못했습니다'); }
  }
  const sourceLine = () => BRAND + (SITE.siteUrl ? ' ' + SITE.siteUrl : '');

  /* ── 모든 도구가 함께 쓰는 값: 첫 화면에서 넣은 기록과 런지수 ── */
  const DIST_LABEL = { '3000': '3K', '5000': '5K', '10000': '10K', '21097.5': '하프', '42195': '풀' };
  const HOME_DEFAULT = { dist: '10000', km: '', h: '', m: '55', s: '00', age: '', sex: '', example: true };
  const loadHome = () => Object.assign({}, HOME_DEFAULT, store.get('home', null) || {});
  function evalHome(h) {
    const custom = h.dist === 'custom';
    const meters = custom ? num(h.km) * 1000 : parseFloat(h.dist);
    const minutes = (num(h.h) || 0) * 60 + (num(h.m) || 0) + (num(h.s) || 0) / 60;
    let msg = '';
    if (custom && !(meters > 0)) msg = '달린 거리를 km로 입력해 주세요.';
    else if (meters < 800 || meters > 100000) msg = '거리는 0.8km에서 100km 사이로 입력해 주세요.';
    else if (!(minutes > 0)) msg = '기록을 입력해 주세요.';
    else {
      const sec = minutes * 60 / (meters / 1000);
      if (sec < 120) msg = 'km당 2분보다 빠른 기록입니다. 거리와 시간을 확인해 주세요.';
      else if (sec > 900) msg = 'km당 15분보다 느린 기록은 계산할 수 없습니다. 거리와 시간을 확인해 주세요.';
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
      el.innerHTML = `${esc(BRAND)} <b>${c.idx.toFixed(1)}</b><span>${esc(c.basis)} 기준${c.example ? ' · 예시 기록' : ''}</span><a href="${href('home')}">${c.example ? '내 기록 넣기' : '기록 바꾸기'} →</a>`;
    });
    return c;
  }

  const refreshers = {};      // 화면 이름 → 다시 그리기 (한 장짜리에서 화면을 옮길 때 쓴다)

  /* ── 제휴 링크 ── */
  $$('.shop').forEach(a => { const u = SITE.partnerLinks[a.dataset.shop]; if (u) { a.href = u; a.rel = 'noopener sponsored'; } });

  /** lower: 달리기 기록에서 나온 값. 실험실 VO2max보다 낮게 나오는 편이라 '적어도 이 순위'로 적는다 */
  function pctText(pp, lower) {
    const top = 100 - pp.pct;
    if (pp.edge === 'high') return '상위 5% 이내';
    if (pp.edge === 'low') return lower ? '하위 5% 근처' : '하위 5% 이내';
    if (lower) return '상위 약 ' + Math.round(top) + '% 이내';
    return top <= 50 ? '상위 약 ' + Math.round(top) + '%' : '하위 약 ' + Math.round(pp.pct) + '%';
  }
  const ageText = (fa, lower) => fa.edge === 'young' ? '20대 평균 이상' : fa.edge === 'old' ? '70대 평균 이하' : '약 ' + Math.round(fa.age) + '세' + (lower ? ' 이하' : '');
  const LOWER_NOTE = '달리기 기록으로 구한 값은 실험실에서 잰 VO2max보다 낮게 나오는 편이라, 실제 체력 나이는 이보다 젊고 순위는 이보다 높을 가능성이 큽니다.';
  const LONG_NOTE = ' 특히 하프·풀코스 기록에는 지구력과 보급까지 섞여 있어 5K·10K 기록으로 구한 값보다 더 낮게 나오기 쉽습니다. 5K나 10K를 힘껏 달린 기록이 있으면 그 기록으로 다시 계산해 보세요.';

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
      const base = '비교 기준은 미국 성인 7,783명의 운동부하검사 자료(FRIEND, 2015)입니다.';
      if (idx == null || !sex || !Number.isFinite(age)) {
        elAge.textContent = '–'; elPct.textContent = '–'; elGroup.textContent = '같은 연령대 기준';
        $('#peer-note').textContent = `나이와 성별을 넣으면 내 ${J(BRAND, '가')} 어느 연령대 평균과 같은지, 또래 가운데 어디쯤인지 보여 드립니다. ` + base;
        return;
      }
      const fa = Core.fitnessAge(idx, sex), pp = Core.peerPercentile(idx, sex, age);
      const r = evalHome(home), long = !r.msg && r.meters >= 21000;
      elAge.textContent = ageText(fa, true);
      if (!pp) { elPct.textContent = '–'; elGroup.textContent = '20~79세만 비교할 수 있습니다'; }
      else { elPct.textContent = pctText(pp, true); elGroup.textContent = pp.decade + '대 ' + (sex === 'M' ? '남성' : '여성') + ' 기준'; }
      $('#peer-note').textContent = LOWER_NOTE + (long ? LONG_NOTE : '') + ' ' + base;
    }
    function renderGates(pr) {
      pr.forEach(p => {
        const el = $('#gate-' + p.id); if (!el) return;
        const g = Core.gate(p.id, p.minutes);
        $('.k', el).textContent = p.label + ' ' + Core.fmtTime(p.minutes);
        $('.big', el).textContent = g.passed ? g.passedLabel : '첫 관문 전';
        $('.cap', el).textContent = g.next ? g.nextLabel + '까지 ' + Core.fmtTime(g.gapSec / 60) + ' 단축' : '가장 빠른 관문을 지났습니다';
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
      const ko = BRAND + ' 훈련 페이스 예상 기록 기준 하프 풀 같은 수준으로 준비했을 때 하나로 아는 내 직접 입력';
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
      text(d.basis + ' 기준', cx + cw - 76, cy + 68, '600 30px ' + F_BODY, '#fff', 'right', cw * 0.42);
      text(d.idx.toFixed(1), mid, cy + 500, '800 440px ' + F_NUM, INK, 'center', cw - 150);
      text(BRAND, mid, cy + 592, '400 66px ' + F_HEAD, INK);
      dash(cy + 640, cx + 40, cx + cw - 40);
      text('같은 수준으로 준비했을 때 예상 기록', mid, cy + 692, '600 28px ' + F_BODY, SUB);
      const pw = (cw - 80) / 4;
      d.pr.forEach((p, i) => {
        const px = cx + 40 + pw * i + pw / 2;
        if (i) vdash(cx + 40 + pw * i, cy + 716, cy + 826);
        text(p.label, px, cy + 748, '700 30px ' + F_BODY, SUB);
        text(Core.fmtTime(p.minutes), px, cy + 818, '700 66px ' + F_NUM, INK, 'center', pw - 26);
      });
      dash(cy + 856, cx + 40, cx + cw - 40);
      text('훈련 페이스 /km', mid, cy + 908, '600 28px ' + F_BODY, SUB);
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
      text('기록 하나로 아는 내 ' + BRAND, cx + cw - 6, cy + ch + 92, '500 30px ' + F_BODY, '#9aa8be', 'right', cw * 0.46);
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
      $('#bib-basis').textContent = r.basis + ' 기준';
      pr.forEach(p => { $('#pr-' + p.id).textContent = Core.fmtTime(p.minutes); });
      setLane('e', z.eFast, z.eSlow, z.r); setLane('m', z.m, null, z.r); setLane('t', z.t, null, z.r); setLane('i', z.i, null, z.r); setLane('r', z.r, null, z.r);
      $('#range-note').textContent = (r.minutes < 3.5 || r.minutes > 240)
        ? '이 기록은 공식이 잘 맞는 범위(약 3분 30초~4시간)를 벗어나 오차가 클 수 있습니다.'
        : `${J(BRAND, '는')} 레이스 기록에서 거꾸로 계산한 유산소 능력 지수입니다.`;
      renderPeer(idx);
      renderGates(pr);
      lastData = { idx, basis: r.basis, z, pr }; hideShare();
      lastSummary = [
        `내 ${BRAND} ${idx.toFixed(1)} (${r.basis} 기준)`,
        `훈련 페이스 /km  E ${range(z.eFast, z.eSlow, Core.fmtPace)} · M ${Core.fmtPace(z.m)} · T ${Core.fmtPace(z.t)} · I ${Core.fmtPace(z.i)} · R ${Core.fmtPace(z.r)}`,
        '예상 기록  ' + pr.map(p => p.label + ' ' + Core.fmtTime(p.minutes)).join(' · '),
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
          pic.src = url; pic.alt = `내 ${BRAND} ${d.idx.toFixed(1)} 결과 이미지`;
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
        if (shareFile && navigator.share) navigator.share({ files: [shareFile], title: `내 ${BRAND} ${lastData.idx.toFixed(1)}`, text: sourceLine() }).catch(() => { /* 닫으면 그대로 둔다 */ });
      });
    }
    refreshers.home = () => { Object.assign(home, loadHome()); fill(); render(); };
    fill(); render();
  })();


  /* ───────── 목표 대회: 대회 일정에서 고르고 대회 계획에서 이어 쓴다 ───────── */
  const daysTo = d => Core.dayNum(d) - Core.dayNum(today());
  const ddayText = n => n > 0 ? 'D-' + n : n === 0 ? 'D-DAY' : '종료';
  const getGoal = () => { const g = store.get('goal', null); return g && g.date && daysTo(g.date) >= 0 ? g : null; };
  function renderGoalLine() {
    const el = $('#rc-goal'); if (!el) return;
    const g = getGoal();
    el.hidden = !g;
    if (g) el.innerHTML = `목표 대회 <b>${ddayText(daysTo(g.date))}</b><span>${esc(g.name)}</span><a href="${href('calendar')}">대회 일정 →</a>`;
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
        if (btn) { btn.hidden = n < 0; btn.textContent = isGoal ? '목표 대회 해제' : '목표 대회로 정하기'; }
      });
      box.innerHTML = g
        ? `내 목표 대회 <b>${ddayText(daysTo(g.date))}</b><span>${esc(g.name)}</span><a href="${href('race')}" id="goal-plan">구간표 만들기 →</a>`
        : '<span>날짜가 확정된 대회에서 목표 대회를 정하면 남은 날을 세어 드리고, 대회 계획 화면에 이어서 보여 드립니다.</span>';
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
    const NAME = { '5000': '5K', '10000': '10K', '21097.5': '하프', '42195': '풀코스' };
    const FINISH = { '5000': '5km', '10000': '10km', '21097.5': '21.0975km', '42195': '42.195km' };
    const PILL = ['지금 실력 안쪽', '도전적인 목표', '지금은 빠른 목표'];
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
      if (!(minutes > 0)) msg = '목표 기록을 입력해 주세요.';
      else {
        const sec = minutes * 60 / (meters / 1000);
        if (sec < 120) msg = 'km당 2분보다 빠른 목표입니다. 시간을 확인해 주세요.';
        else if (sec > 900) msg = 'km당 15분보다 느린 목표는 계산할 수 없습니다. 시간을 확인해 주세요.';
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
      const both = `이 목표에 필요한 ${J(BRAND, '는')} ${need}, 지금 ${J(BRAND, '는')} ${cur}입니다.`;
      if (g.level === 0 && g.gap < -1.5) text = both + ' 여유가 있는 목표입니다.';
      else if (g.level === 0) text = both + ' 거의 같아서 준비가 맞으면 노려볼 만한 목표입니다.';
      else if (g.level === 1) text = both + ` ${gap}만큼 모자라지만 훈련이 몇 주 더 쌓이면 닿을 수 있는 범위입니다. 대회 날 처음 몇 km는 구간표보다 빠르게 가지 마세요.`;
      else text = both + ` ${gap}만큼 모자랍니다. 이 속도로 출발하면 후반에 크게 느려질 가능성이 높습니다. 지금 ${J(BRAND, '로')} 본 ${NAME[st.dist]} 예상 기록은 ${Core.fmtTime(Core.raceMinutes(c.idx, meters))}입니다.`;
      $('#rc-msg').textContent = text;
      const notes = [];
      if (st.mode === 'neg') notes.push(`전반은 km당 ${Core.fmtPace(sp.first)}, 후반은 ${Core.fmtPace(sp.second)}로 나눴습니다. 평균보다 1.5%씩 느리고 빠른 속도입니다.`);
      if (st.dist === '42195') notes.push(`짧은 거리 기록에서 나온 ${J(BRAND, '로')} 본 풀코스 목표는 30km 이상 장거리 훈련이 받쳐 줄 때만 맞습니다.`);
      $('#rc-note').textContent = notes.join(' ');
      $('#rc-note').hidden = !notes.length;

      const half = meters / 2;
      const rows = sp.rows.map(r => {
        const last = Math.abs(r.to - meters) < 0.5, label = last ? '골인 ' + FINISH[st.dist] : (r.to / 1000) + 'km';
        const mid = st.mode === 'neg' && r.from >= half - 0.5 && r.from - half < (r.to - r.from) - 0.5;
        return { label, pace: Core.fmtPace(r.pace), cum: Core.fmtTime(r.cum / 60), mid };
      });
      $('#split-rows').innerHTML = rows.map(r => `<tr${r.mid ? ' class="mid"' : ''}><td>${r.label}</td><td class="n">${r.pace}</td><td class="n">${r.cum}</td></tr>`).join('');
      splitText = [`${NAME[st.dist]} 목표 ${Core.fmtTime(minutes)} · 평균 ${Core.fmtPace(sp.avg)}/km`].concat(rows.map(r => `${r.label}  ${r.cum}  (${r.pace}/km)`), [sourceLine()]).join('\n');
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
    const DOW = ['월', '화', '수', '목', '금', '토', '일'];
    const CHIP = { E: 'e', L: 'e', T: 't', I: 'i', M: 'm' }, LETTER = { E: 'E', L: 'E', T: 'T', I: 'I', M: 'M' };
    let planText = '';

    function describe(d, p) {
      const z = p.paces, eR = range(z.eFast, z.eSlow, Core.fmtPace);
      if (d.role === 'rest') return { title: '쉬는 날', pace: '', detail: '걷기나 가벼운 스트레칭 정도만.' };
      if (d.role === 'E') return { title: '이지 런', pace: eR, detail: '대화가 되는 속도로.' + (d.strides ? ' 끝나고 20초 가속주 4~6회(전력의 90%쯤, 사이에는 충분히 걷기).' : '') };
      if (d.role === 'L') return { title: '장거리', pace: eR, detail: `약 ${Math.round(p.longMin)}분. E 범위의 느린 쪽에서 시작합니다.` };
      const s = d.session;
      if (d.role === 'T') return { title: '역치 훈련', pace: Core.fmtPace(z.t), detail: `준비 ${km1(s.wu)}km 이지 → T 페이스로 1km × ${s.reps}회, 사이마다 1분 걷기 → 마무리 ${km1(s.cd)}km 이지.` };
      if (d.role === 'I') return { title: '인터벌', pace: Core.fmtPace(z.i), detail: `준비 ${km1(s.wu)}km 이지 → I 페이스로 ${s.repM}m × ${s.reps}회(한 번에 약 ${Core.fmtPace(s.restSec)}), 사이마다 달린 시간만큼 천천히 조깅 → 마무리 ${km1(s.cd)}km 이지.` };
      return { title: '마라톤 페이스 런', pace: Core.fmtPace(z.m), detail: `준비 ${km1(s.wu)}km 이지 → M 페이스로 ${km1(s.work)}km 이어 달리기 → 마무리 ${km1(s.cd)}km 이지.` };
    }
    function render() {
      const c = renderBasis(), W = num(st.km);
      $('#pl-ex').hidden = !(st.example && c.example);
      const p = Core.weekPlan(c.idx, W, parseInt(st.days, 10), st.goal);
      showErr($('#plan-err'), p ? '' : '주간 거리는 10km에서 160km 사이로 입력해 주세요.');
      if (!p) return;
      $('#pl-total').innerHTML = km1(p.total) + '<small>km</small>';
      $('#pl-days-cap').textContent = '주 ' + p.runDays + '일';
      $('#pl-easy').innerHTML = Math.round(p.easyShare * 100) + '<small>%</small>';
      $('#pl-long').innerHTML = km1(p.longKm) + '<small>km</small>';
      $('#pl-long-cap').textContent = `장거리 · 약 ${Math.round(p.longMin)}분`;
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
      if (p.adjustedFrom && p.runDays < p.adjustedFrom) notes.push(`주 ${km1(W)}km를 ${p.adjustedFrom}일로 나누면 하루가 3km도 안 되어 ${p.runDays}일로 줄였습니다.`);
      if (p.adjustedFrom && p.runDays > p.adjustedFrom) notes.push(`주 ${km1(W)}km를 ${p.adjustedFrom}일에 달리면 평일 하루가 장거리보다 길어져 ${p.runDays}일로 늘렸습니다.`);
      if (p.overload) notes.push(`이 페이스로 주 ${km1(W)}km는 6일로 나눠도 하루가 150분을 넘습니다. 하루 두 번으로 나누거나 주간 거리를 다시 확인하세요.`);
      if (p.longCapped) notes.push('장거리는 150분에서 끊었습니다. 그보다 길면 얻는 것보다 회복에 드는 시간이 커집니다.');
      else if (p.longShare > 0.31) notes.push(`장거리가 주간 거리의 ${Math.round(p.longShare * 100)}%입니다. 달리는 날이 적어서 생기는 비중이니 150분 안쪽인지만 확인하세요.`);
      if (st.goal !== 'base' && p.quality === 0) notes.push(W < 20 ? '주 20km가 안 되어 강도 훈련 없이 짰습니다. 거리가 쌓이면 다시 짜 보세요.' : '가벼운 날이 너무 짧아져 강도 훈련을 뺐습니다.');
      $('#plan-notes').textContent = notes.join(' ');
      $('#plan-notes').hidden = !notes.length;
      planText = [`한 주 훈련표 · 주 ${km1(p.total)}km · ${BRAND} ${c.idx.toFixed(1)}`].concat(lines, [sourceLine()]).join('\n');
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
  const EXAMPLE_SHOES = [{ id: 'ex', name: '데일리 러닝화', type: 'daily', km: 430, wk: 30 }];
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
    const KIND = { E: '이지 런', L: '장거리', T: '역치 훈련', I: '인터벌·반복', M: '마라톤 페이스', X: '대회' };
    const WD = ['일', '월', '화', '수', '목', '금', '토'];
    let showN = 8;

    function fillShoeSelect() {
      const shoes = getShoes(), sel = $('#lg-shoe'), keep = sel.value;
      sel.innerHTML = '<option value="">고르지 않음</option>' + shoes.map(s => `<option value="${esc(s.id)}">${esc(s.name)} (${km1(s.km)}km)</option>`).join('');
      if (shoes.some(s => s.id === keep)) sel.value = keep;
      $('#lg-shoe-note').innerHTML = shoes.length ? '신발을 고르면 그 신발의 누적 거리에 더해집니다.' : `신발장에 신발을 넣어 두면 여기서 고를 수 있습니다. <a href="${href('shoes')}">신발 추가 →</a>`;
    }
    function render() {
      const real = getRuns(), isEx = !real.length, runs = isEx ? exampleRuns() : real;
      $('#lg-ex').hidden = !isEx;
      const s = Core.logStats(runs, today(), 8);
      $('#lg-week').innerHTML = km1(s.thisWeek) + '<small>km</small>';
      $('#lg-week-cap').textContent = '이번 주 지금까지 · 지난주 ' + km1(s.lastWeek) + 'km';
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
          ${isEx ? '' : '<button type="button" class="btn ghost small" data-act="del">삭제</button>'}
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) msg = '날짜를 골라 주세요.';
      else if (d > today()) msg = '오늘 이후 날짜는 기록할 수 없습니다.';
      else if (!(km >= 0.1 && km <= 200)) msg = '거리는 0.1km에서 200km 사이로 입력해 주세요.';
      else if (min > 0 && (min * 60 / km < 120 || min * 60 / km > 1500)) msg = '거리와 시간이 맞지 않습니다. km당 2분에서 25분 사이여야 합니다.';
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
        b.dataset.confirm = '1'; b.textContent = '한 번 더';
        setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = '삭제'; } }, 3000);
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
      if (!o || !Array.isArray(o.runs) || !Array.isArray(o.shoes)) { showErr($('#restore-err'), '백업 내용을 읽지 못했습니다. 복사한 글 전체를 그대로 붙여 넣었는지 확인해 주세요.'); return; }
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
      { pill: '기준 범위', msg: p => p <= 0 ? '최근 최장 거리를 넘지 않습니다. 연구에서 비교 기준이 된 구간입니다.' : '최장 거리보다 10% 이내로 늘립니다. 연구에서 비교 기준이 된 구간입니다. 이 구간도 위험이 0은 아닙니다.' },
      { pill: '소폭 급증', msg: () => '이 구간에서 과사용 부상 발생률이 기준 구간의 약 1.6배였습니다.' },
      { pill: '중간 급증', msg: () => '이 구간에서 과사용 부상 발생률이 기준 구간의 약 1.5배였습니다.' },
      { pill: '대폭 급증', msg: () => '최장 거리의 두 배를 넘습니다. 이 구간에서 과사용 부상 발생률이 기준 구간의 약 2.3배였습니다.' },
    ];
    function fill() { $('#sp-long').value = sp.long; $('#sp-plan').value = sp.plan; $('#wk-last').value = sp.last; $('#wk-plan').value = sp.week; }
    function render() {
      $('#sp-ex').hidden = !sp.example;
      const r = Core.spike(num(sp.long), num(sp.plan));
      showErr($('#spike-err'), r ? '' : '두 거리를 모두 0보다 큰 숫자로 입력해 주세요.');
      if (r) {
        const pct = Math.round(r.pct);
        $('#spike-res').dataset.level = r.level;
        $('#sp-pct').textContent = (pct > 0 ? '+' : '') + pct + '%';
        $('#sp-pill').textContent = SPIKE[r.level].pill;
        $$('#spike-res .scale div').forEach((d, k) => d.classList.toggle('on', k === r.level));
        $('#sp-msg').textContent = SPIKE[r.level].msg(r.pct);
        $('#sp-cap').textContent = `이번에 권하는 상한은 ${km1(r.cap)}km입니다. 최근 최장 거리 ${km1(num(sp.long))}km에 10%를 더한 값입니다.`;
      }
      const a = num(sp.last), b = num(sp.week);
      if (a > 0 && b > 0) {
        const w = Math.round((b - a) / a * 100);
        $('#wk-msg').textContent = `지난주보다 ${w > 0 ? '+' : ''}${w}%입니다. ` + (w <= 10 ? '주 10% 규칙 안쪽입니다.' : w <= 30 ? '주 10% 규칙을 넘습니다. 늘어난 거리를 하루에 몰지 말고 나누세요.' : '한 주에 30% 넘게 늘립니다. 늘어난 거리를 하루에 몰지 말고 나누세요.');
      } else $('#wk-msg').textContent = '지난주 거리와 이번 주 계획을 넣으면 변화율을 보여 드립니다.';
      const runs = getRuns(), box = $('#sp-from-log');
      box.hidden = !runs.length;
      if (runs.length) {
        const s = Core.logStats(runs, today(), 8);
        $('#sp-pull').disabled = !(s.longest30 > 0);
        $('#sp-pull-note').textContent = s.longest30 > 0 ? `최근 30일 최장 ${km1(s.longest30)}km, 지난주 ${km1(s.lastWeek)}km` : '최근 30일 기록이 없습니다.';
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
    const SHOE_PILL = ['여유 있음', '점검 시작', '교체 구간', '교체 권장'];
    function shoeMsg(s, st) {
      const weeks = d => (s.wk > 0 && d > 0) ? ` 주 ${km1(s.wk)}km 기준으로 약 ${Math.ceil(d / s.wk)}주 뒤입니다.` : '';
      if (st.level === 0) return `${Math.round(st.toLo)}km를 더 달리면 교체 구간(${st.lo}~${st.hi}km)에 들어갑니다.` + weeks(st.toLo);
      if (st.level === 1) return `교체 구간까지 ${Math.round(st.toLo)}km 남았습니다. 지금부터 밑창과 중창을 살펴보세요.` + weeks(st.toLo);
      if (st.level === 2) return `교체 구간입니다. 아래 점검 항목에 하나라도 해당하면 바꾸세요. 상한 ${st.hi}km까지 ${Math.round(st.toHi)}km 남았습니다.` + weeks(st.toHi);
      return `${st.hi}km를 넘었습니다. 새 신발을 준비하세요.`;
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
          <div class="shoe-km">${esc(Core.SHOE_TYPES[s.type].label)} · 누적<b>${km1(s.km)}</b>km</div>
          <div class="meter" aria-hidden="true"><span class="band" style="left:${p(st.lo)};width:${((st.hi - st.lo) / max * 100).toFixed(1)}%"></span><span class="fill" style="width:${p(s.km)}"></span></div>
          <div class="meter-lab" aria-hidden="true"><span>0</span><span style="left:${p(st.lo)}">${st.lo}</span><span style="left:${p(st.hi)}">${st.hi}km</span></div>
          <p>${shoeMsg(s, st)}</p>
          ${isEx ? '' : `<div class="shoe-act"><label class="sr" for="add-${esc(s.id)}">달린 거리 더하기(km)</label><input type="text" id="add-${esc(s.id)}" inputmode="decimal" autocomplete="off" maxlength="5" placeholder="오늘 달린 km"><button type="button" class="btn" data-act="add">더하기</button><button type="button" class="btn ghost" data-act="del">삭제</button></div>`}
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
        b.dataset.confirm = '1'; b.textContent = '한 번 더 누르면 삭제';
        setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = '삭제'; } }, 3000);
        return;
      }
      store.set('shoes', shoes); render();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#sh-name').value.trim(), km = $('#sh-km').value.trim() === '' ? 0 : num($('#sh-km').value), wk = num($('#sh-wk').value);
      if (!name) { showErr($('#shoe-err'), '신발 이름을 입력해 주세요.'); $('#sh-name').focus(); return; }
      if (!(km >= 0 && km <= 5000)) { showErr($('#shoe-err'), '달린 거리는 0에서 5000km 사이로 입력해 주세요.'); $('#sh-km').focus(); return; }
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
    const HR_NAME = { E: '이지', M: '마라톤', T: '역치', I: '인터벌' }, HR_PCT = { E: '65~79%', M: '80~89%', T: '88~92%', I: '98~100%' };
    function render() {
      $('#hr-ex').hidden = !hr.example;
      const age = num(hr.age), measured = num(hr.max);
      let max, msg = '';
      if (hr.max !== '') { if (measured >= 120 && measured <= 230) max = measured; else msg = '최대심박은 120에서 230 사이로 입력해 주세요.'; }
      else if (age >= 10 && age <= 90) max = Math.round(Core.estMaxHr(age));
      else msg = '나이를 10에서 90 사이로 입력해 주세요.';
      showErr($('#heart-err'), msg);
      if (!max) return;
      $('#hr-note').textContent = hr.max !== ''
        ? `직접 잰 최대심박 ${max}회/분으로 계산했습니다.`
        : `최대심박을 ${max}회/분으로 추정했습니다(208 − 0.7 × 나이). 추정값은 사람에 따라 10회 안팎 차이가 납니다. 전력으로 달린 뒤 잰 값이 있으면 그 값을 넣으세요.`;
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
    const PACE_ROWS = [['400m', 0.4], ['1km', 1], ['5K', 5], ['10K', 10], ['하프', 21.0975], ['풀', 42.195]];
    const st = Object.assign({ sec: 360 }, store.get('pace', null) || {});
    function render(src) {
      const sec = st.sec;
      if (src !== 'pace') { const s = Math.round(sec); $('#pc-m').value = Math.floor(s / 60); $('#pc-s').value = pad(s % 60); }
      if (src !== 'kmh') $('#pc-kmh').value = (3600 / sec).toFixed(1);
      $('#pace-rows').innerHTML = PACE_ROWS.map(r => `<tr><td>${r[0]}</td><td class="n">${Core.fmtTime(sec * r[1] / 60)}</td></tr>`).join('');
    }
    function onInput(src) {
      const sec = src === 'pace' ? (num($('#pc-m').value) || 0) * 60 + (num($('#pc-s').value) || 0) : 3600 / num($('#pc-kmh').value);
      if (!(sec >= 120 && sec <= 1200)) { showErr($('#pace-err'), '페이스는 km당 2분에서 20분 사이(시속 3~30km)로 입력해 주세요.'); return; }
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
    const TICK = ['5%', '10%', '25%', '중앙', '75%', '90%', '95%'];
    const TIER = { 25: '또래 하위 25% 선', 50: '또래 중앙값', 75: '또래 상위 25% 선', 90: '또래 상위 10% 선', 95: '또래 상위 5% 선' };
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
        if (st.cm === '') msg = '12분 동안 달린 거리를 m로 입력해 주세요.';
        else if (!(m >= 1000 && m <= 5000)) msg = '달린 거리는 1000m에서 5000m 사이로 입력해 주세요.';
        else v = Core.cooper(m);
      } else {
        const min = (num(st.wm) || 0) + (num(st.ws) || 0) / 60, hr = num(st.hr), kg = num(st.kg);
        if (st.wm === '' || st.hr === '' || st.kg === '') msg = '걸린 시간, 도착 직후 심박, 체중을 모두 입력해 주세요.';
        else if (!(min >= 8 && min <= 30)) msg = '1.6km 걷기 시간은 8분에서 30분 사이로 입력해 주세요.';
        else if (!(hr >= 60 && hr <= 220)) msg = '심박은 60에서 220 사이로 입력해 주세요.';
        else if (!(kg >= 30 && kg <= 200)) msg = '체중은 30kg에서 200kg 사이로 입력해 주세요.';
        else if (!(age >= 18 && age <= 90) || !sex) msg = '걷기 검사는 나이와 성별이 있어야 계산됩니다.';
        else v = Core.rockport({ kg, age, sex, min, hr });
      }
      if (!msg && !sex) msg = '성별을 골라 주세요.';
      if (!msg && v != null && !(v > 5)) msg = '입력한 값으로는 계산할 수 없습니다. 숫자를 다시 확인해 주세요.';
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
        if (diff >= 3 && fa.edge !== 'old') { level = '0'; pillText = '실제 나이보다 젊음'; }
        else if (diff <= -3 && fa.edge !== 'young') { level = '2'; pillText = '실제 나이보다 많음'; }
        else pillText = '실제 나이와 비슷';
      }
      if (level) res.dataset.level = level; else delete res.dataset.level;
      pill.textContent = pillText; pill.hidden = !pillText;
      $('#ft-vlab').textContent = st.method === 'index' ? BRAND : '추정 VO2max';
      $('#ft-v').textContent = v.toFixed(1);
      $('#ft-pct').textContent = pp ? `${pp.decade}대 ${sex === 'M' ? '남성' : '여성'} ${pctText(pp, lower)}` : '20~79세만 비교';

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
        $('b', me).textContent = '나 ' + v.toFixed(1);
        $('#ft-ticks').innerHTML = row.v.map((x, k) => `<div>${x.toFixed(1)}<span>${TICK[k]}</span></div>`).join('');
        $('#ft-scale-cap').textContent = `${row.decade}대 ${sex === 'M' ? '남성' : '여성'} 100명을 낮은 쪽부터 세웠을 때의 자리입니다. 큰 숫자는 그 자리의 VO2max(ml/kg/min)입니다.`;
      }
      const nt = Core.nextTier(v, sex, age);
      let text = '';
      if (row && !nt) text = '또래 상위 5% 선을 넘었습니다. 지금 수준을 지키는 것이 목표입니다.';
      else if (nt) {
        text = `${TIER[nt.pct]}은 ${nt.value.toFixed(1)}입니다. 지금보다 ${nt.gap.toFixed(1)} 높습니다.`;
        if (st.method !== 'walk') text += ` 5K 기록으로는 약 ${Core.fmtTime(Core.raceMinutes(nt.value, 5000))}에 해당합니다.`;
      }
      $('#ft-msg').textContent = text; $('#ft-msg').hidden = !text;
      $('#ft-note').textContent = st.method === 'index' ? LOWER_NOTE + (c.long ? LONG_NOTE : '')
        : st.method === 'cooper' ? '12분 달리기 식은 끝까지 힘을 다해 달렸을 때 맞습니다.'
        : '걷기 식의 오차는 4~6 정도입니다.' + ((age < 30 || age > 69) ? ' 30~69세 밖에서는 오차가 더 커질 수 있습니다.' : '');
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
    const CITIES = [['서울', 37.57, 126.98], ['인천', 37.46, 126.71], ['수원', 37.26, 127.03], ['춘천', 37.88, 127.73], ['강릉', 37.75, 128.88], ['청주', 36.64, 127.49], ['대전', 36.35, 127.38], ['세종', 36.48, 127.29],
      ['전주', 35.82, 127.15], ['광주', 35.16, 126.85], ['대구', 35.87, 128.6], ['포항', 36.02, 129.34], ['울산', 35.54, 129.31], ['부산', 35.18, 129.08], ['창원', 35.23, 128.68], ['제주', 33.5, 126.53]];
    const WX = 'https://api.open-meteo.com/v1/forecast?', AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality?';
    const SRC_NOTE = '날씨 자료 <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> · 대기질 CAMS 예보. 미세먼지는 측정소 값이 아니라 예보 모델이 계산한 값이어서 <a href="https://www.airkorea.or.kr/" target="_blank" rel="noopener">에어코리아</a> 실측과 다를 수 있습니다. 등급은 환경부 예보 기준이고, 예보 칸은 그날 평균(㎍/㎥)입니다.';
    const sel = $('#wx-city'), hereBtn = $('#wx-here'), note = $('#wx-note');
    const st = Object.assign({ city: '서울', here: false }, store.get('wx', null) || {});
    const useHere = () => !!st.here && Number.isFinite(st.lat) && Number.isFinite(st.lon);
    const place = () => {
      if (useHere()) return { name: '내 위치', lat: st.lat, lon: st.lon };
      const c = CITIES.find(x => x[0] === st.city) || CITIES[0];
      return { name: c[0], lat: c[1], lon: c[2] };
    };
    function fillSel() {
      sel.innerHTML = (useHere() ? '<option value="@">내 위치</option>' : '') + CITIES.map(c => `<option value="${c[0]}">${c[0]}</option>`).join('');
      sel.value = useHere() ? '@' : place().name;
    }
    const hm = iso => (typeof iso === 'string' && iso.length >= 16) ? iso.slice(11, 16) : '–';
    const one = v => Number.isFinite(v) ? v.toFixed(1) : '–';
    const clock = at => { const d = new Date(at); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    function getJson(url) {
      const ac = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => { if (ac) ac.abort(); }, 9000);
      const done = x => { clearTimeout(timer); return x; };
      return fetch(url, ac ? { signal: ac.signal } : {}).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(done, e => { done(); throw e; });
    }
    function pack(w, a) {
      const c = w && w.current, d = w && w.daily, ac = a && a.current, h = a && a.hourly;
      return {
        now: c && Number.isFinite(c.temperature_2m) ? { t: c.temperature_2m, feels: c.apparent_temperature, hum: c.relative_humidity_2m, wind: c.wind_speed_10m, code: c.weather_code,
          rise: hm(d && d.sunrise && d.sunrise[0]), set: hm(d && d.sunset && d.sunset[0]) } : null,
        air: h && Array.isArray(h.time) ? { pm10: ac ? ac.pm10 : null, pm25: ac ? ac.pm2_5 : null, d10: Core.dailyMeans(h.time, h.pm10 || []), d25: Core.dailyMeans(h.time, h.pm2_5 || []) } : null,
      };
    }
    const chip = (kind, v) => { const g = Core.pmGrade(kind, v); return g ? `<span class="pmc" data-g="${g.level}"><b>${g.value}</b><i>${g.label}</i></span>` : '<span class="pmc"><b>–</b><i>없음</i></span>'; };
    const nowTxt = (kind, v, name) => { const g = Core.pmGrade(kind, v); return g ? `<span>${name} <b>${g.value}</b><em data-g="${g.level}">${g.label}</em></span>` : ''; };
    const dayHead = d => { const dt = new Date(d + 'T00:00:00'), wd = '<small>' + '일월화수목금토'[dt.getDay()] + '요일</small>'; return (d === today() ? '오늘' : (dt.getMonth() + 1) + '/' + dt.getDate()) + wd; };
    function paint(data, at, stale) {
      const n = data.now, a = data.air && data.air.d10 && data.air.d10.length ? data.air : null;
      $('#wx-t').textContent = n ? n.t.toFixed(1) + '°' : '–';
      $('#wx-sky').textContent = n ? Core.skyText(n.code) : '';
      $('#wx-facts').innerHTML = n
        ? [['체감', one(n.feels) + '°'], ['습도', Number.isFinite(n.hum) ? Math.round(n.hum) + '%' : '–'], ['바람', one(n.wind) + 'm/s'], ['일출', n.rise], ['일몰', n.set]].map(f => `<li>${f[0]}<b>${f[1]}</b></li>`).join('')
        : '<li>기온을 불러오지 못했습니다.</li>';
      const tip = $('#wx-tip'), t = Core.runTip({ feels: n ? n.feels : NaN, code: n ? n.code : NaN, pm10: a ? a.pm10 : null, pm25: a ? a.pm25 : null });
      tip.hidden = !t;
      if (t) { tip.textContent = t.text; tip.dataset.level = t.level; }
      if (a) {
        const days = a.d10.slice(0, 5), m25 = {};
        a.d25.forEach(x => { m25[x.date] = x.mean; });
        const nowLine = [nowTxt('pm10', a.pm10, '미세먼지'), nowTxt('pm25', a.pm25, '초미세먼지')].filter(Boolean).join('');
        $('#wx-air').innerHTML = (nowLine ? `<p class="wx-airnow"><i>지금</i>${nowLine}</p>` : '') +
          '<div class="tbl-wrap"><table class="pm"><caption class="sr">닷새 미세먼지 예보, 그날 평균</caption><thead><tr><th scope="col"><span class="sr">항목</span></th>' +
          days.map(x => `<th scope="col">${dayHead(x.date)}</th>`).join('') + '</tr></thead><tbody>' +
          `<tr><th scope="row">미세<small>PM10</small></th>${days.map(x => `<td>${chip('pm10', x.mean)}</td>`).join('')}</tr>` +
          `<tr><th scope="row">초미세<small>PM2.5</small></th>${days.map(x => `<td>${chip('pm25', m25[x.date])}</td>`).join('')}</tr></tbody></table></div>`;
      } else $('#wx-air').innerHTML = '<p class="note">미세먼지 예보를 불러오지 못했습니다.</p>';
      note.innerHTML = clock(at) + ' 기준' + (stale ? ' · 새로 불러오지 못해 저장해 둔 값입니다' : '') + ' · ' + SRC_NOTE;
    }
    function fail() {
      $('#wx-t').textContent = '–'; $('#wx-sky').textContent = ''; $('#wx-tip').hidden = true; $('#wx-air').innerHTML = '';
      $('#wx-facts').innerHTML = '<li>' + (SITE.mode === 'site' ? '날씨를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.' : '미리보기에서는 날씨를 불러올 수 없습니다. 배포한 사이트에서 표시됩니다.') + '</li>';
      note.innerHTML = SRC_NOTE;
    }
    let seq = 0;
    function load() {
      const p = place(), key = p.lat.toFixed(2) + ',' + p.lon.toFixed(2), hit = store.get('wxc', null), mine = ++seq;
      const cached = hit && hit.key === key && hit.data ? hit : null;
      if (cached && Date.now() - cached.at < 20 * 60000) { paint(cached.data, cached.at, false); return; }   // 20분 안에는 다시 묻지 않는다
      if (typeof fetch !== 'function') { fail(); return; }
      const q = 'latitude=' + p.lat + '&longitude=' + p.lon + '&timezone=Asia%2FSeoul';
      Promise.all([
        getJson(WX + q + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=sunrise,sunset&wind_speed_unit=ms&forecast_days=1').catch(() => null),
        getJson(AQ + q + '&current=pm10,pm2_5&hourly=pm10,pm2_5&forecast_days=5').catch(() => null),
      ]).then(r => {
        if (mine !== seq) return;
        const data = pack(r[0], r[1]);
        if (!data.now && !data.air) { if (cached) paint(cached.data, cached.at, true); else fail(); return; }
        const at = Date.now();
        store.set('wxc', { key, at, data });
        paint(data, at, false);
      }).catch(fail);
    }
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
        hereBtn.disabled = false; hereBtn.textContent = '위치를 가져오지 못했습니다';
        setTimeout(() => { hereBtn.textContent = '내 위치'; }, 2500);
      }, { maximumAge: 600000, timeout: 8000 });
    });
    fillSel(); load();
  })();

  /* ───────── 첫 화면: 다가오는 대회 세 개 ───────── */
  (function initHomeRaces() {
    const list = $('#home-races'); if (!list) return;
    let shown = 0;
    $$('li', list).forEach(li => {
      const n = daysTo(li.dataset.date), on = n >= 0 && shown < 3;
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
    if (sel && e.clipboardData) e.clipboardData.setData('text/plain', sel + '\n\n출처: ' + BRAND + ' ' + (SITE.siteUrl ? SITE.siteUrl.replace(/\/$/, '') + location.pathname : location.href));
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
