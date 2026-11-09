import { createHash } from 'node:crypto'
import { all, db, get, now, parseJSON, run, tx } from './db'
import { fail } from './http'
import { getSetting, paymentsConfig } from './settings'
import { emit } from './events'

// =================================================================================================
// Regras de negócio. Tudo que mexe em número/participação/comissão passa por aqui, dentro de
// transação, pra não ter atribuição duplicada nem comissão registrada duas vezes.
// =================================================================================================

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  aguardando_autorizacao: 'Aguardando autorização',
  autorizada: 'Autorizada',
  ativa: 'Ativa',
  pausada: 'Pausada',
  encerrada: 'Encerrada',
  apurada: 'Apurada',
  arquivada: 'Arquivada',
}

// --- auditoria ----------------------------------------------------------------------------------
export function audit(user: any, action: string, entity: string, entityId: number | null, data: any = {}, ip = '') {
  run('INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, data, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
    user?.id ?? null, user?.name ?? 'sistema', action, entity, entityId, JSON.stringify(data ?? {}), ip)
}
export function campaignHistory(campaignId: number, user: any, action: string, changes: any = {}) {
  run('INSERT INTO campaign_history (campaign_id, user_id, action, changes) VALUES (?, ?, ?, ?)', campaignId, user?.id ?? null, action, JSON.stringify(changes))
}
export function notify(userId: number | null | undefined, title: string, message = '', link = '') {
  if (!userId) return
  run('INSERT INTO notifications (user_id, title, message, link) VALUES (?, ?, ?, ?)', userId, title, message, link)
}

// --- privacidade --------------------------------------------------------------------------------
export const maskName = (n: string) => {
  const p = (n || '').trim().split(/\s+/)
  if (!p[0]) return '—'
  return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]
}
export const maskPhone = (d: string) => {
  const s = (d || '').replace(/\D/g, '')
  if (s.length < 8) return '••••'
  const ddd = s.length >= 10 ? s.slice(-11, -9) || s.slice(0, 2) : ''
  return `${ddd ? `(${ddd}) ` : ''}•••••-${s.slice(-4)}`
}
export const maskEmail = (e: string) => {
  if (!e || !e.includes('@')) return ''
  const [u, d] = e.split('@')
  return `${u.slice(0, 2)}•••@${d}`
}

// --- formatação de número ----------------------------------------------------------------------
export const fmtNumber = (n: number, digits: number) => String(n).padStart(digits, '0')

// --- campanha -----------------------------------------------------------------------------------
export function getCampaign(id: number | string) {
  const c = typeof id === 'number' || /^\d+$/.test(String(id))
    ? get<any>('SELECT * FROM campaigns WHERE id = ?', Number(id))
    : get<any>('SELECT * FROM campaigns WHERE slug = ?', String(id))
  if (!c) fail(404, 'campanha_nao_encontrada', 'Campanha não encontrada.')
  c.images = parseJSON(c.images, [])
  return c
}

/** Trava jurídica: só libera operação REAL (venda, pagamento, apuração oficial, prêmio em dinheiro) com tudo regularizado. */
export function legalGate(c: any) {
  // exigência de autorização legal é opcional (padrão: desligada — o organizador controla o status da campanha)
  if (!getSetting('legal').require_authorization) return { allowed: true, reasons: [] as string[] }
  const reasons: string[] = []
  if (!getSetting('legal').real_ops_enabled) reasons.push('A trava geral de operações reais está ligada (Configurações › Regularização).')
  if (c.legal_status !== 'autorizada') reasons.push('A modalidade legal da campanha ainda não foi definida e autorizada.')
  if (!c.authorization_number) reasons.push('Número de autorização/registro não informado.')
  const doc = get<any>("SELECT id FROM campaign_documents WHERE campaign_id = ? AND kind = 'autorizacao'", c.id)
  if (!doc) reasons.push('Documento de autorização não anexado à campanha.')
  return { allowed: reasons.length === 0, reasons }
}
export function paymentsGate(c: any) {
  // vendas manuais/comissões reais: basta a campanha liberada (o PIX do site é conferido à parte no checkout)
  return legalGate(c)
}

