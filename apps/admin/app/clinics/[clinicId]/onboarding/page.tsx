'use client'

import { Button, toast } from '@heroui/react'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AppStatus } from '@/components/app-status'
import { useClinic } from '@/components/clinic-workspace'
import { OnboardingShell } from '@/components/onboarding/shell'
import {
  CatalogStep,
  ClinicStep,
  PaymentsStep,
  RulesStep,
  ReviewStep,
  HoursStep,
  ScheduleStep,
  ServicesStep,
  TeamStep,
} from '@/components/onboarding/steps'
import {
  defaultWeekSchedule,
  enforcePaymentPreferences,
  syncProfessionalSchedules,
  validateClinicAndProfessionalHours,
} from '@/components/onboarding/schedule-sync'
import { WelcomeStep } from '@/components/onboarding/welcome'
import { useStaff } from '@/components/staff-provider'
import { isCompletePhone } from '@/lib/phone'
import { clearSignupPhone, peekSignupPhone } from '@/lib/signup-phone'
import { untitledClinicName } from '@/lib/staff-destination'
import {
  canonicalServiceName,
  serviceIsIntimate,
  intimateAudiencesFor,
  isAudience,
  persistedStepKey,
  resumeStepIndex,
  stepInfo,
  uiFocusForStepKey,
  type Audience,
  type Draft,
  type Payload,
  type Professional,
  type Service,
} from '@/components/onboarding/model'
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
      taxIdKind: 'cnpj',
      defaultAudience: 'all',
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
    businessHours: defaultWeekSchedule(),
    professionalSchedules: [],
    preferences: {
      cancellationHours: 12,
      specialCancellationHours: 24,
      acceptInApp: false,
      packagePaymentMode: 'clinic_only',
    },
  }
}

function normalizeService(service: Service): Service {
  const name = canonicalServiceName(service.name)
  return {
    ...service,
    name,
    audience: isAudience(service.audience) ? service.audience : 'all',
    sensitive: serviceIsIntimate({ name, sensitive: service.sensitive }),
  }
}

function normalizeProfessional(person: Professional): Professional {
  const serviceNames = person.serviceNames.map((name) => canonicalServiceName(name))
  const serviceAudiences = Object.fromEntries(
    Object.entries(person.serviceAudiences ?? {})
      .map(([name, audience]) => [canonicalServiceName(name), audience] as const)
      .filter((entry): entry is [string, Audience] => isAudience(entry[1])),
  )
  return {
    ...person,
    gender: person.gender === 'male' ? 'male' : 'female',
    audience: isAudience(person.audience) ? person.audience : 'all',
    serviceNames,
    serviceAudiences: Object.keys(serviceAudiences).length > 0 ? serviceAudiences : undefined,
  }
}

function normalizePayload(value: Partial<Payload>, fallback: Payload): Payload {
  const clinicAudience = value.clinic?.defaultAudience
  const merged = {
    ...fallback,
    ...value,
    clinic: {
      ...fallback.clinic,
      ...(value.clinic ?? {}),
      defaultAudience: isAudience(clinicAudience) ? clinicAudience : 'all',
    },
    preferences: { ...fallback.preferences, ...(value.preferences ?? {}) },
    businessHours:
      value.businessHours?.length === 7
        ? value.businessHours.map((day) => ({ ...day, breaks: day.breaks ?? [] }))
        : fallback.businessHours,
    professionalSchedules: value.professionalSchedules ?? fallback.professionalSchedules,
    services: (value.services ?? []).map((service) => normalizeService(service)),
    professionals: (value.professionals ?? fallback.professionals).map((person) =>
      normalizeProfessional(person),
    ),
  }
  return syncProfessionalSchedules(enforcePaymentPreferences(merged))
}

function payloadForApi(payload: Payload): Payload {
  return {
    ...payload,
    professionals: payload.professionals.map(({ photoPreview: _photo, ...person }) => person),
  }
}

function teamPayload(payload: Payload, step: number): Payload {
  const enteringTeam = step === 3 && payload.teamMode === 'solo'
  if (step !== 4 && !enteringTeam) return payload
  const serviceNames = payload.services.map((service) => service.name).filter((name) => name.trim())
  if (payload.teamMode === 'solo') {
    return syncProfessionalSchedules({
      ...payload,
      professionals: [
        {
          name: payload.ownerName.trim() || 'Você',
          role: 'Proprietária / profissional',
          gender: 'female',
          audience: payload.clinic.defaultAudience,
          serviceNames,
          serviceAudiences: intimateAudiencesFor(payload.services),
        },
      ],
    })
  }
  const selected = new Set(serviceNames)
  return syncProfessionalSchedules({
    ...payload,
    professionals: payload.professionals
      .filter((person) => person.name.trim() && person.role.trim())
      .map((person) => {
        const names = person.serviceNames.filter((name) => name.trim() && selected.has(name))
        const serviceAudiences = Object.fromEntries(
          Object.entries(person.serviceAudiences ?? {}).filter(([name]) => names.includes(name)),
        )
        return {
          ...person,
          name: person.name.trim(),
          role: person.role.trim(),
          serviceNames: names,
          serviceAudiences: Object.keys(serviceAudiences).length > 0 ? serviceAudiences : undefined,
        }
      }),
  })
}

function notifyError(message: string) {
  toast.danger(message, { timeout: 5000 })
}

