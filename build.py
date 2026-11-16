#!/usr/bin/env python3
"""한 벌의 소스(src/)에서 두 가지를 만든다.
  docs/                    도구마다 주소가 따로 있는 배포용 사이트(PWA, sitemap 포함). GitHub Pages가 이 폴더를 내보낸다
                           한국어는 맨 위, 영어는 docs/en/, 일본어는 docs/ja/ (번역 사전: src/i18n/, 엔진: i18n.py)
  out/artifact/index.html  한 장짜리 미리보기(화면을 # 주소로 전환). 저장소에는 올리지 않는다
설정은 site.config.json 한 곳에서 바꾼다.  실행: python3 build.py
"""
import urllib.parse
import datetime, hashlib, html, json, math, os, re, shutil, subprocess, sys
from urllib.parse import urlparse
import i18n
from i18n import T, CUR, META, LANGS, brand

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
OUT = os.path.join(ROOT, 'out')

def read(*p):
    with open(os.path.join(*p), encoding='utf-8') as f:
        return f.read()

def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)

cfg = {
    'brand': '런지수', 'brandLatin': 'RUNJISU', 'siteUrl': '', 'contactEmail': '',
    'ga4Id': '', 'adsenseClient': '', 'adSlots': {}, 'partnerLinks': {}, 'privacyDate': '2026-11-12',
    'googleVerification': '', 'naverVerification': '',
}
cfg.update(json.loads(read(ROOT, 'site.config.json')))
cfg['siteUrl'] = cfg['siteUrl'].rstrip('/')
BRAND = cfg['brand']
META['ko']['brand'] = BRAND

# 화면 목록: id, 주소, 메뉴 이름(없으면 메뉴에 안 나옴), 제목, 설명
VIEWS = [
    ('home', '', '홈', '{brand} 러닝 계산기: 기록 하나로 훈련 페이스와 예상 기록',
     '5K, 10K, 하프, 풀코스 기록 하나를 넣으면 {brand}와 E·M·T·I·R 훈련 페이스, 거리별 예상 기록을 계산합니다. 오늘 달리기 날씨와 미세먼지, 다가오는 대회도 한 화면에서 확인하세요. 정형외과 전문의가 만든 무료 러닝 계산기.'),
    ('race', 'race-pace', '대회 계획', '마라톤 페이스 계산기: 목표 기록 구간표',
     '목표 기록을 넣으면 km당 페이스와 5km 구간별 통과 시각을 계산합니다. 후반 가속 전략과, 목표가 지금 실력에 맞는지도 함께 확인하세요.'),
    ('goals', 'pace-chart', '목표 페이스', '마라톤 페이스표: 서브3·서브4, 하프 2시간, 10km 50분 목표별 km당 페이스',
     '풀코스 서브3·서브4, 하프 2시간, 10km 50분 등 목표 기록별로 km당 페이스와 400m 트랙 기록, 러닝머신 속도를 한 표에 정리했습니다. 목표마다 구간 통과 시각과 필요한 실력도 확인하세요.'),
    ('calendar', 'marathon-schedule', '대회 일정', '전국 마라톤 대회 일정 2026·2027: 이번 주 대회부터 서울·춘천·JTBC 접수까지',
     '이번 주말 열리는 대회부터 2027년 봄·가을 대회까지, 전국 마라톤 대회 일정을 종목과 지역으로 골라 봅니다. 서울마라톤, 춘천마라톤, JTBC, 대구마라톤 등 주요 대회의 접수 시기와 공식 사이트도 함께 정리했습니다.'),
    ('plan', 'training-week', '주간 훈련표', '주간 러닝 훈련표 만들기',
     '주간 거리와 달리는 날 수, 목표 대회를 고르면 내 페이스에 맞춘 요일별 훈련표를 짜 드립니다. 이지 런, 역치 훈련, 인터벌, 장거리 분량까지.'),
    ('log', 'log', '달리기 기록', '달리기 기록장: 주간 거리와 신발 누적 거리',
     '날짜와 거리만 적으면 주간 거리, 최근 30일 최장 거리, 신발 누적 거리를 계산합니다. 가입 없이 쓰고 기록은 내 기기에만 저장됩니다.'),
    ('spike', 'long-run-check', '거리 급증', '장거리 얼마까지 늘려도 될까: 러닝 부상 위험 체크',
     '최근 30일 최장 거리와 이번에 달릴 거리를 넣으면 과사용 부상이 늘어나는 구간인지 알려 드립니다. 러너 5,205명 추적 연구 기준.'),
    ('shoes', 'shoe-mileage', '신발', '러닝화 교체 시기 계산기',
     '러닝화마다 누적 거리를 기록하고 교체 시기를 확인합니다. 쿠션화, 레이싱화, 트레일화별 교체 구간과 눈으로 확인할 점검 항목.'),
    ('heart', 'heart-rate-zones', '심박 존', '러닝 심박 존 계산기',
     '나이나 실제 최대심박을 넣으면 이지, 마라톤, 역치, 인터벌 강도별 심박 범위를 계산합니다.'),
    ('pace', 'pace-converter', '페이스 변환', '페이스 계산기: 러닝머신 속도와 km 페이스 변환',
     '러닝머신 속도(km/h)를 km당 페이스로, 페이스를 5K·10K·하프·풀코스 완주 기록으로 바꿉니다.'),
    ('fitage', 'fitness-age', '체력 나이', '체력 나이 계산기: 달리기와 걷기로 보는 VO2max',
     '달리기 기록, 12분 달리기, 1.6km 빨리 걷기로 유산소 체력(VO2max)을 추정하고 또래 가운데 어디쯤인지, 체력 나이가 몇 살인지 보여 드립니다.'),
    ('injury', 'running-injuries', '러닝 부상', '러닝 부상 가이드: 무릎·정강이·발 통증, 부위별 원인과 대처',
     '달릴 때 무릎 바깥쪽이 아픈 장경인대 증후군부터 정강이 통증, 족저근막염, 아킬레스건, 피로골절까지. 러너에게 흔한 부상의 증상과 원인, 스스로 할 수 있는 대처, 진료가 필요한 신호를 정리했습니다.'),
    ('terms', 'running-terms', '러닝 용어', '러닝 용어 사전: LSD, 빌드업, 서브4, 케이던스 뜻 정리',
     'LSD, 빌드업, 인터벌, 템포런, 네거티브 스플릿, 서브4, DNF, 케이던스, 힐 드롭까지. 달리기를 시작하면 만나는 러닝·마라톤 용어를 쉬운 말로 풀었습니다.'),
    ('gear', 'gear', '장비', '러닝 장비 고르는 법: 러닝화 유형과 폼롤러, 워치',
     '데일리 쿠션화, 안정화, 레이싱화는 어떤 러너에게 맞을까. 제품이 아니라 유형으로 고르는 러닝 장비 안내.'),
    ('tools', 'tools', '전체 도구', '러닝 계산기와 안내 모음',
     '{brand}의 러닝 계산기와 부상·장비 안내를 한곳에 모았습니다. 훈련표, 구간표, 심박 존, 체력 나이, 신발 교체 시기까지 가입 없이 무료로 씁니다.'),
    ('about', 'about', '근거·FAQ', '계산 근거와 자주 묻는 질문',
     '{brand}의 계산식과 참고한 연구, 자주 묻는 질문을 정리했습니다.'),
    ('privacy', 'privacy', None, '개인정보처리방침', '{brand}가 저장하는 정보와 쿠키, 광고, 제휴 링크 안내.'),
]
IDS = [v[0] for v in VIEWS]

JOSA = {'는': ('는', '은'), '가': ('가', '이'), '를': ('를', '을'), '와': ('와', '과'), '로': ('로', '으로')}
def josa(word, key):
    c = ord(word[-1]); a, b = JOSA[key]
    if not (0xAC00 <= c <= 0xD7A3):
        return word + a
    jong = (c - 0xAC00) % 28
    return word + (a if (jong == 0 or (key == '로' and jong == 8)) else b)

