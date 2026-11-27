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
    'indexNowKey': '', 'ga4Id': '', 'adsenseClient': '', 'adSlots': {}, 'partnerLinks': {}, 'privacyDate': '2026-11-12', 'adfit': {}, 'termsDate': '2026-11-21',
    'googleVerification': '', 'naverVerification': '',
}
cfg.update(json.loads(read(ROOT, 'site.config.json')))
cfg['siteUrl'] = cfg['siteUrl'].rstrip('/')
BRAND = cfg['brand']
META['ko']['brand'] = BRAND

# 화면 목록: id, 주소, 메뉴 이름(없으면 메뉴에 안 나옴), 제목, 설명
VIEWS = [
    ('home', '', '홈', '러닝 페이스 계산기: 마라톤 예상 기록과 훈련 페이스 | {brand}',
     '5K, 10K, 하프, 풀코스 기록 하나를 넣으면 {brand}와 E·M·T·I·R 훈련 페이스, 거리별 예상 기록을 계산합니다. 오늘 달리기 날씨와 미세먼지, 다가오는 대회도 한 화면에서 확인하세요. 정형외과 전문의가 만든 무료 러닝 계산기.'),
    ('race', 'race-pace', '대회 계획', '마라톤 페이스 계산기: 목표 기록별 5km 구간 통과 시각',
     '목표 기록을 넣으면 km당 페이스와 5km 구간별 통과 시각을 계산합니다. 후반 가속 전략과, 목표가 지금 실력에 맞는지도 함께 확인하세요.'),
    ('goals', 'pace-chart', '목표 페이스', '마라톤 페이스표: 서브3·서브4, 하프 2시간, 10km 50분 목표별 km당 페이스',
     '풀코스 서브3·서브4, 하프 2시간, 10km 50분 등 목표 기록별로 km당 페이스와 400m 트랙 기록, 러닝머신 속도를 한 표에 정리했습니다. 목표마다 구간 통과 시각과 필요한 실력도 확인하세요.'),
    ('calendar', 'marathon-schedule', '대회 일정', '전국 마라톤 대회 일정 2026·2027: 이번 주 대회부터 서울·춘천·JTBC 접수까지',
     '이번 주말 열리는 대회부터 2027년 봄·가을 대회까지, 전국 마라톤 대회 일정을 종목과 지역으로 골라 봅니다. 서울마라톤, 춘천마라톤, JTBC, 대구마라톤 등 주요 대회의 접수 시기와 공식 사이트도 함께 정리했습니다.'),
    ('plan', 'training-week', '주간 훈련표', '러닝 훈련표 만들기: 주간 거리와 목표 대회에 맞춘 마라톤 훈련 계획',
     '주간 거리와 달리는 날 수, 목표 대회를 고르면 내 페이스에 맞춘 요일별 훈련표를 짜 드립니다. 이지 런, 역치 훈련, 인터벌, 장거리 분량까지.'),
    ('log', 'log', '달리기 기록', '달리기 기록장: 주간 거리와 신발 누적 거리',
     '날짜와 거리만 적으면 주간 거리, 최근 30일 최장 거리, 신발 누적 거리를 계산합니다. 가입 없이 쓰고 기록은 내 기기에만 저장됩니다.'),
    ('spike', 'long-run-check', '거리 급증', '장거리 얼마까지 늘려도 될까: 러닝 부상 위험 체크',
     '최근 30일 최장 거리와 이번에 달릴 거리를 넣으면 과사용 부상이 늘어나는 구간인지 알려 드립니다. 러너 5,205명 추적 연구 기준.'),
    ('shoes', 'shoe-mileage', '신발', '러닝화 교체 시기 계산기: 신발별 누적 거리와 수명',
     '러닝화마다 누적 거리를 기록하고 교체 시기를 확인합니다. 쿠션화, 레이싱화, 트레일화별 교체 구간과 눈으로 확인할 점검 항목.'),
    ('heart', 'heart-rate-zones', '심박 존', '러닝 심박수 존 계산기: 나이·최대 심박으로 강도별 심박 구간',
     '나이나 실제 최대심박을 넣으면 이지, 마라톤, 역치, 인터벌 강도별 심박 범위를 계산합니다.'),
    ('pace', 'pace-converter', '페이스 변환', '페이스 계산기: 러닝머신 속도와 km 페이스 변환',
     '러닝머신 속도(km/h)를 km당 페이스로, 페이스를 5K·10K·하프·풀코스 완주 기록으로 바꿉니다.'),
    ('fitage', 'fitness-age', '체력 나이', '체력 나이 계산기: 달리기와 걷기로 보는 VO2max',
     '달리기 기록, 12분 달리기, 1.6km 빨리 걷기로 유산소 체력(VO2max)을 추정하고 또래 가운데 어디쯤인지, 체력 나이가 몇 살인지 보여 드립니다.'),
    ('crew', 'crew-pace-groups', '크루 페이스', '러닝 크루 페이스 그룹 나누기: 멤버 기록으로 그룹런 페이스 정하기',
     '멤버 기록을 한 줄에 한 사람씩 붙여 넣으면 실력이 비슷한 사람끼리 그룹을 나누고, 그룹마다 모두가 따라올 수 있는 이지 페이스를 정해 드립니다.'),
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
    ('tos', 'terms-of-use', None, '이용약관', '{brand} 이용약관: 계산 결과의 한계, 대회 정보, 광고와 제휴 링크, 저작권 안내.'),
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
    'adfit': bool((cfg.get('adfit') or {}).get('mobile') or (cfg.get('adfit') or {}).get('desktop')),
    'none': not (partners or cfg['ga4Id'] or cfg['adsenseClient'] or (cfg.get('adfit') or {}).get('mobile') or (cfg.get('adfit') or {}).get('desktop')),
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

SHOP = {'cushion': ('쿠팡에서 쿠션 러닝화 보기', '쿠션 러닝화'), 'racing': ('쿠팡에서 경량 레이싱화 보기', '경량 레이싱화'),
        'race': ('쿠팡에서 배번 벨트 보기', '러닝 배번 벨트'), 'watch': ('쿠팡에서 러닝 워치 보기', '러닝 워치')}
def shop_link(key):
    label, q = SHOP[key]
    return f'<a class="shop" data-shop="{key}" target="_blank" rel="noopener" href="https://www.coupang.com/np/search?q={urllib.parse.quote(q)}">{html.escape(T(label))}</a>'

# 계산 결과 바로 아래에 놓는 맞춤 준비물 카드 (한국어 화면, 파트너스 링크가 있는 항목만)
PICKS = {'cushion': ('👟', '쿠션 러닝화', '주 3회 이상 달리거나 장거리를 늘리는 시기에. 신었을 때 편한 것이 첫 기준입니다.'),
         'stability': ('🦶', '안정화', '발이 안쪽으로 많이 무너지고 무릎 안쪽·정강이가 자주 아픈 러너에게.'),
         'racing': ('⚡', '경량 레이싱화', '목표 기록에 도전하는 대회용. 장거리 훈련에서 한두 번 신어 본 뒤 대회에.'),
         'watch': ('⌚', '러닝 워치', '구간표대로 달리려면 km당 페이스가 달리는 중에 보여야 합니다.'),
         'roller': ('🧘', '폼롤러', '달린 뒤 종아리·허벅지를 부위당 1~2분. 아픈 자리를 세게 누르지는 마세요.'),
         'race': ('🎽', '배번 벨트', '옷에 구멍 내지 않고 배번을 고정. 에너지젤 고리가 있으면 보급이 편합니다.')}
PICK_SETS = {'race': ('대회 날 준비물', ['race', 'racing', 'watch'], ''),
             'goals': ('목표 기록에 필요한 장비', ['watch', 'racing', 'race'], ''),
             'plan': ('훈련을 꾸준히 이어 가게 돕는 장비', ['cushion', 'watch', 'roller'], ''),
             'injury': ('회복과 예방에 쓰는 장비', ['roller', 'cushion', 'stability'], '통증이 뚜렷하거나 오래가면 장비보다 진료가 먼저입니다.'),
             'spike': ('거리를 늘리는 시기에', ['cushion', 'roller'], ''),
             'racepage': ('대회 날 챙길 것', ['race', 'racing', 'watch', 'roller'], '대회 날 처음 쓰는 물건은 없어야 합니다. 신발과 벨트는 장거리 훈련에서 한 번 이상 써 보세요.')}
def picks_html(ctx, hid=None):
    if L() != 'ko' or not CUR.get('site'):
        return ''
    title, keys, note = PICK_SETS[ctx]
    keys = [k for k in keys if cfg['partnerLinks'].get(k)]
    if not keys:
        return ''
    e = html.escape; hid = hid or f'pk-{ctx}'
    items = ''.join(f'<li><a class="shop pick" data-shop="{k}" data-from="{ctx}" href="{e(cfg["partnerLinks"][k])}" target="_blank" rel="noopener sponsored nofollow">'
                    f'<span class="pick-ic" aria-hidden="true">{PICKS[k][0]}</span><b>{e(PICKS[k][1])}</b><small>{e(PICKS[k][2])}</small><i>쿠팡에서 보기 ›</i></a></li>' for k in keys)
    return (f'  <section class="panel picks" aria-labelledby="{hid}">\n    <h2 id="{hid}">{e(title)}<small>정형외과 전문의가 정한 고르는 기준</small></h2>\n'
            + (f'    <p class="note">{e(note)}</p>\n' if note else '')
            + f'    <ul class="picks-list">{items}</ul>\n    <p class="note pick-disc">이 사이트는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다. <a href="#gear">유형별로 고르는 법 →</a></p>\n  </section>\n')

PICK_AT = {'race': '  <aside class="ad" data-ad="race-1">', 'plan': '  <aside class="ad" data-ad="plan-1">',
           'injury': '  <p class="note">이 안내는 일반 정보', 'spike': '  <div class="cta"><span>달린 날을'}

def reg_reminder(r):
    """접수 달이 알려진 날짜 미발표 대회: 다음 접수 달 1일. 지난 달이면 내년"""
    m = re.match(r'(\d+)', r.get('regMonth') or '')
    if r.get('date') or not m: return None
    month, today = int(m.group(1)), datetime.date.fromisoformat(RACE_DATA['checked'])
    y = today.year if month > today.month else today.year + 1
    return f'{y}-{month:02d}-01'

def ics_button(r, small=True):
    e = html.escape
    cls = 'btn ghost small ics' if small else 'btn ghost ics'
    if r.get('date'):
        return (f'<button type="button" class="{cls}" data-ics="race" data-ics-date="{r["date"]}" data-ics-title="{e(r["name"])}" '
                f'data-ics-url="{e(r["url"])}">{e(T("캘린더에 추가"))}</button>')
    rem = reg_reminder(r)
    if rem:
        return (f'<button type="button" class="{cls}" data-ics="reg" data-ics-date="{rem}" data-ics-title="{e(r["name"])}" '
                f'data-ics-url="{e(r["url"])}">{e(T("접수 시기 알림 받기"))}</button>')
    return ''

def race_card(r, site=False):
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
            f'        <div class="acts"><a class="out" href="{e(r["url"])}" target="_blank" rel="noopener">{e(T(r["link"]))} ↗</a>{goal}{ics_button(r)}</div>\n'
            + (f'        <a class="race-more" href="{e(r["id"])}/">{e(T("코스·부상 주의점·5km 페이스표"))} →</a>\n' if site else '')
            + 
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
        cal = (f'<button type="button" class="rc-ics" data-ics="race" data-ics-date="{r["d"]}" data-ics-title="{e(r["n"])}" data-ics-url="{e(r["u"])}" '
               f'aria-label="{e(T("캘린더에 추가"))}: {e(r["n"])}" title="{e(T("캘린더에 추가"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/></svg></button>')
        return (f'      <li class="rc race" data-id="l{i}" data-name="{e(r["n"])}" data-dist="{dist}" data-date="{r["d"]}" {common}>'
                f'<div class="rc-d"><b>{m}.{d}</b><span>{wd}</span></div>'
                f'<div class="rc-b">{name}<p><span class="rc-t">{tags}</span><span class="rc-rg">{e(rg)}</span><span class="rc-ev">{e(ev)}</span></p></div>'
                f'<div class="rc-r"><span class="pill" data-dday hidden></span><span class="rc-lk">{link}{cal}</span>{goal}</div></li>')
    return (f'      <li class="rc" {common}>'
            f'<div class="rc-d last"><b>{m}.{d}</b><span>{wd}</span></div>'
            f'<div class="rc-b">{name}<p><span class="rc-t">{tags}</span><span class="rc-rg">{e(rg)}</span><span class="rc-ev">{e(ymd(y, m, d))} · {e(ev)}</span></p></div>'
            f'<div class="rc-r">{link}</div></li>')

TODAY = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()

def rc_list(kind):
    rows, cur = [], None
    items = sorted([(r, i) for i, r in enumerate(RACE_LIST['races']) if r['k'] == kind and not (kind == 'up' and r['d'] < TODAY)], key=lambda x: x[0]['d'])
    for r, i in items:
        mk = r['d'][:7]
        if mk != cur:
            cur = mk; y, m = map(int, mk.split('-'))
            label = month_label(m, y) if kind == 'up' else f'{month_label(m)} <small>{html.escape(T("2026년 개최"))}</small>'
            rows.append(f'      <li class="rc-m" data-month="{m}" aria-hidden="true">{label}</li>')
        rows.append(rc_item(r, i))
    return '\n'.join(rows)

REG_ORDER = ['12월', '1월', '4월', '4~6월', '5월', '7월', '10월']

REGION_SLUG = {'서울': 'seoul', '경기': 'gyeonggi', '인천': 'incheon', '강원': 'gangwon', '충북': 'chungbuk', '충남': 'chungnam', '대전': 'daejeon',
               '세종': 'sejong', '전북': 'jeonbuk', '전남': 'jeonnam', '광주': 'gwangju', '경북': 'gyeongbuk', '경남': 'gyeongnam', '대구': 'daegu',
               '울산': 'ulsan', '부산': 'busan', '제주': 'jeju'}
DIST_HUB = [('full', '풀코스', '풀코스 마라톤', 42195), ('half', '하프', '하프 마라톤', 21097.5), ('10k', '10km', '10km 마라톤', 10000), ('trail', '트레일', '트레일 러닝', 0)]

def hub_regions():
    from collections import Counter
    n = Counter(r['rg'] for r in RACE_LIST['races'])
    return [g for g in REGIONS if g in REGION_SLUG and n[g] >= 3]

def home_hubs():
    if L() != 'ko':
        return ''
    reg = ''.join(f'<a href="marathon-schedule/region/{REGION_SLUG[g]}/">{html.escape(g)}</a>' for g in hub_regions())
    dist = ''.join(f'<a href="marathon-schedule/distance/{k}/">{html.escape(lab)}</a>' for k, _s, lab, _m in DIST_HUB)
    return f'    <p class="hub-links" aria-label="지역별 대회 일정">{reg}</p>\n    <p class="hub-links" aria-label="종목별 대회 일정">{dist}</p>\n'

def rl_hubs():
    """대회 일정 쪽 아래: 지역별·종목별 쪽으로 가는 길(한국어판만)"""
    if L() != 'ko':
        return ''
    reg = ''.join(f'<a href="region/{REGION_SLUG[g]}/">{html.escape(g)}</a>' for g in hub_regions())
    dist = ''.join(f'<a href="distance/{k}/">{html.escape(lab)}</a>' for k, _s, lab, _m in DIST_HUB)
    return (f'  <section class="panel hubs" aria-labelledby="rl-hubs-h">\n    <h2 id="rl-hubs-h">지역별·종목별로 보기</h2>\n'
            f'    <p class="hub-links" aria-label="지역">{reg}</p>\n    <p class="hub-links" aria-label="종목">{dist}</p>\n  </section>\n')

def list_page(kind, key):
    """지역별(kind='region') 또는 종목별(kind='distance') 대회 쪽. 한국어판만 만든다"""
    e = html.escape
    rows = [(r, i) for i, r in enumerate(RACE_LIST['races'])]
    if kind == 'region':
        g = key; slug = REGION_SLUG[g]; pick = [(r, i) for r, i in rows if r['rg'] == g]
        label = g; h1 = f'{g} 마라톤 대회 일정'; what = f'{g}에서 열리는'
    else:
        slug, short, label, meters = next(x for x in DIST_HUB if x[0] == key)
        pick = [(r, i) for r, i in rows if key in r['f']]
        h1 = f'{label} 대회 일정'; what = f'{short} 종목이 있는'
    pick = [x for x in pick if not (x[0]['k'] == 'up' and x[0]['d'] < TODAY)]     # 끝난 대회는 뺀다
    up = sorted([x for x in pick if x[0]['k'] == 'up' and x[0]['d'] >= TODAY], key=lambda x: x[0]['d'])
    last = sorted([x for x in pick if x[0]['k'] == 'last'], key=lambda x: x[0]['d'])
    majors = [r for r in RACE_DATA['races'] if (kind == 'region' and r['place'].startswith(key)) or
              (kind == 'distance' and ((key == 'full' and r['dist'] > 30000) or (key == 'half' and 20000 < r['dist'] < 30000)))]
    def lst(items):
        out, cur = [], None
        for r, i in items:
            mk = r['d'][:7]
            if mk != cur:
                cur = mk; y, m = map(int, mk.split('-'))
                out.append(f'      <li class="rc-m" aria-hidden="true">{month_label(m, y) if r["k"] == "up" else month_label(m) + " <small>2026년 개최</small>"}</li>')
            out.append(rc_item(r, i))
        return '\n'.join(out)
    maj = ''.join(f'<a href="../../{r["id"]}/"><b lang="ko">{e(r["name"])}</b><span>{e(kdate(r["date"]) if r.get("date") else r["season"])}</span><i>코스·페이스표 →</i></a>' for r in majors[:6])
    if kind == 'region':
        others = ''.join(f'<a href="../{REGION_SLUG[x]}/"{" aria-current=page" if x == key else ""}>{e(x)}</a>' for x in hub_regions())
        cross = ''.join(f'<a href="../../distance/{k}/">{e(lab)}</a>' for k, _s, lab, _m in DIST_HUB)
    else:
        others = ''.join(f'<a href="../{k}/"{" aria-current=page" if k == key else ""}>{e(lab)}</a>' for k, _s, lab, _m in DIST_HUB)
        cross = ''.join(f'<a href="../../region/{REGION_SLUG[x]}/">{e(x)}</a>' for x in hub_regions())
    tool = ''
    if kind == 'distance' and DIST_HUB[[x[0] for x in DIST_HUB].index(key)][3]:
        tool = f'<div class="cta"><span>{e(label)} 목표 기록, 구간마다 몇 분에 지나야 할까</span><a href="#race?rd={DIST_HUB[[x[0] for x in DIST_HUB].index(key)][3]:g}&goal={14400 if key == "full" else 7200 if key == "half" else 3300}">구간표 만들기 →</a></div>'
    else:
        tool = '<div class="cta"><span>목표 기록, 구간마다 몇 분에 지나야 할까</span><a href="#race">구간표 만들기 →</a></div>'
    body = f"""<section class="view" data-view="race-hub">
  <nav class="crumb" aria-label="현재 위치"><a href="#home">{e(brand())}</a> › <a href="#calendar">대회 일정</a> › <span>{e(label)}</span></nav>
  <div class="view-head">
    <h1>{e(h1)}<br><small>2026·2027</small></h1>
    <p>{e(what)} 대회 {len(pick)}개를 날짜순으로 모았습니다. 다가오는 대회 {len(up)}개, 2027년 날짜가 아직 나오지 않아 2026년 개최일로 적은 대회 {len(last)}개입니다. 종목과 날짜는 바뀔 수 있으니 접수 전에 공식 사이트에서 확인하세요.</p>
  </div>
  <p class="basis" id="goal-box"></p>
  <p class="hub-links" aria-label="같은 종류의 다른 목록">{others}</p>
  {('<section class="panel"><h2>주요 대회 안내</h2><nav class="next three" aria-label="주요 대회">' + maj + '</nav></section>') if maj else ''}
  <section class="panel rl" aria-labelledby="hub-up">
    <h2 id="hub-up">다가오는 대회 <small>{len(up)}개</small></h2>
    {('<ul class="rl-list">' + chr(10) + lst(up) + chr(10) + '    </ul>') if up else '<p class="note">지금은 일정이 잡힌 다가오는 대회가 없습니다. 아래 2026년 개최일을 보고 내년 시기를 가늠해 보세요.</p>'}
  </section>
  {tool}
  <section class="panel rl" aria-labelledby="hub-last">
    <h2 id="hub-last">2027 예상 <small>2026년 개최일 기준</small></h2>
    <p class="note">대부분 해마다 비슷한 시기에 열립니다. 2027년 날짜가 발표되면 대회 일정에 반영합니다.</p>
    {('<ul class="rl-list">' + chr(10) + lst(last) + chr(10) + '    </ul>') if last else '<p class="note">목록에 없습니다.</p>'}
  </section>
  <aside class="ad" data-ad="racehub-1">광고 자리 · 애드센스 승인 뒤 표시</aside>
  <section class="panel hubs"><h2>다른 목록</h2><p class="hub-links">{cross}</p></section>
</section>
"""
    path = f'marathon-schedule/{kind}/{slug}'
    lds = []
    if cfg['siteUrl']:
        base = cfg['siteUrl'] + '/'
        lds.append({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': brand(), 'item': base},
            {'@type': 'ListItem', 'position': 2, 'name': '대회 일정', 'item': base + 'marathon-schedule/'},
            {'@type': 'ListItem', 'position': 3, 'name': label, 'item': base + path + '/'}]})
    title = f'{h1} 2026·2027: {len(pick)}개 대회 날짜와 종목 모음'
    desc = f'{what} 마라톤 대회 {len(pick)}개의 날짜, 종목, 공식 사이트를 날짜순으로 정리했습니다. 2027년 날짜가 나오지 않은 대회는 2026년 개최일로 시기를 가늠할 수 있습니다.'
    return {'path': path, 'body': body, 'lds': lds, 'title': title, 'desc': desc}

