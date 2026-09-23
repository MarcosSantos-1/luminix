'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, Card, Chip, Spinner } from '@heroui/react'
import { useStaff } from '@/components/staff-provider'

type Settings = { timezone: string; locale: string; currency: string }
type Overview = {
  occupations: { name: string }[]
  services: { name: string; price_cents: number; duration_minutes: number }[]
  professionals: { display_name: string }[]
}

export function ClinicSettings({
  clinic,
  canContinueOnboarding,
}: {
  clinic: { id: string; name: string; slug: string; status: string }
  canContinueOnboarding: boolean
}) {
  const staff = useStaff()
  const key = `${staff.user?.uid}/${clinic.id}/${staff.revision}`
  const [state, setState] = useState<{
    key: string
    settings?: Settings
    overview?: Overview
    error?: string
  } | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const user = staff.user
    if (!user) return
    let active = true
    const abort = new AbortController()
    void (async () => {
      try {
        const headers = { authorization: `Bearer ${await user.getIdToken()}` }
        const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)])
        const [settingsResponse, overviewResponse] = await Promise.all([
          fetch(`/api/clinics/${clinic.id}/settings`, { headers, cache: 'no-store', signal }),
          fetch(`/api/clinics/${clinic.id}/overview`, { headers, cache: 'no-store', signal }),
        ])
        if (!settingsResponse.ok || !overviewResponse.ok) throw new Error('Unavailable')
        const settingsBody: { settings: Settings } = await settingsResponse.json()
        const overviewBody: Overview = await overviewResponse.json()
        if (active) setState({ key, settings: settingsBody.settings, overview: overviewBody })
      } catch {
        if (active)
          setState((current) =>
            current?.key === key && current.settings && current.overview
              ? current
              : {
                  key,
                  error: 'Não foi possível carregar os dados da clínica. Atualize seu acesso.',
                },
          )
      }
    })()
    return () => {
      active = false
      abort.abort()
    }
  }, [staff.user, clinic.id, key, retry])

  if (state?.key !== key || !state.settings || !state.overview) {
    if (state?.key === key && state.error)
      return (
        <Card className="manager-panel">
          <Card.Content>
            <p role="alert">{state.error}</p>
            <Button onPress={() => setRetry((value) => value + 1)}>Tentar novamente</Button>
          </Card.Content>
        </Card>
      )
    return (
      <div className="manager-section-status" role="status">
        <Spinner aria-label="Carregando dados da clínica" />
        Carregando dados da clínica…
      </div>
    )
  }

  const { settings, overview } = state
  const active = clinic.status !== 'draft'
  return (
    <div className="manager-section">
      {clinic.status === 'draft' && (
        <Card className="manager-panel manager-onboarding-banner">
          <Card.Title>Conclua a configuração da sua clínica</Card.Title>
          <p>Seu rascunho está salvo. Continue de onde parou.</p>
          {canContinueOnboarding && (
            <Link href={`/clinics/${clinic.id}/onboarding`}>Continuar onboarding →</Link>
          )}
        </Card>
      )}
      <Card className="manager-panel">
        <Card.Header className="manager-panel-heading">
          <Card.Title>{clinic.name}</Card.Title>
          <Chip size="sm" variant="soft">
            {active ? 'Ativa' : 'Em configuração'}
          </Chip>
        </Card.Header>
        <Card.Content>
          <dl className="manager-definition">
            <div>
              <dt>Nome</dt>
              <dd>{clinic.name}</dd>
            </div>
            <div>
              <dt>Identificador</dt>
              <dd>{clinic.slug}</dd>
            </div>
            <div>
              <dt>Situação</dt>
              <dd>{active ? 'Ativa' : 'Em configuração'}</dd>
            </div>
          </dl>
        </Card.Content>
      </Card>
      <Card className="manager-panel">
        <Card.Header>
          <Card.Title>Preferências</Card.Title>
        </Card.Header>
        <Card.Content>
          <dl className="manager-definition">
            <div>
              <dt>Fuso horário</dt>
              <dd>{settings.timezone}</dd>
            </div>
            <div>
              <dt>Idioma</dt>
              <dd>{settings.locale}</dd>
            </div>
            <div>
              <dt>Moeda</dt>
              <dd>{settings.currency}</dd>
            </div>
          </dl>
          <p className="manager-real-muted">
            Valores reais do backend. A edição entra nas próximas etapas.
          </p>
        </Card.Content>
      </Card>
      <div className="manager-settings-grid">
        <Summary title="Ocupações" items={overview.occupations.map((item) => item.name)} />
        <Summary
          title="Serviços"
          items={overview.services.map(
            (item) =>
              `${item.name} · ${(item.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${item.duration_minutes} min`,
          )}
        />
        <Summary
          title="Profissionais"
          items={overview.professionals.map((item) => item.display_name)}
        />
      </div>
    </div>
  )
}

function Summary({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="manager-panel">
      <Card.Header className="manager-panel-heading">
        <Card.Title>{title}</Card.Title>
        <Chip size="sm" variant="soft">
          {items.length}
        </Chip>
      </Card.Header>
      <Card.Content>
        {items.length ? (
          <ul className="manager-settings-list">
            {items.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="manager-real-muted">Nenhum cadastro ainda.</p>
        )}
      </Card.Content>
    </Card>
  )
}
