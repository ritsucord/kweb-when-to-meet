import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { test } from 'node:test'
import { createApp } from './app.js'
import { newContext } from './testing.js'

// 실제 HTTP로 shared 명세의 21개 엔드포인트를 호출한다. 응답은 서버가 계약의 output 스키마로도 검증한다.

type Json = any

class Client {
    cookie = ''
    constructor(private readonly base: string) {}

    async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
        const res = await fetch(`${this.base}/api${path}`, {
            method,
            headers: {
                ...body !== undefined && { 'content-type': 'application/json' },
                ...this.cookie !== '' && { cookie: this.cookie },
                ...headers,
            },
            ...body !== undefined && { body: JSON.stringify(body) },
        })
        const setCookie = res.headers.getSetCookie()
        for (const c of setCookie) {
            const [name, value] = c.split(';')[0]!.split('=')
            this.cookie = /Max-Age=0/i.test(c) ? '' : `${name}=${value}`
        }
        const text = await res.text()
        return { status: res.status, body: (text === '' ? undefined : JSON.parse(text)) as Json, setCookie }
    }

    get = (path: string) => this.call('GET', path)
    post = (path: string, body?: unknown) => this.call('POST', path, body)
    del = (path: string) => this.call('DELETE', path)
    patch = (path: string, body: unknown) => this.call('PATCH', path, body)
}

