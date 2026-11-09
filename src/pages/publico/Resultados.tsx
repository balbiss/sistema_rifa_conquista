import { Trophy } from 'lucide-react'
import { useApi } from '../../lib/api'
import { date, dateTime } from '../../lib/fmt'
import { PublicLayout } from '../../components/PublicLayout'
import { Empty } from '../../components/ui'
import { SectionTitle } from './CampaignLanding'

const SIT: Record<string, string> = { contemplado: 'Identificador contemplado', numero_sem_participante: 'Identificador sem participação — aplicada regra do regulamento', fora_do_intervalo: 'Fora da faixa — aplicada regra do regulamento' }

export default function Resultados() {
  const { data, loading } = useApi<any[]>('/public/results', ['draws'])
  return (
    <PublicLayout>
      <section className="pw" style={{ padding: '48px 20px' }}>
        <SectionTitle kicker="Campanhas encerradas" title="Resultados" />
        {loading ? <div className="skel" style={{ height: 120 }} /> : !data?.length ? (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8 }}>
            <Empty icon={<Trophy size={30} />} title="Nenhuma apuração oficial até agora" text="Os resultados aparecem aqui assim que uma campanha regularizada é apurada pela Loteria Federal. Simulações e testes nunca são publicados." />
          </div>
        ) : data.map(d => (
          <div key={d.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: 20, marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: 'var(--vinho)' }}>{d.campaign_name}</h3>
            <p style={{ margin: '8px 0', fontSize: 15 }}>Loteria Federal — extração <b>{d.extraction_number}</b> de {date(d.extraction_date)} · 1º prêmio <b>{d.first_prize}</b> → identificador <b style={{ fontSize: 20, color: 'var(--vinhoBtn)' }}>{d.winning_number}</b></p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{SIT[d.winner_status]}{d.winner_name ? ` · ${d.winner_name}` : ''} · registrado em {dateTime(d.created_at)} · verificação <code>{d.hash.slice(0, 16)}</code></p>
          </div>
        ))}
      </section>
    </PublicLayout>
  )
}
