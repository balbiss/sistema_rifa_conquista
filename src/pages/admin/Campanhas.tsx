import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Copy, ExternalLink, Pencil, Plus } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { CAMPAIGN_STATUS, brl, date, int } from '../../lib/fmt'
import { ActionButton, Badge, DataTable, F, IconBtn, Modal, PageHead, Tabs, btn, confirmBox, inputStyle, showError, toast } from '../../components/ui'

export default function Campanhas() {
  const nav = useNavigate()
  const [tab, setTab] = useState<'ativas' | 'arquivadas'>('ativas')
  const { data, loading, reload } = useApi<any[]>(`/admin/campaigns${tab === 'arquivadas' ? '?archived=1' : ''}`, ['campaigns', 'progress'])
  const [creating, setCreating] = useState(false)
  const rows = data || []
  return (
    <div>
      <PageHead title="Campanhas" subtitle="Crie, edite, duplique e arquive campanhas. Toda campanha nova começa em Rascunho — Aguardando Regularização.">
        <button style={btn('vinho')} onClick={() => setCreating(true)}><Plus size={15} /> Nova campanha</button>
      </PageHead>
      <Tabs value={tab} onChange={setTab} items={[['ativas', 'Campanhas'], ['arquivadas', 'Arquivadas']]} />
      <DataTable loading={loading} empty="Nenhuma campanha aqui."
        columns={[{ label: 'Campanha' }, { label: 'Status' }, { label: 'Identificadores' }, { label: 'Progresso' }, { label: 'Ref. / comissão' }, { label: 'Regularização' }, { label: '', align: 'right' }]}
        onRowClick={i => nav(`/admin/campanhas/${rows[i].id}`)}
        rows={rows.map(c => [
          <div><b>{c.name}</b><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{c.subtitle || '/' + c.slug}</div></div>,
          <Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{CAMPAIGN_STATUS[c.status]?.label}</Badge>,
          int(c.total_numbers),
          <div style={{ minWidth: 120 }}><div style={{ height: 6, background: '#e6ecf6', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${c.progress.percent_simulated}%`, height: '100%', background: c.progress.percent ? '#1458D4' : '#e7bd66' }} /></div><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>real {c.progress.percent}% · sim. {c.progress.percent_simulated}%</span></div>,
          <span style={{ fontSize: 13 }}>{brl(c.ref_price)} / {brl(c.commission_value)}</span>,
          c.gate.allowed ? <Badge tone="green">Regularizada</Badge> : <Badge tone="amber" title={c.gate.reasons.join('\n')}>Pendente ({c.gate.reasons.length})</Badge>,
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <IconBtn title="Editar" onClick={() => nav(`/admin/campanhas/${c.id}`)}><Pencil size={14} /></IconBtn>
            <IconBtn title="Ver no site" onClick={() => window.open(`/c/${c.slug}`, '_blank')}><ExternalLink size={14} /></IconBtn>
            <IconBtn title="Duplicar" onClick={async () => { try { const n = await api(`/admin/campaigns/${c.id}/duplicate`, { body: {} }); toast('success', 'Campanha duplicada'); nav(`/admin/campanhas/${n.id}`) } catch (e) { showError(e) } }}><Copy size={14} /></IconBtn>
            {tab === 'ativas'
              ? <IconBtn title="Arquivar" danger onClick={async () => { if (!(await confirmBox('Arquivar campanha?', `"${c.name}" sai do site e da lista principal. Dá para restaurar depois.`, 'Arquivar'))) return; try { await api(`/admin/campaigns/${c.id}/archive`, { body: {} }); toast('success', 'Campanha arquivada'); reload() } catch (e) { showError(e) } }}><Archive size={14} /></IconBtn>
              : <IconBtn title="Restaurar" onClick={async () => { try { await api(`/admin/campaigns/${c.id}/archive`, { body: { restore: true } }); toast('success', 'Campanha restaurada'); reload() } catch (e) { showError(e) } }}><ArchiveRestore size={14} /></IconBtn>}
          </span>,
        ])} />
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>Criada em ordem decrescente · {rows.length} campanha(s){rows[0] ? ` · última atualização ${date(rows[0].updated_at)}` : ''}</p>
      {creating && <NewCampaign onClose={() => setCreating(false)} onCreated={id => nav(`/admin/campanhas/${id}`)} />}
    </div>
  )
}

function NewCampaign({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const [f, setF] = useState({ name: '', subtitle: '', total_numbers: 1000, number_start: 0, number_digits: 3, ref_price: 10, commission_value: 2.5 })
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }))
  return (
    <Modal title="Nova campanha" subtitle="Ela nasce como Rascunho — Aguardando Regularização. Os demais dados (prêmio, regulamento, documentos) você completa na tela da campanha." onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><ActionButton variant="vinho" onClick={async () => { const c = await api('/admin/campaigns', { body: f }); toast('success', 'Campanha criada'); onCreated(c.id) }}>Criar campanha</ActionButton></>}>
      <F label="Nome"><input value={f.name} onChange={e => set('name', e.target.value)} style={inputStyle} autoFocus /></F>
      <F label="Subtítulo"><input value={f.subtitle} onChange={e => set('subtitle', e.target.value)} style={inputStyle} /></F>
      <div className="grid3" data-grid>
        <F label="Qtd. de identificadores"><input type="number" min={1} value={f.total_numbers} onChange={e => set('total_numbers', Number(e.target.value))} style={inputStyle} /></F>
        <F label="Número inicial"><input type="number" min={0} value={f.number_start} onChange={e => set('number_start', Number(e.target.value))} style={inputStyle} /></F>
        <F label="Dígitos"><input type="number" min={1} max={6} value={f.number_digits} onChange={e => set('number_digits', Number(e.target.value))} style={inputStyle} /></F>
      </div>
      <div className="grid2" data-grid>
        <F label="Valor de referência (R$)"><input type="number" step="0.01" min={0} value={f.ref_price} onChange={e => set('ref_price', e.target.value)} style={inputStyle} /></F>
        <F label="Comissão por participação (R$)"><input type="number" step="0.01" min={0} value={f.commission_value} onChange={e => set('commission_value', e.target.value)} style={inputStyle} /></F>
      </div>
    </Modal>
  )
}
