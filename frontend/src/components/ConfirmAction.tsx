import { useState, type ReactElement, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * 되돌릴 수 없는 작업(삭제, 탈퇴, 내보내기)을 확인 대화상자로 한 번 더 묻는다.
 * trigger로 넘긴 버튼을 누르면 열린다. 실패하면 대화상자 안에 오류를 보여주고 닫지 않는다.
 */
export function ConfirmAction({ trigger, title, description, confirmLabel = '확인', onConfirm, describeError }: {
  trigger: ReactElement
  title: ReactNode
  description: ReactNode
  confirmLabel?: string
  onConfirm: () => Promise<void>
  describeError: (error: unknown) => string
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      setOpen(false)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null) }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-[0.95rem] leading-relaxed text-ink">{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>취소</AlertDialogCancel>
          {/* AlertDialogAction은 누르면 바로 닫히므로, 실패 시 열어 두려고 일반 Button을 쓴다 */}
          <Button variant="destructive" disabled={busy} onClick={() => void confirm()}>
            {busy ? '처리 중…' : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
