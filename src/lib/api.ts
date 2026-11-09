import { useCallback, useEffect, useRef, useState } from 'react'

// Cliente HTTP + sessão + tempo real (SSE). Token fica no localStorage (mesmo padrão do Clara V2).
export type User = { id: number; name: string; email: string; role: 'admin' | 'afiliado' | 'participante'; permissions: string[]; affiliate?: { id: number; code: string; name: string } | null }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data: any) { super(message) }
}

export const session = {
  get token() { try { return localStorage.getItem('cp_token') } catch { return null } },
  get user(): User | null { try { return JSON.parse(localStorage.getItem('cp_user') || 'null') } catch { return null } },
  set(token: string, user: User) { try { localStorage.setItem('cp_token', token); localStorage.setItem('cp_user', JSON.stringify(user)) } catch { /* sem storage */ } },
  clear() { try { localStorage.removeItem('cp_token'); localStorage.removeItem('cp_user') } catch { /* sem storage */ } },
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (session.token) headers.Authorization = `Bearer ${session.token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  let res: Response
  try {
    res = await fetch('/api' + path, { method: opts.method || (opts.body !== undefined || opts.form ? 'POST' : 'GET'), headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) })
  } catch {
    throw new ApiError(0, 'rede', 'Sem conexão com o servidor. Verifique a internet e tente de novo.', {})
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => ({})) : await res.text()
  if (!res.ok) {
    if (res.status === 401 && session.token && !path.startsWith('/auth/login')) {
      session.clear()
      if (!location.pathname.startsWith('/entrar') && !location.pathname.startsWith('/c/') && location.pathname !== '/') location.href = '/entrar?expirou=1'
    }
    throw new ApiError(res.status, data?.error || 'erro', data?.message || 'Erro inesperado.', data)
  }
  return data as T
}

/** Baixa um CSV autenticado (exportação). */
export async function download(path: string, filename: string) {
  const res = await fetch('/api' + path, { headers: session.token ? { Authorization: `Bearer ${session.token}` } : {} })
  if (!res.ok) throw new ApiError(res.status, 'erro', 'Não foi possível exportar.', {})
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

// --- tempo real: um EventSource por aba, telas assinam tópicos ----------------------------------
type Listener = (topics: string[], campaignId: number | null) => void
const listeners = new Set<Listener>()
let es: EventSource | null = null
let esToken: string | null | undefined
function ensureStream() {
  const t = session.token
  if (es && esToken === t) return
  es?.close()
  esToken = t
  es = new EventSource('/api/events' + (t ? `?token=${encodeURIComponent(t)}` : ''))
  es.addEventListener('changed', (ev: MessageEvent) => {
    try { const d = JSON.parse(ev.data); listeners.forEach(l => l(d.topics || [], d.campaign_id ?? null)) } catch { /* ignora */ }
  })
}
export function useLive(topics: string[], cb: () => void) {
  const ref = useRef(cb)
  ref.current = cb
  const key = topics.join(',')
  useEffect(() => {
    ensureStream()
    let timer: ReturnType<typeof setTimeout> | null = null
    const l: Listener = ts => {
      if (!ts.some(t => key.split(',').includes(t))) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => ref.current(), 250) // junta rajadas de eventos
    }
    listeners.add(l)
    return () => { listeners.delete(l); if (timer) clearTimeout(timer) }
  }, [key])
}

/** Busca + estado de carregamento/erro + recarrega sozinho quando os tópicos mudam. */
export function useApi<T = any>(path: string | null, topics: string[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(!!path)
  const reload = useCallback(async () => {
    if (!path) return
    try { setData(await api<T>(path)); setError(null) } catch (e: any) { setError(e) } finally { setLoading(false) }
  }, [path])
  useEffect(() => { setLoading(!!path); setData(null); reload() }, [reload, path])
  useLive(topics, reload)
  return { data, error, loading, reload, setData }
}
