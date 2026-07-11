import { Download, Plus, Share2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getPwaInstallState,
  promptPwaInstall,
  subscribePwaInstall,
  type PwaInstallState,
} from './pwa'
import './PwaInstall.css'

type PwaInstallProps = {
  variant: 'auth' | 'workspace'
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export default function PwaInstall({ variant }: PwaInstallProps) {
  const [installState, setInstallState] = useState<PwaInstallState>(getPwaInstallState)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const ios = isIosDevice()

  useEffect(() => subscribePwaInstall(() => setInstallState(getPwaInstallState())), [])

  if (installState.installed) return null
  if (!installState.deferredPrompt && !ios) return null

  const isIosGuide = !installState.deferredPrompt && ios

  return (
    <div className={`pwa-install pwa-install-${variant}`}>
      <button
        className="pwa-install-button"
        type="button"
        onClick={() => {
          if (isIosGuide) {
            setShowIosGuide((current) => !current)
          } else {
            void promptPwaInstall()
          }
        }}
      >
        <Download size={17} aria-hidden="true" />
        {isIosGuide ? 'Instalar no iPhone' : 'Instalar aplicativo'}
      </button>

      {showIosGuide && (
        <aside className="pwa-install-guide" aria-label="Como instalar o NXGEO no iPhone">
          <button type="button" className="pwa-install-close" onClick={() => setShowIosGuide(false)} aria-label="Fechar instruções">
            <X size={16} aria-hidden="true" />
          </button>
          <strong>Instale em poucos passos</strong>
          <p>Abra o NXGEO no Safari e siga:</p>
          <ol>
            <li><Share2 size={15} aria-hidden="true" /> Toque em <b>Compartilhar</b>.</li>
            <li><Plus size={15} aria-hidden="true" /> Escolha <b>Adicionar à Tela de Início</b>.</li>
            <li>Confirme em <b>Adicionar</b>.</li>
          </ol>
        </aside>
      )}
    </div>
  )
}
