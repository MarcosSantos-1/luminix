'use client'

import { Button, Label, Spinner, Switch } from '@heroui/react'
import {
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Coffee,
  Copy,
  Palmtree,
  Store,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { TimeInputField } from '@/components/ui/fields'
import { holidaysBetween } from '@/lib/holidays'
import { initials } from '../business/format'
import type { ClinicApi } from '../settings/clinic-api'
import { closureKinds, type BookingProfessional, type ClosureRow } from './booking-modal'
import { localDate } from './model'
import {
  fromPeriods,
  names,
  toPeriods,
  type Day,
  type OverrideRow,
  type ProfessionalDayRow,
  type ProfessionalOverrideRow,
  type WeeklyRow,
} from './schedule-modal'

type Week = {
  overrides: OverrideRow[]
  professionalOverrides?: ProfessionalOverrideRow[]
  closures?: ClosureRow[]
}
type Clip = Pick<Day, 'enabled' | 'start' | 'end' | 'breaks'>

function monday(date: string) {
  const value = new Date(`${date}T12:00:00Z`)
  const weekday = value.getUTCDay()
  value.setUTCDate(value.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday))
  return value.toISOString().slice(0, 10)
}
function shift(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
const short = (date: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(
    new Date(`${date}T12:00:00`),
  )
const same = (left: Clip, right: Clip) =>
  left.enabled === right.enabled &&
  (!left.enabled ||
    JSON.stringify(toPeriods({ ...left, weekday: 0 })) ===
      JSON.stringify(toPeriods({ ...right, weekday: 0 })))

/**
 * "Planejar semanas": the space and each professional, one week at a time (from the current
 * one on). Each day starts from the routine; what changes becomes that date's own hours, marked
 * in the agenda. A day can be copied and pasted on others. Breaks belong to the professionals —
 * unless the space has no team (or only one person), when the space's day is the only one.
 */
export function WeekPlanner({
  api,
  weekly,
  professionals,
  professionalAvailability,
  canManageHours,
  timezone,
  location,
  onSaved,
}: {
  api: ClinicApi
  weekly: WeeklyRow[]
  professionals: BookingProfessional[]
  professionalAvailability: ProfessionalDayRow[]
  canManageHours: boolean
  timezone: string
  location?: { city: string | null; state: string | null }
  onSaved: (message: string) => void
}) {
  const today = localDate(new Date(), timezone)
  const first = monday(today)
  const solo = professionals.length <= 1
  const [start, setStart] = useState(first)
  const [who, setWho] = useState('clinic')
  const [week, setWeek] = useState<Week | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Clip>>({})
  const [clip, setClip] = useState<Clip | null>(null)
  const [reload, setReload] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const dates = useMemo(() => Array.from({ length: 7 }, (_, index) => shift(start, index)), [start])
  const holidays = useMemo(
    () =>
      new Map(
        holidaysBetween(dates[0], dates[6], {
          state: location?.state,
          city: location?.city,
        }).map((item) => [item.date, item]),
      ),
    [dates, location?.state, location?.city],
  )

  useEffect(() => {
    let active = true
    void api
      .get<Week>('agenda', {
        from: new Date(`${dates[0]}T00:00:00.000Z`).toISOString(),
        to: new Date(`${dates[6]}T23:59:59.999Z`).toISOString(),
      })
      .then((body) => active && setWeek(body))
      .catch(() => active && setError('Não foi possível carregar a semana.'))
    return () => {
      active = false
    }
  }, [api, dates, reload])

  const isClinic = who === 'clinic'
  // One-off days (space or professional) are schedule:manage since migration 0052.
  const canEdit = canManageHours
  const withBreaks = !isClinic || solo
  const person = professionals.find((item) => item.id === who)
  const key = (date: string) => `${who}|${date}`

  /** The routine for that weekday (the space's or the professional's). */
  function routine(date: string): Clip {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const row = isClinic
      ? weekly.find((item) => Number(item.weekday) === weekday)
      : professionalAvailability.find(
          (item) => String(item.professional_id) === who && Number(item.weekday) === weekday,
        )
    const fallback = isClinic ? undefined : weekly.find((item) => Number(item.weekday) === weekday)
    const source = row ?? fallback
    return fromPeriods(weekday, source?.is_available === true, source?.periods ?? [])
  }
  /** The space's hours that date (its own date, or the routine). */
  function spaceDay(date: string) {
    const own = week?.overrides.find((item) => item.local_date.slice(0, 10) === date)
    if (own) return own.is_available ? own.periods : []
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
    const row = weekly.find((item) => Number(item.weekday) === weekday)
    return row?.is_available ? row.periods : []
  }
  function saved(date: string) {
    return isClinic
      ? week?.overrides.find((item) => item.local_date.slice(0, 10) === date)
      : week?.professionalOverrides?.find(
          (item) => item.local_date.slice(0, 10) === date && String(item.professional_id) === who,
        )
  }
  function current(date: string): Clip {
    const draft = drafts[key(date)]
    if (draft) return draft
    const own = saved(date)
    if (own) {
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
      return fromPeriods(weekday, own.is_available, own.periods)
    }
    return routine(date)
  }
  const patch = (date: string, change: Partial<Clip>) => {
    setDone('')
    setDrafts((all) => ({ ...all, [key(date)]: { ...current(date), ...change } }))
  }
  const pending = dates.filter((date) => {
    const draft = drafts[key(date)]
    if (!draft) return false
    const own = saved(date)
    const before = own ? fromPeriods(0, own.is_available, own.periods) : routine(date)
    return !same(draft, before)
  })

  async function save() {
    setError('')
    const days = pending.map((date) => {
      const day = current(date)
      const periods = withBreaks
        ? toPeriods({ ...day, weekday: 0 })
        : day.enabled
          ? [{ start: day.start, end: day.end }]
          : []
      const backToRoutine = same(day, routine(date))
      return backToRoutine
        ? { date, professionalId: isClinic ? null : who, useDefault: true }
        : {
            date,
            professionalId: isClinic ? null : who,
            isAvailable: day.enabled,
            periods,
          }
    })
    const broken = pending.find((date) => {
      const day = current(date)
      return (
        day.enabled &&
        (!(day.start < day.end) ||
          toPeriods({ ...day, weekday: 0 }).some((item) => !(item.start < item.end)))
      )
    })
    if (broken)
      return setError(
        `${names[new Date(`${broken}T12:00:00Z`).getUTCDay()]} ${short(broken)}: confira os horários — o fechamento vem depois da abertura e o intervalo cabe dentro.`,
      )
    if (!days.length) return
    setSaving(true)
    try {
      await api.put('schedule-plan', { days })
      const message = `${days.length} ${days.length === 1 ? 'dia ajustado' : 'dias ajustados'} ${isClinic ? 'no espaço' : `para ${person?.display_name.split(' ')[0] ?? 'a profissional'}`}.`
      setDone(message)
      onSaved(message)
      setDrafts((all) =>
        Object.fromEntries(Object.entries(all).filter(([entry]) => !entry.startsWith(`${who}|`))),
      )
      setReload((value) => value + 1)
    } catch {
      setError('Não foi possível salvar a semana. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  const weekLabel =
    start === first
      ? 'Esta semana'
      : start === shift(first, 7)
        ? 'Próxima semana'
        : `Daqui a ${Math.round((Date.parse(start) - Date.parse(first)) / (7 * 86_400_000))} semanas`

  return (
    <div className="wp">
      <div className="wp-week" role="group" aria-label="Semana">
        <Button
          isIconOnly
          variant="secondary"
          aria-label="Semana anterior"
          isDisabled={start <= first}
          onPress={() => setStart(shift(start, -7))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="wp-week-label">
          <strong>{weekLabel}</strong>
          <small>
            {short(dates[0])} a {short(dates[6])}
          </small>
        </div>
        <Button
          isIconOnly
          variant="secondary"
          aria-label="Próxima semana"
          isDisabled={start >= shift(first, 7 * 26)}
          onPress={() => setStart(shift(start, 7))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      {professionals.length ? (
        <div className="sch-people" role="group" aria-label="De quem é o horário">
          <button
            type="button"
            aria-pressed={isClinic}
            onClick={() => {
              setWho('clinic')
              setError('')
            }}
          >
            <span className="sch-face">
              <Store size={16} aria-hidden />
            </span>
            {solo ? 'Horário de atendimento' : 'Espaço (abre e fecha)'}
          </button>
          {solo
            ? null
            : professionals.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={who === item.id}
                  onClick={() => {
                    setWho(item.id)
                    setError('')
                  }}
                >
                  <span className="sch-face">
                    {item.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- public team photo
                      <img src={item.photo_url} alt="" />
                    ) : (
                      initials(item.display_name)
                    )}
                  </span>
                  {item.display_name.split(' ')[0]}
                  {Object.keys(drafts).some((entry) => entry.startsWith(`${item.id}|`)) ? (
                    <i className="wp-dirty" aria-label="com mudanças" />
                  ) : null}
                </button>
              ))}
        </div>
      ) : null}

      <p className="wp-hint">
        {isClinic
          ? solo
            ? 'Cada dia começa na sua rotina. Mude só o que for diferente nesta semana.'
            : 'Quando o espaço abre e fecha. Os intervalos ficam no horário de cada profissional.'
          : `Horário de ${person?.display_name.split(' ')[0] ?? 'da profissional'} nesta semana, dentro do horário do espaço.`}
        {clip ? (
          <span className="wp-clip">
            <ClipboardPaste size={13} aria-hidden /> Copiado:{' '}
            {clip.enabled ? `${clip.start}–${clip.end}` : 'fechado'}
            <button type="button" onClick={() => setClip(null)}>
              limpar
            </button>
          </span>
        ) : null}
      </p>

      {!week ? (
        error ? null : (
          <div className="ws-loading" role="status">
            <Spinner size="sm" aria-hidden /> Carregando a semana…
          </div>
        )
      ) : (
        <ul className="wp-days">
          {dates.map((date) => {
            const day = current(date)
            const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
            const own = saved(date)
            const changed = pending.includes(date)
            const custom = Boolean(own) || changed
            const past = date < today
            const holiday = holidays.get(date)
            const closure = (week.closures ?? []).find(
              (item) =>
                item.starts_on <= date &&
                item.ends_on >= date &&
                (item.professional_id === null || (!isClinic && item.professional_id === who)),
            )
            const locked = past || !canEdit
            const space = isClinic ? [] : spaceDay(date)
            const outside =
              !isClinic && day.enabled
                ? !space.length
                  ? 'O espaço está fechado neste dia: as clientes não vão conseguir agendar.'
                  : day.start < space[0].start || day.end > space[space.length - 1].end
                    ? `Fora do horário do espaço (${space[0].start}–${space[space.length - 1].end}): só vale a parte de dentro.`
                    : ''
                : ''
            return (
              <li
                key={date}
                className={['wp-day', day.enabled ? 'is-open' : '', custom ? 'is-custom' : '']
                  .filter(Boolean)
                  .join(' ')}
                data-past={past || undefined}
              >
                <div className="wp-day-head">
                  <Switch
                    isSelected={day.enabled}
                    isDisabled={locked}
                    onChange={(enabled) => patch(date, { enabled })}
                    aria-label={`${names[weekday]} ${short(date)}: ${day.enabled ? 'aberto' : 'fechado'}`}
                  >
                    <Switch.Content>
                      <Label className="sr-only">{names[weekday]}</Label>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                  <span className="wp-day-name">
                    <strong>{names[weekday]}</strong>
                    <small>{short(date)}</small>
                  </span>
                  <span className={`wp-badge${custom ? ' is-custom' : ''}`}>
                    {changed ? 'Não salvo' : own ? 'Ajustado' : 'Rotina'}
                  </span>
                  {holiday ? (
                    <span className="wp-tag is-holiday" title={holiday.name}>
                      <CalendarHeart size={12} aria-hidden /> {holiday.name}
                    </span>
                  ) : null}
                  {closure ? (
                    <span className="wp-tag is-away">
                      <Palmtree size={12} aria-hidden /> {closureKinds[closure.kind] ?? 'Fechado'}
                    </span>
                  ) : null}
                </div>
                {day.enabled ? (
                  <div className="wp-day-body">
                    <div className="sch-range">
                      <TimeInputField
                        ariaLabel={`${names[weekday]} ${short(date)}: abre às`}
                        value={day.start}
                        isDisabled={locked}
                        onChange={(value) => patch(date, { start: value })}
                      />
                      <span>até</span>
                      <TimeInputField
                        ariaLabel={`${names[weekday]} ${short(date)}: fecha às`}
                        value={day.end}
                        isDisabled={locked}
                        onChange={(value) => patch(date, { end: value })}
                      />
                    </div>
                    {withBreaks
                      ? day.breaks.slice(0, 1).map((pause) => (
                          <div className="sch-range is-break" key="break">
                            <Coffee size={16} aria-hidden />
                            <TimeInputField
                              ariaLabel={`${names[weekday]} ${short(date)}: intervalo começa às`}
                              value={pause.start}
                              isDisabled={locked}
                              onChange={(value) =>
                                patch(date, { breaks: [{ ...pause, start: value }] })
                              }
                            />
                            <span>até</span>
                            <TimeInputField
                              ariaLabel={`${names[weekday]} ${short(date)}: intervalo termina às`}
                              value={pause.end}
                              isDisabled={locked}
                              onChange={(value) =>
                                patch(date, { breaks: [{ ...pause, end: value }] })
                              }
                            />
                          </div>
                        ))
                      : null}
                  </div>
                ) : (
                  <p className="wp-closed">{isClinic ? 'Fechado' : 'Não atende'}</p>
                )}
                {outside ? <p className="wp-warn">{outside}</p> : null}
                {locked ? null : (
                  <div className="wp-day-tools">
                    {withBreaks && day.enabled && !day.breaks.length ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => patch(date, { breaks: [{ start: '12:00', end: '13:00' }] })}
                      >
                        <Coffee size={14} aria-hidden /> Intervalo
                      </Button>
                    ) : null}
                    {withBreaks && day.enabled && day.breaks.length ? (
                      <Button size="sm" variant="ghost" onPress={() => patch(date, { breaks: [] })}>
                        Sem intervalo
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        setClip({
                          enabled: day.enabled,
                          start: day.start,
                          end: day.end,
                          breaks: day.breaks.map((item) => ({ ...item })),
                        })
                      }
                    >
                      <Copy size={14} aria-hidden /> Copiar
                    </Button>
                    {clip ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() =>
                          patch(date, {
                            ...clip,
                            breaks: withBreaks ? clip.breaks.map((item) => ({ ...item })) : [],
                          })
                        }
                      >
                        <ClipboardPaste size={14} aria-hidden /> Colar
                      </Button>
                    ) : null}
                    {custom ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() => setDrafts((all) => ({ ...all, [key(date)]: routine(date) }))}
                      >
                        <Undo2 size={14} aria-hidden /> Rotina
                      </Button>
                    ) : null}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {canEdit ? null : (
        <p className="sch-note">
          {isClinic
            ? 'Só quem gerencia o espaço pode mudar estes horários.'
            : 'Só quem gerencia a equipe pode mudar estes horários.'}
        </p>
      )}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="apt-done" role="status">
          {done}
        </p>
      ) : null}
      {canEdit ? (
        <div className="wp-foot">
          {clip && week ? (
            <Button
              variant="ghost"
              onPress={() =>
                dates
                  .filter((date) => date >= today)
                  .forEach((date) =>
                    patch(date, {
                      ...clip,
                      breaks: withBreaks ? clip.breaks.map((item) => ({ ...item })) : [],
                    }),
                  )
              }
            >
              <ClipboardPaste size={15} aria-hidden /> Colar na semana toda
            </Button>
          ) : null}
          <Button isDisabled={saving || !pending.length} onPress={() => void save()}>
            {saving
              ? 'Salvando…'
              : pending.length
                ? `Salvar ${pending.length} ${pending.length === 1 ? 'dia' : 'dias'}`
                : 'Nada para salvar'}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
