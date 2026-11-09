import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, FilePlus2, Save, Trash2, CheckCircle2, XCircle, Upload as UploadIcon } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { CAMPAIGN_STATUS, LEGAL_STATUS, brl, date, dateTime, toInputDate } from '../../lib/fmt'
import { ActionButton, Badge, Card, DataTable, ErrorBox, F, IconBtn, Kpi, Loading, LockNotice, Modal, PageHead, Switch, Tabs, btn, confirmBox, inputStyle, promptBox, showError, toast } from '../../components/ui'
import { ImageList, useUpload } from '../../components/Upload'

type Tab = 'dados' | 'premio' | 'regulamento' | 'status' | 'regularizacao' | 'historico'
const RULES: Record<string, string> = { ultimos_3_primeiro_premio: '3 últimos dígitos do 1º prêmio', ultimos_4_primeiro_premio: '4 últimos dígitos do 1º prêmio', ultimos_2_primeiro_premio: '2 últimos dígitos do 1º prêmio' }
const DOC_KIND: Record<string, string> = { autorizacao: 'Autorização / registro', parecer_juridico: 'Parecer jurídico', regulamento_aprovado: 'Regulamento aprovado', contrato: 'Contrato', nota_fiscal: 'Nota fiscal', outro: 'Outro' }