host = urlparse(cfg['siteUrl']).netloc if cfg['siteUrl'] else ''
partners = bool(cfg['partnerLinks'])
FLAGS = {
    'partners': partners, 'contact': bool(cfg['contactEmail']), 'ga4': bool(cfg['ga4Id']), 'adsense': bool(cfg['adsenseClient']),
    'none': not (partners or cfg['ga4Id'] or cfg['adsenseClient']),
}
VARS = {
    'brand': BRAND, 'brandLatin': cfg['brandLatin'], 'contactEmail': cfg['contactEmail'], 'privacyDate': cfg['privacyDate'],
    'sourceName': f'{BRAND}, {host}' if host else BRAND,
}

# ───────── 언어별 날짜·시간 표기 ─────────
def L():
    return CUR['lang']

WD = {'ko': '월화수목금토일', 'ja': '月火水木金土日', 'en': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']}
MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

def weekday(y, m, d):
    return WD[L()][datetime.date(y, m, d).weekday()]

def kdate(d, year=True):
    y, m, dd = map(int, d.split('-'))
    w = weekday(y, m, dd)
    if L() == 'en':
        return f'{w}, {MON_EN[m - 1]} {dd}' + (f', {y}' if year else '')
    if L() == 'ja':
        return (f'{y}年' if year else '') + f'{m}月{dd}日({w})'
    return (f'{y}년 ' if year else '') + f'{m}월 {dd}일({w})'

def ymd(y, m, d):
    return {'en': f'{MON_EN[m - 1]} {d}, {y}', 'ja': f'{y}年{m}月{d}日'}.get(L(), f'{y}년 {m}월 {d}일')

def month_label(m, y=None):
    if L() == 'en':
        return MONTH_EN[m - 1] + (f' {y}' if y else '')
    if L() == 'ja':
        return (f'{y}年' if y else '') + f'{m}月'
    return (f'{y}년 ' if y else '') + f'{m}월'

def ev_txt(ev):
    """'풀 · 하프 · 10km' 같은 종목 문자열을 조각마다 옮긴다."""
    return ' · '.join(T(tok) for tok in ev.split(' · '))

# ───────── 대회 일정: src/data/races.json 을 화면으로 ─────────
RACE_DATA = json.loads(read(SRC, 'data', 'races.json'))

def race_card(r):
    e = html.escape
    if r.get('date'):
        head = f'<div class="race-date"><b>{kdate(r["date"])}</b><span class="pill" data-dday hidden></span></div>'
        attrs = f' data-date="{r["date"]}"'
    else:
        last = ' · ' + T('2026년은 {date}', date=kdate(r['last'], False)) if r.get('last') else ''
        head = f'<div class="race-date tba"><b>{e(T(r["season"]))}</b><span>{e(T("2027년 날짜 미발표"))}{e(last)}</span></div>'
        attrs = ''
    goal = f'<button type="button" class="btn ghost small" data-goal>{e(T("목표 대회로 정하기"))}</button>' if r.get('date') else ''
    return (f'      <li class="race" data-id="{e(r["id"])}" data-name="{e(r["name"])}" data-dist="{r["dist"]}"{attrs}>\n'
            f'        {head}\n'
            f'        <h3 lang="ko">{e(r["name"])}</h3>\n'
            f'        <p class="race-meta">{e(T(r["events"]))} · {e(T(r["place"]))}</p>\n'
            f'        <p class="race-reg"><b>{e(T("접수"))}</b> {e(T(r["reg"]))}</p>\n'
            f'        <div class="acts"><a class="out" href="{e(r["url"])}" target="_blank" rel="noopener">{e(T(r["link"]))} ↗</a>{goal}</div>\n'
            f'      </li>')

RACE_LIST = json.loads(read(SRC, 'data', 'race_list.json'))
REGIONS = ['서울', '경기', '인천', '강원', '충북', '충남', '대전', '세종', '전북', '전남', '광주', '경북', '경남', '대구', '울산', '부산', '제주']
EV_LABEL = {'full': '풀', 'half': '하프', '10k': '10K', '5k': '5K', 'trail': '트레일'}
EV_DIST = {'full': 42195, 'half': 21097.5, '10k': 10000, '5k': 5000}

def rc_item(r, i):
    """전국 대회 목록의 한 줄. 다가오는 대회는 남은 날과 '목표' 버튼, 작년 대회는 2026년 개최일"""
    e = html.escape
    y, m, d = map(int, r['d'].split('-'))
    wd = weekday(y, m, d)
    tags = ''.join(f'<i data-t="{f}">{e(T(EV_LABEL[f]))}</i>' for f in r['f']) or f'<i>{e(T("기타"))}</i>'
    rg, ev = T(r['rg']), ev_txt(r['ev'])
    q = re.sub(r'\s+', '', (r['n'] + r['rg'] + r['ev'] + (rg + ev if L() != 'ko' else '')).lower())
    common = f'data-ev="{" ".join(r["f"]) or "etc"}" data-region="{e(r["rg"])}" data-q="{e(q)}" data-m="{m}"'
    if r['u']:
        link = f'<a class="rc-go" href="{e(r["u"])}" target="_blank" rel="noopener" aria-label="{e(T("{name} 공식 사이트(새 창)", name=r["n"]))}">{e(T("공식"))} ↗</a>'
    else:
        nq = urllib.parse.quote(r['n'])
        url = f'https://search.naver.com/search.naver?query={nq}' if L() == 'ko' else f'https://www.google.com/search?q={nq}'
        link = f'<a class="rc-go find" href="{url}" target="_blank" rel="noopener" aria-label="{e(T("{name} 검색(새 창)", name=r["n"]))}">{e(T("검색"))} ↗</a>'
    name = f'<h3 lang="ko">{e(r["n"])}</h3>'
    if r['k'] == 'up':
        dist = max([EV_DIST[f] for f in r['f'] if f in EV_DIST] or [0])
        on, off = T('★ 목표'), T('☆ 목표')
        goal = (f'<button type="button" class="rc-goal" data-goal data-on="{e(on)}" data-off="{e(off)}" '
                f'aria-label="{e(T("목표 대회로 정하기: {name}", name=r["n"]))}">{e(off)}</button>') if dist else ''
        return (f'      <li class="rc race" data-id="l{i}" data-name="{e(r["n"])}" data-dist="{dist}" data-date="{r["d"]}" {common}>'
                f'<div class="rc-d"><b>{m}.{d}</b><span>{wd}</span></div>'
                f'<div class="rc-b">{name}<p><span class="rc-t">{tags}</span><span class="rc-rg">{e(rg)}</span><span class="rc-ev">{e(ev)}</span></p></div>'
                f'<div class="rc-r"><span class="pill" data-dday hidden></span>{link}{goal}</div></li>')
    return (f'      <li class="rc" {common}>'
            f'<div class="rc-d last"><b>{m}.{d}</b><span>{wd}</span></div>'
            f'<div class="rc-b">{name}<p><span class="rc-t">{tags}</span><span class="rc-rg">{e(rg)}</span><span class="rc-ev">{e(ymd(y, m, d))} · {e(ev)}</span></p></div>'
            f'<div class="rc-r">{link}</div></li>')

def rc_list(kind):
    rows, cur = [], None
    items = sorted([(r, i) for i, r in enumerate(RACE_LIST['races']) if r['k'] == kind], key=lambda x: x[0]['d'])
    for r, i in items:
        mk = r['d'][:7]
        if mk != cur:
            cur = mk; y, m = map(int, mk.split('-'))
            label = month_label(m, y) if kind == 'up' else f'{month_label(m)} <small>{html.escape(T("2026년 개최"))}</small>'
            rows.append(f'      <li class="rc-m" data-month="{m}" aria-hidden="true">{label}</li>')
        rows.append(rc_item(r, i))
    return '\n'.join(rows)

REG_ORDER = ['12월', '1월', '4월', '4~6월', '5월', '7월', '10월']

def race_blocks():
    races = RACE_DATA['races']
    fixed = sorted([r for r in races if r.get('date')], key=lambda r: r['date'])
    tba = sorted([r for r in races if not r.get('date')], key=lambda r: r.get('sort') or r['last'][5:])
    rows = []
    for m in REG_ORDER:
        names = [f'<span lang="ko">{html.escape(r["name"])}</span>' + html.escape(' ' + T('(추첨)') if r['id'] == 'jtbc' else ' ' + T('(기록 제출 후 접수)') if r['id'] == 'seoul' else '')
                 for r in races if r.get('regMonth') == m]
        if names:
            rows.append(f'            <tr><td>{html.escape(T(m))}</td><td>{", ".join(names)}</td></tr>')
    regions = [g for g in REGIONS if any(r['rg'] == g for r in RACE_LIST['races'])]
    return {'race_fixed': '\n'.join(race_card(r) for r in fixed), 'race_tba': '\n'.join(race_card(r) for r in tba),
            'race_reg_rows': '\n'.join(rows), 'racesChecked': kdate(RACE_DATA['checked']),
            'rl_up': rc_list('up'), 'rl_last': rc_list('last'), 'rlChecked': kdate(RACE_LIST['checked']),
            'rl_regions': '\n'.join(f'          <option value="{g}">{html.escape(T(g))}</option>' for g in regions),
            'rlTotal': str(len(RACE_LIST['races']) + len(RACE_DATA['races']))}

# ───────── 목표 기록별 페이스: 검색으로 들어오는 입구. 숫자는 core.js 로 계산한다 ─────────
GOAL_DISTS = {   # 이름, 거리(m), 짧은 이름, 구간표에 넣을 지점(km)
    'full': ('풀코스', 42195, '풀', [5, 10, 15, 20, 21.0975, 25, 30, 35, 40, 42.195]),
    'half': ('하프', 21097.5, '하프', [5, 10, 15, 20, 21.0975]),
    '10k': ('10km', 10000, '10K', list(range(1, 11))),
    '5k': ('5km', 5000, '5K', list(range(1, 6))),
}
GOALS = [        # 거리, 목표(분), 주소, 풀코스 서브 표기 여부
    ('full', 180, 'sub-3-marathon', True), ('full', 195, 'sub-315-marathon', True), ('full', 210, 'sub-330-marathon', True),
    ('full', 225, 'sub-345-marathon', True), ('full', 240, 'sub-4-marathon', True), ('full', 270, 'sub-430-marathon', True),
    ('full', 300, 'sub-5-marathon', True), ('full', 330, 'sub-530-marathon', True),
    ('half', 90, 'half-marathon-1-30', False), ('half', 105, 'half-marathon-1-45', False), ('half', 120, 'half-marathon-2-00', False),
    ('half', 135, 'half-marathon-2-15', False), ('half', 150, 'half-marathon-2-30', False),
    ('10k', 40, '10k-40-minutes', False), ('10k', 45, '10k-45-minutes', False), ('10k', 50, '10k-50-minutes', False),
    ('10k', 55, '10k-55-minutes', False), ('10k', 60, '10k-60-minutes', False), ('10k', 70, '10k-70-minutes', False),
    ('5k', 20, '5k-20-minutes', False), ('5k', 25, '5k-25-minutes', False), ('5k', 30, '5k-30-minutes', False), ('5k', 35, '5k-35-minutes', False),
]
def f_pace(sec):
    x = int(round(sec)); return f'{x // 60}:{x % 60:02d}'
def f_time(sec):
    x = int(round(sec)); h, m = x // 3600, x % 3600 // 60
    return f'{h}:{m:02d}:{x % 60:02d}' if h else f'{m}:{x % 60:02d}'
def k_time(mins):
    h, m = divmod(int(mins), 60)
    if L() == 'en':
        return ' '.join(t for t in (f'{h} hour' + ('s' if h > 1 else '') if h else '', f'{m} minutes' if m else '') if t)
    if L() == 'ja':
        return (f'{h}時間' if h else '') + (f'{m}分' if m else '')
    return ' '.join(t for t in (f'{h}시간' if h else '', f'{m}분' if m else '') if t)
def k_pace(sec):
    if L() == 'en':
        return f_pace(sec)
    if L() == 'ja':
        return f'{sec // 60}分' + (f'{sec % 60}秒' if sec % 60 else '')
    return f'{sec // 60}분' + (f' {sec % 60}초' if sec % 60 else '')

def nick(mins):
    h, m = divmod(mins, 60)
    t = f'{h}' + (f':{m:02d}' if m else '')
    return {'en': f'Sub-{t}', 'ja': f'サブ{t}'}.get(L(), f'서브{t}' if not m else f'서브 {t}')

def gname(g):
    if g['sub']:
        return T('풀코스 {nick}', nick=nick(g['mins']))
    if L() == 'en':
        return f'{T(g["dname"])} in {k_time(g["mins"])}'
    return f'{T(g["dname"])} {k_time(g["mins"])}'

def gshort(g):
    return nick(g['mins']) if g['sub'] else k_time(g['mins'])

def gcourse(g):
    km = f'{g["meters"] / 1000:g}km'
    return T('{dist} {km}', dist=T(g['dname']), km=km) if g['dist'] in ('full', 'half') else km

_goal_cache = None
def goals():
    # 목표마다 페이스·구간·필요한 실력을 계산해 둔다(node 로 src/core.js 를 그대로 쓴다)
    global _goal_cache
    if _goal_cache is not None:
        return _goal_cache
    js = ("const C=require(process.argv[1]),G=JSON.parse(process.argv[2]);"
          "console.log(JSON.stringify(G.map(g=>{const i=C.runIndex(g[0],g[1]);return{idx:i,z:C.paces(i),pr:C.predictions(i).map(p=>[p.id,p.label,p.minutes])}})))")
    res = subprocess.run(['node', '-e', js, os.path.join(SRC, 'core.js'), json.dumps([[GOAL_DISTS[g[0]][1], g[1]] for g in GOALS])],
                         check=True, capture_output=True, text=True)
    out = []
    for (dist, mins, slug, sub), calc in zip(GOALS, json.loads(res.stdout)):
        dname, meters, dshort, marks = GOAL_DISTS[dist]
        pace = int(mins * 60 // (meters / 1000))                 # 이 페이스면 목표 안쪽으로 들어온다
        finish = pace * meters / 1000
        out.append({
            'dist': dist, 'mins': mins, 'slug': slug, 'dname': dname, 'meters': meters, 'sub': sub,
            'pace': pace, 'finish': finish, 'exact': abs(finish - mins * 60) < 0.5,
            'lap': pace * 0.4, 'kmh': math.ceil(3600 / pace * 10 - 1e-9) / 10,
            'splits': [('하프' if abs(k - 21.0975) < 0.01 and dist == 'full' else '완주' if abs(k * 1000 - meters) < 1 else f'{k}km', pace * k) for k in marks],
            'idx': calc['idx'], 'z': calc['z'], 'pr': [(i, l, m) for i, l, m in calc['pr'] if i != dist],
        })
    _goal_cache = out
    return out

def goal_tables(site):
    e = html.escape
    blocks = []
    for dist, (dname, meters, _s, _m) in GOAL_DISTS.items():
        rows = []
        for g in [x for x in goals() if x['dist'] == dist]:
            label = f'{e(gshort(g))} <small>{f_time(g["mins"] * 60)}</small>'
            if site:
                label = f'<a href="{g["slug"]}/">{label}</a>'
            rows.append(f'          <tr><th scope="row">{label}</th><td>{f_pace(g["pace"])}</td><td>{f_pace(g["lap"])}</td><td>{g["kmh"]:.1f}km/h</td></tr>')
        km = f'{meters / 1000:g}km'
        blocks.append(f'''  <section class="panel" aria-labelledby="gt-{dist}">
    <h2 id="gt-{dist}">{e(T(dname))} <small>{km}</small></h2>
    <div class="tbl-wrap">
      <table class="goal-table">
        <thead><tr><th scope="col">{e(T("목표"))}</th><th scope="col">{e(T("km당"))}</th><th scope="col">400m</th><th scope="col">{e(T("러닝머신"))}</th></tr></thead>
        <tbody>
{chr(10).join(rows)}
        </tbody>
      </table>
    </div>
  </section>''')
    return '\n'.join(blocks)

CARE = {
    'full': ['풀코스 준비에서 부상은 대회 날보다 훈련 중에 생깁니다. 한 번에 달리는 거리를 최근 30일 최장 거리보다 10% 넘게 늘리면 과사용 부상이 늘어난다는 추적 연구가 있어, 장거리주는 조금씩 늘리는 편이 안전합니다.',
             '훈련 대부분은 옆 사람과 대화가 되는 이지 페이스로 채우고, 목표 페이스는 장거리주 후반에 일부만 넣습니다.',
             '정강이나 발등처럼 뼈 위를 누르면 아프고 달릴수록 심해지는 통증은 쉬는 것이 먼저이고, 며칠 쉬어도 그대로면 진료가 필요합니다.'],
    'half': ['하프는 주말 장거리주를 꾸준히 늘려야 후반이 버텨집니다. 한 번에 달리는 거리는 최근 30일 최장 거리보다 10% 넘게 늘리지 않는 편이 안전합니다.',
             '훈련 대부분은 대화가 되는 이지 페이스로 채우고, 역치 훈련은 한 번에 주간 거리의 10% 안쪽으로 둡니다.',
             '달리는 중에 한 지점이 콕 집어 아프고 달릴수록 심해지면 그날은 멈추는 것이 맞습니다.'],
    '10k': ['10km 기록을 당기려고 인터벌을 갑자기 늘리면 종아리와 아킬레스건에 부담이 몰립니다. 인터벌은 한 번에 주간 거리의 8% 안쪽으로 둡니다.',
            '빠른 훈련은 주 1~2회면 충분하고, 나머지는 대화가 되는 이지 페이스로 채웁니다.',
            '아침 첫걸음에 발꿈치나 아킬레스건이 뻣뻣하고 아픈 날이 이어지면 빠른 훈련부터 줄입니다.'],
    '5k': ['5km 기록은 짧고 빠른 훈련으로 당기지만, 반복 훈련은 한 번에 주간 거리의 5% 안쪽으로 두고 달린 시간의 2~3배를 쉽니다.',
           '빠른 훈련 전에는 10~15분 가볍게 달려 몸을 덥힙니다. 주 1~2회면 충분하고, 나머지는 이지 페이스로 채웁니다.',
           '허벅지 뒤나 종아리가 뜨끔하면 그날 빠른 훈련은 접는 것이 맞습니다.'],
}

def goal_page(g, prev, nxt):
    e = html.escape
    name, pace, idx = gname(g), f_pace(g['pace']), f'{g["idx"]:.1f}'
    tk = k_time(g['mins'])
    if g['exact']:
        lead = T('{course}를 {time}에 달리려면 km당 {pace} 페이스가 필요합니다.', course=gcourse(g), time=tk, pace=k_pace(g['pace']))
    else:
        lead = T('{course}를 {time} 안에 들어오려면 km당 {pace} 페이스가 필요합니다.', course=gcourse(g), time=tk, pace=k_pace(g['pace']))
    lead += ' ' + T('이 페이스로 처음부터 끝까지 고르게 달리면 {finish}에 들어옵니다.', finish=f_time(g['finish']))
    if g['exact']:
        lead += ' ' + T('{time} 벽을 깨려면 km당 1초씩만 더 당기면 됩니다.', time=tk)
    stats = ''.join(f'\n      <div class="stat"><span class="k">{e(k)}</span><span class="big">{v}</span><span class="cap">{e(c)}</span></div>' for k, v, c in [
        (T('km당 페이스'), pace, T('이보다 느려지면 목표를 넘깁니다')), (T('400m 트랙'), f_pace(g['lap']), T('한 바퀴 기록')),
        (T('러닝머신'), f'{g["kmh"]:.1f}<small>km/h</small>', T('이 속도 이상')), (T('필요한 {brand}'), idx, T('이 기록에 해당하는 수준'))])
    rows = '\n'.join(f'          <tr><th scope="row">{e(T(k))}</th><td>{f_time(t)}</td></tr>' for k, t in g['splits'])
    eq = '\n'.join(f'          <tr><th scope="row">{e(T(l))}</th><td>{f_time(m * 60)}</td></tr>' for _i, l, m in g['pr'])
    z = g['z']
    zrows = '\n'.join(f'          <tr><th scope="row">{e(T(k))}</th><td>{v}</td></tr>' for k, v in [
        ('E 이지', f'{f_pace(z["eFast"])}~{f_pace(z["eSlow"])}'), ('M 마라톤', f_pace(z['m'])), ('T 역치', f_pace(z['t'])), ('I 인터벌', f_pace(z['i'])), ('R 반복', f_pace(z['r']))])
    others = ', '.join(T('{label} 약 {time}', label=T(l), time=f_time(m * 60)) for _i, l, m in g['pr'])
    if g['dist'] in ('full', 'half'):
        q3 = (T('{name} 목표라면 10km는 몇 분에 뛰어야 하나요?', name=name),
              T('같은 수준의 유산소 능력으로 보면 {others}입니다. 다만 짧은 거리 기록이 좋아도 장거리 훈련이 부족하면 후반에 페이스가 떨어집니다.', others=others))
    else:
        q3 = (T('{name} 기록이면 하프와 풀코스는 얼마나 나올까요?', name=name),
              T('같은 수준의 유산소 능력으로 보면 {others}입니다. 그 거리를 충분히 준비했을 때의 값이라, 장거리 훈련이 부족하면 이보다 느리게 나옵니다.', others=others))
    faq = [(T('{name} 페이스는 km당 몇 분인가요?', name=name),
            T('km당 {kpace}({pace})입니다. 이 페이스로 고르게 달리면 {finish}에 들어옵니다. 400m 트랙으로는 한 바퀴 {lap}입니다.',
              kpace=k_pace(g['pace']), pace=pace, finish=f_time(g['finish']), lap=f_pace(g['lap']))),
           (T('러닝머신으로는 시속 몇 km에 맞춰야 하나요?'),
            T('시속 {kmh}km 이상입니다. 러닝머신은 바람 저항이 없어 같은 속도라도 야외보다 조금 편하게 느껴질 수 있습니다.', kmh=f'{g["kmh"]:.1f}')), q3]
    faq_html = '\n'.join(f'      <div><h3>{e(q)}</h3><p>{e(a)}</p></div>' for q, a in faq)
    care = '\n'.join(f'      <li>{e(T(t))}</li>' for t in CARE[g['dist']])
    def near(x, word):
        if not x:
            return ''
        sub = T('km당 {pace} · 러닝머신 {kmh}km/h', pace=f_pace(x['pace']), kmh=f"{x['kmh']:.1f}")
        return f'<a href="../{x["slug"]}/"><b>{e(gname(x))}</b><span>{e(sub)}</span><i>{e(word)} →</i></a>'
    body = f'''<section class="view" data-view="goal">
  <nav class="crumb" aria-label="{e(T('현재 위치'))}"><a href="#home">{e(brand())}</a> › <a href="#goals">{e(T('목표 페이스표'))}</a> › <span>{e(name)}</span></nav>
  <div class="view-head">
    <h1>{e(T('{name} 페이스', name=name))}<br>{e(T('km당 {pace}', pace=pace))}</h1>
    <p>{e(lead)}</p>
  </div>
  <section class="panel" aria-label="{e(T('핵심 숫자'))}">
    <div class="gates">{stats}
    </div>
  </section>
  <div class="two">
    <section class="panel" aria-labelledby="g-split">
      <h2 id="g-split">{e(T('구간별 통과 시각'))}</h2>
      <div class="tbl-wrap">
        <table class="goal-table">
          <thead><tr><th scope="col">{e(T('지점'))}</th><th scope="col">{e(T('통과 시각'))}</th></tr></thead>
          <tbody>
{rows}
          </tbody>
        </table>
      </div>
      <div class="cta"><span>{e(T('전반을 아끼는 후반 가속 구간표는'))}</span><a href="#race">{e(T('대회 계획에서 만들기'))} →</a></div>
    </section>
    <div class="stack">
      <section class="panel" aria-labelledby="g-eq">
        <h2 id="g-eq">{e(T('이 목표, 지금 실력으로 될까'))}</h2>
        <p>{e(T('{name} 기록은 {brand} {idx} 수준입니다. 같은 수준이면 다른 거리에서는 아래 기록이 나옵니다. 최근 기록이 이보다 빠르면 사정권입니다.', name=name, idx=idx))}</p>
        <div class="tbl-wrap">
          <table class="goal-table">
            <thead><tr><th scope="col">{e(T('거리'))}</th><th scope="col">{e(T('같은 수준의 기록'))}</th></tr></thead>
            <tbody>
{eq}
            </tbody>
          </table>
        </div>
        <div class="cta"><span>{e(T('내 기록으로 {brand} 확인'))}</span><a href="#home">{e(T('계산하기'))} →</a></div>
      </section>
      <section class="panel" aria-labelledby="g-zone">
        <h2 id="g-zone">{e(T('이 기록을 내는 러너의 훈련 페이스'))}</h2>
        <div class="tbl-wrap">
          <table class="goal-table">
            <thead><tr><th scope="col">{e(T('강도'))}</th><th scope="col">{e(T('km당'))}</th></tr></thead>
            <tbody>
{zrows}
            </tbody>
          </table>
        </div>
        <p class="note">{e(T('훈련 페이스는 목표가 아니라 지금 기록에 맞춥니다. 아직 이 기록이 아니라면 최근 기록으로 계산한 페이스로 훈련하세요.'))}</p>
      </section>
    </div>
  </div>
  <section class="panel" aria-labelledby="g-care">
    <h2 id="g-care">{e(T('다치지 않고 준비하려면'))}</h2>
    <ul class="prose">
{care}
    </ul>
    <div class="cta"><span>{e(T('이번 장거리, 얼마까지 늘려도 될까'))}</span><a href="#spike">{e(T('거리 급증 체크'))} →</a></div>
  </section>
  <section class="panel" aria-labelledby="g-faq">
    <h2 id="g-faq">{e(T('자주 묻는 질문'))}</h2>
    <div class="faq">
{faq_html}
    </div>
  </section>
  <nav class="next three" aria-label="{e(T('다른 목표'))}">
    {near(nxt, T('한 단계 위 목표'))}{near(prev, T('한 단계 아래 목표'))}<a href="#goals"><b>{e(T('목표 기록별 페이스표'))}</b><span>{e(T('풀코스, 하프, 10km, 5km 목표를 한 표에서 봅니다.'))}</span><i>{e(T('전체 표'))} →</i></a>
  </nav>
</section>
'''
    path = 'pace-chart/' + g['slug']
    lds = [{'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
        {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]}]
    if cfg['siteUrl']:
        base = cfg['siteUrl'] + '/' + META[L()]['prefix']
        lds.append({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': brand(), 'item': base},
            {'@type': 'ListItem', 'position': 2, 'name': T('목표 페이스표'), 'item': base + 'pace-chart/'},
            {'@type': 'ListItem', 'position': 3, 'name': name, 'item': base + path + '/'}]})
    return {'path': path, 'body': body, 'lds': lds,
            'title': T('{name} 페이스표: km당 {pace}, 구간별 통과 시각', name=name, pace=pace),
            'desc': lead + ' ' + T('구간별 통과 시각과 러닝머신 속도, 같은 수준의 다른 거리 기록, 훈련 페이스까지 정리했습니다.')}

# ───────── 러닝 용어, 러닝 부상, 첫 화면의 다가오는 대회 ─────────
TERMS = json.loads(read(SRC, 'data', 'terms.json'))
INJURIES = json.loads(read(SRC, 'data', 'injuries.json'))

def terms_html():
    e = html.escape; out = []
    for g in TERMS:
        rows = []
        for t in g['items']:
            name = T(t['t'])
            gloss = t.get('en', '')
            key = re.sub(r'[\s·]+', '', (name + gloss + t.get('k', '') + (t['t'].replace('{brand}', META['ko']['brand']) if L() != 'ko' else '')).lower())
            en = f'<small>{e(gloss)}</small>' if gloss and gloss.lower() != name.lower() else ''
            link = f' <a href="#{t["to"]}">{e(T(t["toLabel"]))} →</a>' if t.get('to') else ''
            rows.append(f'      <div data-term="{e(key)}"><dt>{e(name)}{en}</dt><dd>{e(T(t["d"]))}{link}</dd></div>')
        out.append(f'  <section class="panel" data-term-group aria-label="{e(T(g["group"]))}">\n    <h2>{e(T(g["group"]))}</h2>\n    <dl class="terms">\n' + '\n'.join(rows) + '\n    </dl>\n  </section>')
    return '\n'.join(out)

def view_lds(vid):
    if vid == 'terms':
        return [{'@context': 'https://schema.org', '@type': 'DefinedTermSet', 'name': T('러닝 용어 사전'), 'inLanguage': L(),
                 'hasDefinedTerm': [{'@type': 'DefinedTerm', 'name': T(t['t']), 'description': T(t['d'])} for g in TERMS for t in g['items']]}]
    return ()

def injury_cards(site):
    e = html.escape; out = []
    for x in INJURIES:
        inner = f'<span class="where">{e(T(x["area"]))} · {e(T(x["where"]))}</span><b>{e(T(x["name"]))}</b><span>{e(T(x["tail"]))}</span>'
        out.append(f'    <a class="inj" href="{x["slug"]}/">{inner}<i>{e(T("증상과 대처 보기"))} →</i></a>' if site else f'    <div class="inj">{inner}</div>')
    return '\n'.join(out)

def injury_page(x, others):
    e = html.escape
    def ul(items):
        return '\n'.join(f'        <li>{e(T(t))}</li>' for t in items)
    name = T(x['name'])
    alias = ' · ' + T('다른 이름 {alias}', alias=T(x['alias'])) if x.get('alias') else ''
    near = ''.join(f'<a href="../{o["slug"]}/"><b>{e(T(o["name"]))}</b><span>{e(T(o["tail"]))}</span><i>{e(T("증상과 대처"))} →</i></a>' for o in others)
    body = f'''<section class="view" data-view="injury-page">
  <nav class="crumb" aria-label="{e(T('현재 위치'))}"><a href="#home">{e(brand())}</a> › <a href="#injury">{e(T('러닝 부상'))}</a> › <span>{e(name)}</span></nav>
  <div class="view-head">
    <h1>{e(name)}</h1>
    <p class="inj-where">{e(T('아픈 곳 · {where}', where=T(x['where'])))}{e(alias)}</p>
    <p>{e(T(x["lead"]))}</p>
  </div>
  <div class="two">
    <section class="panel" aria-labelledby="ij-feel">
      <h2 id="ij-feel">{e(T('이런 느낌이면'))}</h2>
      <ul class="prose">
{ul(x["feel"])}
      </ul>
    </section>
    <section class="panel" aria-labelledby="ij-why">
      <h2 id="ij-why">{e(T('왜 생기나'))}</h2>
      <ul class="prose">
{ul(x["why"])}
      </ul>
    </section>
  </div>
  <div class="two">
    <section class="panel" aria-labelledby="ij-do">
      <h2 id="ij-do">{e(T('스스로 할 수 있는 것'))}</h2>
      <ul class="prose">
{ul(x["do"])}
      </ul>
      <div class="cta"><span>{e(T('다시 늘릴 때, 이번 거리는 괜찮을까'))}</span><a href="#spike">{e(T('거리 급증 체크'))} →</a></div>
    </section>
    <section class="panel warn" aria-labelledby="ij-see">
      <h2 id="ij-see">{e(T('이럴 때는 진료를'))}</h2>
      <ul class="prose">
{ul(x["see"])}
      </ul>
    </section>
  </div>
  <p class="note">{e(T('이 안내는 일반 정보이며 진단을 대신하지 않습니다. 같은 자리의 통증도 원인이 다를 수 있으니, 증상이 뚜렷하거나 오래가면 진료를 받으세요.'))}</p>
  <nav class="next three" aria-label="{e(T('다른 부상'))}">
    {near}<a href="#injury"><b>{e(T('러닝 부상 전체'))}</b><span>{e(T('무릎, 정강이, 발, 허벅지 부상을 한눈에 봅니다.'))}</span><i>{e(T('전체 보기'))} →</i></a>
  </nav>
</section>
'''
    path = 'running-injuries/' + x['slug']
    lds = []
    if cfg['siteUrl']:
        base = cfg['siteUrl'] + '/' + META[L()]['prefix']
        lds.append({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': brand(), 'item': base},
            {'@type': 'ListItem', 'position': 2, 'name': T('러닝 부상'), 'item': base + 'running-injuries/'},
            {'@type': 'ListItem', 'position': 3, 'name': name, 'item': base + path + '/'}]})
    return {'path': path, 'body': body, 'lds': lds, 'title': f'{name}: {T(x["tail"])}',
            'desc': T(x['lead']) + ' ' + T('증상과 원인, 스스로 할 수 있는 대처, 진료가 필요한 신호를 정리했습니다.')}

