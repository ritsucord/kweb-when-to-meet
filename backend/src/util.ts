import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import type { UUID } from 'node:crypto'
import type { Db } from './db.js'
import {
    createRegistries, deleteSessionsOfUser, findInviteOwner, findOrgInvitesByEmail, getFields, purgeExpiredSessions,
} from './registry.js'
import type { Registry } from './registry.js'
import { OrganizationPermissions } from './models.js'
import type {
    Action, Address, DateTime, Entity, EventStatus, Group, GroupId, IdOf, Organization, OrganizationId,
    Permission, PermissionId, Ref, Session, SessionId, User, UserId, VisibleKeys,
} from './models.js'

// 도메인 정책을 지키는 연산들이다. 레지스트리는 저장만 하고, 누가 무엇을 할 수 있는지는 여기서 정한다.
// - 모든 연산은 한 트랜잭션이고, 정책 위반은 DomainError를 던져 전부 되돌린다.
// - 객체가 아니라 id를 받는다. 연산 중간에 다른 레지스트리 호출로 객체가 오래된 것이 되기 쉬워서, 필요할 때마다 다시 읽는다.
// - 변경 연산은 추상 권한(Organization.permissions)을 확인하고, 읽기 연산은 getFields로 실제 권한(Permission)을 확인한다.
//   둘은 같은 원본에서 나오므로 어긋나지 않는다. (setOrgPermissions 참고)

// ---------------------------------------------------------------
// 오류, 컨텍스트
// ---------------------------------------------------------------

export type DomainErrorCode = 'unauthenticated' | 'not_found' | 'forbidden' | 'conflict' | 'invalid'

export class DomainError extends Error {
    readonly code: DomainErrorCode
    constructor(code: DomainErrorCode, message: string) {
        super(message)
        this.name = 'DomainError'
        this.code = code
    }
}

function fail(code: DomainErrorCode, message: string): never {
    throw new DomainError(code, message)
}

export interface Context {
    readonly db: Db
    readonly users: Registry<User>
    readonly groups: Registry<Group>
    readonly organizations: Registry<Organization>
    readonly permissions: Registry<Permission>
    readonly sessions: Registry<Session>
}

export function createContext(db: Db): Context {
    const r = createRegistries(db)
    return {
        db,
        users: r.userRegistry,
        groups: r.groupRegistry,
        organizations: r.organizationRegistry,
        permissions: r.permissionRegistry,
        sessions: r.sessionRegistry,
    }
}

const tx = <R>(ctx: Context, fn: () => R): R => ctx.db.transaction(fn)()

// ---------------------------------------------------------------
// 내부 도구
// ---------------------------------------------------------------

type OrgPermission = OrganizationPermissions[number]
type OrgRole = Organization['groups'] extends ReadonlySet<infer G> ? G : never
type OrgInvite = Organization['invites'] extends ReadonlyMap<string, infer I> ? I : never
type OrgEvent = Organization['events'] extends ReadonlyMap<string, infer E> ? E : never
export type EventEntry = { readonly id: string } & OrgEvent
export type InviteEntry = { readonly id: string } & OrgInvite

const now = (): DateTime => Temporal.Now.instant()
const before = (a: DateTime, b: DateTime) => Temporal.Instant.compare(a, b) < 0
const inviteTtlHours = 24 * 7

const newId = <P extends string>(prefix: P) => `${prefix}:${randomUUID()}` as `${P}:${UUID}`

