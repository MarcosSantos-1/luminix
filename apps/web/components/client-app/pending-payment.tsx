'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { CreditCard, Hourglass, Loader2 } from 'lucide-react'
import { refreshSpace, resumePayment, useClient } from '../../lib/client-app/store'
import { dateLabel } from '../../lib/client-app/format'
import { toast } from './toast'

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

/**
 * A slot held while the client pays in the app (ADR-040): on every screen, with the time left and
 * a way back to the Stripe page. Coming back from a paid checkout, it waits for the confirmation
 * instead of asking to pay again.
 */
export function PendingPayment() {
  const { space } = useClient()
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  // Read before the page clears `?pagamento=ok` from the address.
  const [returned] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('pagamento') === 'ok',
  )
  const refreshed = useRef<string | null>(null)

  const slug = space?.summary.slug ?? null
  const held = (space?.appointments ?? [])
    .filter(
      (item) =>
        item.onlinePayment?.status === 'awaiting' &&
        item.onlinePayment.dueAt &&
        new Date(item.onlinePayment.dueAt).getTime() > now - 5_000,
    )
    .sort((a, b) => a.onlinePayment!.dueAt!.localeCompare(b.onlinePayment!.dueAt!))[0]
  const due = held?.onlinePayment?.dueAt ? new Date(held.onlinePayment.dueAt).getTime() : null

  useEffect(() => {
    if (!due) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [due])

  // Time is up: the server frees the slot; fetch the agenda once to show it.
  const left = due ? Math.max(0, Math.round((due - now) / 1000)) : 0
  useEffect(() => {
    if (!slug || !held || left > 0 || refreshed.current === held.id) return
    refreshed.current = held.id
    void refreshSpace(slug)
  }, [slug, held, left])

  if (!space || !held || !due || left <= 0) return null
  const urgent = left < 5 * 60

  return (
    <aside className="ca-held" data-urgent={urgent || undefined} aria-live="polite">
      <span className="ca-held-icon" aria-hidden>
        {returned ? <Loader2 size={20} className="ca-spin" /> : <Hourglass size={20} />}
      </span>
      <span className="ca-held-text">
        <strong>{returned ? 'Confirmando seu pagamento…' : 'Horário guardado para você'}</strong>
        <small>
          {held.serviceName} · {dateLabel(held.start, 'short')} às {held.start.slice(11, 16)}
        </small>
      </span>
      <span className="ca-held-timer" role="timer" aria-label={`Faltam ${clock(left)}`}>
        {clock(left)}
      </span>
      <span className="ca-held-actions">
        {!returned && (
          <button
            type="button"
            className="ca-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              const result = await resumePayment(space.summary.slug, held.id)
              if (result.url) return window.location.assign(result.url)
              setBusy(false)
              if (result.error) toast.error('Não foi possível abrir o pagamento', result.error)
            }}
          >
            <CreditCard size={17} aria-hidden /> {busy ? 'Abrindo…' : 'Voltar ao pagamento'}
          </button>
        )}
        <Link className="ca-link" href={`/cliente/agenda?horario=${held.id}`}>
          Ver horário
        </Link>
      </span>
    </aside>
  )
}
