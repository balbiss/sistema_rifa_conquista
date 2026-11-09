// Ilustrações vetoriais do site público (sem fotos de banco, sem documento oficial reproduzido):
// pessoa segurando um cartão genérico de habilitação, e carro + moto. Quando a campanha tiver foto
// enviada pelo administrador, o banner usa a foto no lugar destas ilustrações.

export function PersonArt() {
  const skin = '#f2c4a0', skinShade = '#e0a982', hair = '#2e1b12'
  return (
    <svg viewBox="0 0 360 470" role="img" aria-label="Ilustração: pessoa sorrindo segurando um cartão de habilitação A/B" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <radialGradient id="pa-glow" cx=".5" cy=".45" r=".5"><stop offset="0" stopColor="#2a6cf0" stopOpacity=".55" /><stop offset="1" stopColor="#2a6cf0" stopOpacity="0" /></radialGradient>
        <linearGradient id="pa-jacket" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d66e6" /><stop offset="1" stopColor="#0f45ad" /></linearGradient>
        <linearGradient id="pa-card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e9f0fb" /></linearGradient>
        <filter id="pa-sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#020814" floodOpacity=".35" /></filter>
      </defs>
      <circle cx="180" cy="220" r="175" fill="url(#pa-glow)" />
      {/* cabelo (atrás) */}
      <path d="M108 160 C96 74 166 38 206 52 C262 68 276 136 266 204 C260 250 274 300 252 336 L118 336 C92 292 112 236 108 160Z" fill={hair} />
      {/* corpo */}
      <path d="M58 470 C62 336 116 276 182 268 C248 276 300 336 304 470Z" fill="url(#pa-jacket)" />
      <path d="M150 272 L182 338 L214 272 C204 268 194 266 182 266 C170 266 160 268 150 272Z" fill="#ffffff" />
      <path d="M150 272 L132 300 L166 318Z M214 272 L232 300 L198 318Z" fill="#0f45ad" opacity=".55" />
      {/* pescoço e rosto */}
      <path d="M164 214 H200 V256 C200 270 164 270 164 256Z" fill={skinShade} />
      <ellipse cx="182" cy="154" rx="58" ry="68" fill={skin} />
      <ellipse cx="124" cy="160" rx="9" ry="13" fill={skinShade} /><ellipse cx="240" cy="160" rx="9" ry="13" fill={skinShade} />
      {/* franja */}
      <path d="M122 146 C120 92 166 76 202 82 C242 90 254 124 246 160 C232 126 200 110 168 118 C146 124 132 134 122 146Z" fill={hair} />
      <path d="M246 150 C258 200 256 250 262 300 L246 300 C246 250 240 200 236 160Z" fill={hair} />
      {/* olhos, sobrancelhas, sorriso */}
      <path d="M150 140 Q162 133 172 139" stroke={hair} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M194 139 Q204 133 216 140" stroke={hair} strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M152 158 Q161 151 170 158" stroke="#2a1a14" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M196 158 Q205 151 214 158" stroke="#2a1a14" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="150" cy="178" r="10" fill="#f39a8c" opacity=".35" /><circle cx="216" cy="178" r="10" fill="#f39a8c" opacity=".35" />
      <path d="M160 184 Q183 210 206 184 Q183 194 160 184Z" fill="#ffffff" stroke="#c0505a" strokeWidth="2.5" strokeLinejoin="round" />
      {/* braços */}
      <path d="M98 300 Q66 352 86 382" stroke="#1458D4" strokeWidth="34" fill="none" strokeLinecap="round" />
      <path d="M266 300 Q300 344 284 368" stroke="#1458D4" strokeWidth="34" fill="none" strokeLinecap="round" />
      {/* cartão de habilitação genérico */}
      <g transform="translate(78 300) rotate(-7)" filter="url(#pa-sh)">
        <rect width="214" height="132" rx="14" fill="url(#pa-card)" />
        <path d="M0 14 A14 14 0 0 1 14 0 H200 A14 14 0 0 1 214 14 V36 H0Z" fill="#1458D4" />
        <text x="16" y="25" fill="#fff" fontFamily="Montserrat, Arial" fontWeight="800" fontSize="13" letterSpacing="1.5">HABILITAÇÃO</text>
        <circle cx="194" cy="18" r="8" fill="#FF8A24" />
        <rect x="14" y="48" width="56" height="70" rx="8" fill="#dbe6fb" />
        <circle cx="42" cy="73" r="13" fill="#9fb7e6" />
        <path d="M22 112 C26 96 58 96 62 112Z" fill="#9fb7e6" />
        <rect x="82" y="52" width="110" height="9" rx="4.5" fill="#cfdbf2" />
        <rect x="82" y="69" width="80" height="9" rx="4.5" fill="#dfe7f6" />
        <g transform="translate(82 88)">
          <rect width="40" height="28" rx="7" fill="#0B1730" /><text x="20" y="20" textAnchor="middle" fill="#fff" fontFamily="Montserrat, Arial" fontWeight="900" fontSize="16">A</text>
          <rect x="48" width="40" height="28" rx="7" fill="#FF8A24" /><text x="68" y="20" textAnchor="middle" fill="#fff" fontFamily="Montserrat, Arial" fontWeight="900" fontSize="16">B</text>
        </g>
      </g>
      {/* mãos segurando */}
      <ellipse cx="86" cy="378" rx="15" ry="21" fill={skin} transform="rotate(-12 86 378)" />
      <ellipse cx="288" cy="356" rx="15" ry="21" fill={skin} transform="rotate(10 288 356)" />
      <path d="M92 366 q10 -2 14 6" stroke={skinShade} strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M282 344 q-10 -2 -14 6" stroke={skinShade} strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export function VehiclesArt({ dark = true }: { dark?: boolean }) {
  return (
    <svg viewBox="0 0 700 290" role="img" aria-label="Ilustração: carro e motocicleta" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="va-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4f6fa" /><stop offset=".55" stopColor="#c9d1de" /><stop offset="1" stopColor="#8e9aae" /></linearGradient>
        <linearGradient id="va-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a3d63" /><stop offset="1" stopColor="#0d1830" /></linearGradient>
        <linearGradient id="va-tank" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffa24d" /><stop offset="1" stopColor="#e45d00" /></linearGradient>
        <radialGradient id="va-floor" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor={dark ? '#2a6cf0' : '#1458D4'} stopOpacity={dark ? '.45' : '.18'} /><stop offset="1" stopColor="#2a6cf0" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="350" cy="262" rx="340" ry="30" fill="url(#va-floor)" />
      <ellipse cx="250" cy="262" rx="215" ry="12" fill="#000" opacity=".35" />
      <ellipse cx="575" cy="262" rx="100" ry="9" fill="#000" opacity=".35" />
      {/* carro */}
      <g transform="translate(20 70)">
        <path d="M14 150 C12 118 36 106 70 102 L132 64 C148 54 164 50 184 50 H304 C328 50 344 56 360 70 L402 100 C440 104 468 114 474 138 L476 158 C476 170 468 176 456 176 H30 C20 176 14 168 14 160Z" fill="url(#va-body)" />
        <path d="M140 70 L116 98 H236 V64 H186 C164 64 152 64 140 70Z" fill="url(#va-glass)" />
        <path d="M248 64 V98 H382 L346 72 C338 66 326 64 310 64Z" fill="url(#va-glass)" />
        <path d="M150 72 L132 94 H170 L188 70Z" fill="#fff" opacity=".12" />
        <path d="M60 126 H470" stroke="#7c889c" strokeWidth="2" opacity=".6" />
        <path d="M242 100 V170" stroke="#7c889c" strokeWidth="2" opacity=".6" />
        <rect x="200" y="114" width="22" height="5" rx="2.5" fill="#7c889c" />
        <rect x="300" y="114" width="22" height="5" rx="2.5" fill="#7c889c" />
        <path d="M440 116 C456 118 468 124 472 134 L446 134 C440 130 438 122 440 116Z" fill="#fff6d8" />
        <path d="M18 132 L40 128 L42 142 L18 144Z" fill="#e2463a" />
        <rect x="430" y="148" width="44" height="10" rx="4" fill="#4b5568" />
        {[112, 382].map(x => (
          <g key={x}>
            <circle cx={x} cy="176" r="36" fill="#0d1424" />
            <circle cx={x} cy="176" r="21" fill="#b9c2d0" />
            <circle cx={x} cy="176" r="8" fill="#2d3748" />
            {[0, 72, 144, 216, 288].map(a => <rect key={a} x={x - 2.5} y={158} width="5" height="13" rx="2" fill="#2d3748" transform={`rotate(${a} ${x} 176)`} />)}
          </g>
        ))}
      </g>
      {/* moto */}
      <g transform="translate(468 104)">
        {[46, 182].map(x => (
          <g key={x}>
            <circle cx={x} cy="142" r="42" fill="#0d1424" />
            <circle cx={x} cy="142" r="30" fill="none" stroke="#FF8A24" strokeWidth="4" />
            <circle cx={x} cy="142" r="7" fill="#9aa6b8" />
          </g>
        ))}
        <path d="M46 142 L92 90 L150 92 L182 142" stroke="#1b2333" strokeWidth="9" fill="none" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M92 90 L120 132 L150 92" stroke="#3a4558" strokeWidth="7" fill="none" strokeLinejoin="round" />
        <rect x="98" y="104" width="40" height="28" rx="6" fill="#3a4558" />
        <path d="M60 84 C70 64 104 60 118 70 L112 88 H66Z" fill="#141b29" />
        <path d="M104 62 C120 46 152 46 166 62 L160 86 H112Z" fill="url(#va-tank)" />
        <path d="M118 58 C130 52 148 52 156 58" stroke="#fff" strokeWidth="3" opacity=".5" fill="none" strokeLinecap="round" />
        <path d="M166 62 L178 34 M168 34 H196" stroke="#1b2333" strokeWidth="6" strokeLinecap="round" />
        <path d="M176 56 C190 52 204 60 204 72 L186 76Z" fill="url(#va-tank)" />
        <circle cx="202" cy="66" r="7" fill="#fff6d8" />
        <path d="M60 112 L22 108" stroke="#8e9aae" strokeWidth="7" strokeLinecap="round" />
      </g>
    </svg>
  )
}
