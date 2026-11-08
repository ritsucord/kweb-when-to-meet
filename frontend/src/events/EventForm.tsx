import { useState, type FormEvent } from 'react'
import { CreateEventRequest, type CalendarEvent, type EventStatus, type Member } from 'shared'
import { api } from '../api/client.ts'
import { errorMessage } from '../api/errors.ts'
import { fromLocalInput, toLocalInput, toServerTime } from '../lib/time.ts'

interface Props {
  orgId: string
  members: Member[]
  myId: string
  /** 폼을 열 때 채워 둘 시작 시각 (빈 칸을 눌러 열었을 때) */
  initialStart: Date
  onCreated: (event: CalendarEvent) => void
  onCancel: () => void
}

/**
 * 일정 만들기 폼.
 * "내 가능 시간"은 참여자가 나 혼자인 미확정(tentative) 일정으로 표현한다(명세 CreateEvent 설명).
 */
export default function EventForm({ orgId, members, myId, initialStart, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(toLocalInput(initialStart))
  const [end, setEnd] = useState(toLocalInput(new Date(initialStart.getTime() + 60 * 60 * 1000)))
  const [status, setStatus] = useState<EventStatus>('tentative')
  const [participants, setParticipants] = useState<Set<string>>(() => new Set([myId]))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleParticipant(id: string) {
    // Set을 직접 고치지 않고 새 Set을 만들어야 React가 변경을 알아챈다(불변성).
    setParticipants((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** "내 가능 시간" 빠른 설정: 나만 참여하는 미확정 일정 */
  function asMyAvailability() {
    setTitle('가능한 시간')
    setStatus('tentative')
    setParticipants(new Set([myId]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!start || !end) {
      setErrors({ start: '시작과 끝 시각을 입력해 주세요.' })
      return
    }
    const body = {
      title: title.trim() || undefined, // 빈 제목은 보내지 않는다 (응답에서는 null)
      start: toServerTime(fromLocalInput(start)), // 로컬 시각 → UTC 'Z' 문자열
      end: toServerTime(fromLocalInput(end)),
      status,
      participants: [...participants],
    }
    const parsed = CreateEventRequest.safeParse(body)
    if (!parsed.success) {
      const next: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0])
        if (key === 'end') next.end = '끝 시각은 시작 시각보다 늦어야 합니다.'
        else if (key === 'participants') next.participants = '참여자를 한 명 이상 선택해 주세요.'
        else if (key === 'title') next.title = '제목은 200자 이하로 입력해 주세요.'
        else next.start = '시각을 다시 확인해 주세요.'
      }
      setErrors(next)
      return
    }
    setErrors({})
    setFormError(null)
    setSubmitting(true)
    try {
      const created = await api.createEvent({ params: { orgId }, body: parsed.data })
      onCreated(created)
    } catch (err) {
      setFormError(errorMessage(err, { 400: '참여자 중 조직 멤버가 아닌 사람이 있거나 입력값이 올바르지 않습니다.' }))
      setSubmitting(false)
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit} noValidate>
      <div className="row">
        <h2>새 일정</h2>
        <span className="spacer" />
        <button type="button" className="secondary" onClick={asMyAvailability}>내 가능 시간으로 설정</button>
      </div>
      <label>
        제목 <span className="muted">(선택)</span>
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="예: 주간 회의" />
        {errors.title && <span className="field-error">{errors.title}</span>}
      </label>
      <div className="row two">
        <label>
          시작
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          {errors.start && <span className="field-error">{errors.start}</span>}
        </label>
        <label>
          끝
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          {errors.end && <span className="field-error">{errors.end}</span>}
        </label>
      </div>
      <fieldset className="plain">
        <legend>상태</legend>
        <div className="row">
          <label className="inline">
            <input type="radio" name="status" checked={status === 'tentative'} onChange={() => setStatus('tentative')} /> 미확정
          </label>
          <label className="inline">
            <input type="radio" name="status" checked={status === 'confirmed'} onChange={() => setStatus('confirmed')} /> 확정
          </label>
        </div>
      </fieldset>
      <fieldset className="plain">
        <legend>참여자 ({participants.size}명)</legend>
        <div className="chips">
          {members.map((m) => (
            <label key={m.id} className={`chip${participants.has(m.id) ? ' on' : ''}`}>
              <input type="checkbox" checked={participants.has(m.id)} onChange={() => toggleParticipant(m.id)} />
              {m.name}{m.id === myId && ' (나)'}
            </label>
          ))}
        </div>
        {errors.participants && <span className="field-error">{errors.participants}</span>}
      </fieldset>
      {formError && <div className="alert error">{formError}</div>}
      <div className="row">
        <button type="submit" disabled={submitting}>{submitting ? '만드는 중…' : '일정 만들기'}</button>
        <button type="button" className="secondary" onClick={onCancel}>닫기</button>
      </div>
    </form>
  )
}
