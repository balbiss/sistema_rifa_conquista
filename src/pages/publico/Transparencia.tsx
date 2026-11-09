import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, Lock, ShieldCheck } from 'lucide-react'
import { useApi } from '../../lib/api'
import { CAMPAIGN_STATUS, date, LEGAL_STATUS } from '../../lib/fmt'
import { PublicLayout } from '../../components/PublicLayout'

export default function Transparencia() {
  const { slug } = useParams()
  const { data: c } = useApi<any>(`/public/campaigns/${slug}`, ['progress', 'campaigns', 'draws'])
  const t = c?.transparency
  const rows: [string, string][] = t ? [
    ['Situação da campanha', CAMPAIGN_STATUS[c.status]?.label || c.status],
    ...(t.legal_required ? [['Situação legal', LEGAL_STATUS[t.legal_status] || t.legal_status], ['Modalidade legal', t.legal_modality || 'A definir'], ['Nº de autorização', t.authorization_number || 'Ainda não emitido']] as [string, string][] : []),
    ['Elementos sorteáveis', `${t.total_numbers.toLocaleString('pt-BR')} identificadores (${t.range})`],
    ['Chance por identificador', t.chance_per_number],
    ['Identificadores com participação válida', t.assigned_valid.toLocaleString('pt-BR')],
    ['Identificadores disponíveis', t.available.toLocaleString('pt-BR')],
    ['Progresso', `${c.progress.percent}%`],
    ['Método de apuração', `${t.draw_method} — ${t.draw_rule}`],
    ['Extração de referência', t.draw_extraction],
    ['Valor de referência por participação', t.ref_price != null ? t.ref_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'A definir'],
    ['Período', c.starts_at ? `${date(c.starts_at)} a ${date(c.ends_at)}` : 'A definir no regulamento'],
  ] : []
  return (
    <PublicLayout>
      <div className="pdoc-head">
        <div className="pw">
          <Link to={`/c/${slug}`} style={{ color: '#b8c6e2', fontSize: 14, display: 'inline-flex', gap: 6, alignItems: 'center', textDecoration: 'none' }}><ArrowLeft size={15} /> Voltar à campanha</Link>
          <div className="pkicker" style={{ marginTop: 16 }}>Informações obrigatórias</div>
          <h1 className="hfont" style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 900, margin: '8px 0 6px', textTransform: 'uppercase' }}>Transparência</h1>
          <p style={{ color: '#c7d2e8', margin: 0, fontSize: 15 }}>{c?.name}</p>
        </div>
      </div>
      <div className="pw" style={{ marginTop: -40, maxWidth: 900 }}>
        <article className="pdoc-body">
          {c && !c.regularized && <div className="pdoc-alert"><Lock size={18} style={{ flex: 'none', marginTop: 2 }} /><span>Campanha em preparação: aguarda a definição e a autorização da modalidade legal. Nenhuma participação está sendo comercializada.</span></div>}
          {!t ? <div className="skel" style={{ height: 300 }} /> : (
            <table className="ptable"><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
          )}
          {c?.draws?.length > 0 && (
            <>
              <h2 style={{ marginTop: 28 }}>Apuração oficial</h2>
              {c.draws.map((d: any) => (
                <p key={d.id}><ShieldCheck size={16} style={{ verticalAlign: -3, color: '#1458D4' }} /> Extração {d.extraction_number} ({date(d.extraction_date)}), 1º prêmio {d.first_prize}, identificador <b>{String(d.winning_number).padStart(3, '0')}</b>. Código de verificação: <code>{d.hash.slice(0, 16)}</code></p>
              ))}
            </>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
            <Link to={`/c/${slug}/regulamento`} className="pbtn pbtn-blue pbtn-sm"><BookOpen size={15} /> Ler o regulamento</Link>
            <Link to="/resultados" className="pbtn pbtn-outline pbtn-sm">Resultados</Link>
          </div>
        </article>
      </div>
    </PublicLayout>
  )
}
