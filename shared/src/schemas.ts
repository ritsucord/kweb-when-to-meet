import { oc } from '@orpc/contract'
import { z } from 'zod';


/*
    확정 일정   | Confirmed
    미확정 일정 | Tentative

    로그인 및 세션 발급
    POST /api/sessions

    현재 세션 확인
    GET /api/sessions/current

    로그아웃
    DELETE /api/sessions/current

    세션 제거
    DELETE /api/sessions/{SESSION_ID}

    회원가입
    POST /api/users

    조직 생성
    POST /api/orgs

    조직 제거
    DELETE /api/orgs/{ORG_ID}

    가입된 조직 확인
    GET /api/my/orgs

    멤버 추가 요청 가져오기
    GET /api/orgs/{ORG_ID}/invites

    조직 관리자가 멤버 추가 요청
    POST /api/orgs/{ORG_ID}/invites

    조직 관리자가 멤버 추가 요청 삭제
    DELETE /api/orgs/{ORG_ID}/invites/{INVITE_ID}

    조직 멤버 확인
    GET /api/orgs/{ORG_ID}/members

    조직 가입 조회
    GET /api/my/invites

    내게 온 조직 가입요청 승인
    POST /api/my/invites/{INVITE_ID}/accept

    내게 온 조직 가입요청 삭제
    DELETE /api/my/invites/{INVITE_ID}

    조직 탈퇴
    DELETE /api/orgs/{ORG_ID}/members/{USER_ID}

    조직 기본 정보 확인
    GET /api/orgs/{ORG_ID}

    일정 일괄 확인
    GET /api/orgs/{ORG_ID}/events

    특정한 일정 정보 가져오기
    GET /api/orgs/{ORG_ID}/events/{EVENT_ID}

    일정 생성하기
    POST /api/orgs/{ORG_ID}/events

    일정 확정/미확정 변경하기
    PATCH /api/orgs/{ORG_ID}/events/{EVENT_ID}/status

    스키마, 동반 타입은 각각 z.object(또는 extend), z.infer<S>로 정의할 것.
 */

export const EventStatus = z.enum(['confirmed', 'tentative'])
export type EventStatus = z.infer<typeof EventStatus>

export const Id = z.string().min(1)
export type Id = z.infer<typeof Id>

export const DateTime = z.iso.datetime()
export type DateTime = z.infer<typeof DateTime>

export const MemberRole = z.enum(['admin', 'member'])
export type MemberRole = z.infer<typeof MemberRole>

export const InviteStatus = z.enum(['pending'])
export type InviteStatus = z.infer<typeof InviteStatus>

export const DefaultErrorResponse = z.object({
    code: z.number().int().positive(),
    msg: z.string(),
})
export type DefaultErrorResponse = z.infer<typeof DefaultErrorResponse>

// ---------------------------------------------------------------
// 공통 모델 (응답에 쓰이는 도메인 표현)
// ---------------------------------------------------------------

export const User = z.object({
    id: Id,
    name: z.string(),
    email: z.email(),
})
export type User = z.infer<typeof User>

export const Org = z.object({
    id: Id,
    name: z.string(),
    description: z.string(),
    createdAt: DateTime,
})
export type Org = z.infer<typeof Org>

export const OrgRef = Org.pick({ id: true, name: true })
export type OrgRef = z.infer<typeof OrgRef>

export const OrgSummary = OrgRef.extend({
    role: MemberRole,
})
export type OrgSummary = z.infer<typeof OrgSummary>

export const Member = z.object({
    id: Id,
    name: z.string(),
    role: MemberRole,
})
export type Member = z.infer<typeof Member>

export const Membership = z.object({
    orgId: Id,
    userId: Id,
    role: MemberRole,
    joinedAt: DateTime,
})
export type Membership = z.infer<typeof Membership>

export const Invite = z.object({
    id: Id,
    org: OrgRef,
    email: z.email(),
    createdAt: DateTime,
})
export type Invite = z.infer<typeof Invite>

// DOM의 전역 Event 타입과 겹치지 않도록 CalendarEvent로 부른다.
export const CalendarEvent = z.object({
    id: Id,
    title: z.string().nullable(),
    start: DateTime,
    end: DateTime,
    status: EventStatus,
    createdBy: Id,
    participants: z.array(Id),
})
export type CalendarEvent = z.infer<typeof CalendarEvent>

