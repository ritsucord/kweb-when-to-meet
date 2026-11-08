import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { CreateSessionRequest } from 'shared'
import { errorMessage } from '@/api/errors'
import { useAuth } from '@/auth/context'
import { AuthLayout } from '@/components/AuthLayout'
import { FormField } from '@/components/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fieldErrors } from '@/lib/form'

export default function LoginPage() {
  const { login, sessionExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // 가입 직후 넘어왔다면 안내 문구를, RequireAuth가 보냈다면 원래 가려던 주소를 state로 받는다.
  const state = location.state as { from?: string; signedUp?: boolean } | null

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault() // 폼 기본 동작(페이지 새로고침)을 막는다
    const parsed = CreateSessionRequest.safeParse({ email: email.trim(), password })
    const next = parsed.success ? {} : fieldErrors(parsed.error, { email: '이메일 형식이 아닙니다.' })
    if (password === '') next.password = '비밀번호를 입력해 주세요.'
    setErrors(next)
    if (!parsed.success || Object.keys(next).length > 0) return

    setFormError(null)
    setSubmitting(true)
    try {
      await login(parsed.data)
      navigate(state?.from ?? '/', { replace: true })
    } catch (err) {
      // 이메일이 없든 비밀번호가 틀리든 같은 401이다. 어느 쪽인지 알려주지 않는다(가이드 2장).
      setFormError(errorMessage(err, { 401: '이메일 또는 비밀번호가 올바르지 않습니다.' }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="로그인"
      footer={<>계정이 없나요? <Link to="/signup" className="font-semibold underline underline-offset-4">회원가입</Link></>}
    >
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        {state?.signedUp && (
          <Alert><AlertDescription>가입이 완료되었습니다. 로그인해 주세요.</AlertDescription></Alert>
        )}
        {sessionExpired && !state?.signedUp && (
          <Alert variant="destructive"><AlertDescription>세션이 만료되었습니다. 다시 로그인해 주세요.</AlertDescription></Alert>
        )}
        <FormField label="이메일" error={errors.email}>
          <Input type="email" autoComplete="email" placeholder="you@korea.ac.kr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="비밀번호" error={errors.password}>
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? '로그인 중…' : '로그인'}
        </Button>
      </form>
    </AuthLayout>
  )
}
