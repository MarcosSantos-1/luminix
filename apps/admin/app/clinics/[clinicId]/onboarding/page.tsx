'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'

type Payload = {
  name: string
  occupations: string[]
  services: { name: string; priceCents: number; durationMinutes: number }[]
  professionals: string[]
}
type Draft = {
  version: number
  formatVersion: number
  step: string
  status: string
  payload: Payload
}
const steps = [
  { key: 'clinic', label: 'Clínica' },
  { key: 'occupations', label: 'Ocupações' },
  { key: 'services', label: 'Serviços' },
  { key: 'professionals', label: 'Profissionais' },
  { key: 'review', label: 'Revisão' },
]
const field = 'w-full rounded-xl border border-border bg-background p-3'
const card = 'space-y-5 rounded-2xl border border-border bg-card p-6'

export default function OnboardingPage() {
  const { clinic, permissions } = useClinic()
  const staff = useStaff()
  const router = useRouter()
  const key = `${staff.user?.uid}/${clinic.id}/${staff.revision}`
  const [state, setState] = useState<{ key: string; draft?: Draft; error?: string } | null>(null)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const user = staff.user
    if (!user || !permissions.includes('onboarding:manage')) return
    let active = true
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/clinics/${clinic.id}/onboarding`, {
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        })
        if (!response.ok) throw new Error()
        const data: { draft: Draft } = await response.json()
        if (active) {
          if (data.draft.formatVersion !== 1) {
            setState({ key, error: 'Esta versão do rascunho precisa de atualização.' })
            return
          }
          setState({ key, draft: data.draft })
          setPayload(data.draft.payload)
          setStep(
            Math.max(
              0,
              steps.findIndex((item) => item.key === data.draft.step),
            ),
          )
        }
      } catch {
        if (active) setState({ key, error: 'Não foi possível carregar o rascunho.' })
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [staff.user, clinic.id, staff.revision, permissions, key, retry])

  async function save(nextStep: number, exit = false): Promise<void> {
    const user = staff.user
    if (!user || !payload || !state?.draft || busy) return
    setBusy(true)
    setError('')
    try {
      if (!payload.name.trim()) {
        setError('Informe o nome da clínica.')
        return
      }
      if (
        payload.services.some(
          (service) =>
            !service.name.trim() ||
            !Number.isInteger(service.priceCents) ||
            service.priceCents < 0 ||
            !Number.isInteger(service.durationMinutes) ||
            service.durationMinutes < 1 ||
            service.durationMinutes > 1440,
        )
      ) {
        setError('Confira nome, preço e duração de cada serviço.')
        return
      }
      const response = await fetch(`/api/clinics/${clinic.id}/onboarding`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version: state.draft.version, step: steps[nextStep].key, payload }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'O rascunho mudou em outra aba. Recarregue antes de continuar.'
            : response.status === 400
              ? 'Revise os campos desta etapa.'
              : 'Não foi possível salvar. Tente novamente.',
        )
        return
      }
      const data: { draft: Draft } = await response.json()
      if (user.uid !== staff.user?.uid) return
      setState({ key, draft: data.draft })
      setStep(nextStep)
      if (exit) router.push(`/clinics/${clinic.id}`)
    } catch {
      setError('Não foi possível salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function complete() {
    const user = staff.user
    if (!user || !state?.draft || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/clinics/${clinic.id}/onboarding/complete`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version: state.draft.version }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'O rascunho mudou. Recarregue e revise novamente.'
            : 'Não foi possível concluir. Tente novamente.',
        )
        return
      }
      staff.refresh()
      router.push(`/clinics/${clinic.id}`)
    } catch {
      setError(
        'A resposta não chegou. Tente concluir novamente; a operação é segura para repetição.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!permissions.includes('onboarding:manage'))
    return <p role="alert">Você não tem acesso ao onboarding.</p>
  if (clinic.status === 'active')
    return (
      <p>
        Onboarding concluído. <Link href={`/clinics/${clinic.id}`}>Voltar à clínica</Link>
      </p>
    )
  if (state?.key !== key) return <p role="status">Carregando rascunho…</p>
  if (!state.draft || !payload)
    return (
      <div role="alert">
        <p>{state.error}</p>
        <button onClick={() => setRetry((value) => value + 1)}>Tentar novamente</button>
      </div>
    )
  const draftVersion = state.draft.version

  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Etapa {step + 1} de {steps.length}
          </p>
          <h2 className="text-2xl font-bold">{steps[step].label}</h2>
        </div>
        <button disabled={busy} onClick={() => void save(step, true)}>
          Salvar e sair
        </button>
      </div>
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Progresso">
        {steps.map((item, index) => (
          <li
            key={item.key}
            className={`rounded-full px-3 py-1 ${index === step ? 'bg-primary text-white' : 'bg-background'}`}
          >
            {item.label}
          </li>
        ))}
      </ol>
      {step === 0 && (
        <div className="space-y-3">
          <p>O proprietário já está vinculado pela sua conta. Confirme o nome da clínica.</p>
          <label className="block">
            Nome da clínica
            <input
              className={field}
              maxLength={160}
              required
              aria-invalid={!payload.name.trim()}
              value={payload.name}
              onChange={(event) => setPayload({ ...payload, name: event.target.value })}
            />
          </label>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <p>
            Adicione as ocupações ou áreas de atuação da clínica. Você pode concluir sem nenhuma e
            cadastrar depois.
          </p>
          {payload.occupations.map((name, index) => (
            <div className="flex gap-2" key={index}>
              <input
                className={field}
                aria-label={`Ocupação ${index + 1}`}
                maxLength={120}
                value={name}
                onChange={(event) =>
                  setPayload({
                    ...payload,
                    occupations: payload.occupations.map((value, position) =>
                      position === index ? event.target.value : value,
                    ),
                  })
                }
              />
              <button
                onClick={() =>
                  setPayload({
                    ...payload,
                    occupations: payload.occupations.filter((_, position) => position !== index),
                  })
                }
              >
                Remover
              </button>
            </div>
          ))}
          <button
            disabled={payload.occupations.length >= 20}
            onClick={() => setPayload({ ...payload, occupations: [...payload.occupations, ''] })}
          >
            + Adicionar ocupação
          </button>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-3">
          <p>Cada serviço precisa de preço e duração reais. Você pode cadastrar serviços depois.</p>
          {payload.services.map((service, index) => (
            <div
              className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-4"
              key={index}
            >
              <label className="sm:col-span-2">
                Serviço
                <input
                  className={field}
                  maxLength={160}
                  value={service.name}
                  onChange={(event) =>
                    setPayload({
                      ...payload,
                      services: payload.services.map((value, position) =>
                        position === index ? { ...value, name: event.target.value } : value,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Preço (R$)
                <PriceInput
                  key={`${draftVersion}:${index}:${service.name}`}
                  cents={service.priceCents}
                  onChange={(cents) =>
                    setPayload({
                      ...payload,
                      services: payload.services.map((value, position) =>
                        position === index ? { ...value, priceCents: cents } : value,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Minutos
                <input
                  className={field}
                  type="number"
                  min="1"
                  max="1440"
                  value={service.durationMinutes}
                  onChange={(event) =>
                    setPayload({
                      ...payload,
                      services: payload.services.map((value, position) =>
                        position === index
                          ? { ...value, durationMinutes: Number(event.target.value) }
                          : value,
                      ),
                    })
                  }
                />
              </label>
              <button
                className="sm:col-span-4"
                onClick={() =>
                  setPayload({
                    ...payload,
                    services: payload.services.filter((_, position) => position !== index),
                  })
                }
              >
                Remover serviço
              </button>
            </div>
          ))}
          <button
            disabled={payload.services.length >= 30}
            onClick={() =>
              setPayload({
                ...payload,
                services: [...payload.services, { name: '', priceCents: 0, durationMinutes: 60 }],
              })
            }
          >
            + Adicionar serviço
          </button>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-3">
          <p>
            Cadastre profissionais sem criar acesso ao sistema. Convites e permissões serão
            configurados depois.
          </p>
          {payload.professionals.map((name, index) => (
            <div className="flex gap-2" key={index}>
              <input
                className={field}
                aria-label={`Profissional ${index + 1}`}
                maxLength={160}
                value={name}
                onChange={(event) =>
                  setPayload({
                    ...payload,
                    professionals: payload.professionals.map((value, position) =>
                      position === index ? event.target.value : value,
                    ),
                  })
                }
              />
              <button
                onClick={() =>
                  setPayload({
                    ...payload,
                    professionals: payload.professionals.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                Remover
              </button>
            </div>
          ))}
          <button
            disabled={payload.professionals.length >= 20}
            onClick={() =>
              setPayload({ ...payload, professionals: [...payload.professionals, ''] })
            }
          >
            + Adicionar profissional
          </button>
        </div>
      )}
      {step === 4 && (
        <div className="space-y-3">
          <p>
            Confira os dados que serão criados. As configurações iniciais são BRL, pt-BR e
            America/Sao_Paulo.
          </p>
          <dl>
            <dt>Clínica</dt>
            <dd className="font-semibold">{payload.name}</dd>
            <dt>Ocupações</dt>
            <dd>{payload.occupations.length ? payload.occupations.join(', ') : 'Nenhuma'}</dd>
            <dt>Serviços</dt>
            <dd>{payload.services.length}</dd>
            <dt>Profissionais</dt>
            <dd>{payload.professionals.length}</dd>
          </dl>
          <p className="text-sm text-muted-foreground">
            O código de compartilhamento será gerado ao concluir. Ele não é um convite nem concede
            acesso à equipe.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-4 border-t border-border pt-4">
        {step > 0 && (
          <button disabled={busy} onClick={() => void save(step - 1)}>
            Voltar
          </button>
        )}
        {step < steps.length - 1 ? (
          <button
            className="rounded-xl bg-primary px-5 py-3 text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void save(step + 1)}
          >
            {busy ? 'Salvando…' : 'Salvar e continuar'}
          </button>
        ) : (
          <button
            className="rounded-xl bg-primary px-5 py-3 text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void complete()}
          >
            {busy ? 'Concluindo…' : 'Concluir clínica'}
          </button>
        )}
        {error.includes('outra aba') || error.includes('mudou') ? (
          <button onClick={() => setRetry((value) => value + 1)}>Recarregar rascunho</button>
        ) : null}
      </div>
    </section>
  )
}

function PriceInput({ cents, onChange }: { cents: number; onChange: (cents: number) => void }) {
  const [text, setText] = useState((cents / 100).toFixed(2))
  return (
    <input
      className={field}
      inputMode="decimal"
      value={text}
      aria-invalid={!/^\d+(?:[.,]\d{0,2})?$/.test(text)}
      onChange={(event) => {
        const value = event.target.value
        setText(value)
        onChange(
          /^\d+(?:[.,]\d{0,2})?$/.test(value)
            ? Math.round(Number(value.replace(',', '.')) * 100)
            : -1,
        )
      }}
    />
  )
}
