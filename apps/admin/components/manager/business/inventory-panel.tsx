'use client'

import { Button, Label, Switch } from '@heroui/react'
import {
  Archive,
  CalendarClock,
  Camera,
  Check,
  ChevronDown,
  CircleAlert,
  History,
  ImagePlus,
  Minus,
  Package,
  PackageCheck,
  PackageOpen,
  PackageX,
  Pencil,
  Plus,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DateInputField,
  MoneyField,
  SearchInput,
  SelectField,
  TextInputField,
} from '@/components/ui/fields'
import {
  amount,
  daysLeft,
  defaultPackageLabel,
  describeStock,
  expiryState,
  fold,
  packageLabels,
  pluralize,
  recipesFor,
  suggestionsFor,
  unitOptions,
  unitShort,
  type CatalogProduct,
} from '@/lib/stock'
import { KpiCards } from '../data-kit'
import { QuickModal } from '../quick-modal'
import {
  useClinicApi,
  useClinicResource,
  ClinicApiError,
  type ClinicApi,
} from '../settings/clinic-api'
import { Empty, LoadError, SettingsCard, SettingsSkeleton } from '../settings/settings-kit'
import { money, moneyInput, parseMoney, shortDateBr, timeBr } from './format'
import './business.css'
import { useSearchFocus, type SearchFocus } from '../workspace/workspace-signals'

type Item = {
  id: string
  name: string
  category: string
  unit: string
  quantity: number
  minQuantity: number
  costCents: number | null
  /** How much one package holds, in `unit` ("pote de 400 g"). */
  packageSize?: number | null
  packageLabel?: string | null
  alertPercent?: number | null
  referenceQuantity?: number | null
  catalogId?: string | null
  used30?: number
  services?: number
  photoAssetId?: string
  photoUrl?: string | null
  /** Validade: the date of what is on the shelf now (the next to expire). */
  tracksExpiry?: boolean
  expiresOn?: string | null
  expiresIn?: number | null
}
type Inventory = {
  items: Item[]
  lowStock: number
  expiring?: number
  stockValueCents: number
  movements: {
    id: string
    name: string
    unit: string
    kind: string
    quantity: number
    balance: number
    note: string
    createdAt: string
  }[]
}
type ClinicService = { id: string; name: string; category: string; status: string }

