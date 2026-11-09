'use client'

import { Avatar, Button, Card, Chip } from '@heroui/react'
import {
  ArrowRight,
  BadgePercent,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronRight,
  MessageCircle,
  Package,
  UserPlus,
  UserX,
} from 'lucide-react'
import { useState } from 'react'
import { useClinicApi, useClinicResource } from '../settings/clinic-api'
import { LoadError, SettingsSkeleton } from '../settings/settings-kit'
import { managerNavigation, type ManagerSectionId } from '../demo-data'
import { appointmentStatus, initials, money, timeBr, whatsapp } from './format'
import { activityDetail, activityKinds, activityTitle, timeAgo } from '../workspace/activity-copy'
import { useWorkspaceSignals } from '../workspace/workspace-signals'
import './business.css'

type Dashboard = {
  today: string
  appointments: {
    id: string
    startsAt: string
    status: string
    client: string
    phone: string | null
    service: string
    professional: string | null
    priceCents: number | null
    promotion: boolean
  }[]
  upcomingWeek: number
  canManageAgenda: boolean
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

export function HomeDashboard({
  clinicId,
  sections,
  onNavigate,
}: {
  clinicId: string
  sections: ManagerSectionId[]
  onNavigate: (label: string) => void
}) {
  const api = useClinicApi(clinicId)
  const signals = useWorkspaceSignals()
  const dashboard = useClinicResource<Dashboard>(api, 'dashboard')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  if (dashboard.error && !dashboard.data)
    return <LoadError message={dashboard.error} onRetry={dashboard.reload} />
  if (!dashboard.data) return <SettingsSkeleton cards={2} />
  const data = dashboard.data
  const live = data.appointments.filter((item) => item.status !== 'canceled')
  const done = live.filter((item) => item.status === 'completed').length

  async function setStatus(id: string, status: string, message: string) {
    setBusy(id)
    try {
      await api.put(`appointments/${id}/status`, { status })
      setNotice(message)
      dashboard.reload()
    } catch {
      setNotice('Não foi possível atualizar o atendimento. Tente de novo.')
    } finally {
      setBusy('')
    }
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
        {[
          {
            title: 'Novo agendamento',
            detail: 'Abra espaço para um novo cuidado',
            icon: CalendarPlus,
            show: data.canManageAgenda,
          },
          {
            title: 'Agenda semanal',
            detail: 'Sua semana, bem organizada',
            icon: CalendarDays,
            show: true,
          },
          {
            title: 'Adicionar cliente',
            detail: 'Uma nova história começa aqui',
            icon: UserPlus,
            show: Boolean(data.clients),
          },
        ]
          .filter((item) => item.show)
          .map(({ title, detail, icon: Icon }) => (
            <Button key={title} className="manager-action" onPress={() => onNavigate(title)}>
              <div>
                <strong>{title}</strong>
                <span>{detail}</span>
              </div>
              <ChevronRight size={16} />
              <Icon size={32} strokeWidth={1.5} />
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
            <Button variant="ghost" onPress={() => onNavigate('Agenda completa')}>
              Ver agenda <ArrowRight size={16} />
            </Button>
          </Card.Header>
          <Card.Content>
            {data.appointments.length ? (
              data.appointments.map((item, index) => {
                const status = appointmentStatus[item.status] ?? appointmentStatus.confirmed
                const open = item.status === 'scheduled' || item.status === 'confirmed'
                const link = whatsapp(
                  item.phone,
                  `Olá, ${item.client.split(' ')[0]}! Passando para lembrar do seu horário hoje às ${timeBr(item.startsAt)}.`,
                )
                return (
                  <div
                    className={`manager-client${item.status === 'canceled' ? ' is-muted' : ''}`}
                    key={item.id}
                  >
                    <time>{timeBr(item.startsAt)}</time>
                    <Avatar className={`manager-avatar tone-${index % 3}`}>
                      <Avatar.Fallback>{initials(item.client)}</Avatar.Fallback>
                    </Avatar>
                    <div className="manager-client-copy">
                      <strong>{item.client}</strong>
                      <span>
                        {item.service}
                        {item.professional ? ` · ${item.professional}` : ''}
                        {item.priceCents != null ? ` · ${money(item.priceCents)}` : ''}
                      </span>
                    </div>
                    <Chip
                      size="sm"
                      className={
                        status.tone === 'off' ? 'manager-status pending' : 'manager-status'
                      }
                    >
                      {status.label}
                    </Chip>
                    <div className="home-appointment-actions">
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Mandar mensagem para ${item.client}`}
                          title="Lembrar pelo WhatsApp"
                        >
                          <MessageCircle size={17} />
                        </a>
                      ) : null}
                      {open && data.canManageAgenda ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            isDisabled={busy === item.id}
                            onPress={() =>
                              void setStatus(
                                item.id,
                                'completed',
                                `${item.client} · atendimento concluído.`,
                              )
                            }
                          >
                            <Check size={14} aria-hidden /> Concluir
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            isIconOnly
                            aria-label={`${item.client} faltou`}
                            isDisabled={busy === item.id}
                            onPress={() =>
                              void setStatus(
                                item.id,
                                'no_show',
                                `Falta registrada para ${item.client}.`,
                              )
                            }
                          >
                            <UserX size={15} />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="biz-empty">
                <CalendarDays size={24} aria-hidden />
                <p>
                  Nenhum atendimento hoje. Que tal mandar uma mensagem para quem não vem há um
                  tempo?
                </p>
              </div>
            )}
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
                data.activity.map((item, index) => {
                  const Icon = (activityKinds[item.entity] ?? activityKinds.appointments).icon
                  return (
                    <div className="manager-event" key={`${item.createdAt}-${index}`}>
                      <span className={`manager-event-icon event-${index % 5}`}>
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
    </>
  )
}
