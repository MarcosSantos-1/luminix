'use client'

import { Button } from '@heroui/react'
import {
  Archive,
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
  ComboField,
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
}
type Inventory = {
  items: Item[]
  lowStock: number
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
  const items = data.items.filter(
    (item) =>
      (view === 'all' ||
        (view === 'low' && isLow(item)) ||
        (view === 'nocost' && item.costCents == null)) &&
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
        onSelect={(id) => setView(view === id || id === 'value' || id === 'linked' ? 'all' : id)}
        items={[
          {
            id: 'all',
            label: 'Produtos',
            value: data.items.length,
            hint: `${categories.length} ${categories.length === 1 ? 'categoria' : 'categorias'}`,
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
            id: 'linked',
            label: 'Baixa automática',
            value: linked,
            hint: 'Descontados ao concluir atendimentos',
            icon: <Scissors size={22} />,
            tone: 'info',
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
          </div>
        ) : null}
        {items.length ? (
          <ul className="inv-grid">
            {items.map((item) => {
              const state = level(item)
              const stock = describeStock(item)
              const step = quickStep(item)
              const days = daysLeft(item.quantity, item.used30 ?? 0)
              return (
                <li key={item.id} className={`inv-card is-${state.tone}`}>
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
          categories={categories}
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
      {setup ? (
        <StockSetup api={api} groups={suggestions} services={services} onClose={done} />
      ) : null}
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
  const shape = { unit: item.unit, packageSize: packageSize || null }
  const start = useAmountInput(shape, '')
  const [alert, setAlert] = useState<string>(
    initial.alertPercent ? String(initial.alertPercent) : isNew ? '25' : 'qty',
  )
  const [min, setMin] = useState(
    initial.packageSize
      ? plain(Math.round((initial.minQuantity / initial.packageSize) * 100) / 100)
      : plain(initial.minQuantity),
  )
  const [cost, setCost] = useState(initial.costCents == null ? '' : moneyInput(initial.costCents))
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
      start.base == null ||
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
        ...(isNew ? { initialQuantity: Math.round(start.base * 100) / 100 } : {}),
        costCents,
        packageSize: packageSize || null,
        packageLabel: packageSize ? label : '',
        photoAssetId: item.photoAssetId ?? '',
        ...(item.catalogId ? { catalogId: item.catalogId } : {}),
        ...(supplies.length ? { supplies } : {}),
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
        <ComboField
          label="Categoria"
          value={item.category}
          maxLength={60}
          suggestions={categories}
          placeholder="Ex.: Depilação"
          onChange={(category) => setItem({ ...item, category })}
        />
        <SelectField
          label="Medido em"
          value={item.unit}
          description="A medida que os atendimentos gastam."
          onChange={(unit) => setItem({ ...item, unit })}
          options={unitOptions.map(({ id, label: text }) => ({ id, label: text }))}
        />
        <div className="inv-package">
          <SelectField
            label="Vem em"
            value={label}
            onChange={(packageLabel) => setItem({ ...item, packageLabel })}
            options={packageLabels.map((id) => ({ id, label: id }))}
          />
          <TextInputField
            label={`Cada ${label} tem`}
            inputMode="decimal"
            value={size}
            placeholder="Ex.: 400"
            suffix={unitShort(item.unit)}
            onChange={setSize}
          />
        </div>
        {isNew ? (
          <TextInputField
            label="Quanto tem agora"
            inputMode="decimal"
            value={start.text}
            placeholder="0"
            suffix={packageSize ? pluralize(label, 2) : unitShort(item.unit)}
            description={
              packageSize && start.base
                ? `= ${amount(start.base)} ${unitShort(item.unit)}`
                : 'Pode usar decimal, como 2,5.'
            }
            onChange={start.setText}
          />
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
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
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
      </div>
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

type SetupRow = { selected: boolean; size: string; label: string; have: string }

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
            have: '',
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
      const have = row.have.trim() ? parseQty(row.have) : 0
      const supplies = recipesFor(product.id, services)
      try {
        await api.put(`inventory/items/${crypto.randomUUID()}`, {
          name: product.nome,
          category: group === 'Descartáveis e higiene' ? 'Descartáveis' : group,
          unit: product.unidade,
          minQuantity: 0,
          alertPercent: product.aviso_percentual,
          initialQuantity: Math.round((have ?? 0) * (size || 1) * 100) / 100,
          costCents: null,
          packageSize: size || null,
          packageLabel: size ? row.label : '',
          photoAssetId: '',
          catalogId: product.id,
          ...(supplies.length ? { supplies } : {}),
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
                          <small>{unitShort(product.unidade)}</small>
                        </button>
                        {row.selected ? (
                          <div className="inv-setup-fields">
                            <SelectField
                              ariaLabel={`Embalagem de ${product.nome}`}
                              value={row.label}
                              onChange={(label) => set(product.id, { label })}
                              options={packageLabels.map((id) => ({ id, label: id }))}
                            />
                            <TextInputField
                              ariaLabel={`Conteúdo de cada embalagem de ${product.nome}`}
                              inputMode="decimal"
                              placeholder="Tamanho"
                              value={row.size}
                              suffix={unitShort(product.unidade)}
                              onChange={(size) => set(product.id, { size })}
                            />
                            <TextInputField
                              ariaLabel={`Quanto tem de ${product.nome}`}
                              inputMode="decimal"
                              placeholder="Tenho"
                              value={row.have}
                              suffix={
                                row.size.trim()
                                  ? pluralize(row.label, 2)
                                  : unitShort(product.unidade)
                              }
                              onChange={(have) => set(product.id, { have })}
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
