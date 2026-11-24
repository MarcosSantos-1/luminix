'use client'

import { Button, Card } from '@heroui/react'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BadgePercent,
  CalendarDays,
  CalendarX,
  QrCode,
  Check,
  EllipsisVertical,
  Package,
  Plus,
} from 'lucide-react'
import { useState } from 'react'
import { useClinicApi, useClinicResource, type ClinicApi } from '../settings/clinic-api'
import { LoadError, SettingsSkeleton } from '../settings/settings-kit'
import { managerNavigation, type ManagerSectionId } from '../demo-data'
import { money, shortName } from './format'
import { activityDetail, activityKinds, activityTitle, timeAgo } from '../workspace/activity-copy'
import { useWorkspaceSignals, type GoTarget } from '../workspace/workspace-signals'
import { managerUpdates } from '../manager-updates'
import { HomeBanner } from './home-banner'
import { DepositChecklist, type PendingDeposit } from './deposit-checklist'
import { AppointmentSheet, ClientAvatar } from '../appointments/appointment-sheet'
import { BookingModal, QuickClientModal } from '../appointments/booking-modal'
import {
  clock,
  dayLabel,
  needsAttention,
  serviceTitle,
  visitBadge,
  type AppointmentView,
} from '../appointments/model'
import { AddClientIcon, NewBookingIcon, WeekAgendaIcon } from '../appointments/quick-icons'
import { QuickModal } from '../quick-modal'
import { AgendaPanel } from '../sections/agenda-panel'
import './business.css'
import { ToastNotice } from '@/components/ui/toast-notice'

type Dashboard = {
  today: string
  appointments: AppointmentView[]
  /** Next open appointments after today. */
  upcoming?: AppointmentView[]
  unlinkedRentalServices?: string[]
  upcomingWeek: number
  canManageAgenda: boolean
  canCharge?: boolean
  canOpenClients?: boolean
  clients?: { newThisMonth: number; total: number }
  finance?: { monthIncomeCents: number; monthExpenseCents: number; todayExpectedCents: number }
  lowStock?: { name: string; quantity: number; unit: string }[]
  expiringStock?: { name: string; days: number }[]
  activePromotions: number
  /** Sinais por Pix to check (ADR-037); only for who manages the agenda. */
  pendingDeposits?: PendingDeposit[]
  activity?: {
    entity: string
    action: string
    label: string | null
    detail: string | null
    createdAt: string
  }[]
}

/**
 * Status on the day list. "Confirmado" is a WhatsApp or client-area confirmation, or a visit that
 * already passed check-in. Check-in that was finished is "Concluído". A plain booking is "Pendente"
 * (there is no separate "Agendado"). Reschedules stay in the sheet, not as a badge.
 */
function dayBadge(item: AppointmentView) {
  const badge = visitBadge(item)
  return { ...badge, verified: badge.tone === 'done' }
}

/** Payment sits under the status and inherits its color. Hidden when there is nothing to settle. */
function payLabel(item: AppointmentView) {
  if (item.status === 'canceled' || item.status === 'no_show' || item.priceCents == null)
    return null
  if (item.package)
    return item.package.dueNowCents ? 'A receber' : item.package.plan === 'paid' ? null : 'Pago'
  if (!item.paid && item.priceCents === 0 && item.priceType !== 'quote') return null
  return item.paid ? 'Pago' : 'A receber'
}

