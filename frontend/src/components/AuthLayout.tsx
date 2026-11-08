import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/theme'

/**
 * 로그인/가입 화면 틀 (지면 2단 구성).
 * - lg 이상: 왼쪽 마스트헤드(큰 명조 문장) | 1px 세로선 | 오른쪽 폼
 * - lg 미만: 워드마크 + 폼만
 */
export function AuthLayout({ title, children, footer }: {
  title: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col px-4 md:px-8 xl:px-12">
      <header className="flex h-16 items-center justify-between border-b-2 border-ink">
        <Logo className="text-2xl" />
        <ThemeToggle />
      </header>

      <div className="grid flex-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="hidden flex-col justify-between border-r border-line py-12 pr-12 lg:flex">
          <p className="eyebrow">KWEB · 일정 조율</p>
          <h2 className="max-w-[12ch] text-6xl leading-[1.1] font-black tracking-tight xl:text-7xl">
            모두가 되는 시간을, 한 번에.
          </h2>
          <ol className="grid grid-cols-3 gap-6 border-t border-ink pt-4">
            {['조직을 만들고 초대한다', '각자 되는 시간을 올린다', '겹치는 시간을 확정한다'].map((t, i) => (
              <li key={t} className="space-y-1">
                <span className="num text-sm text-accent-ink">0{i + 1}</span>
                <p className="font-serif text-lg leading-snug font-bold">{t}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex items-start justify-center py-10 lg:items-center lg:pl-12">
          <div className="w-full max-w-[400px]">
            <h1 className="mb-8 border-b border-ink pb-3 text-4xl font-bold">{title}</h1>
            {children}
            <p className="mt-8 border-t border-line pt-4 text-sm">{footer}</p>
          </div>
        </section>
      </div>
    </div>
  )
}
