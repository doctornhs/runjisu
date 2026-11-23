#!/usr/bin/env python3
"""이번 푸시에서 sitemap.xml 의 수정일이 바뀐 주소를 IndexNow(네이버·빙 등)에 알린다.

GitHub Actions(.github/workflows/indexnow.yml)에서 돈다. 손으로 전부 보내려면: python3 tools/indexnow.py --all
"""
import json, os, re, subprocess, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = json.load(open(os.path.join(ROOT, 'site.config.json'), encoding='utf-8'))
key, site = cfg.get('indexNowKey'), (cfg.get('siteUrl') or '').rstrip('/')
if not key or not site:
    print('indexNowKey 또는 siteUrl 이 없어 건너뜁니다'); sys.exit(0)
local = open(os.path.join(ROOT, 'docs', 'sitemap.xml'), encoding='utf-8').read()

def changed():
    if '--all' in sys.argv:
        return re.findall(r'<loc>([^<]+)</loc>', local)
    try:
        diff = subprocess.run(['git', 'diff', 'HEAD~1', 'HEAD', '--', 'docs/sitemap.xml'], cwd=ROOT, capture_output=True, text=True, check=True).stdout
    except subprocess.CalledProcessError:
        return re.findall(r'<loc>([^<]+)</loc>', local)
    return re.findall(r'^\+\s*<url><loc>([^<]+)</loc>', diff, re.M)

urls = changed()
if not urls:
    print('바뀐 주소가 없습니다'); sys.exit(0)

def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Cache-Control': 'no-cache'}), timeout=15) as r:
            return r.read().decode('utf-8', 'replace')
    except Exception:
        return ''

# GitHub Pages 배포가 끝나 새 sitemap 과 키 파일이 보일 때까지 기다린다(최대 10분)
for _ in range(60):
    if get(f'{site}/sitemap.xml?t={int(time.time())}').strip() == local.strip() and get(f'{site}/{key}.txt').strip() == key:
        break
    time.sleep(10)
else:
    print('배포가 아직 끝나지 않아 보내지 못했습니다'); sys.exit(1)

body = json.dumps({'host': re.sub(r'^https?://', '', site), 'key': key, 'keyLocation': f'{site}/{key}.txt', 'urlList': urls[:10000]}).encode()
for ep in ('https://api.indexnow.org/indexnow', 'https://searchadvisor.naver.com/indexnow'):
    req = urllib.request.Request(ep, data=body, headers={'Content-Type': 'application/json; charset=utf-8'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            print(ep, r.status, f'{len(urls)}개 보냄')
    except urllib.error.HTTPError as e:
        print(ep, e.code, e.read()[:300])
    except Exception as e:
        print(ep, '실패', e)
