'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppStatus } from '@/components/app-status'
import { useStaff } from '@/components/staff-provider'
import { awaitsOnboarding, loadingScene, staffHomePath } from '@/lib/staff-destination'

export default function Page() {
  const staff = useStaff()
  const router = useRouter()

  useEffect(() => {
    if (staff.loading) return
    if (!staff.user) {
      router.replace('/login')
      return
    }
    if (staff.error) return
    // No space yet, or only her own draft: /cadastro asks for missing contact details first.
    if (awaitsOnboarding(staff.clinics)) {
      router.replace('/cadastro')
      return
    }
    const next = staffHomePath(staff.clinics)
    if (next) router.replace(next)
  }, [staff.loading, staff.error, staff.user, staff.clinics, router])

  const problem = staff.error
  return (
    <AppStatus
      scene={loadingScene(staff.clinics, staff.loading)}
      alert={Boolean(problem)}
      action={
        problem ? (
          <button type="button" onClick={() => staff.refresh()}>
            Tentar novamente
          </button>
        ) : undefined
      }
    >
      {problem || 'Carregando'}
    </AppStatus>
  )
}