export default function CampanhaEditor() {
  const { id } = useParams()
  const { data: c, error, reload } = useApi<any>(`/admin/campaigns/${id}`, ['campaigns', 'progress', 'prizes'])
  const { data: cfg } = useApi<any>('/admin/settings', ['settings'])
  const legalReq = !!cfg?.legal?.require_authorization
  const [tab, setTab] = useState<Tab>('dados')
  const [f, setF] = useState<any>(null)
  const loadedId = useRef<number | null>(null)
  useEffect(() => { if (c && (loadedId.current !== c.id || !f)) { loadedId.current = c.id; setF({ ...c, starts_at: toInputDate(c.starts_at), ends_at: toInputDate(c.ends_at), draw_date: toInputDate(c.draw_date) }) } }, [c])
  if (error) return <ErrorBox error={error} onRetry={reload} />
  if (!c || !f) return <Loading />
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  const save = async (keys: string[]) => {
    const body: any = {}
    for (const k of keys) body[k] = f[k]
    const r = await api(`/admin/campaigns/${c.id}`, { method: 'PUT', body })
    toast('success', 'Alterações salvas')
    setF((x: any) => ({ ...x, ...r, starts_at: toInputDate(r.starts_at), ends_at: toInputDate(r.ends_at), draw_date: toInputDate(r.draw_date) }))
    reload()
  }
  const locked = c.status === 'apurada'
  const changeStatus = async (to: string) => {
    const note = await promptBox(`Mudar para "${CAMPAIGN_STATUS[to].label}"`, 'Motivo / observação (vai para o histórico)', { confirmText: 'Mudar status' })
    if (note === null) return
    try { await api(`/admin/campaigns/${c.id}/status`, { body: { status: to, note } }); toast('success', 'Status alterado'); reload() } catch (e) { showError(e) }
  }

  return (
    <div>
      <Link to="/admin/campanhas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}><ArrowLeft size={14} /> Campanhas</Link>
      <PageHead title={c.name} subtitle={<><Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{CAMPAIGN_STATUS[c.status]?.label}</Badge> <span style={{ marginLeft: 6 }}>/c/{c.slug}</span></>}>
        <a href={`/c/${c.slug}`} target="_blank" style={btn('ghost')}><Eye size={14} /> Ver no site</a>
        <a href={`/c/${c.slug}?preview=simulacao`} target="_blank" style={btn('soft')}><Eye size={14} /> Prévia com simulação</a>
        <a href={`/c/${c.slug}?checkout=teste`} target="_blank" style={btn('vinho')} title="Abre a compra por PIX em modo de teste (exige PIX em modo simulado)">Testar compra PIX</a>
      </PageHead>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <Kpi label="Progresso real" value={`${c.progress.percent}%`} hint={`${c.progress.real_assigned} de ${c.total_numbers}`} />
        <Kpi label="Com simulação" value={`${c.progress.percent_simulated}%`} hint={`${c.progress.simulated_assigned} simulados`} tone="#9A5B00" />
        <Kpi label="Reservados" value={c.progress.counts.reservado} />
        <Kpi label="Bloqueados / cancelados" value={`${c.progress.counts.bloqueado} / ${c.progress.counts.cancelado}`} />
      </div>
      {!c.gate.allowed && <div style={{ marginBottom: 14 }}><LockNotice reasons={c.gate.reasons} /></div>}

      <Tabs value={tab} onChange={setTab} items={[['dados', 'Dados'], ['premio', 'Prêmio e imagens'], ['regulamento', 'Regulamento'], ['status', 'Datas, status e apuração'], ['regularizacao', legalReq ? 'Regularização e documentos' : 'Documentos'], ['historico', 'Histórico']]} />

      {tab === 'dados' && (
        <Card>
          <div className="grid2">
            <F label="Nome"><input value={f.name} onChange={e => set('name', e.target.value)} style={inputStyle} disabled={locked} /></F>
            <F label="Endereço no site" hint="Só letras minúsculas, números e hífen."><input value={f.slug} onChange={e => set('slug', e.target.value)} style={inputStyle} disabled={locked} /></F>
          </div>
          <F label="Subtítulo"><input value={f.subtitle} onChange={e => set('subtitle', e.target.value)} style={inputStyle} /></F>
          <F label="Descrição"><textarea value={f.description} onChange={e => set('description', e.target.value)} rows={4} style={inputStyle} /></F>
          <div className="grid3">
            <F label="Qtd. de identificadores" hint="Só pode mudar sem nenhum identificador reservado/atribuído."><input type="number" min={1} value={f.total_numbers} onChange={e => set('total_numbers', Number(e.target.value))} style={inputStyle} disabled={locked} /></F>
            <F label="Número inicial"><input type="number" min={0} value={f.number_start} onChange={e => set('number_start', Number(e.target.value))} style={inputStyle} disabled={locked} /></F>
            <F label="Dígitos"><input type="number" min={1} max={6} value={f.number_digits} onChange={e => set('number_digits', Number(e.target.value))} style={inputStyle} disabled={locked} /></F>
          </div>
          <div className="grid2">
            <F label="Valor de referência (R$)" hint="Só exibido ao público depois da regularização."><input type="number" step="0.01" min={0} value={f.ref_price} onChange={e => set('ref_price', e.target.value)} style={inputStyle} disabled={locked} /></F>
            <F label="Comissão por participação válida (R$)" hint="Vale para novas confirmações. Comissões já geradas não mudam."><input type="number" step="0.01" min={0} value={f.commission_value} onChange={e => set('commission_value', e.target.value)} style={inputStyle} disabled={locked} /></F>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 14 }}><Switch on={!!f.featured} onChange={v => set('featured', v ? 1 : 0)} label="Destaque" /> Campanha em destaque no início do site</label>
          <ActionButton variant="vinho" onClick={() => save(['name', 'slug', 'subtitle', 'description', 'total_numbers', 'number_start', 'number_digits', 'ref_price', 'commission_value', 'featured'])}><Save size={14} /> Salvar dados</ActionButton>
        </Card>
      )}

      {tab === 'premio' && (
        <div className="grid2">
          <Card title="Prêmio da campanha">
            <F label="Resumo do prêmio"><input value={f.prize_summary} onChange={e => set('prize_summary', e.target.value)} style={inputStyle} disabled={locked} /></F>
            <F label="Condições da premiação"><textarea rows={6} value={f.prize_conditions} onChange={e => set('prize_conditions', e.target.value)} style={inputStyle} disabled={locked} /></F>
            <ActionButton variant="vinho" disabled={locked} onClick={() => save(['prize_summary', 'prize_conditions'])}><Save size={14} /> Salvar</ActionButton>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 14 }}>Prêmios detalhados (valor estimado, entrega, contemplado, alternativas) ficam em <Link to="/admin/premios">Prêmios</Link>. Cadastrados: {c.prizes.map((p: any) => p.title).join(' · ') || 'nenhum'}.</p>
          </Card>
          <Card title="Imagens">
            <ImageList value={f.images || []} onChange={v => set('images', v)} />
            <div style={{ marginTop: 12 }}><ActionButton variant="vinho" onClick={() => save(['images'])}><Save size={14} /> Salvar imagens</ActionButton></div>
          </Card>
        </div>
      )}

      {tab === 'regulamento' && (
        <Card title="Regulamento" right={<span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{f.regulation.length.toLocaleString('pt-BR')} caracteres</span>}>
          <textarea value={f.regulation} onChange={e => set('regulation', e.target.value)} rows={22} style={{ ...inputStyle, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, lineHeight: 1.6 }} disabled={locked} />
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <ActionButton variant="vinho" disabled={locked} onClick={() => save(['regulation'])}><Save size={14} /> Salvar regulamento</ActionButton>
            <span style={{ fontSize: 12.5, color: 'var(--muted)', alignSelf: 'center' }}>Cada alteração fica registrada no histórico. O regulamento aprovado também deve ser anexado em Regularização.</span>
          </div>
        </Card>
      )}

      {tab === 'status' && (
        <div className="grid2">
          <Card title="Datas">
            <div className="grid2">
              <F label="Início"><input type="date" value={f.starts_at} onChange={e => set('starts_at', e.target.value)} style={inputStyle} disabled={locked} /></F>
              <F label="Encerramento"><input type="date" value={f.ends_at} onChange={e => set('ends_at', e.target.value)} style={inputStyle} disabled={locked} /></F>
            </div>
            <F label="Data prevista da apuração"><input type="date" value={f.draw_date} onChange={e => set('draw_date', e.target.value)} style={inputStyle} disabled={locked} /></F>
            <F label="Regra de apuração (Loteria Federal)"><select value={f.draw_rule} onChange={e => set('draw_rule', e.target.value)} style={inputStyle} disabled={locked}>{Object.entries(RULES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
            <F label="Extração de referência (nº do concurso)" hint="Definida no regulamento aprovado. A apuração oficial só aceita resultado desta extração."><input value={f.draw_extraction} onChange={e => set('draw_extraction', e.target.value.replace(/\D/g, ''))} style={inputStyle} disabled={locked} placeholder="ex.: 6012" /></F>
            <ActionButton variant="vinho" disabled={locked} onClick={() => save(['starts_at', 'ends_at', 'draw_date', 'draw_rule', 'draw_extraction'])}><Save size={14} /> Salvar</ActionButton>
          </Card>
          <Card title="Status da campanha">
            <p style={{ fontSize: 14, margin: '0 0 12px' }}>Atual: <Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{CAMPAIGN_STATUS[c.status]?.label}</Badge></p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(legalReq ? ['rascunho', 'aguardando_autorizacao', 'autorizada', 'ativa', 'pausada', 'encerrada'] as const : ['rascunho', 'ativa', 'pausada', 'encerrada'] as const).map(s => {
                const needsGate = s === 'autorizada' || s === 'ativa'
                const disabled = c.status === s || locked || c.status === 'arquivada' || (needsGate && !c.gate.allowed)
                return (
                  <button key={s} disabled={disabled} onClick={() => changeStatus(s)} title={needsGate && !c.gate.allowed ? 'Depende da regularização' : undefined}
                    style={{ ...btn(c.status === s ? 'soft' : 'ghost'), justifyContent: 'space-between' }}>
                    <span>{CAMPAIGN_STATUS[s].label}</span>{needsGate && !c.gate.allowed && <span style={{ fontSize: 11 }}>🔒 regularização</span>}
                  </button>
                )
              })}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 12 }}>"Ativa" libera as vendas no site (com o PIX ligado em modo real). "Apurada" só é definido pela apuração oficial.</p>
          </Card>
        </div>
      )}

      {tab === 'regularizacao' && <Regularizacao c={c} f={f} set={set} save={save} reload={reload} legalReq={legalReq} />}

      {tab === 'historico' && (
        <DataTable columns={[{ label: 'Quando' }, { label: 'Quem' }, { label: 'Ação' }, { label: 'Detalhes' }]} empty="Sem histórico."
          rows={c.history.map((h: any) => [dateTime(h.at), h.user_name || 'sistema', h.action, <code style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{Object.entries(h.changes).map(([k, v]: any) => `${k}: ${typeof v === 'object' && v ? `${v.de ?? '—'} → ${v.para ?? '—'}` : v}`).join('\n')}</code>])} />
      )}
    </div>
  )
}