def race_blocks(site=False):
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
    return {'race_fixed': '\n'.join(race_card(r, site) for r in fixed), 'race_tba': '\n'.join(race_card(r, site) for r in tba),
            'race_reg_rows': '\n'.join(rows), 'racesChecked': kdate(RACE_DATA['checked']),
            'rl_up': rc_list('up'), 'rl_last': rc_list('last'), 'rlChecked': kdate(RACE_LIST['checked']), 'rl_hubs': rl_hubs() if site else '',
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
  <aside class="ad" data-ad="goalpage-1">광고 자리 · 애드센스 승인 뒤 표시</aside>
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
SCIENCE = json.loads(read(SRC, 'data', 'science.json'))
NEWS = json.loads(read(SRC, 'data', 'news.json'))
NEWS['items'].sort(key=lambda x: x['date'], reverse=True)

NEWS_TAG = {'안전': ('❤️', '#d93a54', '#ff8a96'), '대회': ('🏁', '#1f47e6', '#6f8cff'), '기록': ('⏱️', '#087a5c', '#36cfa0'),
            '정책': ('🏛️', '#5b3fd0', '#a38bff'), '이슈': ('📣', '#b85e0c', '#ffb35c'), '엘리트': ('🥇', '#8a6a00', '#f0c541')}

def news_thumb(x):
    ic, c1, c2 = NEWS_TAG.get(x['tag'], ('🏃', '#1f47e6', '#6f8cff'))
    return f'<span class="nthumb" style="--c1:{c1};--c2:{c2}" aria-hidden="true"><i>{ic}</i><b>{html.escape(x["tag"])}</b></span>'

def news_item(x):
    """뉴스 카드 한 장. 런지수 정리 글은 그 쪽으로, 스크랩은 눌러서 요약과 원문 링크를 편다"""
    e = html.escape
    src = '런지수 정리' if x['kind'] == 'brief' else x['source']
    meta = f'<small class="nmeta">{e(src)} | {e(x["date"].replace("-", "."))}</small>'
    text = e(' '.join([x['title'], x.get('orig', ''), src, x['tag'], x.get('sum', x.get('dek', ''))]))
    head = f'{news_thumb(x)}<span class="nbody"><b class="ntitle"><em class="nbadge{"" if x["kind"] == "brief" else " ai"}">{"런지수 정리" if x["kind"] == "brief" else "요약"}</em> {e(x["title"])}</b>'
    if x['kind'] == 'brief':
        return f'<li class="nitem" data-tag="{e(x["tag"])}" data-text="{text}"><a class="ncard" href="#news/{x["id"]}">{head}<span class="norig">{e(x["dek"])}</span>{meta}</span></a></li>'
    orig = f'<span class="norig">{e(x["orig"])}</span>' if x.get('orig') else ''
    more = f'<a class="btn ghost small" href="#{x["link"][0]}">{e(x["link"][1])} →</a>' if x.get('link') else ''
    return (f'<li class="nitem" data-tag="{e(x["tag"])}" data-id="{e(x["id"])}" data-text="{text}"><details class="ncard-d"><summary class="ncard">{head}{orig}{meta}</span></summary>'
            f'<div class="nmore"><p>{e(x["sum"])}</p><p class="nacts"><a class="btn small" href="{e(x["url"])}" target="_blank" rel="noopener">원문 보기 · {e(x["source"])} ↗</a>{more}</p></div></details></li>')

def news_list(items):
    return '<ul class="nlist">' + ''.join(news_item(x) for x in items) + '</ul>'

def news_home():
    if L() != 'ko' or not NEWS['items']:
        return ''
    return (f'  <section class="panel" aria-labelledby="news-h">\n    <h2 id="news-h">마라톤 뉴스</h2>\n'
            f'    {news_list(NEWS["items"][:4])}\n'
            f'    <div class="cta"><span>러너가 알아야 할 소식 {len(NEWS["items"])}건</span><a href="#news">뉴스 전체 보기 →</a></div>\n  </section>\n')

def news_index():
    e = html.escape
    tags = [t for t in NEWS_TAG if any(x['tag'] == t for x in NEWS['items'])]
    chips = '<button type="button" class="chip on" data-ntag="">전체</button>' + ''.join(f'<button type="button" class="chip" data-ntag="{e(t)}">{NEWS_TAG[t][0]} {e(t)}</button>' for t in tags)
    body = f"""<section class="view" data-view="news">
  <nav class="crumb" aria-label="현재 위치"><a href="#home">{e(brand())}</a> › <span>마라톤 뉴스</span></nav>
  <div class="view-head">
    <h1>마라톤 뉴스<br><small>러너가 알아야 할 소식</small></h1>
    <p>{e(NEWS['intro'])}</p>
  </div>
  <div class="nsearch" role="search">
    <h2>뉴스 목록 <small>{e(NEWS.get('updated', NEWS['items'][0]['date']).replace('-', '.'))} 업데이트</small></h2>
    <input type="search" id="news-q" placeholder="뉴스 검색" aria-label="뉴스 검색" autocomplete="off">
  </div>
  <p class="hub-links ntags" role="group" aria-label="분류">{chips}</p>
  <div id="news-list">{news_list(NEWS['items'])}</div>
  <p class="note" id="news-empty" hidden>찾는 뉴스가 없습니다. 다른 낱말로 찾아보세요.</p>
  <p class="note">'요약'은 기사 내용을 {e(brand())}가 새로 요약한 것입니다. 정확한 내용과 사진은 원문에서 확인하세요.</p>
  <aside class="ad" data-ad="news-0">광고 자리 · 애드센스 승인 뒤 표시</aside>
</section>
"""
    title = '마라톤 뉴스: 러너가 알아야 할 대회·기록·안전 소식'
    desc = '러너가 알아야 할 마라톤 대회, 기록, 안전, 정책 소식을 런지수가 골라 요약하고 원문 링크를 답니다. 뉴스 검색과 분류별 보기를 지원합니다.'
    lds = []
    if cfg['siteUrl']:
        lds.append({'@context': 'https://schema.org', '@type': 'ItemList', 'name': '마라톤 뉴스', 'itemListElement': [
            {'@type': 'ListItem', 'position': n, 'name': x['title'],
             'url': (cfg['siteUrl'] + '/news/' + x['id'] + '/') if x['kind'] == 'brief' else x['url']} for n, x in enumerate(NEWS['items'], 1)]})
    return {'path': 'news', 'body': body, 'lds': lds, 'title': title, 'desc': desc}

def news_page(x):
    e = html.escape
    pts = ''.join(f'    <h2>{e(p["h"])}</h2>\n    <p>{e(p["p"])}</p>\n' for p in x['points'])
    take = ''.join(f'<p>{e(t)}</p>' for t in x['take'])
    links = ''.join(f'<a href="#{v}"><b>{e(t)}</b><i>→</i></a>' for v, t in x['links'])
    rel = ''.join(f'<li><a href="{e(u)}" target="_blank" rel="noopener">{e(t)} ↗</a></li>' for t, u in x.get('related', []))
    others = [y for y in NEWS['items'] if y['id'] != x['id']][:4]
    more = news_list(others) if others else ''
    src = x['source']
    body = f"""<section class="view" data-view="news">
  <nav class="crumb" aria-label="현재 위치"><a href="#home">{e(brand())}</a> › <a href="#news">마라톤 뉴스</a> › <span>{e(x["short"])}</span></nav>
  <article class="sci news">
    <div class="view-head">
      <p class="kicker">마라톤 뉴스 · {e(x["tag"])} · {e(kdate(x["date"]))} 정리</p>
      <h1>{e(x["title"])}</h1>
      <p class="lead">{e(x["dek"])}</p>
      <p class="news-src">출처: {e(src["name"])} <a class="btn ghost small" href="{e(src["url"])}" target="_blank" rel="noopener">{e(src["label"])} ↗</a></p>
    </div>
    <section class="panel prose sci-body" aria-label="핵심 내용">
{pts}    </section>
    <section class="panel warn" aria-labelledby="news-take-h">
      <h2 id="news-take-h">{e(brand())}가 덧붙이면</h2>
      {take}
    </section>
    <section class="panel" aria-labelledby="news-try-h">
      <h2 id="news-try-h">{e(brand())}에서 해 보기</h2>
      <nav class="sci-tools" aria-label="관련 도구와 글">{links}</nav>
    </section>
    <aside class="ad" data-ad="news-1">광고 자리 · 애드센스 승인 뒤 표시</aside>
    <section class="panel sci-refs" aria-labelledby="news-ref-h">
      <h2 id="news-ref-h">원문과 관련 보도</h2>
      <ol><li><a href="{e(src["url"])}" target="_blank" rel="noopener">{e(src["name"])} ↗</a></li>{rel}</ol>
      <p class="note">이 글은 원문의 내용을 {e(brand())}가 요약·정리한 것으로, 발언 내용은 출연자의 의견입니다. 정확한 내용은 원문에서 확인하세요. 일반적인 건강 정보이며 개인의 진단이나 치료를 대신하지 않습니다. 가슴 통증, 실신, 심한 어지럼이 있으면 바로 진료를 받으세요.</p>
    </section>
    {('<section class="panel" aria-labelledby="news-more-h"><h2 id="news-more-h">다른 마라톤 뉴스</h2>' + more + '</section>') if more else ''}
  </article>
</section>
"""
    path = 'news/' + x['id']
    lds = []
    if cfg['siteUrl']:
        url = cfg['siteUrl'] + '/' + path + '/'
        lds.append({'@context': 'https://schema.org', '@type': 'NewsArticle', 'headline': x['title'], 'description': x['dek'], 'inLanguage': 'ko',
                    'mainEntityOfPage': url, 'datePublished': x['date'], 'isBasedOn': src['url'],
                    'author': {'@type': 'Organization', 'name': brand(), 'url': cfg['siteUrl'] + '/'},
                    'publisher': {'@type': 'Organization', 'name': brand(), 'url': cfg['siteUrl'] + '/'}})
        lds.append({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': brand(), 'item': cfg['siteUrl'] + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': '마라톤 뉴스', 'item': cfg['siteUrl'] + '/news/'},
            {'@type': 'ListItem', 'position': 3, 'name': x['short'], 'item': url}]})
    return {'path': path, 'body': body, 'lds': lds, 'title': x['title'], 'desc': x['dek']}
