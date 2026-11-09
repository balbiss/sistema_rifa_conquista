import { useEffect, useState } from 'react'
import { Save, Plus, Pencil } from 'lucide-react'
import Swal from 'sweetalert2'
import { api, useApi } from '../../lib/api'
import { dateTime } from '../../lib/fmt'
import { ActionButton, Badge, Card, DataTable, F, IconBtn, Loading, LockNotice, Modal, PageHead, Switch, Tabs, btn, inputStyle, showError, toast } from '../../components/ui'
import { ImageList } from '../../components/Upload'

type Tab = 'platform' | 'organizer' | 'legal' | 'regularizacao' | 'pagamentos' | 'saques' | 'commissions' | 'notifications' | 'security' | 'usuarios'
const PERM_LABEL: Record<string, string> = { '*': 'Acesso total', campanhas: 'Campanhas', identificadores: 'Identificadores', participantes: 'Participantes', afiliados: 'Afiliados', comissoes: 'Comissões', financeiro: 'Financeiro', apuracao: 'Apuração', premios: 'Prêmios', relatorios: 'Relatórios', configuracoes: 'Configurações', usuarios: 'Usuários', auditoria: 'Auditoria' }

export default function Configuracoes() {
  const { data, reload } = useApi<any>('/admin/settings', ['settings'])
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get('aba') as Tab) || 'platform')
  const [s, setS] = useState<any>(null)
  useEffect(() => { if (data) setS(structuredClone(data)) }, [data])
  if (!s) return <Loading />
  const set = (g: string, k: string, v: any) => setS((x: any) => ({ ...x, [g]: { ...x[g], [k]: v } }))
  const save = async (g: string, extra: any = {}) => { await api(`/admin/settings/${g}`, { method: 'PUT', body: { ...s[g], ...extra } }); toast('success', 'Configurações salvas'); reload() }
  const txt = (g: string, k: string, label: string, hint?: string) => <F label={label} hint={hint}><input value={s[g][k] ?? ''} onChange={e => set(g, k, e.target.value)} style={inputStyle} /></F>
  const numF = (g: string, k: string, label: string, hint?: string) => <F label={label} hint={hint}><input type="number" step="any" min={0} value={s[g][k] ?? 0} onChange={e => set(g, k, Number(e.target.value))} style={inputStyle} /></F>
  const sw = (g: string, k: string, label: string, disabled?: boolean, hint?: string) => <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, marginBottom: 12, opacity: disabled ? 0.6 : 1 }}><Switch on={!!s[g][k]} disabled={disabled} onChange={v => set(g, k, v)} /> <span>{label}{hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{hint}</span>}</span></label>
  const saveBtn = (g: string) => <ActionButton variant="vinho" onClick={() => save(g)}><Save size={14} /> Salvar</ActionButton>

  return (
    <div>
      <PageHead title="Configurações" subtitle="Tudo aqui é gravado no banco e aplicado na hora no site e nos painéis." />
      <Tabs value={tab} onChange={setTab} items={[['platform', 'Plataforma'], ['organizer', 'Organizador'], ['legal', 'Termos e privacidade'], ['regularizacao', 'Avançado'], ['pagamentos', 'Pagamentos (PIX)'], ['saques', 'Saques'], ['commissions', 'Comissões'], ['notifications', 'Notificações'], ['security', 'Segurança'], ['usuarios', 'Usuários e permissões']]} />
      {tab === 'platform' && <Card style={{ maxWidth: 720 }}>
        {txt('platform', 'name', 'Nome da plataforma')}{txt('platform', 'tagline', 'Frase de apresentação')}
        {txt('platform', 'site_url', 'Endereço público do site', 'Usado para montar os links dos afiliados.')}
        <div className="grid2">
          <F label="Cor principal"><input type="color" value={s.platform.primary_color} onChange={e => set('platform', 'primary_color', e.target.value)} style={{ ...inputStyle, padding: 2, height: 38 }} /></F>
          <F label="Cor de destaque"><input type="color" value={s.platform.accent_color} onChange={e => set('platform', 'accent_color', e.target.value)} style={{ ...inputStyle, padding: 2, height: 38 }} /></F>
        </div>
        <F label="Logomarca (quadrada)"><ImageList max={1} value={s.platform.logo_url ? [s.platform.logo_url] : []} onChange={v => set('platform', 'logo_url', v[0] || '')} /></F>
        {saveBtn('platform')}
      </Card>}
      {tab === 'organizer' && <Card style={{ maxWidth: 720 }}>
        {txt('organizer', 'name', 'Razão social / nome')}<div className="grid2">{txt('organizer', 'document', 'CNPJ / CPF')}{txt('organizer', 'responsible', 'Responsável legal')}</div>
        {txt('organizer', 'address', 'Endereço')}<div className="grid3">{txt('organizer', 'email', 'E-mail')}{txt('organizer', 'phone', 'Telefone')}{txt('organizer', 'whatsapp', 'WhatsApp')}</div>
        {saveBtn('organizer')}
      </Card>}
      {tab === 'legal' && <Card>
        <F label="Aviso do site enquanto não regularizado"><textarea rows={2} value={s.legal.notice} onChange={e => set('legal', 'notice', e.target.value)} style={inputStyle} /></F>
        <F label="Termos de uso"><textarea rows={10} value={s.legal.terms} onChange={e => set('legal', 'terms', e.target.value)} style={inputStyle} /></F>
        <F label="Política de privacidade"><textarea rows={10} value={s.legal.privacy} onChange={e => set('legal', 'privacy', e.target.value)} style={inputStyle} /></F>
        {saveBtn('legal')}
      </Card>}
      {tab === 'regularizacao' && <Card style={{ maxWidth: 760 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Dados de teste (simulação)</h3>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 10px' }}>Remove participações, comissões e participantes marcados como simulação, liberando os números. Use antes de começar a vender de verdade. Apurações e auditoria são preservadas.</p>
        <ActionButton variant="ghost" onClick={async () => {
          const r = await Swal.fire({ title: 'Limpar dados de simulação?', html: 'Digite <b>LIMPAR</b> para confirmar.', input: 'text', showCancelButton: true, confirmButtonText: 'Limpar', cancelButtonText: 'Cancelar', confirmButtonColor: '#F86161' })
          if (!r.isConfirmed) return
          try { const d = await api('/admin/simulation/clear', { body: { confirm: r.value } }); toast('success', 'Simulação limpa', `${d.participations} participações, ${d.commissions} comissões, ${d.participants} participantes`) } catch (e) { showError(e) }
        }}>Limpar dados de simulação</ActionButton>
        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '20px 0' }} />
        <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Exigir autorização legal antes de vender</h3>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 10px' }}>Desligado: você controla tudo pelo status da campanha (Ativa = vendendo). Ligado: a campanha só pode ser ativada com modalidade autorizada, nº de autorização e documento anexado.</p>
        {sw('legal', 'require_authorization', 'Exigir autorização legal')}
        {s.legal.require_authorization && sw('legal', 'real_ops_enabled', 'Trava geral liberada (operações reais permitidas)')}
        {saveBtn('legal')}
      </Card>}
      {tab === 'commissions' && <Card style={{ maxWidth: 620 }}>
        {numF('commissions', 'default_value', 'Comissão padrão para campanhas novas (R$)', 'Cada campanha pode ter a sua; afiliados podem ter comissão própria.')}
        <F label="Aprovação"><select value={s.commissions.approval} onChange={e => set('commissions', 'approval', e.target.value)} style={inputStyle}><option value="manual">Manual (administrador aprova)</option><option value="automatica">Automática ao confirmar a participação</option></select></F>
        {numF('commissions', 'min_payout', 'Valor mínimo para pagamento (R$)')}
        {saveBtn('commissions')}
      </Card>}
      {tab === 'notifications' && <Card style={{ maxWidth: 620 }}>
        {sw('notifications', 'notify_affiliate_new_referral', 'Avisar afiliado a cada nova indicação')}
        {sw('notifications', 'notify_affiliate_commission', 'Avisar afiliado quando a comissão muda')}
        {sw('notifications', 'notify_admin_new_participant', 'Avisar administradores de novos cadastros')}
        {sw('notifications', 'email_enabled', 'Enviar por e-mail', true, 'Depende de servidor SMTP configurado.')}
        {sw('notifications', 'whatsapp_enabled', 'Enviar por WhatsApp', true, 'Depende de integração de WhatsApp configurada.')}
        {saveBtn('notifications')}
      </Card>}
      {tab === 'security' && <Card style={{ maxWidth: 620 }}>
        <div className="grid2">{numF('security', 'session_hours', 'Duração da sessão (horas)')}{numF('security', 'password_min', 'Tamanho mínimo da senha')}</div>
        <div className="grid2">{numF('security', 'max_failed_logins', 'Tentativas erradas até bloquear')}{numF('security', 'lock_minutes', 'Minutos de bloqueio')}</div>
        {sw('security', 'mask_affiliate_view', 'Mascarar nome e telefone dos participantes para afiliados', true, 'Sempre ligado (LGPD).')}
        {saveBtn('security')}
      </Card>}
      {tab === 'usuarios' && <Usuarios />}
      {tab === 'pagamentos' && <PagamentosCfg data={s.payments} reload={reload} />}
      {tab === 'saques' && <SaquesCfg data={s.withdrawals} reload={reload} />}
    </div>
  )
}

