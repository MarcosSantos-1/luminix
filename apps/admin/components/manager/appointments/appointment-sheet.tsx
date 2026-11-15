'use client'

import { Button } from '@heroui/react'
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  BellRing,
  CalendarClock,
  CalendarX2,
  Check,
  CircleDollarSign,
  ClipboardList,
  MessageCircle,
  RotateCcw,
  UserRound,
  UserX,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { DateInputField, SelectField, TextInputField, TimeInputField } from '@/components/ui/fields'
import { formatBrPhone } from '@/lib/phone'
import {
  appointmentStatus,
  dateBr,
  initials,
  money,
  moneyInput,
  parseMoney,
} from '../business/format'
import { whatsapp } from '../business/format'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { QuickModal } from '../quick-modal'
import {
  clock,
  confirmationText,
  dayLabel,
  isOpen,
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
  history: { id: string; starts_at: string; status: string }[]
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

/** Avatar with the client's photo when there is one, initials otherwise. */
export function ClientAvatar({
  name,
  photoUrl,
  size = 'md',
}: {
  name: string
  photoUrl?: string | null
  size?: 'md' | 'lg'
}) {
  const tone = [...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 4
  return (
    <span className={`apt-avatar apt-avatar-${size} tone-${tone}`} aria-hidden>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived private URL
        <img src={photoUrl} alt="" />
      ) : (
        initials(name)
      )}
    </span>
  )
}

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

