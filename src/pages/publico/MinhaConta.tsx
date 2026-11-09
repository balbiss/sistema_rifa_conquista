import { Navigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { session, useApi } from '../../lib/api'
import { CAMPAIGN_STATUS, PART_STATUS, dateTime, phone } from '../../lib/fmt'
import { PublicLayout } from '../../components/PublicLayout'
import { Badge, Card, Empty, Field, Loading, SimBadge, btn } from '../../components/ui'
import { SectionTitle } from './CampaignLanding'

/** Área do participante: vê só os próprios dados. */
export default function MinhaConta() {
  const u = session.user
  const { data, loading } = useApi<any[]>(u?.role === 'participante' ? '/me/participations' : null, ['participations', 'progress'])
  if (!u) return <Navigate to="/entrar?volta=/minha-conta" replace />
  if (u.role === 'admin') return <Navigate to="/admin" replace />
  if (u.role === 'afiliado') return <Navigate to="/afiliado" replace />
  return (
    <PublicLayout>
      <section className="pw" style={{ padding: '40px 20px', maxWidth: 900 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <SectionTitle kicker="Área do participante" title={`Olá, ${u.name.split(' ')[0]}`} />
          <button style={btn('ghost')} onClick={() => { session.clear(); location.href = '/' }}><LogOut size={14} /> Sair</button>
        </div>
        {loading ? <Loading /> : !data?.length ? <Card><Empty title="Nenhum cadastro encontrado" text="Seu cadastro em campanhas aparece aqui." /></Card> : data.map(p => (
          <Card key={p.id} title={p.campaign_name} right={<span style={{ display: 'flex', gap: 6 }}>{p.simulated && <SimBadge />}<Badge tone={CAMPAIGN_STATUS[p.campaign_status]?.tone}>{CAMPAIGN_STATUS[p.campaign_status]?.label}</Badge></span>} style={{ marginBottom: 14 }}>
            <Field label="Nome" value={p.name} /><Field label="WhatsApp" value={phone(p.phone)} /><Field label="E-mail" value={p.email || '—'} empty={!p.email} />
            <Field label="Situação" value={<Badge tone={PART_STATUS[p.status]?.tone}>{PART_STATUS[p.status]?.label}</Badge>} />
            <Field label="Cadastrado em" value={dateTime(p.created_at)} />
            <h4 style={{ margin: '16px 0 8px', fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Meus identificadores</h4>
            {!p.participations.length ? <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Nenhuma participação. Você será avisado quando a campanha abrir.</p> : p.participations.map((pa: any) => (
              <div key={pa.id} style={{ padding: '8px 0', borderTop: '1px dashed var(--line)' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}><Badge tone={PART_STATUS[pa.status]?.tone}>{PART_STATUS[pa.status]?.label}</Badge>{!!pa.simulated && <SimBadge />}<span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{dateTime(pa.created_at)}</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{pa.numbers.map((n: any) => <span key={n.number} style={{ padding: '3px 8px', borderRadius: 3, background: n.status === 'atribuido' ? '#8e2a46' : '#FFF1D6', color: n.status === 'atribuido' ? '#fff' : '#9A5B00', fontWeight: 700, fontSize: 13 }}>{n.number}</span>)}</div>
              </div>
            ))}
          </Card>
        ))}
      </section>
    </PublicLayout>
  )
}
