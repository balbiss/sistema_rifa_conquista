import { get, all } from '../db'
import { fail, json, num, oneOf, phone, str, type Router } from '../http'
import { requirePerm, requireRole } from '../auth'
import { getSetting, paymentsConfig, setSetting, allSettings } from '../settings'
import { audit } from '../services'
import { emit } from '../events'
import { lookupNumbers, paymentStatus, reconcile, simulatePayment, startCheckout, validCPF } from '../payments'
import { listWithdrawals, payWithdrawal, refuseWithdrawal, requestWithdrawal, wallet } from '../withdrawals'

const affiliateOf = (ctx: any) => {
  const u = requireRole(ctx, 'afiliado')
  const a = get<any>('SELECT * FROM affiliates WHERE user_id = ?', u.id)
  if (!a) fail(403, 'sem_afiliado', 'Cadastro de afiliado não encontrado.')
  return { u, a }
}

export function checkoutRoutes(r: Router) {
  // ---------------- compra pelo site (nome, CPF e WhatsApp — sem criar conta) ----------------
  r.post('/api/public/campaigns/:slug/checkout', async ctx => {
    const b = await ctx.body()
    const test = !!b.test
    if (test) requirePerm(ctx, 'campanhas') // checkout de teste só para administrador
    const name = str(b.name, 'Nome', { required: true, min: 3, max: 120 })
    if (name.split(/\s+/).length < 2) fail(422, 'nome_completo', 'Digite nome e sobrenome.', { field: 'Nome' })
    const out = await startCheckout({
      slug: ctx.params.slug, name, phone: phone(b.phone, 'WhatsApp'), cpf: String(b.cpf || ''), email: '',
      quantity: Number(b.quantity), ref: b.ref ? String(b.ref).slice(0, 20) : null, test, ip: ctx.ip,
      siteUrl: getSetting('platform').site_url,
    })
    return json(out, 201)
  })
  // teste local: com o PIX em modo simulado o próprio comprador pode simular o pagamento
  r.post('/api/public/payments/:id/simulate', async ctx => {
    if (paymentsConfig().mode !== 'simulado') fail(403, 'modo_real', 'Disponível só no modo simulado.')
    const p = get<any>('SELECT access_key FROM payments WHERE id = ?', Number(ctx.params.id))
    if (!p || p.access_key !== String(ctx.query.get('k') || '')) fail(404, 'compra_nao_encontrada', 'Compra não encontrada.')
    await simulatePayment(Number(ctx.params.id))
    return { ok: true }
  })
  r.get('/api/public/payments/:id', ctx => paymentStatus(Number(ctx.params.id), String(ctx.query.get('k') || '')))
  r.post('/api/public/my-numbers', async ctx => {
    const b = await ctx.body()
    const cpf = String(b.cpf || '').replace(/\D/g, '')
    if (!validCPF(cpf)) fail(422, 'cpf_invalido', 'CPF inválido.', { field: 'CPF' })
    return lookupNumbers(phone(b.phone, 'WhatsApp'), cpf)
  })

  // ---------------- aviso da SyncPay (a verdade vem da consulta à SyncPay) ----------------
  r.post('/api/webhooks/syncpay', async ctx => {
    const expected = paymentsConfig().webhook_token
    if (expected && String(ctx.req.headers.get('authorization') || '') !== `Bearer ${expected}`) return json({ ok: false }, 401)
    const b = await ctx.body().catch(() => ({}))
    const id = b.id || b.identifier || b.reference_id || b.data?.id || b.data?.identifier || b.data?.reference_id || b.data?.transaction?.reference_id
    if (id) reconcile(String(id)).catch(e => console.error('[webhook syncpay]', e?.message))
    return { ok: true }
  })

  // ---------------- administrador: pagamentos ----------------
  r.get('/api/admin/payments', ctx => {
    requirePerm(ctx, 'financeiro')
    const st = ctx.query.get('status')
    const rows = all<any>(`SELECT p.id, p.campaign_id, p.participation_id, p.amount_cents, p.provider, p.identifier, p.status, p.provider_status, p.simulated, p.expires_at, p.paid_at, p.created_at,
      pt.name AS participant_name, pt.phone AS participant_phone, c.name AS campaign_name, pa.quantity
      FROM payments p JOIN participants pt ON pt.id = p.participant_id JOIN campaigns c ON c.id = p.campaign_id JOIN participations pa ON pa.id = p.participation_id
      ${st ? 'WHERE p.status = ?' : ''} ORDER BY p.id DESC LIMIT 300`, ...(st ? [st] : []))
    const sum = (s: string, sim: number) => (get<any>('SELECT SUM(amount_cents) AS v FROM payments WHERE status = ? AND simulated = ?', s, sim)?.v || 0) / 100
    return { items: rows, totals: { paid: sum('pago', 0), paid_sim: sum('pago', 1), pending: all<any>("SELECT id FROM payments WHERE status = 'pendente'").length, problems: all<any>("SELECT id FROM payments WHERE status IN ('divergente','pago_tarde')").length }, mode: paymentsConfig().mode, ready: paymentsConfig().ready }
  })
  r.post('/api/admin/payments/:id/simulate', async ctx => {
    const u = requirePerm(ctx, 'financeiro')
    const p = await simulatePayment(Number(ctx.params.id))
    audit(u, 'pagamento.simulado', 'payment', Number(ctx.params.id))
    return p
  })
  r.post('/api/admin/payments/:id/check', async ctx => {
    requirePerm(ctx, 'financeiro')
    const p = get<any>('SELECT identifier FROM payments WHERE id = ?', Number(ctx.params.id))
    if (!p) fail(404, 'nao_encontrado', 'Pagamento não encontrado.')
    return (await reconcile(p.identifier)) || get<any>('SELECT * FROM payments WHERE id = ?', Number(ctx.params.id))
  })
  r.put('/api/admin/settings-payments', async ctx => {
    const u = requirePerm(ctx, 'configuracoes')
    const b = await ctx.body()
    const v: any = {
      enabled: !!b.enabled,
      mode: oneOf(b.mode || 'simulado', ['real', 'simulado'] as const, 'Modo'),
      client_id: str(b.client_id, 'Client ID', { max: 200 }),
      base_url: str(b.base_url || 'https://api.syncpayments.com.br', 'URL da API', { max: 200 }),
      reservation_minutes: num(b.reservation_minutes ?? 15, 'Tempo para pagar', { min: 5, max: 120, int: true }),
      max_per_order: num(b.max_per_order ?? 100, 'Máximo por compra', { min: 1, max: 1000, int: true }),
    }
    if (!/^https:\/\//.test(v.base_url)) fail(422, 'url_invalida', 'A URL da API precisa começar com https://')
    // segredos: só troca se vier um valor novo (o painel nunca recebe o valor salvo)
    if (b.client_secret && !String(b.client_secret).startsWith('••')) v.client_secret = str(b.client_secret, 'Client secret', { max: 300 })
    if (b.webhook_token && !String(b.webhook_token).startsWith('••')) v.webhook_token = str(b.webhook_token, 'Token do webhook', { max: 300 })
    if (b.clear_secret) v.client_secret = ''
    if (v.enabled && v.mode === 'real' && !(v.client_id && (v.client_secret || getSetting('payments').client_secret))) fail(422, 'credenciais', 'Para ligar o PIX real, informe Client ID e Client secret da SyncPay.')
    setSetting('payments', v)
    audit(u, 'configuracao.pagamentos', 'settings', null, { enabled: v.enabled, mode: v.mode, client_id: v.client_id ? '…' + v.client_id.slice(-4) : '', segredo_trocado: !!v.client_secret })
    emit(['settings', 'campaigns'], { public: true })
    return allSettings().payments
  })
  r.put('/api/admin/settings-withdrawals', async ctx => {
    const u = requirePerm(ctx, 'configuracoes')
    const b = await ctx.body()
    const v = {
      min_balance: num(b.min_balance, 'Saldo mínimo', { min: 1, max: 100000, required: true }),
      fee: num(b.fee, 'Taxa', { min: 0, max: 1000, required: true }),
      cutoff_hour: num(b.cutoff_hour, 'Horário de corte', { min: 0, max: 23, int: true, required: true }),
      deadline_hour: num(b.deadline_hour, 'Prazo', { min: 1, max: 23, int: true, required: true }),
      allow_simulated: !!b.allow_simulated,
    }
    if (v.fee! >= v.min_balance!) fail(422, 'taxa', 'A taxa precisa ser menor que o saldo mínimo.')
    if (v.cutoff_hour! > v.deadline_hour!) fail(422, 'horario', 'O horário de corte precisa ser antes (ou igual) ao prazo.')
    setSetting('withdrawals', v)
    audit(u, 'configuracao.saques', 'settings', null, v)
    emit(['settings', 'withdrawals'])
    return v
  })

  // ---------------- administrador: saques ----------------
  r.get('/api/admin/withdrawals', ctx => { requirePerm(ctx, 'comissoes'); return listWithdrawals(ctx.query.get('status')) })
  r.post('/api/admin/withdrawals/:id/pay', async ctx => {
    const u = requirePerm(ctx, 'comissoes')
    const b = await ctx.body()
    return payWithdrawal(Number(ctx.params.id), u, str(b.payment_ref, 'Comprovante', { max: 200 }), str(b.proof_url, 'Arquivo', { max: 300 }))
  })
  r.post('/api/admin/withdrawals/:id/refuse', async ctx => {
    const u = requirePerm(ctx, 'comissoes')
    const b = await ctx.body()
    return refuseWithdrawal(Number(ctx.params.id), u, str(b.reason, 'Motivo', { max: 300 }))
  })

  // ---------------- afiliado: carteira e saques ----------------
  r.get('/api/affiliate/wallet', ctx => wallet(affiliateOf(ctx).a.id))
  // a chave PIX é definida só pelo organizador no cadastro do afiliado (antifraude: afiliado não troca)
  r.put('/api/affiliate/pix', ctx => { affiliateOf(ctx); fail(403, 'pix_travado', 'A chave PIX é a do seu cadastro e só o organizador pode alterar.') })
  r.post('/api/affiliate/withdrawals', async ctx => {
    const { u, a } = affiliateOf(ctx)
    if (a.status !== 'ativo') fail(403, 'afiliado_suspenso', 'Seu cadastro está suspenso.')
    const b = await ctx.body()
    return json(requestWithdrawal(a.id, u, !!b.simulated), 201)
  })
}
