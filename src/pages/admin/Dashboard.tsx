import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, Coins, Megaphone, Percent, Receipt, Ticket, TrendingUp, UserCheck, Users, Wallet, Link2, CircleDollarSign } from 'lucide-react'
import { useApi } from '../../lib/api'
import { CAMPAIGN_STATUS, actionLabel, brl, dateTime, int, pct } from '../../lib/fmt'
import { Badge, Card, ErrorBox, Kpi, LockNotice, PageHead, btn, inputStyle } from '../../components/ui'
import { DailyBars, Donut } from '../../components/Charts'

export default function Dashboard() {
  const [cid, setCid] = useState('')
  const { data: d, error, reload } = useApi<any>(`/admin/dashboard${cid ? `?campaign_id=${cid}` : ''}`, ['dashboard', 'progress', 'participations', 'participants', 'commissions', 'expenses', 'campaigns'])
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const t = d?.totals
  const f = d?.focus
  const sk = (v: any) => (d ? v : <span className="skel" style={{ display: 'inline-block', width: 80, height: 22 }} />)
  return (
    <div>
      <PageHead title="Painel" subtitle="Visão geral das campanhas, participações, afiliados e financeiro — atualiza sozinho.">
        <select value={cid} onChange={e => setCid(e.target.value)} style={{ ...inputStyle, width: 260 }} aria-label="Filtrar por campanha">
          <option value="">Todas as campanhas</option>
          {d?.campaigns?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </PageHead>

      {f && !f.gate.allowed && <div style={{ marginBottom: 16 }}><LockNotice title={`${f.name}: ${f.status_label}`} reasons={f.gate.reasons} /></div>}

      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <Kpi label="Campanhas" value={sk(int(t?.campaigns))} hint={t && `${t.campaigns_active} ativa(s)`} icon={<Megaphone size={17} />} />
        <Kpi label="Participantes" value={sk(int(t?.participants))} hint="cadastros" icon={<Users size={17} />} />
        <Kpi label="Participações confirmadas" value={sk(int(t?.participations_confirmed))} hint={t && `${int(t.numbers_confirmed)} identificadores · ${int(t.numbers_confirmed_sim)} simulados`} icon={<Ticket size={17} />} />
        <Kpi label="Conclusão (real)" value={sk(pct(f?.progress?.percent ?? 0))} hint={f && `com simulação: ${pct(f.progress.percent_simulated)}`} icon={<Percent size={17} />} />
        <Kpi label="Afiliados ativos" value={sk(int(t?.affiliates))} icon={<Link2 size={17} />} />
        <Kpi label="Indicações" value={sk(int(t?.referrals))} icon={<UserCheck size={17} />} />
        <Kpi label="Comissões pendentes" value={sk(brl(t?.commissions_pending))} hint="pendentes + aprovadas" tone="#9A5B00" icon={<Coins size={17} />} />
        <Kpi label="Comissões pagas" value={sk(brl(t?.commissions_paid))} tone="#4b7d12" icon={<CircleDollarSign size={17} />} />
        <Kpi label="Receita registrada" value={sk(brl(t?.revenue_real))} hint={t && `simulada: ${brl(t.revenue_simulated)}`} icon={<TrendingUp size={17} />} />
        <Kpi label="Despesas" value={sk(brl(t?.expenses))} tone="#B42318" icon={<Receipt size={17} />} />
        <Kpi label="Saldo estimado (real)" value={sk(brl(t?.balance_real))} hint={t && `com simulação: ${brl(t.balance_simulated)}`} tone={t && t.balance_real < 0 ? '#B42318' : undefined} icon={<Wallet size={17} />} />
      </div>

      <div className="grid-main" style={{ marginBottom: 14 }}>
        <Card title="Identificadores confirmados por dia (30 dias)">
          {d ? <DailyBars data={d.chart} realKey="total" simKey="simulado" /> : <div className="skel" style={{ height: 230 }} />}
        </Card>
        <Card title={f ? `Identificadores — ${f.name}` : 'Identificadores'}>
          {f ? <Donut labels={['Atribuídos', 'Reservados', 'Disponíveis', 'Bloqueados', 'Cancelados']} values={[f.progress.counts.atribuido, f.progress.counts.reservado, f.progress.counts.disponivel, f.progress.counts.bloqueado, f.progress.counts.cancelado]} colors={['#1458D4', '#e7bd66', '#dbe6fb', '#313942', '#c3c7cc']} /> : <div className="skel" style={{ height: 200 }} />}
        </Card>
      </div>

      <div className="grid3">
        <Card title="Progresso das campanhas">
          {d?.campaigns?.map((c: any) => (
            <Link key={c.id} to={`/admin/campanhas/${c.id}`} style={{ display: 'block', padding: '10px 0', borderBottom: '1px dashed var(--line)', color: 'var(--ink)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b style={{ fontSize: 14 }}>{c.name}</b><Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{c.status === 'rascunho' ? 'Rascunho' : c.status_label}</Badge></div>
              <div style={{ position: 'relative', height: 8, background: '#e6ecf6', borderRadius: 4, overflow: 'hidden', marginTop: 8 }}>
                <div style={{ position: 'absolute', inset: 0, width: `${c.progress.percent_simulated}%`, background: 'repeating-linear-gradient(45deg,#e7bd66,#e7bd66 5px,#f2d79d 5px,#f2d79d 10px)' }} />
                <div style={{ position: 'absolute', inset: 0, width: `${c.progress.percent}%`, background: '#1458D4' }} />
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>Real {pct(c.progress.percent)} · com simulação {pct(c.progress.percent_simulated)}</div>
            </Link>
          ))}
        </Card>
        <Card title="Melhores afiliados" right={<Link to="/admin/afiliados" style={{ fontSize: 13 }}>Ver todos</Link>}>
          {d?.top_affiliates?.map((a: any, i: number) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px dashed var(--line)' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: i === 0 ? '#1458D4' : 'var(--terraSoft)', color: i === 0 ? '#fff' : 'var(--vinhoBtn)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{a.name}</b><span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>{a.code} · {a.referrals} indicações · {a.valid} válidas</span></span>
              <b style={{ fontSize: 13.5 }}>{brl(a.commission)}</b>
            </div>
          ))}
          {d && !d.top_affiliates.length && <p style={{ color: 'var(--muted)', fontSize: 14 }}>Nenhum afiliado.</p>}
        </Card>
        <Card title="Atividades recentes" right={<Link to="/admin/auditoria" style={{ fontSize: 13 }}>Auditoria</Link>}>
          {d?.activity?.map((a: any) => (
            <div key={a.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}>
              <Activity size={14} color="var(--terra)" style={{ flex: 'none', marginTop: 3 }} />
              <span style={{ flex: 1, minWidth: 0 }}><b>{a.user_name}</b> {actionLabel(a.action)}{a.data?.simulated ? ' (simulação)' : ''}<span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{dateTime(a.at)}</span></span>
            </div>
          ))}
        </Card>
      </div>
      <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--muted)' }}>Valores "reais" consideram só participações e comissões fora do modo simulação. Enquanto a campanha não for regularizada, tudo o que existe é simulação. <Link to="/admin/campanhas" style={btn('soft', { minHeight: 26, padding: '0 10px', fontSize: 11, marginLeft: 6 })}>Gerenciar campanhas</Link></div>
    </div>
  )
}
