import { useState } from 'react'
import { CheckCircle2, Pencil, Plus, Ticket, Trash2, XCircle } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { useAffiliateOptions, useCampaignPicker, useDebounced } from '../../lib/hooks'
import { PART_STATUS, dateTime, phone } from '../../lib/fmt'
import { ActionButton, Badge, DataTable, ExportBtn, F, Field, IconBtn, Loading, LockNotice, Modal, PageHead, Pager, SimBadge, Switch, Tabs, btn, confirmBox, inputStyle, promptBox, showError, toast } from '../../components/ui'

export default function Participantes() {
  const pick = useCampaignPicker()
  const affiliates = useAffiliateOptions()
  const [tab, setTab] = useState<'participantes' | 'participacoes'>('participantes')
  const [q, setQ] = useState(''); const dq = useDebounced(q)
  const [status, setStatus] = useState(''); const [aff, setAff] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const qs = new URLSearchParams({ ...(pick.id && { campaign_id: pick.id }), ...(dq && { q: dq }), ...(status && { status }), ...(aff && { affiliate_id: aff }), ...(from && { from }), ...(to && { to }), page: String(page) }).toString()
  const list = useApi<any>(tab === 'participantes' && pick.id ? `/admin/participants?${qs}` : null, ['participants', 'participations'])
  const parts = useApi<any>(tab === 'participacoes' && pick.id ? `/admin/participations?${qs}` : null, ['participations'])
  const [edit, setEdit] = useState<any>(null)
  const [detail, setDetail] = useState<number | null>(null)
  const [newPart, setNewPart] = useState<any>(null)
  const reset = () => setPage(1)

  return (
    <div>
      <PageHead title="Participantes" subtitle="Cadastros, identificadores atribuídos e afiliado responsável. Enquanto a campanha não estiver regularizada, participações só podem ser registradas em modo simulação.">
        <select value={pick.id} onChange={e => { pick.setId(e.target.value); reset() }} style={{ ...inputStyle, width: 240 }}>{pick.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <ExportBtn path={`/admin/participants?${qs}&format=csv`} filename="participantes.csv" />
        <button style={btn('vinho')} onClick={() => setEdit({ campaign_id: pick.id, name: '', phone: '', email: '', document: '', affiliate_id: '', status: 'interessado', simulated: true })}><Plus size={15} /> Novo participante</button>
      </PageHead>
      {pick.current && !pick.current.gate.allowed && <div style={{ marginBottom: 14 }}><LockNotice compact title="Campanha não regularizada: participações apenas em simulação." /></div>}
      <Tabs value={tab} onChange={v => { setTab(v); reset() }} items={[['participantes', 'Participantes'], ['participacoes', 'Participações']]} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {tab === 'participantes' && <input value={q} onChange={e => { setQ(e.target.value); reset() }} placeholder="Buscar nome, telefone, e-mail ou nº" style={{ ...inputStyle, width: 280 }} />}
        <select value={status} onChange={e => { setStatus(e.target.value); reset() }} style={{ ...inputStyle, width: 170 }}>
          <option value="">Todos os status</option>
          {(tab === 'participantes' ? ['interessado', 'ativo', 'inativo', 'bloqueado'] : ['pendente', 'confirmada', 'cancelada']).map(s => <option key={s} value={s}>{PART_STATUS[s].label}</option>)}
        </select>
        <select value={aff} onChange={e => { setAff(e.target.value); reset() }} style={{ ...inputStyle, width: 190 }}>
          <option value="">Todos os afiliados</option>{tab === 'participantes' && <option value="0">Sem afiliado</option>}
          {affiliates.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" value={from} onChange={e => { setFrom(e.target.value); reset() }} style={{ ...inputStyle, width: 150 }} title="De" />
        <input type="date" value={to} onChange={e => { setTo(e.target.value); reset() }} style={{ ...inputStyle, width: 150 }} title="Até" />
      </div>

      {tab === 'participantes' ? (
        <DataTable loading={list.loading} empty="Nenhum participante encontrado."
          columns={[{ label: 'Nome' }, { label: 'Contato' }, { label: 'Identificadores' }, { label: 'Afiliado' }, { label: 'Status' }, { label: 'Cadastro' }, { label: '', align: 'right' }]}
          onRowClick={i => setDetail(list.data.items[i].id)}
          rows={(list.data?.items || []).map((p: any) => [
            <div><b>{p.name}</b> {!!p.simulated && <SimBadge />}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.origin === 'indicacao' ? 'via indicação' : p.origin === 'painel' ? 'cadastro no painel' : 'site'}</div></div>,
            <div style={{ fontSize: 13 }}>{phone(p.phone)}<div style={{ color: 'var(--muted)' }}>{p.email}</div></div>,
            p.numbers.length ? <span style={{ fontSize: 12.5, fontWeight: 700 }} title={p.numbers.join(', ')}>{p.numbers.slice(0, 6).join(' · ')}{p.numbers.length > 6 ? ` +${p.numbers.length - 6}` : ''}</span> : <span style={{ color: 'var(--muted)' }}>—</span>,
            p.affiliate_name ? <span>{p.affiliate_name} <span style={{ color: 'var(--muted)', fontSize: 12 }}>{p.affiliate_code}</span></span> : <span style={{ color: 'var(--muted)' }}>—</span>,
            <Badge tone={PART_STATUS[p.status]?.tone}>{PART_STATUS[p.status]?.label}</Badge>,
            <span style={{ fontSize: 13 }}>{dateTime(p.created_at)}</span>,
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <IconBtn title="Nova participação" onClick={() => setNewPart(p)}><Ticket size={14} /></IconBtn>
              <IconBtn title="Editar" onClick={() => setEdit({ ...p, affiliate_id: p.affiliate_id || '' })}><Pencil size={14} /></IconBtn>
              <IconBtn title="Excluir" danger onClick={async () => { if (!(await confirmBox('Excluir participante?', `${p.name} será excluído. Só é possível sem histórico de participação.`, 'Excluir'))) return; try { await api(`/admin/participants/${p.id}`, { method: 'DELETE' }); toast('success', 'Participante excluído'); list.reload() } catch (e) { showError(e) } }}><Trash2 size={14} /></IconBtn>
            </span>,
          ])}
          footer={list.data && <Pager page={page} per={list.data.per} total={list.data.total} onPage={setPage} />} />
      ) : (
        <DataTable loading={parts.loading} empty="Nenhuma participação."
          columns={[{ label: '#' }, { label: 'Participante' }, { label: 'Identificadores' }, { label: 'Afiliado' }, { label: 'Status' }, { label: 'Data' }, { label: '', align: 'right' }]}
          rows={(parts.data?.items || []).map((p: any) => [
            <span>#{p.id} {!!p.simulated && <SimBadge />}</span>, p.participant_name,
            <span style={{ fontSize: 12.5, fontWeight: 700 }} title={p.numbers.join(', ')}>{p.quantity} · {p.numbers.slice(0, 5).join(' ')}{p.numbers.length > 5 ? '…' : ''}</span>,
            p.affiliate_name || '—', <Badge tone={PART_STATUS[p.status]?.tone}>{PART_STATUS[p.status]?.label}</Badge>, <span style={{ fontSize: 13 }}>{dateTime(p.created_at)}</span>,
            <PartActions p={p} />,
          ])}
          footer={parts.data && <Pager page={page} per={parts.data.per} total={parts.data.total} onPage={setPage} />} />
      )}
      {edit && <EditParticipant p={edit} affiliates={affiliates} onClose={() => setEdit(null)} />}
      {detail && <ParticipantDetail id={detail} onClose={() => setDetail(null)} onNew={p => { setDetail(null); setNewPart(p) }} />}
      {newPart && <NewParticipation participant={newPart} campaign={pick.current} onClose={() => setNewPart(null)} />}
    </div>
  )
}

export function PartActions({ p }: { p: any }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {p.status === 'pendente' && <IconBtn title="Confirmar participação" onClick={async () => { try { await api(`/admin/participations/${p.id}/confirm`, { body: {} }); toast('success', 'Participação confirmada', 'Progresso e comissão atualizados.') } catch (e) { showError(e) } }}><CheckCircle2 size={15} color="#4b7d12" /></IconBtn>}
      {p.status !== 'cancelada' && <IconBtn title="Cancelar participação" danger onClick={async () => { const r = await promptBox('Cancelar participação', 'Motivo do cancelamento', { required: true, confirmText: 'Cancelar participação' }); if (r === null) return; try { await api(`/admin/participations/${p.id}/cancel`, { body: { reason: r } }); toast('success', 'Participação cancelada', 'Identificadores liberados e progresso recalculado.') } catch (e) { showError(e) } }}><XCircle size={15} /></IconBtn>}
    </span>
  )
}

