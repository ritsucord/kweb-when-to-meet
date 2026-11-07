import type { UUID } from 'node:crypto'
import type {
    CalendarEvent as CalendarEventDto, Invite as InviteDto, Member as MemberDto, Membership as MembershipDto,
    Org as OrgDto, OrgSummary as OrgSummaryDto, User as UserDto,
} from 'shared'
import type { DateTime, Organization, OrganizationId, Ref, User } from './models.js'
import { DomainError } from './util.js'
import type { DomainErrorCode, EventEntry, InviteEntry, MemberInfo, MyInvite, OrgSummaryInfo } from './util.js'

// 도메인과 shared(API) 사이의 변환이다. 응답은 Ref를 받으므로 응답에 필요한 필드 밖은 건드릴 수 없다.

export const toIso = (t: DateTime): string => t.toString({ fractionalSecondDigits: 3 })

export function fromIso(value: string): DateTime {
    try {
        return Temporal.Instant.from(value)
    } catch {
        throw new DomainError('invalid', `invalid time ${value}`)
    }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// API의 Id는 비어 있지 않은 문자열일 뿐이므로 도메인 ID로 쓰기 전에 접두사와 UUID 형식을 확인한다.
// 경로 변수는 형식이 틀리면 그런 리소스가 없는 것(not_found)이고, 본문과 쿼리는 요청 오류(invalid)다.
export function parseId<P extends string>(prefix: P, value: string, onError: DomainErrorCode): `${P}:${UUID}` {
    const lower = value.toLowerCase()
    if (!lower.startsWith(`${prefix}:`) || !uuidPattern.test(lower.slice(prefix.length + 1))) {
        throw new DomainError(onError, `invalid ${prefix} id`)
    }
    return lower as `${P}:${UUID}`
}

export const userDto = (u: Ref<User, 'name' | 'email'>): UserDto => ({ id: u.id, name: u.name, email: u.email })

export const orgDto = (o: Ref<Organization, 'name' | 'description' | 'createdAt'>): OrgDto => ({
    id: o.id,
    name: o.name,
    description: o.description,
    createdAt: toIso(o.createdAt),
})

export const roleOf = (isAdmin: boolean): 'admin' | 'member' => isAdmin ? 'admin' : 'member'

export const orgSummaryDto = (o: OrgSummaryInfo): OrgSummaryDto => ({ id: o.id, name: o.name, role: roleOf(o.isAdmin) })

export const memberDto = (m: MemberInfo): MemberDto => ({ id: m.user.id, name: m.user.name, role: roleOf(m.isAdmin) })

export const membershipDto = (
    orgId: OrganizationId, userId: User['id'], m: { joinedAt: DateTime, isAdmin: boolean },
): MembershipDto => ({ orgId, userId, role: roleOf(m.isAdmin), joinedAt: toIso(m.joinedAt) })

// 조직이 보낸 초대: 대상 이메일이 email이다.
export const orgInviteDto = (org: Ref<Organization, 'name'>, i: InviteEntry): InviteDto => ({
    id: i.id,
    org: { id: org.id, name: org.name },
    email: i.toEmail,
    createdAt: toIso(i.createdAt),
})

// 내게 온 초대: 대상은 본인이므로 email은 본인 이메일이다.
export const myInviteDto = (user: Ref<User, 'email'>, i: MyInvite): InviteDto => ({
    id: i.id,
    org: { id: i.from.id, name: i.from.name },
    email: user.email,
    createdAt: toIso(i.createdAt),
})

// 제목이 없는 일정은 도메인에서 빈 문자열이다.
export const eventDto = (e: EventEntry): CalendarEventDto => ({
    id: e.id,
    title: e.title === '' ? null : e.title,
    start: toIso(e.start),
    end: toIso(e.end),
    status: e.status,
    createdBy: e.createdBy,
    participants: [...e.participants],
})
