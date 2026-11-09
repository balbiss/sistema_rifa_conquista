import { all, get, now, run, tx } from './db'
import { fail } from './http'
import { getSetting } from './settings'
import { audit, notify } from './services'
import { emit } from './events'

// =================================================================================================
// Saques de afiliados: saldo = comissões APROVADAS ainda não sacadas. Pedido mínimo R$ 55 (configurável),
// taxa R$ 5 por saque, o resto vai para a chave PIX do afiliado. O organizador paga manualmente.
// Prazo: pedidos até cutoff_hour caem até deadline_hour do mesmo dia; depois, até deadline_hour do dia seguinte
// (horário de Brasília).
// =================================================================================================

const BRT_OFFSET = -3 // Brasília (sem horário de verão)
const round2 = (n: number) => Math.round(n * 100) / 100

export function deadlineFor(at = new Date()) {
  const w = getSetting('withdrawals')
  const local = new Date(at.getTime() + BRT_OFFSET * 3600_000) // "relógio" de Brasília em UTC
  const sameDay = local.getUTCHours() < Number(w.cutoff_hour)
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (sameDay ? 0 : 1), Number(w.deadline_hour) - BRT_OFFSET, 0, 0))
  return d.toISOString()
}

export const PIX_TYPES = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] as const
export function validatePixKey(type: string, key: string) {
  const k = (key || '').trim()
  const d = k.replace(/\D/g, '')
  if (!PIX_TYPES.includes(type as any)) fail(422, 'tipo_pix', 'Escolha o tipo da chave PIX.', { field: 'Tipo da chave' })
  const ok = type === 'cpf' ? d.length === 11 : type === 'cnpj' ? d.length === 14 : type === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(k)
    : type === 'telefone' ? d.length >= 10 && d.length <= 13 : /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(k)
  if (!ok) fail(422, 'chave_pix_invalida', 'Chave PIX inválida para o tipo escolhido.', { field: 'Chave PIX' })
  return type === 'email' || type === 'aleatoria' ? k.toLowerCase() : d
}

export function wallet(affiliateId: number) {
  const w = getSetting('withdrawals')
  const sum = (sql: string, ...p: any[]) => round2(get<any>(sql, ...p)?.v || 0)
  const availReal = sum("SELECT SUM(amount) AS v FROM commissions WHERE affiliate_id = ? AND status = 'aprovada' AND withdrawal_id IS NULL AND simulated = 0", affiliateId)
  const availSim = sum("SELECT SUM(amount) AS v FROM commissions WHERE affiliate_id = ? AND status = 'aprovada' AND withdrawal_id IS NULL AND simulated = 1", affiliateId)
  const pending = sum("SELECT SUM(amount) AS v FROM commissions WHERE affiliate_id = ? AND status = 'pendente'", affiliateId)
  const open = get<any>("SELECT * FROM withdrawals WHERE affiliate_id = ? AND status = 'solicitado'", affiliateId)
  const a = get<any>('SELECT pix_key, pix_key_type, pix_holder FROM affiliates WHERE id = ?', affiliateId)
  const min = Number(w.min_balance), fee = Number(w.fee)
  return {
    available: availReal, available_simulated: availSim, pending_approval: pending,
    min_balance: min, fee, cutoff_hour: Number(w.cutoff_hour), deadline_hour: Number(w.deadline_hour),
    allow_simulated: !!w.allow_simulated,
    can_request: !open && !!a?.pix_key && availReal >= min,
    can_request_simulated: !open && !!a?.pix_key && !!w.allow_simulated && availSim >= min,
    next_deadline: deadlineFor(),
    pix: { type: a?.pix_key_type || '', key: a?.pix_key || '', holder: a?.pix_holder || '' },
    open,
    history: all<any>('SELECT * FROM withdrawals WHERE affiliate_id = ? ORDER BY id DESC LIMIT 50', affiliateId),
  }
}

