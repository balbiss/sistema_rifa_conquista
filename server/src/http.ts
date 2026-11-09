// Roteador mínimo sobre Bun.serve: rotas com parâmetros (:id), JSON, erros padronizados.
export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra?: Record<string, any>) {
    super(message || code)
  }
}
export const fail = (status: number, code: string, message?: string, extra?: Record<string, any>): never => {
  throw new HttpError(status, code, message, extra)
}

export type Ctx = {
  req: Request
  url: URL
  params: Record<string, string>
  query: URLSearchParams
  ip: string
  user: any | null
  body: () => Promise<any>
}
type Handler = (ctx: Ctx) => Promise<Response | any> | Response | any
type Route = { method: string; parts: string[]; handler: Handler }

export class Router {
  routes: Route[] = []
  add(method: string, path: string, handler: Handler) {
    this.routes.push({ method, parts: path.split('/').filter(Boolean), handler })
    return this
  }
  get(p: string, h: Handler) { return this.add('GET', p, h) }
  post(p: string, h: Handler) { return this.add('POST', p, h) }
  put(p: string, h: Handler) { return this.add('PUT', p, h) }
  patch(p: string, h: Handler) { return this.add('PATCH', p, h) }
  delete(p: string, h: Handler) { return this.add('DELETE', p, h) }
  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    const segs = pathname.split('/').filter(Boolean)
    for (const r of this.routes) {
      if (r.method !== method || r.parts.length !== segs.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < segs.length; i++) {
        const p = r.parts[i]
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i])
        else if (p !== segs[i]) { ok = false; break }
      }
      if (ok) return { handler: r.handler, params }
    }
    return null
  }
}

export const json = (data: any, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } })

/** CSV com BOM (abre certo no Excel em pt-BR), separador ponto e vírgula. */
export function csv(filename: string, columns: { key: string; label: string }[], rows: any[]) {
  const esc = (v: any) => {
    if (v === null || v === undefined) return ''
    let s = String(v)
    if (/^[=+\-@]/.test(s)) s = "'" + s // evita injeção de fórmula
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [columns.map(c => esc(c.label)).join(';'), ...rows.map(r => columns.map(c => esc(r[c.key])).join(';'))]
  return new Response('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` },
  })
}

// --- validação simples ---------------------------------------------------------------------------
export const str = (v: any, field: string, { min = 0, max = 2000, required = false } = {}) => {
  const s = (v ?? '').toString().trim()
  if (required && !s) fail(422, 'campo_obrigatorio', `Preencha o campo "${field}".`, { field })
  if (s && s.length < min) fail(422, 'campo_curto', `"${field}" precisa ter pelo menos ${min} caracteres.`, { field })
  if (s.length > max) fail(422, 'campo_longo', `"${field}" passou do limite de ${max} caracteres.`, { field })
  return s
}
export const num = (v: any, field: string, { min = -Infinity, max = Infinity, required = false, int = false } = {}) => {
  if (v === '' || v === null || v === undefined) {
    if (required) fail(422, 'campo_obrigatorio', `Preencha o campo "${field}".`, { field })
    return null
  }
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  if (!Number.isFinite(n)) fail(422, 'numero_invalido', `"${field}" precisa ser um número.`, { field })
  if (int && !Number.isInteger(n)) fail(422, 'numero_invalido', `"${field}" precisa ser um número inteiro.`, { field })
  if (n < min || n > max) fail(422, 'fora_do_limite', `"${field}" precisa estar entre ${min} e ${max}.`, { field })
  return n
}
export const email = (v: any, field = 'E-mail', required = false) => {
  const s = str(v, field, { max: 160, required }).toLowerCase()
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) fail(422, 'email_invalido', 'E-mail inválido.', { field })
  return s
}
export const phone = (v: any, field = 'Telefone', required = true) => {
  const d = (v ?? '').toString().replace(/\D/g, '')
  if (required && !d) fail(422, 'campo_obrigatorio', `Preencha o campo "${field}".`, { field })
  if (d && (d.length < 10 || d.length > 13)) fail(422, 'telefone_invalido', 'Telefone inválido — use DDD + número.', { field })
  return d
}
export const oneOf = <T extends string>(v: any, allowed: readonly T[], field: string): T => {
  if (!allowed.includes(v)) fail(422, 'valor_invalido', `Valor inválido em "${field}".`, { field })
  return v
}
export const dateOrNull = (v: any, field: string) => {
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) fail(422, 'data_invalida', `Data inválida em "${field}".`, { field })
  return d.toISOString()
}
