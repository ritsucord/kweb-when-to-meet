import type { EventStatus, MemberRole } from 'shared'
import { Badge } from '@/components/ui/badge'

/** 역할: 관리자는 빨강 글자, 멤버는 보조 글자. 아이콘·배경 없음 */
export default function RoleBadge({ role }: { role: MemberRole }) {
  return role === 'admin'
    ? <Badge variant="brand">관리자</Badge>
    : <Badge variant="secondary">멤버</Badge>
}

/** 일정 상태: 확정 = 초록 칸, 미확정 = 황토 칸 + 점선 (캘린더 블록과 같은 규칙) */
export function StatusBadge({ status }: { status: EventStatus }) {
  return status === 'confirmed'
    ? <Badge variant="success">확정</Badge>
    : <Badge variant="warning">미확정</Badge>
}
