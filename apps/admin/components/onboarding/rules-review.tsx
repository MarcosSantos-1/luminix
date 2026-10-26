import { Accordion, Button, Card } from '@heroui/react'
import {
  CalendarDays,
  CircleHelp,
  Clock3,
  CreditCard,
  HeartHandshake,
  Pencil,
  Scissors,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import Image from 'next/image'
import { useState, type ReactNode } from 'react'
import { dayNames, stepInfo, type Payload } from './model'
import { BlurDialog, GlassSelect, StepEnd } from './ui'
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
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
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
  const edit = (key: (typeof stepInfo)[number]['key']) =>
    onEdit(stepInfo.findIndex((step) => step.key === key))
  const groups = [
    {
      title: 'Seu espaço',
      icon: HeartHandshake,
      key: 'clinic' as const,
      value: payload.name,
      detail: `${payload.ownerName} · ${formatBrPhone(payload.phone)} · ${payload.clinic.city ? `${payload.clinic.city}/${payload.clinic.state}` : 'Endereço a completar'}`,
      extra: { key: 'schedule' as const, label: 'Endereço' },
    },
    {
      title: 'Serviços',
      icon: Scissors,
      key: 'catalog' as const,
      value: `${payload.services.length} ${payload.services.length === 1 ? 'serviço escolhido' : 'serviços escolhidos'}`,
      detail: payload.occupations.join(' · '),
      extra: { key: 'services' as const, label: 'Valores e duração' },
    },
    {
      title: 'Equipe',
      icon: Users,
      key: 'structure' as const,
      value:
        payload.teamMode === 'solo'
          ? 'Somente você'
          : `${payload.professionals.length} profissionais`,
      detail:
        payload.teamMode === 'solo'
          ? payload.ownerName
          : payload.professionals.map((person) => person.name).join(' · '),
    },
    {
      title: 'Horários',
      icon: CalendarDays,
      key: 'hours' as const,
      value: `${days.length} ${days.length === 1 ? 'dia' : 'dias'} de atendimento por semana`,
      detail: days.map((day) => dayNames[day.weekday]).join(' · '),
    },
    {
      title: 'Pagamentos',
      icon: CreditCard,
      key: 'payments' as const,
      value: payload.preferences.acceptInApp
        ? 'Recebimento pelo app selecionado'
        : 'Diretamente com a clínica',
      detail: `Pacotes: ${payload.preferences.packagePaymentMode === 'clinic_only' ? 'receber na clínica' : payload.preferences.packagePaymentMode === 'in_app' ? 'receber pelo app' : 'a cliente escolhe'}`,
    },
    {
      title: 'Regras',
      icon: ShieldCheck,
      key: 'rules' as const,
      value: `Cancelamento: ${hours(payload.preferences.cancellationHours).toLocaleLowerCase('pt-BR')}`,
      detail: `Agenda: ${payload.preferences.bookingWindowDays ?? 30} dias à frente · ${payload.preferences.bookingNoticeHours ?? 1}h de antecedência`,
    },
  ]
  return (
    <div className="ob2-stack ob2-review">
      <Card className="ob2-panel ob2-review-welcome">
        <Card.Content>
          <Image
            src="/brand/onboarding/ministudio-illustration.png"
            width={100}
            height={100}
            alt=""
          />
          <div>
            <span className="ob2-rule-eyebrow">FEITO COM CUIDADO</span>
            <h2>{payload.name || 'Seu espaço'}</h2>
            <p>Você chegou até aqui! Falta só conferir e concluir o cadastro.</p>
          </div>
          <Sparkles size={24} aria-hidden />
        </Card.Content>
      </Card>
      <div className="ob2-review-grid">
        {groups.map(({ title, icon: Icon, key, value, detail, extra }) => (
          <Card className="ob2-panel ob2-review-card" key={key}>
            <Card.Content>
              <div className="ob2-review-card-heading">
                <span className="ob2-review-symbol">
                  <Icon size={20} aria-hidden />
                </span>
                <h2>{title}</h2>
                <Button
                  className="ob2-review-edit"
                  variant="ghost"
                  isDisabled={isDisabled}
                  aria-label={`Editar ${title.toLocaleLowerCase('pt-BR')}`}
                  onPress={() => edit(key)}
                >
                  <Pencil size={15} aria-hidden />
                  Editar
                </Button>
              </div>
              <strong>{value}</strong>
              <p>{detail || 'Não informado'}</p>
              {key === 'rules' ? (
                <Help
                  items={[
                    {
                      title: 'Ver todos os combinados',
                      text: [
                        payload.services.some((service) => service.bookingMode === 'manual_release')
                          ? `Serviços especiais: cancelar ${hours(payload.preferences.specialCancellationHours).toLocaleLowerCase('pt-BR')}.`
                          : '',
                        payload.preferences.reschedulingHours == null
                          ? 'Remarcação: mesmo prazo do cancelamento.'
                          : `Remarcação: ${hours(payload.preferences.reschedulingHours).toLocaleLowerCase('pt-BR')}.`,
                      ]
                        .filter(Boolean)
                        .join(' '),
                    },
                  ]}
                />
              ) : null}
              {extra ? (
                <Button
                  className="ob2-review-detail"
                  variant="ghost"
                  isDisabled={isDisabled}
                  onPress={() => edit(extra.key)}
                >
                  Editar {extra.label.toLocaleLowerCase('pt-BR')}
                </Button>
              ) : null}
            </Card.Content>
          </Card>
        ))}
      </div>
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
  )
}
