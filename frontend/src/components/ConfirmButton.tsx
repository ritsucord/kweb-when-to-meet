import { useState, type ReactNode } from 'react'

interface Props {
  /** 처음 보이는 버튼 글자 */
  label: string
  /** 확인 단계에서 보여줄 설명 (무엇이 사라지는지 등) */
  message: ReactNode
  confirmLabel?: string
  /** 확인을 누르면 실행. 실패하면 throw해서 오류 문구를 보여준다. */
  onConfirm: () => Promise<void>
  /** 오류를 사용자 문구로 바꾸는 함수 */
  describeError: (error: unknown) => string
  variant?: 'danger' | 'secondary'
}

/**
 * 되돌릴 수 없는 작업(삭제, 탈퇴 등)을 두 번 눌러야 실행되게 하는 버튼.
 * 브라우저 기본 confirm() 대신 화면 안에 확인 상자를 펼친다.
 */
export default function ConfirmButton({ label, message, confirmLabel = '확인', onConfirm, describeError, variant = 'danger' }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button type="button" className={variant} onClick={() => setOpen(true)}>
        {label}
      </button>
    )
  }

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
    <div className="confirm-box stack" role="alertdialog">
      <div>{message}</div>
      {error && <div className="alert error">{error}</div>}
      <div className="row">
        <button type="button" className="danger" disabled={busy} onClick={() => void confirm()}>
          {busy ? '처리 중…' : confirmLabel}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => { setOpen(false); setError(null) }}>
          취소
        </button>
      </div>
    </div>
  )
}
