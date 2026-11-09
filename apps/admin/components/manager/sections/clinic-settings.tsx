'use client'

import Link from 'next/link'
import { Button } from '@heroui/react'
import { ArrowRight, CalendarDays, Clock3, Rocket, Wallet } from 'lucide-react'
import { AccessSettings } from '../settings/access-settings'
import { PersonalizationSettings } from '../settings/personalization-settings'
import { ProfileSettings } from '../settings/profile-settings'
import { RulesSettings } from '../settings/rules-settings'
import { SettingsCard } from '../settings/settings-kit'
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
      {tab === 'regras' && (
        <RulesSettings
          clinicId={clinic.id}
          clinicName={clinic.name}
          onOpenFinance={() => onOpen('financeiro')}
        />
      )}
      {tab === 'personalizacao' && <PersonalizationSettings clinicId={clinic.id} />}
      {tab === 'equipe' && (
        <TeamSettings
          clinicId={clinic.id}
          ownName={ownName}
          canManageAccess={permissions.includes('team:manage')}
        />
      )}
      {tab === 'acessos' && <AccessSettings clinicId={clinic.id} />}
      {tab === 'rotina' && (
        <div className="settings-stack">
          <SettingsCard
            icon={<CalendarDays size={20} />}
            title="Agenda e expediente"
            description="Os horários de atendimento, pausas e dias especiais ficam na Agenda."
          >
            <Button variant="secondary" onPress={() => onOpen('agenda')}>
              <Clock3 size={16} aria-hidden /> Abrir Agenda
            </Button>
          </SettingsCard>
          <SettingsCard
            icon={<Wallet size={20} />}
            title="Pagamentos"
            description="Receber pelo app e dados bancários ficam na área Financeiro."
          >
            <Button variant="secondary" onPress={() => onOpen('financeiro')}>
              <Wallet size={16} aria-hidden /> Abrir Financeiro
            </Button>
          </SettingsCard>
        </div>
      )}
    </div>
  )
}
