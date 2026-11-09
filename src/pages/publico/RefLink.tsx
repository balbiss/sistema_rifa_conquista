import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { Loading } from '../../components/ui'

/** /r/CODIGO — guarda a indicação por 30 dias e leva à campanha. A origem é registrada no servidor. */
export default function RefLink() {
  const { code } = useParams()
  const [q] = useSearchParams()
  const nav = useNavigate()
  const [err, setErr] = useState('')
  useEffect(() => {
    let visitor = ''
    try { visitor = localStorage.getItem('cp_visitor') || crypto.randomUUID(); localStorage.setItem('cp_visitor', visitor) } catch { /* sem storage */ }
    api(`/public/ref/${encodeURIComponent(code!)}`, { body: { visitor } })
      .then(r => {
        try { localStorage.setItem('cp_ref', JSON.stringify({ code: r.code, exp: Date.now() + 30 * 86400000 })) } catch { /* sem storage */ }
        nav(q.get('c') ? `/c/${q.get('c')}` : '/', { replace: true })
      })
      .catch(e => { setErr(e.message); setTimeout(() => nav('/', { replace: true }), 2500) })
  }, [code])
  return err ? <div style={{ padding: 40, textAlign: 'center' }}>{err} Redirecionando…</div> : <Loading label="Abrindo campanha…" />
}
