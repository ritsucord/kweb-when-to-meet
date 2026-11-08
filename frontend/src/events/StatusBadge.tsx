import type { EventStatus } from 'shared'

export default function StatusBadge({ status }: { status: EventStatus }) {
  return <span className={`badge ${status}`}>{status === 'confirmed' ? '확정' : '미확정'}</span>
}
