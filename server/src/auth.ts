import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { get, run } from './db'
import { fail, type Ctx } from './http'
import { getSetting } from './settings'

// Token assinado (HMAC-SHA256) no formato payload.assinatura — sem dependências externas.
// token_version no usuário permite derrubar todas as sessões (troca de senha, "sair de todos").
const SECRET = process.env.APP_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret-troque-em-producao')
if (!SECRET) throw new Error('APP_SECRET obrigatório em produção')

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const sign = (data: string) => createHmac('sha256', SECRET).update(data).digest('base64url')

export function issueToken(user: { id: number; role: string; token_version: number }) {
  const hours = Number(getSetting('security').session_hours) || 12
  const payload = b64(JSON.stringify({ sub: user.id, role: user.role, v: user.token_version, exp: Date.now() + hours * 3600_000, n: randomBytes(6).toString('hex') }))
  return `${payload}.${sign(payload)}`
}

export function verifyToken(token: string | null | undefined) {
  if (!token) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  let data: any
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()) } catch { return null }
  if (!data.exp || data.exp < Date.now()) return null
  const user = get<any>('SELECT id, name, email, role, permissions, active, token_version FROM users WHERE id = ?', data.sub)
  if (!user || !user.active || user.token_version !== data.v) return null
  user.permissions = JSON.parse(user.permissions || '[]')
  return user
}

export const hashPassword = (p: string) => Bun.password.hash(p, { algorithm: 'bcrypt', cost: 10 })
export const checkPassword = (p: string, h: string) => Bun.password.verify(p, h)

export function validatePassword(p: string) {
  const min = Number(getSetting('security').password_min) || 8
  if (!p || p.length < min) fail(422, 'senha_fraca', `A senha precisa ter pelo menos ${min} caracteres.`, { field: 'Senha' })
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) fail(422, 'senha_fraca', 'A senha precisa ter letras e números.', { field: 'Senha' })
  if (p.length > 128) fail(422, 'senha_longa', 'Senha longa demais.')
}

export async function login(email: string, password: string) {
  const sec = getSetting('security')
  const user = get<any>('SELECT * FROM users WHERE email = ?', (email || '').trim().toLowerCase())
  if (!user) { await Bun.sleep(150); fail(401, 'credenciais_invalidas', 'E-mail ou senha incorretos.') }
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    fail(423, 'conta_bloqueada', 'Muitas tentativas erradas. Tente de novo em alguns minutos.')
  }
  if (!user.active) {
    const pend = get<any>('SELECT pending FROM affiliates WHERE user_id = ?', user.id)
    if (pend?.pending) fail(403, 'cadastro_em_analise', 'Seu cadastro de afiliado está em análise. Você será avisado assim que for aprovado.')
    fail(403, 'usuario_inativo', 'Usuário desativado. Fale com o administrador.')
  }
  const ok = await checkPassword(password || '', user.password_hash)
  if (!ok) {
    const fails = user.failed_logins + 1
    const max = Number(sec.max_failed_logins) || 5
    const lock = fails >= max ? new Date(Date.now() + (Number(sec.lock_minutes) || 15) * 60_000).toISOString() : null
    run('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', lock ? 0 : fails, lock, user.id)
    fail(401, 'credenciais_invalidas', 'E-mail ou senha incorretos.')
  }
  run("UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?", user.id)
  return user
}

export const publicUser = (u: any) => {
  const affiliate = u.role === 'afiliado' ? get<any>('SELECT id, code, name FROM affiliates WHERE user_id = ?', u.id) : null
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions,
    affiliate,
  }
}

// --- autorização --------------------------------------------------------------------------------
export const ADMIN_PERMS = ['campanhas', 'identificadores', 'participantes', 'afiliados', 'comissoes', 'financeiro', 'apuracao', 'premios', 'relatorios', 'configuracoes', 'usuarios', 'auditoria'] as const

export function requireUser(ctx: Ctx) {
  if (!ctx.user) fail(401, 'nao_autenticado', 'Faça login para continuar.')
  return ctx.user
}
export function requireRole(ctx: Ctx, ...roles: string[]) {
  const u = requireUser(ctx)
  if (!roles.includes(u.role)) fail(403, 'sem_permissao', 'Você não tem acesso a esta área.')
  return u
}
export function hasPerm(user: any, perm: string) {
  if (!user || user.role !== 'admin') return false
  const p: string[] = user.permissions || []
  return p.includes('*') || p.includes(perm)
}
export function requirePerm(ctx: Ctx, perm: (typeof ADMIN_PERMS)[number]) {
  const u = requireRole(ctx, 'admin')
  if (!hasPerm(u, perm)) fail(403, 'sem_permissao', 'Seu usuário não tem permissão para esta função.')
  return u
}
