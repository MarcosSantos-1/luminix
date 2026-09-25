'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  Clock3,
  CreditCard,
  MoonStar,
  Plus,
  Scissors,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AppStatus } from '@/components/app-status'
import { Brand } from '@/components/brand'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'
import catalog from '@/lib/service-catalog.json'
import { formatBrPhone, isCompletePhone, toE164Phone } from '@/lib/phone'
import { untitledClinicName } from '@/lib/staff-destination'

type Audience = 'all' | 'women' | 'men'
type Service = {
  category: string
  name: string
  description: string
  priceCents: number
  durationMinutes: number
  priceType: 'fixed' | 'from' | 'quote'
  bookingMode: 'instant' | 'request' | 'manual_release'
  audience: Audience
  resourceName: string
  cancellationHours: number | null
}
type Professional = { name: string; role: string; audience: Audience; serviceNames: string[] }
type Payload = {
  name: string
  ownerName: string
  email: string
  phone: string
  clinic: {
    foundedYear: string
    whatsapp: string
    instagram: string
    facebook: string
    website: string
    taxId: string
    addressLine: string
    city: string
    state: string
    postalCode: string
  }
  occupations: string[]
  services: Service[]
  teamMode: 'solo' | 'team'
  professionals: Professional[]
  businessHours: { weekday: number; enabled: boolean; start: string; end: string }[]
  preferences: {
    cancellationHours: number
    specialCancellationHours: number
    acceptInApp: boolean
    packagePaymentMode: 'clinic_only' | 'in_app' | 'both'
  }
}
type Draft = {
  version: number
  formatVersion: number
  step: string
  status: string
  payload: Payload
}

