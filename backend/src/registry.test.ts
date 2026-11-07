import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { openDb } from './db.js'
import { createRegistries, deleteSessionsOfUser, findInviteOwner, findOrgInvitesByEmail, getFields, purgeExpiredSessions } from './registry.js'
import type { Group, Organization, User } from './models.js'
import { T } from './testing.js'

const uid = () => `u:${randomUUID()}` as const
const gid = () => `g:${randomUUID()}` as const
const oid = () => `o:${randomUUID()}` as const
const pid = () => `p:${randomUUID()}` as const
const sid = () => `s:${randomUUID()}` as const
const at = T('2026-11-07T01:02:03.456Z')

function setup() {
    const db = openDb(':memory:')
    return { db, ...createRegistries(db) }
}

const user = (name: string, email: string): User => ({
    id: uid(), groups: new Set(), name, email,
    passwordHash: 'h' as User['passwordHash'], passwordSalt: 's' as User['passwordSalt'],
    lastLogin: at, organizations: new Set(), invites: new Map(),
})
const group = (name: string, createdBy: Group['createdBy'], invisible = false): Group =>
    ({ id: gid(), name, createdBy, invisible })

test('마이그레이션은 한 번만 적용되고 FK가 켜져 있다', () => {
    const { db } = setup()
    assert.equal(db.pragma('user_version', { simple: true }), 2)
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1)
})

test('유저: 생성, 조회, 이메일 중복(대소문자 무시)', () => {
    const { userRegistry: users } = setup()
    const alice = users.create(user('alice', 'Alice@x.com'))!
    assert.ok(alice)
    assert.equal(users.create(user('dup', 'alice@X.COM')), null)
    assert.equal(users.get('email', 'ALICE@x.com')?.id, alice.id)
    assert.equal(users.get('id', uid()), null)
    assert.throws(() => users.get('name', 'x'))
    assert.equal(alice.lastLogin.toString(), '2026-11-07T01:02:03.456Z')
})

test('오래된 객체는 update/delete에서 null이다', () => {
    const { userRegistry: users } = setup()
    const created = users.create(user('a', 'a@x.com'))!
    const old = users.get('id', created.id)!
    const next = users.update(old, { name: 'b' })!
    assert.equal(next.name, 'b')
    assert.equal(users.update(old, { name: 'c' }), null)
    assert.equal(users.delete(old), null)
    assert.equal(users.update({ ...next }, { name: 'c' }), null, '레지스트리가 내준 적 없는 객체')
    assert.throws(() => users.update(next, { id: uid() }), 'id는 바꿀 수 없다')
})

test('User.groups를 교체해도 보이지 않는 그룹의 소속은 유지된다', () => {
    const { db, userRegistry: users, groupRegistry: groups } = setup()
    const alice = users.create(user('alice', 'a@x.com'))!
    const hidden = groups.create(group('sys', alice.id, true))!
    const a = groups.create(group('A', alice.id))!
    const b = groups.create(group('B', alice.id))!
    db.prepare('INSERT INTO group_members VALUES (?, ?)').run(hidden.id, alice.id)

    let current = users.get('id', alice.id)!
    assert.equal(current.groups.size, 0)
    current = users.update(current, { groups: new Set([{ id: a.id, name: 'A' }]) })!
    current = users.update(current, { groups: new Set([{ id: b.id, name: 'B' }]) })!
    assert.deepEqual([...current.groups].map(g => g.name), ['B'])
    const kept = db.prepare('SELECT COUNT(*) c FROM group_members WHERE user_id = ? AND group_id = ?').get(alice.id, hidden.id) as { c: number }
    assert.equal(kept.c, 1)
})

