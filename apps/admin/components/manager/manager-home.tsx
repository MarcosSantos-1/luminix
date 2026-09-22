'use client'

import { Avatar, Button, Card, Chip, Modal, ProgressBar, SearchField } from '@heroui/react'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Star,
  UserPlus,
  Wallet,
  X,
  Package,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useManagerLayout } from '@/hooks/use-manager-layout'
import { demoAppointments, managerNavigation } from './demo-data'
import { ManagerSidebar } from './manager-sidebar'

export function ManagerHome({
  clinicName = 'Clínica de demonstração',
  userName = 'Marcos',
  homeHref = '/dashboard',
  canManageSettings = true,
  onNavigate,
  profile,
  clinicDetails,
  banner,
}: {
  clinicName?: string
  userName?: string
  homeHref?: string
  canManageSettings?: boolean
  onNavigate?: (label: string) => boolean
  profile?: ReactNode
  clinicDetails?: ReactNode
  banner?: ReactNode
} = {}) {
  const navigation = managerNavigation.filter(
    (item) => item.label !== 'Configurações' || canManageSettings,
  )
  const firstName = userName.trim().split(/\s+/)[0] || 'Gestor'
  const initials =
    userName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'G'
  const { collapsed, setCollapsed, searchOpen, changeSearch, query, setQuery, searchTrigger } =
    useManagerLayout()
  const [notice, setNotice] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState(true)
  const [forceGlass, setForceGlass] = useState(false)
  function navigate(label: string) {
    if (label === 'Início') {
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }
    if (onNavigate?.(label)) return
    setNotice(label)
  }
  const results = [
    ...navigation.map((item) => ({ title: item.label, detail: 'Página do gestor' })),
    ...demoAppointments.map((item) => ({
      title: item.name,
      detail: `${item.time} · ${item.service}`,
    })),
  ].filter((item) =>
    `${item.title} ${item.detail}`
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(
        query
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase(),
      ),
  )
  return (
    <div
      className={`manager-shell ${collapsed ? 'is-collapsed' : ''}`}
      data-theme="manager-glass"
      data-transparency={forceGlass ? 'glass' : 'system'}
    >
      <a href="#manager-content" className="manager-skip">
        Pular para o conteúdo
      </a>
      <ManagerSidebar
        homeHref={homeHref}
        canManageSettings={canManageSettings}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        onNavigate={navigate}
      />
      <main className="manager-main" id="manager-content">
        <header className="manager-header">
          <div className="manager-greeting">
            <p>Seu espaço de cuidado ✦</p>
            <h1>Olá, {firstName}!</h1>
            <span>{clinicName}</span>
          </div>
          <Button
            ref={searchTrigger}
            className="manager-search-trigger"
            variant="secondary"
            onPress={() => changeSearch(true)}
            aria-label="Buscar na demonstração (Control ou Command K)"
          >
            <Search size={19} />
            <span>Buscar clientes, serviços...</span>
            <kbd>Ctrl/⌘ K</kbd>
          </Button>
          <div className="manager-header-actions">
            <Button
              isIconOnly
              aria-label="Criar novo"
              className="manager-icon-button"
              onPress={() => navigate('Novo agendamento')}
            >
              <Plus size={21} />
            </Button>
            <Button
              isIconOnly
              aria-label="Notificações"
              className="manager-icon-button"
              onPress={() => navigate('Notificações')}
            >
              <Bell size={20} />
            </Button>
            <Button
              className="manager-profile"
              variant="ghost"
              onPress={() => navigate('Minha conta')}
              aria-label={`Minha conta: ${userName}`}
            >
              <Avatar size="sm">
                <Avatar.Fallback>{initials}</Avatar.Fallback>
              </Avatar>
              <span>
                {firstName} <ChevronRight size={14} />
              </span>
            </Button>
          </div>
        </header>
        <div className="manager-demo-label">
          <span>
            <i />
            {clinicDetails ? 'HOME DO GESTOR' : 'PRÉVIA DO GESTOR'}
          </span>
          <span>Agenda e indicadores demonstrativos</span>
        </div>
        {banner}
        {clinicDetails && (
          <div className="manager-clinic-tools">
            <Button variant="ghost" onPress={() => navigate('Dados da clínica')}>
              Dados da clínica e código de acesso <ArrowRight size={16} />
            </Button>
          </div>
        )}
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
            <Button key={title} className="manager-action" onPress={() => navigate(title)}>
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
              <Button variant="ghost" onPress={() => navigate('Agenda completa')}>
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
                    onPress={() => setNotice(`${client.name} · ${client.time}`)}
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
              <Button variant="ghost" onPress={() => navigate('Atividades')}>
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
                    <Button key={label} variant="secondary" onPress={() => navigate(label)}>
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
                      onPress={() => navigate('Novidades Luminix')}
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
                    onPress={() => setAnnouncement(false)}
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
        <footer className="manager-footer">
          <span>Luminix · tempo para o que importa.</span>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={forceGlass}
            onPress={() => setForceGlass((value) => !value)}
          >
            {forceGlass ? 'Respeitar transparência do sistema' : 'Testar transparência Glass'}
          </Button>
        </footer>
      </main>
      <nav className="manager-bottom-nav" aria-label="Navegação móvel">
        {managerNavigation.slice(0, 4).map(({ label, icon: Icon }) => (
          <Button
            key={label}
            variant="ghost"
            aria-current={label === 'Início' ? 'page' : undefined}
            onPress={() => navigate(label)}
          >
            <Icon size={21} />
            <span>{label}</span>
          </Button>
        ))}
        <Button variant="ghost" onPress={() => changeSearch(true)}>
          <Search size={21} />
          <span>Buscar</span>
        </Button>
      </nav>
      <Modal.Backdrop isOpen={searchOpen} onOpenChange={changeSearch}>
        <Modal.Container>
          <Modal.Dialog className="manager-dialog">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading>O que você procura?</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <SearchField aria-label="Buscar na demonstração" value={query} onChange={setQuery}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input
                    autoFocus
                    placeholder="Busque por página, cliente ou serviço"
                  />
                  <SearchField.ClearButton aria-label="Limpar busca" />
                </SearchField.Group>
              </SearchField>
              <p className="manager-search-hint">Busca apenas nos exemplos desta prévia.</p>
              <div className="manager-search-results">
                {results.length ? (
                  results.map((item) => (
                    <Button
                      variant="ghost"
                      key={item.title}
                      onPress={() => {
                        changeSearch(false)
                        navigate(item.title)
                      }}
                    >
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <ArrowRight size={16} />
                    </Button>
                  ))
                ) : (
                  <p role="status">Nenhum resultado encontrado.</p>
                )}
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      <Modal.Backdrop
        isOpen={notice !== null}
        onOpenChange={(open) => {
          if (!open) setNotice(null)
        }}
      >
        <Modal.Container size={notice === 'Dados da clínica' ? 'lg' : 'sm'}>
          <Modal.Dialog className="manager-dialog">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading>{notice}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {notice === 'Minha conta' && profile ? (
                profile
              ) : notice === 'Dados da clínica' && clinicDetails ? (
                clinicDetails
              ) : (
                <p>
                  Esta funcionalidade ainda está em desenvolvimento. Os agendamentos, atividades e
                  indicadores exibidos são exemplos e não representam dados reais da clínica.
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={() => setNotice(null)}>Entendi</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
