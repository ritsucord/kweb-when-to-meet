import { cn } from '@/lib/utils'

/** KUrdination 워드마크: 명조, "KU"만 포인트 빨강 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('font-serif text-xl leading-none font-black tracking-tight text-ink', className)}>
      <span className="text-accent-ink">KU</span>rdination
    </span>
  )
}
