import Database from 'better-sqlite3'
import type { Db } from './db.js'
import type {
    User, UserId, Entity, IdOf, Ref, VisibleKeys, Permission, PermissionId, Action, Address,
    Group, GroupId, Organization, OrganizationId, OrganizationPermissions, EventStatus, DateTime,
    Session,
} from './models.js'

export interface Registry<T extends Entity> {
    // 업데이트되어 정보가 오래된 오브젝트는 object 인자로 전달 시 null 반환
    get(keyName: string, key: string): T | null
    create(object: T): T | null
    update(object: T, updates: Partial<T>): T | null
    delete(object: T): { readonly id: IdOf<T> } | null
}

// ---------------------------------------------------------------
// 공통
// ---------------------------------------------------------------

// 자릿수를 고정해서 문자열 순서가 곧 시간 순서가 되게 한다. (만료 시각을 SQL에서 비교한다)
const toIso = (t: DateTime): string => t.toString({ fractionalSecondDigits: 3 })
const fromIso = (s: string): DateTime => Temporal.Instant.from(s)

// 열린 DB를 한 번에 다루기 위한 얇은 래퍼. 같은 SQL은 prepare를 한 번만 한다.
function queries(db: Db) {
    const cache = new Map<string, Database.Statement<unknown[]>>()
    const prep = (sql: string) => {
        let s = cache.get(sql)
        if (!s) cache.set(sql, s = db.prepare<unknown[]>(sql))
        return s
    }
    return {
        all: <R>(sql: string, ...params: unknown[]) => prep(sql).all(...params) as R[],
        get: <R>(sql: string, ...params: unknown[]) => prep(sql).get(...params) as R | undefined,
        run: (sql: string, ...params: unknown[]) => void prep(sql).run(...params),
        // 중첩 호출하면 savepoint가 되므로 호출자가 여러 레지스트리 호출을 하나의 트랜잭션으로 묶을 수 있다.
        tx: <R>(fn: () => R): R => db.transaction(fn)(),
    }
}
type Q = ReturnType<typeof queries>

const isConstraintError = (e: unknown): boolean =>
    e instanceof Database.SqliteError && e.code.startsWith('SQLITE_CONSTRAINT')

// 컬럼명은 항상 코드 상수에서 오므로 SQL에 직접 넣어도 안전하다.
function setColumns(q: Q, table: string, id: string, columns: Record<string, unknown>): void {
    const names = Object.keys(columns)
    if (names.length === 0) return
    q.run(
        `UPDATE ${table} SET ${names.map(n => `${n} = ?`).join(', ')} WHERE id = ?`,
        ...names.map(n => columns[n]), id,
    )
}

// 엔티티를 지울 때 그 id를 가리키던 권한(주체이거나 대상 주소의 첫 원소인 것)을 함께 정리한다.
function purge(q: Q, id: string): void {
    q.run('DELETE FROM org_permissions WHERE subject = ?', id)
    q.run('DELETE FROM permissions WHERE subject = ?', id)
    q.run(`DELETE FROM permission_objects WHERE json_extract(address, '$[0]') = ?`, id)
}

interface Spec<T extends Entity> {
    readonly table: 'users' | 'groups' | 'organizations' | 'permissions' | 'sessions'
    // Registry.get의 keyName별 조회. 대상의 id를 돌려준다.
    readonly find: Readonly<Record<string, (key: string) => string | undefined>>
    load(id: IdOf<T>): T | null
    insert(object: T): void
    apply(id: IdOf<T>, updates: Partial<T>): void
    remove(id: IdOf<T>): void
}

