import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { api } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useAppData } from '@/app/AppData'
import { useAuth } from '@/auth/context'
import { ConfirmAction } from '@/components/ConfirmAction'
import { Rows, Section, TableHead } from '@/components/editorial'
import RoleBadge from '@/components/RoleBadge'
import { Button } from '@/components/ui/button'
import { useOrg } from './context'

// 멤버 표의 열: 이름 | 역할 | 동작
const COLUMNS = 'minmax(0,1fr) 88px 104px'

/**
 * 멤버 탭
 * - lg 이상: 왼쪽(8/12) 멤버 표, 오른쪽(4/12) 탈퇴·삭제 — 세로 1px 선으로 나눔
 * - lg 미만: 위아래로 쌓기
 */
export default function MembersPage() {
  const { org, members, isAdmin, reload } = useOrg()
  const { user } = useAuth()
  const { refresh } = useAppData()
  const navigate = useNavigate()
  const orgId = org.id

  // 관리자가 먼저, 그다음 이름순으로 보여준다.
  const sorted = [...members].sort(
    (a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.name.localeCompare(b.name, 'ko'),
  )

  return (
    <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-0">
      <Section title="멤버" aside={<span className="num text-sm">{members.length}명</span>} className="lg:col-span-8 lg:pr-12">
        <TableHead columns={COLUMNS} cols={['이름', '역할', '']} />
        <Rows className="border-t-0">
          {sorted.map((member) => {
            const isMe = member.id === user?.id
            return (
              <li key={member.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 md:grid-cols-[minmax(0,1fr)_88px_104px]">
                <span className="truncate text-base font-semibold">
                  {member.name}{isMe && <span className="ml-2 text-sm font-normal text-ink-soft">나</span>}
                </span>
                <span className="row-start-2 md:row-start-auto"><RoleBadge role={member.role} /></span>
                <span className="row-span-2 flex justify-end md:row-span-1">
                  {/* 다른 사람을 내보내는 것은 관리자만 가능하다 */}
                  {isAdmin && !isMe && (
                    <ConfirmAction
                      trigger={<Button variant="outline" size="sm">내보내기</Button>}
                      title={`${member.name}님을 내보낼까요?`}
                      description={<p>이 조직에서 {member.name}님이 만든 일정이 함께 삭제되고, 다른 일정의 참여자에서도 빠집니다.</p>}
                      confirmLabel="내보내기"
                      onConfirm={async () => {
                        await api.deleteMember({ params: { orgId, userId: member.id } })
                        toast.success(`${member.name}님을 내보냈습니다.`)
                        reload()
                      }}
                      describeError={(e) => errorMessage(e, { 409: '마지막 관리자는 내보낼 수 없습니다.' })}
                    />
                  )}
                </span>
              </li>
            )
          })}
        </Rows>
      </Section>

      <div className="grid gap-12 lg:col-span-4 lg:border-l lg:border-line lg:pl-12">
        <Section title="조직 나가기">
          <p className="mb-4">탈퇴하면 이 조직에서 내가 만든 일정이 모두 삭제됩니다.</p>
          <ConfirmAction
            trigger={<Button variant="outline">조직 탈퇴</Button>}
            title={`${org.name}에서 탈퇴할까요?`}
            description={<p>내가 만든 일정이 삭제되며 되돌릴 수 없습니다.</p>}
            confirmLabel="탈퇴"
            onConfirm={async () => {
              await api.deleteMember({ params: { orgId, userId: user!.id } })
              refresh()
              toast.success(`${org.name}에서 탈퇴했습니다.`)
              navigate('/', { replace: true })
            }}
            // 가이드 5장: 마지막 관리자는 탈퇴할 수 없어 409
            describeError={(e) => errorMessage(e, { 409: '마지막 관리자는 탈퇴할 수 없습니다. 조직을 삭제하거나 다른 관리자가 있어야 합니다.' })}
          />
        </Section>

        {isAdmin && (
          <Section title={<span className="text-accent-ink">조직 삭제</span>}>
            <p className="mb-4">멤버십, 보낸 초대, 모든 일정이 함께 사라집니다. 되돌릴 수 없습니다.</p>
            <ConfirmAction
              trigger={<Button variant="destructive">조직 삭제</Button>}
              title={`${org.name} 조직을 삭제할까요?`}
              description={<p>모든 멤버와 일정이 사라집니다. 이 작업은 되돌릴 수 없습니다.</p>}
              confirmLabel="영구 삭제"
              onConfirm={async () => {
                await api.deleteOrg({ params: { orgId } })
                refresh()
                toast.success(`${org.name} 조직을 삭제했습니다.`)
                navigate('/', { replace: true })
              }}
              describeError={(e) => errorMessage(e)}
            />
          </Section>
        )}
      </div>
    </div>
  )
}
