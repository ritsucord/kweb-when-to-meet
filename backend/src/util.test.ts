import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getFields } from './registry.js'
import * as U from './util.js'
import { count, expectCode, newContext, T } from './testing.js'

// 가입 -> 조직 생성(관리자) -> 초대/수락으로 멤버 한 명까지 만들어 둔 상태에서 시작한다.
function world() {
    const ctx = newContext()
    const alice = U.createUser(ctx, { name: 'alice', email: 'alice@x.com', password: 'pw-alice' })
    const bob = U.createUser(ctx, { name: 'bob', email: 'bob@x.com', password: 'pw-bob' })
    const org = U.createOrganization(ctx, alice.id, { name: 'Org', description: 'd' })
    U.acceptInvite(ctx, bob.id, U.inviteUser(ctx, org.id, alice.id, 'bob@x.com').id)
    return {
        ctx, alice, bob, org,
        adminRole: U.defaultGroupId(org.id, 'admin'),
        memberRole: U.defaultGroupId(org.id, 'member'),
        reload: () => ctx.organizations.get('id', org.id)!,
    }
}

const event = (title: string, day: number) => ({
    title, start: T(`2026-11-${day}T01:00:00Z`), end: T(`2026-11-${day}T02:00:00Z`),
})

test('유저 생성: 본인 정보 권한을 함께 부여하고 비밀번호는 부여하지 않는다', () => {
    const ctx = newContext()
    const alice = U.createUser(ctx, { name: 'alice', email: 'alice@x.com', password: 'pw-alice' })
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM permissions WHERE subject = ?', alice.id), 3)
    assert.equal(getFields(alice, alice, ['name', 'email', 'organizations'])?.name, 'alice')
    assert.ok(getFields(alice, alice, ['groups', 'invites', 'lastLogin']))
    assert.equal(count(ctx, `SELECT COUNT(*) c FROM permission_objects WHERE address LIKE '%password%'`), 0)

    const bob = U.createUser(ctx, { name: 'bob', email: 'bob@x.com', password: 'pw-bob' })
    assert.equal(getFields(bob, alice, ['name']), null, '남의 필드는 읽을 수 없다')
})

test('유저 생성: 중복 이메일은 conflict이고 아무것도 남지 않는다', () => {
    const ctx = newContext()
    U.createUser(ctx, { name: 'a', email: 'alice@x.com', password: 'pw' })
    expectCode(() => U.createUser(ctx, { name: 'x', email: 'ALICE@x.com', password: 'pw' }), 'conflict')
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM users'), 1)
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM permissions'), 3)
})

test('인증과 비밀번호 변경', () => {
    const ctx = newContext()
    const alice = U.createUser(ctx, { name: 'a', email: 'alice@x.com', password: 'pw-alice' })
    assert.equal(U.authenticate(ctx, 'ALICE@x.com', 'pw-alice').id, alice.id)
    expectCode(() => U.authenticate(ctx, 'alice@x.com', 'nope'), 'unauthenticated')
    expectCode(() => U.authenticate(ctx, 'ghost@x.com', 'nope'), 'unauthenticated')
    expectCode(() => U.changePassword(ctx, alice.id, 'wrong', 'new'), 'unauthenticated')
    U.changePassword(ctx, alice.id, 'pw-alice', 'new-pw')
    expectCode(() => U.authenticate(ctx, 'alice@x.com', 'pw-alice'), 'unauthenticated')
    assert.ok(U.authenticate(ctx, 'alice@x.com', 'new-pw'))
})

test('세션: 발급, 토큰 조회, 종료, 남의 세션(403)과 없는 세션(404)', () => {
    const ctx = newContext()
    const alice = U.createUser(ctx, { name: 'a', email: 'alice@x.com', password: 'pw-alice' })
    const bob = U.createUser(ctx, { name: 'b', email: 'bob@x.com', password: 'pw-bob' })
    const { session, token } = U.createSession(ctx, 'alice@x.com', 'pw-alice')
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM sessions WHERE token_hash = ?', token), 0, '토큰은 평문으로 저장하지 않는다')
    assert.equal(U.resolveSession(ctx, token)?.user.id, alice.id)
    assert.equal(U.resolveSession(ctx, 'wrong'), null)
    assert.equal(U.resolveSession(ctx, ''), null)
    expectCode(() => U.createSession(ctx, 'alice@x.com', 'bad'), 'unauthenticated')

    expectCode(() => U.deleteSession(ctx, bob.id, session.id), 'forbidden')
    expectCode(() => U.deleteSession(ctx, alice.id, 's:00000000-0000-4000-8000-000000000000'), 'not_found')
    const other = U.createSession(ctx, 'alice@x.com', 'pw-alice')
    U.deleteSession(ctx, alice.id, other.session.id)
    assert.equal(U.resolveSession(ctx, other.token), null)
    U.endSession(ctx, session.id)
    assert.equal(U.resolveSession(ctx, token), null)
})

