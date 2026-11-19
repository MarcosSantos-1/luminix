'use client'

import { useMemo, useState } from 'react'
import {
  FirstAccessCard,
  PasswordStep,
  PhotoStep,
  WelcomeStep,
  type FirstAccessStep,
} from '@/components/first-access'
import { ClinicApiProvider, type ClinicApi } from '@/components/manager/settings/clinic-api'

const clinic = { id: 'qa', name: 'Studio Lumière', status: 'active' as const, role: 'team' }

export default function QAFirstAccess({ step: initial }: { step: FirstAccessStep }) {
  const [step, setStep] = useState<FirstAccessStep>(initial)
  const api = useMemo<ClinicApi>(
    () => ({
      ready: true,
      async get<T>() {
        return { name: 'Carla Souza', email: 'carla@example.com', role: 'team', photo: null } as T
      },
      async put<T>() {
        return {} as T
      },
      async post<T>() {
        return {} as T
      },
      async upload() {
        return { id: 'qa', url: '' }
      },
      async sendAccessEmail() {},
      async sendAccessLink() {},
      async postalCode() {
        return null
      },
    }),
    [],
  )
  return (
    <ClinicApiProvider value={api}>
      <main className="auth-boot">
        <FirstAccessCard step={step}>
          {step === 'password' ? <PasswordStep onDone={() => setStep('photo')} /> : null}
          {step === 'photo' ? <PhotoStep clinicId="qa" onDone={() => setStep('welcome')} /> : null}
          {step === 'welcome' ? (
            <WelcomeStep clinic={clinic} name="Carla Souza" onEnter={() => setStep('password')} />
          ) : null}
        </FirstAccessCard>
      </main>
    </ClinicApiProvider>
  )
}
