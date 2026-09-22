'use client'

import { Button, Card } from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { useState } from 'react'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'
import { ManagerHome } from '@/components/manager/manager-home'
import { ClinicOverview } from '@/components/manager/clinic-overview'
import { getFirebaseAuth } from '@/lib/firebase'
import '@/app/dashboard/manager.css'

export default function ClinicHome() {
  const { clinic, permissions } = useClinic()
  const staff = useStaff()
  const router = useRouter()
  const [logoutError, setLogoutError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const homeHref = `/clinics/${clinic.id}`
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
      homeHref={homeHref}
      canManageSettings={permissions.includes('settings:manage')}
      onNavigate={(label) => {
        if (label === 'Configurações' && permissions.includes('settings:manage')) {
          router.push(`${homeHref}/settings`)
          return true
        }
        return false
      }}
      banner={
        clinic.status === 'draft' ? (
          <Card className="manager-panel manager-onboarding-banner">
            <Card.Title>Conclua a configuração da sua clínica</Card.Title>
            <p>Seu rascunho está salvo. Continue de onde parou.</p>
            {permissions.includes('onboarding:manage') && (
              <Link href={`${homeHref}/onboarding`} className="underline">
                Continuar onboarding →
              </Link>
            )}
          </Card>
        ) : undefined
      }
      clinicDetails={<ClinicOverview key={`${staff.user?.uid}/${clinic.id}/${staff.revision}`} />}
      profile={
        <div className="manager-account">
          <p>{staff.user?.displayName || 'Sua conta'}</p>
          <p>{staff.user?.email}</p>
          <Link href="/clinics">Trocar clínica</Link>
          {permissions.includes('settings:manage') && (
            <Link href={`${homeHref}/settings`}>Configurações da clínica</Link>
          )}
          <Button variant="secondary" onPress={staff.refresh}>
            Atualizar acesso
          </Button>
          <Button isDisabled={signingOut} onPress={() => void logout()}>
            {signingOut ? 'Saindo…' : 'Sair'}
          </Button>
          {logoutError && <p role="alert">{logoutError}</p>}
        </div>
      }
    />
  )
}
