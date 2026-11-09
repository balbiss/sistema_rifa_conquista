import { useMemo, useState } from 'react'
import { api, useApi } from '../../lib/api'
import { useCampaignPicker } from '../../lib/hooks'
import { NUMBER_STATUS, dateTime, phone } from '../../lib/fmt'
import { ActionButton, Badge, Card, Field, Loading, Modal, PageHead, SimBadge, btn, inputStyle, promptBox, showError, toast } from '../../components/ui'

export default function Identificadores() {
  const pick = useCampaignPicker()
  const { data, loading } = useApi<any>(pick.id ? `/admin/campaigns/${pick.id}/numbers` : null, ['numbers', 'participations', 'progress'])
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const items: any[] = data?.items || []
  const counts = useMemo(() => items.reduce((a, [, s]) => ({ ...a, [s]: (a[s] || 0) + 1 }), {} as Record<string, number>), [items])
  const pad = (n: number) => String(n).padStart(data?.digits || 3, '0')
  const shown = items.filter(([n, s]) => (!filter || s === filter) && (!search || pad(n).includes(search)))
  return (
    <div>
      <PageHead title="Identificadores" subtitle="Grade com todos os identificadores da campanha. Clique em um para ver o histórico e as ações. Duplicações e atribuições conflitantes são bloqueadas pelo sistema.">
        <select value={pick.id} onChange={e => pick.setId(e.target.value)} style={{ ...inputStyle, width: 260 }}>{pick.campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input value={search} onChange={e => setSearch(e.target.value.replace(/\D/g, ''))} placeholder="Buscar número" style={{ ...inputStyle, width: 150 }} inputMode="numeric" />
      </PageHead>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setFilter('')} style={btn(filter ? 'ghost' : 'soft', { minHeight: 30 })}>Todos · {items.length}</button>
        {Object.entries(NUMBER_STATUS).map(([k, s]) => (
          <button key={k} onClick={() => setFilter(filter === k ? '' : k)} style={btn(filter === k ? 'soft' : 'ghost', { minHeight: 30, gap: 8 })}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: s.bg, border: `1px solid ${s.border}` }} />{s.label} · {counts[k] || 0}
          </button>
        ))}
        <span style={{ fontSize: 12.5, color: 'var(--muted)', alignSelf: 'center' }}>Borda tracejada = simulação</span>
      </div>
      <Card>
        {loading ? <Loading /> : (
          <div className="num-grid">
            {shown.map(([n, s, , sim]) => {
              const st = NUMBER_STATUS[s]
              return <button key={n} className="num-cell" title={`${pad(n)} — ${st.label}${sim ? ' (simulação)' : ''}`} onClick={() => setOpen(n)}
                style={{ background: st.bg, color: st.fg, borderColor: st.border, borderStyle: sim && (s === 'atribuido' || s === 'reservado') ? 'dashed' : 'solid', borderWidth: sim ? 2 : 1 }}>{pad(n)}</button>
            })}
            {!shown.length && <p style={{ color: 'var(--muted)', gridColumn: '1/-1' }}>Nenhum identificador com este filtro.</p>}
          </div>
        )}
      </Card>
      {open !== null && <NumberModal campaignId={pick.id} n={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function NumberModal({ campaignId, n, onClose }: { campaignId: string; n: number; onClose: () => void }) {
  const { data: d, reload } = useApi<any>(`/admin/campaigns/${campaignId}/numbers/${n}`, ['numbers'])
  const act = async (status: string, label: string) => {
    const note = await promptBox(label, 'Motivo (fica no histórico)', { required: true })
    if (note === null) return
    try { await api(`/admin/campaigns/${campaignId}/numbers/${n}/status`, { body: { status, note } }); toast('success', 'Identificador atualizado'); reload() } catch (e) { showError(e) }
  }
  return (
    <Modal title={d ? `Identificador ${d.label}` : 'Identificador'} onClose={onClose} width={560}>
      {!d ? <Loading /> : (
        <>
          <Field label="Status" value={<Badge tone={d.status === 'atribuido' ? 'blue' : d.status === 'reservado' ? 'amber' : 'muted'}>{NUMBER_STATUS[d.status].label}</Badge>} />
          {d.participant_name && <><Field label="Participante" value={<>{d.participant_name} {!!d.simulated && <SimBadge />}</>} /><Field label="Telefone" value={phone(d.participant_phone)} /><Field label="Participação" value={`#${d.participation_id} · ${d.participation_status}`} />{d.affiliate_name && <Field label="Afiliado" value={d.affiliate_name} />}</>}
          <Field label="Atualizado em" value={dateTime(d.updated_at)} />
          <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
            {d.status === 'disponivel' && <><ActionButton variant="ghost" onClick={() => act('bloqueado', 'Bloquear identificador')}>Bloquear</ActionButton><ActionButton variant="ghost" onClick={() => act('cancelado', 'Cancelar identificador')}>Cancelar (inutilizar)</ActionButton></>}
            {(d.status === 'bloqueado' || d.status === 'cancelado') && <ActionButton variant="vinho" onClick={() => act('disponivel', 'Liberar identificador')}>Liberar</ActionButton>}
            {(d.status === 'reservado' || d.status === 'atribuido') && <span style={{ fontSize: 13, color: 'var(--muted)' }}>Ligado a uma participação: para liberar, cancele a participação em Participantes.</span>}
          </div>
          <h4 style={{ margin: '8px 0', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Histórico</h4>
          {d.history.map((h: any) => (
            <div key={h.id} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
              <b>{h.from_status ? `${NUMBER_STATUS[h.from_status]?.label} → ` : ''}{NUMBER_STATUS[h.to_status]?.label}</b> · {dateTime(h.at)} · {h.user_name || 'sistema'}{h.note ? ` — ${h.note}` : ''}
            </div>
          ))}
          {!d.history.length && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sem movimentações.</p>}
        </>
      )}
    </Modal>
  )
}
