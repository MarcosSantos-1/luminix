'use client'

import { useEffect, useState } from 'react'
import { expiresAt, type Level } from '@luminix/contracts/anamnesis'
import { clinicTheme } from '../../../lib/public-clinic'

type Answer = 'confirmed' | 'reschedule' | 'not_me'

type Link = {
  answer: Answer | null
  clinic: {
    name: string
    slug: string | null
    theme: string | null
    whatsapp: string | null
    address: string | null
  }
  appointment: {
    firstName: string
    service: string
    professional: string | null
    startsAt: string
    endsAt: string
    status: string
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
  | { kind: 'not_me'; clinic: Link['clinic'] }

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

function whatsappLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null
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
  const [askNotMe, setAskNotMe] = useState(false)

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
        setFailure('Este horário já passou ou foi encerrado pelo espaço.')
        return
      }
      if (response.status === 404) return setState({ kind: 'missing' })
      if (!response.ok) throw new Error('answer failed')
      if (value === 'not_me') return setState({ kind: 'not_me', clinic: state.link.clinic })
      setState({
        kind: 'ready',
        link: {
          ...state.link,
          answer: value,
          appointment: state.link.appointment && {
            ...state.link.appointment,
            status:
              value === 'confirmed' && !state.link.appointment.awaitingDeposit
                ? 'confirmed'
                : state.link.appointment.status,
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
      <div className="confirm-card">
        {clinic ? <p className="confirm-space">{clinic.name}</p> : null}
        {state.kind === 'loading' ? (
          <p className="confirm-loading" role="status">
            Carregando seu horário…
          </p>
        ) : state.kind === 'missing' ? (
          <Message
            title="Este link não vale mais"
            text="O horário já passou, foi remarcado ou o espaço mandou um link novo. Se precisar, fale direto com o espaço."
          />
        ) : state.kind === 'error' ? (
          <Message
            title="Não conseguimos abrir agora"
            text="Verifique sua internet e tente de novo em alguns instantes."
          />
        ) : state.kind === 'not_me' ? (
          <Message
            title="Obrigado por avisar"
            text={`Avisamos o ${state.clinic.name} que esta mensagem chegou para a pessoa errada. Você não vai receber mais nada sobre esse horário por este link.`}
          />
        ) : (
          <Ready
            link={state.link}
            busy={busy}
            failure={failure}
            askNotMe={askNotMe}
            onAskNotMe={setAskNotMe}
            onAnswer={(value) => void answer(value)}
          />
        )}
      </div>
      <p className="confirm-footer">Enviado pelo Luminix em nome do espaço.</p>
    </main>
  )
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <section className="confirm-message">
      <h1>{title}</h1>
      <p>{text}</p>
    </section>
  )
}

function Ready({
  link,
  busy,
  failure,
  askNotMe,
  onAskNotMe,
  onAnswer,
}: {
  link: Link
  busy: Answer | null
  failure: string
  askNotMe: boolean
  onAskNotMe: (value: boolean) => void
  onAnswer: (value: Answer) => void
}) {
  const visit = link.appointment
  if (!visit) return null
  const confirmed = visit.status === 'confirmed' || link.answer === 'confirmed'
  const when = `${dayLabel(visit.startsAt)}, ${clock(visit.startsAt)}`
  const contact = link.clinic.whatsapp
    ? whatsappLink(
        link.clinic.whatsapp,
        `Olá! Sou ${visit.firstName} e preciso remarcar meu horário de ${visit.service} (${when}).`,
      )
    : null

  return (
    <>
      <h1 className="confirm-title">
        {link.answer === 'reschedule'
          ? 'Pedido de remarcação enviado'
          : confirmed
            ? `Tudo certo, ${visit.firstName}!`
            : `Oi, ${visit.firstName}! Confirma seu horário?`}
      </h1>

      <dl className="confirm-visit">
        <div>
          <dt>Serviço</dt>
          <dd>{visit.service}</dd>
        </div>
        <div>
          <dt>Quando</dt>
          <dd>
            {dayLabel(visit.startsAt)}
            <br />
            {clock(visit.startsAt)} – {clock(visit.endsAt)}
          </dd>
        </div>
        {visit.professional ? (
          <div>
            <dt>Com</dt>
            <dd>{visit.professional}</dd>
          </div>
        ) : null}
        {link.clinic.address ? (
          <div>
            <dt>Onde</dt>
            <dd>{link.clinic.address}</dd>
          </div>
        ) : null}
      </dl>

      {confirmed && link.answer !== 'reschedule' ? (
        <p className="confirm-badge is-ok" role="status">
          ✓ Presença confirmada. Te esperamos!
        </p>
      ) : null}
      {link.answer === 'confirmed' && visit.awaitingDeposit ? (
        <p className="confirm-note">
          O espaço ainda vai conferir o sinal por Pix. Assim que conferir, o horário fica
          confirmado.
        </p>
      ) : null}
      {link.answer === 'reschedule' ? (
        <p className="confirm-note">
          Avisamos o espaço que você precisa de outro horário.
          {contact ? ' Se quiser adiantar, chame no WhatsApp.' : ' Eles vão falar com você.'}
        </p>
      ) : null}

      {recordPending(link.anamnesis) ? (
        <p className="confirm-note is-record">
          Este espaço pede uma ficha de saúde antes do atendimento. Chegue uns minutinhos antes para
          preencher com a equipe.
        </p>
      ) : null}

      {failure ? (
        <p className="confirm-error" role="alert">
          {failure}
        </p>
      ) : null}

      <div className="confirm-actions">
        {!confirmed && link.answer !== 'reschedule' ? (
          <button
            type="button"
            className="confirm-primary"
            disabled={Boolean(busy)}
            onClick={() => onAnswer('confirmed')}
          >
            {busy === 'confirmed' ? 'Confirmando…' : 'Confirmar presença'}
          </button>
        ) : null}
        {link.answer !== 'reschedule' ? (
          <button
            type="button"
            className="confirm-secondary"
            disabled={Boolean(busy)}
            onClick={() => onAnswer('reschedule')}
          >
            {busy === 'reschedule' ? 'Enviando…' : 'Preciso remarcar'}
          </button>
        ) : null}
        {link.answer === 'reschedule' && contact ? (
          <a className="confirm-whatsapp" href={contact} target="_blank" rel="noopener noreferrer">
            Chamar no WhatsApp
          </a>
        ) : null}
      </div>

      {askNotMe ? (
        <div className="confirm-notme">
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
            <button type="button" className="confirm-link" onClick={() => onAskNotMe(false)}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="confirm-link" onClick={() => onAskNotMe(true)}>
          Não sou eu
        </button>
      )}
    </>
  )
}
