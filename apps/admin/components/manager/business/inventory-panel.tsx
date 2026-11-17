'use client'

import { Button } from '@heroui/react'
import {
  Archive,
  Camera,
  Check,
  CircleAlert,
  History,
  ImagePlus,
  Minus,
  Package,
  PackageCheck,
  PackageX,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2,
  Wallet,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  ComboField,
  MoneyField,
  SearchInput,
  SelectField,
  TextInputField,
} from '@/components/ui/fields'
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
  /** What one unit holds, e.g. 400 + "g" for a "pote de 400 g". */
  packageSize?: number | null
  packageUnit?: string | null
  photoAssetId?: string
  photoUrl?: string | null
  photoLargeUrl?: string | null
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
type Template = {
  name: string
  category: string
  unit: string
  min: number
  packageSize?: number
  packageUnit?: 'ml' | 'g' | 'un'
}

const units: Record<string, string> = {
  un: 'unidades',
  ml: 'ml',
  l: 'litros',
  g: 'gramas',
  kg: 'kg',
  cx: 'caixas',
  fr: 'frascos',
  par: 'pares',
}
const unitOne: Record<string, string> = {
  un: 'unidade',
  ml: 'ml',
  l: 'litro',
  g: 'grama',
  kg: 'kg',
  cx: 'caixa',
  fr: 'frasco',
  par: 'par',
}
const kinds = { in: 'Entrada', out: 'Saída', adjust: 'Contagem' } as const
const qty = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const parseQty = (value: string) => {
  const number = Number(value.replace(',', '.'))
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null
}
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Ready-made products by the kind of work the space does. A group is offered when one of its
// keywords appears in the service categories; "geral" is always offered.
const templateGroups: { keys: string[]; items: Template[] }[] = [
  {
    keys: ['depil'],
    items: [
      {
        name: 'Cera quente',
        category: 'Depilação',
        unit: 'un',
        min: 2,
        packageSize: 400,
        packageUnit: 'g',
      },
      {
        name: 'Cera roll-on',
        category: 'Depilação',
        unit: 'un',
        min: 6,
        packageSize: 100,
        packageUnit: 'g',
      },
      {
        name: 'Espátulas descartáveis',
        category: 'Depilação',
        unit: 'cx',
        min: 1,
        packageSize: 100,
        packageUnit: 'un',
      },
      { name: 'Lenço pós-depilatório', category: 'Depilação', unit: 'cx', min: 1 },
      {
        name: 'Papel para depilação',
        category: 'Depilação',
        unit: 'cx',
        min: 1,
        packageSize: 100,
        packageUnit: 'un',
      },
    ],
  },
  {
    keys: ['tatu', 'tattoo', 'pierc'],
    items: [
      {
        name: 'Tinta preta',
        category: 'Tatuagem',
        unit: 'fr',
        min: 2,
        packageSize: 30,
        packageUnit: 'ml',
      },
      {
        name: 'Agulhas (cartucho)',
        category: 'Tatuagem',
        unit: 'cx',
        min: 2,
        packageSize: 20,
        packageUnit: 'un',
      },
      { name: 'Filme protetor', category: 'Tatuagem', unit: 'un', min: 1 },
      {
        name: 'Vaselina',
        category: 'Tatuagem',
        unit: 'un',
        min: 1,
        packageSize: 500,
        packageUnit: 'g',
      },
      {
        name: 'Batoque descartável',
        category: 'Tatuagem',
        unit: 'cx',
        min: 1,
        packageSize: 100,
        packageUnit: 'un',
      },
    ],
  },
  {
    keys: ['unha', 'manic', 'pedic', 'nail'],
    items: [
      { name: 'Esmalte', category: 'Unhas', unit: 'fr', min: 3, packageSize: 8, packageUnit: 'ml' },
      {
        name: 'Acetona',
        category: 'Unhas',
        unit: 'fr',
        min: 1,
        packageSize: 500,
        packageUnit: 'ml',
      },
      { name: 'Algodão', category: 'Unhas', unit: 'un', min: 2 },
      {
        name: 'Lixa descartável',
        category: 'Unhas',
        unit: 'cx',
        min: 1,
        packageSize: 100,
        packageUnit: 'un',
      },
      {
        name: 'Gel construtor',
        category: 'Unhas',
        unit: 'un',
        min: 1,
        packageSize: 24,
        packageUnit: 'g',
      },
    ],
  },
  {
    keys: ['cabel', 'hair', 'barb', 'color', 'escova'],
    items: [
      {
        name: 'Shampoo profissional',
        category: 'Cabelo',
        unit: 'fr',
        min: 1,
        packageSize: 1000,
        packageUnit: 'ml',
      },
      {
        name: 'Condicionador',
        category: 'Cabelo',
        unit: 'fr',
        min: 1,
        packageSize: 1000,
        packageUnit: 'ml',
      },
      {
        name: 'Coloração',
        category: 'Cabelo',
        unit: 'un',
        min: 4,
        packageSize: 60,
        packageUnit: 'g',
      },
      {
        name: 'Água oxigenada',
        category: 'Cabelo',
        unit: 'fr',
        min: 1,
        packageSize: 900,
        packageUnit: 'ml',
      },
      {
        name: 'Pó descolorante',
        category: 'Cabelo',
        unit: 'un',
        min: 1,
        packageSize: 500,
        packageUnit: 'g',
      },
    ],
  },
  {
    keys: ['facial', 'pele', 'estet', 'limpeza', 'massag', 'corporal'],
    items: [
      {
        name: 'Sabonete de limpeza',
        category: 'Estética',
        unit: 'fr',
        min: 1,
        packageSize: 250,
        packageUnit: 'ml',
      },
      {
        name: 'Máscara facial',
        category: 'Estética',
        unit: 'un',
        min: 2,
        packageSize: 250,
        packageUnit: 'g',
      },
      {
        name: 'Creme de massagem',
        category: 'Estética',
        unit: 'un',
        min: 1,
        packageSize: 1000,
        packageUnit: 'g',
      },
      { name: 'Gaze', category: 'Estética', unit: 'cx', min: 1 },
    ],
  },
  {
    keys: ['sobranc', 'cilio', 'lash', 'brow'],
    items: [
      { name: 'Henna para sobrancelha', category: 'Sobrancelhas', unit: 'un', min: 1 },
      {
        name: 'Cola para cílios',
        category: 'Cílios',
        unit: 'fr',
        min: 1,
        packageSize: 5,
        packageUnit: 'ml',
      },
      { name: 'Fios para extensão', category: 'Cílios', unit: 'cx', min: 2 },
      { name: 'Linha para design', category: 'Sobrancelhas', unit: 'un', min: 1 },
    ],
  },
  {
    keys: [],
    items: [
      {
        name: 'Luvas descartáveis',
        category: 'Descartáveis',
        unit: 'cx',
        min: 1,
        packageSize: 100,
        packageUnit: 'un',
      },
      {
        name: 'Máscaras descartáveis',
        category: 'Descartáveis',
        unit: 'cx',
        min: 1,
        packageSize: 50,
        packageUnit: 'un',
      },
      {
        name: 'Álcool 70%',
        category: 'Limpeza',
        unit: 'fr',
        min: 1,
        packageSize: 1000,
        packageUnit: 'ml',
      },
      { name: 'Papel toalha', category: 'Descartáveis', unit: 'un', min: 2 },
      { name: 'Lençol descartável', category: 'Descartáveis', unit: 'un', min: 1 },
    ],
  },
]

