'use client'

import { Button } from '@heroui/react'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  HandCoins,
  Package,
  Pencil,
  PiggyBank,
  Plus,
  Receipt,
  Scale,
  Settings2,
  Undo2,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  ComboField,
  DateInputField,
  MoneyField,
  SelectField,
  TextInputField,
} from '@/components/ui/fields'
import { KpiCards } from '../data-kit'
import { QuickModal } from '../quick-modal'
import { useClinicApi, useClinicResource, type ClinicApi } from '../settings/clinic-api'
import {
  HelpTip,
  LoadError,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
} from '../settings/settings-kit'
import { dateBr, money, moneyInput, parseMoney, shortDateBr, timeBr, todayIso } from './format'
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
  billId?: string | null
}
type Bill = {
  id: string
  name: string
  category: string
  /** Expected amount; the real one is typed when the bill is settled. */
  amountCents: number
  dueDay: number | null
  entryId: string | null
  paidCents: number | null
  paidOn: string | null
}
type Pending = {
  appointmentId: string
  startsAt: string
  priceCents: number
  /** "A combinar": no agreed price, the amount is asked. */
  quote?: boolean
  client: string
  service: string
}
type CategoryRow = { category: string; cents: number; fixedCents: number }
type TrendRow = { month: string; incomeCents: number; expenseCents: number }
type Finance = {
  month: string
  today: string
  totals: {
    incomeCents: number
    incomeAppointmentsCents?: number
    expenseCents: number
    expenseFixedCents?: number
    balanceCents: number
  }
  forecast: { cents: number; appointments: number }
  entries: Entry[]
  pending: Pending[]
  bills?: Bill[]
  expenseCategories?: CategoryRow[]
  trend?: TrendRow[]
  topClients?: { client: string; cents: number; visits: number }[]
  courtesyAppointments?: number
  stock?: {
    items: number
    valueCents: number
    restockCents: number
    usedCents: number
    low: number
    withoutCost: number
  }
}

const methods: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit: 'Crédito',
  debit: 'Débito',
  transfer: 'Transferência',
  other: 'Outro',
}
const methodOptions = Object.entries(methods).map(([id, label]) => ({ id, label }))
const expenseCategories = [
  'Aluguel',
  'Contas',
  'Produtos',
  'Equipe',
  'Marketing',
  'Equipamentos',
  'Impostos',
  'Serviços',
  'Outros',
]
/** Usual bills of a salon or clinic, offered on the first visit and in "Nova conta". */
const billTemplates: { name: string; category: string; dueDay: number | null }[] = [
  { name: 'Aluguel', category: 'Aluguel', dueDay: 10 },
  { name: 'Energia (luz)', category: 'Contas', dueDay: 15 },
  { name: 'Água', category: 'Contas', dueDay: 15 },
  { name: 'Internet e telefone', category: 'Contas', dueDay: 10 },
  { name: 'Salários e comissões', category: 'Equipe', dueDay: 5 },
  { name: 'Impostos (DAS, MEI)', category: 'Impostos', dueDay: 20 },
  { name: 'Contador', category: 'Serviços', dueDay: 5 },
  { name: 'Sistemas e assinaturas', category: 'Serviços', dueDay: 5 },
  { name: 'Limpeza', category: 'Serviços', dueDay: null },
  { name: 'Reposição de produtos', category: 'Produtos', dueDay: null },
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
const monthOf = (month: string) => monthNames[Number(month.slice(5, 7)) - 1]
const dueOptions = [
  { id: 'none', label: 'Sem dia certo' },
  ...Array.from({ length: 31 }, (_, index) => ({
    id: String(index + 1),
    label: `Todo dia ${index + 1}`,
  })),
]

// Categorical palette validated for the dark panel surface (dataviz validator, CVD-safe in this
// order). The colour belongs to the category, not to its position in the ranking.
const palette = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#0ca30c',
  '#9085e9',
  '#e66767',
]
const otherColor = '#8d8794'
const categorySlot = [
  'Aluguel',
  'Contas',
  'Produtos',
  'Equipe',
  'Impostos',
  'Serviços',
  'Marketing',
  'Equipamentos',
]
const incomeColor = palette[0]
const expenseColor = palette[1]

function shiftMonth(month: string, delta: number) {
  const [year, value] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, value - 1 + delta, 1))
  return date.toISOString().slice(0, 7)
}