test('세션: 만료되면 조회가 null이고 지워진다. 비밀번호를 바꾸면 다른 세션이 끝난다', () => {
    const ctx = newContext()
    const alice = U.createUser(ctx, { name: 'a', email: 'alice@x.com', password: 'pw-alice' })
    const expiring = U.createSession(ctx, 'alice@x.com', 'pw-alice')
    ctx.db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', expiring.session.id)
    assert.equal(U.resolveSession(ctx, expiring.token), null)
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM sessions'), 0)

    const keep = U.createSession(ctx, 'alice@x.com', 'pw-alice')
    const drop = U.createSession(ctx, 'alice@x.com', 'pw-alice')
    U.changePassword(ctx, alice.id, 'pw-alice', 'new-pw', keep.session.id)
    assert.ok(U.resolveSession(ctx, keep.token))
    assert.equal(U.resolveSession(ctx, drop.token), null)

    ctx.db.prepare('UPDATE sessions SET expires_at = ?').run('2000-01-01T00:00:00.000Z')
    assert.equal(U.purgeSessions(ctx), 1)
})

test('조직 생성: 기본 역할, 만든 사람은 관리자, 추상 권한이 실제 권한으로 만들어진다', () => {
    const { ctx, alice, org, adminRole, memberRole } = world()
    assert.deepEqual([...org.groups].map(g => g.id).sort(), [adminRole, memberRole].sort())
    assert.deepEqual([...org.permissions.get(adminRole)!].sort(), [...U.adminPermissions].sort())
    const current = ctx.users.get('id', alice.id)!
    assert.equal(U.isAdmin(current, org), true)
    assert.ok(getFields(current, org, ['members', 'invites', 'events', 'groups', 'permissions']))
    // org.delete는 필드로 표현되지 않아 실제 권한 행이 없다.
    const rows = count(ctx, 'SELECT COUNT(*) c FROM permissions WHERE subject IN (?, ?)', adminRole, memberRole)
    assert.equal(rows, (U.adminPermissions.size - 1) + U.memberPermissions.size)
})

test('초대: 취소는 조직 쪽만, 거절은 유저 쪽만 지운다', () => {
    const { ctx, alice, org } = world()
    const carol = U.createUser(ctx, { name: 'c', email: 'carol@x.com', password: 'pw-carol' })
    const first = U.inviteUser(ctx, org.id, alice.id, 'carol@x.com')
    assert.equal(U.listMyInvites(ctx, carol.id).length, 1)
    expectCode(() => U.inviteUser(ctx, org.id, alice.id, 'carol@x.com'), 'conflict')

    U.cancelInvite(ctx, org.id, alice.id, first.id)
    assert.equal(U.listOrgInvites(ctx, org.id, alice.id).length, 0)
    assert.equal(U.listMyInvites(ctx, carol.id).length, 1, '유저 쪽 사본은 남는다')
    expectCode(() => U.acceptInvite(ctx, carol.id, first.id), 'conflict')
    assert.equal(U.listMyInvites(ctx, carol.id).length, 0, '실패한 수락이 남은 사본을 정리한다')

    const second = U.inviteUser(ctx, org.id, alice.id, 'carol@x.com')
    U.declineInvite(ctx, carol.id, second.id)
    assert.equal(U.listMyInvites(ctx, carol.id).length, 0)
    assert.equal(U.listOrgInvites(ctx, org.id, alice.id).length, 1, '조직 쪽은 만료될 때까지 남는다')
    expectCode(() => U.inviteUser(ctx, org.id, alice.id, 'carol@x.com'), 'conflict')
})

