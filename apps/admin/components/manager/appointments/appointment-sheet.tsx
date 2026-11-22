'use client'

import { Button, Popover, Spinner } from '@heroui/react'
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  Camera,
  Check,
  ChevronDown,
  CircleDollarSign,
  History,
  Layers,
  LogIn,
  MessageCircle,
  Minus,
  Plus,
  RotateCcw,
  UserRound,
  UserX,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { ClientAvatar } from '../client-photo'
import {
  DateInputField,
  MoneyField,
  SelectField,
  TextAreaField,
  TimeInputField,
} from '@/components/ui/fields'
import { formatBrPhone } from '@/lib/phone'
import { amount, unitShort } from '@/lib/stock'
import { appointmentStatus, dateBr, money, moneyInput, parseMoney } from '../business/format'
import { whatsapp } from '../business/format'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { QuickModal } from '../quick-modal'
import {
  clock,
  confirmationText,
  dayLabel,
  isFree,
  isOpen,
  isQuote,
  localDate,
  reminderText,
  warningCopy,
  type AppointmentAccess,
  type AppointmentView,
  type BookingWarning,
} from './model'

type ClientDetail = {
  client: {
    contact_phone: string | null
    contact_email: string | null
    birth_date: string | null
    notes: string | null
  }
  history: { id: string; starts_at: string; status: string; service_name?: string }[]
}

type Supply = {
  itemId: string
  name: string
  unit: string
  quantity: number
  stock: number
  consumed: number | null
}

const methods = [
  { id: 'pix', label: 'Pix' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'credit', label: 'Cartão de crédito' },
  { id: 'debit', label: 'Cartão de débito' },
  { id: 'transfer', label: 'Transferência' },
  { id: 'other', label: 'Outro' },
]

function age(birth: string) {
  const [year, month, day] = birth.slice(0, 10).split('-').map(Number)
  const now = new Date()
  const had = now.getMonth() + 1 > month || (now.getMonth() + 1 === month && now.getDate() >= day)
  return now.getFullYear() - year - (had ? 0 : 1)
}

/** Big action card (used by the client sheet). */
export function Action({
  icon: Icon,
  title,
  hint,
  tone,
  href,
  disabled,
  onPress,
}: {
  icon: LucideIcon
  title: string
  hint: string
  tone?: 'good' | 'warn' | 'danger' | 'whats'
  href?: string
  disabled?: boolean
  onPress?: () => void
}) {
  const body = (
    <>
      <span className="apt-action-icon">
        <Icon size={22} strokeWidth={1.75} aria-hidden />
      </span>
      <span className="apt-action-copy">
        <strong>{title}</strong>
        <small>{hint}</small>
      </span>
    </>
  )
  const className = `apt-action${tone ? ` is-${tone}` : ''}`
  return href ? (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <button type="button" className={className} disabled={disabled} onClick={onPress}>
      {body}
    </button>
  )
}

