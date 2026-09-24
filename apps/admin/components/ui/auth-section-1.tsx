'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, type FormEvent, type ReactNode } from 'react'

type AuthSectionOneProps = {
  busy?: boolean
  error?: string
  message?: string
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
}

const termsText = (
  <>
    Ao criar uma conta, você concorda com os{' '}
    <a
      href="#"
      className="font-medium text-[#765365] underline underline-offset-2 hover:text-[#d71966]"
    >
      Termos de uso
    </a>{' '}
    e a{' '}
    <a
      href="#"
      className="font-medium text-[#765365] underline underline-offset-2 hover:text-[#d71966]"
    >
      Política de privacidade
    </a>
  </>
)

export default function AuthSectionOne({
  busy = false,
  error,
  message,
  onSubmit,
}: AuthSectionOneProps) {
  return (
    <main className="grid min-h-[100dvh] grid-cols-1 bg-[#fff9fb] text-[#371a29] antialiased [font-synthesis:none] lg:grid-cols-[0.94fr_1.06fr]">
      <section className="order-2 flex items-center bg-white px-6 py-10 sm:px-10 lg:order-1 lg:min-h-[100dvh] lg:px-14 lg:py-16 xl:px-20">
        <div className="mx-auto w-full max-w-[590px]">
          <Link href="/" className="mb-10 inline-flex w-fit">
            <Image
              src="/brand/logo-letter-default.png"
              width={285}
              height={65}
              alt="Luminix"
              className="-ml-4 h-auto w-[228px] sm:w-[270px]"
              priority
            />
          </Link>
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl lg:text-[42px] lg:leading-[1.05] xl:text-[48px]">
              Crie uma conta
            </h1>
            <p className="mt-3 text-lg leading-snug text-[#806c77] sm:text-xl lg:text-2xl">
              Cadastre sua clínica e comece a atender
            </p>
          </div>

          <form className="mt-10 space-y-5" onSubmit={onSubmit}>
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldBox label="Nome" name="firstName" autoComplete="given-name" />
              <FieldBox label="Sobrenome" name="lastName" autoComplete="family-name" />
            </div>

            <FieldBox label="E-mail" name="email" type="email" autoComplete="email" />
            <FieldBox
              label="Senha"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
            />

            <div className="space-y-4 pt-2 text-sm leading-5 text-[#806c77] sm:text-[15px]">
              <CheckboxLine name="updates">
                Não quero receber e-mails sobre novidades do Luminix
              </CheckboxLine>
              <CheckboxLine name="terms" required>
                {termsText}
              </CheckboxLine>
            </div>

            {message ? (
              <p className="text-sm text-[#806c77]" role="status">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="mt-7 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#c70e59] to-[#f23b80] text-lg font-semibold text-white shadow-[0_12px_28px_rgba(199,14,89,0.22)] transition hover:brightness-105 disabled:opacity-60"
            >
              {busy ? 'Aguarde…' : 'Criar conta'}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-[#806c77]">
            Já tem uma conta?{' '}
            <Link
              href="/login"
              className="font-medium text-[#d71966] underline underline-offset-2 hover:text-[#a31350]"
            >
              Entrar
            </Link>
          </p>
        </div>
      </section>

      <aside className="order-1 m-3 min-h-[220px] sm:min-h-[280px] lg:sticky lg:top-3 lg:order-2 lg:h-[calc(100dvh-24px)] lg:min-h-0 lg:self-start">
        <div className="relative h-full min-h-[220px] overflow-hidden rounded-[28px] bg-[#f8d9e4] sm:min-h-[280px] lg:min-h-0">
          <Image
            src="/brand/cadastro.png"
            alt="Profissional organizando a clínica com o Luminix"
            fill
            className="object-cover object-[58%_center]"
            sizes="(max-width: 1023px) 100vw, 53vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#4b0925c9] via-[#7b123130] to-transparent" />
          <div className="absolute inset-x-6 bottom-6 text-white sm:inset-x-10 sm:bottom-10 lg:inset-x-12 lg:bottom-12">
            <span className="text-xs font-semibold tracking-[0.18em] text-[#ffd6e5] uppercase">
              Feito para quem cuida
            </span>
            <h2 className="mt-3 max-w-[620px] text-3xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-[56px] lg:leading-[1.02]">
              Sua clínica, mais simples.
            </h2>
            <Link
              href="/login"
              className="mt-6 inline-flex min-h-12 items-center rounded-xl border border-white/45 bg-white/12 px-5 font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Já tenho uma conta
            </Link>
          </div>
        </div>
      </aside>
    </main>
  )
}

function FieldBox({
  label,
  name,
  type = 'text',
  autoComplete,
  minLength,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
  minLength?: number
}) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const showLabel = !focused && value.length === 0

  return (
    <label className="flex h-14 items-center justify-between gap-4 rounded-xl border border-[#eadde3] bg-[#fffafb] px-5 text-base leading-none transition focus-within:border-[#e72875] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#e7287512] xl:text-lg">
      <input
        name={name}
        type={type}
        value={value}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        aria-label={label}
        placeholder={focused ? label : ''}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => setValue(event.target.value)}
        className="min-w-0 flex-1 truncate bg-transparent text-[#371a29] outline-none placeholder:text-[#aa919e]"
      />
      {showLabel ? <span className="shrink-0 text-[#573746]">{label}</span> : null}
    </label>
  )
}

function CheckboxLine({
  children,
  name,
  required,
}: {
  children: ReactNode
  name: string
  required?: boolean
}) {
  return (
    <label className="flex items-start gap-3">
      <span className="relative mt-1 size-3.5 shrink-0">
        <input
          type="checkbox"
          name={name}
          required={required}
          className="peer size-full appearance-none rounded-[3px] border border-[#cbb8c1] bg-white checked:border-[#d71966] checked:bg-[#d71966]"
        />
        <svg
          viewBox="0 0 12 12"
          className="pointer-events-none absolute inset-0 hidden size-full p-0.5 text-white peer-checked:block"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 6.2 5 8.1 9 3.9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>{children}</span>
    </label>
  )
}
