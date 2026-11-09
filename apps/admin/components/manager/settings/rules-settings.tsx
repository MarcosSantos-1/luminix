'use client'

import { Button } from '@heroui/react'
import { CircleAlert, MessageSquareText, Wallet } from 'lucide-react'
import { useState } from 'react'
import { DepositSettings } from '@/components/onboarding/deposit-settings'
import { TextAreaField } from '@/components/ui/fields'
import { depositProblem } from '@/components/onboarding/deposit-policy'
import type { Payload, Service } from '@/components/onboarding/model'
import { RulesStep } from '@/components/onboarding/rules-review'
import type { FieldErrors } from '@/components/onboarding/ui'
import '@/app/c/[clinicId]/onboarding/onboarding.css'
import { useClinicApi, useClinicResource, type ClinicApi } from './clinic-api'
import { LoadError, SaveBar, SettingsCard, SettingsSkeleton, type SaveState } from './settings-kit'

type Rules = Required<
  Pick<
    Payload['preferences'],
    | 'bookingNoticeHours'
    | 'bookingWindowDays'
    | 'clientInstructions'
    | 'lateChangeRetentionPercent'
    | 'noShowRetentionPercent'
    | 'depositScope'
    | 'depositPercent'
    | 'depositThresholdCents'
  >
> & {
  cancellationHours: number
  specialCancellationHours: number
  reschedulingHours: number | null
}
type RulesResponse = { rules: Rules | null; services: Service[]; acceptInApp: boolean }

/** The onboarding components work on a Payload; only rules-related fields are filled in. */
function toPayload(name: string, data: RulesResponse, rules: Rules): Payload {
  return {
    name,
    ownerName: '',
    email: '',
    phone: '',
    clinic: {
      foundedYear: '',
      whatsapp: '',
      instagram: '',
      facebook: '',
      website: '',
      taxId: '',
      defaultAudience: 'all',
      addressLine: '',
      addressNumber: '',
      addressDistrict: '',
      addressNote: '',
      city: '',
      state: '',
      postalCode: '',
    },
    occupations: [],
    services: data.services,
    teamMode: 'solo',
    professionals: [],
    businessHours: [],
    professionalSchedules: [],
    preferences: {
      ...rules,
      acceptInApp: data.acceptInApp,
      packagePaymentMode: 'clinic_only',
    },
  } as Payload
}

function toBody(payload: Payload) {
  const p = payload.preferences
  return {
    bookingNoticeHours: p.bookingNoticeHours ?? 1,
    bookingWindowDays: p.bookingWindowDays ?? 30,
    cancellationHours: p.cancellationHours,
    specialCancellationHours: p.specialCancellationHours,
    reschedulingHours: p.reschedulingHours ?? null,
    clientInstructions: (p.clientInstructions ?? '').trim(),
    lateChangeRetentionPercent: p.lateChangeRetentionPercent ?? 0,
    noShowRetentionPercent: p.noShowRetentionPercent ?? 0,
    depositScope: p.depositScope ?? 'none',
    depositPercent: p.depositPercent ?? 20,
    depositThresholdCents: p.depositThresholdCents ?? 30000,
    services: payload.services.map((service) => ({
      id: service.id,
      depositRequired: service.depositRequired === true,
      lateChangeRetentionPercent: service.lateChangeRetentionPercent ?? null,
      noShowRetentionPercent: service.noShowRetentionPercent ?? null,
    })),
  }
}

export function RulesSettings({
  clinicId,
  clinicName,
  onOpenFinance,
}: {
  clinicId: string
  clinicName: string
  onOpenFinance: () => void
}) {
  const api = useClinicApi(clinicId)
  const resource = useClinicResource<RulesResponse>(api, 'booking-rules')
  const data = resource.data
  if (resource.error && !data)
    return <LoadError message={resource.error} onRetry={resource.reload} />
  if (!data) return <SettingsSkeleton cards={3} />
  if (!data.rules)
    return (
      <SettingsCard
        icon={<CircleAlert size={20} />}
        title="Conclua o cadastro para editar as regras"
        description="As regras são criadas na etapa Regras do cadastro inicial."
      >
        <p className="settings-muted">Assim que o cadastro for concluído, você ajusta tudo aqui.</p>
      </SettingsCard>
    )
  return (
    <RulesEditor
      api={api}
      data={data}
      initial={toPayload(clinicName, data, data.rules)}
      onOpenFinance={onOpenFinance}
    />
  )
}

function RulesEditor({
  api,
  data,
  initial,
  onOpenFinance,
}: {
  api: ClinicApi
  data: RulesResponse
  initial: Payload
  onOpenFinance: () => void
}) {
  const [payload, setPayload] = useState<Payload>(initial)
  const [saved, setSaved] = useState<Payload>(initial)
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const dirty = JSON.stringify(toBody(payload)) !== JSON.stringify(toBody(saved))
  const depositOn = (payload.preferences.depositScope ?? 'none') !== 'none'
  const change = (next: Payload) => {
    setPayload(next)
    setFieldErrors({})
    if (state.status !== 'saving') setState({ status: 'idle' })
  }

  async function save() {
    if (!payload) return
    const problem = depositProblem(payload)
    if (problem) {
      setFieldErrors({ [problem.field]: problem.message })
      setState({ status: 'error', message: problem.message })
      return
    }
    setState({ status: 'saving' })
    try {
      await api.put('booking-rules', toBody(payload))
      setSaved(payload)
      setState({ status: 'saved', message: 'Pronto! Suas regras foram atualizadas.' })
    } catch {
      setState({ status: 'error', message: 'Não foi possível salvar. Tente de novo em instantes.' })
    }
  }

  return (
    <div className="settings-stack">
      <div className="ob2 manager-ob2" data-onboarding-embed>
        <RulesStep
          payload={payload}
          setPayload={change}
          error=""
          fieldErrors={fieldErrors}
          footer={null}
        />
        <DepositSettings payload={payload} setPayload={change} fieldErrors={fieldErrors} />
      </div>
      {depositOn && !data.acceptInApp ? (
        <SettingsCard
          icon={<Wallet size={20} />}
          title="Para cobrar o sinal, ative os pagamentos pelo app"
          description="Suas escolhas ficam salvas. A cobrança só acontece quando os pagamentos pelo app estiverem ativos."
        >
          <Button variant="secondary" onPress={onOpenFinance}>
            <Wallet size={16} aria-hidden /> Abrir Financeiro
          </Button>
        </SettingsCard>
      ) : null}
      <SettingsCard
        icon={<MessageSquareText size={20} />}
        title="Recado para as clientes"
        description="Uma orientação curta mostrada na hora de agendar. Ex.: “Chegue 10 minutos antes.”"
        help={{
          title: 'Onde esse recado aparece?',
          text: 'Quando o agendamento pelo app for liberado, a cliente verá este recado antes de confirmar o horário. Use para avisos simples, como pontualidade ou cuidados antes do atendimento.',
        }}
      >
        <TextAreaField
          ariaLabel="Recado para as clientes"
          className="is-wide"
          rows={3}
          maxLength={500}
          value={payload.preferences.clientInstructions ?? ''}
          placeholder="Escreva aqui um recado (opcional)"
          onChange={(clientInstructions) =>
            change({ ...payload, preferences: { ...payload.preferences, clientInstructions } })
          }
        />
      </SettingsCard>
      <SaveBar
        dirty={dirty}
        state={state}
        onSave={() => void save()}
        onDiscard={() => {
          setPayload(saved)
          setFieldErrors({})
          setState({ status: 'idle' })
        }}
        label="Salvar regras"
      />
    </div>
  )
}