// ---------------------------------------------------------------
// 경로 변수 (계약의 path에 {이름}으로 들어가는 값)
// ---------------------------------------------------------------

export const SessionParams = z.object({ sessionId: Id })
export const OrgParams = z.object({ orgId: Id })
export const OrgInviteParams = OrgParams.extend({ inviteId: Id })
export const OrgMemberParams = OrgParams.extend({ userId: Id })
export const OrgEventParams = OrgParams.extend({ eventId: Id })
export const InviteParams = z.object({ inviteId: Id })

/**
 * 로그인 및 세션 발급
 * POST /api/sessions
 *
 * 유저 정보는 응답에 담지 않는다. 로그인한 유저는 GET /api/sessions/current로 확인한다.
 *
 * @method POST
 * @auth 불필요
 * @body email, password
 * @returns 201 Created - 발급된 세션 (sessionId, expiresAt. 토큰은 쿠키로 전달)
 * @throws 400 요청 형식 오류
 * @throws 401 이메일 또는 비밀번호 불일치
 */
export const CreateSessionRequest = z.object({
    email: z.email(),
    password: z.string(),
})
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>

export const CreateSessionResponse = z.object({
    sessionId: Id,
    expiresAt: DateTime,
})
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>

export const CreateSessionErrorResponse = DefaultErrorResponse.extend({

})

export const CreateSessionContract = oc
    .route({ method: 'POST', path: '/sessions', successStatus: 201, inputStructure: 'detailed' })
    .input(z.object({ body: CreateSessionRequest }))
    .output(CreateSessionResponse)

/**
 * 현재 세션 확인 (로그인한 유저 확인)
 * GET /api/sessions/current
 *
 * 세션 쿠키/Authorization 헤더로 식별한 현재 세션과 그 유저를 반환한다.
 * 페이지 새로고침 시 로그인 상태 복원과 세션 만료 확인에 사용한다.
 *
 * @method GET
 * @auth 필요
 * @returns 200 OK - 로그인한 유저와 세션 만료 시각
 * @throws 401 세션 없음 또는 만료
 */
export declare const GetCurrentSessionRequest: never
export type GetCurrentSessionRequest = z.infer<typeof GetCurrentSessionRequest>

export const GetCurrentSessionResponse = z.object({
    user: User,
    expiresAt: DateTime,
})
export type GetCurrentSessionResponse = z.infer<typeof GetCurrentSessionResponse>

export const GetCurrentSessionContract = oc
    .route({ method: 'GET', path: '/sessions/current' })
    .output(GetCurrentSessionResponse)

/**
 * 로그아웃 (현재 세션 종료)
 * DELETE /api/sessions/current
 *
 * 요청을 보낸 세션을 종료한다. 세션은 쿠키/Authorization 헤더로 식별한다.
 *
 * @method DELETE
 * @auth 필요
 * @returns 204 No Content (쿠키 방식이면 쿠키를 만료시킨다)
 * @throws 401 세션 없음 또는 만료
 */
export declare const DeleteSessionCurrentRequest: never
export type DeleteSessionCurrentRequest = z.infer<typeof DeleteSessionCurrentRequest>

export declare const DeleteSessionCurrentResponse: never
export type DeleteSessionCurrentResponse = z.infer<typeof DeleteSessionCurrentResponse>


export const DeleteSessionCurrentContract = oc
    .route({ method: 'DELETE', path: '/sessions/current', successStatus: 204 })

/**
 * 세션 제거 (다른 기기 로그아웃)
 * DELETE /api/sessions/{SESSION_ID}
 *
 * 본인이 소유한 특정 세션을 종료한다.
 *
 * @method DELETE
 * @auth 필요
 * @param SESSION_ID 종료할 세션의 아이디(토큰을 직접 노출하면 위험)
 * @returns 204 No Content
 * @throws 401 세션 없음 또는 만료
 * @throws 403 다른 유저의 세션
 * @throws 404 존재하지 않는 세션
 */
export declare const DeleteSessionRequest: never
export type DeleteSessionRequest = z.infer<typeof DeleteSessionRequest>

export declare const DeleteSessionResponse: never
export type DeleteSessionResponse = z.infer<typeof DeleteSessionResponse>

