// Teste de responsividade: abre as páginas em várias larguras, tira print de página inteira
// e acusa estouro horizontal (algo saindo da tela). Uso: node scripts/resp.cjs [saida] [paginas...]
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core')
const path = require('path')
const out = process.argv[2] || 'resp-out'
const pages = process.argv.slice(3).length ? process.argv.slice(3) : ['/', '/c/conquiste-sua-habilitacao-ab/regulamento', '/c/conquiste-sua-habilitacao-ab/transparencia', '/resultados', '/entrar']
const widths = (process.env.WIDTHS || '1440,1280,1024,820,390').split(',').map(Number)
const base = process.env.BASE || 'http://localhost:5199'
;(async () => {
  const fs = require('fs'); fs.mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
  const problems = []
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
    if (process.env.LOGIN) {
      const [email, password] = process.env.LOGIN.split(":")
      const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }).then(r => r.json())
      await ctx.addInitScript(([t, u]) => { localStorage.setItem("cp_token", t); localStorage.setItem("cp_user", u) }, [r.token, JSON.stringify(r.user)])
    }
    const page = await ctx.newPage()
    for (const p of pages) {
      await page.goto(base + p, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2500)
      await page.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('in')))
      const over = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth, bad = []
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.width && (r.right > vw + 1 || r.left < -1)) {
            const st = getComputedStyle(el)
            let clip = false
            for (let a = el.parentElement; a; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) { const ar = a.getBoundingClientRect(); if (ar.right <= vw + 1 && ar.left >= -1) { clip = true; break } } }
            if (!clip && st.position !== 'fixed' && !el.closest('[aria-hidden]')) bad.push((el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName) + ` ${Math.round(r.left)}→${Math.round(r.right)}`)
          }
        }
        return { scroll: document.documentElement.scrollWidth > vw, bad: [...new Set(bad)].slice(0, 6) }
      })
      if (over.scroll || over.bad.length) problems.push(`${w}px ${p}: ${over.scroll ? 'ROLA DE LADO ' : ''}${over.bad.join(', ')}`)
      const name = `${w}-${p.replace(/[^\w]+/g, '_') || 'home'}.png`
      await page.screenshot({ path: path.join(out, name), fullPage: true })
    }
    await ctx.close()
  }
  await browser.close()
  console.log(problems.length ? 'PROBLEMAS:\n' + problems.join('\n') : 'OK: nenhum estouro horizontal')
})().catch(e => { console.error(e); process.exit(1) })
