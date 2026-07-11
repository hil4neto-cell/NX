import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowLeft,
  Download,
  FolderOpen,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Map,
  ShieldCheck,
} from 'lucide-react'
import PwaInstall from './PwaInstall'
import { supabase } from './supabase'
import './AuthGate.css'

type AuthGateProps = {
  children: ReactNode
}

type AccessState = 'idle' | 'checking' | 'allowed' | 'denied' | 'error'

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [accessState, setAccessState] = useState<AccessState>('idle')
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(data.session)
      setAccessState(data.session ? 'checking' : 'idle')
      setIsError(Boolean(error))
      setMessage(error ? 'Não foi possível validar sua sessão. Tente novamente.' : '')
      setIsCheckingSession(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setAccessState(nextSession ? 'checking' : 'idle')
      setIsCheckingSession(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session || accessState !== 'checking') return

    let active = true
    void supabase.rpc('nxgeo_current_user_is_allowed').then(({ data, error }) => {
      if (!active) return
      setAccessState(error ? 'error' : data === true ? 'allowed' : 'denied')
    })

    return () => {
      active = false
    }
  }, [accessState, session])

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSending(true)
    setIsError(false)
    setMessage('')

    const normalizedEmail = email.trim().toLowerCase()
    const redirectPath = import.meta.env.BASE_URL.replace(/\/$/, '')
    try {
      await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}${redirectPath}`,
          shouldCreateUser: true,
        },
      })

      setMessage('Se este e-mail estiver autorizado, enviaremos um link de acesso. Verifique também o spam.')
    } catch {
      setIsError(true)
      setMessage('Não foi possível contatar o serviço de acesso. Tente novamente em instantes.')
    } finally {
      setIsSending(false)
    }
  }

  if (isCheckingSession || (session && accessState === 'checking')) {
    return (
      <main className="auth-shell auth-loading" aria-live="polite">
        <LoaderCircle className="auth-spinner" aria-hidden="true" />
        <p>Validando seu acesso ao NXGEO…</p>
      </main>
    )
  }

  if (session && accessState === 'allowed') return children

  if (session && accessState === 'denied') {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-denied-title">
          <div className="auth-lock" aria-hidden="true"><LockKeyhole size={28} /></div>
          <h1 id="auth-denied-title">Acesso não autorizado</h1>
          <p>Este e-mail não está liberado para o NXGEO ou teve o acesso desativado.</p>
          <button className="auth-secondary-action" type="button" onClick={() => void supabase.auth.signOut()}>
            Usar outro e-mail
          </button>
        </section>
      </main>
    )
  }

  if (session && accessState === 'error') {
    return (
      <main className="auth-shell">
        <section className="auth-card" aria-labelledby="auth-error-title">
          <div className="auth-lock" aria-hidden="true"><LockKeyhole size={28} /></div>
          <h1 id="auth-error-title">Não foi possível validar o acesso</h1>
          <p>Tente novamente. Se o problema continuar, fale com a equipe NX.</p>
          <button className="auth-secondary-action" type="button" onClick={() => setAccessState('checking')}>
            Tentar novamente
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-shell">
      <a className="auth-back" href="/">
        <ArrowLeft size={17} aria-hidden="true" /> Voltar ao site
      </a>

      <div className="auth-layout">
        <section className="auth-intro" aria-labelledby="auth-intro-title">
          <div className="auth-brand">
            <img src={`${import.meta.env.BASE_URL}nx-white.svg`} alt="NX" />
            <div>
              <strong>GEO</strong>
              <span>plataforma de trabalho</span>
            </div>
          </div>

          <p className="auth-eyebrow">Plataforma de trabalho</p>
          <h1 id="auth-intro-title">Projetos e mapas, em um só lugar.</h1>
          <p className="auth-intro-copy">
            Um espaço seguro para organizar projetos, trabalhar com mapas e exportar resultados com clareza.
          </p>

          <ul className="auth-benefits" aria-label="Recursos da plataforma">
            <li><FolderOpen size={19} aria-hidden="true" /><span>Projetos organizados</span></li>
            <li><Map size={19} aria-hidden="true" /><span>Mapas sempre à mão</span></li>
            <li><Download size={19} aria-hidden="true" /><span>Exportação rápida</span></li>
          </ul>

          <PwaInstall variant="auth" />
        </section>

        <section className="auth-card auth-login-card" aria-labelledby="auth-title">
          <div className="auth-access-label">
            <ShieldCheck size={17} aria-hidden="true" />
            <span>Acesso seguro</span>
          </div>

          <h2 id="auth-title">Bem-vindo ao NXGEO</h2>
          <p>Use o e-mail autorizado para acessar seu espaço de trabalho.</p>

          <form className="auth-form" onSubmit={requestMagicLink}>
            <label htmlFor="auth-email">E-mail de acesso</label>
            <div className="auth-input">
              <Mail size={18} aria-hidden="true" />
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="nome@empresa.com"
                required
              />
            </div>
            <button type="submit" disabled={isSending}>
              {isSending ? <LoaderCircle className="auth-spinner" size={18} aria-hidden="true" /> : <Mail size={18} aria-hidden="true" />}
              {isSending ? 'Enviando…' : 'Receber link de acesso'}
            </button>
          </form>

          {message && <p className={isError ? 'auth-message error' : 'auth-message'} role="status">{message}</p>}

          <div className="auth-helper">
            <LockKeyhole size={15} aria-hidden="true" />
            <small>Enviaremos um link seguro. Você não precisa criar senha.</small>
          </div>
        </section>
      </div>
    </main>
  )
}
