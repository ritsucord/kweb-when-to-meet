import { useCallback, useEffect, useState } from 'react'

export interface ApiState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  /** 같은 요청을 다시 보낸다. 생성·삭제 후 목록을 새로고침할 때 쓴다. */
  reload: () => void
}

/**
 * 화면이 뜰 때 API를 호출하고 { data, error, loading }을 돌려주는 훅.
 *
 * load는 useCallback으로 감싸서 넘긴다. load가 바뀌면(예: orgId가 바뀌면) 다시 불러온다.
 *   const load = useCallback(() => api.getOrg({ params: { orgId } }), [orgId])
 *   const { data, error, loading, reload } = useApi(load)
 */
export function useApi<T>(load: () => Promise<T>): ApiState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌거나 다시 요청하면, 늦게 도착한 옛 응답은 무시한다(경쟁 상태 방지).
    let ignore = false
    setLoading(true)
    load()
      .then((result) => {
        if (ignore) return
        setData(result)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!ignore) setError(e)
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })
    return () => {
      ignore = true
    }
  }, [load, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, loading, reload }
}
