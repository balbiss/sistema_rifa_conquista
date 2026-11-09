import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, session } from '../lib/api'
import { BrandMark, useBrand } from '../components/Brand'

// Login no mesmo layout do CRM Clara V2 (painel rosa à direita, campos com ícone, botão vinho).
const PANEL = '#0B1730', VINHO = '#0B1730', VINHO_BTN = '#FF8A24', VINHO_MUTED = '#9fb0cf'
const field: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 10px', background: '#fff', borderRadius: 3, marginBottom: 16 }
const inputCss: CSSProperties = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none', fontSize: 15, color: '#2c3e50', boxShadow: 'none' }
const UserIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7884" strokeWidth="1.7"><circle cx="12" cy="9" r="4" /><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4" /><circle cx="12" cy="12" r="10.5" /></svg>
const LockIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7884" strokeWidth="1.7"><rect x="5" y="10.5" width="14" height="10.5" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.4" /></svg>

export default function Login() {
  const brand = useBrand()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('cp_email') || '' } catch { return '' } })
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(params.get('expirou') ? 'Sua sessão expirou. Entre de novo.' : '')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true); setErro('')
    try {
      const d = await api('/auth/login', { body: { email, password: senha } })
      session.set(d.token, d.user)
      try { localStorage.setItem('cp_email', email) } catch { /* */ }
      const volta = params.get('volta')
      location.href = volta && volta.startsWith('/') ? volta : d.user.role === 'admin' ? '/admin' : d.user.role === 'afiliado' ? '/afiliado' : '/minha-conta'
    } catch (e: any) { setErro(e.message) } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'row-reverse' }}>
      <aside className="k-login-panel" style={{ width: 380, maxWidth: '100%', flex: 'none', background: PANEL, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 36px', position: 'relative', minHeight: '100vh' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 34 }}>
          <BrandMark size={58} />
          <b style={{ fontSize: 18, letterSpacing: '.14em', textTransform: 'uppercase', textAlign: 'center' }}>{brand.name}</b>
        </div>
        <form onSubmit={submit} style={{ width: '100%' }}>
          <label style={field}><UserIcon /><input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder="E-mail" autoComplete="username" style={inputCss} /></label>
          <label style={field}><LockIcon /><input value={senha} onChange={e => setSenha(e.target.value)} type="password" required placeholder="Senha" autoComplete="current-password" style={inputCss} /></label>
          {erro && <p role="alert" style={{ color: '#b3261e', fontWeight: 700, fontSize: 14, margin: '-4px 0 12px' }}>{erro}</p>}
          <button type="submit" disabled={loading} style={{ width: '100%', height: 38, background: VINHO_BTN, color: '#fff', border: 'none', borderRadius: 3, fontSize: 15.5 }}>{loading ? 'Entrando…' : 'Login'}</button>
        </form>
        <p style={{ fontSize: 13.5, color: VINHO_MUTED, marginTop: 24, textAlign: 'center', lineHeight: 1.6 }}>
          Administradores, afiliados e participantes entram por aqui.<br />Esqueceu a senha? Fale com o organizador.
        </p>
        <Link to="/" style={{ position: 'absolute', bottom: 26, fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', color: VINHO_MUTED }}>← Voltar ao site</Link>
      </aside>
      <main className="k-login-brand" style={{ flex: 1, minWidth: 0, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
        <BrandMark size={120} />
        <h1 style={{ margin: '26px 0 0', fontSize: 34, letterSpacing: '.1em', textTransform: 'uppercase', color: VINHO }}>{brand.name}</h1>
        <p style={{ margin: '14px 0 0', fontSize: 18, color: '#5d6b85', maxWidth: 520 }}>{brand.tagline}</p>
      </main>
      <style>{`@media (max-width: 760px) { .k-login-brand { display: none !important; } .k-login-panel { width: 100% !important; } }`}</style>
    </div>
  )
}
