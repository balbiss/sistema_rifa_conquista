import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileSearch, Lock, Printer } from 'lucide-react'
import { useApi } from '../../lib/api'
import { date } from '../../lib/fmt'
import { PublicLayout } from '../../components/PublicLayout'

type Sec = { id: string; title: string; body: ReactNode[] }

/** Transforma o texto do regulamento em seções: linhas "1. TÍTULO" viram títulos, "3.1." viram cláusulas. */
function parse(text: string): { intro: string[]; sections: Sec[] } {
  const intro: string[] = []
  const sections: Sec[] = []
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const h = line.match(/^(\d{1,2})\.\s+(.+)$/)
    if (h && h[2] === h[2].toUpperCase() && h[2].length < 90) {
      sections.push({ id: `sec-${h[1]}`, title: `${h[1]}. ${h[2]}`, body: [] })
      continue
    }
    const cl = line.match(/^(\d{1,2}\.\d{1,2}\.?)\s+(.+)$/)
    const node = cl ? <p key={sections.length + line} className="clause"><b>{cl[1].replace(/\.$/, '')}</b><span>{cl[2]}</span></p> : <p key={sections.length + line}>{line}</p>
    if (sections.length) sections[sections.length - 1].body.push(node)
    else intro.push(line)
  }
  return { intro, sections }
}

export default function Regulamento() {
  const { slug } = useParams()
  const { data: c, loading } = useApi<any>(`/public/campaigns/${slug}`, ['campaigns'])
  const doc = useMemo(() => parse(c?.regulation || ''), [c?.regulation])
  const [active, setActive] = useState('')
  useEffect(() => {
    if (!doc.sections.length) return
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setActive(e.target.id) }), { rootMargin: '-100px 0px -70% 0px' })
    doc.sections.forEach(s => { const el = document.getElementById(s.id); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [doc])
  return (
    <PublicLayout>
      <div className="pdoc-head">
        <div className="pw">
          <Link to={`/c/${slug}`} style={{ color: '#b8c6e2', fontSize: 14, display: 'inline-flex', gap: 6, alignItems: 'center', textDecoration: 'none' }}><ArrowLeft size={15} /> Voltar à campanha</Link>
          <div className="pkicker" style={{ marginTop: 16 }}>Regulamento</div>
          <h1 className="hfont" style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 900, margin: '8px 0 6px', textTransform: 'uppercase' }}>{c?.name || 'Carregando…'}</h1>
          <p style={{ color: '#c7d2e8', margin: 0, fontSize: 15 }}>{c?.subtitle}</p>
        </div>
      </div>
      <div className="pw pdoc-grid">
        <nav className="pdoc-toc" aria-label="Seções do regulamento">
          <div className="hfont" style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--pmuted)', padding: '4px 10px 8px' }}>Neste regulamento</div>
          {doc.sections.map(s => <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'on' : ''} onClick={e => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }) }}>{s.title}</a>)}
          <div style={{ borderTop: '1px solid var(--pline)', marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="pbtn pbtn-outline pbtn-sm" onClick={() => window.print()}><Printer size={15} /> Imprimir / PDF</button>
            <Link to={`/c/${slug}/transparencia`} className="pbtn pbtn-outline pbtn-sm"><FileSearch size={15} /> Transparência</Link>
          </div>
        </nav>
        <article className="pdoc-body">
          {loading && <div className="skel" style={{ height: 300 }} />}
          {c && !c.regularized && <div className="pdoc-alert"><Lock size={18} style={{ flex: 'none', marginTop: 2 }} /><span><b>Minuta em análise.</b> A campanha aguarda a definição e a autorização da modalidade legal. Nenhuma participação está sendo comercializada e esta versão pode mudar até a aprovação.</span></div>}
          {doc.intro.map((l, i) => <p key={i} style={i === 0 ? { fontWeight: 700, color: 'var(--navy)' } : undefined}>{l}</p>)}
          {doc.sections.map(s => <section key={s.id}><h2 id={s.id}>{s.title}</h2>{s.body}</section>)}
          {c?.updated_at && <p style={{ fontSize: 13, color: 'var(--pmuted)', marginTop: 24 }}>Versão de {date(c.updated_at)}.</p>}
        </article>
      </div>
    </PublicLayout>
  )
}
