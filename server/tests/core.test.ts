// Testes das regras principais: rodam contra um banco em memória, chamando a API de verdade.
process.env.DB_PATH = ':memory:'
process.env.APP_SECRET = 'segredo-de-teste'
import { beforeAll, describe, expect, test } from 'bun:test'

const { buildApp } = await import('../src/app')
const { seed } = await import('../src/seed')
const { db } = await import('../src/db')
const { winningFromFirstPrize, verifyDrawChain } = await import('../src/services')
const { setSetting, clearSettingsCache } = await import('../src/settings')

const app = buildApp()
const call = async (method: string, path: string, body?: any, token?: string) => {
  const res = await app(new Request('http://t' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }))
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text()
  return { status: res.status, data }
}
const login = async (email: string, password: string) => (await call('POST', '/api/auth/login', { email, password })).data.token as string

let admin = '', ana = '', bruno = '', campaignId = 0
beforeAll(async () => {
  await seed({ withDemoData: false })
  setSetting('legal', { require_authorization: true }) // os testes abaixo cobrem a trava ligada
  admin = await login('admin@teste.local', 'Admin123')
  ana = await login('ana@teste.local', 'Afiliado123')
  bruno = await login('bruno@teste.local', 'Afiliado123')
  campaignId = (await call('GET', '/api/admin/campaigns', undefined, admin)).data[0].id
})
const newParticipant = async (name: string, phone: string, affiliate_id?: number) =>
  (await call('POST', '/api/admin/participants', { campaign_id: campaignId, name, phone, affiliate_id }, admin)).data.id as number

describe('campanha inicial', () => {
  test('nasce em Rascunho — Aguardando Regularização com 1.000 identificadores 000–999', async () => {
    const c = (await call('GET', `/api/admin/campaigns/${campaignId}`, undefined, admin)).data
    expect(c.name).toBe('Conquiste sua Habilitação A/B')
    expect(c.status).toBe('rascunho')
    expect(c.total_numbers).toBe(1000)
    expect(c.ref_price).toBe(10)
    expect(c.commission_value).toBe(2.5)
    expect(c.gate.allowed).toBe(false)
    const n = (await call('GET', `/api/admin/campaigns/${campaignId}/numbers`, undefined, admin)).data
    expect(n.items.length).toBe(1000)
    expect(n.items[0][0]).toBe(0)
    expect(n.items[999][0]).toBe(999)
  })
  test('não pode ser ativada sem regularização', async () => {
    const r = await call('POST', `/api/admin/campaigns/${campaignId}/status`, { status: 'ativa' }, admin)
    expect(r.status).toBe(403)
    expect(r.data.reasons.length).toBeGreaterThan(0)
  })
  test('site público não mostra prêmio em dinheiro nem dados financeiros', async () => {
    const c = (await call('GET', '/api/public/campaigns/conquiste-sua-habilitacao-ab')).data
    expect(c.prizes.some((p: any) => p.is_cash)).toBe(false)
    expect(c.transparency.ref_price).toBeNull()
    expect(c.progress).toEqual({ percent: 0, remaining_percent: 100 })
    expect(JSON.stringify(c)).not.toContain('commission')
  })
})