/** How full the shelf is, for the bar: the alert level sits at one third of the bar. */
function level(item: Item) {
  if (item.quantity <= 0) return { percent: 0, tone: 'empty', label: 'Acabou' }
  if (item.quantity <= item.minQuantity) {
    const percent = item.minQuantity ? Math.max(8, (item.quantity / item.minQuantity) * 33) : 33
    return { percent, tone: 'low', label: 'Acabando' }
  }
  const full = Math.max(item.minQuantity * 3, 1)
  return { percent: Math.min(100, (item.quantity / full) * 100), tone: 'ok', label: '' }
}

const packageText = (item: Pick<Item, 'packageSize' | 'packageUnit'>) =>
  item.packageSize && item.packageUnit
    ? `${qty(item.packageSize)} ${item.packageUnit === 'un' ? 'un' : item.packageUnit} cada`
    : ''

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
  const catalog = useClinicResource<{ services: { category: string }[] }>(api, 'catalog')
  const [editing, setEditing] = useState<Item | null>(null)
  const [moving, setMoving] = useState<{ item: Item; kind: 'in' | 'out' | 'adjust' } | null>(null)
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

  if (inventory.error && !inventory.data)
    return <LoadError message={inventory.error} onRetry={inventory.reload} />
  if (!inventory.data) return <SettingsSkeleton cards={2} />
  const data = inventory.data
  const needle = fold(query.trim())
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
  const serviceCategories = fold(
    (catalog.data?.services ?? []).map((service) => service.category).join(' '),
  )
  const existing = new Set(data.items.map((item) => fold(item.name)))
  const suggestions = templateGroups
    .filter(
      (group) => !group.keys.length || group.keys.some((key) => serviceCategories.includes(key)),
    )
    .flatMap((group) => group.items)
    .filter((template) => !existing.has(fold(template.name)))
  const done = (message?: string) => {
    setEditing(null)
    setMoving(null)
    if (message) {
      setNotice({ kind: 'ok', text: message })
      inventory.reload()
    }
  }

  /** One tap, no form: "usei 1" or "chegou 1". */
  async function quick(item: Item, kind: 'in' | 'out') {
    if (busy) return
    setBusy(item.id)
    setNotice(null)
    try {
      const result = await api.post<{ balance: number }>(`inventory/items/${item.id}/movements`, {
        kind,
        quantity: 1,
        note: kind === 'out' ? 'Uso nos atendimentos' : 'Reposição',
      })
      setNotice({
        kind: 'ok',
        text: `${item.name}: ${kind === 'out' ? 'baixa de' : 'entrada de'} 1 ${unitOne[item.unit]}. Agora são ${qty(result.balance)}.`,
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
            id: 'nocost',
            label: 'Sem custo',
            value: withoutCost,
            hint: withoutCost ? 'Ficam fora do Financeiro' : 'Todos com custo',
            icon: <PackageCheck size={22} />,
            tone: 'info',
          },
          {
            id: 'value',
            label: 'Valor em estoque',
            value: money(data.stockValueCents),
            hint: 'Pelo custo informado',
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

      <SettingsCard
        icon={<Package size={20} />}
        title="Seus produtos"
        description="Um toque para dar baixa ou repor. O sistema avisa quando algo está acabando."
        help={{
          title: 'Como funciona o aviso?',
          text: 'Cada produto tem um nível de aviso. Quando a quantidade chega nele, o produto aparece como “acabando” aqui, no Início e no Financeiro, para você comprar a tempo.',
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
                        {[item.category, packageText(item)].filter(Boolean).join(' · ') ||
                          'Sem categoria'}
                      </small>
                    </span>
                    <Pencil className="inv-edit" size={15} aria-hidden />
                  </button>
                  <div className="inv-level">
                    <div className="inv-amount">
                      <strong>{qty(item.quantity)}</strong>
                      <span>{item.quantity === 1 ? unitOne[item.unit] : units[item.unit]}</span>
                      {state.label ? <em>{state.label}</em> : null}
                    </div>
                    <div
                      className="inv-bar"
                      role="img"
                      aria-label={`${qty(item.quantity)} ${units[item.unit]}, aviso em ${qty(item.minQuantity)}`}
                    >
                      <i style={{ width: `${state.percent}%` }} />
                    </div>
                    <small>Aviso em {qty(item.minQuantity)}</small>
                  </div>
                  <div className="inv-actions">
                    <Button
                      variant="secondary"
                      isDisabled={item.quantity < 1 || busy === item.id}
                      onPress={() => void quick(item, 'out')}
                    >
                      <Minus size={16} aria-hidden /> Usei 1
                    </Button>
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
            <p>Comece pelos produtos que você mais usa. Toque em um para cadastrar em segundos.</p>
          </div>
        )}
        {suggestions.length && view === 'all' && !needle && !category ? (
          <div className="inv-suggest">
            <span>Sugestões para o seu espaço</span>
            <div className="biz-chips">
              {suggestions.slice(0, 10).map((template) => (
                <button
                  key={template.name}
                  type="button"
                  onClick={() =>
                    setEditing({
                      ...blank(),
                      name: template.name,
                      category: template.category,
                      unit: template.unit,
                      minQuantity: template.min,
                      packageSize: template.packageSize ?? null,
                      packageUnit: template.packageUnit ?? null,
                    })
                  }
                >
                  <Plus size={13} aria-hidden /> {template.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </SettingsCard>

      {data.movements.length ? (
        <SettingsCard icon={<History size={20} />} title="Últimas movimentações">
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
                    {qty(movement.quantity)}
                  </strong>
                  <small>saldo {qty(movement.balance)}</small>
                </div>
              </li>
            ))}
          </ul>
        </SettingsCard>
      ) : null}

      {editing ? (
        <ItemEditor
          key={editing.id}
          api={api}
          initial={editing}
          isNew={!data.items.some((item) => item.id === editing.id)}
          categories={categories}
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
    </div>
  )
}

function ItemEditor({
  api,
  initial,
  isNew,
  categories,
  onClose,
}: {
  api: ClinicApi
  initial: Item
  isNew: boolean
  categories: string[]
  onClose: (message?: string) => void
}) {
  const [item, setItem] = useState(initial)
  const [min, setMin] = useState(String(initial.minQuantity).replace('.', ','))
  const [start, setStart] = useState('')
  const [size, setSize] = useState(
    initial.packageSize ? String(initial.packageSize).replace('.', ',') : '',
  )
  const [cost, setCost] = useState(initial.costCents == null ? '' : moneyInput(initial.costCents))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

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
    const minQuantity = parseQty(min || '0')
    const initialQuantity = parseQty(start || '0')
    const packageSize = size.trim() ? parseQty(size) : null
    const costCents = cost.trim() ? parseMoney(cost) : null
    if (
      !item.name.trim() ||
      minQuantity == null ||
      initialQuantity == null ||
      (size.trim() && !packageSize) ||
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
        minQuantity,
        ...(isNew ? { initialQuantity } : {}),
        costCents,
        packageSize,
        packageUnit: packageSize ? (item.packageUnit ?? 'ml') : null,
        photoAssetId: item.photoAssetId ?? '',
      })
      onClose(isNew ? `${item.name.trim()} cadastrado.` : 'Produto atualizado.')
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
          label="Conto em"
          value={item.unit}
          onChange={(unit) => setItem({ ...item, unit })}
          options={Object.entries(units).map(([id, label]) => ({ id, label }))}
        />
        <div className="inv-package">
          <TextInputField
            label="Cada um tem (opcional)"
            inputMode="decimal"
            value={size}
            placeholder="Ex.: 400"
            description="Tamanho da embalagem, como um pote de 400 g."
            onChange={setSize}
          />
          <SelectField
            ariaLabel="Medida da embalagem"
            value={item.packageUnit ?? 'ml'}
            onChange={(packageUnit) => setItem({ ...item, packageUnit })}
            options={[
              { id: 'ml', label: 'ml' },
              { id: 'g', label: 'g' },
              { id: 'un', label: 'unidades' },
            ]}
          />
        </div>
        {isNew ? (
          <TextInputField
            label="Quanto tem agora"
            inputMode="decimal"
            value={start}
            placeholder="0"
            onChange={setStart}
          />
        ) : null}
        <TextInputField
          label="Avisar quando chegar a"
          inputMode="decimal"
          value={min}
          description="Nesse número o produto aparece como “acabando”."
          onChange={setMin}
        />
        <MoneyField
          label="Custo por unidade (opcional)"
          description="Usado no Financeiro para estimar o gasto com produtos."
          value={cost}
          onChange={setCost}
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
  const [amount, setAmount] = useState(
    kind === 'adjust' ? String(item.quantity).replace('.', ',') : '1',
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const title = {
    in: `Chegou ${item.name}`,
    out: `Saída de ${item.name}`,
    adjust: `Contagem de ${item.name}`,
  }[kind]

  async function save(value = amount) {
    const quantity = parseQty(value)
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
      onClose(`${item.name}: agora são ${qty(result.balance)} ${units[item.unit]}.`)
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
      subtitle={
        kind === 'adjust'
          ? 'Contou a prateleira? Informe quanto tem de verdade.'
          : `Hoje há ${qty(item.quantity)} ${units[item.unit]}.`
      }
      footer={
        <>
          {kind === 'adjust' && item.quantity > 0 ? (
            <Button
              variant="ghost"
              className="qm-foot-start"
              isDisabled={saving}
              onPress={() => void save('0')}
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
      {kind !== 'adjust' ? (
        <div className="biz-chips" role="group" aria-label="Quantidade rápida">
          {[1, 2, 5, 10, 20].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={amount === String(value)}
              onClick={() => setAmount(String(value))}
            >
              {kind === 'in' ? '+' : '−'}
              {value}
            </button>
          ))}
        </div>
      ) : null}
      <div className="manager-form-grid">
        <TextInputField
          label={kind === 'adjust' ? 'Quantidade contada' : 'Quantidade'}
          inputMode="decimal"
          isRequired
          value={amount}
          suffix={units[item.unit]}
          onChange={setAmount}
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