const stepInfo = [
  {
    key: 'contact',
    label: 'Você',
    title: 'Vamos começar por você',
    text: 'Seu contato mantém este cadastro seguro e fácil de retomar.',
    icon: UserRound,
  },
  {
    key: 'clinic',
    label: 'Clínica',
    title: 'Conte sobre o seu espaço',
    text: 'Só o essencial para criar sua presença no Luminix.',
    icon: Building2,
  },
  {
    key: 'catalog',
    label: 'Catálogo',
    title: 'O que suas clientes podem agendar?',
    text: 'Selecione categorias e serviços. Já trouxemos sugestões prontas.',
    icon: Scissors,
  },
  {
    key: 'services',
    label: 'Detalhes',
    title: 'Ajuste os serviços',
    text: 'Confirme valor, duração e como cada tratamento entra na agenda.',
    icon: Sparkles,
  },
  {
    key: 'structure',
    label: 'Equipe',
    title: 'Quem realiza os atendimentos?',
    text: 'Se for só você, resolvemos esta etapa em um toque.',
    icon: Users,
  },
  {
    key: 'schedule',
    label: 'Agenda',
    title: 'Quando o espaço funciona?',
    text: 'Um horário inicial para o app já nascer pronto para agendar.',
    icon: CalendarDays,
  },
  {
    key: 'preferences',
    label: 'Regras',
    title: 'Defina o combinado com suas clientes',
    text: 'Cancelamentos, pacotes e pagamentos podem ser refinados depois.',
    icon: CreditCard,
  },
  {
    key: 'review',
    label: 'Finalizar',
    title: 'Tudo pronto para abrir',
    text: 'Confira o resumo. Você poderá editar tudo no painel.',
    icon: Check,
  },
] as const
const dayNames: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
}
const categories = [...new Set(catalog.map((item) => item.categoria))]

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
      addressLine: '',
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
        setStep(
          Math.max(
            0,
            stepInfo.findIndex((item) => item.key === data.draft.step),
          ),
        )
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
      step === 5 &&
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
    const payloadToSave: Payload =
      step === 4 && payload.teamMode === 'solo'
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
        : payload
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
          step: stepInfo[nextStep].key,
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
          <button
            className="button button-primary"
            onClick={() => router.push(`/clinics/${clinic.id}`)}
          >
            Ir para a clínica
          </button>
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
          <button
            className="button button-primary"
            onClick={() => {
              setError('')
              setRetry((value) => value + 1)
            }}
          >
            Tentar novamente
          </button>
        }
      >
        {error}
      </AppStatus>
    ) : (
      <AppStatus />
    )

  const readyPayload = payload
  const current = stepInfo[step]
  const Icon = current.icon
  const progress = Math.round(((step + 1) / stepInfo.length) * 100)
  const selectedNames = new Set(readyPayload.services.map((service) => service.name))

  function toggleCatalogService(item: (typeof catalog)[number]) {
    if (selectedNames.has(item.nome)) {
      const services = readyPayload.services.filter((service) => service.name !== item.nome)
      setPayload({
        ...readyPayload,
        services,
        occupations: readyPayload.occupations.filter((category) =>
          services.some((service) => service.category === category),
        ),
      })
      return
    }
    setPayload({
      ...readyPayload,
      occupations: [...new Set([...readyPayload.occupations, item.categoria])],
      services: [
        ...readyPayload.services,
        {
          category: item.categoria,
          name: item.nome,
          description: item.descricao,
          durationMinutes: item.duracao_minutos,
          priceCents: Math.round(item.preco_sugerido_brl * 100),
          priceType: item.preco_sugerido_brl ? 'fixed' : 'quote',
          bookingMode: 'instant',
          audience: 'all',
          resourceName: '',
          cancellationHours: null,
        },
      ],
    })
  }

  return (
    <main className="ob2" data-surface={glass ? 'glass' : 'solid'}>
      <header className="ob2-header">
        <Brand dark />
        <div className="ob2-header-actions">
          <span>
            <Check size={14} /> Salvo a cada etapa
          </span>
          <button
            className="ob2-theme"
            type="button"
            aria-pressed={glass}
            onClick={() => setGlass((value) => !value)}
          >
            {glass ? <MoonStar size={15} /> : <Sun size={15} />}
            {glass ? 'Glass' : 'Claro'}
          </button>
          <button className="ob2-exit" disabled={busy} onClick={() => void save(step, true)}>
            Salvar e sair
          </button>
        </div>
      </header>
      <div className="ob2-shell">
        <aside className="ob2-sidebar">
          <div className="ob2-side-copy">
            <span>
              <Sparkles size={13} /> Configuração guiada
            </span>
            <h1>
              Seu espaço,
              <br />
              <em>pronto para atender.</em>
            </h1>
            <p>
              Você começa com o essencial. Os detalhes avançados continuam disponíveis no painel.
            </p>
          </div>
          <div className="ob2-progress-card">
            <div>
              <b>Progresso</b>
              <strong>{progress}%</strong>
            </div>
            <i>
              <span style={{ width: `${progress}%` }} />
            </i>
            <ol>
              {stepInfo.map((item, index) => (
                <li
                  key={item.key}
                  className={index === step ? 'current' : index < step ? 'done' : ''}
                >
                  <span>{index < step ? <Check size={13} /> : index + 1}</span>
                  <b>{item.label}</b>
                </li>
              ))}
            </ol>
          </div>
          <small>Você pode sair e continuar pelo login a qualquer momento.</small>
        </aside>
        <section className="ob2-stage">
          <div className="ob2-mobile-progress">
            <span>
              Etapa {step + 1} de {stepInfo.length}
            </span>
            <b>{progress}%</b>
            <i>
              <span style={{ width: `${progress}%` }} />
            </i>
          </div>
          <article className="ob2-card" key={current.key}>
            <div className="ob2-title">
              <span>
                <Icon size={24} />
              </span>
              <div>
                <small>
                  Etapa {step + 1} de {stepInfo.length}
                </small>
                <h2>{current.title}</h2>
                <p>{current.text}</p>
              </div>
            </div>
            <div className="ob2-content">
              {step === 0 && (
                <ContactStep
                  payload={payload}
                  phoneText={phoneText}
                  setPhoneText={setPhoneText}
                  setPayload={setPayload}
                />
              )}
              {step === 1 && <ClinicStep payload={payload} setPayload={setPayload} />}
              {step === 2 && (
                <CatalogStep
                  payload={payload}
                  selectedNames={selectedNames}
                  toggle={toggleCatalogService}
                  setPayload={setPayload}
                />
              )}
              {step === 3 && <ServicesStep payload={payload} setPayload={setPayload} />}
              {step === 4 && <TeamStep payload={payload} setPayload={setPayload} />}
              {step === 5 && <ScheduleStep payload={payload} setPayload={setPayload} />}
              {step === 6 && <PreferencesStep payload={payload} setPayload={setPayload} />}
              {step === 7 && <ReviewStep payload={payload} />}
            </div>
            {error && (
              <p className="ob2-error" role="alert">
                {error}
              </p>
            )}
            <div className="ob2-actions">
              {step > 0 && (
                <button
                  className="ob2-secondary"
                  disabled={busy}
                  onClick={() => void save(step - 1)}
                >
                  <ArrowLeft size={16} /> Voltar
                </button>
              )}
              {step < stepInfo.length - 1 ? (
                <button className="ob2-primary" disabled={busy} onClick={() => void save(step + 1)}>
                  {busy ? 'Salvando…' : 'Continuar'} <ArrowRight size={17} />
                </button>
              ) : (
                <button className="ob2-primary" disabled={busy} onClick={() => void complete()}>
                  {busy ? 'Criando sua clínica…' : 'Abrir minha clínica'} <ArrowRight size={17} />
                </button>
              )}
            </div>
          </article>
        </section>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ob2-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ob2-input" {...props} />
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="ob2-input" {...props} />
}

