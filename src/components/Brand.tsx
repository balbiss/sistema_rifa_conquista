import { createContext, useContext } from 'react'

// Marca da plataforma (nome/logo vêm de Configurações › Plataforma).
export const BrandCtx = createContext<{ name: string; logo_url: string; tagline: string; primary_color: string }>({ name: 'Conquista Campanhas', logo_url: '', tagline: '', primary_color: '#1458D4' })
export const useBrand = () => useContext(BrandCtx)

export function BrandMark({ size = 34 }: { size?: number }) {
  const b = useBrand()
  if (b.logo_url) return <img src={b.logo_url} alt="" style={{ width: size, height: size, borderRadius: size * 0.24, objectFit: 'cover', flex: 'none' }} />
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden style={{ flex: 'none' }}>
      <rect width="64" height="64" rx="15" fill="#0B1730" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="#FF8A24" strokeWidth="5.5" />
      <path d="M21 32.5l8 8L44 24" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BrandWord({ color = '#0B1730', size = 17 }: { color?: string; size?: number }) {
  const b = useBrand()
  const [first, ...rest] = b.name.split(' ')
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap', minWidth: 0 }}>
      <BrandMark size={size * 1.8} />
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: size, letterSpacing: '.12em', textTransform: 'uppercase', color }}>{first}</span>
        {rest.length > 0 && <span style={{ fontWeight: 700, fontSize: size * 0.56, letterSpacing: '.32em', textTransform: 'uppercase', color, opacity: 0.75, marginTop: 4 }}>{rest.join(' ')}</span>}
      </span>
    </span>
  )
}
