'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Brand } from '@/components/brand'
import { StaffAuthPanel } from '@/components/staff-auth-panel'
import { useStaff } from '@/components/staff-provider'
import { staffHomePath } from '@/lib/staff-destination'

export default function LoginPage() {
  const staff = useStaff()
  const router = useRouter()
  useEffect(() => {
    if (!staff.user || staff.loading || staff.error) return
    router.replace(staffHomePath(staff.clinics) ?? '/')
  }, [staff.user, staff.loading, staff.error, staff.clinics, router])
  if (staff.user && !staff.error)
    return (
      <main className="auth-page" role="status">
        Abrindo seu espaço…
      </main>
    )
  return (
    <main className="auth-page">
      <Link href="/" className="auth-home">
        <Brand dark />
      </Link>
      <StaffAuthPanel heading="Acesso da equipe" compact initialMode="login" />
      {staff.error && (
        <p role="alert">
          {staff.error} <button onClick={staff.refresh}>Tentar novamente</button>
        </p>
      )}
    </main>
  )
}
