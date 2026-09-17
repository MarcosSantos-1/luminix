'use client'

import { useEffect, useState, type FormEvent } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
} from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'

type Mode = 'login' | 'signup'

function authMessage(code: string): string {
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return ''
  if (code === 'auth/popup-blocked')
    return 'O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.'
  if (code === 'auth/operation-not-allowed')
    return 'Este método de acesso ainda não está habilitado. Tente e-mail ou fale com o suporte.'
  if (code === 'auth/unauthorized-domain')
    return 'Este domínio ainda não está autorizado no Firebase.'
  if (code === 'auth/email-already-in-use')
    return 'Este e-mail já tem conta. Entre ou use o Google.'
  if (code === 'auth/weak-password') return 'Use uma senha com pelo menos 6 caracteres.'
  if (code === 'auth/invalid-email') return 'Confira o e-mail informado.'
  return 'Não foi possível concluir. Confira os dados e tente novamente.'
}

export function StaffAuthPanel({
  heading,
  compact = false,
  initialMode = 'signup',
}: {
  heading: string
  compact?: boolean
  initialMode?: Mode
}) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [emailLink, setEmailLink] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        setEmailLink(isSignInWithEmailLink(getFirebaseAuth(), window.location.href))
      } catch {
        setError('Autenticação indisponível.')
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [])

  async function google() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(getFirebaseAuth(), provider)
    } catch (caught) {
      const code =
        typeof caught === 'object' && caught && 'code' in caught ? String(caught.code) : ''
      setError(authMessage(code))
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const auth = getFirebaseAuth()
      if (emailLink) {
        await signInWithEmailLink(auth, email.trim(), window.location.href)
        window.history.replaceState(null, '', window.location.pathname)
        setEmailLink(false)
      } else if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email.trim(), password)
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
      setPassword('')
    } catch (caught) {
      const code =
        typeof caught === 'object' && caught && 'code' in caught ? String(caught.code) : ''
      setError(authMessage(code))
    } finally {
      setBusy(false)
    }
  }

  async function sendLink() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await sendSignInLinkToEmail(getFirebaseAuth(), email.trim(), {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      })
      setMessage(
        'Se o envio estiver disponível, você receberá um link por e-mail. Verifique também o spam.',
      )
    } catch {
      setError('Não foi possível enviar o link. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      try {
        await sendPasswordResetEmail(getFirebaseAuth(), email.trim())
      } catch {
        /* Avoid account enumeration. */
      }
      setMessage('Se houver uma conta elegível, você receberá as instruções por e-mail.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={compact ? 'auth-card compact' : 'auth-card'}>
      <h2>{heading}</h2>
      <p>
        {emailLink
          ? 'Confirme o e-mail que recebeu este link.'
          : mode === 'signup'
            ? 'Crie a conta da gestora. Depois você configura a clínica e o app das clientes.'
            : 'Entre com Google ou e-mail. A sessão continua nesta aba.'}
      </p>
      {!emailLink && (
        <button
          className="google-button"
          type="button"
          disabled={busy}
          onClick={() => void google()}
        >
          <GoogleMark />
          Continuar com Google
        </button>
      )}
      {!emailLink && <p className="auth-split">ou com e-mail</p>}
      <form onSubmit={(event) => void submit(event)} className="auth-form">
        <label className="field">
          <span>E-mail</span>
          <div className="field-control">
            <input
              type="email"
              autoComplete="username"
              required
              maxLength={254}
              placeholder="ex.: maria@sua-clinica.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </label>
        {!emailLink && (
          <label className="field">
            <span>{mode === 'signup' ? 'Crie uma senha' : 'Senha'}</span>
            <div className="field-control">
              <input
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={6}
                placeholder={mode === 'signup' ? 'Mínimo de 6 caracteres' : 'Sua senha'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </label>
        )}
        <button className="button button-primary" disabled={busy} type="submit">
          {busy
            ? 'Aguarde…'
            : emailLink
              ? 'Confirmar acesso'
              : mode === 'signup'
                ? 'Criar conta'
                : 'Entrar'}
        </button>
      </form>
      {!emailLink && (
        <div className="auth-links">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
          >
            {mode === 'signup' ? 'Já tenho conta' : 'Quero criar uma conta'}
          </button>
          <button type="button" disabled={busy || !email.trim()} onClick={() => void sendLink()}>
            Receber link de acesso
          </button>
          <button type="button" disabled={busy || !email.trim()} onClick={() => void reset()}>
            Recuperar senha
          </button>
        </div>
      )}
      {message && (
        <p className="auth-note" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
