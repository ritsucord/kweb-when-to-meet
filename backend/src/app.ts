import express from 'express'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { implement, ORPCError, onError } from '@orpc/server'
import { OpenAPIHandler } from '@orpc/openapi/node'
import { contract } from 'shared'
import { DomainError } from './util.js'
import * as U from './util.js'
import type { Context } from './util.js'
import type { DateTime } from './models.js'
import {
    eventDto, fromIso, memberDto, membershipDto, myInviteDto, orgDto, orgInviteDto, orgSummaryDto, parseId, toIso, userDto,
} from './mappers.js'

// 핸들러는 계약(shared)대로 파싱·검증된 input을 받고, 도메인 연산(util)을 호출해 계약의 output 모양으로 돌려준다.

export interface RequestContext {
    readonly domain: Context
    readonly req: IncomingMessage
    readonly res: ServerResponse
}

// ---------------------------------------------------------------
// 세션 토큰 전달: 쿠키 또는 Authorization: Bearer 헤더
// ---------------------------------------------------------------

const cookieName = 'session'

function readToken(req: IncomingMessage): string {
    const authorization = req.headers.authorization
    if (authorization?.startsWith('Bearer ')) return authorization.slice('Bearer '.length).trim()
    for (const part of (req.headers.cookie ?? '').split(';')) {
        const [name, ...value] = part.trim().split('=')
        if (name === cookieName) return value.join('=')
    }
    return ''
}

const cookieAttributes = () =>
    `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`

function setSessionCookie(res: ServerResponse, token: string, expiresAt: DateTime): void {
    const expires = new Date(expiresAt.epochMilliseconds).toUTCString()
    res.appendHeader('Set-Cookie', `${cookieName}=${token}; ${cookieAttributes()}; Expires=${expires}`)
}

function clearSessionCookie(res: ServerResponse): void {
    res.appendHeader('Set-Cookie', `${cookieName}=; ${cookieAttributes()}; Max-Age=0`)
}

// ---------------------------------------------------------------
// 오류: DomainError를 HTTP 오류로 옮긴다.
// ---------------------------------------------------------------

const errorCodes = {
    unauthenticated: 'UNAUTHORIZED',
    not_found: 'NOT_FOUND',
    forbidden: 'FORBIDDEN',
    conflict: 'CONFLICT',
    invalid: 'BAD_REQUEST',
} as const satisfies Record<U.DomainErrorCode, string>

const os = implement(contract).$context<RequestContext>()

const open = os.use(async ({ next }) => {
    try {
        return await next()
    } catch (e) {
        throw e instanceof DomainError ? new ORPCError(errorCodes[e.code], { message: e.message }) : e
    }
})

// 세션 없음 또는 만료는 모든 보호된 엔드포인트에서 401이다.
const authed = open.use(({ context, next }) => {
    const found = U.resolveSession(context.domain, readToken(context.req))
    if (found === null) throw new ORPCError('UNAUTHORIZED', { message: 'session missing or expired' })
    return next({ context: { auth: found } })
})

// ---------------------------------------------------------------
// 라우터
// ---------------------------------------------------------------

