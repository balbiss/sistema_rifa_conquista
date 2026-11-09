import { useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Lock, X, AlertTriangle, Download } from 'lucide-react'
import Swal from 'sweetalert2'
import { ApiError, download } from '../lib/api'

// Peças visuais copiadas do CRM Clara V2 (components/ui.tsx + ui2.tsx): mesmo botão, modal, cartão,
// tabela, etiqueta e switch — cores via variáveis do index.css.

export const serif: CSSProperties = { fontFamily: "'PT Sans', Arial, sans-serif", fontWeight: 700 }
export const inputStyle: CSSProperties = { width: '100%', minHeight: 36, padding: '8px 10px', border: '1px solid #C3C7CC', borderRadius: 3, background: '#fff', fontSize: 14, boxSizing: 'border-box' }
export const labelStyle: CSSProperties = { display: 'block', fontSize: 13, color: 'var(--muted)', marginBottom: 5 }

type Variant = 'primary' | 'ghost' | 'danger' | 'soft' | 'vinho'
export function btn(variant: Variant = 'primary', extra: CSSProperties = {}): CSSProperties {
  const base: CSSProperties = { minHeight: 36, padding: '0 16px', borderRadius: 3, fontSize: 13, fontWeight: 700, letterSpacing: '.02em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
  const v: Record<Variant, CSSProperties> = {
    primary: { border: 'none', background: 'var(--terra)', color: '#fff' },
    vinho: { border: 'none', background: 'var(--vinhoBtn)', color: '#fff' },
    ghost: { border: '1px solid #C3C7CC', background: '#fff', color: 'var(--ink)' },
    danger: { border: 'none', background: '#F86161', color: '#fff' },
    soft: { border: 'none', background: 'var(--terraSoft)', color: 'var(--vinhoBtn)' },
  }
  return { ...base, ...v[variant], ...extra }
}

/** Botão que mostra carregando enquanto a ação roda e trata erro com aviso. */
export function ActionButton({ onClick, children, variant = 'primary', disabled, title, style, type = 'button' }: { onClick?: () => Promise<any> | any; children: ReactNode; variant?: Variant; disabled?: boolean; title?: string; style?: CSSProperties; type?: 'button' | 'submit' }) {
  const [busy, setBusy] = useState(false)
  return (
    <button type={type} title={title} disabled={disabled || busy} style={btn(variant, style)}
      onClick={onClick ? async () => { setBusy(true); try { await onClick() } catch (e) { showError(e) } finally { setBusy(false) } } : undefined}>
      {busy && <Loader2 size={14} className="spin" />}{children}
    </button>
  )
}

export function Modal({ title, subtitle, onClose, children, footer, width = 520 }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,15,26,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 80 }}>
      <div className="modal-card" role="dialog" aria-modal="true"
        style={{ width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(10,15,26,.25)', animation: 'fadeUp .14s ease' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 22px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ ...serif, fontSize: 19, margin: 0 }}>{title}</h2>
            {subtitle && <p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.55, margin: '6px 0 0' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} title="Fechar" aria-label="Fechar" style={{ width: 30, height: 30, border: '1px solid var(--line)', borderRadius: 3, background: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><X size={15} /></button>
        </div>
        <div style={{ padding: '0 22px 18px', overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 22px 16px', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Card({ title, right, children, style, pad = true }: { title?: ReactNode; right?: ReactNode; children?: ReactNode; style?: CSSProperties; pad?: boolean }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 4, minWidth: 0, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>{title}</span>
          {right}
        </div>
      )}
      {children !== undefined && children !== null && children !== false && <div style={{ padding: pad ? (title ? '0 14px 14px' : 14) : 0 }}>{children}</div>}
    </div>
  )
}

export function Field({ label, value, empty }: { label: ReactNode; value: ReactNode; empty?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)', flex: 'none', maxWidth: '45%' }}>{label}</span>
      <span style={{ textAlign: 'right', fontWeight: 600, color: empty ? 'var(--muted)' : 'var(--ink)', fontStyle: empty ? 'italic' : undefined, minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )
}

export const PILL: CSSProperties = { fontSize: 11, fontWeight: 400, letterSpacing: '.02em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 2, whiteSpace: 'nowrap', display: 'inline-block' }
export function Badge({ children, tone = 'muted', title }: { children: ReactNode; tone?: 'muted' | 'blue' | 'green' | 'amber' | 'red'; title?: string }) {
  const t = {
    muted: { background: 'var(--card-2)', color: 'var(--muted)' }, blue: { background: 'var(--terraSoft)', color: 'var(--vinhoBtn)' },
    green: { background: 'var(--plantaoSoft)', color: '#4b7d12' }, amber: { background: 'var(--amberSoft)', color: 'var(--amber)' }, red: { background: 'var(--redSoft)', color: 'var(--red)' },
  }[tone]
  return <span title={title} style={{ ...PILL, ...t }}>{children}</span>
}
export const SimBadge = () => <Badge tone="amber" title="Registro de simulação — não é operação real">Simulação</Badge>

export function PageHead({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ ...serif, fontSize: 18, margin: 0, lineHeight: 1.2, letterSpacing: '.03em', textTransform: 'uppercase' }}>{title}</h1>
        {subtitle && <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0', maxWidth: '75ch', lineHeight: 1.55 }}>{subtitle}</p>}
      </div>
      {children && <div className="page-toolbar" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>}
    </div>
  )
}

export const th: CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--line)', background: '#fff', whiteSpace: 'nowrap' }
export const td: CSSProperties = { padding: '10px 14px', fontSize: 14, borderBottom: '1px solid var(--line)', verticalAlign: 'middle' }
type Col = { label: ReactNode; width?: number | string; align?: 'left' | 'right' | 'center' }
export function DataTable({ columns, rows, empty = 'Nada por aqui ainda.', loading, onRowClick, footer }: { columns: Col[]; rows: ReactNode[][]; empty?: ReactNode; loading?: boolean; onRowClick?: (i: number) => void; footer?: ReactNode }) {
  const msg = (m: ReactNode) => <tr><td colSpan={columns.length} style={{ ...td, textAlign: 'center', color: 'var(--muted)', padding: 28 }}>{m}</td></tr>
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="row-hover dt" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{columns.map((c, i) => <th key={i} style={{ ...th, width: c.width, textAlign: c.align || 'left' }}>{c.label}</th>)}</tr></thead>
          <tbody>
            {loading ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{columns.map((_, j) => <td key={j} style={td}><div className="skel" style={{ height: 14 }} /></td>)}</tr>)
              : rows.length === 0 ? msg(empty) : rows.map((r, ri) => (
                <tr key={ri} onClick={onRowClick ? () => onRowClick(ri) : undefined} style={{ cursor: onRowClick ? 'pointer' : undefined }}>
                  {r.map((cell, ci) => <td key={ci} data-label={typeof columns[ci]?.label === "string" ? (columns[ci].label as string) : ""} style={{ ...td, textAlign: columns[ci]?.align || "left" }}>{cell}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  )
}

export function Pager({ page, per, total, onPage }: { page: number; per: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / per))
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
      <span>{total.toLocaleString('pt-BR')} registro(s) · página {page} de {pages}</span>
      <span style={{ display: 'flex', gap: 6 }}>
        <button style={btn('ghost', { padding: '0 10px' })} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior"><ChevronLeft size={15} /></button>
        <button style={btn('ghost', { padding: '0 10px' })} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima página"><ChevronRight size={15} /></button>
      </span>
    </div>
  )
}

export function IconBtn({ title, onClick, danger, children, disabled }: { title: string; onClick: () => void; danger?: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button title={title} aria-label={title} disabled={disabled} onClick={e => { e.stopPropagation(); onClick() }}
      style={{ width: 30, height: 30, border: '1px solid var(--line)', borderRadius: 3, background: '#fff', color: danger ? '#B42318' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{children}</button>
  )
}

export function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      style={{ position: 'relative', width: 38, height: 22, borderRadius: 11, border: 'none', background: on ? 'var(--terra)' : 'var(--line)', flex: 'none', transition: 'background .15s', padding: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
    </button>
  )
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, ReactNode][] }) {
  return <div className="k-tabs" role="tablist">{items.map(([k, l]) => <button key={k} role="tab" className="k-tab" data-on={value === k ? '1' : '0'} onClick={() => onChange(k)}>{l}</button>)}</div>
}

/** Campo de formulário: rótulo + controle + dica. */
export function F({ label, children, hint, style }: { label: ReactNode; children: ReactNode; hint?: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{ display: 'block', marginBottom: 12, ...style }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.45 }}>{hint}</span>}
    </label>
  )
}

