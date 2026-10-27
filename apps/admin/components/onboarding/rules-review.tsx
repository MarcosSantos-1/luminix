import { Accordion, Button, Card } from '@heroui/react'
import {
  CalendarDays,
  CircleHelp,
  Clock3,
  CreditCard,
  HandHeart,
  HeartHandshake,
  MapPin,
  Pencil,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'
import Image from 'next/image'
import { useState, type ReactNode } from 'react'
import {
  categories,
  categoryArtSrc,
  dayNames,
  formatMoney,
  professionalAvatarSrc,
  stepInfo,
  type Audience,
  type DaySchedule,
  type Payload,
  type Service,
} from './model'
import { BlurDialog, GlassSelect, SectionIssue, StepEnd, type FieldErrors } from './ui'
import { formatBrPhone } from '@/lib/phone'
import './rules-review.css'

function hours(value: number) {
  if (value === 0) return 'Até o horário do atendimento'
  return `${value} ${value === 1 ? 'hora' : 'horas'} antes`
}

function hourOptions(values: number[], current: number) {
  return [...new Set([...values, current])]
    .sort((a, b) => a - b)
    .map((value) => ({ id: String(value), label: hours(value) }))
}

function sameDayHour(hoursBefore: number) {
  if (hoursBefore <= 0) return 'até as 14h'
  if (hoursBefore < 14) return `até as ${14 - hoursBefore}h do mesmo dia`
  if (hoursBefore === 24) return 'até as 14h do dia anterior'
  if (hoursBefore === 48) return 'até as 14h de dois dias antes'
  if (hoursBefore < 48) return `com ${hoursBefore} horas de antecedência`
  return `com ${Math.round(hoursBefore / 24)} dias de antecedência`
}

function RuleMark({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="ob2-rule-help"
      aria-label={`Entender: ${label}`}
      onPointerDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpen()
      }}
    >
      <CircleHelp size={18} aria-hidden />
    </button>
  )
}

function fieldLabel(text: string, onOpen: () => void) {
  return (
    <span className="ob2-rule-label">
      <span>{text}</span>
      <RuleMark label={text} onOpen={onOpen} />
    </span>
  )
}

function markLetters(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'LX'
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('pt-BR')
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toLocaleUpperCase('pt-BR')
}

function listedCategories(payload: Payload) {
  const totals = new Map<string, number>()
  for (const name of payload.occupations) totals.set(name, 0)
  for (const service of payload.services) {
    const name = service.category.trim() || 'Outros'
    totals.set(name, (totals.get(name) ?? 0) + 1)
  }
  const known = categories.filter((name) => totals.has(name))
  const rest = [...totals.keys()].filter(
    (name) => !(categories as readonly string[]).includes(name),
  )
  return [...known, ...rest].map((name) => ({ name, total: totals.get(name) ?? 0 }))
}

function clinicAddress(clinic: Payload['clinic']) {
  const street = [clinic.addressLine, clinic.addressNumber].filter(Boolean).join(', ')
  const city = clinic.city && clinic.state ? `${clinic.city}/${clinic.state}` : clinic.city
  return [street, clinic.addressDistrict, city].filter(Boolean).join(' · ')
}

function serviceSpan(services: Service[]) {
  const minutes = services.map((service) => service.durationMinutes).filter((value) => value > 0)
  if (minutes.length === 0) return ''
  const min = Math.min(...minutes)
  const max = Math.max(...minutes)
  return min === max ? `${min} min` : `${min}–${max} min`
}

