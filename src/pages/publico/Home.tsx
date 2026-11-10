import { Link } from 'react-router-dom'
import { useApi } from '../../lib/api'
import { CAMPAIGN_STATUS, pct } from '../../lib/fmt'
import { PublicLayout } from '../../components/PublicLayout'
import { Badge } from '../../components/ui'
import { CampaignLanding, SectionTitle } from './CampaignLanding'

export default function Home() {
  const { data, loading } = useApi<any[]>('/public/campaigns', ['campaigns', 'progress'])
  const featured = data?.[0]
  const others = (data || []).slice(1)
  return (
    <PublicLayout>
      {loading && <div className="pw" style={{ padding: '80px 20px' }}><div className="skel" style={{ height: 380 }} /></div>}
      {!loading && !featured && <div className="pw" style={{ padding: '100px 20px', textAlign: 'center' }}><h2>Nenhuma campanha publicada no momento.</h2></div>}
      {featured && <CampaignLanding slug={featured.slug} />}
      {others.length > 0 && (
        <section className="pw" style={{ padding: '56px 20px 10px' }}>
          <SectionTitle kicker="Mais campanhas" title="Outras campanhas" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {others.map(c => (
              <Link key={c.id} to={`/c/${c.slug}`} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: 18, color: 'var(--ink)' }}>
                <Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{CAMPAIGN_STATUS[c.status]?.label}</Badge>
                <h3 style={{ margin: '10px 0 4px', color: 'var(--vinho)' }}>{c.name}</h3>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--muted)' }}>{c.subtitle}</p>
                <div style={{ marginTop: 12, height: 8, background: '#f3e3e7', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${c.progress.percent}%`, height: '100%', background: 'var(--vinhoBtn)' }} /></div>
                <div style={{ fontSize: 13, marginTop: 6, fontWeight: 700 }}>{pct(c.progress.percent)}</div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </PublicLayout>
  )
}
