'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppStatus } from '@/components/app-status'
import { useStaff } from '@/components/staff-provider'
import { DRAFT_CLINIC_NAME, staffHomePath } from '@/lib/staff-destination'

export default function Page() {
  const staff = useStaff()
  const router = useRouter()
  const [error, setError] = useState('')
  const bootstrapping = useRef(false)

  useEffect(() => {
    if (staff.loading) return
    if (!staff.user) {
      router.replace('/login')
      return
    }
    if (staff.error) return
    const next = staffHomePath(staff.clinics)
    if (next) {
      router.replace(next)
      return
    }
    if (bootstrapping.current || error) return
    bootstrapping.current = true
    const user = staff.user
    const refresh = staff.refresh
    void (async () => {
      try {
        const response = await fetch('/api/auth/owner-clinic', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await user.getIdToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: DRAFT_CLINIC_NAME }),
          cache: 'no-store',
          signal: AbortSignal.timeout(20_000),
        })
        if (!response.ok && response.status !== 409) throw new Error('Unavailable')
        refresh()
      } catch {
        bootstrapping.current = false
        setError('Não foi possível abrir seu rascunho. Tente novamente.')
      }
    })()
  }, [staff.loading, staff.error, staff.user, staff.clinics, staff.refresh, error, router])

  const problem = error || staff.error
  return (
    <AppStatus
      alert={Boolean(problem)}
      action={
        problem ? (
          <button
            type="button"
            onClick={() => (error ? window.location.reload() : staff.refresh())}
          >
            Tentar novamente
          </button>
        ) : undefined
      }
    >
      {problem || 'Carregando'}
    </AppStatus>
  )
}