SCI_FOR = {'home': 'training-intensities', 'goals': 'training-intensities', 'race': 'taper', 'plan': 'training-intensities',
           'spike': 'training-adaptation', 'heart': 'heart-rate', 'fitage': 'vo2max', 'injury': 'training-adaptation',
           'shoes': 'running-economy', 'pace': 'running-economy', 'calendar': 'heat-and-cold', 'crew': 'training-intensities'}

def sci_by_id(i):
    return next(a for a in SCIENCE['articles'] if a['id'] == i)

def sci_cta(vid):
    """도구 쪽에서 관련 과학 글로 가는 줄(한국어 사이트만)"""
    if vid not in SCI_FOR:
        return ''
    a = sci_by_id(SCI_FOR[vid])
    return f'  <div class="cta sci-cta"><span>왜 그럴까: {html.escape(a["short"])}</span><a href="#science/{a["id"]}">러닝 과학 읽기 →</a></div>\n'

def sci_home():
    if L() != 'ko':
        return ''
    cards = ''.join(f'<a href="#science/{a["id"]}"><b>{html.escape(a["title"].split(":")[0])}</b><span>{html.escape(a["desc"])}</span><i>읽기 →</i></a>'
                    for a in SCIENCE['articles'][:4])
    return (f'  <section class="panel" aria-labelledby="sci-h">\n    <h2 id="sci-h">러닝 과학</h2>\n'
            f'    <p class="note">계산기 숫자 뒤에 있는 몸의 원리를 정형외과 전문의의 눈으로 풀었습니다.</p>\n'
            f'    <nav class="next" aria-label="러닝 과학">{cards}</nav>\n'
            f'    <div class="cta"><span>VO2max부터 테이퍼링까지 8편</span><a href="#science">연재 전체 보기 →</a></div>\n  </section>\n')

