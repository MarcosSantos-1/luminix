'use client'

import { Button } from '@heroui/react'
import { CalendarX2, Clock3, Mail, Phone } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { formatBrPhone } from '@/lib/phone'
import { initials } from '../business/format'
import { ClinicApiError } from '../settings/clinic-api'
import { QuickModal } from '../quick-modal'

/** What the API answers (409) when a schedule change would cancel appointments (ADR-035). */
export type AffectedClient = {
  clientId: string
  name: string
  phone: string | null
  photoUrl: string | null
  appointments: {
    id: string
    startsAt: string
    endsAt?: string
    date: string
    time: string
    service: string
    professional: string | null
  }[]
}
type Impact = {
  /** Canceled (and notified) when the manager confirms. */
  affected: AffectedClient[]
  total: number
  /** Kept: they only run past the new closing time. */
  overrun?: AffectedClient[]
  overrunTotal?: number
}

function impactOf(error: unknown): Impact | null {
  if (!(error instanceof ClinicApiError) || error.status !== 409) return null
  const body = error.body as (Impact & { error?: string }) | null
  return body?.error === 'Schedule impact' && Array.isArray(body.affected) ? body : null
}

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  })

/** Resolved with the saved result, or null when the manager went back without saving. */
type Send<T> = (confirmCancellations: boolean) => Promise<T>

/**
 * Wraps a save that changes the agenda (hours, closed day, closure, exclusive rental):
 * the first try goes without confirmation; if the API lists affected clients, a dialog shows
 * them (photo, name, phone, how many and which times). "Cancelar horários e avisar" repeats
 * the save with `confirmCancellations`; "Voltar" keeps everything as it was.
 *
 *   const { guard, dialog } = useCancellationGuard()
 *   const saved = await guard((confirm) => api.put('availability', { ...body, ...(confirm ? { confirmCancellations: true } : {}) }))
 *   if (saved === null) return // went back
 */
