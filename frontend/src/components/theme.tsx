import { MoonIcon, SunIcon } from 'lucide-react'
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** localStorage 키. index.html의 깜빡임 방지 스크립트와 같은 값이어야 한다. */
export const THEME_STORAGE_KEY = 'kurdination-theme'

/**
 * 라이트/다크 테마. 기본은 라이트이고, 사용자가 고르면 localStorage에 기억한다.
 * next-themes가 <html>에 class="dark"를 붙이거나 떼면, index.css의 .dark 토큰이 적용된다.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey={THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}

/**
 * 테마 전환. withLabel이면 글자 버튼("다크 모드"), 아니면 아이콘 버튼(좁은 상단 바용).
 * 아이콘은 글자를 넣을 자리가 없는 상단 바에서만 쓴다.
 */
export function ThemeToggle({ withLabel = false, className }: { withLabel?: boolean; className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const toggle = () => setTheme(isDark ? 'light' : 'dark')

  if (withLabel) {
    return (
      <Button variant="ghost" className={cn('h-8 justify-start px-0 font-medium', className)} onClick={toggle}>
        {isDark ? '라이트 모드' : '다크 모드'}
      </Button>
    )
  }
  const label = isDark ? '라이트 모드로 전환' : '다크 모드로 전환'
  return (
    <Button variant="ghost" size="icon" className={cn('hover:no-underline', className)} onClick={toggle} aria-label={label} title={label}>
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
