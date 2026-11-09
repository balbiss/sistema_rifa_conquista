import { all, get, run, tx } from '../db'
import { email, fail, json, phone, str, type Router } from '../http'
import { hashPassword, requirePerm, validatePassword } from '../auth'
import { getSetting } from '../settings'
import { audit, notify } from '../services'
import { emit } from '../events'
import { validCPF } from '../payments'
import { validatePixKey } from '../withdrawals'

// Cadastro de afiliado pelo link (/seja-afiliado). Entra "aguardando aprovação" (a não ser que o
// organizador ligue a aprovação automática). A chave PIX informada aqui fica travada para o afiliado.

function makeCode(name: string) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/)[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'AFIL'
  for (let i = 0; i < 50; i++) {
    const code = `${base}${Math.floor(10 + Math.random() * 90)}`
    if (!get('SELECT id FROM affiliates WHERE code = ?', code)) return code
  }
  return `${base}${Date.now().toString().slice(-5)}`
}

export function affiliateSignupRoutes(r: Router) {
  r.get('/api/public/affiliate-signup', () => {
    const s = getSetting('affiliates')
    const camp = get<any>("SELECT commission_value FROM campaigns WHERE archived_at IS NULL AND status = 'ativa' ORDER BY featured DESC, id DESC LIMIT 1")
    const w = getSetting('withdrawals')
    return { enabled: !!s.signup_enabled, auto_approve: !!s.auto_approve, commission_value: camp?.commission_value ?? getSetting('commissions').default_value, min_withdrawal: w.min_balance, fee: w.fee }
  })

  r.post('/api/public/affiliate-signup', async ctx => {
    const s = getSetting('affiliates')
    if (!s.signup_enabled) fail(403, 'cadastro_fechado', 'O cadastro de afiliados está fechado no momento.')
    const b = await ctx.body()
    const name = str(b.name, 'Nome', { required: true, min: 3, max: 120 })
    if (name.split(/\s+/).length < 2) fail(422, 'nome_completo', 'Digite nome e sobrenome.', { field: 'Nome' })
    const cpf = String(b.cpf || '').replace(/\D/g, '')
    if (!validCPF(cpf)) fail(422, 'cpf_invalido', 'CPF inválido.', { field: 'CPF' })
    const ph = phone(b.phone, 'WhatsApp')
    const em = email(b.email, 'E-mail', true)
    validatePassword(String(b.password || ''))
    const pixType = String(b.pix_type || 'cpf')
    const pixKey = validatePixKey(pixType, String(b.pix_key || (pixType === 'cpf' ? cpf : '')))
    if (!b.consent) fail(422, 'consentimento', 'É preciso aceitar os Termos de uso e a Política de privacidade.')
    if (get('SELECT id FROM affiliates WHERE document = ?', cpf)) fail(409, 'cpf_em_uso', 'Já existe um afiliado com este CPF. Se for você, entre com seu e-mail e senha.', { field: 'CPF' })
    if (get('SELECT id FROM users WHERE email = ?', em)) fail(409, 'email_em_uso', 'Já existe uma conta com este e-mail.', { field: 'E-mail' })
    const auto = !!s.auto_approve
    const hash = await hashPassword(String(b.password))
    const aid = tx(() => {
      const uid = Number(run("INSERT INTO users (name, email, password_hash, role, active) VALUES (?, ?, ?, 'afiliado', ?)", name, em, hash, auto ? 1 : 0).lastInsertRowid)
      return Number(run('INSERT INTO affiliates (user_id, name, code, phone, email, document, pix_key_type, pix_key, pix_holder, status, pending) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        uid, name, makeCode(name), ph, em, cpf, pixType, pixKey, name, auto ? 'ativo' : 'inativo', auto ? 0 : 1).lastInsertRowid)
    })
    audit(null, 'afiliado.autocadastro', 'affiliate', aid, { name, auto_aprovado: auto }, ctx.ip)
    for (const ad of all<any>("SELECT id FROM users WHERE role = 'admin' AND active = 1")) {
      notify(ad.id, auto ? 'Novo afiliado cadastrado' : 'Afiliado aguardando aprovação', `${name} se cadastrou pelo link.`, '/admin/afiliados')
    }
    emit(['affiliates', 'dashboard'])
    return json({ ok: true, approved: auto }, 201)
  })

  r.post('/api/admin/affiliates/:id/approve', ctx => {
    const u = requirePerm(ctx, 'afiliados')
    const a = get<any>('SELECT * FROM affiliates WHERE id = ?', Number(ctx.params.id))
    if (!a) fail(404, 'nao_encontrado', 'Afiliado não encontrado.')
    if (!a.pending) fail(409, 'nao_pendente', 'Este afiliado não está aguardando aprovação.')
    tx(() => {
      run("UPDATE affiliates SET status = 'ativo', pending = 0 WHERE id = ?", a.id)
      run('UPDATE users SET active = 1 WHERE id = ?', a.user_id)
    })
    audit(u, 'afiliado.aprovado', 'affiliate', a.id, { name: a.name })
    notify(a.user_id, 'Cadastro aprovado! 🎉', `Seu link de indicação já está ativo. Código: ${a.code}.`, '/afiliado')
    emit(['affiliates', 'dashboard'], { affiliateIds: [a.id] })
    return { ok: true }
  })
  r.post('/api/admin/affiliates/:id/reject', async ctx => {
    const u = requirePerm(ctx, 'afiliados')
    const a = get<any>('SELECT * FROM affiliates WHERE id = ?', Number(ctx.params.id))
    if (!a) fail(404, 'nao_encontrado', 'Afiliado não encontrado.')
    if (!a.pending) fail(409, 'nao_pendente', 'Este afiliado não está aguardando aprovação.')
    const b = await ctx.body()
    run("UPDATE affiliates SET status = 'inativo', pending = 0 WHERE id = ?", a.id)
    audit(u, 'afiliado.recusado', 'affiliate', a.id, { name: a.name, motivo: str(b.reason, 'Motivo', { max: 300 }) })
    emit(['affiliates'])
    return { ok: true }
  })
}
