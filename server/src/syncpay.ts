import { randomUUID } from 'node:crypto'

// Integração SyncPay (PIX) — mesmo cliente já usado em produção no Horta vs Pragas.
//  - auth:     POST /api/partner/v1/auth-token  { client_id, client_secret } -> access_token (1 h)
//  - cobrança: POST /api/partner/v1/cash-in     { amount, description, client{name,cpf,email,phone}, webhook_url }
//  - consulta: GET  /api/partner/v2/transactions/{identifier} -> status ('completed' = pago)
// A participação só é confirmada depois que o SERVIDOR consulta a SyncPay (webhook é só um aviso).
// Modo "simulado": só para teste local, nunca em produção — o pagamento é marcado pelo administrador.

export type PixClient = {
  mode: 'real' | 'simulado'
  createCharge(o: { amountCents: number; description: string; webhookUrl: string; client: { name: string; cpf: string; email: string; phone: string } }): Promise<{ identifier: string; pixCode: string }>
  check(identifier: string): Promise<{ status: string; amount: number } | null>
  simulatePay?(identifier: string, status?: string): boolean
}

const simulated = new Map<string, { status: string; amount: number }>()

export function createSyncPay(cfg: { mode: string; client_id?: string; client_secret?: string; base_url?: string }): PixClient {
  if (cfg.mode === 'simulado') {
    if (process.env.NODE_ENV === 'production') throw new Error('Modo simulado não pode ser usado em produção.')
    return {
      mode: 'simulado',
      async createCharge({ amountCents }) {
        const id = 'SIM-' + randomUUID()
        simulated.set(id, { status: 'pending', amount: amountCents / 100 })
        return { identifier: id, pixCode: `00020126580014BR.GOV.BCB.PIX0136SIMULADO-${id.slice(4, 24)}5204000053039865802BR5909SIMULACAO6008BRASILIA62070503***6304ABCD` }
      },
      async check(id) { return simulated.get(id) ?? null },
      simulatePay(id, status = 'completed') { const p = simulated.get(id); if (p) p.status = status; return !!p },
    }
  }

  const base = (cfg.base_url || 'https://api.syncpayments.com.br').replace(/\/$/, '')
  let token: string | null = null, expires = 0
  async function auth() {
    if (token && Date.now() < expires - 60_000) return token
    if (!cfg.client_id || !cfg.client_secret) throw new Error('SyncPay sem client_id/client_secret configurados.')
    const r = await fetch(`${base}/api/partner/v1/auth-token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: cfg.client_id, client_secret: cfg.client_secret }), signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) throw new Error(`SyncPay: autenticação falhou (${r.status}). Confira as credenciais.`)
    const d: any = await r.json()
    token = d.access_token; expires = Date.now() + (Number(d.expires_in) || 3600) * 1000
    return token!
  }
  async function call(path: string, method = 'GET', body?: any) {
    const t = await auth()
    const r = await fetch(`${base}${path}`, {
      method, signal: AbortSignal.timeout(20_000),
      headers: { Authorization: `Bearer ${t}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (r.status === 401) token = null
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`SyncPay ${method} ${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`)
    return r.json()
  }
  return {
    mode: 'real',
    async createCharge({ amountCents, description, webhookUrl, client }) {
      const d: any = await call('/api/partner/v1/cash-in', 'POST', {
        amount: Number((amountCents / 100).toFixed(2)), description, webhook_url: webhookUrl,
        client: { name: client.name, cpf: client.cpf, email: client.email, phone: client.phone },
      })
      if (!d?.identifier || !d?.pix_code) throw new Error('SyncPay não retornou o PIX.')
      return { identifier: String(d.identifier), pixCode: String(d.pix_code) }
    },
    async check(id) {
      const d: any = await call(`/api/partner/v2/transactions/${encodeURIComponent(id)}`)
      const t = d?.data?.transaction || (d?.data?.status ? d.data : null)
      return t ? { status: String(t.status), amount: Number(t.amount) } : null
    },
  }
}