function EditParticipant({ p, affiliates, onClose }: { p: any; affiliates: any[]; onClose: () => void }) {
  const [f, setF] = useState(p)
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  return (
    <Modal title={p.id ? 'Editar participante' : 'Novo participante'} onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><ActionButton variant="vinho" onClick={async () => {
        if (p.id) await api(`/admin/participants/${p.id}`, { method: 'PUT', body: f }); else await api('/admin/participants', { body: f })
        toast('success', 'Participante salvo'); onClose()
      }}>Salvar</ActionButton></>}>
      <F label="Nome"><input value={f.name} onChange={e => set('name', e.target.value)} style={inputStyle} /></F>
      <div className="grid2"><F label="Telefone (WhatsApp)"><input value={f.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} /></F><F label="E-mail"><input value={f.email} onChange={e => set('email', e.target.value)} style={inputStyle} /></F></div>
      <div className="grid2">
        <F label="Documento (quando necessário)"><input value={f.document} onChange={e => set('document', e.target.value)} style={inputStyle} /></F>
        <F label="Status"><select value={f.status} onChange={e => set('status', e.target.value)} style={inputStyle}>{['interessado', 'ativo', 'inativo', 'bloqueado'].map(s => <option key={s} value={s}>{PART_STATUS[s].label}</option>)}</select></F>
      </div>
      <F label="Afiliado responsável pela indicação" hint={p.id ? 'Travado depois que existe participação (a comissão já foi gerada para o afiliado original).' : undefined}>
        <select value={f.affiliate_id} onChange={e => set('affiliate_id', e.target.value)} style={inputStyle}><option value="">Sem afiliado</option>{affiliates.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}</select>
      </F>
      {!p.id && <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><Switch on={f.simulated} onChange={v => set('simulated', v)} /> Registro de simulação (teste)</label>}
    </Modal>
  )
}