const kinds = { in: 'Entrada', out: 'Saída', adjust: 'Contagem' } as const
const parseQty = (value: string) => {
  const number = Number(value.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null
}
const plain = (value: number) => String(value).replace('.', ',')

/** How full the shelf is, for the bar: the alert level sits at one third of the bar. */
function level(item: Item) {
  if (item.quantity <= 0) return { percent: 0, tone: 'empty', label: 'Acabou' }
  if (item.quantity <= item.minQuantity) {
    const percent = item.minQuantity ? Math.max(8, (item.quantity / item.minQuantity) * 33) : 33
    return { percent, tone: 'low', label: 'Acabando' }
  }
  const full = Math.max(item.referenceQuantity ?? 0, item.minQuantity * 3, 1)
  return { percent: Math.min(100, (item.quantity / full) * 100), tone: 'ok', label: '' }
}

/** One package, or one unit for things counted one by one. */
function quickStep(item: Item) {
  if (item.packageSize) return item.packageSize
  return ['un', 'fr', 'cx', 'par', 'folha'].includes(item.unit) ? 1 : null
}

function stepLabel(item: Item) {
  return item.packageSize
    ? item.packageLabel || defaultPackageLabel(item.unit)
    : (unitOptions.find((option) => option.id === item.unit)?.one ?? item.unit)
}

export function InventoryPanel({
  clinicId,
  createSignal,
  focus,
}: {
  clinicId: string
  createSignal: number
  focus?: SearchFocus | null
}) {
  const api = useClinicApi(clinicId)
  const inventory = useClinicResource<Inventory>(api, 'inventory')
  const catalog = useClinicResource<{ services: ClinicService[] }>(api, 'catalog')
  const [editing, setEditing] = useState<Item | null>(null)
  const [moving, setMoving] = useState<{ item: Item; kind: 'in' | 'out' | 'adjust' } | null>(null)
  const [setup, setSetup] = useState(false)
  const [managing, setManaging] = useState(false)
  const [query, setQuery] = useState('')
  useSearchFocus(focus, setQuery)
  const [view, setView] = useState('all')
  const [category, setCategory] = useState('')
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  // Starts at 0: arriving here through a "+" elsewhere must open the form on mount.
  const lastSignal = useRef(0)
  const blank = (): Item => ({
    id: crypto.randomUUID(),
    name: '',
    category: '',
    unit: 'un',
    quantity: 0,
    minQuantity: 1,
    costCents: null,
  })

  useEffect(() => {
    if (createSignal === lastSignal.current) return
    lastSignal.current = createSignal

    setEditing(blank())
  }, [createSignal])

  const services = useMemo(
    () => (catalog.data?.services ?? []).filter((service) => service.status === 'active'),
    [catalog.data],
  )
  const suggestions = useMemo(
    () =>
      suggestionsFor(
        services.map((service) => service.category),
        {
          names: new Set((inventory.data?.items ?? []).map((item) => fold(item.name))),
          ids: new Set(
            (inventory.data?.items ?? []).flatMap((item) =>
              item.catalogId ? [item.catalogId] : [],
            ),
          ),
        },
      ),
    [services, inventory.data],
  )

  if (inventory.error && !inventory.data)
    return <LoadError message={inventory.error} onRetry={inventory.reload} />
  if (!inventory.data) return <SettingsSkeleton cards={2} />
  const data = inventory.data
  const needle = fold(query)
  const categories = [...new Set(data.items.map((item) => item.category).filter(Boolean))].sort()
  const isLow = (item: Item) => item.quantity <= item.minQuantity
  const isExpiring = (item: Item) =>
    item.quantity > 0 && ['expired', 'soon'].includes(expiryState(item)?.tone ?? '')
  const expiring = data.items.filter(isExpiring).length
  const expired = data.items.filter(
    (item) => item.quantity > 0 && expiryState(item)?.tone === 'expired',
  ).length
  const tracked = data.items.filter((item) => item.tracksExpiry).length
  const items = data.items.filter(
    (item) =>
      (view === 'all' ||
        (view === 'low' && isLow(item)) ||
        (view === 'nocost' && item.costCents == null) ||
        (view === 'expiring' && isExpiring(item))) &&
      (!category || item.category === category) &&
      (!needle || fold(`${item.name} ${item.category}`).includes(needle)),
  )
  const withoutCost = data.items.filter((item) => item.costCents == null).length
  const linked = data.items.filter((item) => item.services).length
  const done = (message?: string) => {
    setEditing(null)
    setMoving(null)
    setSetup(false)
    if (message) {
      setNotice({ kind: 'ok', text: message })
      inventory.reload()
    }
  }
  const fromCatalog = (product: CatalogProduct, group: string): Item => ({
    ...blank(),
    name: product.nome,
    category: group === 'Descartáveis e higiene' ? 'Descartáveis' : group,
    unit: product.unidade,
    packageSize: product.embalagem ?? null,
    packageLabel: product.embalagem ? defaultPackageLabel(product.unidade) : null,
    alertPercent: product.aviso_percentual,
    catalogId: product.id,
    tracksExpiry: Boolean(product.validade),
    expiresOn: null,
  })

  /** One tap: one package (or one unit) used up or arrived. */
  async function quick(item: Item, kind: 'in' | 'out') {
    const step = quickStep(item)
    if (busy || !step) return
    setBusy(item.id)
    setNotice(null)
    try {
      const result = await api.post<{ balance: number }>(`inventory/items/${item.id}/movements`, {
        kind,
        quantity: step,
        note: kind === 'out' ? `Usou 1 ${stepLabel(item)}` : 'Reposição',
      })
      const now = describeStock({ ...item, quantity: result.balance })
      setNotice({
        kind: 'ok',
        text: `${item.name}: ${kind === 'out' ? 'baixa de' : 'entrada de'} 1 ${stepLabel(item)}. Agora: ${now.main} ${now.label}.`,
      })
      inventory.reload()
    } catch {
      setNotice({ kind: 'error', text: 'Não foi possível registrar. Tente de novo.' })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="biz-stack">
      <KpiCards
        label="Resumo do estoque"
        active={view}
        onSelect={(id) => setView(view === id || id === 'value' ? 'all' : id)}
        items={[
          {
            id: 'all',
            label: 'Produtos',
            value: data.items.length,
            hint: `${categories.length} ${categories.length === 1 ? 'categoria' : 'categorias'}${linked ? ` · ${linked} com baixa automática` : ''}`,
            icon: <Package size={22} />,
          },
          {
            id: 'low',
            label: 'Acabando',
            value: data.lowStock,
            hint: data.lowStock ? 'No nível de aviso ou abaixo' : 'Tudo abastecido',
            icon: <PackageX size={22} />,
            tone: data.lowStock ? 'warn' : 'good',
          },
          {
            id: 'expiring',
            label: 'Validade',
            value: expiring,
            hint: expired
              ? `${expired} ${expired === 1 ? 'vencido' : 'vencidos'} · separe antes de usar`
              : expiring
                ? 'Vencem em até 30 dias'
                : tracked
                  ? `${tracked} com validade em dia`
                  : 'Ative a validade nos produtos',
            icon: <CalendarClock size={22} />,
            tone: expiring ? 'warn' : 'good',
          },
          {
            id: 'value',
            label: 'Valor em estoque',
            value: money(data.stockValueCents),
            hint: withoutCost ? `${withoutCost} sem custo informado` : 'Pelo custo informado',
            icon: <Wallet size={22} />,
            tone: 'good',
          },
        ]}
      />
      {notice ? (
        <p className={`access-notice is-${notice.kind}`} role="status">
          {notice.kind === 'ok' ? (
            <Check size={16} aria-hidden />
          ) : (
            <CircleAlert size={16} aria-hidden />
          )}{' '}
          {notice.text}
        </p>
      ) : null}

      {!data.items.length || suggestions.length ? (
        <div className="inv-setup-cta">
          <span className="kpi-icon" aria-hidden>
            <PackageOpen size={22} />
          </span>
          <div>
            <strong>
              {data.items.length ? 'Complete o seu estoque' : 'Monte o seu estoque em minutos'}
            </strong>
            <span>
              Escolha os produtos que você usa nos seus serviços. Cada um já vem com a medida e o
              quanto cada atendimento gasta, para descontar sozinho.
            </span>
          </div>
          <Button onPress={() => setSetup(true)}>Montar estoque</Button>
        </div>
      ) : null}

      <SettingsCard
        icon={<Package size={20} />}
        title="Seus produtos"
        description="Concluir um atendimento desconta o que o serviço usa. Aqui você repõe e confere."
        help={{
          title: 'Como o estoque desconta sozinho?',
          text: 'Cada serviço tem uma estimativa do que gasta (ex.: depilação de meia perna usa 70 g de cera). Ao concluir o atendimento, o sistema desconta e mostra quanto resta. Você confere e ajusta quando quiser, e o aviso chega quando o produto passa do nível escolhido.',
        }}
        badge={
          <Button size="sm" onPress={() => setEditing(blank())}>
            <Plus size={15} aria-hidden /> Novo produto
          </Button>
        }
      >
        {data.items.length ? (
          <div className="data-toolbar">
            <SearchInput
              className="data-search"
              ariaLabel="Buscar produto"
              placeholder="Buscar produto"
              value={query}
              onChange={setQuery}
            />
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
            {categories.length ? (
              <Button size="sm" variant="ghost" onPress={() => setManaging(true)}>
                <Pencil size={14} aria-hidden /> Categorias
              </Button>
            ) : null}
          </div>
        ) : null}
        {items.length ? (
          <ul className="inv-grid">
            {items.map((item) => {
              const state = level(item)
              const stock = describeStock(item)
              const step = quickStep(item)
              const days = daysLeft(item.quantity, item.used30 ?? 0)
              const expiry = expiryState(item)
              return (
                <li
                  key={item.id}
                  className={`inv-card is-${state.tone}${expiry && item.quantity > 0 ? ` is-expiry-${expiry.tone}` : ''}`}
                >
                  <button
                    type="button"
                    className="inv-main"
                    aria-label={`Editar ${item.name}`}
                    onClick={() => setEditing(item)}
                  >
                    <span className="inv-photo" aria-hidden>
                      {item.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- public media URL
                        <img src={item.photoUrl} alt="" />
                      ) : (
                        <Package size={24} />
                      )}
                    </span>
                    <span className="inv-copy">
                      <strong>{item.name}</strong>
                      <small>
                        {[
                          item.category,
                          item.packageSize
                            ? `${stepLabel(item)} de ${amount(item.packageSize)} ${unitShort(item.unit)}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Sem categoria'}
                      </small>
                    </span>
                    <Pencil className="inv-edit" size={15} aria-hidden />
                  </button>
                  {expiry && item.quantity > 0 ? (
                    <button
                      type="button"
                      className={`inv-expiry is-${expiry.tone}`}
                      onClick={() => setEditing(item)}
                      title={expiry.date ? `Validade: ${expiry.date}` : 'Informe a validade'}
                    >
                      <CalendarClock size={14} aria-hidden />
                      {expiry.tone === 'unset' ? 'Informar validade' : expiry.label}
                      {expiry.date && expiry.tone !== 'ok' ? <small>{expiry.date}</small> : null}
                    </button>
                  ) : null}
                  <div className="inv-level">
                    <div className="inv-amount">
                      <strong>{stock.main}</strong>
                      <span>{stock.label}</span>
                      {state.label ? <em>{state.label}</em> : null}
                    </div>
                    <div
                      className="inv-bar"
                      role="img"
                      aria-label={`${stock.main} ${stock.label}, aviso em ${amount(item.minQuantity)} ${unitShort(item.unit)}`}
                    >
                      <i style={{ width: `${state.percent}%` }} />
                    </div>
                    <small>
                      {[
                        stock.base,
                        item.alertPercent
                          ? `aviso em ${item.alertPercent}%`
                          : `aviso em ${amount(item.minQuantity)} ${unitShort(item.unit)}`,
                        days != null
                          ? days <= 60
                            ? `acaba em ~${days} ${days === 1 ? 'dia' : 'dias'}`
                            : ''
                          : '',
                        item.services
                          ? `em ${item.services} ${item.services === 1 ? 'serviço' : 'serviços'}`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </div>
                  <div className="inv-actions">
                    {step ? (
                      <Button
                        variant="secondary"
                        isDisabled={item.quantity <= 0 || busy === item.id}
                        onPress={() => void quick(item, 'out')}
                      >
                        <Minus size={16} aria-hidden /> Usei 1{' '}
                        {item.packageSize ? stepLabel(item) : ''}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        isDisabled={item.quantity <= 0}
                        onPress={() => setMoving({ item, kind: 'out' })}
                      >
                        <Minus size={16} aria-hidden /> Saída
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      isDisabled={busy === item.id}
                      onPress={() => setMoving({ item, kind: 'in' })}
                    >
                      <Plus size={16} aria-hidden /> Chegou
                    </Button>
                    <Button
                      variant="ghost"
                      isIconOnly
                      aria-label={`Contar ${item.name}`}
                      onPress={() => setMoving({ item, kind: 'adjust' })}
                    >
                      <SlidersHorizontal size={16} />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : data.items.length ? (
          <Empty>Nenhum produto com esse filtro.</Empty>
        ) : (
          <div className="biz-empty">
            <Package size={24} aria-hidden />
            <p>Nenhum produto ainda. Use “Montar estoque” para começar pelos sugeridos.</p>
          </div>
        )}
        {suggestions.length && data.items.length && view === 'all' && !needle && !category ? (
          <div className="inv-suggest">
            <span>Sugestões para o seu espaço</span>
            <div className="biz-chips">
              {suggestions
                .flatMap((group) =>
                  group.products.map((product) => ({ product, group: group.category })),
                )
                .slice(0, 12)
                .map(({ product, group }) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setEditing(fromCatalog(product, group))}
                  >
                    <Plus size={13} aria-hidden /> {product.nome}
                  </button>
                ))}
            </div>
          </div>
        ) : null}
      </SettingsCard>

      {data.movements.length ? (
        <details className="fold">
          <summary>
            <span className="kpi-icon tone-info" aria-hidden>
              <History size={20} />
            </span>
            <span className="fold-copy">
              <strong>Últimas movimentações</strong>
              <small>
                {data.movements.length} registros · entradas, baixas dos atendimentos e contagens
              </small>
            </span>
            <ChevronDown className="fold-chevron" size={20} aria-hidden />
          </summary>
          <div className="fold-body">
            <ul className="biz-list is-compact">
              {data.movements.map((movement) => (
                <li key={movement.id}>
                  <div className="biz-row-main">
                    <strong>
                      {kinds[movement.kind as keyof typeof kinds]} · {movement.name}
                    </strong>
                    <span className="biz-row-meta">
                      {shortDateBr(movement.createdAt)} às {timeBr(movement.createdAt)}
                      {movement.note ? ` · ${movement.note}` : ''}
                    </span>
                  </div>
                  <div className="biz-price">
                    <strong>
                      {movement.kind === 'in' ? '+' : movement.kind === 'out' ? '−' : '='}{' '}
                      {amount(movement.quantity)} {unitShort(movement.unit)}
                    </strong>
                    <small>
                      saldo {amount(movement.balance)} {unitShort(movement.unit)}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      {editing ? (
        <ItemEditor
          key={editing.id}
          api={api}
          initial={editing}
          isNew={!data.items.some((item) => item.id === editing.id)}
          categories={[
            ...new Set([
              ...categories,
              ...services.map((service) => service.category),
              'Descartáveis',
              'Limpeza',
            ]),
          ]}
          services={services}
          onClose={done}
        />
      ) : null}
      {moving ? (
        <MovementForm
          key={`${moving.item.id}-${moving.kind}`}
          api={api}
          item={moving.item}
          kind={moving.kind}
          onClose={done}
        />
      ) : null}
      {managing ? (
        <CategoryManager
          api={api}
          items={data.items}
          onClose={(message) => {
            setManaging(false)
            setCategory('')
            if (message) done(message)
          }}
        />
      ) : null}
      {setup ? (
        <StockSetup api={api} groups={suggestions} services={services} onClose={done} />
      ) : null}
    </div>
  )
}

/** "Tenho 5 caixas fechadas + 10 un soltas": what someone counts on the shelf, as base units. */
function countTotal(packs: string, loose: string, size: number | null) {
  const closed = packs.trim() ? parseQty(packs) : 0
  const open = loose.trim() ? parseQty(loose) : 0
  if (closed == null || open == null) return null
  return Math.round(((size ? closed * size : 0) + open) * 100) / 100
}

/**
 * The count of a product in plain words. With a package: closed packages plus what is loose or
 * open, and the total; without one, just the amount.
 */
function StockCount({
  name,
  unit,
  size,
  label,
  packs,
  loose,
  onPacks,
  onLoose,
}: {
  name: string
  unit: string
  size: number | null
  label: string
  packs: string
  loose: string
  onPacks: (value: string) => void
  onLoose: (value: string) => void
}) {
  const total = countTotal(packs, loose, size)
  return (
    <div className="inv-count">
      <span className="inv-count-label">Quanto tem agora</span>
      <div className={`inv-count-fields${size ? '' : ' is-single'}`}>
        {size ? (
          <TextInputField
            ariaLabel={`${pluralize(label, 2)} fechados de ${name}`}
            inputMode="numeric"
            placeholder="0"
            value={packs}
            suffix={`${pluralize(label, 2)} fechad${label === 'caixa' || label === 'bisnaga' ? 'as' : 'os'}`}
            onChange={onPacks}
          />
        ) : null}
        <TextInputField
          ariaLabel={size ? `${unitShort(unit)} soltos de ${name}` : `Quanto tem de ${name}`}
          inputMode="decimal"
          placeholder="0"
          value={loose}
          suffix={size ? `${unitShort(unit)} soltos` : unitShort(unit)}
          onChange={onLoose}
        />
      </div>
      <small>
        {total == null
          ? 'Confira os números.'
          : size
            ? total
              ? `Total: ${amount(total)} ${unitShort(unit)}. Abertos ou avulsos entram em “soltos”.`
              : `Ex.: 5 ${pluralize(label, 2)} + 10 ${unitShort(unit)} soltos. Pode deixar em branco.`
            : 'Pode deixar em branco e contar depois.'}
      </small>
    </div>
  )
}

/** Packages (when it has one) or base units typed by the person, as base units. */
function useAmountInput(item: Pick<Item, 'packageSize' | 'unit'>, initial: string) {
  const [text, setText] = useState(initial)
  const parsed = text.trim() ? parseQty(text) : 0
  const base = parsed == null ? null : item.packageSize ? parsed * item.packageSize : parsed
  return { text, setText, parsed, base }
}

function ItemEditor({
  api,
  initial,
  isNew,
  categories,
  services,
  onClose,
}: {
  api: ClinicApi
  initial: Item
  isNew: boolean
  categories: string[]
  services: ClinicService[]
  onClose: (message?: string) => void
}) {
  const [item, setItem] = useState(initial)
  const [size, setSize] = useState(initial.packageSize ? plain(initial.packageSize) : '')
  const packageSize = size.trim() ? parseQty(size) : null
  const [packs, setPacks] = useState('')
  const [loose, setLoose] = useState('')
  const startTotal = countTotal(packs, loose, packageSize || null)
  const [alert, setAlert] = useState<string>(
    initial.alertPercent ? String(initial.alertPercent) : isNew ? '25' : 'qty',
  )
  const [min, setMin] = useState(
    initial.packageSize
      ? plain(Math.round((initial.minQuantity / initial.packageSize) * 100) / 100)
      : plain(initial.minQuantity),
  )
  const [cost, setCost] = useState(initial.costCents == null ? '' : moneyInput(initial.costCents))
  const [tracksExpiry, setTracksExpiry] = useState(Boolean(initial.tracksExpiry))
  const [expiresOn, setExpiresOn] = useState(initial.expiresOn ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const label = item.packageLabel || defaultPackageLabel(item.unit)
  const supplies = isNew && item.catalogId ? recipesFor(item.catalogId, services) : []

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const asset = await api.upload('product_photo', file, item.id)
      setItem((current) => ({ ...current, photoAssetId: asset.id, photoUrl: asset.url }))
    } catch (cause) {
      setError(
        cause instanceof Error && !(cause instanceof ClinicApiError)
          ? cause.message
          : 'Não foi possível enviar a foto.',
      )
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    const minText = parseQty(min || '0')
    const costCents = cost.trim() ? parseMoney(cost) : null
    if (
      !item.name.trim() ||
      startTotal == null ||
      (size.trim() && !packageSize) ||
      (alert === 'qty' && minText == null) ||
      (cost.trim() && costCents == null)
    ) {
      setError('Confira o nome e os números.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.put(`inventory/items/${item.id}`, {
        name: item.name.trim(),
        category: item.category.trim(),
        unit: item.unit,
        minQuantity: Math.round((minText ?? 0) * (packageSize ?? 1) * 100) / 100,
        alertPercent: alert === 'qty' ? null : Number(alert),
        ...(isNew ? { initialQuantity: startTotal ?? 0 } : {}),
        costCents,
        packageSize: packageSize || null,
        packageLabel: packageSize ? label : '',
        photoAssetId: item.photoAssetId ?? '',
        ...(item.catalogId ? { catalogId: item.catalogId } : {}),
        ...(supplies.length ? { supplies } : {}),
        tracksExpiry,
        expiresOn: tracksExpiry && expiresOn ? expiresOn : null,
      })
      onClose(
        isNew
          ? `${item.name.trim()} cadastrado${supplies.length ? ` e ligado a ${supplies.length} ${supplies.length === 1 ? 'serviço' : 'serviços'}` : ''}.`
          : 'Produto atualizado.',
      )
    } catch (cause) {
      setError(
        cause instanceof ClinicApiError && cause.status === 409
          ? 'Já existe um produto com esse nome.'
          : 'Não foi possível salvar.',
      )
      setSaving(false)
    }
  }

  async function archive() {
    setSaving(true)
    try {
      await api.post(`inventory/items/${item.id}/archive`, {})
      onClose(`${item.name} saiu da lista.`)
    } catch {
      setError('Não foi possível arquivar.')
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={isNew ? 'Novo produto' : `Editar ${initial.name}`}
      footer={
        <>
          {!isNew ? (
            <Button
              variant="ghost"
              className="qm-foot-start"
              onPress={() => void archive()}
              isDisabled={saving}
            >
              <Archive size={15} aria-hidden /> Tirar da lista
            </Button>
          ) : null}
          <Button variant="secondary" onPress={() => onClose()}>
            Cancelar
          </Button>
          <Button onPress={() => void save()} isDisabled={saving || uploading}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="inv-photo-row">
        <span className="inv-photo is-large" aria-hidden>
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public media URL
            <img src={item.photoUrl} alt="" />
          ) : (
            <Package size={34} />
          )}
        </span>
        <div className="account-photo-actions">
          <Button
            variant="secondary"
            size="sm"
            isDisabled={uploading}
            onPress={() => camera.current?.click()}
          >
            <Camera size={16} aria-hidden /> {uploading ? 'Enviando…' : 'Tirar foto'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isDisabled={uploading}
            onPress={() => gallery.current?.click()}
          >
            <ImagePlus size={16} aria-hidden /> Escolher imagem
          </Button>
          {item.photoUrl ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setItem({ ...item, photoAssetId: '', photoUrl: null })}
            >
              <Trash2 size={16} aria-hidden /> Remover
            </Button>
          ) : null}
        </div>
        {/* `capture` opens the back camera on phones; on a computer it is a normal file picker. */}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            void pickPhoto(file)
          }}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            void pickPhoto(file)
          }}
        />
      </div>
      <div className="manager-form-grid">
        <TextInputField
          label="Nome"
          isRequired
          autoFocus={isNew && !initial.name}
          maxLength={120}
          value={item.name}
          placeholder="Ex.: Cera quente"
          onChange={(name) => setItem({ ...item, name })}
        />
        <SelectField
          label="Medido em"
          value={item.unit}
          description="A medida que cada atendimento gasta."
          onChange={(unit) => setItem({ ...item, unit })}
          options={unitOptions.map(({ id, label: text }) => ({ id, label: text }))}
        />
        <CategoryPicker
          className="manager-field-wide"
          value={item.category}
          options={categories}
          onChange={(category) => setItem({ ...item, category })}
        />
        <PackageSentence
          className="manager-field-wide"
          name={item.name || 'o produto'}
          unit={item.unit}
          label={label}
          size={size}
          onLabel={(packageLabel) => setItem({ ...item, packageLabel })}
          onSize={setSize}
        />
        {isNew ? (
          <div className="manager-field-wide">
            <StockCount
              name={item.name || 'o produto'}
              unit={item.unit}
              size={packageSize || null}
              label={label}
              packs={packs}
              loose={loose}
              onPacks={setPacks}
              onLoose={setLoose}
            />
          </div>
        ) : null}
        <MoneyField
          label={packageSize ? `Custo de cada ${label}` : 'Custo por unidade'}
          description="Opcional. Usado no Financeiro."
          value={cost}
          onChange={setCost}
        />
        <div className="settings-field manager-field-wide">
          <span className="settings-field-label">
            <label>Avisar quando restar</label>
          </span>
          <div className="team-choice" role="radiogroup" aria-label="Quando avisar">
            {[
              ['50', '50%'],
              ['25', '25%'],
              ['10', '10%'],
              ['qty', 'Uma quantidade'],
            ].map(([id, text]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={alert === id}
                onClick={() => setAlert(id)}
              >
                {text}
              </button>
            ))}
          </div>
          {alert === 'qty' ? (
            <TextInputField
              ariaLabel="Quantidade para avisar"
              inputMode="decimal"
              value={min}
              suffix={packageSize ? pluralize(label, 2) : unitShort(item.unit)}
              onChange={setMin}
            />
          ) : (
            <small className="settings-muted">
              A porcentagem conta a partir da última reposição.
            </small>
          )}
        </div>
        <ExpiryField
          className="manager-field-wide"
          name={item.name || 'o produto'}
          tracks={tracksExpiry}
          date={expiresOn}
          suggested={Boolean(isNew && initial.tracksExpiry)}
          onTracks={setTracksExpiry}
          onDate={setExpiresOn}
        />
      </div>
      {supplies.length ? (
        <p className="inv-linked">
          <Scissors size={15} aria-hidden /> Já entra na baixa automática de {supplies.length}{' '}
          {supplies.length === 1 ? 'serviço' : 'serviços'} seus. Ajuste o gasto de cada um em
          Serviços.
        </p>
      ) : null}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

function MovementForm({
  api,
  item,
  kind,
  onClose,
}: {
  api: ClinicApi
  item: Item
  kind: 'in' | 'out' | 'adjust'
  onClose: (message?: string) => void
}) {
  const packed = Boolean(item.packageSize)
  const label = stepLabel(item)
  const current = describeStock(item)
  const input = useAmountInput(
    item,
    kind === 'adjust'
      ? plain(Math.round((item.quantity / (item.packageSize ?? 1)) * 100) / 100)
      : packed || quickStep(item)
        ? '1'
        : '',
  )
  const [note, setNote] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const asksExpiry = kind === 'in' && Boolean(item.tracksExpiry)
  const title = {
    in: `Chegou ${item.name}`,
    out: `Saída de ${item.name}`,
    adjust: `Contagem de ${item.name}`,
  }[kind]
  const after =
    input.base == null
      ? null
      : kind === 'in'
        ? item.quantity + input.base
        : kind === 'out'
          ? item.quantity - input.base
          : input.base

  async function save(override?: number) {
    const quantity = override ?? (input.base == null ? null : Math.round(input.base * 100) / 100)
    if (quantity == null || (kind !== 'adjust' && quantity <= 0)) {
      setError('Informe uma quantidade válida.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const result = await api.post<{ balance: number }>(`inventory/items/${item.id}/movements`, {
        kind,
        quantity,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(asksExpiry && expiresOn ? { expiresOn } : {}),
      })
      const now = describeStock({ ...item, quantity: result.balance })
      onClose(`${item.name}: agora ${now.main} ${now.label}${now.base ? ` (${now.base})` : ''}.`)
    } catch {
      setError(
        kind === 'out' ? 'Não tem essa quantidade em estoque.' : 'Não foi possível registrar.',
      )
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={title}
      subtitle={`Hoje: ${current.main} ${current.label}${current.base ? ` (${current.base})` : ''}.`}
      footer={
        <>
          {kind === 'adjust' && item.quantity > 0 ? (
            <Button
              variant="ghost"
              className="qm-foot-start"
              isDisabled={saving}
              onPress={() => void save(0)}
            >
              <PackageX size={15} aria-hidden /> Acabou
            </Button>
          ) : null}
          <Button variant="secondary" onPress={() => onClose()}>
            Cancelar
          </Button>
          <Button onPress={() => void save()} isDisabled={saving}>
            {saving ? 'Salvando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      {kind !== 'adjust' && (packed || quickStep(item)) ? (
        <div className="biz-chips" role="group" aria-label="Quantidade rápida">
          {[1, 2, 3, 5, 10].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={input.text === String(value)}
              onClick={() => input.setText(String(value))}
            >
              {kind === 'in' ? '+' : '−'}
              {value} {pluralize(label, value)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="manager-form-grid">
        <TextInputField
          label={
            kind === 'adjust'
              ? packed
                ? `Quantos ${pluralize(label, 2)} tem`
                : 'Quanto tem'
              : packed
                ? `Quantos ${pluralize(label, 2)}`
                : 'Quantidade'
          }
          inputMode="decimal"
          isRequired
          value={input.text}
          suffix={packed ? pluralize(label, 2) : unitShort(item.unit)}
          description={
            after != null
              ? `${packed && input.base ? `= ${amount(input.base)} ${unitShort(item.unit)} · ` : ''}fica com ${amount(Math.max(after, 0))} ${unitShort(item.unit)}`
              : packed
                ? 'Pode usar decimal: 2,5 = dois e meio.'
                : undefined
          }
          onChange={input.setText}
        />
        <TextInputField
          label="Observação (opcional)"
          maxLength={160}
          value={note}
          placeholder={kind === 'in' ? 'Ex.: Compra no fornecedor' : 'Ex.: Conferência do mês'}
          onChange={setNote}
        />
        {asksExpiry ? (
          <DateInputField
            className="manager-field-wide"
            label="Validade do que chegou"
            description={
              item.expiresOn
                ? `Na prateleira: ${expiryState(item)?.label.toLowerCase()}. Informe a data do que vai ser usado primeiro.`
                : 'Opcional. O sistema avisa antes de vencer.'
            }
            value={expiresOn}
            onChange={setExpiresOn}
          />
        ) : null}
      </div>
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

type SetupRow = {
  selected: boolean
  size: string
  label: string
  packs: string
  loose: string
  tracksExpiry: boolean
  expiresOn: string
}

/**
 * "Montar estoque": the suggested products of the space's categories in one list. Each chosen
 * product is created with its package and already linked to the services that use it.
 */
function StockSetup({
  api,
  groups,
  services,
  onClose,
}: {
  api: ClinicApi
  groups: { category: string; products: CatalogProduct[] }[]
  services: ClinicService[]
  onClose: (message?: string) => void
}) {
  const [rows, setRows] = useState<Record<string, SetupRow>>(() =>
    Object.fromEntries(
      groups.flatMap((group) =>
        group.products.map((product) => [
          product.id,
          {
            selected: false,
            size: product.embalagem ? plain(product.embalagem) : '',
            label: defaultPackageLabel(product.unidade),
            packs: '',
            loose: '',
            tracksExpiry: Boolean(product.validade),
            expiresOn: '',
          },
        ]),
      ),
    ),
  )
  const [open, setOpen] = useState(groups[0]?.category ?? '')
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const chosen = groups.flatMap((group) =>
    group.products
      .filter((product) => rows[product.id]?.selected)
      .map((product) => ({ product, group: group.category })),
  )
  const set = (id: string, patch: Partial<SetupRow>) =>
    setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }))

  async function save() {
    setError('')
    let failed = 0
    let linked = 0
    setSaving({ done: 0, total: chosen.length })
    for (const [index, { product, group }] of chosen.entries()) {
      const row = rows[product.id]
      const size = row.size.trim() ? parseQty(row.size) : null
      const total = countTotal(row.packs, row.loose, size || null) ?? 0
      const supplies = recipesFor(product.id, services)
      try {
        await api.put(`inventory/items/${crypto.randomUUID()}`, {
          name: product.nome,
          category: group === 'Descartáveis e higiene' ? 'Descartáveis' : group,
          unit: product.unidade,
          minQuantity: 0,
          alertPercent: product.aviso_percentual,
          initialQuantity: total,
          costCents: null,
          packageSize: size || null,
          packageLabel: size ? row.label : '',
          photoAssetId: '',
          catalogId: product.id,
          ...(supplies.length ? { supplies } : {}),
          tracksExpiry: row.tracksExpiry,
          expiresOn: row.tracksExpiry && row.expiresOn ? row.expiresOn : null,
        })
        if (supplies.length) linked += 1
      } catch {
        failed += 1
      }
      setSaving({ done: index + 1, total: chosen.length })
    }
    setSaving(null)
    if (failed) {
      setError(
        `${failed} ${failed === 1 ? 'produto não foi salvo' : 'produtos não foram salvos'}. Tente de novo.`,
      )
      return
    }
    onClose(
      `${chosen.length} ${chosen.length === 1 ? 'produto cadastrado' : 'produtos cadastrados'}; ${linked} já descontam sozinhos nos atendimentos.`,
    )
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(next) => !next && !saving && onClose()}
      size="xl"
      title="Montar estoque"
      subtitle="Marque o que você usa. A embalagem e o quanto tem são opcionais e podem ser ajustados depois."
      footer={
        <>
          <span className="qm-foot-start inv-setup-count">
            {saving
              ? `Salvando ${saving.done} de ${saving.total}…`
              : `${chosen.length} ${chosen.length === 1 ? 'produto escolhido' : 'produtos escolhidos'}`}
          </span>
          <Button variant="secondary" isDisabled={Boolean(saving)} onPress={() => onClose()}>
            Cancelar
          </Button>
          <Button isDisabled={!chosen.length || Boolean(saving)} onPress={() => void save()}>
            Cadastrar {chosen.length || ''}
          </Button>
        </>
      }
    >
      {groups.length ? (
        groups.map((group) => {
          const count = group.products.filter((product) => rows[product.id]?.selected).length
          return (
            <section key={group.category} className="inv-setup-group">
              <button
                type="button"
                className="inv-setup-head"
                aria-expanded={open === group.category}
                onClick={() => setOpen(open === group.category ? '' : group.category)}
              >
                <strong>{group.category}</strong>
                <small>
                  {count
                    ? `${count} de ${group.products.length}`
                    : `${group.products.length} sugestões`}
                </small>
                <ChevronDown size={18} aria-hidden />
              </button>
              {open === group.category ? (
                <ul className="inv-setup-list">
                  {group.products.map((product) => {
                    const row = rows[product.id]
                    return (
                      <li key={product.id} className={row.selected ? 'is-on' : undefined}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={row.selected}
                          className="filter-option"
                          onClick={() => set(product.id, { selected: !row.selected })}
                        >
                          <span className="filter-box" aria-hidden>
                            {row.selected ? <Check size={13} strokeWidth={3} /> : null}
                          </span>
                          <span>{product.nome}</span>
                          {product.validade ? (
                            <small className="inv-setup-expiry" title="Controla validade">
                              <CalendarClock size={12} aria-hidden /> validade
                            </small>
                          ) : null}
                          <small>{unitShort(product.unidade)}</small>
                        </button>
                        {row.selected ? (
                          <div className="inv-setup-fields">
                            <PackageSentence
                              name={product.nome}
                              unit={product.unidade}
                              label={row.label}
                              size={row.size}
                              onLabel={(label) => set(product.id, { label })}
                              onSize={(value) => set(product.id, { size: value })}
                            />
                            <StockCount
                              name={product.nome}
                              unit={product.unidade}
                              size={row.size.trim() ? parseQty(row.size) || null : null}
                              label={row.label}
                              packs={row.packs}
                              loose={row.loose}
                              onPacks={(packs) => set(product.id, { packs })}
                              onLoose={(loose) => set(product.id, { loose })}
                            />
                            <ExpiryField
                              name={product.nome}
                              tracks={row.tracksExpiry}
                              date={row.expiresOn}
                              suggested={Boolean(product.validade)}
                              onTracks={(tracksExpiry) => set(product.id, { tracksExpiry })}
                              onDate={(expiresOn) => set(product.id, { expiresOn })}
                            />
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </section>
          )
        })
      ) : (
        <Empty>
          <PackageCheck size={18} aria-hidden /> Todos os produtos sugeridos para o seu espaço já
          estão no estoque.
        </Empty>
      )}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

/** "Tem validade" toggle and the date of what is on the shelf now. */
function ExpiryField({
  name,
  tracks,
  date,
  suggested,
  onTracks,
  onDate,
  className,
}: {
  name: string
  tracks: boolean
  date: string
  suggested?: boolean
  onTracks: (value: boolean) => void
  onDate: (value: string) => void
  className?: string
}) {
  const state = expiryState({
    tracksExpiry: tracks,
    expiresOn: date || null,
    expiresIn: date
      ? Math.round(
          (new Date(`${date}T12:00:00`).getTime() - new Date().setHours(12, 0, 0, 0)) / 86400000,
        )
      : null,
  })
  return (
    <div
      className={['inv-expiry-field', tracks ? 'is-on' : '', className].filter(Boolean).join(' ')}
    >
      <Switch isSelected={tracks} onChange={onTracks} aria-label={`${name} tem validade`}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label>Tem validade</Label>
        </Switch.Content>
      </Switch>
      <small>
        {tracks
          ? 'O sistema avisa 30 dias antes de vencer e marca o produto vencido.'
          : suggested
            ? 'Produtos como este costumam ter validade.'
            : 'Ligue para cosméticos, ácidos, injetáveis e tudo que vence.'}
      </small>
      {tracks ? (
        <DateInputField
          label="Vence em"
          description={
            state && state.tone !== 'unset' && state.tone !== 'ok'
              ? state.label
              : 'A data do que está aberto ou vai ser usado primeiro.'
          }
          value={date}
          onChange={onDate}
        />
      ) : null}
    </div>
  )
}

/** "Vem em [caixa] com [100] un": the package, read as a sentence. */
function PackageSentence({
  name,
  unit,
  label,
  size,
  onLabel,
  onSize,
  className,
}: {
  name: string
  unit: string
  label: string
  size: string
  onLabel: (value: string) => void
  onSize: (value: string) => void
  className?: string
}) {
  return (
    <div className={['inv-sentence', className].filter(Boolean).join(' ')}>
      <span className="inv-count-label">Como você compra</span>
      <div className="inv-sentence-row">
        <span>Vem em</span>
        <SelectField
          ariaLabel={`Embalagem de ${name}`}
          value={label}
          onChange={onLabel}
          options={packageLabels.map((id) => ({ id, label: id }))}
        />
        <span>com</span>
        <TextInputField
          ariaLabel={`Quanto vem em cada embalagem de ${name}`}
          inputMode="decimal"
          placeholder="Ex.: 100"
          value={size}
          suffix={unitShort(unit)}
          onChange={onSize}
        />
      </div>
      <small>Opcional. Assim você conta por {label} e o sistema converte sozinho.</small>
    </div>
  )
}

/**
 * Category as chips (easy with a thumb): the ones in use, the space's service categories, and
 * "Nova" to type another.
 */
function CategoryPicker({
  value,
  options,
  onChange,
  className,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  className?: string
}) {
  const list = [...new Set([...options, ...(value ? [value] : [])].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  return (
    <div className={['inv-categories', className].filter(Boolean).join(' ')}>
      <span className="inv-count-label">Categoria</span>
      <div className="biz-chips" role="radiogroup" aria-label="Categoria">
        {list.map((name) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={value === name}
            onClick={() => onChange(value === name ? '' : name)}
          >
            {name}
          </button>
        ))}
        {adding ? null : (
          <button type="button" className="inv-chip-add" onClick={() => setAdding(true)}>
            <Plus size={13} aria-hidden /> Nova
          </button>
        )}
      </div>
      {adding ? (
        <div className="inv-sentence-row">
          <TextInputField
            ariaLabel="Nome da nova categoria"
            autoFocus
            maxLength={60}
            placeholder="Ex.: Higiene"
            value={draft}
            onEnter={() => {
              if (!draft.trim()) return
              onChange(draft.trim())
              setDraft('')
              setAdding(false)
            }}
            onChange={setDraft}
          />
          <Button
            size="sm"
            isDisabled={!draft.trim()}
            onPress={() => {
              onChange(draft.trim())
              setDraft('')
              setAdding(false)
            }}
          >
            Usar
          </Button>
          <Button size="sm" variant="ghost" onPress={() => setAdding(false)}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Rename (or merge, by giving an existing name) and remove stock categories. */
function CategoryManager({
  api,
  items,
  onClose,
}: {
  api: ClinicApi
  items: Item[]
  onClose: (message?: string) => void
}) {
  const counts = items.reduce<Record<string, number>>((all, item) => {
    if (item.category) all[item.category] = (all[item.category] ?? 0) + 1
    return all
  }, {})
  const names = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(names.map((name) => [name, name])),
  )
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [changed, setChanged] = useState(false)

  async function apply(from: string, to: string) {
    setBusy(from)
    setError('')
    try {
      await api.post('inventory/categories', { from, to })
      setChanged(true)
      onClose(
        to
          ? `“${from}” agora é “${to}”.`
          : `“${from}” foi removida; os produtos ficaram sem categoria.`,
      )
    } catch {
      setError('Não foi possível alterar. Tente de novo.')
      setBusy('')
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose(changed ? 'Categorias atualizadas.' : undefined)}
      title="Categorias do estoque"
      subtitle="Renomeie para corrigir ou juntar (use o nome de outra existente). Remover não apaga produtos."
    >
      <ul className="inv-cat-list">
        {names.map((name) => {
          const draft = drafts[name] ?? name
          return (
            <li key={name}>
              <TextInputField
                ariaLabel={`Nome da categoria ${name}`}
                maxLength={60}
                value={draft}
                suffix={`${counts[name]}`}
                onChange={(value) => setDrafts({ ...drafts, [name]: value })}
              />
              <Button
                size="sm"
                isDisabled={Boolean(busy) || !draft.trim() || draft.trim() === name}
                onPress={() => void apply(name, draft.trim())}
              >
                <Check size={14} aria-hidden /> Salvar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                isIconOnly
                aria-label={`Remover a categoria ${name}`}
                isDisabled={Boolean(busy)}
                onPress={() => void apply(name, '')}
              >
                <Trash2 size={15} />
              </Button>
            </li>
          )
        })}
      </ul>
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}
