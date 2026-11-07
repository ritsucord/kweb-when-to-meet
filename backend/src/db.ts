import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Db = Database.Database

// src/(tsx)와 dist/(빌드) 모두 한 단계 위가 backend/이므로 같은 경로를 가리킨다.
export const defaultDbPath = fileURLToPath(new URL('../data/app.db', import.meta.url))

// 도메인 객체의 중첩 구조를 평평한 행으로 푼 스키마다. 같은 정보는 한 곳에만 둔다.
// - User.organizations는 org_members에서 파생된다 (별도 저장 없음).
// - 조직 쪽/유저 쪽 초대는 서로 동기화하지 않으므로 org_invites, user_invites를 따로 둔다.
// - subject(유저 또는 그룹)는 대상 테이블이 둘이라 외래키를 걸 수 없다. 엔티티 삭제 시 레지스트리가 정리한다.
const schema = `
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    last_login    TEXT NOT NULL,
    version       INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE groups (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_by TEXT NOT NULL,
    invisible  INTEGER NOT NULL CHECK (invisible IN (0, 1)),
    version    INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE group_members (
    group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    user_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX group_members_by_user ON group_members (user_id);

CREATE TABLE organizations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    version     INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE org_members (
    org_id    TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (org_id, user_id)
) STRICT, WITHOUT ROWID;
CREATE INDEX org_members_by_user ON org_members (user_id);

CREATE TABLE org_invites (
    org_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    to_email   TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (org_id, id)
) STRICT, WITHOUT ROWID;

CREATE TABLE user_invites (
    user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    org_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
) STRICT, WITHOUT ROWID;

CREATE TABLE org_groups (
    org_id   TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    color    TEXT NOT NULL,
    is_admin INTEGER NOT NULL CHECK (is_admin IN (0, 1)),
    PRIMARY KEY (org_id, group_id)
) STRICT, WITHOUT ROWID;

CREATE TABLE org_permissions (
    org_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    subject    TEXT NOT NULL,
    permission TEXT NOT NULL,
    PRIMARY KEY (org_id, subject, permission)
) STRICT, WITHOUT ROWID;
CREATE INDEX org_permissions_by_subject ON org_permissions (subject);

CREATE TABLE events (
    org_id     TEXT NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    title      TEXT NOT NULL,
    start_at   TEXT NOT NULL,
    end_at     TEXT NOT NULL,
    status     TEXT NOT NULL CHECK (status IN ('confirmed', 'tentative')),
    created_by TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (org_id, id)
) STRICT;

CREATE TABLE event_participants (
    org_id   TEXT NOT NULL,
    event_id TEXT NOT NULL,
    user_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    PRIMARY KEY (org_id, event_id, user_id),
    FOREIGN KEY (org_id, event_id) REFERENCES events (org_id, id) ON DELETE CASCADE
) STRICT, WITHOUT ROWID;

CREATE TABLE permissions (
    id      TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX permissions_by_subject ON permissions (subject);

-- 주소는 [엔티티 ID, ...필드 경로]의 JSON 배열 문자열이다.
CREATE TABLE permission_objects (
    permission_id TEXT NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    address       TEXT NOT NULL,
    PRIMARY KEY (permission_id, address)
) STRICT, WITHOUT ROWID;

CREATE TABLE permission_actions (
    permission_id TEXT NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    action        TEXT NOT NULL CHECK (action IN ('read', 'write', 'create_field', 'delete_field')),
    PRIMARY KEY (permission_id, action)
) STRICT, WITHOUT ROWID;
`

// 루트 엔티티가 소유한 자식 행이 어떤 경로로든 바뀌면 루트의 version을 올린다.
// 레지스트리는 version으로 "오래된 객체"를 판별한다. 다른 레지스트리나 FK 연쇄 삭제로 바뀐 경우도 잡기 위해 트리거로 둔다.
const versionBumps: readonly [child: string, column: string, root: string][] = [
    ['group_members', 'user_id', 'users'],
    ['org_members', 'user_id', 'users'],
    ['user_invites', 'user_id', 'users'],
    ['org_members', 'org_id', 'organizations'],
    ['org_invites', 'org_id', 'organizations'],
    ['org_groups', 'org_id', 'organizations'],
    ['org_permissions', 'org_id', 'organizations'],
    ['events', 'org_id', 'organizations'],
    ['event_participants', 'org_id', 'organizations'],
    ['permission_objects', 'permission_id', 'permissions'],
    ['permission_actions', 'permission_id', 'permissions'],
]

const bumpTriggers = versionBumps.flatMap(([child, column, root]) => [
    ['INSERT', 'NEW.' + column],
    ['UPDATE', 'NEW.' + column + ', OLD.' + column],
    ['DELETE', 'OLD.' + column],
].map(([op, ids]) => `
CREATE TRIGGER bump_${child}_${column}_${op?.toLowerCase()} AFTER ${op} ON ${child}
BEGIN
    UPDATE ${root} SET version = version + 1 WHERE id IN (${ids});
END;`)).join('\n')

// migrations[n]은 user_version n -> n + 1로 올리는 SQL이다. 이미 적용된 항목은 고치지 말고 뒤에 추가한다.
const migrations: readonly string[] = [
    schema + bumpTriggers,
    // 세션. 인증 토큰은 해시만 저장하고, id는 API에 공개되는 식별자다.
    // 이메일로 대기 중인 초대를 찾고(가입 시 연결), 초대 id로 소유자를 찾는 조회용 인덱스도 함께 둔다.
    `
    CREATE TABLE sessions (
        id         TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        version    INTEGER NOT NULL DEFAULT 0
    ) STRICT;
    CREATE INDEX sessions_by_user ON sessions (user_id);
    CREATE INDEX org_invites_by_email ON org_invites (to_email COLLATE NOCASE);
    CREATE INDEX user_invites_by_id ON user_invites (id);
    `,
]

export function migrate(db: Db): void {
    const current = db.pragma('user_version', { simple: true }) as number
    for (let v = current; v < migrations.length; v++) {
        db.transaction(() => {
            db.exec(migrations[v]!)
            db.pragma(`user_version = ${v + 1}`)
        })()
    }
}

export function openDb(file: string = defaultDbPath): Db {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    const db = new Database(file)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    migrate(db)
    return db
}
