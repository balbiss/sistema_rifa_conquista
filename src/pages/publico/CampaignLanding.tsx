import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, BellRing, Bike, BookOpen, Building2, Car, GraduationCap, ShieldCheck, ClipboardCheck, FileSearch, FileText, Landmark, ScrollText, Target, Ticket, Trophy } from 'lucide-react'
import { api, session, useApi } from '../../lib/api'
import { useReveal } from '../../components/PublicLayout'
import { IcApuracao, IcConclusao, IcDocumento, IcEscudo, IcParticipacao, IcRegularizacao } from '../../components/StepIcons'
import { F, Modal, inputStyle, showError, toast } from '../../components/ui'
import { Checkout } from './Checkout'

export function getRef() {
  try {
    const r = JSON.parse(localStorage.getItem('cp_ref') || 'null')
    return r && r.exp > Date.now() ? (r.code as string) : null
  } catch { return null }
}

/** Card de progresso: só a porcentagem (nunca quantidade de identificadores, arrecadação ou valores internos). */
function ProgressCard({ percent, simulated, slug, onAvisar, open }: { percent: number; simulated?: boolean; slug: string; onAvisar: () => void; open: boolean }) {
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(Math.min(100, Math.max(0, percent))), 250); return () => clearTimeout(t) }, [percent])
  return (
    <aside className="pcard-prog fade-up" style={{ animationDelay: '.15s' }} aria-label="Progresso da campanha">
      <h3><Target size={26} color="#FF8A24" /> Progresso da Campanha</h3>
      <div className="pprog-pct">{percent}%</div>
      <div className="pprog-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da campanha">
        <div className="pprog-fill" style={{ width: `${w}%`, ...(simulated ? { background: 'repeating-linear-gradient(45deg,#f2b35f,#f2b35f 10px,#f7cd8f 10px,#f7cd8f 20px)' } : {}) }} />
      </div>
      <div className="pprog-rest">{percent >= 100 ? <b>Campanha concluída!</b> : <>Faltam <b>{100 - percent}%</b> para a conclusão.</>}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button className="pbtn pbtn-orange" onClick={onAvisar}>{open ? <><Ticket size={19} /> EU QUERO! Comprar números</> : <><BellRing size={18} /> Quero ser avisado</>}</button>
        <Link to={`/c/${slug}/regulamento`} className="pbtn pbtn-outline"><FileText size={18} /> Ler o regulamento</Link>
      </div>
    </aside>
  )
}

const FAQ = [
  ['Já posso participar?', ''],
  ['O que o prêmio cobre?', 'O pacote de habilitação nas categorias A e B (carro e moto), cobrindo as taxas e aulas práticas previstas no regulamento, em autoescola credenciada.'],
  ['O prêmio garante a CNH?', 'Não. A obtenção da CNH depende do cumprimento dos requisitos legais (idade, exames médicos e psicológicos, provas teórica e prática do DETRAN) e da aprovação do candidato.'],
  ['Como será definido o contemplado?', 'Pela regra prevista no regulamento aprovado. A regra proposta usa o resultado oficial da Loteria Federal: os três últimos dígitos do 1º prêmio da extração definida. Exemplo hipotético: 1º prêmio 48273 → identificador 273.'],
  ['O prêmio pode ser trocado por dinheiro?', 'Não. O prêmio é o pacote de habilitação descrito no regulamento.'],
  ['O que é o progresso da campanha?', 'É a porcentagem de identificadores com participação válida confirmada. Ela é calculada automaticamente pelo sistema e nunca inclui dados de teste ou simulação.'],
  ['Meus dados estão seguros?', 'Os dados são usados apenas para a campanha, conforme a LGPD e a Política de Privacidade. Afiliados não veem seus dados completos.'],
]

