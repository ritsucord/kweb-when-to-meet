import { useCallback, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { CalendarEvent, EventStatus } from 'shared'
import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { StatusBadge } from '@/components/RoleBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Rows, Section } from '@/components/editorial'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Toggle } from '@/components/ui/toggle'
import { BREAKPOINTS, useMediaQuery } from '@/hooks/useMediaQuery'
import { formatTime, toServerTime } from '@/lib/time'
import { useApi } from '@/lib/useApi'
import { cn } from '@/lib/utils'
import { useOrg } from '@/org/context'
import { CalendarGrid } from './CalendarGrid'
import EventDetail from './EventDetail'
import EventForm from './EventForm'
import { addDays, countOnDay, isSameDay, startOfDay, startOfWeek, WEEKDAYS } from './week'

/** 11.09 같은 짧은 날짜 (고정폭 숫자로 표시) */
const shortDate = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
const dayLabel = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })

/** 옆 패널(또는 시트)에 무엇을 띄울지 */
type Panel = { kind: 'create'; start: Date } | { kind: 'detail'; id: string } | null

/**
 * 일정 탭. 화면 크기에 따라 구성이 바뀐다.
 *
 * - 데스크톱 xl(1280px~): [ 주간 캘린더 | 옆 패널(상세/만들기/이번 주 목록) ]
 * - 태블릿 md~xl(768~1279px): 주간 캘린더 + 아래 목록, 상세/만들기는 오른쪽 시트
 * - 휴대폰 ~md(~767px): 날짜 선택 줄 + 하루 보기, 상세/만들기는 아래에서 올라오는 시트
 */
export default function EventsPage() {
  const { org, members, isAdmin } = useOrg()
  const { user } = useAuth()
  const myId = user!.id
  const orgId = org.id

  const isTabletUp = useMediaQuery(BREAKPOINTS.md)
  const isDesktop = useMediaQuery(BREAKPOINTS.xl)

  // ---- 화면 상태 ----
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date())) // 휴대폰 하루 보기용
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all')
  const [mineOnly, setMineOnly] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)

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
  const selected = panel?.kind === 'detail' ? events.find((e) => e.id === panel.id) ?? null : null

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const visibleDays = isTabletUp ? weekDays : [selectedDay]

  function goToWeek(start: Date, day?: Date) {
    setWeekStart(start)
    // 휴대폰: 새 주로 가면 그 주의 같은 요일(또는 지정한 날)을 고른다
    setSelectedDay(day ?? addDays(start, (selectedDay.getDay() + 6) % 7))
  }
  const moveWeek = (n: number) => goToWeek(addDays(weekStart, n * 7))
  const goToday = () => goToWeek(startOfWeek(new Date()), startOfDay(new Date()))

  function handleCreated(created: CalendarEvent) {
    toast.success('일정을 만들었습니다.')
    const day = startOfDay(new Date(created.start))
    goToWeek(startOfWeek(day), day) // 만든 일정이 있는 주(날)로 이동
    setPanel({ kind: 'detail', id: created.id })
    reload()
  }

  const openCreate = (start: Date) => setPanel({ kind: 'create', start })
  const openDetail = (ev: CalendarEvent) => setPanel({ kind: 'detail', id: ev.id })

  const panelTitle = panel?.kind === 'create' ? '새 일정' : '일정 상세'
  const panelBody = panel?.kind === 'create' ? (
    <EventForm
      key={panel.start.getTime()} // 다른 칸을 누르면 폼을 새로 만들어 시작 시각을 다시 채운다
      orgId={orgId}
      members={members}
      myId={myId}
      initialStart={panel.start}
      onCreated={handleCreated}
      onCancel={() => setPanel(null)}
    />
  ) : selected ? (
    <EventDetail
      orgId={orgId}
      event={selected}
      members={members}
      canChangeStatus={selected.createdBy === myId || isAdmin}
      onUpdated={() => reload()}
    />
  ) : null

  const weekList = <WeekList events={events} loaded={!!data} selectedId={selected?.id ?? null} onSelect={openDetail} />

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        {/* ---- 도구 막대 ---- */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {/* 주 이동: 1px 잉크 테두리로 묶은 한 덩어리 */}
            <div className="flex items-center divide-x divide-ink border border-ink">
              <Button variant="ghost" size="icon" className="rounded-none hover:bg-muted hover:no-underline" onClick={() => moveWeek(-1)} aria-label="이전 주"><ChevronLeftIcon /></Button>
              <Button variant="ghost" className="rounded-none px-3 hover:bg-muted hover:no-underline" onClick={goToday}>오늘</Button>
              <Button variant="ghost" size="icon" className="rounded-none hover:bg-muted hover:no-underline" onClick={() => moveWeek(1)} aria-label="다음 주"><ChevronRightIcon /></Button>
            </div>
            <h2 className="num text-xl font-semibold md:text-2xl" aria-live="polite">
              {weekStart.getFullYear()}.{shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EventStatus | 'all')}>
              <SelectTrigger className="w-[128px]" aria-label="상태 필터"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="confirmed">확정만</SelectItem>
                <SelectItem value="tentative">미확정만</SelectItem>
              </SelectContent>
            </Select>
            <Toggle
              variant="outline"
              pressed={mineOnly}
              onPressedChange={setMineOnly}
              className="h-10 px-3"
            >
              내 참여만
            </Toggle>
            <Button className="ml-auto md:ml-0" onClick={() => openCreate(nextHour(isTabletUp ? undefined : selectedDay))}>
              새 일정
            </Button>
          </div>
        </div>

        <Legend />

        {error != null && <Alert variant="destructive"><AlertDescription>{errorMessage(error)}</AlertDescription></Alert>}

        {/* ---- 휴대폰: 날짜 선택 줄 ---- */}
        {!isTabletUp && (
          <DayStrip days={weekDays} selected={selectedDay} events={events} onSelect={setSelectedDay} />
        )}
        {!isTabletUp && <p className="font-serif text-lg font-bold">{dayLabel.format(selectedDay)}</p>}

        <CalendarGrid
          days={visibleDays}
          events={events}
          selectedId={selected?.id ?? null}
          onSelect={openDetail}
          onSlotClick={openCreate}
          className={cn(loading && 'opacity-70 transition-opacity')}
        />

        {/* 데스크톱이 아니면 목록은 캘린더 아래에 */}
        {!isDesktop && weekList}
      </div>

      {/* ---- 데스크톱: 옆 패널 ---- */}
      {isDesktop && (
        <aside className="sticky top-12 border-l border-line pl-8">
          {panel && panelBody ? (
            <Section title={panelTitle} aside={<Button variant="ghost" className="h-8 px-0" onClick={() => setPanel(null)}>닫기</Button>}>
              {panelBody}
            </Section>
          ) : (
            weekList
          )}
        </aside>
      )}

      {/* ---- 태블릿·휴대폰: 시트 ---- */}
      {!isDesktop && (
        <Sheet open={!!panel && !!panelBody} onOpenChange={(open) => !open && setPanel(null)}>
          <SheetContent
            side={isTabletUp ? 'right' : 'bottom'}
            className={cn('gap-0 overflow-y-auto', isTabletUp ? 'w-full sm:max-w-md' : 'max-h-[88dvh]')}
          >
            <SheetHeader className="border-b-2 border-ink px-5 py-4">
              <SheetTitle>{panelTitle}</SheetTitle>
              <SheetDescription className="sr-only">{panelTitle}</SheetDescription>
            </SheetHeader>
            <div className="px-5 py-5">{panelBody}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}

/** 이번 주 일정 목록 (데스크톱 옆 패널 / 그 외 캘린더 아래). 선택 행은 반전 */
function WeekList({ events, loaded, selectedId, onSelect }: {
  events: CalendarEvent[]
  loaded: boolean
  selectedId: string | null
  onSelect: (ev: CalendarEvent) => void
}) {
  return (
    <Section title="이번 주" aside={loaded && <span className="num text-sm">{events.length}건</span>}>
      {loaded && events.length === 0 && <p className="border-y border-line py-6">이 주에는 일정이 없습니다.</p>}
      {events.length > 0 && (
        <Rows>
          {events.map((ev) => {
            const start = new Date(ev.start)
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ev)}
                  className={cn(
                    'grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-baseline gap-3 px-2 py-3 text-left outline-none',
                    'hover:[&_.ev-title]:underline focus-visible:[&_.ev-title]:underline',
                    ev.id === selectedId && 'selected [&_.text-ink-soft]:text-paper/70',
                  )}
                >
                  <span className="num text-sm">
                    {shortDate(start)}<span className="ml-1 text-ink-soft">{WEEKDAYS[(start.getDay() + 6) % 7]}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="ev-title block truncate font-semibold underline-offset-4">{ev.title ?? '(제목 없음)'}</span>
                    <span className="num block text-sm text-ink-soft">{formatTime(ev.start)}–{formatTime(ev.end)} / {ev.participants.length}명</span>
                  </span>
                  <span className={cn(ev.id === selectedId && '[&_*]:outline [&_*]:outline-paper')}><StatusBadge status={ev.status} /></span>
                </button>
              </li>
            )
          })}
        </Rows>
      )}
    </Section>
  )
}

