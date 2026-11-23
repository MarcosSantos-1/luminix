'use client'

import { Button, Dropdown, Spinner } from '@heroui/react'
import {
  BadgePercent,
  CalendarCheck,
  Check,
  ClipboardCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  FileText,
  Layers,
  MessageCircle,
  Package,
  Pause,
  Pencil,
  Play,
  Plus,
  ShoppingBag,
  ShieldAlert,
  Trash2,
  TrendingUp,
  TriangleAlert,
  UserRound,
  UsersRound,
  Wand2,
  Zap,
} from 'lucide-react'
import { createElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { catalogRecipe, fold, unitShort } from '@/lib/stock'
import { FilterMenu, type FilterValue } from '../data-kit'
import { QuickModal } from '../quick-modal'
import catalogSuggestions from '@/lib/service-catalog.json'
import {
  ComboField,
  MoneyField,
  SearchInput,
  SelectField,
  TextAreaField,
  TextInputField,
} from '@/components/ui/fields'
import {
  useClinicApi,
  useClinicResource,
  ClinicApiError,
  type ClinicApi,
} from '../settings/clinic-api'
import {
  Empty,
  HelpTip,
  LoadError,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
  TextInput,
  ToggleRow,
  type SaveState,
} from '../settings/settings-kit'
import {
  bookingModes,
  copyText,
  priceLabel,
  priceListText,
  priceTypes,
  type Catalog,
  type PriceType,
  type Service,
  type TeamMember,
} from './catalog-model'
import { EquipmentTab, type Equipment } from './equipment-tab'
import { money, moneyInput, parseMoney, dateBr } from './format'
import { PackagesTab, type CatalogPackage } from './packages-tab'
import { downloadPriceSheet, openPricePdf } from './price-table'
import { PromotionEditor, PromotionsStrip, blankPromotion, promotionExample } from './promotions'
import { serviceIcon } from './service-icons'
import './business.css'
import {
  useWorkspaceSignals,
  useSearchFocus,
  type SearchFocus,
} from '../workspace/workspace-signals'
import { ToastNotice } from '@/components/ui/toast-notice'
import { professionalAvatar } from '@/components/onboarding/model'

export type { Service } from './catalog-model'
export { promotionState } from './catalog-model'

type Extras = {
  canManage: boolean
  canFinance: boolean
  packages: CatalogPackage[]
  equipment: Equipment[]
}
type Suggestion = {
  categoria: string
  nome: string
  descricao?: string
  duracao_minutos: number
  preco_sugerido_brl: number
  tipo_preco?: PriceType
}
type Tab = 'services' | 'packages' | 'equipment'

const durations = [15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240]
// Paused services stay in the list (dimmed), so they can be brought back with one tap.
const defaultFilters: FilterValue = { status: [], mode: [], price: [], other: [], category: [] }
const sortOptions = [
  { id: 'category', label: 'Por categoria' },
  { id: 'name', label: 'Nome (A–Z)' },
  { id: 'price-desc', label: 'Maior valor' },
  { id: 'price-asc', label: 'Menor valor' },
  { id: 'long', label: 'Mais demorados' },
  { id: 'short', label: 'Mais rápidos' },
  { id: 'popular', label: 'Mais agendados' },
]
const sorters: Record<string, (a: Service, b: Service) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, 'pt-BR'),
  'price-desc': (a, b) => b.priceCents - a.priceCents,
  'price-asc': (a, b) => a.priceCents - b.priceCents,
  long: (a, b) => b.durationMinutes - a.durationMinutes,
  short: (a, b) => a.durationMinutes - b.durationMinutes,
  popular: (a, b) => b.bookings90d - a.bookings90d,
}

/** A stable hue per category, so each group gets its own color without configuration. */
function categoryHue(category: string) {
  let hash = 0
  for (const char of category) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return [330, 280, 200, 160, 25, 45, 350, 260, 185][hash % 9]
}

