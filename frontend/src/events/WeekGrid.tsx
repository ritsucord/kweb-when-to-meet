import { useEffect, useRef } from 'react'
import type { CalendarEvent } from 'shared'
import { formatTime } from '../lib/time.ts'
import { addDays, isSameDay, layoutWeek, WEEKDAYS } from './week.ts'

const HOUR_PX = 44 // 한 시간 칸의 높이
const HOURS = Array.from({ length: 24 }, (_, h) => h)

interface Props {
  weekStart: Date
  events: CalendarEvent[]
  selectedId: string | null
  /** 일정 블록을 눌렀을 때 */
  onSelect: (event: CalendarEvent) => void
  /** 빈 칸을 눌렀을 때: 그 시각으로 새 일정 폼을 연다 */
  onSlotClick: (start: Date) => void
}

/** 일주일을 7개 열 × 24시간 격자로 그리고, 일정을 시간 위치에 맞춰 블록으로 올린다. */
export default function WeekGrid({ weekStart, events, selectedId, onSelect, onSlotClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const days = layoutWeek(events, weekStart)
  const today = new Date()

  // 처음 그려질 때 오전 8시 근처로 스크롤해 둔다. (ref: 실제 DOM 요소에 접근하는 방법)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: HOUR_PX * 8 })
  }, [])

  return (
    <div className="week">
      {/* 요일 머리글 */}
      <div className="week-head">
        <div className="week-gutter" />
        {WEEKDAYS.map((name, i) => {
          const date = addDays(weekStart, i)
          return (
            <div key={name} className={`week-day-head${isSameDay(date, today) ? ' today' : ''}`}>
              <span className="muted">{name}</span> <strong>{date.getDate()}</strong>
            </div>
          )
        })}
      </div>

      <div className="week-body" ref={scrollRef}>
        <div className="week-grid" style={{ height: HOUR_PX * 24 }}>
          {/* 왼쪽 시각 눈금 */}
          <div className="week-gutter">
            {HOURS.map((h) => (
              <div key={h} className="hour-label" style={{ top: h * HOUR_PX }}>{h === 0 ? '' : `${h}시`}</div>
            ))}
          </div>

          {days.map((segments, i) => {
            const date = addDays(weekStart, i)
            return (
              <div key={i} className={`week-col${isSameDay(date, today) ? ' today' : ''}`}>
                {/* 한 시간짜리 빈 칸들: 누르면 그 시각으로 일정 만들기 */}
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className="slot"
                    style={{ top: h * HOUR_PX, height: HOUR_PX }}
                    aria-label={`${date.getMonth() + 1}월 ${date.getDate()}일 ${h}시에 일정 만들기`}
                    onClick={() => {
                      const start = new Date(date)
                      start.setHours(h)
                      onSlotClick(start)
                    }}
                  />
                ))}

                {/* 일정 블록: top/height는 시각, left/width는 겹침 열(lane)로 정한다 */}
                {segments.map((seg) => {
                  const ev = seg.event
                  const height = Math.max(((seg.endMin - seg.startMin) / 60) * HOUR_PX, 18)
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      className={`event-block ${ev.status}${ev.id === selectedId ? ' selected' : ''}`}
                      style={{
                        top: (seg.startMin / 60) * HOUR_PX,
                        height,
                        left: `calc(${(seg.lane / seg.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / seg.lanes}% - 4px)`,
                      }}
                      onClick={() => onSelect(ev)}
                      title={`${ev.title ?? '(제목 없음)'} · ${formatTime(ev.start)}~${formatTime(ev.end)}`}
                    >
                      <span className="event-title">{ev.title ?? '(제목 없음)'}</span>
                      {height > 30 && <span className="event-time">{formatTime(ev.start)}~{formatTime(ev.end)}</span>}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
