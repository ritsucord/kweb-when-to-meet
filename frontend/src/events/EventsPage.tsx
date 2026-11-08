import { useCallback, useState } from 'react'
import type { CalendarEvent, EventStatus } from 'shared'
import { api } from '../api/client.ts'
import { errorMessage } from '../api/errors.ts'
import { useAuth } from '../auth/context.ts'
import { formatDateTime, toServerTime } from '../lib/time.ts'
import { useApi } from '../lib/useApi.ts'
import { useOrg } from '../org/context.ts'
import EventDetail from './EventDetail.tsx'
import EventForm from './EventForm.tsx'
import StatusBadge from './StatusBadge.tsx'
import WeekGrid from './WeekGrid.tsx'
import { addDays, startOfWeek } from './week.ts'

const dateLabel = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' })

export default function EventsPage() {
  const { org, members, isAdmin } = useOrg()
  const { user } = useAuth()
  const myId = user!.id
  const orgId = org.id

  // ---- 화면 상태 ----
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all')
  const [mineOnly, setMineOnly] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formStart, setFormStart] = useState<Date | null>(null) // null이면 폼 닫힘

  // ---- 데이터: 보고 있는 주와 "겹치는" 일정만 서버에서 가져온다 (가이드 5장: from/to는 겹침 기준) ----
  const weekTime = weekStart.getTime() // Date 객체 대신 숫자를 의존값으로 써야 비교가 정확하다
  const load = useCallback(
    () => api.listEvents({
      params: { orgId },
      query: {
        from: toServerTime(new Date(weekTime)),
        to: toServerTime(addDays(new Date(weekTime), 7)),
        status: statusFilter === 'all' ? undefined : statusFilter,
        participantId: mineOnly ? myId : undefined,
      },
    }),
    [orgId, weekTime, statusFilter, mineOnly, myId],
  )
  const { data, error, loading, reload } = useApi(load)
  // 서버는 정렬을 보장하지 않는다 → 시작 시각순으로 정렬
  const events = [...(data?.events ?? [])].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  // 선택한 일정은 id로만 기억하고, 실제 내용은 최신 목록에서 찾는다 (새로고침 후에도 최신 상태 유지)
  const selected = events.find((e) => e.id === selectedId) ?? null

  const moveWeek = (n: number) => setWeekStart((w) => addDays(w, n * 7))

  function handleCreated(created: CalendarEvent) {
    setFormStart(null)
    setSelectedId(created.id)
    setWeekStart(startOfWeek(new Date(created.start))) // 만든 일정이 있는 주로 이동
    reload()
  }

  return (
    <div className="stack">
      {/* 도구 막대: 주 이동, 필터, 새 일정 */}
      <div className="row toolbar">
        <button type="button" className="secondary" onClick={() => moveWeek(-1)} aria-label="이전 주">‹</button>
        <button type="button" className="secondary" onClick={() => setWeekStart(startOfWeek(new Date()))}>오늘</button>
        <button type="button" className="secondary" onClick={() => moveWeek(1)} aria-label="다음 주">›</button>
        <strong className="week-label">
          {dateLabel.format(weekStart)} – {dateLabel.format(addDays(weekStart, 6))}
        </strong>
        <span className="spacer" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as EventStatus | 'all')} aria-label="상태 필터">
          <option value="all">전체</option>
          <option value="confirmed">확정만</option>
          <option value="tentative">미확정만</option>
        </select>
        <label className="inline">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> 내가 참여한 일정만
        </label>
        <button type="button" onClick={() => { setSelectedId(null); setFormStart(nextHour()) }}>+ 새 일정</button>
      </div>

      {error != null && <div className="alert error">{errorMessage(error)}</div>}

      {formStart && (
        <EventForm
          key={formStart.getTime()} // 다른 칸을 누르면 폼을 새로 만들어 시작 시각을 다시 채운다
          orgId={orgId}
          members={members}
          myId={myId}
          initialStart={formStart}
          onCreated={handleCreated}
          onCancel={() => setFormStart(null)}
        />
      )}

      {selected && !formStart && (
        <EventDetail
          orgId={orgId}
          event={selected}
          members={members}
          canChangeStatus={selected.createdBy === myId || isAdmin}
          onUpdated={() => reload()}
          onClose={() => setSelectedId(null)}
        />
      )}

      <div className={loading ? 'loading-dim' : undefined}>
        <WeekGrid
          weekStart={weekStart}
          events={events}
          selectedId={selectedId}
          onSelect={(ev) => { setFormStart(null); setSelectedId(ev.id) }}
          onSlotClick={(start) => { setSelectedId(null); setFormStart(start) }}
        />
      </div>

      {/* 같은 일정을 목록으로도 보여준다 (좁은 화면, 스크린리더용) */}
      <section className="card">
        <h2>이번 주 일정 {events.length}개</h2>
        {data && events.length === 0 && <p className="muted">이 주에는 일정이 없습니다. 빈 칸을 눌러 일정을 만들어 보세요.</p>}
        <ul className="list">
          {events.map((ev) => (
            <li key={ev.id}>
              <button type="button" className="link" onClick={() => { setFormStart(null); setSelectedId(ev.id) }}>
                {ev.title ?? '(제목 없음)'}
              </button>
              <StatusBadge status={ev.status} />
              <span className="muted">{formatDateTime(ev.start)} ~ {formatDateTime(ev.end)} · {ev.participants.length}명</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/** 지금 이후 가장 가까운 정각 */
function nextHour(): Date {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}
