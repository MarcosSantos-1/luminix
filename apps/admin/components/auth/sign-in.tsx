'use client'

import React, { useState } from 'react'
import Image, { type StaticImageData } from 'next/image'
import Link from 'next/link'
import { AuthCheckbox } from './auth-checkbox'
import './auth.css'
import { Eye, EyeOff } from 'lucide-react'

interface SignInPageProps {
  title?: React.ReactNode
  description?: React.ReactNode
  heroImageSrc?: string | StaticImageData
  busy?: boolean
  error?: string
  message?: string
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void
  onResetPassword?: (email: string) => void
}

const LightInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="auth-field rounded-2xl border border-[#f0cfdb] bg-white transition-colors focus-within:border-[#ff8db7]">
    {children}
  </div>
)

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light tracking-tighter text-[#34101f]">Bem-vinda</span>,
  description = 'Acesse a gestão da sua clínica e continue de onde parou.',
  heroImageSrc,
  busy = false,
  error,
  message,
  onSignIn,
  onResetPassword,
}) => {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <main className="auth-shell grid min-h-dvh w-full grid-cols-1 bg-[#fffafa] font-sans text-[#34101f] lg:grid-cols-[0.9fr_1.1fr]">
      <section className="auth-form-pane order-2 flex items-center justify-center bg-[#fffafa] px-5 py-6 sm:px-8 sm:py-8 lg:order-1 lg:min-h-dvh lg:px-10 lg:py-8 xl:px-16 xl:py-12">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-4 sm:gap-5 xl:gap-6">
            <Link
              href="/"
              className="auth-logo animate-element animate-delay-100 mb-1 inline-flex w-fit"
            >
              <Image
                src="/brand/logo-letter-default.png"
                width={267}
                height={60}
                alt="Luminix"
                className="-ml-3 h-auto w-[180px] sm:w-[210px] xl:w-[250px]"
                priority
              />
            </Link>
            <h1 className="animate-element animate-delay-100 text-3xl leading-tight font-semibold text-[#34101f] sm:text-4xl xl:text-5xl">
              {title}
            </h1>
            <p className="animate-element animate-delay-200 text-[#6d4d5c]">{description}</p>

            <form className="space-y-3.5 sm:space-y-5" onSubmit={onSignIn}>
              <div className="animate-element animate-delay-300">
                <label htmlFor="login-email" className="text-sm font-medium text-[#573746]">
                  E-mail
                </label>
                <LightInputWrapper>
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="Digite seu e-mail"
                    className="w-full rounded-2xl bg-transparent p-3.5 text-sm text-[#34101f] placeholder:text-[#a88898] outline-none sm:p-4"
                  />
                </LightInputWrapper>
              </div>

              <div className="animate-element animate-delay-400">
                <label htmlFor="login-password" className="text-sm font-medium text-[#573746]">
                  Senha
                </label>
                <LightInputWrapper>
                  <div className="relative">
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                      className="auth-password-input w-full rounded-2xl bg-transparent p-3.5 pr-12 text-sm text-[#34101f] placeholder:text-[#a88898] outline-none sm:p-4"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="auth-password-toggle absolute inset-y-0 right-3 flex items-center justify-center"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-[#8a6a79] transition-colors hover:text-[#34101f]" />
                      ) : (
                        <Eye className="h-5 w-5 text-[#8a6a79] transition-colors hover:text-[#34101f]" />
                      )}
                    </button>
                  </div>
                </LightInputWrapper>
              </div>

              <div className="animate-element animate-delay-500 flex items-center justify-between text-sm">
                <AuthCheckbox name="rememberMe">Manter conectada</AuthCheckbox>
                <a
                  href="#"
                  onClick={(event) => {
                    event.preventDefault()
                    const form = event.currentTarget.closest('form')
                    const email =
                      form?.querySelector<HTMLInputElement>('input[name="email"]')?.value.trim() ??
                      ''
                    onResetPassword?.(email)
                  }}
                  className="font-medium text-[#c70e59] transition-colors hover:text-[#34101f] hover:underline"
                >
                  Esqueci a senha
                </a>
              </div>

              {message ? (
                <p className="text-sm text-[#6d4d5c]" role="status">
                  {message}
                </p>
              ) : null}
              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="animate-element animate-delay-600 w-full rounded-2xl bg-gradient-to-r from-[#c70e59] to-[#f23b80] py-3.5 font-semibold text-white shadow-[0_12px_28px_rgba(199,14,89,0.22)] transition hover:brightness-105 disabled:opacity-60 sm:py-4"
              >
                {busy ? 'Aguarde…' : 'Entrar'}
              </button>
            </form>

            <p className="animate-element animate-delay-700 mt-4 text-center text-sm text-[#6d4d5c] sm:mt-6">
              Nova por aqui?{' '}
              <Link
                href="/cadastro"
                className="font-medium text-[#c70e59] transition-colors hover:text-[#34101f] hover:underline"
              >
                Criar conta
              </Link>
            </p>
          </div>
        </div>
      </section>

      {heroImageSrc ? (
        <section className="auth-hero animate-slide-right animate-delay-300 order-1 m-2.5 min-h-[160px] sm:m-3 sm:min-h-[220px] lg:sticky lg:top-2.5 lg:order-2 lg:h-[calc(100dvh-20px)] lg:min-h-0 lg:self-start">
          <div className="relative h-full min-h-[160px] overflow-hidden rounded-[22px] bg-[#f8d9e4] sm:min-h-[220px] sm:rounded-[28px] lg:min-h-0">
            <Image
              src={heroImageSrc}
              alt="Profissional organizando a clínica com o Luminix"
              fill
              className="object-cover object-[58%_center]"
              sizes="(max-width: 1023px) 100vw, 55vw"
              placeholder={typeof heroImageSrc === 'string' ? 'empty' : 'blur'}
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#4b0925b8] via-transparent to-[#ffffff0f]" />
            <div className="absolute top-5 left-5 hidden max-w-sm rounded-2xl border border-white/35 bg-white/88 p-4 text-[#5b203a] shadow-xl backdrop-blur-md sm:top-6 sm:left-6 sm:block sm:p-5 lg:top-8 lg:left-8">
              <strong className="text-base sm:text-lg">Sua rotina mais leve começa aqui.</strong>
              <p className="mt-1 text-sm text-[#765365]">
                Agenda, clientes e gestão no mesmo lugar.
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  )
}
