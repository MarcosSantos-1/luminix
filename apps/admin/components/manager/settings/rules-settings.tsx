'use client'

import {
  CalendarClock,
  CircleAlert,
  CircleHelp,
  Eye,
  HandCoins,
  QrCode,
  RotateCcw,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CheckboxField, SelectField, TextInputField } from '@/components/ui/fields'
import {
  depositProblem,
  isSpecialService,
  normalizeLegacyDepositScope,
  setServicesDeposit,
  withDepositEnabled,
} from '@/components/onboarding/deposit-policy'
import {
  sinalOutcome,
  sinalOutcomeOptions,
  withSinalOutcome,
} from '@/components/onboarding/attendance-policy'
import type { Payload, Service } from '@/components/onboarding/model'
import { money } from '../business/format'
import { Button } from '@heroui/react'
import { DepositPixExplainer } from '@/components/onboarding/deposit-pix-explainer'
import '@/components/onboarding/deposit-settings.css'
import { QuickModal } from '../quick-modal'
import {
  detectPixKeyType,
  formatPixKey,
  pixKeyLabels,
  pixKeyProblem,
  type PixKeyType,
} from '@/lib/pix-key'
import { ClinicApiError, useClinicApi, useClinicResource, type ClinicApi } from './clinic-api'
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
type Pix = { keyType: PixKeyType | null; key: string; holderName: string; holdMinutes: number }
type RulesResponse = {
  rules: Rules | null
  services: Service[]
  acceptInApp: boolean
  pix?: Pix
}

/** The deposit helpers of the onboarding work on a Payload; only the rules fields are filled. */
function toPayload(name: string, data: RulesResponse, rules: Rules): Payload {
  return normalizeLegacyDepositScope({
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
    preferences: { ...rules, acceptInApp: data.acceptInApp, packagePaymentMode: 'clinic_only' },
  } as Payload)
}

function toBody(payload: Payload, pix: Pix) {
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
    pix: {
      keyType: pix.key.trim() ? pix.keyType : null,
      key: pix.key.trim(),
      holderName: pix.holderName.trim(),
      holdMinutes: pix.holdMinutes,
    },
  }
}

const hoursLabel = (hours: number) =>
  hours === 0 ? 'Na hora' : hours < 24 || hours % 24 ? `${hours} h` : `${hours / 24} d`
const holdLabel = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : minutes % 60 ? `${minutes / 60} h` : `${minutes / 60} h`

const pixTypes: { id: PixKeyType; label: string; placeholder: string }[] = [
  { id: 'cpf', label: 'CPF', placeholder: '000.000.000-00' },
  { id: 'cnpj', label: 'CNPJ', placeholder: '00.000.000/0000-00' },
  { id: 'email', label: 'E-mail', placeholder: 'pix@seuespaco.com' },
  { id: 'phone', label: 'Celular', placeholder: '(11) 99999-9999' },
  { id: 'random', label: 'Chave aleatória', placeholder: '123e4567-e89b-…' },
]

