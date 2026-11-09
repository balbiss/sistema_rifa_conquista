import { useParams } from 'react-router-dom'
import { PublicLayout } from '../../components/PublicLayout'
import { CampaignLanding } from './CampaignLanding'

export default function Campanha() {
  const { slug } = useParams()
  return <PublicLayout><CampaignLanding slug={slug!} /></PublicLayout>
}
