import { useState } from 'react'
import { Check, Copy, KeyRound, Pencil, Plus, Send, UserPlus, X } from 'lucide-react'
import Swal from 'sweetalert2'
import { api, useApi } from '../../lib/api'
import { brl, dateTime, int, phone } from '../../lib/fmt'
import { ActionButton, Badge, Card, DataTable, ExportBtn, F, IconBtn, Modal, PageHead, Switch, btn, confirmBox, inputStyle, promptBox, showError, toast } from '../../components/ui'

const STATUS: Record<string, { l: string; t: 'green' | 'amber' | 'muted' }> = { ativo: { l: 'Ativo', t: 'green' }, suspenso: { l: 'Suspenso', t: 'amber' }, inativo: { l: 'Inativo', t: 'muted' } }
const showPass = (title: string, email: string, pass: string) => Swal.fire({ icon: 'success', title, html: `Envie ao afiliado com segurança:<br><br><b>Login:</b> ${email}<br><b>Senha provisória:</b> <code style="font-size:15px">${pass}</code><br><br><small>Ela não será mostrada de novo.</small>`, confirmButtonColor: '#1458D4' })

export default function Afiliados() {
  const { data, loading } = useApi<any[]>('/admin/affiliates', ['affiliates', 'commissions', 'referrals', 'participations'])
  const { data: settings } = useApi<any>('/admin/settings', ['settings'])
  const [edit, setEdit] = useState<any>(null)
  const site = settings?.platform?.site_url || location.origin
  const rows = data || []
  return (
    <div>
      <PageHead title="Afiliados" subtitle="Cada afiliado tem login próprio, código exclusivo e link de indicação. Ele só enxerga os próprios números, com dados de participantes mascarados.">
        <ExportBtn path="/admin/affiliates?format=csv" filename="afiliados.csv" />
        <button style={btn('vinho')} onClick={() => setEdit({ name: '', code: '', email: '', phone: '', document: '', pix_key_type: 'cpf', pix_key: '', pix_holder: '', commission_override: '', status: 'ativo' })}><Plus size={15} /> Novo afiliado</button>
      </PageHead>
      <SignupLinkCard site={site} cfg={settings?.affiliates} />
      {rows.some(a => a.pending) && (
        <Card title={`Aguardando aprovação (${rows.filter(a => a.pending).length})`} style={{ marginBottom: 14, borderColor: '#f5d48f', background: '#fffaf0' }}>
          {rows.filter(a => a.pending).map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px dashed var(--line)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <b>{a.name}</b> <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>cadastrou-se em {dateTime(a.created_at)}</span>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>CPF {a.document} · {phone(a.phone)} · {a.email} · PIX {a.pix_key_type}: {a.pix_key}</div>
              </div>
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <ActionButton variant="vinho" onClick={async () => { await api(`/admin/affiliates/${a.id}/approve`, { body: {} }); toast('success', `${a.name} aprovado`, 'O afiliado já pode entrar e indicar.') }}><Check size={14} /> Aprovar</ActionButton>
                <ActionButton variant="ghost" onClick={async () => { const r = await promptBox('Recusar cadastro', 'Motivo (só para o seu controle)', { confirmText: 'Recusar' }); if (r === null) return; await api(`/admin/affiliates/${a.id}/reject`, { body: { reason: r } }); toast('success', 'Cadastro recusado') }}><X size={14} /> Recusar</ActionButton>
              </span>
            </div>
          ))}
        </Card>
      )}
      <DataTable loading={loading} empty="Nenhum afiliado cadastrado."
        columns={[{ label: 'Afiliado' }, { label: 'Código / link' }, { label: 'Visitas', align: 'right' }, { label: 'Indicações', align: 'right' }, { label: 'Válidas', align: 'right' }, { label: 'Pendente', align: 'right' }, { label: 'Aprovada', align: 'right' }, { label: 'Paga', align: 'right' }, { label: 'Status' }, { label: '', align: 'right' }]}
        rows={rows.map(a => [
          <div><b>{a.name}</b><div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.email} · {phone(a.phone)}</div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>último acesso: {a.last_login_at ? dateTime(a.last_login_at) : 'nunca'}</div></div>,
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><code style={{ fontWeight: 700 }}>{a.code}</code><IconBtn title="Copiar link" onClick={() => { navigator.clipboard.writeText(`${site}/r/${a.code}`); toast('success', 'Link copiado') }}><Copy size={13} /></IconBtn></span>,
          int(a.visits), int(a.referrals), int(a.valid), brl(a.c_pending), brl(a.c_approved), brl(a.c_paid),
          <span>{a.pending ? <Badge tone="amber">Aguardando aprovação</Badge> : <Badge tone={STATUS[a.status].t}>{STATUS[a.status].l}</Badge>}{a.commission_override != null && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>comissão própria {brl(a.commission_override)}</div>}</span>,
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <IconBtn title="Editar" onClick={() => setEdit({ ...a, commission_override: a.commission_override ?? '' })}><Pencil size={14} /></IconBtn>
            <IconBtn title="Redefinir senha" onClick={async () => { if (!(await confirmBox('Redefinir senha?', `${a.name} será desconectado e receberá uma senha provisória.`, 'Redefinir', false))) return; try { const r = await api(`/admin/affiliates/${a.id}/reset-password`, { body: {} }); showPass('Senha redefinida', a.email, r.temp_password) } catch (e) { showError(e) } }}><KeyRound size={14} /></IconBtn>
          </span>,
        ])} />
      {edit && <EditAffiliate a={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function EditAffiliate({ a, onClose }: { a: any; onClose: () => void }) {
  const [f, setF] = useState(a)
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }))
  return (
    <Modal title={a.id ? 'Editar afiliado' : 'Novo afiliado'} subtitle={a.id ? undefined : 'Um login de afiliado é criado junto, com senha provisória.'} onClose={onClose}
      footer={<><button style={btn('ghost')} onClick={onClose}>Cancelar</button><ActionButton variant="vinho" onClick={async () => {
        const body = { ...f, pix_key_type: f.pix_key_type || 'cpf', commission_override: f.commission_override === '' ? null : f.commission_override }
        if (a.id) { await api(`/admin/affiliates/${a.id}`, { method: 'PUT', body }); toast('success', 'Afiliado salvo') }
        else { const r = await api('/admin/affiliates', { body }); if (r.temp_password) showPass('Afiliado criado', f.email, r.temp_password); else toast('success', 'Afiliado criado') }
        onClose()
      }}>Salvar</ActionButton></>}>
      <div className="grid2">
        <F label="Nome"><input value={f.name} onChange={e => set('name', e.target.value)} style={inputStyle} /></F>
        <F label="Código exclusivo" hint="Usado no link: /r/CODIGO"><input value={f.code} onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} style={inputStyle} maxLength={20} /></F>
      </div>
      <div className="grid2">
        <F label="E-mail (login)"><input type="email" value={f.email} onChange={e => set('email', e.target.value)} style={inputStyle} /></F>
        <F label="Telefone"><input value={f.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} /></F>
      </div>
      <F label="CPF / documento"><input value={f.document} onChange={e => set('document', e.target.value)} style={inputStyle} /></F>
      <div style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 4, marginBottom: 12, background: 'var(--bg)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>Chave PIX para receber comissão</div>
        <div className="grid2">
          <F label="Tipo"><select value={f.pix_key_type || 'cpf'} onChange={e => set('pix_key_type', e.target.value)} style={inputStyle}>{[['cpf', 'CPF'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['cnpj', 'CNPJ'], ['aleatoria', 'Chave aleatória']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
          <F label="Chave"><input value={f.pix_key || ''} onChange={e => set('pix_key', e.target.value)} style={inputStyle} /></F>
        </div>
        <F label="Nome do titular" style={{ marginBottom: 4 }}><input value={f.pix_holder || ''} onChange={e => set('pix_holder', e.target.value)} style={inputStyle} placeholder={f.name} /></F>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Só você altera esta chave. O afiliado não consegue trocar, e os saques vão sempre para ela.</span>
      </div>
      <div className="grid2">
        <F label="Comissão própria (R$)" hint="Deixe vazio para usar a comissão da campanha."><input type="number" step="0.01" min={0} value={f.commission_override} onChange={e => set('commission_override', e.target.value)} style={inputStyle} /></F>
        <F label="Status" hint="Suspenso/inativo não gera comissão nova e perde o acesso."><select value={f.status} onChange={e => set('status', e.target.value)} style={inputStyle}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</select></F>
      </div>
    </Modal>
  )
}

/** Link para o afiliado se cadastrar sozinho + chaves de cadastro aberto / aprovação automática. */
function SignupLinkCard({ site, cfg }: { site: string; cfg?: any }) {
  const link = `${site.replace(/\/$/, '')}/seja-afiliado`
  const save = async (k: string, v: boolean) => { await api('/admin/settings/affiliates', { method: 'PUT', body: { ...cfg, [k]: v } }).catch(showError); toast('success', 'Salvo') }
  const msg = encodeURIComponent(`Quer ganhar comissão indicando nossa campanha? Faça seu cadastro de afiliado aqui: ${link}`)
  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--terraSoft)', color: 'var(--terra)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><UserPlus size={20} /></span>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <b>Link de cadastro de afiliado</b>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Mande para quem quer ser afiliado: a pessoa preenche nome, CPF, WhatsApp, e-mail, senha e chave PIX.</div>
          <code style={{ display: 'block', marginTop: 6, fontSize: 13.5, fontWeight: 700, overflowWrap: 'anywhere' }}>{link}</code>
        </div>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={btn('vinho')} onClick={() => { navigator.clipboard?.writeText(link); toast('success', 'Link copiado') }}><Copy size={14} /> Copiar link</button>
          <a style={btn('ghost')} href={`https://wa.me/?text=${msg}`} target="_blank" rel="noreferrer"><Send size={14} /> Enviar no WhatsApp</a>
        </span>
      </div>
      {cfg && (
        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 14 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Switch on={!!cfg.signup_enabled} onChange={v => save('signup_enabled', v)} /> Cadastro pelo link aberto</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Switch on={!!cfg.auto_approve} onChange={v => save('auto_approve', v)} /> Aprovar automaticamente <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>(desligado = você aprova cada um)</span></label>
        </div>
      )}
    </Card>
  )
}
