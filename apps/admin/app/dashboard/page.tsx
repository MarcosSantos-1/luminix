'use client'

import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Grid2X2,
  Home,
  MoreVertical,
  Package,
  Plus,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
} from 'lucide-react'

const clients = [
  ['09:00', 'Juliana Lima', 'Depilação a laser · Axilas', 'Confirmado'],
  ['10:30', 'Camila Santos', 'Limpeza de pele profunda', 'Confirmado'],
  ['13:00', 'Beatriz Alves', 'Design de sobrancelhas', 'Confirmado'],
  ['14:30', 'Mariana Costa', 'Massagem relaxante', 'Pendente'],
]

export default function DashboardPage() {
  return (
    <main className="light-dashboard">
      <header className="dash-header">
        <div className="dash-brand">
          <span className="brand-mark">L</span>
          <div>
            <b>Bom dia, Juliana! 👋</b>
            <span>Clínica Charme & Bela</span>
          </div>
        </div>
        <button className="notification" aria-label="Notificações">
          <Bell />
          <i>3</i>
        </button>
        <div className="avatar">
          JS
          <span />
        </div>
      </header>

      <section className="today-card">
        <div className="today-title">
          <div>
            <h1>Agenda de hoje</h1>
            <p>15 de Maio, Quinta-feira</p>
          </div>
          <button>Ver agenda →</button>
        </div>
        <div className="today-stats">
          <Stat icon={CalendarDays} value="6" label="Agendamentos" />
          <Stat icon={Users} value="5" label="Clientes" />
          <Stat icon={CheckCircle2} value="4" label="Confirmados" />
          <Stat icon={Clock3} value="1" label="Pendente" warning />
        </div>
      </section>

      <section className="quick-actions">
        <Action icon={CalendarDays} label="Novo agendamento" />
        <Action icon={CalendarDays} label="Agenda semanal" />
        <Action icon={UserPlus} label="Adicionar cliente" />
      </section>

      <section className="dashboard-grid">
        <div className="dash-panel clients-panel">
          <PanelTitle title="Clientes do dia" action="Ver todos" />
          <div className="client-list">
            {clients.map(([time, name, service, status], index) => (
              <div className="client-row" key={time}>
                <b className="time-chip">{time}</b>
                <div className={`client-avatar avatar-${index + 1}`}>{name.charAt(0)}</div>
                <div className="client-copy">
                  <b>{name}</b>
                  <span>{service}</span>
                </div>
                <span className={`status ${status === 'Pendente' ? 'pending' : ''}`}>{status}</span>
                <MoreVertical size={19} />
              </div>
            ))}
          </div>
        </div>
        <div className="dash-panel activity-panel">
          <PanelTitle title="Atividades recentes" action="Ver todas" />
          <Activity
            icon={CalendarDays}
            title="Novo agendamento criado"
            detail="Juliana Lima · 09:00"
            time="Há 5 min"
          />
          <Activity
            icon={Bell}
            title="Lembrete automático enviado"
            detail="Camila Santos · Limpeza de pele"
            time="Há 15 min"
          />
        </div>
      </section>

      <section className="dash-panel quick-links">
        <h2>Acesso rápido</h2>
        <div>
          <Action icon={Package} label="Pacotes" compact />
          <Action icon={WalletCards} label="Financeiro" compact />
          <Action icon={TrendingUp} label="Relatórios" compact />
          <Action icon={Bell} label="Lembretes" compact />
        </div>
      </section>

      <nav className="bottom-nav" aria-label="Navegação principal">
        <button className="active">
          <Home />
          <span>Início</span>
        </button>
        <button>
          <CalendarDays />
          <span>Agenda</span>
        </button>
        <button className="add">
          <Plus />
        </button>
        <button>
          <Users />
          <span>Clientes</span>
        </button>
        <button>
          <Grid2X2 />
          <span>Mais</span>
        </button>
      </nav>
    </main>
  )
}

function Stat({
  icon: Icon,
  value,
  label,
  warning = false,
}: {
  icon: React.ElementType
  value: string
  label: string
  warning?: boolean
}) {
  return (
    <div className={warning ? 'warning' : ''}>
      <Icon />
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}
function Action({
  icon: Icon,
  label,
  compact = false,
}: {
  icon: React.ElementType
  label: string
  compact?: boolean
}) {
  return (
    <button className={compact ? 'action compact' : 'action'}>
      <Icon />
      <span>{label}</span>
    </button>
  )
}
function PanelTitle({ title, action }: { title: string; action: string }) {
  return (
    <div className="panel-title">
      <h2>{title}</h2>
      <button>{action} →</button>
    </div>
  )
}
function Activity({
  icon: Icon,
  title,
  detail,
  time,
}: {
  icon: React.ElementType
  title: string
  detail: string
  time: string
}) {
  return (
    <div className="activity-row">
      <span className="activity-icon">
        <Icon />
      </span>
      <div>
        <b>{title}</b>
        <span>{detail}</span>
      </div>
      <time>{time}</time>
    </div>
  )
}