/** One choice among a few values, as glass chips. The current value is kept even if unusual. */
function Chips<T extends number | string | null>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const list = options.some((option) => option.value === value)
    ? options
    : [...options, { value, label: typeof value === 'number' ? String(value) : 'Atual' }]
  return (
    <div className="team-choice rules-chips" role="radiogroup" aria-label={label}>
      {list.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A rule as a short sentence on the left and its value on the right. */
function Line({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rules-line">
      <div className="rules-line-copy">
        <strong>{title}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
      {children}
    </div>
  )
}

export function RulesSettings({
  clinicId,
  clinicName,
}: {
  clinicId: string
  clinicName: string
  paymentsHref?: string
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
      initial={toPayload(clinicName, data, data.rules)}
      acceptInApp={data.acceptInApp}
      initialPix={
        data.pix
          ? { ...data.pix, key: formatPixKey(data.pix.keyType, data.pix.key) }
          : { keyType: null, key: '', holderName: '', holdMinutes: 120 }
      }
    />
  )
}

function RulesEditor({
  api,
  initial,
  initialPix,
  acceptInApp,
}: {
  api: ClinicApi
  initial: Payload
  initialPix: Pix
  /** Payments in the app (Stripe): the deposit is paid there, no Pix key. */
  acceptInApp: boolean
}) {
  const [explain, setExplain] = useState(false)
  const [payload, setPayload] = useState<Payload>(initial)
  const [pix, setPix] = useState<Pix>(initialPix)
  // Chosen in the list: typing no longer changes the type.
  const [typeLocked, setTypeLocked] = useState(Boolean(initialPix.keyType))
  const [saved, setSaved] = useState({ payload: initial, pix: initialPix })
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [problem, setProblem] = useState<{ field: string; message: string } | null>(null)

  const p = payload.preferences
  const dirty =
    JSON.stringify(toBody(payload, pix)) !== JSON.stringify(toBody(saved.payload, saved.pix))
  const depositOn = (p.depositScope ?? 'none') !== 'none'
  const percent = p.depositPercent ?? 30
  const priced = payload.services.filter(
    (service) => service.priceType === 'fixed' && service.priceCents > 0,
  )
  const withDeposit = priced.filter((service) => service.depositRequired)
  const hasSpecial = payload.services.some(isSpecialService)
  const example = withDeposit[0] ?? priced[0]
  const outcome = sinalOutcome(payload)
  const keyType = pixTypes.find((item) => item.id === pix.keyType)

  const change = (next: Payload) => {
    setPayload(next)
    setProblem(null)
    if (state.status !== 'saving') setState({ status: 'idle' })
  }
  const prefs = (patch: Partial<Payload['preferences']>) =>
    change({ ...payload, preferences: { ...p, ...patch } })
  const changePix = (patch: Partial<Pix>) => {
    setPix({ ...pix, ...patch })
    setProblem(null)
    if (state.status !== 'saving') setState({ status: 'idle' })
  }

  async function save() {
    const found =
      depositProblem(payload) ??
      (depositOn && !acceptInApp && (!pix.keyType || !pix.key.trim())
        ? { field: 'pix', message: 'Informe a chave Pix que vai receber o sinal.' }
        : null) ??
      (!acceptInApp && pix.key.trim() && pixKeyProblem(pix.keyType, pix.key)
        ? { field: 'pix', message: pixKeyProblem(pix.keyType, pix.key)! }
        : null)
    if (found) {
      setProblem(found)
      setState({ status: 'error', message: found.message })
      return
    }
    setState({ status: 'saving' })
    try {
      await api.put('booking-rules', toBody(payload, pix))
      setSaved({ payload, pix })
      setState({ status: 'saved', message: 'Pronto! Suas regras foram atualizadas.' })
    } catch (error) {
      const invalidKey =
        error instanceof ClinicApiError &&
        (error.body as { error?: string } | null)?.error === 'Invalid Pix key'
      setState({
        status: 'error',
        message: invalidKey
          ? 'Essa chave Pix não parece válida. Confira o tipo e o número.'
          : 'Não foi possível salvar. Tente de novo em instantes.',
      })
    }
  }

  const summary = [
    p.bookingNoticeHours
      ? `Agenda com pelo menos ${hoursLabel(p.bookingNoticeHours)} de antecedência, até ${p.bookingWindowDays ?? 30} dias à frente.`
      : `Agenda até ${p.bookingWindowDays ?? 30} dias à frente.`,
    `Cancela ou remarca pelo app até ${hoursLabel(p.cancellationHours)} antes${
      p.reschedulingHours != null && p.reschedulingHours !== p.cancellationHours
        ? ` (remarcar: até ${hoursLabel(p.reschedulingHours)} antes)`
        : ''
    }.`,
    depositOn && example
      ? `${example.name}: sinal de ${money(Math.round((example.priceCents * percent) / 100))} ${acceptInApp ? 'pelo app' : `por Pix, pago em até ${holdLabel(pix.holdMinutes)}`} para garantir o horário.`
      : 'Não paga nada antes: o pagamento é no dia.',
    depositOn
      ? (sinalOutcomeOptions.find((option) => option.id === outcome)?.title ??
        'Regra de devolução personalizada.')
      : null,
  ].filter(Boolean) as string[]

  return (
    <div className="settings-stack rules-page">
      <div className="rules-layout">
        <div className="settings-stack">
          <SettingsCard
            icon={<CalendarClock size={20} />}
            title="Agendamento pelo site"
            description="Quando a cliente pode marcar sozinha."
          >
            <Line title="Antecedência mínima" hint="Evita marcações em cima da hora.">
              <Chips
                label="Antecedência mínima"
                value={p.bookingNoticeHours ?? 1}
                options={[0, 1, 2, 4, 12, 24].map((value) => ({ value, label: hoursLabel(value) }))}
                onChange={(bookingNoticeHours) => prefs({ bookingNoticeHours })}
              />
            </Line>
            <Line title="Até quantos dias à frente" hint="A agenda abre só até essa data.">
              <Chips
                label="Até quantos dias à frente"
                value={p.bookingWindowDays ?? 30}
                options={[7, 15, 30, 60, 90].map((value) => ({ value, label: `${value} dias` }))}
                onChange={(bookingWindowDays) => prefs({ bookingWindowDays })}
              />
            </Line>
          </SettingsCard>

          <SettingsCard
            icon={<RotateCcw size={20} />}
            title="Cancelar e remarcar"
            description="Até quando a cliente muda o horário pelo app. Depois disso, fala com você."
          >
            <Line title="Cancelar até">
              <Chips
                label="Cancelar até"
                value={p.cancellationHours}
                options={[2, 4, 12, 24, 48].map((value) => ({
                  value,
                  label: `${hoursLabel(value)} antes`,
                }))}
                onChange={(cancellationHours) => prefs({ cancellationHours })}
              />
            </Line>
            <Line title="Remarcar até" hint="Pode ser o mesmo prazo de cancelar.">
              <Chips<number | null>
                label="Remarcar até"
                value={p.reschedulingHours ?? null}
                options={[
                  { value: null, label: 'Mesmo prazo' },
                  ...[2, 4, 12, 24].map((value) => ({
                    value,
                    label: `${hoursLabel(value)} antes`,
                  })),
                ]}
                onChange={(reschedulingHours) => prefs({ reschedulingHours })}
              />
            </Line>
            {hasSpecial ? (
              <Line
                title="Serviços especiais"
                hint="Com aparelho alugado ou material separado: prazo maior."
              >
                <Chips
                  label="Prazo dos serviços especiais"
                  value={p.specialCancellationHours}
                  options={[24, 48, 72].map((value) => ({
                    value,
                    label: `${hoursLabel(value)} antes`,
                  }))}
                  onChange={(specialCancellationHours) => prefs({ specialCancellationHours })}
                />
              </Line>
            ) : null}
          </SettingsCard>

          <SettingsCard
            icon={<QrCode size={20} />}
            title={acceptInApp ? 'Sinal' : 'Sinal por Pix'}
            description={
              acceptInApp
                ? 'Um valor pago antes para garantir o horário, pelo próprio app.'
                : 'Um valor pago antes para garantir o horário. A cliente paga no Pix do espaço e você confirma.'
            }
            badge={
              acceptInApp ? null : (
                <Button size="sm" variant="secondary" onPress={() => setExplain(true)}>
                  <CircleHelp size={15} aria-hidden /> Como funciona?
                </Button>
              )
            }
          >
            <Chips
              label="Pedir sinal"
              value={depositOn ? 'on' : 'off'}
              options={[
                { value: 'off', label: 'Sem sinal' },
                { value: 'on', label: acceptInApp ? 'Pedir sinal' : 'Pedir sinal por Pix' },
              ]}
              onChange={(next) => {
                change(withDepositEnabled(payload, next === 'on'))
                if (next === 'on' && !depositOn && !acceptInApp) setExplain(true)
              }}
            />
            <QuickModal
              isOpen={explain}
              onOpenChange={setExplain}
              size="md"
              title="Como funciona o sinal por Pix"
              subtitle="Sem pagamento pelo app, a cliente paga o sinal no Pix do seu espaço e você confirma."
              footer={<Button onPress={() => setExplain(false)}>Entendi</Button>}
            >
              <DepositPixExplainer
                holdLabel={pix.holdMinutes === 1440 ? '24 h' : holdLabel(pix.holdMinutes)}
              />
            </QuickModal>
            {depositOn ? (
              <div className="rules-deposit">
                <Line title="Quanto do preço" hint="O restante é pago no dia.">
                  <Chips
                    label="Porcentagem do sinal"
                    value={percent}
                    options={[20, 30, 50, 100].map((value) => ({
                      value,
                      label: value === 100 ? 'Tudo' : `${value}%`,
                    }))}
                    onChange={(depositPercent) => prefs({ depositPercent })}
                  />
                </Line>
                {acceptInApp ? (
                  <p className="settings-muted">
                    Recebimento pelo app ativo: o sinal é pago no próprio app, sem chave Pix.
                  </p>
                ) : null}
                {acceptInApp ? null : (
                  <Line
                    title="Prazo para pagar"
                    hint="Sem pagamento, o horário volta a ficar livre."
                  >
                    <Chips
                      label="Prazo para pagar o sinal"
                      value={pix.holdMinutes}
                      options={[30, 60, 120, 360, 1440].map((value) => ({
                        value,
                        label: value === 1440 ? '24 h' : holdLabel(value),
                      }))}
                      onChange={(holdMinutes) => changePix({ holdMinutes })}
                    />
                  </Line>
                )}

                {acceptInApp ? null : (
                  <div
                    className={`rules-pix${problem?.field === 'pix' ? ' is-invalid' : ''}`}
                    data-field="pix"
                  >
                    <SelectField
                      label="Tipo da chave"
                      value={pix.keyType ?? ''}
                      placeholder="Escolha"
                      options={pixTypes.map(({ id, label }) => ({ id, label }))}
                      onChange={(value) => {
                        const type = value as PixKeyType
                        setTypeLocked(true)
                        changePix({ keyType: type, key: formatPixKey(type, pix.key) })
                      }}
                    />
                    <TextInputField
                      label="Chave Pix"
                      value={pix.key}
                      maxLength={80}
                      placeholder={
                        keyType?.placeholder ?? 'CPF, CNPJ, celular, e-mail ou aleatória'
                      }
                      description={
                        pix.key.trim() && pix.keyType
                          ? `Reconhecida como ${pixKeyLabels[pix.keyType]}. Se não for, troque o tipo ao lado.`
                          : 'Digite a chave: o tipo é reconhecido sozinho.'
                      }
                      onChange={(raw) => {
                        // Our own mask adds ( ) . / -: detect on the bare digits while typing.
                        const bare = /[a-z@]/i.test(raw) ? raw : raw.replace(/[^\d+]/g, '')
                        const type = typeLocked
                          ? pix.keyType
                          : (detectPixKeyType(bare) ?? (bare ? pix.keyType : null))
                        changePix({ keyType: type, key: formatPixKey(type, raw) })
                      }}
                    />
                    <TextInputField
                      label="Nome que aparece no Pix"
                      value={pix.holderName}
                      maxLength={60}
                      placeholder="Opcional: usa o nome do espaço"
                      onChange={(holderName) => changePix({ holderName })}
                    />
                  </div>
                )}

                <div
                  className={`rules-services${problem?.field === 'depositServices' ? ' is-invalid' : ''}`}
                >
                  <div className="rules-services-head">
                    <strong>Serviços com sinal</strong>
                    <small>
                      {withDeposit.length} de {priced.length}. Serviços “a combinar” não pedem
                      sinal.
                    </small>
                  </div>
                  <ul>
                    {priced.map((service) => (
                      <li
                        key={service.id}
                        className={isSpecialService(service) ? 'is-special' : undefined}
                      >
                        <CheckboxField
                          label={service.name}
                          description={
                            isSpecialService(service) ? (
                              <>
                                <span className="rules-special-tag">⭐ Especial (alugado)</span>{' '}
                                {service.category}
                              </>
                            ) : (
                              service.category
                            )
                          }
                          isSelected={service.depositRequired === true}
                          onChange={(on) => change(setServicesDeposit(payload, [service.id], on))}
                        />
                        <span className="rules-price">
                          {money(service.priceCents)}
                          {service.depositRequired ? (
                            <b>sinal {money(Math.round((service.priceCents * percent) / 100))}</b>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="settings-muted">
                Ninguém paga antes. Ligue quando quiser reduzir faltas em serviços longos ou caros.
              </p>
            )}
          </SettingsCard>

          {depositOn ? (
            <SettingsCard
              icon={<HandCoins size={20} />}
              title="Se a cliente desistir"
              description="O que acontece com o sinal. Avise a cliente antes; nunca fica mais que o sinal."
            >
              <div className="rules-outcomes" role="radiogroup" aria-label="Se a cliente desistir">
                {sinalOutcomeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={outcome === option.id}
                    onClick={() => change(withSinalOutcome(payload, option.id))}
                  >
                    <span className="rules-radio" aria-hidden />
                    <span className="rules-outcome-copy">
                      <strong>{option.title}</strong>
                      <small>{option.detail}</small>
                    </span>
                  </button>
                ))}
              </div>
              {outcome === 'custom' ? (
                <p className="settings-muted">
                  Você tem uma regra personalizada salva antes. Escolha uma opção para trocar.
                </p>
              ) : null}
            </SettingsCard>
          ) : null}
        </div>

        <aside className="manager-panel rules-preview" aria-label="Como a cliente vê">
          <h3>
            <Eye size={18} aria-hidden /> Como a cliente vê
          </h3>
          <ul>
            {summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <small>Resumo mostrado no site antes de a cliente confirmar o horário.</small>
        </aside>
      </div>

      <SaveBar
        dirty={dirty}
        state={state}
        onSave={() => void save()}
        onDiscard={() => {
          setPayload(saved.payload)
          setPix(saved.pix)
          setProblem(null)
          setState({ status: 'idle' })
        }}
        label="Salvar regras"
      />
    </div>
  )
}
