import { useState } from 'react'
import { useApi } from '../../lib/api'
import { useAffiliateOptions, useCampaignPicker } from '../../lib/hooks'
import { DataTable, ExportBtn, PageHead, Tabs, inputStyle } from '../../components/ui'

const KINDS: [string, string][] = [['participacoes', 'Participações por período'], ['campanhas', 'Progresso das campanhas'], ['afiliados', 'Desempenho dos afiliados'], ['comissoes', 'Comissões'], ['financeiro', 'Receita e despesas'], ['resultados', 'Resultados'], ['premiacoes', 'Premiações']]

export default function Relatorios() {
  const pick = useCampaignPicker()
  const affiliates = useAffiliateOptions()
  const [kind, setKind] = useState('participacoes')
  const [cid, setCid] = useState(''); const [aff, setAff] = useState(''); const [status, setStatus] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const qs = new URLSearchParams({ ...(cid && { campaign_id: cid }), ...(aff && { affiliate_id: aff }), ...(status && { status }), ...(from && { from }), ...(to && { to }) }).toString()
  const { data, loading } = useApi<any>(`/admin/reports/${kind}?${qs}`, ['participations', 'commissions', 'expenses', 'draws', 'prizes', 'progress'])
  const statusOpts = kind === 'participacoes' ? ['pendente', 'confirmada', 'cancelada'] : kind === 'comissoes' ? ['pendente', 'aprovada', 'paga', 'cancelada', 'estornada'] : null
  return (
    <div>
      <PageHead title="Relatórios" subtitle="Filtre por campanha, afiliado, status e período. Todos os relatórios podem ser exportados em CSV (abre no Excel).">
        <ExportBtn path={`/admin/reports/${kind}?${qs}&format=csv`} filename={`relatorio-${kind}.csv`} />
      </PageHead>
      <Tabs value={kind} onChange={k => { setKind(k); setStatus('') }} items={KINDS as any} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={cid} onChange={e => setCid(e.target.value)} style={{ ...inputStyle, width: 230 }}><option value="">Todas as campanhas</option>{pick.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {['participacoes', 'afiliados', 'comissoes'].includes(kind) && <select value={aff} onChange={e => setAff(e.target.value)} style={{ ...inputStyle, width: 190 }}><option value="">Todos os afiliados</option>{affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
        {statusOpts && <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, width: 160 }}><option value="">Todos os status</option>{statusOpts.map(s => <option key={s} value={s}>{s}</option>)}</select>}
        {['participacoes', 'afiliados', 'comissoes', 'financeiro'].includes(kind) && <><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: 150 }} title="De" /><input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: 150 }} title="Até" /></>}
      </div>
      <DataTable loading={loading} empty="Sem dados para os filtros escolhidos."
        columns={(data?.columns || []).map((c: any) => ({ label: c.label }))}
        rows={(data?.rows || []).map((r: any) => data.columns.map((c: any) => r[c.key] ?? '—'))} />
    </div>
  )
}