function durationLabel(minutes: number) {
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`
    : `${minutes} min`
}

export function ServicesPanel({
  clinicId,
  clinicName = '',
  canSellPackages = false,
  createSignal,
  onOpenTeam,
  onOpenMarketing,
  focus,
}: {
  clinicId: string
  clinicName?: string
  canSellPackages?: boolean
  createSignal: number
  onOpenTeam: () => void
  /** Promotions live in Marketing (tab Promoções); the strip opens the one running. */
  onOpenMarketing?: (promotionId?: string) => void
  focus?: SearchFocus | null
}) {
  const api = useClinicApi(clinicId)
  const catalog = useClinicResource<Catalog>(api, 'catalog')
  const extras = useClinicResource<Extras>(api, 'catalog/extras')
  const [tab, setTab] = useState<Tab>('services')
  const [editing, setEditing] = useState<Service | null>(null)
  const [promo, setPromo] = useState<ReturnType<typeof blankPromotion> | null>(null)
  const [query, setQuery] = useState('')
  const signals = useWorkspaceSignals()
  const [requestedEquipment, setRequestedEquipment] = useState<string>()
  useSearchFocus(focus, (value) => {
    if (focus?.tab === 'equipment') {
      setTab('equipment')
      setRequestedEquipment(focus.equipmentId)
    } else setQuery(value)
  })
  const [filters, setFilters] = useState<FilterValue>(defaultFilters)
  const [sort, setSort] = useState('category')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  // Starts at 0: arriving here through a "+" elsewhere must open the form on mount.
  const lastSignal = useRef(0)
  const data = catalog.data

  const blank = (): Service => ({
    id: crypto.randomUUID(),
    name: '',
    category: filters.category?.[0] || data?.services[0]?.category || '',
    description: '',
    priceCents: 0,
    priceType: 'fixed',
    durationMinutes: 60,
    bookingMode: 'instant',
    audience: 'all',
    sensitive: false,
    status: 'active',
    professionals: 0,
    professionalIds: [],
    bookings90d: 0,
    promotion: null,
  })

  // The "+ Novo serviço" button at the top of the panel.
  useEffect(() => {
    if (createSignal === lastSignal.current || !data?.canManage) return
    lastSignal.current = createSignal

    setEditing(blank())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal, data?.canManage])

  const categories = useMemo(
    () =>
      [
        ...new Set(
          (data?.services ?? [])
            .filter((service) => !service.evaluation)
            .map((service) => service.category),
        ),
      ].sort(),
    [data],
  )
  if (catalog.error && !data) return <LoadError message={catalog.error} onRetry={catalog.reload} />
  if (!data) return <SettingsSkeleton cards={2} />

  const changed = (message: string) => {
    setNotice(message)
    signals?.refresh()
    catalog.reload()
    extras.reload()
  }

  if (promo)
    return (
      <PromotionEditor
        key={promo.id}
        api={api}
        initial={promo}
        isNew
        services={data.services.filter((service) => service.status === 'active')}
        today={data.today}
        example={promotionExample(data.services)}
        backLabel="Voltar para os serviços"
        onClose={(message) => {
          setPromo(null)
          if (message) changed(message)
        }}
      />
    )

  const needle = query.trim().toLocaleLowerCase('pt-BR')
  const picked = (group: string) => filters[group] ?? []
  const matches = (group: string, value: string) =>
    !picked(group).length || picked(group).includes(value)
  const listed = data.services.filter((service) => !service.evaluation)
  const evaluations = data.services.filter(
    (service) => service.evaluation && service.status === 'active',
  )
  const visible = listed.filter(
    (service) =>
      matches('status', service.status) &&
      matches('mode', service.bookingMode) &&
      matches('price', service.priceType) &&
      (!picked('other').includes('promo') || Boolean(service.promotion)) &&
      (!picked('other').includes('noteam') || service.professionals === 0) &&
      (!picked('other').includes('sensitive') || service.sensitive) &&
      (!picked('category').length || picked('category').includes(service.category)) &&
      (!needle ||
        `${service.name} ${service.category}`.toLocaleLowerCase('pt-BR').includes(needle)),
  )
  // Paused ones go to the end of their group.
  const byStatus = (a: Service, b: Service) =>
    a.status === b.status ? 0 : a.status === 'active' ? -1 : 1
  const groups = sorters[sort]
    ? [{ name: '', items: [...visible].sort((a, b) => byStatus(a, b) || sorters[sort](a, b)) }]
    : [...new Set(visible.map((service) => service.category))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))
        .map((name) => ({
          name,
          items: visible
            .filter((service) => service.category === name)
            .sort((a, b) => byStatus(a, b) || a.name.localeCompare(b.name, 'pt-BR')),
        }))
  const active = listed.filter((service) => service.status === 'active')
  const paused = listed.length - active.length
  const withoutTeam = active.filter((service) => service.professionals === 0).length
  const onPromo = active.filter((service) => service.promotion).length
  const activeFilters =
    picked('status').length +
    picked('mode').length +
    picked('price').length +
    picked('other').length +
    picked('category').length
  const packages = extras.data?.packages ?? []
  const equipment = extras.data?.equipment ?? []
  const sellingPackages = packages.filter((item) => item.status === 'active')
  const activeEquipment = equipment.filter((item) => item.status === 'active')
  const quick = (value: FilterValue) =>
    setFilters(JSON.stringify(filters) === JSON.stringify(value) ? defaultFilters : value)

  async function setStatus(service: Service, status: 'active' | 'archived') {
    setBusy(service.id)
    setNotice('')
    try {
      await api.post(`catalog/services/${service.id}/status`, { status })
      changed(
        status === 'archived'
          ? `${service.name} foi pausado e saiu do site.`
          : `${service.name} voltou para o site.`,
      )
    } catch (error) {
      setNotice(
        error instanceof ClinicApiError && error.status === 400
          ? 'O espaço precisa ter pelo menos um serviço ativo.'
          : 'Não foi possível alterar. Tente de novo.',
      )
    } finally {
      setBusy('')
    }
  }

  function exportTable(kind: 'pdf' | 'xlsx' | 'whatsapp') {
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--space-accent').trim() ||
      '#ec287a'
    if (kind === 'pdf') {
      if (!openPricePdf(data!.services, sellingPackages, clinicName || 'Seu espaço', accent))
        setNotice('O navegador bloqueou a nova aba. Permita pop-ups para gerar o PDF.')
      return
    }
    if (kind === 'xlsx') {
      downloadPriceSheet(data!.services, sellingPackages, clinicName || 'espaco')
      setNotice('Planilha baixada. Abre no Excel, Google Planilhas ou Numbers.')
      return
    }
    void copyText(priceListText(data!.services, sellingPackages, clinicName)).then((ok) =>
      setNotice(
        ok ? 'Tabela copiada! É só colar no WhatsApp.' : 'Não foi possível copiar. Tente de novo.',
      ),
    )
  }

  const tabs: { id: Tab; label: string; icon: ReactNode; count: number }[] = [
    { id: 'services', label: 'Serviços', icon: <ShoppingBag size={18} />, count: active.length },
    { id: 'packages', label: 'Pacotes', icon: <Layers size={18} />, count: sellingPackages.length },
    {
      id: 'equipment',
      label: 'Aparelhos alugados',
      icon: <Zap size={18} />,
      count: activeEquipment.length,
    },
  ]

  return (
    <div className="biz-stack svc">
      <header className="svc-hero">
        <div className="svc-hero-top">
          <div className="svc-hero-copy">
            <h2>Seu catálogo</h2>
            <p>
              {active.length} {active.length === 1 ? 'serviço' : 'serviços'} em {categories.length}{' '}
              {categories.length === 1 ? 'categoria' : 'categorias'}
              <span className="svc-hero-hint">. Mudou aqui, mudou no site na hora.</span>
            </p>
            <div className="svc-hero-stats" role="group" aria-label="Atalhos de filtro">
              <button
                type="button"
                aria-pressed={picked('other').includes('promo')}
                onClick={() => quick({ ...defaultFilters, other: ['promo'] })}
              >
                <BadgePercent size={15} aria-hidden /> {onPromo} em promoção
              </button>
              <button
                type="button"
                data-warn={withoutTeam > 0 || undefined}
                aria-pressed={picked('other').includes('noteam')}
                onClick={() => quick({ ...defaultFilters, other: ['noteam'] })}
              >
                <UsersRound size={15} aria-hidden /> {withoutTeam} sem profissional
              </button>
              <button
                type="button"
                aria-pressed={picked('status').includes('archived')}
                onClick={() => quick({ ...defaultFilters, status: ['archived'] })}
              >
                <Pause size={15} aria-hidden /> {paused} {paused === 1 ? 'pausado' : 'pausados'}
              </button>
            </div>
          </div>
          <div className="svc-hero-actions">
            <Dropdown>
              <Dropdown.Trigger
                className="button button--secondary svc-export"
                aria-label="Tabela de preços"
              >
                <FileText size={16} aria-hidden />
                <span className="svc-export-label">Tabela de preços</span>
                <ChevronDown size={15} aria-hidden className="svc-export-chevron" />
              </Dropdown.Trigger>
              <Dropdown.Popover placement="bottom end">
                <Dropdown.Menu
                  aria-label="Gerar tabela de preços"
                  onAction={(key) => exportTable(key as 'pdf' | 'xlsx' | 'whatsapp')}
                >
                  <Dropdown.Item id="pdf" textValue="PDF estilizado">
                    <FileText size={17} />
                    <span>PDF estilizado</span>
                  </Dropdown.Item>
                  <Dropdown.Item id="xlsx" textValue="Planilha Excel">
                    <FileSpreadsheet size={17} />
                    <span>Planilha (Excel)</span>
                  </Dropdown.Item>
                  <Dropdown.Item id="whatsapp" textValue="Copiar para WhatsApp">
                    <MessageCircle size={17} />
                    <span>Copiar para WhatsApp</span>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
            {/* Phone: the two exports people use most, side by side, without the menu. */}
            <Button
              className="svc-mobile-export"
              variant="secondary"
              onPress={() => exportTable('pdf')}
            >
              <FileText size={18} aria-hidden /> Baixar PDF
            </Button>
            <Button
              className="svc-mobile-export is-whats"
              variant="secondary"
              onPress={() => exportTable('whatsapp')}
            >
              <MessageCircle size={18} aria-hidden /> Copiar p/ WhatsApp
            </Button>
            {data.canManage && tab === 'services' ? (
              <Button className="svc-new lx-laser" onPress={() => setEditing(blank())}>
                <Plus size={18} aria-hidden /> Novo serviço
              </Button>
            ) : null}
          </div>
        </div>

        <div className="svc-tabs" role="tablist" aria-label="Catálogo">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
            >
              <span className="svc-tab-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="svc-tab-label">{item.label}</span>
              <em>{item.count}</em>
            </button>
          ))}
        </div>
      </header>

      <ToastNotice message={notice} onShown={() => setNotice('')} />

      {tab === 'packages' ? (
        extras.data ? (
          <PackagesTab
            api={api}
            services={data.services}
            packages={packages}
            canManage={data.canManage}
            canSell={canSellPackages}
            canFinance={extras.data.canFinance}
            onChanged={changed}
          />
        ) : (
          <SettingsSkeleton cards={1} />
        )
      ) : null}

      {tab === 'equipment' ? (
        extras.data ? (
          <EquipmentTab
            requestedEquipment={requestedEquipment}
            onRequestClosed={() => setRequestedEquipment(undefined)}
            api={api}
            services={data.services}
            equipment={equipment}
            today={data.today}
            canManage={data.canManage}
            canFinance={extras.data.canFinance}
            onChanged={changed}
          />
        ) : (
          <SettingsSkeleton cards={1} />
        )
      ) : null}

      {tab === 'services' ? (
        <>
          <PromotionsStrip
            data={data}
            onCreate={() => setPromo(blankPromotion(data.today))}
            onOpenAll={onOpenMarketing}
          />
          <div className="data-toolbar svc-toolbar">
            <div className="data-searchbar">
              <SearchInput
                className="data-search lx-search-bar"
                ariaLabel="Buscar serviço"
                placeholder="Buscar serviço"
                value={query}
                onChange={setQuery}
              />
              <FilterMenu
                iconOnly
                sort={{ value: sort, onChange: setSort, options: sortOptions }}
                value={filters}
                onChange={setFilters}
                activeCount={activeFilters}
                onClear={() => setFilters(defaultFilters)}
                groups={[
                  ...(categories.length > 1
                    ? [
                        {
                          id: 'category',
                          label: 'Categoria',
                          options: categories.map((name) => ({
                            id: name,
                            label: name,
                            count: listed.filter((service) => service.category === name).length,
                          })),
                        },
                      ]
                    : []),
                  {
                    id: 'status',
                    label: 'Situação',
                    options: [
                      { id: 'active', label: 'No site', count: active.length },
                      { id: 'archived', label: 'Pausados', count: paused },
                    ],
                  },
                  {
                    id: 'other',
                    label: 'Mostrar apenas',
                    options: [
                      { id: 'promo', label: 'Em promoção', count: onPromo },
                      { id: 'noteam', label: 'Sem profissional', count: withoutTeam },
                      { id: 'sensitive', label: 'Íntimos ou sensíveis' },
                    ],
                  },
                  {
                    id: 'mode',
                    label: 'Como a cliente agenda',
                    options: bookingModes.map(({ id, label }) => ({ id, label })),
                  },
                  { id: 'price', label: 'Tipo de preço', options: priceTypes },
                ]}
              />
            </div>
          </div>

          {evaluations.length ? (
            <p className="settings-muted svc-eval-note">
              <ClipboardCheck size={15} aria-hidden />
              <span>
                {evaluations.map((service) => service.name).join(', ')}{' '}
                {evaluations.length === 1 ? 'fica' : 'ficam'} fora desta lista: é a primeira visita
                de quem chega pelo site, e continua disponível na agenda.
              </span>
            </p>
          ) : null}

          {visible.length ? (
            groups.map((group) => (
              <section key={group.name || 'all'} className="svc-group">
                {group.name ? (
                  <h3 style={{ ['--hue' as string]: categoryHue(group.name) }}>
                    <i aria-hidden /> {group.name}
                    <small>{group.items.length}</small>
                  </h3>
                ) : null}
                <ul className="biz-grid svc-grid">
                  {group.items.map((service) => (
                    <ServiceTile
                      key={service.id}
                      service={service}
                      canManage={data.canManage}
                      busy={busy === service.id}
                      onEdit={() => setEditing(service)}
                      onToggle={() =>
                        void setStatus(service, service.status === 'active' ? 'archived' : 'active')
                      }
                      onOpenTeam={onOpenTeam}
                    />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <Empty>Nenhum serviço encontrado com esse filtro.</Empty>
          )}
        </>
      ) : null}

      {editing ? (
        <ServiceEditor
          key={editing.id}
          api={api}
          initial={editing}
          isNew={!data.services.some((service) => service.id === editing.id)}
          categories={categories}
          team={data.team ?? []}
          onClose={(message) => {
            setEditing(null)
            if (message) changed(message)
          }}
        />
      ) : null}
    </div>
  )
}

function ServiceTile({
  service,
  canManage,
  busy,
  onEdit,
  onToggle,
  onOpenTeam,
}: {
  service: Service
  canManage: boolean
  busy: boolean
  onEdit: () => void
  onToggle: () => void
  onOpenTeam: () => void
}) {
  const icon = createElement(serviceIcon(service.category, service.name), { size: 22 })
  const mode = bookingModes.find(({ id }) => id === service.bookingMode)
  const paused = service.status === 'archived'
  return (
    <li
      className={`biz-tile svc-tile${paused ? ' is-paused' : ''}`}
      style={{ ['--hue' as string]: categoryHue(service.category) }}
    >
      <div className="svc-tile-top">
        <span className="svc-tile-icon" aria-hidden>
          {icon}
        </span>
        <div className="svc-tile-price">
          {service.promotion?.priceCents != null && service.priceType !== 'quote' ? (
            <>
              <s>{money(service.priceCents)}</s>
              <strong>{priceLabel(service, service.promotion.priceCents)}</strong>
            </>
          ) : (
            <strong>{priceLabel(service)}</strong>
          )}
          <small>
            <Clock3 size={12} aria-hidden /> {durationLabel(service.durationMinutes)}
          </small>
        </div>
      </div>
      <div className="svc-tile-body">
        <strong title={service.name}>{service.name}</strong>
        <p className={service.description ? undefined : 'is-empty'}>
          {service.description || 'Sem descrição. Conte em uma frase o que está incluído.'}
        </p>
      </div>
      <ul className="biz-tile-facts" aria-label="Detalhes">
        <li title={mode?.hint}>
          <CalendarCheck size={13} aria-hidden /> {mode?.label}
        </li>
        <li>
          <UsersRound size={13} aria-hidden />{' '}
          {service.professionals
            ? `${service.professionals} ${service.professionals === 1 ? 'profissional' : 'profissionais'}`
            : 'Sem profissional'}
        </li>
        {service.audience !== 'all' ? (
          <li>
            <UserRound size={13} aria-hidden />{' '}
            {service.audience === 'women' ? 'Só mulheres' : 'Só homens'}
          </li>
        ) : null}
        {service.bookings90d ? (
          <li>
            <TrendingUp size={13} aria-hidden /> {service.bookings90d} em 90 dias
          </li>
        ) : null}
        {service.sensitive ? (
          <li>
            <ShieldAlert size={13} aria-hidden /> Pede cuidado extra
          </li>
        ) : null}
      </ul>
      <div className="biz-tags">
        {paused ? <StatusPill tone="off">Pausado · fora do site</StatusPill> : null}
        {service.promotion ? (
          <StatusPill tone="on">
            <BadgePercent size={12} aria-hidden /> -{service.promotion.percent}%
            {service.promotion.endsOn ? ` até ${dateBr(service.promotion.endsOn)}` : ''}
          </StatusPill>
        ) : null}
        {!paused && !service.professionals ? (
          <button type="button" className="biz-warning" onClick={onOpenTeam}>
            <TriangleAlert size={13} aria-hidden /> Escolher quem faz
          </button>
        ) : null}
      </div>
      {canManage ? (
        <div className="biz-tile-actions">
          {paused ? (
            <Button size="sm" className="svc-resume" isDisabled={busy} onPress={onToggle}>
              <Play size={14} aria-hidden /> Despausar
            </Button>
          ) : null}
          <Button size="sm" className="svc-edit" variant="secondary" onPress={onEdit}>
            <Pencil size={14} aria-hidden /> Editar
          </Button>
          {!paused ? (
            <Button
              size="sm"
              className="svc-pause"
              variant="secondary"
              isDisabled={busy}
              onPress={onToggle}
            >
              <Pause size={14} aria-hidden /> Pausar
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

type EditorStep = 'what' | 'price' | 'booking' | 'team' | 'supplies' | 'review'

/**
 * "Novo serviço" in steps: what it is (from a suggestion or typed), price and duration, how the
 * client books, and a review. Editing opens the same steps with every one reachable at once.
 */
function ServiceEditor({
  api,
  initial,
  isNew,
  categories,
  team,
  onClose,
}: {
  api: ClinicApi
  initial: Service
  isNew: boolean
  categories: string[]
  /** Active professionals. With one, she does every service (no question). */
  team: TeamMember[]
  onClose: (message?: string) => void
}) {
  const [service, setService] = useState(initial)
  const solo = team.length === 1
  const [who, setWho] = useState<string[]>(() =>
    solo ? [team[0].id] : (initial.professionalIds ?? []),
  )
  const [price, setPrice] = useState(moneyInput(initial.priceCents))
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [showErrors, setShowErrors] = useState(false)
  // New service: the name box is also the search over the suggestion catalog.
  const [picked, setPicked] = useState<Suggestion | null>(null)
  const [manual, setManual] = useState(!isNew)
  const steps: { id: EditorStep; label: string; emoji: string }[] = [
    { id: 'what', label: 'O serviço', emoji: '🔎' },
    { id: 'price', label: 'Preço e tempo', emoji: '💰' },
    { id: 'booking', label: 'Agendamento', emoji: '📅' },
    ...(team.length > 1 ? [{ id: 'team' as const, label: 'Quem faz', emoji: '👥' }] : []),
    ...(isNew ? [] : [{ id: 'supplies' as const, label: 'Produtos', emoji: '🧴' }]),
    { id: 'review', label: 'Revisar', emoji: '✅' },
  ]
  const [step, setStep] = useState<EditorStep>('what')
  const position = steps.findIndex((item) => item.id === step)
  const supplies = useSupplies(api, isNew ? null : initial)
  const set = (patch: Partial<Service>) => {
    setService((current) => ({ ...current, ...patch }))
    if (state.status !== 'saving') setState({ status: 'idle' })
  }
  const priceCents = service.priceType === 'quote' ? 0 : parseMoney(price)
  const errors = {
    name: !service.name.trim() ? 'Escreva o nome do serviço.' : '',
    category: !service.category.trim() ? 'Escolha ou escreva uma categoria.' : '',
    price: priceCents == null ? 'Confira o valor. Exemplo: 120,00' : '',
  }
  const stepErrors: Record<EditorStep, string[]> = {
    what: [errors.name, errors.category].filter(Boolean),
    price: [errors.price].filter(Boolean),
    booking: [],
    team: [],
    supplies: [],
    review: [],
  }
  const needle = fold(service.name.trim())
  const suggestions = useMemo(() => {
    if (!isNew || needle.length < 2) return []
    const words = needle.split(/\s+/).filter(Boolean)
    return (catalogSuggestions as Suggestion[])
      .map((item) => {
        const name = fold(item.nome)
        const score = name.startsWith(needle)
          ? 3
          : name.includes(needle)
            ? 2
            : words.every((word) => `${name} ${fold(item.categoria)}`.includes(word))
              ? 1
              : 0
        return { item, score }
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.nome.localeCompare(b.item.nome, 'pt-BR'))
      .slice(0, 6)
      .map((entry) => entry.item)
  }, [isNew, needle])
  // The category decides the groups of the page: same spelling as an existing one when it
  // matches ("unhas" → "Unhas"), so a group never splits in two.
  const canonical = (value: string) =>
    categories.find((name) => fold(name) === fold(value.trim())) ?? value.trim()
  const isNewCategory =
    Boolean(service.category.trim()) &&
    !categories.some((name) => fold(name) === fold(service.category))
  // A category that fits the typed name, from the closest catalog entry.
  const guessedCategory = useMemo(() => {
    const words = needle.split(/\s+/).filter((word) => word.length > 2)
    if (!words.length) return ''
    let best = { score: 0, category: '' }
    for (const item of catalogSuggestions as Suggestion[]) {
      const name = fold(item.nome)
      const score = words.filter((word) => name.includes(word)).length
      if (score > best.score) best = { score, category: item.categoria }
    }
    return best.category ? canonical(best.category) : ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needle, categories])
  const showFields = manual || Boolean(picked) || (needle.length >= 3 && !suggestions.length)
  const categoryChips = [
    ...new Set([...(guessedCategory ? [guessedCategory] : []), ...categories]),
  ].slice(0, 12)

  function pick(item: Suggestion) {
    setPicked(item)
    set({
      name: item.nome,
      category: canonical(item.categoria),
      description: item.descricao ?? '',
      durationMinutes: item.duracao_minutos,
      priceType: item.tipo_preco ?? 'fixed',
    })
    setPrice(moneyInput(Math.round(item.preco_sugerido_brl * 100)))
  }

  function next() {
    if (stepErrors[step].length) {
      setShowErrors(true)
      if (step === 'what' && errors.category) setManual(true)
      return
    }
    setShowErrors(false)
    setStep(steps[position + 1].id)
  }

  async function save() {
    if (Object.values(errors).some(Boolean)) {
      setShowErrors(true)
      setStep(errors.price ? 'price' : 'what')
      setState({ status: 'error', message: 'Confira os campos marcados.' })
      return
    }
    setState({ status: 'saving' })
    try {
      await api.put(`catalog/services/${service.id}`, {
        name: service.name.trim(),
        category: canonical(service.category),
        description: service.description.trim(),
        priceCents: priceCents ?? 0,
        priceType: service.priceType,
        durationMinutes: service.durationMinutes,
        bookingMode: service.bookingMode,
        audience: service.audience,
        sensitive: service.sensitive,
        // Solo spaces link the only professional; with a team, the ones chosen in "Quem faz".
        ...(team.length ? { professionalIds: solo ? [team[0].id] : who } : {}),
      })
      if (supplies.dirty) await supplies.save()
      onClose(
        isNew
          ? `${service.name.trim()} entrou no catálogo e já aparece no site.`
          : 'Serviço atualizado no site.',
      )
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof ClinicApiError && error.status === 409
            ? 'Já existe um serviço ativo com esse nome.'
            : 'Não foi possível salvar. Tente de novo.',
      })
    }
  }

  const sample = (catalogSuggestions as Suggestion[])
    .filter((item) => !categories.length || categories.includes(item.categoria))
    .slice(0, 3)
    .map((item) => item.nome.toLocaleLowerCase('pt-BR'))
    .join(', ')
  const mode = bookingModes.find(({ id }) => id === service.bookingMode)
  const icon = createElement(serviceIcon(service.category, service.name), { size: 22 })

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className="svc-editor"
      title={isNew ? 'Novo serviço' : `Editar ${initial.name}`}
      subtitle={
        <span className="svc-steps" role="tablist" aria-label="Etapas">
          {steps.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === step}
              data-done={index < position || undefined}
              // A new service goes in order; an existing one jumps anywhere.
              disabled={isNew && index > position}
              onClick={() => setStep(item.id)}
            >
              <i>{index < position ? <Check size={12} /> : item.emoji}</i>
              <span>{item.label}</span>
            </button>
          ))}
        </span>
      }
      footer={
        <>
          {state.status === 'error' ? (
            <span className="apt-error qm-foot-start" role="alert">
              {state.message}
            </span>
          ) : null}
          {position > 0 ? (
            <Button variant="ghost" onPress={() => setStep(steps[position - 1].id)}>
              <ChevronLeft size={16} aria-hidden /> Voltar
            </Button>
          ) : (
            <Button variant="secondary" onPress={() => onClose()}>
              Cancelar
            </Button>
          )}
          {step === 'review' || !isNew ? (
            <Button isDisabled={state.status === 'saving'} onPress={() => void save()}>
              {state.status === 'saving'
                ? 'Salvando…'
                : isNew
                  ? 'Adicionar ao catálogo'
                  : 'Salvar serviço'}
            </Button>
          ) : null}
          {step !== 'review' && isNew ? (
            <Button onPress={next}>
              Continuar <ChevronRight size={16} aria-hidden />
            </Button>
          ) : null}
        </>
      }
    >
      {step === 'what' ? (
        <div className="svc-step">
          {isNew ? (
            <div className="svc-find">
              <span className="svc-find-label">✨ Qual serviço você quer adicionar?</span>
              <SearchInput
                className="biz-search svc-find-input"
                ariaLabel="Nome do serviço"
                placeholder={`Ex.: ${sample || 'limpeza de pele, manicure, escova'}`}
                value={service.name}
                autoFocus
                onChange={(name) => {
                  set({ name })
                  if (picked && name !== picked.nome) setPicked(null)
                }}
                onEnter={() => (suggestions.length && !picked ? pick(suggestions[0]) : next())}
              />
              {showErrors && errors.name ? (
                <small className="svc-find-error" role="alert">
                  {errors.name}
                </small>
              ) : null}
              {!picked && suggestions.length ? (
                <>
                  <span className="svc-find-hint">Toque para preencher tudo de uma vez:</span>
                  <ul className="biz-suggestions svc-find-list">
                    {suggestions.map((item) => (
                      <li key={`${item.categoria}-${item.nome}`}>
                        <button type="button" onClick={() => pick(item)}>
                          <span className="svc-find-icon" aria-hidden>
                            {createElement(serviceIcon(item.categoria, item.nome), { size: 18 })}
                          </span>
                          <span>
                            <strong>{item.nome}</strong>
                            <small>
                              {canonical(item.categoria)} · ⏱️ {durationLabel(item.duracao_minutos)}{' '}
                              · 💰 {money(Math.round(item.preco_sugerido_brl * 100))}
                            </small>
                          </span>
                          <ChevronRight size={16} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!showFields ? (
                    <button
                      type="button"
                      className="svc-find-manual"
                      onClick={() => setManual(true)}
                    >
                      Não é nenhum desses? Criar “{service.name.trim()}” do zero
                    </button>
                  ) : null}
                </>
              ) : null}
              {picked ? (
                <p className="svc-find-picked">
                  <Check size={16} aria-hidden /> Preenchido com a sugestão: preço, duração e
                  descrição. Ajuste o que quiser.
                </p>
              ) : !suggestions.length && needle.length >= 3 ? (
                <p className="svc-find-new">
                  🆕 Não temos “{service.name.trim()}” nas sugestões. Complete a categoria e a
                  descrição abaixo.
                </p>
              ) : null}
            </div>
          ) : (
            <TextInput
              label="Nome"
              value={service.name}
              required
              maxLength={160}
              error={showErrors ? errors.name : undefined}
              onChange={(name) => set({ name })}
            />
          )}

          {showFields ? (
            <div className="svc-find-fields">
              <ComboField
                label="Categoria"
                value={service.category}
                maxLength={120}
                suggestions={[...new Set([...categories, guessedCategory].filter(Boolean))]}
                error={showErrors ? errors.category : undefined}
                help={
                  <HelpTip title="Para que serve a categoria?">
                    Agrupa os serviços na página de Serviços, no site e na tabela de preços, como
                    “Cabelo” ou “Unhas”. Prefira uma que já existe para não separar o mesmo grupo em
                    dois.
                  </HelpTip>
                }
                onChange={(category) => set({ category })}
              />
              {categoryChips.length ? (
                <div className="svc-cat-chips" role="group" aria-label="Categorias">
                  {categoryChips.map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={fold(name) === fold(service.category)}
                      style={{ ['--hue' as string]: categoryHue(name) }}
                      onClick={() => set({ category: name })}
                    >
                      <i aria-hidden />
                      {name}
                      {name === guessedCategory && !categories.includes(name) ? (
                        <small>sugerida</small>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
              {isNewCategory ? (
                <small className="svc-cat-new">
                  🆕 Nova categoria: “{service.category.trim()}” vira um grupo novo na página de
                  Serviços e no site.
                </small>
              ) : null}
              <TextAreaField
                label="Descrição (aparece no site)"
                rows={3}
                maxLength={1200}
                value={service.description}
                placeholder="Conte em poucas palavras o que a cliente recebe."
                onChange={(description) => set({ description })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 'price' ? (
        <div className="svc-step">
          <div className="svc-pick" role="radiogroup" aria-label="Tipo de preço">
            {priceTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                role="radio"
                aria-checked={service.priceType === type.id}
                onClick={() => set({ priceType: type.id })}
              >
                <strong>{type.label}</strong>
                <small>
                  {type.id === 'fixed'
                    ? 'Sempre o mesmo valor'
                    : type.id === 'from'
                      ? 'Pode variar para mais'
                      : 'Combina com a cliente'}
                </small>
              </button>
            ))}
          </div>
          {service.priceType !== 'quote' ? (
            <MoneyField
              label={service.priceType === 'from' ? 'Valor inicial' : 'Valor'}
              value={price}
              error={showErrors ? errors.price : undefined}
              onChange={setPrice}
            />
          ) : (
            <p className="settings-muted">
              O site mostra “Sob consulta” e a cliente fala com você.
            </p>
          )}
          <div className="svc-durations" role="radiogroup" aria-label="Duração">
            <span>Duração</span>
            <div>
              {[...new Set([...durations, service.durationMinutes])]
                .sort((a, b) => a - b)
                .map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    role="radio"
                    aria-checked={service.durationMinutes === minutes}
                    onClick={() => set({ durationMinutes: minutes })}
                  >
                    {durationLabel(minutes)}
                  </button>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === 'booking' ? (
        <div className="svc-step">
          <div className="access-pick" role="radiogroup" aria-label="Como agendar">
            {bookingModes.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={service.bookingMode === item.id}
                onClick={() => set({ bookingMode: item.id })}
              >
                <strong>{item.label}</strong>
                <small>
                  {item.id === 'manual_release'
                    ? 'Aparelho alugado ou sala: liberado só nos dias do aparelho.'
                    : item.hint}
                </small>
              </button>
            ))}
          </div>
          <div className="team-choice" role="radiogroup" aria-label="Público">
            {(
              [
                ['all', 'Para todos'],
                ['women', 'Só mulheres'],
                ['men', 'Só homens'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={service.audience === id}
                onClick={() => set({ audience: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <ToggleRow
            title="Serviço íntimo ou sensível"
            description="Ex.: depilação íntima. Permite escolher, por profissional, quem atende."
            isSelected={service.sensitive}
            onChange={(sensitive) => set({ sensitive })}
          />
        </div>
      ) : null}

      {step === 'team' ? (
        <div className="svc-step">
          <div className="svc-team-head">
            <strong>Quem faz este serviço?</strong>
            <small>
              Marque uma ou mais pessoas. Só elas aparecem para a cliente escolher na hora de
              agendar.
            </small>
          </div>
          <div className="svc-team" role="group" aria-label="Quem faz">
            {team.map((person) => {
              const on = who.includes(person.id)
              return (
                <button
                  key={person.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() =>
                    setWho((current) =>
                      on ? current.filter((id) => id !== person.id) : [...current, person.id],
                    )
                  }
                >
                  <span className="svc-team-face" aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element -- public team photo */}
                    <img src={professionalAvatar(person.photoUrl, person.gender)} alt="" />
                  </span>
                  <strong>{person.name.split(' ')[0]}</strong>
                  <i aria-hidden>{on ? <Check size={14} strokeWidth={3} /> : null}</i>
                </button>
              )
            })}
          </div>
          <div className="svc-team-tools">
            <Button
              size="sm"
              variant="ghost"
              onPress={() =>
                setWho(who.length === team.length ? [] : team.map((person) => person.id))
              }
            >
              {who.length === team.length ? 'Desmarcar todas' : 'Todas fazem'}
            </Button>
            {!who.length ? (
              <small className="svc-team-warn">
                <TriangleAlert size={14} aria-hidden /> Sem ninguém marcado, as clientes não
                conseguem agendar este serviço.
              </small>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 'supplies' ? <SuppliesCard supplies={supplies} service={service} /> : null}

      {step === 'review' ? (
        <div className="svc-step">
          <div
            className="svc-tile svc-preview"
            style={{ ['--hue' as string]: categoryHue(service.category) }}
          >
            <div className="svc-tile-top">
              <span className="svc-tile-icon" aria-hidden>
                {icon}
              </span>
              <div className="svc-tile-price">
                <strong>{priceLabel({ ...service, priceCents: priceCents ?? 0 })}</strong>
                <small>
                  <Clock3 size={12} aria-hidden /> {durationLabel(service.durationMinutes)}
                </small>
              </div>
            </div>
            <div className="svc-tile-body">
              <small className="svc-preview-cat">{service.category}</small>
              <strong>{service.name || 'Sem nome'}</strong>
              <p className={service.description ? undefined : 'is-empty'}>
                {service.description || 'Sem descrição.'}
              </p>
            </div>
            <ul className="biz-tile-facts">
              <li>
                <CalendarCheck size={13} aria-hidden /> {mode?.label}
              </li>
              {service.audience !== 'all' ? (
                <li>
                  <UserRound size={13} aria-hidden />{' '}
                  {service.audience === 'women' ? 'Só mulheres' : 'Só homens'}
                </li>
              ) : null}
            </ul>
          </div>
          {team.length ? (
            <p className="svc-review-team">
              <UsersRound size={15} aria-hidden />{' '}
              {solo
                ? `Feito por ${team[0].name.split(' ')[0]}.`
                : who.length
                  ? `Feito por ${team
                      .filter((person) => who.includes(person.id))
                      .map((person) => person.name.split(' ')[0])
                      .join(', ')}.`
                  : 'Ninguém marcado em “Quem faz”: as clientes ainda não conseguem agendar.'}
            </p>
          ) : null}
          <p className="settings-footnote">
            É assim que aparece no site.
            {service.bookingMode === 'manual_release'
              ? ' Depois de criar, ligue ao aparelho em Aparelhos alugados.'
              : ''}
          </p>
        </div>
      ) : null}
    </QuickModal>
  )
}

type SupplyItem = {
  id: string
  name: string
  unit: string
  packageSize: number | null
  packageLabel: string | null
}

/** The recipe of a service: what each appointment takes from the stock. */
function useSupplies(api: ClinicApi, service: Service | null) {
  const [items, setItems] = useState<SupplyItem[] | null>(null)
  const [lines, setLines] = useState<{ itemId: string; quantity: string }[]>([])
  const [dirty, setDirty] = useState(false)
  const [failed, setFailed] = useState(false)
  const serviceId = service?.id
  useEffect(() => {
    if (!serviceId) return
    let active = true
    void api
      .get<{ supplies: { itemId: string; quantity: number }[]; items: SupplyItem[] }>(
        `catalog/services/${serviceId}/supplies`,
      )
      .then((data) => {
        if (!active) return
        setItems(data.items)
        setLines(
          data.supplies.map((line) => ({
            itemId: line.itemId,
            quantity: String(line.quantity).replace('.', ','),
          })),
        )
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [api, serviceId])
  return {
    items,
    lines,
    failed,
    dirty,
    update(next: { itemId: string; quantity: string }[]) {
      setLines(next)
      setDirty(true)
    },
    async save() {
      if (!serviceId) return
      await api.put(`catalog/services/${serviceId}/supplies`, {
        items: lines
          .map((line) => ({
            itemId: line.itemId,
            quantity: Math.round(Number(line.quantity.replace(',', '.')) * 100) / 100,
          }))
          .filter((line) => line.itemId && line.quantity > 0),
      })
    },
  }
}

function SuppliesCard({
  supplies,
  service,
}: {
  supplies: ReturnType<typeof useSupplies>
  service: Service
}) {
  const { items, lines } = supplies
  const unitOf = (itemId: string) => {
    const item = items?.find((entry) => entry.id === itemId)
    return item ? unitShort(item.unit) : ''
  }
  const suggested = catalogRecipe(service).filter(
    (line) =>
      line.product &&
      items?.some(
        (item) =>
          fold(item.name) === fold(line.product!.nome) &&
          !lines.some((entry) => entry.itemId === item.id),
      ),
  )
  return (
    <SettingsCard
      icon={<Package size={20} />}
      title="Produtos usados"
      description="Quanto cada atendimento gasta. Ao concluir, o estoque desconta sozinho."
      help={{
        title: 'E se cada cliente gastar diferente?',
        text: 'É uma estimativa. Ao concluir o atendimento você pode aumentar ou diminuir o que foi usado naquela vez; aqui fica o valor de costume.',
      }}
    >
      {supplies.failed ? (
        <p className="settings-muted">Não foi possível carregar os produtos.</p>
      ) : !items ? (
        <Spinner size="sm" aria-label="Carregando" />
      ) : !items.length ? (
        <p className="settings-muted">Cadastre os produtos em Estoque para ligar a este serviço.</p>
      ) : (
        <>
          {lines.length ? (
            <ul className="svc-supplies">
              {lines.map((line, index) => (
                <li key={`${line.itemId}-${index}`}>
                  <SelectField
                    ariaLabel="Produto"
                    value={line.itemId}
                    onChange={(itemId) =>
                      supplies.update(
                        lines.map((entry, at) => (at === index ? { ...entry, itemId } : entry)),
                      )
                    }
                    options={items.map((item) => ({ id: item.id, label: item.name }))}
                  />
                  <TextInputField
                    ariaLabel="Quantidade por atendimento"
                    inputMode="decimal"
                    value={line.quantity}
                    suffix={unitOf(line.itemId)}
                    onChange={(quantity) =>
                      supplies.update(
                        lines.map((entry, at) => (at === index ? { ...entry, quantity } : entry)),
                      )
                    }
                  />
                  <Button
                    isIconOnly
                    variant="ghost"
                    aria-label="Tirar produto"
                    onPress={() => supplies.update(lines.filter((_, at) => at !== index))}
                  >
                    <Trash2 size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="settings-muted">Nenhum produto ligado a este serviço ainda.</p>
          )}
          <div className="biz-actions">
            <Button
              size="sm"
              variant="secondary"
              onPress={() =>
                supplies.update([
                  ...lines,
                  {
                    itemId:
                      items.find((item) => !lines.some((line) => line.itemId === item.id))?.id ??
                      items[0].id,
                    quantity: '1',
                  },
                ])
              }
            >
              <Plus size={15} aria-hidden /> Adicionar produto
            </Button>
            {suggested.length ? (
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  supplies.update([
                    ...lines,
                    ...suggested.map((line) => ({
                      itemId: items.find((item) => fold(item.name) === fold(line.product!.nome))!
                        .id,
                      quantity: String(line.quantity).replace('.', ','),
                    })),
                  ])
                }
              >
                <Wand2 size={15} aria-hidden /> Usar sugestão ({suggested.length})
              </Button>
            ) : null}
          </div>
        </>
      )}
    </SettingsCard>
  )
}