function ParticipantDetail({ id, onClose, onNew }: { id: number; onClose: () => void; onNew: (p: any) => void }) {
  const { data: p } = useApi<any>(`/admin/participants/${id}`, ['participations', 'participants'])
  return (
    <Modal title={p?.name || 'Participante'} onClose={onClose} width={620} footer={p && <button style={btn('vinho')} onClick={() => onNew(p)}><Ticket size={14} /> Nova participação</button>}>
      {!p ? <Loading /> : (
        <>
          <Field label="Campanha" value={p.campaign_name} /><Field label="Telefone" value={phone(p.phone)} /><Field label="E-mail" value={p.email || '—'} />
          <Field label="Documento" value={p.document || '—'} /><Field label="Afiliado" value={p.affiliate_name || '—'} /><Field label="Status" value={<Badge tone={PART_STATUS[p.status]?.tone}>{PART_STATUS[p.status]?.label}</Badge>} />
          <Field label="Cadastro" value={dateTime(p.created_at)} /><Field label="Consentimento LGPD" value={p.consent_at ? dateTime(p.consent_at) : 'não registrado'} />
          <h4 style={{ margin: '16px 0 8px', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Participações</h4>
          {!p.participations.length && <p style={{ fontSize: 14, color: 'var(--muted)' }}>Nenhuma participação.</p>}
          {p.participations.map((pa: any) => (
            <div key={pa.id} style={{ padding: '10px 0', borderTop: '1px dashed var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <b>#{pa.id}</b><Badge tone={PART_STATUS[pa.status]?.tone}>{PART_STATUS[pa.status]?.label}</Badge>{!!pa.simulated && <SimBadge />}
                <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{dateTime(pa.created_at)}{pa.cancel_reason ? ` · motivo: ${pa.cancel_reason}` : ''}</span>
                <span style={{ marginLeft: 'auto' }}><PartActions p={pa} /></span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>{pa.numbers.map((n: number) => <span key={n} style={{ padding: '2px 7px', borderRadius: 3, background: pa.status === 'confirmada' ? '#1458D4' : '#f0f2f4', color: pa.status === 'confirmada' ? '#fff' : '#313942', fontSize: 12.5, fontWeight: 700 }}>{String(n).padStart(pa.number_digits, '0')}</span>)}</div>
            </div>
          ))}
        </>
      )}
    </Modal>
  )
}

function NewParticipation({ participant, campaign, onClose }: { participant: any; campaign: any; onClose: () => void }) {
  const regular = !!campaign?.payments_gate?.allowed
  const [f, setF] = useState({ mode: 'quantidade', quantity: 1, numbers: '', confirm: true, simulated: true })
  return (
    <Modal title="Nova participação" subtitle={`${participant.name} — ${campaign?.name || ''}`} onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><ActionButton variant="vinho" onClick={async () => {
        const r = await api('/admin/participations', { body: { campaign_id: participant.campaign_id, participant_id: participant.id, ...(f.mode === 'quantidade' ? { quantity: f.quantity } : { numbers: f.numbers }), confirm: f.confirm, simulated: f.simulated } })
        toast('success', f.confirm ? 'Participação confirmada' : 'Identificadores reservados', `Identificadores: ${r.numbers.map((n: number) => String(n).padStart(campaign.number_digits, '0')).join(', ')}`)
        onClose()
      }}>Registrar</ActionButton></>}>
      {!regular && <div style={{ marginBottom: 12 }}><LockNotice compact title="Modo simulação obrigatório: a campanha não está regularizada." /></div>}
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, marginBottom: 12 }}><Switch on={f.simulated} disabled={!regular} onChange={v => setF({ ...f, simulated: v })} /> Simulação (não conta no progresso público nem no financeiro real)</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button style={btn(f.mode === 'quantidade' ? 'soft' : 'ghost')} onClick={() => setF({ ...f, mode: 'quantidade' })}>Sortear disponíveis</button>
        <button style={btn(f.mode === 'escolher' ? 'soft' : 'ghost')} onClick={() => setF({ ...f, mode: 'escolher' })}>Escolher números</button>
      </div>
      {f.mode === 'quantidade'
        ? <F label="Quantidade de identificadores"><input type="number" min={1} max={500} value={f.quantity} onChange={e => setF({ ...f, quantity: Number(e.target.value) })} style={inputStyle} /></F>
        : <F label="Identificadores" hint="Separe por vírgula ou espaço. Ex.: 007, 273, 512"><input value={f.numbers} onChange={e => setF({ ...f, numbers: e.target.value })} style={inputStyle} /></F>}
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><Switch on={f.confirm} onChange={v => setF({ ...f, confirm: v })} /> Confirmar agora (senão fica reservada/pendente)</label>
    </Modal>
  )
}
