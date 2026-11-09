import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BellRing, Car, Bike, Info, Menu, UserRound, X } from 'lucide-react'
import '../pub.css'
import { api, session } from '../lib/api'
import { useBrand } from './Brand'

/** Entrada suave dos elementos com classe .reveal ao aparecerem na tela. */
export function useReveal(dep?: any) {
  useEffect(() => {
    const els = document.querySelectorAll('.pub .reveal:not(.in)')
    if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return }
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    els.forEach(e => io.observe(e))
    // garantia: nada fica invisível se o observador não disparar (ex.: aba em segundo plano)
    const safety = setTimeout(() => document.querySelectorAll(".pub .reveal:not(.in)").forEach(e => e.classList.add("in")), 2500)
    return () => { io.disconnect(); clearTimeout(safety) }
  }, [dep])
}

export function PubLogo({ light = true }: { light?: boolean }) {
  const b = useBrand()
  const [first, ...rest] = b.name.split(' ')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      {b.logo_url ? <img src={b.logo_url} alt="" className="plogo-mark" style={{ borderRadius: 12, objectFit: 'cover' }} /> : (
        <svg className="plogo-mark" viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r="21" fill="none" stroke="#FF8A24" strokeWidth="5" />
          <path d="M14 24.5l7 7L35 16" fill="none" stroke={light ? '#fff' : '#1458D4'} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1, minWidth: 0 }}>
        <span className="hfont" style={{ fontWeight: 900, fontSize: 21, letterSpacing: '.02em', textTransform: 'uppercase', color: light ? '#fff' : '#0B1730' }}>{first}</span>
        {rest.length > 0 && <span style={{ fontWeight: 600, fontSize: 10.5, letterSpacing: '.38em', textTransform: 'uppercase', color: light ? '#b8c6e2' : '#5d6b85', marginTop: 4 }}>{rest.join(' ')}</span>}
      </span>
    </span>
  )
}

