'use client'

import { Button, Spinner, Tooltip, toast } from '@heroui/react'
import { ArrowRight } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useSpaceTheme } from '@/components/space-theme'
import { spaceTheme } from '@/lib/space-theme'
import { AppStatus } from '@/components/app-status'
import { useClinic } from '@/components/clinic-workspace'
import { OnboardingShell } from '@/components/onboarding/shell'
import {
  CatalogStep,
  ClinicStep,
  PaymentsStep,
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
import { hasDraftChanges } from '@/components/onboarding/review-persistence'
import { RulesStep, ReviewStep } from '@/components/onboarding/rules-review'
import { WelcomeStep } from '@/components/onboarding/welcome'
import { useStaff } from '@/components/staff-provider'
import { isCompletePhone } from '@/lib/phone'
import { clearSignupPhone, peekSignupPhone } from '@/lib/signup-phone'
import { untitledClinicName } from '@/lib/staff-destination'
import { isValidBrazilianTaxId } from '@/lib/tax-id'
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

const stripeRequiredMessage =
  'Conclua o cadastro Stripe e aguarde a liberação de pagamentos e repasses, ou escolha “Receber fora do app” para continuar.'

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
      homeService: false,
      addressLine: '',
      addressNumber: '',
      addressDistrict: '',
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
      bookingNoticeHours: 2,
      bookingWindowDays: 60,
      reschedulingHours: null,
      clientInstructions: '',
      cancellationHours: 12,
      specialCancellationHours: 24,
      acceptInApp: false,
      packagePaymentMode: 'clinic_only',
    },
  }
}

function normalizeService(service: Service): Service {
  const name = canonicalServiceName(service.name)
  const sensitive = serviceIsIntimate({ name, sensitive: service.sensitive })
  return {
    ...service,
    id: service.id || crypto.randomUUID(),
    name,
    audience: isAudience(service.audience) ? service.audience : 'all',
    audienceChosen: service.audienceChosen === true || !sensitive,
    sensitive,
  }
}

function normalizeProfessional(person: Professional, services: Service[]): Professional {
  const serviceNames = person.serviceNames.map((name) => canonicalServiceName(name))
  const serviceByName = new Map(
    services.map((service) => [service.name.trim().toLocaleLowerCase('pt-BR'), service]),
  )
  const serviceIds =
    person.serviceIds?.filter((id) => services.some((service) => service.id === id)) ??
    serviceNames
      .map((name) => serviceByName.get(name.trim().toLocaleLowerCase('pt-BR'))?.id)
      .filter((id): id is string => Boolean(id))
  const serviceAudiences = Object.fromEntries(
    Object.entries(person.serviceAudiences ?? {})
      .map(([reference, audience]) => {
        const service =
          services.find((item) => item.id === reference) ??
          serviceByName.get(canonicalServiceName(reference).trim().toLocaleLowerCase('pt-BR'))
        return [service?.id ?? '', audience] as const
      })
      .filter(([reference]) => Boolean(reference))
      .filter((entry): entry is [string, Audience] => isAudience(entry[1])),
  )
  return {
    ...person,
    id: person.id || crypto.randomUUID(),
    gender: person.gender === 'male' ? 'male' : 'female',
    audience: isAudience(person.audience) ? person.audience : 'all',
    serviceNames,
    serviceIds,
    serviceAudiences: Object.keys(serviceAudiences).length > 0 ? serviceAudiences : undefined,
  }
}

