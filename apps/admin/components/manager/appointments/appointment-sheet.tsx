'use client'

import { Button, Popover, Spinner } from '@heroui/react'
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  Check,
  ChevronDown,
  CircleDollarSign,
  History,
  Layers,
  LogIn,
  MessageCircle,
  QrCode,
  RotateCcw,
  UserRound,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { Answers } from '@luminix/contracts/anamnesis'
import { ClientAvatar } from '../client-photo'
import { AnamnesisAlerts } from '../clients/anamnesis'
import { ConfirmationLink } from './confirmation-link'
import { DateInputField, SelectField, TextAreaField, TimeInputField } from '@/components/ui/fields'
import { formatBrPhone } from '@/lib/phone'
import { appointmentStatus, dateBr, money } from '../business/format'
import { whatsapp } from '../business/format'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { QuickModal } from '../quick-modal'
import { ChargeVisit } from './charge-visit'
import { CompleteVisit, payment } from './complete-visit'
import {
  clock,
  confirmationText,
  dayLabel,
  isOpen,
  needsAgreedPrice,
  visitBadge,
  serviceTitle,
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
  /** Present for who can read the record (`client:manage`); null when there is none yet. */
  anamnesis?: { record: { answers?: Answers } | null }
}

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
  initialView,
}: {
  api: ClinicApi
  item: AppointmentView | null
  /** "Registrar pagamento" from a list: opens straight on the payment. */
  initialView?: 'pay'
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
            {onOpenClient && access.openClients ? (
              <button
                type="button"
                className="sh-who sh-client-link"
                onClick={() => {
                  onClose()
                  onOpenClient({ id: shown.clientId, name: shown.client })
                }}
              >
                {shown.client}
              </button>
            ) : (
              <span className="sh-who">{shown.client}</span>
            )}
            <span className={`sh-status is-${visitBadge(shown).key}`}>
              {visitBadge(shown).key === 'here' ? (
                <LogIn size={15} aria-hidden />
              ) : visitBadge(shown).tone !== 'pending' && visitBadge(shown).tone !== 'bad' ? (
                <Check size={15} aria-hidden />
              ) : null}
              {visitBadge(shown).label}
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
          initialView={initialView}
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
  initialView,
}: {
  api: ClinicApi
  item: AppointmentView
  access: AppointmentAccess
  today: string
  onClose: () => void
  onChanged: (message: string) => void
  onOpenClient?: (client: { id: string; name: string }) => void
  initialView?: 'pay'
}) {
  const [view, setView] = useState<'main' | 'move' | 'cancel' | 'pay' | 'checkin' | 'complete'>(
    initialView ?? 'main',
  )
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
  // "Registrar pagamento" at any time (also before the visit), when there is money to settle.
  const canRegisterPay =
    access.charge &&
    item.status !== 'canceled' &&
    item.status !== 'no_show' &&
    (paid.remaining > 0 || needsAgreedPrice(item))
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
  // A visit of a later day: check-in or completing it now is probably a slip, so ask first.
  const day = localDate(item.startsAt)
  const later = day > today
  const [early, setEarly] = useState<'checkin' | 'complete' | null>(null)
  const checkIn = () =>
    // "A combinar"/"a partir de": the amount is set (and may be paid) on arrival.
    access.charge && needsAgreedPrice(item)
      ? setView('checkin')
      : void run(() => api.put(`appointments/${item.id}/check-in`, {}), `${item.client} chegou.`)

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

  if (view === 'checkin' || view === 'pay')
    return (
      <div className="apt-sheet-body sh-body">
        <ChargeVisit
          api={api}
          item={item}
          intent={view}
          back={back}
          onDone={(message) => {
            onChanged(message)
            onClose()
          }}
        />
      </div>
    )

  if (view === 'complete')
    return (
      <CompleteVisit
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
            {serviceTitle(item)}
          </span>
          {item.professional && (
            <span>
              <UserRound size={15} aria-hidden />
              Profissional: {item.professional}
            </span>
          )}
        </div>
        {item.priceCents != null || item.package?.priceCents != null ? (
          <span className="sh-money">
            <strong>{paid.headline}</strong>
            <em className={`is-${paid.tone}`}>{paid.label}</em>
            {canRegisterPay && access.manage ? (
              <button type="button" className="sh-pay-link" onClick={() => setView('pay')}>
                Registrar pagamento
              </button>
            ) : null}
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
      {detail?.anamnesis?.record?.answers ? (
        <AnamnesisAlerts answers={detail.anamnesis.record.answers} compact />
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

      {view === 'main' && item.deposit && item.deposit.status !== 'confirmed' ? (
        <section className={`sh-deposit is-${item.deposit.status}`} aria-label="Sinal por Pix">
          <span className="sh-deposit-icon" aria-hidden>
            <QrCode size={20} />
          </span>
          <div>
            <strong>
              {item.deposit.status === 'expired'
                ? 'Sinal não pago no prazo: horário liberado'
                : item.deposit.status === 'reported'
                  ? `A cliente disse que pagou o sinal de ${money(item.deposit.cents)}`
                  : `Aguardando sinal de ${money(item.deposit.cents)} por Pix`}
            </strong>
            <small>
              {item.deposit.status === 'expired'
                ? 'Se o Pix chegar depois, combine com a cliente e agende de novo.'
                : item.deposit.status === 'reported'
                  ? 'Confira no extrato do banco e confirme. O horário fica guardado até lá.'
                  : `O horário fica guardado até ${clock(item.deposit.dueAt)} de ${dateBr(localDate(item.deposit.dueAt))}.`}
            </small>
          </div>
          {item.deposit.status !== 'expired' && access.manage && open ? (
            <Button
              size="sm"
              isDisabled={busy}
              onPress={() =>
                void run(
                  () => api.post(`appointments/${item.id}/deposit/confirm`, {}),
                  `Sinal de ${item.client} confirmado.`,
                )
              }
            >
              <Check size={16} aria-hidden /> Confirmar sinal recebido
            </Button>
          ) : null}
        </section>
      ) : null}

      {view === 'main' && (open || item.link) ? (
        <ConfirmationLink
          item={item}
          api={api}
          today={today}
          canSend={access.manage && open}
          hasEmail={Boolean(detail?.client.contact_email)}
        />
      ) : null}

      {view === 'main' && access.manage ? (
        <section className="sh-actions" aria-label="Ações do atendimento">
          {open ? (
            <>
              {needsCheckIn ? (
                <Button
                  className="sh-primary"
                  isDisabled={busy}
                  onPress={() => (later ? setEarly('checkin') : checkIn())}
                >
                  <Check size={20} aria-hidden /> Confirmar check-in
                </Button>
              ) : (
                <Button
                  className="sh-primary"
                  onPress={() => (later ? setEarly('complete') : setView('complete'))}
                >
                  <Check size={20} aria-hidden /> Concluir atendimento
                </Button>
              )}
              <div className="sh-row">
                <Button className="sh-move" variant="secondary" onPress={() => setView('move')}>
                  <CalendarClock size={18} aria-hidden /> Remarcar
                </Button>
                <Button
                  className="sh-miss"
                  variant="secondary"
                  isDisabled={busy}
                  onPress={() => void setStatus('no_show', `Falta registrada para ${item.client}.`)}
                >
                  <UserX size={18} aria-hidden /> Não veio
                </Button>
                <Button className="sh-cancel" variant="secondary" onPress={() => setView('cancel')}>
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
              {!canRegisterPay ? null : (
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
            <Button className="sh-move" variant="secondary" onPress={() => setView('move')}>
              <CalendarClock size={16} aria-hidden /> Remarcar
            </Button>
            <Button
              className="sh-cancel"
              variant="secondary"
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
      <QuickModal
        isOpen={early !== null}
        onOpenChange={(open) => {
          if (!open) setEarly(null)
        }}
        size="md"
        badge={
          <>
            <CalendarClock size={14} aria-hidden /> Não é de hoje
          </>
        }
        title={`Este atendimento é de ${dateBr(day)}`}
        subtitle={
          early === 'checkin'
            ? `Confirmar o check-in agora registra que ${item.client} chegou hoje, antes do dia marcado. Deseja continuar?`
            : `Concluir agora encerra o atendimento de ${item.client} antes do dia marcado. Deseja continuar?`
        }
        footer={
          <>
            <Button variant="secondary" onPress={() => setEarly(null)}>
              Voltar
            </Button>
            <Button
              isDisabled={busy}
              onPress={() => {
                const action = early
                setEarly(null)
                if (action === 'checkin') checkIn()
                else setView('complete')
              }}
            >
              {early === 'checkin' ? 'Confirmar check-in' : 'Continuar e concluir'}
            </Button>
          </>
        }
      >
        <p className="apt-hint">
          {clock(item.startsAt)} · {serviceTitle(item)}
          {item.professional ? ` · ${item.professional}` : ''}
        </p>
      </QuickModal>
    </div>
  )
}

export { ClientAvatar }
