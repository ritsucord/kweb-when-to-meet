import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { CreateSessionRequest } from 'shared'
import { errorMessage } from '../api/errors.ts'
import { useAuth } from '../auth/context.ts'
import { fieldErrors } from '../lib/form.ts'

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
    const parsed = CreateSessionRequest.safeParse({ email, password })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error, { email: '이메일 형식이 아닙니다.', password: '비밀번호를 입력해 주세요.' }))
      return
    }
    if (password === '') {
      setErrors({ password: '비밀번호를 입력해 주세요.' })
      return
    }
    setErrors({})
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
    <main className="container auth-page">
      <form className="card stack" onSubmit={handleSubmit} noValidate>
        <h1>로그인</h1>
        {state?.signedUp && <div className="alert success">가입이 완료되었습니다. 로그인해 주세요.</div>}
        {sessionExpired && !state?.signedUp && (
          <div className="alert error">세션이 만료되었습니다. 다시 로그인해 주세요.</div>
        )}
        <label>
          이메일
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <label>
          비밀번호
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>
        {formError && <div className="alert error">{formError}</div>}
        <button type="submit" disabled={submitting}>{submitting ? '로그인 중…' : '로그인'}</button>
        <p className="muted">계정이 없나요? <Link to="/signup">회원가입</Link></p>
      </form>
    </main>
  )
}