export function Fact({
  label,
  children,
  tone,
}: {
  label: string
  children: ReactNode
  tone?: string
}) {
  return (
    <div className={`apt-fact${tone ? ` is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  )
}

/** Collapsible row of the sheet ("Ver dados do cliente", "Histórico recente"). */
function Fold({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon
  title: ReactNode
  children: ReactNode
}) {
  return (
    <details className="sh-fold">
      <summary>
        <Icon size={19} aria-hidden />
        <span>{title}</span>
        <ChevronDown className="sh-chevron" size={18} aria-hidden />
      </summary>
      <div className="sh-fold-body">{children}</div>
    </details>
  )
}

/** Paid, paid in part or still to receive. */
function payment(item: AppointmentView) {
  const price = item.priceCents ?? 0
  const paid = item.paidCents ?? (item.paid ? price : 0)
  if (isFree(item)) return { tone: 'on', label: 'Sem cobrança', remaining: 0 }
  if (item.paid) return { tone: 'on', label: 'Pago', remaining: 0 }
  if (paid > 0 && price > paid)
    return {
      tone: 'part',
      label: `Parcial · faltam ${money(price - paid)}`,
      remaining: price - paid,
    }
  return { tone: 'pending', label: 'A receber', remaining: price }
}

/**
 * One appointment as a small profile: who, when, how much, and the next step. Details of the
 * client and the history fold away; the rare actions hide behind the WhatsApp button and the
 * cancel step.
 */
export function AppointmentSheet({
  api,
  item,
  access,
  today,
  onClose,
  onChanged,
  onOpenClient,
}: {
  api: ClinicApi
  item: AppointmentView | null
  access: AppointmentAccess
  /** Clinic "today" as YYYY-MM-DD. */
  today: string
  onClose: () => void
  /** Something was saved; the caller reloads its list and may show the message. */
  onChanged: (message: string) => void
  onOpenClient?: (client: { id: string; name: string }) => void
}) {
  // Keeps the last appointment on screen while the pop-up animates out.
  const [shown, setShown] = useState(item)
  if (item && item !== shown) setShown(item)
  const status = shown ? (appointmentStatus[shown.status] ?? appointmentStatus.confirmed) : null
  return (
    <QuickModal
      isOpen={Boolean(item)}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className="apt-sheet sh"
      title={
        shown && status ? (
          <span className="sh-head">
            <ClientAvatar
              name={shown.client}
              photoUrl={shown.photoUrl}
              largeUrl={shown.photoLargeUrl}
              account={shown.accountPhoto ? { api, clientId: shown.clientId } : null}
              size="lg"
              viewable
            />
            <span className="sh-who">{shown.client}</span>
            <span
              className={`sh-status is-${shown.checkedInAt && isOpen(shown.status) ? 'here' : shown.status}`}
            >
              {shown.checkedInAt && isOpen(shown.status) ? (
                <>
                  <LogIn size={15} aria-hidden /> Chegou
                </>
              ) : (
                <>
                  {shown.status === 'confirmed' || shown.status === 'completed' ? (
                    <Check size={15} aria-hidden />
                  ) : null}
                  {status.label}
                </>
              )}
            </span>
            <WhatsAppMenu item={shown} today={today} />
          </span>
        ) : (
          'Atendimento'
        )
      }
    >
      {shown ? (
        <SheetBody
          key={shown.id}
          api={api}
          item={shown}
          access={access}
          today={today}
          onClose={onClose}
          onChanged={onChanged}
          onOpenClient={onOpenClient}
        />
      ) : null}
    </QuickModal>
  )
}

/**
 * Confirmation and reminder by WhatsApp. The dot shows where it stands: green when the client
 * confirmed, amber while it waits. Messages open ready in WhatsApp (no automatic sending yet).
 */
function WhatsAppMenu({ item, today }: { item: AppointmentView; today: string }) {
  const phone = item.phone
  const open = isOpen(item.status)
  if (!phone || !open) return null
  const confirmed = item.status === 'confirmed'
  return (
    <Popover>
      <Button
        isIconOnly
        variant="ghost"
        className="sh-whats"
        aria-label={confirmed ? 'WhatsApp: presença confirmada' : 'WhatsApp: confirmação pendente'}
      >
        <MessageCircle size={21} aria-hidden />
        <i className={confirmed ? 'is-ok' : 'is-wait'} aria-hidden />
      </Button>
      <Popover.Content className="filter-popover sh-whats-menu" placement="bottom end">
        <Popover.Dialog aria-label="WhatsApp">
          <p className="sh-whats-state">
            {confirmed ? (
              <>
                <Check size={15} aria-hidden /> Presença confirmada
              </>
            ) : (
              <>
                <BellRing size={15} aria-hidden /> Aguardando confirmação
              </>
            )}
          </p>
          <a
            className="filter-option"
            href={whatsapp(phone, confirmationText(item, today)) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={17} aria-hidden />
            <span>{confirmed ? 'Pedir confirmação de novo' : 'Pedir confirmação'}</span>
          </a>
          <a
            className="filter-option"
            href={whatsapp(phone, reminderText(item, today)) ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BellRing size={17} aria-hidden />
            <span>Enviar lembrete</span>
          </a>
          <a
            className="filter-option"
            href={whatsapp(phone, '') ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
          >
            <UserRound size={17} aria-hidden />
            <span>Abrir conversa</span>
          </a>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

function SheetBody({
  api,
  item,
  access,
  today,
  onClose,
  onChanged,
  onOpenClient,
}: {
  api: ClinicApi
  item: AppointmentView
  access: AppointmentAccess
  today: string
  onClose: () => void
  onChanged: (message: string) => void
  onOpenClient?: (client: { id: string; name: string }) => void
}) {
  const [view, setView] = useState<'main' | 'move' | 'cancel' | 'pay' | 'complete'>('main')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ClientDetail | null>(null)
  const [move, setMove] = useState({
    date: item.rentalDates
      ? (item.rentalDates.find((day) => day === localDate(item.startsAt) && day >= today) ??
        item.rentalDates.find((day) => day >= today) ??
        '')
      : localDate(item.startsAt) < today
        ? today
        : localDate(item.startsAt),
    time: clock(item.startsAt),
  })
  const [warnings, setWarnings] = useState<BookingWarning[]>([])
  const paid = payment(item)
  const [pay, setPay] = useState({
    amount: paid.remaining ? moneyInput(paid.remaining) : '',
    method: 'pix',
  })
  const [cancelNote, setCancelNote] = useState('')

  useEffect(() => {
    if (!access.openClients) return
    let active = true
    void api
      .get<ClientDetail>(`clients/${item.clientId}`)
      .then((data) => active && setDetail(data))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [api, access.openClients, item.clientId])

  const open = isOpen(item.status)
  const phone = item.phone ?? detail?.client.contact_phone ?? null
  const clientNotes = item.clientNotes ?? detail?.client.notes ?? null
  const birth = detail?.client.birth_date ?? null
  const birthday = birth ? birth.slice(5, 10) === today.slice(5, 10) : false
  const history = (detail?.history ?? []).filter((entry) => entry.id !== item.id)
  const visits = history.filter((entry) => entry.status === 'completed').length
  const attention = [
    ...(clientNotes ? [{ title: 'Ficha', text: clientNotes }] : []),
    ...(item.notes ? [{ title: 'Este atendimento', text: item.notes }] : []),
    ...item.warnings.map((code) => ({ title: 'Aviso', text: warningCopy[code] ?? code })),
  ]
  // Booked by the team: first the check-in, then completing. Booked by the client: complete.
  const needsCheckIn = open && item.bookingSource !== 'client' && !item.checkedInAt

  async function run(work: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError('')
    try {
      await work()
      onChanged(message)
      onClose()
    } catch (caught) {
      const body =
        caught instanceof ClinicApiError
          ? (caught.body as { warnings?: BookingWarning[]; error?: string })
          : null
      if (caught instanceof ClinicApiError && caught.status === 409 && body?.warnings) {
        setWarnings(body.warnings)
        return
      }
      setError(
        body?.error === 'Equipment unavailable'
          ? 'O aparelho não está disponível neste dia. Escolha outra data de locação.'
          : body?.error === 'Outside manager booking window'
            ? 'O atendimento precisa caber entre 2 horas antes da abertura e 4 horas depois do fechamento.'
            : 'Não foi possível salvar. Tente de novo.',
      )
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (next: string, message: string, note?: string) =>
    run(
      () =>
        api.put(`appointments/${item.id}/status`, {
          status: next,
          ...(note?.trim() ? { note: note.trim() } : {}),
        }),
      message,
    )

  function submitMove(confirmed: boolean) {
    if (
      !move.date ||
      move.date < today ||
      !move.time ||
      (item.rentalDates && !item.rentalDates.includes(move.date))
    ) {
      setError('Escolha a nova data e o horário.')
      return
    }
    void run(
      () =>
        api.put(`appointments/${item.id}/reschedule`, {
          localStartsAt: `${move.date}T${move.time}`,
          confirmedWarnings: confirmed ? warnings.map((warning) => warning.code) : [],
        }),
      `${item.client} remarcada para ${dateBr(move.date)} às ${move.time}.`,
    )
  }

  function submitPay() {
    const cents = parseMoney(pay.amount)
    if (!cents) {
      setError('Informe o valor recebido.')
      return
    }
    void run(
      () =>
        api.post('finance/entries', {
          kind: 'income',
          amountCents: cents,
          occurredOn: today,
          description: `${item.service} · ${item.client}`.slice(0, 160),
          category: 'Atendimentos',
          method: pay.method,
          appointmentId: item.id,
        }),
      `Pagamento de ${item.client} registrado.`,
    )
  }

  const back = (
    <button
      type="button"
      className="apt-back"
      onClick={() => {
        setView('main')
        setError('')
        setWarnings([])
      }}
    >
      <ArrowLeft size={16} aria-hidden /> Voltar
    </button>
  )

  if (view === 'complete')
    return (
      <CompleteStep
        api={api}
        item={item}
        access={access}
        today={today}
        back={back}
        onDone={(message) => {
          onChanged(message)
          onClose()
        }}
      />
    )

  return (
    <div className="apt-sheet-body sh-body">
      <div className="sh-summary">
        <span className="sh-summary-icon" aria-hidden>
          <CalendarDays size={22} />
        </span>
        <div className="sh-visit">
          <strong className="sh-when">
            {localDate(item.startsAt) === today ? 'Hoje' : dayLabel(item.startsAt)},{' '}
            {clock(item.startsAt)}
            {item.endsAt ? `–${clock(item.endsAt)}` : ''}
          </strong>
          <span>
            <Layers size={15} aria-hidden />
            {item.service}
          </span>
          {item.professional && (
            <span>
              <UserRound size={15} aria-hidden />
              {item.professional}
            </span>
          )}
        </div>
        {item.priceCents != null ? (
          <span className="sh-money">
            <strong>
              {isQuote(item) ? 'A combinar' : isFree(item) ? 'Gratuito' : money(item.priceCents)}
            </strong>
            <em className={`is-${paid.tone}`}>{paid.label}</em>
          </span>
        ) : null}
      </div>

      {item.previousStartsAt ? (
        <p className="apt-moved">
          <RotateCcw size={15} aria-hidden /> Remarcado — antes era{' '}
          {dayLabel(item.previousStartsAt)} às {clock(item.previousStartsAt)}.
        </p>
      ) : null}
      {item.status === 'canceled' && item.statusNote ? (
        <p className="apt-moved">
          <CalendarX2 size={15} aria-hidden /> Cancelado: {item.statusNote}
        </p>
      ) : null}
      {attention.length || birthday ? (
        <p className="sh-attention">
          <AlertTriangle size={16} aria-hidden />
          <span>
            {birthday ? 'Hoje é aniversário. ' : ''}
            {attention.map((entry) => entry.text).join(' · ')}
          </span>
        </p>
      ) : null}

      <div className="sh-folds">
        <Fold icon={UserRound} title="Ver dados do cliente">
          <dl className="apt-client">
            <div>
              <dt>WhatsApp</dt>
              <dd>{phone ? formatBrPhone(phone) : 'Não informado'}</dd>
            </div>
            {birth ? (
              <div>
                <dt>Nascimento</dt>
                <dd>
                  {dateBr(birth)} · {age(birth)} anos
                </dd>
              </div>
            ) : null}
            {detail?.client.contact_email ? (
              <div>
                <dt>E-mail</dt>
                <dd>{detail.client.contact_email}</dd>
              </div>
            ) : null}
          </dl>
          {attention.map((entry, index) => (
            <p key={index} className="sh-note">
              <strong>{entry.title}:</strong> {entry.text}
            </p>
          ))}
          {onOpenClient && access.openClients ? (
            <Button
              variant="secondary"
              size="sm"
              onPress={() => {
                onClose()
                onOpenClient({ id: item.clientId, name: item.client })
              }}
            >
              <UserRound size={15} aria-hidden /> Abrir ficha completa e anamnese
            </Button>
          ) : null}
        </Fold>
        {access.openClients ? (
          <Fold
            icon={History}
            title={
              <>
                Histórico recente
                {detail ? (
                  <small>
                    {' '}
                    · {visits} {visits === 1 ? 'atendimento' : 'atendimentos'}
                  </small>
                ) : null}
              </>
            }
          >
            {!detail ? (
              <Spinner size="sm" aria-label="Carregando" />
            ) : history.length ? (
              <ul className="cli-history">
                {history.slice(0, 5).map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <span>{entry.service_name ?? 'Atendimento'}</span>
                      <small>{dateBr(entry.starts_at.slice(0, 10))}</small>
                    </div>
                    <span className={`sh-mini is-${entry.status}`}>
                      {appointmentStatus[entry.status]?.label ?? entry.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="apt-hint">Primeira vez aqui.</p>
            )}
          </Fold>
        ) : null}
      </div>

      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}

      {view === 'main' && access.manage ? (
        <section className="sh-actions" aria-label="Ações do atendimento">
          {open ? (
            <>
              {needsCheckIn ? (
                <Button
                  className="sh-primary"
                  isDisabled={busy}
                  onPress={() =>
                    void run(
                      () => api.put(`appointments/${item.id}/check-in`, {}),
                      `${item.client} chegou.`,
                    )
                  }
                >
                  <Check size={20} aria-hidden /> Confirmar check-in
                </Button>
              ) : (
                <Button className="sh-primary" onPress={() => setView('complete')}>
                  <Check size={20} aria-hidden /> Concluir atendimento
                </Button>
              )}
              <div className="sh-row">
                <Button variant="secondary" onPress={() => setView('move')}>
                  <CalendarClock size={18} aria-hidden /> Remarcar
                </Button>
                <Button
                  variant="secondary"
                  isDisabled={busy}
                  onPress={() => void setStatus('no_show', `Falta registrada para ${item.client}.`)}
                >
                  <UserX size={18} aria-hidden /> Não veio
                </Button>
                <Button variant="secondary" onPress={() => setView('cancel')}>
                  <CalendarX2 size={18} aria-hidden /> Cancelar
                </Button>
              </div>
              {needsCheckIn ? (
                <p className="sh-next">
                  <Layers size={18} aria-hidden />
                  <span>
                    <strong>Depois do check-in: concluir atendimento</strong>
                    <small>Registrar pagamento, produtos usados e fotos</small>
                  </span>
                </p>
              ) : null}
            </>
          ) : (
            <div className="sh-row">
              {!paid.remaining || !access.charge || item.status === 'canceled' ? null : (
                <Button onPress={() => setView('pay')}>
                  <CircleDollarSign size={18} aria-hidden /> Registrar pagamento
                </Button>
              )}
              <Button
                variant="secondary"
                isDisabled={busy}
                onPress={() =>
                  void setStatus('confirmed', `Atendimento de ${item.client} reaberto.`)
                }
              >
                <RotateCcw size={18} aria-hidden /> Reabrir atendimento
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {view === 'move' ? (
        <section className="apt-step">
          {back}
          <h3>Para quando?</h3>
          <div className="apt-step-fields">
            {item.rentalDates ? (
              <SelectField
                label="Dia com aparelho disponível"
                value={move.date}
                options={item.rentalDates
                  .filter((day) => day >= today)
                  .map((day) => ({ id: day, label: dateBr(day) }))}
                onChange={(date) => {
                  setMove({ ...move, date })
                  setWarnings([])
                }}
              />
            ) : (
              <DateInputField
                min={today}
                label="Novo dia"
                value={move.date}
                onChange={(date) => {
                  setMove({ ...move, date })
                  setWarnings([])
                }}
              />
            )}
            <TimeInputField
              label="Novo horário"
              value={move.time}
              onChange={(time) => {
                setMove({ ...move, time })
                setWarnings([])
              }}
            />
          </div>
          {warnings.length ? (
            <div className="manager-warning-box" role="alert">
              <div>
                <AlertTriangle size={20} />
                <strong>Confira antes de remarcar</strong>
              </div>
              {warnings.map((warning) => (
                <p key={warning.code}>
                  <strong>{warning.title}.</strong> {warning.detail}
                </p>
              ))}
            </div>
          ) : null}
          <div className="apt-step-foot">
            <Button isDisabled={busy} onPress={() => submitMove(warnings.length > 0)}>
              {busy ? 'Salvando…' : warnings.length ? 'Remarcar mesmo assim' : 'Remarcar'}
            </Button>
          </div>
        </section>
      ) : null}

      {view === 'cancel' ? (
        <section className="apt-step">
          {back}
          <h3>Cancelar este atendimento?</h3>
          <p>
            O horário de {clock(item.startsAt)} fica livre e o atendimento continua no histórico
            como cancelado. Se a cliente só não apareceu, use “Não veio”; se quer outro dia, use
            “Remarcar”.
          </p>
          <TextAreaField
            label="Motivo"
            isRequired
            rows={2}
            maxLength={300}
            placeholder="Ex.: pediu para cancelar por mensagem"
            value={cancelNote}
            onChange={setCancelNote}
          />
          <div className="apt-step-foot">
            <Button variant="secondary" onPress={() => setView('move')}>
              <CalendarClock size={16} aria-hidden /> Remarcar
            </Button>
            <Button
              variant="danger"
              isDisabled={busy || !cancelNote.trim()}
              onPress={() =>
                void setStatus('canceled', `Atendimento de ${item.client} cancelado.`, cancelNote)
              }
            >
              {busy ? 'Cancelando…' : 'Cancelar atendimento'}
            </Button>
          </div>
        </section>
      ) : null}

      {view === 'pay' ? (
        <section className="apt-step">
          {back}
          <h3>Registrar pagamento</h3>
          <div className="apt-step-fields">
            <MoneyField
              label="Valor recebido"
              autoFocus={isQuote(item)}
              description={
                isQuote(item)
                  ? 'Serviço a combinar: digite o valor que foi acertado.'
                  : paid.tone === 'part'
                    ? `Faltam ${money(paid.remaining)}.`
                    : undefined
              }
              value={pay.amount}
              onChange={(value) => setPay({ ...pay, amount: value })}
            />
            <SelectField
              label="Forma"
              value={pay.method}
              options={methods}
              onChange={(method) => setPay({ ...pay, method })}
            />
          </div>
          <div className="apt-step-foot">
            <Button isDisabled={busy} onPress={submitPay}>
              {busy ? 'Salvando…' : 'Confirmar pagamento'}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

/** Step of a stepper: grams and millilitres move by 5, everything else by 1. */
const stepOf = (unit: string) => (unit === 'g' || unit === 'ml' ? 5 : 1)

/**
 * "Concluir atendimento": how it was paid, what it used from the stock (estimated by the
 * service recipe, adjustable) and photos for the client's folder in the media library.
 */
function CompleteStep({
  api,
  item,
  access,
  today,
  back,
  onDone,
}: {
  api: ClinicApi
  item: AppointmentView
  access: AppointmentAccess
  today: string
  back: ReactNode
  onDone: (message: string) => void
}) {
  const due = payment(item)
  const charge = access.charge && due.remaining > 0 && !isFree(item)
  const [mode, setMode] = useState<'now' | 'part' | 'later'>(charge ? 'now' : 'later')
  const [cash, setCash] = useState(isQuote(item) || !due.remaining ? '' : moneyInput(due.remaining))
  const [method, setMethod] = useState('pix')
  const [supplies, setSupplies] = useState<Supply[] | null>(null)
  const [used, setUsed] = useState<Record<string, number>>({})
  const [folder, setFolder] = useState<string | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void api
      .get<{ supplies: Supply[] }>(`appointments/${item.id}/supplies`)
      .then((data) => {
        if (!active) return
        setSupplies(data.supplies)
        setUsed(
          Object.fromEntries(
            data.supplies.map((supply) => [supply.itemId, supply.consumed ?? supply.quantity]),
          ),
        )
      })
      .catch(() => active && setSupplies([]))
    // Photos go to the client's album inside "Clientes", when the person may add there.
    void api
      .get<{ folders: { id: string; systemKey: string | null }[] }>('library')
      .then((data) => {
        if (active)
          setFolder(data.folders.find((entry) => entry.systemKey === 'clients')?.id ?? null)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [api, item.id])

  async function finish() {
    const cents = parseMoney(cash)
    if (charge && mode !== 'later' && !cents) {
      setError('Informe quanto foi pago, ou escolha “Pagar depois”.')
      return
    }
    if (charge && mode !== 'later' && cents && cents > due.remaining && !isQuote(item)) {
      setError(`O valor passa do que falta receber (${money(due.remaining)}).`)
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.put(`appointments/${item.id}/complete`, {
        supplies: (supplies ?? [])
          .filter((supply) => supply.consumed == null)
          .map((supply) => ({
            itemId: supply.itemId,
            quantity: Math.round(Math.max(used[supply.itemId] ?? 0, 0) * 100) / 100,
          })),
        payment:
          charge && mode !== 'later' && cents
            ? {
                amountCents: cents,
                method,
                description: `${item.service} · ${item.client}`.slice(0, 160),
              }
            : null,
      })
      let failed = 0
      // Each client gets her own album inside "Clientes", created on the first photos.
      const album =
        folder && photos.length
          ? await api
              .post<{ id: string }>('library/client-folder', { clientId: item.clientId })
              .then((body) => body.id)
              .catch(() => folder)
          : folder
      if (album)
        for (const file of photos) {
          try {
            const asset = await api.upload('library_photo', file, album)
            await api.post('library/items', {
              folderId: album,
              assetId: asset.id,
              title: `${item.service} · ${dateBr(today)}`.slice(0, 120),
            })
          } catch {
            failed += 1
          }
        }
      onDone(
        `${item.client}: atendimento concluído${failed ? `, mas ${failed} ${failed === 1 ? 'foto não foi enviada' : 'fotos não foram enviadas'}` : ''}.`,
      )
    } catch {
      setError('Não foi possível concluir. Tente de novo.')
      setBusy(false)
    }
  }

  return (
    <div className="apt-sheet-body sh-body">
      <section className="apt-step sh-complete">
        {back}
        <h3>Concluir atendimento</h3>

        {charge ? (
          <div className="sh-block">
            <h4>
              <CircleDollarSign size={18} aria-hidden /> Pagamento
            </h4>
            <div className="team-choice" role="radiogroup" aria-label="Pagamento">
              {(
                [
                  ['now', 'Pago agora'],
                  ['part', 'Pagou uma parte'],
                  ['later', 'Pagar depois'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  onClick={() => {
                    setMode(id)
                    if (id === 'part') setCash('')
                    if (id === 'now' && !isQuote(item)) setCash(moneyInput(due.remaining))
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode !== 'later' ? (
              <div className="apt-step-fields">
                <MoneyField
                  label={mode === 'part' ? 'Quanto pagou' : 'Valor recebido'}
                  autoFocus={isQuote(item) || mode === 'part'}
                  description={
                    isQuote(item)
                      ? 'Serviço a combinar: o valor acertado.'
                      : mode === 'part'
                        ? `O restante (de ${money(due.remaining)}) fica a receber no Financeiro.`
                        : undefined
                  }
                  value={cash}
                  onChange={setCash}
                />
                <SelectField label="Forma" value={method} options={methods} onChange={setMethod} />
              </div>
            ) : (
              <p className="apt-hint">Fica em “A receber” no Financeiro até ser registrado.</p>
            )}
          </div>
        ) : null}

        <div className="sh-block">
          <h4>
            <Layers size={18} aria-hidden /> Produtos usados
          </h4>
          {!supplies ? (
            <Spinner size="sm" aria-label="Carregando" />
          ) : supplies.length ? (
            <>
              <ul className="sh-supplies">
                {supplies.map((supply) => {
                  const value = used[supply.itemId] ?? 0
                  const step = stepOf(supply.unit)
                  const done = supply.consumed != null
                  return (
                    <li key={supply.itemId}>
                      <span>
                        <strong>{supply.name}</strong>
                        <small>
                          {done
                            ? 'Já descontado'
                            : `Estoque: ${amount(supply.stock)} ${unitShort(supply.unit)}`}
                        </small>
                      </span>
                      <div className="sh-stepper" aria-label={`Quanto usou de ${supply.name}`}>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label="Menos"
                          isDisabled={done || value <= 0}
                          onPress={() =>
                            setUsed({ ...used, [supply.itemId]: Math.max(0, value - step) })
                          }
                        >
                          <Minus size={15} />
                        </Button>
                        <output>
                          {amount(value)} {unitShort(supply.unit)}
                        </output>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label="Mais"
                          isDisabled={done}
                          onPress={() => setUsed({ ...used, [supply.itemId]: value + step })}
                        >
                          <Plus size={15} />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="ghost"
                          aria-label="Não usou"
                          isDisabled={done || value === 0}
                          onPress={() => setUsed({ ...used, [supply.itemId]: 0 })}
                        >
                          <X size={15} />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="apt-hint">
                Já vem com o gasto de costume deste serviço. Ajuste se hoje foi diferente.
              </p>
            </>
          ) : (
            <p className="apt-hint">
              Nenhum produto ligado a este serviço. Ligue em Serviços → Produtos usados para o
              estoque descontar sozinho.
            </p>
          )}
        </div>

        {folder ? (
          <div className="sh-block">
            <h4>
              <Camera size={18} aria-hidden /> Fotos (opcional)
            </h4>
            <label className="sh-photos">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])].slice(0, 10)
                  event.target.value = ''
                  setPhotos((current) => [...current, ...files].slice(0, 10))
                }}
              />
              <Camera size={18} aria-hidden />
              {photos.length
                ? `${photos.length} ${photos.length === 1 ? 'foto escolhida' : 'fotos escolhidas'}`
                : 'Adicionar fotos do resultado'}
            </label>
            <p className="apt-hint">Ficam na pasta Clientes da Mídia, só para a equipe.</p>
          </div>
        ) : null}

        {error ? (
          <p className="apt-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="apt-step-foot">
          <Button className="sh-primary" isDisabled={busy} onPress={() => void finish()}>
            <Check size={18} aria-hidden /> {busy ? 'Concluindo…' : 'Concluir atendimento'}
          </Button>
        </div>
      </section>
    </div>
  )
}

export { ClientAvatar }
