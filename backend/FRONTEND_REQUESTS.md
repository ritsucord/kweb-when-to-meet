# 프론트엔드 → 백엔드 요청사항

2026-11-27 기준

프론트엔드 화면은 모두 `main`에 들어가 있습니다. 실제 API를 쓰지 않는 화면은 **가능 시간 탭 하나**이고, 이 탭은 지금 Mock 데이터로 동작합니다. 그래서 1번이 가장 급합니다. 나머지는 급하지 않습니다.

| 우선 | 요청 | 이유 |
|---|---|---|
| P0 | 가능 시간 저장 · 조회 API | 가능 시간 탭이 Mock 데이터로만 동작함 |
| P1 | `npm run dev -w backend`가 Node 24에서 동작하게 | 지금은 가입 · 로그인이 500으로 실패함 |
| P2 | 일정 수정 · 삭제 API | 잘못 만든 일정을 고칠 방법이 없음 |
| P2 | 배포 구성 결정 | 프론트 배포 설정이 여기에 달려 있음 |

---

## P0. 가능 시간 저장 · 조회 API

### 필요한 것

멤버가 주 단위로 자기 가능 시간을 저장하고, 같은 조직 멤버 전원의 가능 시간을 불러옵니다. 겹침(몇 명이 가능한지)은 프론트가 30분 칸 단위로 직접 계산하므로 **원본 구간만 주면 됩니다.**

### 제안 계약

`shared/src/schemas.ts`에 추가해 주세요. 이름과 경로는 바꿔도 되고, 정해지면 알려 주시면 됩니다.

```
GET /orgs/{orgId}/availability?from=<ISO Z>&to=<ISO Z>
  200 → { inputs: AvailabilityInput[] }

PUT /orgs/{orgId}/availability/me
  body ← { from: <ISO Z>, to: <ISO Z>, inputs: { start, end }[] }
  204
```

`AvailabilityInput`은 `feature/availability-overlap` 브랜치의 `backend/src/availability.ts`에 있는 타입과 같습니다. 프론트도 이미 이 형태를 씁니다(`frontend/src/availability/slots.ts`).

```ts
{ userId: Id, start: DateTime, end: DateTime }   // [start, end), 시각은 기존과 같이 UTC Z
```

### 동작 규칙 (프론트가 기대하는 것)

- **GET**
  - `[from, to)`와 **겹치는** 구간을 멤버 전원(나 포함) 것으로 돌려줍니다. 일정 목록의 `from` · `to`와 같은 규칙입니다.
  - 정렬은 필요 없습니다.
  - 이름은 넣지 않아도 됩니다. 프론트가 `listMembers` 결과와 `userId`로 맞춥니다.
- **PUT은 "통째로 교체"입니다.**
  - `[from, to)` 안에 있던 내 구간을 모두 지우고 `inputs`로 바꿉니다.
  - `inputs`가 빈 배열이면 그 주의 내 선택이 전부 해제됩니다.
  - 구간마다 추가 · 삭제하는 방식이면 선택 해제를 표현하기 어려워서 이 방식을 요청합니다.
  - `userId`는 받지 않고 세션에서 정합니다.
- **보내는 값:**
  - 프론트는 30분 단위로 맞춘 구간만 보냅니다. 연속된 칸은 하나로 합친 뒤 보냅니다.
  - 한 번에 보내는 범위는 7일입니다.
  - `start < end`이고 `[from, to)` 안에 있지 않으면 400으로 거절해도 됩니다.
- **권한:** 조직 멤버면 조회 · 저장 모두 가능합니다. 오류 순서는 기존과 같이 401 → 404 → 403입니다.
- **정리:**
  - 멤버가 탈퇴하거나 내보내지면 그 사람의 가능 시간도 지워 주세요. 일정과 같은 정책입니다.
  - 조직을 삭제하면 그 조직의 가능 시간도 함께 지워 주세요.

### 참고

- 기존 일정 API로 tentative 일정을 만들어 가능 시간을 저장하는 방법은 쓸 수 없습니다. 일정 삭제 API가 없어서 선택 해제가 반영되지 않기 때문입니다.
- `findCommonAvailability`(겹침 계산)를 API로 노출하는 것은 지금 화면에 필요하지 않습니다. 나중에 "가장 많이 겹치는 시간 추천" 같은 기능을 만들 때 쓰면 됩니다.
- 계약이 `shared`에 들어오면 프론트는 `frontend/src/availability/source.ts` 한 파일만 바꿔서 연결합니다.

---

## P1. 개발 서버 실행 스크립트

devcontainer는 Node 24입니다. 이 버전에서 `npm run dev -w backend`(`tsx watch src/index.ts`)로 띄우면, `Temporal`이 없어서 가입 · 로그인이 500(`Temporal is not defined`)으로 실패합니다. 지금 프론트 README는 아래처럼 직접 띄우라고 안내하고 있습니다.

```bash
cd backend && node --harmony-temporal --import tsx --watch src/index.ts
```

`dev` 스크립트에 플래그를 넣거나, Node 26을 필수로 정해 devcontainer와 `engines`에 반영해 주세요. 어느 쪽이든 정해지면 프론트 README도 고치겠습니다.

---

## P2. 일정 수정 · 삭제

지금은 일정을 만들고 상태만 바꿀 수 있습니다. 시간이나 참여자를 잘못 넣으면 고칠 방법이 없습니다. 아래 둘 중 하나라도 생기면 화면에 붙이겠습니다.

- `PATCH /orgs/{orgId}/events/{eventId}`: 제목, 시간, 참여자 수정
- `DELETE /orgs/{orgId}/events/{eventId}`

권한은 상태 변경과 같게(만든 사람 + 관리자) 하면 됩니다.

그 밖에 `FRONTEND_GUIDE.md` 6장의 "아직 없는 것"(역할 변경, 비밀번호 변경, 계정 삭제, 조직 정보 수정)은 급하지 않습니다. 계약이 생기는 대로 화면을 만들겠습니다.

---

## P2. 배포 구성

프론트는 정적 파일(`frontend/dist`)이고 `/api`를 같은 출처로 부릅니다. 서버에는 CORS 설정이 없고, 쿠키도 같은 출처를 전제로 동작합니다. 배포 방식을 정할 때 아래 두 가지를 함께 정해 주세요.

- `/api`를 백엔드로 넘기는 리버스 프록시(또는 백엔드가 정적 파일까지 서빙)
- `/api`가 아닌 모든 경로를 `index.html`로 돌려주는 설정 (SPA 라우팅)

다른 출처로 나누는 경우에는 CORS와 쿠키 `SameSite` 설정이 서버에 필요합니다.

---

## 있으면 좋은 것 (선택)

- **로그인 응답에 유저 정보 포함:** 지금은 `POST /sessions` 뒤에 `GET /sessions/current`를 한 번 더 부릅니다.
- **목록 정렬 보장:** 초대 목록은 최근 순, 일정 목록은 시작 시각 순이면 좋습니다. 지금은 프론트에서 정렬하고 있어서 문제는 없습니다.

문의: 프론트엔드 담당자에게 연락해 주세요. 프론트 쪽 현황은 `frontend/HANDOFF.md`에 있습니다.
