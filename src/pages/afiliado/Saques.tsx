import { useEffect, useState } from 'react'
import { Banknote, Clock, KeyRound, Lock, Wallet } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { brl, dateTime } from '../../lib/fmt'
import { ActionButton, Badge, Card, DataTable, ErrorBox, Kpi, PageHead, SimBadge, confirmBox, toast } from '../../components/ui'

const ST: Record<string, [string, 'amber' | 'green' | 'red']> = { solicitado: ['Aguardando pagamento', 'amber'], pago: ['Pago', 'green'], recusado: ['Recusado', 'red'] }
const TYPES: [string, string, string][] = [['cpf', 'CPF', '000.000.000-00'], ['telefone', 'Telefone', '(91) 98888-7777'], ['email', 'E-mail', 'voce@email.com'], ['cnpj', 'CNPJ', '00.000.000/0000-00'], ['aleatoria', 'Chave aleatória', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx']]

export default function Saques() {
  const { data: w, error, reload } = useApi<any>('/affiliate/wallet', ['withdrawals', 'commissions'])
  const [pix, setPix] = useState({ type: 'cpf', key: '', holder: '' })
  useEffect(() => { if (w?.pix) setPix({ type: w.pix.type || 'cpf', key: w.pix.key || '', holder: w.pix.holder || '' }) }, [w?.pix?.key, w?.pix?.type])
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const deadlineTxt = w ? `Pedidos até ${w.cutoff_hour}h caem até ${w.deadline_hour}h do mesmo dia; depois disso, até ${w.deadline_hour}h do dia seguinte.` : ''
  const request = async (simulated: boolean) => {
    const gross = simulated ? w.available_simulated : w.available
    if (!(await confirmBox('Pedir saque?', `Saldo ${brl(gross)} − taxa ${brl(w.fee)} = você recebe ${brl(gross - w.fee)} na chave PIX ${w.pix.key}. Prazo: até ${dateTime(w.next_deadline)}.`, 'Pedir saque', false))) return
    await api('/affiliate/withdrawals', { body: { simulated } })
    toast('success', 'Saque solicitado!', `Pagamento até ${dateTime(w.next_deadline)}.`)
    reload()
  }
  const sk = (v: any) => (w ? v : <span className="skel" style={{ display: 'inline-block', width: 80, height: 22 }} />)
  return (
    <div>
      <PageHead title="Saques" subtitle={`Saldo mínimo para saque: ${w ? brl(w.min_balance) : '…'} · taxa por saque: ${w ? brl(w.fee) : '…'}. ${deadlineTxt}`} />
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <Kpi label="Disponível para saque" value={sk(brl(w?.available))} tone="#4b7d12" icon={<Wallet size={17} />} hint="comissões aprovadas" />
        <Kpi label="Em aprovação" value={sk(brl(w?.pending_approval))} tone="#9A5B00" icon={<Clock size={17} />} hint="ainda não liberadas" />
        {w?.available_simulated > 0 && <Kpi label="Saldo de simulação" value={brl(w.available_simulated)} hint="não é dinheiro real" tone="#9A5B00" />}
      </div>

      <div className="grid2" style={{ marginBottom: 14 }}>
        <Card title="Pedir saque">
          {w?.open ? (
            <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>
              <Badge tone="amber">Saque em andamento</Badge>{!!w.open.simulated && <> <SimBadge /></>}
              <div style={{ marginTop: 8 }}>Você vai receber <b>{brl(w.open.net)}</b> (saldo {brl(w.open.gross)} − taxa {brl(w.open.fee)}) até <b>{dateTime(w.open.deadline_at)}</b>.</div>
            </div>
          ) : w && (
            <>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, marginBottom: 12 }}>
                {w.available >= w.min_balance
                  ? <>Você pode sacar <b>{brl(w.available)}</b> e recebe <b>{brl(w.available - w.fee)}</b> (taxa {brl(w.fee)}).</>
                  : <>Faltam <b>{brl(Math.max(0, w.min_balance - w.available))}</b> para atingir o mínimo de {brl(w.min_balance)}.</>}
                {!w.pix.key && <div style={{ color: '#B42318', marginTop: 6 }}>Sem chave PIX no cadastro: peça ao organizador para cadastrar.</div>}
              </div>
              <div style={{ height: 8, background: 'var(--card-2)', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}><div style={{ width: `${Math.min(100, (w.available / w.min_balance) * 100)}%`, height: '100%', background: w.available >= w.min_balance ? '#16a34a' : '#FF8A24' }} /></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ActionButton variant="vinho" disabled={!w.can_request} onClick={() => request(false)}><Banknote size={15} /> Pedir saque</ActionButton>
                {w.allow_simulated && w.available_simulated > 0 && <ActionButton variant="ghost" disabled={!w.can_request_simulated} onClick={() => request(true)}>Pedir saque de teste (simulação)</ActionButton>}
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '10px 0 0' }}>{deadlineTxt}</p>
            </>
          )}
        </Card>
        <Card title="Minha chave PIX" right={<KeyRound size={16} color="var(--muted)" />}>
          {pix.key ? (
            <div style={{ fontSize: 14.5, lineHeight: 1.7 }}>
              <div><span style={{ color: 'var(--muted)' }}>Tipo:</span> <b>{TYPES.find(t => t[0] === pix.type)?.[1] || pix.type}</b></div>
              <div><span style={{ color: 'var(--muted)' }}>Chave:</span> <b>{pix.key}</b></div>
              <div><span style={{ color: 'var(--muted)' }}>Titular:</span> <b>{pix.holder}</b></div>
            </div>
          ) : <p style={{ margin: 0, fontSize: 14.5, color: '#B42318' }}>Nenhuma chave PIX no seu cadastro. Peça ao organizador para cadastrar.</p>}
          <p style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--muted)', margin: '12px 0 0' }}><Lock size={14} style={{ flex: 'none', marginTop: 1 }} /> Por segurança, os saques vão sempre para a chave do seu cadastro. Para alterar, fale com o organizador.</p>
        </Card>
      </div>

      <DataTable empty="Nenhum saque ainda."
        columns={[{ label: 'Pedido' }, { label: 'Saldo', align: 'right' }, { label: 'Taxa', align: 'right' }, { label: 'Recebe', align: 'right' }, { label: 'Status' }, { label: 'Prazo / pago em' }]}
        rows={(w?.history || []).map((h: any) => [
          <span style={{ fontSize: 13 }}>{dateTime(h.created_at)} {!!h.simulated && <SimBadge />}</span>, brl(h.gross), brl(h.fee), <b>{brl(h.net)}</b>,
          <span><Badge tone={ST[h.status][1]}>{ST[h.status][0]}</Badge>{h.refused_reason && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{h.refused_reason}</div>}</span>,
          <span style={{ fontSize: 13 }}>{h.status === 'pago' ? dateTime(h.paid_at) : h.status === 'solicitado' ? `até ${dateTime(h.deadline_at)}` : '—'}</span>,
        ])} />
    </div>
  )
}
