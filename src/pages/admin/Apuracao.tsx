import { useState } from 'react'
import { CloudDownload, FileText, Printer, ShieldAlert, ShieldCheck } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { useCampaignPicker } from '../../lib/hooks'
import { date, dateTime } from '../../lib/fmt'
import { ActionButton, Badge, Card, DataTable, F, IconBtn, LockNotice, Modal, PageHead, btn, confirmBox, inputStyle, showError, toast } from '../../components/ui'

const SIT: Record<string, [string, 'green' | 'amber' | 'muted']> = { contemplado: ['Contemplado', 'green'], numero_sem_participante: ['Sem participação', 'amber'], fora_do_intervalo: ['Fora da faixa', 'muted'] }

export default function Apuracao() {
  const pick = useCampaignPicker()
  const c = pick.current
  const { data, reload } = useApi<any>(pick.id ? `/admin/draws?campaign_id=${pick.id}` : null, ['draws'])
  const [f, setF] = useState({ extraction_number: '', extraction_date: '', first_prize: '', source_detail: '' })
  const [fetched, setFetched] = useState<any>(null)
  const [report, setReport] = useState<any>(null)
  const digits = c?.number_digits || 3
  const ruleDigits = c?.draw_rule === 'ultimos_4_primeiro_premio' ? 4 : c?.draw_rule === 'ultimos_2_primeiro_premio' ? 2 : 3
  const fp = (fetched?.first_prize || f.first_prize).replace(/\D/g, '')
  const preview = fp.length >= 5 ? String(Number(fp.slice(-ruleDigits))).padStart(digits, '0') : null

  const fetchCaixa = async () => {
    const r = await api(`/admin/draws/federal${f.extraction_number ? `?extraction=${f.extraction_number}` : ''}`)
    setFetched(r); setF(x => ({ ...x, extraction_number: r.extraction_number, extraction_date: r.extraction_date, first_prize: r.first_prize }))
    toast('success', `Extração ${r.extraction_number} consultada na CAIXA`)
  }
  const register = async (mode: 'simulacao' | 'oficial') => {
    if (mode === 'oficial' && !(await confirmBox('Registrar apuração OFICIAL?', 'Depois de gravada, a apuração não pode ser alterada nem excluída.', 'Registrar oficial', false))) return
    const body = { campaign_id: pick.id, mode, ...f, source: fetched ? 'caixa_api' : 'manual' }
    const d = await api('/admin/draws', { body })
    toast('success', mode === 'oficial' ? 'Apuração oficial registrada' : 'Simulação registrada')
    setReport({ ...d, report: JSON.parse(d.report) }); reload()
  }

  return (
    <div>
      <PageHead title="Apuração — Loteria Federal" subtitle="Consulte o resultado oficial da CAIXA (ou registre à mão com a fonte), identifique o número correspondente e gere o relatório. Toda apuração gravada é imutável e encadeada por código de verificação.">
        <select value={pick.id} onChange={e => { pick.setId(e.target.value); setFetched(null) }} style={{ ...inputStyle, width: 260 }}>{pick.campaigns.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      </PageHead>
      {c && !c.gate.allowed && <div style={{ marginBottom: 14 }}><LockNotice title="Apuração oficial bloqueada" reasons={c.gate.reasons} /></div>}
      <div className="grid-main" style={{ marginBottom: 14 }}>
        <Card title="Registrar resultado">
          <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 12px' }}>Regra: <b style={{ color: 'var(--ink)' }}>{data?.rules?.[c?.draw_rule]?.label}</b>. Extração definida no regulamento: <b style={{ color: 'var(--ink)' }}>{c?.draw_extraction || 'ainda não definida'}</b>.</p>
          <div className="grid3">
            <F label="Extração (concurso)"><input value={f.extraction_number} onChange={e => { setFetched(null); setF({ ...f, extraction_number: e.target.value.replace(/\D/g, '') }) }} style={inputStyle} placeholder="vazio = última" /></F>
            <F label="Data da extração"><input type="date" value={f.extraction_date} onChange={e => { setFetched(null); setF({ ...f, extraction_date: e.target.value }) }} style={inputStyle} /></F>
            <F label="1º prêmio (5 dígitos)"><input value={f.first_prize} onChange={e => { setFetched(null); setF({ ...f, first_prize: e.target.value.replace(/\D/g, '').slice(0, 6) }) }} style={inputStyle} placeholder="ex.: 48273" /></F>
          </div>
          {!fetched && <F label="Fonte do registro manual" hint="Obrigatória para apuração oficial manual: link da página oficial da CAIXA ou documento."><input value={f.source_detail} onChange={e => setF({ ...f, source_detail: e.target.value })} style={inputStyle} placeholder="https://loterias.caixa.gov.br/..." /></F>}
          {fetched && <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', background: 'var(--plantaoSoft)', borderRadius: 4, fontSize: 13.5, marginBottom: 12 }}><ShieldCheck size={16} color="#4b7d12" /> Origem validada: portal da CAIXA. Prêmios: {fetched.prizes.join(' · ')}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ActionButton variant="ghost" onClick={fetchCaixa}><CloudDownload size={15} /> Consultar na CAIXA</ActionButton>
            <ActionButton variant="soft" disabled={!fp} onClick={() => register('simulacao')}>Registrar simulação</ActionButton>
            <ActionButton variant="vinho" disabled={!fp || !c?.gate.allowed || c?.status !== 'encerrada'} title={!c?.gate.allowed ? 'Depende da regularização' : c?.status !== 'encerrada' ? 'Encerre a campanha antes' : undefined} onClick={() => register('oficial')}>Registrar apuração oficial</ActionButton>
          </div>
        </Card>
        <Card title="Número correspondente">
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>1º prêmio {fp || '—'}</div>
            <div style={{ fontSize: 64, fontWeight: 700, color: 'var(--vinhoBtn)', letterSpacing: '.06em', fontVariantNumeric: 'tabular-nums' }}>{preview ?? '—'}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Exemplo da regra: 48273 → 273</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: data?.chain?.ok ? '#4b7d12' : '#B42318', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            {data?.chain?.ok ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
            {data ? (data.chain.ok ? `Cadeia de verificação íntegra (${data.chain.total} registro(s))` : `Cadeia QUEBRADA no registro #${data.chain.broken_at}`) : '…'}
          </div>
        </Card>
      </div>
      <DataTable empty="Nenhuma apuração registrada."
        columns={[{ label: 'Quando' }, { label: 'Modo' }, { label: 'Extração' }, { label: '1º prêmio' }, { label: 'Identificador' }, { label: 'Situação' }, { label: 'Fonte' }, { label: 'Verificação' }, { label: '' }]}
        rows={(data?.items || []).map((d: any) => [
          <span style={{ fontSize: 13 }}>{dateTime(d.created_at)}<div style={{ color: 'var(--muted)' }}>{d.user_name}</div></span>,
          d.mode === 'oficial' ? <Badge tone="blue">Oficial</Badge> : <Badge tone="amber">Simulação</Badge>,
          <span>{d.extraction_number}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{date(d.extraction_date)}</div></span>,
          d.first_prize, <b style={{ fontSize: 16, color: 'var(--vinhoBtn)' }}>{d.winning_label}</b>,
          <span><Badge tone={SIT[d.winner_status][1]}>{SIT[d.winner_status][0]}</Badge>{d.winner_name && <div style={{ fontSize: 12.5 }}>{d.winner_name}</div>}</span>,
          d.source_verified ? <Badge tone="green">CAIXA</Badge> : <Badge>Manual</Badge>,
          <code style={{ fontSize: 11.5 }}>{d.hash.slice(0, 12)}</code>,
          <IconBtn title="Relatório" onClick={() => setReport(d)}><FileText size={14} /></IconBtn>,
        ])} />
      {report && <ReportModal d={report} onClose={() => setReport(null)} />}
    </div>
  )
}

function ReportModal({ d, onClose }: { d: any; onClose: () => void }) {
  const r = d.report
  return (
    <Modal title={r.titulo} onClose={onClose} width={640} footer={<button style={btn('vinho')} onClick={() => {
      const w = window.open('', '_blank'); if (!w) return showError(new Error('Libere pop-ups para imprimir.'))
      w.document.write(`<html><head><title>${r.titulo}</title><style>body{font-family:Arial;padding:30px;color:#313942}td{padding:6px 10px;border-bottom:1px solid #ddd}h1{color:#0B1730}</style></head><body><h1>${r.titulo}</h1><table>${rows(r, d).map(([k, v]) => `<tr><td><b>${k}</b></td><td>${String(v).replace(/</g, '&lt;')}</td></tr>`).join('')}</table></body></html>`)
      w.document.close(); w.print()
    }}><Printer size={14} /> Imprimir / PDF</button>}>
      {d.mode !== 'oficial' && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--amberSoft)', color: '#6b4100', borderRadius: 4, fontSize: 13.5, fontWeight: 700 }}>SIMULAÇÃO — sem valor oficial, não é publicada.</div>}
      {rows(r, d).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '8px 0', borderBottom: '1px dashed var(--line)', fontSize: 13.5 }}><span style={{ color: 'var(--muted)' }}>{k}</span><b style={{ textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</b></div>)}
    </Modal>
  )
}
const rows = (r: any, d: any): [string, any][] => [
  ['Campanha', r.campanha.nome], ['Identificadores', `${r.campanha.identificadores} (${r.campanha.faixa})`], ['Regra', r.regra],
  ['Extração', `${r.extracao.numero} — ${date(r.extracao.data)}`], ['1º prêmio', r.extracao.primeiro_premio], ['Identificador apurado', r.identificador_apurado],
  ['Resultado', r.resultado], ['Fonte', r.fonte], ['Progresso no momento', `${r.progresso_no_momento.percentual}% real · ${r.progresso_no_momento.atribuidos_simulados} simulados`],
  ['Registrado em', dateTime(r.gerado_em)], ['Responsável', r.responsavel], ['Código de verificação', d.hash], ['Código anterior', d.prev_hash],
]
