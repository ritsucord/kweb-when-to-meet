import { useEffect, useRef, useState } from 'react'
import type { CalendarEvent } from 'shared'
import { formatTime } from '@/lib/time'
import { cn } from '@/lib/utils'
import { isSameDay, layoutDays, WEEKDAYS, weekdayIndex } from './week'

const HOUR_PX = 52 // 한 시간 칸의 높이
const HOURS = Array.from({ length: 24 }, (_, h) => h)

interface Props {
  /** 그릴 날짜들: 태블릿·데스크톱은 7일, 휴대폰은 1일 */
  days: Date[]
  events: CalendarEvent[]
  selectedId: string | null
  /** 일정 블록을 눌렀을 때 */
  onSelect: (event: CalendarEvent) => void
  /** 빈 칸을 눌렀을 때: 그 시각으로 새 일정 폼을 연다 */
  onSlotClick: (start: Date) => void
  className?: string
}

/** 날짜 열 × 24시간 격자에 일정을 시간 위치대로 블록으로 올린다. */
export function CalendarGrid({ days, events, selectedId, onSelect, onSlotClick, className }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const segmentsByDay = layoutDays(events, days)
  const now = useNow()
  const single = days.length === 1

  // 처음 그려질 때 오전 8시 근처로 스크롤해 둔다. (ref: 실제 DOM 요소에 접근하는 방법)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: HOUR_PX * 8 - 8 })
  }, [])

  // 날짜 열 너비: 7일이면 최소 96px(넘치면 가로 스크롤), 1일이면 화면 전체
  const columns = `56px repeat(${days.length}, minmax(${single ? '0' : '96px'}, 1fr))`

  return (
    <div className={cn('overflow-hidden border-t-2 border-b border-t-ink border-b-line', className)}>
      <div className="overflow-x-auto">
        <div className={single ? '' : 'min-w-[720px]'}>
          {/* 요일 머리글 (휴대폰 1일 보기에서는 위의 날짜 줄이 대신한다) */}
          {!single && (
            <div className="grid border-b border-ink" style={{ gridTemplateColumns: columns }}>
              <div />
              {days.map((date) => {
                const today = isSameDay(date, now)
                return (
                  <div key={date.getTime()} className={cn('flex items-baseline gap-2 border-l border-line px-2 py-2', today && 'border-t-2 border-t-accent-ink -mt-0.5')}>
                    <span className={cn('eyebrow', today && 'text-accent-ink')}>{WEEKDAYS[weekdayIndex(date)]}</span>
                    <span className={cn('num text-lg font-semibold', today && 'text-accent-ink')}>{date.getDate()}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div ref={scrollRef} className="max-h-[min(640px,calc(100dvh-280px))] min-h-[360px] overflow-y-auto">
            <div className="relative grid" style={{ gridTemplateColumns: columns, height: HOUR_PX * 24 }}>
              {/* 왼쪽 시각 눈금 */}
              <div className="relative">
                {HOURS.map((h) => h > 0 && (
                  <span key={h} className="num absolute right-2 -translate-y-1/2 text-[0.7rem] text-ink-soft" style={{ top: h * HOUR_PX }}>
                    {String(h).padStart(2, '0')}:00
                  </span>
                ))}
              </div>

              {segmentsByDay.map((segments, i) => {
                const date = days[i]
                const isToday = isSameDay(date, now)
                return (
                  <div key={date.getTime()} className="relative border-l border-line">
                    {/* 한 시간짜리 빈 칸들: 누르면 그 시각으로 일정 만들기 */}
                    {HOURS.map((h) => (
                      <button
                        key={h}
                        type="button"
                        className="absolute inset-x-0 border-t border-line outline-none hover:bg-muted focus-visible:bg-muted"
                        style={{ top: h * HOUR_PX, height: HOUR_PX }}
                        aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 ${h}시에 일정 만들기`}
                        onClick={() => {
                          const start = new Date(date)
                          start.setHours(h, 0, 0, 0)
                          onSlotClick(start)
                        }}
                      />
                    ))}

                    {/* 현재 시각 선 */}
                    {isToday && (
                      <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_PX }}>
                        <span className="-ml-[3px] size-1.5 bg-accent-ink" />
                        <span className="h-px flex-1 bg-accent-ink" />
                      </div>
                    )}

                    {/* 일정 블록: top/height는 시각, left/width는 겹침 열(lane)로 정한다 */}
                    {segments.map((seg) => {
                      const ev = seg.event
                      const height = Math.max(((seg.endMin - seg.startMin) / 60) * HOUR_PX - 2, 22)
                      const confirmed = ev.status === 'confirmed'
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          data-status={ev.status}
                          className={cn(
                            // 확정 = 초록 칸, 미확정 = 황토 칸 + 점선. 선택 = 반전(.selected)
                            'event-block absolute z-10 flex flex-col overflow-hidden rounded-xs px-1.5 py-1 text-left text-xs leading-tight outline-none',
                            'hover:underline focus-visible:underline',
                            confirmed
                              ? 'border border-confirmed bg-confirmed text-confirmed-ink'
                              : 'border border-dashed border-tentative-line bg-tentative text-tentative-ink',
                            ev.id === selectedId && 'selected z-20 border-2 border-solid border-ink no-underline',
                          )}
                          style={{
                            top: (seg.startMin / 60) * HOUR_PX + 1,
                            height,
                            left: `calc(${(seg.lane / seg.lanes) * 100}% + 3px)`,
                            width: `calc(${100 / seg.lanes}% - 6px)`,
                          }}
                          onClick={() => onSelect(ev)}
                          title={`${ev.title ?? '(제목 없음)'} · ${formatTime(ev.start)}~${formatTime(ev.end)}`}
                        >
                          <span className="truncate text-[0.8rem] font-semibold">{ev.title ?? '(제목 없음)'}</span>
                          {height > 36 && <span className="num truncate">{formatTime(ev.start)}–{formatTime(ev.end)}</span>}
                          {height > 56 && <span className="num truncate">{ev.participants.length}명</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 1분마다 갱신되는 현재 시각 (현재 시각 선용) */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])
  return now
}
