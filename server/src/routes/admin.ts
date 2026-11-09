import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { all, get, parseJSON, run, tx } from '../db'
import { csv, dateOrNull, email, fail, json, num, oneOf, phone, str, type Router } from '../http'
import { ADMIN_PERMS, hashPassword, requirePerm, requireRole, validatePassword } from '../auth'
import { allSettings, setSetting, DEFAULTS } from '../settings'
import {
  CAMPAIGN_STATUS_LABEL, DRAW_RULES, audit, campaignHistory, cancelParticipation, changeCommission, confirmParticipation, createParticipation,
  fetchFederal, fmtNumber, generateNumbers, getCampaign, getParticipation, legalGate, paymentsGate, progress, registerDraw, setNumberStatus, verifyDrawChain,
} from '../services'
import { emit } from '../events'
import { validatePixKey } from '../withdrawals'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads'
const id = (v: string) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) fail(400, 'id_invalido', 'Identificador inválido.'); return n }
const page = (q: URLSearchParams) => {
  const p = Math.max(1, Number(q.get('page')) || 1)
  const per = Math.min(200, Math.max(5, Number(q.get('per')) || 25))
  return { p, per, off: (p - 1) * per }
}
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'campanha'
const brl = (n: number) => (n || 0).toFixed(2).replace('.', ',')

/** Filtro de período (?from=AAAA-MM-DD&to=AAAA-MM-DD) para uma coluna de data. */
function period(q: URLSearchParams, col: string, where: string[], params: any[]) {
  if (q.get('from')) { where.push(`date(${col}) >= date(?)`); params.push(q.get('from')) }
  if (q.get('to')) { where.push(`date(${col}) <= date(?)`); params.push(q.get('to')) }
}

const CAMPAIGN_FIELDS = ['name', 'subtitle', 'description', 'images', 'prize_summary', 'prize_conditions', 'total_numbers', 'number_start', 'number_digits', 'ref_price', 'commission_value', 'regulation', 'starts_at', 'ends_at', 'draw_date', 'legal_status', 'legal_modality', 'authorization_number', 'draw_rule', 'draw_extraction', 'featured', 'slug'] as const

function readCampaign(b: any, partial: boolean) {
  const o: any = {}
  const has = (k: string) => !partial || k in b
  if (has('name')) o.name = str(b.name, 'Nome', { required: true, min: 3, max: 120 })
  if (has('subtitle')) o.subtitle = str(b.subtitle, 'Subtítulo', { max: 200 })
  if (has('description')) o.description = str(b.description, 'Descrição', { max: 5000 })
  if (has('images')) o.images = JSON.stringify((Array.isArray(b.images) ? b.images : []).filter((x: any) => typeof x === 'string').slice(0, 12))
  if (has('prize_summary')) o.prize_summary = str(b.prize_summary, 'Prêmio', { max: 500 })
  if (has('prize_conditions')) o.prize_conditions = str(b.prize_conditions, 'Condições da premiação', { max: 4000 })
  if (has('total_numbers')) o.total_numbers = num(b.total_numbers, 'Quantidade de identificadores', { min: 1, max: 100000, int: true, required: true })
  if (has('number_start')) o.number_start = num(b.number_start ?? 0, 'Número inicial', { min: 0, max: 999999, int: true }) ?? 0
  if (has('number_digits')) o.number_digits = num(b.number_digits ?? 3, 'Dígitos', { min: 1, max: 6, int: true }) ?? 3
  if (has('ref_price')) o.ref_price = num(b.ref_price ?? 0, 'Valor de referência', { min: 0, max: 100000 }) ?? 0
  if (has('commission_value')) o.commission_value = num(b.commission_value ?? 0, 'Comissão', { min: 0, max: 100000 }) ?? 0
  if (has('regulation')) o.regulation = str(b.regulation, 'Regulamento', { max: 60000 })
  for (const k of ['starts_at', 'ends_at', 'draw_date'] as const) if (has(k)) o[k] = dateOrNull(b[k], k)
  if (has('legal_status')) o.legal_status = oneOf(b.legal_status || 'pendente', ['pendente', 'em_analise', 'autorizada', 'indeferida'] as const, 'Situação legal')
  if (has('legal_modality')) o.legal_modality = str(b.legal_modality, 'Modalidade', { max: 200 })
  if (has('authorization_number')) o.authorization_number = str(b.authorization_number, 'Nº autorização', { max: 120 })
  if (has('draw_rule')) o.draw_rule = oneOf(b.draw_rule || 'ultimos_3_primeiro_premio', Object.keys(DRAW_RULES) as any, 'Regra de apuração')
  if (has('draw_extraction')) o.draw_extraction = str(b.draw_extraction, 'Extração', { max: 10 })
  if (has('featured')) o.featured = b.featured ? 1 : 0
  if ('slug' in b && b.slug) o.slug = slugify(String(b.slug))
  if (o.number_digits !== undefined && o.total_numbers !== undefined && o.number_start !== undefined && String(o.number_start + o.total_numbers - 1).length > o.number_digits) {
    fail(422, 'digitos_insuficientes', `Com ${o.number_digits} dígito(s) não cabe a faixa até ${o.number_start + o.total_numbers - 1}.`)
  }
  return o
}

function uniqueSlug(base: string, exceptId = 0) {
  let s = slugify(base), i = 1
  while (get<any>('SELECT id FROM campaigns WHERE slug = ? AND id != ?', s, exceptId)) s = `${slugify(base)}-${++i}`
  return s
}

function campaignRow(c: any) {
  const p = progress(c.id)
  const g = legalGate(c)
  return { ...c, images: parseJSON(c.images, []), status_label: CAMPAIGN_STATUS_LABEL[c.status], progress: p, gate: g, payments_gate: paymentsGate(c) }
}