const router = os.router({
    // 세션
    createSession: open.createSession.handler(({ input, context }) => {
        const { session, token } = U.createSession(context.domain, input.body.email, input.body.password)
        setSessionCookie(context.res, token, session.expiresAt)
        return { sessionId: session.id, expiresAt: toIso(session.expiresAt) }
    }),

    getCurrentSession: authed.getCurrentSession.handler(({ context }) => ({
        user: userDto(context.auth.user),
        expiresAt: toIso(context.auth.session.expiresAt),
    })),

    deleteSessionCurrent: authed.deleteSessionCurrent.handler(({ context }) => {
        U.endSession(context.domain, context.auth.session.id)
        clearSessionCookie(context.res)
    }),

    deleteSession: authed.deleteSession.handler(({ input, context }) => {
        const id = parseId('s', input.params.sessionId, 'not_found')
        U.deleteSession(context.domain, context.auth.user.id, id)
        if (id === context.auth.session.id) clearSessionCookie(context.res)
    }),

    // 유저
    createUser: open.createUser.handler(({ input, context }) =>
        userDto(U.createUser(context.domain, input.body))),

    // 조직
    createOrg: authed.createOrg.handler(({ input, context }) =>
        orgDto(U.createOrganization(context.domain, context.auth.user.id, {
            name: input.body.name,
            description: input.body.description ?? '',
        }))),

    deleteOrg: authed.deleteOrg.handler(({ input, context }) => {
        U.deleteOrganization(context.domain, parseId('o', input.params.orgId, 'not_found'), context.auth.user.id)
    }),

    listMyOrgs: authed.listMyOrgs.handler(({ context }) => ({
        orgs: U.listMyOrgs(context.domain, context.auth.user.id).map(orgSummaryDto),
    })),

    getOrg: authed.getOrg.handler(({ input, context }) => {
        const orgId = parseId('o', input.params.orgId, 'not_found')
        const userId = context.auth.user.id
        const org = U.getOrganization(context.domain, orgId, userId)
        return { ...orgDto(org), memberCount: U.countMembers(context.domain, orgId, userId) }
    }),

    // 멤버
    listMembers: authed.listMembers.handler(({ input, context }) => ({
        members: U.listMembers(context.domain, parseId('o', input.params.orgId, 'not_found'), context.auth.user.id)
            .map(memberDto),
    })),

    deleteMember: authed.deleteMember.handler(({ input, context }) => {
        U.removeMember(
            context.domain,
            parseId('o', input.params.orgId, 'not_found'),
            context.auth.user.id,
            parseId('u', input.params.userId, 'not_found'),
        )
    }),

    // 초대 (관리자 쪽)
    listOrgInvites: authed.listOrgInvites.handler(({ input, context }) => {
        const orgId = parseId('o', input.params.orgId, 'not_found')
        const org = U.getOrgRef(context.domain, orgId, context.auth.user.id)
        // 상태는 대기 중(pending)뿐이므로 query.status가 있어도 같은 목록이다.
        return { invites: U.listOrgInvites(context.domain, orgId, context.auth.user.id).map(i => orgInviteDto(org, i)) }
    }),

    createInvite: authed.createInvite.handler(({ input, context }) => {
        const orgId = parseId('o', input.params.orgId, 'not_found')
        const invite = U.inviteUser(context.domain, orgId, context.auth.user.id, input.body.email)
        return orgInviteDto(U.getOrgRef(context.domain, orgId, context.auth.user.id), invite)
    }),

    deleteInvite: authed.deleteInvite.handler(({ input, context }) => {
        U.cancelInvite(context.domain, parseId('o', input.params.orgId, 'not_found'), context.auth.user.id, input.params.inviteId)
    }),

    // 초대 (받는 쪽)
    listMyInvites: authed.listMyInvites.handler(({ context }) => ({
        invites: U.listMyInvites(context.domain, context.auth.user.id).map(i => myInviteDto(context.auth.user, i)),
    })),

    acceptInvite: authed.acceptInvite.handler(({ input, context }) => {
        const userId = context.auth.user.id
        const org = U.acceptInvite(context.domain, userId, input.params.inviteId)
        return membershipDto(org.id, userId, U.membershipOf(context.domain, org.id, userId))
    }),

    declineInvite: authed.declineInvite.handler(({ input, context }) => {
        U.declineInvite(context.domain, context.auth.user.id, input.params.inviteId)
    }),

    // 일정
    listEvents: authed.listEvents.handler(({ input, context }) => {
        const { status, from, to, participantId, createdBy } = input.query
        const events = U.listEvents(context.domain, parseId('o', input.params.orgId, 'not_found'), context.auth.user.id, {
            ...status !== undefined && { status },
            ...from !== undefined && { from: fromIso(from) },
            ...to !== undefined && { to: fromIso(to) },
            ...participantId !== undefined && { participantId: parseId('u', participantId, 'invalid') },
            ...createdBy !== undefined && { createdBy: parseId('u', createdBy, 'invalid') },
        })
        return { events: events.map(eventDto) }
    }),

    getEvent: authed.getEvent.handler(({ input, context }) =>
        eventDto(U.getEvent(
            context.domain, parseId('o', input.params.orgId, 'not_found'), context.auth.user.id, input.params.eventId,
        ))),

    createEvent: authed.createEvent.handler(({ input, context }) => {
        const { title, start, end, status, participants } = input.body
        return eventDto(U.createEvent(context.domain, parseId('o', input.params.orgId, 'not_found'), context.auth.user.id, {
            title: title ?? '',
            start: fromIso(start),
            end: fromIso(end),
            ...status !== undefined && { status },
            ...participants !== undefined && { participants: participants.map(id => parseId('u', id, 'invalid')) },
        }))
    }),

    updateEventStatus: authed.updateEventStatus.handler(({ input, context }) =>
        eventDto(U.updateEventStatus(
            context.domain,
            parseId('o', input.params.orgId, 'not_found'),
            context.auth.user.id,
            input.params.eventId,
            input.body.status,
        ))),
})

// ---------------------------------------------------------------
// 서버
// ---------------------------------------------------------------

// 오류 응답은 shared의 DefaultErrorResponse({ code, msg })를 따른다.
const handler = new OpenAPIHandler(router, {
    customErrorResponseBodyEncoder: error => ({ code: error.status, msg: error.message }),
    interceptors: [
        onError(error => {
            // 예상된 4xx는 기록하지 않는다.
            if (!(error instanceof ORPCError) || error.status >= 500) console.error(error)
        }),
    ],
})

export function createApp(domain: Context) {
    const app = express()

    // oRPC 핸들러는 express.json() 같은 본문 파서보다 먼저 등록한다.
    app.use('/api{/*path}', async (req, res, next) => {
        const { matched } = await handler.handle(req, res, { prefix: '/api', context: { domain, req, res } })
        if (matched) return
        next()
    })

    // 일치하는 경로가 없을 때
    app.use((_req, res) => {
        res.status(404).json({ code: 404, msg: 'Not Found' })
    })

    return app
}
