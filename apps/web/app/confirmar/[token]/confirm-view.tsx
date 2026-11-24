'use client'

import {
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Check,
  Clock3,
  MapPin,
  MessageCircle,
  ShieldAlert,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { expiresAt, type Level } from '@luminix/contracts/anamnesis'
import { clinicTheme } from '../../../lib/public-clinic'

type Answer = 'confirmed' | 'reschedule' | 'not_me' | 'canceled'

type Clinic = {
  name: string
  slug: string | null
  theme: string | null
  logoUrl: string | null
  whatsapp: string | null
  address: string | null
}

type Link = {
  answer: Answer | null
  clinic: Clinic
  appointment: {
    firstName: string
    service: string
    professional: string | null
    startsAt: string
    endsAt: string
    status: string
    cancelUntil: string | null
    awaitingDeposit: boolean
  } | null
  anamnesis: {
    requiredLevel: number
    record: { level: number; answeredAt: string } | null
  } | null
}

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'ready'; link: Link }
  | { kind: 'not_me'; clinic: Clinic }

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'https://luminix-api.fly.dev').replace(
  /\/$/,
  '',
)
const zone = 'America/Sao_Paulo'

const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: zone,
  })
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: zone })
const weekday = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: zone }).replace('.', '')
const shortDay = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: zone })

function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((word) => word.length > 2 || /^[A-ZÀ-Ú]/.test(word))
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('') || name.slice(0, 1).toUpperCase()

/** An .ics file for "Adicionar à agenda": works on iPhone, Android and desktop calendars. */
function calendarFile(link: Link) {
  const visit = link.appointment!
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const escape = (text: string) => text.replace(/[\\,;]/g, (char) => `\\${char}`)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Luminix//Confirmar//PT',
    'BEGIN:VEVENT',
    `UID:${visit.startsAt}-${encodeURIComponent(link.clinic.name)}@luminix.beauty`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(visit.startsAt)}`,
    `DTEND:${stamp(visit.endsAt)}`,
    `SUMMARY:${escape(`${visit.service} · ${link.clinic.name}`)}`,
    ...(link.clinic.address ? [`LOCATION:${escape(link.clinic.address)}`] : []),
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(visit.service)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`
}

/** Whether the space asks for a health record (levels II–III) this person lacks or let expire. */
function recordPending(anamnesis: Link['anamnesis']) {
  if (!anamnesis || anamnesis.requiredLevel < 2) return false
  const record = anamnesis.record
  if (!record || record.level < anamnesis.requiredLevel) return true
  const level = Math.min(3, Math.max(1, record.level)) as Level
  const end = expiresAt({ level, answeredAt: record.answeredAt })
  return Boolean(end && end.getTime() < Date.now())
}

export function ConfirmView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState<Answer | null>(null)
  const [failure, setFailure] = useState('')
  const [asking, setAsking] = useState<'not_me' | 'canceled' | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_URL}/client/appointment-links/${token}`, {
      signal: controller.signal,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    })
      .then(async (response) => {
        if (response.status === 404) return setState({ kind: 'missing' })
        if (!response.ok) return setState({ kind: 'error' })
        setState({ kind: 'ready', link: (await response.json()) as Link })
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') setState({ kind: 'error' })
      })
    return () => controller.abort()
  }, [token])

  async function answer(value: Answer) {
    if (state.kind !== 'ready') return
    setBusy(value)
    setFailure('')
    try {
      const response = await fetch(`${API_URL}/client/appointment-links/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer: value }),
        referrerPolicy: 'no-referrer',
      })
      if (response.status === 409) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setAsking(null)
        setFailure(
          body.error === 'Cancellation closed'
            ? 'O prazo para cancelar por aqui já passou. Fale direto com o espaço.'
            : 'Este horário já passou ou foi encerrado pelo espaço.',
        )
        return
      }
      if (response.status === 404) return setState({ kind: 'missing' })
      if (!response.ok) throw new Error('answer failed')
      setAsking(null)
      if (value === 'not_me') return setState({ kind: 'not_me', clinic: state.link.clinic })
      const visit = state.link.appointment
      setState({
        kind: 'ready',
        link: {
          ...state.link,
          answer: value,
          appointment: visit && {
            ...visit,
            status:
              value === 'canceled'
                ? 'canceled'
                : value === 'confirmed' && !visit.awaitingDeposit
                  ? 'confirmed'
                  : visit.status,
          },
        },
      })
    } catch {
      setFailure('Não foi possível enviar agora. Tente de novo em instantes.')
    } finally {
      setBusy(null)
    }
  }

  const clinic =
    state.kind === 'ready' ? state.link.clinic : state.kind === 'not_me' ? state.clinic : null

  return (
    <main className="confirm" data-theme={clinicTheme(clinic?.theme ?? 'rosa')}>
      <header className="confirm-hero">
        {clinic ? (
          <>
            <span className="confirm-logo" aria-hidden={!clinic.logoUrl}>
              {clinic.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote media, any size
                <img src={clinic.logoUrl} alt={`Logo de ${clinic.name}`} />
              ) : (
                initials(clinic.name)
              )}
            </span>
            <p className="confirm-space">{clinic.name}</p>
          </>
        ) : (
          <span className="confirm-logo is-placeholder" aria-hidden />
        )}
      </header>

      <div className="confirm-card">
        {state.kind === 'loading' ? (
          <div className="confirm-skeleton" role="status" aria-label="Carregando seu horário">
            <i />
            <i />
            <i />
          </div>
        ) : state.kind === 'missing' ? (
          <Message
            icon={<CalendarClock size={26} aria-hidden />}
            title="Este link não vale mais"
            text="O horário já passou, foi remarcado ou o espaço mandou um link novo. Se precisar, fale direto com o espaço."
          />
        ) : state.kind === 'error' ? (
          <Message
            icon={<ShieldAlert size={26} aria-hidden />}
            title="Não conseguimos abrir agora"
            text="Verifique sua internet e tente de novo em alguns instantes."
          />
        ) : state.kind === 'not_me' ? (
          <Message
            icon={<Check size={26} aria-hidden />}
            title="Obrigado por avisar"
            text={`Avisamos o ${state.clinic.name} que esta mensagem chegou para a pessoa errada. Você não vai receber mais nada sobre esse horário por este link.`}
          />
        ) : (
          <Ready
            link={state.link}
            busy={busy}
            failure={failure}
            asking={asking}
            onAsk={setAsking}
            onAnswer={(value) => void answer(value)}
          />
        )}
      </div>
      <p className="confirm-footer">
        <Sparkles size={13} aria-hidden /> Enviado pelo Luminix em nome do espaço
      </p>
    </main>
  )
}