export function generateNumbers(campaignId: number, total: number, start: number) {
  const ins = db.prepare('INSERT INTO numbers (campaign_id, number) VALUES (?, ?)')
  for (let i = 0; i < total; i++) ins.run(campaignId, start + i)
}

/** Progresso calculado na hora a partir dos números atribuídos a participações confirmadas. */
export function progress(campaignId: number) {
  const c = get<any>('SELECT id, total_numbers, ref_price FROM campaigns WHERE id = ?', campaignId)
  if (!c) return null
  const rows = all<any>(`SELECT p.simulated, COUNT(*) AS n FROM numbers n JOIN participations p ON p.id = n.participation_id
    WHERE n.campaign_id = ? AND n.status = 'atribuido' AND p.status = 'confirmada' GROUP BY p.simulated`, campaignId)
  const real = rows.find(r => r.simulated === 0)?.n || 0
  const simulated = rows.find(r => r.simulated === 1)?.n || 0
  const counts = Object.fromEntries(all<any>('SELECT status, COUNT(*) AS n FROM numbers WHERE campaign_id = ? GROUP BY status', campaignId).map(r => [r.status, r.n]))
  const total = c.total_numbers
  // usável = total menos os que ficaram fora de jogo (bloqueados/cancelados não contam pra conclusão)
  const pct = (n: number) => Math.min(100, Math.floor((n * 100) / Math.max(1, total)))
  return {
    total,
    real_assigned: real,
    simulated_assigned: simulated,
    percent: pct(real), // o único número que o site público vê
    percent_simulated: pct(real + simulated),
    remaining_percent: 100 - pct(real),
    counts: { disponivel: 0, reservado: 0, atribuido: 0, cancelado: 0, bloqueado: 0, ...counts },
  }
}

// --- identificadores ----------------------------------------------------------------------------
const NUM_TRANSITIONS: Record<string, string[]> = {
  disponivel: ['bloqueado', 'cancelado'],
  bloqueado: ['disponivel'],
  cancelado: ['disponivel'],
}
export function setNumberStatus(campaignId: number, number: number, to: string, user: any, note = '') {
  return tx(() => {
    const n = get<any>('SELECT * FROM numbers WHERE campaign_id = ? AND number = ?', campaignId, number)
    if (!n) fail(404, 'numero_inexistente', 'Identificador não existe nesta campanha.')
    if (!(NUM_TRANSITIONS[n.status] || []).includes(to)) {
      fail(409, 'transicao_invalida', n.status === 'atribuido' || n.status === 'reservado'
        ? 'Este identificador está ligado a uma participação. Cancele a participação para liberá-lo.'
        : `Não é possível mudar de "${n.status}" para "${to}".`)
    }
    run("UPDATE numbers SET status = ?, updated_at = datetime('now') WHERE campaign_id = ? AND number = ?", to, campaignId, number)
    run('INSERT INTO number_history (campaign_id, number, from_status, to_status, user_id, note) VALUES (?, ?, ?, ?, ?, ?)', campaignId, number, n.status, to, user?.id ?? null, note)
    audit(user, 'identificador.status', 'campaign', campaignId, { number, from: n.status, to, note })
    return { ...n, status: to }
  })
}