test('초대: 남의 초대는 403, 없는 초대는 404, 이미 멤버는 409', () => {
    const { ctx, alice, bob, org } = world()
    const carol = U.createUser(ctx, { name: 'c', email: 'carol@x.com', password: 'pw-carol' })
    const invite = U.inviteUser(ctx, org.id, alice.id, 'carol@x.com')
    expectCode(() => U.acceptInvite(ctx, bob.id, invite.id), 'forbidden')
    expectCode(() => U.declineInvite(ctx, bob.id, invite.id), 'forbidden')
    expectCode(() => U.acceptInvite(ctx, bob.id, 'no-such-invite'), 'not_found')
    expectCode(() => U.declineInvite(ctx, carol.id, 'no-such-invite'), 'not_found')
    expectCode(() => U.inviteUser(ctx, org.id, alice.id, 'bob@x.com'), 'conflict')
    U.acceptInvite(ctx, carol.id, invite.id)
    expectCode(() => U.acceptInvite(ctx, carol.id, invite.id), 'not_found')
})

test('초대: 가입 전 이메일에도 보낼 수 있고, 가입하면 연결되어 수락할 수 있다', () => {
    const { ctx, alice, org } = world()
    const invite = U.inviteUser(ctx, org.id, alice.id, 'Dave@X.com')
    assert.equal(invite.toEmail, 'Dave@X.com')
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM user_invites WHERE id = ?', invite.id), 0)

    const dave = U.createUser(ctx, { name: 'd', email: 'dave@x.com', password: 'pw-dave' })
    assert.deepEqual(U.listMyInvites(ctx, dave.id).map(i => i.id), [invite.id])
    U.acceptInvite(ctx, dave.id, invite.id)
    assert.equal(U.membershipOf(ctx, org.id, dave.id).isAdmin, false)
})

test('초대: 기본 역할(멤버)로 들어오고 양쪽 사본이 사라진다', () => {
    const { ctx, alice, bob, org, memberRole } = world()
    assert.deepEqual(U.rolesOf(ctx.users.get('id', bob.id)!, ctx.organizations.get('id', org.id)!).map(r => r.id), [memberRole])
    assert.equal(U.listMyInvites(ctx, bob.id).length, 0)
    assert.equal(U.listOrgInvites(ctx, org.id, alice.id).length, 0)
    assert.equal(U.countMembers(ctx, org.id, alice.id), 2)
})

test('권한 확인: 비멤버는 403, 없는 조직은 404, 멤버라도 권한이 없으면 403', () => {
    const { ctx, alice, bob, org } = world()
    const carol = U.createUser(ctx, { name: 'c', email: 'carol@x.com', password: 'pw-carol' })
    expectCode(() => U.getOrganization(ctx, org.id, carol.id), 'forbidden')
    expectCode(() => U.getOrganization(ctx, 'o:00000000-0000-4000-8000-000000000000', alice.id), 'not_found')
    expectCode(() => U.listOrgInvites(ctx, org.id, bob.id), 'forbidden')
    expectCode(() => U.inviteUser(ctx, org.id, bob.id, 'carol@x.com'), 'forbidden')
    expectCode(() => U.deleteOrganization(ctx, org.id, bob.id), 'forbidden')
    expectCode(() => U.deleteOrganization(ctx, org.id, carol.id), 'forbidden')
})

test('추상 권한을 주고 회수하면 실제 권한이 같이 생기고 사라진다', () => {
    const { ctx, alice, bob, org } = world()
    const bobRows = () => count(ctx, 'SELECT COUNT(*) c FROM permissions WHERE subject = ?', bob.id)
    assert.equal(bobRows(), 3)
    expectCode(() => U.listOrgInvites(ctx, org.id, bob.id), 'forbidden')

    U.setOrgPermissions(ctx, org.id, alice.id, bob.id, new Set(['user.invite_list']))
    assert.equal(U.listOrgInvites(ctx, org.id, bob.id).length, 0)
    assert.equal(bobRows(), 4)

    U.setOrgPermissions(ctx, org.id, alice.id, bob.id, new Set())
    expectCode(() => U.listOrgInvites(ctx, org.id, bob.id), 'forbidden')
    assert.equal(bobRows(), 3)
})

test('역할에 준 권한은 소속 멤버 전체에 반영되고, 조직 전체를 다시 맞춰도 그대로다', () => {
    const { ctx, alice, bob, org, memberRole } = world()
    U.setOrgPermissions(ctx, org.id, alice.id, memberRole, new Set([...U.memberPermissions, 'user.invite_list']))
    assert.equal(U.listOrgInvites(ctx, org.id, bob.id).length, 0)
    const before = count(ctx, 'SELECT COUNT(*) c FROM permissions')
    U.syncOrgPermissions(ctx, org.id)
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM permissions'), before)
})