function ContactStep({
  payload,
  phoneText,
  setPhoneText,
  setPayload,
}: {
  payload: Payload
  phoneText: string
  setPhoneText: (value: string) => void
  setPayload: (value: Payload) => void
}) {
  return (
    <div className="ob2-grid two">
      <Field label="Seu nome">
        <Input
          autoComplete="name"
          value={payload.ownerName}
          placeholder="Ex.: Marina Alves"
          onChange={(event) => setPayload({ ...payload, ownerName: event.target.value })}
        />
      </Field>
      <Field label="E-mail de acesso">
        <Input
          type="email"
          autoComplete="email"
          value={payload.email}
          placeholder="marina@clinica.com"
          onChange={(event) => setPayload({ ...payload, email: event.target.value })}
        />
      </Field>
      <Field label="Celular / WhatsApp">
        <Input
          inputMode="tel"
          value={phoneText}
          placeholder="(11) 99999-0000"
          onChange={(event) => {
            const value = event.target.value
            setPhoneText(formatBrPhone(value) || value)
            setPayload({
              ...payload,
              phone: toE164Phone(value),
              clinic: { ...payload.clinic, whatsapp: toE164Phone(value) },
            })
          }}
        />
      </Field>
      <div className="ob2-note">
        <Check size={17} />
        <span>
          <b>Retomada automática</b>
          <small>Seu celular será verificado por código quando o canal de SMS for ativado.</small>
        </span>
      </div>
    </div>
  )
}

