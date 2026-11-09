import { useRef, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { api } from '../lib/api'
import { btn, showError } from './ui'

/** Envio de arquivo (imagem/PDF) para /api/admin/uploads. */
export function useUpload() {
  const [busy, setBusy] = useState(false)
  const upload = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    setBusy(true)
    try { return (await api<{ url: string; name: string }>('/admin/uploads', { form: fd })) } finally { setBusy(false) }
  }
  return { upload, busy }
}

export function ImageList({ value, onChange, max = 8 }: { value: string[]; onChange: (v: string[]) => void; max?: number }) {
  const ref = useRef<HTMLInputElement>(null)
  const { upload, busy } = useUpload()
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
        {value.map((src, i) => (
          <div key={src} style={{ position: 'relative', aspectRatio: '1', borderRadius: 4, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {i === 0 && <span style={{ position: 'absolute', left: 4, top: 4, fontSize: 10, background: '#1458D4', color: '#fff', padding: '1px 5px', borderRadius: 2 }}>CAPA</span>}
            <button type="button" title="Remover" onClick={() => onChange(value.filter(v => v !== src))} style={{ position: 'absolute', right: 4, top: 4, width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><X size={13} /></button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" onClick={() => ref.current?.click()} disabled={busy} style={{ ...btn('ghost'), aspectRatio: '1', height: 'auto', flexDirection: 'column', borderStyle: 'dashed' }}>
            {busy ? <Loader2 className="spin" size={18} /> : <ImagePlus size={20} />}<span style={{ fontSize: 11 }}>Adicionar</span>
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async e => {
        const f = e.target.files?.[0]; e.target.value = ''
        if (!f) return
        try { const r = await upload(f); onChange([...value, r.url]) } catch (err) { showError(err) }
      }} />
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0' }}>JPG, PNG ou WEBP até 8 MB. A primeira imagem é a capa do site.</p>
    </div>
  )
}
