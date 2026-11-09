'use client'

import { Button } from '@heroui/react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Plus,
  Receipt,
  Undo2,
  Wallet,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useClinicApi, useClinicResource, type ClinicApi } from '../settings/clinic-api'
import {
  HelpTip,
  LoadError,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
  TextInput,
} from '../settings/settings-kit'
import { dateBr, money, parseMoney, shortDateBr, timeBr, todayIso } from './format'
import './business.css'

type Entry = {
  id: string
  kind: 'income' | 'expense'
  amountCents: number
  occurredOn: string
  description: string
  category: string
  method: string | null
  appointmentId: string | null
}
type Finance = {
  month: string
  today: string
  totals: { incomeCents: number; expenseCents: number; balanceCents: number }
  forecast: { cents: number; appointments: number }
  entries: Entry[]
  pending: {
    appointmentId: string
    startsAt: string
    priceCents: number
    client: string
    service: string
  }[]
}

const methods: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit: 'Crédito',
  debit: 'Débito',
  transfer: 'Transferência',
  other: 'Outro',
}
const expenseCategories = [
  'Produtos',
  'Aluguel',
  'Contas',
  'Equipe',
  'Marketing',
  'Equipamentos',
  'Impostos',
  'Outros',
]
const monthNames = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, value - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}

