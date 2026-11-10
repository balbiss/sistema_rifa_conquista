// Barramento de eventos em tempo real (Server-Sent Events). Só manda "o que mudou" (tópicos),
// nunca dados — cada tela busca de novo o que tem permissão de ver.
type Client = { id: number; send: (s: string) => void; scope: 'public' | 'admin' | 'afiliado' | 'participante'; userId?: number; affiliateId?: number }
const clients = new Map<number, Client>()
let seq = 0

export function subscribe(scope: Client['scope'], info: { userId?: number; affiliateId?: number } = {}) {
  const id = ++seq
  let ctrl!: ReadableStreamDefaultController<string>
  const stream = new ReadableStream<string>({
    start(c) {
      ctrl = c
      clients.set(id, { id, scope, ...info, send: s => { try { c.enqueue(s) } catch { clients.delete(id) } } })
      c.enqueue(`retry: 3000\nevent: hello\ndata: {"ok":true}\n\n`)
    },
    cancel() { clients.delete(id) },
  })
  const ping = setInterval(() => { const cl = clients.get(id); if (!cl) return clearInterval(ping); cl.send(`: ping\n\n`) }, 25_000)
  void ctrl
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } })
}

/**
 * Avisa as telas abertas. topics: ex. ['progress','participations'].
 * public=true vai também pro site público (só tópico + id da campanha).
 */
export function emit(topics: string[], opts: { campaignId?: number; affiliateIds?: (number | null | undefined)[]; userIds?: number[]; public?: boolean } = {}) {
  const payload = (extra = {}) => `event: changed\ndata: ${JSON.stringify({ topics, campaign_id: opts.campaignId ?? null, ...extra })}\n\n`
  for (const c of clients.values()) {
    if (c.scope === 'admin') c.send(payload())
    else if (c.scope === 'public' && opts.public) c.send(payload())
    else if (c.scope === 'afiliado' && (opts.public || (c.affiliateId && opts.affiliateIds?.includes(c.affiliateId)))) c.send(payload())
    else if (c.scope === 'participante' && (opts.public || (c.userId && opts.userIds?.includes(c.userId)))) c.send(payload())
  }
}

export const clientCount = () => clients.size
