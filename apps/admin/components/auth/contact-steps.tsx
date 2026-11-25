'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatBrPhone, isCompletePhone, toE164Phone } from '@/lib/phone'
import './auth.css'

export type ContactDetails = { name: string; phone: string; email: string }

type Question = 'name' | 'phone' | 'email'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Apple's "Hide My Email" relay: valid, but nobody reads it for a follow-up. */
export function isRelayEmail(email: string) {
  return /@privaterelay\.appleid\.com$/i.test(email.trim())
}

export function contactComplete(contact: ContactDetails) {
  return (
    Boolean(contact.name.trim()) &&
    isCompletePhone(contact.phone) &&
    emailPattern.test(contact.email.trim())
  )
}

/**
 * One question per screen, lead-page style: no step labels, counters or progress bar.
 * Name, WhatsApp and a contact e-mail (prefilled with the account's, when there is one).
 */
export function ContactSteps({
  initial,
  busy = false,
  error,
  onFinish,
}: {
  initial: ContactDetails
  busy?: boolean
  error?: string
  onFinish: (contact: ContactDetails) => void
}) {
  const [question, setQuestion] = useState<Question>('name')
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone ? formatBrPhone(initial.phone) : '')
  const [email, setEmail] = useState(initial.email)
  const [problem, setProblem] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [question])

  const firstName = name.trim().split(/\s+/)[0] ?? ''

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProblem('')
    if (question === 'name') {
      if (name.trim().length < 2) return setProblem('Conte pra gente como você se chama.')
      setName(name.trim())
      return setQuestion('phone')
    }
    if (question === 'phone') {
      if (!isCompletePhone(toE164Phone(phone)))
        return setProblem('Confira o número: celular com DDD, ex.: (11) 99999-9999.')
      return setQuestion('email')
    }
    if (!emailPattern.test(email.trim())) return setProblem('Confira o e-mail.')
    onFinish({ name: name.trim(), phone: toE164Phone(phone), email: email.trim().toLowerCase() })
  }

  function back() {
    setProblem('')
    setQuestion(question === 'email' ? 'phone' : 'name')
  }

  const shown = problem || error
  return (
    <main className="auth-shell flex min-h-dvh w-full justify-center bg-[#fffafa] px-5 py-8 text-[#34101f] sm:px-8 sm:py-12">
      <div className="flex w-full max-w-[520px] flex-col">
        <Image
          src="/brand/logo-letter-default.png"
          width={267}
          height={60}
          alt="Luminix"
          className="-ml-3 h-auto w-[160px] sm:w-[190px]"
          priority
        />
        <form key={question} className="auth-ask my-auto py-10" onSubmit={submit} noValidate>
          {question === 'name' ? (
            <>
              <h1>Como você se chama?</h1>
              <p className="auth-ask-hint">É assim que a gente vai te chamar por aqui.</p>
              <input
                ref={input}
                className="auth-ask-input"
                name="name"
                autoComplete="name"
                placeholder="Seu nome"
                maxLength={120}
                value={name}
                aria-label="Seu nome"
                aria-invalid={Boolean(problem) || undefined}
                onChange={(event) => setName(event.target.value)}
              />
            </>
          ) : question === 'phone' ? (
            <>
              <h1>
                {firstName
                  ? `Prazer, ${firstName}! Qual é o seu WhatsApp?`
                  : 'Qual é o seu WhatsApp?'}
              </h1>
              <p className="auth-ask-hint">
                Para te ajudar a deixar seu espaço pronto, se precisar.
              </p>
              <input
                ref={input}
                className="auth-ask-input"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 99999-9999"
                value={phone}
                aria-label="WhatsApp com DDD"
                aria-invalid={Boolean(problem) || undefined}
                onChange={(event) =>
                  setPhone(formatBrPhone(event.target.value) || event.target.value)
                }
              />
            </>
          ) : (
            <>
              <h1>E qual e-mail é melhor para falar com você?</h1>
              <p className="auth-ask-hint">
                {initial.email && email.trim().toLowerCase() === initial.email.toLowerCase()
                  ? 'Deixamos o e-mail da sua conta. Pode trocar se preferir outro.'
                  : 'Um e-mail que você costuma ler.'}
              </p>
              <input
                ref={input}
                className="auth-ask-input"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="voce@email.com"
                maxLength={254}
                value={email}
                aria-label="E-mail para contato"
                aria-invalid={Boolean(problem) || undefined}
                onChange={(event) => setEmail(event.target.value)}
              />
            </>
          )}

          {shown ? (
            <p className="auth-ask-error" role="alert">
              {shown}
            </p>
          ) : null}

          <div className="auth-ask-actions">
            {question !== 'name' ? (
              <button type="button" className="auth-ask-back" onClick={back} disabled={busy}>
                Voltar
              </button>
            ) : null}
            <button type="submit" className="auth-ask-next" disabled={busy}>
              {busy ? 'Aguarde…' : question === 'email' ? 'Começar a configurar' : 'Continuar'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
