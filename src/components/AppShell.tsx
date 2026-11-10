import { useEffect, useState, type CSSProperties } from 'react'
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { Banknote, QrCode, Award, Bell, ChartPie, ClipboardList, Coins, ExternalLink, FileBarChart, Gauge, Grid3x3, KeyRound, LogOut, Megaphone, Menu, PanelLeft, Settings, ShieldCheck, Trophy, UserRound, Users, Wallet, X, Link2 } from 'lucide-react'
import Swal from 'sweetalert2'
import { api, session, useApi, type User } from '../lib/api'
import { dateTime, ini } from '../lib/fmt'
import { BrandMark, BrandWord } from './Brand'
import { toast, showError } from './ui'

// Casca do app no visual do CRM Clara V2: menu lateral rosa #dbe6fb com texto vinho, item ativo em
// branco, rodapé com Configurações / Notificações / usuário, gaveta no celular.
export const ROSA = '#0B1730'
const SB = { bg: '#0B1730', text: '#c9d4ea', muted: '#7f90b3', line: 'rgba(255,255,255,.1)', activeBg: '#1458D4', active: '#ffffff', icon: '#9fb0cf', iconActive: '#ffffff', logo: '#ffffff', strong: '#ffffff' }

type NavItem = { path: string; label: string; icon: any; perm?: string; exact?: boolean }
const ADMIN_NAV: NavItem[] = [
  { path: '/admin', label: 'Painel', icon: Gauge, exact: true },
  { path: '/admin/campanhas', label: 'Campanhas', icon: Megaphone, perm: 'campanhas' },
  { path: '/admin/identificadores', label: 'Identificadores', icon: Grid3x3, perm: 'identificadores' },
  { path: '/admin/participantes', label: 'Participantes', icon: Users, perm: 'participantes' },
  { path: '/admin/afiliados', label: 'Afiliados', icon: Link2, perm: 'afiliados' },
  { path: '/admin/comissoes', label: 'Comissões', icon: Coins, perm: 'comissoes' },
  { path: '/admin/pagamentos', label: 'Pagamentos PIX', icon: QrCode, perm: 'financeiro' },
  { path: '/admin/saques', label: 'Saques', icon: Banknote, perm: 'comissoes' },
  { path: '/admin/financeiro', label: 'Financeiro', icon: Wallet, perm: 'financeiro' },
  { path: '/admin/apuracao', label: 'Apuração', icon: Trophy, perm: 'apuracao' },
  { path: '/admin/premios', label: 'Prêmios', icon: Award, perm: 'premios' },
  { path: '/admin/relatorios', label: 'Relatórios', icon: FileBarChart, perm: 'relatorios' },
  { path: '/admin/auditoria', label: 'Auditoria', icon: ShieldCheck, perm: 'auditoria' },
]
const AFF_NAV: NavItem[] = [
  { path: '/afiliado', label: 'Meu painel', icon: ChartPie, exact: true },
  { path: '/afiliado/indicacoes', label: 'Indicações', icon: Users },
  { path: '/afiliado/comissoes', label: 'Comissões', icon: Coins },
  { path: '/afiliado/saques', label: 'Saques', icon: Banknote },
]
const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', afiliado: 'Afiliado', participante: 'Participante' }

