import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { api, useApi } from '../../lib/api'
import { brl, dateTime, phone } from '../../lib/fmt'
import { Badge, DataTable, IconBtn, Kpi, LockNotice, PageHead, SimBadge, Tabs, btn, showError, toast } from '../../components/ui'

const ST: Record<string, [string, 'amber' | 'green' | 'red' | 'muted' | 'blue']> = {
  pendente: ['Aguardando PIX', 'amber'], pago: ['Pago', 'green'], expirado: ['Expirado', 'muted'], cancelado: ['Cancelado', 'muted'],
  divergente: ['Valor divergente', 'red'], pago_tarde: ['Pago após vencer', 'red'],
}

export default function Pagamentos() {
  const [tab, setTab] = useState('')
  const { data, loading } = useApi<any>(`/admin/payments${tab ? `?status=${tab}` : ''}`, ['payments', 'participations'])
  const t = data?.totals
  return (
    <div>
      <PageHead title="Pagamentos PIX" subtitle="Compras feitas pelo site via SyncPay. A confirmação é automática: o sistema consulta a SyncPay antes de liberar os números.">
        <Link to="/admin/configuracoes?aba=pagamentos" style={btn('ghost')}>Configurar SyncPay</Link>
      </PageHead>
      {data && !data.ready && <div style={{ marginBottom: 14 }}><LockNotice compact title="PIX desligado. Ligue em Configurações › Pagamentos (PIX)." /></div>}
      {data?.ready && data.mode === 'simulado' && <div style={{ marginBottom: 14 }}><LockNotice compact title="PIX em MODO SIMULADO (teste): nenhuma cobrança real é feita." /></div>}
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <Kpi label="Recebido (real)" value={brl(t?.paid)} tone="#4b7d12" /><Kpi label="Recebido em testes" value={brl(t?.paid_sim)} tone="#9A5B00" />
        <Kpi label="Aguardando pagamento" value={t?.pending ?? '—'} /><Kpi label="Precisam de atenção" value={t?.problems ?? '—'} tone={t?.problems ? '#B42318' : undefined} hint="pago após vencer / valor divergente" />
      </div>
      <Tabs value={tab} onChange={setTab} items={[['', 'Todos'], ['pendente', 'Aguardando'], ['pago', 'Pagos'], ['expirado', 'Expirados'], ['pago_tarde', 'Pago após vencer'], ['divergente', 'Divergentes']]} />
      <DataTable loading={loading} empty="Nenhuma compra ainda."
        columns={[{ label: '#' }, { label: 'Comprador' }, { label: 'Campanha' }, { label: 'Qtd', align: 'right' }, { label: 'Valor', align: 'right' }, { label: 'Status' }, { label: 'Criado' }, { label: '', align: 'right' }]}
        rows={(data?.items || []).map((p: any) => [
          <span>#{p.id} {!!p.simulated && <SimBadge />}</span>,
          <span><b>{p.participant_name}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{phone(p.participant_phone)}</div></span>,
          p.campaign_name, p.quantity, <b>{brl(p.amount_cents / 100)}</b>,
          <span><Badge tone={ST[p.status][1]}>{ST[p.status][0]}</Badge>{p.paid_at && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{dateTime(p.paid_at)}</div>}</span>,
          <span style={{ fontSize: 13 }}>{dateTime(p.created_at)}{p.status === 'pendente' && <div style={{ color: 'var(--muted)' }}>vence {dateTime(p.expires_at)}</div>}</span>,
          p.status === 'pendente' ? <IconBtn title="Conferir agora na SyncPay" onClick={async () => { try { const r = await api(`/admin/payments/${p.id}/check`, { body: {} }); toast('info', r?.status === 'pago' ? 'Pagamento confirmado' : 'Ainda não pago') } catch (e) { showError(e) } }}><RefreshCw size={14} /></IconBtn> : null,
        ])} />
    </div>
  )
}
