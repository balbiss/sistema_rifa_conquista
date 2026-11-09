import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { useCampaignPicker } from '../../lib/hooks'
import { brl, date, toInputDate } from '../../lib/fmt'
import { ActionButton, DataTable, ExportBtn, F, IconBtn, Kpi, Modal, PageHead, btn, confirmBox, inputStyle, showError, toast } from '../../components/ui'

const CAT: Record<string, string> = { premio: 'Prêmio', juridico: 'Jurídico', marketing: 'Marketing', operacional: 'Operacional', taxas: 'Taxas', outros: 'Outros' }

export default function Financeiro() {
  const pick = useCampaignPicker()
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const qs = new URLSearchParams({ ...(pick.id && { campaign_id: pick.id }), ...(from && { from }), ...(to && { to }) }).toString()
  const { data, loading } = useApi<any[]>(pick.id ? `/admin/expenses?${qs}` : null, ['expenses'])
  const { data: dash } = useApi<any>(pick.id ? `/admin/dashboard?campaign_id=${pick.id}` : null, ['dashboard', 'expenses', 'commissions', 'participations'])
  const [edit, setEdit] = useState<any>(null)
  const t = dash?.totals
  return (
    <div>
      <PageHead title="Financeiro" subtitle="Receita registrada, despesas e saldo estimado. Receita real só existe depois da regularização; valores de simulação aparecem separados.">
        <select value={pick.id} onChange={e => pick.setId(e.target.value)} style={{ ...inputStyle, width: 240 }}>{pick.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <ExportBtn path={`/admin/expenses?${qs}&format=csv`} filename="despesas.csv" />
        <button style={btn('vinho')} onClick={() => setEdit({ campaign_id: pick.id, description: '', category: 'outros', amount: '', date: new Date().toISOString().slice(0, 10) })}><Plus size={15} /> Lançar despesa</button>
      </PageHead>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <Kpi label="Receita registrada (real)" value={brl(t?.revenue_real)} /><Kpi label="Receita simulada" value={brl(t?.revenue_simulated)} tone="#9A5B00" hint="não é dinheiro real" />
        <Kpi label="Despesas" value={brl(t?.expenses)} tone="#B42318" /><Kpi label="Comissões pagas" value={brl(t?.commissions_paid)} />
        <Kpi label="Saldo estimado (real)" value={brl(t?.balance_real)} tone={t?.balance_real < 0 ? '#B42318' : '#4b7d12'} /><Kpi label="Saldo com simulação" value={brl(t?.balance_simulated)} tone="#9A5B00" />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: 160 }} title="De" /><input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: 160 }} title="Até" />
      </div>
      <DataTable loading={loading} empty="Nenhuma despesa lançada."
        columns={[{ label: 'Data' }, { label: 'Descrição' }, { label: 'Categoria' }, { label: 'Valor', align: 'right' }, { label: '', align: 'right' }]}
        rows={(data || []).map(e => [date(e.date), e.description, CAT[e.category], <b>{brl(e.amount)}</b>,
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <IconBtn title="Editar" onClick={() => setEdit({ ...e, date: toInputDate(e.date) })}><Pencil size={14} /></IconBtn>
            <IconBtn title="Excluir" danger onClick={async () => { if (!(await confirmBox('Excluir despesa?', e.description, 'Excluir'))) return; try { await api(`/admin/expenses/${e.id}`, { method: 'DELETE' }); toast('success', 'Despesa excluída') } catch (err) { showError(err) } }}><Trash2 size={14} /></IconBtn>
          </span>])} />
      {edit && (
        <Modal title={edit.id ? 'Editar despesa' : 'Lançar despesa'} onClose={() => setEdit(null)}
          footer={<><button style={btn('ghost')} onClick={() => setEdit(null)}>Cancelar</button><ActionButton variant="vinho" onClick={async () => { if (edit.id) await api(`/admin/expenses/${edit.id}`, { method: 'PUT', body: edit }); else await api('/admin/expenses', { body: edit }); toast('success', 'Despesa salva'); setEdit(null) }}>Salvar</ActionButton></>}>
          <F label="Descrição"><input value={edit.description} onChange={e => setEdit({ ...edit, description: e.target.value })} style={inputStyle} /></F>
          <div className="grid3">
            <F label="Categoria"><select value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })} style={inputStyle}>{Object.entries(CAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
            <F label="Valor (R$)"><input type="number" step="0.01" min={0} value={edit.amount} onChange={e => setEdit({ ...edit, amount: e.target.value })} style={inputStyle} /></F>
            <F label="Data"><input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} style={inputStyle} /></F>
          </div>
        </Modal>
      )}
    </div>
  )
}