function Usuarios() {
  const { data } = useApi<any>('/admin/users', ['users'])
  const [edit, setEdit] = useState<any>(null)
  const [, force] = useState(0)
  const ROLE: Record<string, string> = { admin: 'Administrador', afiliado: 'Afiliado', participante: 'Participante' }
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}><button style={btn('vinho')} onClick={() => setEdit({ name: '', email: '', password: '', permissions: [], active: true })}><Plus size={15} /> Novo administrador</button></div>
      <DataTable loading={!data} columns={[{ label: 'Nome' }, { label: 'Perfil' }, { label: 'Permissões' }, { label: 'Último acesso' }, { label: 'Status' }, { label: '' }]}
        rows={(data?.items || []).map((u: any) => [<span><b>{u.name}</b><div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{u.email}</div></span>, ROLE[u.role],
          u.role === 'admin' ? <span style={{ fontSize: 12.5 }}>{u.permissions.map((p: string) => PERM_LABEL[p] || p).join(', ') || 'nenhuma'}</span> : <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>só a própria área</span>,
          <span style={{ fontSize: 13 }}>{u.last_login_at ? dateTime(u.last_login_at) : 'nunca'}</span>, u.active ? <Badge tone="green">Ativo</Badge> : <Badge>Inativo</Badge>,
          u.role === 'admin' ? <IconBtn title="Editar" onClick={() => setEdit({ ...u, password: '', active: !!u.active })}><Pencil size={14} /></IconBtn> : null])} />
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Afiliados são gerenciados em Afiliados. Participantes criam conta pelo site.</p>
      {edit && (
        <Modal title={edit.id ? 'Editar administrador' : 'Novo administrador'} onClose={() => setEdit(null)}
          footer={<><button style={btn('ghost')} onClick={() => setEdit(null)}>Cancelar</button><ActionButton variant="vinho" onClick={async () => { if (edit.id) await api(`/admin/users/${edit.id}`, { method: 'PUT', body: edit }); else await api('/admin/users', { body: edit }); toast('success', 'Usuário salvo'); setEdit(null); force(x => x + 1); location.reload() }}>Salvar</ActionButton></>}>
          <F label="Nome"><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} style={inputStyle} /></F>
          {!edit.id && <F label="E-mail"><input value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} style={inputStyle} /></F>}
          <F label={edit.id ? 'Nova senha (opcional)' : 'Senha'} hint="Mínimo 8 caracteres, com letras e números."><input type="password" value={edit.password} onChange={e => setEdit({ ...edit, password: e.target.value })} style={inputStyle} autoComplete="new-password" /></F>
          <F label="Permissões">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
              {['*', ...(data?.permissions || [])].map((p: string) => (
                <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5 }}>
                  <input type="checkbox" checked={edit.permissions.includes(p)} onChange={e => setEdit({ ...edit, permissions: e.target.checked ? [...edit.permissions, p] : edit.permissions.filter((x: string) => x !== p) })} style={{ accentColor: '#1458D4' }} />{PERM_LABEL[p] || p}
                </label>
              ))}
            </div>
          </F>
          {edit.id && <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}><Switch on={edit.active} onChange={v => setEdit({ ...edit, active: v })} /> Ativo</label>}
        </Modal>
      )}
    </>
  )
}