export function updatePix(affiliateId: number, user: any, b: any) {
  if (get("SELECT id FROM withdrawals WHERE affiliate_id = ? AND status = 'solicitado'", affiliateId)) fail(409, 'saque_aberto', 'Você tem um saque em andamento. Aguarde o pagamento para trocar a chave PIX.')
  const type = String(b.type || '')
  const key = validatePixKey(type, String(b.key || ''))
  const holder = String(b.holder || '').trim()
  if (holder.length < 3 || holder.length > 120) fail(422, 'titular', 'Informe o nome completo do titular da chave.', { field: 'Titular' })
  const before = get<any>('SELECT pix_key, pix_key_type FROM affiliates WHERE id = ?', affiliateId)
  run('UPDATE affiliates SET pix_key_type = ?, pix_key = ?, pix_holder = ? WHERE id = ?', type, key, holder, affiliateId)
  audit(user, 'afiliado.chave_pix', 'affiliate', affiliateId, { antes: before?.pix_key ? `${before.pix_key_type}:${String(before.pix_key).slice(-4)}` : '', depois: `${type}:${key.slice(-4)}` })
  if (before?.pix_key && before.pix_key !== key) {
    for (const ad of all<any>("SELECT id FROM users WHERE role = 'admin' AND active = 1")) notify(ad.id, 'Afiliado trocou a chave PIX', `${user.name} alterou a chave PIX de recebimento.`, '/admin/saques')
  }
  emit(['withdrawals'], { affiliateIds: [affiliateId] })
  return { ok: true }
}

