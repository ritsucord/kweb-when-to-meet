
import { Fragment, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { addDays, startOfWeek, WEEKDAYS } from '@/events/week'
import {
  getMockOverlap,
  slotDate,
  slotKey,
} from './mockAvailability'

const SLOTS_PER_DAY = 48

const OVERLAP_COLORS = [
  '#FFFFFF',
  '#DBEAFE',
  '#93C5FD',
  '#2563EB',
]

export default function AvailabilityPage() {
  const [weekStart, setWeekStart] = useState(
    () => startOfWeek(new Date())
  )

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set()
  )

  const [showOverlap, setShowOverlap] = useState(false)

  const [touchDragMode, setTouchDragMode] = useState(false)

  const gridRef = useRef<HTMLDivElement>(null)

  const dragRef = useRef<{
    pointerId: number
    selecting: boolean
    visited: Set<string>
  } | null>(null)

  const pointerTypeRef = useRef<string | null>(null)

  const days = Array.from(
    { length: 7 },
    (_, i) => addDays(weekStart, i)
  )

  const overlapSlots = getMockOverlap(days, selected)

  function countAt(day: Date, slot: number): number {
    const start = slotDate(day, slot).getTime()
    const end = slotDate(day, slot + 1).getTime()

    const match = overlapSlots.find(
      (item) =>
        Date.parse(item.start) <= start &&
        Date.parse(item.end) >= end
    )

    return match?.participantCount ?? 0
  }

  function updateSlot(key: string, selecting: boolean) {
    setSelected((previous) => {
      if (previous.has(key) === selecting) return previous

      const next = new Set(previous)

      if (selecting) next.add(key)
      else next.delete(key)

      return next
    })
  }

  function toggleSlot(key: string) {
    setSelected((previous) => {
      const next = new Set(previous)

      if (next.has(key)) next.delete(key)
      else next.add(key)

      return next
    })
  }

  
function beginDrag(
  event: ReactPointerEvent<HTMLButtonElement>,
  key: string
) {
  if (showOverlap) return

  const isMouse = event.pointerType === 'mouse'
  const isTouchDrag =
    event.pointerType === 'touch' && touchDragMode

  // 클릭 이벤트가 시간을 중복 선택하지 않도록 구분
  pointerTypeRef.current = isTouchDrag
    ? 'touch-drag'
    : event.pointerType

  // 일반 터치는 기존의 탭 선택 및 스크롤 유지
  if (!isMouse && !isTouchDrag) return

  // 마우스는 왼쪽 버튼만 사용
  if (isMouse && event.button !== 0) return

  event.preventDefault()

  // 빈 칸에서 시작하면 선택, 선택된 칸이면 해제
  const selecting = !selected.has(key)

  dragRef.current = {
    pointerId: event.pointerId,
    selecting,
    visited: new Set([key]),
  }

  updateSlot(key, selecting)

  event.currentTarget.setPointerCapture(event.pointerId)
}

  function moveDrag(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    const drag = dragRef.current

    if (!drag || drag.pointerId !== event.pointerId) return

    const element = document.elementFromPoint(
      event.clientX,
      event.clientY
    )

    const cell = element?.closest<HTMLElement>(
      '[data-availability-key]'
    )

    if (!cell || !gridRef.current?.contains(cell)) return

    const key = cell.dataset.availabilityKey

    if (!key || drag.visited.has(key)) return

    drag.visited.add(key)
    updateSlot(key, drag.selecting)
  }

  function endDrag(
    event: ReactPointerEvent<HTMLButtonElement>
  ) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">
          가능 시간 선택
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          {showOverlap
            ? '팀원 3명의 가능 시간을 비교합니다.'
            : '가능한 시간을 클릭하거나 드래그하여 선택하세요.'}
        </p>
      </div>

      {/* 선택 모드 / 겹침 보기 전환 */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowOverlap(false)}
          className={
            'border px-4 py-2 text-sm ' +
            (!showOverlap
              ? 'border-ink bg-ink text-white'
              : 'border-line bg-paper')
          }
        >
          내 시간 선택
        </button>

        <button
          type="button"
          onClick={() => setShowOverlap(true)}
          className={
            'border px-4 py-2 text-sm ' +
            (showOverlap
              ? 'border-ink bg-ink text-white'
              : 'border-line bg-paper')
          }
        >
          겹침 보기
        </button>
      </div>


      {/* 모바일 터치 드래그 모드 */}
      {!showOverlap && (
        <div className="flex items-center gap-3 md:hidden">
          <button
            type="button"
            aria-pressed={touchDragMode}
            onClick={() => {
              dragRef.current = null
              setTouchDragMode((prev) => !prev)
            }}
            className={
              'border px-4 py-2 text-sm font-medium ' +
              (touchDragMode
                ? 'border-ink bg-ink text-white'
                : 'border-line bg-paper')
            }
          >
            {touchDragMode
              ? '드래그 선택 ON'
              : '드래그 선택 OFF'}
          </button>

          <span className="text-xs text-ink-soft">
            {touchDragMode
              ? '손가락을 움직여 시간을 선택하세요.'
              : '시간표를 스크롤하거나 칸을 터치하세요.'}
          </span>
        </div>
      )}


      {/* 주간 이동 */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="border border-ink px-3 py-2"
          onClick={() =>
            setWeekStart((prev) => addDays(prev, -7))
          }
        >
          ← 이전 주
        </button>

        <span className="font-semibold">
          {weekStart.getMonth() + 1}월 {weekStart.getDate()}일 주
        </span>

        <button
          type="button"
          className="border border-ink px-3 py-2"
          onClick={() =>
            setWeekStart((prev) => addDays(prev, 7))
          }
        >
          다음 주 →
        </button>
      </div>

      <p className="text-sm">
        내가 선택한 시간: {selected.size}칸
        {' '}({selected.size * 30}분)
      </p>

      {/* 겹침 색상 범례 */}
      {showOverlap && (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {[1, 2, 3].map((count) => (
            <div key={count} className="flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 border border-line"
                style={{
                  backgroundColor: OVERLAP_COLORS[count],
                }}
              />
              <span>{count}명 가능</span>
            </div>
          ))}
        </div>
      )}

      {/* 주간 격자 */}
      <div className="max-h-[640px] overflow-auto border border-line">
        <div
          ref={gridRef}
          className="grid min-w-[760px]"
          style={{
            gridTemplateColumns:
             '56px repeat(7, minmax(90px, 1fr))',
            touchAction: touchDragMode && !showOverlap
              ? 'none'
              : 'auto',
          }}
        >
          <div className="border-b border-line p-2">
            시간
          </div>

          {days.map((day, index) => (
            <div
              key={day.getTime()}
              className="border-b border-l border-line p-2 text-center"
            >
              {WEEKDAYS[index]} {day.getDate()}
            </div>
          ))}

          {Array.from(
            { length: SLOTS_PER_DAY },
            (_, slot) => (
              <Fragment key={slot}>
                <div className="border-t border-line px-1 text-xs text-ink-soft">
                  {slot % 2 === 0
                    ? `${String(slot / 2).padStart(2, '0')}:00`
                    : ''}
                </div>

                {days.map((day) => {
                  const key = slotKey(day, slot)
                  const active = selected.has(key)
                  const count = showOverlap
                    ? countAt(day, slot)
                    : 0

                  const timeLabel =
                    `${String(Math.floor(slot / 2)).padStart(2, '0')}:` +
                    (slot % 2 === 0 ? '00' : '30')

                  return (
                    <button
                      key={key}
                      type="button"
                      data-availability-key={key}
                      aria-pressed={active}
                      aria-label={
                        `${day.getMonth() + 1}월 ${day.getDate()}일 ` +
                        `${timeLabel} ` +
                        (showOverlap
                          ? `${count}명 가능`
                          : '가능 시간 선택')
                      }
                      onPointerDown={(event) =>
                        beginDrag(event, key)
                      }
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onLostPointerCapture={endDrag}
                      onClick={(event) => {
                        if (showOverlap) return

                        // 키보드 선택은 항상 허용
                        if (event.detail === 0) {
                          toggleSlot(key)
                          return
                        }

                        // 마우스와 터치 드래그는
                        // onPointerDown에서 이미 처리됨
                        if (
                          pointerTypeRef.current === 'mouse' ||
                          pointerTypeRef.current === 'touch-drag'
                        ) {
                          return
                        }

                        // 일반 모바일 터치는 한 칸씩 선택
                        toggleSlot(key)
                      }}
                      className={
                        'h-7 border-t border-l border-line text-xs ' +
                        (showOverlap
                          ? count === 3
                            ? 'text-white'
                            : 'text-ink'
                          : active
                            ? 'bg-accent-ink text-white'
                            : 'bg-paper hover:bg-muted')
                      }
                      style={
                        showOverlap
                          ? {
                              backgroundColor:
                                OVERLAP_COLORS[count],
                            }
                          : undefined
                      }
                    >
                      {showOverlap && count > 0 ? count : ''}
                    </button>
                  )
                })}
              </Fragment>
            )
          )}
        </div>
      </div>

      <p className="text-xs text-ink-soft">
        현재는 Mock Data로 작동하는 시범 화면입니다.
        선택한 시간은 서버에 저장되지 않습니다.
      </p>
    </div>
  )
}