describe('participações, progresso e comissões', () => {
  let affAna = 0
  test('participação real é bloqueada; simulação funciona', async () => {
    affAna = (await call('GET', '/api/admin/affiliates', undefined, admin)).data.find((a: any) => a.code === 'ANA10').id
    const pid = await newParticipant('Teste Um', '91999990001', affAna)
    const real = await call('POST', '/api/admin/participations', { campaign_id: campaignId, participant_id: pid, quantity: 2, simulated: false }, admin)
    expect(real.status).toBe(403)
    const sim = await call('POST', '/api/admin/participations', { campaign_id: campaignId, participant_id: pid, numbers: '1, 273', simulated: true, confirm: true }, admin)
    expect(sim.status).toBe(201)
    expect(sim.data.status).toBe('confirmada')
  })
  test('identificador já usado não pode ser atribuído de novo', async () => {
    const pid = await newParticipant('Teste Dois', '91999990002')
    const r = await call('POST', '/api/admin/participations', { campaign_id: campaignId, participant_id: pid, numbers: [273], simulated: true }, admin)
    expect(r.status).toBe(409)
    const dup = await call('POST', '/api/admin/participations', { campaign_id: campaignId, participant_id: pid, numbers: [5, 5], simulated: true }, admin)
    expect(dup.status).toBe(422)
  })
  test('progresso público ignora simulação; admin vê simulado', async () => {
    const pub = (await call('GET', '/api/public/campaigns/conquiste-sua-habilitacao-ab')).data
    expect(pub.progress.percent).toBe(0)
    const adm = (await call('GET', `/api/admin/campaigns/${campaignId}`, undefined, admin)).data
    expect(adm.progress.simulated_assigned).toBe(2)
  })
  test('comissão gerada uma única vez (R$ 2,50 × 2)', async () => {
    const list = (await call('GET', `/api/admin/commissions?campaign_id=${campaignId}`, undefined, admin)).data
    expect(list.items.length).toBe(1)
    expect(list.items[0].amount).toBe(5)
    const part = list.items[0].participation_id
    const again = await call('POST', `/api/admin/participations/${part}/confirm`, {}, admin)
    expect(again.status).toBe(409)
    expect((await call('GET', `/api/admin/commissions?campaign_id=${campaignId}`, undefined, admin)).data.items.length).toBe(1)
  })
  test('afiliado vê só os próprios dados, mascarados', async () => {
    const a = (await call('GET', '/api/affiliate/referrals', undefined, ana)).data
    expect(a.length).toBe(1)
    expect(a[0].name).toBe('Teste U.')
    expect(a[0].phone).not.toContain('99990001')
    const b = (await call('GET', '/api/affiliate/referrals', undefined, bruno)).data
    expect(b.length).toBe(0)
    expect((await call('GET', '/api/admin/participants', undefined, ana)).status).toBe(403)
    expect((await call('GET', '/api/affiliate/summary', undefined, admin)).status).toBe(403)
  })
  test('cancelar participação libera identificadores, recalcula e cancela comissão', async () => {
    const com = (await call('GET', `/api/admin/commissions?campaign_id=${campaignId}`, undefined, admin)).data.items[0]
    const r = await call('POST', `/api/admin/participations/${com.participation_id}/cancel`, { reason: 'teste de cancelamento' }, admin)
    expect(r.status).toBe(200)
    const adm = (await call('GET', `/api/admin/campaigns/${campaignId}`, undefined, admin)).data
    expect(adm.progress.simulated_assigned).toBe(0)
    const c2 = (await call('GET', `/api/admin/commissions?campaign_id=${campaignId}`, undefined, admin)).data.items[0]
    expect(c2.status).toBe('cancelada')
    const n = (await call('GET', `/api/admin/campaigns/${campaignId}/numbers/273`, undefined, admin)).data
    expect(n.status).toBe('disponivel')
    expect(n.history.length).toBeGreaterThanOrEqual(3)
  })
  test('percentual nunca passa de 100%', async () => {
    const c = (await call('POST', '/api/admin/campaigns', { name: 'Mini campanha', total_numbers: 3, number_digits: 1 }, admin)).data
    const pid = (await call('POST', '/api/admin/participants', { campaign_id: c.id, name: 'Pessoa Teste', phone: '91999990009' }, admin)).data.id
    await call('POST', '/api/admin/participations', { campaign_id: c.id, participant_id: pid, quantity: 3, simulated: true, confirm: true }, admin)
    const extra = await call('POST', '/api/admin/participations', { campaign_id: c.id, participant_id: pid, quantity: 1, simulated: true }, admin)
    expect(extra.status).toBe(409)
    const p = (await call('GET', `/api/admin/campaigns/${c.id}`, undefined, admin)).data.progress
    expect(p.percent_simulated).toBe(100)
  })
})

