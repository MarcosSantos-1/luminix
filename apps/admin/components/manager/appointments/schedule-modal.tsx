'use client'

import { Button, Label, Spinner, Switch } from '@heroui/react'
import { CalendarDays, Coffee, Copy, Palmtree, Plus, Store, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TimeInputField } from '@/components/ui/fields'
import { initials } from '../business/format'
import type { ClinicApi } from '../settings/clinic-api'
import { QuickModal } from '../quick-modal'
import type { BookingProfessional } from './booking-modal'
import { ClosuresEditor } from './closures-editor'

type Period = { start: string; end: string }
type Day = { weekday: number; enabled: boolean; start: string; end: string; breaks: Period[] }
export type WeeklyRow = { weekday: number; is_available: boolean; periods: Period[] }
export type OverrideRow = {
  local_date: string
  is_available: boolean
  periods: Period[]
  reason: string | null
}
export type ProfessionalDayRow = WeeklyRow & { professional_id: string }
type TeamMember = {
  id: string
  name: string
  role: string
  gender: string
  audience: string
  membershipId: string | null
  photoAssetId: string
  photoUrl: string | null
  serviceIds: string[]
  serviceAudiences: Record<string, string>
  days: Day[]
}

const order = [1, 2, 3, 4, 5, 6, 0]
const names = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** Open periods → "abre, fecha e intervalos", which is how people think about a day. */
function fromPeriods(weekday: number, available: boolean, periods: Period[]): Day {
  const sorted = [...periods].sort((left, right) => left.start.localeCompare(right.start))
  if (!sorted.length)
    return { weekday, enabled: available, start: '09:00', end: '18:00', breaks: [] }
  return {
    weekday,
    enabled: available,
    start: sorted[0].start,
    end: sorted[sorted.length - 1].end,
    breaks: sorted
      .slice(1)
      .map((period, index) => ({ start: sorted[index].end, end: period.start })),
  }
}

function toPeriods(day: Day): Period[] {
  if (!day.enabled) return []
  const breaks = [...day.breaks].sort((left, right) => left.start.localeCompare(right.start))
  const periods: Period[] = []
  let cursor = day.start
  for (const pause of breaks) {
    periods.push({ start: cursor, end: pause.start })
    cursor = pause.end
  }
  periods.push({ start: cursor, end: day.end })
  return periods
}

function weekFrom(rows: WeeklyRow[]): Day[] {
  return order.map((weekday) => {
    const row = rows.find((item) => Number(item.weekday) === weekday)
    return fromPeriods(weekday, row?.is_available === true, row?.periods ?? [])
  })
}

function problem(days: Day[]) {
  for (const day of days) {
    if (!day.enabled) continue
    const name = names[day.weekday]
    if (!(day.start < day.end)) return `${name}: o fechamento precisa ser depois da abertura.`
    const periods = toPeriods(day)
    if (periods.some((period) => !(period.start < period.end)))
      return `${name}: confira os intervalos — eles precisam caber dentro do horário e não se cruzar.`
  }
  return ''
}

function summary(day: Day) {
  if (!day.enabled) return 'Fechado'
  const pause = day.breaks.length
    ? ` · intervalo ${day.breaks.map((item) => `${item.start}–${item.end}`).join(', ')}`
    : ''
  return `${day.start} às ${day.end}${pause}`
}

