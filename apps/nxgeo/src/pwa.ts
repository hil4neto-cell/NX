export type InstallPromptChoice = 'accepted' | 'dismissed' | 'unavailable'

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type PwaInstallState = {
  deferredPrompt: DeferredInstallPrompt | null
  installed: boolean
}

type Listener = () => void

let initialized = false
let state: PwaInstallState = {
  deferredPrompt: null,
  installed: false,
}
const listeners = new Set<Listener>()

function isStandalone() {
  if (typeof window === 'undefined') return false
  const iosNavigator = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true
}

function notify() {
  listeners.forEach((listener) => listener())
}

function setState(next: PwaInstallState) {
  state = next
  notify()
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const baseUrl = import.meta.env.BASE_URL
  void navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).catch(() => undefined)
}

export function initializePwa() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  state = { ...state, installed: isStandalone() }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    setState({ ...state, deferredPrompt: event as DeferredInstallPrompt })
  })

  window.addEventListener('appinstalled', () => {
    setState({ deferredPrompt: null, installed: true })
  })

  if (document.readyState === 'complete') {
    registerServiceWorker()
  } else {
    window.addEventListener('load', registerServiceWorker, { once: true })
  }
}

export function getPwaInstallState() {
  return state
}

export function subscribePwaInstall(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export async function promptPwaInstall(): Promise<InstallPromptChoice> {
  const prompt = state.deferredPrompt
  if (!prompt) return 'unavailable'

  setState({ ...state, deferredPrompt: null })
  try {
    await prompt.prompt()
    const choice = await prompt.userChoice
    if (choice.outcome === 'accepted') {
      setState({ deferredPrompt: null, installed: true })
    }
    return choice.outcome
  } catch {
    return 'unavailable'
  }
}
