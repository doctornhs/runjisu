#!/usr/bin/env python3
"""한 벌의 소스(src/)에서 두 가지를 만든다.
  docs/                    도구마다 주소가 따로 있는 배포용 사이트(PWA, sitemap 포함). GitHub Pages가 이 폴더를 내보낸다
  out/artifact/index.html  한 장짜리 미리보기(화면을 # 주소로 전환). 저장소에는 올리지 않는다
설정은 site.config.json 한 곳에서 바꾼다.  실행: python3 build.py
"""
import datetime, hashlib, html, json, os, re, shutil, subprocess, sys
from urllib.parse import urlparse

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

# 화면 목록: id, 주소, 메뉴 이름(없으면 메뉴에 안 나옴), 제목, 설명
VIEWS = [
    ('home', '', BRAND, f'{BRAND} 러닝 계산기: 기록 하나로 훈련 페이스와 예상 기록',
     f'5K, 10K, 하프, 풀코스 기록 하나를 넣으면 {BRAND}와 E·M·T·I·R 훈련 페이스, 거리별 예상 기록을 계산합니다. 정형외과 전문의가 만든 무료 러닝 계산기.'),
    ('race', 'race-pace', '대회 계획', '마라톤 페이스 계산기: 목표 기록 구간표',
     '목표 기록을 넣으면 km당 페이스와 5km 구간별 통과 시각을 계산합니다. 후반 가속 전략과, 목표가 지금 실력에 맞는지도 함께 확인하세요.'),
    ('calendar', 'marathon-schedule', '대회 일정', '2026·2027 국내 마라톤 대회 일정: 서울·춘천·JTBC·대구 접수 시기와 공식 사이트',
     '서울마라톤, 춘천마라톤, JTBC 서울마라톤, 대구마라톤 등 국내 주요 마라톤 대회의 2026~2027년 날짜와 접수 시기, 공식 사이트 링크를 정리했습니다.'),
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
    ('gear', 'gear', '장비', '러닝 장비 고르는 법: 러닝화 유형과 폼롤러, 워치',
     '데일리 쿠션화, 안정화, 레이싱화는 어떤 러너에게 맞을까. 제품이 아니라 유형으로 고르는 러닝 장비 안내.'),
    ('about', 'about', '근거·FAQ', '계산 근거와 자주 묻는 질문',
     f'{BRAND}의 계산식과 참고한 연구, 자주 묻는 질문을 정리했습니다.'),
    ('privacy', 'privacy', None, '개인정보처리방침', f'{BRAND}가 저장하는 정보와 쿠키, 광고, 제휴 링크 안내.'),
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

# ───────── 대회 일정: src/data/races.json 을 화면으로 ─────────
RACE_DATA = json.loads(read(SRC, 'data', 'races.json'))
WD = '월화수목금토일'
def kdate(d, year=True):
    y, m, dd = map(int, d.split('-'))
    return (f'{y}년 ' if year else '') + f'{m}월 {dd}일({WD[datetime.date(y, m, dd).weekday()]})'

def race_card(r):
    e = html.escape
    if r.get('date'):
        head = f'<div class="race-date"><b>{kdate(r["date"])}</b><span class="pill" data-dday hidden></span></div>'
        attrs = f' data-date="{r["date"]}"'
    else:
        last = f' · 2026년은 {kdate(r["last"], False)}' if r.get('last') else ''
        head = f'<div class="race-date tba"><b>{e(r["season"])}</b><span>2027년 날짜 미발표{last}</span></div>'
        attrs = ''
    goal = '<button type="button" class="btn ghost small" data-goal>목표 대회로 정하기</button>' if r.get('date') else ''
    return (f'      <li class="race" data-id="{e(r["id"])}" data-name="{e(r["name"])}" data-dist="{r["dist"]}"{attrs}>\n'
            f'        {head}\n'
            f'        <h3>{e(r["name"])}</h3>\n'
            f'        <p class="race-meta">{e(r["events"])} · {e(r["place"])}</p>\n'
            f'        <p class="race-reg"><b>접수</b> {e(r["reg"])}</p>\n'
            f'        <div class="acts"><a class="out" href="{e(r["url"])}" target="_blank" rel="noopener">{e(r["link"])} ↗</a>{goal}</div>\n'
            f'      </li>')

def race_blocks():
    races = RACE_DATA['races']
    fixed = sorted([r for r in races if r.get('date')], key=lambda r: r['date'])
    tba = sorted([r for r in races if not r.get('date')], key=lambda r: r.get('sort') or r['last'][5:])
    order = ['12월', '1월', '4월', '4~6월', '5월', '7월', '10월']
    rows = []
    for m in order:
        names = [r['name'] + (' (추첨)' if r['id'] == 'jtbc' else ' (기록 제출 후 접수)' if r['id'] == 'seoul' else '') for r in races if r.get('regMonth') == m]
        if names:
            rows.append(f'            <tr><td>{m}</td><td>{html.escape(", ".join(names))}</td></tr>')
    return {'race_fixed': '\n'.join(race_card(r) for r in fixed), 'race_tba': '\n'.join(race_card(r) for r in tba),
            'race_reg_rows': '\n'.join(rows), 'racesChecked': kdate(RACE_DATA['checked'])}

RAW_KEYS = ('head_extra', 'styles', 'nav', 'views', 'scripts', 'race_fixed', 'race_tba', 'race_reg_rows')

def render(text, flags, extra=None):
    """<!--if:KEY-->…<!--endif:KEY--> 블록과 {{변수}}, {{brand:는}} 을 채운다."""
    def cond(m):
        return m.group(2) if flags.get(m.group(1)) else ''
    text = re.sub(r'<!--if:(\w+)-->\n?(.*?)<!--endif:\1-->\n?', cond, text, flags=re.S)
    text = re.sub(r'\{\{brand:(.)\}\}', lambda m: html.escape(josa(BRAND, m.group(1))), text)
    v = dict(VARS); v.update(extra or {})
    return re.sub(r'\{\{(\w+)\}\}', lambda m: v[m.group(1)] if m.group(1) in RAW_KEYS else html.escape(str(v[m.group(1)])), text)

def view_html(vid, flags):
    return render(read(SRC, 'views', vid + '.html'), flags, race_blocks() if vid == 'calendar' else None).rstrip() + '\n'

def nav_html(current=None):
    rows = []
    for vid, _path, label, *_ in VIEWS:
        if label is None:
            continue
        cur = ' aria-current="page"' if vid == current else ''
        rows.append(f'      <a href="#{vid}" data-nav="{vid}"{cur}>{html.escape(label)}</a>')
    return '\n'.join(rows)

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

# ───────── 1. 한 장짜리 미리보기 ─────────
def build_artifact():
    flags = dict(FLAGS, site=False, artifact=True)
    site = {'mode': 'artifact', 'brand': BRAND, 'siteUrl': cfg['siteUrl'], 'partnerLinks': cfg['partnerLinks'], 'paths': None, 'pwa': False}
    page = render(shell, flags, {
        'title': f'{BRAND} 러닝 계산기',
        'description': VIEWS[0][4],
        'head_extra': f'<link rel="icon" href="{FAVICON}">',
        'styles': '<style>\n' + css + '</style>',
        'nav': nav_html(),
        'views': '\n'.join(view_html(v, flags) for v in IDS),
        'scripts': f'<script>window.SITE={site_json(site)};</script>\n<script>\n{core_js}</script>\n<script>\n{app_js}</script>',
    })
    write(os.path.join(OUT, 'artifact', 'index.html'), page)
    return page

# ───────── 2. 배포용 사이트 ─────────
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

def build_site():
    site_dir = os.path.join(ROOT, 'docs')
    shutil.rmtree(site_dir, ignore_errors=True)
    flags = dict(FLAGS, site=True, artifact=False)
    ver = digest(css, core_js, app_js, json.dumps(cfg, sort_keys=True))
    write(os.path.join(site_dir, 'assets', 'site.css'), css)
    write(os.path.join(site_dir, 'assets', 'core.js'), core_js)
    write(os.path.join(site_dir, 'assets', 'app.js'), app_js)

    pages = []
    for vid, path, _label, title, desc in VIEWS:
        prefix = '../' if path else ''
        paths = {v[0]: (prefix + v[1] + '/' if v[1] else (prefix or './')) for v in VIEWS}
        body = view_html(vid, flags).replace(f'data-view="{vid}" hidden', f'data-view="{vid}"')
        body = re.sub(r'<aside class="ad" data-ad="([\w-]+)">.*?</aside>\n?', ad_block, body, flags=re.S)
        full_title = title if vid == 'home' else f'{title} | {BRAND}'
        head = []
        if cfg['siteUrl']:
            url = page_url(path)
            head += [f'<link rel="canonical" href="{url}">', f'<meta property="og:url" content="{url}">',
                     f'<meta property="og:image" content="{cfg["siteUrl"]}/og.png">', '<meta name="twitter:card" content="summary_large_image">']
        head += [
            f'<meta property="og:title" content="{html.escape(full_title)}">',
            f'<meta property="og:description" content="{html.escape(desc)}">',
            '<meta property="og:type" content="website">', f'<meta property="og:site_name" content="{html.escape(BRAND)}">',
            '<meta property="og:locale" content="ko_KR">',
            '<meta name="theme-color" content="#edf0f4" media="(prefers-color-scheme: light)">',
            '<meta name="theme-color" content="#0a111e" media="(prefers-color-scheme: dark)">',
            f'<link rel="manifest" href="{prefix}manifest.webmanifest">',
            f'<link rel="icon" href="{prefix}icons/favicon.svg" type="image/svg+xml">',
            f'<link rel="apple-touch-icon" href="{prefix}icons/apple-touch-icon.png">',
            '<meta name="apple-mobile-web-app-capable" content="yes">', f'<meta name="apple-mobile-web-app-title" content="{html.escape(BRAND)}">',
        ]
        if vid == 'home' and cfg['googleVerification']:
            head.append(f'<meta name="google-site-verification" content="{html.escape(cfg["googleVerification"])}">')
        if vid == 'home' and cfg['naverVerification']:
            head.append(f'<meta name="naver-site-verification" content="{html.escape(cfg["naverVerification"])}">')
        ld = None
        if vid == 'home':
            ld = {'@context': 'https://schema.org', '@type': 'WebSite', 'name': BRAND, 'description': desc, 'inLanguage': 'ko'}
        elif vid == 'about':
            ld = {'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
                {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq_items(body)]}
        elif vid not in ('privacy', 'gear', 'calendar'):
            ld = {'@context': 'https://schema.org', '@type': 'WebApplication', 'name': title, 'description': desc, 'inLanguage': 'ko',
                  'applicationCategory': 'HealthApplication', 'operatingSystem': 'All',
                  'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'KRW'}}
        if ld:
            if cfg['siteUrl']:
                ld['url'] = page_url(path)
            head.append('<script type="application/ld+json">' + site_json(ld) + '</script>')
        if cfg['ga4Id']:
            gid = html.escape(cfg['ga4Id'])
            head.append(f'<script async src="https://www.googletagmanager.com/gtag/js?id={gid}"></script>\n'
                        f"<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}gtag('js',new Date());gtag('config','{gid}');</script>")
        if cfg['adsenseClient']:
            head.append(f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={html.escape(cfg["adsenseClient"])}" crossorigin="anonymous"></script>')
        site = {'mode': 'site', 'brand': BRAND, 'siteUrl': cfg['siteUrl'], 'partnerLinks': cfg['partnerLinks'], 'paths': paths, 'pwa': True, 'sw': prefix + 'sw.js'}
        page = render(shell, flags, {
            'title': full_title, 'description': desc, 'head_extra': '\n'.join(head),
            'styles': f'<link rel="stylesheet" href="{prefix}assets/site.css?v={ver}">',
            'nav': nav_html(vid), 'views': body,
            'scripts': f'<script>window.SITE={site_json(site)};</script>\n<script src="{prefix}assets/core.js?v={ver}" defer></script>\n<script src="{prefix}assets/app.js?v={ver}" defer></script>',
        })
        page = re.sub(r'href="#(' + '|'.join(IDS) + r')"', lambda m: f'href="{paths[m.group(1)]}"', page)
        write(os.path.join(site_dir, path, 'index.html'), page)
        pages.append(path)

    # src/static/ 안의 파일은 그대로 사이트 맨 위에 복사한다(검색 엔진 소유 확인 파일 등)
    static = os.path.join(SRC, 'static')
    if os.path.isdir(static):
        for name in sorted(os.listdir(static)):
            shutil.copy(os.path.join(static, name), os.path.join(site_dir, name))

    # 설치형 웹앱
    manifest = {
        'name': f'{BRAND} 러닝 계산기', 'short_name': BRAND, 'description': VIEWS[0][4], 'lang': 'ko',
        'start_url': './', 'scope': './', 'display': 'standalone', 'background_color': '#edf0f4', 'theme_color': '#1f47e6',
        'icons': [
            {'src': 'icons/icon-192.png', 'sizes': '192x192', 'type': 'image/png'},
            {'src': 'icons/icon-512.png', 'sizes': '512x512', 'type': 'image/png'},
            {'src': 'icons/maskable-512.png', 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
        ],
        'shortcuts': [{'name': v[2], 'url': v[1] + '/'} for v in VIEWS if v[0] in ('log', 'plan', 'calendar')],
    }
    write(os.path.join(site_dir, 'manifest.webmanifest'), json.dumps(manifest, ensure_ascii=False, indent=2))
    precache = ['./'] + [p + '/' for p in pages if p] + [f'assets/site.css?v={ver}', f'assets/core.js?v={ver}', f'assets/app.js?v={ver}', 'manifest.webmanifest', 'icons/icon-192.png']
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
          f'<body><main><h1>코스를 벗어났습니다</h1><p>찾는 페이지가 없거나 주소가 바뀌었습니다.</p><p><a href="/">{html.escape(BRAND)} 첫 화면으로 →</a></p></main></body></html>\n')
    return pages, ver

if __name__ == '__main__':
    a = build_artifact()
    pages, ver = build_site()
    print(f'미리보기  out/artifact/index.html  {len(a.encode("utf-8")) / 1024:.0f} KB')
    print(f'사이트    docs/  {len(pages)}쪽  버전 {ver}' + ('' if cfg['siteUrl'] else '  (siteUrl 미설정: canonical·sitemap 생략)'))
