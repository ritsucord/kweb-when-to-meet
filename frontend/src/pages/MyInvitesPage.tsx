import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Invite } from 'shared'
import { api } from '../api/client.ts'
import { errorMessage, errorStatus } from '../api/errors.ts'
import { formatDateTime } from '../lib/time.ts'
import { useApi } from '../lib/useApi.ts'

/** 나에게 온 초대: 수락하면 그 조직의 멤버가 된다 */
export default function MyInvitesPage() {
  const load = useCallback(() => api.listMyInvites({ query: {} }), [])
  const { data, error, loading, reload } = useApi(load)
  const [notice, setNotice] = useState<string | null>(null)
  const invites = [...(data?.invites ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="stack">
      <h1>받은 초대</h1>
      {notice && <div className="alert error">{notice}</div>}
      <section className="card">
        {loading && !data && <p className="muted">불러오는 중…</p>}
        {error != null && <div className="alert error">{errorMessage(error)}</div>}
        {data && invites.length === 0 && <p className="muted">받은 초대가 없습니다.</p>}
        <ul className="list">
          {invites.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              onStale={(text) => {
                setNotice(text)
                reload() // 이미 처리된 초대를 목록에서 없애기 위해 새로고침
              }}
              onDeclined={() => {
                setNotice(null)
                reload()
              }}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}

function InviteRow({ invite, onStale, onDeclined }: {
  invite: Invite
  onStale: (text: string) => void
  onDeclined: () => void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const membership = await api.acceptInvite({ params: { inviteId: invite.id } })
      navigate(`/orgs/${encodeURIComponent(membership.orgId)}`)
    } catch (e) {
      const status = errorStatus(e)
      // 가이드 5장: 관리자가 취소한 초대는 내 목록에 남아 있다가, 수락하면 409가 되고 그때 사라진다.
      if (status === 409) onStale(`"${invite.org.name}" 초대는 더 이상 유효하지 않습니다.`)
      else if (status === 404) onStale(`"${invite.org.name}" 초대가 만료되었습니다.`)
      else setError(errorMessage(e))
      setBusy(false)
    }
  }

  async function decline() {
    setBusy(true)
    setError(null)
    try {
      await api.declineInvite({ params: { inviteId: invite.id } })
      onDeclined()
    } catch (e) {
      if (errorStatus(e) === 404) onStale(`"${invite.org.name}" 초대가 이미 사라졌습니다.`)
      else setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <li>
      <div className="stack-tight">
        <strong>{invite.org.name}</strong>
        <span className="muted">{formatDateTime(invite.createdAt)}에 받은 초대</span>
      </div>
      <span className="spacer" />
      <button type="button" disabled={busy} onClick={() => void accept()}>수락</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => void decline()}>거절</button>
      {error && <div className="alert error full">{error}</div>}
    </li>
  )
}

/** 홈 화면 위에 띄우는 "받은 초대가 N개 있어요" 배너 */
export function PendingInvitesBanner() {
  const load = useCallback(() => api.listMyInvites({ query: {} }), [])
  const { data } = useApi(load)
  const count = data?.invites.length ?? 0
  if (count === 0) return null
  return (
    <Link to="/invites" className="banner">
      📨 받은 초대가 <strong>{count}개</strong> 있습니다. 확인하기 →
    </Link>
  )
}