// version은 도메인 타입에 노출하지 않고, 레지스트리가 내준 객체마다 읽은 시점의 version을 따로 기억한다.
// 레지스트리가 내준 적 없는 객체나 그 뒤로 바뀐 객체는 오래된 것으로 보고 update/delete에서 null을 돌려준다.
function makeRegistry<T extends Entity>(q: Q, spec: Spec<T>): Registry<T> {
    const seen = new WeakMap<object, number>()
    const versionOf = (id: string) =>
        q.get<{ version: number }>(`SELECT version FROM ${spec.table} WHERE id = ?`, id)?.version
    const track = (id: IdOf<T>): T | null => {
        const object = spec.load(id)
        const version = versionOf(id)
        if (object === null || version === undefined) return null
        seen.set(object, version)
        return object
    }
    const isFresh = (object: T) => {
        const version = seen.get(object)
        return version !== undefined && version === versionOf(object.id)
    }

    return {
        get(keyName, key) {
            if (!Object.hasOwn(spec.find, keyName)) {
                throw new Error(`${spec.table}: unsupported key name '${keyName}'`)
            }
            const id = spec.find[keyName]!(key)
            return id === undefined ? null : track(id as IdOf<T>)
        },

        // id나 유니크 값이 겹치거나 존재하지 않는 대상을 가리키면 null
        create(object) {
            try {
                return q.tx(() => {
                    spec.insert(object)
                    return track(object.id)
                })
            } catch (e) {
                if (isConstraintError(e)) return null
                throw e
            }
        },

        update(object, updates) {
            if (updates.id !== undefined && updates.id !== object.id) {
                throw new Error(`${spec.table}: id cannot be changed`)
            }
            try {
                return q.tx(() => {
                    if (!isFresh(object)) return null
                    const { id: _id, ...changes } = updates
                    if (Object.keys(changes).length === 0) return track(object.id)
                    spec.apply(object.id, changes as Partial<T>)
                    q.run(`UPDATE ${spec.table} SET version = version + 1 WHERE id = ?`, object.id)
                    return track(object.id)
                })
            } catch (e) {
                if (isConstraintError(e)) return null
                throw e
            }
        },

        delete(object) {
            try {
                return q.tx(() => {
                    if (!isFresh(object)) return null
                    spec.remove(object.id)
                    return { id: object.id }
                })
            } catch (e) {
                if (isConstraintError(e)) return null
                throw e
            }
        },
    }
}

// ---------------------------------------------------------------
// 유저
// ---------------------------------------------------------------

interface UserRow {
    id: UserId
    name: string
    email: string
    password_hash: string
    password_salt: string
    last_login: string
}