export function AppShell({ area }: { area: 'admin' | 'afiliado' }) {
  const user = session.user
  const nav = useNavigate()
  const loc = useLocation()
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('cp_sidebar') !== '0' } catch { return true } })
  const [mobile, setMobile] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [userMenu, setUserMenu] = useState(false)
  const notif = useApi<{ items: any[]; unread: number }>(user ? '/notifications' : null, ['commissions', 'referrals', 'participants', 'participations', 'withdrawals', 'payments'])
  useEffect(() => { setMobile(false); setNotifOpen(false); setUserMenu(false) }, [loc.pathname])

  if (!user) return <Navigate to={`/entrar?volta=${encodeURIComponent(loc.pathname)}`} replace />
  if (area === 'admin' && user.role !== 'admin') return <Navigate to={user.role === 'afiliado' ? '/afiliado' : '/minha-conta'} replace />
  if (area === 'afiliado' && user.role !== 'afiliado') return <Navigate to={user.role === 'admin' ? '/admin' : '/minha-conta'} replace />

  const can = (perm?: string) => !perm || user.permissions.includes('*') || user.permissions.includes(perm)
  const items = (area === 'admin' ? ADMIN_NAV : AFF_NAV).filter(i => can(i.perm))
  const isActive = (i: NavItem) => (i.exact ? loc.pathname === i.path : loc.pathname.startsWith(i.path))
  const toggle = () => setOpen(o => { try { localStorage.setItem('cp_sidebar', o ? '0' : '1') } catch { /* */ } return !o })
  const logout = () => { session.clear(); location.href = '/entrar' }
  const changePassword = async () => {
    setUserMenu(false)
    const r = await Swal.fire({
      title: 'Trocar senha', confirmButtonText: 'Salvar', showCancelButton: true, cancelButtonText: 'Cancelar', confirmButtonColor: '#1458D4',
      html: '<input id="sw-cur" type="password" class="swal2-input" placeholder="Senha atual" autocomplete="current-password"><input id="sw-new" type="password" class="swal2-input" placeholder="Nova senha (8+, letras e números)" autocomplete="new-password"><label style="display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px;font-size:14px;cursor:pointer"><input type="checkbox" id="sw-show"> Mostrar senhas</label>',
      didOpen: () => { const c = document.getElementById('sw-show') as HTMLInputElement; c.onchange = () => ['sw-cur', 'sw-new'].forEach(i => { (document.getElementById(i) as HTMLInputElement).type = c.checked ? 'text' : 'password' }) },
      preConfirm: () => ({ current: (document.getElementById('sw-cur') as HTMLInputElement).value, password: (document.getElementById('sw-new') as HTMLInputElement).value }),
    })
    if (!r.isConfirmed) return
    try { const d = await api('/auth/password', { body: r.value }); session.set(d.token, user); toast('success', 'Senha alterada', 'As outras sessões foram encerradas.') } catch (e) { showError(e) }
  }

  const row = (active: boolean, mob: boolean): CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: mob ? '11px 12px' : '8px 12px', border: 'none', borderRadius: 6,
    background: active ? SB.activeBg : 'transparent', color: active ? SB.active : SB.text, fontSize: 15, fontWeight: active ? 700 : 400, textAlign: 'left',
  })
  const showText = (mob: boolean) => mob || open
  const navTree = (mob = false) => items.map(i => {
    const a = isActive(i), I = i.icon
    return (
      <button key={i.path} title={i.label} onClick={() => nav(i.path)} style={row(a, mob)} aria-current={a ? 'page' : undefined}>
        <I size={20} strokeWidth={1.6} color={a ? SB.iconActive : SB.icon} style={{ flex: 'none' }} />{showText(mob) && <span style={{ flex: 1 }}>{i.label}</span>}
      </button>
    )
  })
  const unread = notif.data?.unread || 0
  const footer = (mob = false) => (
    <div style={{ flex: 'none', borderTop: `1px solid ${SB.line}`, padding: '8px 10px 10px', display: 'flex', flexDirection: 'column', gap: 1 }}>
      {area === 'admin' && can('configuracoes') && (
        <button title="Configurações" onClick={() => nav('/admin/configuracoes')} style={row(loc.pathname.startsWith('/admin/configuracoes'), mob)}>
          <Settings size={20} strokeWidth={1.6} color={SB.icon} />{showText(mob) && <span style={{ flex: 1 }}>Configurações</span>}
        </button>
      )}
      <button title="Ver site público" onClick={() => window.open('/', '_blank')} style={row(false, mob)}>
        <ExternalLink size={20} strokeWidth={1.6} color={SB.icon} />{showText(mob) && <span style={{ flex: 1 }}>Ver site público</span>}
      </button>
      <button title="Centro de Notificação" onClick={() => { setNotifOpen(o => !o); setUserMenu(false) }} style={row(notifOpen, mob)}>
        <span style={{ position: 'relative', display: 'inline-flex' }}><Bell size={20} strokeWidth={1.6} color={SB.icon} />{!showText(mob) && unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#e53935' }} />}</span>
        {showText(mob) && <><span style={{ flex: 1 }}>Notificações</span>{unread > 0 && <span style={{ minWidth: 20, height: 18, padding: '0 6px', borderRadius: 9, background: '#e53935', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{unread}</span>}</>}
      </button>
      <div style={{ position: 'relative' }}>
        <button onClick={() => { setUserMenu(o => !o); setNotifOpen(false) }} style={{ ...row(false, mob), padding: '10px 8px', marginTop: 4 }}>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#FF8A24', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }}>{ini(user.name)}</span>
          {showText(mob) && (
            <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
              <span style={{ display: 'block', fontSize: 14, color: SB.strong, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: SB.muted }}>{ROLE_LABEL[user.role]}{user.affiliate ? ` · ${user.affiliate.code}` : ''}</span>
            </span>
          )}
        </button>
        {userMenu && (
          <div style={{ position: 'fixed', left: 10, bottom: 74, width: 260, maxWidth: 'calc(100vw - 20px)', background: '#fff', border: '1px solid var(--line)', borderRadius: 6, padding: '8px 0', boxShadow: '0 8px 24px rgba(0,0,0,.18)', zIndex: 95 }}>
            <div style={{ padding: '4px 16px 8px' }}><div style={{ fontSize: 15 }}>{user.name}</div><div style={{ fontSize: 13, color: 'var(--muted)' }}>{user.email}</div></div>
            <button onClick={changePassword} style={menuItem}><KeyRound size={16} color="#92989b" /> Trocar senha</button>
            <button onClick={async () => { await api('/auth/logout-all', { body: {} }).catch(() => {}); logout() }} style={menuItem}><UserRound size={16} color="#92989b" /> Sair de todos os aparelhos</button>
            <button onClick={logout} style={{ ...menuItem, color: '#f86161' }}><LogOut size={16} /> Sair</button>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <aside className="app-sidebar" style={{ width: open ? 240 : 68, background: SB.bg, color: SB.text, display: 'flex', flexDirection: 'column', height: '100vh', position: 'fixed', top: 0, left: 0, zIndex: 50, transition: 'width .18s ease', overflow: 'hidden' }}>
        <div style={{ flex: 'none', height: 64, padding: '0 14px 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {open ? <BrandWord color={SB.logo} /> : <BrandMark size={30} />}
          {open && <button onClick={toggle} title="Recolher menu" aria-label="Recolher menu" style={{ border: 'none', background: 'none', color: SB.text, padding: 4, display: 'flex' }}><PanelLeft size={20} strokeWidth={1.6} /></button>}
        </div>
        {!open && <button onClick={toggle} title="Abrir menu" aria-label="Abrir menu" style={{ border: 'none', background: 'none', color: SB.text, padding: '0 0 8px', display: 'flex', justifyContent: 'center' }}><PanelLeft size={20} strokeWidth={1.6} /></button>}
        <div style={{ borderTop: `1px solid ${SB.line}`, margin: '0 12px' }} />
        {open && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: SB.muted, margin: '14px 22px 4px' }}>{area === 'admin' ? 'Administração' : 'Área do afiliado'}</div>}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '6px 10px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>{navTree()}</nav>
        {footer()}
      </aside>

      {notifOpen && (
        <div style={{ position: 'fixed', left: mobileOrOpen(open), bottom: 16, width: 340, maxWidth: 'calc(100vw - 20px)', background: '#fff', border: '1px solid var(--line)', borderRadius: 6, boxShadow: '0 8px 30px rgba(0,0,0,.18)', zIndex: 95, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
            <b style={{ fontSize: 15 }}>Centro de Notificação</b>
            <span style={{ display: 'flex', gap: 8 }}>
              {unread > 0 && <button onClick={async () => { await api('/notifications/read-all', { body: {} }); notif.reload() }} style={{ border: 'none', background: 'none', fontSize: 13, color: 'var(--vinhoBtn)' }}>Marcar como lidas</button>}
              <button onClick={() => setNotifOpen(false)} aria-label="Fechar" style={{ border: 'none', background: 'none', color: 'var(--muted)', display: 'flex' }}><X size={15} /></button>
            </span>
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {(notif.data?.items || []).map(n => (
              <button key={n.id} onClick={() => { setNotifOpen(false); if (n.link) nav(n.link) }} style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 8, padding: '10px 16px', border: 'none', borderBottom: '1px solid var(--line)', background: n.read_at ? '#fff' : '#f2f6fd' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: n.read_at ? 'transparent' : 'var(--terra)', flex: 'none', marginTop: 6 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: n.read_at ? 400 : 700 }}>{n.title}</span>
                  {n.message && <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)', margin: '2px 0' }}>{n.message}</span>}
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{dateTime(n.created_at)}</span>
                </span>
              </button>
            ))}
            {!notif.data?.items?.length && <p style={{ padding: 16, fontSize: 14, color: 'var(--muted)', margin: 0 }}>Nenhuma notificação por aqui.</p>}
          </div>
        </div>
      )}

      <div className="content-col" style={{ marginLeft: open ? 240 : 68, minWidth: 0, transition: 'margin-left .18s ease' }}>
        <div className="topbar-mobile" style={{ display: 'none', position: 'sticky', top: 0, zIndex: 30, alignItems: 'center', gap: 10, padding: '10px 14px', background: '#fff', borderBottom: '1px solid var(--line)' }}>
          <button onClick={() => setMobile(true)} aria-label="Abrir menu" style={{ width: 38, height: 38, border: '1px solid var(--line)', borderRadius: 6, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Menu size={19} /></button>
          <BrandMark size={26} /><b style={{ fontSize: 15 }}>{area === 'admin' ? 'Administração' : 'Área do afiliado'}</b>
        </div>
        <main className="app-main" style={{ padding: 24, minWidth: 0 }}><Outlet /></main>
      </div>

      <div hidden={!mobile} style={{ position: 'fixed', inset: 0, zIndex: 90 }}>
        <div onClick={() => setMobile(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.4)' }} />
        <aside style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 'min(86vw, 300px)', background: SB.bg, color: SB.text, display: 'flex', flexDirection: 'column', animation: 'slideInLeft .18s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px' }}>
            <BrandWord color={SB.logo} />
            <button onClick={() => setMobile(false)} aria-label="Fechar menu" style={{ width: 32, height: 32, borderRadius: 6, border: `1px solid ${SB.line}`, background: 'none', color: SB.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
          </div>
          <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 12px' }}>{navTree(true)}</nav>
          {footer(true)}
        </aside>
      </div>
    </div>
  )
}
const mobileOrOpen = (open: boolean) => (typeof window !== 'undefined' && window.innerWidth <= 900 ? 10 : open ? 248 : 76)
const menuItem: CSSProperties = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 16px', border: 'none', background: 'none', fontSize: 15, color: '#313942' }
export type { User }