function Regularizacao({ c, f, set, save, reload, legalReq }: any) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="grid2">
      {legalReq && <Card title="Situação legal">
        <F label="Situação"><select value={f.legal_status} onChange={e => set('legal_status', e.target.value)} style={inputStyle}>{Object.entries(LEGAL_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
        <F label="Modalidade legal definida" hint="Ex.: promoção comercial autorizada (Lei 5.768/71), outra modalidade prevista em lei — conforme parecer jurídico."><input value={f.legal_modality} onChange={e => set('legal_modality', e.target.value)} style={inputStyle} /></F>
        <F label="Nº da autorização / registro"><input value={f.authorization_number} onChange={e => set('authorization_number', e.target.value)} style={inputStyle} /></F>
        <ActionButton variant="vinho" onClick={() => save(['legal_status', 'legal_modality', 'authorization_number'])}><Save size={14} /> Salvar</ActionButton>
        <h4 style={{ margin: '18px 0 8px', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Checklist para liberar operações reais</h4>
        {[
          ['Modalidade autorizada', c.legal_status === 'autorizada'],
          ['Número de autorização informado', !!c.authorization_number],
          ['Documento de autorização anexado', c.documents.some((d: any) => d.kind === 'autorizacao')],
          ['Trava geral liberada (Configurações › Regularização)', !c.gate.reasons.some((r: string) => r.includes('trava geral'))],
          ['Meio de pagamento configurado e homologado', c.payments_gate.allowed],
        ].map(([l, ok]: any) => (
          <div key={l} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, padding: '5px 0' }}>{ok ? <CheckCircle2 size={16} color="#4b7d12" /> : <XCircle size={16} color="#B42318" />}{l}</div>
        ))}
      </Card>}
      <Card title={legalReq ? 'Documentos de autorização' : 'Documentos da campanha'} right={<button style={btn('soft', { minHeight: 30 })} onClick={() => setAdding(true)}><FilePlus2 size={14} /> Anexar</button>}>
        {!c.documents.length && <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Nenhum documento anexado.</p>}
        {c.documents.map((d: any) => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px dashed var(--line)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>{d.file_url ? <a href={d.file_url} target="_blank">{d.title}</a> : d.title}</b>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{DOC_KIND[d.kind]}{d.number ? ` · nº ${d.number}` : ''}{d.issued_at ? ` · ${date(d.issued_at)}` : ''}</div>
            </div>
            <IconBtn title="Remover" danger onClick={async () => { if (!(await confirmBox('Remover documento?', d.title, 'Remover'))) return; try { await api(`/admin/campaigns/${c.id}/documents/${d.id}`, { method: 'DELETE' }); reload() } catch (e) { showError(e) } }}><Trash2 size={14} /></IconBtn>
          </div>
        ))}
      </Card>
      {adding && <DocModal campaignId={c.id} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload() }} />}
    </div>
  )
}

