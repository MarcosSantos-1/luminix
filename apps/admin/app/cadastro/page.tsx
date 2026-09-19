'use client'

import { useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import AuthSectionOne from '@/components/ui/auth-section-1'
import { useStaff } from '@/components/staff-provider'
import { useStaffAuth } from '@/hooks/use-staff-auth'
import { staffHomePath } from '@/lib/staff-destination'

export default function CadastroPage() {
  const staff = useStaff()
  const router = useRouter()
  const auth = useStaffAuth()

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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const firstName = String(data.get('firstName') ?? '').trim()
    const lastName = String(data.get('lastName') ?? '').trim()
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    void auth.signUp(email, password, `${firstName} ${lastName}`.trim())
  }

  return (
    <AuthSectionOne
      busy={auth.busy}
      error={auth.error || staff.error}
      message={auth.message}
      onSubmit={submit}
      onGoogleSignIn={() => void auth.google()}
    />
  )
}