describe('apuração pela Loteria Federal', () => {
  test('regra: 3 últimos dígitos do 1º prêmio (48273 → 273)', () => {
    expect(winningFromFirstPrize('48273', 'ultimos_3_primeiro_premio')).toBe(273)
    expect(winningFromFirstPrize('068911', 'ultimos_3_primeiro_premio')).toBe(911)
    expect(() => winningFromFirstPrize('123', 'ultimos_3_primeiro_premio')).toThrow()
  })
  test('apuração oficial bloqueada sem regularização; simulação registra', async () => {
    const off = await call('POST', '/api/admin/draws', { campaign_id: campaignId, mode: 'oficial', extraction_number: '6000', extraction_date: '2026-11-08', first_prize: '48273', source_detail: 'x' }, admin)
    expect(off.status).toBe(403)
    const sim = await call('POST', '/api/admin/draws', { campaign_id: campaignId, mode: 'simulacao', extraction_number: '6000', extraction_date: '2026-11-08', first_prize: '48273' }, admin)
    expect(sim.status).toBe(201)
    expect(sim.data.winning_number).toBe(273)
    expect((await call('GET', '/api/public/results')).data.length).toBe(0) // simulação nunca é publicada
  })
  test('registro de apuração é imutável e a cadeia é verificável', () => {
    expect(() => db.run("UPDATE draws SET first_prize = '11111'")).toThrow()
    expect(() => db.run('DELETE FROM draws')).toThrow()
    expect(() => db.run('DELETE FROM audit_log')).toThrow()
    expect(verifyDrawChain().ok).toBe(true)
  })
  test('fluxo regularizado completo: ativa, participação real bloqueada sem pagamento, oficial após encerrar', async () => {
    setSetting('legal', { real_ops_enabled: true })
    await call('PUT', `/api/admin/campaigns/${campaignId}`, { legal_status: 'autorizada', authorization_number: 'AUT-123', draw_extraction: '6001' }, admin)
    await call('POST', `/api/admin/campaigns/${campaignId}/documents`, { kind: 'autorizacao', title: 'Certificado' }, admin)
    expect((await call('POST', `/api/admin/campaigns/${campaignId}/status`, { status: 'ativa' }, admin)).status).toBe(200)
    const pid = await newParticipant('Real Um', '91999990010')
    const real = await call('POST', '/api/admin/participations', { campaign_id: campaignId, participant_id: pid, quantity: 1, simulated: false }, admin)
    expect(real.status).toBe(201) // venda manual pelo painel não depende do PIX do site
    await call('POST', `/api/admin/campaigns/${campaignId}/status`, { status: 'encerrada' }, admin)
    const wrong = await call('POST', '/api/admin/draws', { campaign_id: campaignId, mode: 'oficial', extraction_number: '6000', extraction_date: '2026-11-08', first_prize: '48273', source_detail: 'link' }, admin)
    expect(wrong.status).toBe(422) // extração diferente da do regulamento
    const ok = await call('POST', '/api/admin/draws', { campaign_id: campaignId, mode: 'oficial', extraction_number: '6001', extraction_date: '2026-11-12', first_prize: '10500', source_detail: 'https://loterias.caixa.gov.br' }, admin)
    expect(ok.status).toBe(201)
    const again = await call('POST', '/api/admin/draws', { campaign_id: campaignId, mode: 'oficial', extraction_number: '6001', extraction_date: '2026-11-12', first_prize: '10500', source_detail: 'x' }, admin)
    expect(again.status).toBe(409)
    expect((await call('GET', '/api/public/results')).data.length).toBe(1)
    expect(verifyDrawChain().ok).toBe(true)
    setSetting('legal', { real_ops_enabled: false }); clearSettingsCache()
  })
})