export function CampaignLanding({ slug }: { slug: string }) {
  const { data: c, error, loading } = useApi<any>(`/public/campaigns/${slug}`, ['progress', 'campaigns', 'prizes', 'settings', 'draws'])
  const [interest, setInterest] = useState(() => new URLSearchParams(location.search).get('avisar') === '1')
  // pré-visualização com simulação: só para administrador logado, sempre com aviso
  const preview = new URLSearchParams(location.search).get('preview') === 'simulacao' && session.user?.role === 'admin'
  const testMode = new URLSearchParams(location.search).get('checkout') === 'teste' && session.user?.role === 'admin'
  const { data: adminC } = useApi<any>((preview || testMode) && c ? `/admin/campaigns/${c.id}` : null, ['progress'])
  const [checkout, setCheckout] = useState<null | 'real' | 'teste'>(null)
  useEffect(() => { if (c?.open_for_participation && new URLSearchParams(location.search).get('participar') === '1') setCheckout('real') }, [c?.id])
  useEffect(() => { if (testMode && adminC) setCheckout('teste') }, [testMode, !!adminC])
  useEffect(() => { const h = () => setCheckout('real'); window.addEventListener('abrir-checkout', h); return () => window.removeEventListener('abrir-checkout', h) }, [])
  useReveal(c?.id)
  useEffect(() => { const h = () => setInterest(true); window.addEventListener('abrir-aviso', h); return () => window.removeEventListener('abrir-aviso', h) }, [])
  useEffect(() => { if (c && location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 120) }, [c?.id])

  if (loading) return <div className="phero" style={{ minHeight: 560 }}><div className="pw" style={{ padding: '60px 24px' }}><div className="skel" style={{ height: 360, opacity: .15 }} /></div></div>
  if (error || !c) return <div className="pw" style={{ padding: '100px 24px', textAlign: 'center' }}><h2>Campanha não encontrada</h2><Link to="/">Voltar ao início</Link></div>

  const percent = preview && adminC ? adminC.progress.percent_simulated : c.progress.percent
  const principal = c.prizes.find((p: any) => p.kind === 'principal')
  const [t1, ...tRest] = c.name.toUpperCase().split(' ')
  // "CONQUISTE SUA" em branco, "HABILITAÇÃO A/B" em laranja (divide o nome ao meio)
  const words = c.name.toUpperCase().split(' ')
  const cut = Math.ceil(words.length / 2)
  const titleA = words.slice(0, cut).join(' ') || t1
  const titleB = words.slice(cut).join(' ') || tRest.join(' ')
  const photo = c.images?.[0]
  const photo2 = c.images?.[1] || c.images?.[0]

  return (
    <>
      {preview && (
        <div style={{ background: 'repeating-linear-gradient(45deg,#fff1d6,#fff1d6 14px,#ffe6b3 14px,#ffe6b3 28px)', color: '#6b4100', textAlign: 'center', padding: '10px 16px', fontWeight: 700, fontSize: 14 }}>
          PRÉ-VISUALIZAÇÃO DO ADMINISTRADOR COM DADOS SIMULADOS — o público vê {c.progress.percent}% (somente participações reais).
        </div>
      )}

      {/* ===== BANNER ===== */}
      <section className="phero">
        <span className="phero-arc a1" aria-hidden />
        <span className="phero-arc a2" aria-hidden />
        <div className="pw phero-grid">
          <div className="phero-person fade-up"><img src={photo || "/hero/mulher.webp"} alt="Pessoa sorrindo segurando um cartão de habilitação" width={566} height={724} /></div>

          <div className="phero-main fade-up" style={{ animationDelay: '.05s' }}>
            <span className="pill pill-solid"><Trophy size={15} /> {c.open_for_participation ? 'Participações abertas' : c.status === 'ativa' ? 'Campanha ativa' : ['encerrada', 'apurada'].includes(c.status) ? 'Campanha encerrada' : 'Em breve'}</span>
            <h1 className="phero-title"><span className="w">{titleA}</span><span className="o">{titleB}</span></h1>
            <p className="phero-sub">{c.subtitle}</p>
            <p className="phero-desc">{c.description}</p>
            <div className="phero-vehicles"><img src="/hero/veiculos.webp" alt="Carro e motocicleta" width={919} height={337} /></div>
          </div>

          <ProgressCard percent={percent} simulated={preview} slug={c.slug} open={c.open_for_participation} onAvisar={() => (c.open_for_participation ? setCheckout('real') : setInterest(true))} />
        </div>
      </section>

      {/* ===== FAIXA DE BENEFÍCIOS ===== */}
      <div className="pw">
        <div className="pbenefits reveal">
          {[
            [FileSearch, 'Campanha transparente', 'Regras e informações abertas'],
            [Landmark, 'Apuração pela Loteria Federal', 'Resultado oficial da CAIXA'],
            [Car, 'Habilitação A/B', 'Carro e moto'],
            [ScrollText, 'Regulamento acessível', 'Leia antes de tudo'],
          ].map(([I, b, s]: any) => (
            <div key={b} className="pbenefit"><span className="pbenefit-ic"><I size={22} /></span><div><b>{b}</b><span>{s}</span></div></div>
          ))}
        </div>
      </div>
      {/* ===== PRÊMIO ===== */}
      <section className="psec pprize-sec" id="premio">
        <div className="pw pprize2">
          <div className="pprize2-text reveal">
            <div className="pkicker">O prêmio</div>
            <h2 className="pprize2-title">Pacote de habilitação <span>A/B</span></h2>
            <p>{principal?.description || c.prize_summary}</p>
          </div>
          <div className="pprize2-img reveal">
            <img src={c.images?.length > 1 ? c.images[1] : '/hero/premio.webp'} alt="Carro prata e motocicleta preta com detalhes laranja" width={872} height={493} loading="lazy" />
          </div>
          <ul className="pprize2-card reveal" aria-label="O que o prêmio inclui">
            {([
              [Bike, 'Categorias A (moto) e B (carro)'],
              [GraduationCap, 'Taxas e aulas práticas previstas no regulamento'],
              [Building2, 'Formação em autoescola credenciada, quando aplicável'],
              [ShieldCheck, 'Aprovação condicionada aos requisitos legais e exames do DETRAN'],
            ] as const).map(([I, x]) => (
              <li key={x}><span className="pprize2-ic"><I size={24} strokeWidth={1.8} /></span><span>{x}</span></li>
            ))}
          </ul>
        </div>
      </section>
      {/* ===== COMO FUNCIONA ===== */}
      <section className="psec psteps-sec" id="como-funciona">
        <span className="psteps-swoosh" aria-hidden />
        <div className="pw">
          <div className="reveal">
            <div className="pkicker">Passo a passo</div>
            <h2 className="ptitle psteps-title">Como funciona</h2>
            <p className="psteps-lead">Entenda em 4 etapas como funciona a nossa campanha.</p>
          </div>
          <ol className="psteps2">
            {([
              [IcRegularizacao, 'Escolha', 'Escolha quantos números quer e informe nome, CPF e WhatsApp. Leva menos de 1 minuto.'],
              [IcParticipacao, 'Pague com PIX', `Pagamento na hora pelo app do banco. Seus números únicos (${c.transparency.range}) aparecem na tela.`],
              [IcConclusao, 'Acompanhe', 'O progresso da campanha sobe automaticamente a cada participação confirmada.'],
              [IcApuracao, 'Apuração', 'A apuração seguirá o resultado oficial da Loteria Federal, conforme as regras estabelecidas no regulamento aprovado.'],
            ] as const).map(([I, tt, d], i) => (
              <li key={tt} className="pstep2 reveal" style={{ transitionDelay: `${i * 0.07}s` }}>
                <div className="pstep2-top"><span className="pstep2-num">0{i + 1}</span><I /></div>
                <h3>{tt}</h3>
                <p>{d}</p>
                {i < 3 && <span className="pstep2-link" aria-hidden><svg width="14" height="14" viewBox="0 0 14 14"><path d="M5 2.5 L9.5 7 L5 11.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}
              </li>
            ))}
          </ol>

          {/* ===== TRANSPARÊNCIA E REGULAMENTO ===== */}
          <div className="pquick2" id="transparencia">
            <div className="pquick2-card blue reveal">
              <span className="pquick2-ic"><IcEscudo /></span>
              <div className="pquick2-body">
                <h3>Transparência</h3>
                <p>Todas as informações da campanha: situação legal, quantidade de identificadores, chances e forma de apuração.</p>
                <Link to={`/c/${c.slug}/transparencia`} className="pbtn pquick2-btn">Ver informações <ArrowRight size={18} /></Link>
              </div>
            </div>
            <div className="pquick2-card orange reveal" id="regulamento">
              <span className="pquick2-ic"><IcDocumento /></span>
              <div className="pquick2-body">
                <h3>Regulamento</h3>
                <p>O regulamento completo, com todas as condições, direitos e deveres dos participantes.</p>
                <Link to={`/c/${c.slug}/regulamento`} className="pbtn pquick2-btn">Ler regulamento <ArrowRight size={18} /></Link>
              </div>
            </div>
          </div>
        </div>
      </section>



      {/* ===== FAQ ===== */}
      <section className="psec" id="faq">
        <div className="pw" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20, maxWidth: 900 }}>
          <div className="reveal"><div className="pkicker">Dúvidas</div><h2 className="ptitle">Perguntas frequentes</h2></div>
          <div className="pfaq reveal">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a || (c.open_for_participation ? 'Sim! Clique em "Participar agora", escolha a quantidade, informe nome, CPF e WhatsApp e pague com PIX. Seus números aparecem na hora e também podem ser consultados em "Meus números".' : 'Ainda não. As participações abrem em breve — deixe seu contato em "Quero ser avisado" para receber o aviso.')}</p></details>)}</div>
        </div>
      </section>

      {c.open_for_participation && !checkout && <div className="pbuybar"><div><small>{c.progress.percent}% vendido</small><b>R$ {Number(c.transparency.ref_price || 0).toFixed(2).replace('.', ',')} por número</b></div><button className="pbtn pbtn-orange" onClick={() => setCheckout('real')}><Ticket size={18} /> Comprar números</button></div>}
      {checkout && <Checkout slug={c.slug} campaignName={c.name} sandbox={c.payment_test_mode} test={checkout === 'teste'} price={checkout === 'teste' ? adminC?.ref_price ?? 0 : c.transparency.ref_price ?? 0} maxPerOrder={c.max_per_order || 100} onClose={() => { setCheckout(null); if (location.search.includes('checkout')) history.replaceState(null, '', location.pathname) }} />}
      {interest && <InterestModal slug={c.slug} campaignName={c.name} onClose={() => { setInterest(false); if (location.search.includes('avisar')) history.replaceState(null, '', location.pathname) }} />}
    </>
  )
}

