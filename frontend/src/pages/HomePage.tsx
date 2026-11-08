import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { CreateOrgRequest } from 'shared'
import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useAppData } from '@/app/AppData'
import { Empty, Rows, TableHead } from '@/components/editorial'
import { FormField } from '@/components/FormField'
import { PageHeader } from '@/components/PageHeader'
import RoleBadge from '@/components/RoleBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { fieldErrors } from '@/lib/form'

// 조직 목록 표의 열: 번호 | 이름 | 내 역할
const COLUMNS = '48px minmax(0,1fr) 96px'

// 로그인 후 첫 화면: 받은 초대 알림 + 내가 속한 조직 목록
export default function HomePage() {
  const { orgs, orgsLoading, orgsError, inviteCount } = useAppData()

  return (
    <div className="space-y-8">
      <PageHeader title="내 조직" actions={<CreateOrgDialog />} />

      {/* 받은 초대 알림: 한 줄. 숫자만 포인트 빨강 */}
      {inviteCount > 0 && (
        <Link to="/invites" className="flex items-baseline justify-between gap-4 border-b border-line pb-3 outline-none hover:underline hover:underline-offset-4 focus-visible:underline">
          <span className="font-semibold">받은 초대 <span className="num text-accent-ink">{inviteCount}</span>건</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      {orgsError != null && <Alert variant="destructive"><AlertDescription>{errorMessage(orgsError)}</AlertDescription></Alert>}

      {orgsLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : orgs.length === 0 ? (
        <Empty action={<CreateOrgDialog />}>아직 속한 조직이 없습니다.</Empty>
      ) : (
        <div>
          <TableHead columns={COLUMNS} cols={['No.', '조직', '내 역할']} />
          <Rows className="border-t-0">
            {orgs.map((org, i) => (
              <li key={org.id}>
                <Link
                  to={`/orgs/${encodeURIComponent(org.id)}`}
                  className="grid items-baseline gap-x-4 gap-y-1 py-4 outline-none hover:[&_.org-name]:underline focus-visible:[&_.org-name]:underline grid-cols-[32px_minmax(0,1fr)] md:grid-cols-[48px_minmax(0,1fr)_96px]"
                >
                  <span className="num text-sm text-ink-soft">{String(i + 1).padStart(2, '0')}</span>
                  <span className="org-name font-serif text-xl font-bold break-keep underline-offset-4 md:text-2xl">{org.name}</span>
                  <span className="col-start-2 md:col-start-auto"><RoleBadge role={org.role} /></span>
                </Link>
              </li>
            ))}
          </Rows>
        </div>
      )}
    </div>
  )
}

function CreateOrgDialog() {
  const navigate = useNavigate()
  const { refresh } = useAppData()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setName('')
    setDescription('')
    setErrors({})
    setFormError(null)
  }

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
      refresh() // 사이드바 조직 목록 갱신
      setOpen(false)
      reset()
      navigate(`/orgs/${encodeURIComponent(org.id)}`) // 만든 사람은 관리자가 된다
    } catch (err) {
      setFormError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogTrigger asChild>
        <Button>새 조직</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} noValidate className="grid gap-6">
          <DialogHeader className="border-b border-ink pb-3">
            <DialogTitle>새 조직</DialogTitle>
            <DialogDescription className="sr-only">조직 이름과 설명을 입력합니다. 만든 사람이 관리자가 됩니다.</DialogDescription>
          </DialogHeader>
          <FormField label="이름" error={errors.name}>
            <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="KWEB 스터디" autoFocus />
          </FormField>
          <FormField label="설명" hint=" 선택" error={errors.description}>
            <Textarea rows={3} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button>
            <Button type="submit" disabled={submitting}>{submitting ? '만드는 중…' : '만들기'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
