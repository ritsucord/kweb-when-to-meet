import type { MemberRole } from 'shared'

export default function RoleBadge({ role }: { role: MemberRole }) {
  return <span className={`badge ${role}`}>{role === 'admin' ? '관리자' : '멤버'}</span>
}
