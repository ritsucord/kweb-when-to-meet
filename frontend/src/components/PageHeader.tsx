import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * 페이지 제목(마스트헤드). 명조 큰 제목 + 아래 2px 잉크 선.
 * 좁은 화면에서는 버튼이 제목 아래로, md 이상에서는 오른쪽 끝으로 간다.
 * 설명 문구는 두지 않는다. (조직 설명처럼 사용자가 쓴 내용만 lead로 받는다)
 */
export function PageHeader({ title, lead, actions, kicker, className }: {
  title: ReactNode
  /** 사용자가 쓴 본문(조직 설명 등). 본문 색으로 보여준다. */
  lead?: ReactNode
  actions?: ReactNode
  /** 제목 위 한 줄 (상위 페이지로 가는 링크 등) */
  kicker?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('border-b-2 border-ink pb-4', className)}>
      {kicker && <div className="mb-2">{kicker}</div>}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <h1 className="min-w-0 text-3xl leading-tight font-bold break-keep md:text-[2.5rem]">{title}</h1>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {lead && <p className="mt-3 max-w-2xl text-base">{lead}</p>}
    </header>
  )
}
