import { useState, type FormEvent } from 'react'
import { CreateEventRequest, type CalendarEvent, type EventStatus, type Member } from 'shared'
import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { FormField } from '@/components/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { fromLocalInput, toLocalInput, toServerTime } from '@/lib/time'

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
 * 일정 만들기 폼. 데스크톱에서는 옆 패널, 그보다 좁으면 시트 안에 들어간다.
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
    <form className="grid gap-5" onSubmit={handleSubmit} noValidate>
      <Button type="button" variant="outline" onClick={asMyAvailability} className="justify-self-start">
        내 가능 시간으로 설정
      </Button>

      <FormField label="제목" hint=" 선택" error={errors.title}>
        <Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="주간 회의" />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="시작" error={errors.start}>
          <Input type="datetime-local" className="num" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormField>
        <FormField label="끝" error={errors.end}>
          <Input type="datetime-local" className="num" value={end} onChange={(e) => setEnd(e.target.value)} />
        </FormField>
      </div>

      <div className="grid gap-2">
        <Label className="text-sm font-semibold" id="status-label">상태</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          value={status}
          onValueChange={(v) => v && setStatus(v as EventStatus)}
          aria-labelledby="status-label"
          className="w-full"
        >
          <ToggleGroupItem value="tentative" className="h-10 flex-1">
            미확정
          </ToggleGroupItem>
          <ToggleGroupItem value="confirmed" className="h-10 flex-1">
            확정
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-2">
        <Label className="text-sm font-semibold">참여자 <span className="num font-normal text-ink-soft">{participants.size}</span></Label>
        {/* 참여자: 체크박스 목록 (2열). 칩·아이콘 대신 표준 체크박스 */}
        <ul className="grid grid-cols-2 border-t border-line" role="group" aria-label="참여자">
          {members.map((m) => (
            <li key={m.id} className="border-b border-line">
              <label className="flex h-10 cursor-pointer items-center gap-2.5 text-[0.95rem]">
                <Checkbox checked={participants.has(m.id)} onCheckedChange={() => toggleParticipant(m.id)} />
                <span className="truncate">{m.name}{m.id === myId && <span className="ml-1 text-ink-soft">나</span>}</span>
              </label>
            </li>
          ))}
        </ul>
        {errors.participants && <p className="text-sm font-medium text-accent-ink">{errors.participants}</p>}
      </div>

      {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>취소</Button>
        <Button type="submit" disabled={submitting}>{submitting ? '만드는 중…' : '일정 만들기'}</Button>
      </div>
    </form>
  )
}
