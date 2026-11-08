import { useCallback, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CreateOrgRequest } from 'shared'
import { api } from '../api/client.ts'
import { errorMessage } from '../api/errors.ts'
import RoleBadge from '../components/RoleBadge.tsx'
import { fieldErrors } from '../lib/form.ts'
import { useApi } from '../lib/useApi.ts'

// 로그인 후 첫 화면: 내가 속한 조직 목록 + 새 조직 만들기
export default function HomePage() {
  const load = useCallback(() => api.listMyOrgs(), [])
  const { data, error, loading } = useApi(load)
  const orgs = data?.orgs ?? []

  return (
    <div className="stack">
      <div className="row">
        <h1>내 조직</h1>
      </div>

      <section className="card">
        {loading && <p className="muted">불러오는 중…</p>}
        {error != null && <div className="alert error">{errorMessage(error)}</div>}
        {!loading && error == null && orgs.length === 0 && (
          <p className="muted">아직 속한 조직이 없습니다. 새 조직을 만들거나 초대를 받아 보세요.</p>
        )}
        {orgs.length > 0 && (
          <ul className="list">
            {orgs.map((org) => (
              // key: React가 목록의 각 항목을 구분하는 값. 서버가 준 고유 id를 쓴다.
              <li key={org.id}>
                <Link to={`/orgs/${encodeURIComponent(org.id)}`} className="org-link">{org.name}</Link>
                <RoleBadge role={org.role} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CreateOrgForm />
    </div>
  )
}

function CreateOrgForm() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = CreateOrgRequest.safeParse({ name: name.trim(), description: description.trim() || undefined })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error, { name: '이름은 1~100자로 입력해 주세요.', description: '설명은 500자 이하로 입력해 주세요.' }))
      return
    }
    setErrors({})
    setFormError(null)
    setSubmitting(true)
    try {
      const org = await api.createOrg({ body: parsed.data })
      navigate(`/orgs/${encodeURIComponent(org.id)}`) // 만든 사람은 관리자가 된다
    } catch (err) {
      setFormError(errorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <form className="card stack" onSubmit={handleSubmit} noValidate>
      <h2>새 조직 만들기</h2>
      <label>
        이름
        <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="예: KWEB 스터디" />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </label>
      <label>
        설명 <span className="muted">(선택)</span>
        <textarea rows={2} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
        {errors.description && <span className="field-error">{errors.description}</span>}
      </label>
      {formError && <div className="alert error">{formError}</div>}
      <div className="row">
        <button type="submit" disabled={submitting}>{submitting ? '만드는 중…' : '만들기'}</button>
      </div>
    </form>
  )
}
