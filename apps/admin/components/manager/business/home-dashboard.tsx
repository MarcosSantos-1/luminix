'use client'

import { Button, Card, Chip } from '@heroui/react'
import {
  AlertTriangle,
  ArrowRight,
  BadgePercent,
  CalendarDays,
  Check,
  ChevronRight,
  Package,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { useState } from 'react'
import { useClinicApi, useClinicResource } from '../settings/clinic-api'
import { LoadError, SettingsSkeleton } from '../settings/settings-kit'
import { managerNavigation, type ManagerSectionId } from '../demo-data'
import { appointmentStatus, money } from './format'
import { activityDetail, activityKinds, activityTitle, timeAgo } from '../workspace/activity-copy'
import { useWorkspaceSignals } from '../workspace/workspace-signals'
import { AppointmentSheet, ClientAvatar } from '../appointments/appointment-sheet'
import { BookingModal, QuickClientModal } from '../appointments/booking-modal'
import { clock, dayLabel, needsAttention, type AppointmentView } from '../appointments/model'
import { AddClientIcon, NewBookingIcon, WeekAgendaIcon } from '../appointments/quick-icons'
import { QuickModal } from '../quick-modal'
import { AgendaPanel } from '../sections/agenda-panel'
import './business.css'

type Dashboard = {
  today: string
  appointments: AppointmentView[]
  /** Next open appointments after today. */
  upcoming?: AppointmentView[]
  upcomingWeek: number
  canManageAgenda: boolean
  canCharge?: boolean
  canOpenClients?: boolean
  clients?: { newThisMonth: number; total: number }
  finance?: { monthIncomeCents: number; monthExpenseCents: number; todayExpectedCents: number }
  lowStock?: { name: string; quantity: number; unit: string }[]
  activePromotions: number
  activity?: {
    entity: string
    action: string
    label: string | null
    detail: string | null
    createdAt: string
  }[]
}

/** A client of the day (or of the next days) as one big button that opens the sheet. */
function AppointmentRow({
  item,
  showDay,
  onOpen,
}: {
  item: AppointmentView
  showDay?: boolean
  onOpen: (item: AppointmentView) => void
}) {
  const status = appointmentStatus[item.status] ?? appointmentStatus.confirmed
  return (
    <button
      type="button"
      className={`apt-row is-${item.status}`}
      onClick={() => onOpen(item)}
      aria-label={`${item.client}, ${item.service}, ${clock(item.startsAt)}. Abrir opções`}
    >
      <time>
        {showDay ? (
          <small>
            {dayLabel(item.startsAt).split(',')[0]}{' '}
            {dayLabel(item.startsAt).split(', ')[1]?.slice(0, 2)}
          </small>
        ) : null}
        {clock(item.startsAt)}
      </time>
      <ClientAvatar name={item.client} photoUrl={item.photoUrl} />
      <span className="apt-row-copy">
        <strong>{item.client}</strong>
        <span>
          {item.service}
          {item.professional ? ` · ${item.professional}` : ''}
          {item.priceCents != null ? ` · ${money(item.priceCents)}` : ''}
        </span>
      </span>
      <span className="apt-row-tags">
        {needsAttention(item) ? (
          <span className="apt-tag is-attention" title="Tem observações importantes">
            <AlertTriangle size={13} aria-hidden /> Atenção
          </span>
        ) : null}
        {item.previousStartsAt ? (
          <span className="apt-tag" title="Remarcado">
            <RotateCcw size={12} aria-hidden /> Remarcado
          </span>
        ) : null}
        {item.status !== 'canceled' ? (
          <span className={`apt-tag ${item.paid ? 'is-paid' : 'is-due'}`}>
            {item.paid ? 'Pago' : 'A receber'}
          </span>
        ) : null}
        <span className={`apt-tag is-status tone-${status.tone} is-${item.status}`}>
          {status.label}
        </span>
      </span>
      <ChevronRight size={18} className="apt-row-go" aria-hidden />
    </button>
  )
}

export function HomeDashboard({
  clinicId,
  sections,
  onNavigate,
  onOpenClient,
}: {
  clinicId: string
  sections: ManagerSectionId[]
  onNavigate: (label: string) => void
  onOpenClient?: (client: { id: string; name: string }) => void
}) {
  const api = useClinicApi(clinicId)
  const signals = useWorkspaceSignals()
  const dashboard = useClinicResource<Dashboard>(api, 'dashboard')
  const [notice, setNotice] = useState('')
  const [opened, setOpened] = useState<AppointmentView | null>(null)
  const [quick, setQuick] = useState<'booking' | 'agenda' | 'client' | null>(null)
  if (dashboard.error && !dashboard.data)
    return <LoadError message={dashboard.error} onRetry={dashboard.reload} />
  if (!dashboard.data) return <SettingsSkeleton cards={2} />
  const data = dashboard.data
  const live = data.appointments.filter((item) => item.status !== 'canceled')
  const done = live.filter((item) => item.status === 'completed').length
  const upcoming = data.upcoming ?? []
  const changed = (message: string) => {
    setNotice(message)
    dashboard.reload()
    signals?.refresh()
  }

  const stats = [
    { label: 'Atendimentos hoje', value: String(live.length), detail: `${done} concluídos` },
    ...(data.finance
      ? [
          {
            label: 'Previsto hoje',
            value: money(data.finance.todayExpectedCents),
            detail: 'Pelos preços da agenda',
          },
          {
            label: 'Recebido no mês',
            value: money(data.finance.monthIncomeCents),
            detail: `Saídas: ${money(data.finance.monthExpenseCents)}`,
          },
        ]
      : []),
    ...(data.clients
      ? [
          {
            label: 'Clientes novas',
            value: String(data.clients.newThisMonth),
            detail: `${data.clients.total} no total`,
          },
        ]
      : []),
    { label: 'Próximos 7 dias', value: String(data.upcomingWeek), detail: 'atendimentos marcados' },
  ]
  const alerts = [
    ...(data.lowStock ?? []).map((item) => ({
      icon: Package,
      title: `${item.name} acabando`,
      detail: `Restam ${item.quantity.toLocaleString('pt-BR')} ${item.unit}`,
      target: 'Estoque',
    })),
    ...(data.activePromotions
      ? [
          {
            icon: BadgePercent,
            title: `${data.activePromotions} ${data.activePromotions === 1 ? 'promoção ativa' : 'promoções ativas'}`,
            detail: 'O site mostra os preços com desconto',
            target: 'Serviços',
          },
        ]
      : []),
  ]
  const shortcuts = managerNavigation.filter(
    (item) => item.id !== 'inicio' && item.id !== 'configuracoes' && sections.includes(item.id),
  )

  return (
    <>
      <section className="manager-actions" aria-label="Ações principais">
        {(
          [
            {
              id: 'booking',
              title: 'Novo agendamento',
              detail: 'Abra espaço para um novo cuidado',
              icon: NewBookingIcon,
              show: data.canManageAgenda,
            },
            {
              id: 'agenda',
              title: 'Agenda semanal',
              detail: 'Sua semana, bem organizada',
              icon: WeekAgendaIcon,
              show: true,
            },
            {
              id: 'client',
              title: 'Adicionar cliente',
              detail: 'Uma nova história começa aqui',
              icon: AddClientIcon,
              show: Boolean(data.clients),
            },
          ] as const
        )
          .filter((item) => item.show)
          .map(({ id, title, detail, icon: Icon }) => (
            <Button key={id} className="manager-action" onPress={() => setQuick(id)}>
              <div>
                <strong>{title}</strong>
                <span>{detail}</span>
              </div>
              <Icon />
            </Button>
          ))}
      </section>
      {notice ? (
        <p className="team-notice" role="status">
          <Check size={16} aria-hidden /> {notice}
        </p>
      ) : null}
      <div className="manager-grid">
        <Card className="manager-panel manager-agenda">
          <Card.Header className="manager-panel-heading">
            <div>
              <Card.Title>Clientes do dia</Card.Title>
              <Chip size="sm" variant="soft">
                {live.length}
              </Chip>
            </div>
            <Button variant="ghost" onPress={() => setQuick('agenda')}>
              Ver agenda <ArrowRight size={16} />
            </Button>
          </Card.Header>
          <Card.Content className="apt-day">
            {data.appointments.length ? (
              <div className="apt-rows">
                {data.appointments.map((item) => (
                  <AppointmentRow key={item.id} item={item} onOpen={setOpened} />
                ))}
              </div>
            ) : (
              <div className="apt-quiet">
                <CalendarDays size={22} aria-hidden />
                <p>
                  <strong>Nenhum atendimento hoje.</strong>
                  {upcoming.length
                    ? ' Aproveite para confirmar quem vem nos próximos dias.'
                    : ' Que tal chamar quem não vem há um tempo?'}
                </p>
                {data.canManageAgenda ? (
                  <Button size="sm" variant="secondary" onPress={() => setQuick('booking')}>
                    <Plus size={15} aria-hidden /> Agendar
                  </Button>
                ) : null}
              </div>
            )}
            {upcoming.length ? (
              <section className="apt-next" aria-label="Próximos dias">
                <h3>Próximos dias</h3>
                <div className="apt-rows">
                  {upcoming.slice(0, data.appointments.length > 3 ? 3 : 6).map((item) => (
                    <AppointmentRow key={item.id} item={item} showDay onOpen={setOpened} />
                  ))}
                </div>
              </section>
            ) : null}
          </Card.Content>
          <Card.Footer className="manager-agenda-footer">
            <span>
              <span className="manager-dot" />{' '}
              {done ? `${done} de ${live.length} concluídos` : 'Um dia cheio de boas conexões'}
            </span>
            <span>{live.length} atendimentos</span>
          </Card.Footer>
        </Card>
        {data.activity ? (
          <Card className="manager-panel manager-activity">
            <Card.Header className="manager-panel-heading">
              <Card.Title>Atividades recentes</Card.Title>
              {signals?.canAudit ? (
                <Button size="sm" variant="ghost" onPress={signals.openCenter}>
                  Ver todas
                </Button>
              ) : null}
            </Card.Header>
            <Card.Content>
              {data.activity.length ? (
                data.activity.slice(0, 6).map((item, index) => {
                  const Icon = (activityKinds[item.entity] ?? activityKinds.appointments).icon
                  return (
                    <div className="manager-event" key={`${item.createdAt}-${index}`}>
                      <span className={`manager-event-icon act-kind act-${item.entity}`}>
                        <Icon size={19} />
                      </span>
                      <div>
                        <strong>{activityTitle(item)}</strong>
                        <p>{activityDetail(item) || '—'}</p>
                      </div>
                      <time>{timeAgo(item.createdAt)}</time>
                    </div>
                  )
                })
              ) : (
                <p className="settings-muted">As novidades do espaço aparecem aqui.</p>
              )}
            </Card.Content>
          </Card>
        ) : null}
        <Card className="manager-panel">
          <Card.Header>
            <Card.Title>Acesso rápido</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="manager-shortcuts">
              {shortcuts.slice(0, 6).map(({ label, icon: Icon }) => (
                <Button key={label} variant="secondary" onPress={() => onNavigate(label)}>
                  <Icon size={24} strokeWidth={1.5} />
                  <span>{label}</span>
                </Button>
              ))}
            </div>
            <div className="manager-summary-title">
              <h2>Seu dia em números</h2>
              <span>Dados reais</span>
            </div>
            <div className="manager-stats">
              {stats.slice(0, 4).map((stat) => (
                <div key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                  <small>{stat.detail}</small>
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
        <Card className="manager-panel">
          <Card.Header>
            <Card.Title>Fique de olho</Card.Title>
          </Card.Header>
          <Card.Content>
            {alerts.length ? (
              <ul className="home-alerts">
                {alerts.map(({ icon: Icon, title, detail, target }) => (
                  <li key={title}>
                    <button type="button" onClick={() => onNavigate(target)}>
                      <Icon size={18} aria-hidden />
                      <span>
                        <strong>{title}</strong>
                        <small>{detail}</small>
                      </span>
                      <ChevronRight size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="biz-empty">
                <Check size={24} aria-hidden />
                <p>
                  Tudo em ordem por aqui. Avisos de estoque baixo e promoções aparecem neste espaço.
                </p>
              </div>
            )}
          </Card.Content>
        </Card>
      </div>
      <AppointmentSheet
        api={api}
        item={opened}
        today={data.today}
        access={{
          manage: data.canManageAgenda,
          charge: data.canCharge ?? Boolean(data.finance),
          openClients: data.canOpenClients ?? Boolean(data.clients),
        }}
        onClose={() => setOpened(null)}
        onChanged={changed}
        onOpenClient={onOpenClient}
      />
      <BookingModal
        api={api}
        isOpen={quick === 'booking'}
        onOpenChange={(open) => setQuick(open ? 'booking' : null)}
        onCreated={changed}
      />
      <QuickClientModal
        api={api}
        isOpen={quick === 'client'}
        onOpenChange={(open) => setQuick(open ? 'client' : null)}
        onCreated={changed}
        onOpenFull={() => onNavigate('Adicionar cliente')}
      />
      <QuickModal
        isOpen={quick === 'agenda'}
        onOpenChange={(open) => {
          setQuick(open ? 'agenda' : null)
          if (!open) dashboard.reload()
        }}
        size="wide"
        title="Agenda semanal"
        footer={
          <Button variant="secondary" onPress={() => onNavigate('Agenda completa')}>
            Abrir a agenda completa <ArrowRight size={16} />
          </Button>
        }
      >
        {quick === 'agenda' ? (
          <AgendaPanel clinicId={clinicId} embedded onOpenClient={onOpenClient} />
        ) : null}
      </QuickModal>
    </>
  )
}
