import { useApi } from '../../lib/api'
import { PublicLayout } from '../../components/PublicLayout'
import { SectionTitle } from './CampaignLanding'

export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const { data } = useApi<any>('/public/settings', ['settings'])
  return (
    <PublicLayout>
      <section className="pw" style={{ padding: '48px 20px', maxWidth: 860 }}>
        <SectionTitle kicker="Institucional" title={kind === 'terms' ? 'Termos de uso' : 'Política de privacidade'} />
        <div className="reg-text" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: 24 }}>{data?.legal?.[kind] || 'Carregando…'}</div>
      </section>
    </PublicLayout>
  )
}