def race_next():
    e = html.escape
    fixed = [{'date': r['date'], 'name': r['name'], 'events': T(r['events']), 'place': T(r['place'])} for r in RACE_DATA['races'] if r.get('date')]
    fixed += [{'date': r['d'], 'name': r['n'], 'events': ' · '.join(T(EV_LABEL[f]) for f in r['f']) or ev_txt(r['ev']), 'place': T(r['rg'])}
              for r in RACE_LIST['races'] if r['k'] == 'up' and set(r['f']) & {'full', 'half', '10k'}]
    fixed = sorted(fixed, key=lambda r: r['date'])[:40]
    return '\n'.join(f'      <li data-date="{r["date"]}"><span class="dday" data-dday></span><div><b lang="ko">{e(r["name"])}</b><span>{kdate(r["date"])} · {e(r["events"])} · {e(r["place"])}</span></div></li>' for r in fixed)

def hub_html(flags):
    return render(i18n.tr_html(read(SRC, 'views', '_hub.html'), L()), flags).rstrip()

RAW_KEYS = ('rl_up', 'rl_last', 'rl_regions', 'tabbar', 'langs', 'head_extra', 'styles', 'nav', 'views', 'scripts', 'race_fixed', 'race_tba', 'race_reg_rows', 'goal_tables', 'hub', 'race_next', 'terms_html', 'injury_cards')

