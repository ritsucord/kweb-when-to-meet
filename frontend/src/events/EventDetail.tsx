import { useState } from 'react'
import type { CalendarEvent, Member } from 'shared'
import { api } from '../api/client.ts'
import { errorMessage } from '../api/errors.ts'
import { formatDateTime } from '../lib/time.ts'
import StatusBadge from './StatusBadge.tsx'

interface Props {
  orgId: string
  event: CalendarEvent
  members: Member[]
  /** 상태를 바꿀 수 있는지: 만든 사람 또는 관리자 (가이드 5장) */
  canChangeStatus: boolean
  onUpdated: (event: CalendarEvent) => void
  onClose: () => void
}

export default function EventDetail({ orgId, event, members, canChangeStatus, onUpdated, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 응답에는 유저 id만 있으므로, 멤버 목록에서 이름을 찾아 붙인다.
  // 탈퇴한 사람은 일정에서도 빠지지만, 혹시 못 찾으면 '(알 수 없음)'으로 표시한다.
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '(알 수 없음)'
  const next = event.status === 'confirmed' ? 'tentative' : 'confirmed'

  async function toggleStatus() {
    setBusy(true)
    setError(null)
    try {
      const updated = await api.updateEventStatus({ params: { orgId, eventId: event.id }, body: { status: next } })
      onUpdated(updated)
    } catch (e) {
      setError(errorMessage(e, { 403: '일정을 만든 사람이나 관리자만 상태를 바꿀 수 있습니다.', 404: '이미 삭제된 일정입니다.' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card stack">
      <div className="row">
        <h2>{event.title ?? '(제목 없음)'}</h2>
        <StatusBadge status={event.status} />
        <span className="spacer" />
        <button type="button" className="secondary" onClick={onClose} aria-label="닫기">✕</button>
      </div>
      <p>{formatDateTime(event.start)} ~ {formatDateTime(event.end)}</p>
      <p className="muted">만든 사람: {nameOf(event.createdBy)}</p>
      <div>
        <strong>참여자 {event.participants.length}명</strong>
        <div className="chips">
          {event.participants.map((id) => <span key={id} className="chip on">{nameOf(id)}</span>)}
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {canChangeStatus && (
        <div className="row">
          <button type="button" disabled={busy} onClick={() => void toggleStatus()}>
            {next === 'confirmed' ? '확정하기' : '미확정으로 되돌리기'}
          </button>
        </div>
      )}
      <p className="muted small">일정 수정·삭제 기능은 아직 서버에서 지원하지 않습니다.</p>
    </section>
  )
}
