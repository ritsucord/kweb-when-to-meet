import { useSyncExternalStore } from 'react'

/**
 * CSS 미디어 쿼리가 맞는지 실시간으로 알려준다. 창 크기가 바뀌면 다시 그려진다.
 * 예: const isDesktop = useMediaQuery('(min-width: 1280px)')
 *
 * 레이아웃 대부분은 Tailwind의 반응형 클래스(md:, lg:, xl:)로 처리하고,
 * "데스크톱이면 옆 패널, 아니면 시트"처럼 그리는 컴포넌트 자체가 달라질 때만 이 훅을 쓴다.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

/** 디자인 시스템의 브레이크포인트 (Tailwind 기본값과 같다) */
export const BREAKPOINTS = {
  md: '(min-width: 768px)', // 태블릿 세로 이상
  lg: '(min-width: 1024px)', // 태블릿 가로 / 작은 노트북 이상 → 사이드바 고정
  xl: '(min-width: 1280px)', // 데스크톱 → 일정 화면 옆 패널
} as const
