'use client'

import { Button } from '@heroui/react'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AppStatus } from '@/components/app-status'
import { useClinic } from '@/components/clinic-workspace'
import { OnboardingShell } from '@/components/onboarding/shell'
import {
  CatalogStep,
  ClinicStep,
  ContactStep,
  PreferencesStep,
  ReviewStep,
  HoursStep,
  ScheduleStep,
  ServicesStep,
  TeamStep,
} from '@/components/onboarding/steps'
import { useStaff } from '@/components/staff-provider'
import { formatBrPhone, isCompletePhone } from '@/lib/phone'
import { untitledClinicName } from '@/lib/staff-destination'
import { persistedStepKey, stepInfo, type Draft, type Payload } from '@/components/onboarding/model'
import './onboarding.css'

function emptyPayload(name: string, email: string, ownerName: string): Payload {
  return {
    name,
    ownerName,
    email,
    phone: '',
    clinic: {
      foundedYear: '',
      whatsapp: '',
      instagram: '',
      facebook: '',
      website: '',
      taxId: '',
      taxIdKind: 'cpf',
      addressLine: '',
      addressNumber: '',
      addressNote: '',
      city: '',
      state: '',
      postalCode: '',
    },
    occupations: [],
    services: [],
    teamMode: 'solo',
    professionals: [],
    businessHours: [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
      weekday,
      enabled: weekday > 0 && weekday < 6,
      start: '09:00',
      end: weekday === 6 ? '13:00' : '18:00',
    })),
    preferences: {
      cancellationHours: 12,
      specialCancellationHours: 24,
      acceptInApp: false,
      packagePaymentMode: 'clinic_only',
    },
  }
}

function normalizePayload(value: Partial<Payload>, fallback: Payload): Payload {
  return {
    ...fallback,
    ...value,
    clinic: { ...fallback.clinic, ...(value.clinic ?? {}) },
    preferences: { ...fallback.preferences, ...(value.preferences ?? {}) },
    businessHours: value.businessHours?.length === 7 ? value.businessHours : fallback.businessHours,
    services: value.services ?? [],
    professionals: value.professionals ?? [],
  }
}

