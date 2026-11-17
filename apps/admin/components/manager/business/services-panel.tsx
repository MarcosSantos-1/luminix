'use client'

import { Button, Spinner } from '@heroui/react'
import {
  BadgePercent,
  CalendarCheck,
  CalendarRange,
  Check,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  Pause,
  Pencil,
  Play,
  Plus,
  Scissors,
  ShieldAlert,
  Store,
  TrendingUp,
  TriangleAlert,
  UserRound,
  UsersRound,
  Wand2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FilterMenu, KpiCards, type FilterValue } from '../data-kit'
import { QuickModal } from '../quick-modal'
import catalogSuggestions from '@/lib/service-catalog.json'
import {
  CheckboxField,
  ComboField,
  DateInputField,
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
  SaveBar,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
  TextInput,
  ToggleRow,
  type SaveState,
} from '../settings/settings-kit'
import { money, moneyInput, parseMoney, dateBr } from './format'
import { serviceIcon } from './service-icons'
import './business.css'
import { useSearchFocus, type SearchFocus } from '../workspace/workspace-signals'

type PriceType = 'fixed' | 'from' | 'quote'
type BookingMode = 'instant' | 'request' | 'manual_release'
type Audience = 'all' | 'women' | 'men'
export type Service = {
  id: string
  name: string
  category: string
  description: string
  priceCents: number
  priceType: PriceType
  durationMinutes: number
  bookingMode: BookingMode
  audience: Audience
  sensitive: boolean
  status: 'active' | 'archived'
  professionals: number
  bookings90d: number
  promotion: {
    id: string
    percent: number
    endsOn: string | null
    priceCents: number | null
  } | null
}
type Promotion = {
  id: string
  name: string
  /** percent: one discount for every chosen service; custom: a price typed for each one. */
  kind: 'percent' | 'custom'
  percent: number
  /** Only for kind = custom: service id → promotional price in cents. */
  prices: Record<string, number>
  startsOn: string
  endsOn: string | null
  status: 'active' | 'paused' | 'archived'
  showOnSite: boolean
  serviceIds: string[]
}
type Catalog = { today: string; canManage: boolean; services: Service[]; promotions: Promotion[] }
type Suggestion = {
  categoria: string
  nome: string
  descricao?: string
  duracao_minutos: number
  preco_sugerido_brl: number
  tipo_preco?: PriceType
}

const bookingModes: { id: BookingMode; label: string; hint: string }[] = [
  { id: 'instant', label: 'Cliente marca direto', hint: 'O horário fica reservado na hora.' },
  {
    id: 'request',
    label: 'Cliente pede, você confirma',
    hint: 'Bom para serviços que pedem avaliação.',
  },
  {
    id: 'manual_release',
    label: 'Depende de aparelho ou sala',
    hint: 'Disponibilidade combinada com a equipe.',
  },
]
const priceTypes: { id: PriceType; label: string }[] = [
  { id: 'fixed', label: 'Valor fixo' },
  { id: 'from', label: 'A partir de' },
  { id: 'quote', label: 'Sob consulta' },
]
const durations = [15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240]
const defaultFilters: FilterValue = { status: ['active'], mode: [], price: [], other: [] }
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

/** Promotional price of a service inside a promotion (null when it is not a real discount). */
function promoPrice(promotion: Promotion, service: Service) {
  if (promotion.kind === 'custom') return promotion.prices[service.id] ?? null
  return Math.round((service.priceCents * (100 - promotion.percent)) / 100)
}

/**
 * Price list of a promotion, ready to paste on WhatsApp: title, period and one block per
 * category ("subtítulo") with "de R$ X por R$ Y".
 */
function promotionText(promotion: Promotion, services: Service[]) {
  const chosen = services.filter((service) => promotion.serviceIds.includes(service.id))
  const lines = [`*${promotion.name.trim() || 'Promoção'}*`]
  if (promotion.endsOn)
    lines.push(`_De ${dateBr(promotion.startsOn)} até ${dateBr(promotion.endsOn)}_`)
  for (const category of [...new Set(chosen.map((service) => service.category))]) {
    lines.push('', `*${category}*`)
    for (const service of chosen.filter((item) => item.category === category)) {
      const price = promoPrice(promotion, service)
      lines.push(
        price == null
          ? `• ${service.name}: ${money(service.priceCents)}`
          : `• ${service.name}: de ~${money(service.priceCents)}~ por *${money(price)}*`,
      )
    }
  }
  return lines.join('\n')
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Editors replace the list on the same page: start them at the top, not where the list was. */
function useScrollTop() {
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])
}

