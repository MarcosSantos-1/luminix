'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  browserSessionPersistence,
  confirmPasswordReset,
  setPersistence,
  signInWithEmailAndPassword,
  verifyPasswordResetCode,
} from 'firebase/auth'
import { AppStatus } from '@/components/app-status'
import '@/components/auth/auth.css'
import { getFirebaseAuth } from '@/lib/firebase'

type State =
  | { kind: 'checking' }
  | { kind: 'invalid' }
  | { kind: 'ready'; code: string; email: string }
  | { kind: 'entering' }

/** Our page for the link in the "Esqueci a senha" e-mail (instead of Firebase's generic one). */
export default function NewPasswordPage() {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mismatch = confirmation.length > 0 && confirmation !== password

  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = new URLSearchParams(window.location.search).get('oobCode') ?? ''
    // The code is a one-time credential: keep it out of the address bar and history.
    window.history.replaceState(null, '', window.location.pathname)
    const check = code
      ? verifyPasswordResetCode(getFirebaseAuth(), code)
      : Promise.reject(new Error('Missing code'))
    check
      .then((email) => setState({ kind: 'ready', code, email }))
      .catch(() => setState({ kind: 'invalid' }))
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.kind !== 'ready') return
    setError('')
    if (password.length < 6) return setError('Use uma senha com pelo menos 6 caracteres.')
    if (password !== confirmation) return setError('As senhas não coincidem.')
    setBusy(true)
    try {
      const auth = getFirebaseAuth()
      await confirmPasswordReset(auth, state.code, password)
      setState({ kind: 'entering' })
      await setPersistence(auth, browserSessionPersistence)
      await signInWithEmailAndPassword(auth, state.email, password)
      router.replace('/')
    } catch (caught) {
      const code = (caught as { code?: string })?.code ?? ''
      if (state.kind === 'ready' && /expired|invalid-action/.test(code))
        setState({ kind: 'invalid' })
      else if (code === 'auth/weak-password') setError('Escolha uma senha mais forte.')
      else if (code) router.replace('/login')
      else setError('Não foi possível salvar agora. Confira a conexão e tente de novo.')
      setBusy(false)
    }
  }

  if (state.kind === 'checking' || state.kind === 'entering') return <AppStatus scene="entry" />

  return (
    <main className="auth-shell flex min-h-dvh w-full justify-center bg-[#fffafa] px-5 py-8 text-[#34101f] sm:px-8 sm:py-12">
      <div className="flex w-full max-w-[520px] flex-col">
        <Link href="/login" className="w-fit">
          <Image
            src="/brand/logo-letter-default.png"
            width={267}
            height={60}
            alt="Luminix"
            className="-ml-3 h-auto w-[160px] sm:w-[190px]"
            priority
          />
        </Link>
        {state.kind === 'invalid' ? (
          <div className="auth-ask my-auto py-10">
            <h1>Este link já foi usado ou expirou</h1>
            <p className="auth-ask-hint">
              Por segurança, o link para criar uma nova senha vale por 1 hora e só funciona uma vez.
              Peça um novo na tela de entrada, em “Esqueci a senha”.
            </p>
            <div className="auth-ask-actions">
              <button
                type="button"
                className="auth-ask-next"
                onClick={() => router.replace('/login')}
              >
                Voltar para a entrada
              </button>
            </div>
          </div>
        ) : (
          <form className="auth-ask my-auto py-10" onSubmit={submit} noValidate>
            <h1>Crie sua nova senha</h1>
            <p className="auth-ask-hint">
              Para a conta <strong>{state.email}</strong>.
            </p>
            <input
              className="auth-ask-input"
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="Nova senha"
              aria-label="Nova senha"
              minLength={6}
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <input
              className="auth-ask-input"
              type="password"
              name="confirmation"
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              aria-label="Repita a nova senha"
              aria-invalid={mismatch || undefined}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            {mismatch ? (
              <p className="auth-ask-error" role="status">
                As senhas não coincidem.
              </p>
            ) : null}
            {error ? (
              <p className="auth-ask-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="auth-ask-actions">
              <button type="submit" className="auth-ask-next" disabled={busy || mismatch}>
                {busy ? 'Salvando…' : 'Salvar e entrar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
