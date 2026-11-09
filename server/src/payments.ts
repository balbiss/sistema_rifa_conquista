import { randomBytes } from 'node:crypto'
import { all, get, now, run, tx } from './db'
import { fail } from './http'
import { getSetting, paymentsConfig } from './settings'
import { createSyncPay, type PixClient } from './syncpay'
import { audit, cancelParticipation, confirmParticipation, createParticipation, fmtNumber, getCampaign, legalGate, notify } from './services'
import { emit } from './events'

// =================================================================================================
// Compra por PIX (SyncPay): reserva os números, gera a cobrança, confirma só depois de consultar a
// SyncPay, libera os números se o PIX vencer. Vendas reais só com campanha regularizada.
// =================================================================================================

let client: PixClient | null = null
let clientKey = ''
export function pix(): PixClient {
  const c = paymentsConfig()
  const key = [c.mode, c.client_id, c.client_secret, c.base_url].join('|')
  if (!client || key !== clientKey) { client = createSyncPay(c); clientKey = key }
  return client
}

export function validCPF(v: string) {
  const c = (v || '').replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

/** Inicia a compra. test=true: checkout de teste do administrador (sempre simulado, não conta como real). */
export async function startCheckout(o: { slug: string; name: string; phone: string; cpf: string; email: string; quantity: number; ref?: string | null; test: boolean; ip: string; siteUrl: string }) {
  const c = getCampaign(o.slug)
  const cfg = paymentsConfig()
  // PIX em modo simulado: compra de teste (marcada como simulação, nunca conta como real)
  const sim = o.test || cfg.mode === 'simulado'
  if (o.test) {
    if (cfg.mode !== 'simulado') fail(409, 'teste_indisponivel', 'O checkout de teste só funciona com o pagamento em modo simulado.')
  } else {
    const g = legalGate(c)
    if (!g.allowed) fail(403, 'vendas_bloqueadas', 'As participações ainda não estão abertas. Esta campanha aguarda regularização.')
    if (c.status !== 'ativa') fail(409, 'campanha_inativa', 'Esta campanha não está recebendo participações agora.')
    if (!cfg.ready) fail(503, 'pagamento_indisponivel', 'O pagamento PIX ainda não está disponível.')
  }
  const max = Number(cfg.max_per_order) || 100
  const qty = Math.floor(Number(o.quantity) || 0)
  if (qty < 1 || qty > max) fail(422, 'quantidade_invalida', `Escolha de 1 a ${max} números.`)
  if (!validCPF(o.cpf)) fail(422, 'cpf_invalido', 'CPF inválido. Confira os números.', { field: 'CPF' })
  const cpf = o.cpf.replace(/\D/g, '')
  const amountCents = Math.round(c.ref_price * 100) * qty
  if (amountCents < 100) fail(422, 'valor_minimo', 'Valor mínimo do PIX é R$ 1,00.')

  // participante: reaproveita quem já comprou com o mesmo WhatsApp (sem "já cadastrado")
  const { participantId, participationId, numbers } = tx(() => {
    let p = get<any>('SELECT * FROM participants WHERE campaign_id = ? AND phone = ?', c.id, o.phone)
    if (p) {
      if (p.status === 'bloqueado') fail(403, 'participante_bloqueado', 'Não foi possível concluir. Fale com o organizador.')
      if (p.document && p.document !== cpf) fail(409, 'cpf_divergente', 'Este WhatsApp já está ligado a outro CPF. Confira os dados ou fale com o organizador.')
      run('UPDATE participants SET name = ?, document = ?, email = CASE WHEN ? != \'\' THEN ? ELSE email END WHERE id = ?', o.name, cpf, o.email, o.email, p.id)
    } else {
      let aff: number | null = null
      if (o.ref) aff = get<any>("SELECT id FROM affiliates WHERE code = ? AND status = 'ativo'", o.ref)?.id ?? null
      p = { id: Number(run("INSERT INTO participants (campaign_id, affiliate_id, name, phone, email, document, origin, simulated, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
        c.id, aff, o.name, o.phone, o.email, cpf, aff ? 'indicacao' : 'site', sim ? 1 : 0).lastInsertRowid), affiliate_id: aff }
      if (aff) {
        const a = get<any>('SELECT user_id FROM affiliates WHERE id = ?', aff)
        if (getSetting('notifications').notify_affiliate_new_referral) notify(a?.user_id, 'Nova indicação', 'Uma pessoa iniciou uma compra pelo seu link.', '/afiliado/indicacoes')
      }
    }
    // uma cobrança pendente por pessoa: a anterior é cancelada (libera os números)
    const open = get<any>("SELECT id, participation_id FROM payments WHERE participant_id = ? AND status = 'pendente'", p.id)
    if (open) {
      run("UPDATE payments SET status = 'cancelado' WHERE id = ?", open.id)
      if (get<any>('SELECT status FROM participations WHERE id = ?', open.participation_id)?.status === 'pendente') cancelParticipation(open.participation_id, null, 'substituída por nova compra')
    }
    const part: any = createParticipation({ campaignId: c.id, participantId: p.id, quantity: qty, simulated: sim, user: null })
    return { participantId: p.id, participationId: part.id, numbers: part.numbers as number[] }
  })

  let charge: { identifier: string; pixCode: string }
  try {
    charge = await pix().createCharge({
      amountCents, description: `${c.name} — ${qty} número(s)`.slice(0, 120),
      webhookUrl: `${o.siteUrl.replace(/\/$/, '')}/api/webhooks/syncpay`,
      client: { name: o.name, cpf, email: o.email || `contato+${o.phone}@${(getSetting('organizer').email || 'cliente.com').split('@')[1] || 'cliente.com'}`, phone: o.phone },
    })
  } catch (e: any) {
    cancelParticipation(participationId, null, 'falha ao gerar o PIX')
    console.error('[pix] falha ao gerar cobrança', e?.message)
    fail(502, 'pix_falhou', 'Não conseguimos gerar o PIX agora. Tente de novo em instantes.')
  }
  const minutes = Number(paymentsConfig().reservation_minutes) || 15
  const expires = new Date(Date.now() + minutes * 60_000).toISOString()
  const accessKey = randomBytes(16).toString('hex')
  const pid = Number(run('INSERT INTO payments (campaign_id, participation_id, participant_id, amount_cents, provider, identifier, pix_code, access_key, simulated, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    c.id, participationId, participantId, amountCents, pix().mode === 'simulado' ? 'simulado' : 'syncpay', charge!.identifier, charge!.pixCode, accessKey, sim ? 1 : 0, expires).lastInsertRowid)
  audit(null, o.test ? 'pagamento.teste_iniciado' : 'pagamento.iniciado', 'payment', pid, { campaign_id: c.id, quantity: qty, amount_cents: amountCents }, o.ip)
  emit(['payments', 'participations', 'numbers'], { campaignId: c.id })
  return { id: pid, key: accessKey, pix_code: charge!.pixCode, amount_cents: amountCents, expires_at: expires, quantity: qty, simulated: sim, mode: pix().mode, numbers_reserved: numbers.length }
}

/** Status para o comprador (precisa da chave secreta da compra). Consulta a SyncPay de vez em quando. */
export async function paymentStatus(id: number, key: string) {
  const p = get<any>('SELECT * FROM payments WHERE id = ?', id)
  if (!p || p.access_key !== key) fail(404, 'compra_nao_encontrada', 'Compra não encontrada.')
  if (p.status === 'pendente' && (!p.last_check_at || Date.now() - new Date(p.last_check_at).getTime() > 8000)) await reconcile(p.identifier).catch(() => {})
  const fresh = get<any>('SELECT * FROM payments WHERE id = ?', id)
  const c = get<any>('SELECT number_digits, name FROM campaigns WHERE id = ?', fresh.campaign_id)
  const nums = fresh.status === 'pago' ? all<any>('SELECT number FROM numbers WHERE participation_id = ? ORDER BY number', fresh.participation_id).map(r => fmtNumber(r.number, c.number_digits)) : []
  return { id: fresh.id, status: fresh.status, amount_cents: fresh.amount_cents, expires_at: fresh.expires_at, paid_at: fresh.paid_at, numbers: nums, campaign: c.name, simulated: !!fresh.simulated }
}

/** Confere com a SyncPay e, se pago com o valor certo, confirma a participação (uma única vez). */
export async function reconcile(identifier: string) {
  const p = get<any>('SELECT * FROM payments WHERE identifier = ?', identifier)
  if (!p || p.status === 'pago' || p.status === 'pago_tarde') return p
  let t: { status: string; amount: number } | null = null
  try { t = await pix().check(identifier) } finally { run("UPDATE payments SET last_check_at = datetime('now') WHERE id = ?", p.id) }
  if (!t) return p
  run('UPDATE payments SET provider_status = ? WHERE id = ?', t.status, p.id)
  if (t.status !== 'completed') return p
  const amountOk = Math.round(t.amount * 100) === p.amount_cents
  const out = tx(() => {
    const cur = get<any>('SELECT * FROM payments WHERE id = ?', p.id)
    if (cur.status === 'pago' || cur.status === 'pago_tarde') return cur
    if (!amountOk) {
      run("UPDATE payments SET status = 'divergente' WHERE id = ?", p.id)
      audit(null, 'pagamento.divergente', 'payment', p.id, { esperado: p.amount_cents, recebido: t!.amount })
      alertAdmins('PIX com valor divergente', `Compra #${p.id}: esperado R$ ${(p.amount_cents / 100).toFixed(2)}, recebido R$ ${t!.amount.toFixed(2)}.`)
      return null
    }
    const part = get<any>('SELECT * FROM participations WHERE id = ?', p.participation_id)
    if (part.status === 'pendente') {
      run("UPDATE payments SET status = 'pago', paid_at = ? WHERE id = ?", now(), p.id)
      confirmParticipation(p.participation_id, { id: null, name: 'PIX SyncPay' })
      audit(null, 'pagamento.confirmado', 'payment', p.id, { amount_cents: p.amount_cents, simulated: !!p.simulated })
    } else {
      // pagou depois de vencer: números já liberados — o organizador decide (reatribuir ou devolver)
      run("UPDATE payments SET status = 'pago_tarde', paid_at = ? WHERE id = ?", now(), p.id)
      audit(null, 'pagamento.pago_apos_expirar', 'payment', p.id, { amount_cents: p.amount_cents })
      alertAdmins('PIX pago depois do prazo', `Compra #${p.id} foi paga após vencer. Entre em contato com o comprador para reatribuir os números ou devolver o valor.`)
    }
    return get<any>('SELECT * FROM payments WHERE id = ?', p.id)
  })
  emit(['payments', 'progress', 'participations', 'dashboard'], { campaignId: p.campaign_id, public: true })
  return out
}

function alertAdmins(title: string, message: string) {
  for (const a of all<any>("SELECT id FROM users WHERE role = 'admin' AND active = 1")) notify(a.id, title, message, '/admin/pagamentos')
}

/** Vence os PIX não pagos: confere uma última vez e libera os números. Roda a cada minuto. */
export async function expirePending() {
  const due = all<any>("SELECT * FROM payments WHERE status = 'pendente' AND expires_at < ?", now())
  for (const p of due) {
    try {
      const r: any = await reconcile(p.identifier).catch(() => null)
      if (r?.status === 'pago') continue
      const cur = get<any>('SELECT status FROM payments WHERE id = ?', p.id)
      if (cur.status !== 'pendente') continue
      tx(() => {
        run("UPDATE payments SET status = 'expirado' WHERE id = ? AND status = 'pendente'", p.id)
        const part = get<any>('SELECT status FROM participations WHERE id = ?', p.participation_id)
        if (part?.status === 'pendente') cancelParticipation(p.participation_id, null, 'PIX não pago no prazo')
      })
      emit(['payments'], { campaignId: p.campaign_id })
    } catch (e: any) { console.error('[pix] expirar', p.id, e?.message) }
  }
  return due.length
}

/** Teste local: o administrador marca a cobrança simulada como paga. */
export async function simulatePayment(id: number) {
  const p = get<any>('SELECT * FROM payments WHERE id = ?', id)
  if (!p) fail(404, 'nao_encontrado', 'Compra não encontrada.')
  const c = pix()
  if (c.mode !== 'simulado' || !c.simulatePay) fail(409, 'modo_real', 'Só é possível simular no modo simulado.')
  c.simulatePay(p.identifier)
  return reconcile(p.identifier)
}

/** "Meus números": WhatsApp + CPF → números confirmados (sem expor outros dados). */
export function lookupNumbers(phone: string, cpf: string) {
  const rows = all<any>(`SELECT pt.id, pt.name, c.name AS campaign_name, c.number_digits, c.slug FROM participants pt JOIN campaigns c ON c.id = pt.campaign_id WHERE pt.phone = ? AND pt.document = ?`, phone, cpf)
  return rows.map(r => ({
    campaign: r.campaign_name, slug: r.slug, name: r.name.split(' ')[0],
    numbers: all<any>("SELECT n.number FROM numbers n JOIN participations pa ON pa.id = n.participation_id WHERE n.participant_id = ? AND n.status = 'atribuido' AND pa.status = 'confirmada' ORDER BY n.number", r.id).map(x => fmtNumber(x.number, r.number_digits)),
    pending: get<any>("SELECT COUNT(*) AS n FROM payments WHERE participant_id = ? AND status = 'pendente'", r.id).n,
  }))
}