export const DeleteSessionContract = oc
    .route({ method: 'DELETE', path: '/sessions/{sessionId}', successStatus: 204, inputStructure: 'detailed' })
    .input(z.object({ params: SessionParams }))

/**
 * 회원가입
 * POST /api/users
 *
 * @method POST
 * @auth 불필요
 * @body name, email, password
 * @returns 201 Created - 생성된 유저 (비밀번호 제외)
 * @throws 400 요청 형식 오류
 * @throws 409 이미 가입된 이메일
 */
export const CreateUserRequest = z.object({
    name: z.string().min(1).max(50),
    email: z.email(),
    password: z.string().min(8).max(128),
})
export type CreateUserRequest = z.infer<typeof CreateUserRequest>

export const CreateUserResponse = User
export type CreateUserResponse = z.infer<typeof CreateUserResponse>

export const CreateUserContract = oc
    .route({ method: 'POST', path: '/users', successStatus: 201, inputStructure: 'detailed' })
    .input(z.object({ body: CreateUserRequest }))
    .output(CreateUserResponse)

/**
 * 조직 생성
 * POST /api/orgs
 *
 * 생성한 유저가 조직의 첫 멤버(관리자)가 된다.
 *
 * @method POST
 * @auth 필요
 * @body name, description
 * @returns 201 Created - 생성된 조직과 ORG_ID
 * @throws 400 요청 형식 오류
 * @throws 401 세션 없음 또는 만료
 */
export const CreateOrgRequest = z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
})
export type CreateOrgRequest = z.infer<typeof CreateOrgRequest>

export const CreateOrgResponse = Org
export type CreateOrgResponse = z.infer<typeof CreateOrgResponse>

export const CreateOrgContract = oc
    .route({ method: 'POST', path: '/orgs', successStatus: 201, inputStructure: 'detailed' })
    .input(z.object({ body: CreateOrgRequest }))
    .output(CreateOrgResponse)

/**
 * 조직 제거
 * DELETE /api/orgs/{ORG_ID}
 *
 * 조직과 그 안의 멤버십, 보낸 초대, 일정을 함께 제거한다. 되돌릴 수 없다.
 *
 * @method DELETE
 * @auth 필요 (조직 관리자만)
 * @param ORG_ID 조직 식별자
 * @returns 204 No Content
 * @throws 401 세션 없음 또는 만료
 * @throws 403 관리자가 아님
 * @throws 404 존재하지 않는 조직
 */
export declare const DeleteOrgRequest: never
export type DeleteOrgRequest = z.infer<typeof DeleteOrgRequest>

export declare const DeleteOrgResponse: never
export type DeleteOrgResponse = z.infer<typeof DeleteOrgResponse>

export const DeleteOrgContract = oc
    .route({ method: 'DELETE', path: '/orgs/{orgId}', successStatus: 204, inputStructure: 'detailed' })
    .input(z.object({ params: OrgParams }))

/**
 * 가입된 조직 확인
 * GET /api/my/orgs
 *
 * 로그인한 유저가 속한 조직 목록을 반환한다.
 *
 * @method GET
 * @auth 필요
 * @returns 200 OK - 조직 목록 (이름, ORG_ID 등 요약 정보)
 * @throws 401 세션 없음 또는 만료
 */
export declare const ListMyOrgsRequest: never
export type ListMyOrgsRequest = z.infer<typeof ListMyOrgsRequest>

export const ListMyOrgsResponse = z.object({
    orgs: z.array(OrgSummary),
})
export type ListMyOrgsResponse = z.infer<typeof ListMyOrgsResponse>

export const ListMyOrgsContract = oc
    .route({ method: 'GET', path: '/my/orgs' })
    .output(ListMyOrgsResponse)

/**
 * 멤버 추가 요청 가져오기 (관리자가 보낸 초대 목록)
 * GET /api/orgs/{ORG_ID}/invites
 *
 * 조직이 보낸 초대와 그 상태를 반환한다.
 *
 * @method GET
 * @auth 필요 (조직 관리자만)
 * @param ORG_ID 조직 식별자
 * @query status 'pending' (생략 시 대기 중인 초대만)
 * @returns 200 OK - 초대 목록 (INVITE_ID, 대상 이메일, 보낸 시각 등)
 * @throws 401 세션 없음 또는 만료
 * @throws 403 관리자가 아님
 * @throws 404 존재하지 않는 조직
 */
