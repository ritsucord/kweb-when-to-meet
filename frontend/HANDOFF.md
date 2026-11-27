# 프론트엔드 인계서

2026-11-27 기준 · 다음 프론트엔드 담당자용

실행 방법, 폴더 구조, 작업 규칙은 [README.md](README.md)에 있습니다. 서버의 실제 동작(명세에 없는 규칙)은 [shared/FRONTEND_GUIDE.md](../shared/FRONTEND_GUIDE.md)를 보세요. 이 문서는 **지금 어디까지 됐고, 무엇이 남았는지**만 다룹니다.

## 1. 한 줄 요약

화면은 전부 `main`에 들어가 있고 CI 단계(타입 검사 · lint · 테스트 · 빌드)는 모두 통과합니다. **남은 큰 일은 가능 시간 탭의 백엔드 연동 하나**입니다. 지금은 Mock 데이터로 동작합니다.

**처음 할 일**

1. README의 "빠르게 실행하기"대로 띄우고, 가입 → 조직 만들기 → 일정 · 가능 시간 탭을 한 번씩 눌러 봅니다.
2. `src/availability/source.ts` 주석을 읽습니다. 연동 작업은 여기서 시작합니다.
3. 백엔드 담당자와 가능 시간 API 계약을 정합니다. (아래 4장 P0)

## 2. 현재 상태 (2026-11-27 로컬 확인)

| 검사 (루트에서) | 결과 |
|---|---|
| `npm run build:shared` | 통과 |
| `npm exec -w frontend -- tsc -b` | 오류 0 |
| `npm run lint -w frontend` | 오류 0 |
| `npm test -w frontend` | 4개 파일, 22개 테스트 통과 |
| `npm run build -w frontend` | 통과 |

CI(`.github/workflows/frontend.yml`)도 같은 순서로 위 다섯 단계를 실행합니다.

### 브랜치

- `origin/main`에 PR #6(CI), #7(Vitest), #8 브랜치(`feat/frontend-availability`), #9~#11이 모두 병합되어 있습니다.
- 작업은 최신 `main`에서 새 브랜치를 따서 시작하세요.
- `feature/availability-overlap`(백엔드 담당 ibrick21)은 **아직 main에 없습니다.** 겹침 계산 함수 `findCommonAvailability`가 들어 있고, 프론트가 쓰는 `AvailabilityInput` 타입과 같은 형태입니다.

## 3. 구현된 화면

| 경로 | 화면 | 데이터 |
|---|---|---|
| `/login`, `/signup` | 로그인 · 가입 | 실제 API |
| `/` | 내 조직 목록, 조직 만들기 | 실제 API |
| `/invites` | 받은 초대 (수락 · 거절) | 실제 API |
| `/orgs/:orgId/events` | 주간 캘린더, 일정 만들기, 상태 변경 | 실제 API |
| `/orgs/:orgId/availability` | 가능 시간 선택 · 겹침 보기 | **Mock** |
| `/orgs/:orgId/members` | 멤버 목록, 탈퇴 · 내보내기, 조직 삭제 | 실제 API |
| `/orgs/:orgId/invites` | 보낸 초대 (관리자) | 실제 API |
| `/design-system.html` | 디자인 시스템 문서 | — |

라이트·다크 테마, 휴대폰 · 태블릿 · 데스크톱 레이아웃이 모든 화면에 적용되어 있습니다.

## 4. 남은 일 (우선순위순)

### P0 — 가능 시간 백엔드 연동

화면은 `src/availability/source.ts`의 `AvailabilitySource` 인터페이스만 사용합니다. 연동할 때 **이 파일만 바꾸면** 됩니다.

1. 백엔드 담당자와 API 계약을 정해 `shared/src/schemas.ts`에 추가합니다. `source.ts` 주석에 제안안이 있습니다.
   ```
   GET /orgs/{orgId}/availability?from&to   → { inputs: AvailabilityInput[] }   (멤버 전원)
   PUT /orgs/{orgId}/availability/me        ← { from, to, inputs }               (그 구간의 내 시간을 통째로 교체)
   ```
   "통째로 교체" 방식이어야 선택 해제가 반영됩니다. 일정 API로 tentative 일정을 만드는 방법은 일정 삭제 API가 없어서 쓸 수 없습니다.