/** Where a bill stands in the month being viewed. */
function billState(bill: Bill, month: string, today: string) {
  if (bill.entryId) return { tone: 'on', label: `Paga · ${money(bill.paidCents ?? 0)}` }
  const current = today.slice(0, 7)
  if (month < current) return { tone: 'warn', label: 'Não lançada' }
  if (bill.dueDay == null) return { tone: 'info', label: 'Sem vencimento' }
  const [year, value] = month.split('-').map(Number)
  const day = Math.min(bill.dueDay, new Date(year, value, 0).getDate())
  if (month > current) return { tone: 'info', label: `Vence dia ${day}` }
  const left = day - Number(today.slice(8, 10))
  if (left < 0) return { tone: 'late', label: `Atrasada · venceu dia ${day}` }
  if (left === 0) return { tone: 'warn', label: 'Vence hoje' }
  if (left <= 3) return { tone: 'warn', label: `Vence em ${left} ${left === 1 ? 'dia' : 'dias'}` }
  return { tone: 'info', label: `Vence dia ${day}` }
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
  const [settle, setSettle] = useState<Bill | null>(null)
  const [editBill, setEditBill] = useState<Bill | 'new' | null>(null)
  const [setup, setSetup] = useState(false)
  const [asking, setAsking] = useState<Pending | null>(null)
  const [show, setShow] = useState<'all' | 'income' | 'expense'>('all')
  // Starts at 0: arriving here through a "+" elsewhere must open the form on mount.
  const lastSignal = useRef(0)

  useEffect(() => {
    if (createSignal === lastSignal.current) return
    lastSignal.current = createSignal

    setForm('income')
  }, [createSignal])

  // First visit: with no bill and no expense yet, offer the guided setup once per browser.
  const data = finance.data
  const empty = Boolean(data && !(data.bills ?? []).length && !data.totals.expenseCents)
  const [checkedSetup, setCheckedSetup] = useState(false)
  if (empty && !checkedSetup) {
    setCheckedSetup(true)
    try {
      if (!window.localStorage.getItem(`luminix:finance-setup:${clinicId}`)) setSetup(true)
    } catch {
      // No storage (private mode): the setup stays one click away in "Configurar contas".
    }
  }
  useEffect(() => {
    if (!empty) return
    try {
      window.localStorage.setItem(`luminix:finance-setup:${clinicId}`, 'offered')
    } catch {
      // Same as above.
    }
  }, [empty, clinicId])

  if (finance.error && !data) return <LoadError message={finance.error} onRetry={finance.reload} />
  if (!data) return <SettingsSkeleton cards={2} />
  const [year] = data.month.split('-').map(Number)
  const isCurrent = data.month === data.today.slice(0, 7)
  const bills = data.bills ?? []
  const openBills = bills.filter((bill) => !bill.entryId)
  const openCents = openBills.reduce((sum, bill) => sum + bill.amountCents, 0)
  const alerts = isCurrent
    ? openBills.filter((bill) =>
        ['late', 'warn'].includes(billState(bill, data.month, data.today).tone),
      )
    : []
  const fixed = data.totals.expenseFixedCents ?? 0
  const fromAppointments = data.totals.incomeAppointmentsCents ?? 0
  const entries = data.entries.filter((entry) => show === 'all' || entry.kind === show)
  const done = (text: string) => {
    setNotice({ kind: 'ok', text })
    finance.reload()
  }

  async function launch(item: Pending, cents = item.priceCents) {
    setBusy(item.appointmentId)
    setNotice(null)
    try {
      await api.post('finance/entries', {
        kind: 'income',
        amountCents: cents,
        occurredOn: item.startsAt.slice(0, 10),
        description: `${item.service} · ${item.client}`,
        category: 'Atendimentos',
        method,
        appointmentId: item.appointmentId,
      })
      setAsking(null)
      done(`${money(cents)} lançado como entrada.`)
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
      done('Lançamento desfeito.')
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
          {monthOf(data.month)} de {year}
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

      <KpiCards
        label="Resumo do mês"
        items={[
          {
            id: 'income',
            label: 'Entradas',
            value: money(data.totals.incomeCents),
            hint: `${money(fromAppointments)} de atendimentos`,
            icon: <ArrowUpCircle size={22} />,
            tone: 'good',
          },
          {
            id: 'expense',
            label: 'Saídas',
            value: money(data.totals.expenseCents),
            hint: `${money(fixed)} fixas · ${money(data.totals.expenseCents - fixed)} variáveis`,
            icon: <ArrowDownCircle size={22} />,
            tone: 'warn',
          },
          {
            id: 'balance',
            label: 'Saldo do mês',
            value: money(data.totals.balanceCents),
            hint: 'Entradas menos saídas',
            icon: <Scale size={22} />,
          },
          {
            id: 'forecast',
            label: 'Ainda vai entrar',
            value: money(data.forecast.cents),
            hint: `${data.forecast.appointments} ${data.forecast.appointments === 1 ? 'atendimento marcado' : 'atendimentos marcados'}`,
            icon: <CalendarClock size={22} />,
            tone: 'info',
          },
          {
            id: 'bills',
            label: 'Contas a pagar',
            value: money(openCents),
            hint: openBills.length
              ? `${openBills.length} ${openBills.length === 1 ? 'conta em aberto' : 'contas em aberto'}`
              : 'Nenhuma em aberto',
            icon: <Receipt size={22} />,
            tone: alerts.length ? 'warn' : 'info',
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

      {alerts.length ? (
        <div className="fin-alert" role="status">
          <CircleAlert size={20} aria-hidden />
          <div>
            <strong>
              {alerts.length === 1
                ? 'Uma conta pede atenção'
                : `${alerts.length} contas pedem atenção`}
            </strong>
            <span>
              {alerts
                .map(
                  (bill) =>
                    `${bill.name} (${billState(bill, data.month, data.today).label.toLowerCase()})`,
                )
                .join(' · ')}
            </span>
          </div>
        </div>
      ) : null}

      {data.pending.length ? (
        <SettingsCard
          icon={<HandCoins size={20} />}
          title="Atendimentos a receber"
          description="Concluídos e ainda sem entrada. Avaliações e cortesias gratuitas não aparecem aqui."
          help={{
            title: 'Por que lançar?',
            text: 'Assim o financeiro mostra o que realmente entrou. O valor vem do preço guardado no agendamento, já com promoção. Serviços “a combinar” pedem o valor acertado. Se a cliente pagou outro valor, use “Nova entrada”.',
          }}
          badge={
            <SelectField
              className="biz-method"
              ariaLabel="Forma de pagamento"
              value={method}
              onChange={setMethod}
              options={methodOptions}
            />
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
                  {item.quote ? (
                    <Button size="sm" variant="secondary" onPress={() => setAsking(item)}>
                      <Pencil size={14} aria-hidden /> A combinar: informar valor
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      isDisabled={busy === item.appointmentId}
                      onPress={() => void launch(item)}
                    >
                      <Plus size={14} aria-hidden /> Lançar {money(item.priceCents)}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SettingsCard>
      ) : null}

      <div className="fin-grid">
        <SettingsCard
          icon={<PiggyBank size={20} />}
          title="Para onde foi o dinheiro"
          description="Saídas do mês por categoria."
        >
          <ExpenseDonut rows={data.expenseCategories ?? []} />
        </SettingsCard>
        <SettingsCard
          icon={<Wallet size={20} />}
          title="Entradas e saídas"
          description="Os últimos seis meses, lado a lado."
        >
          <TrendBars key={data.month} rows={data.trend ?? []} />
        </SettingsCard>
      </div>

      <SettingsCard
        icon={<Receipt size={20} />}
        title="Contas fixas do mês"
        description="Despesas que se repetem: aluguel, luz, internet. No dia, é só dar baixa com o valor que veio."
        help={{
          title: 'Como funcionam as contas fixas?',
          text: 'Você cadastra a conta uma vez, com um valor médio e o dia do vencimento. Todo mês ela aparece aqui em aberto. Ao dar baixa, o valor vem preenchido e você ajusta para o que realmente pagou. Perto do vencimento, o painel avisa.',
        }}
        badge={
          <div className="biz-actions">
            {!bills.length ? (
              <Button size="sm" onPress={() => setSetup(true)}>
                <Settings2 size={15} aria-hidden /> Configurar contas
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" onPress={() => setEditBill('new')}>
              <Plus size={15} aria-hidden /> Nova conta
            </Button>
          </div>
        }
      >
        {bills.length ? (
          <ul className="biz-list">
            {bills.map((bill) => {
              const state = billState(bill, data.month, data.today)
              return (
                <li key={bill.id} className={state.tone === 'late' ? 'is-alert' : undefined}>
                  <div className="biz-row-main">
                    <strong>{bill.name}</strong>
                    <span className="biz-row-meta">
                      {bill.category}
                      {bill.amountCents ? ` · cerca de ${money(bill.amountCents)}` : ''}
                    </span>
                  </div>
                  <span className={`fin-state is-${state.tone}`}>{state.label}</span>
                  <div className="biz-actions">
                    {!bill.entryId ? (
                      <Button size="sm" onPress={() => setSettle(bill)}>
                        <Check size={14} aria-hidden /> Dar baixa
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Editar ${bill.name}`}
                      onPress={() => setEditBill(bill)}
                    >
                      <Pencil size={14} aria-hidden /> Editar
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="biz-empty">
            <Receipt size={24} aria-hidden />
            <p>
              Nenhuma conta fixa ainda. Em “Configurar contas” você escolhe as mais comuns e já
              deixa valor médio e vencimento prontos.
            </p>
          </div>
        )}
      </SettingsCard>

      <div className="fin-grid">
        <SettingsCard
          icon={<UsersRound size={20} />}
          title="De onde veio"
          description="O que as clientes pagaram neste mês."
        >
          <div className="fin-split">
            <div>
              <span>Atendimentos</span>
              <strong>{money(fromAppointments)}</strong>
            </div>
            <div>
              <span>Outras entradas</span>
              <strong>{money(data.totals.incomeCents - fromAppointments)}</strong>
            </div>
            <div>
              <span>Cortesias e avaliações</span>
              <strong>{data.courtesyAppointments ?? 0}</strong>
            </div>
          </div>
          {data.topClients?.length ? (
            <ol className="fin-rank">
              {data.topClients.map((row) => (
                <li key={row.client}>
                  <span>{row.client}</span>
                  <small>
                    {row.visits} {row.visits === 1 ? 'pagamento' : 'pagamentos'}
                  </small>
                  <strong>{money(row.cents)}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="settings-muted">
              Os pagamentos de atendimentos lançados neste mês aparecem aqui, por cliente.
            </p>
          )}
        </SettingsCard>
        <SettingsCard
          icon={<Package size={20} />}
          title="Produtos e estoque"
          description="Estimativa a partir do custo cadastrado em Estoque."
        >
          {data.stock?.items ? (
            <>
              <div className="fin-split">
                <div>
                  <span>Usado no mês</span>
                  <strong>{money(data.stock.usedCents)}</strong>
                </div>
                <div>
                  <span>Parado na prateleira</span>
                  <strong>{money(data.stock.valueCents)}</strong>
                </div>
                <div>
                  <span>Para repor o mínimo</span>
                  <strong>{money(data.stock.restockCents)}</strong>
                </div>
              </div>
              <p className="settings-muted">
                {data.stock.low
                  ? `${data.stock.low} ${data.stock.low === 1 ? 'produto está' : 'produtos estão'} no mínimo ou abaixo. `
                  : 'Nenhum produto abaixo do mínimo. '}
                {data.stock.withoutCost
                  ? `${data.stock.withoutCost} sem custo cadastrado ${data.stock.withoutCost === 1 ? 'fica' : 'ficam'} fora desta conta.`
                  : ''}
              </p>
            </>
          ) : (
            <p className="settings-muted">
              Cadastre produtos com custo em Estoque para ver aqui quanto foi usado no mês e quanto
              custa repor.
            </p>
          )}
        </SettingsCard>
      </div>

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
        <div className="biz-chips" role="group" aria-label="Mostrar lançamentos">
          {(
            [
              ['all', 'Todos'],
              ['income', 'Entradas'],
              ['expense', 'Saídas'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={show === id} onClick={() => setShow(id)}>
              {label}
            </button>
          ))}
        </div>
        {entries.length ? (
          <ul className="biz-list">
            {entries.map((entry) => (
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
                  {entry.appointmentId || entry.billId ? (
                    <div className="biz-tags">
                      <StatusPill tone="info">
                        {entry.appointmentId ? 'Do atendimento' : 'Conta fixa'}
                      </StatusPill>
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
              Nenhum lançamento aqui. Use “Nova entrada”, “Nova saída” ou dê baixa nas contas fixas.
            </p>
          </div>
        )}
      </SettingsCard>

      {form ? (
        <EntryForm
          api={api}
          kind={form}
          today={data.today}
          onClose={(message) => {
            setForm(null)
            if (message) done(message)
          }}
        />
      ) : null}
      {settle ? (
        <SettleBill
          api={api}
          bill={settle}
          month={data.month}
          today={data.today}
          onClose={(message) => {
            setSettle(null)
            if (message) done(message)
          }}
        />
      ) : null}
      {editBill ? (
        <BillForm
          api={api}
          bill={editBill === 'new' ? null : editBill}
          onClose={(message) => {
            setEditBill(null)
            if (message) done(message)
          }}
        />
      ) : null}
      {setup ? (
        <BillSetup
          api={api}
          onClose={(message) => {
            setSetup(false)
            if (message) done(message)
          }}
        />
      ) : null}
      {asking ? (
        <AskAmount
          item={asking}
          busy={busy === asking.appointmentId}
          onClose={() => setAsking(null)}
          onConfirm={(cents) => void launch(asking, cents)}
        />
      ) : null}
    </div>
  )
}

/** Share of each expense category in the month; the legend doubles as the table view. */
function ExpenseDonut({ rows }: { rows: CategoryRow[] }) {
  const [scope, setScope] = useState<'all' | 'fixed' | 'variable'>('all')
  const [hover, setHover] = useState('')
  const value = (row: CategoryRow) =>
    scope === 'all' ? row.cents : scope === 'fixed' ? row.fixedCents : row.cents - row.fixedCents
  // Known categories keep their colour; the rest take the free slots in alphabetical order,
  // and whatever does not fit folds into "Outros".
  const unknown = rows
    .map((row) => row.category)
    .filter((name) => !categorySlot.includes(name) && name !== 'Outros')
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const colorOf = (name: string) => {
    const known = categorySlot.indexOf(name)
    if (known >= 0) return palette[known]
    const slot = palette[categorySlot.length + unknown.indexOf(name)]
    return name !== 'Outros' && slot ? slot : otherColor
  }
  const parts: { name: string; cents: number; color: string }[] = []
  for (const row of rows) {
    const cents = value(row)
    if (cents <= 0) continue
    const color = colorOf(row.category)
    const name = color === otherColor ? 'Outros' : row.category
    const same = parts.find((part) => part.name === name)
    if (same) same.cents += cents
    else parts.push({ name, cents, color })
  }
  parts.sort((a, b) => b.cents - a.cents)
  const total = parts.reduce((sum, part) => sum + part.cents, 0)
  const radius = 60
  const length = 2 * Math.PI * radius
  const gap = parts.length > 1 ? 3 : 0
  const arcs = parts.map((part, index) => ({
    ...part,
    size: (part.cents / total) * length,
    start: (parts.slice(0, index).reduce((sum, item) => sum + item.cents, 0) / total) * length,
  }))
  const focused = parts.find((part) => part.name === hover)

  return (
    <div className="fin-donut">
      <div className="biz-chips" role="group" aria-label="Tipo de saída">
        {(
          [
            ['all', 'Todas'],
            ['fixed', 'Fixas'],
            ['variable', 'Variáveis'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={scope === id} onClick={() => setScope(id)}>
            {label}
          </button>
        ))}
      </div>
      {total ? (
        <div className="fin-donut-body">
          <svg
            viewBox="0 0 160 160"
            role="img"
            aria-label={`Saídas por categoria, total ${money(total)}`}
          >
            <circle cx="80" cy="80" r={radius} fill="none" stroke="#ffffff14" strokeWidth="20" />
            {arcs.map((arc) => (
              <circle
                key={arc.name}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={hover === arc.name ? 24 : 20}
                strokeDasharray={`${Math.max(arc.size - gap, 0.5)} ${length}`}
                strokeDashoffset={-arc.start}
                transform="rotate(-90 80 80)"
                opacity={hover && hover !== arc.name ? 0.35 : 1}
                onMouseEnter={() => setHover(arc.name)}
                onMouseLeave={() => setHover('')}
              />
            ))}
            <text x="80" y="76" textAnchor="middle" className="fin-donut-label">
              {focused?.name ?? 'Total'}
            </text>
            <text x="80" y="95" textAnchor="middle" className="fin-donut-total">
              {money(focused?.cents ?? total)}
            </text>
          </svg>
          <ul className="fin-legend">
            {parts.map((part) => (
              <li
                key={part.name}
                className={hover === part.name ? 'is-hover' : undefined}
                onMouseEnter={() => setHover(part.name)}
                onMouseLeave={() => setHover('')}
              >
                <i style={{ background: part.color }} aria-hidden />
                <span>{part.name}</span>
                <small>{Math.round((part.cents / total) * 100)}%</small>
                <strong>{money(part.cents)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="settings-muted">
          {scope === 'all'
            ? 'Nenhuma saída lançada neste mês. Quando houver, o gráfico mostra o peso de cada categoria.'
            : 'Nada deste tipo neste mês.'}
        </p>
      )}
    </div>
  )
}

/** Income and expense of the last six months on one shared scale. */
function TrendBars({ rows }: { rows: TrendRow[] }) {
  const [hover, setHover] = useState(rows.length - 1)
  const max = Math.max(1, ...rows.flatMap((row) => [row.incomeCents, row.expenseCents]))
  const shown = rows[hover] ?? rows[rows.length - 1]
  if (!shown || !rows.some((row) => row.incomeCents || row.expenseCents))
    return (
      <p className="settings-muted">
        Ainda sem lançamentos. Conforme os meses passam, a comparação aparece aqui.
      </p>
    )
  return (
    <div className="fin-trend">
      <ul className="fin-legend is-inline">
        <li>
          <i style={{ background: incomeColor }} aria-hidden />
          <span>Entradas</span>
          <strong>{money(shown.incomeCents)}</strong>
        </li>
        <li>
          <i style={{ background: expenseColor }} aria-hidden />
          <span>Saídas</span>
          <strong>{money(shown.expenseCents)}</strong>
        </li>
        <li>
          <span>
            {monthOf(shown.month)} · saldo {money(shown.incomeCents - shown.expenseCents)}
          </span>
        </li>
      </ul>
      <div className="fin-bars" role="list" aria-label="Entradas e saídas por mês">
        {rows.map((row, index) => (
          <button
            key={row.month}
            type="button"
            role="listitem"
            className={hover === index ? 'is-hover' : undefined}
            aria-label={`${monthOf(row.month)}: entradas ${money(row.incomeCents)}, saídas ${money(row.expenseCents)}`}
            onMouseEnter={() => setHover(index)}
            onFocus={() => setHover(index)}
          >
            <span className="fin-bars-plot" aria-hidden>
              <i style={{ height: `${(row.incomeCents / max) * 100}%`, background: incomeColor }} />
              <i
                style={{ height: `${(row.expenseCents / max) * 100}%`, background: expenseColor }}
              />
            </span>
            <small>{monthOf(row.month).slice(0, 3)}</small>
          </button>
        ))}
      </div>
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

  async function save() {
    const cents = parseMoney(amount)
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
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={type === 'income' ? 'Nova entrada' : 'Nova saída'}
      subtitle={
        type === 'expense'
          ? 'Gasto avulso ou imprevisto. Contas que se repetem ficam em “Contas fixas”.'
          : undefined
      }
      footer={
        <>
          <Button variant="secondary" onPress={() => onClose()}>
            Cancelar
          </Button>
          <Button onPress={() => void save()} isDisabled={saving}>
            {saving ? 'Salvando…' : 'Registrar'}
          </Button>
        </>
      }
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
            onClick={() => {
              setType(id)
              setCategory(id === 'expense' ? 'Produtos' : 'Atendimentos')
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="manager-form-grid">
        <MoneyField label="Valor" isRequired autoFocus value={amount} onChange={setAmount} />
        <DateInputField
          label="Data"
          value={date}
          max={today}
          onChange={(value) => setDate(value || today)}
        />
        <TextInputField
          className="manager-field-wide"
          label="Descrição"
          isRequired
          maxLength={160}
          value={description}
          placeholder={
            type === 'income' ? 'Ex.: Venda de produto' : 'Ex.: Conserto do ar-condicionado'
          }
          onChange={setDescription}
        />
        <ComboField
          label="Categoria"
          value={category}
          maxLength={60}
          suggestions={
            type === 'expense'
              ? expenseCategories
              : ['Atendimentos', 'Produtos', 'Pacotes', 'Outros']
          }
          help={
            <HelpTip title="Para que serve?">
              Agrupa os lançamentos no gráfico e nos relatórios.
            </HelpTip>
          }
          onChange={setCategory}
        />
        <SelectField label="Forma" value={method} onChange={setMethod} options={methodOptions} />
      </div>
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

/** "Dar baixa": the expected amount comes filled in and is adjusted to what was really paid. */
function SettleBill({
  api,
  bill,
  month,
  today,
  onClose,
}: {
  api: ClinicApi
  bill: Bill
  month: string
  today: string
  onClose: (message?: string) => void
}) {
  const [amount, setAmount] = useState(bill.amountCents ? moneyInput(bill.amountCents) : '')
  const [date, setDate] = useState(today.startsWith(month) ? today : `${month}-01`)
  const [method, setMethod] = useState('pix')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    const cents = parseMoney(amount)
    if (!cents) {
      setError('Informe o valor pago.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.post('finance/entries', {
        kind: 'expense',
        amountCents: cents,
        occurredOn: date,
        description: bill.name,
        category: bill.category,
        method,
        billId: bill.id,
        billMonth: month,
      })
      onClose(`${bill.name}: ${money(cents)} lançado como saída.`)
    } catch {
      setError('Não foi possível dar baixa. Talvez já tenha sido lançada neste mês.')
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Dar baixa: ${bill.name}`}
      subtitle={`Conta de ${monthOf(month)}. Ajuste o valor para o que veio na conta.`}
      footer={
        <>
          <Button variant="secondary" onPress={() => onClose()}>
            Cancelar
          </Button>
          <Button onPress={() => void save()} isDisabled={saving}>
            {saving ? 'Salvando…' : 'Confirmar pagamento'}
          </Button>
        </>
      }
    >
      <div className="manager-form-grid">
        <MoneyField label="Valor pago" isRequired autoFocus value={amount} onChange={setAmount} />
        <DateInputField
          label="Pago em"
          value={date}
          max={today}
          onChange={(value) => setDate(value || today)}
        />
        <SelectField label="Forma" value={method} onChange={setMethod} options={methodOptions} />
      </div>
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

function BillForm({
  api,
  bill,
  onClose,
}: {
  api: ClinicApi
  bill: Bill | null
  onClose: (message?: string) => void
}) {
  const [name, setName] = useState(bill?.name ?? '')
  const [category, setCategory] = useState(bill?.category ?? 'Contas')
  const [amount, setAmount] = useState(bill?.amountCents ? moneyInput(bill.amountCents) : '')
  const [dueDay, setDueDay] = useState(bill?.dueDay ? String(bill.dueDay) : 'none')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(status: 'active' | 'archived' = 'active') {
    if (!name.trim() || !category.trim()) {
      setError('Dê um nome e uma categoria para a conta.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.put(`finance/bills/${bill?.id ?? crypto.randomUUID()}`, {
        name: name.trim(),
        category: category.trim(),
        amountCents: parseMoney(amount) ?? 0,
        dueDay: dueDay === 'none' ? null : Number(dueDay),
        status,
      })
      onClose(
        status === 'archived'
          ? `${name.trim()} saiu das contas fixas. Os lançamentos antigos ficam.`
          : bill
            ? 'Conta atualizada.'
            : `${name.trim()} entrou nas contas fixas.`,
      )
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={bill ? `Editar ${bill.name}` : 'Nova conta fixa'}
      subtitle="Aparece todo mês em aberto, com aviso perto do vencimento."
      footer={
        <>
          {bill ? (
            <Button
              variant="ghost"
              className="qm-foot-start"
              isDisabled={saving}
              onPress={() => void save('archived')}
            >
              Remover conta
            </Button>
          ) : null}
          <Button variant="secondary" onPress={() => onClose()}>
            Cancelar
          </Button>
          <Button onPress={() => void save()} isDisabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      {!bill ? (
        <div className="biz-chips" role="group" aria-label="Sugestões">
          {billTemplates.slice(0, 6).map((template) => (
            <button
              key={template.name}
              type="button"
              aria-pressed={name === template.name}
              onClick={() => {
                setName(template.name)
                setCategory(template.category)
                setDueDay(template.dueDay ? String(template.dueDay) : 'none')
              }}
            >
              {template.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="manager-form-grid">
        <TextInputField
          label="Nome"
          isRequired
          maxLength={80}
          value={name}
          placeholder="Ex.: Aluguel"
          onChange={setName}
        />
        <ComboField
          label="Categoria"
          value={category}
          maxLength={60}
          suggestions={expenseCategories}
          onChange={setCategory}
        />
        <MoneyField
          label="Valor médio"
          description="Só uma estimativa: no dia você ajusta."
          value={amount}
          onChange={setAmount}
        />
        <SelectField label="Vencimento" value={dueDay} onChange={setDueDay} options={dueOptions} />
      </div>
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

/** First-visit setup in two steps: pick the usual bills, then give each a value and a due day. */
function BillSetup({ api, onClose }: { api: ClinicApi; onClose: (message?: string) => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [chosen, setChosen] = useState<string[]>(['Aluguel', 'Energia (luz)', 'Água'])
  const [values, setValues] = useState<Record<string, { amount: string; dueDay: string }>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const picked = billTemplates.filter((template) => chosen.includes(template.name))
  const valueOf = (template: (typeof billTemplates)[number]) =>
    values[template.name] ?? {
      amount: '',
      dueDay: template.dueDay ? String(template.dueDay) : 'none',
    }

  async function save() {
    setSaving(true)
    setError('')
    try {
      for (const template of picked) {
        const value = valueOf(template)
        await api.put(`finance/bills/${crypto.randomUUID()}`, {
          name: template.name,
          category: template.category,
          amountCents: parseMoney(value.amount) ?? 0,
          dueDay: value.dueDay === 'none' ? null : Number(value.dueDay),
          status: 'active',
        })
      }
      onClose(
        `${picked.length} ${picked.length === 1 ? 'conta fixa criada' : 'contas fixas criadas'}. Elas aparecem todo mês para dar baixa.`,
      )
    } catch {
      setError('Não foi possível salvar todas as contas. Confira a lista e tente de novo.')
      setSaving(false)
    }
  }

  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title="Vamos organizar as contas do mês"
      subtitle={
        step === 1
          ? 'Passo 1 de 2 · Marque as despesas que se repetem no seu espaço.'
          : 'Passo 2 de 2 · Um valor médio e o vencimento de cada uma. Dá para mudar depois.'
      }
      footer={
        <>
          <Button variant="ghost" className="qm-foot-start" onPress={() => onClose()}>
            Agora não
          </Button>
          {step === 2 ? (
            <Button variant="secondary" onPress={() => setStep(1)}>
              Voltar
            </Button>
          ) : null}
          {step === 1 ? (
            <Button isDisabled={!picked.length} onPress={() => setStep(2)}>
              Continuar
            </Button>
          ) : (
            <Button isDisabled={saving} onPress={() => void save()}>
              {saving ? 'Salvando…' : 'Criar contas'}
            </Button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <ul className="fin-setup">
          {billTemplates.map((template) => {
            const selected = chosen.includes(template.name)
            return (
              <li key={template.name}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  className="filter-option"
                  onClick={() =>
                    setChosen(
                      selected
                        ? chosen.filter((name) => name !== template.name)
                        : [...chosen, template.name],
                    )
                  }
                >
                  <span className="filter-box" aria-hidden>
                    {selected ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                  <span>{template.name}</span>
                  <small>{template.category}</small>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <ul className="fin-setup is-values">
          {picked.map((template) => {
            const value = valueOf(template)
            const set = (patch: Partial<typeof value>) =>
              setValues({ ...values, [template.name]: { ...value, ...patch } })
            return (
              <li key={template.name}>
                <strong>{template.name}</strong>
                <MoneyField
                  ariaLabel={`Valor médio de ${template.name}`}
                  placeholder="Valor médio"
                  value={value.amount}
                  onChange={(amount) => set({ amount })}
                />
                <SelectField
                  ariaLabel={`Vencimento de ${template.name}`}
                  value={value.dueDay}
                  onChange={(dueDay) => set({ dueDay })}
                  options={dueOptions}
                />
              </li>
            )
          })}
        </ul>
      )}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

/** A "a combinar" service was done: ask how much was agreed before recording it. */
function AskAmount({
  item,
  busy,
  onClose,
  onConfirm,
}: {
  item: Pending
  busy: boolean
  onClose: () => void
  onConfirm: (cents: number) => void
}) {
  const [amount, setAmount] = useState('')
  const cents = parseMoney(amount)
  return (
    <QuickModal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Qual foi o valor combinado?"
      subtitle={`${item.service} · ${item.client}`}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            Cancelar
          </Button>
          <Button isDisabled={!cents || busy} onPress={() => cents && onConfirm(cents)}>
            {busy ? 'Lançando…' : 'Lançar entrada'}
          </Button>
        </>
      }
    >
      <MoneyField label="Valor recebido" isRequired autoFocus value={amount} onChange={setAmount} />
    </QuickModal>
  )
}