/** A client of the day (or of the next days) as one row that opens the sheet. */
function AppointmentRow({
  item,
  showDay,
  onOpen,
  api,
}: {
  item: AppointmentView
  api: ClinicApi
  showDay?: boolean
  onOpen: (item: AppointmentView) => void
}) {
  const badge = dayBadge(item)
  const pay = payLabel(item)
  return (
    <button
      type="button"
      className={`apt-row is-${item.status}`}
      onClick={() => onOpen(item)}
      aria-label={`${item.client}, ${item.service}, ${clock(item.startsAt)}${needsAttention(item) ? ', tem observações' : ''}. Abrir opções`}
    >
      <time className="lx-neon">
        {showDay ? (
          <small>
            {dayLabel(item.startsAt).split(',')[0]}{' '}
            {dayLabel(item.startsAt).split(', ')[1]?.slice(0, 2)}
          </small>
        ) : null}
        {clock(item.startsAt)}
        {item.status === 'completed' ? (
          <span className="apt-time-done" aria-hidden>
            <Check size={10} strokeWidth={3.5} />
          </span>
        ) : null}
      </time>
      <ClientAvatar
        name={item.client}
        photoUrl={item.photoUrl}
        account={item.accountPhoto ? { api, clientId: item.clientId } : null}
      />
      <span className="apt-row-copy">
        <span className="apt-name">
          <strong title={item.client}>
            <span className="apt-name-full">{item.client}</span>
            <span className="apt-name-short">{shortName(item.client)}</span>
          </strong>
          {needsAttention(item) ? (
            <span className="apt-flag" title="Tem observações importantes">
              <AlertTriangle size={15} aria-hidden />
            </span>
          ) : null}
        </span>
        <span>
          {serviceTitle(item)}
          {item.professional ? <em className="apt-pro"> · {item.professional}</em> : null}
        </span>
      </span>
      <span className={`apt-row-tags is-${badge.tone}`}>
        <span className="apt-status">
          {badge.verified ? <BadgeCheck size={13} aria-hidden /> : null}
          {badge.label}
        </span>
        {pay ? <span className="apt-pay">{pay}</span> : null}
      </span>
      <span className="apt-row-more" aria-hidden>
        <EllipsisVertical size={18} />
      </span>
    </button>
  )
}

const latestUpdate = managerUpdates[0]
const updateBannerKey = (clinicId: string) => `luminix:update-banner:${clinicId}`