def sci_index():
    e = html.escape
    cards = ''.join(f'<a href="{a["id"]}/"><b><small>{n:02d}</small> {e(a["title"])}</b><span>{e(a["desc"])}</span><i>읽기 →</i></a>'
                    for n, a in enumerate(SCIENCE['articles'], 1))
    body = f"""<section class="view" data-view="science">
  <nav class="crumb" aria-label="현재 위치"><a href="#home">{e(brand())}</a> › <span>러닝 과학</span></nav>
  <div class="view-head">
    <h1>러닝 과학<br><small>숫자 뒤에 있는 몸의 원리</small></h1>
    <p>{e(SCIENCE['intro'])}</p>
  </div>
  <nav class="next sci-list" aria-label="러닝 과학 글">{cards}</nav>
  <aside class="ad" data-ad="science-0">광고 자리 · 애드센스 승인 뒤 표시</aside>
  <p class="note">이 연재는 일반적인 건강 정보이며 개인의 진단이나 치료를 대신하지 않습니다.</p>
</section>
"""
    title = '러닝 과학: VO2max, 젖산 역치, 러닝 이코노미, 훈련 강도와 테이퍼링'
    desc = '잭 다니엘스의 훈련 원리를 생리학으로 풀고 정형외과 전문의의 부상 이야기를 덧붙인 8편 연재. VO2max, 젖산 역치, 러닝 이코노미, 훈련 강도, 적응과 회복, 심박수, 더위와 추위, 테이퍼링.'
    lds = []
    if cfg['siteUrl']:
        lds.append({'@context': 'https://schema.org', '@type': 'ItemList', 'name': '러닝 과학', 'itemListElement': [
            {'@type': 'ListItem', 'position': n, 'url': cfg['siteUrl'] + '/running-science/' + a['id'] + '/', 'name': a['title']} for n, a in enumerate(SCIENCE['articles'], 1)]})
    return {'path': 'running-science', 'body': body, 'lds': lds, 'title': title, 'desc': desc}

