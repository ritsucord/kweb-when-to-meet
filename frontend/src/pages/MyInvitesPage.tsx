import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { Invite } from 'shared'
import { api } from '@/api/client'
import { errorMessage, errorStatus } from '@/api/errors'
import { useAppData } from '@/app/AppData'
import { Empty, Rows, TableHead } from '@/components/editorial'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/time'
import { useApi } from '@/lib/useApi'

// 표의 열: 조직 | 받은 시각 | 동작
const COLUMNS = 'minmax(0,1fr) 200px 176px'

/** 나에게 온 초대: 수락하면 그 조직의 멤버가 된다 */
export default function MyInvitesPage() {
  const { refresh } = useAppData()
  const load = useCallback(() => api.listMyInvites({ query: {} }), [])
  const { data, error, loading, reload } = useApi(load)
  const [notice, setNotice] = useState<string | null>(null)
  // 서버가 정렬을 보장하지 않으므로 최근에 받은 것부터
  const invites = [...(data?.invites ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  const afterChange = () => {
    reload() // 이 화면 목록
    refresh() // 사이드바 개수, 조직 목록
  }

  return (
    <div className="space-y-8">
      <PageHeader title="받은 초대" />

      {notice && <Alert variant="destructive"><AlertDescription>{notice}</AlertDescription></Alert>}
      {error != null && <Alert variant="destructive"><AlertDescription>{errorMessage(error)}</AlertDescription></Alert>}

      {loading && !data ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : data && invites.length === 0 ? (
        <Empty>받은 초대가 없습니다.</Empty>
      ) : (
        <div>
          <TableHead columns={COLUMNS} cols={['조직', '받은 시각', '']} />
          <Rows className="border-t-0">
            {invites.map((invite) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                onStale={(text) => { setNotice(text); afterChange() }}
                onDeclined={() => { setNotice(null); afterChange() }}
                onAccepted={refresh}
              />
            ))}
          </Rows>
        </div>
      )}
    </div>
  )
}

function InviteRow({ invite, onStale, onDeclined, onAccepted }: {
  invite: Invite
  onStale: (text: string) => void
  onDeclined: () => void
  onAccepted: () => void
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      const membership = await api.acceptInvite({ params: { inviteId: invite.id } })
      onAccepted()
      toast.success(`${invite.org.name}에 참여했습니다.`)
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
      toast(`${invite.org.name} 초대를 거절했습니다.`)
      onDeclined()
    } catch (e) {
      if (errorStatus(e) === 404) onStale(`"${invite.org.name}" 초대가 이미 사라졌습니다.`)
      else setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <li className="grid items-center gap-x-4 gap-y-2 py-4 md:grid-cols-[minmax(0,1fr)_200px_176px]">
      <span className="font-serif text-xl font-bold break-keep">{invite.org.name}</span>
      <span className="num text-sm text-ink-soft">{formatDateTime(invite.createdAt)}</span>
      <div className="flex gap-2 md:justify-end">
        <Button variant="outline" className="flex-1 md:flex-none" disabled={busy} onClick={() => void decline()}>거절</Button>
        <Button className="flex-1 md:flex-none" disabled={busy} onClick={() => void accept()}>수락</Button>
      </div>
      {error && <div className="md:col-span-3"><Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert></div>}
    </li>
  )
}