export default function OnboardingPage() {
  const { clinic, permissions } = useClinic()
  const staff = useStaff()
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)

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
        if (untitledClinicName(next.name)) next.name = ''
        if (!next.clinic.taxIdKind) next.clinic.taxIdKind = 'cnpj'
        if (!next.phone) {
          const signupPhone = peekSignupPhone(user.uid)
          if (signupPhone) {
            next.phone = signupPhone
            if (!next.clinic.whatsapp) next.clinic.whatsapp = signupPhone
          }
        }
        setPayload(next)
        setDraft({ ...data.draft, payload: next })
        setLoadError('')
        const stored = data.draft.step
        const focus = data.draft.payload.uiFocus
        setStep(Math.max(0, resumeStepIndex(stored, focus)))
      } catch {
        if (!controller.signal.aborted)
          setLoadError('Não foi possível carregar seu cadastro. Tente novamente.')
      }
    })()
    return () => controller.abort()
  }, [staff.user, clinic.id, clinic.name, staff.revision, permissions, retry])

  function validateCurrent() {
    if (!payload) return 'Cadastro indisponível.'
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
    if (step === 4 && payload.teamMode === 'team') {
      if (payload.professionals.length === 0)
        return 'Adicione ao menos uma profissional ou marque “somente eu”.'
      if (
        payload.professionals.some(
          (person) =>
            !person.name.trim() ||
            !person.role.trim() ||
            (person.gender !== 'female' && person.gender !== 'male'),
        )
      )
        return 'Informe nome, função e sexo de cada profissional para continuar.'
    }
    if (stepInfo[step]?.key === 'schedule') {
      const postal = payload.clinic.postalCode.replace(/\D/g, '')
      if (payload.clinic.postalCode.trim() && postal.length !== 8)
        return 'Informe o CEP completo ou deixe em branco para completar depois.'
      if (payload.clinic.state.trim() && !/^[A-Z]{2}$/.test(payload.clinic.state))
        return 'Use a sigla do estado com duas letras (ex.: SP).'
    }
    if (stepInfo[step]?.key === 'hours') return validateClinicAndProfessionalHours(payload)
    if (stepInfo[step]?.key === 'rules' && !payload.preferences.acceptInApp) {
      if (payload.preferences.packagePaymentMode !== 'clinic_only')
        return 'Com recebimento fora do app, pacotes ficam somente na clínica.'
    }
    return ''
  }

  async function save(nextStep: number) {
    const user = staff.user
    if (!user || !payload || !draft || busy) return
    const problem = validateCurrent()
    if (nextStep > step && problem) {
      notifyError(problem)
      return
    }
    const nextKey = stepInfo[nextStep].key
    let payloadToSave: Payload = syncProfessionalSchedules(teamPayload(payload, step))
    if (stepInfo[step]?.key === 'payments' || nextKey === 'rules') {
      payloadToSave = enforcePaymentPreferences(payloadToSave)
    }
    payloadToSave = {
      ...payloadToSave,
      uiFocus: uiFocusForStepKey(nextKey),
    }
    setBusy(true)
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
          payload: payloadForApi(payloadToSave),
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        const detail =
          body?.error === 'Invalid onboarding data'
            ? 'Algum campo do cadastro não passou na validação. Revise contato, endereço e equipe.'
            : body?.error === 'Invalid draft'
              ? 'O servidor ainda não reconhece esta etapa. Rode as migrations da API (pnpm db:migrate).'
              : ''
        notifyError(
          response.status === 409
            ? 'Este cadastro mudou em outra aba. Recarregue para continuar.'
            : detail || 'Não foi possível salvar esta etapa.',
        )
        return
      }
      const data: { draft: Draft } = await response.json()
      setPayload(payloadToSave)
      setDraft(data.draft)
      setStep(nextStep)
      if (isCompletePhone(payloadToSave.phone)) clearSignupPhone(user.uid)
    } catch {
      notifyError('Sem conexão para salvar. Seus campos continuam nesta tela.')
    } finally {
      setBusy(false)
    }
  }

  async function complete() {
    const user = staff.user
    if (!user || !draft || busy) return
    const problem = validateCurrent()
    if (problem) {
      notifyError(problem)
      return
    }
    setBusy(true)
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
        notifyError(
          response.status === 409
            ? 'O cadastro mudou. Recarregue e confira o resumo.'
            : 'Não foi possível concluir. Revise os dados obrigatórios.',
        )
        return
      }
      staff.refresh()
      router.push(`/clinics/${clinic.id}`)
    } catch {
      notifyError('A resposta não chegou. Pode tentar novamente sem risco de duplicar a clínica.')
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
    return loadError ? (
      <AppStatus
        alert
        action={
          <Button
            className="ob2-cta"
            onPress={() => {
              setLoadError('')
              setRetry((value) => value + 1)
            }}
          >
            Tentar novamente
          </Button>
        }
      >
        {loadError}
      </AppStatus>
    ) : (
      <AppStatus scene="onboarding" />
    )

  const ready = payload
  if (step === 0) return <WelcomeStep busy={busy} onStart={() => void save(1)} />

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
  const stepProps = { payload: ready, setPayload, error: '', footer }

  return (
    <OnboardingShell
      step={step}
      busy={busy}
      onBack={() => void save(step - 1)}
      onSelectStep={(index) => void save(index)}
    >
      {step === 1 && <ClinicStep {...stepProps} />}
      {step === 2 && <CatalogStep {...stepProps} />}
      {step === 3 && <ServicesStep {...stepProps} />}
      {step === 4 && <TeamStep {...stepProps} />}
      {step === 5 && <ScheduleStep {...stepProps} />}
      {step === 6 && <HoursStep {...stepProps} />}
      {step === 7 && <PaymentsStep clinicId={clinic.id} {...stepProps} />}
      {step === 8 && <RulesStep {...stepProps} />}
      {step === 9 && <ReviewStep payload={ready} error="" footer={footer} />}
    </OnboardingShell>
  )
}
