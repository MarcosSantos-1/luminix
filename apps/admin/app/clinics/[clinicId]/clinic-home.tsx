'use client'

import { Button, Card } from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { useState } from 'react'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'
import { ManagerHome } from '@/components/manager/manager-home'
import { ClinicSettings } from '@/components/manager/sections/clinic-settings'
import { getFirebaseAuth } from '@/lib/firebase'
import '@/app/dashboard/manager.css'

export function ClinicHome({ initialSection }: { initialSection: string }) {
  const { clinic, permissions } = useClinic()
  const staff = useStaff()
  const router = useRouter()
  const [logoutError, setLogoutError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  async function logout() {
    setSigningOut(true)
    setLogoutError('')
    try {
      await signOut(getFirebaseAuth())
      router.replace('/login')
    } catch {
      setLogoutError('Não foi possível sair. Tente novamente.')
      setSigningOut(false)
    }
  }
  if (!permissions.includes('clinic:manage'))
    return (
      <div className="p-6" role="alert">
        Seu acesso não inclui a visão geral da clínica.{' '}
        <Link href="/clinics">Voltar às minhas clínicas</Link>
      </div>
    )
  return (
    <ManagerHome
      key={`${staff.user?.uid}/${clinic.id}`}
      clinicName={clinic.name}
      userName={staff.user?.displayName || 'Gestor'}
      userEmail={staff.user?.email || undefined}
      onLogout={() => void logout()}
      signingOut={signingOut}
      logoutError={logoutError}
      canManageSettings={permissions.includes('settings:manage')}
      shareCode={clinic.share_code ?? null}
      initialSection={initialSection}
      settings={
        permissions.includes('settings:manage') ? (
          <ClinicSettings
            clinic={clinic}
            shareCode={clinic.share_code ?? null}
            canContinueOnboarding={permissions.includes('onboarding:manage')}
            canReadOnboarding={permissions.includes('onboarding:manage')}
          />
        ) : undefined
      }
      banner={
        clinic.status === 'draft' ? (
          <Card className="manager-panel manager-onboarding-banner">
            <Card.Title>Conclua a configuração da sua clínica</Card.Title>
            <p>Seu rascunho está salvo. Continue de onde parou.</p>
            {permissions.includes('onboarding:manage') && (
              <Link href={`/clinics/${clinic.id}/onboarding`} className="underline">
                Continuar onboarding →
              </Link>
            )}
          </Card>
        ) : undefined
      }
      profile={
        <div className="manager-account">
          <p>{staff.user?.displayName || 'Sua conta'}</p>
          <p>{staff.user?.email}</p>
          <Button variant="secondary" onPress={staff.refresh}>
            Atualizar acesso
          </Button>
          {logoutError && <p role="alert">{logoutError}</p>}
        </div>
      }
    />
  )
}
