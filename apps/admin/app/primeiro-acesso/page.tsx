'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AppStatus } from '@/components/app-status'
import {
  FirstAccessCard,
  PasswordStep,
  PhotoStep,
  WelcomeStep,
  type FirstAccessStep,
} from '@/components/first-access'
import { useStaff, type StaffClinic } from '@/components/staff-provider'
import { clinicRef, firstAccessKey, staffHomePath } from '@/lib/staff-destination'

function invitedClinic(clinics: StaffClinic[]) {
  if (typeof window === 'undefined') return null
  let wanted = ''
  try {
    wanted = window.sessionStorage.getItem(firstAccessKey) ?? ''
  } catch {
    wanted = ''
  }
  return (
    clinics.find((clinic) => clinic.id === wanted || clinic.code === wanted) ??
    clinics.find((clinic) => clinic.status === 'active') ??
    null
  )
}

function finish() {
  try {
    window.sessionStorage.removeItem(firstAccessKey)
  } catch {
    /* nothing stored */
  }
}

/**
 * First access of someone invited to a space: create the password, add a photo, welcome.
 * The invitation link already signed her in, so Firebase accepts the new password directly.
 */
export default function FirstAccessPage() {
  const staff = useStaff()
  const router = useRouter()
  const [step, setStep] = useState<FirstAccessStep>('password')
  const ready = !staff.loading && Boolean(staff.user) && !staff.error
  const clinic = ready ? invitedClinic(staff.clinics) : null

  useEffect(() => {
    if (staff.loading) return
    if (!staff.user) {
      router.replace('/login')
      return
    }
    if (staff.error || clinic) return
    finish()
    router.replace(staffHomePath(staff.clinics) ?? '/')
  }, [staff.loading, staff.user, staff.error, staff.clinics, clinic, router])

  if (staff.error)
    return (
      <AppStatus alert action={<button onClick={staff.refresh}>Tentar novamente</button>}>
        {staff.error}
      </AppStatus>
    )
  if (!clinic) return <AppStatus />

  return (
    <main className="auth-boot">
      <FirstAccessCard step={step}>
        {step === 'password' ? <PasswordStep onDone={() => setStep('photo')} /> : null}
        {step === 'photo' ? (
          <PhotoStep clinicId={clinic.id} onDone={() => setStep('welcome')} />
        ) : null}
        {step === 'welcome' ? (
          <WelcomeStep
            clinic={clinic}
            name={staff.user?.displayName ?? ''}
            onEnter={() => {
              finish()
              router.replace(`/c/${clinicRef(clinic)}`)
            }}
          />
        ) : null}
      </FirstAccessCard>
    </main>
  )
}