export function FinancePanel({
  clinicId,
  createSignal,
}: {
  clinicId: string
  createSignal: number
}) {
  const api = useClinicApi(clinicId)
  const [month, setMonth] = useState(todayIso().slice(0, 7))
  const finance = useClinicResource<Finance>(api, `finance?month=${month}`)
  const [form, setForm] = useState<'income' | 'expense' | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [method, setMethod] = useState('pix')
  const lastSignal = useRef(createSignal)

  useEffect(() => {
    if (createSignal === lastSignal.current) return
    lastSignal.current = createSignal

    setForm('income')
  }, [createSignal])

  if (finance.error && !finance.data)
    return <LoadError message={finance.error} onRetry={finance.reload} />
  if (!finance.data) return <SettingsSkeleton cards={2} />
  const data = finance.data
  const [year, monthNumber] = data.month.split('-').map(Number)
  const isCurrent = data.month === data.today.slice(0, 7)

  async function launch(item: Finance['pending'][number]) {
    setBusy(item.appointmentId)
    setNotice(null)
    try {
      await api.post('finance/entries', {
        kind: 'income',
        amountCents: item.priceCents,
        occurredOn: item.startsAt.slice(0, 10),
        description: `${item.service} · ${item.client}`,
        category: 'Atendimentos',
        method,
        appointmentId: item.appointmentId,
      })
      setNotice({ kind: 'ok', text: `${money(item.priceCents)} lançado como entrada.` })
      finance.reload()
    } catch {
      setNotice({ kind: 'error', text: 'Não foi possível lançar. Talvez já tenha sido lançado.' })
    } finally {
      setBusy('')
    }
  }

  async function voidEntry(entry: Entry) {
    setBusy(entry.id)
    try {
      await api.post(`finance/entries/${entry.id}/void`, {})
      setNotice({ kind: 'ok', text: 'Lançamento desfeito.' })
      finance.reload()
    } catch {
      setNotice({ kind: 'error', text: 'Não foi possível desfazer.' })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="biz-stack">
      <div className="biz-month">
        <Button
          isIconOnly
          variant="ghost"
          aria-label="Mês anterior"
          onPress={() => setMonth(shiftMonth(data.month, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <strong>
          {monthNames[monthNumber - 1]} de {year}
        </strong>
        <Button
          isIconOnly
          variant="ghost"
          aria-label="Próximo mês"
          isDisabled={isCurrent}
          onPress={() => setMonth(shiftMonth(data.month, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      <div className="biz-stats">
        <div>
          <span>Entradas</span>
          <strong className="is-positive">{money(data.totals.incomeCents)}</strong>
          <small>Recebido no mês</small>
        </div>
        <div>
          <span>Saídas</span>
          <strong className="is-negative">{money(data.totals.expenseCents)}</strong>
          <small>Despesas do mês</small>
        </div>
        <div>
          <span>Saldo</span>
          <strong>{money(data.totals.balanceCents)}</strong>
          <small>Entradas menos saídas</small>
        </div>
        <div>
          <span>Ainda vai entrar</span>
          <strong>{money(data.forecast.cents)}</strong>
          <small>{data.forecast.appointments} atendimentos marcados até o fim do mês</small>
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

      {data.pending.length ? (
        <SettingsCard
          icon={<Receipt size={20} />}
          title="Atendimentos a lançar"
          description="Concluídos e ainda sem entrada no financeiro. Um clique registra o valor."
          help={{
            title: 'Por que lançar?',
            text: 'Assim o financeiro mostra o que realmente entrou. O valor vem do preço guardado no agendamento, já com promoção. Se a cliente pagou outro valor, use “Nova entrada”.',
          }}
          badge={
            <span className="settings-input biz-method">
              <select
                aria-label="Forma de pagamento"
                value={method}
                onChange={(event) => setMethod(event.target.value)}
              >
                {Object.entries(methods).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </span>
          }
        >
          <ul className="biz-list">
            {data.pending.map((item) => (
              <li key={item.appointmentId}>
                <div className="biz-row-main">
                  <strong>{item.client}</strong>
                  <span className="biz-row-meta">
                    {item.service} · {shortDateBr(item.startsAt)} às {timeBr(item.startsAt)}
                  </span>
                </div>
                <div className="biz-actions">
                  <Button
                    size="sm"
                    isDisabled={busy === item.appointmentId}
                    onPress={() => void launch(item)}
                  >
                    <Plus size={14} aria-hidden /> Lançar {money(item.priceCents)}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SettingsCard>
      ) : null}

      {form ? (
        <EntryForm
          api={api}
          kind={form}
          today={data.today}
          onClose={(message) => {
            setForm(null)
            if (message) {
              setNotice({ kind: 'ok', text: message })
              finance.reload()
            }
          }}
        />
      ) : null}

      <SettingsCard
        icon={<Wallet size={20} />}
        title="Lançamentos do mês"
        description="Tudo que entrou e saiu. Um lançamento errado pode ser desfeito."
        badge={
          <div className="biz-actions">
            <Button size="sm" onPress={() => setForm('income')}>
              <ArrowUpCircle size={15} aria-hidden /> Nova entrada
            </Button>
            <Button size="sm" variant="secondary" onPress={() => setForm('expense')}>
              <ArrowDownCircle size={15} aria-hidden /> Nova saída
            </Button>
          </div>
        }
      >
        {data.entries.length ? (
          <ul className="biz-list">
            {data.entries.map((entry) => (
              <li key={entry.id}>
                <span className={`biz-kind is-${entry.kind}`} aria-hidden>
                  {entry.kind === 'income' ? (
                    <ArrowUpCircle size={18} />
                  ) : (
                    <ArrowDownCircle size={18} />
                  )}
                </span>
                <div className="biz-row-main">
                  <strong>{entry.description}</strong>
                  <span className="biz-row-meta">
                    {dateBr(entry.occurredOn)}
                    {entry.category ? ` · ${entry.category}` : ''}
                    {entry.method ? ` · ${methods[entry.method] ?? entry.method}` : ''}
                  </span>
                  {entry.appointmentId ? (
                    <div className="biz-tags">
                      <StatusPill tone="info">Do atendimento</StatusPill>
                    </div>
                  ) : null}
                </div>
                <div className="biz-price">
                  <strong className={entry.kind === 'income' ? 'is-positive' : 'is-negative'}>
                    {entry.kind === 'income' ? '+' : '−'} {money(entry.amountCents)}
                  </strong>
                </div>
                <div className="biz-actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    isDisabled={busy === entry.id}
                    onPress={() => void voidEntry(entry)}
                  >
                    <Undo2 size={14} aria-hidden /> Desfazer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="biz-empty">
            <Wallet size={24} aria-hidden />
            <p>
              Nenhum lançamento neste mês. Use “Nova entrada” ou lance os atendimentos concluídos.
            </p>
          </div>
        )}
      </SettingsCard>
    </div>
  )
}

function EntryForm({
  api,
  kind,
  today,
  onClose,
}: {
  api: ClinicApi
  kind: 'income' | 'expense'
  today: string
  onClose: (message?: string) => void
}) {
  const [type, setType] = useState(kind)
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(kind === 'expense' ? 'Produtos' : 'Atendimentos')
  const [method, setMethod] = useState('pix')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const cents = parseMoney(amount)

  async function save() {
    if (!cents || !description.trim()) {
      setError('Preencha o valor e a descrição.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post('finance/entries', {
        kind: type,
        amountCents: cents,
        occurredOn: date,
        description: description.trim(),
        category: category.trim(),
        method,
      })
      onClose(`${type === 'income' ? 'Entrada' : 'Saída'} de ${money(cents)} registrada.`)
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <SettingsCard
      icon={type === 'income' ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
      title={type === 'income' ? 'Nova entrada' : 'Nova saída'}
    >
      <div className="team-choice" role="radiogroup" aria-label="Tipo">
        {(
          [
            ['income', 'Entrada (recebi)'],
            ['expense', 'Saída (paguei)'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={type === id}
            onClick={() => setType(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="settings-grid">
        <TextInput
          label="Valor (R$)"
          inputMode="numeric"
          value={amount}
          placeholder="0,00"
          onChange={setAmount}
          required
        />
        <label className="settings-field">
          <span className="settings-field-label">Data</span>
          <span className="settings-input">
            <input
              type="date"
              value={date}
              max={today}
              onChange={(event) => setDate(event.target.value || today)}
            />
          </span>
        </label>
        <TextInput
          label="Descrição"
          value={description}
          maxLength={160}
          required
          wide
          placeholder={type === 'income' ? 'Ex.: Venda de produto' : 'Ex.: Conta de luz'}
          onChange={setDescription}
        />
        <div className="settings-field">
          <span className="settings-field-label">
            <label htmlFor="entry-category">Categoria</label>
            <HelpTip title="Para que serve?">
              Ajuda a ver para onde vai o dinheiro nos relatórios.
            </HelpTip>
          </span>
          <span className="settings-input">
            <input
              id="entry-category"
              list="entry-categories"
              value={category}
              maxLength={60}
              onChange={(event) => setCategory(event.target.value)}
            />
          </span>
          <datalist id="entry-categories">
            {(type === 'expense'
              ? expenseCategories
              : ['Atendimentos', 'Produtos', 'Pacotes', 'Outros']
            ).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <label className="settings-field">
          <span className="settings-field-label">Forma</span>
          <span className="settings-input">
            <select value={method} onChange={(event) => setMethod(event.target.value)}>
              {Object.entries(methods).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </span>
        </label>
      </div>
      {error ? (
        <p className="settings-field-error" role="alert">
          {error}
        </p>
      ) : null}
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
