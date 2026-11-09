import { existsSync, statSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { migrate } from './db'
import { HttpError, Router, json, type Ctx } from './http'
import { verifyToken } from './auth'
import { publicRoutes } from './routes/public'
import { affiliateRoutes } from './routes/affiliate'
import { adminRoutes } from './routes/admin'
import { checkoutRoutes } from './routes/checkout'
import { affiliateSignupRoutes } from './routes/affiliateSignup'

export function buildApp() {
  migrate()
  const router = new Router()
  publicRoutes(router)
  affiliateRoutes(router)
  adminRoutes(router)
  checkoutRoutes(router)
  affiliateSignupRoutes(router)
  router.get('/api/health', () => ({ ok: true }))

  const ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5199,http://127.0.0.1:5199').split(',')
  const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads'
  const DIST = process.env.STATIC_DIR || ''

  // limite simples por IP para rotas sensíveis (login, cadastro, visita de link)
  const hits = new Map<string, { n: number; reset: number }>()
  const limited = (key: string, max: number, windowMs: number) => {
    const t = Date.now(), h = hits.get(key)
    if (!h || h.reset < t) { hits.set(key, { n: 1, reset: t + windowMs }); return false }
    h.n++
    return h.n > max
  }
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset < t) hits.delete(k) }, 60_000).unref?.()

  const security = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }

  return async function fetch(req: Request, server?: any): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('origin') || ''
    const cors: Record<string, string> = ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', Vary: 'Origin' } : {}
    const finish = (res: Response) => { for (const [k, v] of Object.entries({ ...security, ...cors })) res.headers.set(k, v); return res }
    if (req.method === 'OPTIONS') return finish(new Response(null, { status: 204 }))

    // arquivos enviados (imagens/documentos)
    if (url.pathname.startsWith('/uploads/')) {
      const name = url.pathname.slice(9)
      if (!/^[\w.-]+$/.test(name)) return finish(new Response('Não encontrado', { status: 404 }))
      const f = Bun.file(join(UPLOAD_DIR, name))
      return finish(await f.exists() ? new Response(f, { headers: { 'Cache-Control': 'public, max-age=86400' } }) : new Response('Não encontrado', { status: 404 }))
    }

    if (!url.pathname.startsWith('/api/')) {
      // produção: serve o front buildado (SPA)
      if (DIST) {
        const p = normalize(join(DIST, url.pathname)).startsWith(normalize(DIST)) ? join(DIST, url.pathname) : ''
        if (p && url.pathname !== '/' && existsSync(p) && statSync(p).isFile()) {
          // arquivos com hash (assets/) podem ficar em cache "para sempre"; o resto, 1 hora
          const cache = url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
          return finish(new Response(Bun.file(p), { headers: { 'Cache-Control': cache } }))
        }
        return finish(new Response(Bun.file(join(DIST, 'index.html')), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' } }))
      }
      return finish(new Response('Não encontrado', { status: 404 }))
    }

    // atrás do Traefik o IP real é o ÚLTIMO da lista (os primeiros podem ser forjados pelo visitante)
    const ip = (req.headers.get('x-forwarded-for') || '').split(',').pop()!.trim() || server?.requestIP?.(req)?.address || 'local'
    if (req.method !== 'GET') {
      const sensitive = url.pathname === '/api/auth/login' ? 20 : url.pathname.includes('/interest') ? 10 : url.pathname.includes('/checkout') ? 12 : url.pathname === '/api/public/my-numbers' ? 15 : url.pathname === '/api/public/affiliate-signup' ? 6 : url.pathname.startsWith('/api/public/ref/') ? 60 : 0
      if (sensitive && limited(`${ip}:${url.pathname.split('/').slice(0, 4).join('/')}`, sensitive, 10 * 60_000)) {
        return finish(json({ error: 'muitas_tentativas', message: 'Muitas tentativas. Aguarde alguns minutos.' }, 429))
      }
    }

    const m = router.match(req.method, url.pathname)
    if (!m) return finish(json({ error: 'rota_inexistente', message: 'Rota não encontrada.' }, 404))
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || (url.pathname === '/api/events' ? url.searchParams.get('token') : null)
    let bodyCache: any
    const ctx: Ctx = {
      req, url, params: m.params, query: url.searchParams, ip, user: verifyToken(token),
      body: async () => {
        if (bodyCache !== undefined) return bodyCache
        const len = Number(req.headers.get('content-length') || 0)
        if (len > 1_000_000) throw new HttpError(413, 'corpo_grande', 'Conteúdo grande demais.')
        const text = await req.text()
        try { bodyCache = text ? JSON.parse(text) : {} } catch { throw new HttpError(400, 'json_invalido', 'JSON inválido.') }
        if (typeof bodyCache !== 'object' || bodyCache === null) bodyCache = {}
        return bodyCache
      },
    }
    try {
      const out = await m.handler(ctx)
      return finish(out instanceof Response ? out : json(out ?? { ok: true }))
    } catch (e: any) {
      if (e instanceof HttpError) return finish(json({ error: e.code, message: e.message, ...(e.extra || {}) }, e.status))
      if (String(e?.message || '').includes('UNIQUE constraint failed')) return finish(json({ error: 'duplicado', message: 'Registro duplicado — esta operação já foi feita.' }, 409))
      if (String(e?.message || '').includes('_imutavel')) return finish(json({ error: 'imutavel', message: 'Registro imutável: não pode ser alterado.' }, 409))
      console.error('[erro]', req.method, url.pathname, e)
      return finish(json({ error: 'erro_interno', message: 'Erro inesperado. Tente novamente.' }, 500))
    }
  }
}