test('권한 변경 정책: role.manage 필요, 관리자 역할은 고정, 가진 것만 부여, 알 수 없는 권한은 거부', () => {
    const { ctx, alice, bob, org, adminRole, memberRole } = world()
    expectCode(() => U.setOrgPermissions(ctx, org.id, bob.id, bob.id, new Set(['org.delete'])), 'forbidden')
    expectCode(() => U.setOrgPermissions(ctx, org.id, alice.id, adminRole, new Set()), 'forbidden')
    expectCode(() => U.setOrgPermissions(ctx, org.id, alice.id, bob.id, new Set(['nope' as never])), 'invalid')

    const manager = U.createRole(ctx, org.id, alice.id, { name: 'Manager', color: '#0f0' })
    U.setOrgPermissions(ctx, org.id, alice.id, manager.id, new Set(['role.manage', 'org.read']))
    U.assignRole(ctx, org.id, alice.id, bob.id, manager.id)
    expectCode(() => U.setOrgPermissions(ctx, org.id, bob.id, memberRole, new Set(['org.delete'])), 'forbidden')
    U.setOrgPermissions(ctx, org.id, bob.id, memberRole, new Set(['org.read', 'user.list']))
    expectCode(() => U.createRole(ctx, org.id, bob.id, { name: 'A2', color: '#000', isAdmin: true }), 'forbidden')
    expectCode(() => U.assignRole(ctx, org.id, bob.id, bob.id, adminRole), 'forbidden')
})

test('역할: 기본 역할은 지우거나 뺄 수 없고, 역할을 지우면 권한과 소속이 함께 정리된다', () => {
    const { ctx, alice, bob, org, memberRole } = world()
    expectCode(() => U.unassignRole(ctx, org.id, alice.id, bob.id, memberRole), 'forbidden')
    expectCode(() => U.deleteRole(ctx, org.id, alice.id, memberRole), 'forbidden')

    const role = U.createRole(ctx, org.id, alice.id, { name: 'Helper', color: '#111' })
    U.setOrgPermissions(ctx, org.id, alice.id, role.id, new Set(['event.read']))
    U.assignRole(ctx, org.id, alice.id, bob.id, role.id)
    U.unassignRole(ctx, org.id, alice.id, bob.id, role.id)
    U.assignRole(ctx, org.id, alice.id, bob.id, role.id)
    assert.ok(count(ctx, 'SELECT COUNT(*) c FROM permissions WHERE subject = ?', role.id) > 0)
    U.deleteRole(ctx, org.id, alice.id, role.id)
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM permissions WHERE subject = ?', role.id), 0)
    assert.equal(U.rolesOf(ctx.users.get('id', bob.id)!, ctx.organizations.get('id', org.id)!).length, 1)
})

test('일정: 기본값, 검증, 작성자가 상태를 바꾸고 남의 일정은 권한이 있어야 바꾼다', () => {
    const { ctx, alice, bob, org } = world()
    const mine = U.createEvent(ctx, org.id, bob.id, event('lunch', 10))
    assert.equal(mine.status, 'tentative')
    assert.deepEqual([...mine.participants], [bob.id])

    expectCode(() => U.createEvent(ctx, org.id, bob.id, { ...event('x', 10), end: T('2026-11-10T00:00:00Z') }), 'invalid')
    expectCode(() => U.createEvent(ctx, org.id, bob.id, { ...event('x', 10), participants: ['u:00000000-0000-4000-8000-000000000000'] }), 'invalid')

    assert.equal(U.createEvent(ctx, org.id, bob.id, { ...event('c', 12), status: 'confirmed' }).status, 'confirmed')
    assert.equal(U.updateEventStatus(ctx, org.id, bob.id, mine.id, 'confirmed').status, 'confirmed')
    expectCode(() => U.updateEventStatus(ctx, org.id, bob.id, U.createEvent(ctx, org.id, alice.id, event('a', 11)).id, 'confirmed'), 'forbidden')
    const bobsOther = U.createEvent(ctx, org.id, bob.id, event('b2', 13))
    assert.equal(U.updateEventStatus(ctx, org.id, alice.id, bobsOther.id, 'confirmed').status, 'confirmed', '관리자는 다른 사람의 일정도 바꾼다')
    expectCode(() => U.updateEventStatus(ctx, org.id, alice.id, 'nope', 'confirmed'), 'not_found')
})