/** Cabeçalho fixo + rodapé institucional do site público (identidade azul-marinho/laranja). */
export function PublicLayout({ children, notice = true }: { children: ReactNode; notice?: boolean }) {
  const brand = useBrand()
  const nav = useNavigate()
  const loc = useLocation()
  const [org, setOrg] = useState<any>(null)
  const [slug, setSlug] = useState<string>('')
  const [regularized, setRegularized] = useState(true)
  const [open, setOpen] = useState(false)
  const [legalNotice, setLegalNotice] = useState('')
  const [scrolled, setScrolled] = useState(false)
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    api('/public/settings').then(s => { setOrg(s.organizer); setLegalNotice(s.legal.notice) }).catch(() => {})
    api('/public/campaigns').then(c => { if (c[0]) { setSlug(c[0].slug); setRegularized(c[0].regularized); setOpen(!!c[0].open_for_participation) } }).catch(() => {})
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => setDrawer(false), [loc.pathname, loc.hash])
  useEffect(() => { document.body.style.overflow = drawer ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [drawer])

  const user = session.user
  const area = user ? (user.role === 'admin' ? '/admin' : user.role === 'afiliado' ? '/afiliado' : '/minha-conta') : '/entrar'
  const links: [string, string][] = [
    ['Como funciona', '/#como-funciona'],
    ['Regulamento', slug ? `/c/${slug}/regulamento` : '/#como-funciona'],
    ['Transparência', slug ? `/c/${slug}/transparencia` : '/#como-funciona'],
    ['Dúvidas', '/#faq'],
    ['Meus números', '/meus-numeros'],
    ['Resultados', '/resultados'],
  ]
  const go = (href: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    const [path, hash] = href.split('#')
    if (hash && (loc.pathname === path || (path === '/' && loc.pathname === '/'))) { document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }); history.replaceState(null, '', '#' + hash); setDrawer(false) }
    else nav(href)
  }
  const avisar = () => {
    setDrawer(false)
    if (loc.pathname === '/' || /^\/c\/[^/]+$/.test(loc.pathname)) window.dispatchEvent(new Event(open ? 'abrir-checkout' : 'abrir-aviso'))
    else nav(open ? '/?participar=1' : '/?avisar=1')
  }

  return (
    <div className="pub">
      <header className={`phead${scrolled ? ' scrolled' : ''}`}>
        <div className="pw phead-in">
          <Link to="/" aria-label={brand.name} style={{ display: 'flex', minWidth: 0 }}><PubLogo /></Link>
          <nav className="pnav" aria-label="Principal">{links.map(([l, h]) => <a key={l} href={h} onClick={go(h)}>{l}</a>)}</nav>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginLeft: 'auto' }}>
            <Link to={area} className="pbtn pbtn-ghost-light pbtn-sm pentrar-desk"><UserRound size={16} /> {user ? 'Minha área' : 'Entrar'}</Link>
            <button className="pbtn pbtn-orange pbtn-sm pentrar-desk phead-cta" onClick={avisar}><BellRing size={16} /> {open ? 'Comprar' : 'Quero ser avisado'}</button>
            <button className="pburger" onClick={() => setDrawer(true)} aria-label="Abrir menu"><Menu size={20} /></button>
          </div>
        </div>
      </header>

      {drawer && (
        <div className="pdrawer" role="dialog" aria-modal="true">
          <div className="pdrawer-bg" onClick={() => setDrawer(false)} />
          <div className="pdrawer-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <PubLogo />
              <button className="pburger" style={{ display: 'flex' }} onClick={() => setDrawer(false)} aria-label="Fechar menu"><X size={20} /></button>
            </div>
            {links.map(([l, h]) => <a key={l} href={h} onClick={go(h)}>{l}</a>)}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="pbtn pbtn-orange" onClick={avisar}><BellRing size={17} /> {open ? 'Comprar' : 'Quero ser avisado'}</button>
              <Link to={area} className="pbtn pbtn-ghost-light"><UserRound size={17} /> {user ? 'Minha área' : 'Entrar'}</Link>
            </div>
          </div>
        </div>
      )}

      <main style={{ flex: 1 }}>{children}</main>

      {notice && !regularized && (
        <section className="pbottom" aria-label="Aviso">
          <div className="pw pbottom-in">
            <span className="pnotice-ic"><Info size={22} /></span>
            <div style={{ flex: '1 1 320px' }}>
              <b className="hfont" style={{ fontSize: 19 }}>Campanha em preparação</b>
              <p style={{ margin: '3px 0 0', color: '#c7d2e8', fontSize: 14.5, lineHeight: 1.5 }}>{legalNotice}</p>
            </div>
            <span style={{ display: 'flex', gap: 14, color: '#5f7fbf' }} aria-hidden><Car size={46} strokeWidth={1.3} /><Bike size={46} strokeWidth={1.3} /></span>
          </div>
        </section>
      )}

      <footer className="pfoot" style={{ marginTop: notice && !regularized ? 0 : 72 }}>
        <div className="pw" style={{ padding: '44px 24px 28px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 28 }}>
          <div>
            <PubLogo />
            <p style={{ fontSize: 14, lineHeight: 1.65, marginTop: 14 }}>{brand.tagline}</p>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.85 }}>
            <b className="hfont" style={{ color: '#fff', letterSpacing: '.1em', textTransform: 'uppercase', fontSize: 12 }}>Organizador</b><br />
            {org?.name}<br />{org?.document && <>CNPJ/CPF: {org.document}<br /></>}{org?.address && <>{org.address}<br /></>}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.85 }}>
            <b className="hfont" style={{ color: '#fff', letterSpacing: '.1em', textTransform: 'uppercase', fontSize: 12 }}>Contato</b><br />
            {org?.email && <><a href={`mailto:${org.email}`}>{org.email}</a><br /></>}
            {org?.phone && <>{org.phone}<br /></>}
            {org?.whatsapp && <>WhatsApp: {org.whatsapp}<br /></>}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.85 }}>
            <b className="hfont" style={{ color: '#fff', letterSpacing: '.1em', textTransform: 'uppercase', fontSize: 12 }}>Institucional</b><br />
            {slug && <><Link to={`/c/${slug}/regulamento`}>Regulamento</Link><br /><Link to={`/c/${slug}/transparencia`}>Transparência</Link><br /></>}
            <Link to="/termos">Termos de uso</Link><br />
            <Link to="/privacidade">Política de privacidade</Link><br />
            <Link to="/resultados">Resultados</Link><br />
            <Link to="/seja-afiliado">Seja afiliado</Link>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', padding: '16px 24px', textAlign: 'center', fontSize: 12.5, color: '#7083a8' }}>
          © {new Date().getFullYear()} {brand.name}. Campanhas sujeitas a regulamento.
        </div>
      </footer>
    </div>
  )
}