test('조직 집합체를 저장하고 그대로 읽는다', () => {
    const { userRegistry: users, groupRegistry: groups, organizationRegistry: orgs } = setup()
    const alice = users.create(user('alice', 'a@x.com'))!
    const admin = groups.create(group('admin', alice.id))!
    const org = orgs.create({
        id: oid(), name: 'Org', description: 'd', createdAt: at,
        members: new Set([{ user: { id: alice.id, name: 'x' }, joinedAt: at }]),
        invites: new Map([['inv', { toEmail: 'b@x.com', createdAt: at, expiresAt: at }]]),
        groups: new Set([{ id: admin.id, name: '무시됨', color: '#fff', isAdmin: true }]),
        events: new Map([['e1', { title: 't', start: at, end: at, status: 'tentative' as const, createdBy: alice.id, participants: new Set([alice.id]) }]]),
        permissions: new Map([[admin.id, new Set(['user.invite' as const])]]),
    } satisfies Organization)!
    assert.ok(org)
    assert.equal([...org.groups][0]!.name, 'admin', '그룹 이름은 Group이 원본이다')
    assert.deepEqual([...org.events.get('e1')!.participants], [alice.id])
    assert.deepEqual([...org.permissions.get(admin.id)!], ['user.invite'])
    assert.deepEqual([...users.get('id', alice.id)!.organizations].map(o => o.name), ['Org'], 'User.organizations는 members에서 파생된다')

    const bad = { ...org, id: oid(), events: new Map([['e', { ...org.events.get('e1')!, createdBy: uid() }]]) }
    assert.equal(orgs.create(bad), null, '없는 유저를 가리키면 실패하고 되돌린다')
    assert.equal(orgs.get('id', bad.id), null)
})

test('다른 경로로 바뀐 자식 행도 루트를 오래된 것으로 만든다(트리거)', () => {
    const { userRegistry: users, organizationRegistry: orgs } = setup()
    const alice = users.create(user('alice', 'a@x.com'))!
    const bob = users.create(user('bob', 'b@x.com'))!
    const org = orgs.create({
        id: oid(), name: 'O', description: '', createdAt: at, members: new Set([{ user: { id: alice.id, name: 'a' }, joinedAt: at }]),
        invites: new Map(), groups: new Set(), events: new Map(), permissions: new Map(),
    })!
    const aliceOld = users.get('id', alice.id)!
    orgs.update(org, { members: new Set([...org.members, { user: { id: bob.id, name: 'b' }, joinedAt: at }]) })
    assert.equal(users.update(aliceOld, { name: 'n' }), null)
    assert.equal(users.get('id', bob.id)!.organizations.size, 1)
})

test('바깥 트랜잭션을 롤백하면 레지스트리 변경도 되돌아간다', () => {
    const { db, organizationRegistry: orgs } = setup()
    const org = orgs.create({
        id: oid(), name: 'O', description: '', createdAt: at, members: new Set(),
        invites: new Map(), groups: new Set(), events: new Map(), permissions: new Map(),
    })!
    assert.throws(() => db.transaction(() => {
        orgs.update(orgs.get('id', org.id)!, { name: 'Renamed' })
        throw new Error('abort')
    })())
    assert.equal(orgs.get('id', org.id)!.name, 'O')
})

test('getFields: 그룹 권한, 필드 단위, 전체 주소, 회수는 즉시 반영된다', () => {
    const { db, userRegistry: users, groupRegistry: groups, permissionRegistry: perms } = setup()
    const alice = users.create(user('alice', 'a@x.com'))!
    const team = groups.create(group('team', alice.id))!
    const read = perms.create({ id: pid(), subject: team.id, object: new Set([[alice.id, 'name'], [alice.id, 'email']]), action: new Set(['read' as const]) })!

    assert.equal(getFields(alice, alice, ['name']), null, '그룹에 속하기 전')
    db.prepare('INSERT INTO group_members VALUES (?, ?)').run(team.id, alice.id)
    const current = users.get('id', alice.id)!
    assert.deepEqual(getFields(alice, current, ['name', 'email']), { id: alice.id, name: 'alice', email: 'a@x.com' })
    assert.equal(getFields(alice, current, ['name', 'lastLogin']), null, '하나라도 막히면 전부 null')
    assert.deepEqual(getFields(alice, current, []), { id: alice.id })

    const whole = perms.update(read, { object: new Set([[alice.id]]) })!
    assert.ok(getFields(alice, current, ['lastLogin', 'groups']), '[id]는 모든 필드')
    perms.delete(whole)
    assert.equal(getFields(alice, current, ['name']), null)
})

