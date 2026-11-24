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
  Phone,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import {
  peekPendingSpace,
  resetPassword,
  signIn,
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
  const signingUp = mode === 'cadastro'

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
      ? !data.get('terms')
        ? 'Aceite os termos para criar a conta.'
        : await signUp({
            name: value('name'),
            email: value('email'),
            phone: value('phone'),
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
            <p>{signingUp ? 'Leva menos de um minuto.' : 'Entre com seu e-mail e senha.'}</p>
          </header>
          {signingUp && (
            <label>
              Nome completo
              <span className="ca-field">
                <UserRound size={18} aria-hidden />
                <input name="name" autoComplete="name" placeholder="Como você se chama" required />
              </span>
            </label>
          )}
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
          {signingUp && (
            <label>
              Celular <small>opcional</small>
              <span className="ca-field">
                <Phone size={18} aria-hidden />
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 90000-0000"
                />
              </span>
            </label>
          )}
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
        </form>
      </section>
    </div>
  )
}