export default function OnboardingPage() {
  const { clinic, permissions } = useClinic()
  const staff = useStaff()
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [step, setStep] = useState(0)
  const [phoneText, setPhoneText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [glass, setGlass] = useState(true)

  useEffect(() => {
    const user = staff.user
    if (!user || !permissions.includes('onboarding:manage')) return
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
        if (data.draft.formatVersion !== 2) throw new Error()
        const fallback = emptyPayload(
          untitledClinicName(String(data.draft.payload.name || clinic.name))
            ? ''
            : String(data.draft.payload.name || clinic.name),
          data.draft.payload.email || user.email || '',
          data.draft.payload.ownerName || user.displayName || '',
        )
        const next = normalizePayload(data.draft.payload, fallback)
        setPayload(next)
        setPhoneText(next.phone ? formatBrPhone(next.phone) : '')
        setDraft({ ...data.draft, payload: next })
        const stored = data.draft.step
        const focus = data.draft.payload.uiFocus
        const index =
          stored === 'schedule' && focus === 'hours'
            ? stepInfo.findIndex((item) => item.key === 'hours')
            : stepInfo.findIndex((item) => item.key === stored)
        setStep(Math.max(0, index))
      } catch {
        if (!controller.signal.aborted)
          setError('Não foi possível carregar seu cadastro. Tente novamente.')
      }
    })()
    return () => controller.abort()
  }, [staff.user, clinic.id, clinic.name, staff.revision, permissions, retry])

  function validateCurrent() {
    if (!payload) return 'Cadastro indisponível.'
    if (
      step === 0 &&
      (!payload.ownerName.trim() || !payload.email.includes('@') || !isCompletePhone(payload.phone))
    )
      return 'Preencha nome, e-mail e celular com DDD.'
    if (step === 1 && !payload.name.trim()) return 'Informe o nome da clínica ou estúdio.'
    if (step === 2 && payload.services.length === 0)
      return 'Escolha pelo menos um serviço para abrir sua agenda.'
    if (
      step === 3 &&
      payload.services.some(
        (service) => !service.name.trim() || service.durationMinutes < 1 || service.priceCents < 0,
      )
    )
      return 'Revise nome, duração e valor dos serviços.'
    if (step === 4 && payload.teamMode === 'team' && payload.professionals.length === 0)
      return 'Adicione ao menos uma profissional ou marque “somente eu”.'
    if (
      stepInfo[step]?.key === 'hours' &&
      payload.businessHours.filter((day) => day.enabled).some((day) => day.start >= day.end)
    )
      return 'O horário de encerramento deve ser depois da abertura.'
    return ''
  }

  async function save(nextStep: number, exit = false) {
    const user = staff.user
    if (!user || !payload || !draft || busy) return
    const problem = validateCurrent()
    if (nextStep > step && problem) {
      setError(problem)
      return
    }
    const nextKey = stepInfo[nextStep].key
    const payloadToSave: Payload = {
      ...(step === 4 && payload.teamMode === 'solo'
        ? {
            ...payload,
            professionals: [
              {
                name: payload.ownerName,
                role: 'Proprietária / profissional',
                audience: 'all',
                serviceNames: payload.services.map((service) => service.name),
              },
            ],
          }
        : payload),
      uiFocus: nextKey === 'hours' ? 'hours' : nextKey === 'schedule' ? 'address' : undefined,
    }
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/clinics/${clinic.id}/onboarding`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: draft.version,
          step: persistedStepKey(stepInfo[nextStep].key),
          payload: payloadToSave,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'Este cadastro mudou em outra aba. Recarregue para continuar.'
            : 'Não foi possível salvar esta etapa.',
        )
        return
      }
      const data: { draft: Draft } = await response.json()
      setPayload(payloadToSave)
      setDraft(data.draft)
      setStep(nextStep)
      if (exit) router.push(`/clinics/${clinic.id}`)
    } catch {
      setError('Sem conexão para salvar. Seus campos continuam nesta tela.')
    } finally {
      setBusy(false)
    }
  }

  async function complete() {
    const user = staff.user
    if (!user || !draft || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/clinics/${clinic.id}/onboarding/complete`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version: draft.version }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'O cadastro mudou. Recarregue e confira o resumo.'
            : 'Não foi possível concluir. Revise os dados obrigatórios.',
        )
        return
      }
      staff.refresh()
      router.push(`/clinics/${clinic.id}`)
    } catch {
      setError('A resposta não chegou. Pode tentar novamente sem risco de duplicar a clínica.')
    } finally {
      setBusy(false)
    }
  }

  if (!permissions.includes('onboarding:manage'))
    return <AppStatus alert>Você não tem acesso ao onboarding.</AppStatus>
  if (clinic.status === 'active')
    return (
      <AppStatus
        action={
          <Button className="ob2-cta" onPress={() => router.push(`/clinics/${clinic.id}`)}>
            Ir para a clínica
          </Button>
        }
      >
        Onboarding concluído.
      </AppStatus>
    )
  if (!payload || !draft)
    return error ? (
      <AppStatus
        alert
        action={
          <Button
            className="ob2-cta"
            onPress={() => {
              setError('')
              setRetry((value) => value + 1)
            }}
          >
            Tentar novamente
          </Button>
        }
      >
        {error}
      </AppStatus>
    ) : (
      <AppStatus />
    )

  const ready = payload
  const last = step === stepInfo.length - 1
  const footer: ReactNode = (
    <Button
      className="ob2-cta"
      fullWidth
      isDisabled={busy}
      onPress={() => (last ? void complete() : void save(step + 1))}
    >
      {busy ? (last ? 'Criando sua clínica…' : 'Salvando…') : last ? 'Abrir minha clínica' : 'Continuar'}
      <ArrowRight size={18} />
    </Button>
  )
  const stepProps = { payload: ready, setPayload, error, footer }

  return (
    <OnboardingShell
      glass={glass}
      onToggleGlass={() => setGlass((value) => !value)}
      step={step}
      busy={busy}
      onBack={() => void save(step - 1)}
      onSelectStep={(index) => void save(index)}
      onExit={() => void save(step, true)}
    >
      {step === 0 && (
        <ContactStep {...stepProps} phoneText={phoneText} setPhoneText={setPhoneText} />
      )}
      {step === 1 && <ClinicStep {...stepProps} />}
      {step === 2 && <CatalogStep {...stepProps} />}
      {step === 3 && <ServicesStep {...stepProps} />}
      {step === 4 && <TeamStep {...stepProps} />}
      {step === 5 && <ScheduleStep {...stepProps} />}
      {step === 6 && <HoursStep {...stepProps} />}
      {step === 7 && <PreferencesStep {...stepProps} />}
      {step === 8 && <ReviewStep payload={ready} error={error} footer={footer} />}
    </OnboardingShell>
  )
}