export function adminRoutes(r: Router) {
  // ============================== DASHBOARD ==============================
  r.get('/api/admin/dashboard', ctx => {
    requireRole(ctx, 'admin')
    const cid = ctx.query.get('campaign_id') ? Number(ctx.query.get('campaign_id')) : null
    const cw = cid ? ' AND campaign_id = ' + cid : ''
    const campaigns = all<any>('SELECT * FROM campaigns WHERE archived_at IS NULL ORDER BY featured DESC, id DESC')
    const one = (sql: string) => get<any>(sql)?.n || 0
    const comm = Object.fromEntries(all<any>(`SELECT status, simulated, SUM(amount) AS v FROM commissions WHERE 1=1${cw} GROUP BY status, simulated`).map(r => [`${r.status}_${r.simulated}`, r.v]))
    const sumC = (s: string) => (comm[`${s}_0`] || 0) + (comm[`${s}_1`] || 0)
    const revenueReal = one(`SELECT COALESCE(SUM(quantity*unit_value),0) AS n FROM participations WHERE status='confirmada' AND simulated=0${cw}`)
    const revenueSim = one(`SELECT COALESCE(SUM(quantity*unit_value),0) AS n FROM participations WHERE status='confirmada' AND simulated=1${cw}`)
    const expenses = one(`SELECT COALESCE(SUM(amount),0) AS n FROM expenses WHERE 1=1${cw}`)
    const paidReal = comm['paga_0'] || 0
    const daily = all<any>(`SELECT date(confirmed_at) AS d, SUM(quantity) AS q, SUM(CASE WHEN simulated=1 THEN quantity ELSE 0 END) AS sim FROM participations WHERE status='confirmada' AND confirmed_at >= date('now','-29 days')${cw} GROUP BY d`)
    const chart = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
      const row = daily.find(x => x.d === d)
      chart.push({ d, total: row?.q || 0, simulado: row?.sim || 0 })
    }
    const topAff = all<any>(`SELECT a.id, a.name, a.code, COUNT(DISTINCT p.id) AS referrals,
      (SELECT COALESCE(SUM(quantity),0) FROM participations x WHERE x.affiliate_id = a.id AND x.status='confirmada'${cw.replace('campaign_id', 'x.campaign_id')}) AS valid,
      (SELECT COALESCE(SUM(amount),0) FROM commissions co WHERE co.affiliate_id = a.id AND co.status IN ('pendente','aprovada','paga')${cw.replace('campaign_id', 'co.campaign_id')}) AS commission
      FROM affiliates a LEFT JOIN participants p ON p.affiliate_id = a.id${cid ? ' AND p.campaign_id = ' + cid : ''} GROUP BY a.id ORDER BY valid DESC, referrals DESC LIMIT 6`)
    const focus = cid ? campaigns.find(c => c.id === cid) : campaigns[0]
    return {
      totals: {
        campaigns: campaigns.length,
        campaigns_active: campaigns.filter(c => c.status === 'ativa').length,
        participants: one(`SELECT COUNT(*) AS n FROM participants WHERE 1=1${cw}`),
        participations_confirmed: one(`SELECT COUNT(*) AS n FROM participations WHERE status='confirmada'${cw}`),
        numbers_confirmed: one(`SELECT COALESCE(SUM(quantity),0) AS n FROM participations WHERE status='confirmada'${cw}`),
        numbers_confirmed_sim: one(`SELECT COALESCE(SUM(quantity),0) AS n FROM participations WHERE status='confirmada' AND simulated=1${cw}`),
        affiliates: one("SELECT COUNT(*) AS n FROM affiliates WHERE status='ativo'"),
        referrals: one(`SELECT COUNT(*) AS n FROM participants WHERE affiliate_id IS NOT NULL${cw}`),
        commissions_pending: sumC('pendente') + sumC('aprovada'),
        commissions_paid: sumC('paga'),
        revenue_real: revenueReal, revenue_simulated: revenueSim,
        expenses, balance_real: revenueReal - expenses - paidReal,
        balance_simulated: revenueReal + revenueSim - expenses - sumC('paga'),
      },
      focus: focus ? campaignRow(focus) : null,
      campaigns: campaigns.map(c => ({ id: c.id, name: c.name, status: c.status, status_label: CAMPAIGN_STATUS_LABEL[c.status], progress: progress(c.id) })),
      chart, top_affiliates: topAff,
      activity: all<any>('SELECT id, user_name, action, entity, entity_id, data, at FROM audit_log ORDER BY id DESC LIMIT 15').map(a => ({ ...a, data: parseJSON(a.data, {}) })),
    }
  })

  // ============================== CAMPANHAS ==============================
  r.get('/api/admin/campaigns', ctx => {
    requireRole(ctx, 'admin')
    const arch = ctx.query.get('archived') === '1'
    return all<any>(`SELECT * FROM campaigns WHERE archived_at IS ${arch ? 'NOT' : ''} NULL ORDER BY featured DESC, id DESC`).map(campaignRow)
  })
  r.get('/api/admin/campaigns/:id', ctx => {
    requireRole(ctx, 'admin')
    const c = getCampaign(id(ctx.params.id))
    return {
      ...campaignRow(c),
      documents: all<any>('SELECT * FROM campaign_documents WHERE campaign_id = ? ORDER BY id DESC', c.id),
      history: all<any>('SELECT h.*, u.name AS user_name FROM campaign_history h LEFT JOIN users u ON u.id = h.user_id WHERE campaign_id = ? ORDER BY h.id DESC LIMIT 100', c.id).map(h => ({ ...h, changes: parseJSON(h.changes, {}) })),
      prizes: all<any>('SELECT * FROM prizes WHERE campaign_id = ? ORDER BY id', c.id),
    }
  })
  r.post('/api/admin/campaigns', async ctx => {
    const u = requirePerm(ctx, 'campanhas')
    const o = readCampaign(await ctx.body(), false)
    const newId = tx(() => {
      const slug = uniqueSlug(o.slug || o.name)
      const cols = Object.keys(o).filter(k => k !== 'slug')
      const ins = run(`INSERT INTO campaigns (slug, ${cols.join(', ')}, status, created_by) VALUES (?, ${cols.map(() => '?').join(', ')}, 'rascunho', ?)`, slug, ...cols.map(k => o[k]), u.id)
      const cid = Number(ins.lastInsertRowid)
      generateNumbers(cid, o.total_numbers, o.number_start)
      campaignHistory(cid, u, 'criada', o)
      audit(u, 'campanha.criar', 'campaign', cid, { name: o.name })
      return cid
    })
    emit(['campaigns', 'dashboard'], { campaignId: newId, public: true })
    return json(campaignRow(getCampaign(newId)), 201)
  })
  r.put('/api/admin/campaigns/:id', async ctx => {
    const u = requirePerm(ctx, 'campanhas')
    const c = getCampaign(id(ctx.params.id))
    const b = await ctx.body()
    const o = readCampaign(b, true)
    if (o.slug) o.slug = uniqueSlug(o.slug, c.id)
    if (['apurada'].includes(c.status)) {
      const allowed = ['description', 'images', 'subtitle', 'featured']
      if (Object.keys(o).some(k => !allowed.includes(k))) fail(409, 'campanha_apurada', 'Campanha apurada: só textos e imagens podem ser alterados.')
    }
    const changesNumbers = ['total_numbers', 'number_start', 'number_digits'].some(k => k in o && o[k] !== c[k])
    // regras de ouro após regularização: faixa, regra e extração não mudam com participação real em andamento
    if (changesNumbers || ('draw_rule' in o && o.draw_rule !== c.draw_rule)) {
      const used = get<any>("SELECT COUNT(*) AS n FROM numbers WHERE campaign_id = ? AND status IN ('reservado','atribuido')", c.id).n
      if (used) fail(409, 'identificadores_em_uso', 'Já existem identificadores reservados/atribuídos. Cancele as participações antes de mudar a faixa ou a regra.')
    }
    const merged = { ...c, ...o }
    if (String(merged.number_start + merged.total_numbers - 1).length > merged.number_digits) fail(422, 'digitos_insuficientes', `Com ${merged.number_digits} dígito(s) não cabe a faixa até ${merged.number_start + merged.total_numbers - 1}.`)
    const diff: any = {}
    for (const k of Object.keys(o)) {
      const before = k === 'images' ? JSON.stringify(c.images) : c[k]
      if (String(before ?? '') !== String(o[k] ?? '')) diff[k] = k === 'regulation' || k === 'description' ? '(texto alterado)' : { de: before, para: o[k] }
    }
    if (!Object.keys(diff).length) return campaignRow(c)
    tx(() => {
      run(`UPDATE campaigns SET ${Object.keys(o).map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...Object.values(o), c.id)
      if (changesNumbers) {
        run('DELETE FROM numbers WHERE campaign_id = ?', c.id)
        generateNumbers(c.id, merged.total_numbers, merged.number_start)
      }
      campaignHistory(c.id, u, 'editada', diff)
      audit(u, 'campanha.editar', 'campaign', c.id, diff)
    })
    emit(['campaigns', 'progress', 'dashboard'], { campaignId: c.id, public: true })
    return campaignRow(getCampaign(c.id))
  })
  r.post('/api/admin/campaigns/:id/status', async ctx => {
    const u = requirePerm(ctx, 'campanhas')
    const c = getCampaign(id(ctx.params.id))
    const b = await ctx.body()
    const to = oneOf(b.status, ['rascunho', 'aguardando_autorizacao', 'autorizada', 'ativa', 'pausada', 'encerrada'] as const, 'Status')
    if (c.status === 'apurada' || c.status === 'arquivada') fail(409, 'status_final', 'Campanha apurada/arquivada não muda de status.')
    if (['autorizada', 'ativa'].includes(to)) {
      const g = legalGate(c)
      if (!g.allowed) fail(403, 'regularizacao_pendente', 'A campanha só pode ser autorizada/ativada depois da regularização.', { reasons: g.reasons })
    }
    run("UPDATE campaigns SET status = ?, updated_at = datetime('now') WHERE id = ?", to, c.id)
    campaignHistory(c.id, u, 'status', { de: c.status, para: to, motivo: b.note || '' })
    audit(u, 'campanha.status', 'campaign', c.id, { de: c.status, para: to })
    emit(['campaigns', 'dashboard'], { campaignId: c.id, public: true })
    return campaignRow(getCampaign(c.id))
  })
  r.post('/api/admin/campaigns/:id/duplicate', ctx => {
    const u = requirePerm(ctx, 'campanhas')
    const c = getCampaign(id(ctx.params.id))
    const newId = tx(() => {
      const slug = uniqueSlug(c.slug + '-copia')
      const ins = run(`INSERT INTO campaigns (slug, name, subtitle, description, images, prize_summary, prize_conditions, total_numbers, number_start, number_digits, ref_price, commission_value, regulation, draw_method, draw_rule, status, legal_status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', 'pendente', ?)`,
        slug, c.name + ' (cópia)', c.subtitle, c.description, JSON.stringify(c.images), c.prize_summary, c.prize_conditions, c.total_numbers, c.number_start, c.number_digits, c.ref_price, c.commission_value, c.regulation, c.draw_method, c.draw_rule, u.id)
      const nid = Number(ins.lastInsertRowid)
      generateNumbers(nid, c.total_numbers, c.number_start)
      for (const p of all<any>('SELECT * FROM prizes WHERE campaign_id = ?', c.id)) {
        run('INSERT INTO prizes (campaign_id, kind, title, description, images, estimated_value, delivery_conditions, documents, is_cash, legal_approved, public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
          nid, p.kind, p.title, p.description, p.images, p.estimated_value, p.delivery_conditions, p.documents, p.is_cash, p.public)
      }
      campaignHistory(nid, u, 'criada', { duplicada_de: c.id })
      audit(u, 'campanha.duplicar', 'campaign', nid, { origem: c.id })
      return nid
    })
    emit(['campaigns', 'dashboard'], { campaignId: newId })
    return json(campaignRow(getCampaign(newId)), 201)
  })
  r.post('/api/admin/campaigns/:id/archive', async ctx => {
    const u = requirePerm(ctx, 'campanhas')
    const c = getCampaign(id(ctx.params.id))
    const b = await ctx.body()
    const restore = !!b.restore
    if (!restore && c.status === 'ativa') fail(409, 'campanha_ativa', 'Pause ou encerre a campanha antes de arquivar.')
    run(`UPDATE campaigns SET archived_at = ${restore ? 'NULL' : "datetime('now')"}, updated_at = datetime('now') WHERE id = ?`, c.id)
    campaignHistory(c.id, u, restore ? 'restaurada' : 'arquivada')
    audit(u, restore ? 'campanha.restaurar' : 'campanha.arquivar', 'campaign', c.id)
    emit(['campaigns', 'dashboard'], { campaignId: c.id, public: true })
    return { ok: true }
  })
  r.post('/api/admin/campaigns/:id/documents', async ctx => {
    const u = requirePerm(ctx, 'campanhas')
    const c = getCampaign(id(ctx.params.id))
    const b = await ctx.body()
    const kind = oneOf(b.kind || 'outro', ['autorizacao', 'parecer_juridico', 'regulamento_aprovado', 'contrato', 'nota_fiscal', 'outro'] as const, 'Tipo')
    const ins = run('INSERT INTO campaign_documents (campaign_id, kind, title, file_url, number, issued_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      c.id, kind, str(b.title, 'Título', { required: true, max: 200 }), str(b.file_url, 'Arquivo', { max: 500 }), str(b.number, 'Número', { max: 120 }), dateOrNull(b.issued_at, 'Data'), u.id)
    campaignHistory(c.id, u, 'documento_adicionado', { tipo: kind, titulo: b.title })
    audit(u, 'campanha.documento', 'campaign', c.id, { kind, title: b.title })
    return json({ id: Number(ins.lastInsertRowid) }, 201)
  })
  r.delete('/api/admin/campaigns/:id/documents/:doc', ctx => {
    const u = requirePerm(ctx, 'campanhas')
    const c = getCampaign(id(ctx.params.id))
    if (c.status === 'apurada') fail(409, 'campanha_apurada', 'Documentos de campanha apurada não podem ser removidos.')
    const d = get<any>('SELECT * FROM campaign_documents WHERE id = ? AND campaign_id = ?', id(ctx.params.doc), c.id)
    if (!d) fail(404, 'nao_encontrado', 'Documento não encontrado.')
    run('DELETE FROM campaign_documents WHERE id = ?', d.id)
    campaignHistory(c.id, u, 'documento_removido', { titulo: d.title })
    audit(u, 'campanha.documento_remover', 'campaign', c.id, { title: d.title })
    return { ok: true }
  })

  // ============================== IDENTIFICADORES ==============================
  r.get('/api/admin/campaigns/:id/numbers', ctx => {
    requirePerm(ctx, 'identificadores')
    const c = getCampaign(id(ctx.params.id))
    const rows = all<any>('SELECT n.number, n.status, n.participant_id, n.participation_id, p.simulated FROM numbers n LEFT JOIN participations p ON p.id = n.participation_id WHERE n.campaign_id = ? ORDER BY n.number', c.id)
    return { digits: c.number_digits, total: c.total_numbers, items: rows.map(r => [r.number, r.status, r.participant_id, r.simulated ?? 0]) }
  })
  r.get('/api/admin/campaigns/:id/numbers/:n', ctx => {
    requirePerm(ctx, 'identificadores')
    const c = getCampaign(id(ctx.params.id))
    const n = get<any>(`SELECT n.*, pt.name AS participant_name, pt.phone AS participant_phone, pa.status AS participation_status, pa.simulated, a.name AS affiliate_name
      FROM numbers n LEFT JOIN participants pt ON pt.id = n.participant_id LEFT JOIN participations pa ON pa.id = n.participation_id LEFT JOIN affiliates a ON a.id = pa.affiliate_id
      WHERE n.campaign_id = ? AND n.number = ?`, c.id, Number(ctx.params.n))
    if (!n) fail(404, 'numero_inexistente', 'Identificador não existe.')
    n.label = fmtNumber(n.number, c.number_digits)
    n.history = all<any>('SELECT h.*, u.name AS user_name FROM number_history h LEFT JOIN users u ON u.id = h.user_id WHERE campaign_id = ? AND number = ? ORDER BY h.id DESC', c.id, n.number)
    return n
  })
  r.post('/api/admin/campaigns/:id/numbers/:n/status', async ctx => {
    const u = requirePerm(ctx, 'identificadores')
    const c = getCampaign(id(ctx.params.id))
    const b = await ctx.body()
    const out = setNumberStatus(c.id, Number(ctx.params.n), oneOf(b.status, ['disponivel', 'bloqueado', 'cancelado'] as const, 'Status'), u, str(b.note, 'Motivo', { max: 300 }))
    emit(['numbers', 'progress'], { campaignId: c.id })
    return out
  })

  // ============================== PARTICIPANTES ==============================
  const partFilter = (q: URLSearchParams) => {
    const where: string[] = ['1=1'], params: any[] = []
    if (q.get('campaign_id')) { where.push('p.campaign_id = ?'); params.push(Number(q.get('campaign_id'))) }
    if (q.get('affiliate_id')) { if (q.get('affiliate_id') === '0') where.push('p.affiliate_id IS NULL'); else { where.push('p.affiliate_id = ?'); params.push(Number(q.get('affiliate_id'))) } }
    if (q.get('status')) { where.push('p.status = ?'); params.push(q.get('status')) }
    if (q.get('simulated')) { where.push('p.simulated = ?'); params.push(q.get('simulated') === '1' ? 1 : 0) }
    if (q.get('q')) {
      const s = `%${q.get('q')}%`, d = (q.get('q') || '').replace(/\D/g, '')
      where.push(`(p.name LIKE ? OR p.email LIKE ? ${d ? 'OR p.phone LIKE ?' : ''} OR p.id IN (SELECT participant_id FROM numbers WHERE campaign_id = p.campaign_id AND CAST(number AS TEXT) = ?))`)
      params.push(s, s); if (d) params.push(`%${d}%`); params.push(String(Number(d || -1)))
    }
    period(q, 'p.created_at', where, params)
    return { where: where.join(' AND '), params }
  }
  r.get('/api/admin/participants', ctx => {
    requirePerm(ctx, 'participantes')
    const { where, params } = partFilter(ctx.query)
    const base = `FROM participants p JOIN campaigns c ON c.id = p.campaign_id LEFT JOIN affiliates a ON a.id = p.affiliate_id WHERE ${where}`
    const sel = `SELECT p.*, c.name AS campaign_name, c.number_digits, a.name AS affiliate_name, a.code AS affiliate_code,
      (SELECT GROUP_CONCAT(n.number) FROM numbers n JOIN participations pa ON pa.id = n.participation_id WHERE n.participant_id = p.id AND n.status = 'atribuido') AS numbers ${base} ORDER BY p.id DESC`
    const fmt = (r: any) => ({ ...r, numbers: (r.numbers ? String(r.numbers).split(',').map(Number).sort((a, b) => a - b) : []).map((n: number) => fmtNumber(n, r.number_digits)) })
    if (ctx.query.get('format') === 'csv') {
      const rows = all<any>(sel, ...params).map(fmt).map(r => ({ ...r, numbers: r.numbers.join(' '), simulated: r.simulated ? 'sim' : 'não' }))
      return csv('participantes.csv', [
        { key: 'id', label: 'ID' }, { key: 'name', label: 'Nome' }, { key: 'phone', label: 'Telefone' }, { key: 'email', label: 'E-mail' }, { key: 'document', label: 'Documento' },
        { key: 'campaign_name', label: 'Campanha' }, { key: 'numbers', label: 'Identificadores' }, { key: 'affiliate_name', label: 'Afiliado' }, { key: 'status', label: 'Status' },
        { key: 'origin', label: 'Origem' }, { key: 'simulated', label: 'Simulação' }, { key: 'created_at', label: 'Cadastro' },
      ], rows)
    }
    const { p, per, off } = page(ctx.query)
    const total = get<any>(`SELECT COUNT(*) AS n ${base}`, ...params).n
    return { items: all<any>(`${sel} LIMIT ? OFFSET ?`, ...params, per, off).map(fmt), total, page: p, per }
  })
  r.get('/api/admin/participants/:id', ctx => {
    requirePerm(ctx, 'participantes')
    const p = get<any>('SELECT p.*, c.name AS campaign_name, c.number_digits, a.name AS affiliate_name FROM participants p JOIN campaigns c ON c.id = p.campaign_id LEFT JOIN affiliates a ON a.id = p.affiliate_id WHERE p.id = ?', id(ctx.params.id))
    if (!p) fail(404, 'nao_encontrado', 'Participante não encontrado.')
    p.participations = all<any>('SELECT id FROM participations WHERE participant_id = ? ORDER BY id DESC', p.id).map(x => getParticipation(x.id))
    return p
  })
  const readParticipant = (b: any) => ({
    name: str(b.name, 'Nome', { required: true, min: 3, max: 120 }),
    phone: phone(b.phone),
    email: email(b.email),
    document: str(b.document, 'Documento', { max: 30 }).replace(/[^\dA-Za-z]/g, ''),
    affiliate_id: b.affiliate_id ? Number(b.affiliate_id) : null,
    status: oneOf(b.status || 'interessado', ['interessado', 'ativo', 'inativo', 'bloqueado'] as const, 'Status'),
  })
  r.post('/api/admin/participants', async ctx => {
    const u = requirePerm(ctx, 'participantes')
    const b = await ctx.body()
    const c = getCampaign(Number(b.campaign_id))
    const o = readParticipant(b)
    if (o.affiliate_id && !get('SELECT id FROM affiliates WHERE id = ?', o.affiliate_id)) fail(422, 'afiliado_invalido', 'Afiliado inválido.')
    if (get('SELECT id FROM participants WHERE campaign_id = ? AND phone = ?', c.id, o.phone)) fail(409, 'ja_cadastrado', 'Já existe participante com este telefone nesta campanha.')
    const ins = run("INSERT INTO participants (campaign_id, affiliate_id, name, phone, email, document, status, origin, simulated, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'painel', ?, datetime('now'))",
      c.id, o.affiliate_id, o.name, o.phone, o.email, o.document, o.status, b.simulated === false ? 0 : 1)
    const pid = Number(ins.lastInsertRowid)
    audit(u, 'participante.criar', 'participant', pid, { campaign_id: c.id, name: o.name })
    emit(['participants', 'dashboard', 'referrals'], { campaignId: c.id, affiliateIds: [o.affiliate_id] })
    return json({ id: pid }, 201)
  })
  r.put('/api/admin/participants/:id', async ctx => {
    const u = requirePerm(ctx, 'participantes')
    const cur = get<any>('SELECT * FROM participants WHERE id = ?', id(ctx.params.id))
    if (!cur) fail(404, 'nao_encontrado', 'Participante não encontrado.')
    const o = readParticipant(await ctx.body())
    if (get('SELECT id FROM participants WHERE campaign_id = ? AND phone = ? AND id != ?', cur.campaign_id, o.phone, cur.id)) fail(409, 'ja_cadastrado', 'Já existe participante com este telefone nesta campanha.')
    // afiliado de quem já tem participação confirmada não muda (comissão já foi gerada para o original)
    if (o.affiliate_id !== cur.affiliate_id && get("SELECT id FROM participations WHERE participant_id = ? AND status != 'cancelada'", cur.id)) {
      fail(409, 'afiliado_travado', 'Participante já tem participação: o afiliado da indicação não pode ser trocado.')
    }
    run('UPDATE participants SET name = ?, phone = ?, email = ?, document = ?, affiliate_id = ?, status = ? WHERE id = ?', o.name, o.phone, o.email, o.document, o.affiliate_id, o.status, cur.id)
    audit(u, 'participante.editar', 'participant', cur.id, { antes: { name: cur.name, phone: cur.phone, status: cur.status, affiliate_id: cur.affiliate_id }, depois: o })
    emit(['participants'], { campaignId: cur.campaign_id })
    return { ok: true }
  })
  r.delete('/api/admin/participants/:id', ctx => {
    const u = requirePerm(ctx, 'participantes')
    const cur = get<any>('SELECT * FROM participants WHERE id = ?', id(ctx.params.id))
    if (!cur) fail(404, 'nao_encontrado', 'Participante não encontrado.')
    if (get('SELECT id FROM participations WHERE participant_id = ?', cur.id)) fail(409, 'tem_participacoes', 'Participante com histórico de participação não pode ser excluído — marque como inativo.')
    run('DELETE FROM participants WHERE id = ?', cur.id)
    audit(u, 'participante.excluir', 'participant', cur.id, { name: cur.name })
    emit(['participants', 'dashboard'], { campaignId: cur.campaign_id })
    return { ok: true }
  })

  // ============================== PARTICIPAÇÕES ==============================
  r.get('/api/admin/participations', ctx => {
    requirePerm(ctx, 'participantes')
    const q = ctx.query, where = ['1=1'], params: any[] = []
    if (q.get('campaign_id')) { where.push('pa.campaign_id = ?'); params.push(Number(q.get('campaign_id'))) }
    if (q.get('status')) { where.push('pa.status = ?'); params.push(q.get('status')) }
    if (q.get('affiliate_id')) { where.push('pa.affiliate_id = ?'); params.push(Number(q.get('affiliate_id'))) }
    period(q, 'pa.created_at', where, params)
    const { p, per, off } = page(q)
    const base = `FROM participations pa JOIN participants pt ON pt.id = pa.participant_id JOIN campaigns c ON c.id = pa.campaign_id LEFT JOIN affiliates a ON a.id = pa.affiliate_id WHERE ${where.join(' AND ')}`
    const total = get<any>(`SELECT COUNT(*) AS n ${base}`, ...params).n
    const items = all<any>(`SELECT pa.*, pt.name AS participant_name, c.name AS campaign_name, c.number_digits, a.name AS affiliate_name ${base} ORDER BY pa.id DESC LIMIT ? OFFSET ?`, ...params, per, off)
      .map(x => ({ ...x, numbers: all<any>('SELECT number FROM numbers WHERE participation_id = ? ORDER BY number', x.id).map(n => fmtNumber(n.number, x.number_digits)) }))
    return { items, total, page: p, per }
  })
  r.post('/api/admin/participations', async ctx => {
    const u = requirePerm(ctx, 'participantes')
    const b = await ctx.body()
    const nums = typeof b.numbers === 'string' ? b.numbers.split(/[\s,;]+/).filter(Boolean).map(Number) : Array.isArray(b.numbers) ? b.numbers.map(Number) : undefined
    if (nums?.some((n: number) => !Number.isInteger(n))) fail(422, 'numero_invalido', 'Identificadores devem ser números inteiros.')
    return json(createParticipation({ campaignId: Number(b.campaign_id), participantId: Number(b.participant_id), quantity: b.quantity, numbers: nums, simulated: b.simulated !== false, user: u, confirm: !!b.confirm }), 201)
  })
  r.post('/api/admin/participations/:id/confirm', ctx => confirmParticipation(id(ctx.params.id), requirePerm(ctx, 'participantes')))
  r.post('/api/admin/participations/:id/cancel', async ctx => {
    const u = requirePerm(ctx, 'participantes')
    const b = await ctx.body()
    return cancelParticipation(id(ctx.params.id), u, str(b.reason, 'Motivo', { required: true, min: 3, max: 300 }))
  })

  // ============================== AFILIADOS ==============================
  r.get('/api/admin/affiliates', ctx => {
    requirePerm(ctx, 'afiliados')
    const rows = all<any>(`SELECT a.*, u.email AS login_email, u.active AS login_active, u.last_login_at,
      (SELECT COUNT(*) FROM participants p WHERE p.affiliate_id = a.id) AS referrals,
      (SELECT COUNT(*) FROM referral_visits v WHERE v.affiliate_id = a.id) AS visits,
      (SELECT COALESCE(SUM(quantity),0) FROM participations x WHERE x.affiliate_id = a.id AND x.status = 'confirmada') AS valid,
      (SELECT COALESCE(SUM(amount),0) FROM commissions co WHERE co.affiliate_id = a.id AND co.status = 'pendente') AS c_pending,
      (SELECT COALESCE(SUM(amount),0) FROM commissions co WHERE co.affiliate_id = a.id AND co.status = 'aprovada') AS c_approved,
      (SELECT COALESCE(SUM(amount),0) FROM commissions co WHERE co.affiliate_id = a.id AND co.status = 'paga') AS c_paid
      FROM affiliates a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC`)
    if (ctx.query.get('format') === 'csv') return csv('afiliados.csv', [
      { key: 'name', label: 'Nome' }, { key: 'code', label: 'Código' }, { key: 'email', label: 'E-mail' }, { key: 'phone', label: 'Telefone' }, { key: 'status', label: 'Status' },
      { key: 'visits', label: 'Visitas' }, { key: 'referrals', label: 'Indicações' }, { key: 'valid', label: 'Participações válidas' },
      { key: 'c_pending', label: 'Comissão pendente' }, { key: 'c_approved', label: 'Comissão aprovada' }, { key: 'c_paid', label: 'Comissão paga' },
    ], rows)
    return rows
  })
  const readAffiliate = (b: any) => {
    const code = str(b.code, 'Código', { required: true, min: 3, max: 20 }).toUpperCase()
    if (!/^[A-Z0-9_-]+$/.test(code)) fail(422, 'codigo_invalido', 'Código só pode ter letras, números, - e _.', { field: 'Código' })
    return {
      name: str(b.name, 'Nome', { required: true, min: 3, max: 120 }), code,
      email: email(b.email, 'E-mail', true), phone: phone(b.phone, 'Telefone', false),
      document: str(b.document, 'Documento', { max: 30 }), pix_key_type: b.pix_key ? String(b.pix_key_type || '') : '',
      pix_key: b.pix_key ? validatePixKey(String(b.pix_key_type || ''), String(b.pix_key)) : '',
      pix_holder: str(b.pix_holder, 'Titular da chave', { max: 120 }),
      commission_override: num(b.commission_override, 'Comissão própria', { min: 0, max: 100000 }),
      status: oneOf(b.status || 'ativo', ['ativo', 'suspenso', 'inativo'] as const, 'Status'),
    }
  }
  r.post('/api/admin/affiliates', async ctx => {
    const u = requirePerm(ctx, 'afiliados')
    const b = await ctx.body()
    const o = readAffiliate(b)
    const pass = b.password ? String(b.password) : 'Af' + randomBytes(4).toString('hex') + '9'
    validatePassword(pass)
    if (get('SELECT id FROM affiliates WHERE code = ?', o.code)) fail(409, 'codigo_em_uso', 'Este código já está em uso.', { field: 'Código' })
    if (get('SELECT id FROM users WHERE email = ?', o.email)) fail(409, 'email_em_uso', 'Já existe usuário com este e-mail.', { field: 'E-mail' })
    const hash = await hashPassword(pass)
    const aid = tx(() => {
      const uid = Number(run("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'afiliado')", o.name, o.email, hash).lastInsertRowid)
      const ins = run('INSERT INTO affiliates (user_id, name, code, phone, email, document, pix_key_type, pix_key, pix_holder, commission_override, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        uid, o.name, o.code, o.phone, o.email, o.document, o.pix_key_type, o.pix_key, o.pix_holder || o.name, o.commission_override, o.status)
      return Number(ins.lastInsertRowid)
    })
    audit(u, 'afiliado.criar', 'affiliate', aid, { name: o.name, code: o.code })
    emit(['affiliates', 'dashboard'])
    return json({ id: aid, temp_password: b.password ? null : pass }, 201)
  })
  r.put('/api/admin/affiliates/:id', async ctx => {
    const u = requirePerm(ctx, 'afiliados')
    const a = get<any>('SELECT * FROM affiliates WHERE id = ?', id(ctx.params.id))
    if (!a) fail(404, 'nao_encontrado', 'Afiliado não encontrado.')
    const o = readAffiliate(await ctx.body())
    if (get('SELECT id FROM affiliates WHERE code = ? AND id != ?', o.code, a.id)) fail(409, 'codigo_em_uso', 'Este código já está em uso.', { field: 'Código' })
    if (get('SELECT id FROM users WHERE email = ? AND id != ?', o.email, a.user_id)) fail(409, 'email_em_uso', 'Já existe usuário com este e-mail.', { field: 'E-mail' })
    // chave PIX: só o organizador troca, e nunca com saque em andamento
    const pixChanged = (a.pix_key || '') !== o.pix_key || (a.pix_key_type || '') !== o.pix_key_type
    if (pixChanged && get("SELECT id FROM withdrawals WHERE affiliate_id = ? AND status = 'solicitado'", a.id)) {
      fail(409, 'saque_aberto', 'Este afiliado tem um saque em andamento. Pague ou recuse antes de trocar a chave PIX.')
    }
    tx(() => {
      run("UPDATE affiliates SET name = ?, code = ?, phone = ?, email = ?, document = ?, pix_key_type = ?, pix_key = ?, pix_holder = ?, commission_override = ?, status = ?, pending = CASE WHEN ? = 'ativo' THEN 0 ELSE pending END WHERE id = ?",
        o.name, o.code, o.phone, o.email, o.document, o.pix_key_type, o.pix_key, o.pix_holder || o.name, o.commission_override, o.status, o.status, a.id)
      run('UPDATE users SET name = ?, email = ?, active = ?, token_version = token_version + CASE WHEN ? != \'ativo\' THEN 1 ELSE 0 END WHERE id = ?', o.name, o.email, o.status === 'inativo' ? 0 : 1, o.status, a.user_id)
    })
    const pixLog = pixChanged ? `${a.pix_key_type || '-'}:${String(a.pix_key || '').slice(-4)} → ${o.pix_key_type || '-'}:${o.pix_key.slice(-4)}` : undefined
    audit(u, 'afiliado.editar', 'affiliate', a.id, { antes: { code: a.code, status: a.status, commission_override: a.commission_override }, depois: { code: o.code, status: o.status, commission_override: o.commission_override }, chave_pix_trocada: pixLog })
    emit(['affiliates'], { affiliateIds: [a.id] })
    return { ok: true }
  })
  r.post('/api/admin/affiliates/:id/reset-password', async ctx => {
    const u = requirePerm(ctx, 'afiliados')
    const a = get<any>('SELECT * FROM affiliates WHERE id = ?', id(ctx.params.id))
    if (!a) fail(404, 'nao_encontrado', 'Afiliado não encontrado.')
    const pass = 'Af' + randomBytes(4).toString('hex') + '9'
    run('UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ?', await hashPassword(pass), a.user_id)
    audit(u, 'afiliado.redefinir_senha', 'affiliate', a.id)
    return { temp_password: pass }
  })

  // ============================== COMISSÕES ==============================
  const comFilter = (q: URLSearchParams) => {
    const where = ['1=1'], params: any[] = []
    if (q.get('campaign_id')) { where.push('co.campaign_id = ?'); params.push(Number(q.get('campaign_id'))) }
    if (q.get('affiliate_id')) { where.push('co.affiliate_id = ?'); params.push(Number(q.get('affiliate_id'))) }
    if (q.get('status')) { where.push('co.status = ?'); params.push(q.get('status')) }
    if (q.get('simulated')) { where.push('co.simulated = ?'); params.push(q.get('simulated') === '1' ? 1 : 0) }
    period(q, 'co.created_at', where, params)
    return { where: where.join(' AND '), params }
  }
  r.get('/api/admin/commissions', ctx => {
    requirePerm(ctx, 'comissoes')
    const { where, params } = comFilter(ctx.query)
    const base = `FROM commissions co JOIN affiliates a ON a.id = co.affiliate_id JOIN campaigns c ON c.id = co.campaign_id JOIN participations pa ON pa.id = co.participation_id JOIN participants pt ON pt.id = pa.participant_id WHERE ${where}`
    const sel = `SELECT co.*, a.name AS affiliate_name, a.code AS affiliate_code, c.name AS campaign_name, pt.name AS participant_name ${base} ORDER BY co.id DESC`
    if (ctx.query.get('format') === 'csv') {
      return csv('comissoes.csv', [
        { key: 'id', label: 'ID' }, { key: 'affiliate_name', label: 'Afiliado' }, { key: 'campaign_name', label: 'Campanha' }, { key: 'participant_name', label: 'Participante' },
        { key: 'quantity', label: 'Qtd' }, { key: 'unit_value_f', label: 'Valor unit.' }, { key: 'amount_f', label: 'Valor' }, { key: 'status', label: 'Status' }, { key: 'sim', label: 'Simulação' },
        { key: 'created_at', label: 'Gerada em' }, { key: 'paid_at', label: 'Paga em' }, { key: 'payment_ref', label: 'Ref. pagamento' },
      ], all<any>(sel, ...params).map(r => ({ ...r, unit_value_f: brl(r.unit_value), amount_f: brl(r.amount), sim: r.simulated ? 'sim' : 'não' })))
    }
    const { p, per, off } = page(ctx.query)
    const total = get<any>(`SELECT COUNT(*) AS n ${base}`, ...params).n
    const sums = Object.fromEntries(all<any>(`SELECT co.status, SUM(co.amount) AS v ${base} GROUP BY co.status`, ...params).map(r => [r.status, r.v]))
    const byAffiliate = all<any>(`SELECT a.id, a.name, a.code, a.pix_key,
      SUM(CASE WHEN co.status='pendente' THEN co.amount ELSE 0 END) AS pending,
      SUM(CASE WHEN co.status='aprovada' THEN co.amount ELSE 0 END) AS approved,
      SUM(CASE WHEN co.status='paga' THEN co.amount ELSE 0 END) AS paid ${base} GROUP BY a.id ORDER BY approved DESC`, ...params)
    return { items: all<any>(`${sel} LIMIT ? OFFSET ?`, ...params, per, off), total, page: p, per, sums, by_affiliate: byAffiliate }
  })
  r.get('/api/admin/commissions/:id/events', ctx => {
    requirePerm(ctx, 'comissoes')
    return all<any>('SELECT e.*, u.name AS user_name FROM commission_events e LEFT JOIN users u ON u.id = e.user_id WHERE commission_id = ? ORDER BY e.id', id(ctx.params.id))
  })
  r.post('/api/admin/commissions/:id/status', async ctx => {
    const u = requirePerm(ctx, 'comissoes')
    const b = await ctx.body()
    return changeCommission(id(ctx.params.id), oneOf(b.status, ['aprovada', 'paga', 'cancelada', 'estornada', 'pendente'] as const, 'Status'), u, str(b.note, 'Observação', { max: 300 }), str(b.payment_ref, 'Referência', { max: 120 }))
  })
  r.post('/api/admin/commissions/bulk', async ctx => {
    const u = requirePerm(ctx, 'comissoes')
    const b = await ctx.body()
    const to = oneOf(b.status, ['aprovada', 'paga'] as const, 'Status')
    const ids: number[] = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger).slice(0, 1000)
    const ok: number[] = [], errors: any[] = []
    for (const cid of ids) {
      try { changeCommission(cid, to, u, str(b.note, 'Observação', { max: 300 }), str(b.payment_ref, 'Referência', { max: 120 })); ok.push(cid) } catch (e: any) { errors.push({ id: cid, message: e.message }) }
    }
    return { ok, errors }
  })

  // ============================== FINANCEIRO (despesas) ==============================
  r.get('/api/admin/expenses', ctx => {
    requirePerm(ctx, 'financeiro')
    const where = ['1=1'], params: any[] = []
    if (ctx.query.get('campaign_id')) { where.push('e.campaign_id = ?'); params.push(Number(ctx.query.get('campaign_id'))) }
    period(ctx.query, 'e.date', where, params)
    const rows = all<any>(`SELECT e.*, c.name AS campaign_name FROM expenses e LEFT JOIN campaigns c ON c.id = e.campaign_id WHERE ${where.join(' AND ')} ORDER BY e.date DESC, e.id DESC`, ...params)
    if (ctx.query.get('format') === 'csv') return csv('despesas.csv', [{ key: 'date', label: 'Data' }, { key: 'description', label: 'Descrição' }, { key: 'category', label: 'Categoria' }, { key: 'campaign_name', label: 'Campanha' }, { key: 'amount_f', label: 'Valor' }], rows.map(r => ({ ...r, amount_f: brl(r.amount) })))
    return rows
  })
  const readExpense = (b: any) => ({
    campaign_id: b.campaign_id ? Number(b.campaign_id) : null,
    description: str(b.description, 'Descrição', { required: true, max: 200 }),
    category: oneOf(b.category || 'outros', ['premio', 'juridico', 'marketing', 'operacional', 'taxas', 'outros'] as const, 'Categoria'),
    amount: num(b.amount, 'Valor', { min: 0, max: 10_000_000, required: true }),
    date: (dateOrNull(b.date, 'Data') || new Date().toISOString()).slice(0, 10),
  })
  r.post('/api/admin/expenses', async ctx => {
    const u = requirePerm(ctx, 'financeiro')
    const o = readExpense(await ctx.body())
    const ins = run('INSERT INTO expenses (campaign_id, description, category, amount, date, created_by) VALUES (?, ?, ?, ?, ?, ?)', o.campaign_id, o.description, o.category, o.amount, o.date, u.id)
    audit(u, 'despesa.criar', 'expense', Number(ins.lastInsertRowid), o)
    emit(['expenses', 'dashboard'])
    return json({ id: Number(ins.lastInsertRowid) }, 201)
  })
  r.put('/api/admin/expenses/:id', async ctx => {
    const u = requirePerm(ctx, 'financeiro')
    const cur = get<any>('SELECT * FROM expenses WHERE id = ?', id(ctx.params.id))
    if (!cur) fail(404, 'nao_encontrado', 'Despesa não encontrada.')
    const o = readExpense(await ctx.body())
    run('UPDATE expenses SET campaign_id = ?, description = ?, category = ?, amount = ?, date = ? WHERE id = ?', o.campaign_id, o.description, o.category, o.amount, o.date, cur.id)
    audit(u, 'despesa.editar', 'expense', cur.id, { antes: cur, depois: o })
    emit(['expenses', 'dashboard'])
    return { ok: true }
  })
  r.delete('/api/admin/expenses/:id', ctx => {
    const u = requirePerm(ctx, 'financeiro')
    const cur = get<any>('SELECT * FROM expenses WHERE id = ?', id(ctx.params.id))
    if (!cur) fail(404, 'nao_encontrado', 'Despesa não encontrada.')
    run('DELETE FROM expenses WHERE id = ?', cur.id)
    audit(u, 'despesa.excluir', 'expense', cur.id, cur)
    emit(['expenses', 'dashboard'])
    return { ok: true }
  })

  // ============================== APURAÇÃO ==============================
  r.get('/api/admin/draws', ctx => {
    requirePerm(ctx, 'apuracao')
    const where = ctx.query.get('campaign_id') ? 'WHERE d.campaign_id = ' + Number(ctx.query.get('campaign_id')) : ''
    return {
      items: all<any>(`SELECT d.*, c.name AS campaign_name, c.number_digits, u.name AS user_name, pt.name AS winner_name FROM draws d JOIN campaigns c ON c.id = d.campaign_id LEFT JOIN users u ON u.id = d.created_by LEFT JOIN participants pt ON pt.id = d.winner_participant_id ${where} ORDER BY d.id DESC`)
        .map(d => ({ ...d, report: parseJSON(d.report, {}), winning_label: fmtNumber(d.winning_number, d.number_digits) })),
      chain: verifyDrawChain(),
      rules: DRAW_RULES,
    }
  })
  r.get('/api/admin/draws/federal', async ctx => {
    requirePerm(ctx, 'apuracao')
    return fetchFederal(ctx.query.get('extraction') || undefined)
  })
  r.post('/api/admin/draws', async ctx => {
    const u = requirePerm(ctx, 'apuracao')
    const b = await ctx.body()
    const mode = oneOf(b.mode, ['simulacao', 'oficial'] as const, 'Modo')
    let data = { extraction_number: String(b.extraction_number || ''), extraction_date: String(b.extraction_date || ''), first_prize: String(b.first_prize || ''), source: 'manual' as 'manual' | 'caixa_api', source_verified: false }
    if (b.source === 'caixa_api') {
      // valida a origem: busca de novo no servidor, nunca confia no número vindo do navegador
      const f = await fetchFederal(String(b.extraction_number || '') || undefined)
      data = { extraction_number: f.extraction_number, extraction_date: f.extraction_date, first_prize: f.first_prize, source: 'caixa_api', source_verified: true }
    } else if (!data.extraction_date) fail(422, 'data_obrigatoria', 'Informe a data da extração.')
    return json(registerDraw({ campaignId: Number(b.campaign_id), mode, ...data, source_detail: str(b.source_detail, 'Fonte', { max: 500 }), user: u }), 201)
  })

  // ============================== PRÊMIOS ==============================
  r.get('/api/admin/prizes', ctx => {
    requirePerm(ctx, 'premios')
    const where = ctx.query.get('campaign_id') ? 'WHERE p.campaign_id = ' + Number(ctx.query.get('campaign_id')) : ''
    return all<any>(`SELECT p.*, c.name AS campaign_name, c.number_digits, pt.name AS winner_name, pt.phone AS winner_phone FROM prizes p JOIN campaigns c ON c.id = p.campaign_id LEFT JOIN participants pt ON pt.id = p.winner_participant_id ${where} ORDER BY p.campaign_id DESC, p.id`)
      .map(p => ({ ...p, images: parseJSON(p.images, []), documents: parseJSON(p.documents, []), history: all<any>('SELECT h.*, u.name AS user_name FROM prize_history h LEFT JOIN users u ON u.id = h.user_id WHERE prize_id = ? ORDER BY h.id DESC', p.id) }))
  })
  const readPrize = (b: any) => ({
    kind: oneOf(b.kind || 'principal', ['principal', 'alternativo', 'secundario'] as const, 'Tipo'),
    title: str(b.title, 'Título', { required: true, max: 160 }),
    description: str(b.description, 'Descrição', { max: 4000 }),
    images: JSON.stringify((Array.isArray(b.images) ? b.images : []).slice(0, 12)),
    documents: JSON.stringify((Array.isArray(b.documents) ? b.documents : []).slice(0, 20)),
    estimated_value: num(b.estimated_value ?? 0, 'Valor estimado', { min: 0, max: 100_000_000 }) ?? 0,
    delivery_conditions: str(b.delivery_conditions, 'Condições de entrega', { max: 4000 }),
    is_cash: b.is_cash ? 1 : 0,
    legal_approved: b.legal_approved ? 1 : 0,
    public: b.public === false ? 0 : 1,
    notes: str(b.notes, 'Observações', { max: 2000 }),
  })
  r.post('/api/admin/prizes', async ctx => {
    const u = requirePerm(ctx, 'premios')
    const b = await ctx.body()
    const c = getCampaign(Number(b.campaign_id))
    const o = readPrize(b)
    if (o.legal_approved && !legalGate(c).allowed) fail(403, 'regularizacao_pendente', 'Só é possível marcar validação jurídica depois da regularização da campanha.', { reasons: legalGate(c).reasons })
    const ins = run('INSERT INTO prizes (campaign_id, kind, title, description, images, documents, estimated_value, delivery_conditions, is_cash, legal_approved, public, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      c.id, o.kind, o.title, o.description, o.images, o.documents, o.estimated_value, o.delivery_conditions, o.is_cash, o.legal_approved, o.public, o.notes)
    const pid = Number(ins.lastInsertRowid)
    run("INSERT INTO prize_history (prize_id, action, user_id) VALUES (?, 'criado', ?)", pid, u.id)
    audit(u, 'premio.criar', 'prize', pid, { title: o.title })
    emit(['prizes'], { campaignId: c.id, public: true })
    return json({ id: pid }, 201)
  })
  r.put('/api/admin/prizes/:id', async ctx => {
    const u = requirePerm(ctx, 'premios')
    const cur = get<any>('SELECT * FROM prizes WHERE id = ?', id(ctx.params.id))
    if (!cur) fail(404, 'nao_encontrado', 'Prêmio não encontrado.')
    const c = getCampaign(cur.campaign_id)
    const o = readPrize(await ctx.body())
    if (o.legal_approved && !cur.legal_approved && !legalGate(c).allowed) fail(403, 'regularizacao_pendente', 'Só é possível marcar validação jurídica depois da regularização da campanha.', { reasons: legalGate(c).reasons })
    run("UPDATE prizes SET kind = ?, title = ?, description = ?, images = ?, documents = ?, estimated_value = ?, delivery_conditions = ?, is_cash = ?, legal_approved = ?, public = ?, notes = ?, updated_at = datetime('now') WHERE id = ?",
      o.kind, o.title, o.description, o.images, o.documents, o.estimated_value, o.delivery_conditions, o.is_cash, o.legal_approved, o.public, o.notes, cur.id)
    run("INSERT INTO prize_history (prize_id, action, user_id) VALUES (?, 'editado', ?)", cur.id, u.id)
    audit(u, 'premio.editar', 'prize', cur.id, { title: o.title })
    emit(['prizes'], { campaignId: cur.campaign_id, public: true })
    return { ok: true }
  })
  r.post('/api/admin/prizes/:id/delivery', async ctx => {
    const u = requirePerm(ctx, 'premios')
    const cur = get<any>('SELECT * FROM prizes WHERE id = ?', id(ctx.params.id))
    if (!cur) fail(404, 'nao_encontrado', 'Prêmio não encontrado.')
    const b = await ctx.body()
    const to = oneOf(b.status, ['em_entrega', 'entregue', 'cancelado'] as const, 'Status da entrega')
    if (!cur.winner_participant_id && to !== 'cancelado') fail(409, 'sem_contemplado', 'O contemplado só é definido pela apuração oficial.')
    run(`UPDATE prizes SET delivery_status = ?, delivered_at = ${to === 'entregue' ? "datetime('now')" : 'delivered_at'}, updated_at = datetime('now') WHERE id = ?`, to, cur.id)
    run('INSERT INTO prize_history (prize_id, action, note, user_id) VALUES (?, ?, ?, ?)', cur.id, to, str(b.note, 'Observação', { max: 500 }), u.id)
    audit(u, 'premio.entrega', 'prize', cur.id, { de: cur.delivery_status, para: to })
    emit(['prizes'], { campaignId: cur.campaign_id })
    return { ok: true }
  })
  r.delete('/api/admin/prizes/:id', ctx => {
    const u = requirePerm(ctx, 'premios')
    const cur = get<any>('SELECT * FROM prizes WHERE id = ?', id(ctx.params.id))
    if (!cur) fail(404, 'nao_encontrado', 'Prêmio não encontrado.')
    if (cur.winner_participant_id) fail(409, 'premio_com_contemplado', 'Prêmio com contemplado não pode ser excluído.')
    run('DELETE FROM prizes WHERE id = ?', cur.id)
    audit(u, 'premio.excluir', 'prize', cur.id, { title: cur.title })
    emit(['prizes'], { campaignId: cur.campaign_id, public: true })
    return { ok: true }
  })

  // ============================== RELATÓRIOS ==============================
  r.get('/api/admin/reports/:kind', ctx => {
    requirePerm(ctx, 'relatorios')
    const q = ctx.query, kind = ctx.params.kind
    const where: string[] = ['1=1'], params: any[] = []
    const cid = q.get('campaign_id') ? Number(q.get('campaign_id')) : null
    const aid = q.get('affiliate_id') ? Number(q.get('affiliate_id')) : null
    let columns: { key: string; label: string }[] = [], rows: any[] = []
    if (kind === 'participacoes') {
      if (cid) { where.push('campaign_id = ?'); params.push(cid) }
      if (aid) { where.push('affiliate_id = ?'); params.push(aid) }
      if (q.get('status')) { where.push('status = ?'); params.push(q.get('status')) }
      period(q, 'created_at', where, params)
      rows = all<any>(`SELECT date(created_at) AS dia, COUNT(*) AS participacoes, SUM(quantity) AS identificadores,
        SUM(CASE WHEN status='confirmada' THEN quantity ELSE 0 END) AS confirmados, SUM(CASE WHEN status='cancelada' THEN quantity ELSE 0 END) AS cancelados,
        SUM(CASE WHEN simulated=1 THEN quantity ELSE 0 END) AS simulados FROM participations WHERE ${where.join(' AND ')} GROUP BY dia ORDER BY dia DESC`, ...params)
      columns = [{ key: 'dia', label: 'Dia' }, { key: 'participacoes', label: 'Participações' }, { key: 'identificadores', label: 'Identificadores' }, { key: 'confirmados', label: 'Confirmados' }, { key: 'cancelados', label: 'Cancelados' }, { key: 'simulados', label: 'Simulados' }]
    } else if (kind === 'campanhas') {
      rows = all<any>(`SELECT * FROM campaigns ${cid ? 'WHERE id = ' + cid : ''} ORDER BY id DESC`).map(c => {
        const p = progress(c.id)!
        return { campanha: c.name, status: CAMPAIGN_STATUS_LABEL[c.status], identificadores: c.total_numbers, atribuidos_reais: p.real_assigned, atribuidos_simulados: p.simulated_assigned, progresso_real: p.percent + '%', progresso_com_simulacao: p.percent_simulated + '%', bloqueados: p.counts.bloqueado, cancelados: p.counts.cancelado }
      })
      columns = [{ key: 'campanha', label: 'Campanha' }, { key: 'status', label: 'Status' }, { key: 'identificadores', label: 'Identificadores' }, { key: 'atribuidos_reais', label: 'Atribuídos (reais)' }, { key: 'atribuidos_simulados', label: 'Atribuídos (simulação)' }, { key: 'progresso_real', label: 'Progresso real' }, { key: 'progresso_com_simulacao', label: 'Com simulação' }, { key: 'bloqueados', label: 'Bloqueados' }, { key: 'cancelados', label: 'Cancelados' }]
    } else if (kind === 'afiliados') {
      const pw: string[] = [], pp: any[] = []
      period(q, 'x.created_at', pw, pp)
      const extra = (cid ? ` AND x.campaign_id = ${cid}` : '') + (pw.length ? ' AND ' + pw.join(' AND ') : '')
      rows = all<any>(`SELECT a.name AS afiliado, a.code AS codigo, a.status,
        (SELECT COUNT(*) FROM referral_visits x WHERE x.affiliate_id = a.id${cid ? ` AND x.campaign_id = ${cid}` : ''}) AS visitas,
        (SELECT COUNT(*) FROM participants x WHERE x.affiliate_id = a.id${extra}) AS indicacoes,
        (SELECT COALESCE(SUM(quantity),0) FROM participations x WHERE x.affiliate_id = a.id AND x.status='confirmada'${extra}) AS validas,
        (SELECT COALESCE(SUM(amount),0) FROM commissions x WHERE x.affiliate_id = a.id AND x.status IN ('pendente','aprovada','paga')${extra}) AS comissao
        FROM affiliates a ${aid ? 'WHERE a.id = ' + aid : ''} ORDER BY validas DESC`, ...pp, ...pp, ...pp)
        .map(r => ({ ...r, conversao: r.visitas ? Math.round((r.indicacoes * 100) / r.visitas) + '%' : '—', comissao: brl(r.comissao) }))
      columns = [{ key: 'afiliado', label: 'Afiliado' }, { key: 'codigo', label: 'Código' }, { key: 'status', label: 'Status' }, { key: 'visitas', label: 'Visitas' }, { key: 'indicacoes', label: 'Indicações' }, { key: 'conversao', label: 'Conversão' }, { key: 'validas', label: 'Participações válidas' }, { key: 'comissao', label: 'Comissão (R$)' }]
    } else if (kind === 'comissoes') {
      if (cid) { where.push('co.campaign_id = ?'); params.push(cid) }
      if (aid) { where.push('co.affiliate_id = ?'); params.push(aid) }
      if (q.get('status')) { where.push('co.status = ?'); params.push(q.get('status')) }
      period(q, 'co.created_at', where, params)
      rows = all<any>(`SELECT a.name AS afiliado, co.status, COUNT(*) AS registros, SUM(co.quantity) AS participacoes, SUM(co.amount) AS valor, SUM(co.simulated) AS simuladas
        FROM commissions co JOIN affiliates a ON a.id = co.affiliate_id WHERE ${where.join(' AND ')} GROUP BY a.id, co.status ORDER BY a.name`, ...params).map(r => ({ ...r, valor: brl(r.valor) }))
      columns = [{ key: 'afiliado', label: 'Afiliado' }, { key: 'status', label: 'Status' }, { key: 'registros', label: 'Registros' }, { key: 'participacoes', label: 'Participações' }, { key: 'valor', label: 'Valor (R$)' }, { key: 'simuladas', label: 'Simuladas' }]
    } else if (kind === 'financeiro') {
      if (cid) { where.push('campaign_id = ?'); params.push(cid) }
      period(q, 'date', where, params)
      rows = all<any>(`SELECT category AS categoria, COUNT(*) AS lancamentos, SUM(amount) AS total FROM expenses WHERE ${where.join(' AND ')} GROUP BY category ORDER BY total DESC`, ...params).map(r => ({ ...r, total: brl(r.total) }))
      const rw: string[] = ["status='confirmada'"], rp: any[] = []
      if (cid) { rw.push('campaign_id = ?'); rp.push(cid) }
      period(q, 'confirmed_at', rw, rp)
      const rev = get<any>(`SELECT COALESCE(SUM(CASE WHEN simulated=0 THEN quantity*unit_value END),0) AS real, COALESCE(SUM(CASE WHEN simulated=1 THEN quantity*unit_value END),0) AS sim FROM participations WHERE ${rw.join(' AND ')}`, ...rp)
      rows.unshift({ categoria: 'RECEITA REGISTRADA (real)', lancamentos: '—', total: brl(rev.real) }, { categoria: 'Receita simulada (não é real)', lancamentos: '—', total: brl(rev.sim) })
      columns = [{ key: 'categoria', label: 'Categoria' }, { key: 'lancamentos', label: 'Lançamentos' }, { key: 'total', label: 'Total (R$)' }]
    } else if (kind === 'resultados') {
      rows = all<any>(`SELECT d.id, c.name AS campanha, d.mode AS modo, d.extraction_number AS extracao, d.extraction_date AS data_extracao, d.first_prize AS primeiro_premio, d.winning_number, c.number_digits, d.winner_status AS situacao, pt.name AS contemplado, d.created_at AS registrado_em, substr(d.hash,1,16) AS hash
        FROM draws d JOIN campaigns c ON c.id = d.campaign_id LEFT JOIN participants pt ON pt.id = d.winner_participant_id ${cid ? 'WHERE d.campaign_id = ' + cid : ''} ORDER BY d.id DESC`)
        .map(r => ({ ...r, identificador: fmtNumber(r.winning_number, r.number_digits) }))
      columns = [{ key: 'campanha', label: 'Campanha' }, { key: 'modo', label: 'Modo' }, { key: 'extracao', label: 'Extração' }, { key: 'data_extracao', label: 'Data' }, { key: 'primeiro_premio', label: '1º prêmio' }, { key: 'identificador', label: 'Identificador' }, { key: 'situacao', label: 'Situação' }, { key: 'contemplado', label: 'Contemplado' }, { key: 'registrado_em', label: 'Registrado em' }, { key: 'hash', label: 'Hash' }]
    } else if (kind === 'premiacoes') {
      rows = all<any>(`SELECT p.title AS premio, c.name AS campanha, p.kind AS tipo, p.estimated_value, p.delivery_status AS entrega, pt.name AS contemplado, p.winner_number, c.number_digits, p.delivered_at AS entregue_em
        FROM prizes p JOIN campaigns c ON c.id = p.campaign_id LEFT JOIN participants pt ON pt.id = p.winner_participant_id ${cid ? 'WHERE p.campaign_id = ' + cid : ''} ORDER BY p.id DESC`)
        .map(r => ({ ...r, valor: brl(r.estimated_value), identificador: r.winner_number === null ? '' : fmtNumber(r.winner_number, r.number_digits) }))
      columns = [{ key: 'premio', label: 'Prêmio' }, { key: 'campanha', label: 'Campanha' }, { key: 'tipo', label: 'Tipo' }, { key: 'valor', label: 'Valor estimado (R$)' }, { key: 'entrega', label: 'Entrega' }, { key: 'contemplado', label: 'Contemplado' }, { key: 'identificador', label: 'Identificador' }, { key: 'entregue_em', label: 'Entregue em' }]
    } else fail(404, 'relatorio_inexistente', 'Relatório não encontrado.')
    if (q.get('format') === 'csv') return csv(`relatorio-${kind}.csv`, columns, rows)
    return { columns, rows }
  })

  // ============================== CONFIGURAÇÕES ==============================
  r.get('/api/admin/settings', ctx => { requireRole(ctx, 'admin'); return allSettings() })
  r.put('/api/admin/settings/:key', async ctx => {
    const u = requirePerm(ctx, 'configuracoes')
    const key = ctx.params.key
    if (!(key in DEFAULTS) || key === 'payments' || key === 'withdrawals') fail(404, 'chave_invalida', 'Configuração inexistente.')
    const b = await ctx.body()
    const clean: any = {}
    for (const k of Object.keys(DEFAULTS[key])) {
      if (!(k in b)) continue
      const def = DEFAULTS[key][k]
      clean[k] = typeof def === 'boolean' ? !!b[k] : typeof def === 'number' ? (num(b[k], k, { min: 0, max: 1_000_000 }) ?? def) : str(b[k], k, { max: 60000 })
    }
    if (key === 'security') {
      if (clean.password_min !== undefined && (clean.password_min < 8 || clean.password_min > 64)) fail(422, 'fora_do_limite', 'Senha mínima entre 8 e 64.')
      if (clean.session_hours !== undefined && (clean.session_hours < 1 || clean.session_hours > 720)) fail(422, 'fora_do_limite', 'Sessão entre 1 e 720 horas.')
    }
    if (key === 'commissions' && clean.approval) clean.approval = oneOf(clean.approval, ['manual', 'automatica'] as const, 'Aprovação')
    if (key === 'platform' && clean.primary_color && !/^#[0-9a-fA-F]{6}$/.test(clean.primary_color)) fail(422, 'cor_invalida', 'Cor inválida (use #RRGGBB).')
    if (key === 'notifications') { delete clean.email_enabled; delete clean.whatsapp_enabled } // dependem de integração ainda não configurada
    const saved = setSetting(key, clean)
    audit(u, 'configuracao.' + key, 'settings', null, key === 'legal' ? { ...clean, terms: clean.terms ? '(texto)' : undefined, privacy: clean.privacy ? '(texto)' : undefined } : clean)
    emit(['settings'], { public: true })
    return saved
  })
  r.get('/api/admin/legal-status', ctx => {
    requireRole(ctx, 'admin')
    return all<any>("SELECT * FROM campaigns WHERE archived_at IS NULL").map(c => ({ id: c.id, name: c.name, legal: legalGate(c), payments: paymentsGate(c) }))
  })

  // ============================== USUÁRIOS / PERMISSÕES ==============================
  r.get('/api/admin/users', ctx => {
    requirePerm(ctx, 'usuarios')
    return { items: all<any>("SELECT id, name, email, role, permissions, active, last_login_at, created_at FROM users ORDER BY role, id").map(u => ({ ...u, permissions: parseJSON(u.permissions, []) })), permissions: ADMIN_PERMS }
  })
  r.post('/api/admin/users', async ctx => {
    const u = requirePerm(ctx, 'usuarios')
    const b = await ctx.body()
    const name = str(b.name, 'Nome', { required: true, min: 3, max: 120 }), em = email(b.email, 'E-mail', true)
    const perms = (Array.isArray(b.permissions) ? b.permissions : []).filter((p: string) => p === '*' || (ADMIN_PERMS as readonly string[]).includes(p))
    validatePassword(String(b.password || ''))
    if (get('SELECT id FROM users WHERE email = ?', em)) fail(409, 'email_em_uso', 'Já existe usuário com este e-mail.', { field: 'E-mail' })
    const ins = run("INSERT INTO users (name, email, password_hash, role, permissions) VALUES (?, ?, ?, 'admin', ?)", name, em, await hashPassword(String(b.password)), JSON.stringify(perms))
    audit(u, 'usuario.criar', 'user', Number(ins.lastInsertRowid), { email: em, permissions: perms })
    return json({ id: Number(ins.lastInsertRowid) }, 201)
  })
  r.put('/api/admin/users/:id', async ctx => {
    const u = requirePerm(ctx, 'usuarios')
    const target = get<any>('SELECT * FROM users WHERE id = ?', id(ctx.params.id))
    if (!target) fail(404, 'nao_encontrado', 'Usuário não encontrado.')
    const b = await ctx.body()
    const active = b.active === false ? 0 : 1
    if (target.id === u.id && !active) fail(409, 'auto_desativar', 'Você não pode desativar o próprio usuário.')
    const perms = target.role === 'admin' ? (Array.isArray(b.permissions) ? b.permissions : parseJSON(target.permissions, [])).filter((p: string) => p === '*' || (ADMIN_PERMS as readonly string[]).includes(p)) : []
    if (target.id === u.id && !perms.includes('*') && !perms.includes('usuarios')) fail(409, 'auto_rebaixar', 'Você não pode remover sua própria permissão de usuários.')
    const name = str(b.name ?? target.name, 'Nome', { required: true, min: 3, max: 120 })
    run('UPDATE users SET name = ?, permissions = ?, active = ?, token_version = token_version + CASE WHEN ? = 0 THEN 1 ELSE 0 END WHERE id = ?', name, JSON.stringify(perms), active, active, target.id)
    if (b.password) { validatePassword(String(b.password)); run('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', await hashPassword(String(b.password)), target.id) }
    audit(u, 'usuario.editar', 'user', target.id, { permissions: perms, active, senha_trocada: !!b.password })
    return { ok: true }
  })

  // ============================== AUDITORIA ==============================
  r.get('/api/admin/audit', ctx => {
    requirePerm(ctx, 'auditoria')
    const q = ctx.query, where = ['1=1'], params: any[] = []
    if (q.get('entity')) { where.push('entity = ?'); params.push(q.get('entity')) }
    if (q.get('q')) { where.push('(action LIKE ? OR user_name LIKE ? OR data LIKE ?)'); params.push(`%${q.get('q')}%`, `%${q.get('q')}%`, `%${q.get('q')}%`) }
    period(q, 'at', where, params)
    const { p, per, off } = page(q)
    const total = get<any>(`SELECT COUNT(*) AS n FROM audit_log WHERE ${where.join(' AND ')}`, ...params).n
    const items = all<any>(`SELECT * FROM audit_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params, per, off).map(a => ({ ...a, data: parseJSON(a.data, {}) }))
    if (q.get('format') === 'csv') return csv('auditoria.csv', [{ key: 'at', label: 'Data' }, { key: 'user_name', label: 'Usuário' }, { key: 'action', label: 'Ação' }, { key: 'entity', label: 'Entidade' }, { key: 'entity_id', label: 'ID' }, { key: 'd', label: 'Dados' }, { key: 'ip', label: 'IP' }],
      all<any>(`SELECT * FROM audit_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 10000`, ...params).map(a => ({ ...a, d: a.data })))
    return { items, total, page: p, per }
  })

  // ============================== UPLOAD / SIMULAÇÃO ==============================
  r.post('/api/admin/uploads', async ctx => {
    const u = requireRole(ctx, 'admin')
    const form = await ctx.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!file || typeof file === 'string') fail(422, 'arquivo_obrigatorio', 'Selecione um arquivo.')
    const f = file as File
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' } as Record<string, string>)[f.type]
    if (!ext) fail(422, 'tipo_invalido', 'Envie JPG, PNG, WEBP ou PDF.')
    if (f.size > 8 * 1024 * 1024) fail(422, 'arquivo_grande', 'Arquivo maior que 8 MB.')
    mkdirSync(UPLOAD_DIR, { recursive: true })
    const name = `${Date.now()}-${randomBytes(6).toString('hex')}.${ext}`
    await Bun.write(join(UPLOAD_DIR, name), f)
    audit(u, 'upload', 'file', null, { name, size: f.size, type: f.type })
    return json({ url: `/uploads/${name}`, name: f.name, type: f.type }, 201)
  })
  r.post('/api/admin/simulation/clear', async ctx => {
    const u = requirePerm(ctx, 'configuracoes')
    const b = await ctx.body()
    if (b.confirm !== 'LIMPAR') fail(422, 'confirmacao', 'Digite LIMPAR para confirmar.')
    const res = tx(() => {
      const parts = all<any>('SELECT id, campaign_id FROM participations WHERE simulated = 1')
      for (const p of parts) {
        const nums = all<any>('SELECT number FROM numbers WHERE participation_id = ?', p.id)
        run("UPDATE numbers SET status = 'disponivel', participant_id = NULL, participation_id = NULL, updated_at = datetime('now') WHERE participation_id = ?", p.id)
        for (const n of nums) run("INSERT INTO number_history (campaign_id, number, to_status, user_id, note) VALUES (?, ?, 'disponivel', ?, 'limpeza dos dados de simulação')", p.campaign_id, n.number, u.id)
      }
      run('DELETE FROM commission_events WHERE commission_id IN (SELECT id FROM commissions WHERE simulated = 1)')
      const c = run('DELETE FROM commissions WHERE simulated = 1').changes
      run('DELETE FROM participations WHERE simulated = 1')
      run("UPDATE prizes SET winner_participant_id = NULL WHERE winner_participant_id IN (SELECT id FROM participants WHERE simulated = 1)")
      const pt = run('DELETE FROM participants WHERE simulated = 1 AND id NOT IN (SELECT participant_id FROM participations) AND id NOT IN (SELECT COALESCE(winner_participant_id,0) FROM draws)').changes
      return { participations: parts.length, commissions: c, participants: pt }
    })
    audit(u, 'simulacao.limpar', 'system', null, res)
    emit(['progress', 'participations', 'participants', 'commissions', 'numbers', 'dashboard'], { public: true })
    return res
  })
}