function servicePriceSpan(services: Service[]) {
  const prices = services
    .filter((service) => service.priceType !== 'quote' && service.priceCents > 0)
    .map((service) => service.priceCents)
  if (prices.length === 0) return ''
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`
}

function audienceSummary(audience?: Audience) {
  if (audience === 'women') return 'Público feminino'
  if (audience === 'men') return 'Público masculino'
  return 'Todos os públicos'
}

function sameRange(days: DaySchedule[]) {
  if (days.length === 0) return ''
  const first = `${days[0].start}–${days[0].end}`
  return days.every((day) => `${day.start}–${day.end}` === first) ? first : ''
}

const shortDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const weekOrder = [1, 2, 3, 4, 5, 6, 0]

function FactList({ items }: { items: { label: string; value: string }[] }) {
  const rows = items.filter((item) => item.value.trim())
  if (rows.length === 0) return null
  return (
    <ul className="ob2-review-facts">
      {rows.map((item) => (
        <li key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </li>
      ))}
    </ul>
  )
}

function Help({ items }: { items: { title: string; text: string }[] }) {
  return (
    <Accordion className="ob2-rules-help">
      {items.map((item) => (
        <Accordion.Item key={item.title} id={item.title}>
          <Accordion.Heading>
            <Accordion.Trigger>
              {item.title}
              <Accordion.Indicator />
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <Accordion.Body>{item.text}</Accordion.Body>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  )
}

export function RulesStep({
  payload,
  setPayload,
  error,
  fieldErrors = {},
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  fieldErrors?: FieldErrors
  footer: ReactNode
}) {
  const preferences = payload.preferences
  const change = (patch: Partial<Payload['preferences']>) =>
    setPayload({ ...payload, preferences: { ...preferences, ...patch } })
  const notice = preferences.bookingNoticeHours ?? 1
  const windowDays = preferences.bookingWindowDays ?? 30
  const special = payload.services.filter((service) => service.bookingMode === 'manual_release')
  const overrides = payload.services.filter((service) => service.cancellationHours !== null)
  const rescheduling = preferences.reschedulingHours
  const [help, setHelp] = useState<
    'notice' | 'window' | 'cancel' | 'special' | 'reschedule' | null
  >(null)
  const helpCopy = {
    notice: {
      title: 'Com quanto tempo de antecedência a cliente pode marcar?',
      paragraphs: [
        'É o tempo mínimo entre o momento da reserva e o horário do atendimento. Antes disso, o horário nem aparece para ela.',
        notice
          ? `Do jeito que está agora, um atendimento às 14h só pode ser marcado ${sameDayHour(notice)}.`
          : 'Do jeito que está agora, ela pode marcar até a hora do atendimento, se ainda houver vaga.',
        'Um prazo curto, como 1 hora, enche mais a agenda do mesmo dia e deixa pouco tempo para você se preparar. Um prazo longo, como 24 ou 48 horas, organiza melhor o dia, mas impede a reserva de última hora.',
        'Isso não cobra nada e não bloqueia a sua agenda. Só decide a partir de quando a cliente consegue escolher aquele horário.',
      ],
    },
    window: {
      title: 'Até quantos dias à frente ela pode escolher um horário?',
      paragraphs: [
        'É o quanto da agenda fica aberto para reserva. Os dias depois desse limite ainda não aparecem para a cliente.',
        `Do jeito que está agora, ela consegue marcar só nos próximos ${windowDays} dias. No dia seguinte, a janela anda um dia para frente.`,
        '7 ou 15 dias deixam você no controle de perto: dá para ajustar a semana sem já ter prometido o mês inteiro. 30 dias é o meio-termo. 60 dias atendem quem planeja com antecedência, mas você se compromete mais cedo.',
        'A agenda não fica travada para sempre. Quando um dia entra nessa janela, ele passa a aparecer.',
      ],
    },
    cancel: {
      title: 'Até quando a cliente pode cancelar?',
      paragraphs: [
        'É o limite para ela desistir pelo app. Depois desse horário, o cancelamento sozinho não é mais aceito.',
        `Do jeito que está agora, um atendimento às 14h pode ser cancelado ${sameDayHour(preferences.cancellationHours)}.`,
        'Até o horário do atendimento deixa a vaga vazia em cima da hora. 4 horas dão um intervalo para tentar encaixar outra pessoa. 24 ou 48 horas protegem mais a sua agenda e pedem que a cliente avise bem antes.',
        'Não gera multa, cobrança nem desconto de sessão. Se algum serviço tiver um prazo próprio, esse prazo vale no lugar deste.',
        overrides.length
          ? `${overrides.length} serviço(s) já têm prazo próprio e não seguem esta regra: ${overrides.map((service) => service.name).join(' · ')}.`
          : 'Nenhum serviço está com prazo próprio. Esta regra vale para os atendimentos comuns.',
      ],
    },
    special: {
      title: 'E nos atendimentos com aparelhos especiais?',
      paragraphs: [
        'Alguns atendimentos usam aparelho ou sala que você prepara antes. Por isso o cancelamento pode ser mais longo do que o dos outros serviços.',
        `Do jeito que está agora, esses atendimentos às 14h só podem ser cancelados ${sameDayHour(preferences.specialCancellationHours)}.`,
        'Vale só para os serviços especiais. Os demais continuam no prazo geral de cancelamento.',
        special.length
          ? `Serviços nesta regra: ${special.map((service) => service.name).join(' · ')}.`
          : 'Nenhum serviço especial está marcado agora.',
        'Também não gera multa. Só evita desmarcar em cima da hora um atendimento que exige preparo.',
      ],
    },
    reschedule: {
      title: 'Para remarcar, qual prazo você prefere?',
      paragraphs: [
        'Remarcar é trocar o horário, não desistir. O prazo diz até quando a cliente ainda pode fazer essa troca sozinha.',
        rescheduling == null
          ? '“O mesmo prazo do cancelamento” acompanha cada atendimento. Se um serviço cancela com 4 horas, remarcar pede 4 horas. Se um especial cancela com 24 horas, remarcar esse serviço também pede 24 horas.'
          : `Do jeito que está agora, remarcar pede ${hours(rescheduling).toLocaleLowerCase('pt-BR')}, igual para todos os serviços, inclusive os especiais.`,
        'Se você separar os prazos, os efeitos são diferentes. Exemplo: cancelar até 4 horas antes e remarcar só até 24 horas antes. Ela ainda pode desistir perto do horário, mas para trocar o dia precisa avisar com um dia de antecedência.',
        'Não cobra diferença nem multa. Só define até quando a troca é permitida.',
      ],
    },
  }[help ?? 'notice']
  return (
    <div className="ob2-stack ob2-rules">
      {fieldErrors.rules ? (
        <SectionIssue title="Recebimento dos pacotes" field="rules" error={fieldErrors.rules} />
      ) : null}
      <div className="ob2-rules-layout">
        <div className="ob2-stack">
          <Card className="ob2-panel">
            <Card.Content className="ob2-form">
              <div className="ob2-rules-heading">
                <CalendarDays aria-hidden size={22} />
                <h2>Organize sua agenda</h2>
              </div>
              <p className="ob2-copy">
                Um tempo para se preparar e uma agenda aberta na medida certa.
              </p>
              <GlassSelect
                label={fieldLabel('Com quanto tempo de antecedência a cliente pode marcar?', () =>
                  setHelp('notice'),
                )}
                value={String(notice)}
                options={hourOptions([0, 1, 2, 4, 8, 12, 24, 48], notice)}
                onChange={(value) => change({ bookingNoticeHours: Number(value) })}
              />
              <GlassSelect
                label={fieldLabel('Até quantos dias à frente ela pode escolher um horário?', () =>
                  setHelp('window'),
                )}
                value={String(windowDays)}
                options={[...new Set([7, 15, 30, 60, windowDays])]
                  .sort((a, b) => a - b)
                  .map((value) => ({ id: String(value), label: `${value} dias` }))}
                onChange={(value) => change({ bookingWindowDays: Number(value) })}
              />
              <p className="ob2-rule-example">
                <Clock3 size={18} aria-hidden />
                {notice
                  ? `Exemplo: para atender às 14h, a reserva precisa ser feita pelo menos ${notice} ${notice === 1 ? 'hora' : 'horas'} antes.`
                  : 'Sem antecedência mínima: a reserva pode ser feita até o horário do atendimento.'}
              </p>
            </Card.Content>
          </Card>
          <Card className="ob2-panel">
            <Card.Content className="ob2-form">
              <div className="ob2-rules-heading">
                <HeartHandshake aria-hidden size={22} />
                <h2>Quando os planos mudam</h2>
              </div>
              <GlassSelect
                label={fieldLabel('Até quando a cliente pode cancelar?', () => setHelp('cancel'))}
                value={String(preferences.cancellationHours)}
                options={hourOptions([0, 4, 8, 12, 24, 48], preferences.cancellationHours)}
                onChange={(value) => change({ cancellationHours: Number(value) })}
              />
              {special.length > 0 ? (
                <>
                  <GlassSelect
                    label={fieldLabel('E nos atendimentos com aparelhos especiais?', () =>
                      setHelp('special'),
                    )}
                    value={String(preferences.specialCancellationHours)}
                    options={hourOptions([12, 24, 48, 72], preferences.specialCancellationHours)}
                    onChange={(value) => change({ specialCancellationHours: Number(value) })}
                  />
                  <Help
                    items={[
                      {
                        title: `Ver ${special.length === 1 ? 'o serviço especial' : `os ${special.length} serviços especiais`}`,
                        text: special.map((service) => service.name).join(' · '),
                      },
                    ]}
                  />
                </>
              ) : null}
              <GlassSelect
                label={fieldLabel('Para remarcar, qual prazo você prefere?', () =>
                  setHelp('reschedule'),
                )}
                value={rescheduling == null ? 'same' : String(rescheduling)}
                options={[
                  { id: 'same', label: 'O mesmo prazo do cancelamento' },
                  ...hourOptions([0, 4, 8, 12, 24, 48], rescheduling ?? 12),
                ]}
                onChange={(value) =>
                  change({ reschedulingHours: value === 'same' ? null : Number(value) })
                }
              />
              {overrides.length > 0 ? (
                <p className="ob2-copy">
                  {overrides.length} serviço(s) já têm prazo próprio de cancelamento. Esse prazo tem
                  prioridade sobre o padrão.
                </p>
              ) : null}
              <Help
                items={[
                  {
                    title: 'Isso gera multa ou cobrança?',
                    text: 'Não. Estes prazos não criam multas, cobranças ou descontos de sessões. Você está definindo as condições do seu espaço.',
                  },
                  {
                    title: 'Como funciona “o mesmo prazo”?',
                    text: 'A remarcação acompanha o cancelamento do atendimento, inclusive quando um serviço tem um prazo diferente. Se escolher um prazo próprio para remarcar, ele será o mesmo para todos os serviços.',
                  },
                ]}
              />
            </Card.Content>
          </Card>
        </div>
        <aside className="ob2-rule-preview" aria-label="Resumo das regras escolhidas">
          <Image src="/brand/onboarding/calendar-3.png" width={112} height={112} alt="" />
          <span className="ob2-rule-eyebrow">SEUS COMBINADOS</span>
          <h2>{payload.name || 'Seu espaço'}, do seu jeito</h2>
          <dl>
            <div>
              <dt>Para agendar</dt>
              <dd>{notice === 0 ? 'Sem antecedência mínima' : `Pelo menos ${notice}h antes`}</dd>
            </div>
            <div>
              <dt>Agenda disponível</dt>
              <dd>Próximos {windowDays} dias</dd>
            </div>
            <div>
              <dt>Para cancelar</dt>
              <dd>{hours(preferences.cancellationHours)}</dd>
            </div>
            {special.length > 0 ? (
              <div>
                <dt>Atendimentos especiais</dt>
                <dd>{hours(preferences.specialCancellationHours)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Para remarcar</dt>
              <dd>{rescheduling == null ? 'Mesmo prazo do cancelamento' : hours(rescheduling)}</dd>
            </div>
          </dl>
          <p className="ob2-rule-status">
            <ShieldCheck size={20} aria-hidden />
            As escolhas ficam salvas no cadastro. A aplicação automática dessas regras depende da
            liberação do agendamento para clientes.
          </p>
        </aside>
      </div>
      <StepEnd error={error} footer={footer} />
      <BlurDialog
        className="ob2-rule-dialog"
        isOpen={help != null}
        size="md"
        title={helpCopy.title}
        onOpenChange={(open) => {
          if (!open) setHelp(null)
        }}
        footer={
          <Button className="ob2-cta" onPress={() => setHelp(null)}>
            Entendi
          </Button>
        }
      >
        <div className="ob2-rule-dialog-copy">
          {helpCopy.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </BlurDialog>
    </div>
  )
}

export function ReviewStep({
  payload,
  error,
  footer,
  onEdit,
  isDisabled = false,
}: {
  payload: Payload
  error: string
  footer: ReactNode
  onEdit: (step: number) => void
  isDisabled?: boolean
}) {
  const days = payload.businessHours.filter((day) => day.enabled)
  const dayByWeekday = new Map(payload.businessHours.map((day) => [day.weekday, day]))
  const orderedDays = weekOrder
    .map((weekday) => dayByWeekday.get(weekday))
    .filter((day): day is DaySchedule => Boolean(day))
  const edit = (key: (typeof stepInfo)[number]['key']) =>
    onEdit(stepInfo.findIndex((step) => step.key === key))
  const place =
    payload.clinic.city && payload.clinic.state
      ? `${payload.clinic.city}/${payload.clinic.state}`
      : payload.clinic.city || 'Endereço a completar'
  const address = clinicAddress(payload.clinic)
  const catalog = listedCategories(payload)
  const maxCategoryTotal = Math.max(1, ...catalog.map((row) => row.total))
  const span = serviceSpan(payload.services)
  const priceSpan = servicePriceSpan(payload.services)
  const quotes = payload.services.filter((service) => service.priceType === 'quote').length
  const priced = payload.services.length - quotes
  const sharedHours = sameRange(days)
  const paused = days.filter((day) => day.breaks.length > 0).length
  const holiday = payload.clinic.holidayHours
  const packageMode =
    payload.preferences.packagePaymentMode === 'clinic_only'
      ? 'Receber na clínica'
      : payload.preferences.packagePaymentMode === 'in_app'
        ? 'Receber pelo app'
        : 'A cliente escolhe'
  const notice = payload.preferences.bookingNoticeHours ?? 1
  const rescheduling = payload.preferences.reschedulingHours
  const special = payload.services.filter((service) => service.bookingMode === 'manual_release')
  const soloOwner = payload.professionals[0]
  const people =
    payload.teamMode === 'solo'
      ? [
          {
            id: 'owner',
            name: payload.ownerName || 'Você',
            role: 'Responsável · Atendimento individual',
            badge: `${payload.services.length || 'Todos os'} ${payload.services.length === 1 ? 'serviço' : 'serviços'}`,
            avatar: soloOwner?.photoUrl || soloOwner?.photoPreview || null,
          },
        ]
      : payload.professionals.map((person) => ({
          id: person.id,
          name: person.name,
          role: person.role || 'Profissional',
          badge: person.serviceNames.length
            ? `${person.serviceNames.length} ${person.serviceNames.length === 1 ? 'serviço' : 'serviços'}`
            : 'Profissional',
          avatar:
            person.photoUrl ||
            person.photoPreview ||
            professionalAvatarSrc[person.gender ?? 'female'],
        }))
  const groups: {
    title: string
    kicker: string
    icon: typeof HeartHandshake
    key: (typeof stepInfo)[number]['key']
    lead: string
    band?: string
    extra?: { key: (typeof stepInfo)[number]['key']; label: string }
    body: ReactNode
  }[] = [
    {
      title: 'Seu espaço',
      kicker: 'IDENTIDADE E CONTATO',
      icon: HeartHandshake,
      key: 'clinic',
      lead: payload.name || 'Nome da clínica a completar',
      band: [
        place,
        audienceSummary(payload.clinic.defaultAudience),
        payload.clinic.foundedYear ? `Desde ${payload.clinic.foundedYear}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      extra: { key: 'schedule', label: 'Endereço' },
      body: (
        <>
          <FactList
            items={[
              { label: 'Responsável', value: payload.ownerName },
              { label: 'Celular', value: formatBrPhone(payload.phone) },
              { label: 'E-mail', value: payload.email },
              {
                label: payload.clinic.taxIdKind === 'cpf' ? 'CPF' : 'CNPJ',
                value: payload.clinic.taxId,
              },
              { label: 'Instagram', value: payload.clinic.instagram },
              {
                label: 'Domicílio',
                value: payload.clinic.homeService ? 'Atende em casa' : 'Atendimento no espaço',
              },
            ]}
          />
          {address ? (
            <div className="ob2-review-note ob2-review-address">
              <span className="ob2-review-address-pin" aria-hidden>
                <MapPin size={16} />
              </span>
              <div className="ob2-review-address-copy">
                <strong>{address}</strong>
                {payload.clinic.postalCode ? <small>CEP {payload.clinic.postalCode}</small> : null}
              </div>
            </div>
          ) : null}
        </>
      ),
    },
    {
      title: 'Serviços',
      kicker: 'CATÁLOGO E VALORES',
      icon: HandHeart,
      key: 'catalog',
      lead: `${payload.services.length} ${payload.services.length === 1 ? 'serviço escolhido' : 'serviços escolhidos'}`,
      band: [
        span,
        priceSpan,
        priced ? `${priced} com valor` : '',
        quotes ? `${quotes} sob consulta` : '',
      ]
        .filter(Boolean)
        .join(' · '),
      extra: { key: 'services', label: 'Valores e duração' },
      body: (
        <>
          {catalog.length > 0 ? (
            <ul className="ob2-review-cats">
              {catalog.map((row) => {
                const art = categoryArtSrc(row.name)
                const share = Math.max(12, Math.round((row.total / maxCategoryTotal) * 100))
                return (
                  <li key={row.name}>
                    {art ? (
                      <span className="ob2-review-cat-art" aria-hidden>
                        <Image src={art} alt="" width={34} height={34} />
                      </span>
                    ) : null}
                    <div className="ob2-review-cat-main">
                      <span>{row.name}</span>
                      <i className="ob2-review-cat-bar" aria-hidden>
                        <b style={{ width: `${share}%` }} />
                      </i>
                    </div>
                    <b className="ob2-review-total">
                      {row.total}
                      <small>{row.total === 1 ? 'serviço' : 'serviços'}</small>
                    </b>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="ob2-review-note">Nenhuma categoria escolhida ainda.</p>
          )}
        </>
      ),
    },
    {
      title: 'Equipe',
      kicker: 'QUEM REALIZA',
      icon: Users,
      key: 'structure',
      lead:
        payload.teamMode === 'solo'
          ? 'Somente você'
          : `${payload.professionals.length} ${payload.professionals.length === 1 ? 'profissional' : 'profissionais'}`,
      band:
        payload.teamMode === 'solo'
          ? 'Agenda concentrada no seu perfil'
          : 'Agendas distribuídas por especialidade',
      body: (
        <>
          {people.length > 0 ? (
            <ul className="ob2-review-roster">
              {people.map((person) => (
                <li key={person.id} className="ob2-review-person">
                  <span
                    className={`ob2-review-person-avatar${person.avatar ? '' : ' is-icon'}`}
                    aria-hidden
                  >
                    {person.avatar ? (
                      <Image
                        src={person.avatar}
                        alt=""
                        width={46}
                        height={46}
                        unoptimized
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <UserRound size={22} />
                    )}
                  </span>
                  <div className="ob2-review-person-copy">
                    <strong>{person.name || 'Sem nome'}</strong>
                    <small>{person.role}</small>
                  </div>
                  <span className="ob2-review-person-badge">{person.badge}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ob2-review-note">Nenhuma pessoa na equipe ainda.</p>
          )}
          <FactList
            items={[
              {
                label: 'Formato',
                value:
                  payload.teamMode === 'solo'
                    ? 'Atendimento individual'
                    : 'Equipe multiprofissional',
              },
              {
                label: 'Público padrão',
                value: audienceSummary(payload.clinic.defaultAudience),
              },
            ]}
          />
        </>
      ),
    },
    {
      title: 'Horários',
      kicker: 'JORNADA SEMANAL',
      icon: CalendarDays,
      key: 'hours',
      lead: `${days.length} ${days.length === 1 ? 'dia' : 'dias'} de atendimento por semana`,
      band: sharedHours ? `Expediente padrão: ${sharedHours}` : 'Horários personalizados por dia',
      body: (
        <>
          {orderedDays.length > 0 ? (
            <ul className="ob2-review-chips">
              {orderedDays.map((day) => (
                <li key={day.weekday} className={day.enabled ? 'is-open' : 'is-closed'}>
                  <b>{shortDays[day.weekday] ?? dayNames[day.weekday]}</b>
                  <small>{day.enabled ? `${day.start}–${day.end}` : 'Folga'}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ob2-review-note">Nenhum dia aberto ainda.</p>
          )}
          <FactList
            items={[
              {
                label: 'Intervalo',
                value: paused
                  ? `${paused} ${paused === 1 ? 'dia com pausa' : 'dias com pausa'}`
                  : 'Sem pausa fixa',
              },
              {
                label: 'Feriados',
                value: holiday?.enabled ? `${holiday.start}–${holiday.end}` : 'Agenda fechada',
              },
            ]}
          />
        </>
      ),
    },
    {
      title: 'Pagamentos',
      kicker: 'RECEBIMENTO E PACOTES',
      icon: CreditCard,
      key: 'payments',
      lead: payload.preferences.acceptInApp ? 'Recebimento pelo app' : 'Diretamente com a clínica',
      band: payload.preferences.acceptInApp
        ? 'Checkout integrado via Stripe Connect'
        : 'Acerto direto no atendimento',
      body: (
        <FactList
          items={[
            {
              label: 'Atendimentos',
              value: payload.preferences.acceptInApp ? 'Pelo app' : 'Na clínica',
            },
            { label: 'Pacotes', value: packageMode },
            {
              label: 'Mensalidade agora',
              value: 'Nenhuma cobrança nesta etapa',
            },
          ]}
        />
      ),
    },
    {
      title: 'Regras',
      kicker: 'POLÍTICA DA AGENDA',
      icon: ShieldCheck,
      key: 'rules',
      lead: `Cancelar ${hours(payload.preferences.cancellationHours).toLocaleLowerCase('pt-BR')}`,
      band: `Janela aberta de ${payload.preferences.bookingWindowDays ?? 30} dias · ${notice === 0 ? 'Marcação livre' : `Mínimo ${notice}h antes`}`,
      body: (
        <>
          <FactList
            items={[
              {
                label: 'Para agendar',
                value: notice === 0 ? 'Sem antecedência mínima' : `Pelo menos ${notice}h antes`,
              },
              {
                label: 'Agenda aberta',
                value: `${payload.preferences.bookingWindowDays ?? 30} dias à frente`,
              },
              {
                label: 'Especiais',
                value: special.length ? hours(payload.preferences.specialCancellationHours) : '',
              },
              {
                label: 'Para remarcar',
                value: rescheduling == null ? 'Mesmo prazo do cancelamento' : hours(rescheduling),
              },
            ]}
          />
          <Help
            items={[
              {
                title: 'Ver todos os combinados',
                text: [
                  special.length
                    ? `Serviços especiais: cancelar ${hours(payload.preferences.specialCancellationHours).toLocaleLowerCase('pt-BR')}.`
                    : '',
                  rescheduling == null
                    ? 'Remarcação: mesmo prazo do cancelamento.'
                    : `Remarcação: ${hours(rescheduling).toLocaleLowerCase('pt-BR')}.`,
                ]
                  .filter(Boolean)
                  .join(' '),
              },
            ]}
          />
        </>
      ),
    },
  ]
  const logoName = payload.name || 'sua clínica'
  return (
    <div className="ob2-stack ob2-review">
      <Card className="ob2-panel ob2-review-welcome">
        <Card.Content>
          <div className="ob2-review-welcome-main">
            <div
              className="ob2-review-mark"
              role="img"
              aria-label={payload.clinic.logoUrl ? `Logo de ${logoName}` : `Marca de ${logoName}`}
            >
              {payload.clinic.logoUrl ? (
                <Image
                  src={payload.clinic.logoUrl}
                  alt=""
                  width={104}
                  height={104}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span>{markLetters(payload.name)}</span>
              )}
            </div>
            <div className="ob2-review-welcome-copy">
              <h2>{payload.name || 'Seu espaço'}</h2>
              <p>Você chegou até aqui! Falta só conferir o resumo e abrir sua clínica.</p>
              <div className="ob2-review-welcome-tags">
                <span>
                  <MapPin size={13} aria-hidden />
                  {place}
                </span>
                <span>{audienceSummary(payload.clinic.defaultAudience)}</span>
                {payload.clinic.foundedYear ? (
                  <span>Desde {payload.clinic.foundedYear}</span>
                ) : null}
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>
      <div className="ob2-review-grid">
        {groups.map(({ title, kicker, icon: Icon, key, lead, band, extra, body }) => (
          <Card className="ob2-panel ob2-review-card" key={key}>
            <Card.Content>
              <div className="ob2-review-card-heading">
                <span className="ob2-review-symbol">
                  <Icon size={20} aria-hidden />
                </span>
                <div className="ob2-review-card-titles">
                  <span className="ob2-review-kicker">{kicker}</span>
                  <h2>{title}</h2>
                </div>
                <Button
                  className="ob2-review-edit"
                  variant="ghost"
                  isDisabled={isDisabled}
                  aria-label={`Editar ${title.toLocaleLowerCase('pt-BR')}`}
                  onPress={() => edit(key)}
                >
                  <Pencil size={14} aria-hidden />
                  Editar
                </Button>
              </div>
              <div className="ob2-review-lead-box">
                <p className="ob2-review-lead">{lead}</p>
                {band ? <p className="ob2-review-band">{band}</p> : null}
              </div>
              <div className="ob2-review-card-body">{body}</div>
              {extra ? (
                <Button
                  className="ob2-review-detail"
                  variant="ghost"
                  isDisabled={isDisabled}
                  onPress={() => edit(extra.key)}
                >
                  <Pencil size={13} aria-hidden />
                  Editar {extra.label.toLocaleLowerCase('pt-BR')}
                </Button>
              ) : null}
            </Card.Content>
          </Card>
        ))}
      </div>
      <div className="ob2-review-finale">
        <Help
          items={[
            {
              title: 'O que acontece ao concluir?',
              text: 'O cadastro, os serviços, a equipe e as preferências ficam salvos para sua clínica. Você será levada ao painel. Esta ação não cobra clientes nem ativa automaticamente o agendamento público.',
            },
          ]}
        />
        <StepEnd error={error} footer={footer} />
      </div>
    </div>
  )
}
