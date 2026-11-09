import { useState } from 'react'
import { Pencil, Plus, Trash2, Truck } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { useCampaignPicker } from '../../lib/hooks'
import { brl, dateTime, phone } from '../../lib/fmt'
import { ActionButton, Badge, Card, Empty, F, Field, IconBtn, Modal, PageHead, Switch, btn, confirmBox, inputStyle, promptBox, showError, toast } from '../../components/ui'
import { ImageList } from '../../components/Upload'

const DELIV: Record<string, [string, 'muted' | 'amber' | 'blue' | 'green' | 'red']> = { aguardando_apuracao: ['Aguardando apuração', 'muted'], contemplado_definido: ['Contemplado definido', 'blue'], em_entrega: ['Em entrega', 'amber'], entregue: ['Entregue', 'green'], cancelado: ['Cancelado', 'red'] }
const KIND: Record<string, string> = { principal: 'Prêmio principal', alternativo: 'Proposta alternativa', secundario: 'Prêmio secundário' }

export default function Premios() {
  const pick = useCampaignPicker()
  const { data } = useApi<any[]>(pick.id ? `/admin/prizes?campaign_id=${pick.id}` : null, ['prizes'])
  const [edit, setEdit] = useState<any>(null)
  const deliver = async (p: any, status: string) => {
    const note = await promptBox('Atualizar entrega', 'Observação (fica no histórico)')
    if (note === null) return
    try { await api(`/admin/prizes/${p.id}/delivery`, { body: { status, note } }); toast('success', 'Entrega atualizada') } catch (e) { showError(e) }
  }
  return (
    <div>
      <PageHead title="Prêmios" subtitle="Prêmio principal, propostas alternativas, entrega e contemplado. O contemplado só é definido pela apuração oficial. Prêmio em dinheiro nunca aparece no site sem validação jurídica.">
        <select value={pick.id} onChange={e => pick.setId(e.target.value)} style={{ ...inputStyle, width: 260 }}>{pick.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button style={btn('vinho')} onClick={() => setEdit({ campaign_id: pick.id, kind: 'principal', title: '', description: '', images: [], estimated_value: 0, delivery_conditions: '', is_cash: false, legal_approved: false, public: true, notes: '' })}><Plus size={15} /> Novo prêmio</button>
      </PageHead>
      {data && !data.length && <Card><Empty title="Nenhum prêmio cadastrado" /></Card>}
      <div className="grid2">
        {(data || []).map(p => (
          <Card key={p.id} title={KIND[p.kind]} right={<span style={{ display: 'flex', gap: 6 }}>
            <IconBtn title="Editar" onClick={() => setEdit({ ...p, is_cash: !!p.is_cash, legal_approved: !!p.legal_approved, public: !!p.public })}><Pencil size={14} /></IconBtn>
            <IconBtn title="Excluir" danger onClick={async () => { if (!(await confirmBox('Excluir prêmio?', p.title, 'Excluir'))) return; try { await api(`/admin/prizes/${p.id}`, { method: 'DELETE' }); toast('success', 'Prêmio excluído') } catch (e) { showError(e) } }}><Trash2 size={14} /></IconBtn>
          </span>}>
            {p.images[0] && <img src={p.images[0]} alt="" style={{ width: '100%', aspectRatio: '16/8', objectFit: 'cover', borderRadius: 4, marginBottom: 10 }} />}
            <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>{p.title}</h3>
            <p style={{ fontSize: 13.5, color: '#5b6470', lineHeight: 1.55, margin: '0 0 10px' }}>{p.description}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <Badge tone={DELIV[p.delivery_status][1]}>{DELIV[p.delivery_status][0]}</Badge>
              {p.is_cash ? <Badge tone="amber">Dinheiro</Badge> : null}
              {p.legal_approved ? <Badge tone="green">Validado juridicamente</Badge> : <Badge tone="amber">Sem validação jurídica</Badge>}
              {p.public && (!p.is_cash || p.legal_approved) ? <Badge tone="blue">Visível no site</Badge> : <Badge>Oculto no site</Badge>}
            </div>
            <Field label="Valor estimado" value={brl(p.estimated_value)} />
            <Field label="Condições de entrega" value={p.delivery_conditions || '—'} />
            <Field label="Contemplado" value={p.winner_name ? `${p.winner_name} · ${phone(p.winner_phone)} · nº ${String(p.winner_number).padStart(p.number_digits, '0')}` : 'definido pela apuração oficial'} empty={!p.winner_name} />
            {p.winner_participant_id && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {p.delivery_status === 'contemplado_definido' && <button style={btn('soft')} onClick={() => deliver(p, 'em_entrega')}><Truck size={14} /> Iniciar entrega</button>}
                {p.delivery_status === 'em_entrega' && <button style={btn('vinho')} onClick={() => deliver(p, 'entregue')}>Marcar entregue</button>}
              </div>
            )}
            {p.history.length > 0 && <details style={{ marginTop: 10, fontSize: 13 }}><summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Histórico ({p.history.length})</summary>{p.history.map((h: any) => <div key={h.id} style={{ padding: '4px 0' }}>{dateTime(h.at)} · {h.user_name || 'sistema'} · {h.action}{h.note ? ` — ${h.note}` : ''}</div>)}</details>}
          </Card>
        ))}
      </div>
      {edit && <EditPrize p={edit} onClose={() => setEdit(null)} gateOk={!!pick.current?.gate.allowed} />}
    </div>
  )
}

function EditPrize({ p, onClose, gateOk }: { p: any; onClose: () => void; gateOk: boolean }) {
  const [f, setF] = useState(p)
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  return (
    <Modal title={p.id ? 'Editar prêmio' : 'Novo prêmio'} width={600} onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><ActionButton variant="vinho" onClick={async () => { if (p.id) await api(`/admin/prizes/${p.id}`, { method: 'PUT', body: f }); else await api('/admin/prizes', { body: f }); toast('success', 'Prêmio salvo'); onClose() }}>Salvar</ActionButton></>}>
      <div className="grid2">
        <F label="Tipo"><select value={f.kind} onChange={e => set('kind', e.target.value)} style={inputStyle}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
        <F label="Valor estimado (R$)"><input type="number" step="0.01" min={0} value={f.estimated_value} onChange={e => set('estimated_value', e.target.value)} style={inputStyle} /></F>
      </div>
      <F label="Título"><input value={f.title} onChange={e => set('title', e.target.value)} style={inputStyle} /></F>
      <F label="Descrição"><textarea rows={3} value={f.description} onChange={e => set('description', e.target.value)} style={inputStyle} /></F>
      <F label="Condições de entrega"><textarea rows={2} value={f.delivery_conditions} onChange={e => set('delivery_conditions', e.target.value)} style={inputStyle} /></F>
      <F label="Imagens"><ImageList value={f.images} onChange={v => set('images', v)} /></F>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Switch on={f.is_cash} onChange={v => set('is_cash', v)} /> É prêmio em dinheiro</label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Switch on={f.legal_approved} disabled={!gateOk && !p.legal_approved} onChange={v => set('legal_approved', v)} /> Validado juridicamente e incluído no regulamento aprovado {!gateOk && <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>(liberado após a regularização)</span>}</label>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Switch on={f.public} onChange={v => set('public', v)} /> Mostrar no site (prêmio em dinheiro só aparece se validado)</label>
      </div>
      <F label="Observações internas" style={{ marginTop: 12 }}><textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} style={inputStyle} /></F>
    </Modal>
  )
}
