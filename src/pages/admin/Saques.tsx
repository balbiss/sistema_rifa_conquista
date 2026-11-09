import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Upload as UploadIcon, XCircle } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { brl, dateTime, phone } from '../../lib/fmt'
import { ActionButton, Badge, DataTable, F, Kpi, Modal, PageHead, SimBadge, Tabs, btn, inputStyle, promptBox, showError, toast } from '../../components/ui'
import { useUpload } from '../../components/Upload'

const ST: Record<string, [string, 'amber' | 'green' | 'red']> = { solicitado: ['Aguardando pagamento', 'amber'], pago: ['Pago', 'green'], recusado: ['Recusado', 'red'] }
const PIX_LABEL: Record<string, string> = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', aleatoria: 'Aleatória' }

export default function Saques() {
  const [tab, setTab] = useState<'solicitado' | 'pago' | 'recusado' | ''>('solicitado')
  const { data, loading } = useApi<any>(`/admin/withdrawals${tab ? `?status=${tab}` : ''}`, ['withdrawals'])
  const [paying, setPaying] = useState<any>(null)
  const t = data?.totals
  const copy = (s: string) => { navigator.clipboard?.writeText(s); toast('success', 'Chave PIX copiada') }
  return (
    <div>
      <PageHead title="Saques de afiliados" subtitle="O afiliado pede o saque com saldo mínimo (padrão R$ 55); a taxa (padrão R$ 5) é descontada. Você paga manualmente pelo PIX e marca como pago com o comprovante." />
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <Kpi label="Aguardando pagamento" value={t?.open_count ?? '—'} hint={t && `${brl(t.open_net)} a pagar${t.open_net_sim ? ` · ${brl(t.open_net_sim)} simulação` : ''}`} tone="#9A5B00" />
        <Kpi label="Atrasados" value={t?.overdue ?? '—'} tone={t?.overdue ? '#B42318' : undefined} icon={<AlertTriangle size={17} />} />
        <Kpi label="Total pago (real)" value={brl(t?.paid_net)} tone="#4b7d12" />
        <Kpi label="Taxas retidas (real)" value={brl(t?.fees)} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[['solicitado', 'A pagar'], ['pago', 'Pagos'], ['recusado', 'Recusados'], ['', 'Todos']]} />
      <DataTable loading={loading} empty={tab === 'solicitado' ? 'Nenhum saque esperando pagamento. 🎉' : 'Nada por aqui.'}
        columns={[{ label: 'Afiliado' }, { label: 'Pagar (líquido)', align: 'right' }, { label: 'Bruto / taxa' }, { label: 'Chave PIX' }, { label: 'Prazo' }, { label: 'Status' }, { label: 'Ações', align: 'right' }]}
        rows={(data?.items || []).map((w: any) => [
          <span><b>{w.affiliate_name}</b> <span style={{ color: 'var(--muted)', fontSize: 12 }}>{w.affiliate_code}</span>{!!w.simulated && <> <SimBadge /></>}<div style={{ fontSize: 12, color: 'var(--muted)' }}>pedido {dateTime(w.created_at)} · {phone(w.affiliate_phone)}</div></span>,
          <b style={{ fontSize: 16 }}>{brl(w.net)}</b>,
          <span style={{ fontSize: 13 }}>{brl(w.gross)} − {brl(w.fee)}</span>,
          <span style={{ fontSize: 13 }}><b>{PIX_LABEL[w.pix_key_type] || w.pix_key_type}</b>: {w.pix_key} <button title="Copiar chave" onClick={() => copy(w.pix_key)} style={{ border: 'none', background: 'none', color: 'var(--terra)', padding: 0, verticalAlign: -2 }}><Copy size={13} /></button><div style={{ color: 'var(--muted)' }}>{w.holder_name}</div></span>,
          <span style={{ fontSize: 13, color: w.overdue ? '#B42318' : undefined, fontWeight: w.overdue ? 700 : 400 }}>{w.status === 'solicitado' ? (w.overdue ? '⚠ atrasado — ' : 'até ') : ''}{dateTime(w.deadline_at)}</span>,
          <span><Badge tone={ST[w.status][1]}>{ST[w.status][0]}</Badge>{w.status === 'pago' && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{dateTime(w.paid_at)} · {w.payment_ref}{w.proof_url && <> · <a href={w.proof_url} target="_blank">comprovante</a></>}</div>}{w.status === 'recusado' && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{w.refused_reason}</div>}</span>,
          w.status === 'solicitado' ? (
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button style={btn('vinho', { minHeight: 30, padding: '0 12px', fontSize: 12 })} onClick={() => setPaying(w)}><CheckCircle2 size={14} /> Marcar pago</button>
              <button style={btn('ghost', { minHeight: 30, padding: '0 12px', fontSize: 12 })} onClick={async () => {
                const r = await promptBox('Recusar saque', 'Motivo (o afiliado vai ver)', { required: true, confirmText: 'Recusar' })
                if (r === null) return
                try { await api(`/admin/withdrawals/${w.id}/refuse`, { body: { reason: r } }); toast('success', 'Saque recusado', 'O valor voltou para o saldo do afiliado.') } catch (e) { showError(e) }
              }}><XCircle size={14} /> Recusar</button>
            </span>
          ) : null,
        ])} />
      {paying && <PayModal w={paying} onClose={() => setPaying(null)} />}
    </div>
  )
}

