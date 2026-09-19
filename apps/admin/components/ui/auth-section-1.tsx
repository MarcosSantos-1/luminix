'use client'

import { GrainGradient } from '@paper-design/shaders-react'
import Link from 'next/link'
import { useState, type FormEvent, type ReactNode } from 'react'

type AuthSectionOneProps = {
  busy?: boolean
  error?: string
  message?: string
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
  onGoogleSignIn?: () => void
}

const termsText = (
  <>
    Ao criar uma conta, você concorda com os{' '}
    <a
      href="#"
      className="font-medium text-black/45 underline underline-offset-2 dark:text-white/45"
    >
      Termos de uso
    </a>{' '}
    e a{' '}
    <a
      href="#"
      className="font-medium text-black/45 underline underline-offset-2 dark:text-white/45"
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
  onGoogleSignIn,
}: AuthSectionOneProps) {
  return (
    <section className="dark min-h-screen bg-white p-3 text-black antialiased [font-synthesis:none] dark:bg-[#050505] dark:text-white">
      <div className="grid min-h-[calc(100vh-1.5rem)] gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <div className="flex min-h-[760px] items-start rounded-md border border-black/20 bg-white px-6 py-12 sm:px-10 dark:border-white/10 dark:bg-[#0a0a0a] lg:min-h-0 lg:px-14 lg:py-28 xl:px-20">
          <div className="mx-auto w-full max-w-[590px]">
            <div>
              <h1 className="text-3xl font-medium tracking-[-0.04em] sm:text-4xl lg:text-[42px] lg:leading-[1.05] xl:text-[50px]">
                Crie uma conta
              </h1>
              <p className="mt-3 text-lg leading-snug text-black/60 dark:text-white/55 sm:text-xl lg:text-2xl xl:text-3xl">
                Cadastre sua clínica e comece a atender
              </p>
            </div>

            <div className="mt-12">
              <SocialButton
                icon={<GoogleIcon />}
                label="Entrar com Google"
                disabled={busy}
                onClick={onGoogleSignIn}
              />
            </div>

            <div className="my-10 text-center text-xl font-medium text-black/60 dark:text-white/50">
              ou
            </div>

            <form className="space-y-5" onSubmit={onSubmit}>
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

              <div className="space-y-4 pt-2 text-sm leading-5 text-black/30 dark:text-white/35 sm:text-[15px]">
                <CheckboxLine name="updates">
                  Não quero receber e-mails sobre novidades do Luminix
                </CheckboxLine>
                <CheckboxLine name="terms" required>
                  {termsText}
                </CheckboxLine>
              </div>

              {message ? (
                <p className="text-sm text-black/60 dark:text-white/60" role="status">
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
                className="mt-9 flex h-12 w-full items-center justify-center rounded-[10px] border border-black/40 bg-black text-xl font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-60 dark:border-white/40 dark:bg-white dark:text-black dark:hover:bg-white/85"
              >
                {busy ? 'Aguarde…' : 'Criar conta'}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-black/45 dark:text-white/45">
              Já tem uma conta?{' '}
              <Link
                href="/login"
                className="font-medium text-black underline underline-offset-2 dark:text-white"
              >
                Entrar
              </Link>
            </p>
          </div>
        </div>

        <div className="relative flex min-h-[720px] overflow-hidden rounded-md bg-black p-8 text-white sm:p-12 lg:min-h-0">
          <GrainGradient
            speed={1}
            scale={1}
            rotation={0}
            offsetX={0}
            offsetY={0}
            softness={0.5}
            intensity={0.5}
            noise={0.25}
            shape="corners"
            frame={2854.5}
            colors={['#FFFFFF', '#FC7819', '#FC7819', '#FFFFFF']}
            colorBack="#00000000"
            className="absolute inset-0 bg-black"
          />

          <div className="relative z-10 flex h-full w-full flex-col justify-between">
            <h2 className="max-w-[620px] pt-0 text-5xl font-medium tracking-[-0.05em] text-white sm:text-6xl lg:pt-16 lg:text-[64px] lg:leading-[0.98] xl:text-[70px]">
              Sua clínica,
              <br />
              mais simples.
            </h2>

            <Link
              href="/login"
              className="mb-0 inline-flex h-12 max-w-full items-center gap-3 rounded-[10px] border border-white/25 px-5 text-base font-medium text-white/85 backdrop-blur-sm transition-colors hover:border-white/45 hover:text-white xl:mb-32 xl:px-6 xl:text-2xl"
            >
              Já tenho uma conta
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

function SocialButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode
  label: string
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-black/25 bg-white px-3 text-sm leading-none text-black transition-colors hover:bg-black/[0.03] disabled:opacity-60 dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 xl:text-[19px]"
    >
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
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
    <label className="flex h-14 items-center justify-between gap-4 rounded-[10px] border border-black/25 bg-white px-5 text-lg leading-none dark:border-white/15 dark:bg-white/5 xl:text-xl">
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
        className="min-w-0 flex-1 truncate bg-transparent text-black outline-none placeholder:text-black/30 dark:text-white dark:placeholder:text-white/35"
      />
      {showLabel ? <span className="shrink-0 text-black dark:text-white">{label}</span> : null}
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
          className="peer size-full appearance-none rounded-[2px] border border-black/25 bg-white checked:border-black checked:bg-black dark:border-white/30 dark:bg-white/5 dark:checked:border-white dark:checked:bg-white"
        />
        <svg
          viewBox="0 0 12 12"
          className="pointer-events-none absolute inset-0 hidden size-full p-0.5 text-white peer-checked:block dark:text-black"
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

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
        fill="#EB4335"
      />
    </svg>
  )
}
