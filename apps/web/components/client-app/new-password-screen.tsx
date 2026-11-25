'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import {
  confirmPasswordReset,
  signInWithEmailAndPassword,
  verifyPasswordResetCode,
} from 'firebase/auth'
import { clientAuth } from '../../lib/client-app/firebase'
import { Lines } from './ui'

type State =
  { kind: 'checking' } | { kind: 'invalid' } | { kind: 'ready'; code: string; email: string }

/** Our page for the link in the "Esqueci a senha" e-mail (instead of Firebase's generic one). */
export function NewPasswordScreen() {
  const router = useRouter()
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const started = useRef(false)
  const mismatch = confirmation.length > 0 && confirmation !== password

  useEffect(() => {
    if (started.current) return
    started.current = true
    const code = new URLSearchParams(window.location.search).get('oobCode') ?? ''
    // The code is a one-time credential: keep it out of the address bar and history.
    window.history.replaceState(null, '', window.location.pathname)
    const check = code
      ? verifyPasswordResetCode(clientAuth(), code)
      : Promise.reject(new Error('Missing code'))
    check
      .then((email) => setState({ kind: 'ready', code, email }))
      .catch(() => setState({ kind: 'invalid' }))
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.kind !== 'ready') return
    setError('')
    if (password.length < 8) return setError('A senha precisa ter pelo menos 8 caracteres.')
    if (password !== confirmation) return setError('As senhas não coincidem.')
    setBusy(true)
    try {
      await confirmPasswordReset(clientAuth(), state.code, password)
      await signInWithEmailAndPassword(clientAuth(), state.email, password)
      router.replace('/cliente')
    } catch (caught) {
      const code = (caught as { code?: string })?.code ?? ''
      if (/expired|invalid-action/.test(code)) setState({ kind: 'invalid' })
      else if (code.includes('weak-password')) setError('Escolha uma senha mais forte.')
      else if (code) router.replace('/cliente/entrar')
      else setError('Não foi possível salvar agora. Confira a conexão e tente de novo.')
      setBusy(false)
    }
  }

  return (
    <div className="ca ca-auth" data-theme="luminix">
      <section className="ca-auth-hero">
        <Lines />
        <Link href="/" className="ca-auth-logo" aria-label="Luminix">
          <Image src="/brand/logo-letter.png" width={2170} height={725} alt="Luminix" priority />
        </Link>
        <div>
          <h1>Sua conta, de volta em um minuto.</h1>
          <p>Escolha uma nova senha e continue de onde parou.</p>
        </div>
      </section>

      <section className="ca-auth-panel">
        {state.kind === 'checking' ? (
          <div className="ca-form ca-auth-form" aria-busy="true">
            <header>
              <h2>Conferindo o link…</h2>
            </header>
          </div>
        ) : state.kind === 'invalid' ? (
          <div className="ca-form ca-auth-form">
            <header>
              <h2>Este link já foi usado ou expirou</h2>
              <p>
                Por segurança, ele vale por 1 hora e só funciona uma vez. Peça um novo em “Esqueci
                minha senha”.
              </p>
            </header>
            <Link className="ca-button" href="/cliente/entrar">
              Voltar para a entrada <ArrowRight size={18} aria-hidden />
            </Link>
          </div>
        ) : (
          <form className="ca-form ca-auth-form" onSubmit={submit} noValidate>
            <header>
              <h2>Crie sua nova senha</h2>
              <p>Para a conta {state.email}.</p>
            </header>
            <label>
              Nova senha
              <span className="ca-field ca-password">
                <LockKeyhole size={18} aria-hidden />
                <input
                  name="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Pelo menos 8 caracteres"
                  minLength={8}
                  autoFocus
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </span>
            </label>
            <label>
              Confirmar nova senha
              <span className="ca-field ca-password" data-invalid={mismatch || undefined}>
                <LockKeyhole size={18} aria-hidden />
                <input
                  name="confirmation"
                  type={visible ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repita a senha"
                  aria-invalid={mismatch || undefined}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </span>
              {confirmation ? (
                <small
                  className={mismatch ? 'ca-match is-wrong' : 'ca-match is-right'}
                  role="status"
                >
                  {mismatch ? 'As senhas não coincidem.' : 'Senhas iguais.'}
                </small>
              ) : null}
            </label>
            <p className="ca-error" role="alert">
              {error}
            </p>
            <button className="ca-button" type="submit" disabled={busy || mismatch}>
              {busy ? 'Salvando…' : 'Salvar e entrar'} <ArrowRight size={18} aria-hidden />
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
