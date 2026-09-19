'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { SignInPage, type Testimonial } from '@/components/ui/sign-in'
import { useStaff } from '@/components/staff-provider'
import { useStaffAuth } from '@/hooks/use-staff-auth'
import { staffHomePath } from '@/lib/staff-destination'

const testimonials: Testimonial[] = [
  {
    avatarSrc:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=96&q=80',
    name: 'Camila Santos',
    handle: 'Clínica Aurora',
    text: 'A agenda e o cadastro das clientes ficaram no mesmo lugar. A rotina da clínica ficou bem mais leve.',
  },
  {
    avatarSrc:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&q=80',
    name: 'Marcos Lima',
    handle: 'Studio Lumière',
    text: 'Consegui configurar o espaço em poucos minutos e já compartilhar o acesso com a equipe.',
  },
  {
    avatarSrc:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=96&q=80',
    name: 'Juliana Alves',
    handle: 'Espaço Bela',
    text: 'O visual é limpo e o fluxo de cadastro faz sentido. É o tipo de ferramenta que a equipe realmente usa.',
  },
]

export default function LoginPage() {
  const staff = useStaff()
  const router = useRouter()
  const auth = useStaffAuth()
  const [linkEmail, setLinkEmail] = useState('')

  useEffect(() => {
    if (!staff.user || staff.loading || staff.error) return
    router.replace(staffHomePath(staff.clinics) ?? '/')
  }, [staff.user, staff.loading, staff.error, staff.clinics, router])

  if (staff.user && !staff.error)
    return (
      <main className="auth-boot" role="status">
        Abrindo seu espaço…
      </main>
    )

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    void auth.signIn(email, password)
  }

  function resetPassword(email: string) {
    const trimmed = email.trim()
    if (!trimmed) return
    void auth.reset(trimmed)
  }

  if (auth.emailLink) {
    return (
      <main className="auth-boot">
        <form
          className="email-link-form"
          onSubmit={(event) => {
            event.preventDefault()
            void auth.confirmEmailLink(linkEmail)
          }}
        >
          <h1>Confirme seu e-mail</h1>
          <p>Informe o e-mail que recebeu este link para concluir o acesso.</p>
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
      </main>
    )
  }

  return (
    <SignInPage
      heroImageSrc="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1600&q=80"
      testimonials={testimonials}
      busy={auth.busy}
      error={auth.error || staff.error}
      message={auth.message}
      onSignIn={signIn}
      onGoogleSignIn={() => void auth.google()}
      onResetPassword={resetPassword}
    />
  )
}
