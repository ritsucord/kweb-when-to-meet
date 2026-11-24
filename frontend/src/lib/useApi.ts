import { useCallback, useEffect, useState } from 'react'

export interface ApiState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  /** 같은 요청을 다시 보낸다. 생성·삭제 후 목록을 새로고침할 때 쓴다. */
  reload: () => void
}

/** 마지막으로 끝난 요청의 결과. 어떤 요청(load, version)에 대한 결과인지 함께 기억한다. */
interface Settled<T> {
  load: () => Promise<T>
  version: number
  data: T | undefined
  error: unknown
}

/**
 * 화면이 뜰 때 API를 호출하고 { data, error, loading }을 돌려주는 훅.
 *
 * load는 useCallback으로 감싸서 넘긴다. load가 바뀌면(예: orgId가 바뀌면) 다시 불러온다.
 *   const load = useCallback(() => api.getOrg({ params: { orgId } }), [orgId])
 *   const { data, error, loading, reload } = useApi(load)
 *
 * loading은 따로 저장하지 않고 계산한다: "마지막 결과가 지금 요청(load, version)에 대한 것인가?"
 * effect 안에서 setLoading(true)를 부르면 렌더가 한 번 더 일어나므로(React 권장 사항) 이렇게 한다.
 * 새 요청 중에도 직전 data는 그대로 보여준다(화면이 깜빡이지 않게).
 */
export function useApi<T>(load: () => Promise<T>): ApiState<T> {
  const [version, setVersion] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌거나 다시 요청하면, 늦게 도착한 옛 응답은 무시한다(경쟁 상태 방지).
    let ignore = false
    load().then(
      (data) => {
        if (!ignore) setSettled({ load, version, data, error: null })
      },
      (error: unknown) => {
        if (!ignore) setSettled((prev) => ({ load, version, data: prev?.data, error }))
      },
    )
    return () => {
      ignore = true
    }
  }, [load, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const loading = settled === null || settled.load !== load || settled.version !== version
  return { data: settled?.data, error: settled?.error ?? null, loading, reload }
}
