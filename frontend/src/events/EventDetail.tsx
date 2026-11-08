import { useState } from 'react'
import { toast } from 'sonner'
import type { CalendarEvent, Member } from 'shared'
import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { Facts } from '@/components/editorial'
import { StatusBadge } from '@/components/RoleBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/time'

interface Props {
  orgId: string
  event: CalendarEvent
  members: Member[]
  /** 상태를 바꿀 수 있는지: 만든 사람 또는 관리자 (가이드 5장) */
  canChangeStatus: boolean
  onUpdated: (event: CalendarEvent) => void
}

/** 일정 상세. 데스크톱에서는 옆 패널, 그보다 좁으면 시트 안에 들어간다. */
export default function EventDetail({ orgId, event, members, canChangeStatus, onUpdated }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 응답에는 유저 id만 있으므로, 멤버 목록에서 이름을 찾아 붙인다.
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '(알 수 없음)'
  const next = event.status === 'confirmed' ? 'tentative' : 'confirmed'

  async function toggleStatus() {
    setBusy(true)
    setError(null)
    try {
      const updated = await api.updateEventStatus({ params: { orgId, eventId: event.id }, body: { status: next } })
      toast.success(next === 'confirmed' ? '일정을 확정했습니다.' : '미확정으로 되돌렸습니다.')
      onUpdated(updated)
    } catch (e) {
      setError(errorMessage(e, { 403: '일정을 만든 사람이나 관리자만 상태를 바꿀 수 있습니다.', 404: '이미 삭제된 일정입니다.' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <StatusBadge status={event.status} />
        <h3 className="text-2xl leading-snug font-bold break-keep">{event.title ?? '(제목 없음)'}</h3>
      </div>

      <Facts
        items={[
          { label: '시작', value: <span className="num">{formatDateTime(event.start)}</span> },
          { label: '끝', value: <span className="num">{formatDateTime(event.end)}</span> },
          { label: '만든 사람', value: nameOf(event.createdBy) },
          {
            label: `참여 ${event.participants.length}`,
            value: <ul className="grid gap-0.5">{event.participants.map((id) => <li key={id}>{nameOf(id)}</li>)}</ul>,
          },
        ]}
      />

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {canChangeStatus ? (
        <Button variant={next === 'confirmed' ? 'default' : 'outline'} disabled={busy} onClick={() => void toggleStatus()}>
          {next === 'confirmed' ? '확정하기' : '미확정으로 되돌리기'}
        </Button>
      ) : (
        <p className="text-sm">상태는 만든 사람이나 관리자만 바꿀 수 있습니다.</p>
      )}
    </div>
  )
}
