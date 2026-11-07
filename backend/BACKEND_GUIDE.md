# 백엔드 개발 가이드

백엔드를 수정하거나 기능을 추가할 때 알아야 할 구조와 규칙이다. API 계약은 `shared/src/schemas.ts`가 원본이고, 이 문서는 그 안쪽(도메인, 저장, 정책)을 다룬다.

## 실행과 검사

| 명령 | 하는 일 |
|---|---|
| `npm run dev -w backend` | `tsx watch`로 실행 (기본 포트 3000) |
| `npm test -w backend` | 레지스트리, 도메인 정책, HTTP 테스트 (인메모리 DB) |
| `npm run typecheck` (루트) | `shared`를 먼저 빌드한 뒤 백엔드를 타입체크 |
| `npm run build -w backend` | 테스트를 뺀 `tsconfig.build.json`으로 `dist/`에 빌드 |

- 환경 변수: `PORT`(기본 3000), `DB_PATH`(기본 `backend/data/app.db`, 저장소에는 올라가지 않는다).
- **백엔드는 `shared/dist`를 import한다.** `shared`의 스키마를 바꾸면 `npm run build:shared`를 먼저 실행해야 반영된다.
- ESM + `verbatimModuleSyntax`라서 상대 경로 import에 `.js` 확장자를 쓰고, 타입만 가져올 때는 `import type`을 쓴다.
- `Temporal`은 Node 내장 전역을 쓴다. (`DateTime = Temporal.Instant`)

## 계층

```
app.ts        HTTP/oRPC. 입력을 도메인 값으로, 결과를 응답으로 바꾸기만 한다
  mappers.ts  도메인 ↔ shared DTO 변환, ID 형식 검증
util.ts       도메인 정책. 누가 무엇을 할 수 있는지, 불변 조건
  registry.ts 저장소. 도메인 객체를 읽고 쓰고, 오래된 객체를 걸러낸다
    db.ts     SQLite 스키마, 마이그레이션
models.ts     도메인 타입 (zod를 쓰지 않는다)
```

- **zod는 경계(`shared`)에서만 쓴다.** 도메인은 타입과 생성 시점의 불변 조건으로 지킨다.
- 한 계층은 아래 계층만 안다. `util.ts`는 SQL을 직접 쓰지 않고(`registry.ts`가 내보내는 조회 함수만 사용), `app.ts`는 레지스트리를 직접 부르지 않는다.
- 도메인 객체는 중첩된 읽기 전용 구조이고, DB는 평평한 행이다. 둘 사이의 변환은 `registry.ts`의 `load`/`insert`/`apply`가 맡는다.

## 도메인 모델의 규칙

- **ID는 리소스의 식별자이고, `Ref<T, K>`는 그 리소스의 일부 필드만 담은 참조다.** 참조를 들고 있다는 것이 곧 그 필드에 접근할 수 있다는 뜻이다. 그 이상이 필요하면 권한을 확인하는 별도 함수를 거쳐 다시 읽는다.
- **`Invisible`을 붙인 필드(`passwordHash`, `tokenHash` 등)는 `VisibleKeys`에서 빠진다.** 그래서 `Ref`로 가져오거나 `getFields`로 요청할 수 없다. 응답을 만드는 `mappers.ts`가 `Ref`만 받는 것도 같은 이유다. 이런 필드에 `as`로 값을 넣는 곳은 레지스트리의 `load`와, 해시를 만드는 `util.ts`의 `createUser`, `changePassword`, `createSession`뿐이다.
- 객체는 모두 `readonly`다. 바꾸려면 레지스트리의 `update`에 변경할 필드만 넘긴다.
- `User.organizations`는 저장되지 않고 `org_members`에서 파생된다. 쓰기는 조직의 `members`를 고쳐야 한다. (`create`/`update`에 넘겨도 무시된다)
- 초대는 조직 쪽(`Organization.invites`)과 유저 쪽(`User.invites`)에 같은 id로 한 벌씩 있다. **둘이 만나는 시점은 보낼 때, 가입할 때, 수락할 때뿐이다.** 취소는 조직 쪽만, 거절은 유저 쪽만 지운다.

## 레지스트리

`Registry<T>`는 `get`, `create`, `update`, `delete` 네 가지다. 구현은 `makeRegistry` 하나이고 엔티티마다 `Spec`(조회 키, load, insert, apply, remove)만 다르다.