// 같은 입력에서 항상 같은 UUID가 나온다(UUID v5 형식). 기본 역할 그룹처럼 id를 미리 알 수 있어야 하는 것과,
// 추상 권한 하나에 대응하는 실제 Permission을 다시 찾을 때 쓴다.
function derivedUuid(...parts: string[]): UUID {
    const h = createHash('sha1').update(parts.join('\0')).digest().subarray(0, 16)
    h[6] = (h[6]! & 0x0f) | 0x50
    h[8] = (h[8]! & 0x3f) | 0x80
    const x = h.toString('hex')
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`
}

export type DefaultRole = 'admin' | 'member'
export const defaultGroupId = (orgId: OrganizationId, role: DefaultRole): GroupId =>
    `g:${derivedUuid('org-group', orgId, role)}`

const need = <T>(value: T | null, what: string): T => value ?? fail('not_found', `${what} not found`)

// 방금 읽은 객체로 바꾸는 것이므로 null은 오래됨이 아니라 제약 위반(중복, 존재하지 않는 대상)이다.
function modify<T extends Entity>(
    registry: Registry<T>, id: IdOf<T>, change: (current: T) => Partial<T>, what: string,
): T {
    const current = need(registry.get('id', id), what)
    return registry.update(current, change(current)) ?? fail('conflict', `${what} could not be updated`)
}

const loadUser = (ctx: Context, id: UserId) => need(ctx.users.get('id', id), 'user')
const loadOrg = (ctx: Context, id: OrganizationId) => need(ctx.organizations.get('id', id), 'organization')

const sameEmail = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

// ---------------------------------------------------------------
// 추상 권한 -> 실제 권한
// ---------------------------------------------------------------

interface Grant<T> {
    readonly fields: readonly VisibleKeys<T>[]
    readonly actions: readonly Action[]
}

// 추상 권한 하나가 조직 엔티티의 어떤 필드에 어떤 action을 허용하는지다. null은 필드 단위로 표현되지 않는 권한이다.
// 새 추상 권한을 추가하면 여기에도 반드시 적어야 컴파일된다.
const orgGrants: Record<OrgPermission, Grant<Organization> | null> = {
    'org.read': { fields: ['name', 'description', 'createdAt'], actions: ['read'] },
    'org.delete': null,
    'role.manage': { fields: ['groups', 'permissions'], actions: ['read', 'write', 'create_field', 'delete_field'] },
    'user.list': { fields: ['members'], actions: ['read'] },
    'user.invite': { fields: ['invites'], actions: ['create_field'] },
    'user.invite_list': { fields: ['invites'], actions: ['read'] },
    'user.invite_cancel': { fields: ['invites'], actions: ['delete_field'] },
    'user.remove': { fields: ['members'], actions: ['delete_field'] },
    'event.read': { fields: ['events'], actions: ['read'] },
    'event.create': { fields: ['events'], actions: ['create_field'] },
    'event.update_status': { fields: ['events'], actions: ['write'] },
}

// 비밀번호 같은 보이지 않는 필드는 VisibleKeys에서 빠지므로 여기에 적을 수 없다.
const selfGrants: readonly (Grant<User> & { label: string })[] = [
    { label: 'read', fields: ['name', 'email', 'lastLogin', 'groups', 'organizations', 'invites'], actions: ['read'] },
    { label: 'write', fields: ['name', 'email'], actions: ['write'] },
    { label: 'decline', fields: ['invites'], actions: ['delete_field'] },
]

export const memberPermissions: ReadonlySet<OrgPermission> =
    new Set(['org.read', 'user.list', 'event.read', 'event.create'])
export const adminPermissions: ReadonlySet<OrgPermission> = new Set(OrganizationPermissions)

const sameSet = (a: ReadonlySet<unknown>, b: ReadonlySet<unknown>) =>
    JSON.stringify([...a].map(x => JSON.stringify(x)).sort()) === JSON.stringify([...b].map(x => JSON.stringify(x)).sort())

// 실제 Permission을 원하는 모양으로 맞춘다. 없으면 만들고, 다르면 고치고, 필요 없으면 지운다.
function ensurePermission(ctx: Context, id: PermissionId, subject: UserId | GroupId,
                          grant: { fields: readonly PropertyKey[], actions: readonly Action[] } | null,
                          entityId: Entity['id']): void {
    const existing = ctx.permissions.get('id', id)
    if (grant === null) {
        if (existing !== null && ctx.permissions.delete(existing) === null) fail('conflict', 'permission could not be removed')
        return
    }
    const object = new Set(grant.fields.map(f => [entityId, String(f)] as Address))
    const action = new Set(grant.actions)
    if (existing === null) {
        if (ctx.permissions.create({ id, subject, object, action }) === null) fail('conflict', 'permission could not be created')
    } else if (!sameSet(existing.object, object) || !sameSet(existing.action, action)) {
        if (ctx.permissions.update(existing, { object, action }) === null) fail('conflict', 'permission could not be updated')
    }
}

// 주체에게 준 추상 권한(granted)에 맞게 그 주체의 조직 실제 권한을 다시 만든다.
// 추상 권한 하나당 Permission 하나이고, id는 (조직, 주체, 권한)으로 정해지므로 언제든 같은 행을 다시 찾을 수 있다.
export function syncSubjectPermissions(
    ctx: Context, orgId: OrganizationId, subject: UserId | GroupId, granted: ReadonlySet<OrgPermission>,
): void {
    tx(ctx, () => {
        for (const permission of OrganizationPermissions) {
            const id: PermissionId = `p:${derivedUuid('org-permission', orgId, subject, permission)}`
            const grant = granted.has(permission) ? orgGrants[permission] : null
            ensurePermission(ctx, id, subject, grant, orgId)
        }
    })
}

// 조직의 추상 권한 전체를 실제 권한에 다시 반영한다. orgGrants를 바꾼 뒤처럼 한꺼번에 맞춰야 할 때 쓴다.
export function syncOrgPermissions(ctx: Context, orgId: OrganizationId): void {
    tx(ctx, () => {
        const org = loadOrg(ctx, orgId)
        for (const [subject, granted] of org.permissions) syncSubjectPermissions(ctx, orgId, subject, granted)
    })
}

function grantSelfPermissions(ctx: Context, userId: UserId): void {
    for (const { label, ...grant } of selfGrants) {
        ensurePermission(ctx, `p:${derivedUuid('user-self', userId, label)}`, userId, grant, userId)
    }
}

// ---------------------------------------------------------------
// 조직 안에서의 지위
// ---------------------------------------------------------------

export const isMember = (org: Organization, userId: UserId) =>
    [...org.members].some(m => m.user.id === userId)

// 유저가 가진 이 조직의 역할 그룹들
export function rolesOf(user: User, org: Organization): OrgRole[] {
    const held = new Set([...user.groups].map(g => g.id))
    return [...org.groups].filter(role => held.has(role.id))
}

export const isAdmin = (user: User, org: Organization) => rolesOf(user, org).some(r => r.isAdmin)

// 관리자 역할을 가지면 모든 권한이고, 아니면 본인에게 직접 준 권한과 각 역할에 준 권한의 합이다.
export function effectivePermissions(user: User, org: Organization): ReadonlySet<OrgPermission> {
    const roles = rolesOf(user, org)
    if (roles.some(r => r.isAdmin)) return adminPermissions
    const out = new Set<OrgPermission>(org.permissions.get(user.id))
    for (const role of roles) for (const p of org.permissions.get(role.id) ?? []) out.add(p)
    return out
}

export const hasOrgPermission = (user: User, org: Organization, permission: OrgPermission) =>
    effectivePermissions(user, org).has(permission)

// 없는 조직은 not_found, 멤버가 아니면 forbidden이다.
function asMember(ctx: Context, orgId: OrganizationId, actorId: UserId) {
    const org = loadOrg(ctx, orgId)
    const actor = loadUser(ctx, actorId)
    if (!isMember(org, actorId)) fail('forbidden', 'not a member of this organization')
    return { org, actor }
}

function authorize(ctx: Context, orgId: OrganizationId, actorId: UserId, permission: OrgPermission) {
    const found = asMember(ctx, orgId, actorId)
    if (!hasOrgPermission(found.actor, found.org, permission)) fail('forbidden', `requires ${permission}`)
    return found
}

// 관리자 역할을 가진 멤버 수. excludeRole, excludeUser를 뺀 상태에서 센다.
function countAdmins(ctx: Context, org: Organization, exclude: { role?: GroupId, user?: UserId } = {}): number {
    const adminRoles = new Set([...org.groups].filter(r => r.isAdmin && r.id !== exclude.role).map(r => r.id))
    let count = 0
    for (const m of org.members) {
        if (m.user.id === exclude.user) continue
        const user = ctx.users.get('id', m.user.id)
        if (user !== null && [...user.groups].some(g => adminRoles.has(g.id))) count++
    }
    return count
}

const roleRef = (role: OrgRole) => ({ id: role.id, name: role.name })

// ---------------------------------------------------------------
// 유저, 인증
// ---------------------------------------------------------------

const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 64).toString('hex')

export function verifyPassword(user: User, password: string): boolean {
    const actual = Buffer.from(hashPassword(password, user.passwordSalt), 'hex')
    const expected = Buffer.from(user.passwordHash, 'hex')
    return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export interface NewUser { name: string, email: string, password: string }

// 유저를 만들고 본인 정보에 대한 권한(읽기, 이름·이메일 수정, 초대 거절)을 함께 부여한다.
export function createUser(ctx: Context, input: NewUser): User {
    const salt = randomBytes(16).toString('hex')
    const passwordHash = hashPassword(input.password, salt)
    return tx(ctx, () => {
        const user = ctx.users.create({
            id: newId('u'),
            groups: new Set(),
            name: input.name,
            email: input.email,
            passwordHash: passwordHash as User['passwordHash'],
            passwordSalt: salt as User['passwordSalt'],
            lastLogin: now(),
            organizations: new Set(),
            invites: new Map(),
        }) ?? fail('conflict', 'email already registered')
        grantSelfPermissions(ctx, user.id)
        adoptPendingInvites(ctx, user)
        return loadUser(ctx, user.id)
    })
}

// 가입 전에 이 이메일로 온 초대에 유저 쪽 사본을 만들어 연결한다. 초대를 보낼 때는 가입 여부를 알려 주지 않으므로 필요하다.
// 보낼 때, 수락할 때에 이어 초대 양쪽이 만나는 세 번째 시점이다.
function adoptPendingInvites(ctx: Context, user: User): void {
    const at = now()
    for (const { orgId, id } of findOrgInvitesByEmail(ctx.db, user.email)) {
        const org = ctx.organizations.get('id', orgId)
        const invite = org?.invites.get(id)
        if (org === null || invite === undefined || expired(invite, at)) continue
        modify(ctx.users, user.id, u => ({
            invites: new Map([...u.invites, [id, {
                from: { id: org.id, name: org.name }, createdAt: invite.createdAt, expiresAt: invite.expiresAt,
            }]]),
        }), 'user')
    }
}

const dummySalt = randomBytes(16).toString('hex')

// 이메일이 없는 경우에도 해시를 한 번 계산해서 응답 시간으로 계정 존재 여부가 드러나지 않게 한다.
export function authenticate(ctx: Context, email: string, password: string): User {
    const user = ctx.users.get('email', email)
    if (user === null) {
        hashPassword(password, dummySalt)
        fail('unauthenticated', 'invalid email or password')
    }
    if (!verifyPassword(user, password)) fail('unauthenticated', 'invalid email or password')
    return modify(ctx.users, user.id, () => ({ lastLogin: now() }), 'user')
}

// 비밀번호를 바꾸면 keepSession을 뺀 이 유저의 다른 세션은 모두 끝난다.
export function changePassword(
    ctx: Context, userId: UserId, oldPassword: string, newPassword: string, keepSession?: SessionId,
): void {
    const salt = randomBytes(16).toString('hex')
    const passwordHash = hashPassword(newPassword, salt)
    tx(ctx, () => {
        if (!verifyPassword(loadUser(ctx, userId), oldPassword)) fail('unauthenticated', 'invalid password')
        modify(ctx.users, userId, () => ({
            passwordHash: passwordHash as User['passwordHash'],
            passwordSalt: salt as User['passwordSalt'],
        }), 'user')
        deleteSessionsOfUser(ctx.db, userId, keepSession)
    })
}

// 마지막 관리자인 조직이 있으면 삭제할 수 없다. 나머지 조직에서는 멤버로서 빠진다.
export function deleteUser(ctx: Context, userId: UserId): void {
    tx(ctx, () => {
        const user = loadUser(ctx, userId)
        for (const { id: orgId } of user.organizations) {
            const org = loadOrg(ctx, orgId)
            if (isAdmin(user, org) && countAdmins(ctx, org, { user: userId }) === 0) {
                fail('conflict', `last admin of organization ${orgId}`)
            }
        }
        for (const { id: orgId } of user.organizations) detachMember(ctx, orgId, userId)
        ctx.users.delete(loadUser(ctx, userId)) ?? fail('conflict', 'user could not be deleted')
    })
}

// ---------------------------------------------------------------
// 조직
// ---------------------------------------------------------------

export interface NewOrganization { name: string, description: string }

// 조직과 기본 역할 그룹(관리자, 멤버)을 만들고, 만든 유저를 관리자로 가입시킨다.
export function createOrganization(ctx: Context, creatorId: UserId, input: NewOrganization): Organization {
    return tx(ctx, () => {
        const creator = loadUser(ctx, creatorId)
        const orgId = newId('o')
        const roles: readonly OrgRole[] = [
            { id: defaultGroupId(orgId, 'admin'), name: 'Admin', color: '#ef4444', isAdmin: true },
            { id: defaultGroupId(orgId, 'member'), name: 'Member', color: '#64748b', isAdmin: false },
        ]
        for (const role of roles) {
            ctx.groups.create({ id: role.id, name: role.name, createdBy: orgId, invisible: false })
                ?? fail('conflict', 'role could not be created')
        }
        const permissions = new Map<UserId | GroupId, ReadonlySet<OrgPermission>>([
            [roles[0]!.id, adminPermissions],
            [roles[1]!.id, memberPermissions],
        ])
        ctx.organizations.create({
            id: orgId,
            name: input.name,
            description: input.description,
            members: new Set([{ user: { id: creator.id, name: creator.name }, joinedAt: now() }]),
            invites: new Map(),
            groups: new Set(roles),
            events: new Map(),
            permissions,
            createdAt: now(),
        }) ?? fail('conflict', 'organization could not be created')
        for (const [subject, granted] of permissions) syncSubjectPermissions(ctx, orgId, subject, granted)
        modify(ctx.users, creatorId, u => ({ groups: new Set([...u.groups, ...roles.map(roleRef)]) }), 'user')
        return loadOrg(ctx, orgId)
    })
}

export function deleteOrganization(ctx: Context, orgId: OrganizationId, actorId: UserId): void {
    tx(ctx, () => {
        const { org } = authorize(ctx, orgId, actorId, 'org.delete')
        ctx.organizations.delete(org) ?? fail('conflict', 'organization could not be deleted')
    })
}

// 읽기 연산의 공통 경로다. 실제 권한(Permission)에서 요청한 필드를 모두 읽을 수 있을 때만 그 필드로 투영한 참조를 준다.
export function readOrganization<K extends VisibleKeys<Organization>>(
    ctx: Context, orgId: OrganizationId, actorId: UserId, fields: K[],
): Ref<Organization, K> {
    const { org, actor } = asMember(ctx, orgId, actorId)
    return getFields(actor, org, fields) ?? fail('forbidden', `cannot read ${fields.map(String).join(', ')}`)
}

export const getOrganization = (ctx: Context, orgId: OrganizationId, actorId: UserId) =>
    readOrganization(ctx, orgId, actorId, ['name', 'description', 'createdAt'])

// ---------------------------------------------------------------
// 멤버
// ---------------------------------------------------------------

export interface MemberInfo {
    readonly user: Ref<User, 'name'>
    readonly joinedAt: DateTime
    readonly isAdmin: boolean
}

export function listMembers(ctx: Context, orgId: OrganizationId, actorId: UserId): MemberInfo[] {
    const { members } = readOrganization(ctx, orgId, actorId, ['members'])
    const org = loadOrg(ctx, orgId)
    return [...members].map(m => ({
        user: m.user,
        joinedAt: m.joinedAt,
        isAdmin: isAdmin(loadUser(ctx, m.user.id), org),
    }))
}

// 멤버를 조직에 넣고, 기본 멤버 역할과 주어진 역할을 부여한다.
function attachMember(ctx: Context, orgId: OrganizationId, userId: UserId, extraRoles: readonly GroupId[] = []): void {
    const org = loadOrg(ctx, orgId)
    const roleIds = new Set<GroupId>([defaultGroupId(orgId, 'member'), ...extraRoles])
    const roles = [...org.groups].filter(r => roleIds.has(r.id))
    const user = loadUser(ctx, userId)
    modify(ctx.organizations, orgId, o => ({
        members: new Set([...o.members, { user: { id: user.id, name: user.name }, joinedAt: now() }]),
    }), 'organization')
    modify(ctx.users, userId, u => ({ groups: new Set([...u.groups, ...roles.map(roleRef)]) }), 'user')
}

// 멤버를 조직에서 뺀다. 그 조직의 역할, 직접 준 권한, 그 유저가 만든 일정이 사라지고 다른 일정의 참가에서도 빠진다.
function detachMember(ctx: Context, orgId: OrganizationId, userId: UserId): void {
    const org = loadOrg(ctx, orgId)
    const orgRoleIds = new Set([...org.groups].map(r => r.id))
    modify(ctx.organizations, orgId, o => {
        const events = new Map<string, OrgEvent>()
        for (const [id, e] of o.events) {
            if (e.createdBy === userId) continue
            events.set(id, { ...e, participants: new Set([...e.participants].filter(p => p !== userId)) })
        }
        const permissions = new Map(o.permissions)
        permissions.delete(userId)
        return { members: new Set([...o.members].filter(m => m.user.id !== userId)), events, permissions }
    }, 'organization')
    syncSubjectPermissions(ctx, orgId, userId, new Set())
    modify(ctx.users, userId, u => ({ groups: new Set([...u.groups].filter(g => !orgRoleIds.has(g.id))) }), 'user')
}

// 본인은 스스로 나갈 수 있고, 다른 사람은 user.remove 권한이 있어야 내보낼 수 있다. 관리자는 관리자만 내보낼 수 있고,
// 마지막 관리자는 나갈 수 없다.
export function removeMember(ctx: Context, orgId: OrganizationId, actorId: UserId, targetId: UserId): void {
    tx(ctx, () => {
        const { org, actor } = asMember(ctx, orgId, actorId)
        if (actorId !== targetId && !hasOrgPermission(actor, org, 'user.remove')) fail('forbidden', 'requires user.remove')
        if (!isMember(org, targetId)) fail('not_found', 'member not found')
        const target = actorId === targetId ? actor : loadUser(ctx, targetId)
        if (actorId !== targetId && isAdmin(target, org) && !isAdmin(actor, org)) {
            fail('forbidden', 'only an admin can remove an admin')
        }
        if (isAdmin(target, org) && countAdmins(ctx, org, { user: targetId }) === 0) fail('conflict', 'last admin')
        detachMember(ctx, orgId, targetId)
    })
}

// ---------------------------------------------------------------
// 초대
//   조직 쪽과 유저 쪽에 같은 id로 한 벌씩 둔다. 둘의 동기화는 보낼 때와 수락할 때만 일어난다.
//   취소는 조직 쪽만, 거절은 유저 쪽만 지우고, 남은 쪽은 수락 시도나 만료로 정리된다.
//   가입 전인 이메일로도 초대를 보낼 수 있고(가입 여부를 응답으로 알려 주지 않기 위해), 그 사본은 가입할 때 만들어진다.
// ---------------------------------------------------------------

const expired = (invite: { expiresAt: DateTime }, at: DateTime) => !before(at, invite.expiresAt)

const pending = (invites: ReadonlyMap<string, OrgInvite>, at: DateTime): InviteEntry[] =>
    [...invites].filter(([, i]) => !expired(i, at)).map(([id, i]) => ({ id, ...i }))

// 이메일이 가입된 계정이면 유저 쪽 사본도 만들고, 아니면 조직 쪽에만 두었다가 가입할 때 연결한다.
export function inviteUser(ctx: Context, orgId: OrganizationId, actorId: UserId, email: string): InviteEntry {
    return tx(ctx, () => {
        const { org } = authorize(ctx, orgId, actorId, 'user.invite')
        const invitee = ctx.users.get('email', email)
        if (invitee !== null && isMember(org, invitee.id)) fail('conflict', 'already a member')
        const at = now()
        if (pending(org.invites, at).some(i => sameEmail(i.toEmail, email))) fail('conflict', 'already invited')
        const toEmail = invitee?.email ?? email

        const id = randomUUID()
        const createdAt = at
        const expiresAt = at.add({ hours: inviteTtlHours })
        modify(ctx.organizations, orgId, o => ({
            invites: new Map([...o.invites, [id, { toEmail, createdAt, expiresAt }]]),
        }), 'organization')
        if (invitee !== null) {
            modify(ctx.users, invitee.id, u => ({
                invites: new Map([...u.invites, [id, { from: { id: org.id, name: org.name }, createdAt, expiresAt }]]),
            }), 'user')
        }
        return { id, toEmail, createdAt, expiresAt }
    })
}

export function listOrgInvites(ctx: Context, orgId: OrganizationId, actorId: UserId): InviteEntry[] {
    return pending(readOrganization(ctx, orgId, actorId, ['invites']).invites, now())
}

// 조직 쪽 초대만 지운다. 유저 쪽 사본은 남아 있다가 수락 시도 때 무효로 정리된다.
export function cancelInvite(ctx: Context, orgId: OrganizationId, actorId: UserId, inviteId: string): void {
    tx(ctx, () => {
        const { org } = authorize(ctx, orgId, actorId, 'user.invite_cancel')
        if (!org.invites.has(inviteId)) fail('not_found', 'invite not found')
        modify(ctx.organizations, orgId, o => {
            const invites = new Map(o.invites)
            invites.delete(inviteId)
            return { invites }
        }, 'organization')
    })
}

export interface MyInvite {
    readonly id: string
    readonly from: Ref<Organization, 'name'>
    readonly createdAt: DateTime
    readonly expiresAt: DateTime
}

export function listMyInvites(ctx: Context, userId: UserId): MyInvite[] {
    const at = now()
    return [...loadUser(ctx, userId).invites]
        .filter(([, i]) => !expired(i, at))
        .map(([id, i]) => ({ id, ...i }))
}

const dropUserInvite = (ctx: Context, userId: UserId, inviteId: string) =>
    modify(ctx.users, userId, u => {
        const invites = new Map(u.invites)
        invites.delete(inviteId)
        return { invites }
    }, 'user')

// 내 사본이 없는 초대 id가 남의 것이면 forbidden, 아예 없으면 not_found다.
const missingInviteError = (ctx: Context, inviteId: string) => findInviteOwner(ctx.db, inviteId) === null
    ? new DomainError('not_found', 'invite not found')
    : new DomainError('forbidden', 'not your invite')

// 유저 쪽 초대만 지운다. 조직 쪽 초대는 만료될 때까지 남는다.
export function declineInvite(ctx: Context, userId: UserId, inviteId: string): void {
    tx(ctx, () => {
        if (!loadUser(ctx, userId).invites.has(inviteId)) throw missingInviteError(ctx, inviteId)
        dropUserInvite(ctx, userId, inviteId)
    })
}

// 양쪽 초대가 모두 유효할 때만 수락된다. 조직 쪽이 이미 없거나 만료됐으면(취소, 다른 경로로 처리됨) 남은 유저 쪽 사본을
// 지우고 conflict, 이미 멤버여도 conflict다. 유저 쪽 사본이 만료됐으면 not_found다.
export function acceptInvite(ctx: Context, userId: UserId, inviteId: string): Ref<Organization, 'name'> {
    // 정리한 결과는 남겨야 하므로 실패는 트랜잭션이 끝난 뒤에 던진다.
    const result = tx(ctx, (): { ok: Ref<Organization, 'name'> } | { error: DomainError } => {
        const user = loadUser(ctx, userId)
        const mine = user.invites.get(inviteId)
        if (mine === undefined) return { error: missingInviteError(ctx, inviteId) }
        const at = now()
        if (expired(mine, at)) {
            dropUserInvite(ctx, userId, inviteId)
            return { error: new DomainError('not_found', 'invite expired') }
        }
        const org = ctx.organizations.get('id', mine.from.id)
        const theirs = org?.invites.get(inviteId)
        if (org === null || theirs === undefined || expired(theirs, at) || !sameEmail(theirs.toEmail, user.email)) {
            dropUserInvite(ctx, userId, inviteId)
            return { error: new DomainError('conflict', 'invite was already handled') }
        }
        modify(ctx.organizations, org.id, o => {
            const invites = new Map(o.invites)
            invites.delete(inviteId)
            return { invites }
        }, 'organization')
        dropUserInvite(ctx, userId, inviteId)
        if (isMember(org, userId)) return { error: new DomainError('conflict', 'already a member') }
        attachMember(ctx, org.id, userId)
        return { ok: { id: org.id, name: org.name } }
    })
    if ('error' in result) throw result.error
    return result.ok
}

// ---------------------------------------------------------------
// 역할(그룹)과 추상 권한
// ---------------------------------------------------------------

const isDefaultRole = (orgId: OrganizationId, id: GroupId) =>
    id === defaultGroupId(orgId, 'admin') || id === defaultGroupId(orgId, 'member')

export interface NewRole { name: string, color: string, isAdmin?: boolean }

// 관리자 역할은 관리자만 만들 수 있다. 관리자 역할은 모든 권한을 가진다.
export function createRole(ctx: Context, orgId: OrganizationId, actorId: UserId, input: NewRole): OrgRole {
    return tx(ctx, () => {
        const { org, actor } = authorize(ctx, orgId, actorId, 'role.manage')
        const isAdminRole = input.isAdmin === true
        if (isAdminRole && !isAdmin(actor, org)) fail('forbidden', 'only an admin can create an admin role')
        const role: OrgRole = { id: newId('g'), name: input.name, color: input.color, isAdmin: isAdminRole }
        ctx.groups.create({ id: role.id, name: role.name, createdBy: orgId, invisible: false })
            ?? fail('conflict', 'role could not be created')
        const granted = isAdminRole ? adminPermissions : new Set<OrgPermission>()
        modify(ctx.organizations, orgId, o => ({
            groups: new Set([...o.groups, role]),
            permissions: new Map([...o.permissions, [role.id, granted]]),
        }), 'organization')
        syncSubjectPermissions(ctx, orgId, role.id, granted)
        return role
    })
}

// 기본 역할은 지울 수 없고, 마지막 관리자를 잃게 되는 삭제도 막는다.
export function deleteRole(ctx: Context, orgId: OrganizationId, actorId: UserId, roleId: GroupId): void {
    tx(ctx, () => {
        const { org } = authorize(ctx, orgId, actorId, 'role.manage')
        const role = [...org.groups].find(r => r.id === roleId) ?? fail('not_found', 'role not found')
        if (isDefaultRole(orgId, roleId)) fail('forbidden', 'default roles cannot be deleted')
        if (role.isAdmin && countAdmins(ctx, org, { role: roleId }) === 0) fail('conflict', 'last admin')
        // 그룹을 지우면 소속, 조직의 역할 목록, 이 그룹에 준 권한이 함께 정리된다.
        ctx.groups.delete(need(ctx.groups.get('id', roleId), 'role')) ?? fail('conflict', 'role could not be deleted')
    })
}

function roleChange(ctx: Context, orgId: OrganizationId, actorId: UserId, targetId: UserId, roleId: GroupId) {
    const { org, actor } = authorize(ctx, orgId, actorId, 'role.manage')
    const role = [...org.groups].find(r => r.id === roleId) ?? fail('not_found', 'role not found')
    if (!isMember(org, targetId)) fail('not_found', 'member not found')
    if (role.isAdmin && !isAdmin(actor, org)) fail('forbidden', 'only an admin can change an admin role')
    return { org, role }
}

export function assignRole(ctx: Context, orgId: OrganizationId, actorId: UserId, targetId: UserId, roleId: GroupId): void {
    tx(ctx, () => {
        const { role } = roleChange(ctx, orgId, actorId, targetId, roleId)
        modify(ctx.users, targetId, u => ({ groups: new Set([...u.groups, roleRef(role)]) }), 'user')
    })
}

// 모든 멤버는 기본 멤버 역할을 유지한다. 마지막 관리자의 관리자 역할은 뺄 수 없다.
export function unassignRole(ctx: Context, orgId: OrganizationId, actorId: UserId, targetId: UserId, roleId: GroupId): void {
    tx(ctx, () => {
        const { org, role } = roleChange(ctx, orgId, actorId, targetId, roleId)
        if (roleId === defaultGroupId(orgId, 'member')) fail('forbidden', 'the member role cannot be removed')
        const target = loadUser(ctx, targetId)
        if (role.isAdmin && isAdmin(target, org)) {
            const otherAdminRoles = rolesOf(target, org).filter(r => r.isAdmin && r.id !== roleId)
            if (otherAdminRoles.length === 0 && countAdmins(ctx, org, { user: targetId }) === 0) fail('conflict', 'last admin')
        }
        modify(ctx.users, targetId, u => ({ groups: new Set([...u.groups].filter(g => g.id !== roleId)) }), 'user')
    })
}

// 주체(멤버 또는 역할)의 추상 권한을 바꾸고 실제 권한도 같은 트랜잭션에서 맞춘다.
// 관리자가 아니면 자신이 가진 권한만 줄 수 있고, 관리자 역할의 권한은 바꿀 수 없다. (항상 전부)
export function setOrgPermissions(
    ctx: Context, orgId: OrganizationId, actorId: UserId, subject: UserId | GroupId, granted: ReadonlySet<OrgPermission>,
): void {
    tx(ctx, () => {
        const { org, actor } = authorize(ctx, orgId, actorId, 'role.manage')
        for (const p of granted) {
            if (!OrganizationPermissions.includes(p)) fail('invalid', `unknown permission ${String(p)}`)
        }
        const role = [...org.groups].find(r => r.id === subject)
        if (role === undefined && !isMember(org, subject as UserId)) fail('not_found', 'subject not found')
        if (role?.isAdmin) fail('forbidden', 'admin role permissions are fixed')
        if (!isAdmin(actor, org)) {
            const mine = effectivePermissions(actor, org)
            for (const p of granted) if (!mine.has(p)) fail('forbidden', `cannot grant ${p}`)
        }
        modify(ctx.organizations, orgId, o => {
            const permissions = new Map(o.permissions)
            if (granted.size === 0) permissions.delete(subject)
            else permissions.set(subject, new Set(granted))
            return { permissions }
        }, 'organization')
        syncSubjectPermissions(ctx, orgId, subject, granted)
    })
}

// ---------------------------------------------------------------
// 일정
// ---------------------------------------------------------------

export interface NewEvent {
    title: string
    start: DateTime
    end: DateTime
    status?: EventStatus
    participants?: readonly UserId[]
}

// 참가자는 모두 조직 멤버여야 하고, 생략하면 만든 사람뿐이다. 상태는 만든 사람이 정한다.
export function createEvent(ctx: Context, orgId: OrganizationId, actorId: UserId, input: NewEvent): EventEntry {
    return tx(ctx, () => {
        const { org } = authorize(ctx, orgId, actorId, 'event.create')
        const status = input.status ?? 'tentative'
        if (!before(input.start, input.end)) fail('invalid', 'start must be before end')
        const participants = new Set(input.participants ?? [actorId])
        for (const id of participants) if (!isMember(org, id)) fail('invalid', `participant ${id} is not a member`)

        const id = randomUUID()
        const event: OrgEvent = {
            title: input.title, start: input.start, end: input.end, status, createdBy: actorId, participants,
        }
        modify(ctx.organizations, orgId, o => ({ events: new Map([...o.events, [id, event]]) }), 'organization')
        return { id, ...event }
    })
}

// 일정의 작성자가 바꾼다. 다른 사람의 일정은 event.update_status 권한이 있어야 바꿀 수 있다. (기본으로는 관리자)
export function updateEventStatus(
    ctx: Context, orgId: OrganizationId, actorId: UserId, eventId: string, status: EventStatus,
): EventEntry {
    return tx(ctx, () => {
        const { org, actor } = asMember(ctx, orgId, actorId)
        const event = org.events.get(eventId) ?? fail('not_found', 'event not found')
        if (event.createdBy !== actorId && !hasOrgPermission(actor, org, 'event.update_status')) {
            fail('forbidden', 'only the creator can change the status')
        }
        const updated: OrgEvent = { ...event, status }
        modify(ctx.organizations, orgId, o => ({ events: new Map([...o.events, [eventId, updated]]) }), 'organization')
        return { id: eventId, ...updated }
    })
}

export interface EventFilter {
    status?: EventStatus
    // [from, to)와 겹치는 일정
    from?: DateTime
    to?: DateTime
    participantId?: UserId
    createdBy?: UserId
}

export function filterEvents(events: ReadonlyMap<string, OrgEvent>, filter: EventFilter = {}): EventEntry[] {
    return [...events]
        .filter(([, e]) =>
            (filter.status === undefined || e.status === filter.status)
            && (filter.from === undefined || before(filter.from, e.end))
            && (filter.to === undefined || before(e.start, filter.to))
            && (filter.participantId === undefined || e.participants.has(filter.participantId))
            && (filter.createdBy === undefined || e.createdBy === filter.createdBy))
        .map(([id, e]) => ({ id, ...e }))
}

export function listEvents(ctx: Context, orgId: OrganizationId, actorId: UserId, filter: EventFilter = {}): EventEntry[] {
    return filterEvents(readOrganization(ctx, orgId, actorId, ['events']).events, filter)
}

export function getEvent(ctx: Context, orgId: OrganizationId, actorId: UserId, eventId: string): EventEntry {
    const event = readOrganization(ctx, orgId, actorId, ['events']).events.get(eventId)
    return event === undefined ? fail('not_found', 'event not found') : { id: eventId, ...event }
}

// ---------------------------------------------------------------
// 조직 요약
// ---------------------------------------------------------------

// 조직 이름처럼 멤버라면 누구나 아는 정보. 읽기 권한과 별개로 멤버 여부만 확인한다.
export function getOrgRef(ctx: Context, orgId: OrganizationId, actorId: UserId): Ref<Organization, 'name'> {
    const { org } = asMember(ctx, orgId, actorId)
    return { id: org.id, name: org.name }
}

export function countMembers(ctx: Context, orgId: OrganizationId, actorId: UserId): number {
    return asMember(ctx, orgId, actorId).org.members.size
}

export function membershipOf(ctx: Context, orgId: OrganizationId, userId: UserId): { joinedAt: DateTime, isAdmin: boolean } {
    const org = loadOrg(ctx, orgId)
    const member = [...org.members].find(m => m.user.id === userId) ?? fail('not_found', 'member not found')
    return { joinedAt: member.joinedAt, isAdmin: isAdmin(loadUser(ctx, userId), org) }
}

export interface OrgSummaryInfo {
    readonly id: OrganizationId
    readonly name: string
    readonly isAdmin: boolean
}

export function listMyOrgs(ctx: Context, userId: UserId): OrgSummaryInfo[] {
    const user = loadUser(ctx, userId)
    return [...user.organizations].map(({ id, name }) => ({ id, name, isAdmin: isAdmin(user, loadOrg(ctx, id)) }))
}

// ---------------------------------------------------------------
// 세션
//   id는 API에 공개되는 식별자이고, 인증에는 따로 발급한 비밀 토큰을 쓴다. 토큰은 해시만 저장한다.
// ---------------------------------------------------------------

const sessionTtlHours = 24 * 14
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

// 이메일과 비밀번호가 맞으면 세션을 만든다. 토큰은 이때 한 번만 알 수 있다.
export function createSession(ctx: Context, email: string, password: string): { session: Session, token: string } {
    const user = authenticate(ctx, email, password)
    const token = randomBytes(32).toString('base64url')
    return tx(ctx, () => {
        const at = now()
        const session = ctx.sessions.create({
            id: newId('s'),
            user: user.id,
            tokenHash: hashToken(token) as Session['tokenHash'],
            createdAt: at,
            expiresAt: at.add({ hours: sessionTtlHours }),
        }) ?? fail('conflict', 'session could not be created')
        return { session, token }
    })
}

// 토큰으로 세션과 유저를 찾는다. 없거나 만료됐으면 null이고, 만료된 세션은 지운다.
export function resolveSession(ctx: Context, token: string): { session: Session, user: User } | null {
    if (token === '') return null
    const session = ctx.sessions.get('tokenHash', hashToken(token))
    if (session === null) return null
    if (expired(session, now())) {
        ctx.sessions.delete(session)
        return null
    }
    return { session, user: loadUser(ctx, session.user) }
}

export function endSession(ctx: Context, sessionId: SessionId): void {
    const session = ctx.sessions.get('id', sessionId)
    if (session !== null) ctx.sessions.delete(session)
}

// 본인 세션만 지울 수 있다. 남의 세션은 forbidden, 없는 세션은 not_found다.
export function deleteSession(ctx: Context, actorId: UserId, sessionId: SessionId): void {
    tx(ctx, () => {
        const session = need(ctx.sessions.get('id', sessionId), 'session')
        if (session.user !== actorId) fail('forbidden', 'not your session')
        ctx.sessions.delete(session) ?? fail('conflict', 'session could not be deleted')
    })
}

// 만료된 세션을 모두 지우고 지운 수를 돌려준다. 주기적으로 호출한다.
export const purgeSessions = (ctx: Context): number => purgeExpiredSessions(ctx.db, now())