function DocModal({ campaignId, onClose, onSaved }: { campaignId: number; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState({ kind: 'autorizacao', title: '', number: '', issued_at: '', file_url: '' })
  const { upload, busy } = useUpload()
  const ref = useRef<HTMLInputElement>(null)
  return (
    <Modal title="Anexar documento" onClose={onClose} footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><ActionButton variant="vinho" onClick={async () => { await api(`/admin/campaigns/${campaignId}/documents`, { body: d }); toast('success', 'Documento anexado'); onSaved() }}>Salvar</ActionButton></>}>
      <F label="Tipo"><select value={d.kind} onChange={e => setD({ ...d, kind: e.target.value })} style={inputStyle}>{Object.entries(DOC_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
      <F label="Título"><input value={d.title} onChange={e => setD({ ...d, title: e.target.value })} style={inputStyle} /></F>
      <div className="grid2"><F label="Número"><input value={d.number} onChange={e => setD({ ...d, number: e.target.value })} style={inputStyle} /></F><F label="Data de emissão"><input type="date" value={d.issued_at} onChange={e => setD({ ...d, issued_at: e.target.value })} style={inputStyle} /></F></div>
      <F label="Arquivo (PDF ou imagem)">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button type="button" style={btn('ghost')} disabled={busy} onClick={() => ref.current?.click()}><UploadIcon size={14} /> {busy ? 'Enviando…' : 'Escolher arquivo'}</button>
          <span style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.file_url || 'nenhum'}</span>
        </div>
        <input ref={ref} type="file" accept="application/pdf,image/*" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const r = await upload(f); setD(x => ({ ...x, file_url: r.url, title: x.title || r.name })) } catch (err) { showError(err) } }} />
      </F>
    </Modal>
  )
}
