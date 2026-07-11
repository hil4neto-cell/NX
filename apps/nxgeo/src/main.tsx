import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './AuthGate.tsx'
import Workspace from './Workspace.tsx'
import { initializePwa } from './pwa.ts'

initializePwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <Workspace />
    </AuthGate>
  </StrictMode>,
)