def page_vars():
    b = brand()
    return {'brand': b, 'brandLatin': cfg['brandLatin'], 'contactEmail': cfg['contactEmail'], 'privacyDate': cfg['privacyDate'],
            'sourceName': f'{b}, {host}' if host else b, 'lang': L()}

def render(text, flags, extra=None):
    """<!--if:KEY-->…<!--endif:KEY--> 블록과 {{변수}}, {{brand:는}} 을 채운다."""
    def cond(m):
        return m.group(2) if flags.get(m.group(1)) else ''
    text = re.sub(r'<!--if:(\w+)-->\n?(.*?)<!--endif:\1-->\n?', cond, text, flags=re.S)
    text = re.sub(r'\{\{brand:(.)\}\}', lambda m: html.escape(josa(brand(), m.group(1)) if L() == 'ko' else brand()), text)
    v = page_vars(); v.update(extra or {})
    return re.sub(r'\{\{(\w+)\}\}', lambda m: v[m.group(1)] if m.group(1) in RAW_KEYS else html.escape(str(v[m.group(1)])), text)

def view_html(vid, flags):
    extra = None
    if vid == 'calendar': extra = race_blocks()
    elif vid == 'goals': extra = {'goal_tables': goal_tables(flags.get('site'))}
    elif vid == 'home': extra = {'hub': hub_html(flags), 'race_next': race_next()}
    elif vid == 'tools': extra = {'hub': hub_html(flags)}
    elif vid == 'terms': extra = {'terms_html': terms_html()}
    elif vid == 'injury': extra = {'injury_cards': injury_cards(flags.get('site'))}
    return render(i18n.tr_html(read(SRC, 'views', vid + '.html'), L()), flags, extra).rstrip() + '\n'

