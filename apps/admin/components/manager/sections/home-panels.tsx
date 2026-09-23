'use client'

import { Avatar, Button, Card, Chip, ProgressBar } from '@heroui/react'
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Package,
  Sparkles,
  Star,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react'
import { demoAppointments, managerNavigation } from '../demo-data'

export function HomePanels({
  announcement,
  onDismissAnnouncement,
  onNavigate,
}: {
  announcement: boolean
  onDismissAnnouncement: () => void
  onNavigate: (label: string) => void
}) {
  return (
    <>
      <section className="manager-actions" aria-label="Ações principais">
        {[
          {
            title: 'Novo agendamento',
            detail: 'Abra espaço para um novo cuidado',
            icon: CalendarPlus,
          },
          { title: 'Agenda semanal', detail: 'Sua semana, bem organizada', icon: CalendarDays },
          { title: 'Adicionar cliente', detail: 'Uma nova história começa aqui', icon: UserPlus },
        ].map(({ title, detail, icon: Icon }) => (
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
      <div className="manager-grid">
        <Card className="manager-panel manager-agenda">
          <Card.Header className="manager-panel-heading">
            <div>
              <Card.Title>Clientes do dia</Card.Title>
              <Chip size="sm" variant="soft">
                6
              </Chip>
            </div>
            <Button variant="ghost" onPress={() => onNavigate('Agenda completa')}>
              Ver agenda <ArrowRight size={16} />
            </Button>
          </Card.Header>
          <Card.Content>
            {demoAppointments.map((client, index) => (
              <div className="manager-client" key={client.time}>
                <time>{client.time}</time>
                <Avatar className={`manager-avatar tone-${index % 3}`}>
                  <Avatar.Fallback>{client.initials}</Avatar.Fallback>
                </Avatar>
                <div className="manager-client-copy">
                  <strong>{client.name}</strong>
                  <span>{client.service}</span>
                </div>
                <Chip
                  size="sm"
                  className={
                    client.status === 'Pendente' ? 'manager-status pending' : 'manager-status'
                  }
                >
                  {client.status}
                </Chip>
                <Button
                  isIconOnly
                  variant="ghost"
                  aria-label={`Detalhes de ${client.name}`}
                  onPress={() => onNavigate(`${client.name} · ${client.time}`)}
                >
                  <MoreHorizontal size={20} />
                </Button>
              </div>
            ))}
          </Card.Content>
          <Card.Footer className="manager-agenda-footer">
            <span>
              <span className="manager-dot" /> Um dia cheio de boas conexões
            </span>
            <span>6 atendimentos</span>
          </Card.Footer>
        </Card>
        <Card className="manager-panel manager-activity">
          <Card.Header className="manager-panel-heading">
            <Card.Title>Atividades recentes</Card.Title>
            <Button variant="ghost" onPress={() => onNavigate('Atividades')}>
              Ver todas
            </Button>
          </Card.Header>
          <Card.Content>
            {[
              {
                icon: CalendarDays,
                title: 'Novo agendamento criado',
                detail: 'Juliana Lima · 09:00',
                time: 'Há 5 min',
              },
              {
                icon: Wallet,
                title: 'Pagamento recebido',
                detail: 'R$ 120,00 · Camila Santos',
                time: 'Há 25 min',
              },
              {
                icon: MessageCircle,
                title: 'Lembrete enviado',
                detail: 'Mariana Costa · Amanhã, 14:30',
                time: 'Há 1 h',
              },
              {
                icon: Star,
                title: 'Um carinho em forma de avaliação',
                detail: 'Beatriz avaliou seu atendimento',
                time: 'Há 2 h',
              },
              {
                icon: Package,
                title: 'Produto em estoque baixo',
                detail: 'Gel hidratante · 3 unidades',
                time: 'Há 3 h',
              },
            ].map(({ icon: Icon, title, detail, time }, index) => (
              <div className="manager-event" key={title}>
                <span className={`manager-event-icon event-${index}`}>
                  <Icon size={19} />
                </span>
                <div>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
                <time>{time}</time>
              </div>
            ))}
          </Card.Content>
        </Card>
        <Card className="manager-panel">
          <Card.Header>
            <Card.Title>Acesso rápido</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="manager-shortcuts">
              {managerNavigation
                .filter((item) =>
                  [
                    'Agenda',
                    'Clientes',
                    'Serviços',
                    'Financeiro',
                    'Relatórios',
                    'Marketing',
                  ].includes(item.label),
                )
                .map(({ label, icon: Icon }) => (
                  <Button key={label} variant="secondary" onPress={() => onNavigate(label)}>
                    <Icon size={24} strokeWidth={1.5} />
                    <span>{label}</span>
                  </Button>
                ))}
            </div>
            <div className="manager-summary-title">
              <h2>Seu dia em números</h2>
              <span>Resumo ilustrativo</span>
            </div>
            <div className="manager-stats">
              {[
                { label: 'Agendamentos', value: '6', detail: '+20% vs. ontem' },
                { label: 'Faturamento', value: 'R$ 1.240', detail: '+15% vs. ontem' },
                { label: 'Novos clientes', value: '2', detail: '+100% vs. ontem' },
                { label: 'Avaliações', value: '4,9', detail: '★★★★★' },
              ].map((stat) => (
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
            <Card.Title>Um olhar para o seu negócio</Card.Title>
          </Card.Header>
          <Card.Content className="manager-business">
            {announcement && (
              <div className="manager-announcement">
                <div>
                  <span className="manager-eyebrow">FEITO PARA VOCÊ</span>
                  <h3>Sua rotina merece leveza.</h3>
                  <p>Conheça o novo espaço de gestão Luminix.</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onPress={() => onNavigate('Novidades Luminix')}
                  >
                    Explorar novidades <ArrowRight size={14} />
                  </Button>
                </div>
                <Megaphone size={64} strokeWidth={1} />
                <Button
                  isIconOnly
                  variant="ghost"
                  className="manager-dismiss"
                  aria-label="Dispensar novidade"
                  onPress={onDismissAnnouncement}
                >
                  <X size={16} />
                </Button>
              </div>
            )}
            <div className="manager-goal">
              <div>
                <h3>Meta mensal</h3>
                <Sparkles size={17} />
              </div>
              <div>
                <p>
                  <strong>R$ 8.450</strong> / R$ 15.000
                </p>
                <strong>56%</strong>
              </div>
              <ProgressBar
                aria-label="Meta mensal demonstrativa"
                value={8450}
                maxValue={15000}
                className="manager-progress"
              >
                <ProgressBar.Track>
                  <ProgressBar.Fill />
                </ProgressBar.Track>
              </ProgressBar>
              <p>Um atendimento de cada vez, mais perto da sua meta.</p>
            </div>
          </Card.Content>
        </Card>
      </div>
    </>
  )
}
