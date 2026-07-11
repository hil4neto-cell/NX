import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeft, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'
import { supabase } from './supabase'
import './AuthGate.css'

type AuthGateProps = {
  children: ReactNode
}

export default function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      setSession(data.session)
      setIsError(Boolean(error))
      setMessage(error ? 'Não foi possível validar sua sessão. Tente novamente.' : '')
      setIsCheckingSession(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setIsCheckingSession(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSending(true)
    setIsError(false)
    setMessage('')

    const redirectPath = import.meta.env.BASE_URL.replace(/\/$/, '')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}${redirectPath}`,
        shouldCreateUser: false,
      },
    })

    if (error) {
      setIsError(true)
      setMessage('Não foi possível enviar o acesso. Confirme o e-mail ou fale com a equipe NX.')
    } else {
      setMessage('Enviamos um link de acesso. Verifique sua caixa de entrada e o spam.')
    }

    setIsSending(false)
  }

  if (isCheckingSession) {
    return (
      <main className="auth-shell auth-loading" aria-live="polite">
        <LoaderCircle className="auth-spinner" aria-hidden="true" />
        <p>Validando seu acesso ao NXGEO…</p>
      </main>
    )
  }

  if (session) return children

  return (
    <main className="auth-shell">
      <a className="auth-back" href="/">
        <ArrowLeft size={17} aria-hidden="true" /> Voltar ao site
      </a>

      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <img src={`${import.meta.env.BASE_URL}nx-white.svg`} alt="NX" />
          <div>
            <strong>GEO</strong>
            <span>acesso técnico</span>
          </div>
        </div>

        <div className="auth-lock" aria-hidden="true"><LockKeyhole size={28} /></div>
        <h1 id="auth-title">Acesso ao NXGEO</h1>
        <p>Entre com o e-mail autorizado pela equipe NX. Você receberá um link seguro e não precisará criar senha.</p>

        <form className="auth-form" onSubmit={requestMagicLink}>
          <label htmlFor="auth-email">E-mail</label>
          <div className="auth-input">
            <Mail size={18} aria-hidden="true" />
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="voce@empresa.com"
              required
            />
          </div>
          <button type="submit" disabled={isSending}>
            {isSending ? <LoaderCircle className="auth-spinner" size={18} aria-hidden="true" /> : <Mail size={18} aria-hidden="true" />}
            {isSending ? 'Enviando…' : 'Receber link de acesso'}
          </button>
        </form>

        {message && <p className={isError ? 'auth-message error' : 'auth-message'} role="status">{message}</p>}
        <small>A sessão ficará salva neste navegador até você sair.</small>
      </section>
    </main>
  )
}
