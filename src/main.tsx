import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import './index.css'
import { api, useLive } from './lib/api'
import { BrandCtx } from './components/Brand'
import { AppShell } from './components/AppShell'
import { Loading } from './components/ui'
import Login from './pages/Login'
import Home from './pages/publico/Home'

const CampanhaPublica = lazy(() => import('./pages/publico/Campanha'))
const Regulamento = lazy(() => import('./pages/publico/Regulamento'))
const Transparencia = lazy(() => import('./pages/publico/Transparencia'))
const Resultados = lazy(() => import('./pages/publico/Resultados'))
const Legal = lazy(() => import('./pages/publico/Legal'))
const RefLink = lazy(() => import('./pages/publico/RefLink'))
const MinhaConta = lazy(() => import('./pages/publico/MinhaConta'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const Campanhas = lazy(() => import('./pages/admin/Campanhas'))
const CampanhaEditor = lazy(() => import('./pages/admin/CampanhaEditor'))
const Identificadores = lazy(() => import('./pages/admin/Identificadores'))
const Participantes = lazy(() => import('./pages/admin/Participantes'))
const Afiliados = lazy(() => import('./pages/admin/Afiliados'))
const Comissoes = lazy(() => import('./pages/admin/Comissoes'))
const Financeiro = lazy(() => import('./pages/admin/Financeiro'))
const Apuracao = lazy(() => import('./pages/admin/Apuracao'))
const Premios = lazy(() => import('./pages/admin/Premios'))
const Relatorios = lazy(() => import('./pages/admin/Relatorios'))
const Configuracoes = lazy(() => import('./pages/admin/Configuracoes'))
const Auditoria = lazy(() => import('./pages/admin/Auditoria'))
const AfPainel = lazy(() => import('./pages/afiliado/Painel'))
const AfIndicacoes = lazy(() => import('./pages/afiliado/Indicacoes'))
const AfComissoes = lazy(() => import('./pages/afiliado/Comissoes'))
const AfSaques = lazy(() => import('./pages/afiliado/Saques'))
const Saques = lazy(() => import('./pages/admin/Saques'))
const Pagamentos = lazy(() => import('./pages/admin/Pagamentos'))
const MeusNumeros = lazy(() => import('./pages/publico/MeusNumeros'))
const SejaAfiliado = lazy(() => import('./pages/publico/SejaAfiliado'))

function App() {
  const [brand, setBrand] = useState({ name: 'Conquista Campanhas', logo_url: '', tagline: '', primary_color: '#1458D4' })
  const load = () => api('/public/settings').then(s => { setBrand(s.platform); document.title = s.platform.name }).catch(() => {})
  useEffect(() => { load() }, [])
  useLive(['settings'], load)
  return (
    <BrandCtx.Provider value={brand}>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/c/:slug" element={<CampanhaPublica />} />
            <Route path="/c/:slug/regulamento" element={<Regulamento />} />
            <Route path="/c/:slug/transparencia" element={<Transparencia />} />
            <Route path="/meus-numeros" element={<MeusNumeros />} />
            <Route path="/seja-afiliado" element={<SejaAfiliado />} />
            <Route path="/resultados" element={<Resultados />} />
            <Route path="/termos" element={<Legal kind="terms" />} />
            <Route path="/privacidade" element={<Legal kind="privacy" />} />
            <Route path="/r/:code" element={<RefLink />} />
            <Route path="/entrar" element={<Login />} />
            <Route path="/minha-conta" element={<MinhaConta />} />
            <Route path="/admin" element={<AppShell area="admin" />}>
              <Route index element={<Dashboard />} />
              <Route path="campanhas" element={<Campanhas />} />
              <Route path="campanhas/:id" element={<CampanhaEditor />} />
              <Route path="identificadores" element={<Identificadores />} />
              <Route path="participantes" element={<Participantes />} />
              <Route path="afiliados" element={<Afiliados />} />
              <Route path="comissoes" element={<Comissoes />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="saques" element={<Saques />} />
              <Route path="pagamentos" element={<Pagamentos />} />
              <Route path="apuracao" element={<Apuracao />} />
              <Route path="premios" element={<Premios />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="auditoria" element={<Auditoria />} />
            </Route>
            <Route path="/afiliado" element={<AppShell area="afiliado" />}>
              <Route index element={<AfPainel />} />
              <Route path="indicacoes" element={<AfIndicacoes />} />
              <Route path="comissoes" element={<AfComissoes />} />
              <Route path="saques" element={<AfSaques />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </BrandCtx.Provider>
  )
}

createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>)
