import { useApi } from '../../lib/api'
import { COMMISSION_STATUS, brl, dateTime } from '../../lib/fmt'
import { Badge, Card, DataTable, PageHead, SimBadge } from '../../components/ui'

export default function Comissoes() {
  const { data, loading } = useApi<any>('/affiliate/commissions', ['commissions'])
  return (
    <div>
      <PageHead title="Comissões" subtitle="Uma comissão por participação válida confirmada. O status muda conforme a aprovação e o pagamento." />
      <DataTable loading={loading} empty="Nenhuma comissão ainda."
        columns={[{ label: 'Campanha' }, { label: 'Indicado' }, { label: 'Qtd × valor' }, { label: 'Comissão', align: 'right' }, { label: 'Status' }, { label: 'Gerada' }, { label: 'Paga em' }]}
        rows={(data?.items || []).map((c: any) => [c.campaign_name, c.participant_name, `${c.quantity} × ${brl(c.unit_value)}`, <b>{brl(c.amount)}</b>,
          <span style={{ display: 'inline-flex', gap: 4 }}><Badge tone={COMMISSION_STATUS[c.status].tone}>{COMMISSION_STATUS[c.status].label}</Badge>{!!c.simulated && <SimBadge />}</span>,
          <span style={{ fontSize: 13 }}>{dateTime(c.created_at)}</span>, <span style={{ fontSize: 13 }}>{c.paid_at ? dateTime(c.paid_at) : '—'}</span>])} />
      <Card title="Histórico de movimentações" style={{ marginTop: 14 }}>
        {(data?.events || []).slice(0, 40).map((e: any, i: number) => (
          <div key={i} style={{ fontSize: 13.5, padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
            Comissão #{e.commission_id}: <b>{e.from_status ? `${COMMISSION_STATUS[e.from_status]?.label} → ` : ''}{COMMISSION_STATUS[e.to_status]?.label}</b> · {dateTime(e.at)}{e.note ? ` — ${e.note}` : ''}
          </div>
        ))}
        {data && !data.events.length && <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Sem movimentações.</p>}
      </Card>
    </div>
  )
}