export declare const ListOrgInvitesRequest: never
export type ListOrgInvitesRequest = z.infer<typeof ListOrgInvitesRequest>

export const ListOrgInvitesQuery = z.object({
    status: InviteStatus.optional(),
})
export type ListOrgInvitesQuery = z.infer<typeof ListOrgInvitesQuery>

export const ListOrgInvitesResponse = z.object({
    invites: z.array(Invite),
})
export type ListOrgInvitesResponse = z.infer<typeof ListOrgInvitesResponse>

export const ListOrgInvitesContract = oc
    .route({ method: 'GET', path: '/orgs/{orgId}/invites', inputStructure: 'detailed' })
    .input(z.object({ params: OrgParams, query: ListOrgInvitesQuery }))
    .output(ListOrgInvitesResponse)

/**
 * 조직 관리자가 멤버 추가 요청 (초대 보내기)
 * POST /api/orgs/{ORG_ID}/invites
 *
 * 초대 대상은 이메일로 지정한다. 대상 이메일이 가입된 계정인지 여부는
 * 응답으로 구분되지 않게 한다 (이메일 가입 여부 노출 방지).
 * 초대는 대상이 수락(POST /api/my/invites/{INVITE_ID}/accept)해야 멤버십이 된다.
 *
 * @method POST
 * @auth 필요 (조직 관리자만)
 * @param ORG_ID 조직 식별자
 * @body email 초대할 유저의 이메일
 * @returns 201 Created - 생성된 초대
 * @throws 400 요청 형식 오류
 * @throws 401 세션 없음 또는 만료
 * @throws 403 관리자가 아님
 * @throws 404 존재하지 않는 조직
 * @throws 409 이미 멤버이거나 대기 중인 초대가 있음
 */
export const CreateInviteRequest = z.object({
    email: z.email(),
})
export type CreateInviteRequest = z.infer<typeof CreateInviteRequest>

export const CreateInviteResponse = Invite
export type CreateInviteResponse = z.infer<typeof CreateInviteResponse>

export const CreateInviteContract = oc
    .route({ method: 'POST', path: '/orgs/{orgId}/invites', successStatus: 201, inputStructure: 'detailed' })
    .input(z.object({ params: OrgParams, body: CreateInviteRequest }))
    .output(CreateInviteResponse)

/**
 * 조직 관리자가 멤버 추가 요청 삭제 (초대 취소)
 * DELETE /api/orgs/{ORG_ID}/invites/{INVITE_ID}
 *
 * 아직 수락되지 않은 초대를 취소한다.
 *
 * @method DELETE
 * @auth 필요 (조직 관리자만)
 * @param ORG_ID    조직 식별자
 * @param INVITE_ID 초대 식별자
 * @returns 204 No Content
 * @throws 401 세션 없음 또는 만료
 * @throws 403 관리자가 아님
 * @throws 404 존재하지 않는 조직 또는 초대
 */
export declare const DeleteInviteRequest: never
export type DeleteInviteRequest = z.infer<typeof DeleteInviteRequest>

export declare const DeleteInviteResponse: never
export type DeleteInviteResponse = z.infer<typeof DeleteInviteResponse>

export const DeleteInviteContract = oc
    .route({ method: 'DELETE', path: '/orgs/{orgId}/invites/{inviteId}', successStatus: 204, inputStructure: 'detailed' })
    .input(z.object({ params: OrgInviteParams }))

/**
 * 조직 멤버 확인
 * GET /api/orgs/{ORG_ID}/members
 *
 * @method GET
 * @auth 필요 (조직 멤버만)
 * @param ORG_ID 조직 식별자
 * @returns 200 OK - 멤버 목록 (USER_ID, 이름, 관리자 여부 등)
 * @throws 401 세션 없음 또는 만료
 * @throws 403 조직 멤버가 아님
 * @throws 404 존재하지 않는 조직
 */
export declare const ListMembersRequest: never
export type ListMembersRequest = z.infer<typeof ListMembersRequest>

export const ListMembersResponse = z.object({
    members: z.array(Member),
})
export type ListMembersResponse = z.infer<typeof ListMembersResponse>