def sci_page(n, a):
    e = html.escape
    arts = SCIENCE['articles']
    secs = '\n'.join(f'    <h2>{e(x["h"])}</h2>\n' + ''.join(f'    <p>{e(p)}</p>\n' for p in x['p']) for x in a['sections'])
    tools = ''.join(f'<a href="#{v}"><b>{e(t)}</b><i>→</i></a>' for v, t in a['tools'])
    refs = ''.join(f'<li>{e(r)}</li>' for r in a['refs'])
    near = [arts[(n - 2) % len(arts)], arts[n % len(arts)]]
    nav = ''.join(f'<a href="../{x["id"]}/"><b>{e(x["title"])}</b><span>{e(x["desc"])}</span><i>{lab} →</i></a>' for x, lab in zip(near, ('이전 글', '다음 글')))
    body = f"""<section class="view" data-view="science">
  <nav class="crumb" aria-label="현재 위치"><a href="#home">{e(brand())}</a> › <a href="#science">러닝 과학</a> › <span>{e(a["short"])}</span></nav>
  <article class="sci">
    <div class="view-head">
      <p class="kicker">러닝 과학 {n:02d} / {len(arts):02d}</p>
      <h1>{e(a["title"])}</h1>
      <p class="lead">{e(a["lead"])}</p>
    </div>
    <section class="panel prose sci-body">
{secs}    </section>
    <section class="panel warn" aria-labelledby="sci-ortho-h">
      <h2 id="sci-ortho-h">정형외과 전문의의 한마디</h2>
      <p>{e(a["ortho"])}</p>
    </section>
    <section class="panel" aria-labelledby="sci-try-h">
      <h2 id="sci-try-h">{e(brand())}에서 해 보기</h2>
      <nav class="sci-tools" aria-label="관련 도구">{tools}</nav>
    </section>
    <aside class="ad" data-ad="science-1">광고 자리 · 애드센스 승인 뒤 표시</aside>
    <section class="panel sci-refs" aria-labelledby="sci-ref-h">
      <h2 id="sci-ref-h">참고 문헌</h2>
      <ol>{refs}</ol>
      <p class="note">이 글은 『Daniels' Running Formula』를 비롯한 위 자료의 개념을 바탕으로 {e(brand())}가 새로 쓴 글이며, 책의 문장과 표를 옮기지 않았습니다. 일반적인 건강 정보로, 개인의 진단과 치료를 대신하지 않습니다.</p>
    </section>
    <nav class="next" aria-label="다른 글">{nav}</nav>
  </article>
</section>
"""
    path = 'running-science/' + a['id']
    lds = []
    if cfg['siteUrl']:
        url = cfg['siteUrl'] + '/' + path + '/'
        lds.append({'@context': 'https://schema.org', '@type': 'Article', 'headline': a['title'], 'description': a['desc'], 'inLanguage': 'ko',
                    'mainEntityOfPage': url, 'author': {'@type': 'Organization', 'name': brand(), 'url': cfg['siteUrl'] + '/'},
                    'publisher': {'@type': 'Organization', 'name': brand(), 'url': cfg['siteUrl'] + '/'}, 'datePublished': '2026-11-23',
                    'citation': a['refs']})
        lds.append({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': brand(), 'item': cfg['siteUrl'] + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': '러닝 과학', 'item': cfg['siteUrl'] + '/running-science/'},
            {'@type': 'ListItem', 'position': 3, 'name': a['short'], 'item': url}]})
    return {'path': path, 'body': body, 'lds': lds, 'title': a['title'], 'desc': a['desc']}

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
  <aside class="ad" data-ad="injurypage-1">광고 자리 · 애드센스 승인 뒤 표시</aside>
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

RACE_GOALS = {42195: [180, 210, 240, 270, 300], 21097.5: [90, 105, 120, 135, 150]}
RACE_MARKS = {42195: [5, 10, 15, 20, 21.0975, 25, 30, 35, 40, 42.195], 21097.5: [5, 10, 15, 20, 21.0975]}

def race_name(r):
    return r['name'] if L() == 'ko' else r.get(L(), r['name'])

EVENT_SIZES = (('16x9', 1200, 675), ('4x3', 1200, 900), ('1x1', 1200, 1200))

def event_svg(r, w, h):
    e = html.escape
    name = r['name']; fs = max(60, min(120, int(1000 / max(len(name), 1))))
    when = (kdate(r['date']) if r.get('date') else f"2027년 일정 미발표 · {r['season']}")
    top = max(110, int((h - 110 - (fs + 250)) / 2) + 34)     # 세로로 가운데쯤
    y = lambda v: top + v - 120
    place = r['place'] if len(r['place']) <= 34 else r['place'][:33] + '…'
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f1b3d"/><stop offset="1" stop-color="#1f47e6"/></linearGradient></defs>
  <rect width="{w}" height="{h}" fill="url(#g)"/>
  <text x="80" y="{y(120)}" font-family="Noto Sans CJK KR" font-weight="700" font-size="34" fill="#9fb4ff">{e(r['date'][:4] if r.get('date') else '2027')} 대회 안내</text>
  <text x="76" y="{y(120) + fs + 30}" font-family="Noto Sans CJK KR" font-weight="900" font-size="{fs}" fill="#ffffff">{e(name)}</text>
  <text x="80" y="{y(120) + fs + 110}" font-family="Noto Sans CJK KR" font-weight="700" font-size="48" fill="#ffffff">{e(when)}</text>
  <text x="80" y="{y(120) + fs + 175}" font-family="Noto Sans CJK KR" font-weight="500" font-size="34" fill="#d6defa">{e(r['events'])}</text>
  <text x="80" y="{y(120) + fs + 228}" font-family="Noto Sans CJK KR" font-weight="500" font-size="30" fill="#b8c6f5">{e(place)}</text>
  <rect x="0" y="{h - 110}" width="{w}" height="110" fill="#0b1430" fill-opacity="0.55"/>
  <text x="80" y="{h - 45}" font-family="Noto Sans CJK KR" font-weight="700" font-size="32" fill="#ffffff">코스 · 부상 주의점 · 목표 기록별 5km 페이스표</text>
  <text x="{w - 80}" y="{h - 45}" text-anchor="end" font-family="DejaVu Sans Condensed" font-weight="700" font-size="30" fill="#9fb4ff">runjisu.com</text>
