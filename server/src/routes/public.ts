import { all, get, parseJSON, run } from '../db'
import { fail, phone, str, email, json, type Router } from '../http'
import { hashPassword, issueToken, login, publicUser, requireUser, validatePassword } from '../auth'
import { publicSettings, getSetting, paymentsConfig } from '../settings'
import { DRAW_RULES, audit, fmtNumber, getCampaign, legalGate, maskName, notify, progress } from '../services'
import { emit, subscribe } from '../events'

const PUBLIC_STATUSES = ['rascunho', 'aguardando_autorizacao', 'autorizada', 'ativa', 'pausada', 'encerrada', 'apurada']

/** Visão pública da campanha: só o percentual no destaque; nada financeiro interno. */
function publicCampaign(c: any, full = false) {
  const p = progress(c.id)!
  const gate = legalGate(c)
  const prizes = all<any>('SELECT id, kind, title, description, images, delivery_conditions, estimated_value, is_cash, legal_approved FROM prizes WHERE campaign_id = ? AND public = 1 ORDER BY id', c.id)
    // prêmio em dinheiro só aparece com validação jurídica + trava liberada
    .filter(pr => !pr.is_cash || (pr.legal_approved && gate.allowed))
    .map(pr => ({ ...pr, images: parseJSON(pr.images, []), estimated_value: full ? pr.estimated_value : undefined }))
  const out: any = {
    id: c.id, slug: c.slug, name: c.name, subtitle: c.subtitle, description: c.description, images: c.images,
    prize_summary: c.prize_summary, prize_conditions: c.prize_conditions, status: c.status,
    open_for_participation: gate.allowed && c.status === 'ativa' && paymentsConfig().ready,
    payment_test_mode: paymentsConfig().mode === 'simulado',
    max_per_order: Number(paymentsConfig().max_per_order) || 100,
    regularized: gate.allowed,
    starts_at: c.starts_at, ends_at: c.ends_at, draw_date: c.draw_date,
    progress: { percent: p.percent, remaining_percent: p.remaining_percent },
    prizes,
  }
  if (full) {
    // transparência / regulamento: informações obrigatórias (elementos sorteáveis e chances)
    out.regulation = c.regulation
    out.transparency = {
      total_numbers: c.total_numbers,
      range: `${fmtNumber(c.number_start, c.number_digits)} a ${fmtNumber(c.number_start + c.total_numbers - 1, c.number_digits)}`,
      chance_per_number: `1 em ${c.total_numbers.toLocaleString('pt-BR')}`,
      assigned_valid: p.real_assigned,
      available: c.total_numbers - p.real_assigned,
      draw_method: 'Loteria Federal',
      draw_rule: DRAW_RULES[c.draw_rule]?.label,
      draw_extraction: c.draw_extraction || 'a definir no regulamento aprovado',
      legal_status: c.legal_status,
      legal_required: !!getSetting('legal').require_authorization,
      legal_modality: c.legal_modality,
      authorization_number: gate.allowed ? c.authorization_number : '',
      ref_price: gate.allowed ? c.ref_price : null,
    }
    out.draws = all<any>("SELECT id, extraction_number, extraction_date, first_prize, winning_number, winner_status, hash, created_at FROM draws WHERE campaign_id = ? AND mode = 'oficial'", c.id)
  }
  return out
}

