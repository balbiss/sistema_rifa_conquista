import { useEffect, useMemo, useState } from "react"
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { CheckCircle2, Copy, Loader2, Lock, Minus, Plus, QrCode, ShieldCheck, Timer } from 'lucide-react'
import { api } from '../../lib/api'
import { Modal, showError, toast } from '../../components/ui'
import { getRef } from './CampaignLanding'

// Compra rápida: quantidade + nome, CPF e WhatsApp numa tela só, PIX com "copiar código" e
// confirmação automática. Sem criar conta. Os dados ficam lembrados neste aparelho.
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const maskCPF = (v: string) => v.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
const maskPhone = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 11); return d.length <= 2 ? d : d.length <= 7 ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` }
const cpfOk = (v: string) => {
  const c = v.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
const load = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const save = (k: string, v: any) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)) } catch { /* sem storage */ } }

const fieldWrap: React.CSSProperties = { display: 'block', marginBottom: 12 }
const lbl: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#34405a', marginBottom: 6 }
const inp: React.CSSProperties = { width: '100%', height: 50, padding: '0 14px', border: '1.5px solid #d6deec', borderRadius: 10, fontSize: 16.5, background: '#fff', color: '#14213D', boxSizing: 'border-box' }

export function Checkout({ slug, campaignName, price, maxPerOrder = 100, test, sandbox, onClose }: { slug: string; campaignName: string; price: number; maxPerOrder?: number; test?: boolean; sandbox?: boolean; onClose: () => void }) {
  const pendingKey = `cp_compra_${slug}${test ? '_teste' : ''}`
  const saved = load('cp_comprador') || {}
  const [qty, setQty] = useState(5)
  const [name, setName] = useState(saved.name || '')
  const [cpf, setCpf] = useState(saved.cpf || '')
  const [phone, setPhone] = useState(saved.phone || '')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [order, setOrder] = useState<any>(() => load(pendingKey))
  const [status, setStatus] = useState<any>(null)
  const [qr, setQr] = useState('')
  const [left, setLeft] = useState(0)
  const packs = useMemo(() => [1, 5, 10, 20, 50].filter(n => n <= maxPerOrder), [maxPerOrder])
  const total = Math.round(price * 100) * qty

  // QR + contagem + acompanhamento automático do pagamento
  useEffect(() => { if (order?.pix_code) QRCode.toDataURL(order.pix_code, { margin: 1, width: 280, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr('')) }, [order?.pix_code])
  useEffect(() => {
    if (!order) return
    let stop = false
    const tick = async () => {
      try {
        const s = await api(`/public/payments/${order.id}?k=${order.key}`)
        if (stop) return
        setStatus(s)
        if (s.status !== 'pendente') { save(pendingKey, null); return }
      } catch { /* tenta de novo */ }
      if (!stop) timer = setTimeout(tick, 4000)
    }
    let timer = setTimeout(tick, 600)
    return () => { stop = true; clearTimeout(timer) }
  }, [order?.id])
  useEffect(() => {
    if (!order) return
    const f = () => setLeft(Math.max(0, Math.floor((new Date(order.expires_at).getTime() - Date.now()) / 1000)))
    f(); const t = setInterval(f, 1000); return () => clearInterval(t)
  }, [order?.expires_at])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (name.trim().split(/\s+/).length < 2) errs.name = 'Digite nome e sobrenome.'
    if (!cpfOk(cpf)) errs.cpf = 'CPF inválido.'
    if (phone.replace(/\D/g, '').length < 10) errs.phone = 'WhatsApp com DDD.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      const o = await api(`/public/campaigns/${slug}/checkout`, { body: { name: name.trim(), cpf, phone, quantity: qty, ref: getRef(), test: !!test } })
      save('cp_comprador', { name: name.trim(), cpf, phone })
      save(pendingKey, o)
      setStatus(null); setOrder(o)
    } catch (err: any) {
      if (err?.data?.field) setErrors({ [err.data.field === 'CPF' ? 'cpf' : err.data.field === 'WhatsApp' ? 'phone' : 'name']: err.message })
      else showError(err)
    } finally { setBusy(false) }
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(order.pix_code); toast('success', 'Código PIX copiado!', 'Cole no app do seu banco, em PIX › Copia e Cola.') }
    catch { toast('info', 'Selecione o código e copie manualmente.') }
  }
  const restart = () => { save(pendingKey, null); setOrder(null); setStatus(null) }
  const st = status?.status || 'pendente'
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0')

  return (
    <Modal width={500} onClose={onClose}
      title={!order ? (test ? 'Testar compra (simulação)' : 'Participar') : st === 'pago' ? 'Pagamento confirmado!' : st === 'pendente' ? 'Pague com PIX' : 'PIX expirado'}
      subtitle={!order ? campaignName : undefined}>
      {(test || sandbox) && <div style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 8, background: '#fff4e8', color: '#8a4300', fontSize: 13, fontWeight: 600 }}>PIX em MODO DE TESTE — nenhum dinheiro é cobrado e a compra não conta como real.</div>}

      {!order && (
        <form onSubmit={submit} noValidate>
          <span style={lbl}>Quantos números?</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            {packs.map(n => (
              <button key={n} type="button" onClick={() => setQty(n)}
                style={{ flex: '1 0 56px', height: 46, borderRadius: 10, border: `2px solid ${qty === n ? '#FF8A24' : '#d6deec'}`, background: qty === n ? '#fff4e8' : '#fff', color: qty === n ? '#c55200' : '#14213D', fontWeight: 800, fontSize: 16 }}>{n}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#F5F7FB', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" aria-label="Menos" onClick={() => setQty(q => Math.max(1, q - 1))} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid #d6deec', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={16} /></button>
              <input aria-label="Quantidade" inputMode="numeric" value={qty} onChange={e => setQty(Math.min(maxPerOrder, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)))} style={{ ...inp, width: 64, height: 38, textAlign: 'center', fontWeight: 800, padding: 0 }} />
              <button type="button" aria-label="Mais" onClick={() => setQty(q => Math.min(maxPerOrder, q + 1))} style={{ width: 38, height: 38, borderRadius: 10, border: '1.5px solid #d6deec', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={16} /></button>
            </div>
            <div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, color: '#5d6b85' }}>Total</div><b style={{ fontSize: 22, color: '#0B1730', fontFamily: 'Montserrat, Arial' }}>{brl(total)}</b></div>
          </div>

          <label style={fieldWrap}><span style={lbl}>Nome completo</span>
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" autoCapitalize="words" style={{ ...inp, borderColor: errors.name ? '#e5484d' : '#d6deec' }} placeholder="Seu nome e sobrenome" />
            {errors.name && <span style={{ color: '#d1242f', fontSize: 13 }}>{errors.name}</span>}
          </label>
          <div className="grid2" style={{ gap: 12 }}>
            <label style={fieldWrap}><span style={lbl}>CPF</span>
              <input value={cpf} onChange={e => setCpf(maskCPF(e.target.value))} inputMode="numeric" autoComplete="off" style={{ ...inp, borderColor: errors.cpf ? '#e5484d' : '#d6deec' }} placeholder="000.000.000-00" />
              {errors.cpf && <span style={{ color: '#d1242f', fontSize: 13 }}>{errors.cpf}</span>}
            </label>
            <label style={fieldWrap}><span style={lbl}>WhatsApp</span>
              <input value={phone} onChange={e => setPhone(maskPhone(e.target.value))} inputMode="tel" autoComplete="tel-national" style={{ ...inp, borderColor: errors.phone ? '#e5484d' : '#d6deec' }} placeholder="(91) 98888-7777" />
              {errors.phone && <span style={{ color: '#d1242f', fontSize: 13 }}>{errors.phone}</span>}
            </label>
          </div>
          <button type="submit" className="pbtn pbtn-orange" disabled={busy} style={{ width: '100%', height: 54, fontSize: 16, marginTop: 4 }}>
            {busy ? <Loader2 size={18} className="spin" /> : <QrCode size={19} />} {busy ? 'Gerando PIX…' : `Gerar PIX de ${brl(total)}`}
          </button>
          <p style={{ fontSize: 12.5, color: '#5d6b85', textAlign: 'center', margin: '10px 0 0', lineHeight: 1.5 }}>
            <Lock size={12} style={{ verticalAlign: -1 }} /> Pagamento seguro via PIX. Ao continuar, você concorda com os <Link to="/termos" target="_blank">Termos</Link> e a <Link to="/privacidade" target="_blank">Privacidade</Link>.
          </p>
        </form>
      )}

      {order && st === 'pendente' && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#5d6b85' }}>{order.quantity} número(s) reservado(s) para você</div>
          <div style={{ fontFamily: 'Montserrat, Arial', fontWeight: 900, fontSize: 32, color: '#0B1730', margin: '2px 0 6px' }}>{brl(order.amount_cents)}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: left < 120 ? '#fde8e8' : '#fff4e8', color: left < 120 ? '#b42318' : '#9a3f00', fontWeight: 700, fontSize: 13.5, marginBottom: 12 }}>
            <Timer size={15} /> Pague em {mm}:{ss}
          </div>
          <button className="pbtn pbtn-orange" onClick={copy} style={{ width: '100%', height: 56, fontSize: 16.5 }}><Copy size={19} /> Copiar código PIX</button>
          <ol style={{ textAlign: 'left', fontSize: 14, color: '#34405a', lineHeight: 1.6, padding: '0 0 0 20px', margin: '14px 0' }}>
            <li>Abra o app do seu banco e escolha <b>PIX › Copia e Cola</b>.</li>
            <li>Cole o código e confirme o pagamento.</li>
            <li>Pronto! Esta tela confirma sozinha.</li>
          </ol>
          {qr && <details style={{ margin: '0 0 12px' }}><summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#1458D4' }}>Pagar com QR Code (outro aparelho)</summary><img src={qr} alt="QR Code PIX" width={220} height={220} style={{ marginTop: 10, borderRadius: 8, border: '1px solid #e3e8f2' }} /></details>}
          <textarea readOnly value={order.pix_code} onFocus={e => e.target.select()} rows={2} style={{ width: '100%', fontSize: 11.5, padding: 8, border: '1px solid #e3e8f2', borderRadius: 8, color: '#5d6b85', resize: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, color: '#1458D4', fontWeight: 600, fontSize: 14 }}><Loader2 size={16} className="spin" /> Aguardando pagamento…</div>
          {order.simulated && <button className="pbtn pbtn-blue pbtn-sm" style={{ marginTop: 12 }} onClick={async () => { try { await api(`/public/payments/${order.id}/simulate?k=${order.key}`, { body: {} }) } catch (e) { showError(e) } }}>Simular pagamento (teste)</button>}
        </div>
      )}

      {order && st === 'pago' && (
        <div style={{ textAlign: 'center' }}>
          <CheckCircle2 size={56} color="#16a34a" style={{ margin: '4px auto 6px', display: 'block' }} />
          <p style={{ fontSize: 15.5, color: '#34405a', margin: '0 0 12px' }}>Seus números em <b>{status.campaign}</b>{status.simulated ? ' (teste)' : ''}:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxHeight: 220, overflowY: 'auto', padding: 4 }}>
            {status.numbers.map((n: string) => <span key={n} style={{ minWidth: 52, padding: '8px 10px', borderRadius: 8, background: '#0B1730', color: '#fff', fontFamily: 'Montserrat, Arial', fontWeight: 800, fontSize: 16 }}>{n}</span>)}
          </div>
          <p style={{ fontSize: 13.5, color: '#5d6b85', margin: '14px 0' }}><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> Guarde estes números. Você pode consultá-los quando quiser em <Link to="/meus-numeros">Meus números</Link> com seu WhatsApp e CPF.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="pbtn pbtn-outline pbtn-sm" onClick={() => { navigator.clipboard?.writeText(status.numbers.join(', ')); toast('success', 'Números copiados') }}><Copy size={15} /> Copiar números</button>
            <button className="pbtn pbtn-blue pbtn-sm" onClick={() => { restart(); onClose() }}>Concluir</button>
          </div>
        </div>
      )}

      {order && (st === 'expirado' || st === 'cancelado') && (
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#34405a' }}>O tempo para pagar acabou e os números foram liberados. Se você já pagou, aguarde: confirmamos automaticamente e o organizador entra em contato.</p>
          <button className="pbtn pbtn-orange" onClick={restart}>Gerar novo PIX</button>
        </div>
      )}
      {order && (st === 'divergente' || st === 'pago_tarde') && <p style={{ fontSize: 15, color: '#34405a', textAlign: 'center' }}>Recebemos seu pagamento e o organizador vai entrar em contato pelo WhatsApp para concluir.</p>}
    </Modal>
  )
}