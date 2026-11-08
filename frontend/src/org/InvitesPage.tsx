import { useCallback, useState, type FormEvent } from 'react'
import { CreateInviteRequest } from 'shared'
import { api } from '../api/client.ts'
import { errorMessage } from '../api/errors.ts'
import ConfirmButton from '../components/ConfirmButton.tsx'
import { formatDateTime } from '../lib/time.ts'
import { useApi } from '../lib/useApi.ts'
import { useOrg } from './context.ts'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 초대 유효 기간 7일 (가이드 5장)

/** 관리자 전용: 이 조직이 보낸 초대 보내기, 목록, 취소 */
export default function InvitesPage() {
  const { org, isAdmin } = useOrg()
  const orgId = org.id
  const load = useCallback(() => api.listOrgInvites({ params: { orgId }, query: {} }), [orgId])
  // 관리자가 아니면 요청 자체를 보내지 않는다(어차피 403).
  if (!isAdmin) return <div className="alert error">초대 관리는 관리자만 할 수 있습니다.</div>
  return <AdminInvites orgId={orgId} load={load} />
}

function AdminInvites({ orgId, load }: { orgId: string; load: () => ReturnType<typeof api.listOrgInvites> }) {
  const { data, error, loading, reload } = useApi(load)
  // 서버가 정렬을 보장하지 않으므로 최근에 보낸 것부터 보여준다.
  const invites = [...(data?.invites ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="stack">
      <InviteForm orgId={orgId} onSent={reload} />

      <section className="card">
        <h2>대기 중인 초대</h2>
        {loading && !data && <p className="muted">불러오는 중…</p>}
        {error != null && <div className="alert error">{errorMessage(error)}</div>}
        {data && invites.length === 0 && <p className="muted">대기 중인 초대가 없습니다.</p>}
        <ul className="list">
          {invites.map((invite) => (
            <li key={invite.id}>
              <div className="stack-tight">
                <span>{invite.email}</span>
                <span className="muted">
                  {formatDateTime(invite.createdAt)} 보냄 · {formatDateTime(new Date(Date.parse(invite.createdAt) + INVITE_TTL_MS).toISOString())} 만료
                </span>
              </div>
              <span className="spacer" />
              <ConfirmButton
                label="취소"
                variant="secondary"
                confirmLabel="초대 취소"
                message={<><strong>{invite.email}</strong>에게 보낸 초대를 취소할까요?</>}
                onConfirm={async () => {
                  await api.deleteInvite({ params: { orgId, inviteId: invite.id } })
                  reload()
                }}
                describeError={(e) => errorMessage(e, { 404: '이미 처리되었거나 만료된 초대입니다.' })}
              />
            </li>
          ))}
        </ul>
        <p className="muted small">
          받은 사람이 거절한 초대도 만료될 때까지 이 목록에 남습니다. 그 사이 같은 이메일로 다시 초대할 수 없습니다.
        </p>
      </section>
    </div>
  )
}

function InviteForm({ orgId, onSent }: { orgId: string; onSent: () => void }) {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = CreateInviteRequest.safeParse({ email: email.trim() })
    if (!parsed.success) {
      setFieldError('이메일 형식이 아닙니다.')
      return
    }
    setFieldError(null)
    setResult(null)
    setSending(true)
    try {
      await api.createInvite({ params: { orgId }, body: parsed.data })
      // 가입하지 않은 이메일이어도 같은 201이 온다(가입 여부를 숨기는 정책). 문구도 구분하지 않는다.
      setResult({ kind: 'success', text: `${parsed.data.email}에게 초대를 보냈습니다.` })
      setEmail('')
      onSent()
    } catch (err) {
      setResult({ kind: 'error', text: errorMessage(err, { 409: '이미 멤버이거나 대기 중인 초대가 있는 이메일입니다.' }) })
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit} noValidate>
      <h2>멤버 초대</h2>
      <p className="muted">초대받은 사람이 수락하면 멤버가 됩니다. 아직 가입하지 않은 사람도 그 이메일로 가입하면 초대를 볼 수 있습니다.</p>
      <div className="row">
        <input type="email" className="grow" placeholder="초대할 이메일" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="초대할 이메일" />
        <button type="submit" disabled={sending}>{sending ? '보내는 중…' : '초대 보내기'}</button>
      </div>
      {fieldError && <span className="field-error">{fieldError}</span>}
      {result && <div className={`alert ${result.kind}`}>{result.text}</div>}
    </form>
  )
}