function ClinicStep({
  payload,
  setPayload,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
}) {
  const change = (key: keyof Payload['clinic'], value: string) =>
    setPayload({ ...payload, clinic: { ...payload.clinic, [key]: value } })
  return (
    <>
      <div className="ob2-grid two">
        <Field label="Nome da clínica ou estúdio">
          <Input
            value={payload.name}
            placeholder="Ex.: Studio Luna"
            onChange={(event) => setPayload({ ...payload, name: event.target.value })}
          />
        </Field>
        <Field label="Ano de fundação (opcional)">
          <Input
            inputMode="numeric"
            maxLength={4}
            value={payload.clinic.foundedYear}
            placeholder="2021"
            onChange={(event) => change('foundedYear', event.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <Field label="Instagram (opcional)">
          <Input
            value={payload.clinic.instagram}
            placeholder="@studioluna"
            onChange={(event) => change('instagram', event.target.value)}
          />
        </Field>
        <Field label="Site ou página (opcional)">
          <Input
            value={payload.clinic.website}
            placeholder="https://..."
            onChange={(event) => change('website', event.target.value)}
          />
        </Field>
        <Field label="Facebook (opcional)">
          <Input
            value={payload.clinic.facebook}
            placeholder="facebook.com/..."
            onChange={(event) => change('facebook', event.target.value)}
          />
        </Field>
        <Field label="CPF ou CNPJ (opcional)">
          <Input
            value={payload.clinic.taxId}
            placeholder="Somente para cadastro interno"
            onChange={(event) => change('taxId', event.target.value)}
          />
        </Field>
      </div>
      <div className="ob2-upload">
        <Building2 size={22} />
        <span>
          <b>Logo da clínica</b>
          <small>O envio seguro será liberado na primeira visita ao painel.</small>
        </span>
        <button disabled>Adicionar depois</button>
      </div>
    </>
  )
}

function CatalogStep({
  payload,
  selectedNames,
  toggle,
  setPayload,
}: {
  payload: Payload
  selectedNames: Set<string>
  toggle: (item: (typeof catalog)[number]) => void
  setPayload: (value: Payload) => void
}) {
  const [filter, setFilter] = useState(payload.occupations[0] ?? categories[0])
  return (
    <>
      <div className="ob2-category-row">
        {categories.map((category) => (
          <button
            type="button"
            key={category}
            className={filter === category ? 'active' : ''}
            onClick={() => setFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>
      <div className="ob2-service-picks">
        {catalog
          .filter((item) => item.categoria === filter)
          .map((item) => (
            <button
              type="button"
              key={item.nome}
              className={selectedNames.has(item.nome) ? 'selected' : ''}
              onClick={() => toggle(item)}
            >
              <span>{selectedNames.has(item.nome) ? <Check size={15} /> : <Plus size={15} />}</span>
              <div>
                <b>{item.nome}</b>
                <small>
                  {item.duracao_minutos} min · sugestão R${' '}
                  {item.preco_sugerido_brl.toFixed(2).replace('.', ',')}
                </small>
              </div>
            </button>
          ))}
      </div>
      <div className="ob2-selection-count">
        <b>
          {payload.services.length} selecionado{payload.services.length === 1 ? '' : 's'}
        </b>
        <span>Valores são sugestões e podem ser ajustados agora.</span>
      </div>
      <button
        type="button"
        className="ob2-add"
        disabled={payload.services.length >= 80}
        onClick={() => {
          const position = payload.services.filter((service) =>
            service.name.startsWith('Novo serviço'),
          ).length
          const name = `Novo serviço ${position + 1}`
          setPayload({
            ...payload,
            occupations: [...new Set([...payload.occupations, 'Outros'])],
            services: [
              ...payload.services,
              {
                category: 'Outros',
                name,
                description: '',
                durationMinutes: 60,
                priceCents: 0,
                priceType: 'quote',
                bookingMode: 'request',
                audience: 'all',
                resourceName: '',
                cancellationHours: null,
              },
            ],
          })
        }}
      >
        <Plus size={16} /> Adicionar serviço fora do catálogo
      </button>
    </>
  )
}

function ServicesStep({
  payload,
  setPayload,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
}) {
  const update = (index: number, patch: Partial<Service>) =>
    setPayload({
      ...payload,
      services: payload.services.map((service, position) =>
        position === index ? { ...service, ...patch } : service,
      ),
    })
  return (
    <div className="ob2-service-editor">
      {payload.services.map((service, index) => (
        <details key={service.name} open={index === 0}>
          <summary>
            <span>
              <b>{service.name}</b>
              <small>
                {service.category} · {service.durationMinutes} min
              </small>
            </span>
            <strong>
              {service.priceType === 'quote'
                ? 'Sob consulta'
                : `R$ ${(service.priceCents / 100).toFixed(2).replace('.', ',')}`}
            </strong>
          </summary>
          <div className="ob2-grid three">
            <Field label="Nome do serviço">
              <Input
                value={service.name}
                onChange={(event) => update(index, { name: event.target.value })}
              />
            </Field>
            <Field label="Categoria">
              <Input
                value={service.category}
                onChange={(event) => update(index, { category: event.target.value })}
              />
            </Field>
            <Field label="Preço">
              <Input
                inputMode="decimal"
                disabled={service.priceType === 'quote'}
                value={
                  service.priceType === 'quote'
                    ? ''
                    : (service.priceCents / 100).toFixed(2).replace('.', ',')
                }
                onChange={(event) =>
                  update(index, {
                    priceCents: Math.max(
                      0,
                      Math.round(Number(event.target.value.replace(',', '.')) * 100) || 0,
                    ),
                  })
                }
              />
            </Field>
            <Field label="Como cobrar">
              <Select
                value={service.priceType}
                onChange={(event) =>
                  update(index, { priceType: event.target.value as Service['priceType'] })
                }
              >
                <option value="fixed">Preço fixo</option>
                <option value="from">A partir de</option>
                <option value="quote">Sob consulta</option>
              </Select>
            </Field>
            <Field label="Duração">
              <Select
                value={service.durationMinutes}
                onChange={(event) => update(index, { durationMinutes: Number(event.target.value) })}
              >
                {[15, 30, 45, 60, 90, 120, 150, 180, 240].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Agendamento">
              <Select
                value={service.bookingMode}
                onChange={(event) =>
                  update(index, { bookingMode: event.target.value as Service['bookingMode'] })
                }
              >
                <option value="instant">Confirma na hora</option>
                <option value="request">Pedir confirmação</option>
                <option value="manual_release">Liberar datas manualmente</option>
              </Select>
            </Field>
            <Field label="Público atendido">
              <Select
                value={service.audience}
                onChange={(event) => update(index, { audience: event.target.value as Audience })}
              >
                <option value="all">Todos</option>
                <option value="women">Somente mulheres</option>
                <option value="men">Somente homens</option>
              </Select>
            </Field>
            {service.bookingMode === 'manual_release' && (
              <Field label="Máquina/recurso">
                <Input
                  value={service.resourceName}
                  placeholder="Ex.: Laser alugado"
                  onChange={(event) => update(index, { resourceName: event.target.value })}
                />
              </Field>
            )}
          </div>
          <button
            type="button"
            className="ob2-remove"
            onClick={() =>
              setPayload({
                ...payload,
                services: payload.services.filter((_, position) => position !== index),
              })
            }
          >
            <Trash2 size={14} /> Remover serviço
          </button>
        </details>
      ))}
    </div>
  )
}

function TeamStep({
  payload,
  setPayload,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
}) {
  const setMode = (mode: 'solo' | 'team') =>
    setPayload({
      ...payload,
      teamMode: mode,
      professionals:
        mode === 'solo'
          ? [
              {
                name: payload.ownerName,
                role: 'Proprietária / profissional',
                audience: 'all',
                serviceNames: payload.services.map((service) => service.name),
              },
            ]
          : [],
    })
  const update = (index: number, patch: Partial<Professional>) =>
    setPayload({
      ...payload,
      professionals: payload.professionals.map((professional, position) =>
        position === index ? { ...professional, ...patch } : professional,
      ),
    })
  return (
    <>
      <div className="ob2-segment">
        <button
          className={payload.teamMode === 'solo' ? 'active' : ''}
          onClick={() => setMode('solo')}
        >
          Somente eu
        </button>
        <button
          className={payload.teamMode === 'team' ? 'active' : ''}
          onClick={() => setMode('team')}
        >
          Tenho equipe
        </button>
      </div>
      {payload.teamMode === 'solo' ? (
        <div className="ob2-note">
          <UserRound size={19} />
          <span>
            <b>{payload.ownerName || 'Você'} será a profissional principal</b>
            <small>Todos os serviços selecionados ficam vinculados a você.</small>
          </span>
        </div>
      ) : (
        <div className="ob2-team-list">
          {payload.professionals.map((professional, index) => (
            <div className="ob2-team-card" key={index}>
              <div className="ob2-grid three">
                <Field label="Nome">
                  <Input
                    value={professional.name}
                    placeholder="Ex.: Camila"
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                </Field>
                <Field label="Função">
                  <Input
                    value={professional.role}
                    placeholder="Ex.: Esteticista"
                    onChange={(event) => update(index, { role: event.target.value })}
                  />
                </Field>
                <Field label="Público">
                  <Select
                    value={professional.audience}
                    onChange={(event) =>
                      update(index, { audience: event.target.value as Audience })
                    }
                  >
                    <option value="all">Todos</option>
                    <option value="women">Somente mulheres</option>
                    <option value="men">Somente homens</option>
                  </Select>
                </Field>
              </div>
              <div className="ob2-pro-services">
                <span>Serviços que realiza</span>
                <div>
                  {payload.services.map((service) => {
                    const selected = professional.serviceNames.includes(service.name)
                    return (
                      <button
                        type="button"
                        className={selected ? 'selected' : ''}
                        key={service.name}
                        onClick={() =>
                          update(index, {
                            serviceNames: selected
                              ? professional.serviceNames.filter((name) => name !== service.name)
                              : [...professional.serviceNames, service.name],
                          })
                        }
                      >
                        {selected && <Check size={11} />}
                        {service.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <button
                className="ob2-remove"
                onClick={() =>
                  setPayload({
                    ...payload,
                    professionals: payload.professionals.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                <Trash2 size={14} /> Remover
              </button>
            </div>
          ))}
          <button
            className="ob2-add"
            onClick={() =>
              setPayload({
                ...payload,
                professionals: [
                  ...payload.professionals,
                  {
                    name: '',
                    role: 'Profissional',
                    audience: 'all',
                    serviceNames: payload.services.map((service) => service.name),
                  },
                ],
              })
            }
          >
            <Plus size={16} /> Adicionar profissional
          </button>
          <p className="ob2-helper">
            Convites e permissões de recepção/financeiro serão configurados com contas individuais
            no painel.
          </p>
        </div>
      )}
    </>
  )
}

function ScheduleStep({
  payload,
  setPayload,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
}) {
  const changeClinic = (key: keyof Payload['clinic'], value: string) =>
    setPayload({ ...payload, clinic: { ...payload.clinic, [key]: value } })
  const updateDay = (weekday: number, patch: Partial<Payload['businessHours'][number]>) =>
    setPayload({
      ...payload,
      businessHours: payload.businessHours.map((day) =>
        day.weekday === weekday ? { ...day, ...patch } : day,
      ),
    })
  return (
    <>
      <div className="ob2-grid two">
        <Field label="Endereço">
          <Input
            value={payload.clinic.addressLine}
            placeholder="Rua, número e complemento"
            onChange={(event) => changeClinic('addressLine', event.target.value)}
          />
        </Field>
        <Field label="Cidade">
          <Input
            value={payload.clinic.city}
            placeholder="Ex.: São Paulo"
            onChange={(event) => changeClinic('city', event.target.value)}
          />
        </Field>
        <Field label="Estado">
          <Input
            value={payload.clinic.state}
            maxLength={2}
            placeholder="SP"
            onChange={(event) => changeClinic('state', event.target.value.toUpperCase())}
          />
        </Field>
        <Field label="CEP">
          <Input
            value={payload.clinic.postalCode}
            placeholder="00000-000"
            onChange={(event) => changeClinic('postalCode', event.target.value)}
          />
        </Field>
      </div>
      <div className="ob2-hours">
        {payload.businessHours.map((day) => (
          <div key={day.weekday}>
            <button
              className={day.enabled ? 'on' : ''}
              type="button"
              onClick={() => updateDay(day.weekday, { enabled: !day.enabled })}
            >
              {day.enabled && <Check size={12} />}
              {dayNames[day.weekday]}
            </button>
            {day.enabled ? (
              <>
                <Input
                  type="time"
                  value={day.start}
                  onChange={(event) => updateDay(day.weekday, { start: event.target.value })}
                />
                <span>até</span>
                <Input
                  type="time"
                  value={day.end}
                  onChange={(event) => updateDay(day.weekday, { end: event.target.value })}
                />
              </>
            ) : (
              <small>Fechado</small>
            )}
          </div>
        ))}
      </div>
      <p className="ob2-helper">
        <Clock3 size={14} /> A agenda individual da equipe usa este horário como base.
      </p>
    </>
  )
}

function PreferencesStep({
  payload,
  setPayload,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
}) {
  const change = (patch: Partial<Payload['preferences']>) =>
    setPayload({ ...payload, preferences: { ...payload.preferences, ...patch } })
  return (
    <>
      <div className="ob2-policy-grid">
        <Field label="Cancelamento padrão">
          <Select
            value={payload.preferences.cancellationHours}
            onChange={(event) => change({ cancellationHours: Number(event.target.value) })}
          >
            {[4, 8, 12, 24, 48].map((hours) => (
              <option key={hours} value={hours}>
                {hours} horas antes
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Procedimentos especiais">
          <Select
            value={payload.preferences.specialCancellationHours}
            onChange={(event) => change({ specialCancellationHours: Number(event.target.value) })}
          >
            {[12, 24, 48, 72].map((hours) => (
              <option key={hours} value={hours}>
                {hours} horas antes
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="ob2-option-cards">
        <button
          className={!payload.preferences.acceptInApp ? 'selected' : ''}
          onClick={() => change({ acceptInApp: false })}
        >
          <b>Receber fora do app</b>
          <small>Pix, maquininha ou link da própria clínica.</small>
        </button>
        <button
          className={payload.preferences.acceptInApp ? 'selected' : ''}
          onClick={() => change({ acceptInApp: true })}
        >
          <b>Quero pagamentos no app</b>
          <small>Guardamos a preferência. O cadastro Stripe Connect será feito no painel.</small>
        </button>
      </div>
      <Field label="Pacotes de sessões">
        <Select
          value={payload.preferences.packagePaymentMode}
          onChange={(event) =>
            change({
              packagePaymentMode: event.target
                .value as Payload['preferences']['packagePaymentMode'],
            })
          }
        >
          <option value="clinic_only">Receber somente na clínica</option>
          <option value="in_app">Receber somente no app</option>
          <option value="both">Aceitar das duas formas</option>
        </Select>
      </Field>
      <div className="ob2-note">
        <CreditCard size={19} />
        <span>
          <b>Nenhuma cobrança é feita agora</b>
          <small>Prazos, taxas e verificação serão mostrados antes da ativação.</small>
        </span>
      </div>
    </>
  )
}

function ReviewStep({ payload }: { payload: Payload }) {
  return (
    <>
      <div className="ob2-success">
        <Check size={22} />
        <div>
          <b>Sua base está pronta</b>
          <span>Ao finalizar, criamos as configurações reais e o código de compartilhamento.</span>
        </div>
      </div>
      <dl className="ob2-review">
        <div>
          <dt>Clínica</dt>
          <dd>{payload.name}</dd>
        </div>
        <div>
          <dt>Contato</dt>
          <dd>
            {payload.ownerName} · {formatBrPhone(payload.phone)}
          </dd>
        </div>
        <div>
          <dt>Catálogo</dt>
          <dd>
            {payload.services.length} serviços em {payload.occupations.length} categorias
          </dd>
        </div>
        <div>
          <dt>Equipe</dt>
          <dd>
            {payload.teamMode === 'solo'
              ? 'Somente você'
              : `${payload.professionals.length} profissionais`}
          </dd>
        </div>
        <div>
          <dt>Agenda</dt>
          <dd>{payload.businessHours.filter((day) => day.enabled).length} dias por semana</dd>
        </div>
        <div>
          <dt>Cancelamento</dt>
          <dd>
            {payload.preferences.cancellationHours}h padrão ·{' '}
            {payload.preferences.specialCancellationHours}h especiais
          </dd>
        </div>
        <div>
          <dt>Pagamento</dt>
          <dd>
            {payload.preferences.acceptInApp
              ? 'Interesse em Stripe Connect'
              : 'Recebimento fora do app'}
          </dd>
        </div>
        <div>
          <dt>Endereço</dt>
          <dd>
            {payload.clinic.city
              ? `${payload.clinic.addressLine || 'A definir'}, ${payload.clinic.city}/${payload.clinic.state || '—'}`
              : 'Pode completar depois'}
          </dd>
        </div>
      </dl>
    </>
  )
}