async function withServer(fn: (newClient: () => Client, base: string) => Promise<void>) {
    const server: Server = createApp(newContext()).listen(0)
    await new Promise(resolve => server.once('listening', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
        await fn(() => new Client(base), base)
    } finally {
        await new Promise(resolve => server.close(resolve))
    }
}

// 가입하고 로그인한 클라이언트를 돌려준다.
async function signUp(newClient: () => Client, name: string) {
    const client = newClient()
    const email = `${name}@x.com`
    const created = await client.post('/users', { name, email, password: `pw-${name}-1234` })
    assert.equal(created.status, 201)
    const session = await client.post('/sessions', { email, password: `pw-${name}-1234` })
    assert.equal(session.status, 201)
    return { client, user: created.body as Json, email, sessionId: session.body.sessionId as string }
}

const isError = (res: { status: number, body: Json }, status: number) => {
    assert.equal(res.status, status, JSON.stringify(res.body))
    assert.deepEqual(Object.keys(res.body).sort(), ['code', 'msg'], '오류 본문은 { code, msg }')
    assert.equal(res.body.code, status)
    assert.equal(typeof res.body.msg, 'string')
}

test('오류 응답 형식과 인증 필요 엔드포인트', async () => {
    await withServer(async newClient => {
        const anon = newClient()
        isError(await anon.get('/nothing-here'), 404)
        isError(await anon.post('/users', { name: '', email: 'not-an-email', password: 'short' }), 400)
        isError(await anon.get('/sessions/current'), 401)
        isError(await anon.get('/my/orgs'), 401)
        isError(await anon.post('/orgs', { name: 'x' }), 401)
        isError(await anon.get('/sessions/current', ), 401)
        isError(await anon.call('GET', '/sessions/current', undefined, { authorization: 'Bearer nope' }), 401)
    })
})

test('가입, 로그인, 세션 확인, 로그아웃', async () => {
    await withServer(async newClient => {
        const alice = newClient()
        const created = await alice.post('/users', { name: 'alice', email: 'alice@x.com', password: 'pw-alice-1234' })
        assert.equal(created.status, 201)
        assert.deepEqual(Object.keys(created.body).sort(), ['email', 'id', 'name'], '비밀번호는 응답에 없다')
        isError(await alice.post('/users', { name: 'again', email: 'ALICE@x.com', password: 'pw-alice-1234' }), 409)

        isError(await alice.post('/sessions', { email: 'alice@x.com', password: 'wrong' }), 401)
        isError(await alice.post('/sessions', { email: 'ghost@x.com', password: 'wrong' }), 401)
        const login = await alice.post('/sessions', { email: 'alice@x.com', password: 'pw-alice-1234' })
        assert.equal(login.status, 201)
        assert.match(login.body.sessionId, /^s:/)
        assert.ok(!Number.isNaN(Date.parse(login.body.expiresAt)))
        const cookie = login.setCookie[0]!
        assert.match(cookie, /HttpOnly/)
        assert.match(cookie, /SameSite=Lax/)
        assert.ok(!cookie.includes(login.body.sessionId), '쿠키 값은 공개 id가 아니라 별도의 비밀 토큰이다')

        const current = await alice.get('/sessions/current')
        assert.equal(current.status, 200)
        assert.equal(current.body.user.id, created.body.id)
        assert.equal(current.body.expiresAt, login.body.expiresAt)

        // 같은 토큰을 Authorization 헤더로도 쓸 수 있다.
        const token = alice.cookie.split('=')[1]!
        const viaHeader = await newClient().call('GET', '/sessions/current', undefined, { authorization: `Bearer ${token}` })
        assert.equal(viaHeader.status, 200)

        const logout = await alice.del('/sessions/current')
        assert.equal(logout.status, 204)
        assert.match(logout.setCookie[0]!, /Max-Age=0/)
        isError(await alice.get('/sessions/current'), 401)
        isError(await newClient().call('GET', '/sessions/current', undefined, { authorization: `Bearer ${token}` }), 401)
    })
})

test('세션 제거: 본인 다른 기기 204, 남의 세션 403, 없는 세션 404', async () => {
    await withServer(async newClient => {
        const alice = await signUp(newClient, 'alice')
        const bob = await signUp(newClient, 'bob')
        const second = newClient()
        const secondLogin = await second.post('/sessions', { email: alice.email, password: 'pw-alice-1234' })
        assert.equal((await second.get('/sessions/current')).status, 200)

        isError(await bob.client.del(`/sessions/${alice.sessionId}`), 403)
        isError(await alice.client.del('/sessions/s:00000000-0000-4000-8000-000000000000'), 404)
        isError(await alice.client.del('/sessions/not-an-id'), 404)
        assert.equal((await alice.client.del(`/sessions/${secondLogin.body.sessionId}`)).status, 204)
        isError(await second.get('/sessions/current'), 401)
        assert.equal((await alice.client.get('/sessions/current')).status, 200, '다른 세션을 지워도 현재 세션은 유지된다')
    })
})

test('조직: 생성, 목록, 기본 정보, 접근 제어, 삭제', async () => {
    await withServer(async newClient => {
        const alice = await signUp(newClient, 'alice')
        const bob = await signUp(newClient, 'bob')
        const created = await alice.client.post('/orgs', { name: 'Org', description: 'hello' })
        assert.equal(created.status, 201)
        assert.deepEqual(Object.keys(created.body).sort(), ['createdAt', 'description', 'id', 'name'])
        const orgId = created.body.id as string

        assert.deepEqual((await alice.client.post('/orgs', { name: 'NoDesc' })).body.description, '')
        isError(await alice.client.post('/orgs', { name: '' }), 400)

        const mine = await alice.client.get('/my/orgs')
        assert.equal(mine.status, 200)
        assert.deepEqual(mine.body.orgs.map((o: Json) => [o.name, o.role]).sort(), [['NoDesc', 'admin'], ['Org', 'admin']])
        assert.deepEqual((await bob.client.get('/my/orgs')).body, { orgs: [] })

        const info = await alice.client.get(`/orgs/${orgId}`)
        assert.equal(info.status, 200)
        assert.equal(info.body.memberCount, 1)
        assert.equal(info.body.name, 'Org')
        isError(await bob.client.get(`/orgs/${orgId}`), 403)
        isError(await alice.client.get('/orgs/o:00000000-0000-4000-8000-000000000000'), 404)
        isError(await alice.client.get('/orgs/garbage'), 404)

        isError(await bob.client.del(`/orgs/${orgId}`), 403)
        assert.equal((await alice.client.del(`/orgs/${orgId}`)).status, 204)
        isError(await alice.client.get(`/orgs/${orgId}`), 404)
        isError(await alice.client.del(`/orgs/${orgId}`), 404)
    })
})

test('초대: 보내기, 받는 쪽 목록, 수락, 거절, 취소와 각 오류 코드', async () => {
    await withServer(async newClient => {
        const alice = await signUp(newClient, 'alice')
        const bob = await signUp(newClient, 'bob')
        const carol = await signUp(newClient, 'carol')
        const orgId = (await alice.client.post('/orgs', { name: 'Org' })).body.id as string

        // 보내기: 가입 여부와 관계없이 같은 모양으로 201
        const toBob = await alice.client.post(`/orgs/${orgId}/invites`, { email: bob.email })
        assert.equal(toBob.status, 201)
        assert.deepEqual(Object.keys(toBob.body).sort(), ['createdAt', 'email', 'id', 'org'])
        assert.deepEqual(toBob.body.org, { id: orgId, name: 'Org' })
        const toStranger = await alice.client.post(`/orgs/${orgId}/invites`, { email: 'stranger@x.com' })
        assert.equal(toStranger.status, 201)
        assert.deepEqual(Object.keys(toStranger.body).sort(), Object.keys(toBob.body).sort())
        isError(await alice.client.post(`/orgs/${orgId}/invites`, { email: bob.email }), 409)
        isError(await alice.client.post(`/orgs/${orgId}/invites`, { email: 'nope' }), 400)
        isError(await carol.client.post(`/orgs/${orgId}/invites`, { email: 'x@x.com' }), 403)
        isError(await alice.client.post('/orgs/o:00000000-0000-4000-8000-000000000000/invites', { email: 'x@x.com' }), 404)

        // 관리자 쪽 목록
        const listed = await alice.client.get(`/orgs/${orgId}/invites?status=pending`)
        assert.equal(listed.status, 200)
        assert.equal(listed.body.invites.length, 2)
        isError(await carol.client.get(`/orgs/${orgId}/invites`), 403)

        // 받는 쪽
        const mine = await bob.client.get('/my/invites')
        assert.equal(mine.status, 200)
        assert.deepEqual(mine.body.invites.map((i: Json) => [i.id, i.email, i.org.name]), [[toBob.body.id, bob.email, 'Org']])
        isError(await carol.client.post(`/my/invites/${toBob.body.id}/accept`), 403)
        isError(await carol.client.del(`/my/invites/${toBob.body.id}`), 403)
        isError(await carol.client.post('/my/invites/nope/accept'), 404)

        const accepted = await bob.client.post(`/my/invites/${toBob.body.id}/accept`)
        assert.equal(accepted.status, 201)
        assert.deepEqual([accepted.body.orgId, accepted.body.userId, accepted.body.role], [orgId, bob.user.id, 'member'])
        assert.ok(accepted.body.joinedAt)
        isError(await bob.client.post(`/my/invites/${toBob.body.id}/accept`), 404)
        assert.deepEqual((await bob.client.get('/my/invites')).body, { invites: [] })
        assert.equal((await alice.client.get(`/orgs/${orgId}/invites`)).body.invites.length, 1)

        // 거절과 취소
        const toCarol = await alice.client.post(`/orgs/${orgId}/invites`, { email: carol.email })
        assert.equal((await carol.client.del(`/my/invites/${toCarol.body.id}`)).status, 204)
        isError(await carol.client.del(`/my/invites/${toCarol.body.id}`), 404)
        isError(await bob.client.del(`/orgs/${orgId}/invites/${toStranger.body.id}`), 403)
        assert.equal((await alice.client.del(`/orgs/${orgId}/invites/${toStranger.body.id}`)).status, 204)
        isError(await alice.client.del(`/orgs/${orgId}/invites/${toStranger.body.id}`), 404)

        // 가입 전에 받은 초대는 가입하면 보인다.
        const late = await alice.client.post(`/orgs/${orgId}/invites`, { email: 'late@x.com' })
        const lateUser = await signUp(newClient, 'late')
        assert.deepEqual((await lateUser.client.get('/my/invites')).body.invites.map((i: Json) => i.id), [late.body.id])

        // 이미 멤버인 이메일
        isError(await alice.client.post(`/orgs/${orgId}/invites`, { email: bob.email }), 409)
    })
})

test('조직 멤버: 목록, 탈퇴, 내보내기', async () => {
    await withServer(async newClient => {
        const alice = await signUp(newClient, 'alice')
        const bob = await signUp(newClient, 'bob')
        const carol = await signUp(newClient, 'carol')
        const orgId = (await alice.client.post('/orgs', { name: 'Org' })).body.id as string
        for (const who of [bob, carol]) {
            const invite = await alice.client.post(`/orgs/${orgId}/invites`, { email: who.email })
            await who.client.post(`/my/invites/${invite.body.id}/accept`)
        }

        const members = await bob.client.get(`/orgs/${orgId}/members`)
        assert.equal(members.status, 200)
        assert.deepEqual(members.body.members.map((m: Json) => [m.name, m.role]).sort(), [['alice', 'admin'], ['bob', 'member'], ['carol', 'member']])
        assert.equal((await alice.client.get(`/orgs/${orgId}`)).body.memberCount, 3)

        const stranger = await signUp(newClient, 'dave')
        isError(await stranger.client.get(`/orgs/${orgId}/members`), 403)
        isError(await bob.client.del(`/orgs/${orgId}/members/${carol.user.id}`), 403)
        isError(await stranger.client.del(`/orgs/${orgId}/members/${carol.user.id}`), 403)
        isError(await alice.client.del(`/orgs/${orgId}/members/${stranger.user.id}`), 404)
        isError(await alice.client.del(`/orgs/${orgId}/members/garbage`), 404)
        isError(await alice.client.del(`/orgs/${orgId}/members/${alice.user.id}`), 409)

        assert.equal((await alice.client.del(`/orgs/${orgId}/members/${carol.user.id}`)).status, 204)
        assert.equal((await bob.client.del(`/orgs/${orgId}/members/${bob.user.id}`)).status, 204)
        assert.equal((await alice.client.get(`/orgs/${orgId}`)).body.memberCount, 1)
        isError(await bob.client.get(`/orgs/${orgId}`), 403)
    })
})

test('일정: 생성, 조회, 필터, 상태 변경과 오류 코드', async () => {
    await withServer(async newClient => {
        const alice = await signUp(newClient, 'alice')
        const bob = await signUp(newClient, 'bob')
        const carol = await signUp(newClient, 'carol')
        const orgId = (await alice.client.post('/orgs', { name: 'Org' })).body.id as string
        const invite = await alice.client.post(`/orgs/${orgId}/invites`, { email: bob.email })
        await bob.client.post(`/my/invites/${invite.body.id}/accept`)

        const lunch = await bob.client.post(`/orgs/${orgId}/events`, { start: '2026-11-10T03:00:00Z', end: '2026-11-10T04:00:00Z' })
        assert.equal(lunch.status, 201)
        assert.deepEqual(lunch.body, {
            id: lunch.body.id, title: null, start: '2026-11-10T03:00:00.000Z', end: '2026-11-10T04:00:00.000Z',
            status: 'tentative', createdBy: bob.user.id, participants: [bob.user.id],
        })
        const standup = await alice.client.post(`/orgs/${orgId}/events`, {
            title: 'standup', start: '2026-11-11T01:00:00Z', end: '2026-11-11T02:00:00Z',
            status: 'confirmed', participants: [alice.user.id, bob.user.id],
        })
        assert.equal(standup.status, 201)
        assert.equal(standup.body.title, 'standup')

        isError(await bob.client.post(`/orgs/${orgId}/events`, { start: '2026-11-10T05:00:00Z', end: '2026-11-10T04:00:00Z' }), 400)
        isError(await bob.client.post(`/orgs/${orgId}/events`, { start: 'bad', end: '2026-11-10T04:00:00Z' }), 400)
        isError(await bob.client.post(`/orgs/${orgId}/events`, { start: '2026-11-10T01:00:00Z', end: '2026-11-10T04:00:00Z', participants: [carol.user.id] }), 400)
        isError(await bob.client.post(`/orgs/${orgId}/events`, { start: '2026-11-10T01:00:00Z', end: '2026-11-10T04:00:00Z', participants: ['garbage'] }), 400)
        isError(await carol.client.post(`/orgs/${orgId}/events`, { start: '2026-11-10T01:00:00Z', end: '2026-11-10T04:00:00Z' }), 403)
        isError(await bob.client.post('/orgs/o:00000000-0000-4000-8000-000000000000/events', { start: '2026-11-10T01:00:00Z', end: '2026-11-10T04:00:00Z' }), 404)

        const all = await bob.client.get(`/orgs/${orgId}/events`)
        assert.equal(all.status, 200)
        assert.equal(all.body.events.length, 2)
        const ids = async (query: string) =>
            (await bob.client.get(`/orgs/${orgId}/events${query}`)).body.events.map((e: Json) => e.id).sort()
        assert.deepEqual(await ids('?status=confirmed'), [standup.body.id])
        assert.deepEqual(await ids(`?createdBy=${bob.user.id}`), [lunch.body.id])
        assert.deepEqual(await ids(`?participantId=${alice.user.id}`), [standup.body.id])
        assert.deepEqual(await ids('?from=2026-11-10T03:30:00Z&to=2026-11-10T23:00:00Z'), [lunch.body.id])
        isError(await bob.client.get(`/orgs/${orgId}/events?from=2026-11-12T00:00:00Z&to=2026-11-10T00:00:00Z`), 400)
        isError(await carol.client.get(`/orgs/${orgId}/events`), 403)

        assert.equal((await bob.client.get(`/orgs/${orgId}/events/${lunch.body.id}`)).body.id, lunch.body.id)
        isError(await bob.client.get(`/orgs/${orgId}/events/nope`), 404)
        isError(await carol.client.get(`/orgs/${orgId}/events/${lunch.body.id}`), 403)

        const confirmed = await bob.client.patch(`/orgs/${orgId}/events/${lunch.body.id}/status`, { status: 'confirmed' })
        assert.equal(confirmed.status, 200)
        assert.equal(confirmed.body.status, 'confirmed')
        isError(await bob.client.patch(`/orgs/${orgId}/events/${standup.body.id}/status`, { status: 'tentative' }), 403)
        isError(await bob.client.patch(`/orgs/${orgId}/events/nope/status`, { status: 'tentative' }), 404)
        isError(await bob.client.patch(`/orgs/${orgId}/events/${lunch.body.id}/status`, { status: 'maybe' }), 400)
        assert.equal((await alice.client.patch(`/orgs/${orgId}/events/${lunch.body.id}/status`, { status: 'tentative' })).status, 200, '관리자는 다른 사람의 일정도 바꾼다')
    })
})
