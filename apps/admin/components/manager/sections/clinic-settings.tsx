'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, Card, Chip, Spinner } from '@heroui/react'
import { useStaff } from '@/components/staff-provider'
import { formatBrPhone } from '@/lib/phone'

type Settings = { timezone: string; locale: string; currency: string }
type Overview = {
  occupations: { name: string }[]
  services: { name: string; price_cents: number; duration_minutes: number }[]
  professionals: { display_name: string }[]
}
type Contact = { ownerName: string; email: string; phone: string }

const mockOptions = [
  {
    title: 'Horários',
    rows: [
      { label: 'Segunda a sexta', value: '09:00–19:00' },
      { label: 'Sábado', value: '09:00–14:00' },
      { label: 'Domingo', value: 'Fechado' },
    ],
  },
  {
    title: 'Salas e recursos',
    rows: [
      { label: 'Sala rosa', value: 'Maca' },
      { label: 'Sala lavanda', value: 'Cadeira' },
    ],
  },
  {
    title: 'Pagamentos',
    rows: [
      { label: 'No aplicativo', value: 'Não configurado' },
      { label: 'Máquina', value: 'Própria' },
    ],
  },
  {
    title: 'Página pública',
    rows: [
      { label: 'Publicação', value: 'Rascunho' },
      { label: 'Endereço', value: 'Ainda não publicado' },
    ],
  },
  {
    title: 'Marca',
    rows: [
      { label: 'Preset', value: 'Rosa' },
      { label: 'Logo', value: 'Não enviada' },
    ],
  },
  {
    title: 'Permissões da equipe',
    rows: [
      { label: 'Recepção', value: 'Agenda e clientes' },
      { label: 'Profissional', value: 'A própria agenda' },
    ],
  },
]

export function ClinicSettings({
  clinic,
  shareCode,
  canContinueOnboarding,
  canReadOnboarding,
}: {
  clinic: { id: string; name: string; slug: string; status: string }
  shareCode: string | null
  canContinueOnboarding: boolean
  canReadOnboarding: boolean
}) {
  const staff = useStaff()
  const key = `${staff.user?.uid}/${clinic.id}/${staff.revision}`
  const [state, setState] = useState<{
    key: string
    settings?: Settings
    overview?: Overview
    contact?: Contact | null
    contactError?: string
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
        const [settingsResponse, overviewResponse, onboardingResponse] = await Promise.all([
          fetch(`/api/clinics/${clinic.id}/settings`, { headers, cache: 'no-store', signal }),
          fetch(`/api/clinics/${clinic.id}/overview`, { headers, cache: 'no-store', signal }),
          canReadOnboarding
            ? fetch(`/api/clinics/${clinic.id}/onboarding`, { headers, cache: 'no-store', signal })
            : Promise.resolve(null),
        ])
        if (!settingsResponse.ok || !overviewResponse.ok) throw new Error('Unavailable')
        const settingsBody: { settings: Settings } = await settingsResponse.json()
        const overviewBody: Overview = await overviewResponse.json()
        let contact: Contact | null = null
        let contactError: string | undefined
        if (onboardingResponse) {
          if (!onboardingResponse.ok) {
            contactError = 'Não foi possível carregar o contato salvo no cadastro.'
          } else {
            const body: { draft?: { payload?: Partial<Contact> } } = await onboardingResponse.json()
            const payload = body.draft?.payload
            contact = {
              ownerName: payload?.ownerName?.trim() ?? '',
              email: payload?.email?.trim() ?? '',
              phone: payload?.phone?.trim() ?? '',
            }
          }
        }
        if (active)
          setState({
            key,
            settings: settingsBody.settings,
            overview: overviewBody,
            contact,
            contactError,
          })
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
  }, [staff.user, clinic.id, key, retry, canReadOnboarding])

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

  const { settings, overview, contact, contactError } = state
  const active = clinic.status !== 'draft'
  const phone = contact?.phone ? formatBrPhone(contact.phone) || contact.phone : ''
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
      <div className="manager-settings-group">
        <p className="manager-settings-kicker">Cadastro da clínica</p>
        <div className="manager-settings-grid">
          <Card className="manager-panel">
            <Card.Header className="manager-panel-heading">
              <Card.Title>Clínica</Card.Title>
              <Chip size="sm" variant="soft">
                {active ? 'Ativa' : 'Em configuração'}
              </Chip>
            </Card.Header>
            <Card.Content>
              <dl className="manager-definition">
                <Field label="Nome" value={clinic.name} />
                <Field label="Identificador" value={clinic.slug} />
                <Field label="Situação" value={active ? 'Ativa' : 'Em configuração'} />
                <Field
                  label="Código de acesso"
                  value={shareCode || 'Surge ao concluir o cadastro'}
                />
              </dl>
            </Card.Content>
          </Card>
          <Card className="manager-panel">
            <Card.Header className="manager-panel-heading">
              <Card.Title>Contato</Card.Title>
              <Chip size="sm" variant="soft">
                Salvo
              </Chip>
            </Card.Header>
            <Card.Content>
              {contactError ? (
                <div>
                  <p role="alert">{contactError}</p>
                  <Button onPress={() => setRetry((value) => value + 1)}>Tentar novamente</Button>
                </div>
              ) : canReadOnboarding ? (
                <dl className="manager-definition">
                  <Field label="Responsável" value={contact?.ownerName || 'Ainda não informado'} />
                  <Field label="E-mail" value={contact?.email || 'Ainda não informado'} />
                  <Field label="WhatsApp" value={phone || 'Ainda não informado'} />
                </dl>
              ) : (
                <p className="manager-real-muted">
                  O contato do cadastro fica visível para quem gerencia o onboarding.
                </p>
              )}
            </Card.Content>
          </Card>
          <Card className="manager-panel">
            <Card.Header>
              <Card.Title>Região</Card.Title>
            </Card.Header>
            <Card.Content>
              <dl className="manager-definition">
                <Field label="Fuso horário" value={settings.timezone} />
                <Field label="Idioma" value={settings.locale} />
                <Field label="Moeda" value={settings.currency} />
              </dl>
            </Card.Content>
          </Card>
          <Summary title="Ocupações" items={overview.occupations.map((item) => item.name)} />
          <Summary
            title="Serviços"
            items={overview.services.map(
              (item) =>
                `${item.name} · ${(item.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${item.duration_minutes} min`,
            )}
          />
          <Summary title="Equipe" items={overview.professionals.map((item) => item.display_name)} />
        </div>
        <p className="manager-real-muted">
          Estes dados vieram do cadastro. A edição entra nas próximas etapas.
        </p>
      </div>
      <div className="manager-settings-group">
        <p className="manager-settings-kicker">Em preparação</p>
        <div className="manager-settings-grid">
          {mockOptions.map((option) => (
            <Card className="manager-panel" key={option.title}>
              <Card.Header className="manager-panel-heading">
                <Card.Title>{option.title}</Card.Title>
                <Chip size="sm" variant="soft">
                  Exemplo
                </Chip>
              </Card.Header>
              <Card.Content>
                <p className="manager-real-muted">
                  Ilustrativo. Ainda não faz parte do cadastro salvo.
                </p>
                <dl className="manager-definition">
                  {option.rows.map((row) => (
                    <Field key={row.label} label={row.label} value={row.value} />
                  ))}
                </dl>
              </Card.Content>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
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
