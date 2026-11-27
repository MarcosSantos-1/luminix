'use client'

import Link from 'next/link'
import { ArrowRight, HandCoins, Rocket, Wallet } from 'lucide-react'
import { ReceiptsLink } from '@/components/payments/receipts-link'
import { PersonalizationSettings } from '../settings/personalization-settings'
import { ProfileSettings } from '../settings/profile-settings'
import { RoutineSettings } from '../settings/routine-settings'
import { RulesSettings } from '../settings/rules-settings'
import { SettingsCard } from '../settings/settings-kit'
import { useClinicApi } from '../settings/clinic-api'
import { SiteSettings } from '../settings/site-settings'
import { TeamSettings } from '../settings/team-settings'
import type { ManagerSectionId } from '../demo-data'
import type { ManagerSettingsSection } from '../manager-settings-nav'

export function ClinicSettings({
  tab,
  onOpen,
  clinic,
  shareCode,
  canContinueOnboarding,
  permissions = [],
  ownName = '',
}: {
  tab: ManagerSettingsSection
  onOpen: (section: ManagerSectionId) => void
  clinic: { id: string; name: string; slug: string; status: string }
  shareCode: string | null
  canContinueOnboarding: boolean
  canReadOnboarding?: boolean
  permissions?: string[]
  /** Signed-in person's name, suggested when she adds herself to the team. */
  ownName?: string
}) {
  const ref = shareCode || clinic.id
  const api = useClinicApi(clinic.id)
  const paymentsHref = permissions.includes('settings:manage')
    ? `/c/${ref}/recebimentos`
    : undefined
  return (
    <div className="manager-section">
      {clinic.status === 'draft' && (
        <SettingsCard
          icon={<Rocket size={20} />}
          title="Conclua a configuração do seu espaço"
          description="Seu rascunho está salvo. Continue de onde parou para liberar todas as configurações."
        >
          {canContinueOnboarding && (
            <Link className="settings-link-button" href={`/c/${ref}/onboarding`}>
              Continuar cadastro <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </SettingsCard>
      )}
      {(tab === 'espaco' || tab === 'contato') && (
        <ProfileSettings clinicId={clinic.id} tab={tab} />
      )}
      {tab === 'vitrine' && (
        <SiteSettings
          clinicId={clinic.id}
          clinicName={clinic.name}
          editorHref={`/c/${ref}/vitrine`}
        />
      )}
      {tab === 'regras' && <RulesSettings clinicId={clinic.id} clinicName={clinic.name} />}
      {tab === 'personalizacao' && <PersonalizationSettings clinicId={clinic.id} />}
      {tab === 'equipe' && (
        <TeamSettings
          clinicId={clinic.id}
          ownName={ownName}
          canManageAccess={permissions.includes('team:manage')}
        />
      )}
      {tab === 'rotina' && (
        <div className="settings-stack">
          <RoutineSettings clinicId={clinic.id} onOpenAgenda={() => onOpen('agenda')} />
          {paymentsHref && (
            <SettingsCard
              icon={<Wallet size={20} />}
              title="Pagamentos"
              description="Configure os recebimentos online e os dados bancários do seu espaço."
            >
              <div className="settings-payment-links">
                <ReceiptsLink api={api} href={paymentsHref} className="settings-link-button" />
                <Link className="settings-link-button" href={`${paymentsHref}#sinais`}>
                  <HandCoins size={16} aria-hidden /> Configurar sinais
                </Link>
              </div>
            </SettingsCard>
          )}
        </div>
      )}
    </div>
  )
}