export function requestWithdrawal(affiliateId: number, user: any, simulated: boolean) {
  const w = getSetting('withdrawals')
  if (simulated && !w.allow_simulated) fail(403, 'simulacao_desligada', 'Saque de simulação desativado.')
  const out = tx(() => {
    const a = get<any>('SELECT * FROM affiliates WHERE id = ?', affiliateId)
    if (a.status !== 'ativo') fail(403, 'afiliado_suspenso', 'Seu cadastro está suspenso.')
    if (!a.pix_key) fail(422, 'sem_pix', 'Cadastre sua chave PIX antes de pedir o saque.')
    if (get("SELECT id FROM withdrawals WHERE affiliate_id = ? AND status = 'solicitado'", affiliateId)) fail(409, 'saque_aberto', 'Você já tem um saque em andamento.')
    const coms = all<any>("SELECT id, amount FROM commissions WHERE affiliate_id = ? AND status = 'aprovada' AND withdrawal_id IS NULL AND simulated = ?", affiliateId, simulated ? 1 : 0)
    const gross = round2(coms.reduce((s, c) => s + c.amount, 0))
    const min = Number(w.min_balance), fee = Number(w.fee)
    if (gross < min) fail(422, 'saldo_insuficiente', `Saldo mínimo para saque: R$ ${min.toFixed(2).replace('.', ',')}. Seu saldo disponível: R$ ${gross.toFixed(2).replace('.', ',')}.`)
    const net = round2(gross - fee)
    const deadline = deadlineFor()
    const id = Number(run('INSERT INTO withdrawals (affiliate_id, gross, fee, net, pix_key_type, pix_key, holder_name, simulated, deadline_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      affiliateId, gross, fee, net, a.pix_key_type, a.pix_key, a.pix_holder || a.name, simulated ? 1 : 0, deadline).lastInsertRowid)
    for (const c of coms) run('UPDATE commissions SET withdrawal_id = ? WHERE id = ?', id, c.id)
    audit(user, 'saque.solicitado', 'withdrawal', id, { gross, fee, net, simulated })
    const brl = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',')
    for (const ad of all<any>("SELECT id FROM users WHERE role = 'admin' AND active = 1")) notify(ad.id, `Saque solicitado${simulated ? ' (simulação)' : ''}`, `${a.name}: pagar ${brl(net)} (taxa ${brl(fee)}) até ${new Date(deadline).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`, '/admin/saques')
    return id
  })
  emit(['withdrawals', 'commissions', 'dashboard'], { affiliateIds: [affiliateId] })
  return get<any>('SELECT * FROM withdrawals WHERE id = ?', out)
}

export function payWithdrawal(id: number, user: any, ref: string, proofUrl: string) {
  const out = tx(() => {
    const w = get<any>('SELECT * FROM withdrawals WHERE id = ?', id)
    if (!w) fail(404, 'nao_encontrado', 'Saque não encontrado.')
    if (w.status !== 'solicitado') fail(409, 'status_invalido', 'Este saque já foi tratado.')
    if (!ref.trim() && !proofUrl) fail(422, 'comprovante', 'Informe o ID/código do PIX enviado ou anexe o comprovante.', { field: 'Comprovante' })
    run("UPDATE withdrawals SET status = 'pago', paid_at = ?, payment_ref = ?, proof_url = ?, handled_by = ? WHERE id = ?", now(), ref.trim(), proofUrl, user.id, id)
    const coms = all<any>('SELECT id, status FROM commissions WHERE withdrawal_id = ?', id)
    if (coms.some(c => c.status !== 'aprovada')) fail(409, 'comissao_cancelada', 'Uma comissão deste saque foi cancelada/estornada depois do pedido. Recuse o saque para o afiliado pedir de novo com o valor certo.')
    for (const c of coms) {
      run("UPDATE commissions SET status = 'paga', paid_at = ?, payment_ref = ? WHERE id = ?", now(), `SAQUE #${id}`, c.id)
      run("INSERT INTO commission_events (commission_id, from_status, to_status, user_id, note) VALUES (?, ?, 'paga', ?, ?)", c.id, c.status, user.id, `saque #${id}${w.simulated ? ' (simulação)' : ''}`)
    }
    audit(user, 'saque.pago', 'withdrawal', id, { net: w.net, ref, simulated: !!w.simulated, atrasado: new Date() > new Date(w.deadline_at) })
    const a = get<any>('SELECT user_id FROM affiliates WHERE id = ?', w.affiliate_id)
    notify(a?.user_id, 'Saque pago! 💸', `R$ ${w.net.toFixed(2).replace('.', ',')} enviado para sua chave PIX.${w.simulated ? ' (simulação)' : ''}`, '/afiliado/saques')
    return w.affiliate_id
  })
  emit(['withdrawals', 'commissions', 'dashboard'], { affiliateIds: [out] })
  return get<any>('SELECT * FROM withdrawals WHERE id = ?', id)
}

export function refuseWithdrawal(id: number, user: any, reason: string) {
  if (!reason.trim()) fail(422, 'motivo', 'Informe o motivo da recusa.', { field: 'Motivo' })
  const out = tx(() => {
    const w = get<any>('SELECT * FROM withdrawals WHERE id = ?', id)
    if (!w) fail(404, 'nao_encontrado', 'Saque não encontrado.')
    if (w.status !== 'solicitado') fail(409, 'status_invalido', 'Este saque já foi tratado.')
    run("UPDATE withdrawals SET status = 'recusado', refused_reason = ?, handled_by = ? WHERE id = ?", reason.trim(), user.id, id)
    run('UPDATE commissions SET withdrawal_id = NULL WHERE withdrawal_id = ?', id) // saldo volta para o afiliado
    audit(user, 'saque.recusado', 'withdrawal', id, { reason })
    const a = get<any>('SELECT user_id FROM affiliates WHERE id = ?', w.affiliate_id)
    notify(a?.user_id, 'Saque recusado', `Motivo: ${reason.trim()}. O valor voltou para o seu saldo.`, '/afiliado/saques')
    return w.affiliate_id
  })
  emit(['withdrawals', 'commissions', 'dashboard'], { affiliateIds: [out] })
  return { ok: true }
}

export function listWithdrawals(status?: string | null) {
  const where = status ? 'WHERE w.status = ?' : ''
  const rows = all<any>(`SELECT w.*, a.name AS affiliate_name, a.code AS affiliate_code, a.phone AS affiliate_phone, u.name AS handled_by_name
    FROM withdrawals w JOIN affiliates a ON a.id = w.affiliate_id LEFT JOIN users u ON u.id = w.handled_by ${where} ORDER BY CASE w.status WHEN 'solicitado' THEN 0 ELSE 1 END, w.deadline_at, w.id DESC LIMIT 300`, ...(status ? [status] : []))
  const t = Date.now()
  return {
    items: rows.map(r => ({ ...r, overdue: r.status === 'solicitado' && new Date(r.deadline_at).getTime() < t })),
    totals: {
      open_count: get<any>("SELECT COUNT(*) AS n FROM withdrawals WHERE status = 'solicitado'").n,
      open_net: round2(get<any>("SELECT SUM(net) AS v FROM withdrawals WHERE status = 'solicitado' AND simulated = 0").v || 0),
      open_net_sim: round2(get<any>("SELECT SUM(net) AS v FROM withdrawals WHERE status = 'solicitado' AND simulated = 1").v || 0),
      paid_net: round2(get<any>("SELECT SUM(net) AS v FROM withdrawals WHERE status = 'pago' AND simulated = 0").v || 0),
      fees: round2(get<any>("SELECT SUM(fee) AS v FROM withdrawals WHERE status = 'pago' AND simulated = 0").v || 0),
      overdue: rows.filter(r => r.status === 'solicitado' && new Date(r.deadline_at).getTime() < t).length,
    },
  }
}
