"""한국어 원본을 영어·일본어로 옮긴다.

화면 틀(HTML)은 문단 단위로, 스크립트는 문자열 단위로 번역 사전에서 찾아 바꾼다.
사전은 src/i18n/en.txt, ja.txt 이고 한 줄에 하나씩 `§아이디 번역문` 형식이다.
아이디는 한국어 원문(공백 정리)의 해시라서, 원문을 고치면 그 문장만 다시 번역하면 된다.
`python3 i18n.py` 를 실행하면 번역이 필요한 문장 목록(src/i18n/catalog.txt)을 새로 만든다.
"""
import hashlib, html, json, os, re
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.abspath(__file__))
I18N = os.path.join(ROOT, 'src', 'i18n')
HANGUL = re.compile('[가-힣ㄱ-ㆎ]')
LANGS = ['ko', 'en', 'ja']
META = {
    'ko': {'label': '한국어', 'short': 'KO', 'og': 'ko_KR', 'brand': '런지수', 'prefix': ''},
    'en': {'label': 'English', 'short': 'EN', 'og': 'en_US', 'brand': 'Runjisu', 'prefix': 'en/'},
    'ja': {'label': '日本語', 'short': 'JA', 'og': 'ja_JP', 'brand': 'ランジス', 'prefix': 'ja/'},
}
JOSA_KEYS = {'는', '은', '가', '이', '를', '을', '와', '과', '로', '으로'}   # 스크립트의 조사 고르기 인자는 번역하지 않는다
CUR = {'lang': 'ko'}


def norm(s):
    return re.sub(r'\s+', ' ', s).strip()


def kid(s):
    return hashlib.sha1(norm(s).encode('utf-8')).hexdigest()[:7]


_tr = {}
MISSING = {}


def load():
    for L in ('en', 'ja'):
        d = {}
        p = os.path.join(I18N, L + '.txt')
        if os.path.exists(p):
            for line in open(p, encoding='utf-8'):
                if line.startswith('§'):
                    k, _, v = line[1:].rstrip('\n').partition(' ')
                    d[k] = v.replace('␣', ' ').replace('\\n', '\n')
        _tr[L] = d


def lookup(ko, lang=None):
    lang = lang or CUR['lang']
    if lang == 'ko' or not HANGUL.search(ko):
        return ko
    k = kid(ko)
    v = _tr.get(lang, {}).get(k)
    if v is None:
        MISSING.setdefault(lang, {})[k] = norm(ko)
        return ko
    return v


def brand(lang=None):
    return META[lang or CUR['lang']]['brand']


def T(ko, **kw):
    """빌드 코드 안의 문장. {brand}와 {이름} 자리를 채운다."""
    v = lookup(ko)
    kw.setdefault('brand', brand())
    for k, val in kw.items():
        v = v.replace('{' + k + '}', str(val))
    return v


# ───────── HTML: 문단(블록 안에 인라인 태그만 있는 덩어리) 단위로 ─────────
INLINE = {'a', 'b', 'strong', 'em', 'i', 'small', 'br', 'span', 'code', 'sup', 'sub', 'abbr', 'time', 'kbd', 'wbr', 'mark', 'u', 's', 'q'}
VOID = {'br', 'img', 'input', 'meta', 'link', 'hr', 'wbr', 'source', 'area', 'base', 'col', 'embed', 'param', 'track'}
ATTRS = ('alt', 'title', 'placeholder', 'aria-label', 'content', 'data-on', 'data-off', 'label')
ATTR_RE = re.compile(r'\b(' + '|'.join(ATTRS) + r')="([^"]*)"')