/**
 * Everything about one appointment in a single pop-up: who, when, what needs attention,
 * whether it is paid, and the actions (confirmar, concluir, remarcar, cancelar, WhatsApp).
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
  return (
    <QuickModal
      isOpen={Boolean(item)}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      className="apt-sheet"
      title={
        shown ? (
          <span className="apt-title">
            <ClientAvatar name={shown.client} photoUrl={shown.photoUrl} size="lg" />
            <span>
              {shown.client}
              <small>
                {shown.service}
                {shown.professional ? ` · com ${shown.professional}` : ''}
              </small>
            </span>
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
  const [view, setView] = useState<'main' | 'move' | 'cancel' | 'pay'>('main')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<ClientDetail | null>(null)
  const [move, setMove] = useState({
    date: localDate(item.startsAt),
    time: clock(item.startsAt),
  })
  const [warnings, setWarnings] = useState<BookingWarning[]>([])
  const [pay, setPay] = useState({
    amount: item.priceCents ? moneyInput(item.priceCents) : '',
    method: 'pix',
  })

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

  const status = appointmentStatus[item.status] ?? appointmentStatus.confirmed
  const open = isOpen(item.status)
  const phone = item.phone ?? detail?.client.contact_phone ?? null
  const clientNotes = item.clientNotes ?? detail?.client.notes ?? null
  const birth = detail?.client.birth_date ?? null
  const birthday = birth ? birth.slice(5, 10) === today.slice(5, 10) : false
  const visits = detail?.history.filter((entry) => entry.status === 'completed').length
  const remind = whatsapp(phone, reminderText(item, today))
  const askConfirm = whatsapp(phone, confirmationText(item, today))
  const attention = [
    ...(clientNotes ? [{ title: 'Na ficha da cliente', text: clientNotes }] : []),
    ...(item.notes ? [{ title: 'Observação deste atendimento', text: item.notes }] : []),
    ...item.warnings.map((code) => ({ title: 'Aviso', text: warningCopy[code] ?? code })),
  ]

  async function run(work: () => Promise<unknown>, message: string) {
    setBusy(true)
    setError('')
    try {
      await work()
      onChanged(message)
      onClose()
    } catch (caught) {
      const body =
        caught instanceof ClinicApiError ? (caught.body as { warnings?: BookingWarning[] }) : null
      if (caught instanceof ClinicApiError && caught.status === 409 && body?.warnings) {
        setWarnings(body.warnings)
        return
      }
      setError('Não foi possível salvar. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (next: string, message: string) =>
    run(() => api.put(`appointments/${item.id}/status`, { status: next }), message)

  function submitMove(confirmed: boolean) {
    if (!move.date || !move.time) {
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

  return (
    <div className="apt-sheet-body">
      <div className="apt-facts">
        <Fact label="Quando">
          {localDate(item.startsAt) === today ? 'Hoje' : dayLabel(item.startsAt)} ·{' '}
          {clock(item.startsAt)}
          {item.endsAt ? `–${clock(item.endsAt)}` : ''}
        </Fact>
        <Fact label="Situação" tone={status.tone}>
          {status.label}
        </Fact>
        {item.priceCents != null ? <Fact label="Valor">{money(item.priceCents)}</Fact> : null}
        <Fact label="Pagamento" tone={item.paid ? 'on' : 'pending'}>
          {item.paid ? 'Pago' : 'A receber'}
        </Fact>
      </div>

      {item.previousStartsAt ? (
        <p className="apt-moved">
          <RotateCcw size={15} aria-hidden /> Remarcado — antes era{' '}
          {dayLabel(item.previousStartsAt)} às {clock(item.previousStartsAt)}.
        </p>
      ) : null}

      {attention.length || birthday ? (
        <section className="apt-attention" aria-label="Atenção">
          <h3>
            <AlertTriangle size={17} aria-hidden /> Atenção
          </h3>
          {birthday ? <p>Hoje é aniversário dela. Vale um carinho.</p> : null}
          {attention.map((entry, index) => (
            <p key={index}>
              <strong>{entry.title}:</strong> {entry.text}
            </p>
          ))}
        </section>
      ) : null}

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
        {visits != null ? (
          <div>
            <dt>Histórico</dt>
            <dd>
              {visits === 0
                ? 'Primeira vez aqui'
                : `${visits} ${visits === 1 ? 'atendimento concluído' : 'atendimentos concluídos'}`}
            </dd>
          </div>
        ) : null}
      </dl>

      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}

      {view === 'main' ? (
        <div className="apt-actions">
          {open && access.manage && item.status === 'scheduled' ? (
            <Action
              icon={BadgeCheck}
              title="Confirmar presença"
              hint="A cliente confirmou que vem"
              tone="good"
              disabled={busy}
              onPress={() => void setStatus('confirmed', `Presença de ${item.client} confirmada.`)}
            />
          ) : null}
          {open && access.manage ? (
            <Action
              icon={Check}
              title="Concluir atendimento"
              hint="Ela foi atendida"
              tone="good"
              disabled={busy}
              onPress={() => void setStatus('completed', `${item.client} · atendimento concluído.`)}
            />
          ) : null}
          {!item.paid && access.charge && item.status !== 'canceled' ? (
            <Action
              icon={CircleDollarSign}
              title="Registrar pagamento"
              hint="Marca como pago e lança no financeiro"
              onPress={() => setView('pay')}
            />
          ) : null}
          {open && access.manage ? (
            <Action
              icon={CalendarClock}
              title="Remarcar"
              hint="Trocar o dia ou o horário"
              onPress={() => setView('move')}
            />
          ) : null}
          {open && askConfirm ? (
            <Action
              icon={MessageCircle}
              title="Pedir confirmação"
              hint="Mensagem pronta no WhatsApp"
              tone="whats"
              href={askConfirm}
            />
          ) : null}
          {open && remind ? (
            <Action
              icon={BellRing}
              title="Enviar lembrete"
              hint="Lembrar do horário pelo WhatsApp"
              tone="whats"
              href={remind}
            />
          ) : null}
          {onOpenClient && access.openClients ? (
            <Action
              icon={UserRound}
              title="Abrir ficha da cliente"
              hint="Dados, histórico e observações"
              onPress={() => {
                onClose()
                onOpenClient({ id: item.clientId, name: item.client })
              }}
            />
          ) : null}
          {open && access.manage ? (
            <Action
              icon={UserX}
              title="Não veio"
              hint="Registrar falta"
              tone="warn"
              disabled={busy}
              onPress={() => void setStatus('no_show', `Falta registrada para ${item.client}.`)}
            />
          ) : null}
          {open && access.manage ? (
            <Action
              icon={CalendarX2}
              title="Cancelar"
              hint="Libera o horário na agenda"
              tone="danger"
              onPress={() => setView('cancel')}
            />
          ) : null}
          {!open && access.manage ? (
            <Action
              icon={RotateCcw}
              title="Reabrir atendimento"
              hint="Volta para a agenda como confirmado"
              disabled={busy}
              onPress={() => void setStatus('confirmed', `Atendimento de ${item.client} reaberto.`)}
            />
          ) : null}
          {!phone ? (
            <p className="apt-hint">
              <ClipboardList size={15} aria-hidden /> Cadastre o WhatsApp da cliente para enviar
              lembretes daqui.
            </p>
          ) : null}
        </div>
      ) : null}

      {view === 'move' ? (
        <section className="apt-step">
          {back}
          <h3>Para quando?</h3>
          <div className="apt-step-fields">
            <DateInputField
              label="Novo dia"
              value={move.date}
              onChange={(date) => {
                setMove({ ...move, date })
                setWarnings([])
              }}
            />
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
            O horário de {clock(item.startsAt)} fica livre. O atendimento continua no histórico da
            cliente como cancelado e você pode reabrir depois.
          </p>
          <div className="apt-step-foot">
            <Button
              variant="danger"
              isDisabled={busy}
              onPress={() => void setStatus('canceled', `Atendimento de ${item.client} cancelado.`)}
            >
              {busy ? 'Cancelando…' : 'Sim, cancelar'}
            </Button>
          </div>
        </section>
      ) : null}

      {view === 'pay' ? (
        <section className="apt-step">
          {back}
          <h3>Registrar pagamento</h3>
          <div className="apt-step-fields">
            <TextInputField
              label="Valor recebido"
              prefix="R$"
              inputMode="decimal"
              value={pay.amount}
              onChange={(amount) => setPay({ ...pay, amount })}
            />
            <SelectField
              label="Forma"
              value={pay.method}
              options={methods}
              onChange={(method) => setPay({ ...pay, method })}
            />
          </div>
          <p>Entra no Financeiro como recebido hoje, ligado a este atendimento.</p>
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
