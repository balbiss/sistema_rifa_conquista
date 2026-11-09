import { useState } from 'react'
import { History } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { useAffiliateOptions, useCampaignPicker } from '../../lib/hooks'
import { COMMISSION_STATUS, brl, dateTime } from '../../lib/fmt'
import { ActionButton, Badge, Card, DataTable, ExportBtn, IconBtn, Kpi, Loading, LockNotice, Modal, PageHead, Pager, SimBadge, Tabs, btn, inputStyle, promptBox, showError, toast } from '../../components/ui'

export default function Comissoes() {
  const pick = useCampaignPicker()
  const affiliates = useAffiliateOptions()
  const [tab, setTab] = useState<'lista' | 'por_afiliado'>('lista')
  const [status, setStatus] = useState(''); const [aff, setAff] = useState(''); const [sim, setSim] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [hist, setHist] = useState<any>(null)
  const qs = new URLSearchParams({ ...(pick.id && { campaign_id: pick.id }), ...(status && { status }), ...(aff && { affiliate_id: aff }), ...(sim && { simulated: sim }), ...(from && { from }), ...(to && { to }), page: String(page) }).toString()
  const { data, loading } = useApi<any>(pick.id ? `/admin/commissions?${qs}` : null, ['commissions'])
  const items: any[] = data?.items || []
  const s = data?.sums || {}

  const change = async (c: any, to: string) => {
    let note = '', payment_ref = ''
    if (to === 'cancelada' || to === 'estornada') { const r = await promptBox(to === 'cancelada' ? 'Cancelar comissão' : 'Estornar comissão', 'Motivo (obrigatório)', { required: true }); if (r === null) return; note = r }
    if (to === 'paga') { const r = await promptBox('Marcar como paga', c.simulated ? 'Referência (simulação)' : 'Comprovante / referência do pagamento', { inputValue: c.simulated ? 'SIMULAÇÃO' : '' }); if (r === null) return; payment_ref = r }
    try { await api(`/admin/commissions/${c.id}/status`, { body: { status: to, note, payment_ref } }); toast('success', `Comissão ${COMMISSION_STATUS[to].label.toLowerCase()}`) } catch (e) { showError(e) }
  }
  const bulk = async (to: 'aprovada' | 'paga') => {
    const r = await api('/admin/commissions/bulk', { body: { ids: [...sel], status: to, payment_ref: to === 'paga' ? 'LOTE' : '' } })
    toast(r.errors.length ? 'warning' : 'success', `${r.ok.length} atualizada(s)`, r.errors.length ? `${r.errors.length} não puderam mudar: ${r.errors[0].message}` : undefined)
    setSel(new Set())
  }
  const toggle = (id: number) => setSel(x => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div>
      <PageHead title="Comissões" subtitle="Geradas automaticamente uma única vez por participação confirmada. Cancelar a participação cancela (ou estorna, se paga) a comissão.">
        <select value={pick.id} onChange={e => { pick.setId(e.target.value); setPage(1) }} style={{ ...inputStyle, width: 240 }}>{pick.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <ExportBtn path={`/admin/commissions?${qs}&format=csv`} filename="comissoes.csv" />
      </PageHead>
      {pick.current && !pick.current.payments_gate.allowed && <div style={{ marginBottom: 14 }}><LockNotice compact title="Pagamentos reais desativados até a regularização. Comissões de simulação podem ser movimentadas para teste." /></div>}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <Kpi label="Pendentes" value={brl(s.pendente)} tone="#9A5B00" /><Kpi label="Aprovadas (a pagar)" value={brl(s.aprovada)} tone="#1458D4" />
        <Kpi label="Pagas" value={brl(s.paga)} tone="#4b7d12" /><Kpi label="Canceladas / estornadas" value={brl((s.cancelada || 0) + (s.estornada || 0))} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[['lista', 'Movimentações'], ['por_afiliado', 'Total devido por afiliado']]} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }} style={{ ...inputStyle, width: 160 }}><option value="">Todos os status</option>{Object.entries(COMMISSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select value={aff} onChange={e => { setAff(e.target.value); setPage(1) }} style={{ ...inputStyle, width: 190 }}><option value="">Todos os afiliados</option>{affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select value={sim} onChange={e => { setSim(e.target.value); setPage(1) }} style={{ ...inputStyle, width: 160 }}><option value="">Reais e simulação</option><option value="0">Só reais</option><option value="1">Só simulação</option></select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inputStyle, width: 150 }} /><input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ ...inputStyle, width: 150 }} />
      </div>
      {tab === 'lista' ? (
        <>
          {sel.size > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'var(--terraSoft)', borderRadius: 4, marginBottom: 10, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 14 }}>{sel.size} selecionada(s)</b>
              <ActionButton variant="ghost" onClick={() => bulk('aprovada')}>Aprovar</ActionButton>
              <ActionButton variant="vinho" onClick={() => bulk('paga')}>Marcar como pagas</ActionButton>
              <button style={btn('ghost')} onClick={() => setSel(new Set())}>Limpar</button>
            </div>
          )}
          <DataTable loading={loading} empty="Nenhuma comissão."
            columns={[{ label: <input type="checkbox" aria-label="Selecionar todas" checked={items.length > 0 && items.every(i => sel.has(i.id))} onChange={e => setSel(e.target.checked ? new Set(items.map(i => i.id)) : new Set())} /> }, { label: 'Afiliado' }, { label: 'Participante' }, { label: 'Qtd × unit.' }, { label: 'Valor', align: 'right' }, { label: 'Status' }, { label: 'Gerada' }, { label: 'Ações', align: 'right' }]}
            rows={items.map(c => [
              <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label="Selecionar" />,
              <span><b>{c.affiliate_name}</b> <span style={{ fontSize: 12, color: 'var(--muted)' }}>{c.affiliate_code}</span></span>,
              c.participant_name, `${c.quantity} × ${brl(c.unit_value)}`, <b>{brl(c.amount)}</b>,
              <span style={{ display: 'inline-flex', gap: 4 }}><Badge tone={COMMISSION_STATUS[c.status].tone}>{COMMISSION_STATUS[c.status].label}</Badge>{!!c.simulated && <SimBadge />}</span>,
              <span style={{ fontSize: 13 }}>{dateTime(c.created_at)}{c.paid_at && <div style={{ color: 'var(--muted)' }}>paga {dateTime(c.paid_at)}</div>}</span>,
              <span style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {c.status === 'pendente' && <button style={btn('soft', { minHeight: 28, padding: '0 10px', fontSize: 11 })} onClick={() => change(c, 'aprovada')}>Aprovar</button>}
                {c.status === 'aprovada' && <button style={btn('vinho', { minHeight: 28, padding: '0 10px', fontSize: 11 })} onClick={() => change(c, 'paga')} disabled={!c.simulated && !pick.current?.payments_gate.allowed} title={!c.simulated && !pick.current?.payments_gate.allowed ? 'Pagamento real bloqueado' : undefined}>Pagar</button>}
                {(c.status === 'pendente' || c.status === 'aprovada') && <button style={btn('ghost', { minHeight: 28, padding: '0 10px', fontSize: 11 })} onClick={() => change(c, 'cancelada')}>Cancelar</button>}
                {c.status === 'paga' && <button style={btn('ghost', { minHeight: 28, padding: '0 10px', fontSize: 11 })} onClick={() => change(c, 'estornada')}>Estornar</button>}
                <IconBtn title="Histórico" onClick={() => setHist(c)}><History size={14} /></IconBtn>
              </span>,
            ])}
            footer={data && <Pager page={page} per={data.per} total={data.total} onPage={setPage} />} />
        </>
      ) : (
        <DataTable loading={loading} empty="Nada a mostrar."
          columns={[{ label: 'Afiliado' }, { label: 'Chave PIX' }, { label: 'Pendente', align: 'right' }, { label: 'Aprovada (devido)', align: 'right' }, { label: 'Paga', align: 'right' }]}
          rows={(data?.by_affiliate || []).map((a: any) => [<span><b>{a.name}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>{a.code}</span></span>, a.pix_key || '—', brl(a.pending), <b style={{ color: '#1458D4' }}>{brl(a.approved)}</b>, brl(a.paid)])} />
      )}
      {hist && <HistoryModal c={hist} onClose={() => setHist(null)} />}
    </div>
  )
}

function HistoryModal({ c, onClose }: { c: any; onClose: () => void }) {
  const { data } = useApi<any[]>(`/admin/commissions/${c.id}/events`, ['commissions'])
  return (
    <Modal title={`Comissão #${c.id} — ${brl(c.amount)}`} subtitle={`${c.affiliate_name} · ${c.participant_name}`} onClose={onClose}>
      {!data ? <Loading /> : <Card pad={false}>{data.map(e => (
        <div key={e.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
          <b>{e.from_status ? `${COMMISSION_STATUS[e.from_status]?.label} → ` : ''}{COMMISSION_STATUS[e.to_status]?.label}</b> · {dateTime(e.at)} · {e.user_name || 'sistema'}{e.note ? <div style={{ color: 'var(--muted)' }}>{e.note}</div> : null}
        </div>
      ))}</Card>}
      {c.payment_ref && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Referência de pagamento: {c.payment_ref}</p>}
    </Modal>
  )
}
