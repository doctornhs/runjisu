# 런지수 러닝 계산기: 배포 안내

정형외과 전문의가 만든 러닝 계산기 사이트의 전체 묶음입니다. 한 벌의 소스(`src/`)에서 미리보기 한 장과 배포용 사이트가 함께 만들어집니다.

## 들어 있는 것

| 위치 | 내용 |
|---|---|
| `docs/` | **배포되는 사이트.** GitHub Pages가 이 폴더를 runjisu.com으로 내보냅니다. 직접 고치지 않고 빌드로 만듭니다 |
| `src/` | 소스: `core.js`(계산), `app.js`(화면 동작), `styles.css`, `views/`(화면별 HTML), `pwa/`(아이콘, 서비스 워커) |
| `src/static/` | 사이트 맨 위에 그대로 복사되는 파일(네이버 소유 확인 파일 등) |
| `site.config.json` | 이름, 주소, 광고, 제휴 링크를 바꾸는 한 곳 |
| `build.py` | 소스와 설정으로 `docs/`를 다시 만드는 스크립트 |
| `test/core.test.js` | 계산 검산 (`node test/core.test.js`) |

대회 일정은 `src/data/races.json`만 고치면 됩니다. 날짜가 발표되면 `"date": "2027-10-24"`처럼 넣고, 확인한 날을 `checked`에 적습니다.

고치는 순서: `src/`나 `site.config.json`을 고친다 → `node test/core.test.js` → `python3 build.py` → `docs/`까지 함께 커밋하고 푸시한다.

## 사이트 구성

| 주소 | 도구 | 노리는 검색어 |
|---|---|---|
| `/` | 런지수: 기록 → 훈련 페이스, 예상 기록, 또래 비교 | 러닝 페이스 계산기, VDOT 계산 |
| `/marathon-schedule/` | 대회 일정: 주요 대회 날짜, 접수 시기, 공식 사이트, 목표 대회 D-day | 2027 마라톤 일정, 춘천마라톤 접수 |
| `/race-pace/` | 대회 계획: 목표 기록 구간표, 목표 점검 | 마라톤 페이스 계산기, 서브4 페이스 |
| `/training-week/` | 주간 훈련표 | 러닝 훈련표, 10km 훈련 계획 |
| `/log/` | 달리기 기록: 주간 거리, 30일 최장, 신발 누적 | 달리기 기록, 주간 마일리지 |
| `/long-run-check/` | 거리 급증 체크 | 장거리 늘리기, 러닝 부상 |
| `/shoe-mileage/` | 신발 교체 | 러닝화 교체 시기, 러닝화 수명 |
| `/heart-rate-zones/` | 심박 존 | 심박 존 계산기 |
| `/pace-converter/` | 페이스 변환 | 러닝머신 속도 페이스 |
| `/fitness-age/` | 체력 나이: 달리기, 12분 달리기, 1.6km 걷기 | 체력 나이, VO2max 계산 |
| `/gear/` | 장비 가이드 (제휴 링크 자리) | 러닝화 고르는 법 |
| `/about/`, `/privacy/` | 계산 근거·FAQ, 개인정보처리방침 | |

## 배포 설정

- 저장소 Settings → Pages: Source는 Deploy from a branch, 브랜치 `main`, 폴더 `/docs`. Custom domain은 `runjisu.com`.
- 가비아 DNS: A 레코드(호스트 `@`) 네 개 `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, CNAME 레코드(호스트 `www`) `doctornhs.github.io`.
- Google Search Console과 네이버 서치어드바이저에 사이트를 등록하고 `sitemap.xml`을 제출합니다. 소유 확인 코드는 `googleVerification`, `naverVerification`에 넣고 다시 빌드하면 첫 화면에 들어갑니다.

## site.config.json

```json
{
  "brand": "런지수",              // 사이트 이름. 바꾸면 모든 화면과 조사(는/은, 로/으로)가 따라 바뀝니다
  "brandLatin": "RUNJISU",        // 배번표 위에 찍히는 영문 이름
  "siteUrl": "https://runjisu.com", // 끝에 / 없이
  "contactEmail": "",             // 바닥글과 개인정보처리방침에 표시
  "ga4Id": "",                    // G-XXXXXXX. 넣으면 방문 통계 코드와 방침 문구가 들어갑니다
  "adsenseClient": "",            // ca-pub-XXXXXXXX. 넣으면 애드센스 코드와 ads.txt가 만들어집니다
  "adSlots": {},                  // 광고 단위: { "home-1": "1234567890", "race-1": "...", ... }
  "partnerLinks": {},             // 쿠팡파트너스: { "cushion": "https://link.coupang.com/...", ... }
  "googleVerification": "",
  "naverVerification": "",
  "privacyDate": "2026-11-12"     // 개인정보처리방침 시행일. 방침 내용이 바뀌면 함께 고칩니다
}
```

- 광고 자리 이름: `home-1`, `calendar-1`, `race-1`, `plan-1`, `spike-1`, `shoes-1`, `fitage-1`, `gear-1`. 광고 단위 번호를 넣지 않은 자리는 배포본에서 아예 빠집니다.
- 제휴 링크 이름: `cushion`, `stability`, `racing`, `watch`, `roller`, `race`. 하나라도 넣으면 장비 가이드와 바닥글에 쿠팡 파트너스 대가 문구가 나타납니다.
- 실제 JSON 파일에는 `//` 설명을 넣을 수 없습니다.

## 수익화 전에 확인할 것

- **애드센스 신청**은 도메인 연결, 개인정보처리방침의 문의처, 검색 등록을 마친 뒤에 합니다.
- **보호대, 건강기능식품**은 제휴 링크를 달지 않았습니다. 의료기기법 시행규칙 별표 7은 의사가 의료기기를 추천한다는 내용의 광고를 금지합니다. 장비 가이드는 제품이 아니라 유형을 설명하는 방식을 지킵니다.
- 근무처의 겸직·외부 영리 활동 규정을 확인합니다.
- 책의 표와 문장은 옮기지 않았습니다. 계산은 공개된 식(Daniels & Gilbert 1979)으로 하고, 상표인 VDOT이라는 이름은 쓰지 않습니다.

## 앱으로 넓힐 때

- 지금 배포본은 이미 설치형 웹앱입니다. 홈 화면에 추가하면 앱처럼 열리고 한 번 연 뒤에는 인터넷 없이도 계산됩니다.
- 스토어 앱은 `docs/`를 Capacitor로 감싸면 됩니다. 계산은 `src/core.js` 한 파일에 화면과 분리되어 있어 그대로 다시 씁니다.
- 기록은 지금 기기의 브라우저에만 저장됩니다. 기기 사이 동기화와 유료 기능(여러 주 훈련 계획 등)은 계정과 서버가 필요한 다음 단계입니다.