# 메뉴에는 자주 쓰는 화면만 두고, 나머지는 '전체 도구'에 모은다
PRIMARY = ['home', 'goals', 'calendar', 'plan', 'injury', 'terms', 'tools']
TABS = [('home', '홈', '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>'),
        ('calendar', '대회', '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
        ('goals', '페이스', '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.8h5M18.5 6.5l1.5-1.5"/>'),
        ('injury', '부상', '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>'),
        ('tools', '전체', '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>')]
def tabbar_html(current=None):
    ids = [t[0] for t in TABS]
    others = [v[0] for v in VIEWS if v[2] and v[0] not in ids]
    cur = current if current in ids else 'tools' if current in others else None
    rows = []
    for vid, label, icon in TABS:
        also = f' data-also="{" ".join(others)}"' if vid == 'tools' else ''
        on = ' aria-current="page"' if vid == cur else ''
        rows.append(f'    <a href="#{vid}" data-nav="{vid}"{also}{on}><svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg><span>{html.escape(T(label))}</span></a>')
    return '\n'.join(rows)
def nav_html(current=None):
    label = {v[0]: v[2] for v in VIEWS}
    others = [v[0] for v in VIEWS if v[2] and v[0] not in PRIMARY]
    cur = current if current in PRIMARY else 'tools' if current in others else None
    rows = []
    for vid in PRIMARY:
        also = f' data-also="{" ".join(others)}"' if vid == 'tools' else ''
        on = ' aria-current="page"' if vid == cur else ''
        rows.append(f'      <a href="#{vid}" data-nav="{vid}"{also}{on}>{html.escape(T(label[vid]))}</a>')
    return '\n'.join(rows)

def i18n_catalog():
    """번역이 필요한 한국어 문장 전부: 화면 틀, 스크립트, 빌드 코드의 T('…'), 데이터."""
    CUR['lang'] = 'ko'
    keys = []
    for f in sorted(os.listdir(os.path.join(SRC, 'views'))):
        keys += [('view:' + f[:-5], k) for k in i18n.html_keys(read(SRC, 'views', f))]
    keys += [('shell', k) for k in i18n.html_keys(shell)]
    keys += [('core.js', k) for k in i18n.js_keys(core_js)] + [('app.js', k) for k in i18n.js_keys(app_js)]
    me = read(ROOT, 'build.py')
    for m in re.finditer(r"""\bT\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")""", me):
        keys.append(('build', m.group(1) or m.group(2)))
    for v in VIEWS:
        keys += [('views', v[2] or ''), ('views', v[3]), ('views', v[4])]
    keys += [('tabs', t[1]) for t in TABS] + [('care', t) for ts in CARE.values() for t in ts]
    keys += [('goal', d[0]) for d in GOAL_DISTS.values()] + [('goal', l) for g in goals() for _i, l, _m in g['pr']] + [('goal', k) for g in goals() for k, _t in g['splits']]
    keys += [('goal', k) for k in ('E 이지', 'M 마라톤', 'T 역치', 'I 인터벌', 'R 반복')]
    for g in TERMS:
        keys.append(('terms', g['group']))
        for t in g['items']:
            keys += [('terms', t['t']), ('terms', t['d'])] + ([('terms', t['toLabel'])] if t.get('toLabel') else [])
    for x in INJURIES:
        keys += [('injury', x[k]) for k in ('name', 'alias', 'area', 'where', 'tail', 'lead') if x.get(k)]
        keys += [('injury', t) for k in ('feel', 'why', 'do', 'see') for t in x[k]]
    for r in RACE_DATA['races']:
        keys += [('races', r[k]) for k in ('season', 'events', 'place', 'reg', 'link') if r.get(k)]
    keys += [('races', m) for m in REG_ORDER] + [('races', g) for g in REGIONS] + [('races', l) for l in EV_LABEL.values()]
    for r in RACE_LIST['races']:
        keys += [('races', r['rg'])] + [('races', tok) for tok in r['ev'].split(' · ')]
    return keys

FAVICON = "data:image/svg+xml," + (
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%231f47e6'/%3E"
    "%3Crect x='12' y='15' width='40' height='34' rx='4' fill='%23fbfaf5'/%3E"
    "%3Crect x='18' y='22' width='12' height='4' rx='2' fill='%230f8f68'/%3E%3Crect x='18' y='30' width='20' height='4' rx='2' fill='%23b57f00'/%3E"
    "%3Crect x='18' y='38' width='28' height='4' rx='2' fill='%23c81d57'/%3E%3C/svg%3E")

css = read(SRC, 'styles.css')
core_js = read(SRC, 'core.js')
app_js = read(SRC, 'app.js')
shell = read(SRC, 'shell.html')

def site_json(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')

# ───────── 1. 한 장짜리 미리보기(한국어) ─────────
def build_artifact():
    CUR['lang'] = 'ko'
    flags = dict(FLAGS, site=False, artifact=True)
    site = {'mode': 'artifact', 'lang': 'ko', 'brand': brand(), 'siteUrl': cfg['siteUrl'], 'partnerLinks': cfg['partnerLinks'], 'paths': None, 'pwa': False}
    page = render(shell, flags, {
        'title': T('{brand} 러닝 계산기'),
        'description': T(VIEWS[0][4]),
        'head_extra': f'<link rel="icon" href="{FAVICON}">',
        'styles': '<style>\n' + css + '</style>',
        'nav': nav_html(), 'tabbar': tabbar_html(), 'langs': '',
        'views': '\n'.join(view_html(v, flags) for v in IDS),
        'scripts': f'<script>window.SITE={site_json(site)};</script>\n<script>\n{core_js}</script>\n<script>\n{app_js}</script>',
    })
    write(os.path.join(OUT, 'artifact', 'index.html'), page)
    return page

# ───────── 2. 배포용 사이트: 한국어는 맨 위, 영어는 /en/, 일본어는 /ja/ ─────────
def digest(*texts):
    h = hashlib.sha256()
    for t in texts:
        h.update(t.encode('utf-8'))
    return h.hexdigest()[:10]

def page_url(path):
    return cfg['siteUrl'] + '/' + (path + '/' if path else '')

def faq_items(about):
    return [(re.sub(r'<[^>]+>', '', q), re.sub(r'<[^>]+>', '', a)) for q, a in re.findall(r'<div><h3>(.*?)</h3><p>(.*?)</p></div>', about, flags=re.S)]

def ad_block(m):
    slot = cfg['adSlots'].get(m.group(1))
    if not (cfg['adsenseClient'] and slot):
        return ''
    return (f'<div class="ad-live"><ins class="adsbygoogle" style="display:block" data-ad-client="{html.escape(cfg["adsenseClient"])}" '
            f'data-ad-slot="{html.escape(str(slot))}" data-ad-format="auto" data-full-width-responsive="true"></ins>'
            '<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>')

def full_path(lang, path):
    return (META[lang]['prefix'] + path).rstrip('/')

def build_site():
    site_dir = os.path.join(ROOT, 'docs')
    shutil.rmtree(site_dir, ignore_errors=True)
    flags = dict(FLAGS, site=True, artifact=False)
    scripts = {}
    for lang in LANGS:
        CUR['lang'] = lang
        scripts[lang] = (i18n.tr_js(core_js, lang), i18n.tr_js(app_js, lang))
    ver = digest(css, *[a + b for a, b in scripts.values()], json.dumps(cfg, sort_keys=True))
    write(os.path.join(site_dir, 'assets', 'site.css'), css)
    for lang, (cj, aj) in scripts.items():
        sfx = '' if lang == 'ko' else '.' + lang
        write(os.path.join(site_dir, 'assets', f'core{sfx}.js'), cj)
        write(os.path.join(site_dir, 'assets', f'app{sfx}.js'), aj)

    pages = []
    leftovers = {}
    def emit(lang, vid, path, title, desc, body=None, lds=(), nav=None):
        full = full_path(lang, path)
        root = '../' * (full.count('/') + 1) if full else ''
        lroot = root + META[lang]['prefix']
        paths = {v[0]: (lroot + v[1] + '/' if v[1] else (lroot or './')) for v in VIEWS}
        if body is None:
            body = view_html(vid, flags).replace(f'data-view="{vid}" hidden', f'data-view="{vid}"')
        body = re.sub(r'<aside class="ad" data-ad="([\w-]+)">.*?</aside>\n?', ad_block, body, flags=re.S)
        full_title = title if vid == 'home' else f'{title} | {brand()}'
        sfx = '' if lang == 'ko' else '.' + lang
        head = []
        if cfg['siteUrl']:
            url = page_url(full)
            head += [f'<link rel="canonical" href="{url}">', f'<meta property="og:url" content="{url}">',
                     f'<meta property="og:image" content="{cfg["siteUrl"]}/og.png">', '<meta name="twitter:card" content="summary_large_image">']
            head += [f'<link rel="alternate" hreflang="{lx}" href="{page_url(full_path(lx, path))}">' for lx in LANGS]
            head.append(f'<link rel="alternate" hreflang="x-default" href="{page_url(full_path("ko", path))}">')
        head += [
            f'<meta property="og:title" content="{html.escape(full_title)}">',
            f'<meta property="og:description" content="{html.escape(desc)}">',
            '<meta property="og:type" content="website">', f'<meta property="og:site_name" content="{html.escape(brand())}">',
            f'<meta property="og:locale" content="{META[lang]["og"]}">',
            '<meta name="theme-color" content="#edf0f4" media="(prefers-color-scheme: light)">',
            '<meta name="theme-color" content="#0a111e" media="(prefers-color-scheme: dark)">',
            f'<link rel="manifest" href="{root}manifest{sfx}.webmanifest">',
            f'<link rel="icon" href="{root}icons/favicon.svg" type="image/svg+xml">',
            f'<link rel="apple-touch-icon" href="{root}icons/apple-touch-icon.png">',
            '<meta name="apple-mobile-web-app-capable" content="yes">', f'<meta name="apple-mobile-web-app-title" content="{html.escape(brand())}">',
        ]
        if lang == 'ko' and vid == 'home' and cfg['googleVerification']:
            head.append(f'<meta name="google-site-verification" content="{html.escape(cfg["googleVerification"])}">')
        if lang == 'ko' and vid == 'home' and cfg['naverVerification']:
            head.append(f'<meta name="naver-site-verification" content="{html.escape(cfg["naverVerification"])}">')
        ld = None
        if vid == 'home':
            ld = {'@context': 'https://schema.org', '@type': 'WebSite', 'name': brand(), 'description': desc, 'inLanguage': lang}
        elif vid == 'about':
            ld = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
                {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq_items(body)]}
        elif vid in ('race', 'plan', 'log', 'spike', 'shoes', 'heart', 'pace', 'fitage'):
            ld = {'@context': 'https://schema.org', '@type': 'WebApplication', 'name': title, 'description': desc, 'inLanguage': lang,
                  'applicationCategory': 'HealthApplication', 'operatingSystem': 'All',
                  'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'KRW'}}
        if ld:
            if cfg['siteUrl']:
                ld['url'] = page_url(full)
            head.append('<script type="application/ld+json">' + site_json(ld) + '</script>')
        for x in lds:
            head.append('<script type="application/ld+json">' + site_json(x) + '</script>')
        if cfg['ga4Id']:
            gid = html.escape(cfg['ga4Id'])
            head.append(f'<script async src="https://www.googletagmanager.com/gtag/js?id={gid}"></script>\n'
                        f"<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','{gid}');</script>")
        if cfg['adsenseClient']:
            head.append(f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={html.escape(cfg["adsenseClient"])}" crossorigin="anonymous"></script>')
        langs = ''.join(
            f'<a href="{(root + full_path(lx, path) + "/") if full_path(lx, path) else (root or "./")}" hreflang="{lx}" lang="{lx}"'
            f'{" aria-current=" + chr(34) + "true" + chr(34) if lx == lang else ""} title="{META[lx]["label"]}">{META[lx]["short"]}</a>' for lx in LANGS)
        site = {'mode': 'site', 'lang': lang, 'brand': brand(), 'siteUrl': cfg['siteUrl'], 'partnerLinks': cfg['partnerLinks'], 'paths': paths, 'pwa': True, 'sw': root + 'sw.js'}
        page = render(i18n.tr_html(shell, lang), flags, {
            'title': full_title, 'description': desc, 'head_extra': '\n'.join(head),
            'styles': f'<link rel="stylesheet" href="{root}assets/site.css?v={ver}">',
            'nav': nav_html(nav or vid), 'tabbar': tabbar_html(nav or vid), 'langs': langs, 'views': body,
            'scripts': f'<script>window.SITE={site_json(site)};</script>\n<script src="{root}assets/core{sfx}.js?v={ver}" defer></script>\n<script src="{root}assets/app{sfx}.js?v={ver}" defer></script>',
        })
        page = re.sub(r'href="#(' + '|'.join(IDS) + r')"', lambda m: f'href="{paths[m.group(1)]}"', page)
        if lang != 'ko':
            left = [s for s in i18n.leftover(page) if i18n.HANGUL.search(s)]
            if left:
                leftovers.setdefault(lang, {}).update({s: full for s in left})
        write(os.path.join(site_dir, full, 'index.html'), page)
        pages.append(full)

    for lang in LANGS:
        CUR['lang'] = lang
        for vid, path, _label, title, desc in VIEWS:
            emit(lang, vid, path, T(title), T(desc), lds=view_lds(vid))
        for dist in GOAL_DISTS:                      # 목표별 쪽: 같은 거리 안에서 앞뒤 목표를 잇는다
            group = [g for g in goals() if g['dist'] == dist]
            for i, g in enumerate(group):
                gp = goal_page(g, group[i + 1] if i + 1 < len(group) else None, group[i - 1] if i else None)
                emit(lang, 'goal', gp['path'], gp['title'], gp['desc'], body=gp['body'], lds=gp['lds'], nav='goals')
        for i, x in enumerate(INJURIES):             # 부상별 쪽
            ip = injury_page(x, [INJURIES[(i + k) % len(INJURIES)] for k in (1, 2)])
            emit(lang, 'injury-page', ip['path'], ip['title'], ip['desc'], body=ip['body'], lds=ip['lds'], nav='injury')
    CUR['lang'] = 'ko'

    # src/static/ 안의 파일은 그대로 사이트 맨 위에 복사한다(검색 엔진 소유 확인 파일 등)
    static = os.path.join(SRC, 'static')
    if os.path.isdir(static):
        for name in sorted(os.listdir(static)):
            shutil.copy(os.path.join(static, name), os.path.join(site_dir, name))

    # 설치형 웹앱: 언어마다 시작 화면이 다르다
    for lang in LANGS:
        CUR['lang'] = lang
        sfx = '' if lang == 'ko' else '.' + lang
        start = META[lang]['prefix'] or './'
        manifest = {
            'name': T('{brand} 러닝 계산기'), 'short_name': brand(), 'description': T(VIEWS[0][4]), 'lang': lang,
            'start_url': start, 'scope': './', 'display': 'standalone', 'background_color': '#edf0f4', 'theme_color': '#1f47e6',
            'icons': [
                {'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
                {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
                {'src': 'icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
            ],
            'shortcuts': [{'name': T(v[2]), 'url': META[lang]['prefix'] + v[1] + '/'} for v in VIEWS if v[0] in ('log', 'plan', 'calendar')],
        }
        write(os.path.join(site_dir, f'manifest{sfx}.webmanifest'), json.dumps(manifest, ensure_ascii=False, indent=2))
    CUR['lang'] = 'ko'
    view_pages = [p for p in pages if not p.startswith(('en', 'ja', 'pace-chart/', 'running-injuries/'))]
    precache = ['./'] + [p + '/' for p in view_pages if p] + [f'assets/site.css?v={ver}', f'assets/core.js?v={ver}', f'assets/app.js?v={ver}', 'manifest.webmanifest', 'icons/icon-192.png']
    write(os.path.join(site_dir, 'sw.js'), read(SRC, 'pwa', 'sw.js').replace('__VERSION__', ver).replace('__PRECACHE__', json.dumps(precache)))

    # 아이콘과 공유 이미지
    icons = os.path.join(site_dir, 'icons'); os.makedirs(icons, exist_ok=True)
    shutil.copy(os.path.join(SRC, 'pwa', 'icon.svg'), os.path.join(icons, 'favicon.svg'))
    og_svg = os.path.join(OUT, 'og.svg')
    write(og_svg, read(SRC, 'pwa', 'og.svg').replace('{{brand}}', html.escape(BRAND)).replace('{{brandLatin}}', html.escape(cfg['brandLatin'])))
    jobs = [('icon.svg', 'icons/icon-192.png', 192), ('icon.svg', 'icons/icon-512.png', 512), ('icon.svg', 'icons/apple-touch-icon.png', 180), ('icon-maskable.svg', 'icons/maskable-512.png', 512)]
    try:
        for src, dst, size in jobs:
            subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), os.path.join(SRC, 'pwa', src), '-o', os.path.join(site_dir, dst)], check=True)
        subprocess.run(['rsvg-convert', '-w', '1200', '-h', '630', og_svg, '-o', os.path.join(site_dir, 'og.png')], check=True)
    except (OSError, subprocess.CalledProcessError) as e:
        print('  아이콘 PNG를 만들지 못했습니다(rsvg-convert 필요). 이전에 만든 PNG를 icons/에 넣어 주세요:', e, file=sys.stderr)
    os.remove(og_svg)

    # 검색 엔진과 호스팅
    robots = 'User-agent: *\nAllow: /\n'
    if cfg['siteUrl']:
        robots += f'Sitemap: {cfg["siteUrl"]}/sitemap.xml\n'
        urls = ''.join(f'  <url><loc>{page_url(p)}</loc><lastmod>{cfg["privacyDate"]}</lastmod></url>\n' for p in pages)
        write(os.path.join(site_dir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n')
        if host and not host.endswith('github.io'):
            write(os.path.join(site_dir, 'CNAME'), host + '\n')
    write(os.path.join(site_dir, 'robots.txt'), robots)
    if cfg['adsenseClient']:
        write(os.path.join(site_dir, 'ads.txt'), f'google.com, {cfg["adsenseClient"].replace("ca-", "")}, DIRECT, f08c47fec0942fa0\n')
    write(os.path.join(site_dir, '.nojekyll'), '')
    write(os.path.join(site_dir, '404.html'),
          f'<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>페이지를 찾을 수 없습니다 | {html.escape(BRAND)}</title>'
          '<meta name="robots" content="noindex"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#edf0f4;color:#101a2b;font:16px/1.7 "Apple SD Gothic Neo","Malgun Gothic",sans-serif;text-align:center;padding:24px}'
          'a{color:#1f47e6;font-weight:700}@media (prefers-color-scheme:dark){body{background:#0a111e;color:#e9eef6}a{color:#7d97ff}}</style></head>'
          f'<body><main><h1>코스를 벗어났습니다</h1><p>찾는 페이지가 없거나 주소가 바뀌었습니다.</p><p><a href="/">{html.escape(BRAND)} 첫 화면으로 →</a></p>'
          '<p lang="en">Page not found. <a href="/en/">Runjisu in English →</a></p><p lang="ja">ページが見つかりません。<a href="/ja/">日本語版へ →</a></p></main></body></html>\n')
    return pages, ver, leftovers

if __name__ == '__main__':
    a = build_artifact()
    pages, ver, leftovers = build_site()
    print(f'미리보기  out/artifact/index.html  {len(a.encode("utf-8")) / 1024:.0f} KB')
    print(f'사이트    docs/  {len(pages)}쪽  버전 {ver}' + ('' if cfg['siteUrl'] else '  (siteUrl 미설정: canonical·sitemap 생략)'))
    for lang in ('en', 'ja'):
        miss = i18n.MISSING.get(lang, {})
        left = leftovers.get(lang, {})
        if miss or left:
            print(f'  {lang}: 번역 없는 문장 {len(miss)}개, 화면에 남은 한글 {len(left)}곳 (python3 i18n.py 로 목록 확인)')