- **오래된 객체는 `update`/`delete`에서 `null`이다.** 레지스트리가 내준 객체마다 읽은 시점의 `version`을 `WeakMap`에 기억하고, 그 사이 바뀌었으면(또는 레지스트리가 내준 적 없는 객체면) 거절한다. `version`은 도메인 타입에 없다.
- 루트 엔티티의 `version`은 자식 행이 어떤 경로로든 바뀌면 오른다. 트리거로 처리하므로(`db.ts`의 `versionBumps`) 다른 레지스트리나 FK 연쇄 삭제로 바뀌어도 잡힌다. 새 자식 테이블을 추가하면 그 목록에도 넣는다.
- `create`/`update`가 **`null`을 돌려주면 제약 위반**(중복, 없는 대상을 가리킴)이다. 한 트랜잭션이라 롤백되어 아무것도 남지 않는다.
- 컬렉션 필드(`members`, `events` 등)를 `update`에 넘기면 **그 필드 전체를 지우고 다시 쓴다.** 항목 하나만 바꿀 때도 전체가 다시 쓰이므로, 큰 컬렉션이 되면 비용을 다시 따져야 한다.
- 트랜잭션은 중첩할 수 있다(savepoint). 여러 레지스트리 호출을 하나로 묶을 때 `db.transaction`으로 감싸면 되고, 안에서 예외가 나면 전부 되돌아간다.
- 객체가 아닌 조회가 필요하면(이메일로 초대 찾기 등) `registry.ts`에 함수를 추가한다. `util.ts`에서 SQL을 쓰지 않는다.

## 도메인 정책 (`util.ts`)

- 모든 변경 연산은 **한 트랜잭션**이고, 정책 위반은 `DomainError`를 던져 전부 되돌린다. 던지는 곳은 `fail(code, message)` 하나로 통일했다.
- 함수는 **객체가 아니라 id를 받아** 필요할 때마다 다시 읽는다. 연산 중간에 다른 레지스트리 호출로 객체가 오래된 것이 되기 쉽기 때문이다. 바꿀 때는 `modify(registry, id, 변경)`을 쓴다.
- 성공한 일을 남겨야 하는 실패(예: 취소된 초대를 수락하려 할 때 유저 쪽 사본 정리)는 트랜잭션 안에서 결과를 돌려주고 **트랜잭션이 끝난 뒤에 던진다.** 안에서 던지면 정리까지 되돌아간다. (`acceptInvite` 참고)
- `DomainError.code` → HTTP: `unauthenticated` 401, `not_found` 404, `forbidden` 403, `conflict` 409, `invalid` 400. (`app.ts`의 `errorCodes`)

### 권한 모델
권한은 두 층이고, 같은 원본에서 만들어져 어긋나지 않는다.

1. **추상 권한** (`OrganizationPermissions`, 예: `user.invite`): 조직 안에서 유저나 역할 그룹에 주는 단위. `Organization.permissions`에 저장된다. 관리자 역할은 항상 전부를 가진다.
2. **실제 권한** (`Permission`): `(주체, 대상 주소 집합, action 집합)`. 주소는 `[엔티티 id, ...필드 경로]`이고 `[id]`는 그 리소스 전체다. 추상 권한 하나가 실제 권한 하나가 되며, **id는 (조직, 주체, 권한)에서 결정적으로 만들어진다.**

- **변경 연산은 추상 권한을, 읽기 연산은 `getFields`로 실제 권한을 확인한다.**
- `setOrgPermissions`가 추상 권한을 바꾸면 같은 트랜잭션에서 실제 권한도 맞춘다(`syncSubjectPermissions`). 추상 권한이 실제로 어떤 필드와 action이 되는지는 `orgGrants`가 정하고, **`Record<권한, ...>`라서 `OrganizationPermissions`에 권한을 추가하면 여기에도 적어야 컴파일된다.** 이미 있는 조직에는 `syncOrgPermissions`로 한꺼번에 반영한다.
- 유저를 만들 때 본인 정보에 대한 실제 권한(읽기, 이름·이메일 수정, 초대 거절)을 함께 준다(`selfGrants`). 비밀번호 필드는 `VisibleKeys`에 없어 적을 수 없다.
- `getFields`는 **`createRegistries`를 먼저 호출했는지에 의존하는 모듈 상태**를 쓴다. 레지스트리를 여러 DB로 만들면 마지막 것이 기준이 된다.
- 주체가 유저이면 그 유저가 속한 그룹의 권한도 적용된다. 권한은 DB에서 그때그때 읽으므로 회수는 즉시 반영된다.
- 엔티티를 지우면 그것을 주체로 하거나 대상으로 하는 권한도 지운다(`purge`). 주체는 유저와 그룹 두 테이블에 걸쳐 있어서 외래키로 걸 수 없기 때문이다.