</svg>"""

def event_images(site_dir):
    """주요 대회마다 이미지 세 장. rsvg-convert 가 없으면 건너뛴다"""
    for r in RACE_DATA['races']:
        d = os.path.join(site_dir, 'marathon-schedule', r['id']); os.makedirs(d, exist_ok=True)
        for tag, w, h in EVENT_SIZES:
            svg = os.path.join(OUT, f'ev-{r["id"]}-{tag}.svg')
            write(svg, event_svg(r, w, h))
            try:
                subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h), svg, '-o', os.path.join(d, f'event-{tag}.png')], check=True)
            except (OSError, subprocess.CalledProcessError) as err:
                print('  대회 이미지를 만들지 못했습니다:', err, file=sys.stderr); os.remove(svg); return
            os.remove(svg)

def race_page(r, others):
    e = html.escape
    dist = r['dist']; full = dist > 30000; total = dist / 1000
    name = race_name(r)
    year = r['date'][:4] if r.get('date') else '2027'
    when = kdate(r['date']) if r.get('date') else T(r['season']) + ' · ' + T('2027년 날짜 미발표') + (' · ' + T('2026년은 {date}', date=kdate(r['last'], False)) if r.get('last') else '')
    sub = f'<p class="race-ko" lang="ko">{e(r["name"])}</p>' if L() != 'ko' else ''
    goals = RACE_GOALS[dist]
    head = ''.join(f'<th scope="col"><a href="#race?rd={dist:g}&goal={g * 60}">{f_time(g * 60)}</a></th>' for g in goals)
    rows = []
    for k in RACE_MARKS[dist]:
        last = abs(k - total) < 0.01
        label = T('완주') if last else (T('하프') if abs(k - 21.0975) < 0.01 else f'{k:g}km')
        rows.append(f'          <tr><th scope="row">{e(label)}</th>' + ''.join(f'<td>{f_time(g * 60 * k / total)}</td>' for g in goals) + '</tr>')
    course = r.get('course')
    if course:
        course_html = '\n'.join(f'        <li>{e(T(t))}</li>' for t in course)
        course_html = f'      <ul class="prose">\n{course_html}\n      </ul>\n      <p class="note">{e(T("코스 설명은 대회 공지와 언론 보도, 공개된 코스 분석을 바탕으로 정리했습니다. 코스는 해마다 바뀔 수 있으니 공식 사이트의 코스도와 고도표를 확인하세요."))}</p>'
    else:
        course_html = f'      <p>{e(T(r["place"]))}</p>\n      <p class="note">{e(T("이 대회의 코스 고도 자료는 아직 정리하지 못했습니다. 공식 사이트의 코스 안내를 확인하세요."))}</p>'
    care = [T(t) for t in r.get('care', [])] + [T(t) for t in CARE['full' if full else 'half']]
    care_html = '\n'.join(f'        <li>{e(t)}</li>' for t in care)
    pg = 'full' if full else 'half'
    near = ''.join(f'<a href="../{o["id"]}/"><b{" lang=ko" if L() == "ko" else ""}>{e(race_name(o))}</b><span>{e(kdate(o["date"]) if o.get("date") else T(o["season"]))}</span><i>{e(T("대회 안내"))} →</i></a>' for o in others)
    goal_btn = f'<button type="button" class="btn ghost" data-goal>{e(T("목표 대회로 정하기"))}</button>' if r.get('date') else ''
    attrs = f' data-id="{e(r["id"])}" data-name="{e(r["name"])}" data-dist="{dist}"' + (f' data-date="{r["date"]}"' if r.get('date') else '')
    body = f"""<section class="view" data-view="race-page">
  <nav class="crumb" aria-label="{e(T('현재 위치'))}"><a href="#home">{e(brand())}</a> › <a href="#calendar">{e(T('대회 일정'))}</a> › <span>{e(name)}</span></nav>
  <div class="view-head">
    <h1>{e(name)} {year}</h1>
    {sub}
    <p class="race-when"><b>{e(when)}</b> · {e(T(r["events"]))}</p>
    <p>{e(T(r["place"]))}</p>
  </div>
  <section class="panel race-facts" aria-labelledby="rp-reg">
    <div class="races"><div class="race"{attrs}>
      <div class="race-date"><h2 id="rp-reg">{e(T('접수'))}</h2><span class="pill" data-dday hidden></span></div>
      <p>{e(T(r["reg"]))}</p>
      <div class="acts"><a class="btn" href="{e(r["url"])}" target="_blank" rel="noopener">{e(T(r["link"]))} ↗</a>{ics_button(r, False)}{goal_btn}</div>
    </div></div>
    {'<p class="basis" id="goal-box"></p>' if r.get('date') else ''}
  </section>
  <div class="two">
    <section class="panel" aria-labelledby="rp-course">
      <h2 id="rp-course">{e(T('코스'))}</h2>
{course_html}
    </section>
    <section class="panel warn" aria-labelledby="rp-care">
      <h2 id="rp-care">{e(T('정형외과 전문의의 부상 주의점'))}</h2>
      <ul class="prose">
{care_html}
      </ul>
      <div class="cta"><span>{e(T('이번 장거리, 얼마까지 늘려도 될까'))}</span><a href="#spike">{e(T('거리 급증 체크'))} →</a></div>
    </section>
  </div>
  <section class="panel" aria-labelledby="rp-split">
    <h2 id="rp-split">{e(T('목표 기록별 5km 통과 시각'))}</h2>
    <p class="note">{e(T('고르게 달렸을 때의 통과 시각입니다. 목표 기록을 누르면 그 목표로 구간표를 만들어 드립니다.'))}</p>
    <div class="tbl-wrap">
      <table class="goal-table race-split">
        <thead><tr><th scope="col">{e(T('지점'))}</th>{head}</tr></thead>
        <tbody>
{chr(10).join(rows)}
        </tbody>
      </table>
    </div>
    <div class="cta"><span>{e(T('이 대회를 준비하는 한 주 훈련표'))}</span><a href="#plan?pg={pg}">{e(T('주간 훈련표 만들기'))} →</a></div>
  </section>
  {picks_html('racepage', 'rp-kit') or f'''<section class="panel" aria-labelledby="rp-kit">
    <h2 id="rp-kit">{e(T('대회 날 챙길 것'))}</h2>
    <p class="note">{e(T('대회 날 처음 쓰는 물건은 없어야 합니다. 신발과 벨트는 장거리 훈련에서 한 번 이상 써 보세요.'))}</p>
    <p class="shop-row">{shop_link('race')}{shop_link('racing')}<a class="btn ghost small" href="#gear">{e(T('유형별로 고르는 법'))} →</a></p>
    {('<p class="note">' + e(T('이 사이트는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.')) + '</p>') if cfg['partnerLinks'] else ''}
  </section>'''}
  <aside class="ad" data-ad="racepage-1">광고 자리 · 애드센스 승인 뒤 표시</aside>
  <nav class="next three" aria-label="{e(T('다른 주요 대회'))}">
    {near}
  </nav>
