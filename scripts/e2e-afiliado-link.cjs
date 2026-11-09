// Cadastro de afiliado pelo link (celular) + aprovação pelo admin + login do afiliado.
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const path = require('path')
const out = process.argv[2] || 'e2e-out'
const base = process.env.BASE || 'http://localhost:5199'
const cpf = process.env.CPF || '86288366757'
const mail = `afiliado${Date.now() % 100000}@exemplo.com`
;(async () => {
  require('fs').mkdirSync(out, { recursive: true })
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  let ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  let p = await ctx.newPage()
  await p.goto(base + '/seja-afiliado')
  await p.getByText('Quero ser afiliado').first().waitFor({ timeout: 15000 })
  await p.locator('label:has-text("Nome completo") input').fill('Juliana Afiliada Teste')
  await p.getByPlaceholder('000.000.000-00').fill(cpf)
  await p.getByPlaceholder('(91) 98888-7777').first().fill('91982223344')
  await p.locator('label:has-text("E-mail (login)") input').fill(mail)
  await p.getByPlaceholder('8+ letras e números').fill('Senha1234')
  await p.locator('input[type=checkbox]').check()
  await p.screenshot({ path: path.join(out, 'a1-form.png'), fullPage: true })
  await p.getByRole('button', { name: 'Quero ser afiliado' }).click()
  await p.getByText(/Cadastro (enviado|concluído)/).waitFor({ timeout: 15000 })
  await p.screenshot({ path: path.join(out, 'a2-enviado.png') })
  await ctx.close()
  // admin aprova
  const adm = await (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@teste.local', password: 'Admin123' }) })).json()
  ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addInitScript(([t, u]) => { localStorage.setItem('cp_token', t); localStorage.setItem('cp_user', u) }, [adm.token, JSON.stringify(adm.user)])
  p = await ctx.newPage()
  await p.goto(base + '/admin/afiliados')
  await p.getByText(/Aguardando aprovação \(/).waitFor({ timeout: 15000 })
  await p.screenshot({ path: path.join(out, 'a3-admin.png') })
  await p.getByRole('button', { name: /Aprovar/ }).first().click()
  await p.waitForTimeout(1500)
  await ctx.close()
  // afiliado entra
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: mail, password: 'Senha1234' }) })
  await b.close()
  console.log(r.status === 200 ? 'OK: cadastro pelo link → aprovado → afiliado entra' : 'FALHOU login: ' + r.status)
})().catch(e => { console.error('FALHOU:', e.message.split('\n')[0]); process.exit(1) })
