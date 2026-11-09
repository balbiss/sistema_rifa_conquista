// Ícones das etapas (traço azul com detalhe laranja), no estilo da referência visual.
const B = '#1458D4', O = '#FF8A24', SOFT = '#e3ecfd'
type P = { size?: number }

export const IcRegularizacao = ({ size = 64 }: P) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <rect x="22" y="14" width="34" height="42" rx="6" fill={SOFT} />
    <rect x="10" y="10" width="34" height="44" rx="5" fill="#fff" stroke={B} strokeWidth="3" />
    <rect x="19" y="6" width="16" height="9" rx="3" fill="#fff" stroke={B} strokeWidth="3" />
    {[22, 31, 40].map(y => <g key={y}><path d={`M16 ${y} l3 3 l5 -5`} fill="none" stroke={B} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /><path d={`M28 ${y + 1} H37`} stroke={B} strokeWidth="2.6" strokeLinecap="round" /></g>)}
    <circle cx="44" cy="46" r="10" fill={O} />
    <path d="M39.5 46 l3.2 3.2 l6 -6.4" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
export const IcParticipacao = ({ size = 64 }: P) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <rect x="12" y="20" width="48" height="28" rx="6" fill={SOFT} transform="rotate(-10 36 34)" />
    <path d="M6 22 L52 14 C53 18 56 20 60 20 L62 34 C58 35 56 38 57 42 L11 50 C10 46 7 44 3 44 L1 30 C5 29 7 26 6 22Z" fill="#fff" stroke={B} strokeWidth="3" strokeLinejoin="round" transform="translate(1 0)" />
    <path d="M32 22 l2.8 5.8 6.3 .8 -4.6 4.4 1.1 6.2 -5.6 -3 -5.6 3 1.1 -6.2 -4.6 -4.4 6.3 -.8z" fill={O} transform="rotate(-9 32 31)" />
  </svg>
)
export const IcConclusao = ({ size = 64 }: P) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <rect x="30" y="18" width="30" height="40" rx="8" fill={SOFT} />
    {[[8, 44, 10], [20, 36, 18], [32, 28, 26], [44, 20, 34]].map(([x, y, h], i) => <rect key={x} x={x} y={y} width="9" height={h} rx="2" fill={i === 3 ? O : '#fff'} stroke={i === 3 ? O : B} strokeWidth="3" />)}
    <path d="M6 30 C20 24 32 16 50 8" fill="none" stroke={O} strokeWidth="3.2" strokeLinecap="round" />
    <path d="M42 6 L52 7 L49 16" fill="none" stroke={O} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
export const IcApuracao = ({ size = 64 }: P) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
    <ellipse cx="44" cy="30" rx="16" ry="18" fill={SOFT} />
    <path d="M18 8 H46 V22 C46 32 40 38 32 38 C24 38 18 32 18 22Z" fill="#fff" stroke={B} strokeWidth="3" strokeLinejoin="round" />
    <path d="M18 12 H9 C9 22 13 27 19 28 M46 12 H55 C55 22 51 27 45 28" fill="none" stroke={B} strokeWidth="3" strokeLinecap="round" />
    <path d="M32 38 V48 M22 56 H42 M25 56 C25 51 28 48 32 48 C36 48 39 51 39 56" fill="none" stroke={B} strokeWidth="3" strokeLinecap="round" />
    <path d="M32 13 l2.6 5.2 5.7 .8 -4.1 4 1 5.6 -5.2 -2.7 -5.2 2.7 1 -5.6 -4.1 -4 5.7 -.8z" fill={O} />
  </svg>
)
export const IcEscudo = ({ size = 46 }: P) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
    <path d="M24 5 L39 11 V23 C39 33 32 40 24 43 C16 40 9 33 9 23 V11Z" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinejoin="round" />
    <path d="M17 24 l5 5 l9 -10" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
export const IcDocumento = ({ size = 46 }: P) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
    <path d="M12 5 H29 L38 14 V43 H12Z" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinejoin="round" />
    <path d="M28 5 V15 H38" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinejoin="round" />
    <path d="M18 24 H32 M18 31 H32 M18 38 H27" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
  </svg>
)