/** 휴대폰 날짜 선택 줄: 요일 + 날짜 + 일정 수. 선택한 날은 반전, 오늘은 빨강 숫자 */
function DayStrip({ days, selected, events, onSelect }: {
  days: Date[]
  selected: Date
  events: CalendarEvent[]
  onSelect: (day: Date) => void
}) {
  const today = new Date()
  return (
    <div className="grid grid-cols-7 divide-x divide-line border-y-2 border-ink" role="tablist" aria-label="날짜 선택">
      {days.map((day, i) => {
        const active = isSameDay(day, selected)
        const isToday = isSameDay(day, today)
        const count = countOnDay(events, day)
        return (
          <button
            key={day.getTime()}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(day)}
            className={cn('flex flex-col items-center py-2 outline-none focus-visible:underline', active && 'selected')}
          >
            <span className={cn('text-xs', active ? 'text-paper' : 'text-ink-soft')}>{WEEKDAYS[i]}</span>
            <span className={cn('num text-lg font-semibold', isToday && !active && 'text-accent-ink')}>{day.getDate()}</span>
            <span className="num h-4 text-[0.7rem]">{count > 0 ? count : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

/** 범례: 블록 테두리 규칙 (확정 = 실선, 미확정 = 점선) */
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-2"><span className="h-3 w-5 border border-confirmed bg-confirmed" />확정</span>
      <span className="inline-flex items-center gap-2"><span className="h-3 w-5 border border-dashed border-tentative-line bg-tentative" />미확정 · 가능한 시간</span>
    </div>
  )
}

/** day(없으면 오늘)의 다음 정각. 휴대폰에서 다른 날을 보고 있으면 그날 기준 */
function nextHour(day?: Date): Date {
  const now = new Date()
  const d = day && !isSameDay(day, now) ? new Date(day) : new Date(now)
  if (day && !isSameDay(day, now)) d.setHours(9, 0, 0, 0)
  else {
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
  }
  return d
}