function normalizePayload(value: Partial<Payload>, fallback: Payload): Payload {
  const services = (value.services ?? []).map((service) => normalizeService(service))
  const clinicAudience = value.clinic?.defaultAudience
  const merged = {
    ...fallback,
    ...value,
    clinic: {
      ...fallback.clinic,
      ...(value.clinic ?? {}),
      defaultAudience: isAudience(clinicAudience) ? clinicAudience : 'all',
      homeService: value.clinic?.homeService === true,
      defaultBreak:
        value.clinic?.defaultBreak &&
        /^\d{2}:\d{2}$/.test(value.clinic.defaultBreak.start) &&
        /^\d{2}:\d{2}$/.test(value.clinic.defaultBreak.end)
          ? {
              start: value.clinic.defaultBreak.start,
              end: value.clinic.defaultBreak.end,
            }
          : undefined,
    },
    preferences: { ...fallback.preferences, ...(value.preferences ?? {}) },
    businessHours:
      value.businessHours?.length === 7
        ? value.businessHours.map((day) => ({ ...day, breaks: day.breaks ?? [] }))
        : fallback.businessHours,
    professionalSchedules: value.professionalSchedules ?? fallback.professionalSchedules,
    services,
    professionals: (value.professionals ?? fallback.professionals).map((person) =>
      normalizeProfessional(person, services),
    ),
  }
  const professionalByName = new Map(
    merged.professionals.map((person) => [person.name.trim().toLocaleLowerCase('pt-BR'), person]),
  )
  merged.professionalSchedules = (merged.professionalSchedules ?? []).map((schedule) => ({
    ...schedule,
    professionalId:
      schedule.professionalId ||
      professionalByName.get(schedule.name.trim().toLocaleLowerCase('pt-BR'))?.id ||
      '',
  }))
  return syncProfessionalSchedules(enforcePaymentPreferences(merged))
}

function payloadForApi(payload: Payload): Payload {
  const serviceNameById = new Map(payload.services.map((service) => [service.id, service.name]))
  const clinic = { ...payload.clinic }
  delete clinic.logoUrl
  return {
    ...payload,
    clinic,
    professionals: payload.professionals.map((person) => {
      const persisted = {
        ...person,
        serviceNames: person.serviceIds
          .map((id) => serviceNameById.get(id))
          .filter((name): name is string => Boolean(name)),
      }
      delete persisted.photoPreview
      delete persisted.photoUrl
      return persisted
    }),
  }
}

