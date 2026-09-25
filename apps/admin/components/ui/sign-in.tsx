'use client'

import React, { useState } from 'react'
import Image, { type StaticImageData } from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'

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
  onResetPassword?: (email: string) => void
}

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-white/55 bg-white/18 backdrop-blur-md transition-colors focus-within:border-[#ffb4d2] focus-within:bg-white/24 focus-within:ring-4 focus-within:ring-[#ff2d7940]">
    {children}
  </div>
)

const TestimonialCard = ({ testimonial, delay }: { testimonial: Testimonial; delay: string }) => (
  <div
    className={`animate-testimonial ${delay} flex w-64 items-start gap-3 rounded-3xl border border-white/55 bg-white/90 p-5 text-[#371a29] shadow-[0_18px_45px_rgba(80,15,44,0.18)] backdrop-blur-xl`}
  >
    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl">
      <Image src={testimonial.avatarSrc} fill sizes="40px" className="object-cover" alt="" />
    </div>
    <div className="text-sm leading-snug">
      <p className="flex items-center gap-1 font-medium">{testimonial.name}</p>
      <p className="text-[#806c77]">{testimonial.handle}</p>
      <p className="mt-1 text-[#573746]">{testimonial.text}</p>
    </div>
  </div>
)

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light tracking-tighter text-white">Bem-vinda</span>,
  description = 'Acesse a gestão da sua clínica e continue de onde parou.',
  heroImageSrc,
  testimonials = [],
  busy = false,
  error,
  message,
  onSignIn,
  onResetPassword,
}) => {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <main className="grid min-h-[100dvh] w-full grid-cols-1 bg-[#780033] font-sans text-white lg:grid-cols-[0.9fr_1.1fr]">
      <section className="order-2 flex items-center justify-center bg-[#780033] bg-[url('/brand/background-portrait.png')] bg-cover bg-center px-6 py-10 text-white sm:px-10 lg:order-1 lg:min-h-[100dvh] lg:bg-[url('/brand/background-desktop.png')] lg:px-12 xl:px-20">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <Link href="/" className="animate-element animate-delay-100 mb-2 inline-flex w-fit">
              <Image
                src="/brand/logo-letter-white.png"
                width={267}
                height={60}
                alt="Luminix"
                className="-ml-4 h-auto w-[222px] sm:w-[267px]"
                priority
              />
            </Link>
            <h1 className="animate-element animate-delay-100 text-4xl leading-tight font-semibold md:text-5xl">
              {title}
            </h1>
            <p className="animate-element animate-delay-200 text-white/80">{description}</p>

            <form className="space-y-5" onSubmit={onSignIn}>
              <div className="animate-element animate-delay-300">
                <label className="text-sm font-medium text-white/90">E-mail</label>
                <GlassInputWrapper>
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="Digite seu e-mail"
                    className="w-full rounded-2xl bg-transparent p-4 text-sm text-white placeholder:text-white/60 focus:outline-none"
                  />
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-400">
                <label className="text-sm font-medium text-white/90">Senha</label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                      className="w-full rounded-2xl bg-transparent p-4 pr-12 text-sm text-white placeholder:text-white/60 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center"
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-white/70 transition-colors hover:text-white" />
                      ) : (
                        <Eye className="h-5 w-5 text-white/70 transition-colors hover:text-white" />
                      )}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-500 flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    className="size-4 appearance-none rounded border border-white/70 bg-white/15 checked:border-[#ff2d79] checked:bg-[#ff2d79]"
                  />
                  <span className="text-white/85">Manter conectada</span>
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
                  className="font-medium text-[#ffd0e4] transition-colors hover:text-white hover:underline"
                >
                  Esqueci a senha
                </a>
              </div>

              {message ? (
                <p className="text-sm text-white/80" role="status">
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

            <p className="animate-element animate-delay-700 text-center text-sm text-white/80">
              Nova por aqui?{' '}
              <Link
                href="/cadastro"
                className="font-medium text-[#ffd0e4] transition-colors hover:text-white hover:underline"
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
