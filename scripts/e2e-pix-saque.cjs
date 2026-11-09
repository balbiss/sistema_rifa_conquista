// Teste de ponta a ponta no navegador: compra PIX (modo teste) + saque do afiliado.
// Uso: PLAYWRIGHT_CORE=... node scripts/e2e-pix-saque.cjs <pasta-prints>
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const path = require('path')
const out = process.argv[2] || 'e2e-out'
const base = process.env.BASE || 'http://localhost:5199'
const shot = (p, n) => p.screenshot({ path: path.join(out, n) })
const login = async (email, password) => (await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()
;(async () => {
  require('fs').mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const ok = []
  // ---- compra (admin em modo teste), no celular ----
  const adm = await login('admin@teste.local', 'Admin123')
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(([t, u]) => { localStorage.setItem('cp_token', t); localStorage.setItem('cp_user', u) }, [adm.token, JSON.stringify(adm.user)])
  let p = await ctx.newPage()
  await p.goto(base + '/c/conquiste-sua-habilitacao-ab?checkout=teste')
  await p.getByText('Quantos números?').waitFor({ timeout: 15000 })
  await p.getByRole('button', { name: '10', exact: true }).click()
  await p.getByPlaceholder('Seu nome e sobrenome').fill('Carlos Comprador Teste')
  await p.getByPlaceholder('000.000.000-00').fill('52998224725')
  await p.getByPlaceholder('(91) 98888-7777').fill('91987654321')
  await shot(p, '1-checkout.png')
  await p.getByRole('button', { name: /Gerar PIX/ }).click()
  await p.getByRole('button', { name: /Copiar código PIX/ }).waitFor({ timeout: 15000 })
  await shot(p, '2-pix.png'); ok.push('PIX gerado')
  await p.getByRole('button', { name: /Simular pagamento/ }).click()
  await p.getByText('Pagamento confirmado!').waitFor({ timeout: 20000 })
  await shot(p, '3-pago.png'); ok.push('pagamento confirmado sozinho na tela')
  await p.goto(base + '/meus-numeros')
  await p.getByRole('button', { name: /Ver meus números/ }).click()
  await p.getByText('Ver campanha').first().waitFor({ timeout: 10000 })
  await shot(p, '4-meus-numeros.png'); ok.push('meus números')
  await ctx.close()
  // ---- saque do afiliado ----
  const ana = await login('ana@teste.local', 'Afiliado123')
  ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await ctx.addInitScript(([t, u]) => { localStorage.setItem('cp_token', t); localStorage.setItem('cp_user', u) }, [ana.token, JSON.stringify(ana.user)])
  p = await ctx.newPage()
  await p.goto(base + '/afiliado/saques')
  await p.getByText('Minha chave PIX').waitFor({ timeout: 15000 })
  await p.waitForTimeout(1500)
  if (await p.getByPlaceholder('000.000.000-00').isEnabled()) {
    await p.getByPlaceholder('000.000.000-00').fill('529.982.247-25')
    await p.locator('label:has-text("Nome completo do titular") input').fill('Ana Souza')
    await p.getByRole('button', { name: /Salvar chave/ }).click()
    await p.waitForTimeout(1500)
  }
  await shot(p, '5-afiliado-saques.png')
  const testBtn = p.getByRole('button', { name: /saque de teste/ })
  if (await p.getByText('Saque em andamento', { exact: true }).count()) { await shot(p, '6-saque-pedido.png'); ok.push('saque já em andamento (pedido na rodada anterior)') }
  else if (await testBtn.isEnabled().catch(() => false)) {
    await testBtn.click()
    await p.getByRole('button', { name: 'Pedir saque', exact: true }).last().click()
    await p.getByText('Saque em andamento', { exact: true }).waitFor({ timeout: 10000 })
    await shot(p, '6-saque-pedido.png'); ok.push('saque pedido')
  } else ok.push('AVISO: saldo de simulação da Ana abaixo do mínimo — saque não testado na tela')
  await ctx.close()
  // ---- admin paga ----
  ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
  await ctx.addInitScript(([t, u]) => { localStorage.setItem('cp_token', t); localStorage.setItem('cp_user', u) }, [adm.token, JSON.stringify(adm.user)])
  p = await ctx.newPage()
  await p.goto(base + '/admin/saques')
  await p.getByText('Saques de afiliados').waitFor({ timeout: 15000 })
  await p.waitForTimeout(1200)
  await shot(p, '7-admin-saques.png')
  const pay = p.getByRole('button', { name: /Marcar pago/ }).first()
  if (await pay.count()) {
    await pay.click()
    await p.getByPlaceholder(/E00000000/).fill('E123456789TESTE')
    await shot(p, '8-admin-pagar.png')
    await p.getByRole('button', { name: /Confirmar pagamento/ }).click()
    await p.waitForTimeout(1500); ok.push('saque pago pelo admin')
  }
  await p.goto(base + '/admin/pagamentos'); await p.waitForTimeout(2000); await shot(p, '9-admin-pagamentos.png')
  await browser.close()
  console.log(ok.join('\n'))
})().catch(e => { console.error('FALHOU:', e.message); process.exit(1) })