function PagamentosCfg({ data, reload }: { data: any; reload: () => void }) {
  const [f, setF] = useState<any>({ ...data, client_secret: '', webhook_token: '' })
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  const hook = `${location.origin.replace(/:\d+$/, '')}/api/webhooks/syncpay`
  return (
    <Card style={{ maxWidth: 760 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {data.ready ? <Badge tone="green">PIX ligado</Badge> : <Badge>PIX desligado</Badge>}
        <Badge tone={data.effective_mode === 'real' ? 'blue' : 'amber'}>{data.effective_mode === 'real' ? 'Modo real (SyncPay)' : 'Modo simulado (teste)'}</Badge>
        {data.env_override && <Badge tone="muted">credenciais vindas do servidor (.env)</Badge>}
      </div>
      <LockNotice compact title="A venda no site abre quando o PIX está em modo REAL e a campanha está com status ATIVA. Em modo simulado nada é cobrado — use para testar o fluxo." />
      <div style={{ height: 14 }} />
      {sw2('Ligar pagamento PIX', !!f.enabled, v => set('enabled', v))}
      <F label="Modo"><select value={f.mode} onChange={e => set('mode', e.target.value)} style={inputStyle}><option value="simulado">Simulado (teste, sem cobrança)</option><option value="real">Real — SyncPay</option></select></F>
      <div className="grid2">
        <F label="Client ID (SyncPay › Developer › API)"><input value={f.client_id} onChange={e => set('client_id', e.target.value)} style={inputStyle} autoComplete="off" /></F>
        <F label="Client secret" hint={data.has_secret ? `Salvo (${data.client_secret}). Deixe em branco para manter.` : 'Ainda não informado.'}><input type="password" value={f.client_secret} onChange={e => set('client_secret', e.target.value)} style={inputStyle} autoComplete="new-password" /></F>
      </div>
      <F label="Token do webhook (opcional)" hint={data.has_webhook_token ? `Salvo (${data.webhook_token}). Deixe em branco para manter.` : 'Se configurar um token no webhook da SyncPay, informe o mesmo aqui.'}><input type="password" value={f.webhook_token} onChange={e => set('webhook_token', e.target.value)} style={inputStyle} autoComplete="new-password" /></F>
      <F label="URL do webhook para cadastrar na SyncPay" hint="Precisa ser o endereço público do site (https). Em teste local a confirmação acontece consultando a SyncPay a cada poucos segundos."><input readOnly value={hook} onFocus={e => e.target.select()} style={inputStyle} /></F>
      <div className="grid2">
        <F label="Minutos para pagar (reserva dos números)"><input type="number" min={5} max={120} value={f.reservation_minutes} onChange={e => set('reservation_minutes', Number(e.target.value))} style={inputStyle} /></F>
        <F label="Máximo de números por compra"><input type="number" min={1} max={1000} value={f.max_per_order} onChange={e => set('max_per_order', Number(e.target.value))} style={inputStyle} /></F>
      </div>
      <ActionButton variant="vinho" onClick={async () => { await api('/admin/settings-payments', { method: 'PUT', body: f }); toast('success', 'Pagamentos salvos'); reload() }}><Save size={14} /> Salvar</ActionButton>
    </Card>
  )
}

function SaquesCfg({ data, reload }: { data: any; reload: () => void }) {
  const [f, setF] = useState<any>(data)
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  return (
    <Card style={{ maxWidth: 620 }}>
      <div className="grid2">
        <F label="Saldo mínimo para pedir saque (R$)"><input type="number" step="0.01" min={1} value={f.min_balance} onChange={e => set('min_balance', e.target.value)} style={inputStyle} /></F>
        <F label="Taxa por saque (R$)"><input type="number" step="0.01" min={0} value={f.fee} onChange={e => set('fee', e.target.value)} style={inputStyle} /></F>
      </div>
      <div className="grid2">
        <F label="Pedidos até (hora)" hint="Antes deste horário, o pagamento cai no mesmo dia."><input type="number" min={0} max={23} value={f.cutoff_hour} onChange={e => set('cutoff_hour', Number(e.target.value))} style={inputStyle} /></F>
        <F label="Prazo máximo de pagamento (hora)" hint="Horário de Brasília."><input type="number" min={1} max={23} value={f.deadline_hour} onChange={e => set('deadline_hour', Number(e.target.value))} style={inputStyle} /></F>
      </div>
      <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 12px' }}>Exemplo: com saldo de R$ {Number(f.min_balance || 0).toFixed(2).replace('.', ',')} o afiliado recebe R$ {Math.max(0, Number(f.min_balance || 0) - Number(f.fee || 0)).toFixed(2).replace('.', ',')}. Pedidos até {f.cutoff_hour}h → pagos até {f.deadline_hour}h do mesmo dia; depois → até {f.deadline_hour}h do dia seguinte.</p>
      {sw2('Permitir saque de comissões de simulação (para testar o fluxo)', !!f.allow_simulated, v => set('allow_simulated', v))}
      <ActionButton variant="vinho" onClick={async () => { await api('/admin/settings-withdrawals', { method: 'PUT', body: f }); toast('success', 'Regras de saque salvas'); reload() }}><Save size={14} /> Salvar</ActionButton>
    </Card>
  )
}
const sw2 = (label: string, on: boolean, onChange: (v: boolean) => void) => <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, marginBottom: 12 }}><Switch on={on} onChange={onChange} /> {label}</label>
