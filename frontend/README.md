# KUrdination 프론트엔드

조직 단위로 각자 가능한 시간을 모으고 일정을 확정하는 웹 앱의 프론트엔드입니다.
React 19 + Vite + TypeScript로 만들었고, API 타입은 `shared` 패키지의 계약(oRPC contract)에서 그대로 가져옵니다.

## 빠르게 실행하기

모든 명령은 **리포지토리 루트**에서 실행합니다.

```bash
npm install
npm run build:shared        # 프론트·백엔드가 shared/dist를 import하므로 먼저 빌드

# 터미널 1 — 백엔드 (http://localhost:3000)
cd backend && node --harmony-temporal --import tsx --watch src/index.ts

# 터미널 2 — 프론트 (http://localhost:5173)
npm run dev:frontend
```

- **백엔드는 `Temporal`이 필요합니다.** Node 26이면 `npm run dev:backend`로 충분합니다. Node 24(현재 devcontainer)에서는 위처럼 `--harmony-temporal` 플래그를 붙여야 합니다. 붙이지 않으면 가입·로그인이 500(`Temporal is not defined`)으로 실패합니다.
- 개발 서버는 `/api` 요청을 백엔드(3000)로 프록시합니다(`vite.config.ts`). 백엔드에 CORS 설정이 없어서 이 프록시가 필요합니다.
- 디자인 시스템 문서: 개발 서버에서 `/design-system.html`

## 명령어

| 명령 (루트에서) | 하는 일 |
|---|---|
| `npm run dev:frontend` | 개발 서버 |
| `npm run build -w frontend` | 타입 검사(`tsc -b`) + 프로덕션 빌드 → `frontend/dist` |
| `npm run lint -w frontend` | ESLint |
| `npm test -w frontend` | Vitest 단위 테스트 |

CI(`.github/workflows/frontend.yml`)는 PR과 main push마다 `build:shared → tsc → lint → test → build`를 실행합니다.

## 폴더 구조

```
src/
  api/            client.ts (oRPC 클라이언트, 401 공통 처리), errors.ts (HTTP 상태 → 사용자 문구)
  app/            AppData.tsx (사이드바·홈이 함께 쓰는 내 조직 목록, 받은 초대 수)
  auth/           로그인 상태(AuthProvider), 접근 제어 라우트(RequireAuth / GuestOnly)
  components/
    ui/           shadcn/ui 컴포넌트 (shadcn CLI로 추가·갱신)
    *.tsx         앱 공통 블록: Layout(앱 틀), PageHeader, editorial(Section·Rows·TableHead…),
                  FormField, ConfirmAction, theme(라이트/다크)
  pages/          로그인, 가입, 내 조직(홈), 받은 초대
  org/            조직 화면 틀(OrgLayout)과 멤버·초대 탭
  events/         일정 탭: 주간 캘린더, 일정 만들기·상세, 날짜 계산(week.ts)
  lib/            time(UTC ↔ 로컬), form(zod 오류 → 필드 문구), useApi(데이터 불러오기 훅)
  hooks/          useMediaQuery (화면 크기별로 다른 컴포넌트를 그릴 때)
  design-system/  디자인 시스템 문서 페이지 (design-system.html)
```

## 작업 규칙

- **API 명세는 `shared/src/schemas.ts`가 원본**이고, 명세에 없는 서버 동작은 `shared/FRONTEND_GUIDE.md`에 있습니다. 화면을 만들기 전에 둘 다 확인하세요.
- **API 호출은 `api.<이름>()`으로** 합니다(`src/api/client.ts`). 입력·응답 타입이 계약에서 자동으로 맞춰집니다.
- **오류 문구는 HTTP 상태로 정합니다.** 서버 `msg`는 개발자용 영어라 보여주지 않습니다. `errorMessage(e, { 409: '…' })`를 쓰세요.
- **폼은 보내기 전에 `shared`의 zod 스키마로 검증**합니다. 서버는 400일 때 어느 필드가 틀렸는지 알려주지 않습니다.
- **시각은 서버와 UTC(`Z`) 문자열로 주고받고**, 화면에서만 로컬 시간으로 바꿉니다(`src/lib/time.ts`). `+09:00` 같은 오프셋은 서버가 400으로 거절합니다.
- **스타일은 디자인 토큰만 씁니다**(`src/index.css`, `/design-system.html`).
  - 색은 paper / ink / line / accent-ink만 씁니다. 상태 칸만 confirmed / tentative 색을 씁니다.
  - 모서리는 0~4px, 그림자는 쓰지 않습니다.
  - 선택 상태는 반전(`selected` 클래스)으로 표시합니다.
  - 고정 색(`#fff`, `text-white` 등)은 다크 모드에서 깨지므로 쓰지 않습니다.
- **화면 크기:** 휴대폰 ~767px / 태블릿 768~1279px / 데스크톱 1280px~.
  - 스타일만 바뀌면 `md:` `lg:` `xl:` 클래스로 처리합니다.
  - 그리는 컴포넌트 자체가 바뀌면(예: 옆 패널 ↔ 시트) `useMediaQuery`를 씁니다.

## 주의사항

- **TypeScript 버전이 둘입니다.** 루트·프론트는 TypeScript 6이고, `shared`·`backend`는 TypeScript 7입니다. 루트 `package.json`의 `typescript ~6.0.2`는 ESLint(typescript-eslint)가 TypeScript 7을 불러오지 않게 하려는 것이니 지우지 마세요.
- **`src/components/ui/`는 shadcn이 관리하는 폴더입니다.** 대신 크기·모서리·배지 변형은 KUrdination에 맞게 고쳐 두었습니다. `npx shadcn add`로 같은 파일을 덮어쓰면 그 수정이 사라지니 diff를 확인하세요.
- **배포:** 정적 빌드(`frontend/dist`)만 배포하면 `/api`가 없습니다. 백엔드를 따로 띄우고 `/api`를 그쪽으로 넘겨야(rewrite) 하고, 단일 페이지 앱이라 모든 경로를 `index.html`로 돌려주는 설정도 필요합니다.