export const ListMembersContract = oc
    .route({ method: 'GET', path: '/orgs/{orgId}/members', inputStructure: 'detailed' })
    .input(z.object({ params: OrgParams }))
    .output(ListMembersResponse)

/**
 * 조직 가입 조회 (내게 온 초대 목록)
 * GET /api/my/invites
 *
 * 로그인한 유저에게 온 초대를 반환한다.
 *
 * @method GET
 * @auth 필요
 * @query status 'pending' (생략 시 대기 중인 초대만)
 * @returns 200 OK - 초대 목록 (INVITE_ID, 조직 요약 정보, 보낸 시각 등)
 * @throws 401 세션 없음 또는 만료
 */
export declare const ListMyInvitesRequest: never
export type ListMyInvitesRequest = z.infer<typeof ListMyInvitesRequest>

export const ListMyInvitesQuery = z.object({
    status: InviteStatus.optional(),
})
export type ListMyInvitesQuery = z.infer<typeof ListMyInvitesQuery>

export const ListMyInvitesResponse = z.object({
    invites: z.array(Invite),
})
export type ListMyInvitesResponse = z.infer<typeof ListMyInvitesResponse>

export const ListMyInvitesContract = oc
    .route({ method: 'GET', path: '/my/invites', inputStructure: 'detailed' })
    .input(z.object({ query: ListMyInvitesQuery }))
    .output(ListMyInvitesResponse)

/**
 * 내게 온 조직 가입요청 승인 (초대 수락)
 * POST /api/my/invites/{INVITE_ID}/accept
 *
 * 수락하면 세션의 유저가 해당 조직의 멤버가 되고 초대는 처리 완료된다.
 * 본문은 받지 않는다.
 *
 * @method POST
 * @auth 필요 (초대받은 본인만)
 * @param INVITE_ID 초대 식별자
 * @returns 201 Created - 생성된 멤버십
 * @throws 401 세션 없음 또는 만료
 * @throws 403 본인에게 온 초대가 아님
 * @throws 404 존재하지 않는 초대
 * @throws 409 이미 처리되었거나 이미 멤버임
 */
export declare const AcceptInviteRequest: never
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequest>

export const AcceptInviteResponse = Membership
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponse>

export const AcceptInviteContract = oc
    .route({ method: 'POST', path: '/my/invites/{inviteId}/accept', successStatus: 201, inputStructure: 'detailed' })
    .input(z.object({ params: InviteParams }))
    .output(AcceptInviteResponse)

/**
 * 내게 온 조직 가입요청 삭제 (초대 거절)
 * DELETE /api/my/invites/{INVITE_ID}
 *
 * 거절 기록은 남기지 않고 초대를 제거한다.
 *
 * @method DELETE
 * @auth 필요 (초대받은 본인만)
 * @param INVITE_ID 초대 식별자
 * @returns 204 No Content
 * @throws 401 세션 없음 또는 만료
 * @throws 403 본인에게 온 초대가 아님
 * @throws 404 존재하지 않는 초대
 */
export declare const DeclineInviteRequest: never
export type DeclineInviteRequest = z.infer<typeof DeclineInviteRequest>

export declare const DeclineInviteResponse: never
export type DeclineInviteResponse = z.infer<typeof DeclineInviteResponse>

export const DeclineInviteContract = oc
    .route({ method: 'DELETE', path: '/my/invites/{inviteId}', successStatus: 204, inputStructure: 'detailed' })
    .input(z.object({ params: InviteParams }))

/**
 * 조직 탈퇴
 * DELETE /api/orgs/{ORG_ID}/members/{USER_ID}
 *
 * 본인이 탈퇴하거나, 관리자가 멤버를 내보낸다.
 *
 * @method DELETE
 * @auth 필요 (본인 또는 조직 관리자)
 * @param ORG_ID 조직 식별자
 * @param USER_ID 탈퇴 대상 유저의 식별자
 * @returns 204 No Content
 * @throws 401 세션 없음 또는 만료
 * @throws 403 본인도 관리자도 아님
 * @throws 404 존재하지 않는 조직 또는 멤버
 */
export declare const DeleteMemberRequest: never
export type DeleteMemberRequest = z.infer<typeof DeleteMemberRequest>

export declare const DeleteMemberResponse: never
export type DeleteMemberResponse = z.infer<typeof DeleteMemberResponse>