2. `source.ts`에 `api.*`를 호출하는 구현을 추가하고, 파일 맨 아래 `availabilitySource`를 그 구현으로 바꿉니다.
3. 바꾸면 `IS_MOCK_SOURCE`가 `false`가 되어 "예시 팀원" 표시와 시범 안내 문구가 자동으로 사라집니다. `MOCK_PEOPLE` 대신 실제 멤버 이름을 보여주도록 `AvailabilityPage.tsx`에서 멤버 목록(`api.listMembers` 등)을 함께 불러와야 합니다.
4. 서버가 겹침 결과(`AvailableSlot`)를 따로 주더라도, 화면은 지금처럼 `usersByCell`로 직접 계산해도 됩니다. 저장 전 선택도 바로 반영해야 하기 때문입니다.

완료 기준: 새로고침해도 내 선택이 남고, 다른 멤버의 선택이 겹침 보기에 보인다.

### P1 — 실제 기기 확인

가능 시간 탭의 다음 동작은 **실제 휴대폰에서 확인한 기록이 없습니다.** 연동 전후로 한 번 확인하세요.

- PC: 클릭 선택 · 해제, 마우스 드래그, 이전 · 다음 주 이동
- 휴대폰: 기본 상태에서 스크롤과 탭 선택, "드래그로 선택" 켠 상태에서 손가락 드래그 선택
- 겹침 보기의 인원 수와 색 농도

### P2 — 서버에 아직 없는 기능

역할 변경, 비밀번호 변경, 계정 삭제, 일정 수정 · 삭제, 조직 정보 수정. 서버 계약이 `shared`에 먼저 추가되어야 화면을 만들 수 있습니다.

### P2 — 배포

정적 빌드만 올리면 `/api`가 없습니다. 같은 출처에서 `/api`를 백엔드로 넘기는 rewrite와, 모든 경로를 `index.html`로 돌려주는 SPA 설정이 필요합니다. 아직 배포 환경은 정해지지 않았습니다.

## 5. 알아둘 것

- **백엔드 실행:** Node 24(현재 devcontainer)에서는 `npm run dev:backend`가 아니라 `cd backend && node --harmony-temporal --import tsx --watch src/index.ts`로 띄워야 합니다. 플래그가 없으면 가입 · 로그인이 500(`Temporal is not defined`)으로 실패합니다.
- **TypeScript가 두 버전입니다.** 프론트 · 루트는 6, `shared` · `backend`는 7입니다. 루트 `package.json`의 `typescript ~6.0.2`를 지우면 ESLint가 TS 7을 불러와 `Cannot read properties of undefined (reading 'Intrinsic')`로 다시 깨집니다.
- **`src/components/ui/`는 shadcn 폴더지만 손댄 곳이 있습니다.** `npx shadcn add`로 덮어쓰기 전에 diff를 확인하세요. 이 폴더만 `react-refresh/only-export-components` 규칙을 끕니다(`eslint.config.js`).
- 데이터 불러오기는 `src/lib/useApi.ts`, 조직 목록 · 받은 초대 수 공유는 `src/app/AppData.tsx`의 `refresh()`를 쓰세요. 목록을 바꾸는 동작 뒤에는 `refresh()`를 불러야 사이드바가 갱신됩니다.

## 6. 이전 인계서(11월 9일)와 달라진 점

11월 9일 인계서에서 남은 일로 적었던 항목의 현재 상태입니다. 그 문서를 받지 않았다면 이 장은 건너뛰어도 됩니다.

| 11월 9일 인계서 항목 | 현재 |
|---|---|
| PR #6 · #7 · #8 미병합 | 모두 `main`에 병합 |
| CI ESLint `Intrinsic` 오류 | 해결. 루트에 TS 6 고정 |
| ESLint 오류 5건 | 0건. `useApi`는 loading을 계산값으로 바꿨고, shadcn 3건은 `ui/` 폴더만 규칙 예외 |
| CI에 Vitest 단계 없음 | 추가됨 |
| 선택값 → `AvailabilityInput` 변환 | `slots.ts`의 `selectionToInputs`. 연속 병합 · 끊김 분리 · 자정 경계 · UTC 테스트 포함 |
| Mock과 서버 호출 경계 분리 | `source.ts`로 분리. **API 계약 합의는 아직** |
| README 교체 | 완료 |
| Windows에서 `rm -rf dist` 실패 | `shared`의 prebuild를 Node `fs.rmSync`로 교체 |
| 실제 모바일 검증 | **아직** |

이름이 바뀐 것: `mockAvailability.ts` → `source.ts`, 예시 팀원 ID `member-a/b` → `demo-a/b`.