test('일정 조회와 필터', () => {
    const { ctx, alice, bob, org } = world()
    const e1 = U.createEvent(ctx, org.id, bob.id, event('lunch', 10))
    const e2 = U.createEvent(ctx, org.id, alice.id, { ...event('standup', 11), status: 'confirmed', participants: [alice.id, bob.id] })
    assert.equal(U.listEvents(ctx, org.id, bob.id).length, 2)
    assert.deepEqual(U.listEvents(ctx, org.id, bob.id, { createdBy: alice.id }).map(e => e.id), [e2.id])
    assert.deepEqual(U.listEvents(ctx, org.id, bob.id, { status: 'tentative' }).map(e => e.id), [e1.id])
    assert.deepEqual(U.listEvents(ctx, org.id, bob.id, { participantId: alice.id }).map(e => e.id), [e2.id])
    assert.deepEqual(U.listEvents(ctx, org.id, bob.id, { from: T('2026-11-10T01:30:00Z'), to: T('2026-11-10T23:00:00Z') }).map(e => e.id), [e1.id])
    assert.equal(U.getEvent(ctx, org.id, bob.id, e2.id).title, 'standup')
    expectCode(() => U.getEvent(ctx, org.id, bob.id, 'nope'), 'not_found')
})

test('멤버 탈퇴: 권한과 마지막 관리자 보호, 떠나면 일정과 역할이 정리된다', () => {
    const { ctx, alice, bob, org } = world()
    const carol = U.createUser(ctx, { name: 'c', email: 'carol@x.com', password: 'pw-carol' })
    U.acceptInvite(ctx, carol.id, U.inviteUser(ctx, org.id, alice.id, 'carol@x.com').id)
    expectCode(() => U.removeMember(ctx, org.id, bob.id, carol.id), 'forbidden')
    expectCode(() => U.removeMember(ctx, org.id, alice.id, 'u:00000000-0000-4000-8000-000000000000'), 'not_found')
    expectCode(() => U.removeMember(ctx, org.id, alice.id, alice.id), 'conflict')
    expectCode(() => U.deleteUser(ctx, alice.id), 'conflict')

    const mine = U.createEvent(ctx, org.id, bob.id, event('mine', 10))
    const shared = U.createEvent(ctx, org.id, alice.id, { ...event('shared', 11), participants: [alice.id, bob.id] })
    U.removeMember(ctx, org.id, bob.id, bob.id)
    const events = U.listEvents(ctx, org.id, alice.id)
    assert.deepEqual(events.map(e => e.id), [shared.id])
    assert.deepEqual([...events[0]!.participants], [alice.id])
    assert.equal(ctx.users.get('id', bob.id)!.groups.size, 0)
    expectCode(() => U.getOrganization(ctx, org.id, bob.id), 'forbidden')
    void mine

    U.removeMember(ctx, org.id, alice.id, carol.id)
    assert.equal(count(ctx, `SELECT COUNT(*) c FROM permissions WHERE subject = ? AND id IN (SELECT permission_id FROM permission_objects WHERE address LIKE ?)`, carol.id, `%${org.id}%`), 0)
})

test('삭제: 조직은 역할 그룹, 일정, 조직 권한을, 유저는 본인 권한을 정리한다', () => {
    const { ctx, alice, bob, org } = world()
    U.createEvent(ctx, org.id, bob.id, event('mine', 10))
    U.deleteOrganization(ctx, org.id, alice.id)
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM groups'), 0)
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM events'), 0)
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM permissions'), 6, '두 유저의 본인 권한만 남는다')
    U.deleteUser(ctx, bob.id)
    assert.equal(count(ctx, 'SELECT COUNT(*) c FROM permissions WHERE subject = ?', bob.id), 0)
})

test('내 조직 목록과 역할 요약', () => {
    const { ctx, alice, bob, org } = world()
    assert.deepEqual(U.listMyOrgs(ctx, alice.id).map(o => [o.id, o.isAdmin]), [[org.id, true]])
    assert.deepEqual(U.listMyOrgs(ctx, bob.id).map(o => [o.id, o.isAdmin]), [[org.id, false]])
    assert.deepEqual(U.listMembers(ctx, org.id, bob.id).map(m => [m.user.name, m.isAdmin]).sort(), [['alice', true], ['bob', false]])
    assert.deepEqual(U.getOrgRef(ctx, org.id, bob.id), { id: org.id, name: 'Org' })
})
