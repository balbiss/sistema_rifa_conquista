import { useState } from 'react'
import { useApi } from '../../lib/api'
import { useDebounced } from '../../lib/hooks'
import { actionLabel, dateTime } from '../../lib/fmt'
import { DataTable, ExportBtn, PageHead, Pager, inputStyle } from '../../components/ui'

const ENT: Record<string, string> = { campaign: 'Campanha', participant: 'Participante', participation: 'Participação', commission: 'Comissão', affiliate: 'Afiliado', draw: 'Apuração', prize: 'Prêmio', expense: 'Despesa', settings: 'Configuração', user: 'Usuário', system: 'Sistema', file: 'Arquivo' }

export default function Auditoria() {
  const [q, setQ] = useState(''); const dq = useDebounced(q)
  const [entity, setEntity] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const qs = new URLSearchParams({ ...(dq && { q: dq }), ...(entity && { entity }), ...(from && { from }), ...(to && { to }), page: String(page), per: '50' }).toString()
  const { data, loading } = useApi<any>(`/admin/audit?${qs}`, ['dashboard', 'participations', 'commissions', 'campaigns', 'settings', 'draws'])
  return (
    <div>
      <PageHead title="Auditoria" subtitle="Registro imutável de todas as ações importantes (o banco recusa alteração ou exclusão destes registros).">
        <ExportBtn path={`/admin/audit?${qs}&format=csv`} filename="auditoria.csv" />
      </PageHead>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input value={q} onChange={e => { setQ(e.target.value); setPage(1) }} placeholder="Buscar ação, usuário ou dado" style={{ ...inputStyle, width: 260 }} />
        <select value={entity} onChange={e => { setEntity(e.target.value); setPage(1) }} style={{ ...inputStyle, width: 180 }}><option value="">Tudo</option>{Object.entries(ENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: 150 }} /><input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: 150 }} />
      </div>
      <DataTable loading={loading} columns={[{ label: 'Quando' }, { label: 'Usuário' }, { label: 'Ação' }, { label: 'Registro' }, { label: 'Dados' }]}
        rows={(data?.items || []).map((a: any) => [<span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{dateTime(a.at)}</span>, a.user_name, actionLabel(a.action), `${ENT[a.entity] || a.entity}${a.entity_id ? ` #${a.entity_id}` : ''}`,
          <code style={{ fontSize: 11.5, color: 'var(--muted)', display: 'block', maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={JSON.stringify(a.data, null, 1)}>{JSON.stringify(a.data)}</code>])}
        footer={data && <Pager page={page} per={data.per} total={data.total} onPage={setPage} />} />
    </div>
  )
}