class _Units(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.lines = [0]
        for m in re.finditer('\n', src):
            self.lines.append(m.end())
        self.stack = [{'tag': '#', 'start': 0, 'block': False, 'ko': False, 'skip': False}]
        self.units, self.texts, self.skips = [], [], []

    def off(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def handle_starttag(self, tag, attrs):
        start = self.off()
        raw = self.get_starttag_text() or ''
        parent = self.stack[-1]
        if tag not in INLINE:
            parent['block'] = True
        if tag in VOID:
            return
        skip = parent['skip'] or dict(attrs).get('lang') == 'ko' or tag in ('script', 'style')
        self.stack.append({'tag': tag, 'start': start + len(raw), 'open': start, 'block': False, 'ko': False, 'skip': skip})

    def handle_startendtag(self, tag, attrs):
        if tag not in INLINE:
            self.stack[-1]['block'] = True

    def handle_endtag(self, tag):
        if not any(n['tag'] == tag for n in self.stack[1:]):
            return
        end = self.off()
        while True:
            n = self.stack.pop()
            if n['tag'] == tag:
                break
        parent = self.stack[-1]
        if n['skip'] and not parent['skip']:
            self.skips.append((n['open'], end))
        if tag in INLINE:
            parent['ko'] |= n['ko']
            parent['block'] |= n['block']
        elif n['ko'] and not n['block'] and not n['skip']:
            self.units.append((n['start'], end))

    def handle_data(self, data):
        if HANGUL.search(data):
            st = self.off()
            n = self.stack[-1]
            n['ko'] = True
            if not n['skip']:
                self.texts.append((st, st + len(data)))


def _spans(src):
    p = _Units(src)
    p.feed(src)
    p.close()
    units = sorted(p.units)
    inside = lambda a, b: any(s <= a and b <= e for s, e in units)
    texts = [(a, b) for a, b in p.texts if not inside(a, b)]
    return units, texts, p.skips


def _swap(seg, lang):
    lead = seg[:len(seg) - len(seg.lstrip())]
    trail = seg[len(seg.rstrip()):]
    core = seg.strip()
    if not core or not HANGUL.search(core):
        return seg
    return lead + lookup(core, lang) + trail


def tr_html(src, lang):
    if lang == 'ko':
        return src
    units, texts, skips = _spans(src)
    reps = sorted(units + texts)
    out, pos = [], 0
    for a, b in reps:
        out.append(src[pos:a])
        out.append(_swap(src[a:b], lang))
        pos = b
    out.append(src[pos:])
    res = ''.join(out)

    # 남은 속성값(문단 밖에 있는 aria-label 같은 것). lang="ko" 안은 그대로 둔다
    def attr(m):
        v = m.group(2)
        if not HANGUL.search(v):
            return m.group(0)
        return f'{m.group(1)}="{html.escape(lookup(html.unescape(v), lang), quote=True)}"'
    _, _, skips2 = _spans(res)
    out, pos = [], 0
    for a, b in sorted(skips2):
        out.append(ATTR_RE.sub(attr, res[pos:a]))
        out.append(res[a:b])
        pos = b
    out.append(ATTR_RE.sub(attr, res[pos:]))
    return ''.join(out)


def html_keys(src):
    units, texts, skips = _spans(src)
    keys = [norm(src[a:b]) for a, b in units + texts]
    for m in ATTR_RE.finditer(src):
        a = m.start()
        if HANGUL.search(m.group(2)) and not any(s <= a < e for s, e in units) and not any(s <= a < e for s, e in skips):
            keys.append(norm(html.unescape(m.group(2))))
    return keys


# ───────── 스크립트: 문자열과 템플릿 조각 단위로 ─────────
def _regex_ok(src, i):
    j = i - 1
    while j >= 0 and src[j] in ' \t\n':
        j -= 1
    if j < 0 or src[j] in '(,=:[!&|?{};+-*%<>~^':
        return True
    w = re.search(r'([A-Za-z_$]+)$', src[max(0, j - 10):j + 1])
    return bool(w and w.group(1) in ('return', 'typeof', 'case', 'in', 'of'))


def js_spans(src):
    """한글이 든 문자열 내용과 템플릿 조각의 (시작, 끝, 따옴표)."""
    out, i, n = [], 0, len(src)
    stack = []                       # 템플릿 ${ } 안에서의 중괄호 깊이

    def template(i):
        start = i
        while i < n:
            c = src[i]
            if c == '\\':
                i += 2
                continue
            if c == '`':
                out.append((start, i, '`'))
                return i + 1, False
            if c == '$' and i + 1 < n and src[i + 1] == '{':
                out.append((start, i, '`'))
                stack.append(0)
                return i + 2, True
            i += 1
        return i, False

    while i < n:
        c = src[i]
        if c == '\\':
            i += 2
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            i = n if j < 0 else j
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            i = n if j < 0 else j + 2
            continue
        if c == '/' and _regex_ok(src, i):
            j, cls = i + 1, False                # 정규식 리터럴: 안의 따옴표를 문자열로 읽지 않는다
            while j < n and (src[j] != '/' or cls):
                if src[j] == '\\':
                    j += 1
                elif src[j] == '[':
                    cls = True
                elif src[j] == ']':
                    cls = False
                j += 1
            i = j + 1
            continue
        if c in '\'"':
            j = i + 1
            while j < n and src[j] != c:
                j += 2 if src[j] == '\\' else 1
            out.append((i + 1, j, c))
            i = j + 1
            continue
        if c == '`':
            i, _ = template(i + 1)
            continue
        if stack:
            if c == '{':
                stack[-1] += 1
            elif c == '}':
                if stack[-1] == 0:
                    stack.pop()
                    i, _ = template(i + 1)
                    continue
                stack[-1] -= 1
        i += 1
    return [(a, b, q) for a, b, q in out if HANGUL.search(src[a:b]) and not (q != '`' and src[a:b].strip() in JOSA_KEYS)]


def _js_escape(s, q):
    s = s.replace('\\', '\\\\').replace('\n', '\\n')
    if q == '`':
        return s.replace('`', '\\`').replace('${', '\\${')
    return s.replace(q, '\\' + q)


def tr_js(src, lang):
    if lang == 'ko':
        return src
    out, pos = [], 0
    for a, b, q in js_spans(src):
        seg = src[a:b]
        lead = seg[:len(seg) - len(seg.lstrip())]
        trail = seg[len(seg.rstrip()):]
        core = seg.strip()
        k = kid(core)
        v = _tr.get(lang, {}).get(k)
        out.append(src[pos:a])
        if v is None:
            MISSING.setdefault(lang, {})[k] = norm(core)
            out.append(seg)
        else:
            if lang == 'ja':          # 일본어는 숫자·이름과 낱말 사이를 띄우지 않는다(필요한 곳은 사전에 ␣로 적는다)
                lead = trail = ''
            out.append(lead + _js_escape(v, q) + trail)
        pos = b
    out.append(src[pos:])
    return ''.join(out)


def js_keys(src):
    return [norm(src[a:b]) for a, b, _ in js_spans(src)]


# ───────── 남은 한글 찾기(lang="ko" 안과 스크립트는 빼고) ─────────
def leftover(page):
    units, texts, skips = _spans(page)
    found = [norm(page[a:b]) for a, b in units + texts]
    for m in ATTR_RE.finditer(page):
        if HANGUL.search(m.group(2)) and not any(s <= m.start() < e for s, e in skips):
            found.append(norm(m.group(2)))
    return found


load()

if __name__ == '__main__':
    import build
    keys = build.i18n_catalog()
    seen, rows = set(), []
    for where, k in keys:
        k = norm(k)
        if not k or not HANGUL.search(k) or k in seen:
            continue
        seen.add(k)
        rows.append((kid(k), where, k))
    ids = [r[0] for r in rows]
    assert len(ids) == len(set(ids)), '아이디가 겹칩니다'
    with open(os.path.join(I18N, 'catalog.txt'), 'w', encoding='utf-8') as f:
        for i, w, k in rows:
            f.write(f'§{i} [{w}] {k}\n')
    for L in ('en', 'ja'):
        miss = [r for r in rows if r[0] not in _tr.get(L, {})]
        print(f'{L}: 번역 {len(rows) - len(miss)}/{len(rows)}')
