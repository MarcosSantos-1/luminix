import { Accordion, Button, Card, Description, Label, TextArea, TextField } from '@heroui/react'
import {
  CalendarDays,
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
import type { ReactNode } from 'react'
import { dayNames, stepInfo, type Payload } from './model'
import { GlassSelect, StepEnd } from './ui'
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
  const notice = preferences.bookingNoticeHours ?? 2
  const windowDays = preferences.bookingWindowDays ?? 60
  const special = payload.services.filter((service) => service.bookingMode === 'manual_release')
  const overrides = payload.services.filter((service) => service.cancellationHours !== null)
  const rescheduling = preferences.reschedulingHours
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
                label="Com quanto tempo de antecedência a cliente pode marcar?"
                value={String(notice)}
                options={hourOptions([0, 1, 2, 4, 8, 12, 24, 48], notice)}
                onChange={(value) => change({ bookingNoticeHours: Number(value) })}
              />
              <GlassSelect
                label="Até quantos dias à frente ela pode escolher um horário?"
                value={String(windowDays)}
                options={[...new Set([7, 15, 30, 60, 90, 180, 365, windowDays])]
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
                label="Até quando a cliente pode cancelar?"
                value={String(preferences.cancellationHours)}
                options={hourOptions([0, 4, 8, 12, 24, 48], preferences.cancellationHours)}
                onChange={(value) => change({ cancellationHours: Number(value) })}
              />
              {special.length > 0 ? (
                <>
                  <GlassSelect
                    label="E nos atendimentos com aparelhos especiais?"
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
                label="Para remarcar, qual prazo você prefere?"
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
          <Card className="ob2-panel">
            <Card.Content className="ob2-form">
              <div className="ob2-rules-heading">
                <HeartHandshake aria-hidden size={22} />
                <h2>Um recado do seu espaço</h2>
              </div>
              <TextField
                className="ob2-field"
                value={preferences.clientInstructions ?? ''}
                onChange={(value) => change({ clientInstructions: value })}
              >
                <Label>
                  O que a cliente precisa saber? <span className="ob2-rule-optional">Opcional</span>
                </Label>
                <TextArea
                  rows={3}
                  maxLength={500}
                  placeholder="Ex.: se puder, chegue 10 minutos antes. Assim podemos receber você com calma."
                />
                <Description>
                  Escreva apenas orientações gerais, sem dados pessoais de clientes.{' '}
                  {(preferences.clientInstructions ?? '').length}/500
                </Description>
              </TextField>
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
          {preferences.clientInstructions?.trim() ? (
            <p className="ob2-rule-message">“{preferences.clientInstructions.trim()}”</p>
          ) : null}
          <p className="ob2-rule-status">
            <ShieldCheck size={20} aria-hidden />
            As escolhas ficam salvas no cadastro. A aplicação automática dessas regras e a exibição
            do recado dependem da liberação do agendamento para clientes.
          </p>
        </aside>
      </div>
      <StepEnd error={error} footer={footer} />
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
      detail: `Agenda: ${payload.preferences.bookingWindowDays ?? 60} dias à frente · ${payload.preferences.bookingNoticeHours ?? 2}h de antecedência`,
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
                        payload.preferences.clientInstructions?.trim()
                          ? `Recado: ${payload.preferences.clientInstructions.trim()}`
                          : 'Sem recado adicional.',
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