describe('segurança', () => {
  test('sem token não acessa área administrativa', async () => {
    expect((await call('GET', '/api/admin/dashboard')).status).toBe(401)
  })
  test('token adulterado é rejeitado', async () => {
    expect((await call('GET', '/api/admin/dashboard', undefined, admin.slice(0, -2) + 'xx')).status).toBe(401)
  })
  test('bloqueia após tentativas erradas', async () => {
    for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { email: 'carla@teste.local', password: 'errada' })
    expect((await call('POST', '/api/auth/login', { email: 'carla@teste.local', password: 'Afiliado123' })).status).toBe(423)
  })
  test('cadastro público registra a origem da indicação', async () => {
    const r = await call('POST', '/api/public/campaigns/mini-campanha/interest', { name: 'Visitante Teste', phone: '91988880000', consent: true, ref: 'BRUNO' })
    expect(r.status).toBe(201)
    const b = (await call('GET', '/api/affiliate/referrals', undefined, bruno)).data
    expect(b.length).toBe(1)
    const dup = await call('POST', '/api/public/campaigns/mini-campanha/interest', { name: 'Visitante Teste', phone: '91988880000', consent: true })
    expect(dup.status).toBe(409)
  })
  test('auditoria registra as ações', async () => {
    const a = (await call('GET', '/api/admin/audit?per=200', undefined, admin)).data
    const actions = a.items.map((x: any) => x.action)
    expect(actions).toContain('participacao.cancelar')
    expect(actions).toContain('apuracao.oficial')
  })
})

