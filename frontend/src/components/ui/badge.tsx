import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-xs border border-transparent px-1.5 text-[0.72rem] leading-none font-semibold tracking-wide whitespace-nowrap focus-visible:ring-2 focus-visible:ring-ink [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-ink text-ink",
        secondary: "px-0 text-ink-soft",
        destructive: "border-accent-ink text-accent-ink",
        outline: "border-line text-ink",
        ghost: "px-0 text-ink",
        link: "px-0 text-ink underline underline-offset-4",
        // 역할: 관리자는 포인트 빨강 글자, 멤버는 보조 글자 (테두리·배경 없음)
        brand: "px-0 text-accent-ink",
        // 일정 상태: 캘린더 블록과 같은 칸 색 (확정 = 초록, 미확정 = 황토 + 점선)
        success: "border-confirmed bg-confirmed text-confirmed-ink",
        warning: "border-dashed border-tentative-line bg-tentative text-tentative-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
