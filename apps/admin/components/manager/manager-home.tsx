'use client'

import { Avatar, Button, Card, Dropdown, Modal, SearchField } from '@heroui/react'
import {
  ArrowRight,
  Bell,
  ChevronDown,
  LogOut,
  Plus,
  Search,
  Settings2,
  UserRound,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useManagerLayout } from '@/hooks/use-manager-layout'
import { useManagerSection } from '@/hooks/use-manager-section'
import {
  managerNavigation,
  sectionSearchExamples,
  sectionSketches,
  type ManagerSectionId,
} from './demo-data'
import { ManagerSidebar } from './manager-sidebar'
import { HomePanels } from './sections/home-panels'
import { AgendaPanel } from './sections/agenda-panel'
import { ClientsPanel } from './sections/clients-panel'
import { SectionSketchView } from './sections/section-sketch'

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function ManagerHome({
  clinicName = 'Clínica de demonstração',
  userName = 'Marcos',
  canManageSettings = true,
  profile,
  settings,
  shareCode,
  banner,
  initialSection = 'inicio',
  userEmail,
  onLogout,
  signingOut = false,
  logoutError,
}: {
  clinicName?: string
  userName?: string
  canManageSettings?: boolean
  profile?: ReactNode
  settings?: ReactNode
  shareCode?: string | null
  banner?: ReactNode
  initialSection?: string
  userEmail?: string
  onLogout?: () => void
  signingOut?: boolean
  logoutError?: string
} = {}) {
  const navigation = useMemo(
    () => managerNavigation.filter((item) => item.id !== 'configuracoes' || canManageSettings),
    [canManageSettings],
  )
  const allowedIds = useMemo(() => navigation.map((item) => item.id), [navigation])
  const { section: sectionId, select } = useManagerSection(allowedIds, initialSection)
  const section = navigation.find((item) => item.id === sectionId) ?? navigation[0]
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
  const [copied, setCopied] = useState(false)
  const [createSignal, setCreateSignal] = useState(0)
  const [copyError, setCopyError] = useState(false)
  const realClinic = shareCode !== undefined
  const isHome = section.id === 'inicio'
  const showDemoLabel = section.id !== 'agenda'

  function closeNotice() {
    setNotice(null)
    setCopied(false)
    setCopyError(false)
  }

  function openNotice(label: string) {
    setCopied(false)
    setCopyError(false)
    setNotice(label)
  }

  function navigate(label: string) {
    if (label === 'Novo agendamento') {
      select('agenda')
      setCreateSignal((value) => value + 1)
      return
    }
    if (label === 'Adicionar cliente') {
      select('clientes')
      setCreateSignal((value) => value + 1)
      return
    }
    if (label === 'Agenda semanal' || label === 'Agenda completa') {
      select('agenda')
      return
    }
    const match = navigation.find((item) => item.label === label)
    if (match) {
      select(match.id)
      return
    }
    openNotice(label)
  }

  const needle = normalize(query)
  const results = [
    ...navigation.map((item) => ({
      key: `page-${item.id}`,
      title: item.label,
      detail: 'Página do gestor',
      sectionId: item.id as ManagerSectionId | undefined,
    })),
    ...sectionSearchExamples(section.id).map((item, index) => ({
      key: `example-${index}-${item.title}`,
      title: item.title,
      detail: item.detail,
      sectionId: undefined,
    })),
  ].filter((item) => normalize(`${item.title} ${item.detail}`).includes(needle))

  const demoLabel = realClinic
    ? section.id === 'configuracoes'
      ? 'CONFIGURAÇÕES'
      : isHome
        ? 'HOME DO GESTOR'
        : 'ESBOÇO'
    : 'PRÉVIA DO GESTOR'
  const demoDetail =
    section.id === 'configuracoes'
      ? realClinic
        ? 'Dados reais da clínica'
        : 'Dados reais após o login'
      : isHome
        ? 'Agenda e indicadores demonstrativos'
        : 'Exemplos ilustrativos desta seção'
  const sketch =
    section.id === 'inicio' ||
    section.id === 'configuracoes' ||
    (realClinic && (section.id === 'agenda' || section.id === 'clientes'))
      ? null
      : sectionSketches[section.id]

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
        activeLabel={section.label}
        canManageSettings={canManageSettings}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        onNavigate={navigate}
      />
      <main className="manager-main" id="manager-content">
        <header className="manager-header">
          <div className="manager-greeting">
            {isHome ? (
              <>
                <p>Seu espaço de cuidado ✦</p>
                <h1>Olá, {firstName}!</h1>
                <span>{clinicName}</span>
              </>
            ) : (
              <>
                <p>{clinicName}</p>
                <h1>{section.label}</h1>
                <span>{section.subtitle}</span>
              </>
            )}
          </div>
          <Button
            ref={searchTrigger}
            className="manager-search-trigger"
            variant="secondary"
            onPress={() => changeSearch(true)}
            aria-label={`Buscar em ${section.label} (Control ou Command K)`}
          >
            <Search size={19} />
            <span>{section.searchPlaceholder}</span>
            <kbd>Ctrl/⌘ K</kbd>
          </Button>
          <div className="manager-header-actions">
            <Button
              isIconOnly
              aria-label={section.createLabel}
              className="manager-icon-button"
              onPress={() => navigate(section.createLabel)}
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
            <Dropdown>
              <Dropdown.Trigger className="manager-profile" aria-label={`Conta: ${userName}`}>
                <Avatar size="sm">
                  <Avatar.Fallback>{initials}</Avatar.Fallback>
                </Avatar>
                <span>
                  {firstName} <ChevronDown size={14} />
                </span>
              </Dropdown.Trigger>
              <Dropdown.Popover className="manager-account-menu" placement="bottom end">
                <div className="manager-account-head">
                  <strong>{userName}</strong>
                  {userEmail && <span>{userEmail}</span>}
                </div>
                <Dropdown.Menu
                  aria-label="Conta"
                  onAction={(key) => {
                    if (key === 'account') openNotice('Minha conta')
                    if (key === 'settings') select('configuracoes')
                    if (key === 'logout') {
                      if (onLogout) onLogout()
                      else openNotice('Sair')
                    }
                  }}
                >
                  <Dropdown.Item id="account" textValue="Minha conta">
                    <UserRound size={18} />
                    <span>Minha conta</span>
                  </Dropdown.Item>
                  {canManageSettings ? (
                    <Dropdown.Item id="settings" textValue="Configurações">
                      <Settings2 size={18} />
                      <span>Configurações</span>
                    </Dropdown.Item>
                  ) : null}
                  <Dropdown.Item
                    id="logout"
                    textValue="Sair"
                    variant="danger"
                    isDisabled={signingOut}
                  >
                    <LogOut size={18} />
                    <span>{signingOut ? 'Saindo…' : 'Sair'}</span>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </header>
        {logoutError && (
          <p className="manager-logout-error" role="alert">
            {logoutError}
          </p>
        )}
        {showDemoLabel && (
          <div className="manager-demo-label">
            <span>
              <i />
              {demoLabel}
            </span>
            <span>{demoDetail}</span>
          </div>
        )}
        {section.id !== 'configuracoes' && banner}
        {realClinic && isHome && (
          <div className="manager-clinic-tools">
            <Button variant="ghost" onPress={() => openNotice('Código de acesso')}>
              Código de acesso <ArrowRight size={16} />
            </Button>
          </div>
        )}
        {section.id === 'inicio' && (
          <HomePanels
            announcement={announcement}
            onDismissAnnouncement={() => setAnnouncement(false)}
            onNavigate={navigate}
          />
        )}
        {realClinic && section.id === 'agenda' && <AgendaPanel createSignal={createSignal} />}
        {realClinic && section.id === 'clientes' && <ClientsPanel createSignal={createSignal} />}
        {sketch && (
          <SectionSketchView
            sketch={sketch}
            createLabel={section.createLabel}
            onAction={navigate}
          />
        )}
        {section.id === 'configuracoes' &&
          (settings ?? (
            <Card className="manager-panel">
              <Card.Header>
                <Card.Title>Configurações da clínica</Card.Title>
              </Card.Header>
              <Card.Content>
                <p>
                  Nome, identificador, situação, fuso, idioma, moeda, ocupações, serviços e
                  profissionais aparecem aqui depois do login, com os dados reais da clínica. Esta
                  prévia não inventa esses registros.
                </p>
              </Card.Content>
            </Card>
          ))}
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
        {navigation.slice(0, 4).map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            aria-current={id === section.id ? 'page' : undefined}
            onPress={() => select(id)}
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
              <Modal.Heading>Buscar em {section.label}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <SearchField
                aria-label={`Buscar em ${section.label}`}
                value={query}
                onChange={setQuery}
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input autoFocus placeholder={section.searchPlaceholder} />
                  <SearchField.ClearButton aria-label="Limpar busca" />
                </SearchField.Group>
              </SearchField>
              <p className="manager-search-hint">{section.searchHint}</p>
              <div className="manager-search-results">
                {results.length ? (
                  results.map((item) => (
                    <Button
                      variant="ghost"
                      key={item.key}
                      onPress={() => {
                        changeSearch(false)
                        if (item.sectionId) select(item.sectionId)
                        else openNotice(item.title)
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
          if (!open) closeNotice()
        }}
      >
        <Modal.Container size="sm">
          <Modal.Dialog className="manager-dialog">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading>{notice}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {notice === 'Minha conta' && profile ? (
                profile
              ) : notice === 'Código de acesso' ? (
                shareCode ? (
                  <div className="manager-access-code">
                    <p>
                      Use este código para o cliente identificar a clínica. Ele não concede acesso à
                      equipe.
                    </p>
                    <code>{shareCode}</code>
                    <Button
                      onPress={() =>
                        void navigator.clipboard
                          .writeText(shareCode)
                          .then(() => {
                            setCopyError(false)
                            setCopied(true)
                          })
                          .catch(() => setCopyError(true))
                      }
                    >
                      Copiar código
                    </Button>
                    {copied && <p role="status">Código copiado.</p>}
                    {copyError && (
                      <p role="alert">Não foi possível copiar. Selecione o código acima.</p>
                    )}
                  </div>
                ) : (
                  <p>O código de acesso aparece quando a configuração da clínica é concluída.</p>
                )
              ) : (
                <p>
                  Esta funcionalidade ainda está em desenvolvimento. Os agendamentos, atividades e
                  indicadores exibidos são exemplos e não representam dados reais da clínica.
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={closeNotice}>Entendi</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  )
}