describe('PIX (SyncPay) e saques de afiliados', () => {
  let camp: any, payId = 0, payKey = '', affAna = 0
  test('venda real bloqueada sem regularização; checkout de teste só para admin', async () => {
    camp = (await call('POST', '/api/admin/campaigns', { name: 'Campanha PIX teste', total_numbers: 100, number_digits: 2, ref_price: 10, commission_value: 2.5 }, admin)).data
    affAna = (await call('GET', '/api/admin/affiliates', undefined, admin)).data.find((a: any) => a.code === 'ANA10').id
    await call('PUT', '/api/admin/settings-payments', { enabled: true, mode: 'simulado' }, admin)
    const body = { name: 'Maria Compradora', phone: '91999991234', cpf: '529.982.247-25', quantity: 22, ref: 'ANA10' }
    const real = await call('POST', `/api/public/campaigns/${camp.slug}/checkout`, body)
    expect(real.status).toBe(403)
    expect((await call('POST', `/api/public/campaigns/${camp.slug}/checkout`, { ...body, test: true })).status).toBe(401)
    const badCpf = await call('POST', `/api/public/campaigns/${camp.slug}/checkout`, { ...body, cpf: '111.111.111-11', test: true }, admin)
    expect(badCpf.status).toBe(422)
    const t = await call('POST', `/api/public/campaigns/${camp.slug}/checkout`, { ...body, test: true }, admin)
    expect(t.status).toBe(201)
    expect(t.data.amount_cents).toBe(22000)
    expect(t.data.pix_code.length).toBeGreaterThan(20)
    payId = t.data.id; payKey = t.data.key
  })
  test('números reservados até pagar; status exige a chave da compra', async () => {
    expect((await call('GET', `/api/public/payments/${payId}?k=errada`)).status).toBe(404)
    const s = (await call('GET', `/api/public/payments/${payId}?k=${payKey}`)).data
    expect(s.status).toBe('pendente')
    const c = (await call('GET', `/api/admin/campaigns/${camp.id}`, undefined, admin)).data
    expect(c.progress.counts.reservado).toBe(22)
  })
  test('pagamento confirmado gera números, progresso e comissão (uma vez)', async () => {
    const r = await call('POST', `/api/admin/payments/${payId}/simulate`, {}, admin)
    expect(r.data.status).toBe('pago')
    const s = (await call('GET', `/api/public/payments/${payId}?k=${payKey}`)).data
    expect(s.numbers.length).toBe(22)
    await call('POST', `/api/admin/payments/${payId}/check`, {}, admin) // repetir não duplica
    const coms = (await call('GET', `/api/admin/commissions?campaign_id=${camp.id}`, undefined, admin)).data.items
    expect(coms.length).toBe(1)
    expect(coms[0].amount).toBe(55)
    const mine = (await call('POST', '/api/public/my-numbers', { phone: '91999991234', cpf: '52998224725' })).data
    expect(mine[0].numbers.length).toBe(22)
    expect((await call('GET', '/api/public/campaigns/' + camp.slug)).data.progress.percent).toBe(0) // teste nunca vira progresso público
  })
  test('saque: exige PIX, saldo aprovado ≥ R$ 55, taxa R$ 5 e um por vez', async () => {
    let w = (await call('GET', '/api/affiliate/wallet', undefined, ana)).data
    expect(w.available_simulated).toBe(0) // comissão ainda pendente
    expect((await call('POST', '/api/affiliate/withdrawals', { simulated: true }, ana)).status).toBe(422)
    const com = (await call('GET', `/api/admin/commissions?campaign_id=${camp.id}`, undefined, admin)).data.items[0]
    await call('POST', `/api/admin/commissions/${com.id}/status`, { status: 'aprovada' }, admin)
    // afiliado NÃO troca a chave; só o organizador, pelo cadastro
    expect((await call('PUT', '/api/affiliate/pix', { type: 'cpf', key: '529.982.247-25', holder: 'Ana Souza' }, ana)).status).toBe(403)
    const anaAff = (await call('GET', '/api/admin/affiliates', undefined, admin)).data.find((a: any) => a.code === 'ANA10')
    const base = { name: anaAff.name, code: anaAff.code, email: anaAff.email, phone: anaAff.phone, status: 'ativo', pix_holder: 'Ana Souza', pix_key_type: 'cpf' }
    expect((await call('PUT', `/api/admin/affiliates/${anaAff.id}`, { ...base, pix_key: '123' }, admin)).status).toBe(422)
    expect((await call('PUT', `/api/admin/affiliates/${anaAff.id}`, { ...base, pix_key: '529.982.247-25' }, admin)).status).toBe(200)
    w = (await call('GET', '/api/affiliate/wallet', undefined, ana)).data
    expect(w.available_simulated).toBe(55)
    expect(w.can_request_simulated).toBe(true)
    const req = await call('POST', '/api/affiliate/withdrawals', { simulated: true }, ana)
    expect(req.status).toBe(201)
    expect(req.data.gross).toBe(55); expect(req.data.fee).toBe(5); expect(req.data.net).toBe(50)
    expect(new Date(req.data.deadline_at).getUTCHours()).toBe(21) // 18:00 de Brasília
    expect((await call('POST', '/api/affiliate/withdrawals', { simulated: true }, ana)).status).toBe(409)
    expect((await call('POST', `/api/admin/commissions/${com.id}/status`, { status: 'paga' }, admin)).status).toBe(409) // está no saque
    expect((await call('GET', '/api/admin/withdrawals', undefined, ana)).status).toBe(403)
  })
  test('admin paga manualmente com comprovante; comissão vira paga', async () => {
    const list = (await call('GET', '/api/admin/withdrawals', undefined, admin)).data
    const w = list.items[0]
    expect((await call('POST', `/api/admin/withdrawals/${w.id}/pay`, {}, admin)).status).toBe(422)
    expect((await call('POST', `/api/admin/withdrawals/${w.id}/pay`, { payment_ref: 'E123PIX' }, admin)).status).toBe(200)
    const com = (await call('GET', `/api/admin/commissions?campaign_id=${camp.id}`, undefined, admin)).data.items[0]
    expect(com.status).toBe('paga')
    const wal = (await call('GET', '/api/affiliate/wallet', undefined, ana)).data
    expect(wal.history[0].status).toBe('pago')
    expect(wal.available_simulated).toBe(0)
  })
  test('PIX vencido libera os números', async () => {
    const { expirePending } = await import('../src/payments')
    const t = await call('POST', `/api/public/campaigns/${camp.slug}/checkout`, { name: 'Joao Teste Silva', phone: '91999995555', cpf: '111.444.777-35', quantity: 3, test: true }, admin)
    db.run("UPDATE payments SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", [t.data.id])
    await expirePending()
    const s = (await call('GET', `/api/public/payments/${t.data.id}?k=${t.data.key}`)).data
    expect(s.status).toBe('expirado')
    expect((await call('GET', `/api/admin/campaigns/${camp.id}`, undefined, admin)).data.progress.counts.reservado).toBe(0)
  })
})