test('삭제: 조직은 역할 그룹, 일정, 초대를, 유저는 자신을 가리키는 권한을 함께 정리한다', () => {
    const { db, userRegistry: users, groupRegistry: groups, organizationRegistry: orgs, permissionRegistry: perms } = setup()
    const alice = users.create(user('alice', 'a@x.com'))!
    const role = groups.create(group('role', alice.id))!
    const org = orgs.create({
        id: oid(), name: 'O', description: '', createdAt: at,
        members: new Set([{ user: { id: alice.id, name: 'a' }, joinedAt: at }]),
        invites: new Map(), groups: new Set([{ id: role.id, name: 'x', color: '#000', isAdmin: false }]),
        events: new Map([['e', { title: '', start: at, end: at, status: 'tentative' as const, createdBy: alice.id, participants: new Set([alice.id]) }]]),
        permissions: new Map(),
    })!
    perms.create({ id: pid(), subject: alice.id, object: new Set([[alice.id, 'name']]), action: new Set(['read' as const]) })
    assert.deepEqual(orgs.delete(org), { id: org.id })
    const rows = (table: string) => (db.prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c
    assert.equal(rows('groups'), 0)
    assert.equal(rows('events'), 0)
    users.delete(users.get('id', alice.id)!)
    assert.equal(rows('permissions'), 0)
    assert.equal(rows('permission_objects'), 0)
})

test('세션: 토큰 해시로 찾고, 시각 순서대로 만료를 정리한다', () => {
    const { db, userRegistry: users, sessionRegistry: sessions } = setup()
    const alice = users.create(user('alice', 'a@x.com'))!
    const make = (expiresAt: string) => sessions.create({
        id: sid(), user: alice.id, tokenHash: `hash-${expiresAt}` as never, createdAt: at, expiresAt: T(expiresAt),
    })!
    const early = make('2026-11-07T01:02:03Z')       // 소수부 없음
    make('2026-11-07T01:02:03.500Z')
    make('2026-11-07T01:02:04Z')
    assert.equal(sessions.get('tokenHash', 'hash-2026-11-07T01:02:03Z')?.id, early.id)
    assert.equal(purgeExpiredSessions(db, T('2026-11-07T01:02:03.600Z')), 2, '소수부가 있어도 순서가 맞아야 한다')
    assert.equal((db.prepare('SELECT COUNT(*) c FROM sessions').get() as { c: number }).c, 1)
    assert.equal(deleteSessionsOfUser(db, alice.id), 1)
    users.delete(users.get('id', alice.id)!)
})

test('초대 조회: 이메일(대소문자 무시)과 유저 쪽 사본의 소유자', () => {
    const { db, userRegistry: users, organizationRegistry: orgs } = setup()
    const alice = users.create(user('alice', 'a@x.com'))!
    const org = orgs.create({
        id: oid(), name: 'O', description: '', createdAt: at, members: new Set(),
        invites: new Map([['i1', { toEmail: 'Zed@X.com', createdAt: at, expiresAt: at }]]),
        groups: new Set(), events: new Map(), permissions: new Map(),
    })!
    assert.deepEqual(findOrgInvitesByEmail(db, 'zed@x.com'), [{ orgId: org.id, id: 'i1' }])
    assert.equal(findInviteOwner(db, 'i1'), null)
    users.update(alice, { invites: new Map([['i1', { from: { id: org.id, name: 'O' }, createdAt: at, expiresAt: at }]]) })
    assert.equal(findInviteOwner(db, 'i1'), alice.id)
})
