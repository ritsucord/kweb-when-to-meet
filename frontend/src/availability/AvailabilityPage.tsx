import { Fragment, useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { Rows, Section } from '@/components/editorial'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { addDays, isSameDay, startOfWeek, WEEKDAYS } from '@/events/week'
import { useApi } from '@/lib/useApi'
import { cn } from '@/lib/utils'
import { useOrg } from '@/org/context'
import { cellsOf, inputsToSelection, selectionToInputs, SLOT_MS, SLOTS_PER_DAY, slotStart, usersByCell } from './slots'
import { availabilitySource, IS_MOCK_SOURCE, MOCK_PEOPLE } from './source'

type Mode = 'select' | 'overlap'

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const md = (d: Date) => `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`

/**
 * 가능 시간 탭: 30분 단위 격자에서 내 가능 시간을 고르고(선택), 멤버들과 겹치는 시간을 본다(겹침 보기).
 * 데이터는 AvailabilitySource(./source.ts)를 거친다. 지금은 Mock, 백엔드 API가 생기면 그 파일만 바꾼다.
 */
export default function AvailabilityPage() {
  const { org, members } = useOrg()
  const { user } = useAuth()
  const myId = user!.id
  const orgId = org.id

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [mode, setMode] = useState<Mode>('select')
  const [touchDragMode, setTouchDragMode] = useState(false)
  // 아직 저장하지 않은 내 선택(주별). 없으면 서버에 저장된 값을 보여준다.
  const [drafts, setDrafts] = useState<Map<number, Set<number>>>(() => new Map())
  const [saving, setSaving] = useState(false)
  const [focusCell, setFocusCell] = useState<number | null>(null)

  const weekTime = weekStart.getTime()
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const cells = cellsOf(days)

  // ---- 데이터 ----
  const load = useCallback(
    () => availabilitySource.load(orgId, new Date(weekTime), addDays(new Date(weekTime), 7)),
    [orgId, weekTime],
  )
  const { data, error, loading, reload } = useApi(load)
  const all = data ?? []
  const savedMine = inputsToSelection(all.filter((i) => i.userId === myId), cells)
  const draft = drafts.get(weekTime)
  const selected = draft ?? savedMine
  const dirty = draft !== undefined

  // ---- 겹침 계산: 다른 사람 + 지금 화면의 내 선택(저장 전이어도 반영) ----
  const others = all.filter((i) => i.userId !== myId)
  const mineInputs = selectionToInputs(selected, myId)
  const byCell = usersByCell([...others, ...mineInputs], cells)
  const people = [...new Set([...others.map((i) => i.userId), ...(selected.size ? [myId] : [])])]
  const total = people.length
  const nameOf = (id: string) =>
    id === myId ? `${user!.name} (나)` : members.find((m) => m.id === id)?.name ?? MOCK_PEOPLE[id] ?? '(알 수 없음)'

  // 모두 가능한 시간 (2명 이상일 때). 없으면 가장 많이 겹치는 시간
  const maxCount = Math.max(0, ...[...byCell.values()].map((u) => u.length))
  const bestCount = total >= 2 && maxCount === total ? total : maxCount
  const bestRanges = bestCount >= 2
    ? selectionToInputs(cells.filter((c) => (byCell.get(c)?.length ?? 0) === bestCount), 'best')
    : []

  // ---- 선택 변경 (drafts에만 기록) ----
  function editSelection(change: (next: Set<number>) => void) {
    setDrafts((prev) => {
      const base = prev.get(weekTime) ?? savedMine
      const next = new Set(base)
      change(next)
      return new Map(prev).set(weekTime, next)
    })
  }
  const updateSlot = (cell: number, selecting: boolean) =>
    editSelection((next) => { if (selecting) next.add(cell); else next.delete(cell) })
  const toggleSlot = (cell: number) =>
    editSelection((next) => { if (next.has(cell)) next.delete(cell); else next.add(cell) })

  function discard() {
    setDrafts((prev) => { const next = new Map(prev); next.delete(weekTime); return next })
  }

  async function save() {
    setSaving(true)
    try {
      await availabilitySource.saveMine(orgId, myId, new Date(weekTime), addDays(new Date(weekTime), 7), mineInputs)
      discard()
      reload()
      toast.success('가능 시간을 저장했습니다.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // ---- 드래그 선택 (PC 마우스 / 휴대폰 "드래그로 선택" 모드) ----
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; selecting: boolean; visited: Set<number> } | null>(null)
  const pointerTypeRef = useRef<string | null>(null)

  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, cell: number) {
    if (mode !== 'select') return
    const isMouse = event.pointerType === 'mouse'
    const isTouchDrag = event.pointerType === 'touch' && touchDragMode
    // 클릭 이벤트가 같은 칸을 한 번 더 바꾸지 않도록 어떤 입력이었는지 기억한다
    pointerTypeRef.current = isTouchDrag ? 'touch-drag' : event.pointerType
    // 일반 터치는 스크롤 + 탭 선택을 그대로 둔다
    if (!isMouse && !isTouchDrag) return
    if (isMouse && event.button !== 0) return
    event.preventDefault()
    // 빈 칸에서 시작하면 칠하고, 선택된 칸에서 시작하면 지운다
    const selecting = !selected.has(cell)
    dragRef.current = { pointerId: event.pointerId, selecting, visited: new Set([cell]) }
    updateSlot(cell, selecting)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    // 포인터가 잡혀(capture) 있으므로 실제 손가락/커서 아래 칸을 직접 찾는다
    const el = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-cell]')
    if (!el || !gridRef.current?.contains(el)) return
    const cell = Number(el.dataset.cell)
    if (drag.visited.has(cell)) return
    drag.visited.add(cell)
    updateSlot(cell, drag.selecting)
  }

  function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
  }

  function onCellClick(event: React.MouseEvent<HTMLButtonElement>, cell: number) {
    if (mode === 'overlap') {
      setFocusCell(cell)
      return
    }
    if (event.detail === 0) return toggleSlot(cell) // 키보드(Enter/Space)
    if (pointerTypeRef.current === 'mouse' || pointerTypeRef.current === 'touch-drag') return // pointerdown에서 처리됨
    toggleSlot(cell) // 일반 터치: 한 칸씩
  }

  const moveWeek = (n: number) => { setWeekStart((w) => addDays(w, n * 7)); setFocusCell(null) }
  const today = new Date()
  const selectedMinutes = selected.size * 30
  const focusUsers = focusCell !== null ? byCell.get(focusCell) ?? [] : []

  return (
    <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {/* ---- 도구 막대 ---- */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center divide-x divide-ink border border-ink">
              <Button variant="ghost" size="icon" className="rounded-none hover:bg-muted hover:no-underline" onClick={() => moveWeek(-1)} aria-label="이전 주"><ChevronLeftIcon /></Button>
              <Button variant="ghost" className="rounded-none px-3 hover:bg-muted hover:no-underline" onClick={() => { setWeekStart(startOfWeek(new Date())); setFocusCell(null) }}>오늘</Button>
              <Button variant="ghost" size="icon" className="rounded-none hover:bg-muted hover:no-underline" onClick={() => moveWeek(1)} aria-label="다음 주"><ChevronRightIcon /></Button>
            </div>
            <h2 className="num text-xl font-semibold md:text-2xl" aria-live="polite">
              {weekStart.getFullYear()}.{md(weekStart)} – {md(addDays(weekStart, 6))}
            </h2>
          </div>
          <ToggleGroup type="single" variant="outline" value={mode} onValueChange={(v) => v && setMode(v as Mode)} aria-label="보기">
            <ToggleGroupItem value="select" className="h-10 px-4">내 시간 선택</ToggleGroupItem>
            <ToggleGroupItem value="overlap" className="h-10 px-4">겹침 보기</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* ---- 상태 줄 ---- */}
        {mode === 'select' ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-2">
            <span className="text-sm">
              선택 <span className="num font-semibold">{selected.size}</span>칸
              <span className="num ml-1">({Math.floor(selectedMinutes / 60)}시간{selectedMinutes % 60 ? ' 30분' : ''})</span>
            </span>
            {dirty && <span className="text-sm font-semibold text-accent-ink">저장 안 됨</span>}
            <span className="flex-1" />
            {/* 휴대폰: 기본은 스크롤 + 탭 선택, 켜면 손가락으로 칠하기 */}
            <Toggle variant="outline" pressed={touchDragMode} onPressedChange={(v) => { dragRef.current = null; setTouchDragMode(v) }} className="h-9 px-3 md:hidden">
              드래그로 선택
            </Toggle>
            <Button variant="ghost" className="h-9 px-2" disabled={!dirty || saving} onClick={discard}>되돌리기</Button>
            <Button className="h-9" disabled={!dirty || saving} onClick={() => void save()}>{saving ? '저장 중…' : '저장'}</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-2 text-sm">
            <span>가능 인원</span>
            {Array.from({ length: Math.max(total, 1) }, (_, i) => i + 1).map((n) => (
              <span key={n} className="inline-flex items-center gap-1.5">
                <span className="size-4 border border-line" style={{ background: heat(n, total) }} />
                <span className="num">{n}{n === total && total > 1 ? ' (전원)' : ''}</span>
              </span>
            ))}
          </div>
        )}

        {error != null && <Alert variant="destructive"><AlertDescription>{errorMessage(error)}</AlertDescription></Alert>}

        {/* ---- 격자: 머리 줄과 시각 열은 스크롤해도 고정 ---- */}
        <div className={cn('max-h-[min(640px,calc(100dvh-260px))] overflow-auto border-t-2 border-b border-t-ink border-b-line', loading && 'opacity-70')}>
          <div
            ref={gridRef}
            className="grid min-w-[640px]"
            style={{
              gridTemplateColumns: '52px repeat(7, minmax(80px, 1fr))',
              // 드래그 모드에서는 손가락 움직임을 스크롤 대신 선택으로 쓴다
              touchAction: touchDragMode && mode === 'select' ? 'none' : 'auto',
            }}
          >
            <div className="sticky top-0 left-0 z-20 border-b border-ink bg-paper" />
            {days.map((d, i) => (
              <div key={d.getTime()} className={cn('sticky top-0 z-10 flex items-baseline gap-1.5 border-b border-l border-b-ink border-l-line bg-paper px-2 py-2', isSameDay(d, today) && 'border-t-2 border-t-accent-ink')}>
                <span className={cn('eyebrow', isSameDay(d, today) && 'text-accent-ink')}>{WEEKDAYS[i]}</span>
                <span className={cn('num font-semibold', isSameDay(d, today) && 'text-accent-ink')}>{d.getDate()}</span>
              </div>
            ))}

            {Array.from({ length: SLOTS_PER_DAY }, (_, slot) => (
              <Fragment key={slot}>
                <div className={cn('sticky left-0 z-10 bg-paper pr-1.5 text-right', slot % 2 === 0 ? 'border-t border-line' : '')}>
                  {slot % 2 === 0 && <span className="num relative -top-2 text-[0.7rem] text-ink-soft">{pad(slot / 2)}:00</span>}
                </div>
                {days.map((d) => {
                  const cell = slotStart(d, slot).getTime()
                  const active = selected.has(cell)
                  const users = byCell.get(cell) ?? []
                  const count = users.length
                  const overlap = mode === 'overlap'
                  return (
                    <button
                      key={cell}
                      type="button"
                      data-cell={cell}
                      aria-pressed={overlap ? undefined : active}
                      aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일 ${hm(cell)} ${overlap ? `${count}명 가능` : active ? '선택됨' : '선택 안 됨'}`}
                      onPointerDown={(e) => beginDrag(e, cell)}
                      onPointerMove={moveDrag}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      onLostPointerCapture={endDrag}
                      onClick={(e) => onCellClick(e, cell)}
                      className={cn(
                        'h-6 border-l border-l-line text-[0.7rem] leading-none outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-inset',
                        slot % 2 === 0 ? 'border-t border-t-line' : 'border-t border-t-line/40',
                        !overlap && (active ? 'selected' : 'hover:bg-muted'),
                        overlap && 'num',
                        overlap && focusCell === cell && 'ring-2 ring-ink ring-inset',
                      )}
                      style={overlap ? { background: heat(count, total), color: count / Math.max(total, 1) >= 0.6 ? 'var(--paper)' : 'var(--ink)' } : undefined}
                    >
                      {overlap && count > 0 ? count : ''}
                    </button>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>

        {IS_MOCK_SOURCE && (
          <p className="text-xs">※ 시범 화면: 예시 팀원 2명의 데이터가 섞여 있고, 저장은 이 브라우저 메모리에만 됩니다(새로고침하면 사라짐). 백엔드 API가 생기면 실제 저장으로 바뀝니다.</p>
        )}
      </div>

      {/* ---- 옆 패널(데스크톱) / 아래(그 외): 겹치는 시간 요약 ---- */}
      <aside className="space-y-8 xl:sticky xl:top-12 xl:border-l xl:border-line xl:pl-8">
        <Section title={bestCount === total && total >= 2 ? '모두 가능한 시간' : '가장 많이 겹치는 시간'} aside={bestCount >= 2 && <span className="num text-sm">{bestCount}/{total}명</span>}>
          {bestRanges.length === 0 ? (
            <p className="border-y border-line py-4 text-sm">2명 이상 겹치는 시간이 아직 없습니다.</p>
          ) : (
            <Rows>
              {bestRanges.map((r) => {
                const s = Date.parse(r.start)
                const e = Date.parse(r.end)
                const d = new Date(s)
                return (
                  <li key={r.start} className="grid grid-cols-[64px_1fr_auto] items-baseline gap-3 py-2.5">
                    <span className="num text-sm">{md(d)} <span className="text-ink-soft">{WEEKDAYS[(d.getDay() + 6) % 7]}</span></span>
                    <span className="num font-semibold">{hm(s)}–{hm(e)}</span>
                    <span className="num text-sm text-ink-soft">{(e - s) / SLOT_MS / 2}h</span>
                  </li>
                )
              })}
            </Rows>
          )}
        </Section>

        {mode === 'overlap' && (
          <Section title="선택한 칸">
            {focusCell === null ? (
              <p className="text-sm">격자에서 칸을 누르면 누가 가능한지 보여줍니다.</p>
            ) : (
              <div className="space-y-3">
                <p className="num font-semibold">{md(new Date(focusCell))} {WEEKDAYS[(new Date(focusCell).getDay() + 6) % 7]} {hm(focusCell)}–{hm(focusCell + SLOT_MS)}</p>
                <Rows>
                  {people.map((id) => (
                    <li key={id} className="flex items-center justify-between py-2 text-sm">
                      <span>{nameOf(id)}</span>
                      <span className={focusUsers.includes(id) ? 'font-semibold' : 'text-ink-soft'}>{focusUsers.includes(id) ? '가능' : '—'}</span>
                    </li>
                  ))}
                </Rows>
              </div>
            )}
          </Section>
        )}
      </aside>
    </div>
  )
}

/** 겹침 칸 색: 가능 인원 비율만큼 "확정" 초록을 지면 색에 섞는다 (라이트/다크 모두 토큰 기반) */
function heat(count: number, total: number): string {
  if (count <= 0) return 'var(--paper)'
  const pct = Math.round(20 + (80 * count) / Math.max(total, 1))
  return `color-mix(in oklch, var(--confirmed) ${Math.min(pct, 100)}%, var(--paper))`
}
