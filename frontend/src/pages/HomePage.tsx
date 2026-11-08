import { useAuth } from '../auth/context.ts'

// 로그인 후 첫 화면. 3단계에서 "내 조직 목록"으로 채운다.
export default function HomePage() {
  const { user } = useAuth()
  return (
    <section className="stack">
      <h1>{user?.name}님, 안녕하세요</h1>
      <p className="muted">{user?.email}</p>
    </section>
  )
}
