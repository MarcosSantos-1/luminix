'use client'

import { Button } from '@heroui/react'
import {
  Archive,
  Check,
  CircleAlert,
  History,
  Minus,
  Package,
  Pencil,
  Plus,
  SlidersHorizontal,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SearchInput, SelectField } from '@/components/ui/fields'
import {
  useClinicApi,
  useClinicResource,
  ClinicApiError,
  type ClinicApi,
} from '../settings/clinic-api'
import {
  Empty,
  LoadError,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
  TextInput,
} from '../settings/settings-kit'
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
const kinds = { in: 'Entrada', out: 'Saída', adjust: 'Contagem' } as const
const qty = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const parseQty = (value: string) => {
  const number = Number(value.replace(',', '.'))
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null
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
  const [editing, setEditing] = useState<Item | null>(null)
  const [moving, setMoving] = useState<{ item: Item; kind: 'in' | 'out' | 'adjust' } | null>(null)
  const [query, setQuery] = useState('')
  useSearchFocus(focus, setQuery)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const lastSignal = useRef(createSignal)
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
  const needle = query.trim().toLocaleLowerCase('pt-BR')
  const items = data.items.filter(
    (item) =>
      !needle || `${item.name} ${item.category}`.toLocaleLowerCase('pt-BR').includes(needle),
  )
  const done = (message?: string) => {
    setEditing(null)
    setMoving(null)
    if (message) {
      setNotice({ kind: 'ok', text: message })
      inventory.reload()
    }
  }

  return (
    <div className="biz-stack">
      <div className="biz-stats">
        <div>
          <span>Produtos</span>
          <strong>{data.items.length}</strong>
          <small>Itens cadastrados</small>
        </div>
        <div className={data.lowStock ? 'is-alert' : undefined}>
          <span>Acabando</span>
          <strong>{data.lowStock}</strong>
          <small>{data.lowStock ? 'No mínimo ou abaixo' : 'Tudo abastecido'}</small>
        </div>
        <div>
          <span>Valor em estoque</span>
          <strong>{money(data.stockValueCents)}</strong>
          <small>Pelo custo informado</small>
        </div>
      </div>
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
      {editing ? (
        <ItemEditor
          key={editing.id}
          api={api}
          initial={editing}
          isNew={!data.items.some((item) => item.id === editing.id)}
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

      <SettingsCard
        icon={<Package size={20} />}
        title="Seus produtos"
        description="Registre o que entra e o que sai. O sistema avisa quando algo está acabando."
        help={{
          title: 'O que é o mínimo?',
          text: 'É a quantidade que, ao ser atingida, faz o produto aparecer como “acabando” aqui e no Início. Use para lembrar de comprar a tempo.',
        }}
        badge={
          <Button size="sm" onPress={() => setEditing(blank())}>
            <Plus size={15} aria-hidden /> Novo produto
          </Button>
        }
      >
        {data.items.length > 6 ? (
          <SearchInput
            className="biz-search"
            ariaLabel="Buscar produto"
            placeholder="Buscar produto"
            value={query}
            onChange={setQuery}
          />
        ) : null}
        {items.length ? (
          <ul className="biz-list">
            {items.map((item) => {
              const low = item.quantity <= item.minQuantity
              return (
                <li key={item.id} className={low ? 'is-alert' : undefined}>
                  <div className="biz-row-main">
                    <strong>{item.name}</strong>
                    <span className="biz-row-meta">
                      {item.category ? `${item.category} · ` : ''}mínimo {qty(item.minQuantity)}{' '}
                      {units[item.unit]}
                      {item.costCents != null ? ` · custo ${money(item.costCents)}` : ''}
                    </span>
                    {low ? (
                      <div className="biz-tags">
                        <StatusPill tone="off">Acabando</StatusPill>
                      </div>
                    ) : null}
                  </div>
                  <div className="biz-price">
                    <strong>
                      {qty(item.quantity)} <small>{units[item.unit]}</small>
                    </strong>
                  </div>
                  <div className="biz-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => setMoving({ item, kind: 'in' })}
                    >
                      <Plus size={14} aria-hidden /> Entrada
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      isDisabled={item.quantity <= 0}
                      onPress={() => setMoving({ item, kind: 'out' })}
                    >
                      <Minus size={14} aria-hidden /> Saída
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      aria-label={`Contagem de ${item.name}`}
                      onPress={() => setMoving({ item, kind: 'adjust' })}
                    >
                      <SlidersHorizontal size={14} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      isIconOnly
                      aria-label={`Editar ${item.name}`}
                      onPress={() => setEditing(item)}
                    >
                      <Pencil size={14} />
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : data.items.length ? (
          <Empty>Nenhum produto com esse nome.</Empty>
        ) : (
          <div className="biz-empty">
            <Package size={24} aria-hidden />
            <p>
              Cadastre os produtos que você usa nos atendimentos, como esmaltes, cremes e
              descartáveis.
            </p>
          </div>
        )}
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
    </div>
  )
}

function ItemEditor({
  api,
  initial,
  isNew,
  onClose,
}: {
  api: ClinicApi
  initial: Item
  isNew: boolean
  onClose: (message?: string) => void
}) {
  const [item, setItem] = useState(initial)
  const [min, setMin] = useState(String(initial.minQuantity).replace('.', ','))
  const [start, setStart] = useState('')
  const [cost, setCost] = useState(initial.costCents == null ? '' : moneyInput(initial.costCents))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const minQuantity = parseQty(min || '0')
    const initialQuantity = parseQty(start || '0')
    const costCents = cost.trim() ? parseMoney(cost) : null
    if (
      !item.name.trim() ||
      minQuantity == null ||
      initialQuantity == null ||
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
    <SettingsCard
      icon={<Package size={20} />}
      title={isNew ? 'Novo produto' : `Editar ${initial.name}`}
    >
      <div className="settings-grid">
        <TextInput
          label="Nome"
          value={item.name}
          maxLength={120}
          required
          placeholder="Ex.: Esmalte vermelho"
          onChange={(name) => setItem({ ...item, name })}
        />
        <TextInput
          label="Categoria (opcional)"
          value={item.category}
          maxLength={60}
          placeholder="Ex.: Unhas"
          onChange={(category) => setItem({ ...item, category })}
        />
        <SelectField
          label="Medida"
          value={item.unit}
          onChange={(unit) => setItem({ ...item, unit })}
          options={Object.entries(units).map(([id, label]) => ({ id, label }))}
        />
        <TextInput
          label="Avisar quando chegar a"
          inputMode="numeric"
          value={min}
          onChange={setMin}
          help={{
            title: 'Quantidade mínima',
            text: 'Quando o estoque chegar nesse número, o produto aparece como “acabando”.',
          }}
        />
        {isNew ? (
          <TextInput
            label="Quanto tem agora"
            inputMode="numeric"
            value={start}
            placeholder="0"
            onChange={setStart}
          />
        ) : null}
        <TextInput
          label="Custo por unidade (opcional)"
          inputMode="numeric"
          value={cost}
          placeholder="0,00"
          onChange={setCost}
        />
      </div>
      {error ? <p className="settings-field-error">{error}</p> : null}
      <div className="biz-actions">
        {!isNew ? (
          <Button variant="ghost" onPress={() => void archive()} isDisabled={saving}>
            <Archive size={15} aria-hidden /> Tirar da lista
          </Button>
        ) : null}
        <Button variant="ghost" onPress={() => onClose()}>
          Cancelar
        </Button>
        <Button onPress={() => void save()} isDisabled={saving}>
          <Check size={15} aria-hidden /> Salvar
        </Button>
      </div>
    </SettingsCard>
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
    kind === 'adjust' ? String(item.quantity).replace('.', ',') : '',
  )
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const title = {
    in: `Entrada de ${item.name}`,
    out: `Saída de ${item.name}`,
    adjust: `Contagem de ${item.name}`,
  }[kind]

  async function save() {
    const quantity = parseQty(amount)
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
      onClose(`${title}: agora são ${qty(result.balance)} ${units[item.unit]}.`)
    } catch {
      setError(
        kind === 'out' ? 'Não tem essa quantidade em estoque.' : 'Não foi possível registrar.',
      )
      setSaving(false)
    }
  }

  return (
    <SettingsCard
      icon={
        kind === 'out' ? (
          <Minus size={20} />
        ) : kind === 'in' ? (
          <Plus size={20} />
        ) : (
          <SlidersHorizontal size={20} />
        )
      }
      title={title}
      description={
        kind === 'adjust'
          ? 'Contou as prateleiras? Informe quanto tem de verdade.'
          : `Hoje há ${qty(item.quantity)} ${units[item.unit]}.`
      }
    >
      <div className="settings-grid">
        <TextInput
          label={kind === 'adjust' ? 'Quantidade contada' : 'Quantidade'}
          inputMode="numeric"
          value={amount}
          onChange={setAmount}
          required
        />
        <TextInput
          label="Observação (opcional)"
          value={note}
          maxLength={160}
          placeholder={kind === 'in' ? 'Ex.: Compra no fornecedor' : 'Ex.: Uso nos atendimentos'}
          onChange={setNote}
        />
      </div>
      {error ? <p className="settings-field-error">{error}</p> : null}
      <div className="biz-actions">
        <Button variant="ghost" onPress={() => onClose()}>
          Cancelar
        </Button>
        <Button onPress={() => void save()} isDisabled={saving}>
          <Check size={15} aria-hidden /> Registrar
        </Button>
      </div>
    </SettingsCard>
  )
}