/** Título de seção reaproveitado pelas outras páginas públicas. */
export function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return <div style={{ marginBottom: 20 }}><div className="pkicker">{kicker}</div><h2 className="ptitle">{title}</h2></div>
}

function InterestModal({ slug, campaignName, onClose }: { slug: string; campaignName: string; onClose: () => void }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', password: '', consent: false })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const ref = getRef()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const d = await api(`/public/campaigns/${slug}/interest`, { body: { ...f, ref } })
      if (d.token) session.set(d.token, d.user)
      setDone(true)
      toast('success', 'Cadastro recebido!')
    } catch (err) { showError(err) } finally { setBusy(false) }
  }
  return (
    <Modal title={done ? 'Tudo certo!' : 'Quero ser avisado'} subtitle={done ? undefined : `${campaignName} — avisaremos pelo WhatsApp quando as participações abrirem. Este cadastro não é participação e não gera direito a prêmio.`} onClose={onClose}
      footer={done ? <button className="pbtn pbtn-blue pbtn-sm" onClick={onClose}>Fechar</button> : undefined}>
      {done ? (
        <p style={{ fontSize: 15, lineHeight: 1.6 }}>Recebemos seus dados. {f.password ? <>Você já pode acompanhar pela <Link to="/minha-conta">sua área</Link>.</> : 'Você será avisado pelos contatos informados.'}</p>
      ) : (
        <form onSubmit={submit}>
          <F label="Nome completo"><input required minLength={3} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} style={inputStyle} autoComplete="name" /></F>
          <div className="grid2" style={{ gap: 12 }}>
            <F label="WhatsApp (com DDD)"><input required inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} style={inputStyle} placeholder="(91) 98888-7777" autoComplete="tel" /></F>
            <F label="E-mail"><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} style={inputStyle} autoComplete="email" /></F>
          </div>
          <F label="Criar senha (opcional)" hint="Com senha você acompanha seu cadastro na área do participante. Mínimo 8 caracteres, com letras e números.">
            <input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} style={inputStyle} autoComplete="new-password" />
          </F>
          {ref && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>Indicação registrada: <b>{ref}</b></p>}
          <label style={{ display: 'flex', gap: 8, fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
            <input type="checkbox" checked={f.consent} onChange={e => setF({ ...f, consent: e.target.checked })} style={{ marginTop: 3, accentColor: '#1458D4' }} />
            <span>Li e aceito os <Link to="/termos" target="_blank">Termos de uso</Link> e a <Link to="/privacidade" target="_blank">Política de privacidade</Link>.</span>
          </label>
          <button type="submit" disabled={busy || !f.consent} className="pbtn pbtn-orange" style={{ width: '100%' }}>{busy ? 'Enviando…' : 'Cadastrar interesse'}</button>
        </form>
      )}
    </Modal>
  )
}
