# CampCanvas
**by [@ricky_camping](https://www.instagram.com/ricky_camping/)** – 캠핑 사이트 장비 배치 시뮬레이터

캠핑장에 가기 전에 텐트·타프·가구·소품을 **1m 격자** 위에 미리 배치해보는 웹앱(PWA)입니다.
iPhone / Android, 폰 / 태블릿 브라우저에서 모두 동작하고, "홈 화면에 추가"하면 앱처럼 쓸 수 있습니다.

## 기능
1. **장비제원** – 스노우피크·헬리녹스·미니멀웍스·제인아츠·스프링바·라디트·하임플래닛·제이크라·TFS 탭.
   각 탭은 텐트/타프/테이블/의자/매트/야전침대/난방/냉장고/기타로 구분. 보유·위시 등록, 수정, 직접 추가.
   다른 브랜드는 검색 → "AI로 찾아 추가" 하면 웹검색으로 제원을 찾아 새 브랜드 탭으로 저장됩니다.
   - `확인됨` : 공식몰/판매처 자료로 확인한 값 · `추정` : 확인 못 한 값 (반드시 공식 제원 확인)
2. **장비배치** – 내 장비/전체 DB에서 고르기, 직접 입력, AI 채팅(애매한 제원·배치 질문, 답변 속 장비 바로 추가).
3. **1m 격자 캔버스** – 그라운드시트·이너텐트·플라이·타프·가구 레이어별 투명도, 치수 표시,
   텐트 프레임(돔/터널 아치/원폴/스프링바/에어) 표시.
4. **하단 제원표** – 길이/너비/높이/재질.
5. **텐트 더 놓기** – 일행(사이트)별 색 구분, 옆에 1.5m 간격으로 자동 배치.
   끌어서 이동, 위쪽 동그란 손잡이로 회전(45° 스냅), 두 손가락 핀치 줌.
6. **공유하기** – 배치도+제원표 이미지를 만들어 인스타그램·카카오톡(모바일 공유 시트) / 사진 저장.
7. **같이 편집** – 링크를 받은 일행이 같은 배치도를 실시간으로 함께 수정 (서버 필요).
8. **캠핑장 크기 입력** – 배치 시작 시 사이트 크기(프리셋/직접 입력)와 이름을 먼저 입력.
9. **캠핑일정** – 날짜·캠핑장(검색 또는 직접 입력)·자리번호·바닥(파쇄석/데크/잔디/마사토)·사이트 크기,
   지도(OpenStreetMap)와 집에서 가는 시간(OSRM, 실시간 교통 미반영), 날씨(Open-Meteo: 16일 이내 예보 / 그 밖은 작년 같은 날 기록),
   배치도와 썼던 장비 목록 저장·꺼내보기, 캠핑 사진 4장(이 기기 IndexedDB, 백업 파일에 포함),
   자리번호별 사이트 크기 기억(같은 캠핑장·자리 자동 입력, 같은 구역 크기 추천). 캠핑장 검색은 서버에 `GOCAMPING_KEY`(공공데이터포털 고캠핑)가 있으면 고캠핑, 없으면 OpenStreetMap.

## 실행
```bash
cd app
npm install
npm run dev      # 개발 서버 (같은 Wi-Fi의 폰에서 http://<PC IP>:5173 접속 가능)
npm run build    # dist/ 정적 파일 → GitHub Pages, Netlify, Vercel 등에 배포
```

## 구조
```
app/     프론트엔드 (React + Vite, GitHub Pages 배포)
server/  서버 (Cloudflare Workers) – AI 프록시 + 공동 편집 방(Durable Object/WebSocket)
```

## 배포
### 1) 서버 (Cloudflare Workers, 무료 플랜 가능)
```bash
cd server
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # Anthropic API 키
npx wrangler secret put APP_PASSCODE        # 앱에서 AI를 쓸 때 입력할 접속 코드
npx wrangler deploy                         # → https://ricky-camping-server.<계정>.workers.dev
```
`wrangler.toml`의 `ALLOWED_ORIGINS`에 GitHub Pages 주소가 들어있어야 합니다.
(또는 저장소 Secrets에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 넣고 "Deploy server" 워크플로 실행)

### 2) 앱 (GitHub Pages)
1. 저장소 Settings → Pages → Source: **GitHub Actions**
2. Settings → Secrets and variables → Actions → Variables 에 `API_BASE` = 서버 주소
3. `main` 브랜치에 병합하면 자동 배포 → `https://oh75170-tech.github.io/Ricky_Camping/`

## 서버
- 배포 주소: https://ricky-camping-server.oh75170.workers.dev (앱 기본값)

## AI 기능
- **서버 경유(기본)**: 설정에 접속 코드만 입력. 실제 API 키는 서버 비밀값에만 있습니다.
- **개인 API 키**: 서버 없이 본인 키로 직접 호출 (본인 기기 전용).

## 데이터 저장
보유 장비, 직접 추가한 장비, 배치 상태는 브라우저에 자동 저장됩니다(기기 간 동기화 없음).