describe('trava legal desligada (padrão): o organizador controla pelo status', () => {
  test('campanha pode ser ativada sem autorização e a venda manual real é aceita', async () => {
    setSetting('legal', { require_authorization: false })
    const c = (await call('POST', '/api/admin/campaigns', { name: 'Campanha livre', total_numbers: 50, number_digits: 2, ref_price: 10 }, admin)).data
    expect(c.gate.allowed).toBe(true)
    expect((await call('POST', `/api/admin/campaigns/${c.id}/status`, { status: 'ativa' }, admin)).status).toBe(200)
    const pid = (await call('POST', '/api/admin/participants', { campaign_id: c.id, name: 'Venda Balcao', phone: '91999990077', simulated: false }, admin)).data.id
    const r = await call('POST', '/api/admin/participations', { campaign_id: c.id, participant_id: pid, quantity: 5, simulated: false, confirm: true }, admin)
    expect(r.status).toBe(201)
    expect((await call('GET', `/api/public/campaigns/${c.slug}`)).data.progress.percent).toBe(10)
  })
})

describe('chave PIX do afiliado travada durante saque', () => {
  test('organizador não troca a chave com saque em andamento', async () => {
    const { db: d } = await import('../src/db')
    const anaAff = (await call('GET', '/api/admin/affiliates', undefined, admin)).data.find((a: any) => a.code === 'ANA10')
    d.run("INSERT INTO withdrawals (affiliate_id, gross, fee, net, pix_key_type, pix_key, holder_name, deadline_at) VALUES (?, 60, 5, 55, 'cpf', '52998224725', 'Ana', '2099-01-01T21:00:00.000Z')", [anaAff.id])
    const r = await call('PUT', `/api/admin/affiliates/${anaAff.id}`, { name: anaAff.name, code: anaAff.code, email: anaAff.email, phone: anaAff.phone, status: 'ativo', pix_key_type: 'email', pix_key: 'golpe@exemplo.com', pix_holder: 'Outro' }, admin)
    expect(r.status).toBe(409)
  })
})

describe('cadastro de afiliado pelo link', () => {
  const body = { name: 'Marcos Indicador', cpf: '390.533.447-05', phone: '(91) 98123-4567', email: 'marcos@exemplo.com', password: 'Senha1234', pix_type: 'cpf', consent: true }
  let affId = 0
  test('cadastro entra aguardando aprovação e não consegue entrar', async () => {
    const r = await call('POST', '/api/public/affiliate-signup', body)
    expect(r.status).toBe(201)
    expect(r.data.approved).toBe(false)
    const l = await call('POST', '/api/auth/login', { email: body.email, password: body.password })
    expect(l.status).toBe(403)
    expect(l.data.error).toBe('cadastro_em_analise')
    const a = (await call('GET', '/api/admin/affiliates', undefined, admin)).data.find((x: any) => x.email === 'marcos@exemplo.com')
    expect(a.pending).toBe(1); expect(a.pix_key).toBe('39053344705'); expect(a.code).toMatch(/^MARCOS\d{2}$/)
    affId = a.id
  })
  test('mesmo CPF não cadastra de novo; CPF inválido é recusado', async () => {
    expect((await call('POST', '/api/public/affiliate-signup', { ...body, email: 'outro@exemplo.com' })).status).toBe(409)
    expect((await call('POST', '/api/public/affiliate-signup', { ...body, cpf: '123.456.789-00', email: 'x@exemplo.com' })).status).toBe(422)
  })
  test('admin aprova e o afiliado entra; chave PIX continua travada para ele', async () => {
    expect((await call('POST', `/api/admin/affiliates/${affId}/approve`, {}, ana)).status).toBe(403)
    expect((await call('POST', `/api/admin/affiliates/${affId}/approve`, {}, admin)).status).toBe(200)
    const l = await call('POST', '/api/auth/login', { email: body.email, password: body.password })
    expect(l.status).toBe(200)
    expect((await call('PUT', '/api/affiliate/pix', { type: 'email', key: 'golpe@exemplo.com', holder: 'X' }, l.data.token)).status).toBe(403)
    expect((await call('GET', '/api/affiliate/summary', undefined, l.data.token)).status).toBe(200)
  })
  test('cadastro fechado bloqueia o link', async () => {
    setSetting('affiliates', { signup_enabled: false })
    expect((await call('POST', '/api/public/affiliate-signup', { ...body, cpf: '529.982.247-25', email: 'z@exemplo.com' })).status).toBe(403)
    setSetting('affiliates', { signup_enabled: true })
  })
})
