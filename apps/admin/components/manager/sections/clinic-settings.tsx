'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Button, Chip } from '@heroui/react'
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  Rocket,
  Scissors,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { useClinicApi, useClinicResource } from '../settings/clinic-api'
import { PersonalizationSettings } from '../settings/personalization-settings'
import { ProfileSettings } from '../settings/profile-settings'
import { RulesSettings } from '../settings/rules-settings'
import { SettingsCard, SettingsSkeleton, LoadError, Empty } from '../settings/settings-kit'
import { SiteSettings } from '../settings/site-settings'
import type { ManagerSectionId } from '../demo-data'
import type { ManagerSettingsSection } from '../manager-settings-nav'

type Overview = {
  services: { name: string; price_cents: number; duration_minutes: number }[]
  professionals: { display_name: string; photo_url: string | null }[]
}

export function ClinicSettings({
  tab,
  onOpen,
  clinic,
  shareCode,
  canContinueOnboarding,
}: {
  tab: ManagerSettingsSection
  onOpen: (section: ManagerSectionId) => void
  clinic: { id: string; name: string; slug: string; status: string }
  shareCode: string | null
  canContinueOnboarding: boolean
  canReadOnboarding?: boolean
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
      {(tab === 'equipe' || tab === 'servicos') && <OverviewTab clinicId={clinic.id} tab={tab} />}
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

function OverviewTab({ clinicId, tab }: { clinicId: string; tab: 'equipe' | 'servicos' }) {
  const api = useClinicApi(clinicId)
  const overview = useClinicResource<Overview>(api, 'overview')
  if (overview.error && !overview.data)
    return <LoadError message={overview.error} onRetry={overview.reload} />
  if (!overview.data) return <SettingsSkeleton cards={1} />
  if (tab === 'equipe') {
    const people = overview.data.professionals
    return (
      <SettingsCard
        icon={<UsersRound size={20} />}
        title="Equipe"
        description="Profissionais que atendem no seu espaço."
        badge={
          <Chip size="sm" variant="soft">
            {people.length}
          </Chip>
        }
        help={{
          title: 'Como adiciono ou edito profissionais?',
          text: 'A edição da equipe pelo painel está em preparação. Por enquanto, a equipe é a que foi cadastrada no início.',
        }}
      >
        {people.length ? (
          <ul className="settings-people">
            {people.map((person) => (
              <li key={person.display_name}>
                {person.photo_url ? (
                  <Image src={person.photo_url} alt="" width={44} height={44} unoptimized />
                ) : (
                  <span className="settings-avatar" aria-hidden>
                    <UserRound size={20} />
                  </span>
                )}
                {person.display_name}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nenhum profissional cadastrado ainda.</Empty>
        )}
        <p className="settings-footnote">Adicionar e editar profissionais: em breve.</p>
      </SettingsCard>
    )
  }
  const services = overview.data.services
  return (
    <SettingsCard
      icon={<Scissors size={20} />}
      title="Serviços"
      description="Seu catálogo, com preço e duração."
      badge={
        <Chip size="sm" variant="soft">
          {services.length}
        </Chip>
      }
      help={{
        title: 'Como mudo preços e serviços?',
        text: 'A edição do catálogo pelo painel está em preparação. As fotos de cada serviço já podem ser trocadas em Vitrine e site → Editar site público.',
      }}
    >
      {services.length ? (
        <ul className="settings-services">
          {services.map((service, index) => (
            <li key={`${service.name}-${index}`}>
              <strong>{service.name}</strong>
              <span>
                {(service.price_cents / 100).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}{' '}
                · {service.duration_minutes} min
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nenhum serviço cadastrado ainda.</Empty>
      )}
    </SettingsCard>
  )
}
