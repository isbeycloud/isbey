import { lazy, StrictMode, Suspense, useState } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import { LandingPage } from './pages/LandingPage'

const App = lazy(() => import('./App'))
const publicLanding = window.location.pathname === '/' && !localStorage.getItem('isbey_token')

function Bootstrap() {
  const [screen, setScreen] = useState<'LANDING' | 'LOGIN' | 'REGISTER' | 'APP'>(publicLanding ? 'LANDING' : 'APP')
  if (screen === 'LANDING') return <LandingPage onLoginClick={() => setScreen('LOGIN')} onRegisterClick={() => setScreen('REGISTER')} />
  return <Suspense fallback={<div role="status" style={{ padding: 32, textAlign: 'center' }}>Çalışma alanınız yükleniyor…</div>}><App initialAuthScreen={screen === 'APP' ? 'LANDING' : screen} /></Suspense>
}

const root = document.getElementById('root')!
const content = <StrictMode><Bootstrap /></StrictMode>
if (publicLanding && root.hasChildNodes()) hydrateRoot(root, content)
else createRoot(root).render(content)
