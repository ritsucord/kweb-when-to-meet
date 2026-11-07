import type { UUID } from 'crypto'

// Id는 리소스, 참조는 리소스에 대한 모든 접근 권한을 의미
// 마스크를 통해 권한 조절, 승격을 위해서는 별도 메서드 사용
// - 박효운 -

export type DateTime = Temporal.Instant

export type IdOf<T extends Entity> = T['id']

export type EntityId = `${string}:${UUID}`

export type Entity<T extends EntityId=EntityId> = { readonly id: T }

export type Invisible = { __invisible__: true }

export type VisibleKeys<T> = { [K in keyof T]: NonNullable<T[K]> extends Invisible? never : K }[keyof T]

export type Ref<T extends Entity, K extends VisibleKeys<T>=never> = Pick<T, 'id' | K>

export type Action = 'read' | 'write' | 'create_field' | 'delete_field'

export type Address<T extends EntityId=EntityId> = [T, ...string[]]

export type PermissionId = `p:${UUID}`

export interface Permission<T extends Entity=Entity, U extends Entity=Entity> extends Entity<PermissionId> {
    readonly subject: IdOf<T>
    readonly object: ReadonlySet<Address<IdOf<U>>>
    readonly action: ReadonlySet<Action>
}

export type UserId = `u:${UUID}`

export interface User extends Entity<UserId> {
    readonly groups: ReadonlySet<Ref<Group & { invisible: false }, 'name'>>
    readonly name: string
    readonly email: string
    readonly passwordHash: string & Invisible
    readonly passwordSalt: string & Invisible
    readonly lastLogin: DateTime
    readonly organizations: ReadonlySet<Ref<Organization, 'name' | 'description'>>
    readonly invites: ReadonlyMap<string, {
        from: Ref<Organization, 'name'>
        createdAt: DateTime
        expiresAt: DateTime
    }>
}

export const sysAdmin = {
    high: 'g:1d1bedc1-f9dd-4377-8f72-49a248dc5c9d',
    medium: 'g:953eb790-db3e-4951-ac12-895ac0224421',
    low: 'g:879d5688-bb9c-41f7-9f15-0607c501c500'
} as const satisfies Record<string, GroupId>

export type GroupId = `g:${UUID}`

export interface Group extends Entity<GroupId> {
    readonly name: string
    readonly createdBy: UserId | GroupId | OrganizationId
    readonly invisible: boolean
}

// 조직 안에서 주체(유저 또는 역할 그룹)에게 줄 수 있는 추상 권한이다.
// 실제 주소 단위 Permission으로의 변환은 util.ts의 orgGrants가 정한다.
export const OrganizationPermissions = [
    'org.read',
    'org.delete',
    'role.manage',
    'user.list',
    'user.invite',
    'user.invite_list',
    'user.invite_cancel',
    'user.remove',
    'event.read',
    'event.create',
    'event.update_status',
] as const
export type OrganizationPermissions = typeof OrganizationPermissions

export const EventStatus = ['confirmed', 'tentative'] as const
export type EventStatus = (typeof EventStatus)[number]

export type OrganizationId = `o:${UUID}`

export interface Organization extends Entity<OrganizationId> {
    readonly name: string
    readonly description: string
    readonly members: ReadonlySet<{
        readonly user: Ref<User, 'name'>
        readonly joinedAt: DateTime
    }>
    readonly invites: ReadonlyMap<string, {
        readonly toEmail: string
        readonly createdAt: DateTime
        readonly expiresAt: DateTime
    }>
    readonly groups: ReadonlySet<Ref<Group, 'name'> & {
        color: string
        isAdmin: boolean
    }>
    readonly events: ReadonlyMap<string, {
        readonly title: string
        readonly start: DateTime
        readonly end: DateTime
        readonly status: EventStatus
        readonly createdBy: UserId
        readonly participants: ReadonlySet<UserId>
    }>
    readonly permissions: ReadonlyMap<UserId | GroupId, ReadonlySet<OrganizationPermissions[number]>>
    readonly createdAt: DateTime
}
// id는 API에 공개되는 식별자이고, 인증에 쓰는 비밀 토큰은 해시(tokenHash)로만 보관한다.
export type SessionId = `s:${UUID}`

export interface Session extends Entity<SessionId> {
    readonly user: UserId
    readonly tokenHash: string & Invisible
    readonly createdAt: DateTime
    readonly expiresAt: DateTime
}
