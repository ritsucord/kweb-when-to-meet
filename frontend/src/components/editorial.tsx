import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * 에디토리얼 레이아웃 블록. 카드 대신 이것들로 화면을 짠다.
 * 같은 역할의 요소는 모든 페이지에서 이 컴포넌트만 쓴다.
 */

/** 구역: 위쪽 1px 잉크 선 + 명조 소제목. (카드로 감싸지 않는다) */
export function Section({ title, aside, children, className }: {
  title: ReactNode
  /** 제목 오른쪽 (개수, 버튼 등) */
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('border-t border-ink pt-3', className)}>
      <div className="mb-4 flex min-h-8 items-baseline justify-between gap-4">
        <h2 className="text-lg font-bold">{title}</h2>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
      </div>
      {children}
    </section>
  )
}

/** 구분선 목록. 항목 사이 1px 선, 위아래 끝에도 선. */
export function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('divide-y divide-line border-y border-line', className)}>{children}</ul>
}

/**
 * 표 머리 줄. 아래 Row들과 같은 grid 템플릿을 넘겨 열을 정확히 맞춘다.
 * 좁은 화면(md 미만)에서는 숨긴다.
 */
export function TableHead({ columns, cols }: { columns: string; cols: ReactNode[] }) {
  return (
    <div className="hidden gap-4 border-b border-ink pb-2 md:grid" style={{ gridTemplateColumns: columns }} aria-hidden>
      {cols.map((c, i) => <span key={i} className="eyebrow">{c}</span>)}
    </div>
  )
}

/** 짧은 정의 목록 (일정 상세 등): 왼쪽 라벨, 오른쪽 값 */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-[72px_1fr] gap-4 py-3">
          <dt className="eyebrow pt-0.5">{it.label}</dt>
          <dd className="min-w-0">{it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** 빈 목록 안내: 문장 하나 + (필요하면) 동작 하나 */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 border-y border-line py-8">
      <p className="font-serif text-lg">{children}</p>
      {action}
    </div>
  )
}