/** "A, B e C" — at most three names, then "e mais N". */
function listNames(names: string[]) {
  const shown = names.slice(0, 3)
  const rest = names.length - shown.length
  if (rest > 0) return `${shown.join(', ')} e mais ${rest}`
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} e ${shown.at(-1)}` : (shown[0] ?? '')
}

export function HomeDashboard({
  clinicId,
  sections,
  onNavigate,
  onGo,
  onOpenClient,
}: {
  clinicId: string
  sections: ManagerSectionId[]
  onNavigate: (label: string) => void
  /** Opens a page on a given tab (e.g. Marketing → Promoções). */
  onGo?: (target: GoTarget) => void
  onOpenClient?: (client: { id: string; name: string }) => void
}) {
  const api = useClinicApi(clinicId)
  const signals = useWorkspaceSignals()
  const [seenUpdate, setSeenUpdate] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(updateBannerKey(clinicId))
    } catch {
      return null
    }
  })
  const dismissUpdate = (id: string) => {
    setSeenUpdate(id)
    try {
      window.localStorage.setItem(updateBannerKey(clinicId), id)
    } catch {
      // Hidden for this visit only.
    }
  }
  const dashboard = useClinicResource<Dashboard>(api, 'dashboard')
  const [notice, setNotice] = useState('')
  const [opened, setOpened] = useState<AppointmentView | null>(null)
  const [quick, setQuick] = useState<'booking' | 'agenda' | 'client' | 'deposits' | null>(null)
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
  const lowStock = data.lowStock ?? []
  const expiring = data.expiringStock ?? []
  const expired = expiring.filter((item) => item.days < 0)
  const openPromotions = () =>
    onGo && sections.includes('marketing')
      ? onGo({ section: 'marketing', tab: 'promotions' })
      : onNavigate(sections.includes('marketing') ? 'Marketing' : 'Serviços')
  const deposits = data.pendingDeposits ?? []
  const reported = deposits.filter((item) => item.status === 'reported').length
  const banners: (Parameters<typeof HomeBanner>[0] & { id: string })[] = [
    // First: money the client says she already sent is waiting for the team.
    ...(deposits.length
      ? [
          {
            id: 'deposits',
            title: 'Sinais para conferir',
            text: reported
              ? `${reported === 1 ? '1 cliente avisou' : `${reported} clientes avisaram`} que pagou o sinal por Pix. Confira no extrato e confirme.`
              : `${deposits.length === 1 ? '1 reserva aguarda' : `${deposits.length} reservas aguardam`} o pagamento do sinal.`,
            icon: QrCode,
            action: { label: 'Conferir', onPress: () => setQuick('deposits') },
          },
        ]
      : []),
    ...(latestUpdate && signals?.openUpdates && seenUpdate !== latestUpdate.id
      ? [
          {
            id: 'update',
            title: 'Atualização Luminix',
            text: latestUpdate.title,
            art: '/brand/others/megaphone.webp',
            action: { label: 'Ver novidades', onPress: signals.openUpdates },
            onDismiss: () => dismissUpdate(latestUpdate.id),
          },
        ]
      : []),
    ...(lowStock.length
      ? [
          {
            id: 'low-stock',
            title: 'Estoque baixo',
            text:
              lowStock.length === 1
                ? `${lowStock[0].name} está acabando: restam ${lowStock[0].quantity.toLocaleString('pt-BR')} ${lowStock[0].unit}.`
                : `${lowStock.length} itens acabando: ${listNames(lowStock.map((item) => item.name))}.`,
            icon: Package,
            action: { label: 'Ver estoque', onPress: () => onNavigate('Estoque') },
          },
        ]
      : []),
    ...(expiring.length
      ? [
          {
            id: 'expiring',
            title: expired.length ? 'Produtos vencidos' : 'Validade próxima',
            text: expired.length
              ? `Separe antes de usar: ${listNames(expired.map((item) => item.name))}.`
              : expiring.length === 1
                ? `${expiring[0].name} ${expiring[0].days === 0 ? 'vence hoje' : `vence em ${expiring[0].days} ${expiring[0].days === 1 ? 'dia' : 'dias'}`}. Use primeiro.`
                : `Use primeiro: ${listNames(expiring.map((item) => item.name))}.`,
            icon: CalendarX,
            action: { label: 'Ver estoque', onPress: () => onNavigate('Estoque') },
          },
        ]
      : []),
    ...(data.activePromotions
      ? [
          {
            id: 'promotions',
            title: 'Promoções ativas',
            text: `${data.activePromotions === 1 ? '1 promoção no ar' : `${data.activePromotions} promoções no ar`}: o site já mostra os preços com desconto.`,
            icon: BadgePercent,
            action: { label: 'Ver promoções', onPress: openPromotions },
          },
        ]
      : []),
    ...(data.unlinkedRentalServices?.length
      ? [
          {
            id: 'rental',
            title: 'Vincule um aparelho',
            text: `Estes serviços precisam de um aparelho: ${listNames(data.unlinkedRentalServices)}.`,
            icon: CalendarDays,
            action: { label: 'Programar', onPress: () => onNavigate('Programar locação') },
          },
        ]
      : []),
  ]
  // Agenda, Clientes and Serviços already sit in the main actions and the menu.
  const shortcuts = managerNavigation.filter(
    (item) =>
      ['financeiro', 'estoque', 'marketing'].includes(item.id) && sections.includes(item.id),
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
          .map(({ id, title, icon: Icon }) => (
            <Button key={id} className="manager-action lx-neon" onPress={() => setQuick(id)}>
              <Icon />
              <strong>{title}</strong>
            </Button>
          ))}
      </section>
      <ToastNotice message={notice} onShown={() => setNotice('')} />
      <div className="manager-grid">
        <div className="manager-agenda-block">
          <div className="apt-day-head">
            <h2>Clientes do dia</h2>
            <button type="button" onClick={() => setQuick('agenda')}>
              Ver agenda <ArrowRight size={16} aria-hidden />
            </button>
          </div>
          <Card className="manager-panel manager-agenda">
            <Card.Content className="apt-day">
              {data.appointments.length ? (
                <div className="apt-rows">
                  {data.appointments.map((item) => (
                    <AppointmentRow key={item.id} item={item} api={api} onOpen={setOpened} />
                  ))}
                </div>
              ) : (
                <div className="apt-quiet">
                  <CalendarDays size={22} aria-hidden />
                  <p>
                    <strong>Nenhum atendimento hoje.</strong>
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
                      <AppointmentRow
                        key={item.id}
                        item={item}
                        api={api}
                        showDay
                        onOpen={setOpened}
                      />
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
        </div>
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
            <Card.Title>Informações importantes</Card.Title>
          </Card.Header>
          <Card.Content>
            {banners.length ? (
              <div className="home-banners">
                {banners.map(({ id, ...banner }) => (
                  <HomeBanner key={id} {...banner} />
                ))}
              </div>
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
      <DepositChecklist
        api={api}
        isOpen={quick === 'deposits'}
        items={deposits}
        onOpenChange={(open) => setQuick(open ? 'deposits' : null)}
        onConfirmed={changed}
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
