import { all, get } from '../db'
import { fail, type Router } from '../http'
import { requireRole } from '../auth'
import { getSetting } from '../settings'
import { maskName, maskPhone } from '../services'

// Painel do afiliado: tudo filtrado pelo afiliado do usuário logado. Nunca recebe id de afiliado
// pela URL — impossível ver dados de outro afiliado. Dados de participantes vêm mascarados.
function me(ctx: any) {
  const u = requireRole(ctx, 'afiliado')
  const a = get<any>('SELECT * FROM affiliates WHERE user_id = ?', u.id)
  if (!a) fail(403, 'sem_afiliado', 'Cadastro de afiliado não encontrado.')
  if (a.status !== 'ativo') fail(403, 'afiliado_suspenso', 'Seu cadastro de afiliado está suspenso. Fale com o administrador.')
  return a
}

export function affiliateRoutes(r: Router) {
  r.get('/api/affiliate/summary', ctx => {
    const a = me(ctx)
    const site = getSetting('platform').site_url
    const referrals = get<any>('SELECT COUNT(*) AS n FROM participants WHERE affiliate_id = ?', a.id).n
    const valid = get<any>("SELECT COUNT(*) AS n, COALESCE(SUM(quantity),0) AS q, COALESCE(SUM(simulated),0) AS sim FROM participations WHERE affiliate_id = ? AND status = 'confirmada'", a.id)
    const visits = get<any>('SELECT COUNT(*) AS n FROM referral_visits WHERE affiliate_id = ?', a.id).n
    const sums = Object.fromEntries(all<any>('SELECT status, SUM(amount) AS v FROM commissions WHERE affiliate_id = ? GROUP BY status', a.id).map(r => [r.status, r.v]))
    const simulatedAny = !!get<any>('SELECT id FROM commissions WHERE affiliate_id = ? AND simulated = 1 LIMIT 1', a.id)
    const daily = all<any>(`SELECT date(created_at) AS d, COUNT(*) AS indicacoes FROM participants WHERE affiliate_id = ? AND created_at >= date('now','-29 days') GROUP BY d`, a.id)
    const dailyPart = all<any>(`SELECT date(confirmed_at) AS d, SUM(quantity) AS validas FROM participations WHERE affiliate_id = ? AND status = 'confirmada' AND confirmed_at >= date('now','-29 days') GROUP BY d`, a.id)
    const days: any[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      days.push({ d, indicacoes: daily.find(x => x.d === d)?.indicacoes || 0, validas: dailyPart.find(x => x.d === d)?.validas || 0 })
    }
    const campaigns = all<any>("SELECT id, name, slug, status, commission_value FROM campaigns WHERE archived_at IS NULL AND status != 'arquivada' ORDER BY featured DESC, id DESC")
    return {
      affiliate: { id: a.id, name: a.name, code: a.code, status: a.status, commission_override: a.commission_override },
      link: `${site.replace(/\/$/, '')}/r/${a.code}`,
      campaigns: campaigns.map(c => ({ ...c, link: `${site.replace(/\/$/, '')}/r/${a.code}?c=${c.slug}`, commission_value: a.commission_override ?? c.commission_value })),
      referrals, visits,
      valid_participations: valid.q, confirmed_count: valid.n,
      commission: {
        accumulated: (sums.pendente || 0) + (sums.aprovada || 0) + (sums.paga || 0),
        pending: sums.pendente || 0, approved: sums.aprovada || 0, paid: sums.paga || 0,
        cancelled: (sums.cancelada || 0) + (sums.estornada || 0),
      },
      has_simulated: simulatedAny,
      chart: days,
    }
  })

  r.get('/api/affiliate/referrals', ctx => {
    const a = me(ctx)
    return all<any>(`SELECT p.id, p.name, p.phone, p.status, p.created_at, p.simulated, c.name AS campaign_name,
      (SELECT COALESCE(SUM(quantity),0) FROM participations x WHERE x.participant_id = p.id AND x.status = 'confirmada') AS valid_count
      FROM participants p JOIN campaigns c ON c.id = p.campaign_id WHERE p.affiliate_id = ? ORDER BY p.id DESC LIMIT 500`, a.id)
      .map(p => ({ ...p, name: maskName(p.name), phone: maskPhone(p.phone) }))
  })

  r.get('/api/affiliate/commissions', ctx => {
    const a = me(ctx)
    const rows = all<any>(`SELECT co.id, co.quantity, co.unit_value, co.amount, co.status, co.simulated, co.created_at, co.approved_at, co.paid_at, c.name AS campaign_name, pt.name AS participant_name
      FROM commissions co JOIN campaigns c ON c.id = co.campaign_id JOIN participations pa ON pa.id = co.participation_id JOIN participants pt ON pt.id = pa.participant_id
      WHERE co.affiliate_id = ? ORDER BY co.id DESC LIMIT 500`, a.id)
    const events = all<any>(`SELECT e.commission_id, e.from_status, e.to_status, e.note, e.at FROM commission_events e JOIN commissions co ON co.id = e.commission_id WHERE co.affiliate_id = ? ORDER BY e.id DESC LIMIT 300`, a.id)
    return { items: rows.map(r => ({ ...r, participant_name: maskName(r.participant_name) })), events }
  })
}
