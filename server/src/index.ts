import { buildApp } from './app'
import { seed } from './seed'
import { expirePending } from './payments'

const fetch = buildApp()
const created = await seed({ withDemoData: process.env.SEED_DEMO !== 'false' })
if (created) console.log('[seed] dados iniciais criados (admin@teste.local / Admin123)')

// libera números de PIX vencidos (confere com a SyncPay antes)
setInterval(() => { expirePending().catch(e => console.error('[pix] job', e?.message)) }, 60_000)

const port = Number(process.env.PORT || 3020)
Bun.serve({ port, idleTimeout: 0, fetch })
console.log(`[api] rodando em http://localhost:${port}`)