export function useCancellationGuard(context?: string) {
  const [impact, setImpact] = useState<Impact | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<{
    confirm: () => Promise<void>
    back: () => void
  } | null>(null)

  const guard = useCallback(async <T,>(send: Send<T>): Promise<T | null> => {
    try {
      return await send(false)
    } catch (caught) {
      const found = impactOf(caught)
      if (!found) throw caught
      return new Promise<T | null>((resolve, reject) => {
        pending.current = {
          back: () => {
            pending.current = null
            setImpact(null)
            resolve(null)
          },
          confirm: async () => {
            setBusy(true)
            setError('')
            try {
              const result = await send(true)
              pending.current = null
              setImpact(null)
              resolve(result)
            } catch (again) {
              const changed = impactOf(again)
              // Someone booked meanwhile: show the new list and ask again.
              if (changed) setImpact(changed)
              else {
                pending.current = null
                setImpact(null)
                reject(again)
              }
            } finally {
              setBusy(false)
            }
          },
        }
        setError('')
        setImpact(found)
      })
    }
  }, [])

  const dialog: ReactNode = (
    <AffectedClientsDialog
      impact={impact}
      busy={busy}
      error={error}
      context={context}
      onBack={() => pending.current?.back()}
      onConfirm={() => void pending.current?.confirm()}
    />
  )
  return { guard, dialog }
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

function ClientList({ clients, showEnd }: { clients: AffectedClient[]; showEnd?: boolean }) {
  return (
    <ul className="cxl-list">
      {clients.map((client) => (
        <li key={client.clientId} className="cxl-client">
          <span className="cxl-face" aria-hidden>
            {client.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed client photo
              <img src={client.photoUrl} alt="" />
            ) : (
              initials(client.name)
            )}
          </span>
          <div className="cxl-who">
            <strong>{client.name}</strong>
            {client.phone ? (
              <a href={`tel:${client.phone}`} className="cxl-phone">
                <Phone size={13} aria-hidden /> {formatBrPhone(client.phone)}
              </a>
            ) : (
              <span className="cxl-phone is-missing">Sem telefone</span>
            )}
            <ul className="cxl-times">
              {client.appointments.map((item) => (
                <li key={item.id}>
                  <span className="cxl-when">
                    {dayLabel(item.date)} · {item.time}
                    {showEnd && item.endsAt ? `–${clock(item.endsAt)}` : ''}
                  </span>
                  <span>
                    {item.service}
                    {item.professional ? ` com ${item.professional}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <span className="cxl-count" aria-label={`${client.appointments.length} horários`}>
            {client.appointments.length}
          </span>
        </li>
      ))}
    </ul>
  )
}

function AffectedClientsDialog({
  impact,
  busy,
  error,
  context,
  onBack,
  onConfirm,
}: {
  impact: Impact | null
  busy: boolean
  error: string
  context?: string
  onBack: () => void
  onConfirm: () => void
}) {
  const total = impact?.total ?? 0
  const people = impact?.affected.length ?? 0
  const overrun = impact?.overrun ?? []
  const overrunTotal = impact?.overrunTotal ?? 0
  const cancels = total > 0
  return (
    <QuickModal
      isOpen={Boolean(impact)}
      onOpenChange={(open) => {
        if (!open && !busy) onBack()
      }}
      size="md"
      className="cxl"
      badge={
        <>
          <CalendarX2 size={14} aria-hidden /> Atendimentos afetados
        </>
      }
      title={
        cancels
          ? total === 1
            ? '1 horário marcado será cancelado'
            : `${total} horários marcados serão cancelados`
          : overrunTotal === 1
            ? '1 atendimento vai passar do novo horário'
            : `${overrunTotal} atendimentos vão passar do novo horário`
      }
      subtitle={
        cancels
          ? (context ??
            `Com essa mudança, ${people === 1 ? 'esta cliente perde' : `estas ${people} clientes perdem`} o horário. Se continuar, cancelamos e avisamos cada uma por e-mail e na área da cliente.`)
          : 'Eles começam dentro do expediente e continuam marcados. Só terminam depois do novo fechamento: combine com a cliente se precisar.'
      }
      footer={
        <>
          <Button variant="secondary" isDisabled={busy} onPress={onBack}>
            Voltar sem salvar
          </Button>
          <Button variant={cancels ? 'danger' : 'primary'} isDisabled={busy} onPress={onConfirm}>
            {busy
              ? cancels
                ? 'Cancelando…'
                : 'Salvando…'
              : cancels
                ? 'Cancelar horários e avisar'
                : 'Salvar assim mesmo'}
          </Button>
        </>
      }
    >
      {cancels ? <ClientList clients={impact?.affected ?? []} /> : null}
      {cancels ? (
        <p className="cxl-note">
          <Mail size={14} aria-hidden /> O aviso vai por e-mail para quem tem e-mail no cadastro e
          aparece nas notificações da área da cliente. Sessões de pacote voltam para o saldo.
        </p>
      ) : null}
      {overrun.length ? (
        <section className="cxl-overrun" aria-label="Continuam marcados">
          {cancels ? (
            <h4>
              <Clock3 size={15} aria-hidden /> Continuam marcados, mas passam do horário (
              {overrunTotal})
            </h4>
          ) : null}
          <ClientList clients={overrun} showEnd />
        </section>
      ) : null}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}

/** "3 horários cancelados e clientes avisadas." for the save message, or "". */
export function canceledNote(result: unknown) {
  const count = Number((result as { canceledAppointments?: number } | null)?.canceledAppointments)
  if (!count) return ''
  return count === 1
    ? ' 1 horário foi cancelado e a cliente foi avisada.'
    : ` ${count} horários foram cancelados e as clientes foram avisadas.`
}

/** Spread into a save body: `{ ...body, ...confirmFlag(confirm) }`. */
export const confirmFlag = (confirm: boolean) => (confirm ? { confirmCancellations: true } : {})