export function Kpi({ label, value, hint, tone, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: string; icon?: ReactNode }) {
  return (
    <div className="fade-up" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 4, padding: '12px 14px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</span>
        {icon && <span style={{ color: tone || 'var(--terra)', display: 'flex' }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 6, color: tone || 'var(--ink)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

/** Aviso da trava jurídica (operações reais bloqueadas). */
export function LockNotice({ reasons, title = 'Operações reais bloqueadas', compact }: { reasons?: string[]; title?: string; compact?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: compact ? '8px 12px' : '12px 14px', background: 'var(--amberSoft)', border: '1px solid #f5d48f', borderRadius: 4, color: '#6b4100', fontSize: 13, lineHeight: 1.5 }}>
      <Lock size={16} style={{ flex: 'none', marginTop: 2 }} />
      <div>
        <b>{title}</b>
        {!compact && <div>Simulações e testes continuam liberados. Pagamentos, comercialização de números, sorteios reais e prêmio em dinheiro só são liberados após a regularização.</div>}
        {reasons && reasons.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{reasons.map(r => <li key={r}>{r}</li>)}</ul>}
      </div>
    </div>
  )
}

export function ErrorBox({ error, onRetry }: { error: any; onRetry?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: 'var(--redSoft)', color: 'var(--red)', borderRadius: 4, fontSize: 14 }}>
      <AlertTriangle size={16} /> <span style={{ flex: 1 }}>{error?.message || 'Erro ao carregar.'}</span>
      {onRetry && <button style={btn('ghost')} onClick={onRetry}>Tentar de novo</button>}
    </div>
  )
}