export const DeleteMemberContract = oc
    .route({ method: 'DELETE', path: '/orgs/{orgId}/members/{userId}', successStatus: 204, inputStructure: 'detailed' })
    .input(z.object({ params: OrgMemberParams }))

/**
 * 조직 기본 정보 확인
 * GET /api/orgs/{ORG_ID}
 *
 * @method GET
 * @auth 필요 (조직 멤버만)
 * @param ORG_ID 조직 식별자
 * @returns 200 OK - 조직 이름, 설명, 멤버 수 등 (멤버 목록은 GET /api/orgs/{ORG_ID}/members)
 * @throws 401 세션 없음 또는 만료
 * @throws 403 조직 멤버가 아님
 * @throws 404 존재하지 않는 조직
 */
export declare const GetOrgRequest: never
export type GetOrgRequest = z.infer<typeof GetOrgRequest>

export const GetOrgResponse = Org.extend({
    memberCount: z.number().int().nonnegative(),
})
export type GetOrgResponse = z.infer<typeof GetOrgResponse>

export const GetOrgContract = oc
    .route({ method: 'GET', path: '/orgs/{orgId}', inputStructure: 'detailed' })
    .input(z.object({ params: OrgParams }))
    .output(GetOrgResponse)

/**
 * 일정 일괄 확인
 * GET /api/orgs/{ORG_ID}/events
 *
 * 캘린더 화면용 목록. 필터를 모두 생략하면 조직의 전체 일정을 반환한다.
 *
 * @method GET
 * @auth 필요 (조직 멤버만)
 * @param ORG_ID 조직 식별자
 * @query status        'confirmed' | 'tentative' (생략 시 둘 다)
 * @query from          조회 시작 시각 (ISO 8601)
 * @query to            조회 종료 시각 (ISO 8601)
 * @query participantId 해당 유저가 참여자인 일정만
 * @query createdBy     해당 유저가 만든 일정만
 * @returns 200 OK - 일정 목록
 * @throws 400 쿼리 형식 오류 (예: from이 to보다 늦음)
 * @throws 401 세션 없음 또는 만료
 * @throws 403 조직 멤버가 아님
 * @throws 404 존재하지 않는 조직
 */
export declare const ListEventsRequest: never
export type ListEventsRequest = z.infer<typeof ListEventsRequest>

export const ListEventsQuery = z.object({
    status: EventStatus.optional(),
    from: DateTime.optional(),
    to: DateTime.optional(),
    participantId: Id.optional(),
    createdBy: Id.optional(),
}).refine(
    (q) => q.from === undefined || q.to === undefined || Date.parse(q.from) <= Date.parse(q.to),
    { message: 'from은 to보다 늦을 수 없다', path: ['from'] },
)
export type ListEventsQuery = z.infer<typeof ListEventsQuery>

export const ListEventsResponse = z.object({
    events: z.array(CalendarEvent),
})
export type ListEventsResponse = z.infer<typeof ListEventsResponse>

export const ListEventsContract = oc
    .route({ method: 'GET', path: '/orgs/{orgId}/events', inputStructure: 'detailed' })
    .input(z.object({ params: OrgParams, query: ListEventsQuery }))
    .output(ListEventsResponse)

/**
 * 특정한 일정 정보 가져오기
 * GET /api/orgs/{ORG_ID}/events/{EVENT_ID}
 *
 * @method GET
 * @auth 필요 (조직 멤버만)
 * @param ORG_ID 조직 식별자
 * @param EVENT_ID  일정 식별자
 * @returns 200 OK - 일정 (id, title, start, end, status, createdBy, participants)
 * @throws 401 세션 없음 또는 만료
 * @throws 403 조직 멤버가 아님
 * @throws 404 존재하지 않는 조직 또는 일정
 */
export declare const GetEventRequest: never
export type GetEventRequest = z.infer<typeof GetEventRequest>

export const GetEventResponse = CalendarEvent
export type GetEventResponse = z.infer<typeof GetEventResponse>

export const GetEventContract = oc
    .route({ method: 'GET', path: '/orgs/{orgId}/events/{eventId}', inputStructure: 'detailed' })
    .input(z.object({ params: OrgEventParams }))
    .output(GetEventResponse)

