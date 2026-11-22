'use client'

import { Button } from '@heroui/react'
import { CalendarHeart, Clock3, DoorClosed, DoorOpen } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { holidayScopeLabel, holidaysBetween, shiftDate, type Holiday } from '@/lib/holidays'
import type { ClinicApi } from '../settings/clinic-api'
import { canceledNote, confirmFlag, useCancellationGuard } from './cancellation-guard'
import type { OverrideRow, WeeklyRow } from './schedule-modal'

/** How far ahead the agenda asks (December 1st already reaches January 1st). */
const leadDays = 40
const snoozeDays = 3

function snoozeKey(clinicId: string) {
  return `lx-holiday-snooze:${clinicId}`
}
function readSnoozes(clinicId: string): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(snoozeKey(clinicId)) ?? '{}') ?? {}
  } catch {
    return {}
  }
}
function writeSnoozes(clinicId: string, value: Record<string, string>) {
  try {
    window.localStorage.setItem(snoozeKey(clinicId), JSON.stringify(value))
  } catch {
    // Private mode or blocked storage: the question simply comes back next time.
  }
}

/**
 * "Feriados chegando — vai abrir?": upcoming holidays on days the space normally opens and
 * without an answer yet. Each answer becomes a special date (fechado / aberto no horário de
 * sempre); "Perguntar depois" hides it for a few days on this device.
 */
export function HolidayPrompt({
  api,
  clinicId,
  today,
  location,
  weekly,
  onCustom,
  onSaved,
  refresh = 0,
}: {
  api: ClinicApi
  clinicId: string
  today: string
  location?: { city: string | null; state: string | null }
  weekly: WeeklyRow[]
  onCustom: (date: string) => void
  onSaved: (message: string) => void
  /** Changes when the agenda reloads (an answer may have come from "Horários"). */
  refresh?: number
}) {
  const [answered, setAnswered] = useState<OverrideRow[] | null>(null)
  const [snoozed, setSnoozed] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const { guard, dialog } = useCancellationGuard()

  const weekdayRule = (date: string) =>
    weekly.find((item) => Number(item.weekday) === new Date(`${date}T12:00:00Z`).getUTCDay())

  // Only holidays that fall on a day the space would open need a decision.
  const candidates = useMemo(
    () =>
      holidaysBetween(today, shiftDate(today, leadDays), {
        state: location?.state,
        city: location?.city,
      }).filter((item) => weekdayRule(item.date)?.is_available),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weekly is read through weekdayRule
    [today, location?.state, location?.city, weekly],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads this device's snoozes once
    setSnoozed(readSnoozes(clinicId))
  }, [clinicId])

  useEffect(() => {
    if (!api.ready || !candidates.length) return
    let active = true
    const first = candidates[0].date
    const last = candidates[candidates.length - 1].date
    void api
      .get<{ overrides: OverrideRow[] }>('agenda', {
        from: new Date(`${first}T00:00:00.000Z`).toISOString(),
        to: new Date(`${last}T23:59:59.999Z`).toISOString(),
      })
      .then((body) => active && setAnswered(body.overrides))
      .catch(() => active && setAnswered(null))
    return () => {
      active = false
    }
  }, [api, candidates, reload, refresh])

  const pending = answered
    ? candidates.filter(
        (item) =>
          !answered.some((row) => row.local_date.slice(0, 10) === item.date) &&
          !((snoozed[item.date] ?? '') > today),
      )
    : []
  if (!pending.length) return dialog

  async function decide(item: Holiday, open: boolean) {
    setBusy(item.date)
    setError('')
    try {
      const saved = await guard((confirm) =>
        api.put('availability', {
          mode: 'override',
          date: item.date,
          isAvailable: open,
          periods: open ? (weekdayRule(item.date)?.periods ?? []) : [],
          reason: open ? `${item.name} (aberto)` : item.name,
          ...confirmFlag(confirm),
        }),
      )
      if (saved === null) return
      setReload((value) => value + 1)
      onSaved(
        (open
          ? `${item.name}: aberto no horário de sempre.`
          : `${item.name}: espaço fechado, ninguém consegue agendar.`) + canceledNote(saved),
      )
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
    } finally {
      setBusy('')
    }
  }

  function later(item: Holiday) {
    const until = [shiftDate(today, snoozeDays), shiftDate(item.date, -1)].sort()[0]
    const next = { ...snoozed, [item.date]: until > today ? until : shiftDate(today, 1) }
    setSnoozed(next)
    writeSnoozes(clinicId, next)
  }

  return (
    <>
      {dialog}
      <section className="hp" aria-label="Feriados chegando">
        <header>
          <span className="hp-icon">
            <CalendarHeart size={20} aria-hidden />
          </span>
          <div>
            <strong>
              {pending.length === 1 ? 'Feriado chegando' : `${pending.length} feriados chegando`} —
              vai abrir?
            </strong>
            <p>Responda agora para as clientes não agendarem num dia que você vai fechar.</p>
          </div>
        </header>
        <ul>
          {pending.map((item) => {
            const value = new Date(`${item.date}T12:00:00`)
            return (
              <li key={item.date}>
                <time dateTime={item.date}>
                  <small>
                    {new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
                      .format(value)
                      .replace('.', '')}
                  </small>
                  <strong>{value.getDate()}</strong>
                  <small>
                    {new Intl.DateTimeFormat('pt-BR', { month: 'short' })
                      .format(value)
                      .replace('.', '')}
                  </small>
                </time>
                <div className="hp-name">
                  <strong>{item.name}</strong>
                  <small data-scope={item.scope}>{holidayScopeLabel[item.scope]}</small>
                </div>
                <div className="hp-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={busy === item.date}
                    onPress={() => void decide(item, false)}
                  >
                    <DoorClosed size={15} aria-hidden /> Fechar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={busy === item.date}
                    onPress={() => void decide(item, true)}
                  >
                    <DoorOpen size={15} aria-hidden /> Abrir normal
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => onCustom(item.date)}>
                    <Clock3 size={15} aria-hidden /> Outro horário
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => later(item)}>
                    Perguntar depois
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
        {error ? (
          <p className="apt-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </>
  )
}
