import express from 'express'
import { implement, ORPCError, onError } from '@orpc/server'
import { OpenAPIHandler } from '@orpc/openapi/node'
import { contract } from 'shared'

// 각 핸들러는 계약(shared)대로 파싱·검증된 input을 받고, 계약의 output 모양을 반환한다.
// 구현은 아직 없으므로 모두 501(NOT_IMPLEMENTED)로 응답한다.
const notImplemented = () => new ORPCError('NOT_IMPLEMENTED')

const os = implement(contract)

const router = os.router({
    // ---------------------------------------------------------------
    // 세션
    // ---------------------------------------------------------------

    // POST /sessions
    createSession: os.createSession.handler(async ({ input }) => {
        const { body } = input // body: { email, password }
        // TODO: 인증 후 세션 발급
        // return: { sessionId, expiresAt }
        throw notImplemented()
    }),

    // GET /sessions/current
    getCurrentSession: os.getCurrentSession.handler(async () => {
        // 입력 없음. 세션으로 현재 유저를 식별한다.
        // return: { user, expiresAt }
        throw notImplemented()
    }),

    // DELETE /sessions/current
    deleteSessionCurrent: os.deleteSessionCurrent.handler(async () => {
        // 입력 없음. 현재 세션 종료
        // return: 없음 (204)
        throw notImplemented()
    }),

    // DELETE /sessions/{sessionId}
    deleteSession: os.deleteSession.handler(async ({ input }) => {
        const { params } = input // params: { sessionId }
        // return: 없음 (204)
        throw notImplemented()
    }),

    // ---------------------------------------------------------------
    // 유저
    // ---------------------------------------------------------------

    // POST /users
    createUser: os.createUser.handler(async ({ input }) => {
        const { body } = input // body: { name, email, password }
        // return: User
        throw notImplemented()
    }),

    // ---------------------------------------------------------------
    // 조직
    // ---------------------------------------------------------------

    // POST /orgs
    createOrg: os.createOrg.handler(async ({ input }) => {
        const { body } = input // body: { name, description? }
        // return: Org
        throw notImplemented()
    }),

    // DELETE /orgs/{orgId}
    deleteOrg: os.deleteOrg.handler(async ({ input }) => {
        const { params } = input // params: { orgId }
        // return: 없음 (204)
        throw notImplemented()
    }),

    // GET /my/orgs
    listMyOrgs: os.listMyOrgs.handler(async () => {
        // 입력 없음. 세션 유저가 속한 조직
        // return: { orgs: OrgSummary[] }
        throw notImplemented()
    }),

    // GET /orgs/{orgId}
    getOrg: os.getOrg.handler(async ({ input }) => {
        const { params } = input // params: { orgId }
        // return: Org + memberCount
        throw notImplemented()
    }),

    // ---------------------------------------------------------------
    // 멤버
    // ---------------------------------------------------------------

    // GET /orgs/{orgId}/members
    listMembers: os.listMembers.handler(async ({ input }) => {
        const { params } = input // params: { orgId }
        // return: { members: Member[] }
        throw notImplemented()
    }),

    // DELETE /orgs/{orgId}/members/{userId}
    deleteMember: os.deleteMember.handler(async ({ input }) => {
        const { params } = input // params: { orgId, userId }
        // return: 없음 (204)
        throw notImplemented()
    }),

    // ---------------------------------------------------------------
    // 초대 (관리자 쪽)
    // ---------------------------------------------------------------

    // GET /orgs/{orgId}/invites
    listOrgInvites: os.listOrgInvites.handler(async ({ input }) => {
        const { params, query } = input // params: { orgId }, query: { status? }
        // return: { invites: Invite[] }
        throw notImplemented()
    }),

    // POST /orgs/{orgId}/invites
    createInvite: os.createInvite.handler(async ({ input }) => {
        const { params, body } = input // params: { orgId }, body: { email }
        // return: Invite
        throw notImplemented()
    }),

    // DELETE /orgs/{orgId}/invites/{inviteId}
    deleteInvite: os.deleteInvite.handler(async ({ input }) => {
        const { params } = input // params: { orgId, inviteId }
        // return: 없음 (204)
        throw notImplemented()
    }),

    // ---------------------------------------------------------------
    // 초대 (받는 쪽)
    // ---------------------------------------------------------------

    // GET /my/invites
    listMyInvites: os.listMyInvites.handler(async ({ input }) => {
        const { query } = input // query: { status? }
        // return: { invites: Invite[] }
        throw notImplemented()
    }),

    // POST /my/invites/{inviteId}/accept
    acceptInvite: os.acceptInvite.handler(async ({ input }) => {
        const { params } = input // params: { inviteId }
        // return: Membership
        throw notImplemented()
    }),

    // DELETE /my/invites/{inviteId}
    declineInvite: os.declineInvite.handler(async ({ input }) => {
        const { params } = input // params: { inviteId }
        // return: 없음 (204)
        throw notImplemented()
    }),

    // ---------------------------------------------------------------
    // 일정
    // ---------------------------------------------------------------

    // GET /orgs/{orgId}/events
    listEvents: os.listEvents.handler(async ({ input }) => {
        const { params, query } = input // params: { orgId }, query: { status?, from?, to?, participantId?, createdBy? }
        // return: { events: CalendarEvent[] }
        throw notImplemented()
    }),

    // GET /orgs/{orgId}/events/{eventId}
    getEvent: os.getEvent.handler(async ({ input }) => {
        const { params } = input // params: { orgId, eventId }
        // return: CalendarEvent
        throw notImplemented()
    }),

    // POST /orgs/{orgId}/events
    createEvent: os.createEvent.handler(async ({ input }) => {
        const { params, body } = input // params: { orgId }, body: { title?, start, end, status?, participants? }
        // return: CalendarEvent
        throw notImplemented()
    }),

    // PATCH /orgs/{orgId}/events/{eventId}/status
    updateEventStatus: os.updateEventStatus.handler(async ({ input }) => {
        const { params, body } = input // params: { orgId, eventId }, body: { status }
        // return: CalendarEvent
        throw notImplemented()
    }),
})

// ---------------------------------------------------------------
// 서버 설정
// ---------------------------------------------------------------

const handler = new OpenAPIHandler(router, {
    interceptors: [
        onError((error) => {
            console.error(error)
        }),
    ],
})

const app = express()

// oRPC 핸들러는 express.json() 같은 본문 파서보다 먼저 등록한다.
// TODO: 세션 쿠키로 유저를 식별해 context에 넣는다.
app.use('/api{/*path}', async (req, res, next) => {
    const { matched } = await handler.handle(req, res, { prefix: '/api', context: {} })
    if (matched) return
    next()
})

// 일치하는 경로가 없을 때
app.use((_req, res) => {
    res.status(404).json({ code: 404, msg: 'Not Found' })
})

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => {
    console.log(`listening on http://localhost:${port}`)
})
