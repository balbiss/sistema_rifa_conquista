import { get, run, parseJSON } from './db'

// Configurações persistidas (tabela settings, uma chave por grupo, valor JSON).
export const DEFAULTS: Record<string, any> = {
  platform: {
    name: 'Conquista Campanhas',
    tagline: 'Campanhas promocionais transparentes, do começo ao resultado.',
    logo_url: '',
    primary_color: '#8e2a46',
    accent_color: '#f0d0d7',
    site_url: process.env.PUBLIC_URL || 'http://localhost:5199',
  },
  organizer: {
    name: 'Organizador da Campanha (preencher)',
    document: '',
    address: '',
    email: 'contato@exemplo.com.br',
    phone: '',
    whatsapp: '',
    responsible: '',
  },
  legal: {
    // trava geral: enquanto false, nada real acontece (venda, pagamento, apuração oficial, prêmio em dinheiro)
    require_authorization: false, // se true, só vende com modalidade autorizada + documento (trava jurídica)
    real_ops_enabled: false,
    notice: 'Esta campanha está em preparação e aguarda a definição e autorização da modalidade legal aplicável. Nenhuma participação está sendo comercializada no momento.',
    terms: 'TERMOS DE USO (MODELO — revisar com assessoria jurídica)\n\n1. Esta plataforma apresenta campanhas promocionais organizadas pelo organizador identificado no rodapé.\n2. Nenhuma participação é comercializada enquanto a campanha não estiver regularizada e autorizada, quando exigido.\n3. O cadastro de interesse não gera direito a prêmio.\n4. O usuário é responsável pela veracidade dos dados informados.',
    privacy: 'POLÍTICA DE PRIVACIDADE (MODELO — revisar com assessoria jurídica)\n\nColetamos nome, telefone e e-mail apenas para comunicação sobre a campanha e cumprimento do regulamento, nos termos da LGPD (Lei 13.709/2018). Os dados não são vendidos nem compartilhados com terceiros fora das finalidades descritas. Afiliados não têm acesso aos dados completos dos participantes. Para solicitar acesso, correção ou exclusão, entre em contato pelo e-mail do organizador.',
  },
  commissions: {
    default_value: 2.5,
    approval: 'manual', // manual | automatica
    min_payout: 50,
  },
  notifications: {
    notify_affiliate_new_referral: true,
    notify_affiliate_commission: true,
    notify_admin_new_participant: true,
    email_enabled: false, // depende de SMTP configurado
    whatsapp_enabled: false, // depende de integração configurada
  },
  security: {
    session_hours: 12,
    max_failed_logins: 5,
    lock_minutes: 15,
    password_min: 8,
    mask_affiliate_view: true,
  },
  payments: {
    gateway: 'syncpay',
    enabled: false, // liga/desliga a cobrança PIX
    mode: 'simulado', // 'real' (SyncPay de verdade) | 'simulado' (só teste local)
    client_id: '',
    client_secret: '', // nunca volta para o navegador
    webhook_token: '', // token que a SyncPay manda no aviso (Authorization: Bearer ...)
    base_url: 'https://api.syncpayments.com.br',
    reservation_minutes: 15, // tempo para pagar antes de liberar os números
    max_per_order: 100,
  },
  affiliates: {
    signup_enabled: true, // link público de cadastro de afiliado (/seja-afiliado)
    auto_approve: false, // false = organizador aprova cada cadastro
  },
  withdrawals: {
    min_balance: 55, // saldo mínimo para pedir saque
    fee: 5, // taxa por saque (descontada do valor)
    cutoff_hour: 16, // pedidos até esta hora caem no mesmo dia
    deadline_hour: 18, // prazo máximo de pagamento (horário de Brasília)
    allow_simulated: true, // permite saque de comissões de simulação (teste)
  },
}

/** Configuração efetiva do PIX: variáveis de ambiente têm prioridade sobre o banco. */
export function paymentsConfig() {
  const p = getSetting('payments')
  const cfg = {
    ...p,
    mode: process.env.SYNCPAY_MODO || p.mode,
    client_id: process.env.SYNCPAY_CLIENT_ID || p.client_id,
    client_secret: process.env.SYNCPAY_CLIENT_SECRET || p.client_secret,
    webhook_token: process.env.SYNCPAY_WEBHOOK_TOKEN || p.webhook_token,
  }
  if (process.env.NODE_ENV === 'production' && cfg.mode === 'simulado') cfg.mode = 'real'
  const ready = !!cfg.enabled && (cfg.mode === 'simulado' || (!!cfg.client_id && !!cfg.client_secret))
  return { ...cfg, ready, real: ready && cfg.mode === 'real' }
}

const cache = new Map<string, any>()

export function getSetting(key: string): any {
  if (cache.has(key)) return cache.get(key)
  const row = get<{ value: string }>('SELECT value FROM settings WHERE key = ?', key)
  const v = { ...(DEFAULTS[key] || {}), ...parseJSON(row?.value, {}) }
  cache.set(key, v)
  return v
}

export function setSetting(key: string, value: any) {
  const merged = { ...(DEFAULTS[key] || {}), ...getSetting(key), ...value }
  run("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, JSON.stringify(merged))
  cache.set(key, merged)
  return merged
}

export const clearSettingsCache = () => cache.clear()

export const mask = (s: string) => (s ? '••••••' + String(s).slice(-4) : '')

/** Configurações para o painel — segredos nunca saem do servidor (só os 4 últimos caracteres). */
export function allSettings() {
  const out: any = Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, getSetting(k)]))
  const p = paymentsConfig()
  out.payments = { ...out.payments, client_secret: mask(p.client_secret), webhook_token: mask(p.webhook_token), has_secret: !!p.client_secret, has_webhook_token: !!p.webhook_token, effective_mode: p.mode, ready: p.ready, real: p.real, env_override: !!(process.env.SYNCPAY_CLIENT_ID || process.env.SYNCPAY_MODO) }
  return out
}

/** O que o site público pode ver (nada de segurança/pagamento). */
export function publicSettings() {
  const p = getSetting('platform'), o = getSetting('organizer'), l = getSetting('legal')
  return {
    platform: p,
    organizer: { name: o.name, document: o.document, address: o.address, email: o.email, phone: o.phone, whatsapp: o.whatsapp },
    legal: { notice: l.notice, terms: l.terms, privacy: l.privacy, real_ops_enabled: !!l.real_ops_enabled },
  }
}
