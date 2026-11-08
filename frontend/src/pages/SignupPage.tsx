import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CreateUserRequest } from 'shared'
import { api } from '../api/client.ts'
import { errorMessage } from '../api/errors.ts'
import { useAuth } from '../auth/context.ts'
import { fieldErrors } from '../lib/form.ts'

const messages = {
  name: '이름은 1~50자로 입력해 주세요.',
  email: '이메일 형식이 아닙니다.',
  password: '비밀번호는 8~128자로 입력해 주세요.',
}

export default function SignupPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', passwordConfirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 입력칸 하나를 바꾸는 함수를 만들어 주는 함수. onChange={update('name')} 처럼 쓴다.
  const update = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // shared의 CreateUserRequest는 서버가 쓰는 것과 같은 스키마다. 여기서 통과하면 서버에서도 통과한다.
    const parsed = CreateUserRequest.safeParse({ name: form.name.trim(), email: form.email, password: form.password })
    const nextErrors = parsed.success ? {} : fieldErrors(parsed.error, messages)
    if (form.password !== form.passwordConfirm) nextErrors.passwordConfirm = '비밀번호가 일치하지 않습니다.'
    setErrors(nextErrors)
    if (!parsed.success || Object.keys(nextErrors).length > 0) return

    setFormError(null)
    setSubmitting(true)
    try {
      await api.createUser({ body: parsed.data })
    } catch (err) {
      setFormError(errorMessage(err, { 409: '이미 가입된 이메일입니다.' }))
      setSubmitting(false)
      return
    }
    try {
      // 가입은 자동 로그인이 되지 않는다(가이드 5장). 같은 정보로 바로 로그인한다.
      await login({ email: parsed.data.email, password: parsed.data.password })
      navigate('/', { replace: true })
    } catch {
      // 가입은 됐는데 로그인만 실패한 경우: 로그인 화면으로 보내 직접 로그인하게 한다.
      navigate('/login', { replace: true, state: { signedUp: true } })
    }
  }

  return (
    <main className="container auth-page">
      <form className="card stack" onSubmit={handleSubmit} noValidate>
        <h1>회원가입</h1>
        <label>
          이름
          <input autoComplete="name" value={form.name} onChange={update('name')} />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>
        <label>
          이메일
          <input type="email" autoComplete="email" value={form.email} onChange={update('email')} />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <label>
          비밀번호 <span className="muted">(8자 이상)</span>
          <input type="password" autoComplete="new-password" value={form.password} onChange={update('password')} />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>
        <label>
          비밀번호 확인
          <input type="password" autoComplete="new-password" value={form.passwordConfirm} onChange={update('passwordConfirm')} />
          {errors.passwordConfirm && <span className="field-error">{errors.passwordConfirm}</span>}
        </label>
        {formError && <div className="alert error">{formError}</div>}
        <button type="submit" disabled={submitting}>{submitting ? '가입 중…' : '가입하기'}</button>
        <p className="muted">이미 계정이 있나요? <Link to="/login">로그인</Link></p>
      </form>
    </main>
  )
}
