import { useEffect, useState } from 'react'
import { useApi } from './api'

/** Lista de campanhas para os seletores (com a primeira já escolhida). */
export function useCampaignPicker(storageKey = 'cp_campaign') {
  const { data } = useApi<any[]>('/admin/campaigns', ['campaigns'])
  const [id, setId] = useState<string>(() => { try { return localStorage.getItem(storageKey) || '' } catch { return '' } })
  useEffect(() => {
    if (data?.length && (!id || !data.some(c => String(c.id) === id))) setId(String(data[0].id))
  }, [data])
  const set = (v: string) => { setId(v); try { localStorage.setItem(storageKey, v) } catch { /* */ } }
  return { campaigns: data || [], id, setId: set, current: data?.find(c => String(c.id) === id) || null }
}
export function useAffiliateOptions() {
  return useApi<any[]>('/admin/affiliates', ['affiliates']).data || []
}
export function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}