function userSpec(q: Q): Spec<User> {
    // 유저에게 보이는 그룹만 User.groups로 다루므로, 교체할 때도 보이는 그룹만 지운다. (보이지 않는 그룹의 소속은 유지)
    const replaceGroups = (id: UserId, groups: User['groups']) => {
        q.run(
            'DELETE FROM group_members WHERE user_id = ? AND group_id IN (SELECT id FROM groups WHERE invisible = 0)',
            id,
        )
        for (const g of groups) q.run('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)', g.id, id)
    }
    const replaceInvites = (id: UserId, invites: User['invites']) => {
        q.run('DELETE FROM user_invites WHERE user_id = ?', id)
        for (const [inviteId, invite] of invites) {
            q.run(
                'INSERT INTO user_invites (user_id, id, org_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
                id, inviteId, invite.from.id, toIso(invite.createdAt), toIso(invite.expiresAt),
            )
        }
    }

    return {
        table: 'users',
        find: {
            id: key => q.get<{ id: string }>('SELECT id FROM users WHERE id = ?', key)?.id,
            email: key => q.get<{ id: string }>('SELECT id FROM users WHERE email = ?', key)?.id,
        },

        load(id) {
            const row = q.get<UserRow>('SELECT * FROM users WHERE id = ?', id)
            if (!row) return null
            const groups = q.all<{ id: GroupId, name: string }>(
                `SELECT g.id, g.name FROM group_members m JOIN groups g ON g.id = m.group_id
                 WHERE m.user_id = ? AND g.invisible = 0 ORDER BY g.rowid`, id)
            const organizations = q.all<{ id: OrganizationId, name: string, description: string }>(
                `SELECT o.id, o.name, o.description FROM org_members m JOIN organizations o ON o.id = m.org_id
                 WHERE m.user_id = ? ORDER BY m.joined_at`, id)
            const invites = q.all<{ id: string, org_id: OrganizationId, org_name: string, created_at: string, expires_at: string }>(
                `SELECT i.id, i.org_id, o.name AS org_name, i.created_at, i.expires_at
                 FROM user_invites i JOIN organizations o ON o.id = i.org_id
                 WHERE i.user_id = ? ORDER BY i.created_at`, id)
            return {
                id: row.id,
                groups: new Set(groups),
                name: row.name,
                email: row.email,
                passwordHash: row.password_hash as User['passwordHash'],
                passwordSalt: row.password_salt as User['passwordSalt'],
                lastLogin: fromIso(row.last_login),
                organizations: new Set(organizations),
                invites: new Map(invites.map(i => [i.id, {
                    from: { id: i.org_id, name: i.org_name },
                    createdAt: fromIso(i.created_at),
                    expiresAt: fromIso(i.expires_at),
                }])),
            }
        },

        // organizations는 org_members에서 파생되는 값이라 쓰지 않는다. (조직 쪽 members를 고쳐야 한다)
        insert(user) {
            q.run(
                `INSERT INTO users (id, name, email, password_hash, password_salt, last_login)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                user.id, user.name, user.email, user.passwordHash, user.passwordSalt, toIso(user.lastLogin),
            )
            replaceGroups(user.id, user.groups)
            replaceInvites(user.id, user.invites)
        },

        apply(id, u) {
            setColumns(q, 'users', id, {
                ...u.name !== undefined && { name: u.name },
                ...u.email !== undefined && { email: u.email },
                ...u.passwordHash !== undefined && { password_hash: u.passwordHash },
                ...u.passwordSalt !== undefined && { password_salt: u.passwordSalt },
                ...u.lastLogin !== undefined && { last_login: toIso(u.lastLogin) },
            })
            if (u.groups !== undefined) replaceGroups(id, u.groups)
            if (u.invites !== undefined) replaceInvites(id, u.invites)
        },

        remove(id) {
            purge(q, id)
            q.run('DELETE FROM users WHERE id = ?', id)
        },
    }
}

// ---------------------------------------------------------------
// 그룹
// ---------------------------------------------------------------

interface GroupRow {
    id: GroupId
    name: string
    created_by: Group['createdBy']
    invisible: 0 | 1
}

function groupSpec(q: Q): Spec<Group> {
    return {
        table: 'groups',
        find: {
            id: key => q.get<{ id: string }>('SELECT id FROM groups WHERE id = ?', key)?.id,
        },

        load(id) {
            const row = q.get<GroupRow>('SELECT * FROM groups WHERE id = ?', id)
            if (!row) return null
            return { id: row.id, name: row.name, createdBy: row.created_by, invisible: row.invisible === 1 }
        },

        insert(group) {
            q.run(
                'INSERT INTO groups (id, name, created_by, invisible) VALUES (?, ?, ?, ?)',
                group.id, group.name, group.createdBy, group.invisible ? 1 : 0,
            )
        },

        apply(id, g) {
            setColumns(q, 'groups', id, {
                ...g.name !== undefined && { name: g.name },
                ...g.createdBy !== undefined && { created_by: g.createdBy },
                ...g.invisible !== undefined && { invisible: g.invisible ? 1 : 0 },
            })
        },

        remove(id) {
            purge(q, id)
            q.run('DELETE FROM groups WHERE id = ?', id)
        },
    }
}

// ---------------------------------------------------------------
// 조직
// ---------------------------------------------------------------

interface OrganizationRow {
    id: OrganizationId
    name: string
    description: string
    created_at: string
}

function organizationSpec(q: Q): Spec<Organization> {
    const replaceMembers = (id: OrganizationId, members: Organization['members']) => {
        q.run('DELETE FROM org_members WHERE org_id = ?', id)
        for (const m of members) {
            q.run('INSERT INTO org_members (org_id, user_id, joined_at) VALUES (?, ?, ?)', id, m.user.id, toIso(m.joinedAt))
        }
    }
    const replaceInvites = (id: OrganizationId, invites: Organization['invites']) => {
        q.run('DELETE FROM org_invites WHERE org_id = ?', id)
        for (const [inviteId, i] of invites) {
            q.run(
                'INSERT INTO org_invites (org_id, id, to_email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
                id, inviteId, i.toEmail, toIso(i.createdAt), toIso(i.expiresAt),
            )
        }
    }
    // 그룹의 이름은 Group이 원본이므로 여기서는 소속 관계와 조직별 속성(color, isAdmin)만 저장한다.
    const replaceGroups = (id: OrganizationId, groups: Organization['groups']) => {
        q.run('DELETE FROM org_groups WHERE org_id = ?', id)
        for (const g of groups) {
            q.run('INSERT INTO org_groups (org_id, group_id, color, is_admin) VALUES (?, ?, ?, ?)', id, g.id, g.color, g.isAdmin ? 1 : 0)
        }
    }
    const replaceEvents = (id: OrganizationId, events: Organization['events']) => {
        q.run('DELETE FROM events WHERE org_id = ?', id) // 참가자는 연쇄 삭제
        for (const [eventId, e] of events) {
            q.run(
                `INSERT INTO events (org_id, id, title, start_at, end_at, status, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                id, eventId, e.title, toIso(e.start), toIso(e.end), e.status, e.createdBy,
            )
            for (const userId of e.participants) {
                q.run('INSERT INTO event_participants (org_id, event_id, user_id) VALUES (?, ?, ?)', id, eventId, userId)
            }
        }
    }
    const replacePermissions = (id: OrganizationId, permissions: Organization['permissions']) => {
        q.run('DELETE FROM org_permissions WHERE org_id = ?', id)
        for (const [subject, set] of permissions) {
            for (const permission of set) {
                q.run('INSERT INTO org_permissions (org_id, subject, permission) VALUES (?, ?, ?)', id, subject, permission)
            }
        }
    }

    return {
        table: 'organizations',
        find: {
            id: key => q.get<{ id: string }>('SELECT id FROM organizations WHERE id = ?', key)?.id,
        },

        load(id) {
            const row = q.get<OrganizationRow>('SELECT * FROM organizations WHERE id = ?', id)
            if (!row) return null

            const members = q.all<{ id: UserId, name: string, joined_at: string }>(
                `SELECT u.id, u.name, m.joined_at FROM org_members m JOIN users u ON u.id = m.user_id
                 WHERE m.org_id = ? ORDER BY m.joined_at`, id)
            const invites = q.all<{ id: string, to_email: string, created_at: string, expires_at: string }>(
                'SELECT id, to_email, created_at, expires_at FROM org_invites WHERE org_id = ? ORDER BY created_at', id)
            const groups = q.all<{ id: GroupId, name: string, color: string, is_admin: 0 | 1 }>(
                `SELECT g.id, g.name, og.color, og.is_admin FROM org_groups og JOIN groups g ON g.id = og.group_id
                 WHERE og.org_id = ? ORDER BY g.rowid`, id)
            const events = q.all<{ id: string, title: string, start_at: string, end_at: string, status: EventStatus, created_by: UserId }>(
                'SELECT id, title, start_at, end_at, status, created_by FROM events WHERE org_id = ? ORDER BY rowid', id)
            const participants = new Map<string, Set<UserId>>()
            for (const p of q.all<{ event_id: string, user_id: UserId }>(
                'SELECT event_id, user_id FROM event_participants WHERE org_id = ?', id)) {
                const set = participants.get(p.event_id) ?? new Set<UserId>()
                participants.set(p.event_id, set.add(p.user_id))
            }
            const permissions = new Map<UserId | GroupId, Set<OrganizationPermissions[number]>>()
            for (const p of q.all<{ subject: UserId | GroupId, permission: OrganizationPermissions[number] }>(
                'SELECT subject, permission FROM org_permissions WHERE org_id = ?', id)) {
                const set = permissions.get(p.subject) ?? new Set<OrganizationPermissions[number]>()
                permissions.set(p.subject, set.add(p.permission))
            }

            return {
                id: row.id,
                name: row.name,
                description: row.description,
                members: new Set(members.map(m => ({ user: { id: m.id, name: m.name }, joinedAt: fromIso(m.joined_at) }))),
                invites: new Map(invites.map(i => [i.id, {
                    toEmail: i.to_email, createdAt: fromIso(i.created_at), expiresAt: fromIso(i.expires_at),
                }])),
                groups: new Set(groups.map(g => ({ id: g.id, name: g.name, color: g.color, isAdmin: g.is_admin === 1 }))),
                events: new Map(events.map(e => [e.id, {
                    title: e.title,
                    start: fromIso(e.start_at),
                    end: fromIso(e.end_at),
                    status: e.status,
                    createdBy: e.created_by,
                    participants: participants.get(e.id) ?? new Set<UserId>(),
                }])),
                permissions,
                createdAt: fromIso(row.created_at),
            }
        },

        insert(org) {
            q.run(
                'INSERT INTO organizations (id, name, description, created_at) VALUES (?, ?, ?, ?)',
                org.id, org.name, org.description, toIso(org.createdAt),
            )
            // org_groups가 group을 참조하므로 그룹(Group)이 먼저 만들어져 있어야 한다.
            replaceMembers(org.id, org.members)
            replaceInvites(org.id, org.invites)
            replaceGroups(org.id, org.groups)
            replaceEvents(org.id, org.events)
            replacePermissions(org.id, org.permissions)
        },

        apply(id, o) {
            setColumns(q, 'organizations', id, {
                ...o.name !== undefined && { name: o.name },
                ...o.description !== undefined && { description: o.description },
                ...o.createdAt !== undefined && { created_at: toIso(o.createdAt) },
            })
            if (o.members !== undefined) replaceMembers(id, o.members)
            if (o.invites !== undefined) replaceInvites(id, o.invites)
            if (o.groups !== undefined) replaceGroups(id, o.groups)
            if (o.events !== undefined) replaceEvents(id, o.events)
            if (o.permissions !== undefined) replacePermissions(id, o.permissions)
        },

        // 조직 전용으로 만들어진 역할 그룹도 함께 지운다.
        remove(id) {
            const groups = q.all<{ group_id: GroupId }>('SELECT group_id FROM org_groups WHERE org_id = ?', id)
            for (const { group_id } of groups) {
                purge(q, group_id)
                q.run('DELETE FROM groups WHERE id = ?', group_id)
            }
            purge(q, id)
            q.run('DELETE FROM organizations WHERE id = ?', id)
        },
    }
}

// ---------------------------------------------------------------
// 권한
// ---------------------------------------------------------------

function permissionSpec(q: Q): Spec<Permission> {
    const replaceObjects = (id: PermissionId, object: Permission['object']) => {
        q.run('DELETE FROM permission_objects WHERE permission_id = ?', id)
        for (const address of object) {
            q.run('INSERT OR IGNORE INTO permission_objects (permission_id, address) VALUES (?, ?)', id, JSON.stringify(address))
        }
    }
    const replaceActions = (id: PermissionId, action: Permission['action']) => {
        q.run('DELETE FROM permission_actions WHERE permission_id = ?', id)
        for (const a of action) q.run('INSERT OR IGNORE INTO permission_actions (permission_id, action) VALUES (?, ?)', id, a)
    }

    return {
        table: 'permissions',
        find: {
            id: key => q.get<{ id: string }>('SELECT id FROM permissions WHERE id = ?', key)?.id,
        },

        load(id) {
            const row = q.get<{ id: PermissionId, subject: Permission['subject'] }>(
                'SELECT id, subject FROM permissions WHERE id = ?', id)
            if (!row) return null
            const objects = q.all<{ address: string }>(
                'SELECT address FROM permission_objects WHERE permission_id = ? ORDER BY address', id)
            const actions = q.all<{ action: Action }>(
                'SELECT action FROM permission_actions WHERE permission_id = ? ORDER BY action', id)
            return {
                id: row.id,
                subject: row.subject,
                object: new Set(objects.map(o => JSON.parse(o.address) as Address)),
                action: new Set(actions.map(a => a.action)),
            }
        },

        insert(permission) {
            q.run('INSERT INTO permissions (id, subject) VALUES (?, ?)', permission.id, permission.subject)
            replaceObjects(permission.id, permission.object)
            replaceActions(permission.id, permission.action)
        },

        apply(id, p) {
            setColumns(q, 'permissions', id, {
                ...p.subject !== undefined && { subject: p.subject },
            })
            if (p.object !== undefined) replaceObjects(id, p.object)
            if (p.action !== undefined) replaceActions(id, p.action)
        },

        remove(id) {
            q.run('DELETE FROM permissions WHERE id = ?', id)
        },
    }
}

// ---------------------------------------------------------------
// 세션
// ---------------------------------------------------------------

interface SessionRow {
    id: Session['id']
    user_id: Session['user']
    token_hash: string
    created_at: string
    expires_at: string
}

function sessionSpec(q: Q): Spec<Session> {
    return {
        table: 'sessions',
        find: {
            id: key => q.get<{ id: string }>('SELECT id FROM sessions WHERE id = ?', key)?.id,
            tokenHash: key => q.get<{ id: string }>('SELECT id FROM sessions WHERE token_hash = ?', key)?.id,
        },

        load(id) {
            const row = q.get<SessionRow>('SELECT * FROM sessions WHERE id = ?', id)
            if (!row) return null
            return {
                id: row.id,
                user: row.user_id,
                tokenHash: row.token_hash as Session['tokenHash'],
                createdAt: fromIso(row.created_at),
                expiresAt: fromIso(row.expires_at),
            }
        },

        insert(session) {
            q.run(
                'INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
                session.id, session.user, session.tokenHash, toIso(session.createdAt), toIso(session.expiresAt),
            )
        },

        apply(id, s) {
            setColumns(q, 'sessions', id, {
                ...s.user !== undefined && { user_id: s.user },
                ...s.tokenHash !== undefined && { token_hash: s.tokenHash },
                ...s.createdAt !== undefined && { created_at: toIso(s.createdAt) },
                ...s.expiresAt !== undefined && { expires_at: toIso(s.expiresAt) },
            })
        },

        remove(id) {
            q.run('DELETE FROM sessions WHERE id = ?', id)
        },
    }
}

// ---------------------------------------------------------------
// 진입점
// ---------------------------------------------------------------

// subject(유저, 또는 유저가 속한 그룹)가 object의 field를 action으로 다룰 수 있는지 그때그때 DB에서 확인한다.
// 주소 [id]는 그 리소스 전체를, [id, field]는 그 필드만 허용한다.
type PermissionCheck = (subject: Entity, object: Entity, field: string, action: Action) => boolean
let checkPermission: PermissionCheck | null = null

export function createRegistries(db: Db): ({
    permissionRegistry: Registry<Permission>
    userRegistry: Registry<User>
    groupRegistry: Registry<Group>
    organizationRegistry: Registry<Organization>
    sessionRegistry: Registry<Session>
}) {
    const q = queries(db)

    checkPermission = (subject, object, field, action) => q.get(
        `SELECT 1 FROM permissions p
         JOIN permission_actions pa ON pa.permission_id = p.id AND pa.action = ?
         JOIN permission_objects po ON po.permission_id = p.id
         WHERE (p.subject = ? OR p.subject IN (SELECT group_id FROM group_members WHERE user_id = ?))
           AND json_extract(po.address, '$[0]') = ?
           AND (json_array_length(po.address) = 1 OR json_extract(po.address, '$[1]') = ?)
         LIMIT 1`,
        action, subject.id, subject.id, object.id, field,
    ) !== undefined

    return {
        permissionRegistry: makeRegistry(q, permissionSpec(q)),
        userRegistry: makeRegistry(q, userSpec(q)),
        groupRegistry: makeRegistry(q, groupSpec(q)),
        organizationRegistry: makeRegistry(q, organizationSpec(q)),
        sessionRegistry: makeRegistry(q, sessionSpec(q)),
    }
}

// ---------------------------------------------------------------
// 레지스트리로 표현되지 않는 조회와 일괄 정리
// ---------------------------------------------------------------

// 만료된 세션을 모두 지우고 지운 수를 돌려준다.
export function purgeExpiredSessions(db: Db, at: DateTime): number {
    return db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(toIso(at)).changes
}

// 유저의 세션을 지운다. keep으로 지정한 세션은 남긴다.
export function deleteSessionsOfUser(db: Db, userId: UserId, keep?: Session['id']): number {
    return db.prepare('DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?').run(userId, keep ?? null).changes
}

// 이메일로 온 조직 쪽 초대를 모든 조직에서 찾는다. (가입 전에 받은 초대를 가입 시 연결하는 데 쓴다)
export function findOrgInvitesByEmail(db: Db, email: string): { orgId: OrganizationId, id: string }[] {
    return db.prepare('SELECT org_id AS orgId, id FROM org_invites WHERE to_email = ? COLLATE NOCASE ORDER BY created_at')
        .all(email) as { orgId: OrganizationId, id: string }[]
}

// 초대 id를 유저 쪽 사본으로 가진 유저. 남의 초대인지 없는 초대인지 구분하는 데 쓴다.
export function findInviteOwner(db: Db, inviteId: string): UserId | null {
    const row = db.prepare('SELECT user_id AS userId FROM user_invites WHERE id = ? LIMIT 1').get(inviteId) as { userId: UserId } | undefined
    return row?.userId ?? null
}

// 요청한 필드를 모두 읽을 수 있을 때만 그 필드로 투영한 참조를 돌려주고, 하나라도 막히면 null이다.
// createRegistries로 연 DB의 권한을 기준으로 한다.
export function getFields<T extends Entity, U extends VisibleKeys<T>[]>
(subject: Entity, object: T, fields: U): Ref<T, U[number]> | null {
    if (checkPermission === null) throw new Error('createRegistries must be called before getFields')
    for (const field of fields) {
        if (!checkPermission(subject, object, String(field), 'read')) return null
    }
    const ref: Record<PropertyKey, unknown> = { id: object.id }
    for (const field of fields) ref[field] = object[field]
    return ref as Ref<T, U[number]>
}
