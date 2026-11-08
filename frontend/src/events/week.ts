import type { CalendarEvent } from 'shared'

// 주간 캘린더 계산용 순수 함수 모음. (React와 무관해서 따로 테스트하거나 재사용하기 쉽다)
// 모든 계산은 브라우저 로컬 시간대 기준이다. 서버와 주고받을 때만 UTC 문자열로 바꾼다.

export const DAY_MS = 24 * 60 * 60 * 1000
export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일']

/** date가 속한 주의 월요일 00:00 (로컬) */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (d.getDay() + 6) % 7 // getDay()는 일요일=0이므로, 월요일=0이 되게 바꾼다
  d.setDate(d.getDate() - day)
  return d
}

/** 날짜에 n일을 더한다. setDate를 쓰면 서머타임이 있는 지역에서도 자정이 유지된다. */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** 하루 칸 안에 그릴 일정 조각. 여러 날에 걸친 일정은 날마다 조각으로 나뉜다. */
export interface Segment {
  event: CalendarEvent
  /** 그날 0시부터 몇 분째에 시작/끝나는지 (0~1440) */
  startMin: number
  endMin: number
  /** 겹치는 일정끼리 나란히 놓기 위한 열 번호와 전체 열 수 */
  lane: number
  lanes: number
}

/** 일주일치 일정을 요일별 조각으로 나누고, 겹치는 조각은 옆으로 나란히 배치한다. */
export function layoutWeek(events: CalendarEvent[], weekStart: Date): Segment[][] {
  const days: Segment[][] = Array.from({ length: 7 }, () => [])
  for (let i = 0; i < 7; i++) {
    const dayStart = addDays(weekStart, i).getTime()
    const dayEnd = addDays(weekStart, i + 1).getTime()
    for (const event of events) {
      const s = Date.parse(event.start)
      const e = Date.parse(event.end)
      if (e <= dayStart || s >= dayEnd) continue // 이 날과 겹치지 않음
      days[i].push({
        event,
        startMin: Math.max(0, (s - dayStart) / 60000),
        endMin: Math.min((dayEnd - dayStart) / 60000, (e - dayStart) / 60000),
        lane: 0,
        lanes: 1,
      })
    }
    assignLanes(days[i])
  }
  return days
}

/**
 * 겹치는 조각에 열(lane)을 배정한다.
 * 1) 시작 시각 순으로 정렬하고, 2) 서로 이어서 겹치는 덩어리(cluster)마다
 * 3) 비어 있는 가장 왼쪽 열에 넣는다. 덩어리 안의 조각은 모두 같은 열 수(lanes)를 가진다.
 */
function assignLanes(segments: Segment[]): void {
  segments.sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)
  let cluster: Segment[] = []
  let laneEnds: number[] = [] // 각 열에서 마지막 조각이 끝나는 시각
  let clusterEnd = -1

  const closeCluster = () => {
    for (const seg of cluster) seg.lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }

  for (const seg of segments) {
    if (seg.startMin >= clusterEnd) closeCluster()
    let lane = laneEnds.findIndex((end) => end <= seg.startMin)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(seg.endMin)
    } else {
      laneEnds[lane] = seg.endMin
    }
    seg.lane = lane
    cluster.push(seg)
    clusterEnd = Math.max(clusterEnd, seg.endMin)
  }
  closeCluster()
}
