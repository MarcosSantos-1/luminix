'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import {
  peekPendingSpace,
  resetPassword,
  signIn,
  signInWith,
  signUp,
  useClient,
} from '../../lib/client-app/store'
import type { SpaceSummary } from '../../lib/client-app/types'
import { fetchSpace } from './use-clinic'
import { Lines, SpaceLogo } from './ui'

export function AuthScreen({ mode }: { mode: 'entrar' | 'cadastro' }) {
  const router = useRouter()
  const { ready, account } = useClient()
  const [space, setSpace] = useState<SpaceSummary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const [notice, setNotice] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const mismatch = confirmation.length > 0 && confirmation !== password
  const signingUp = mode === 'cadastro'
  // Google and Apple first; e-mail opens its form on demand.
  const [withEmail, setWithEmail] = useState(false)
  const [social, setSocial] = useState<'google' | 'apple' | null>(null)

  async function continueWith(kind: 'google' | 'apple') {
    setSocial(kind)
    setError('')
    const problem = await signInWith(kind)
    setSocial(null)
    if (problem) setError(problem)
  }

  useEffect(() => {
    if (ready && account) router.replace('/cliente')
  }, [ready, account, router])

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get('espaco') ?? peekPendingSpace()
    if (slug) void fetchSpace(slug).then((found) => setSpace(found?.summary ?? null))
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (name: string) => String(data.get(name) ?? '')
    setBusy(true)
    setError('')
    const problem = signingUp
      ? value('password') !== value('passwordConfirmation')
        ? 'As senhas não coincidem.'
        : !data.get('terms')
          ? 'Aceite os termos para criar a conta.'
          : await signUp({
              name: value('name'),
              email: value('email'),
              // The phone is asked later, by the space, when it is needed.
              phone: '',
              password: value('password'),
            })
      : await signIn(value('email'), value('password'))
    setBusy(false)
    if (problem) setError(problem)
    // On success the effect above leaves this screen.
  }

  return (
    <div className="ca ca-auth" data-theme={space?.theme ?? 'luminix'}>
      <section className="ca-auth-hero">
        <Lines />
        <Link href="/" className="ca-auth-logo" aria-label="Luminix">
          <Image src="/brand/logo-letter.png" width={2170} height={725} alt="Luminix" priority />
        </Link>
        <div>
          {space ? (
            <div className="ca-auth-space">
              <SpaceLogo space={space} size={54} />
              <span>
                <small>Você está entrando em</small>
                <strong>{space.name}</strong>
                {space.city && <small>{space.city}</small>}
              </span>
            </div>
          ) : null}
          <h1>{signingUp ? 'Crie sua conta em um minuto.' : 'Seus horários, em um só lugar.'}</h1>
          <p>
            Uma conta Luminix vale para todos os espaços que você frequenta: salão, clínica,
            estúdio.
          </p>
          <ul className="ca-auth-points">
            <li>
              <span aria-hidden>
                <CalendarCheck size={22} />
              </span>
              <div>
                <strong>Agende e remarque</strong>
                <small>Escolha dia e horário sem trocar mensagens.</small>
              </div>
            </li>
            <li>
              <span aria-hidden>
                <BellRing size={22} />
              </span>
              <div>
                <strong>Lembretes e confirmações</strong>
                <small>Tudo o que o espaço avisa, num lugar só.</small>
              </div>
            </li>
            <li>
              <span aria-hidden>
                <ShieldCheck size={22} />
              </span>
              <div>
                <strong>Sua ficha protegida</strong>
                <small>Você decide quais espaços podem ver.</small>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section className="ca-auth-panel">
        <form className="ca-form ca-auth-form" onSubmit={submit} noValidate>
          <header>
            <h2>{signingUp ? 'Criar conta' : 'Que bom te ver'}</h2>
            <p>
              {withEmail
                ? signingUp
                  ? 'Leva menos de um minuto.'
                  : 'Entre com seu e-mail e senha.'
                : signingUp
                  ? 'Escolha como quer criar sua conta.'
                  : 'Escolha como quer entrar.'}
            </p>
          </header>
          {!withEmail && (
            <div className="ca-social">
              <button
                type="button"
                className="ca-social-button is-google"
                disabled={social !== null}
                onClick={() => void continueWith('google')}
              >
                <GoogleMark />
                {social === 'google' ? 'Abrindo o Google…' : 'Continuar com Google'}
              </button>
              <button
                type="button"
                className="ca-social-button is-apple"
                disabled={social !== null}
                onClick={() => void continueWith('apple')}
              >
                <AppleMark />
                {social === 'apple' ? 'Abrindo a Apple…' : 'Continuar com Apple'}
              </button>
              <p className="ca-social-or">
                <span>ou</span>
              </p>
              <button
                type="button"
                className="ca-social-button is-email"
                onClick={() => {
                  setError('')
                  setWithEmail(true)
                }}
              >
                <Mail size={20} aria-hidden />
                Continuar com e-mail
              </button>
              <p className="ca-error" role="alert">
                {error}
              </p>
              <p className="ca-social-terms">
                Ao continuar, você aceita os{' '}
                <a href="/termos" target="_blank" rel="noopener noreferrer">
                  Termos
                </a>{' '}
                e a{' '}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer">
                  Política de Privacidade
                </a>
                .
              </p>
              <p className="ca-switch">
                {signingUp ? 'Já tem conta?' : 'Primeira vez aqui?'}{' '}
                <Link href={signingUp ? '/cliente/entrar' : '/cliente/cadastro'}>
                  {signingUp ? 'Entrar' : 'Criar conta'}
                </Link>
              </p>
            </div>
          )}
          {withEmail && signingUp && (
            <label>
              Nome completo
              <span className="ca-field">
                <UserRound size={18} aria-hidden />
                <input name="name" autoComplete="name" placeholder="Como você se chama" required />
              </span>
            </label>
          )}
          {withEmail && (
            <>
              <label>
                E-mail
                <span className="ca-field">
                  <Mail size={18} aria-hidden />
                  <input
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="voce@email.com"
                    required
                  />
                </span>
              </label>
              <label>
                Senha
                <span className="ca-field ca-password">
                  <LockKeyhole size={18} aria-hidden />
                  <input
                    placeholder={signingUp ? 'Crie uma senha' : 'Sua senha'}
                    name="password"
                    type={visible ? 'text' : 'password'}
                    autoComplete={signingUp ? 'new-password' : 'current-password'}
                    minLength={8}
                    required
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
                {signingUp && <small>Pelo menos 8 caracteres.</small>}
              </label>
              {signingUp && (
                <label>
                  Confirmar senha
                  <span className="ca-field ca-password" data-invalid={mismatch || undefined}>
                    <LockKeyhole size={18} aria-hidden />
                    <input
                      placeholder="Repita a senha"
                      name="passwordConfirmation"
                      type={visible ? 'text' : 'password'}
                      autoComplete="new-password"
                      minLength={8}
                      required
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
              )}
              {signingUp && (
                <label className="ca-check">
                  <input type="checkbox" name="terms" />
                  <span>
                    Li e aceito os{' '}
                    <a href="/termos" target="_blank" rel="noopener noreferrer">
                      Termos
                    </a>{' '}
                    e a{' '}
                    <a href="/privacidade" target="_blank" rel="noopener noreferrer">
                      Política de Privacidade
                    </a>
                    .
                  </span>
                </label>
              )}
              <p className="ca-error" role="alert">
                {error}
              </p>
              <button className="ca-button" type="submit" disabled={busy}>
                {signingUp ? 'Criar conta' : 'Entrar'} <ArrowRight size={18} aria-hidden />
              </button>
              <p className="ca-switch">
                {signingUp ? 'Já tem conta?' : 'Primeira vez aqui?'}{' '}
                <Link href={signingUp ? '/cliente/entrar' : '/cliente/cadastro'}>
                  {signingUp ? 'Entrar' : 'Criar conta'}
                </Link>
              </p>
              {!signingUp && (
                <button
                  type="button"
                  className="ca-link ca-forgot"
                  onClick={async (event) => {
                    const email = String(
                      new FormData(event.currentTarget.form ?? undefined).get('email') ?? '',
                    )
                    const problem = await resetPassword(email)
                    setError(problem ?? '')
                    setNotice(
                      problem
                        ? ''
                        : 'Se houver conta com este e-mail, enviamos o link para criar uma nova senha.',
                    )
                  }}
                >
                  Esqueci minha senha
                </button>
              )}
              {notice && (
                <p className="ca-note" role="status">
                  {notice}
                </p>
              )}
              <button
                type="button"
                className="ca-link ca-other-ways"
                onClick={() => {
                  setError('')
                  setNotice('')
                  setWithEmail(false)
                }}
              >
                Outras formas de entrar
              </button>
            </>
          )}
        </form>
      </section>
    </div>
  )
}

/** Google's "G", in its own four colors (brand guidelines: never recolored). */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  )
}

/** Apple's mark, in the button's text color. */
function AppleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 384 512" aria-hidden fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  )
}