function Message({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <section className="confirm-message">
      <span className="confirm-message-icon">{icon}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </section>
  )
}

function Ready({
  link,
  busy,
  failure,
  asking,
  onAsk,
  onAnswer,
}: {
  link: Link
  busy: Answer | null
  failure: string
  asking: 'not_me' | 'canceled' | null
  onAsk: (value: 'not_me' | 'canceled' | null) => void
  onAnswer: (value: Answer) => void
}) {
  const visit = link.appointment
  if (!visit) return null
  const canceled = visit.status === 'canceled' || link.answer === 'canceled'
  const open = !canceled && ['scheduled', 'confirmed'].includes(visit.status)
  const confirmed = open && link.answer === 'confirmed'
  const reschedule = open && link.answer === 'reschedule'
  const when = `${dayLabel(visit.startsAt)}, ${clock(visit.startsAt)}`
  const talk = (text: string) =>
    link.clinic.whatsapp ? whatsappLink(link.clinic.whatsapp, text) : null
  const rescheduleChat = talk(
    `Olá! Sou ${visit.firstName} e preciso remarcar meu horário de ${visit.service} (${when}).`,
  )
  const cancelChat = talk(
    `Olá! Sou ${visit.firstName} e preciso cancelar meu horário de ${visit.service} (${when}).`,
  )
  const maps = link.clinic.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(link.clinic.address)}`
    : null

  const status = canceled
    ? { tone: 'bad', icon: CalendarX2, label: 'Horário cancelado' }
    : confirmed
      ? { tone: 'ok', icon: CalendarCheck2, label: 'Presença confirmada' }
      : reschedule
        ? { tone: 'wait', icon: CalendarClock, label: 'Pedido de remarcação enviado' }
        : { tone: 'wait', icon: Clock3, label: 'Aguardando sua confirmação' }
  const StatusIcon = status.icon

  return (
    <>
      <p className={`confirm-status is-${status.tone}`} role="status">
        <StatusIcon size={15} aria-hidden /> {status.label}
      </p>
      <h1 className="confirm-title">
        {canceled
          ? `Tudo certo, ${visit.firstName}. Horário cancelado.`
          : reschedule
            ? `Combinado, ${visit.firstName}!`
            : confirmed
              ? `Te esperamos, ${visit.firstName}!`
              : `Oi, ${visit.firstName}! Confirma seu horário?`}
      </h1>

      <div className={`confirm-ticket${canceled ? ' is-void' : ''}`}>
        <div className="confirm-date" aria-hidden>
          <small>{weekday(visit.startsAt)}</small>
          <strong>{shortDay(visit.startsAt)}</strong>
          <span>{clock(visit.startsAt)}</span>
        </div>
        <dl className="confirm-visit">
          <div>
            <dt>
              <Sparkles size={14} aria-hidden /> Serviço
            </dt>
            <dd>{visit.service}</dd>
          </div>
          <div>
            <dt>
              <Clock3 size={14} aria-hidden /> Quando
            </dt>
            <dd>
              {dayLabel(visit.startsAt)}, {clock(visit.startsAt)} – {clock(visit.endsAt)}
            </dd>
          </div>
          {visit.professional ? (
            <div>
              <dt>
                <UserRound size={14} aria-hidden /> Com
              </dt>
              <dd>{visit.professional}</dd>
            </div>
          ) : null}
          {link.clinic.address ? (
            <div>
              <dt>
                <MapPin size={14} aria-hidden /> Onde
              </dt>
              <dd>{link.clinic.address}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {open && (confirmed || reschedule) ? (
        <div className="confirm-extras">
          <a className="confirm-chip" href={calendarFile(link)} download="horario.ics">
            <CalendarPlus size={16} aria-hidden /> Adicionar à agenda
          </a>
          {maps ? (
            <a className="confirm-chip" href={maps} target="_blank" rel="noopener noreferrer">
              <MapPin size={16} aria-hidden /> Como chegar
            </a>
          ) : null}
        </div>
      ) : null}

      {link.answer === 'confirmed' && visit.awaitingDeposit && open ? (
        <p className="confirm-note">
          O espaço ainda vai conferir o sinal por Pix. Assim que conferir, o horário fica
          confirmado.
        </p>
      ) : null}
      {reschedule ? (
        <p className="confirm-note">
          Avisamos o espaço que você precisa de outro horário.
          {rescheduleChat ? ' Se quiser adiantar, chame no WhatsApp.' : ' Eles vão falar com você.'}
        </p>
      ) : null}
      {canceled ? (
        <p className="confirm-note">
          O horário ficou livre para outra pessoa. Quando quiser voltar, é só chamar o espaço.
        </p>
      ) : null}
      {open && recordPending(link.anamnesis) ? (
        <p className="confirm-note is-record">
          <ShieldAlert size={16} aria-hidden /> Este espaço pede uma ficha de saúde antes do
          atendimento. Chegue uns minutinhos antes para preencher com a equipe.
        </p>
      ) : null}

      {failure ? (
        <p className="confirm-error" role="alert">
          {failure}
        </p>
      ) : null}

      {open && asking === 'canceled' ? (
        <div className="confirm-ask is-danger">
          <p>
            <strong>Cancelar este horário?</strong> Ele fica livre para outra pessoa e não dá para
            desfazer por aqui.
          </p>
          <div>
            <button
              type="button"
              className="confirm-danger"
              disabled={Boolean(busy)}
              onClick={() => onAnswer('canceled')}
            >
              {busy === 'canceled' ? 'Cancelando…' : 'Sim, cancelar'}
            </button>
            <button type="button" className="confirm-link" onClick={() => onAsk(null)}>
              Voltar
            </button>
          </div>
        </div>
      ) : open && asking === 'not_me' ? (
        <div className="confirm-ask">
          <p>Este horário não é seu? Vamos avisar o espaço e fechar este link.</p>
          <div>
            <button
              type="button"
              className="confirm-secondary"
              disabled={Boolean(busy)}
              onClick={() => onAnswer('not_me')}
            >
              {busy === 'not_me' ? 'Avisando…' : 'Sim, não sou eu'}
            </button>
            <button type="button" className="confirm-link" onClick={() => onAsk(null)}>
              Voltar
            </button>
          </div>
        </div>
      ) : open ? (
        <>
          <div className="confirm-actions">
            {!confirmed && !reschedule ? (
              <button
                type="button"
                className="confirm-primary"
                disabled={Boolean(busy)}
                onClick={() => onAnswer('confirmed')}
              >
                <Check size={19} aria-hidden />
                {busy === 'confirmed' ? 'Confirmando…' : 'Confirmar presença'}
              </button>
            ) : null}
            {reschedule && rescheduleChat ? (
              <a
                className="confirm-whatsapp"
                href={rescheduleChat}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={19} aria-hidden /> Chamar no WhatsApp
              </a>
            ) : null}
            {!reschedule ? (
              <button
                type="button"
                className="confirm-secondary"
                disabled={Boolean(busy)}
                onClick={() => onAnswer('reschedule')}
              >
                <CalendarClock size={18} aria-hidden />
                {busy === 'reschedule' ? 'Enviando…' : 'Preciso remarcar'}
              </button>
            ) : null}
          </div>
          <div className="confirm-more">
            {visit.cancelUntil ? (
              <button
                type="button"
                className="confirm-link is-danger"
                onClick={() => onAsk('canceled')}
              >
                Cancelar horário
              </button>
            ) : cancelChat ? (
              <a
                className="confirm-link"
                href={cancelChat}
                target="_blank"
                rel="noopener noreferrer"
              >
                Precisa cancelar? Fale com o espaço
              </a>
            ) : null}
            <button type="button" className="confirm-link" onClick={() => onAsk('not_me')}>
              Não sou eu
            </button>
          </div>
          {visit.cancelUntil ? (
            <p className="confirm-fine">
              Cancelamento por aqui até {shortDay(visit.cancelUntil)} às {clock(visit.cancelUntil)}.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  )
}
