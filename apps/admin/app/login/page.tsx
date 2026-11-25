'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AppStatus } from '@/components/app-status'
import { SignInPage } from '@/components/auth/sign-in'
import { useStaff } from '@/components/staff-provider'
import { useStaffAuth } from '@/hooks/use-staff-auth'
import {
  awaitsOnboarding,
  firstAccessKey,
  loadingScene,
  staffHomePath,
} from '@/lib/staff-destination'

export default function LoginPage() {
  const staff = useStaff()
  const router = useRouter()
  const auth = useStaffAuth()
  const [linkEmail, setLinkEmail] = useState('')

  useEffect(() => {
    if (!staff.user || staff.loading || staff.error) return
    let invited = false
    try {
      invited = Boolean(window.sessionStorage.getItem(firstAccessKey))
    } catch {
      invited = false
    }
    if (invited) {
      router.replace('/primeiro-acesso')
      return
    }
    // No space yet, or only her own draft: /cadastro asks for missing contact details first.
    router.replace(
      awaitsOnboarding(staff.clinics) ? '/cadastro' : (staffHomePath(staff.clinics) ?? '/'),
    )
  }, [staff.user, staff.loading, staff.error, staff.clinics, router])

  if (staff.user && !staff.error)
    return <AppStatus scene={loadingScene(staff.clinics, staff.loading)} />

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    void auth.signIn(email, password, data.get('rememberMe') === 'on')
  }

  function resetPassword(email: string) {
    const trimmed = email.trim()
    if (!trimmed) return
    void auth.reset(trimmed)
  }

  if (auth.emailLink) {
    return (
      <main className="auth-boot">
        <section className="first-access">
          <form
            className="email-link-form"
            onSubmit={(event) => {
              event.preventDefault()
              void auth.confirmEmailLink(linkEmail)
            }}
          >
            <h1>Confirme seu e-mail</h1>
            <p>
              Por segurança, informe o e-mail que recebeu o convite. Em seguida você cria a sua
              senha.
            </p>
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="ex.: maria@sua-clinica.com"
              value={linkEmail}
              onChange={(event) => setLinkEmail(event.target.value)}
            />
            {auth.error ? <p role="alert">{auth.error}</p> : null}
            <button type="submit" disabled={auth.busy}>
              {auth.busy ? 'Aguarde…' : 'Confirmar acesso'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <SignInPage
      heroImageSrc="/brand/login.png"
      busy={auth.busy}
      error={auth.error || staff.error}
      message={auth.message}
      onSignIn={signIn}
      onResetPassword={resetPassword}
      onSocial={auth.social}
    />
  )
}
