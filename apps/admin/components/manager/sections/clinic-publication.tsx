'use client'

import { Button, Card, Checkbox, Label, Spinner } from '@heroui/react'
import { useEffect, useState } from 'react'
import { ClinicShowcaseEditor } from './clinic-showcase-editor'
import { useStaff } from '@/components/staff-provider'

type Publication = {
  slug: string
  status: string
  enabled: boolean
  address: boolean
  contacts: boolean
}

export function ClinicPublication({ clinicId }: { clinicId: string }) {
  const staff = useStaff()
  return (
    <PublicationForm key={`${staff.user?.uid}/${clinicId}/${staff.revision}`} clinicId={clinicId} />
  )
}

function PublicationForm({ clinicId }: { clinicId: string }) {
  const { user } = useStaff()
  const [publication, setPublication] = useState<Publication | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/clinics/${clinicId}/publication`, {
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        })
        if (!response.ok) throw new Error('Unavailable')
        const data = (await response.json()) as { publication: Publication }
        if (!controller.signal.aborted) {
          setPublication(data.publication)
          setError('')
        }
      } catch {
        if (!controller.signal.aborted)
          setError('Não foi possível consultar a publicação. Tente novamente.')
      }
    })()
    return () => controller.abort()
  }, [user, clinicId, retry])
  async function save() {
    if (!user || !publication || busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/clinics/${clinicId}/publication`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: publication.enabled,
          address: publication.address,
          contacts: publication.contacts,
        }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error('Unavailable')
      setMessage(
        publication.enabled
          ? 'Página publicada. Você já pode compartilhar o link.'
          : 'Página retirada do ar.',
      )
    } catch {
      setError('Não foi possível confirmar a alteração. Consulte novamente antes de compartilhar.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="manager-panel">
      <Card.Header>
        <Card.Title>Página pública do espaço</Card.Title>
      </Card.Header>
      <Card.Content>
        <p>
          Use a marca, o tema e os serviços salvos no onboarding em uma página para suas clientes.
        </p>
        {!publication && !error && <Spinner aria-label="Consultando publicação" />}
        {publication && publication.status !== 'active' && (
          <p>Conclua o onboarding para publicar.</p>
        )}
        {publication?.status === 'active' && (
          <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
            {(
              [
                { key: 'enabled', label: 'Publicar nome, logo, tema, serviços, preços e horários' },
                { key: 'address', label: 'Exibir endereço e link de localização' },
                { key: 'contacts', label: 'Exibir WhatsApp e redes sociais cadastrados' },
              ] as const
            ).map(({ key, label }) => (
              <Checkbox
                key={key}
                isSelected={publication[key]}
                isDisabled={busy}
                onChange={(value) => {
                  setPublication({ ...publication, [key]: value })
                  setMessage('')
                }}
              >
                <Checkbox.Content>
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Label>{label}</Label>
                </Checkbox.Content>
              </Checkbox>
            ))}
            <p>
              Ao publicar, qualquer pessoa com o link poderá consultar essas informações. Endereço e
              contatos são opcionais; dados da conta e de clientes não são publicados.
            </p>
            <a
              href={`https://luminix.beauty/c/${encodeURIComponent(publication.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir página pública ↗
            </a>
            <Button onPress={() => void save()} isDisabled={busy}>
              {busy ? 'Salvando…' : 'Salvar publicação'}
            </Button>
          </div>
        )}
        {publication?.status === 'active' && <ClinicShowcaseEditor clinicId={clinicId} />}
        {message && <p role="status">{message}</p>}
        {error && (
          <>
            <p role="alert">{error}</p>
            <Button onPress={() => setRetry((value) => value + 1)}>Consultar novamente</Button>
          </>
        )}
      </Card.Content>
    </Card>
  )
}
