import { useApi } from '../../lib/api'
import { PART_STATUS, dateTime } from '../../lib/fmt'
import { Badge, DataTable, PageHead, SimBadge } from '../../components/ui'

export default function Indicacoes() {
  const { data, loading } = useApi<any[]>('/affiliate/referrals', ['referrals', 'participations', 'participants'])
  return (
    <div>
      <PageHead title="Indicações" subtitle="Pessoas que chegaram pelo seu link. Por privacidade (LGPD), nome e telefone aparecem abreviados." />
      <DataTable loading={loading} empty="Nenhuma indicação ainda. Compartilhe seu link!"
        columns={[{ label: 'Pessoa' }, { label: 'Telefone' }, { label: 'Campanha' }, { label: 'Participações válidas', align: 'right' }, { label: 'Status' }, { label: 'Data' }]}
        rows={(data || []).map(r => [<span><b>{r.name}</b> {!!r.simulated && <SimBadge />}</span>, r.phone, r.campaign_name, r.valid_count, <Badge tone={PART_STATUS[r.status]?.tone}>{PART_STATUS[r.status]?.label}</Badge>, <span style={{ fontSize: 13 }}>{dateTime(r.created_at)}</span>])} />
    </div>
  )
}
