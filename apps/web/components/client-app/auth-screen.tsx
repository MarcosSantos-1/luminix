'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { peekPendingSpace, signIn, signUp, useClient } from '../../lib/client-app/store'
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
        <Link href="/" className="ca-wordmark">
          Luminix
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
        </div>
      </section>

      <section className="ca-auth-panel">
        <form className="ca-form" onSubmit={submit} noValidate>
          <h2>{signingUp ? 'Criar conta' : 'Entrar'}</h2>
          {signingUp && (
            <label>
              Nome completo
              <input name="name" autoComplete="name" required />
            </label>
          )}
          <label>
            E-mail
            <input name="email" type="email" inputMode="email" autoComplete="email" required />
          </label>
          {signingUp && (
            <label>
              Celular <small>opcional</small>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 90000-0000"
              />
            </label>
          )}
          <label>
            Senha
            <span className="ca-password">
              <input
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
          <p className="ca-note">
            Versão de avaliação: a conta fica salva só neste aparelho e ainda não há recuperação de
            senha por e-mail.
          </p>
        </form>
      </section>
    </div>
  )
}