function WeekEditor({
  days,
  onChange,
  readOnly,
}: {
  days: Day[]
  onChange: (days: Day[]) => void
  readOnly?: boolean
}) {
  const patch = (weekday: number, change: Partial<Day>) =>
    onChange(days.map((day) => (day.weekday === weekday ? { ...day, ...change } : day)))
  const firstOpen = days.find((day) => day.enabled)
  return (
    <ul className="sch-week">
      {days.map((day) => {
        const name = names[day.weekday]
        return (
          <li key={day.weekday} className={day.enabled ? 'is-open' : undefined}>
            <div className="sch-day-head">
              <Switch
                isSelected={day.enabled}
                isDisabled={readOnly}
                onChange={(enabled) => patch(day.weekday, { enabled })}
                aria-label={`${name}: ${day.enabled ? 'aberto' : 'fechado'}`}
              >
                <Switch.Content>
                  <Label className="sr-only">{name}</Label>
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                </Switch.Content>
              </Switch>
              <strong>{name}</strong>
              <span className="sch-day-state">{day.enabled ? 'Aberto' : 'Fechado'}</span>
            </div>
            {day.enabled && readOnly ? <p className="sch-day-summary">{summary(day)}</p> : null}
            {day.enabled && !readOnly ? (
              <div className="sch-day-body">
                <div className="sch-range">
                  <TimeInputField
                    ariaLabel={`${name}: abre às`}
                    value={day.start}
                    onChange={(start) => patch(day.weekday, { start })}
                  />
                  <span>até</span>
                  <TimeInputField
                    ariaLabel={`${name}: fecha às`}
                    value={day.end}
                    onChange={(end) => patch(day.weekday, { end })}
                  />
                </div>
                {day.breaks.map((pause, index) => (
                  <div className="sch-range is-break" key={index}>
                    <Coffee size={16} aria-hidden />
                    <TimeInputField
                      ariaLabel={`${name}: intervalo começa às`}
                      value={pause.start}
                      onChange={(start) =>
                        patch(day.weekday, {
                          breaks: day.breaks.map((item, position) =>
                            position === index ? { ...item, start } : item,
                          ),
                        })
                      }
                    />
                    <span>até</span>
                    <TimeInputField
                      ariaLabel={`${name}: intervalo termina às`}
                      value={pause.end}
                      onChange={(end) =>
                        patch(day.weekday, {
                          breaks: day.breaks.map((item, position) =>
                            position === index ? { ...item, end } : item,
                          ),
                        })
                      }
                    />
                    <Button
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      aria-label={`Remover intervalo de ${name}`}
                      onPress={() =>
                        patch(day.weekday, {
                          breaks: day.breaks.filter((_, position) => position !== index),
                        })
                      }
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                ))}
                <div className="sch-day-tools">
                  {day.breaks.length < 4 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        patch(day.weekday, {
                          breaks: [...day.breaks, { start: '12:00', end: '13:00' }],
                        })
                      }
                    >
                      <Plus size={14} aria-hidden /> Intervalo
                    </Button>
                  ) : null}
                  {firstOpen?.weekday === day.weekday &&
                  days.filter((item) => item.enabled).length > 1 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onPress={() =>
                        onChange(
                          days.map((item) =>
                            item.enabled
                              ? {
                                  ...item,
                                  start: day.start,
                                  end: day.end,
                                  breaks: day.breaks.map((pause) => ({ ...pause })),
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <Copy size={14} aria-hidden /> Repetir nos outros dias abertos
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Horários: the space's week, each professional's week, and special dates (feriado, folga,
 * horário estendido) with "Aberto" and "Fechado" one tap away.
 */
export function ScheduleModal({
  api,
  isOpen,
  onOpenChange,
  weekly,
  professionals,
  professionalAvailability,
  canManageHours,
  canManageTeam,
  initialTab,
  onSaved,
}: {
  api: ClinicApi
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  weekly: WeeklyRow[]
  overrides: OverrideRow[]
  professionals: BookingProfessional[]
  professionalAvailability: ProfessionalDayRow[]
  canManageHours: boolean
  canManageTeam: boolean
  /** Opens on this tab (e.g. "Férias e fechamentos" from a closed day). */
  initialTab?: 'week' | 'closures'
  onSaved: (message: string) => void
}) {
  const [who, setWho] = useState('clinic')
  const [tab, setTab] = useState<'week' | 'closures'>('week')
  const [clinicDays, setClinicDays] = useState<Day[]>(() => weekFrom(weekly))
  const [team, setTeam] = useState<TeamMember[] | null>(null)
  const [personDays, setPersonDays] = useState<Record<string, Day[]>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    if (!isOpen) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts from the saved hours each time it opens
    setClinicDays(weekFrom(weekly))
    setPersonDays({})
    setWho('clinic')
    setTab(initialTab ?? 'week')
    setError('')
    setDone('')
    // Only when it opens: saving reloads `weekly`, which must not wipe what is being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !canManageTeam || !professionals.length) return
    let active = true
    void api
      .get<{ professionals: TeamMember[] }>('team')
      .then((data) => active && setTeam(data.professionals))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [isOpen, canManageTeam, professionals.length, api])

  const person = who === 'clinic' ? null : professionals.find((item) => item.id === who)
  const member = team?.find((item) => item.id === who) ?? null
  const savedPersonDays = (id: string): Day[] => {
    const own = team?.find((item) => item.id === id)
    if (own)
      return order.map(
        (weekday) =>
          own.days.find((day) => day.weekday === weekday) ?? fromPeriods(weekday, false, []),
      )
    return weekFrom(professionalAvailability.filter((row) => String(row.professional_id) === id))
  }
  const days = who === 'clinic' ? clinicDays : (personDays[who] ?? savedPersonDays(who))
  const readOnly = who === 'clinic' ? !canManageHours : !canManageTeam || !member

  async function run(work: () => Promise<unknown>, message: string, close: boolean) {
    setSaving(true)
    setError('')
    setDone('')
    try {
      await work()
      onSaved(message)
      if (close) onOpenChange(false)
      else setDone(message)
    } catch {
      setError('Não foi possível salvar os horários. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  function saveWeek() {
    const issue = problem(days)
    if (issue) return setError(issue)
    if (who === 'clinic')
      return void run(
        () =>
          api.put('availability', {
            mode: 'weekly',
            days: clinicDays.map((day) => ({
              weekday: day.weekday,
              isAvailable: day.enabled,
              periods: toPeriods(day),
            })),
          }),
        'Horários do espaço atualizados.',
        true,
      )
    if (!member) return
    void run(
      () =>
        api.put(`team/${member.id}`, {
          name: member.name,
          role: member.role,
          gender: member.gender,
          audience: member.audience,
          photoAssetId: member.photoAssetId,
          membershipId: member.membershipId,
          serviceIds: member.serviceIds,
          serviceAudiences: member.serviceAudiences,
          days: [...days].sort((left, right) => left.weekday - right.weekday),
        }),
      `Horários de ${member.name} atualizados.`,
      true,
    )
  }

  return (
    <QuickModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="xl"
      className="sch"
      title="Horários de atendimento"
      subtitle={
        professionals.length
          ? 'O espaço define quando as clientes podem agendar; cada profissional atende dentro disso.'
          : 'Quando as clientes podem agendar com você.'
      }
      footer={
        tab === 'week' ? (
          <>
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              {readOnly ? 'Fechar' : 'Cancelar'}
            </Button>
            {readOnly ? null : (
              <Button isDisabled={saving} onPress={saveWeek}>
                {saving
                  ? 'Salvando…'
                  : person
                    ? `Salvar horários de ${person.display_name.split(' ')[0]}`
                    : 'Salvar horários'}
              </Button>
            )}
          </>
        ) : (
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Fechar
          </Button>
        )
      }
    >
      <div className="sch-tabs" role="tablist" aria-label="O que ajustar">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'week'}
          onClick={() => {
            setTab('week')
            setError('')
          }}
        >
          <CalendarDays size={17} aria-hidden /> Semana padrão
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'closures'}
          onClick={() => {
            setTab('closures')
            setError('')
          }}
        >
          <Palmtree size={17} aria-hidden /> Férias e fechamentos
        </button>
      </div>

      {tab === 'week' ? (
        <>
          {professionals.length ? (
            <div className="sch-people" role="group" aria-label="De quem são os horários">
              <button
                type="button"
                aria-pressed={who === 'clinic'}
                onClick={() => setWho('clinic')}
              >
                <span className="sch-face">
                  <Store size={16} aria-hidden />
                </span>
                Espaço
              </button>
              {professionals.map((item) => {
                const photo = team?.find((entry) => entry.id === item.id)?.photoUrl
                return (
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
                      {photo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- public team photo
                        <img src={photo} alt="" />
                      ) : (
                        initials(item.display_name)
                      )}
                    </span>
                    {item.display_name}
                  </button>
                )
              })}
            </div>
          ) : null}
          {person && canManageTeam && !team ? (
            <div className="ws-loading" role="status">
              <Spinner size="sm" aria-hidden /> Carregando horários…
            </div>
          ) : (
            <WeekEditor
              days={days}
              readOnly={readOnly}
              onChange={(next) =>
                who === 'clinic'
                  ? setClinicDays(next)
                  : setPersonDays((current) => ({ ...current, [who]: next }))
              }
            />
          )}
          {person && readOnly && team !== null ? (
            <p className="sch-note">Só quem gerencia a equipe pode mudar estes horários.</p>
          ) : null}
        </>
      ) : (
        <ClosuresEditor
          api={api}
          professionals={professionals}
          photos={Object.fromEntries((team ?? []).map((item) => [item.id, item.photoUrl]))}
          canManageSpace={canManageHours}
          canManageTeam={canManageTeam}
          onSaved={onSaved}
        />
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
    </QuickModal>
  )
}