### 세션
- `Session.id`는 API에 공개되는 식별자이고, 인증은 따로 발급한 토큰으로 한다. 토큰은 SHA-256 해시만 저장하고 로그인 응답 때 한 번만 알 수 있다.
- 토큰은 쿠키(`session`) 또는 `Authorization: Bearer`로 받는다(`app.ts`의 `readToken`). 보호된 엔드포인트는 `authed` 미들웨어가 `context.auth`에 `{ session, user }`를 넣는다.
- 비밀번호를 바꾸면 지정한 세션을 뺀 다른 세션이 모두 삭제된다. 만료 세션은 조회할 때와 1시간마다(`index.ts`) 정리된다.

## DB (`db.ts`)

- **마이그레이션은 `migrations` 배열 끝에 추가만 한다.** 이미 적용된 항목은 고치지 않는다. `PRAGMA user_version`이 현재 위치이고 `openDb`가 자동으로 올린다.
- `foreign_keys`와 WAL은 `openDb`가 켠다. 연쇄 삭제(`ON DELETE CASCADE`)에 의존하는 정리가 많으니 FK를 바꿀 때는 `registry.test.ts`의 삭제 테스트를 같이 본다.
- 시각은 `TEXT`이고 **밀리초 3자리로 고정한 ISO 문자열**이다(`toIso`). 그래서 SQL에서 문자열 비교가 곧 시간 비교이고, 만료 세션을 SQL로 지운다. 자릿수가 다른 문자열을 넣으면 순서가 깨진다.
- 이메일은 `COLLATE NOCASE`다. 조회 SQL에서 이 컬럼을 비교할 때도 대소문자를 구분하지 않는다.
- 테이블은 `STRICT`이고 boolean은 0/1 정수다. `better-sqlite3`는 boolean을 바인딩하지 못하므로 변환해서 넘긴다.

## 기능 추가 방법

- **새 엔드포인트:** `shared`에 계약을 **추가**한다(기존 계약은 프론트엔드가 쓰므로 고치지 않는다) → `app.ts`에 핸들러 → 정책은 `util.ts` → 저장이 필요하면 `registry.ts` → `api.test.ts`와 `util.test.ts`에 테스트. 프론트엔드가 알아야 할 동작이 생기면 `shared/FRONTEND_GUIDE.md`도 고친다.
- **새 추상 권한:** `OrganizationPermissions`에 추가 → `orgGrants`에 대응(컴파일러가 알려준다) → 기본 역할에 줄지 `memberPermissions`/`adminPermissions` 확인 → 기존 조직은 `syncOrgPermissions`.
- **새 테이블이나 컬럼:** 마이그레이션을 추가 → `registry.ts`의 해당 `Spec` 수정 → 자식 테이블이면 `versionBumps`에 등록.
- 테스트는 인메모리 DB를 쓰고(`testing.ts`의 `newContext`) 테스트마다 새로 만든다. `testing.ts`와 `*.test.ts`는 빌드에서 제외된다.

## 알려진 한계

- 비밀번호 해시(scrypt)가 동기 호출이라 로그인과 가입 때 이벤트 루프가 잠깐 멈춘다.
- 로그인 시도 횟수 제한이 없다. 목록 API에 페이지네이션이 없다.
- 컬렉션 필드를 통째로 다시 쓴다(위 레지스트리 항목).
- 오래된 객체 판정이 보수적이다. 조직의 멤버십이 바뀌면 그 멤버의 유저 객체도 오래된 것이 되므로, 객체를 요청 범위 밖으로 들고 다니지 않는다.
- 역할 관리, 비밀번호 변경, 계정 삭제는 `util.ts`에 구현되어 있지만 아직 API로 노출되지 않았다.
