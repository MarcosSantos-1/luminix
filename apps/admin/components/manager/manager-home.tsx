'use client'

import { Avatar, Button, Card, Dropdown, Modal, SearchField } from '@heroui/react'
import {
  ArrowRight,
  Bell,
  Bug,
  ChevronDown,
  CreditCard,
  Crown,
  SlidersHorizontal,
  LogOut,
  Plus,
  Search,
  Settings2,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './data-kit.css'
import { AccountModal, type OwnAccount } from './account-modal'
import { useManagerMessages } from '@/hooks/use-manager-messages'
import { useManagerLayout } from '@/hooks/use-manager-layout'
import { useManagerSpotlight } from '@/hooks/use-manager-spotlight'
import { useManagerSection } from '@/hooks/use-manager-section'
import {
  managerNavigation,
  sectionSearchExamples,
  sectionSketches,
  type ManagerSectionId,
} from './demo-data'
import { ManagerMessageModal } from './manager-message-modal'
import { createActions } from './create-actions'
import { HomeGlassShell } from './home-glass'
import { ManagerMobileNav } from './manager-mobile-nav'
import { PlanModal, planStatus } from './manager-plan'
import { ManagerSidebar } from './manager-sidebar'
import { firstManagerTourStep, ManagerTour, type ManagerTourStep } from './manager-tour'
import {
  ManagerSettingsNav,
  managerSettingsSections,
  type ManagerSettingsSection,
} from './manager-settings-nav'
import './manager-controls.css'
import { HomePanels } from './sections/home-panels'
import { SectionSketchView } from './sections/section-sketch'
import type { ClinicApi } from './settings/clinic-api'
import {
  NoticeCarousel,
  NotificationBell,
  WorkspaceSignals,
  type GoTarget,
  type SearchFocus,
} from './workspace/workspace-signals'
import { WorkspaceSearch } from './workspace/workspace-search'

export type MediaIncoming = { files: File[]; nonce: number }

/** The search bar lives only where a broad search makes sense. */
const searchSections = new Set<ManagerSectionId>(['inicio', 'configuracoes'])

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function ManagerHome({
  clinicName = 'Clínica de demonstração',
  userName: givenName = 'Marcos',
  onAccountSaved,
  canManageSettings = true,
  sections,
  settingsTabs,
  profile,
  settings,
  payments,
  media,
  panels,
  shareCode,
  banner,
  initialSection = 'inicio',
  initialSettingsTab,
  messages,
  userEmail,
  workspace,
  onLogout,
  signingOut = false,
  logoutError,
  trialEndsAt,
}: {
  clinicName?: string
  userName?: string
  /** Runs after "Minha conta" is saved (keeps the sign-in profile name in step). */
  onAccountSaved?: (name: string) => void | Promise<void>
  canManageSettings?: boolean
  /** Sections allowed by the person's access level; all when omitted (demo). */
  sections?: ManagerSectionId[]
  settingsTabs?: ManagerSettingsSection[]
  profile?: ReactNode
  payments?: ReactNode
  /**
   * Media library (Mídia); a placeholder explains it in the demo. The function form receives
   * photos picked from the mobile "+" menu, to be sent as soon as the library opens.
   */
  media?: ReactNode | ((incoming: MediaIncoming | null) => ReactNode)
  /** Real section content backed by the API; replaces the illustrative sketch. */
  panels?: Partial<
    Record<
      ManagerSectionId,
      (context: {
        createSignal: number
        navigate: (label: string) => void
        /** Set when a search result opened this page with its search box filled. */
        focus: SearchFocus | null
        go: (target: GoTarget) => void
      }) => ReactNode
    >
  >
  settings?: (tab: ManagerSettingsSection, open: (section: ManagerSectionId) => void) => ReactNode
  shareCode?: string | null
  banner?: ReactNode
  initialSection?: string
  initialSettingsTab?: string
  messages?: {
    welcome: boolean
    scope?: string
    demoPublicUrl?: string
    getPublicUrl?: (signal: AbortSignal) => Promise<string | null>
  }
  userEmail?: string
  /** Real clinic: notifications, notices on top and the indexed search. */
  workspace?: { api: ClinicApi; clinicId: string; canAudit: boolean }
  onLogout?: () => void
  signingOut?: boolean
  logoutError?: string
  trialEndsAt?: string | null
} = {}) {
  const navigation = useMemo(
    () =>
      managerNavigation.filter(
        (item) =>
          (item.id !== 'configuracoes' || canManageSettings) &&
          (!sections || sections.includes(item.id)),
      ),
    [canManageSettings, sections],
  )
  const allowedIds = useMemo(() => navigation.map((item) => item.id), [navigation])
  const { section: sectionId, select } = useManagerSection(allowedIds, initialSection)
  const section = navigation.find((item) => item.id === sectionId) ?? navigation[0]
  // "+" asks one page to open its creation form. It is tied to that page, so opening the
  // page later through the menu never reopens the form.
  const [create, setCreate] = useState({ section: '', count: 0 })
  const requestCreate = (target: string) =>
    setCreate((current) => ({ section: target, count: current.count + 1 }))
  // Every page starts at the top, wherever the previous one was scrolled to.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [sectionId])
  // A request made for another page is spent once the person leaves it.
  const [seenSection, setSeenSection] = useState(sectionId)
  if (seenSection !== sectionId) {
    setSeenSection(sectionId)
    if (create.section && create.section !== sectionId) setCreate({ section: '', count: 0 })
  }
  const createSignal = create.section === sectionId ? create.count : 0
  // "Minha conta": the name and photo the person keeps in this space win over the sign-in name.
  const [account, setAccount] = useState<OwnAccount | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountApi = workspace?.api
  useEffect(() => {
    if (!accountApi?.ready) return
    let active = true
    void accountApi
      .get<OwnAccount>('account')
      .then((data) => active && setAccount(data))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [accountApi])
  const userName = account?.name || givenName
  const firstName = userName.trim().split(/\s+/)[0] || 'Gestor'
  const initials =
    userName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'G'
  const message = useManagerMessages(messages?.welcome ?? false, messages?.scope)
  const [tourOpen, setTourOpen] = useState(false)
  const [spotlight, setSpotlight] = useState<string>()
  const [settingsTab, setSettingsTab] = useState<ManagerSettingsSection>(
    () =>
      managerSettingsSections.find(
        ({ id }) => id === initialSettingsTab && (!settingsTabs || settingsTabs.includes(id)),
      )?.id ??
      settingsTabs?.[0] ??
      'espaco',
  )
  const shell = useRef<HTMLDivElement>(null)
  useManagerSpotlight(shell, spotlight)
  const { collapsed, setCollapsed, searchOpen, changeSearch, query, setQuery, searchTrigger } =
    useManagerLayout(!message.view && !spotlight)
  const fileInput = useRef<HTMLInputElement>(null)
  const glassPanel = useRef<HTMLDivElement>(null)
  const sectionHeading = useRef<HTMLHeadingElement>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [planNow, setPlanNow] = useState(() => Date.now())
  const currentPlanStatus = planStatus(trialEndsAt, planNow)
  const openPlan = () => {
    setPlanNow(Date.now())
    setPlanOpen(true)
  }
  const [notice, setNotice] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState(true)
  const [forceGlass, setForceGlass] = useState(false)
  const [focus, setFocus] = useState<SearchFocus | null>(null)
  const [incomingMedia, setIncomingMedia] = useState<MediaIncoming | null>(null)
  const realClinic = shareCode !== undefined
  const isHome = section.id === 'inicio'

  function startTour() {
    setTourOpen(true)
    showTourStep(firstManagerTourStep)
  }

  function showTourStep(step: ManagerTourStep | null) {
    setSpotlight(step?.target)
    if (!step) return
    if (step.settings) setSettingsTab(step.settings)
    select(step.section, 'replace')
  }

  function closeTour() {
    setSpotlight(undefined)
    setTourOpen(false)
    requestAnimationFrame(() => sectionHeading.current?.focus({ preventScroll: true }))
  }

  function closeNotice() {
    setNotice(null)
  }

  function openNotice(label: string) {
    setNotice(label)
  }

  function openAccount() {
    if (workspace) setAccountOpen(true)
    else openNotice('Minha conta')
  }

  function navigate(label: string) {
    if (label === 'Novo agendamento') {
      select('agenda')
      requestCreate('agenda')
      return
    }
    if (label === 'Adicionar cliente') {
      select('clientes')
      requestCreate('clientes')
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
    const settingsTarget = managerSettingsSections.find((item) => item.label === label)
    if (settingsTarget) {
      select('configuracoes')
      setSettingsTab(settingsTarget.id)
      return
    }
    // The "+" action of a real section opens its own creation form.
    if (panels?.[section.id] && label === section.createLabel) {
      requestCreate(section.id)
      return
    }
    openNotice(label)
  }

  /** Opens a page (and settings tab), optionally filling its search or pointing at a field. */
  function go(target: GoTarget) {
    if (!allowedIds.includes(target.section as ManagerSectionId)) return
    changeSearch(false)
    select(target.section as ManagerSectionId)
    if (target.tab) {
      const tab = managerSettingsSections.find(({ id }) => id === target.tab)?.id
      if (tab && (!settingsTabs || settingsTabs.includes(tab))) setSettingsTab(tab)
    }
    if (target.create) requestCreate(target.section)
    setFocus(
      target.query ? { section: target.section, query: target.query, nonce: Date.now() } : null,
    )
    if (target.anchor) highlightAnchor(target.anchor)
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

  const realPanel = panels?.[section.id]
  const panelFocus = focus?.section === section.id ? focus : null
  const sketch =
    realPanel ||
    (payments && section.id === 'financeiro') ||
    section.id === 'inicio' ||
    section.id === 'configuracoes' ||
    section.id === 'midia' ||
    (realClinic && (section.id === 'agenda' || section.id === 'clientes'))
      ? null
      : sectionSketches[section.id]
  // Only example content is labelled; real pages need no caption.
  const showDemoLabel = !realClinic || Boolean(sketch)
  const demoLabel = realClinic ? 'ESBOÇO' : 'PRÉVIA DO GESTOR'
  const demoDetail = isHome
    ? 'Agenda e indicadores demonstrativos'
    : 'Exemplos ilustrativos desta seção'

  const quickActions = createActions.filter((action) => allowedIds.includes(action.section))
  const hasContextAction = !['inicio', 'agenda', 'clientes', 'midia'].includes(section.id)

  const shellContent = (
    <HomeGlassShell
      key={messages?.scope ?? 'preview'}
      scope={messages?.scope ?? (realClinic ? undefined : 'preview')}
      enabled={isHome}
      panelRef={glassPanel}
      className={`manager-shell ${collapsed ? 'is-collapsed' : ''}`}
      ref={shell}
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
        planStatus={currentPlanStatus}
        onPlan={openPlan}
        onToggle={() => setCollapsed((value) => !value)}
        onNavigate={navigate}
      />
      <main className="manager-main" id="manager-content">
        <header className="manager-header">
          <div className="manager-greeting">
            {isHome ? (
              <>
                <h1 ref={sectionHeading} tabIndex={-1} data-manager-spotlight="section-heading">
                  Olá, {firstName}!
                </h1>
                <span>{clinicName}</span>
              </>
            ) : (
              <>
                <p>{clinicName}</p>
                <h1 ref={sectionHeading} tabIndex={-1} data-manager-spotlight="section-heading">
                  {section.label}
                </h1>
              </>
            )}
          </div>
          {searchSections.has(section.id) ? (
            <Button
              ref={searchTrigger}
              data-manager-spotlight="search"
              className="manager-search-trigger"
              variant="secondary"
              onPress={() => changeSearch(true)}
              aria-label={`Buscar em ${section.label} (Control ou Command K)`}
            >
              <Search size={19} />
              <span>{section.searchPlaceholder}</span>
              <kbd>Ctrl/⌘ K</kbd>
            </Button>
          ) : null}
          <div className="manager-header-actions">
            {(quickActions.length > 0 || hasContextAction) && (
              <Dropdown>
                <Dropdown.Trigger className="manager-create-trigger" aria-label="Criação rápida">
                  <Plus size={21} aria-hidden />
                </Dropdown.Trigger>
                <Dropdown.Popover
                  className="manager-account-menu manager-create-menu"
                  placement="bottom end"
                >
                  <Dropdown.Menu
                    aria-label="Criação rápida"
                    onAction={(key) => {
                      if (key === 'current') return navigate(section.createLabel)
                      const action = quickActions.find(({ id }) => id === key)
                      if (action?.upload) fileInput.current?.click()
                      else if (action) go({ section: action.section, create: action.create })
                    }}
                  >
                    {hasContextAction && (
                      <Dropdown.Item id="current" textValue={section.createLabel}>
                        <section.icon size={18} aria-hidden />
                        <span>{section.createLabel}</span>
                      </Dropdown.Item>
                    )}
                    {quickActions.map(({ id, label, detail, icon: Icon }) => (
                      <Dropdown.Item key={id} id={id} textValue={label}>
                        <Icon size={18} aria-hidden />
                        <span>
                          <strong>{label}</strong>
                          <small>{detail}</small>
                        </span>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}
            {isHome && (
              <button
                type="button"
                className="manager-design-trigger"
                popoverTarget="home-glass-panel"
                title="Ajustar design"
              >
                <SlidersHorizontal size={18} aria-hidden />
                <span>Ajustar design</span>
              </button>
            )}
            {workspace ? (
              <NotificationBell api={workspace.api} go={go} onOpenUpdates={message.openUpdates} />
            ) : (
              <Button
                isIconOnly
                aria-label="Novidades e avisos"
                className="manager-icon-button"
                onPress={message.openUpdates}
              >
                <Bell size={20} />
              </Button>
            )}
            <Dropdown>
              <Dropdown.Trigger className="manager-profile" aria-label={`Conta: ${userName}`}>
                <Avatar size="sm">
                  {account?.photo ? <Avatar.Image src={account.photo} alt="" /> : null}
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
                    if (key === 'plan') openPlan()
                    if (key === 'design')
                      requestAnimationFrame(() => glassPanel.current?.showPopover())
                    if (key === 'account') openAccount()
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
                  <Dropdown.Item id="plan" textValue="Meu plano">
                    <Crown size={18} />
                    <span>Meu plano</span>
                  </Dropdown.Item>
                  {isHome && (
                    <Dropdown.Item id="design" textValue="Ajustar design">
                      <SlidersHorizontal size={18} />
                      <span>Ajustar design</span>
                    </Dropdown.Item>
                  )}
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
        {workspace ? (
          <AccountModal
            api={workspace.api}
            fallbackName={givenName === 'Gestor' ? '' : givenName}
            fallbackEmail={userEmail}
            isOpen={accountOpen}
            onOpenChange={setAccountOpen}
            onSaved={async (saved) => {
              setAccount(saved)
              await onAccountSaved?.(saved.name)
            }}
          />
        ) : null}
        {workspace && isHome ? <NoticeCarousel go={go} /> : null}
        {section.id !== 'configuracoes' && banner}
        {realPanel ? realPanel({ createSignal, navigate, focus: panelFocus, go }) : null}
        {section.id === 'inicio' && !realPanel && (
          <HomePanels
            announcement={announcement}
            onDismissAnnouncement={() => setAnnouncement(false)}
            onNavigate={navigate}
          />
        )}
        {section.id === 'financeiro' && payments ? (
          // Optional feature: kept out of the way for spaces that only register payments by hand.
          <details className="fold" open={!realPanel}>
            <summary>
              <span className="kpi-icon" aria-hidden>
                <CreditCard size={22} />
              </span>
              <span className="fold-copy">
                <strong>Receber pelo app (Stripe)</strong>
                <small>
                  Opcional: cartão, Pix e boleto pagos pela cliente ao agendar. Abra para configurar
                  ou acompanhar.
                </small>
              </span>
              <ChevronDown className="fold-chevron" size={20} aria-hidden />
            </summary>
            <div className="fold-body">{payments}</div>
          </details>
        ) : null}
        {section.id === 'midia' && (typeof media === 'function' ? media(incomingMedia) : media)}
        {sketch && (
          <SectionSketchView
            sketch={sketch}
            createLabel={section.createLabel}
            onAction={navigate}
          />
        )}
        {section.id === 'configuracoes' && (
          <>
            <ManagerSettingsNav
              current={settingsTab}
              onSelect={setSettingsTab}
              visible={settingsTabs}
            />
            {settings ? (
              settings(settingsTab, select)
            ) : (
              <Card className="manager-panel">
                <Card.Header>
                  <Card.Title>
                    {managerSettingsSections.find(({ id }) => id === settingsTab)?.label}
                  </Card.Title>
                </Card.Header>
                <Card.Content>
                  <p>Os dados e controles desta seção ficam disponíveis no painel do seu espaço.</p>
                </Card.Content>
              </Card>
            )}
          </>
        )}
        <footer className="manager-footer">
          <span>Luminix · tempo para o que importa.</span>
          <div className="manager-tour-footer-actions">
            {messages && (
              <Button variant="ghost" size="sm" isDisabled={tourOpen} onPress={startTour}>
                <Bug size={15} aria-hidden="true" /> Debug · Abrir tour
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={forceGlass}
              onPress={() => setForceGlass((value) => !value)}
            >
              {forceGlass ? 'Respeitar transparência do sistema' : 'Testar transparência Glass'}
            </Button>
          </div>
        </footer>
      </main>
      <ManagerMobileNav
        navigation={navigation}
        current={section.id}
        onSelect={(id) => select(id)}
        go={go}
        onAccount={openAccount}
        planStatus={currentPlanStatus}
        onPlan={openPlan}
        pickMedia={() => fileInput.current?.click()}
      />
      <input
        ref={fileInput}
        hidden
        multiple
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (!files.length) return
          setIncomingMedia({ files, nonce: Date.now() })
          select('midia')
        }}
      />
      <PlanModal
        isOpen={planOpen}
        onOpenChange={setPlanOpen}
        status={currentPlanStatus}
        endsAt={trialEndsAt}
        now={planNow}
        clinicName={clinicName}
      />
      {tourOpen && (
        <ManagerTour
          canManageSettings={canManageSettings}
          sections={sections}
          onStep={showTourStep}
          onClose={closeTour}
        />
      )}
      {message.view && (
        <ManagerMessageModal
          key={message.view}
          view={message.view}
          clinicName={clinicName}
          canManageSettings={canManageSettings}
          demoPublicUrl={messages?.demoPublicUrl}
          getPublicUrl={messages?.getPublicUrl}
          onClose={message.close}
          onTour={() => {
            message.close()
            startTour()
          }}
          onShowcase={() => {
            message.close()
            setSettingsTab('vitrine')
            select('configuracoes')
          }}
        />
      )}
      <Modal.Backdrop
        isOpen={searchOpen && !message.view}
        onOpenChange={changeSearch}
        className="qm-back qm-back-glow"
      >
        <Modal.Container>
          <Modal.Dialog className="manager-dialog qm-glow">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading>
                {workspace ? `Pesquisar · ${section.label}` : `Buscar em ${section.label}`}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {workspace ? (
                <WorkspaceSearch
                  api={workspace.api}
                  query={query}
                  onQueryChange={setQuery}
                  current={{
                    id: section.id,
                    label: section.label,
                    placeholder: section.searchPlaceholder,
                  }}
                  pages={navigation.map(({ id, label, subtitle }) => ({ id, label, subtitle }))}
                  settingsTabs={settingsTabs}
                  go={go}
                />
              ) : (
                <>
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
                </>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      <Modal.Backdrop
        className="qm-back qm-back-glow"
        isOpen={notice !== null}
        onOpenChange={(open) => {
          if (!open) closeNotice()
        }}
      >
        <Modal.Container size="sm">
          <Modal.Dialog className="manager-dialog qm-glow">
            <Modal.CloseTrigger aria-label="Fechar" />
            <Modal.Header>
              <Modal.Heading>{notice}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {notice === 'Minha conta' && profile ? (
                profile
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
    </HomeGlassShell>
  )
  return workspace ? (
    <WorkspaceSignals
      api={workspace.api}
      clinicId={workspace.clinicId}
      canAudit={workspace.canAudit}
      go={go}
    >
      {shellContent}
    </WorkspaceSignals>
  ) : (
    shellContent
  )
}

/** After opening a page from the search, scrolls to the field it pointed at and makes it glow. */
function highlightAnchor(anchor: string) {
  const wanted = normalize(anchor)
  let tries = 0
  const look = () => {
    const root = document.getElementById('manager-content')
    const candidates = root?.querySelectorAll<HTMLElement>(
      'h2, h3, h4, legend, label, .settings-card-title, [data-search-anchor]',
    )
    const found = [...(candidates ?? [])].find(
      (element) =>
        normalize(element.dataset.searchAnchor ?? element.textContent ?? '').trim() === wanted ||
        normalize(element.textContent ?? '')
          .trim()
          .startsWith(wanted),
    )
    if (!found) {
      if (++tries < 20) window.setTimeout(look, 150)
      return
    }
    const target =
      (found.closest('.lx-field, .settings-card, section, li') as HTMLElement | null) ?? found
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add('ws-flash')
    window.setTimeout(() => target.classList.remove('ws-flash'), 2400)
    const control =
      target.querySelector<HTMLElement>('input:not([type="hidden"]), textarea') ??
      target.querySelector<HTMLElement>('button:not([aria-label*="ajuda" i])')
    control?.focus({ preventScroll: true })
  }
  window.setTimeout(look, 120)
}
