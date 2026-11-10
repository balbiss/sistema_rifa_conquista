// Formatação pt-BR (datas nunca aparecem cruas na tela).
export const brl = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const int = (v: any) => (Number(v) || 0).toLocaleString('pt-BR')
const toDate = (iso?: string | null) => {
  if (!iso) return null
  const s = String(iso)
  // datas do SQLite ("2026-11-09 12:00:00") são UTC
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') + 'Z' : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T12:00:00' : s)
  return Number.isNaN(d.getTime()) ? null : d
}
export const date = (iso?: string | null) => toDate(iso)?.toLocaleDateString('pt-BR') ?? '—'
export const dateTime = (iso?: string | null) => {
  const d = toDate(iso)
  return d ? `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '—'
}
export const dayShort = (iso: string) => { const d = toDate(iso); return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '' }
export const phone = (d?: string) => {
  const s = (d || '').replace(/\D/g, '')
  if (s.length === 11) return `(${s.slice(0, 2)}) ${s.slice(2, 7)}-${s.slice(7)}`
  if (s.length === 10) return `(${s.slice(0, 2)}) ${s.slice(2, 6)}-${s.slice(6)}`
  return d || ''
}
export const toInputDate = (iso?: string | null) => { const d = toDate(iso); return d ? d.toISOString().slice(0, 10) : '' }
export const ini = (n: string) => (n || '').trim().split(/\s+/).map(p => p[0] || '').slice(0, 2).join('').toUpperCase() || '?'

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: 'muted' | 'blue' | 'green' | 'amber' | 'red' }> = {
  rascunho: { label: 'Rascunho', tone: 'muted' },
  aguardando_autorizacao: { label: 'Aguardando autorização', tone: 'amber' },
  autorizada: { label: 'Autorizada', tone: 'blue' },
  ativa: { label: 'Ativa', tone: 'green' },
  pausada: { label: 'Pausada', tone: 'muted' },
  encerrada: { label: 'Encerrada', tone: 'muted' },
  apurada: { label: 'Apurada', tone: 'blue' },
  arquivada: { label: 'Arquivada', tone: 'muted' },
}
export const LEGAL_STATUS: Record<string, string> = { pendente: 'Pendente', em_analise: 'Em análise jurídica', autorizada: 'Autorizada', indeferida: 'Indeferida' }
export const NUMBER_STATUS: Record<string, { label: string; bg: string; fg: string; border: string }> = {
  disponivel: { label: 'Disponível', bg: '#ffffff', fg: '#313942', border: '#e3e5e8' },
  reservado: { label: 'Reservado', bg: '#FFF1D6', fg: '#9A5B00', border: '#f5d48f' },
  atribuido: { label: 'Atribuído', bg: '#1458D4', fg: '#ffffff', border: '#1458D4' },
  cancelado: { label: 'Cancelado', bg: '#F0F2F4', fg: '#92989B', border: '#d5d8db' },
  bloqueado: { label: 'Bloqueado', bg: '#313942', fg: '#ffffff', border: '#313942' },
}
export const COMMISSION_STATUS: Record<string, { label: string; tone: 'muted' | 'blue' | 'green' | 'amber' | 'red' }> = {
  pendente: { label: 'Pendente', tone: 'amber' }, aprovada: { label: 'Aprovada', tone: 'blue' }, paga: { label: 'Paga', tone: 'green' },
  cancelada: { label: 'Cancelada', tone: 'muted' }, estornada: { label: 'Estornada', tone: 'red' },
}
export const PART_STATUS: Record<string, { label: string; tone: 'muted' | 'blue' | 'green' | 'amber' | 'red' }> = {
  interessado: { label: 'Interessado', tone: 'muted' }, ativo: { label: 'Ativo', tone: 'green' }, inativo: { label: 'Inativo', tone: 'muted' }, bloqueado: { label: 'Bloqueado', tone: 'red' },
  pendente: { label: 'Pendente', tone: 'amber' }, confirmada: { label: 'Confirmada', tone: 'green' }, cancelada: { label: 'Cancelada', tone: 'red' },
}
export const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'entrou no sistema', 'participacao.criar': 'registrou participação', 'participacao.confirmar': 'confirmou participação', 'participacao.cancelar': 'cancelou participação',
  'campanha.criar': 'criou campanha', 'campanha.editar': 'editou campanha', 'campanha.status': 'mudou status da campanha', 'campanha.duplicar': 'duplicou campanha', 'campanha.arquivar': 'arquivou campanha',
  'campanha.documento': 'anexou documento', 'participante.cadastro_interesse': 'novo cadastro pelo site', 'participante.criar': 'cadastrou participante', 'participante.editar': 'editou participante',
  'afiliado.criar': 'cadastrou afiliado', 'afiliado.editar': 'editou afiliado', 'comissao.aprovada': 'aprovou comissão', 'comissao.paga': 'marcou comissão como paga', 'comissao.cancelada': 'cancelou comissão',
  'comissao.estornada': 'estornou comissão', 'apuracao.simulacao': 'registrou apuração simulada', 'apuracao.oficial': 'registrou apuração oficial', 'identificador.status': 'alterou identificador',
  'despesa.criar': 'lançou despesa', 'premio.criar': 'cadastrou prêmio', 'premio.editar': 'editou prêmio', 'sistema.seed': 'criou dados iniciais', 'simulacao.limpar': 'limpou dados de simulação',
}
export const actionLabel = (a: string) => ACTION_LABEL[a] || a.replace(/[._]/g, ' ')
/** Percentual em pt-BR com até 1 casa decimal: 0,1% · 12,5% · 100%. */
export const pct = (v: any) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'