export function ExportBtn({ path, filename }: { path: string; filename: string }) {
  return <ActionButton variant="ghost" onClick={async () => { await download(path, filename); toast('success', 'Exportação gerada') }}><Download size={14} /> Exportar CSV</ActionButton>
}

export const toast = (icon: 'success' | 'error' | 'info' | 'warning', title: string, text?: string) =>
  Swal.fire({ toast: true, position: 'top-end', icon, title, text, showConfirmButton: false, timer: icon === 'error' ? 5000 : 3000, timerProgressBar: true })

export function showError(e: any) {
  const reasons: string[] = e instanceof ApiError ? e.data?.reasons || [] : []
  if (reasons.length) {
    Swal.fire({ icon: 'warning', title: e.message, html: `<ul style="text-align:left;margin:8px 0 0;padding-left:18px">${reasons.map(r => `<li>${r.replace(/</g, '&lt;')}</li>`).join('')}</ul>`, confirmButtonText: 'Entendi', confirmButtonColor: '#1458D4' })
  } else toast('error', e?.message || 'Erro inesperado.')
}

export async function confirmBox(title: string, text: string, confirmText = 'Confirmar', danger = true): Promise<boolean> {
  const r = await Swal.fire({ title, text, icon: 'warning', showCancelButton: true, confirmButtonText: confirmText, cancelButtonText: 'Cancelar', confirmButtonColor: danger ? '#F86161' : '#1458D4' })
  return r.isConfirmed
}
export async function promptBox(title: string, label: string, opts: { required?: boolean; confirmText?: string; placeholder?: string; inputValue?: string } = {}): Promise<string | null> {
  const r = await Swal.fire({
    title, input: 'text', inputLabel: label, inputPlaceholder: opts.placeholder, inputValue: opts.inputValue || '', showCancelButton: true, confirmButtonText: opts.confirmText || 'Confirmar', cancelButtonText: 'Cancelar', confirmButtonColor: '#1458D4',
    inputValidator: v => (opts.required && !v?.trim() ? 'Preencha este campo.' : undefined),
  })
  return r.isConfirmed ? String(r.value || '') : null
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', padding: 24, fontSize: 14 }}><Loader2 size={16} className="spin" /> {label}</div>
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--muted)' }}>
      {icon && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--terra)' }}>{icon}</div>}
      <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 15 }}>{title}</div>
      {text && <p style={{ margin: '6px auto 14px', maxWidth: 420, fontSize: 13.5, lineHeight: 1.55 }}>{text}</p>}
      {action}
    </div>
  )
}