function PayModal({ w, onClose }: { w: any; onClose: () => void }) {
  const [ref, setRef] = useState('')
  const [proof, setProof] = useState('')
  const { upload, busy } = useUpload()
  return (
    <Modal title={`Pagar ${brl(w.net)} para ${w.affiliate_name}`} subtitle="Faça o PIX pelo seu banco para a chave abaixo e registre aqui o comprovante." onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><ActionButton variant="vinho" onClick={async () => { await api(`/admin/withdrawals/${w.id}/pay`, { body: { payment_ref: ref, proof_url: proof } }); toast('success', 'Saque marcado como pago', 'O afiliado foi avisado.'); onClose() }}>Confirmar pagamento</ActionButton></>}>
      <div style={{ padding: 12, background: 'var(--terraSoft)', borderRadius: 6, marginBottom: 14, fontSize: 14, lineHeight: 1.6 }}>
        <div><b>Valor:</b> {brl(w.net)} <span style={{ color: 'var(--muted)' }}>(bruto {brl(w.gross)} − taxa {brl(w.fee)})</span></div>
        <div><b>Chave PIX ({PIX_LABEL[w.pix_key_type]}):</b> {w.pix_key} <button onClick={() => { navigator.clipboard?.writeText(w.pix_key); toast('success', 'Chave copiada') }} style={{ border: 'none', background: 'none', color: 'var(--terra)', padding: 0 }}><Copy size={13} /></button></div>
        <div><b>Titular:</b> {w.holder_name}</div>
        <div><b>Prazo:</b> {dateTime(w.deadline_at)}</div>
      </div>
      <F label="ID da transação PIX / código do comprovante"><input value={ref} onChange={e => setRef(e.target.value)} style={inputStyle} placeholder="ex.: E00000000202611091800abcdef" /></F>
      <F label="Comprovante (opcional)">
        <label style={{ ...btn('ghost'), cursor: 'pointer' }}><UploadIcon size={14} /> {busy ? 'Enviando…' : proof ? 'Trocar arquivo' : 'Anexar comprovante'}
          <input type="file" accept="image/*,application/pdf" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { setProof((await upload(f)).url) } catch (err) { showError(err) } }} />
        </label>
        {proof && <a href={proof} target="_blank" style={{ marginLeft: 10, fontSize: 13 }}>ver anexo</a>}
      </F>
    </Modal>
  )
}
