import { useNavigate } from 'react-router'
import { api } from '../api/client.ts'
import { errorMessage } from '../api/errors.ts'
import { useAuth } from '../auth/context.ts'
import ConfirmButton from '../components/ConfirmButton.tsx'
import RoleBadge from '../components/RoleBadge.tsx'
import { useOrg } from './context.ts'

export default function MembersPage() {
  const { org, members, isAdmin, reload } = useOrg()
  const { user } = useAuth()
  const navigate = useNavigate()
  const orgId = org.id

  // 관리자가 먼저, 그다음 이름순으로 보여준다.
  const sorted = [...members].sort(
    (a, b) => Number(b.role === 'admin') - Number(a.role === 'admin') || a.name.localeCompare(b.name, 'ko'),
  )

  return (
    <div className="stack">
      <section className="card">
        <h2>멤버 {members.length}명</h2>
        <ul className="list">
          {sorted.map((member) => {
            const isMe = member.id === user?.id
            return (
              <li key={member.id}>
                <span>{member.name}</span>
                {isMe && <span className="muted">(나)</span>}
                <RoleBadge role={member.role} />
                <span className="spacer" />
                {/* 다른 사람을 내보내는 것은 관리자만 가능하다 */}
                {isAdmin && !isMe && (
                  <ConfirmButton
                    label="내보내기"
                    variant="secondary"
                    confirmLabel="내보내기"
                    message={<>
                      <strong>{member.name}</strong>님을 내보낼까요?
                      <br /><span className="muted">이 조직에서 {member.name}님이 만든 일정이 함께 삭제되고, 다른 일정의 참여자에서도 빠집니다.</span>
                    </>}
                    onConfirm={async () => {
                      await api.deleteMember({ params: { orgId, userId: member.id } })
                      reload()
                    }}
                    describeError={(e) => errorMessage(e, { 409: '마지막 관리자는 내보낼 수 없습니다.' })}
                  />
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card stack">
        <h2>조직 나가기</h2>
        <p className="muted">탈퇴하면 이 조직에서 내가 만든 일정이 모두 삭제됩니다.</p>
        <div>
          <ConfirmButton
            label="조직 탈퇴"
            confirmLabel="탈퇴"
            message={<>정말 <strong>{org.name}</strong>에서 탈퇴할까요? 내가 만든 일정이 삭제되며 되돌릴 수 없습니다.</>}
            onConfirm={async () => {
              await api.deleteMember({ params: { orgId, userId: user!.id } })
              navigate('/', { replace: true })
            }}
            // 가이드 5장: 마지막 관리자는 탈퇴할 수 없어 409
            describeError={(e) => errorMessage(e, { 409: '마지막 관리자는 탈퇴할 수 없습니다. 조직을 삭제하거나 다른 관리자가 있어야 합니다.' })}
          />
        </div>
      </section>

      {isAdmin && (
        <section className="card stack danger-zone">
          <h2>조직 삭제</h2>
          <p className="muted">멤버십, 보낸 초대, 모든 일정이 함께 사라집니다. 되돌릴 수 없습니다.</p>
          <div>
            <ConfirmButton
              label="조직 삭제"
              confirmLabel="영구 삭제"
              message={<><strong>{org.name}</strong> 조직을 삭제할까요? 모든 멤버와 일정이 사라집니다.</>}
              onConfirm={async () => {
                await api.deleteOrg({ params: { orgId } })
                navigate('/', { replace: true })
              }}
              describeError={(e) => errorMessage(e)}
            />
          </div>
        </section>
      )}
    </div>
  )
}
