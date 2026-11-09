import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Ticket } from 'lucide-react'
import { api } from '../../lib/api'
import { PublicLayout } from '../../components/PublicLayout'
import { showError } from '../../components/ui'
import { SectionTitle } from './CampaignLanding'

// Consulta de números sem login: WhatsApp + CPF usados na compra.
const maskCPF = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
const maskPhone = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 11); return d.length <= 2 ? d : d.length <= 7 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` }
const inp: React.CSSProperties = { width: '100%', height: 50, padding: '0 14px', border: '1.5px solid #d6deec', borderRadius: 10, fontSize: 16.5, boxSizing: 'border-box' }

export default function MeusNumeros() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('cp_comprador') || '{}') } catch { return {} } })()
  const [phone, setPhone] = useState(saved.phone || '')
  const [cpf, setCpf] = useState(saved.cpf || '')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<any[] | null>(null)
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    try { setRes(await api('/public/my-numbers', { body: { phone, cpf } })) } catch (err) { showError(err) } finally { setBusy(false) }
  }
  return (
    <PublicLayout notice={false}>
      <section className="pw" style={{ padding: '44px var(--gutter)', maxWidth: 720 }}>
        <SectionTitle kicker="Consulta" title="Meus números" />
        <form onSubmit={go} style={{ background: '#fff', border: '1px solid var(--pline)', borderRadius: 16, padding: 20, boxShadow: '0 10px 28px rgba(11,23,48,.06)' }}>
          <p style={{ margin: '0 0 14px', color: '#5d6b85', fontSize: 15 }}>Informe o WhatsApp e o CPF usados na compra.</p>
          <div className="grid2" style={{ gap: 12 }}>
            <label><span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>WhatsApp</span><input required value={phone} onChange={e => setPhone(maskPhone(e.target.value))} inputMode="tel" style={inp} placeholder="(91) 98888-7777" /></label>
            <label><span style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>CPF</span><input required value={cpf} onChange={e => setCpf(maskCPF(e.target.value))} inputMode="numeric" style={inp} placeholder="000.000.000-00" /></label>
          </div>
          <button className="pbtn pbtn-orange" disabled={busy} style={{ width: '100%', marginTop: 14 }}><Search size={18} /> {busy ? 'Buscando…' : 'Ver meus números'}</button>
        </form>
        {res && !res.length && <p style={{ marginTop: 18, color: '#5d6b85' }}>Nenhuma compra encontrada com esses dados.</p>}
        {res?.map(r => (
          <div key={r.slug} style={{ marginTop: 18, background: '#fff', border: '1px solid var(--pline)', borderRadius: 16, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Ticket size={18} color="#FF8A24" /><b style={{ fontSize: 17, color: '#0B1730' }}>{r.campaign}</b></div>
            {r.numbers.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{r.numbers.map((n: string) => <span key={n} style={{ minWidth: 50, textAlign: 'center', padding: '7px 10px', borderRadius: 8, background: '#0B1730', color: '#fff', fontWeight: 800 }}>{n}</span>)}</div>
            ) : <p style={{ margin: 0, color: '#5d6b85' }}>Nenhum número confirmado ainda.</p>}
            {r.pending > 0 && <p style={{ margin: '10px 0 0', color: '#9a3f00', fontSize: 14 }}>Você tem um PIX aguardando pagamento.</p>}
            <Link to={`/c/${r.slug}`} style={{ display: 'inline-block', marginTop: 12, fontSize: 14 }}>Ver campanha →</Link>
          </div>
        ))}
      </section>
    </PublicLayout>
  )
}
