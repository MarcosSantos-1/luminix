'use client'

import { Button, Card } from '@heroui/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { useCallback, useState } from 'react'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'
import { ManagerHome } from '@/components/manager/manager-home'
import { ConnectPanel } from '@/components/payments/connect-panel'
import { MediaLibrary } from '@/components/manager/media/media-library'
import { HomeDashboard } from '@/components/manager/business/home-dashboard'
import { ServicesPanel } from '@/components/manager/business/services-panel'
import { FinancePanel } from '@/components/manager/business/finance-panel'
import { ReportsPanel } from '@/components/manager/business/reports-panel'
import { InventoryPanel } from '@/components/manager/business/inventory-panel'
import { MarketingPanel } from '@/components/manager/business/marketing-panel'
import { ClinicSettings } from '@/components/manager/sections/clinic-settings'
import { useClinicApi } from '@/components/manager/settings/clinic-api'
import type { SearchFocus } from '@/components/manager/workspace/workspace-signals'
import { allowedSections, allowedSettings } from '@/lib/access'
import { getFirebaseAuth } from '@/lib/firebase'
import '@/app/dashboard/manager.css'
import '@/components/ui/scrollbar.css'

export function ClinicHome({
  initialSection,
  initialSettingsTab,
  welcome,
}: {
  initialSection: string
  initialSettingsTab?: string
  welcome: boolean
}) {
  const { clinic, permissions } = useClinic()
  const staff = useStaff()
  const router = useRouter()
  const [logoutError, setLogoutError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const canManageSettings = permissions.includes('settings:manage')
  const user = staff.user
  const api = useClinicApi(clinic.id)
  const getPublicUrl = useCallback(
    async (signal: AbortSignal) => {
      if (!user || !canManageSettings) return null
      const response = await fetch(`/api/clinics/${clinic.id}/publication`, {
        headers: { authorization: `Bearer ${await user.getIdToken()}` },
        cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      })
      if (!response.ok) return null
      const data: { publication: { status: string; slug: string; enabled: boolean } } =
        await response.json()
      return data.publication.status === 'active' && data.publication.enabled
        ? `https://luminix.beauty/c/${encodeURIComponent(data.publication.slug)}`
        : null
    },
    [clinic.id, canManageSettings, user],
  )
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
  const sections = allowedSections(permissions)
  const settingsTabs = allowedSettings(permissions)
  const canOpenSettings = settingsTabs.length > 0
  return (
    <ManagerHome
      key={`${staff.user?.uid}/${clinic.id}`}
      clinicName={clinic.name}
      userName={staff.user?.displayName || 'Gestor'}
      userEmail={staff.user?.email || undefined}
      workspace={
        clinic.status === 'active'
          ? { api, clinicId: clinic.id, canAudit: permissions.includes('audit:read') }
          : undefined
      }
      onLogout={() => void logout()}
      signingOut={signingOut}
      logoutError={logoutError}
      canManageSettings={canOpenSettings}
      sections={sections}
      settingsTabs={settingsTabs}
      messages={
        clinic.status === 'active' && user
          ? {
              welcome,
              scope: `${user.uid}/${clinic.id}`,
              getPublicUrl: canManageSettings ? getPublicUrl : undefined,
            }
          : undefined
      }
      shareCode={clinic.share_code ?? null}
      initialSection={initialSection}
      initialSettingsTab={initialSettingsTab}
      payments={<ConnectPanel dashboard />}
      media={permissions.includes('media:read') ? <MediaLibrary clinicId={clinic.id} /> : undefined}
      panels={
        clinic.status === 'active'
          ? {
              inicio: ({ navigate }) => (
                <HomeDashboard clinicId={clinic.id} sections={sections} onNavigate={navigate} />
              ),
              servicos: ({ createSignal, navigate, focus }) => (
                <ServicesPanel
                  clinicId={clinic.id}
                  createSignal={createSignal}
                  focus={focus}
                  onOpenTeam={() => navigate('Equipe e horários')}
                />
              ),
              ...(permissions.includes('finance:manage')
                ? {
                    financeiro: ({ createSignal }: { createSignal: number }) => (
                      <FinancePanel clinicId={clinic.id} createSignal={createSignal} />
                    ),
                    relatorios: () => <ReportsPanel clinicId={clinic.id} />,
                  }
                : {}),
              ...(permissions.includes('inventory:manage')
                ? {
                    estoque: ({
                      createSignal,
                      focus,
                    }: {
                      createSignal: number
                      focus: SearchFocus | null
                    }) => (
                      <InventoryPanel
                        clinicId={clinic.id}
                        createSignal={createSignal}
                        focus={focus}
                      />
                    ),
                  }
                : {}),
              marketing: ({ navigate }) => (
                <MarketingPanel clinicId={clinic.id} clinicName={clinic.name} onOpen={navigate} />
              ),
            }
          : undefined
      }
      settings={
        canOpenSettings
          ? (tab, open) => (
              <ClinicSettings
                tab={tab}
                onOpen={open}
                clinic={clinic}
                shareCode={clinic.share_code ?? null}
                canContinueOnboarding={permissions.includes('onboarding:manage')}
                canReadOnboarding={permissions.includes('onboarding:manage')}
                permissions={permissions}
                ownName={staff.user?.displayName ?? ''}
              />
            )
          : undefined
      }
      banner={
        clinic.status === 'draft' ? (
          <Card className="manager-panel manager-onboarding-banner">
            <Card.Title>Conclua a configuração da sua clínica</Card.Title>
            <p>Seu rascunho está salvo. Continue de onde parou.</p>
            {permissions.includes('onboarding:manage') && (
              <Link href={`/c/${clinic.share_code || clinic.id}/onboarding`} className="underline">
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
