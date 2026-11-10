import { useState, type CSSProperties } from 'react'
import { Eye, EyeOff } from 'lucide-react'

/** Campo de senha com o "olhinho" para mostrar/ocultar o que foi digitado. */
export function PasswordInput({ value, onChange, style, placeholder, autoComplete = 'current-password', required, ariaLabel }: {
  value: string; onChange: (v: string) => void; style?: CSSProperties; placeholder?: string; autoComplete?: string; required?: boolean; ariaLabel?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoComplete={autoComplete} required={required}
        aria-label={ariaLabel} autoCapitalize="none" autoCorrect="off" spellCheck={false} style={{ ...style, paddingRight: 46 }} />
      <EyeButton show={show} onToggle={() => setShow(s => !s)} />
    </span>
  )
}

export function EyeButton({ show, onToggle, color = '#5d6b85', style }: { show: boolean; onToggle: () => void; color?: string; style?: CSSProperties }) {
  return (
    <button type="button" onClick={onToggle} aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} title={show ? 'Ocultar senha' : 'Mostrar senha'}
      style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 38, height: 38, border: 'none', background: 'none', color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, ...style }}>
      {show ? <EyeOff size={19} /> : <Eye size={19} />}
    </button>
  )
}