</section>
"""
    path = 'marathon-schedule/' + r['id']
    lds = []
    if r.get('date'):
        imgs = [f"{cfg['siteUrl']}/marathon-schedule/{r['id']}/event-{tag}.png" for tag, _w, _h in EVENT_SIZES] if cfg['siteUrl'] else []
        official = 'search.naver.com' not in r['url']
        hosts = [x.strip() for x in r['host'].replace('·', ',').split(',') if x.strip()]
        ev = {'@context': 'https://schema.org', '@type': 'SportsEvent', 'name': name,
              'description': T('{name} {year}: {events}. {place}. 접수: {reg}', name=name, year=year, events=T(r['events']), place=T(r['place']), reg=T(r['reg'])),
              'startDate': r['date'], 'endDate': r['date'], 'eventStatus': 'https://schema.org/EventScheduled',
              'eventAttendanceMode': 'https://schema.org/OfflineEventAttendanceMode', 'sport': 'Marathon',
              'location': {'@type': 'Place', 'name': T(r['place']), 'address': {'@type': 'PostalAddress', 'addressRegion': r['place'].split()[0], 'addressCountry': 'KR'}},
              'organizer': [dict({'@type': 'Organization', 'name': hname}, **({'url': r['url']} if official and i == 0 else {})) for i, hname in enumerate(hosts)],
              'performer': {'@type': 'PerformingGroup', 'name': T('{name} 참가 러너', name=name)},
              'offers': {'@type': 'Offer', 'url': r['url'], 'priceCurrency': 'KRW'},
              'url': r['url']}
        if imgs: ev['image'] = imgs
        lds.append(ev)
    if cfg['siteUrl']:
        base = cfg['siteUrl'] + '/' + META[L()]['prefix'].lstrip('/')
        lds.append({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': brand(), 'item': base},
            {'@type': 'ListItem', 'position': 2, 'name': T('대회 일정'), 'item': base + 'marathon-schedule/'},
            {'@type': 'ListItem', 'position': 3, 'name': name, 'item': base + path + '/'}]})
    title = T('{name} {year}: 코스, 부상 주의점, 목표 기록별 5km 페이스표', name=name, year=year)
    desc = T('{name} {year} 일정과 접수, 코스 특징, 정형외과 전문의가 짚은 부상 주의점, 목표 기록별 5km 통과 시각을 정리했습니다.', name=name, year=year)
    og = f"{cfg['siteUrl']}/marathon-schedule/{r['id']}/event-16x9.png" if cfg['siteUrl'] else None
    return {'path': path, 'body': body, 'lds': lds, 'title': title, 'desc': desc, 'og': og}

def race_next():
    e = html.escape
    fixed = [{'date': r['date'], 'name': r['name'], 'events': T(r['events']), 'place': T(r['place'])} for r in RACE_DATA['races'] if r.get('date')]
    fixed += [{'date': r['d'], 'name': r['n'], 'events': ' · '.join(T(EV_LABEL[f]) for f in r['f']) or ev_txt(r['ev']), 'place': T(r['rg'])}
              for r in RACE_LIST['races'] if r['k'] == 'up' and set(r['f']) & {'full', 'half', '10k'}]
    fixed = sorted((r for r in fixed if r['date'] >= TODAY), key=lambda r: r['date'])[:40]
    return '\n'.join(f'      <li data-date="{r["date"]}"><span class="dday" data-dday></span><div><b lang="ko">{e(r["name"])}</b><span>{kdate(r["date"])} · {e(r["events"])} · {e(r["place"])}</span></div></li>' for r in fixed)

def hub_html(flags):
    return render(i18n.tr_html(read(SRC, 'views', '_hub.html'), L()), flags).rstrip()

RAW_KEYS = ('news_home', 'sci_home', 'sci_hub', 'home_hubs', 'rl_hubs', 'rl_up', 'rl_last', 'rl_regions', 'tabbar', 'langs', 'head_extra', 'styles', 'nav', 'views', 'scripts', 'race_fixed', 'race_tba', 'race_reg_rows', 'goal_tables', 'hub', 'race_next', 'terms_html', 'injury_cards')

def page_vars():
    b = brand()
    return {'brand': b, 'brandLatin': cfg['brandLatin'], 'contactEmail': cfg['contactEmail'], 'privacyDate': cfg['privacyDate'], 'termsDate': kdate(cfg['termsDate']),
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
    if vid == 'calendar': extra = race_blocks(flags.get('site'))
    elif vid == 'goals': extra = {'goal_tables': goal_tables(flags.get('site'))}
    elif vid == 'home': extra = {'hub': hub_html(flags), 'race_next': race_next(), 'home_hubs': home_hubs() if flags.get('site') else '', 'sci_home': sci_home() if flags.get('site') else '', 'news_home': news_home() if flags.get('site') else ''}
    elif vid == 'tools': extra = {'hub': hub_html(flags), 'sci_hub': sci_home() if flags.get('site') else ''}
    elif vid == 'terms': extra = {'terms_html': terms_html()}
    elif vid == 'injury': extra = {'injury_cards': injury_cards(flags.get('site'))}
    out = render(i18n.tr_html(read(SRC, 'views', vid + '.html'), L()), flags, extra).rstrip() + '\n'
    if vid in PICK_SETS and flags.get('site') and L() == 'ko':
        pk = picks_html(vid)
        if vid in PICK_AT and PICK_AT[vid] in out:
            out = out.replace(PICK_AT[vid], pk + PICK_AT[vid], 1)
        elif out.endswith('</section>\n'):
            out = out[:-len('</section>\n')] + pk + '</section>\n'
    return out

# 메뉴에는 자주 쓰는 화면만 두고, 나머지는 '전체 도구'에 모은다
PRIMARY = ['home', 'goals', 'calendar', 'plan', 'injury', 'terms', 'tools']
TABS = [('home', '홈', '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z"/>'),
        ('calendar', '대회', '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
        ('goals', '페이스', '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.8h5M18.5 6.5l1.5-1.5"/>'),
        ('injury', '부상', '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>'),
        ('tools', '전체', '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>')]
NEWS_ICON = '<rect x="3.5" y="4.5" width="13" height="15.5" rx="2"/><path d="M16.5 8.5h2.5a1.5 1.5 0 0 1 1.5 1.5v8a2 2 0 0 1-2 2H6M7 8.5h6M7 12h6M7 15.5h4"/>'
def tabbar_html(current=None):
    ids = [t[0] for t in TABS]
    others = [v[0] for v in VIEWS if v[2] and v[0] not in ids]
    cur = current if current in ids else 'tools' if current in others else None
    rows = []
    tabs = list(TABS)
    if L() == 'ko' and CUR.get('site'):
        tabs.insert(2, ('news', '뉴스', NEWS_ICON)); ids.append('news')
        if current == 'news': cur = 'news'
    for vid, label, icon in tabs:
        also = f' data-also="{" ".join(others)}"' if vid == 'tools' else ''
        on = ' aria-current="page"' if vid == cur else ''
        rows.append(f'    <a href="#{vid}" data-nav="{vid}"{also}{on}><svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg><span>{html.escape(label if vid == "news" else T(label))}</span></a>')
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
        if vid == 'calendar' and L() == 'ko' and CUR.get('site'):
            on = ' aria-current="page"' if current == 'news' else ''
            rows.append(f'      <a href="#news" data-nav="news"{on}>마라톤 뉴스</a>')
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
        keys += [('races', t) for k in ('course', 'care') for t in r.get(k, [])]
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
    CUR['lang'] = 'ko'; CUR['site'] = False
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
    fit = cfg.get('adfit') or {}
    if not (cfg['adsenseClient'] and slot):
        if fit.get('mobile') or fit.get('desktop'):     # 카카오 애드핏: 화면 폭에 맞는 단위는 app.js 가 고른다
            return f'<div class="ad-live ad-fit" data-m="{html.escape(fit.get("mobile", ""))}" data-d="{html.escape(fit.get("desktop", ""))}"></div>\n'
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
        CUR['lang'] = lang; CUR['site'] = True
        scripts[lang] = (i18n.tr_js(core_js, lang), i18n.tr_js(app_js, lang))
    ver = digest(css, *[a + b for a, b in scripts.values()], json.dumps(cfg, sort_keys=True))
    write(os.path.join(site_dir, 'assets', 'site.css'), css)
    for lang, (cj, aj) in scripts.items():
        sfx = '' if lang == 'ko' else '.' + lang
        write(os.path.join(site_dir, 'assets', f'core{sfx}.js'), cj)
        write(os.path.join(site_dir, 'assets', f'app{sfx}.js'), aj)

    pages, meta = [], {}
    leftovers = {}
    def emit(lang, vid, path, title, desc, body=None, lds=(), nav=None, ko_only=False, og=None):
        full = full_path(lang, path)
        root = '../' * (full.count('/') + 1) if full else ''
        lroot = root + META[lang]['prefix']
        paths = {v[0]: (lroot + v[1] + '/' if v[1] else (lroot or './')) for v in VIEWS}
        if body is None:
            body = view_html(vid, flags).replace(f'data-view="{vid}" hidden', f'data-view="{vid}"')
            if lang == 'ko' and vid in SCI_FOR:
                if '<aside class="ad"' in body:
                    body = body.replace('<aside class="ad"', sci_cta(vid) + '  <aside class="ad"', 1)
                else:
                    k = body.rfind('</section>'); body = body[:k] + sci_cta(vid) + body[k:]
        if lang == 'ko':
            sroot = lroot + 'running-science/'
            body = re.sub(r'href="#science(?:/([\w-]+))?"', lambda m: f'href="{sroot}{m.group(1) + "/" if m.group(1) else ""}"', body)
            nroot = lroot + 'news/'
            body = re.sub(r'href="#news(?:/([\w-]+))?"', lambda m: f'href="{nroot}{m.group(1) + "/" if m.group(1) else ""}"', body)
        body = re.sub(r'<aside class="ad" data-ad="([\w-]+)">.*?</aside>\n?', ad_block, body, flags=re.S)
        full_title = title if vid == 'home' else f'{title} | {brand()}'
        sfx = '' if lang == 'ko' else '.' + lang
        head = []
        if cfg['siteUrl']:
            url = page_url(full)
            head += [f'<link rel="canonical" href="{url}">', f'<meta property="og:url" content="{url}">',
                     f'<meta property="og:image" content="{og or (cfg["siteUrl"] + "/og.png")}">', '<meta name="twitter:card" content="summary_large_image">']
            head += [f'<link rel="alternate" hreflang="{lx}" href="{page_url(full_path(lx, path))}">' for lx in (('ko',) if ko_only else LANGS)]
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
        if lang == 'ko':
            head.append(f'<link rel="alternate" type="application/rss+xml" title="{html.escape(BRAND)}" href="{root}feed.xml">')
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
        elif vid in ('race', 'plan', 'log', 'spike', 'shoes', 'heart', 'pace', 'fitage', 'crew'):
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
        lpath = lambda lx: full_path(lx, ('tools' if vid in ('science', 'news') else 'marathon-schedule') if ko_only and lx != 'ko' else path)
        langs = ''.join(
            f'<a href="{(root + lpath(lx) + "/") if lpath(lx) else (root or "./")}" hreflang="{lx}" lang="{lx}"'
            f'{" aria-current=" + chr(34) + "true" + chr(34) if lx == lang else ""} title="{META[lx]["label"]}">{META[lx]["short"]}</a>' for lx in LANGS)
        site = {'mode': 'site', 'lang': lang, 'brand': brand(), 'siteUrl': cfg['siteUrl'], 'partnerLinks': cfg['partnerLinks'], 'paths': paths, 'pwa': True, 'sw': root + 'sw.js'}
        page = render(i18n.tr_html(shell, lang), flags, {
            'title': full_title, 'description': desc, 'head_extra': '\n'.join(head),
            'styles': f'<link rel="stylesheet" href="{root}assets/site.css?v={ver}">',
            'nav': nav_html(nav or vid), 'tabbar': tabbar_html(nav or vid), 'langs': langs, 'views': body,
            'scripts': f'<script>window.SITE={site_json(site)};</script>\n<script src="{root}assets/core{sfx}.js?v={ver}" defer></script>\n<script src="{root}assets/app{sfx}.js?v={ver}" defer></script>',
        })
        page = re.sub(r'href="#(' + '|'.join(IDS) + r')(\?[^"#]*)?"', lambda m: f'href="{paths[m.group(1)]}{(m.group(2) or "").replace("&", "&amp;")}"', page)
        if lang == 'ko': page = page.replace('href="#news"', f'href="{lroot}news/"')
        if lang != 'ko':
            left = [s for s in i18n.leftover(page) if i18n.HANGUL.search(s)]
            if left:
                leftovers.setdefault(lang, {}).update({s: full for s in left})
        write(os.path.join(site_dir, full, 'index.html'), page)
        pages.append(full)
        stable = re.sub(r'\?v=[0-9a-f]+', '', page)
        meta[full] = {'h': hashlib.sha1(stable.encode('utf-8')).hexdigest()[:16], 'title': full_title, 'desc': desc, 'lang': lang}

    for lang in LANGS:
        CUR['lang'] = lang
        for vid, path, _label, title, desc in VIEWS:
            emit(lang, vid, path, T(title), T(desc), lds=view_lds(vid))
        for dist in GOAL_DISTS:                      # 목표별 쪽: 같은 거리 안에서 앞뒤 목표를 잇는다
            group = [g for g in goals() if g['dist'] == dist]
            for i, g in enumerate(group):
                gp = goal_page(g, group[i + 1] if i + 1 < len(group) else None, group[i - 1] if i else None)
                emit(lang, 'goal', gp['path'], gp['title'], gp['desc'], body=gp['body'], lds=gp['lds'], nav='goals')
        majors = sorted(RACE_DATA['races'], key=lambda r: r.get('date') or ('9' + (r.get('last') or '')))
        if lang == 'ko':                             # 마라톤 뉴스(한국어만)
            npg = news_index()
            emit(lang, 'news', npg['path'], npg['title'], npg['desc'], body=npg['body'], lds=npg['lds'], nav='news', ko_only=True)
            for x in (y for y in NEWS['items'] if y['kind'] == 'brief'):
                npg = news_page(x)
                emit(lang, 'news', npg['path'], npg['title'], npg['desc'], body=npg['body'], lds=npg['lds'], nav='news', ko_only=True)
        if lang == 'ko':                             # 러닝 과학 연재(한국어만)
            sp = sci_index()
            emit(lang, 'science', sp['path'], sp['title'], sp['desc'], body=sp['body'], lds=sp['lds'], nav='tools', ko_only=True)
            for n, a in enumerate(SCIENCE['articles'], 1):
                sp = sci_page(n, a)
                emit(lang, 'science', sp['path'], sp['title'], sp['desc'], body=sp['body'], lds=sp['lds'], nav='tools', ko_only=True)
        if lang == 'ko':                             # 지역별·종목별 대회 쪽(한국어만)
            for g in hub_regions():
                hp = list_page('region', g)
                emit(lang, 'race-hub', hp['path'], hp['title'], hp['desc'], body=hp['body'], lds=hp['lds'], nav='calendar', ko_only=True)
            for k, *_x in DIST_HUB:
                hp = list_page('distance', k)
                emit(lang, 'race-hub', hp['path'], hp['title'], hp['desc'], body=hp['body'], lds=hp['lds'], nav='calendar', ko_only=True)
        for i, r in enumerate(majors):               # 주요 대회별 쪽
            rp = race_page(r, [majors[(i + k) % len(majors)] for k in (1, 2, 3)])
            emit(lang, 'race-page', rp['path'], rp['title'], rp['desc'], body=rp['body'], lds=rp['lds'], nav='calendar', og=rp['og'])
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
            'shortcuts': [{'name': T(v[2]), 'url': META[lang]['prefix'] + v[1] + '/'} for v in VIEWS if v[0] in ('race', 'plan', 'calendar', 'log')],
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
    CUR['lang'] = 'ko'
    event_images(site_dir)

    # 검색 엔진과 호스팅
    robots = 'User-agent: *\nAllow: /\n'
    if cfg['siteUrl']:
        robots += f'Sitemap: {cfg["siteUrl"]}/sitemap.xml\n'
        # 내용이 바뀐 날만 새 날짜로(src/data/lastmod.json 에 지문과 날짜를 남긴다)
        lm_path = os.path.join(ROOT, 'src', 'data', 'lastmod.json')
        try: old = json.load(open(lm_path, encoding='utf-8'))
        except (OSError, ValueError): old = {}
        today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()
        lm = {p: ({'h': meta[p]['h'], 'd': old[p]['d']} if p in old and old[p].get('h') == meta[p]['h'] else {'h': meta[p]['h'], 'd': today}) for p in pages}
        with open(lm_path, 'w', encoding='utf-8') as f:
            json.dump(lm, f, ensure_ascii=False, indent=0, sort_keys=True); f.write('\n')
        urls = ''.join(f'  <url><loc>{page_url(p)}</loc><lastmod>{lm[p]["d"]}</lastmod></url>\n' for p in pages)
        # 네이버 서치어드바이저에 내는 RSS: 한국어 쪽, 최근 바뀐 순
        ko = sorted((p for p in pages if meta[p]['lang'] == 'ko'), key=lambda p: (lm[p]['d'], p), reverse=True)[:80]
        def rfc(d):
            return datetime.datetime.strptime(d, '%Y-%m-%d').strftime('%a, %d %b %Y 09:00:00 +0900')
        items = ''.join(f'  <item><title>{html.escape(meta[p]["title"])}</title><link>{page_url(p)}</link><guid>{page_url(p)}</guid>'
                        f'<description>{html.escape(meta[p]["desc"])}</description><pubDate>{rfc(lm[p]["d"])}</pubDate></item>\n' for p in ko)
        write(os.path.join(site_dir, 'feed.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n'
              f'  <title>{html.escape(BRAND)}</title><link>{cfg["siteUrl"]}/</link><description>{html.escape(BRAND)} 러닝 계산기와 마라톤 대회 일정, 부상 안내</description><language>ko</language>\n'
              + items + '</channel></rss>\n')
        if cfg.get('indexNowKey'):              # IndexNow(네이버·빙) 소유 확인 파일
            write(os.path.join(site_dir, cfg['indexNowKey'] + '.txt'), cfg['indexNowKey'])
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