// --- participações ------------------------------------------------------------------------------
export function createParticipation(opts: { campaignId: number; participantId: number; quantity?: number; numbers?: number[]; simulated: boolean; user: any; confirm?: boolean }) {
  const result = tx(() => {
    const c = getCampaign(opts.campaignId)
    if (['encerrada', 'apurada', 'arquivada'].includes(c.status)) fail(409, 'campanha_fechada', 'Esta campanha não aceita novas participações.')
    if (!opts.simulated) {
      const g = paymentsGate(c)
      if (!g.allowed) fail(403, 'operacao_real_bloqueada', 'Participações reais estão bloqueadas até a regularização da campanha.', { reasons: g.reasons })
      if (c.status !== 'ativa') fail(409, 'campanha_inativa', 'A campanha precisa estar ativa.')
    }
    const part = get<any>('SELECT * FROM participants WHERE id = ? AND campaign_id = ?', opts.participantId, c.id)
    if (!part) fail(404, 'participante_nao_encontrado', 'Participante não encontrado nesta campanha.')
    if (part.status === 'bloqueado') fail(409, 'participante_bloqueado', 'Participante bloqueado.')

    let chosen: number[]
    if (opts.numbers?.length) {
      const uniq = [...new Set(opts.numbers.map(Number))]
      if (uniq.length !== opts.numbers.length) fail(422, 'numero_repetido', 'Há identificadores repetidos na lista.')
      if (uniq.length > 500) fail(422, 'quantidade_excedida', 'Máximo de 500 identificadores por participação.')
      for (const n of uniq) {
        const row = get<any>('SELECT status FROM numbers WHERE campaign_id = ? AND number = ?', c.id, n)
        if (!row) fail(422, 'numero_inexistente', `O identificador ${fmtNumber(n, c.number_digits)} não existe nesta campanha.`)
        if (row.status !== 'disponivel') fail(409, 'numero_indisponivel', `O identificador ${fmtNumber(n, c.number_digits)} não está disponível (${row.status}).`)
      }
      chosen = uniq
    } else {
      const q = Math.floor(Number(opts.quantity) || 0)
      if (q < 1 || q > 500) fail(422, 'quantidade_invalida', 'Quantidade precisa ser entre 1 e 500.')
      chosen = all<any>("SELECT number FROM numbers WHERE campaign_id = ? AND status = 'disponivel' ORDER BY random() LIMIT ?", c.id, q).map(r => r.number)
      if (chosen.length < q) fail(409, 'sem_disponiveis', `Só há ${chosen.length} identificador(es) disponível(is).`)
    }

    const ins = run('INSERT INTO participations (campaign_id, participant_id, affiliate_id, quantity, unit_value, simulated, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      c.id, part.id, part.affiliate_id, chosen.length, c.ref_price, opts.simulated ? 1 : 0, opts.user?.id ?? null)
    const pid = Number(ins.lastInsertRowid)
    for (const n of chosen) {
      // WHERE status='disponivel' + checagem de linhas afetadas = garantia contra corrida
      const r = run("UPDATE numbers SET status = 'reservado', participant_id = ?, participation_id = ?, updated_at = datetime('now') WHERE campaign_id = ? AND number = ? AND status = 'disponivel'", part.id, pid, c.id, n)
      if (r.changes !== 1) fail(409, 'conflito_atribuicao', 'Outro processo reservou este identificador ao mesmo tempo. Tente novamente.')
      run("INSERT INTO number_history (campaign_id, number, from_status, to_status, participant_id, participation_id, user_id, note) VALUES (?, ?, 'disponivel', 'reservado', ?, ?, ?, ?)",
        c.id, n, part.id, pid, opts.user?.id ?? null, opts.simulated ? 'simulação' : '')
    }
    audit(opts.user, 'participacao.criar', 'participation', pid, { campaign_id: c.id, participant_id: part.id, numbers: chosen, simulated: opts.simulated })
    return { id: pid, numbers: chosen, campaign: c, participant: part }
  })
  emit(['participations', 'numbers'], { campaignId: opts.campaignId })
  if (opts.confirm) return { ...confirmParticipation(result.id, opts.user), numbers: result.numbers }
  return getParticipation(result.id)
}

export function getParticipation(id: number) {
  const p = get<any>(`SELECT pa.*, pt.name AS participant_name, pt.phone AS participant_phone, a.name AS affiliate_name, a.code AS affiliate_code, c.number_digits
    FROM participations pa JOIN participants pt ON pt.id = pa.participant_id JOIN campaigns c ON c.id = pa.campaign_id LEFT JOIN affiliates a ON a.id = pa.affiliate_id WHERE pa.id = ?`, id)
  if (!p) fail(404, 'participacao_nao_encontrada', 'Participação não encontrada.')
  p.numbers = all<any>('SELECT number FROM numbers WHERE participation_id = ? ORDER BY number', id).map(r => r.number)
  return p
}

export function confirmParticipation(id: number, user: any) {
  const out = tx(() => {
    const p = get<any>('SELECT * FROM participations WHERE id = ?', id)
    if (!p) fail(404, 'participacao_nao_encontrada', 'Participação não encontrada.')
    if (p.status !== 'pendente') fail(409, 'status_invalido', p.status === 'confirmada' ? 'Esta participação já foi confirmada.' : 'Participação cancelada não pode ser confirmada.')
    const c = getCampaign(p.campaign_id)
    if (!p.simulated) {
      const g = paymentsGate(c)
      if (!g.allowed) fail(403, 'operacao_real_bloqueada', 'Confirmação real bloqueada até a regularização.', { reasons: g.reasons })
    }
    const nums = all<any>("SELECT number FROM numbers WHERE participation_id = ? AND status = 'reservado'", id)
    if (nums.length !== p.quantity) fail(409, 'inconsistencia', 'Os identificadores desta participação não estão todos reservados.')
    run("UPDATE numbers SET status = 'atribuido', updated_at = datetime('now') WHERE participation_id = ? AND status = 'reservado'", id)
    for (const n of nums) {
      run("INSERT INTO number_history (campaign_id, number, from_status, to_status, participant_id, participation_id, user_id, note) VALUES (?, ?, 'reservado', 'atribuido', ?, ?, ?, ?)",
        p.campaign_id, n.number, p.participant_id, id, user?.id ?? null, p.simulated ? 'simulação' : '')
    }
    run("UPDATE participations SET status = 'confirmada', confirmed_at = ? WHERE id = ?", now(), id)
    run("UPDATE participants SET status = 'ativo' WHERE id = ? AND status = 'interessado'", p.participant_id)

    // comissão: uma por participação (UNIQUE em commissions.participation_id)
    let commission: any = null
    if (p.affiliate_id) {
      const aff = get<any>('SELECT * FROM affiliates WHERE id = ?', p.affiliate_id)
      const exists = get<any>('SELECT id FROM commissions WHERE participation_id = ?', id)
      if (aff && aff.status === 'ativo' && !exists) {
        const unit = aff.commission_override ?? c.commission_value
        const amount = Math.round(unit * p.quantity * 100) / 100
        const auto = getSetting('commissions').approval === 'automatica'
        const ins = run('INSERT INTO commissions (affiliate_id, campaign_id, participation_id, quantity, unit_value, amount, status, simulated, approved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          aff.id, c.id, id, p.quantity, unit, amount, auto ? 'aprovada' : 'pendente', p.simulated, auto ? now() : null)
        commission = { id: Number(ins.lastInsertRowid), amount }
        run("INSERT INTO commission_events (commission_id, from_status, to_status, user_id, note) VALUES (?, NULL, ?, ?, 'gerada pela confirmação da participação')", commission.id, auto ? 'aprovada' : 'pendente', user?.id ?? null)
        if (getSetting('notifications').notify_affiliate_commission) {
          notify(aff.user_id, 'Nova comissão registrada', `${p.quantity} participação(ões) confirmada(s) — R$ ${amount.toFixed(2).replace('.', ',')}${p.simulated ? ' (simulação)' : ''}.`, '/afiliado/comissoes')
        }
      }
    }
    audit(user, 'participacao.confirmar', 'participation', id, { campaign_id: p.campaign_id, quantity: p.quantity, commission })
    return { campaign_id: p.campaign_id, affiliate_id: p.affiliate_id }
  })
  emit(['progress', 'participations', 'numbers', 'commissions', 'dashboard'], { campaignId: out.campaign_id, affiliateIds: [out.affiliate_id], public: true })
  return getParticipation(id)
}

export function cancelParticipation(id: number, user: any, reason: string) {
  const out = tx(() => {
    const p = get<any>('SELECT * FROM participations WHERE id = ?', id)
    if (!p) fail(404, 'participacao_nao_encontrada', 'Participação não encontrada.')
    if (p.status === 'cancelada') fail(409, 'ja_cancelada', 'Esta participação já está cancelada.')
    const c = getCampaign(p.campaign_id)
    if (c.status === 'apurada') fail(409, 'campanha_apurada', 'Campanha já apurada: participações não podem mais ser canceladas.')
    const nums = all<any>("SELECT number, status FROM numbers WHERE participation_id = ?", id)
    run("UPDATE numbers SET status = 'disponivel', participant_id = NULL, participation_id = NULL, updated_at = datetime('now') WHERE participation_id = ?", id)
    for (const n of nums) {
      run("INSERT INTO number_history (campaign_id, number, from_status, to_status, participant_id, participation_id, user_id, note) VALUES (?, ?, ?, 'disponivel', ?, ?, ?, ?)",
        p.campaign_id, n.number, n.status, p.participant_id, id, user?.id ?? null, 'participação cancelada: ' + reason)
    }
    run("UPDATE participations SET status = 'cancelada', cancelled_at = ?, cancel_reason = ? WHERE id = ?", now(), reason, id)
    const com = get<any>('SELECT * FROM commissions WHERE participation_id = ?', id)
    if (com && ['pendente', 'aprovada', 'paga'].includes(com.status)) {
      const to = com.status === 'paga' ? 'estornada' : 'cancelada'
      run('UPDATE commissions SET status = ? WHERE id = ?', to, com.id)
      run('INSERT INTO commission_events (commission_id, from_status, to_status, user_id, note) VALUES (?, ?, ?, ?, ?)', com.id, com.status, to, user?.id ?? null, 'participação cancelada: ' + reason)
      const aff = get<any>('SELECT user_id FROM affiliates WHERE id = ?', com.affiliate_id)
      notify(aff?.user_id, to === 'estornada' ? 'Comissão estornada' : 'Comissão cancelada', `A participação ligada a esta comissão foi cancelada.`, '/afiliado/comissoes')
    }
    audit(user, 'participacao.cancelar', 'participation', id, { reason, numbers: nums.map(n => n.number) })
    return { campaign_id: p.campaign_id, affiliate_id: p.affiliate_id }
  })
  emit(['progress', 'participations', 'numbers', 'commissions', 'dashboard'], { campaignId: out.campaign_id, affiliateIds: [out.affiliate_id], public: true })
  return getParticipation(id)
}

// --- comissões ----------------------------------------------------------------------------------
const COM_TRANSITIONS: Record<string, string[]> = {
  pendente: ['aprovada', 'cancelada'],
  aprovada: ['paga', 'cancelada', 'pendente'],
  paga: ['estornada'],
}
export function changeCommission(id: number, to: string, user: any, note = '', paymentRef = '') {
  const out = tx(() => {
    const com = get<any>('SELECT * FROM commissions WHERE id = ?', id)
    if (!com) fail(404, 'comissao_nao_encontrada', 'Comissão não encontrada.')
    if (!(COM_TRANSITIONS[com.status] || []).includes(to)) fail(409, 'transicao_invalida', `Não é possível passar de "${com.status}" para "${to}".`)
    if (com.withdrawal_id) fail(409, 'em_saque', 'Esta comissão faz parte de um saque. Trate pelo menu Saques.')
    if (to === 'paga' && !com.simulated) {
      const c = getCampaign(com.campaign_id)
      const g = paymentsGate(c)
      if (!g.allowed) fail(403, 'operacao_real_bloqueada', 'Pagamentos reais estão bloqueados até a regularização.', { reasons: g.reasons })
    }
    if (to === 'estornada' && !note) fail(422, 'motivo_obrigatorio', 'Informe o motivo do estorno.')
    if (to === 'cancelada' && !note) fail(422, 'motivo_obrigatorio', 'Informe o motivo do cancelamento.')
    run(`UPDATE commissions SET status = ?, approved_at = CASE WHEN ? = 'aprovada' THEN ? ELSE approved_at END,
      paid_at = CASE WHEN ? = 'paga' THEN ? ELSE paid_at END, payment_ref = CASE WHEN ? = 'paga' THEN ? ELSE payment_ref END WHERE id = ?`,
      to, to, now(), to, now(), to, paymentRef, id)
    run('INSERT INTO commission_events (commission_id, from_status, to_status, user_id, note) VALUES (?, ?, ?, ?, ?)', id, com.status, to, user?.id ?? null, note)
    audit(user, 'comissao.' + to, 'commission', id, { from: com.status, note, simulated: !!com.simulated })
    const aff = get<any>('SELECT user_id FROM affiliates WHERE id = ?', com.affiliate_id)
    if (getSetting('notifications').notify_affiliate_commission) {
      const label: Record<string, string> = { aprovada: 'aprovada', paga: 'marcada como paga', cancelada: 'cancelada', estornada: 'estornada', pendente: 'voltou para pendente' }
      notify(aff?.user_id, `Comissão ${label[to]}`, `Valor R$ ${com.amount.toFixed(2).replace('.', ',')}${com.simulated ? ' (simulação)' : ''}.`, '/afiliado/comissoes')
    }
    return com
  })
  emit(['commissions', 'dashboard'], { campaignId: out.campaign_id, affiliateIds: [out.affiliate_id] })
  return get<any>('SELECT * FROM commissions WHERE id = ?', id)
}

// --- apuração -----------------------------------------------------------------------------------
export const DRAW_RULES: Record<string, { label: string; digits: number }> = {
  ultimos_3_primeiro_premio: { label: 'Três últimos dígitos do 1º prêmio da Loteria Federal', digits: 3 },
  ultimos_4_primeiro_premio: { label: 'Quatro últimos dígitos do 1º prêmio da Loteria Federal', digits: 4 },
  ultimos_2_primeiro_premio: { label: 'Dois últimos dígitos do 1º prêmio da Loteria Federal', digits: 2 },
}

export function winningFromFirstPrize(firstPrize: string, rule: string) {
  const r = DRAW_RULES[rule]
  if (!r) fail(422, 'regra_invalida', 'Regra de apuração desconhecida.')
  const digits = (firstPrize || '').replace(/\D/g, '')
  if (digits.length < 5 || digits.length > 6) fail(422, 'resultado_invalido', 'O 1º prêmio da Loteria Federal tem 5 dígitos (ex.: 48273).')
  return Number(digits.slice(-r.digits))
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const drawPayload = (d: any) => JSON.stringify([d.campaign_id, d.mode, d.extraction_number, d.extraction_date, d.first_prize, d.source, d.rule, d.winning_number, d.winner_participant_id ?? null, d.winner_status, d.created_at])

export function registerDraw(opts: { campaignId: number; mode: 'simulacao' | 'oficial'; extraction_number: string; extraction_date: string; first_prize: string; source: 'caixa_api' | 'manual'; source_detail?: string; source_verified?: boolean; user: any }) {
  const out = tx(() => {
    const c = getCampaign(opts.campaignId)
    if (opts.mode === 'oficial') {
      const g = legalGate(c)
      if (!g.allowed) fail(403, 'apuracao_real_bloqueada', 'Apuração oficial bloqueada até a regularização da campanha.', { reasons: g.reasons })
      if (c.status !== 'encerrada') fail(409, 'campanha_nao_encerrada', 'Encerre a campanha antes da apuração oficial.')
      if (get<any>("SELECT id FROM draws WHERE campaign_id = ? AND mode = 'oficial'", c.id)) fail(409, 'ja_apurada', 'Esta campanha já tem apuração oficial registrada.')
      if (c.draw_extraction && c.draw_extraction !== opts.extraction_number) fail(422, 'extracao_divergente', `O regulamento define a extração ${c.draw_extraction}. Resultado de outra extração não pode ser usado.`)
      if (!opts.source_verified && !(opts.source_detail || '').trim()) fail(422, 'fonte_obrigatoria', 'Resultado registrado à mão precisa da referência da fonte oficial (link/documento).')
    }
    if (!/^\d{1,6}$/.test((opts.extraction_number || '').trim())) fail(422, 'extracao_invalida', 'Informe o número da extração/concurso.')
    const w = winningFromFirstPrize(opts.first_prize, c.draw_rule)
    const inRange = w >= c.number_start && w < c.number_start + c.total_numbers
    let winner: any = null
    if (inRange) {
      winner = get<any>(`SELECT n.number, n.participant_id, p.simulated, pt.name, pt.phone FROM numbers n JOIN participations p ON p.id = n.participation_id JOIN participants pt ON pt.id = n.participant_id
        WHERE n.campaign_id = ? AND n.number = ? AND n.status = 'atribuido' AND p.status = 'confirmada'`, c.id, w)
      if (winner && opts.mode === 'oficial' && winner.simulated) winner = null // simulação nunca vale em apuração oficial
    }
    const winnerStatus = !inRange ? 'fora_do_intervalo' : winner ? 'contemplado' : 'numero_sem_participante'
    const prog = progress(c.id)!
    const createdAt = now()
    const report = {
      titulo: opts.mode === 'oficial' ? 'Relatório de Apuração' : 'Relatório de Apuração — SIMULAÇÃO (sem valor oficial)',
      campanha: { id: c.id, nome: c.name, identificadores: c.total_numbers, faixa: `${fmtNumber(c.number_start, c.number_digits)} a ${fmtNumber(c.number_start + c.total_numbers - 1, c.number_digits)}` },
      regra: DRAW_RULES[c.draw_rule].label,
      extracao: { numero: opts.extraction_number, data: opts.extraction_date, primeiro_premio: opts.first_prize.replace(/\D/g, '') },
      fonte: opts.source === 'caixa_api' ? 'Consulta automática ao portal de loterias da CAIXA' : `Registro manual — ${opts.source_detail || 'sem referência'}`,
      fonte_verificada: !!opts.source_verified,
      identificador_apurado: fmtNumber(w, c.number_digits),
      resultado: winnerStatus === 'contemplado' ? `Identificador atribuído a ${maskName(winner.name)}${winner.simulated ? ' (participação simulada)' : ''}`
        : winnerStatus === 'fora_do_intervalo' ? 'Identificador fora da faixa da campanha — seguir regra do regulamento'
          : 'Identificador sem participação confirmada — seguir regra do regulamento',
      progresso_no_momento: { percentual: prog.percent, atribuidos_reais: prog.real_assigned, atribuidos_simulados: prog.simulated_assigned },
      gerado_em: createdAt,
      responsavel: opts.user?.name || 'sistema',
    }
    const prev = get<any>('SELECT hash FROM draws ORDER BY id DESC LIMIT 1')?.hash || 'GENESIS'
    const rec = {
      campaign_id: c.id, mode: opts.mode, extraction_number: opts.extraction_number.trim(), extraction_date: opts.extraction_date, first_prize: opts.first_prize.replace(/\D/g, ''),
      source: opts.source, rule: c.draw_rule, winning_number: w, winner_participant_id: winner?.participant_id ?? null, winner_status: winnerStatus, created_at: createdAt,
    }
    const hash = sha(prev + drawPayload(rec))
    const ins = run(`INSERT INTO draws (campaign_id, mode, extraction_number, extraction_date, first_prize, source, source_detail, source_verified, rule, winning_number, winner_participant_id, winner_status, report, prev_hash, hash, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      rec.campaign_id, rec.mode, rec.extraction_number, rec.extraction_date, rec.first_prize, rec.source, opts.source_detail || '', opts.source_verified ? 1 : 0, rec.rule, rec.winning_number, rec.winner_participant_id, rec.winner_status, JSON.stringify(report), prev, hash, opts.user?.id ?? null, createdAt)
    const drawId = Number(ins.lastInsertRowid)
    if (opts.mode === 'oficial') {
      run("UPDATE campaigns SET status = 'apurada', updated_at = datetime('now') WHERE id = ?", c.id)
      campaignHistory(c.id, opts.user, 'apuracao_oficial', { draw_id: drawId, winning_number: w })
      if (winner) {
        const prize = get<any>("SELECT id FROM prizes WHERE campaign_id = ? AND kind = 'principal'", c.id)
        if (prize) {
          run("UPDATE prizes SET winner_participant_id = ?, winner_number = ?, delivery_status = 'contemplado_definido', updated_at = datetime('now') WHERE id = ?", winner.participant_id, w, prize.id)
          run("INSERT INTO prize_history (prize_id, action, note, user_id) VALUES (?, 'contemplado_definido', ?, ?)", prize.id, `Apuração #${drawId}`, opts.user?.id ?? null)
        }
      }
    }
    audit(opts.user, 'apuracao.' + opts.mode, 'draw', drawId, { campaign_id: c.id, winning_number: w, winner_status: winnerStatus, hash })
    return drawId
  })
  emit(['draws', 'campaigns', 'prizes', 'dashboard'], { campaignId: opts.campaignId, public: opts.mode === 'oficial' })
  return get<any>('SELECT * FROM draws WHERE id = ?', out)
}

/** Confere a cadeia de hashes das apurações: qualquer edição direta no banco quebra a verificação. */
export function verifyDrawChain() {
  const rows = all<any>('SELECT * FROM draws ORDER BY id')
  let prev = 'GENESIS'
  for (const d of rows) {
    if (d.prev_hash !== prev || sha(prev + drawPayload(d)) !== d.hash) return { ok: false, broken_at: d.id, total: rows.length }
    prev = d.hash
  }
  return { ok: true, total: rows.length }
}

/** Consulta o resultado da Loteria Federal no portal da CAIXA (sem extração = última). */
export async function fetchFederal(extraction?: string) {
  const url = `https://servicebus2.caixa.gov.br/portaldeloterias/api/federal/${extraction ? encodeURIComponent(extraction) : ''}`
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (plataforma-campanhas)' } })
  } catch (e: any) {
    fail(502, 'fonte_indisponivel', 'Não foi possível consultar o portal da CAIXA agora. Tente mais tarde ou registre manualmente com a referência da fonte.', { detail: String(e?.message || e) })
  }
  if (!res!.ok) fail(502, 'fonte_indisponivel', `O portal da CAIXA respondeu ${res!.status}. Tente mais tarde ou registre manualmente.`)
  const data: any = await res!.json().catch(() => null)
  if (!data) fail(502, 'fonte_invalida', 'Resposta inesperada do portal da CAIXA.')
  const list: string[] = data.dezenasSorteadasOrdemSorteio || data.listaDezenas || []
  const premios = list.map((s: any) => String(s).replace(/\D/g, '').slice(-5))
  if (!premios[0]) fail(502, 'fonte_invalida', 'O resultado desta extração ainda não está disponível.')
  const [d, m, y] = String(data.dataApuracao || '').split('/')
  return {
    extraction_number: String(data.numero),
    extraction_date: y ? `${y}-${m}-${d}` : '',
    first_prize: premios[0],
    prizes: premios,
    source_url: url,
  }
}
