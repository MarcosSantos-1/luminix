'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button, Card, Spinner } from '@heroui/react'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'

type Overview = {
  clinic: { name: string; status: string; share_code: string | null }
  occupations: { name: string }[]
  services: { name: string; price_cents: number; duration_minutes: number }[]
  professionals: { display_name: string }[]
}
export function ClinicOverview() {
  const { clinic, permissions } = useClinic()
  const staff = useStaff()
  const key = `${staff.user?.uid}/${clinic.id}/${staff.revision}`
  const [state, setState] = useState<{ key: string; data?: Overview; error?: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  useEffect(() => {
    const user = staff.user
    if (!user || !permissions.includes('clinic:manage')) return
    let active = true
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/clinics/${clinic.id}/overview`, {
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        })
        if (!response.ok) throw new Error()
        const data: Overview = await response.json()
        if (active) setState({ key, data })
      } catch {
        if (active) setState({ key, error: 'Não foi possível carregar os dados da clínica.' })
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [staff.user, clinic.id, key, retry, permissions])

  if (!permissions.includes('clinic:manage'))
    return <p role="alert">Seu acesso não inclui a visão geral da clínica.</p>

  if (state?.key !== key || !state.data)
    return state?.key === key && state.error ? (
      <div role="alert">
        <p>{state.error}</p>
        <Button onPress={() => setRetry((value) => value + 1)}>Tentar novamente</Button>
      </div>
    ) : (
      <div role="status">
        <Spinner aria-label="Carregando dados da clínica" /> Carregando dados da clínica…
      </div>
    )
  const data = state.data
  return (
    <div className="space-y-5">
      {data.clinic.status === 'draft' ? (
        <Card className="manager-real-card">
          <h2 className="text-xl font-bold">Conclua a configuração</h2>
          <p>Seu rascunho fica salvo por etapa. Você pode sair e continuar depois.</p>
          {permissions.includes('onboarding:manage') && (
            <Link
              className="mt-4 inline-block rounded-xl bg-primary px-4 py-3 text-white"
              href={`/clinics/${clinic.id}/onboarding`}
            >
              Continuar onboarding →
            </Link>
          )}
        </Card>
      ) : (
        <Card className="manager-real-card">
          <h2 className="text-xl font-bold">{data.clinic.name}</h2>
          <p>Clínica ativa. Estes dados foram carregados do backend.</p>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Summary
          title="Ocupações"
          value={data.occupations.length}
          items={data.occupations.map((item) => item.name)}
        />
        <Summary
          title="Serviços"
          value={data.services.length}
          items={data.services.map(
            (item) =>
              `${item.name} · ${(item.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${item.duration_minutes} min`,
          )}
        />
        <Summary
          title="Profissionais"
          value={data.professionals.length}
          items={data.professionals.map((item) => item.display_name)}
        />
      </div>
      {data.clinic.share_code && (
        <Card className="manager-real-card">
          <h2 className="text-lg font-bold">Compartilhar clínica</h2>
          <p>
            Use o código para identificar a clínica quando a entrada por código estiver disponível
            no app cliente. O código não concede acesso à equipe.
          </p>
          <div className="mt-3 flex gap-3">
            <code className="rounded-xl p-3">{data.clinic.share_code}</code>
            <Button
              onPress={() =>
                void navigator.clipboard
                  .writeText(data.clinic.share_code!)
                  .then(() => setCopied(true))
                  .catch(() => setCopyError(true))
              }
            >
              Copiar código
            </Button>
          </div>
          {copied && <p role="status">Código copiado.</p>}
          {copyError && <p role="alert">Não foi possível copiar. Selecione o código acima.</p>}
        </Card>
      )}
      {permissions.includes('settings:manage') && (
        <Link className="block underline" href={`/clinics/${clinic.id}/settings`}>
          Ver configurações gerais →
        </Link>
      )}
    </div>
  )
}
function Summary({ title, value, items }: { title: string; value: number; items: string[] }) {
  return (
    <Card className="manager-real-card">
      <h2 className="font-bold">{title}</h2>
      <strong className="text-3xl">{value}</strong>
      {items.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm manager-real-muted">Nenhum cadastro ainda.</p>
      )}
    </Card>
  )
}
