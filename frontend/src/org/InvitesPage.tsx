import { useCallback, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { CreateInviteRequest } from 'shared'
import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { ConfirmAction } from '@/components/ConfirmAction'
import { Empty, Rows, Section, TableHead } from '@/components/editorial'
import { FormField } from '@/components/FormField'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/time'
import { useApi } from '@/lib/useApi'
import { useOrg } from './context'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 초대 유효 기간 7일 (가이드 5장)
// 초대 표의 열: 이메일 | 보낸 시각 | 만료 | 동작
const COLUMNS = 'minmax(0,1fr) 168px 168px 72px'

/**
 * 관리자 전용: 초대 보내기, 목록, 취소
 * - lg 이상: 왼쪽(4/12) 초대 폼 | 세로선 | 오른쪽(8/12) 대기 표
 * - lg 미만: 위아래로 쌓기
 */
export default function InvitesPage() {
  const { org, isAdmin } = useOrg()
  const orgId = org.id
  const load = useCallback(() => api.listOrgInvites({ params: { orgId }, query: {} }), [orgId])
  // 관리자가 아니면 요청 자체를 보내지 않는다(어차피 403). Hook은 조건문보다 먼저 호출해야 한다.
  if (!isAdmin) return <Alert variant="destructive"><AlertDescription>초대 관리는 관리자만 할 수 있습니다.</AlertDescription></Alert>
  return <AdminInvites orgId={orgId} load={load} />
}

function AdminInvites({ orgId, load }: { orgId: string; load: () => ReturnType<typeof api.listOrgInvites> }) {
  const { data, error, loading, reload } = useApi(load)
  // 서버가 정렬을 보장하지 않으므로 최근에 보낸 것부터 보여준다.
  const invites = [...(data?.invites ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-0">
      <InviteForm orgId={orgId} onSent={reload} />

      <Section
        title="대기 중인 초대"
        aside={data && <span className="num text-sm">{invites.length}건</span>}
        className="lg:col-span-8 lg:border-l lg:border-line lg:pl-12"
      >
        {loading && !data && <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
        {error != null && <Alert variant="destructive"><AlertDescription>{errorMessage(error)}</AlertDescription></Alert>}
        {data && invites.length === 0 && <Empty>대기 중인 초대가 없습니다.</Empty>}
        {invites.length > 0 && (
          <>
            <TableHead columns={COLUMNS} cols={['이메일', '보냄', '만료', '']} />
            <Rows className="border-t-0">
              {invites.map((invite) => (
                <li key={invite.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 md:grid-cols-[minmax(0,1fr)_168px_168px_72px]">
                  <span className="num truncate text-[0.95rem]">{invite.email}</span>
                  <span className="num row-start-2 text-sm text-ink-soft md:row-start-auto">{formatDateTime(invite.createdAt)}</span>
                  <span className="num hidden text-sm md:block">{formatDateTime(new Date(Date.parse(invite.createdAt) + INVITE_TTL_MS).toISOString())}</span>
                  <span className="row-span-2 flex justify-end md:row-span-1">
                    <ConfirmAction
                      trigger={<Button variant="outline" size="sm">취소</Button>}
                      title="초대를 취소할까요?"
                      description={<p><strong>{invite.email}</strong>에게 보낸 초대를 취소합니다.</p>}
                      confirmLabel="초대 취소"
                      onConfirm={async () => {
                        await api.deleteInvite({ params: { orgId, inviteId: invite.id } })
                        toast.success('초대를 취소했습니다.')
                        reload()
                      }}
                      describeError={(e) => errorMessage(e, { 404: '이미 처리되었거나 만료된 초대입니다.' })}
                    />
                  </span>
                </li>
              ))}
            </Rows>
          </>
        )}
        {/* 가이드 5장: 거절된 초대도 만료 전까지 남아 재초대가 막힌다 → 운영에 필요한 정보라 각주로 남긴다 */}
        <p className="mt-3 text-xs">※ 거절된 초대도 만료(7일) 전까지 이 목록에 남고, 그동안 같은 이메일로 다시 초대할 수 없습니다.</p>
      </Section>
    </div>
  )
}

function InviteForm({ orgId, onSent }: { orgId: string; onSent: () => void }) {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [formError, setFormError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsed = CreateInviteRequest.safeParse({ email: email.trim() })
    if (!parsed.success) {
      setFieldError('이메일 형식이 아닙니다.')
      return
    }
    setFieldError(undefined)
    setFormError(null)
    setSending(true)
    try {
      await api.createInvite({ params: { orgId }, body: parsed.data })
      // 가입하지 않은 이메일이어도 같은 201이 온다(가입 여부를 숨기는 정책). 문구도 구분하지 않는다.
      toast.success(`${parsed.data.email}에게 초대를 보냈습니다.`)
      setEmail('')
      onSent()
    } catch (err) {
      setFormError(errorMessage(err, { 409: '이미 멤버이거나 대기 중인 초대가 있는 이메일입니다.' }))
    } finally {
      setSending(false)
    }
  }

  return (
    <Section title="멤버 초대" className="lg:col-span-4 lg:pr-12">
      <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
        <FormField label="초대할 이메일" error={fieldError}>
          <Input type="email" placeholder="friend@korea.ac.kr" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
        <Button type="submit" disabled={sending}>{sending ? '보내는 중…' : '초대 보내기'}</Button>
        <p className="text-xs">미가입 이메일도 초대할 수 있습니다. 가입하면 초대가 보입니다.</p>
      </form>
    </Section>
  )
}
