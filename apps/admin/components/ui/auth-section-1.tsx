'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, Lock, Mail, Phone, User } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { formatBrPhone, isCompletePhone, toE164Phone } from '@/lib/phone'

type AuthSectionOneProps = {
  busy?: boolean
  error?: string
  message?: string
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
}

const fieldClass =
  'auth-field flex h-11 items-center gap-2.5 rounded-xl border border-[#f0cfdb] bg-white px-3 text-[15px] leading-none text-[#34101f] transition focus-within:border-[#ff8db7] xl:h-12 xl:gap-3 xl:px-4 xl:text-base'

const termsText = (
  <>
    Ao criar uma conta, você concorda com os{' '}
    <a
      href="#"
      className="font-medium text-[#c70e59] underline underline-offset-2 hover:text-[#34101f]"
    >
      Termos de uso
    </a>{' '}
    e a{' '}
    <a
      href="#"
      className="font-medium text-[#c70e59] underline underline-offset-2 hover:text-[#34101f]"
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
  const [localError, setLocalError] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const confirmTouched = confirmPassword.length > 0
  const passwordsMatch = password === confirmPassword
  const confirmMismatch = confirmTouched && !passwordsMatch

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')
    const data = new FormData(event.currentTarget)
    const phone = toE164Phone(String(data.get('phone') ?? ''))
    if (!isCompletePhone(phone)) {
      setLocalError('Informe um celular válido com DDD.')
      return
    }
    if (!passwordsMatch) {
      setLocalError('As senhas não coincidem.')
      return
    }
    onSubmit?.(event)
  }

  return (
    <main className="auth-shell grid min-h-dvh grid-cols-1 bg-[#fffafa] text-[#34101f] antialiased [font-synthesis:none] lg:grid-cols-[0.94fr_1.06fr]">
      <section className="auth-form-pane order-2 flex items-center bg-[#fffafa] px-5 py-6 sm:px-8 sm:py-8 lg:order-1 lg:min-h-dvh lg:px-10 lg:py-8 xl:px-16 xl:py-12">
        <div className="mx-auto w-full max-w-[520px] xl:max-w-[560px]">
          <Link href="/" className="auth-logo mb-5 inline-flex w-fit sm:mb-7 xl:mb-10">
            <Image
              src="/brand/logo-letter-default.png"
              width={285}
              height={65}
              alt="Luminix"
              className="-ml-3 h-auto w-[180px] sm:w-[210px] xl:w-[250px]"
              priority
            />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#34101f] sm:text-3xl lg:text-[34px] lg:leading-[1.08] xl:text-[42px]">
              Crie uma conta
            </h1>
            <p className="mt-1.5 text-base leading-snug text-[#6d4d5c] sm:mt-2 sm:text-lg xl:text-xl">
              Cadastre sua clínica e comece a atender
            </p>
          </div>

          <form className="mt-5 space-y-3 sm:mt-7 sm:space-y-4 xl:mt-9 xl:space-y-5" onSubmit={handleSubmit}>
            <FieldBox
              label="Nome"
              name="firstName"
              autoComplete="given-name"
              icon={<User size={17} aria-hidden />}
            />
            <FieldBox
              label="Celular"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              icon={<Phone size={17} aria-hidden />}
              formatValue={(value) => formatBrPhone(value) || value}
            />
            <FieldBox
              label="E-mail"
              name="email"
              type="email"
              autoComplete="email"
              icon={<Mail size={17} aria-hidden />}
            />
            <PasswordField
              label="Senha"
              name="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={setPassword}
            />
            <div className="space-y-1.5">
              <PasswordField
                label="Confirmar senha"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={6}
                value={confirmPassword}
                onChange={setConfirmPassword}
                invalid={confirmMismatch}
              />
              {confirmMismatch ? (
                <p className="px-1 text-xs text-red-600" role="status">
                  As senhas não coincidem.
                </p>
              ) : null}
              {confirmTouched && passwordsMatch ? (
                <p className="px-1 text-xs text-[#1a8f5c]" role="status">
                  Senhas iguais.
                </p>
              ) : null}
            </div>

            <div className="space-y-3 pt-1 text-sm leading-5 text-[#6d4d5c] sm:space-y-3.5 sm:pt-2">
              <CheckboxLine name="updates">
                Não quero receber e-mails sobre novidades do Luminix
              </CheckboxLine>
              <CheckboxLine name="terms" required>
                {termsText}
              </CheckboxLine>
            </div>

            {message ? (
              <p className="text-sm text-[#6d4d5c]" role="status">
                {message}
              </p>
            ) : null}
            {localError || error ? (
              <p className="text-sm text-red-600" role="alert">
                {localError || error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy || confirmMismatch}
              className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#c70e59] to-[#f23b80] text-base font-semibold text-white shadow-[0_12px_28px_rgba(199,14,89,0.22)] transition hover:brightness-105 disabled:opacity-60 sm:mt-4 sm:h-12 sm:text-lg"
            >
              {busy ? 'Aguarde…' : 'Criar conta'}
            </button>
          </form>

          <p className="mt-10 text-center text-sm text-[#6d4d5c] sm:mt-12">
            Já tem uma conta?{' '}
            <Link
              href="/login"
              className="font-medium text-[#c70e59] underline underline-offset-2 hover:text-[#34101f]"
            >
              Entrar
            </Link>
          </p>
        </div>
      </section>

      <aside className="auth-hero order-1 m-2.5 min-h-[160px] sm:m-3 sm:min-h-[220px] lg:sticky lg:top-2.5 lg:order-2 lg:h-[calc(100dvh-20px)] lg:min-h-0 lg:self-start">
        <div className="relative h-full min-h-[160px] overflow-hidden rounded-[22px] bg-[#f8d9e4] sm:min-h-[220px] sm:rounded-[28px] lg:min-h-0">
          <Image
            src="/brand/cadastro.png"
            alt="Profissional organizando a clínica com o Luminix"
            fill
            className="object-cover object-[58%_center]"
            sizes="(max-width: 1023px) 100vw, 53vw"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#4b0925c9] via-[#7b123130] to-transparent" />
          <div className="absolute inset-x-5 bottom-5 text-white sm:inset-x-8 sm:bottom-8 lg:inset-x-10 lg:bottom-10">
            <span className="text-[10px] font-semibold tracking-[0.18em] text-[#ffd6e5] uppercase sm:text-xs">
              Feito para quem cuida
            </span>
            <h2 className="mt-2 max-w-[620px] text-2xl font-semibold tracking-[-0.045em] sm:mt-3 sm:text-4xl lg:text-[44px] lg:leading-[1.02] xl:text-[52px]">
              Sua clínica, mais simples.
            </h2>
            <Link
              href="/login"
              className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-white/45 bg-white/12 px-4 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20 sm:mt-5 sm:min-h-12 sm:px-5 sm:text-base"
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
  icon,
  inputMode,
  formatValue,
}: {
  label: string
  name: string
  type?: string
  autoComplete?: string
  minLength?: number
  icon?: ReactNode
  inputMode?: 'text' | 'tel' | 'email' | 'numeric'
  formatValue?: (value: string) => string
}) {
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const showLabel = !focused && value.length === 0

  return (
    <label className={fieldClass}>
      {icon ? <span className="shrink-0 text-[#c70e59]">{icon}</span> : null}
      <input
        name={name}
        type={type}
        value={value}
        required
        minLength={minLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-label={label}
        placeholder={focused ? label : ''}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => {
          const next = event.target.value
          setValue(formatValue ? formatValue(next) : next)
        }}
        className="min-w-0 flex-1 truncate bg-transparent text-[#34101f] outline-none placeholder:text-[#a88898]"
      />
      {showLabel ? <span className="shrink-0 text-[#a88898]">{label}</span> : null}
    </label>
  )
}

function PasswordField({
  label,
  name,
  autoComplete,
  minLength,
  value,
  onChange,
  invalid,
}: {
  label: string
  name: string
  autoComplete?: string
  minLength?: number
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [show, setShow] = useState(false)
  const showLabel = !focused && value.length === 0

  return (
    <label
      className={`${fieldClass} ${invalid ? 'border-red-400 focus-within:border-red-400' : ''}`}
    >
      <span className="shrink-0 text-[#c70e59]">
        <Lock size={17} aria-hidden />
      </span>
      <input
        name={name}
        type={show ? 'text' : 'password'}
        value={value}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        aria-label={label}
        aria-invalid={invalid || undefined}
        placeholder={focused ? label : ''}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value)}
        className="auth-password-input min-w-0 flex-1 truncate bg-transparent text-[#34101f] outline-none placeholder:text-[#a88898]"
      />
      {showLabel ? <span className="shrink-0 text-[#a88898]">{label}</span> : null}
      <button
        type="button"
        onClick={() => setShow((current) => !current)}
        className="shrink-0 text-[#8a6a79] transition-colors hover:text-[#34101f]"
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
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
    <label className="flex items-start gap-2.5">
      <span className="relative mt-0.5 size-3.5 shrink-0">
        <input
          type="checkbox"
          name={name}
          required={required}
          className="peer size-full appearance-none rounded-[3px] border border-[#f0cfdb] bg-white checked:border-[#ff2d79] checked:bg-[#ff2d79]"
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
