'use client'

import { useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { AppStatus } from '@/components/app-status'
import AuthSectionOne from '@/components/ui/auth-section-1'
import { useStaff } from '@/components/staff-provider'
import { useStaffAuth } from '@/hooks/use-staff-auth'
import { isCompletePhone, toE164Phone } from '@/lib/phone'
import { storeSignupPhone } from '@/lib/signup-phone'
import { loadingScene, staffHomePath } from '@/lib/staff-destination'

export default function CadastroPage() {
  const staff = useStaff()
  const router = useRouter()
  const auth = useStaffAuth()

  useEffect(() => {
    if (!staff.user || staff.loading || staff.error) return
    router.replace(staffHomePath(staff.clinics) ?? '/')
  }, [staff.user, staff.loading, staff.error, staff.clinics, router])

  if (staff.user && !staff.error)
    return <AppStatus scene={loadingScene(staff.clinics, staff.loading)} />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const firstName = String(data.get('firstName') ?? '').trim()
    const email = String(data.get('email') ?? '')
    const password = String(data.get('password') ?? '')
    const phone = toE164Phone(String(data.get('phone') ?? ''))
    if (!isCompletePhone(phone)) return
    const uid = await auth.signUp(email, password, firstName)
    if (uid) storeSignupPhone(uid, phone)
  }

  return (
    <AuthSectionOne
      busy={auth.busy}
      error={auth.error || staff.error}
      message={auth.message}
      onSubmit={submit}
    />
  )
}
