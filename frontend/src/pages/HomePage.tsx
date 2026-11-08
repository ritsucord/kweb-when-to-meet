import { useEffect, useState } from 'react'
import { api } from '../api/client.ts'
import { errorStatus } from '../api/errors.ts'

// 1단계 확인용 화면: 프록시와 API 클라이언트가 백엔드에 닿는지만 보여준다.
// (인증 단계에서 로그인/대시보드로 교체된다)
export default function HomePage() {
  const [state, setState] = useState<'checking' | 'loggedIn' | 'loggedOut' | 'offline'>('checking')

  useEffect(() => {
    api.getCurrentSession()
      .then(() => setState('loggedIn'))
      .catch((e) => setState(errorStatus(e) === 401 ? 'loggedOut' : 'offline'))
  }, [])

  const text = {
    checking: '서버 연결 확인 중…',
    loggedIn: '서버 연결됨 · 로그인 상태',
    loggedOut: '서버 연결됨 · 로그아웃 상태 (401)',
    offline: '서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인하세요.',
  }[state]

  return (
    <main className="container">
      <h1>When to Meet</h1>
      <p className="muted">{text}</p>
    </main>
  )
}