export function publicRoutes(r: Router) {
  r.get('/api/public/settings', () => publicSettings())

  r.get('/api/public/campaigns', () => {
    const rows = all<any>(`SELECT * FROM campaigns WHERE archived_at IS NULL AND status IN (${PUBLIC_STATUSES.map(() => '?').join(',')}) ORDER BY featured DESC, id DESC`, ...PUBLIC_STATUSES)
    return rows.map(c => publicCampaign({ ...c, images: parseJSON(c.images, []) }))
  })

  r.get('/api/public/campaigns/:slug', ({ params }) => {
    const c = getCampaign(params.slug)
    if (c.archived_at || !PUBLIC_STATUSES.includes(c.status)) fail(404, 'campanha_nao_encontrada', 'Campanha não encontrada.')
    return publicCampaign(c, true)
  })

  /** Resultados de campanhas encerradas/apuradas (somente apurações oficiais). */
  r.get('/api/public/results', () => {
    return all<any>(`SELECT d.id, d.extraction_number, d.extraction_date, d.first_prize, d.winning_number, d.winner_status, d.hash, d.created_at, c.name AS campaign_name, c.slug, c.number_digits, pt.name AS winner_name
      FROM draws d JOIN campaigns c ON c.id = d.campaign_id LEFT JOIN participants pt ON pt.id = d.winner_participant_id WHERE d.mode = 'oficial' ORDER BY d.id DESC`)
      .map(d => ({ ...d, winning_number: fmtNumber(d.winning_number, d.number_digits), winner_name: d.winner_name ? maskName(d.winner_name) : null }))
  })

  /** Visita pelo link do afiliado (/r/CODIGO): registra origem. */
  r.post('/api/public/ref/:code', async ({ params, body }) => {
    const a = get<any>("SELECT id, code, name, status FROM affiliates WHERE code = ?", params.code)
    if (!a || a.status !== 'ativo') fail(404, 'codigo_invalido', 'Link de indicação inválido.')
    const b = await body()
    const visitor = str(b.visitor, 'visitante', { max: 64 })
    const recent = visitor && get<any>("SELECT id FROM referral_visits WHERE affiliate_id = ? AND visitor = ? AND at > datetime('now', '-1 day')", a.id, visitor)
    if (!recent) run('INSERT INTO referral_visits (affiliate_id, campaign_id, visitor) VALUES (?, ?, ?)', a.id, b.campaign_id || null, visitor)
    return { code: a.code, name: maskName(a.name) }
  })

  /**
   * Cadastro de interesse (lista de espera). Enquanto a campanha não está regularizada, não há
   * venda: só registra a pessoa (e a origem da indicação) para avisar quando abrir.
   */
  r.post('/api/public/campaigns/:slug/interest', async ({ params, body, ip }) => {
    const c = getCampaign(params.slug)
    if (['encerrada', 'apurada', 'arquivada'].includes(c.status)) fail(409, 'campanha_fechada', 'Esta campanha está encerrada.')
    const b = await body()
    const name = str(b.name, 'Nome', { required: true, min: 3, max: 120 })
    const ph = phone(b.phone)
    const em = email(b.email, 'E-mail', !!b.password)
    if (!b.consent) fail(422, 'consentimento', 'É preciso aceitar os Termos de Uso e a Política de Privacidade.')
    let affiliateId: number | null = null
    if (b.ref) {
      const a = get<any>("SELECT id FROM affiliates WHERE code = ? AND status = 'ativo'", String(b.ref))
      affiliateId = a?.id ?? null
    }
    const exists = get<any>('SELECT id FROM participants WHERE campaign_id = ? AND phone = ?', c.id, ph)
    if (exists) fail(409, 'ja_cadastrado', 'Este telefone já está cadastrado nesta campanha.')
    let userId: number | null = null
    if (b.password) {
      validatePassword(String(b.password))
      if (get('SELECT id FROM users WHERE email = ?', em)) fail(409, 'email_em_uso', 'Já existe uma conta com este e-mail. Faça login.')
      userId = Number(run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'participante')", name, em, await hashPassword(String(b.password))).lastInsertRowid)
    }
    const pid = Number(run("INSERT INTO participants (campaign_id, user_id, affiliate_id, name, phone, email, origin, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))",
      c.id, userId, affiliateId, name, ph, em, affiliateId ? 'indicacao' : 'site').lastInsertRowid)
    audit(null, 'participante.cadastro_interesse', 'participant', pid, { campaign_id: c.id, affiliate_id: affiliateId }, ip)
    if (affiliateId && getSetting('notifications').notify_affiliate_new_referral) {
      const a = get<any>('SELECT user_id FROM affiliates WHERE id = ?', affiliateId)
      notify(a?.user_id, 'Nova indicação', `${maskName(name)} se cadastrou pelo seu link.`, '/afiliado/indicacoes')
    }
    if (getSetting('notifications').notify_admin_new_participant) {
      for (const adm of all<any>("SELECT id FROM users WHERE role = 'admin' AND active = 1")) notify(adm.id, 'Novo cadastro', `${name} — ${c.name}`, '/admin/participantes')
    }
    emit(['participants', 'dashboard', 'referrals'], { campaignId: c.id, affiliateIds: [affiliateId] })
    const user = userId ? get<any>('SELECT * FROM users WHERE id = ?', userId) : null
    return json({ ok: true, participant_id: pid, token: user ? issueToken(user) : null, user: user ? publicUser(user) : null }, 201)
  })

  // --- autenticação ---
  r.post('/api/auth/login', async ({ body, ip }) => {
    const b = await body()
    const u = await login(String(b.email || ''), String(b.password || ''))
    audit(u, 'auth.login', 'user', u.id, {}, ip)
    return { token: issueToken(u), user: publicUser(u) }
  })
  r.get('/api/auth/me', ctx => publicUser(requireUser(ctx)))
  r.post('/api/auth/logout-all', ctx => {
    const u = requireUser(ctx)
    run('UPDATE users SET token_version = token_version + 1 WHERE id = ?', u.id)
    audit(u, 'auth.sair_de_todos', 'user', u.id)
    return { ok: true }
  })
  r.post('/api/auth/password', async ctx => {
    const u = requireUser(ctx)
    const b = await ctx.body()
    const full = get<any>('SELECT * FROM users WHERE id = ?', u.id)
    if (!(await Bun.password.verify(String(b.current || ''), full.password_hash))) fail(422, 'senha_atual', 'Senha atual incorreta.', { field: 'Senha atual' })
    validatePassword(String(b.password || ''))
    run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', await hashPassword(String(b.password)), u.id)
    audit(u, 'auth.trocar_senha', 'user', u.id)
    const fresh = get<any>('SELECT * FROM users WHERE id = ?', u.id)
    return { token: issueToken(fresh) }
  })

  // notificações do usuário logado (qualquer perfil)
  r.get('/api/notifications', ctx => {
    const u = requireUser(ctx)
    const rows = all<any>('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40', u.id)
    return { items: rows, unread: rows.filter(n => !n.read_at).length }
  })
  r.post('/api/notifications/read-all', ctx => {
    const u = requireUser(ctx)
    run("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", u.id)
    return { ok: true }
  })

  // área do participante: só os próprios dados
  r.get('/api/me/participations', ctx => {
    const u = requireUser(ctx)
    if (u.role !== 'participante') fail(403, 'sem_permissao', 'Área exclusiva do participante.')
    const parts = all<any>('SELECT p.*, c.name AS campaign_name, c.slug, c.number_digits, c.status AS campaign_status FROM participants p JOIN campaigns c ON c.id = p.campaign_id WHERE p.user_id = ?', u.id)
    return parts.map(p => ({
      id: p.id, campaign_name: p.campaign_name, slug: p.slug, campaign_status: p.campaign_status, status: p.status, created_at: p.created_at, simulated: !!p.simulated,
      name: p.name, phone: p.phone, email: p.email,
      participations: all<any>('SELECT id, quantity, status, simulated, confirmed_at, created_at FROM participations WHERE participant_id = ? ORDER BY id DESC', p.id)
        .map(pa => ({ ...pa, numbers: all<any>("SELECT number, status FROM numbers WHERE participation_id = ? ORDER BY number", pa.id).map(n => ({ number: fmtNumber(n.number, p.number_digits), status: n.status })) })),
    }))
  })

  // tempo real
  r.get('/api/events', ctx => {
    if (!ctx.user) return subscribe('public')
    if (ctx.user.role === 'admin') return subscribe('admin', { userId: ctx.user.id })
    if (ctx.user.role === 'afiliado') {
      const a = get<any>('SELECT id FROM affiliates WHERE user_id = ?', ctx.user.id)
      return subscribe('afiliado', { userId: ctx.user.id, affiliateId: a?.id })
    }
    return subscribe('participante', { userId: ctx.user.id })
  })
}