function teamPayload(payload: Payload, step: number): Payload {
  const enteringTeam = step === 3 && payload.teamMode === 'solo'
  const serviceNames = payload.services.map((service) => service.name).filter((name) => name.trim())
  const selectedIds = new Set(payload.services.map((service) => service.id))
  const serviceNameById = new Map(payload.services.map((service) => [service.id, service.name]))
  const sanitizedProfessionals = payload.professionals.map((person) => {
    const ids = person.serviceIds.filter((id) => selectedIds.has(id))
    const names = ids
      .map((id) => serviceNameById.get(id))
      .filter((name): name is string => Boolean(name))
    const serviceAudiences = Object.fromEntries(
      Object.entries(person.serviceAudiences ?? {}).filter(([id]) => ids.includes(id)),
    )
    return {
      ...person,
      serviceNames: names,
      serviceIds: ids,
      serviceAudiences: Object.keys(serviceAudiences).length > 0 ? serviceAudiences : undefined,
    }
  })
  if (step !== 4 && !enteringTeam) return { ...payload, professionals: sanitizedProfessionals }
  if (payload.teamMode === 'solo') {
    return syncProfessionalSchedules({
      ...payload,
      professionals: [
        {
          id: payload.professionals[0]?.id || crypto.randomUUID(),
          name: payload.ownerName.trim() || 'Você',
          role: 'Proprietária / profissional',
          gender: 'female',
          audience: payload.clinic.defaultAudience,
          serviceNames,
          serviceIds: payload.services.map((service) => service.id),
          serviceAudiences: intimateAudiencesFor(payload.services),
          photoAssetId: payload.professionals[0]?.photoAssetId,
          photoUrl: payload.professionals[0]?.photoUrl,
          photoPreview: payload.professionals[0]?.photoPreview,
        },
      ],
    })
  }
  return syncProfessionalSchedules({
    ...payload,
    professionals: sanitizedProfessionals
      .filter((person) => person.name.trim() && person.role.trim())
      .map((person) => {
        const ids = person.serviceIds.filter((id) => selectedIds.has(id))
        const names = ids
          .map((id) => serviceNameById.get(id))
          .filter((name): name is string => Boolean(name))
        const serviceAudiences = Object.fromEntries(
          Object.entries(person.serviceAudiences ?? {}).filter(([id]) => ids.includes(id)),
        )
        return {
          ...person,
          name: person.name.trim(),
          role: person.role.trim(),
          serviceNames: names,
          serviceIds: ids,
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
  const { setTheme } = useSpaceTheme()
  const staff = useStaff()
  const router = useRouter()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [editingFromReview, setEditingFromReview] = useState(false)
  const [step, setStep] = useState(0)
  const [availableThrough, setAvailableThrough] = useState(0)
  useEffect(() => {
    const heading = document.getElementById('onboarding-title')
    heading?.focus({ preventScroll: true })
    heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [step])

  const [stepError, setStepError] = useState('')
  const [stripeReady, setStripeReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)
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
        if (data.draft.formatVersion !== 3) throw new Error()
        const fallback = emptyPayload(
          untitledClinicName(String(data.draft.payload.name || clinic.name))
            ? ''
            : String(data.draft.payload.name || clinic.name),
          data.draft.payload.email || user.email || '',
          data.draft.payload.ownerName || user.displayName || '',
        )
        const next = normalizePayload(data.draft.payload, fallback)
        if (untitledClinicName(next.name)) next.name = ''
        if (!next.ownerName.trim()) next.ownerName = user.displayName?.trim() || ''
        if (!next.email.trim()) next.email = user.email?.trim() || ''
        if (!next.clinic.taxIdKind) next.clinic.taxIdKind = 'cnpj'
        if (!next.phone) {
          const signupPhone = peekSignupPhone(user.uid)
          if (signupPhone) {
            next.phone = signupPhone
            if (!next.clinic.whatsapp) next.clinic.whatsapp = signupPhone
          }
        }
        next.clinic.theme = spaceTheme(next.clinic.theme ?? clinic.theme)
        setPayload(next)
        setDraft({ ...data.draft, payload: next })
        setLoadError('')
        const stored = data.draft.step
        const focus = data.draft.payload.uiFocus
        const resumedStep = Math.max(0, resumeStepIndex(stored, focus))
        setStep(resumedStep)
        setAvailableThrough(resumedStep)
      } catch {
        if (!controller.signal.aborted)
          setLoadError('Não foi possível carregar seu cadastro. Tente novamente.')
      }
    })()
    return () => controller.abort()
  }, [staff.user, clinic.id, clinic.name, clinic.theme, staff.revision, permissions, retry])

  useEffect(() => {
    if (payload) setTheme(spaceTheme(payload.clinic.theme))
  }, [payload, setTheme])

  function validateStep(targetStep: number) {
    if (!payload) return 'Cadastro indisponível.'
    if (targetStep === 1 && !payload.name.trim()) return 'Informe o nome da clínica ou estúdio.'
    if (targetStep === 1 && !payload.ownerName.trim())
      return 'Informe o nome da pessoa responsável pela clínica.'
    if (targetStep === 1 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim()))
      return 'Informe um e-mail de contato válido.'
    if (targetStep === 1 && !isCompletePhone(payload.phone))
      return 'Informe o celular com DDD usado no cadastro.'
    if (
      targetStep === 1 &&
      payload.clinic.taxId.trim() &&
      !isValidBrazilianTaxId(
        payload.clinic.taxIdKind === 'cpf' ? 'cpf' : 'cnpj',
        payload.clinic.taxId,
      )
    )
      return `O ${payload.clinic.taxIdKind === 'cpf' ? 'CPF' : 'CNPJ'} informado é inválido. Corrija ou deixe o campo vazio.`
    if (targetStep === 2 && payload.services.length === 0)
      return 'Escolha pelo menos um serviço para abrir sua agenda.'
    if (
      targetStep === 3 &&
      payload.services.some(
        (service) => !service.name.trim() || service.durationMinutes < 1 || service.priceCents < 0,
      )
    )
      return 'Revise nome, duração e valor dos serviços.'
    if (
      targetStep === 4 &&
      payload.teamMode === 'solo' &&
      payload.services.some(
        (service) => serviceIsIntimate(service) && service.audienceChosen !== true,
      )
    )
      return 'Escolha o público de cada atendimento íntimo para continuar.'
    if (targetStep === 4 && payload.teamMode === 'team') {
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
    if (stepInfo[targetStep]?.key === 'schedule') {
      const postal = payload.clinic.postalCode.replace(/\D/g, '')
      if (payload.clinic.postalCode.trim() && postal.length !== 8)
        return 'Informe o CEP completo ou deixe em branco para completar depois.'
      if (payload.clinic.state.trim() && !/^[A-Z]{2}$/.test(payload.clinic.state))
        return 'Use a sigla do estado com duas letras (ex.: SP).'
    }
    if (stepInfo[targetStep]?.key === 'hours') return validateClinicAndProfessionalHours(payload)
    if (stepInfo[targetStep]?.key === 'payments' && payload.preferences.acceptInApp && !stripeReady)
      return stripeRequiredMessage
    if (stepInfo[targetStep]?.key === 'rules' && !payload.preferences.acceptInApp) {
      if (payload.preferences.packagePaymentMode !== 'clinic_only')
        return 'Com recebimento fora do app, pacotes ficam somente na clínica.'
    }
    return ''
  }

  function firstProblem(throughStep: number) {
    for (
      let candidate = 1;
      candidate <= Math.min(throughStep, stepInfo.length - 2);
      candidate += 1
    ) {
      const message = validateStep(candidate)
      if (message) return { step: candidate, message }
    }
    return null
  }

  function navigateTo(targetStep: number) {
    const minimumStep = 0
    if (busy || uploadingMedia || targetStep < minimumStep || targetStep > availableThrough) return
    const problem = targetStep > step ? firstProblem(targetStep - 1) : null
    if (problem) {
      setStep(problem.step)
      setStepError(problem.message)
      notifyError(problem.message)
      return
    }
    setStepError('')
    setStep(targetStep)
  }

  async function save(nextStep: number) {
    const user = staff.user
    if (!user || !payload || !draft || busy || uploadingMedia) return
    const problem = nextStep > step ? firstProblem(step) : null
    if (problem) {
      setStep(problem.step)
      setStepError(problem.message)
      notifyError(problem.message)
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
          body?.error === 'Stripe onboarding incomplete'
            ? stripeRequiredMessage
            : body?.error === 'Stripe verification unavailable'
              ? 'Não foi possível confirmar a conta Stripe. Volte a Pagamentos para tentar novamente ou escolher receber fora do app.'
              : body?.error === 'Invalid onboarding data'
                ? 'Algum campo do cadastro não passou na validação. Revise contato, endereço e equipe.'
                : body?.error === 'Invalid draft'
                  ? 'O servidor ainda não reconhece esta etapa. Rode as migrations da API (pnpm db:migrate).'
                  : ''
        const message = body?.error?.startsWith('Stripe ')
          ? detail
          : response.status === 409
            ? 'Este cadastro mudou em outra aba. Recarregue para continuar.'
            : detail || 'Não foi possível salvar esta etapa.'
        if (body?.error?.startsWith('Stripe ')) {
          setStripeReady(false)
          setStep(7)
        }
        setStepError(message)
        notifyError(message)
        return
      }
      const data: { draft: Draft } = await response.json()
      setPayload(payloadToSave)
      setDraft(data.draft)
      setStep(nextStep)
      if (nextKey === 'review') setEditingFromReview(false)
      setAvailableThrough((current) => Math.max(current, nextStep))
      setStepError('')
      if (isCompletePhone(payloadToSave.phone)) clearSignupPhone(user.uid)
    } catch {
      notifyError('Sem conexão para salvar. Seus campos continuam nesta tela.')
    } finally {
      setBusy(false)
    }
  }

  async function complete() {
    const user = staff.user
    if (!user || !payload || !draft || busy || uploadingMedia) return
    const problem = firstProblem(stepInfo.length - 2)
    if (problem) {
      setStep(problem.step)
      setStepError(problem.message)
      notifyError(problem.message)
      return
    }
    setBusy(true)
    try {
      // The review may have been reached through the sidebar after an edit.
      // Persist the exact reviewed payload before completing with its returned version.
      const reviewed = payloadForApi(syncProfessionalSchedules(teamPayload(payload, 4)))
      let completionVersion = draft.version
      if (hasDraftChanges(reviewed, draft.payload)) {
        const saved = await fetch(`/api/clinics/${clinic.id}/onboarding`, {
          method: 'PUT',
          headers: {
            authorization: `Bearer ${await user.getIdToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ version: draft.version, step: 'review', payload: reviewed }),
          cache: 'no-store',
          signal: AbortSignal.timeout(20_000),
        })
        if (!saved.ok) {
          const message =
            saved.status === 409
              ? 'Este cadastro mudou em outra aba. Recarregue antes de concluir.'
              : 'Não foi possível salvar seus últimos ajustes. Confira as etapas e tente novamente.'
          setStepError(message)
          notifyError(message)
          return
        }
        const data: { draft: Draft } = await saved.json()
        completionVersion = data.draft.version
        setDraft(data.draft)
      }
      const response = await fetch(`/api/clinics/${clinic.id}/onboarding/complete`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version: completionVersion }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const message =
          body?.error === 'Stripe onboarding incomplete'
            ? stripeRequiredMessage
            : body?.error === 'Stripe verification unavailable'
              ? 'Não foi possível confirmar a Stripe. Volte a Pagamentos para tentar novamente ou escolher receber fora do app.'
              : response.status === 409
                ? 'O cadastro mudou. Recarregue e confira o resumo.'
                : 'Ainda há um dado inconsistente. Use “Editar” no resumo ou escolha a etapa na lateral.'
        setStepError(message)
        notifyError(message)
        return
      }
      staff.refresh()
      router.push(`/c/${clinic.share_code || clinic.id}`)
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
          <Button
            className="ob2-cta"
            onPress={() => router.push(`/c/${clinic.share_code || clinic.id}`)}
          >
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
  const locked = busy || uploadingMedia
  const stripeBlocked = step === 7 && ready.preferences.acceptInApp && !stripeReady
  const footer: ReactNode = (
    <Tooltip isDisabled={!stripeBlocked}>
      <Tooltip.Trigger
        className="w-full"
        tabIndex={stripeBlocked ? 0 : undefined}
        aria-label={stripeBlocked ? stripeRequiredMessage : undefined}
      >
        <Button
          className="ob2-cta"
          fullWidth
          isDisabled={locked || stripeBlocked}
          onPress={() =>
            last ? void complete() : void save(editingFromReview ? stepInfo.length - 1 : step + 1)
          }
        >
          {uploadingMedia
            ? 'Enviando imagem…'
            : busy
              ? last
                ? 'Criando sua clínica…'
                : 'Salvando…'
              : last
                ? 'Abrir minha clínica'
                : editingFromReview
                  ? 'Salvar e voltar ao resumo'
                  : 'Continuar'}
          {busy ? <Spinner size="sm" /> : <ArrowRight size={18} />}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content className="max-w-xs">{stripeRequiredMessage}</Tooltip.Content>
    </Tooltip>
  )
  const updatePayload = (value: Payload) => {
    if (busy) return
    setStepError('')
    setPayload(value)
  }
  const stepProps = { payload: ready, setPayload: updatePayload, error: stepError, footer }

  return (
    <OnboardingShell
      step={step}
      availableThrough={availableThrough}
      busy={locked}
      onBack={() => navigateTo(step - 1)}
      onSelectStep={navigateTo}
    >
      {step === 1 && <ClinicStep {...stepProps} onUploadingChange={setUploadingMedia} />}
      {step === 2 && <CatalogStep {...stepProps} />}
      {step === 3 && <ServicesStep {...stepProps} />}
      {step === 4 && <TeamStep {...stepProps} onUploadingChange={setUploadingMedia} />}
      {step === 5 && <ScheduleStep {...stepProps} />}
      {step === 6 && <HoursStep {...stepProps} />}
      {step === 7 && (
        <PaymentsStep
          clinicId={clinic.share_code || clinic.id}
          onReadyChange={setStripeReady}
          {...stepProps}
        />
      )}
      {step === 8 && <RulesStep {...stepProps} />}
      {step === 9 && (
        <ReviewStep
          payload={ready}
          error={stepError}
          footer={footer}
          isDisabled={locked}
          onEdit={(target) => {
            setEditingFromReview(true)
            navigateTo(target)
          }}
        />
      )}
    </OnboardingShell>
  )
}