export function promotionState(
  promotion: Pick<Promotion, 'status' | 'startsOn' | 'endsOn'>,
  today: string,
) {
  if (promotion.status === 'archived') return { label: 'Encerrada', tone: 'off' as const }
  if (promotion.status === 'paused') return { label: 'Pausada', tone: 'off' as const }
  if (promotion.endsOn && promotion.endsOn < today)
    return { label: 'Encerrada', tone: 'off' as const }
  if (promotion.startsOn > today) return { label: 'Agendada', tone: 'info' as const }
  return { label: 'Ativa', tone: 'on' as const }
}

function priceLabel(
  service: Pick<Service, 'priceType' | 'priceCents'>,
  cents = service.priceCents,
) {
  if (service.priceType === 'quote') return 'Sob consulta'
  return `${service.priceType === 'from' ? 'A partir de ' : ''}${money(cents)}`
}

export function ServicesPanel({
  clinicId,
  createSignal,
  onOpenTeam,
  focus,
}: {
  clinicId: string
  createSignal: number
  onOpenTeam: () => void
  focus?: SearchFocus | null
}) {
  const api = useClinicApi(clinicId)
  const catalog = useClinicResource<Catalog>(api, 'catalog')
  const [editing, setEditing] = useState<Service | null>(null)
  const [promo, setPromo] = useState<Promotion | null>(null)
  const [query, setQuery] = useState('')
  useSearchFocus(focus, setQuery)
  const [category, setCategory] = useState('')
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
    category: category || data?.services[0]?.category || '',
    description: '',
    priceCents: 0,
    priceType: 'fixed',
    durationMinutes: 60,
    bookingMode: 'instant',
    audience: 'all',
    sensitive: false,
    status: 'active',
    professionals: 0,
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
    () => [...new Set((data?.services ?? []).map((service) => service.category))].sort(),
    [data],
  )
  if (catalog.error && !data) return <LoadError message={catalog.error} onRetry={catalog.reload} />
  if (!data) return <SettingsSkeleton cards={2} />

  const needle = query.trim().toLocaleLowerCase('pt-BR')
  const picked = (group: string) => filters[group] ?? []
  const matches = (group: string, value: string) =>
    !picked(group).length || picked(group).includes(value)
  const visible = data.services.filter(
    (service) =>
      matches('status', service.status) &&
      matches('mode', service.bookingMode) &&
      matches('price', service.priceType) &&
      (!picked('other').includes('promo') || Boolean(service.promotion)) &&
      (!picked('other').includes('noteam') || service.professionals === 0) &&
      (!picked('other').includes('sensitive') || service.sensitive) &&
      (!category || service.category === category) &&
      (!needle ||
        `${service.name} ${service.category}`.toLocaleLowerCase('pt-BR').includes(needle)),
  )
  const ordered = sorters[sort]
    ? [...visible].sort(sorters[sort])
    : [...new Set(visible.map((service) => service.category))].flatMap((name) =>
        visible.filter((service) => service.category === name),
      )
  const active = data.services.filter((service) => service.status === 'active')
  const paused = data.services.length - active.length
  const withoutTeam = active.filter((service) => service.professionals === 0).length
  const onPromo = active.filter((service) => service.promotion).length
  const activeFilters =
    picked('mode').length +
    picked('price').length +
    picked('other').length +
    (picked('status').length === 1 && picked('status')[0] === 'active' ? 0 : 1)
  // Which KPI card matches the current filters, so it shows as pressed.
  const same = (value: FilterValue) =>
    ['status', 'mode', 'price', 'other'].every(
      (group) => [...picked(group)].sort().join() === [...(value[group] ?? [])].sort().join(),
    )
  const kpiFilters: Record<string, FilterValue> = {
    site: defaultFilters,
    promo: { ...defaultFilters, other: ['promo'] },
    noteam: { ...defaultFilters, other: ['noteam'] },
    paused: { ...defaultFilters, status: ['archived'] },
  }
  const activeKpi = Object.keys(kpiFilters).find((id) => same(kpiFilters[id])) ?? ''
  // Examples in the texts follow what this space actually sells (a tattoo studio is not offered
  // a "semana da sobrancelha").
  const topCategory =
    [...categories].sort(
      (a, b) =>
        active.filter((service) => service.category === b).length -
        active.filter((service) => service.category === a).length,
    )[0] ?? ''
  const example = topCategory
    ? `Semana de ${topCategory.toLocaleLowerCase('pt-BR')}`
    : 'Semana especial'

  if (promo)
    return (
      <PromotionEditor
        key={promo.id}
        api={api}
        initial={promo}
        isNew={!data.promotions.some((item) => item.id === promo.id)}
        services={data.services.filter((service) => service.status === 'active')}
        today={data.today}
        example={example}
        onClose={(message) => {
          setPromo(null)
          if (message) {
            setNotice(message)
            catalog.reload()
          }
        }}
      />
    )

  async function setStatus(service: Service, status: 'active' | 'archived') {
    setBusy(service.id)
    setNotice('')
    try {
      await api.post(`catalog/services/${service.id}/status`, { status })
      setNotice(
        status === 'archived'
          ? `${service.name} foi pausado e saiu do site.`
          : `${service.name} voltou para o site.`,
      )
      catalog.reload()
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

  return (
    <div className="biz-stack">
      <KpiCards
        label="Resumo dos serviços"
        active={activeKpi}
        onSelect={(id) => setFilters(activeKpi === id ? defaultFilters : kpiFilters[id])}
        items={[
          {
            id: 'site',
            label: 'No site',
            value: active.length,
            hint: `${categories.length} ${categories.length === 1 ? 'categoria' : 'categorias'}`,
            icon: <Store size={22} />,
          },
          {
            id: 'promo',
            label: 'Em promoção',
            value: onPromo,
            hint: onPromo ? 'Com preço promocional hoje' : 'Nenhum hoje',
            icon: <BadgePercent size={22} />,
            tone: 'good',
          },
          {
            id: 'noteam',
            label: 'Sem profissional',
            value: withoutTeam,
            hint: withoutTeam ? 'Ninguém da equipe faz' : 'Todos têm alguém',
            icon: <UsersRound size={22} />,
            tone: withoutTeam ? 'warn' : 'info',
          },
          {
            id: 'paused',
            label: 'Pausados',
            value: paused,
            hint: paused ? 'Fora do site e da agenda' : 'Nenhum pausado',
            icon: <Pause size={22} />,
            tone: 'info',
          },
        ]}
      />

      {notice ? (
        <p className="team-notice" role="status">
          <Check size={16} aria-hidden /> {notice}
        </p>
      ) : null}

      <SettingsCard
        icon={<Scissors size={20} />}
        title="Seu catálogo"
        description="O que aparece no site e na agenda. Mudou aqui, mudou no site na hora."
        help={{
          title: 'De onde vieram esses serviços?',
          text: 'Do cadastro inicial. Você pode editar preços, descrições e duração quando quiser, criar novos ou pausar os que não faz mais. Pausar não apaga o histórico dos atendimentos.',
        }}
        badge={
          data.canManage ? (
            <Button size="sm" onPress={() => setEditing(blank())}>
              <Plus size={15} aria-hidden /> Novo serviço
            </Button>
          ) : null
        }
      >
        <div className="data-toolbar">
          <SearchInput
            className="data-search"
            ariaLabel="Buscar serviço"
            placeholder="Buscar serviço"
            value={query}
            onChange={setQuery}
          />
          <SelectField
            className="data-sort"
            ariaLabel="Ordenar serviços"
            value={sort}
            onChange={setSort}
            options={sortOptions}
          />
          <FilterMenu
            value={filters}
            onChange={setFilters}
            activeCount={activeFilters}
            onClear={() => setFilters(defaultFilters)}
            groups={[
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
        {categories.length > 1 ? (
          <div className="biz-chips" role="group" aria-label="Filtrar por categoria">
            <button type="button" aria-pressed={!category} onClick={() => setCategory('')}>
              Todas
            </button>
            {categories.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={category === name}
                onClick={() => setCategory(category === name ? '' : name)}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}

        {ordered.length ? (
          <ul className="biz-grid">
            {ordered.map((service) => {
              const Icon = serviceIcon(service.category, service.name)
              const mode = bookingModes.find(({ id }) => id === service.bookingMode)
              return (
                <li
                  key={service.id}
                  className={`biz-tile${service.status === 'archived' ? ' is-muted' : ''}`}
                >
                  <div className="biz-tile-head">
                    <span className="biz-tile-icon" aria-hidden>
                      <Icon size={20} />
                    </span>
                    <div className="biz-tile-title">
                      <strong title={service.name}>{service.name}</strong>
                      <span className="biz-row-meta">
                        {service.category} · <Clock3 size={13} aria-hidden />{' '}
                        {service.durationMinutes} min
                      </span>
                    </div>
                    <div className="biz-price">
                      {service.promotion?.priceCents != null && service.priceType !== 'quote' ? (
                        <>
                          <s>{money(service.priceCents)}</s>
                          <strong>{priceLabel(service, service.promotion.priceCents)}</strong>
                        </>
                      ) : (
                        <strong>{priceLabel(service)}</strong>
                      )}
                    </div>
                  </div>
                  <p className={`biz-tile-text${service.description ? '' : ' is-empty'}`}>
                    {service.description ||
                      'Sem descrição. Conte em uma frase o que está incluído.'}
                  </p>
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
                    {service.status === 'archived' ? (
                      <StatusPill tone="off">Pausado</StatusPill>
                    ) : null}
                    {service.promotion ? (
                      <StatusPill tone="on">
                        <BadgePercent size={12} aria-hidden /> -{service.promotion.percent}%
                        {service.promotion.endsOn ? ` até ${dateBr(service.promotion.endsOn)}` : ''}
                      </StatusPill>
                    ) : null}
                    {service.status === 'active' && !service.professionals ? (
                      <button type="button" className="biz-warning" onClick={onOpenTeam}>
                        <TriangleAlert size={13} aria-hidden /> Escolher quem faz
                      </button>
                    ) : null}
                  </div>
                  {data.canManage ? (
                    <div className="biz-tile-actions">
                      <Button size="sm" variant="secondary" onPress={() => setEditing(service)}>
                        <Pencil size={14} aria-hidden /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        isDisabled={busy === service.id}
                        onPress={() =>
                          void setStatus(
                            service,
                            service.status === 'active' ? 'archived' : 'active',
                          )
                        }
                      >
                        {service.status === 'active' ? (
                          <>
                            <Pause size={14} aria-hidden /> Pausar
                          </>
                        ) : (
                          <>
                            <Play size={14} aria-hidden /> Reativar
                          </>
                        )}
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty>Nenhum serviço encontrado com esse filtro.</Empty>
        )}
      </SettingsCard>

      <SettingsCard
        icon={<BadgePercent size={20} />}
        title="Promoções"
        description="Desconto em porcentagem ou um valor escolhido para cada serviço, por um período. O site mostra o preço riscado e o novo valor."
        help={{
          title: 'Como a promoção funciona?',
          text: 'Escolha os serviços, o desconto (uma porcentagem para todos ou um valor para cada um) e as datas. Enquanto estiver ativa, o site mostra “De R$ 100 por R$ 80” e os novos agendamentos já guardam o preço com desconto. Serviços “sob consulta” não entram em promoção.',
        }}
        badge={
          data.canManage ? (
            <Button
              size="sm"
              onPress={() =>
                setPromo({
                  id: crypto.randomUUID(),
                  name: '',
                  kind: 'percent',
                  percent: 10,
                  prices: {},
                  startsOn: data.today,
                  endsOn: null,
                  status: 'active',
                  showOnSite: true,
                  serviceIds: [],
                })
              }
            >
              <Plus size={15} aria-hidden /> Nova promoção
            </Button>
          ) : null
        }
      >
        {data.promotions.length ? (
          <ul className="biz-grid">
            {data.promotions.map((item) => {
              const state = promotionState(item, data.today)
              return (
                <li key={item.id} className="biz-tile">
                  <div className="biz-tile-head">
                    <span className="biz-tile-icon" aria-hidden>
                      <BadgePercent size={20} />
                    </span>
                    <div className="biz-tile-title">
                      <strong title={item.name}>{item.name}</strong>
                      <span className="biz-row-meta">
                        {item.serviceIds.length}{' '}
                        {item.serviceIds.length === 1 ? 'serviço' : 'serviços'}
                      </span>
                    </div>
                    <div className="biz-price">
                      <strong>
                        {item.kind === 'custom' ? `até -${item.percent}%` : `-${item.percent}%`}
                      </strong>
                    </div>
                  </div>
                  <div className="biz-row-main">
                    <span className="biz-row-meta">
                      <CalendarRange size={13} aria-hidden /> {dateBr(item.startsOn)}
                      {item.endsOn ? ` até ${dateBr(item.endsOn)}` : ' · sem data para acabar'}
                    </span>
                    <div className="biz-tags">
                      <StatusPill tone={state.tone}>{state.label}</StatusPill>
                      <StatusPill tone="info">
                        {item.showOnSite ? (
                          <>
                            <Eye size={12} aria-hidden /> No site
                          </>
                        ) : (
                          <>
                            <EyeOff size={12} aria-hidden /> Só na agenda
                          </>
                        )}
                      </StatusPill>
                    </div>
                  </div>
                  {data.canManage ? (
                    <div className="biz-tile-actions">
                      <Button size="sm" variant="secondary" onPress={() => setPromo(item)}>
                        <Pencil size={14} aria-hidden /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() =>
                          void copyText(promotionText(item, data.services)).then((ok) =>
                            setNotice(
                              ok
                                ? `Lista de “${item.name}” copiada. É só colar no WhatsApp.`
                                : 'Não foi possível copiar. Tente de novo.',
                            ),
                          )
                        }
                      >
                        <Copy size={14} aria-hidden /> Copiar para WhatsApp
                      </Button>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="biz-empty">
            <BadgePercent size={24} aria-hidden />
            <p>Nenhuma promoção ainda. Que tal uma “{example}” com 15% de desconto?</p>
          </div>
        )}
      </SettingsCard>

      {editing ? (
        <ServiceEditor
          key={editing.id}
          api={api}
          initial={editing}
          isNew={!data.services.some((service) => service.id === editing.id)}
          categories={categories}
          onClose={(message) => {
            setEditing(null)
            if (message) {
              setNotice(message)
              catalog.reload()
            }
          }}
        />
      ) : null}
    </div>
  )
}

function ServiceEditor({
  api,
  initial,
  isNew,
  categories,
  onClose,
}: {
  api: ClinicApi
  initial: Service
  isNew: boolean
  categories: string[]
  onClose: (message?: string) => void
}) {
  const [service, setService] = useState(initial)
  const [price, setPrice] = useState(moneyInput(initial.priceCents))
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [showErrors, setShowErrors] = useState(false)
  const [suggestQuery, setSuggestQuery] = useState('')
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
  const suggestions = useMemo(() => {
    const needle = suggestQuery.trim().toLocaleLowerCase('pt-BR')
    if (needle.length < 2) return []
    return (catalogSuggestions as Suggestion[])
      .filter((item) =>
        `${item.nome} ${item.categoria}`.toLocaleLowerCase('pt-BR').includes(needle),
      )
      .slice(0, 6)
  }, [suggestQuery])

  async function save() {
    if (Object.values(errors).some(Boolean)) {
      setShowErrors(true)
      setState({ status: 'error', message: 'Confira os campos marcados.' })
      return
    }
    setState({ status: 'saving' })
    try {
      await api.put(`catalog/services/${service.id}`, {
        name: service.name.trim(),
        category: service.category.trim(),
        description: service.description.trim(),
        priceCents: priceCents ?? 0,
        priceType: service.priceType,
        durationMinutes: service.durationMinutes,
        bookingMode: service.bookingMode,
        audience: service.audience,
        sensitive: service.sensitive,
      })
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

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={isNew ? 'Novo serviço' : `Editar ${initial.name}`}
      subtitle="O que você salvar aqui muda no site e na agenda na hora."
      footer={
        <>
          {state.status === 'error' ? (
            <span className="apt-error qm-foot-start" role="alert">
              {state.message}
            </span>
          ) : null}
          <Button variant="secondary" onPress={() => onClose()}>
            Cancelar
          </Button>
          <Button isDisabled={state.status === 'saving'} onPress={() => void save()}>
            {state.status === 'saving'
              ? 'Salvando…'
              : isNew
                ? 'Adicionar ao catálogo'
                : 'Salvar serviço'}
          </Button>
        </>
      }
    >
      {isNew ? (
        <SettingsCard
          icon={<Wand2 size={20} />}
          title="Começar de uma sugestão"
          description="Digite o nome e escolha um modelo pronto. Depois é só ajustar o preço."
        >
          <SearchInput
            className="biz-search"
            ariaLabel="Buscar sugestão"
            placeholder={`Ex.: ${sample || 'limpeza de pele, manicure, escova'}`}
            value={suggestQuery}
            onChange={setSuggestQuery}
          />
          {suggestions.length ? (
            <ul className="biz-suggestions">
              {suggestions.map((item) => (
                <li key={`${item.categoria}-${item.nome}`}>
                  <button
                    type="button"
                    onClick={() => {
                      set({
                        name: item.nome,
                        category: item.categoria,
                        description: item.descricao ?? '',
                        durationMinutes: item.duracao_minutos,
                        priceType: item.tipo_preco ?? 'fixed',
                      })
                      setPrice(moneyInput(Math.round(item.preco_sugerido_brl * 100)))
                      setSuggestQuery('')
                    }}
                  >
                    <strong>{item.nome}</strong>
                    <small>
                      {item.categoria} · {item.duracao_minutos} min · sugerido{' '}
                      {money(Math.round(item.preco_sugerido_brl * 100))}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </SettingsCard>
      ) : null}
      <SettingsCard icon={<Scissors size={20} />} title="Sobre o serviço">
        <div className="settings-grid">
          <TextInput
            label="Nome"
            value={service.name}
            required
            maxLength={160}
            error={showErrors ? errors.name : undefined}
            onChange={(name) => set({ name })}
          />
          <ComboField
            label="Categoria"
            value={service.category}
            maxLength={120}
            suggestions={categories}
            error={showErrors ? errors.category : undefined}
            help={
              <HelpTip title="Para que serve a categoria?">
                Agrupa os serviços no site, como “Cabelo” ou “Unhas”. Use uma que já existe ou
                escreva uma nova.
              </HelpTip>
            }
            onChange={(category) => set({ category })}
          />
          <TextAreaField
            className="is-wide"
            label="Descrição (aparece no site)"
            rows={3}
            maxLength={1200}
            value={service.description}
            placeholder="Conte em poucas palavras o que a cliente recebe."
            onChange={(description) => set({ description })}
          />
        </div>
      </SettingsCard>
      <SettingsCard icon={<Clock3 size={20} />} title="Preço e duração">
        <div className="team-choice" role="radiogroup" aria-label="Tipo de preço">
          {priceTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              role="radio"
              aria-checked={service.priceType === type.id}
              onClick={() => set({ priceType: type.id })}
            >
              {type.label}
            </button>
          ))}
        </div>
        <div className="settings-grid">
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
          <SelectField
            label="Duração"
            value={String(service.durationMinutes)}
            onChange={(value) => set({ durationMinutes: Number(value) })}
            options={[...new Set([...durations, service.durationMinutes])]
              .sort((a, b) => a - b)
              .map((minutes) => ({
                id: String(minutes),
                label:
                  minutes >= 60
                    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`
                    : `${minutes} min`,
              }))}
          />
        </div>
      </SettingsCard>
      <SettingsCard icon={<CalendarCheck size={20} />} title="Como a cliente agenda">
        <div className="access-pick" role="radiogroup" aria-label="Como agendar">
          {bookingModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={service.bookingMode === mode.id}
              onClick={() => set({ bookingMode: mode.id })}
            >
              <strong>{mode.label}</strong>
              <small>{mode.hint}</small>
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
      </SettingsCard>
      {isNew ? (
        <p className="settings-footnote">
          Depois de criar, marque em Configurações → Equipe quem da equipe faz este serviço.
        </p>
      ) : null}
    </QuickModal>
  )
}

function PromotionEditor({
  api,
  initial,
  isNew,
  services,
  today,
  example,
  onClose,
}: {
  api: ClinicApi
  initial: Promotion
  isNew: boolean
  services: Service[]
  today: string
  /** Name suggestion that fits what this space sells. */
  example: string
  onClose: (message?: string) => void
}) {
  useScrollTop()
  const [promotion, setPromotion] = useState(initial)
  const [search, setSearch] = useState('')
  const [onlyChosen, setOnlyChosen] = useState(false)
  const [copied, setCopied] = useState('')
  // Typed prices of the "valor por serviço" kind, as text, keyed by service id.
  const [priceText, setPriceText] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(initial.prices).map(([id, cents]) => [id, moneyInput(cents)]),
    ),
  )
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [showErrors, setShowErrors] = useState(false)
  const set = (patch: Partial<Promotion>) => {
    setPromotion((current) => ({ ...current, ...patch }))
    if (state.status !== 'saving') setState({ status: 'idle' })
  }
  const eligible = services.filter((service) => service.priceType !== 'quote')
  const custom = promotion.kind === 'custom'
  const chosen = eligible.filter((service) => promotion.serviceIds.includes(service.id))
  const typed = (service: Service) => parseMoney(priceText[service.id] ?? '')
  const validPrice = (service: Service) => {
    const cents = typed(service)
    return cents != null && cents > 0 && cents < service.priceCents
  }
  const prices = Object.fromEntries(
    chosen.filter(validPrice).map((service) => [service.id, typed(service)!]),
  )
  // The largest discount summarizes a "valor por serviço" promotion in lists.
  const customPercent = Math.min(
    90,
    Math.max(
      1,
      ...chosen
        .filter(validPrice)
        .map((service) => Math.round(100 - (typed(service)! * 100) / service.priceCents)),
    ),
  )
  const preview: Promotion = custom ? { ...promotion, prices, percent: customPercent } : promotion
  const needle = search.trim().toLocaleLowerCase('pt-BR')
  const listed = eligible.filter(
    (service) =>
      (!onlyChosen || promotion.serviceIds.includes(service.id)) &&
      (!needle ||
        `${service.name} ${service.category}`.toLocaleLowerCase('pt-BR').includes(needle)),
  )
  const toggle = (service: Service) =>
    set({
      serviceIds: promotion.serviceIds.includes(service.id)
        ? promotion.serviceIds.filter((id) => id !== service.id)
        : [...promotion.serviceIds, service.id],
    })
  const errors = {
    name: !promotion.name.trim() ? 'Dê um nome para a promoção.' : '',
    services: !promotion.serviceIds.length
      ? 'Escolha pelo menos um serviço.'
      : custom && !chosen.every(validPrice)
        ? 'Digite o valor promocional de cada serviço escolhido, menor que o preço normal.'
        : '',
    dates:
      promotion.endsOn && promotion.endsOn < promotion.startsOn
        ? 'O fim precisa ser depois do início.'
        : '',
  }

  async function save(status = promotion.status) {
    if (Object.values(errors).some(Boolean)) {
      setShowErrors(true)
      setState({ status: 'error', message: 'Confira os campos marcados.' })
      return
    }
    setState({ status: 'saving' })
    try {
      await api.put(`catalog/promotions/${promotion.id}`, {
        name: promotion.name.trim(),
        kind: promotion.kind,
        percent: custom ? customPercent : promotion.percent,
        ...(custom ? { prices } : {}),
        startsOn: promotion.startsOn,
        endsOn: promotion.endsOn,
        status,
        showOnSite: promotion.showOnSite,
        serviceIds: custom ? chosen.map((service) => service.id) : promotion.serviceIds,
      })
      onClose(
        status === 'archived'
          ? 'Promoção encerrada. Os preços voltaram ao normal.'
          : status === 'paused'
            ? 'Promoção pausada.'
            : isNew
              ? 'Promoção criada! O site já mostra os novos preços no período.'
              : 'Promoção atualizada.',
      )
    } catch {
      setState({ status: 'error', message: 'Não foi possível salvar. Tente de novo.' })
    }
  }

  return (
    <div className="biz-stack">
      <div className="team-editor-head">
        <Button variant="secondary" onPress={() => onClose()}>
          ← Voltar para os serviços
        </Button>
        <h3>{isNew ? 'Nova promoção' : `Editar ${initial.name}`}</h3>
        {!isNew ? (
          <StatusPill tone={promotionState(initial, today).tone}>
            {promotionState(initial, today).label}
          </StatusPill>
        ) : null}
      </div>
      <SettingsCard icon={<BadgePercent size={20} />} title="Desconto">
        <div className="settings-grid">
          <TextInput
            label="Nome da promoção"
            value={promotion.name}
            maxLength={80}
            placeholder={`Ex.: ${example}`}
            error={showErrors ? errors.name : undefined}
            onChange={(name) => set({ name })}
          />
          <div className="settings-field">
            <span className="settings-field-label">
              <label>Tipo de desconto</label>
            </span>
            <div className="team-choice" role="radiogroup" aria-label="Tipo de desconto">
              {(
                [
                  ['percent', 'Mesma porcentagem'],
                  ['custom', 'Valor por serviço'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={promotion.kind === id}
                  onClick={() => set({ kind: id })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {custom ? (
            <p className="settings-muted is-wide">
              Você digita o valor promocional de cada serviço na lista abaixo. Bom para “flash day”,
              combos e tabelas com preços redondos.
            </p>
          ) : (
            <div className="settings-field is-wide">
              <span className="settings-field-label">
                <label>Desconto</label>
              </span>
              <div className="team-choice" role="radiogroup" aria-label="Porcentagem">
                {[10, 15, 20, 25, 30, 50].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={promotion.percent === value}
                    onClick={() => set({ percent: value })}
                  >
                    {value}%
                  </button>
                ))}
                <TextInputField
                  className="biz-percent"
                  ariaLabel="Outra porcentagem"
                  inputMode="numeric"
                  value={String(promotion.percent)}
                  suffix="%"
                  onChange={(text) => {
                    const value = Number(text.replace(/\D/g, ''))
                    set({ percent: Math.min(90, Math.max(1, value || 1)) })
                  }}
                />
              </div>
            </div>
          )}
          <DateInputField
            label="Começa em"
            value={promotion.startsOn}
            onChange={(startsOn) => set({ startsOn: startsOn || today })}
          />
          <DateInputField
            label="Termina em (opcional)"
            value={promotion.endsOn ?? ''}
            min={promotion.startsOn}
            error={showErrors ? errors.dates || undefined : undefined}
            description="Deixe vazio para não ter data de fim."
            onChange={(endsOn) => set({ endsOn: endsOn || null })}
          />
        </div>
        <ToggleRow
          icon={<Eye size={17} />}
          title="Mostrar no site"
          description="Desligado, o desconto vale só para agendamentos feitos pela equipe."
          isSelected={promotion.showOnSite}
          onChange={(showOnSite) => set({ showOnSite })}
        />
      </SettingsCard>
      <SettingsCard
        icon={<Scissors size={20} />}
        title="Serviços na promoção"
        description={
          custom
            ? 'Marque os serviços e digite quanto cada um custa na promoção.'
            : 'Veja como fica o preço de cada um.'
        }
        badge={<StatusPill tone="info">{promotion.serviceIds.length} escolhidos</StatusPill>}
      >
        {showErrors && errors.services ? (
          <p className="settings-field-error">{errors.services}</p>
        ) : null}
        <div className="data-toolbar">
          <SearchInput
            className="data-search"
            ariaLabel="Buscar serviço para a promoção"
            placeholder="Buscar serviço ou categoria"
            value={search}
            onChange={setSearch}
          />
          <div className="biz-chips" role="group" aria-label="Mostrar">
            <button type="button" aria-pressed={!onlyChosen} onClick={() => setOnlyChosen(false)}>
              Todos
            </button>
            <button type="button" aria-pressed={onlyChosen} onClick={() => setOnlyChosen(true)}>
              Escolhidos ({promotion.serviceIds.length})
            </button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            isDisabled={!listed.length}
            onPress={() => {
              const ids = listed.map((service) => service.id)
              const all = ids.every((id) => promotion.serviceIds.includes(id))
              set({
                serviceIds: all
                  ? promotion.serviceIds.filter((id) => !ids.includes(id))
                  : [...new Set([...promotion.serviceIds, ...ids])],
              })
            }}
          >
            {listed.length && listed.every((service) => promotion.serviceIds.includes(service.id))
              ? 'Desmarcar os da lista'
              : 'Marcar os da lista'}
          </Button>
        </div>
        {listed.length ? (
          <ul className="biz-promo-services">
            {listed.map((service) => {
              const checked = promotion.serviceIds.includes(service.id)
              const invalid = custom && checked && showErrors && !validPrice(service)
              return (
                <li key={service.id}>
                  <CheckboxField
                    label={service.name}
                    description={service.category}
                    isSelected={checked}
                    onChange={() => toggle(service)}
                  />
                  {custom ? (
                    <span className="biz-price biz-promo-custom">
                      <s>{money(service.priceCents)}</s>
                      <MoneyField
                        className="biz-promo-input"
                        ariaLabel={`Valor promocional de ${service.name}`}
                        value={priceText[service.id] ?? ''}
                        error={invalid ? 'Menor que o normal' : undefined}
                        onChange={(text) => {
                          setPriceText((current) => ({ ...current, [service.id]: text }))
                          if (text && !checked) toggle(service)
                          else if (state.status !== 'saving') setState({ status: 'idle' })
                        }}
                      />
                    </span>
                  ) : (
                    <span className="biz-price">
                      <s>{money(service.priceCents)}</s>
                      <strong>
                        {money(Math.round((service.priceCents * (100 - promotion.percent)) / 100))}
                      </strong>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty>Nenhum serviço com esse nome.</Empty>
        )}
        {services.length > eligible.length ? (
          <p className="settings-footnote">Serviços “sob consulta” não entram em promoção.</p>
        ) : null}
      </SettingsCard>
      <SettingsCard
        icon={<Copy size={20} />}
        title="Divulgar no WhatsApp"
        description="Lista pronta com o nome da promoção, as categorias e os preços. Copie e cole na conversa, no status ou no grupo."
        badge={
          <Button
            size="sm"
            isDisabled={!chosen.length}
            onPress={() =>
              void copyText(promotionText(preview, services)).then((ok) =>
                setCopied(ok ? 'Copiado! É só colar no WhatsApp.' : 'Não foi possível copiar.'),
              )
            }
          >
            <Copy size={15} aria-hidden /> Copiar lista
          </Button>
        }
      >
        {chosen.length ? (
          <pre className="biz-promo-text">{promotionText(preview, services)}</pre>
        ) : (
          <Empty>Escolha os serviços para ver a lista.</Empty>
        )}
        {copied ? (
          <p className="team-notice" role="status">
            <Check size={16} aria-hidden /> {copied}
          </p>
        ) : null}
      </SettingsCard>
      <div className="team-danger">
        {!isNew && initial.status === 'active' ? (
          <Button variant="ghost" onPress={() => void save('paused')}>
            <Pause size={15} aria-hidden /> Pausar
          </Button>
        ) : null}
        {!isNew && initial.status === 'paused' ? (
          <Button variant="ghost" onPress={() => void save('active')}>
            <Play size={15} aria-hidden /> Reativar
          </Button>
        ) : null}
        {!isNew ? (
          <Button variant="ghost" onPress={() => void save('archived')}>
            Encerrar promoção
          </Button>
        ) : null}
        {state.status === 'saving' ? <Spinner size="sm" aria-label="Salvando" /> : null}
      </div>
      <SaveBar
        dirty
        state={state}
        onSave={() => void save()}
        onDiscard={() => onClose()}
        label={isNew ? 'Criar promoção' : 'Salvar promoção'}
      />
    </div>
  )
}
