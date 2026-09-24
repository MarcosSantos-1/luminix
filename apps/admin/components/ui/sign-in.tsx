'use client'

import React, { useState } from 'react'
import Image, { type StaticImageData } from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'

const GoogleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5"
    viewBox="0 0 48 48"
    aria-hidden="true"
  >
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z"
    />
  </svg>
)

export interface Testimonial {
  avatarSrc: string
  name: string
  handle: string
  text: string
}

interface SignInPageProps {
  title?: React.ReactNode
  description?: React.ReactNode
  heroImageSrc?: string | StaticImageData
  testimonials?: Testimonial[]
  busy?: boolean
  error?: string
  message?: string
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void
  onGoogleSignIn?: () => void
  onResetPassword?: (email: string) => void
}

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-[#eadde3] bg-[#fffafb] transition-colors focus-within:border-[#e72875] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#e7287512]">
    {children}
  </div>
)

const TestimonialCard = ({ testimonial, delay }: { testimonial: Testimonial; delay: string }) => (
  <div
    className={`animate-testimonial ${delay} flex w-64 items-start gap-3 rounded-3xl border border-white/55 bg-white/90 p-5 text-[#371a29] shadow-[0_18px_45px_rgba(80,15,44,0.18)] backdrop-blur-xl`}
  >
    <Image
      src={testimonial.avatarSrc}
      width={40}
      height={40}
      className="rounded-2xl object-cover"
      style={{ width: 40, height: 40 }}
      alt=""
    />
    <div className="text-sm leading-snug">
      <p className="flex items-center gap-1 font-medium">{testimonial.name}</p>
      <p className="text-[#806c77]">{testimonial.handle}</p>
      <p className="mt-1 text-[#573746]">{testimonial.text}</p>
    </div>
  </div>
)

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light tracking-tighter text-foreground">Bem-vinda</span>,
  description = 'Acesse a gestão da sua clínica e continue de onde parou.',
  heroImageSrc,
  testimonials = [],
  busy = false,
  error,
  message,
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
}) => {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <main className="grid min-h-[100dvh] w-full grid-cols-1 bg-[#fff9fb] font-sans text-[#371a29] lg:grid-cols-[0.9fr_1.1fr]">
      <section className="order-2 flex items-center justify-center bg-white px-6 py-10 sm:px-10 lg:order-1 lg:min-h-[100dvh] lg:px-12 xl:px-20">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <Link href="/" className="animate-element animate-delay-100 mb-2 inline-flex w-fit">
              <Image
                src="/brand/logo-letter.png"
                width={178}
                height={40}
                alt="Luminix"
                className="h-auto w-[148px] sm:w-[178px]"
                priority
              />
            </Link>
            <h1 className="animate-element animate-delay-100 text-4xl leading-tight font-semibold md:text-5xl">
              {title}
            </h1>
            <p className="animate-element animate-delay-200 text-[#806c77]">{description}</p>

            <form className="space-y-5" onSubmit={onSignIn}>
              <div className="animate-element animate-delay-300">
                <label className="text-sm font-medium text-[#6f5964]">E-mail</label>
                <GlassInputWrapper>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="Digite seu e-mail"
                    className="w-full rounded-2xl bg-transparent p-4 text-sm focus:outline-none"
                  />
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-400">
                <label className="text-sm font-medium text-[#6f5964]">Senha</label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                      className="w-full rounded-2xl bg-transparent p-4 pr-12 text-sm focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-[#806c77] transition-colors hover:text-[#e72875]" />
                      ) : (
                        <Eye className="h-5 w-5 text-[#806c77] transition-colors hover:text-[#e72875]" />
                      )}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-500 flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" name="rememberMe" className="custom-checkbox" />
                  <span className="text-[#573746]">Manter conectada</span>
                </label>
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
                  className="font-medium text-[#d71966] transition-colors hover:text-[#a31350] hover:underline"
                >
                  Esqueci a senha
                </a>
              </div>

              {message ? (
                <p className="text-sm text-[#806c77]" role="status">
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
                className="animate-element animate-delay-600 w-full rounded-2xl bg-gradient-to-r from-[#c70e59] to-[#f23b80] py-4 font-semibold text-white shadow-[0_12px_28px_rgba(199,14,89,0.22)] transition hover:brightness-105 disabled:opacity-60"
              >
                {busy ? 'Aguarde…' : 'Entrar'}
              </button>
            </form>

            <div className="animate-element animate-delay-700 relative flex items-center justify-center">
              <span className="w-full border-t border-[#eadde3]"></span>
              <span className="absolute bg-white px-4 text-sm text-[#806c77]">Ou continue com</span>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onGoogleSignIn}
              className="animate-element animate-delay-800 flex w-full items-center justify-center gap-3 rounded-2xl border border-[#eadde3] bg-white py-4 transition-colors hover:border-[#e8b5c9] hover:bg-[#fff6f9] disabled:opacity-60"
            >
              <GoogleIcon />
              Continuar com Google
            </button>

            <p className="animate-element animate-delay-900 text-center text-sm text-[#806c77]">
              Nova por aqui?{' '}
              <Link
                href="/cadastro"
                className="font-medium text-[#d71966] transition-colors hover:text-[#a31350] hover:underline"
              >
                Criar conta
              </Link>
            </p>
          </div>
        </div>
      </section>

      {heroImageSrc ? (
        <section className="animate-slide-right animate-delay-300 order-1 m-3 min-h-[220px] sm:min-h-[280px] lg:sticky lg:top-3 lg:order-2 lg:h-[calc(100dvh-24px)] lg:min-h-0 lg:self-start">
          <div className="relative h-full min-h-[220px] overflow-hidden rounded-[28px] bg-[#f8d9e4] sm:min-h-[280px] lg:min-h-0">
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
            <div className="absolute top-6 left-6 hidden max-w-sm rounded-2xl border border-white/35 bg-white/88 p-5 text-[#5b203a] shadow-xl backdrop-blur-md sm:block lg:top-10 lg:left-10">
              <strong className="text-lg">Sua rotina mais leve começa aqui.</strong>
              <p className="mt-1 text-sm text-[#765365]">
                Agenda, clientes e gestão no mesmo lugar.
              </p>
            </div>
            {testimonials.length > 0 ? (
              <div className="absolute bottom-6 left-1/2 hidden w-full justify-center gap-4 px-8 -translate-x-1/2 md:flex lg:bottom-8">
                <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
                {testimonials[1] ? (
                  <div className="hidden xl:flex">
                    <TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" />
                  </div>
                ) : null}
                {testimonials[2] ? (
                  <div className="hidden 2xl:flex">
                    <TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  )
}
