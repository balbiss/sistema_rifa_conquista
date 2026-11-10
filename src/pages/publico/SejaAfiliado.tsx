import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeDollarSign, CheckCircle2, Link2, Loader2, Lock, Wallet } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { PublicLayout } from '../../components/PublicLayout'
import { SectionTitle } from './CampaignLanding'
import { PasswordInput } from '../../components/PasswordInput'

// Cadastro do afiliado pelo link. A chave PIX informada aqui é a que recebe as comissões
// (o afiliado não troca depois — só o organizador).
const maskCPF = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
const maskPhone = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 11); return d.length <= 2 ? d : d.length <= 7 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` }
const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const inp: React.CSSProperties = { width: '100%', height: 50, padding: '0 14px', border: '1.5px solid #d6deec', borderRadius: 10, fontSize: 16, boxSizing: 'border-box', background: '#fff' }
const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#34405a', marginBottom: 6 }
const PIX: [string, string][] = [['cpf', 'Meu CPF'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['aleatoria', 'Chave aleatória']]

export default function SejaAfiliado() {
  const { data: info } = useApi<any>('/public/affiliate-signup')
  const [f, setF] = useState({ name: '', cpf: '', phone: '', email: '', password: '', pix_type: 'cpf', pix_key: '', consent: false })
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<null | { approved: boolean }>(null)
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try { setDone(await api('/public/affiliate-signup', { body: { ...f, pix_key: f.pix_type === 'cpf' ? f.cpf : f.pix_key } })) }
    catch (e: any) { setErr({ field: e?.data?.field, msg: e.message }) } finally { setBusy(false) }
  }
  const bad = (field: string) => (err?.field === field ? { borderColor: '#e5484d' } : {})

  return (
    <PublicLayout notice={false}>
      <section className="pdoc-head">
        <div className="pw">
          <div className="pkicker">Programa de afiliados</div>
          <h1 className="hfont" style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 900, margin: '8px 0 8px', textTransform: 'uppercase' }}>Indique e ganhe</h1>
          <p style={{ color: '#c7d2e8', margin: 0, fontSize: 16, maxWidth: 620 }}>Cadastre-se, receba seu link exclusivo e ganhe comissão a cada participação confirmada pelo seu link.</p>
        </div>
      </section>
      <div className="pw" style={{ marginTop: -40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 22, alignItems: 'start' }}>
        <div className="pdoc-body" style={{ padding: 22 }}>
          {[
            [BadgeDollarSign, `${info ? brl(info.commission_value) : '…'} por número vendido`, 'Comissão em cada participação confirmada pelo seu link.'],
            [Link2, 'Link exclusivo', 'Quem entra pelo seu link fica ligado a você por 30 dias.'],
            [Wallet, `Saque a partir de ${info ? brl(info.min_withdrawal) : '…'}`, `Direto na sua chave PIX (taxa de ${info ? brl(info.fee) : '…'} por saque).`],
          ].map(([I, t, d]: any) => (
            <div key={t} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid #eef1f7' }}>
              <span style={{ width: 46, height: 46, borderRadius: 12, background: '#fff1e4', color: '#ff6b00', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><I size={22} /></span>
              <div><b className="hfont" style={{ fontSize: 16, color: '#0B1730' }}>{t}</b><p style={{ margin: '2px 0 0', fontSize: 14.5 }}>{d}</p></div>
            </div>
          ))}
          <p style={{ fontSize: 13.5, color: '#5d6b85', margin: '14px 0 0' }}>Já é afiliado? <Link to="/entrar">Entrar</Link></p>
        </div>

        <div className="pdoc-body" style={{ padding: 22 }}>
          {info && !info.enabled ? <p style={{ fontSize: 16 }}>O cadastro de afiliados está fechado no momento.</p>
            : done ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <CheckCircle2 size={54} color="#16a34a" style={{ display: 'block', margin: '0 auto 8px' }} />
                <h2 className="hfont" style={{ margin: '0 0 8px', color: '#0B1730' }}>{done.approved ? 'Cadastro concluído!' : 'Cadastro enviado!'}</h2>
                <p style={{ fontSize: 15.5 }}>{done.approved ? 'Seu acesso já está liberado. Entre para pegar seu link de indicação.' : 'Seu cadastro está em análise. Assim que for aprovado, você entra com seu e-mail e senha e pega seu link de indicação.'}</p>
                <Link to="/entrar" className="pbtn pbtn-orange" style={{ marginTop: 10 }}>Ir para o login</Link>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <h2 className="hfont" style={{ margin: '0 0 14px', fontSize: 20, color: '#0B1730', textTransform: 'uppercase' }}>Quero ser afiliado</h2>
                <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>Nome completo</span><input value={f.name} onChange={e => set('name', e.target.value)} autoComplete="name" style={{ ...inp, ...bad('Nome') }} /></label>
                <div className="grid2" style={{ gap: 12 }}>
                  <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>CPF</span><input value={f.cpf} onChange={e => set('cpf', maskCPF(e.target.value))} inputMode="numeric" style={{ ...inp, ...bad('CPF') }} placeholder="000.000.000-00" /></label>
                  <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>WhatsApp</span><input value={f.phone} onChange={e => set('phone', maskPhone(e.target.value))} inputMode="tel" autoComplete="tel-national" style={{ ...inp, ...bad('WhatsApp') }} placeholder="(91) 98888-7777" /></label>
                </div>
                <div className="grid2" style={{ gap: 12 }}>
                  <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>E-mail (login)</span><input type="email" value={f.email} onChange={e => set('email', e.target.value)} autoComplete="email" style={{ ...inp, ...bad('E-mail') }} /></label>
                  <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>Senha</span><PasswordInput value={f.password} onChange={v => set('password', v)} autoComplete="new-password" style={{ ...inp, ...bad('Senha') }} placeholder="8+ letras e números" ariaLabel="Senha" /></label>
                </div>
                <div style={{ padding: 14, borderRadius: 12, background: '#F5F7FB', border: '1px solid #e3e8f2', marginBottom: 12 }}>
                  <span style={lbl}>Chave PIX para receber as comissões</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {PIX.map(([k, l]) => <button key={k} type="button" onClick={() => set('pix_type', k)} style={{ height: 38, padding: '0 12px', borderRadius: 8, border: `1.5px solid ${f.pix_type === k ? '#1458D4' : '#d6deec'}`, background: f.pix_type === k ? '#e8f0fe' : '#fff', color: f.pix_type === k ? '#1458D4' : '#14213D', fontWeight: 700, fontSize: 13.5 }}>{l}</button>)}
                  </div>
                  {f.pix_type === 'cpf'
                    ? <p style={{ margin: 0, fontSize: 14 }}>Vamos usar o CPF informado acima: <b>{f.cpf || '—'}</b></p>
                    : <input value={f.pix_key} onChange={e => set('pix_key', f.pix_type === 'telefone' ? maskPhone(e.target.value) : e.target.value)} style={{ ...inp, ...bad('Chave PIX') }} placeholder={f.pix_type === 'telefone' ? '(91) 98888-7777' : f.pix_type === 'email' ? 'voce@email.com' : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'} />}
                  <p style={{ display: 'flex', gap: 6, margin: '8px 0 0', fontSize: 12.5, color: '#5d6b85' }}><Lock size={13} style={{ flex: 'none', marginTop: 1 }} /> Por segurança, depois do cadastro só o organizador pode alterar a chave PIX. Confira antes de enviar.</p>
                </div>
                <label style={{ display: 'flex', gap: 8, fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
                  <input type="checkbox" checked={f.consent} onChange={e => set('consent', e.target.checked)} style={{ marginTop: 3, accentColor: '#1458D4' }} />
                  <span>Li e aceito os <Link to="/termos" target="_blank">Termos de uso</Link> e a <Link to="/privacidade" target="_blank">Política de privacidade</Link>.</span>
                </label>
                {err && <p role="alert" style={{ color: '#d1242f', fontWeight: 600, fontSize: 14, margin: '0 0 12px' }}>{err.msg}</p>}
                <button type="submit" className="pbtn pbtn-orange" disabled={busy || !f.consent} style={{ width: '100%', height: 54, fontSize: 16 }}>{busy ? <><Loader2 size={18} className="spin" /> Enviando…</> : 'Quero ser afiliado'}</button>
              </form>
            )}
        </div>
      </div>
    </PublicLayout>
  )
}
