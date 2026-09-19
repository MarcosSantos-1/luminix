'use client'

import { useState, type FormEvent } from 'react'
import { useStaffAuth } from '@/hooks/use-staff-auth'

type Mode = 'login' | 'signup'

export function StaffAuthPanel({
  heading,
  compact = false,
  initialMode = 'signup',
}: {
  heading: string
  compact?: boolean
  initialMode?: Mode
}) {
  const auth = useStaffAuth()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (auth.emailLink) {
      await auth.confirmEmailLink(email)
      return
    }
    if (mode === 'signup') await auth.signUp(email, password)
    else await auth.signIn(email, password)
    setPassword('')
  }

  return (
    <section className={compact ? 'auth-card compact' : 'auth-card'}>
      <h2>{heading}</h2>
      <p>
        {auth.emailLink
          ? 'Confirme o e-mail que recebeu este link.'
          : mode === 'signup'
            ? 'Crie a conta da gestora. Depois você configura a clínica e o app das clientes.'
            : 'Entre com Google ou e-mail. A sessão continua nesta aba.'}
      </p>
      {!auth.emailLink && (
        <button
          className="google-button"
          type="button"
          disabled={auth.busy}
          onClick={() => void auth.google()}
        >
          <GoogleMark />
          Continuar com Google
        </button>
      )}
      {!auth.emailLink && <p className="auth-split">ou com e-mail</p>}
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
        {!auth.emailLink && (
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
        <button className="button button-primary" disabled={auth.busy} type="submit">
          {auth.busy
            ? 'Aguarde…'
            : auth.emailLink
              ? 'Confirmar acesso'
              : mode === 'signup'
                ? 'Criar conta'
                : 'Entrar'}
        </button>
      </form>
      {!auth.emailLink && (
        <div className="auth-links">
          <button
            type="button"
            disabled={auth.busy}
            onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
          >
            {mode === 'signup' ? 'Já tenho conta' : 'Quero criar uma conta'}
          </button>
          <button
            type="button"
            disabled={auth.busy || !email.trim()}
            onClick={() => void auth.sendLink(email)}
          >
            Receber link de acesso
          </button>
          <button
            type="button"
            disabled={auth.busy || !email.trim()}
            onClick={() => void auth.reset(email)}
          >
            Recuperar senha
          </button>
        </div>
      )}
      {auth.message && (
        <p className="auth-note" role="status">
          {auth.message}
        </p>
      )}
      {auth.error && (
        <p className="auth-error" role="alert">
          {auth.error}
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