/**
 * 일정 생성하기
 * POST /api/orgs/{ORG_ID}/events
 *
 * 작성자(createdBy)는 세션에서 가져오며 본문으로 받지 않는다.
 * 개인 선호 기간은 participants가 본인뿐인 tentative 일정으로 표현한다.
 *
 * @method POST
 * @auth 필요 (조직 멤버만)
 * @param ORG_ID 조직 식별자
 * @body title        선택
 * @body start        시작 시각 (ISO 8601)
 * @body end          종료 시각 (ISO 8601, start보다 늦어야 함)
 * @body status       선택, 기본값 'tentative'
 * @body participants 선택, 유저 식별자 배열 (기본값: 작성자 본인 한 명, 조직 멤버만 허용)
 * @returns 201 Created - 생성된 일정
 * @throws 400 요청 형식 오류 또는 participants에 조직 멤버가 아닌 유저 포함
 * @throws 401 세션 없음 또는 만료
 * @throws 403 조직 멤버가 아님
 * @throws 404 존재하지 않는 조직
 */
export const CreateEventRequest = z.object({
    title: z.string().max(200).optional(),
    start: DateTime,
    end: DateTime,
    status: EventStatus.optional(),
    participants: z.array(Id).min(1).optional(),
}).refine(
    (e) => Date.parse(e.start) < Date.parse(e.end),
    { message: 'end는 start보다 늦어야 한다', path: ['end'] },
)
export type CreateEventRequest = z.infer<typeof CreateEventRequest>

export const CreateEventResponse = CalendarEvent
export type CreateEventResponse = z.infer<typeof CreateEventResponse>

export const CreateEventContract = oc
    .route({ method: 'POST', path: '/orgs/{orgId}/events', successStatus: 201, inputStructure: 'detailed' })
    .input(z.object({ params: OrgParams, body: CreateEventRequest }))
    .output(CreateEventResponse)

/**
 * 일정 확정/미확정 변경하기
 * PATCH /api/orgs/{ORG_ID}/events/{EVENT_ID}/status
 *
 * @method PATCH
 * @auth 필요 (일정 작성자만)
 * @param ORG_ID 조직 식별자
 * @param EVENT_ID  일정 식별자
 * @body status 'confirmed' | 'tentative'
 * @returns 200 OK - 변경된 일정
 * @throws 400 요청 형식 오류
 * @throws 401 세션 없음 또는 만료
 * @throws 403 작성자가 아님
 * @throws 404 존재하지 않는 조직 또는 일정
 */
export const UpdateEventStatusRequest = z.object({
    status: EventStatus,
})
export type UpdateEventStatusRequest = z.infer<typeof UpdateEventStatusRequest>

export const UpdateEventStatusResponse = CalendarEvent
export type UpdateEventStatusResponse = z.infer<typeof UpdateEventStatusResponse>

export const UpdateEventStatusContract = oc
    .route({ method: 'PATCH', path: '/orgs/{orgId}/events/{eventId}/status', inputStructure: 'detailed' })
    .input(z.object({ params: OrgEventParams, body: UpdateEventStatusRequest }))
    .output(UpdateEventStatusResponse)

// ---------------------------------------------------------------
// 전체 계약 (서버의 implement(contract), 클라이언트의 OpenAPILink에 넘기는 값)
// 경로의 /api 접두사는 서버 핸들러의 prefix와 클라이언트 link의 url에서 붙인다.
// ---------------------------------------------------------------

export const contract = {
    createSession: CreateSessionContract,
    getCurrentSession: GetCurrentSessionContract,
    deleteSessionCurrent: DeleteSessionCurrentContract,
    deleteSession: DeleteSessionContract,
    createUser: CreateUserContract,
    createOrg: CreateOrgContract,
    deleteOrg: DeleteOrgContract,
    listMyOrgs: ListMyOrgsContract,
    listOrgInvites: ListOrgInvitesContract,
    createInvite: CreateInviteContract,
    deleteInvite: DeleteInviteContract,
    listMembers: ListMembersContract,
    listMyInvites: ListMyInvitesContract,
    acceptInvite: AcceptInviteContract,
    declineInvite: DeclineInviteContract,
    deleteMember: DeleteMemberContract,
    getOrg: GetOrgContract,
    listEvents: ListEventsContract,
    getEvent: GetEventContract,
    createEvent: CreateEventContract,
    updateEventStatus: UpdateEventStatusContract,
}
