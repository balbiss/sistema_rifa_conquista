import { Copy, Eye, Link2, MousePointerClick, Ticket, Users, Coins, CircleDollarSign, Hourglass, BadgeCheck } from 'lucide-react'
import { useApi } from '../../lib/api'
import { brl, int } from '../../lib/fmt'
import { Card, ErrorBox, Kpi, PageHead, btn, inputStyle, toast } from '../../components/ui'
import { TwoLines } from '../../components/Charts'

export default function Painel() {
  const { data: d, error, reload } = useApi<any>('/affiliate/summary', ['commissions', 'referrals', 'participations', 'progress'])
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const copy = (t: string) => { navigator.clipboard.writeText(t).then(() => toast('success', 'Link copiado!')).catch(() => toast('error', 'Não foi possível copiar')) }
  const sk = (v: any) => (d ? v : <span className="skel" style={{ display: 'inline-block', width: 70, height: 22 }} />)
  return (
    <div>
      <PageHead title={d ? `Olá, ${d.affiliate.name.split(' ')[0]}` : 'Meu painel'} subtitle="Suas indicações, desempenho e comissões. Atualiza sozinho a cada nova indicação ou confirmação." />
      {d?.has_simulated && <div style={{ marginBottom: 14, padding: '10px 14px', background: 'var(--amberSoft)', color: '#6b4100', borderRadius: 4, fontSize: 13.5 }}>A campanha ainda está em regularização: as comissões são de <b>simulação</b> (R$ 2,50 de referência por participação válida) e não representam pagamento real.</div>}
      <Card title="Seu link de indicação" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input readOnly value={d?.link || ''} style={{ ...inputStyle, flex: '1 1 280px', fontWeight: 700 }} onFocus={e => e.target.select()} aria-label="Link de indicação" />
          <button style={btn('vinho')} onClick={() => d && copy(d.link)}><Copy size={14} /> Copiar link</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8 }}>Código exclusivo: <b style={{ color: 'var(--ink)' }}>{d?.affiliate.code}</b>. Quem entrar pelo link fica ligado a você por 30 dias.</div>
        {d?.campaigns?.map((c: any) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', background: 'var(--bg)', borderRadius: 4, flexWrap: 'wrap' }}>
            <Link2 size={14} color="var(--terra)" /><span style={{ flex: 1, minWidth: 160, fontSize: 13.5 }}><b>{c.name}</b> · comissão de referência {brl(c.commission_value)}</span>
            <button style={btn('ghost', { minHeight: 30 })} onClick={() => copy(c.link)}><Copy size={13} /> Copiar</button>
            <a href={`/c/${c.slug}`} target="_blank" style={btn('ghost', { minHeight: 30 })}><Eye size={13} /> Ver</a>
          </div>
        ))}
      </Card>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <Kpi label="Visitas no link" value={sk(int(d?.visits))} icon={<MousePointerClick size={17} />} />
        <Kpi label="Total de indicações" value={sk(int(d?.referrals))} icon={<Users size={17} />} />
        <Kpi label="Participações válidas" value={sk(int(d?.valid_participations))} hint={d && `${d.confirmed_count} confirmação(ões)`} icon={<Ticket size={17} />} />
        <Kpi label="Comissão acumulada" value={sk(brl(d?.commission.accumulated))} icon={<Coins size={17} />} />
        <Kpi label="Pendente" value={sk(brl(d?.commission.pending))} tone="#9A5B00" icon={<Hourglass size={17} />} />
        <Kpi label="Aprovada" value={sk(brl(d?.commission.approved))} tone="#1458D4" icon={<BadgeCheck size={17} />} />
        <Kpi label="Paga" value={sk(brl(d?.commission.paid))} tone="#4b7d12" icon={<CircleDollarSign size={17} />} />
      </div>
      <Card title="Desempenho — últimos 30 dias">{d ? <TwoLines data={d.chart} a={['indicacoes', 'Indicações']} b={['validas', 'Participações válidas']} /> : <div className="skel" style={{ height: 230 }} />}</Card>
    </div>
  )
}
