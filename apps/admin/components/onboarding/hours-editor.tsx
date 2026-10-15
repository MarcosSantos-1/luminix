'use client'

import { Button, Card, Label, Switch } from '@heroui/react'
import { Building2, Check, Info, Star, UserRound } from 'lucide-react'
import Image from 'next/image'
import { useState, type ReactNode } from 'react'
import {
  dayNames,
  professionalAvatarSrc,
  type DaySchedule,
  type HolidayHours,
  type Payload,
  type Professional,
} from './model'
import { cloneWeekSchedule, syncProfessionalSchedules } from './schedule-sync'
import { defaultBreak, TimePicker } from './time-picker'
import { StepEnd } from './ui'

const weekOrder = [1, 2, 3, 4, 5, 6, 0]

const shortDay: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
}

function orderedDays(days: DaySchedule[]) {
  const byWeekday = new Map(days.map((day) => [day.weekday, day]))
  return weekOrder
    .map((weekday) => byWeekday.get(weekday))
    .filter((day): day is DaySchedule => Boolean(day))
}

function rangeLabel(weekdays: number[]) {
  if (weekdays.length === 1) return shortDay[weekdays[0]] ?? ''
  return `${shortDay[weekdays[0]]}–${shortDay[weekdays[weekdays.length - 1]]}`
}

function openGroups(days: DaySchedule[]) {
  const groups: { weekdays: number[]; start: string; end: string }[] = []
  for (const day of orderedDays(days)) {
    if (!day.enabled) continue
    const last = groups.at(-1)
    const previous = last ? weekOrder.indexOf(last.weekdays.at(-1) ?? -1) : -1
    const current = weekOrder.indexOf(day.weekday)
    if (last && current === previous + 1 && last.start === day.start && last.end === day.end) {
      last.weekdays.push(day.weekday)
    } else {
      groups.push({ weekdays: [day.weekday], start: day.start, end: day.end })
    }
  }
  return groups
}

function scheduleSummary(days: DaySchedule[]) {
  const groups = openGroups(days)
  if (groups.length === 0) return 'Fechado'
  const weekday: string[] = []
  const weekend: string[] = []
  for (const group of groups) {
    const label = `${rangeLabel(group.weekdays)} · ${group.start}–${group.end}`
    if (group.weekdays.some((day) => day === 6 || day === 0)) weekend.push(label)
    else weekday.push(label)
  }
  return [weekday.join('  '), weekend.join('  ')].filter(Boolean).join('\n')
}

function sharedBreak(days: DaySchedule[]) {
  const open = days.filter((day) => day.enabled)
  const first = open.find((day) => (day.breaks ?? []).length > 0)?.breaks?.[0]
  if (first) return { enabled: true, start: first.start, end: first.end }
  const sample = open[0]
  const suggested = sample ? defaultBreak(sample.start, sample.end) : { start: '13:00', end: '14:00' }
  return { enabled: false, start: suggested.start, end: suggested.end }
}

type Pause = { enabled: boolean; start: string; end: string }

function readPause(clinic: Payload['clinic'], days: DaySchedule[]): Pause {
  if (clinic.defaultBreak) return { enabled: true, ...clinic.defaultBreak }
  return sharedBreak(days)
}

function followsTemplate(day: DaySchedule, previous: Pause) {
  const item = day.breaks?.[0]
  if (!previous.enabled) return !item
  if (!item) return false
  return item.start === previous.start && item.end === previous.end
}

function applyTemplate(days: DaySchedule[], previous: Pause, next: Pause) {
  return days.map((day) => {
    if (day.customBreak) return day
    if (!next.enabled || !day.enabled) {
      return followsTemplate(day, previous) ? { ...day, breaks: [] } : day
    }
    if (followsTemplate(day, previous) || (!day.breaks?.[0] && !previous.enabled)) {
      return { ...day, breaks: [{ start: next.start, end: next.end }] }
    }
    return day
  })
}

function patchDay(days: DaySchedule[], weekday: number, patch: Partial<DaySchedule>, template: Pause) {
  return days.map((day) => {
    if (day.weekday !== weekday) return day
    const next = { ...day, ...patch }
    if (!next.enabled) return { ...next, breaks: [] }
    if (patch.enabled === true && template.enabled) {
      return { ...next, customBreak: false, breaks: [{ start: template.start, end: template.end }] }
    }
    return next
  })
}

function setDayBreak(days: DaySchedule[], weekday: number, enabled: boolean, template: Pause) {
  return days.map((day) => {
    if (day.weekday !== weekday) return day
    if (!enabled || !template.enabled) return { ...day, customBreak: false, breaks: [] }
    return { ...day, customBreak: false, breaks: [{ start: template.start, end: template.end }] }
  })
}

function sameBreak(
  item: { start: string; end: string } | undefined,
  other: { start: string; end: string } | undefined,
) {
  return Boolean(item && other && item.start === other.start && item.end === other.end)
}

function setOwnBreak(days: DaySchedule[], weekday: number, start: string, end: string) {
  return days.map((day) =>
    day.weekday === weekday
      ? { ...day, customBreak: true, breaks: [{ start, end }] }
      : day,
  )
}


function personPhoto(person: Professional | undefined) {
  if (!person) return professionalAvatarSrc.female
  return person.photoUrl || person.photoPreview || professionalAvatarSrc[person.gender]
}

function DayDots({ days, holidayOpen }: { days: DaySchedule[]; holidayOpen: boolean }) {
  const rows = [
    [1, 2, 3, 4, 5],
    [6, 0],
  ]
  return (
    <div className="ob2-hours-dots" aria-hidden>
      {rows.map((row) => (
        <div className="ob2-hours-dots-row" key={row.join('-')}>
          {row.map((weekday) => {
            const day = days.find((item) => item.weekday === weekday)
            const open = day?.enabled === true
            return (
              <span className={open ? 'ob2-hours-dot is-on' : 'ob2-hours-dot'} key={weekday}>
                {open ? (
                  <span className="ob2-hours-dot-check">
                    <Check size={10} strokeWidth={3} />
                  </span>
                ) : null}
                {shortDay[weekday]}
              </span>
            )
          })}
          {row.includes(0) ? (
            <span className={holidayOpen ? 'ob2-hours-dot is-on is-holiday' : 'ob2-hours-dot is-holiday'}>
              {holidayOpen ? (
                <span className="ob2-hours-dot-check">
                  <Check size={10} strokeWidth={3} />
                </span>
              ) : null}
              <Star size={12} fill={holidayOpen ? '#ffe14a' : 'transparent'} />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function emptyHoliday(): HolidayHours {
  return { enabled: false, start: '09:00', end: '18:00', breaks: [] }
}

function DayCards({
  days,
  clinicDays,
  template,
  showHome,
  forPerson,
  holiday,
  clinicHoliday,
  onChange,
  onHolidayChange,
}: {
  days: DaySchedule[]
  clinicDays?: DaySchedule[]
  template: Pause
  showHome: boolean
  forPerson: boolean
  holiday: HolidayHours
  clinicHoliday?: HolidayHours
  onChange: (days: DaySchedule[]) => void
  onHolidayChange: (holiday: HolidayHours) => void
}) {
  return (
    <div className="ob2-hours-daylist">
      {orderedDays(days).map((day) => {
        const clinicDay = clinicDays?.find((item) => item.weekday === day.weekday)
        const open = forPerson ? clinicDay?.enabled === true : day.enabled
        const source = forPerson && clinicDay ? clinicDay : day
        const clinicBreak = forPerson ? clinicDay?.breaks?.[0] : undefined
        const ownBreak = day.breaks?.[0]
        const usingClinic = Boolean(clinicBreak) && !day.customBreak && sameBreak(ownBreak, clinicBreak)
        const hasBreak = (day.breaks ?? []).length > 0
        return (
          <article
            className={open ? 'ob2-hours-daycard is-open' : 'ob2-hours-daycard'}
            key={day.weekday}
          >
            {open && !forPerson ? (
              <span className="ob2-hours-daycheck" aria-hidden>
                <Check size={14} strokeWidth={3} />
              </span>
            ) : null}
            <div className="ob2-hours-daycopy">
              <strong>{dayNames[day.weekday]}</strong>
              <p>
                {forPerson
                  ? open
                    ? `A clínica abre das ${source.start} às ${source.end}.`
                    : 'A clínica não abre neste dia.'
                  : open
                    ? `Aberto das ${day.start} às ${day.end}.${hasBreak ? ` Intervalo das ${day.breaks[0].start} às ${day.breaks[0].end}.` : ''}`
                    : 'Fechado. Ligue o botão se abre neste dia.'}
              </p>
            </div>
            <div className="ob2-hours-toggles">
              {forPerson ? null : (
                <Switch
                  className="ob2-switch"
                  isSelected={day.enabled}
                  aria-label={`${dayNames[day.weekday]} ${day.enabled ? 'abre' : 'está fechado'}`}
                  onChange={(enabled) =>
                    onChange(patchDay(days, day.weekday, { enabled }, template))
                  }
                >
                  <Switch.Content>
                    <Label>{day.enabled ? 'Abre neste dia' : 'Não abre neste dia'}</Label>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              )}
              {open && template.enabled && !forPerson ? (
                  <Switch
                    className="ob2-switch"
                    isSelected={hasBreak}
                    aria-label={`Intervalo de ${dayNames[day.weekday]}`}
                    onChange={(enabled) =>
                      onChange(setDayBreak(days, day.weekday, enabled, template))
                    }
                  >
                    <Switch.Content>
                      <Label>Intervalo</Label>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                ) : null}
                {forPerson && clinicBreak ? (
                  <Switch
                    className="ob2-switch"
                    isSelected={usingClinic}
                    aria-label={`Intervalo no horário da clínica em ${dayNames[day.weekday]}`}
                    onChange={(enabled) =>
                      onChange(
                        enabled
                          ? days.map((item) =>
                              item.weekday === day.weekday
                                ? {
                                    ...item,
                                    customBreak: false,
                                    breaks: [{ start: clinicBreak.start, end: clinicBreak.end }],
                                  }
                                : item,
                            )
                          : days.map((item) =>
                              item.weekday === day.weekday
                                ? { ...item, customBreak: true, breaks: [] }
                                : item,
                            ),
                      )
                    }
                  >
                    <Switch.Content>
                      <Label>Intervalo no horário da clínica</Label>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                ) : null}
                {forPerson && showHome ? (
                  <Switch
                    className="ob2-switch"
                    isSelected={day.homeVisit === true}
                    aria-label={`Atende na casa da cliente em ${dayNames[day.weekday]}`}
                    onChange={(enabled) =>
                      onChange(patchDay(days, day.weekday, { homeVisit: enabled }, template))
                    }
                  >
                    <Switch.Content>
                      <Label>Atende na casa da cliente</Label>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                    </Switch.Content>
                  </Switch>
                ) : null}
              </div>
            {open && forPerson && clinicBreak && !usingClinic ? (
              <div className="ob2-hours is-compact">
                <TimePicker
                  label="Início do intervalo"
                  value={ownBreak?.start || clinicBreak.start}
                  onChange={(start) =>
                    onChange(setOwnBreak(days, day.weekday, start, ownBreak?.end || clinicBreak.end))
                  }
                />
                <TimePicker
                  label="Fim do intervalo"
                  value={ownBreak?.end || clinicBreak.end}
                  onChange={(end) =>
                    onChange(
                      setOwnBreak(days, day.weekday, ownBreak?.start || clinicBreak.start, end),
                    )
                  }
                />
              </div>
            ) : null}
            {open && !forPerson ? (
              <div className="ob2-hours is-compact">
                <TimePicker
                  label="Que horas abre"
                  value={day.start}
                  onChange={(start) => onChange(patchDay(days, day.weekday, { start }, template))}
                />
                <TimePicker
                  label="Que horas fecha"
                  value={day.end}
                  onChange={(end) => onChange(patchDay(days, day.weekday, { end }, template))}
                />
              </div>
            ) : null}
            {open && !forPerson && !template.enabled ? (
              <div className="ob2-hours is-compact">
                <TimePicker
                  label="Intervalo começa"
                  value={ownBreak?.start || defaultBreak(day.start, day.end).start}
                  onChange={(start) => {
                    const end = ownBreak?.end || defaultBreak(day.start, day.end).end
                    onChange(
                      days.map((item) =>
                        item.weekday === day.weekday ? { ...item, breaks: [{ start, end }] } : item,
                      ),
                    )
                  }}
                />
                <TimePicker
                  label="Intervalo termina"
                  value={ownBreak?.end || defaultBreak(day.start, day.end).end}
                  onChange={(end) => {
                    const start = ownBreak?.start || defaultBreak(day.start, day.end).start
                    onChange(
                      days.map((item) =>
                        item.weekday === day.weekday ? { ...item, breaks: [{ start, end }] } : item,
                      ),
                    )
                  }}
                />
              </div>
            ) : null}
          </article>
        )
      })}
      <HolidayCard
        holiday={holiday}
        clinicHoliday={clinicHoliday}
        forPerson={forPerson}
        showHome={showHome && forPerson}
        template={template}
        onChange={onHolidayChange}
      />
    </div>
  )
}
function HolidayCard({
  holiday,
  clinicHoliday,
  forPerson,
  showHome,
  template,
  onChange,
}: {
  holiday: HolidayHours
  clinicHoliday?: HolidayHours
  forPerson: boolean
  showHome: boolean
  template: Pause
  onChange: (holiday: HolidayHours) => void
}) {
  const source = forPerson && clinicHoliday ? clinicHoliday : holiday
  const open = forPerson ? clinicHoliday?.enabled === true : holiday.enabled
  const clinicBreak = forPerson ? clinicHoliday?.breaks?.[0] : undefined
  const ownBreak = holiday.breaks?.[0]
  const usingClinic = Boolean(clinicBreak) && !holiday.customBreak && sameBreak(ownBreak, clinicBreak)
  const hasBreak = holiday.breaks.length > 0
  return (
    <article className={open ? 'ob2-hours-daycard is-open is-holiday' : 'ob2-hours-daycard is-holiday'}>
      <span className="ob2-hours-holiday-star" aria-hidden>
        <Star size={20} fill="#ffe14a" />
      </span>
      {open && !forPerson ? (
        <span className="ob2-hours-daycheck" aria-hidden>
          <Check size={14} strokeWidth={3} />
        </span>
      ) : null}
      <div className="ob2-hours-daycopy">
        <strong>Feriados</strong>
        <p>
          {forPerson
            ? open
              ? `A clínica abre das ${source.start} às ${source.end}.`
              : 'A clínica não abre em feriados.'
            : open
              ? `Aberto das ${holiday.start} às ${holiday.end}.${hasBreak ? ` Intervalo das ${holiday.breaks[0].start} às ${holiday.breaks[0].end}.` : ''}`
              : 'Fechado. Ligue o botão se a clínica abre em feriados.'}
        </p>
      </div>
      <div className="ob2-hours-toggles">
        {forPerson ? null : (
          <Switch
            className="ob2-switch"
            isSelected={holiday.enabled}
            aria-label="Feriados abrem"
            onChange={(enabled) =>
              onChange({
                ...holiday,
                enabled,
                breaks:
                  enabled && template.enabled ? [{ start: template.start, end: template.end }] : [],
              })
            }
          >
            <Switch.Content>
              <Label>{holiday.enabled ? 'Abre neste dia' : 'Não abre neste dia'}</Label>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        )}
        {open && template.enabled && !forPerson ? (
            <Switch
              className="ob2-switch"
              isSelected={hasBreak}
              aria-label="Intervalo em feriados"
              onChange={(enabled) =>
                onChange({
                  ...holiday,
                  breaks: enabled ? [{ start: template.start, end: template.end }] : [],
                })
              }
            >
              <Switch.Content>
                <Label>Intervalo</Label>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          ) : null}
          {forPerson && clinicBreak ? (
            <Switch
              className="ob2-switch"
              isSelected={usingClinic}
              aria-label="Intervalo no horário da clínica em feriados"
              onChange={(enabled) =>
                onChange(
                  enabled
                    ? {
                        ...holiday,
                        customBreak: false,
                        breaks: [{ start: clinicBreak.start, end: clinicBreak.end }],
                      }
                    : { ...holiday, customBreak: true, breaks: [] },
                )
              }
            >
              <Switch.Content>
                <Label>Intervalo no horário da clínica</Label>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          ) : null}
          {forPerson && showHome ? (
            <Switch
              className="ob2-switch"
              isSelected={holiday.homeVisit === true}
              aria-label="Atende na casa da cliente em feriados"
              onChange={(enabled) => onChange({ ...holiday, homeVisit: enabled })}
            >
              <Switch.Content>
                <Label>Atende na casa da cliente</Label>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          ) : null}
        </div>
      {open && forPerson && clinicBreak && !usingClinic ? (
        <div className="ob2-hours is-compact">
          <TimePicker
            label="Início do intervalo"
            value={ownBreak?.start || clinicBreak.start}
            onChange={(start) =>
              onChange({
                ...holiday,
                customBreak: true,
                breaks: [{ start, end: ownBreak?.end || clinicBreak.end }],
              })
            }
          />
          <TimePicker
            label="Fim do intervalo"
            value={ownBreak?.end || clinicBreak.end}
            onChange={(end) =>
              onChange({
                ...holiday,
                customBreak: true,
                breaks: [{ start: ownBreak?.start || clinicBreak.start, end }],
              })
            }
          />
        </div>
      ) : null}
      {open && !forPerson ? (
        <div className="ob2-hours is-compact">
          <TimePicker
            label="Que horas abre"
            value={holiday.start}
            onChange={(start) => onChange({ ...holiday, start })}
          />
          <TimePicker
            label="Que horas fecha"
            value={holiday.end}
            onChange={(end) => onChange({ ...holiday, end })}
          />
        </div>
      ) : null}
      {open && !forPerson && !template.enabled ? (
        <div className="ob2-hours is-compact">
          <TimePicker
            label="Intervalo começa"
            value={ownBreak?.start || defaultBreak(holiday.start, holiday.end).start}
            onChange={(start) =>
              onChange({
                ...holiday,
                breaks: [
                  {
                    start,
                    end: ownBreak?.end || defaultBreak(holiday.start, holiday.end).end,
                  },
                ],
              })
            }
          />
          <TimePicker
            label="Intervalo termina"
            value={ownBreak?.end || defaultBreak(holiday.start, holiday.end).end}
            onChange={(end) =>
              onChange({
                ...holiday,
                breaks: [
                  {
                    start: ownBreak?.start || defaultBreak(holiday.start, holiday.end).start,
                    end,
                  },
                ],
              })
            }
          />
        </div>
      ) : null}
    </article>
  )
}

export function HoursStep({
  payload,
  setPayload,
  error,
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  footer: ReactNode
}) {
  const ready = syncProfessionalSchedules(payload)
  const solo = ready.teamMode === 'solo'
  const people = ready.professionalSchedules
  const you = solo ? people[0] : undefined
  const [picked, setPicked] = useState<string>('clinic')
  const known =
    picked === 'clinic' || people.some((person) => person.professionalId === picked)
  const selected = known ? picked : 'clinic'
  const editingClinic = selected === 'clinic'
  const activePerson = people.find((person) => person.professionalId === selected)
  const activeDays = editingClinic
    ? ready.businessHours
    : (activePerson?.days ?? ready.businessHours)
  const pause = readPause(ready.clinic, ready.businessHours)
  const showHome = ready.clinic.homeService === true
  const clinicHoliday = ready.clinic.holidayHours ?? emptyHoliday()
  const activeHoliday = editingClinic
    ? clinicHoliday
    : (activePerson?.holidayHours ?? { ...clinicHoliday, breaks: [...clinicHoliday.breaks], customBreak: false })

  function mirrorDays(personDays: DaySchedule[], clinicDays: DaySchedule[]) {
    return personDays.map((day) => {
      const clinic = clinicDays.find((item) => item.weekday === day.weekday)
      if (!clinic) return day
      return { ...day, enabled: clinic.enabled, start: clinic.start, end: clinic.end }
    })
  }

  function saveSchedule(days: DaySchedule[]) {
    const nextDays = cloneWeekSchedule(days)
    if (editingClinic) {
      setPayload({
        ...ready,
        businessHours: nextDays,
        professionalSchedules: ready.professionalSchedules.map((person) => ({
          ...person,
          days: cloneWeekSchedule(mirrorDays(person.days, nextDays)),
        })),
      })
      return
    }
    setPayload({
      ...ready,
      professionalSchedules: ready.professionalSchedules.map((person) =>
        person.professionalId === selected
          ? { ...person, days: cloneWeekSchedule(mirrorDays(nextDays, ready.businessHours)) }
          : person,
      ),
    })
  }

  function saveHoliday(holiday: HolidayHours) {
    if (editingClinic) {
      setPayload({
        ...ready,
        clinic: { ...ready.clinic, holidayHours: holiday },
        professionalSchedules: ready.professionalSchedules.map((person) => ({
          ...person,
          holidayHours: {
            ...(person.holidayHours ?? holiday),
            enabled: holiday.enabled,
            start: holiday.start,
            end: holiday.end,
          },
        })),
      })
      return
    }
    setPayload({
      ...ready,
      professionalSchedules: ready.professionalSchedules.map((person) =>
        person.professionalId === selected ? { ...person, holidayHours: holiday } : person,
      ),
    })
  }

  function saveTemplate(enabled: boolean, start: string, end: string) {
    const next = { enabled, start, end }
    const clinic = { ...ready.clinic }
    if (enabled) clinic.defaultBreak = { start, end }
    else delete clinic.defaultBreak
    setPayload({
      ...ready,
      clinic,
      businessHours: cloneWeekSchedule(applyTemplate(ready.businessHours, pause, next)),
      professionalSchedules: ready.professionalSchedules.map((person) => ({
        ...person,
        days: cloneWeekSchedule(applyTemplate(person.days, pause, next)),
      })),
    })
  }

  const cards = (
    <div className="ob2-hours-people">
      <Button
        className={
          selected === 'clinic'
            ? 'ob2-hours-person is-clinic is-selected'
            : 'ob2-hours-person is-clinic'
        }
        variant="ghost"
        aria-pressed={selected === 'clinic'}
        onPress={() => setPicked('clinic')}
      >
        <span className="ob2-hours-person-mark" aria-hidden>
          <Building2 size={26} />
        </span>
        <span className="ob2-hours-person-copy">
          <small className="ob2-hours-person-kicker">Comece por aqui</small>
          <strong>Clínica</strong>
          <small>{scheduleSummary(ready.businessHours)}</small>
        </span>
      </Button>
      {(solo ? (you ? [you] : []) : people).map((person) => {
        const profile = ready.professionals.find((item) => item.id === person.professionalId)
        const active = selected === person.professionalId
        return (
          <Button
            key={person.professionalId}
            className={active ? 'ob2-hours-person is-selected' : 'ob2-hours-person'}
            variant="ghost"
            aria-pressed={active}
            onPress={() => setPicked(person.professionalId)}
          >
            {solo ? (
              <span className="ob2-hours-person-mark is-solo" aria-hidden>
                <UserRound size={28} />
              </span>
            ) : (
              <Image
                className="ob2-hours-person-avatar"
                src={personPhoto(profile)}
                alt=""
                width={112}
                height={112}
              />
            )}
            <span className="ob2-hours-person-copy">
              {solo ? <small className="ob2-hours-person-kicker">Seu atendimento</small> : null}
              <strong>{solo ? 'Você' : person.name}</strong>
              <small>{scheduleSummary(person.days)}</small>
            </span>
          </Button>
        )
      })}
    </div>
  )

  return (
    <div className="ob2-stack ob2-hours-step">
      {solo ? (
        <Card className="ob2-panel ob2-guide-card">
          <Card.Content className="ob2-guide-body">
            <span className="ob2-guide-icon" aria-hidden>
              <Info size={18} />
            </span>
            <p className="ob2-guide-copy">
              A clínica e o seu atendimento ficam separados. Comece pela clínica: ligue os dias, o
              horário e o intervalo. Depois toque em Você para ajustar os dias em que você atende. O
              intervalo já vem ligado, e dá para desligar em um dia.
            </p>
          </Card.Content>
        </Card>
      ) : (
        <p className="ob2-hours-lead">
          Comece pelo card da clínica. Lá ficam os dias, o horário e o intervalo padrão. Depois
          toque na profissional: o intervalo já vem ligado nos dias em que cabe, e ela pode
          desligar.
        </p>
      )}
      {cards}
      <Card className="ob2-panel ob2-hours-card">
        <Card.Content className="ob2-hours-editor">
          {editingClinic ? (
            <div className="ob2-hours-pause-split">
              <div className="ob2-hours-pause">
                <h2 className="ob2-hours-editor-title">Intervalo padrão</h2>
                <p className="ob2-hours-hint">
                  Esse horário já vai para a clínica e para quem atende. Em cada dia dá para manter
                  essa pausa ou trocar por um horário só daquela pessoa.
                </p>
                <Switch
                  className="ob2-switch"
                  isSelected={pause.enabled}
                  onChange={(enabled) => saveTemplate(enabled, pause.start, pause.end)}
                >
                  <Switch.Content>
                    <Label>{pause.enabled ? 'Usar intervalo padrão' : 'Sem intervalo padrão'}</Label>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
                {pause.enabled ? (
                  <div className="ob2-hours is-compact">
                    <TimePicker
                      label="O intervalo começa"
                      value={pause.start}
                      onChange={(start) => saveTemplate(true, start, pause.end)}
                    />
                    <TimePicker
                      label="O intervalo termina"
                      value={pause.end}
                      onChange={(end) => saveTemplate(true, pause.start, end)}
                    />
                  </div>
                ) : null}
              </div>
              <DayDots days={activeDays} holidayOpen={activeHoliday.enabled} />
            </div>
          ) : (
            <div className="ob2-hours-pause-split">
              <div className="ob2-hours-block">
                <h2 className="ob2-hours-editor-title">{solo ? 'Você' : activePerson?.name}</h2>
                <p className="ob2-hours-hint">
                  {pause.enabled
                    ? `O intervalo padrão da clínica é das ${pause.start} às ${pause.end}. Nos dias em que a clínica tem pausa, ela já vem ligada. Se desligar, informe o intervalo só desta pessoa.`
                    : 'A clínica ainda não tem intervalo padrão. Se quiser uma pausa na agenda, volte no card Clínica e ligue o intervalo.'}
                </p>
              </div>
              <DayDots days={activeDays} holidayOpen={activeHoliday.enabled} />
            </div>
          )}

          <div className="ob2-hours-block">
            <h2 className="ob2-hours-editor-title">
              {editingClinic
                ? 'Dias em que a clínica abre'
                : solo
                  ? 'Dias em que você trabalha'
                  : `Dias em que ${activePerson?.name ?? 'esta pessoa'} trabalha`}
            </h2>
            <p className="ob2-hours-hint">
              {editingClinic
                ? 'Cada cartão é um dia. Ligue “Abre neste dia” e escolha o horário. O visto no canto mostra que o dia está aberto. O botão Intervalo liga a pausa só naquele dia. Feriados ficam no cartão com a estrela.'
                : 'Estes são os dias em que a clínica abre. O intervalo da clínica já vem ligado. Desligue para colocar outro horário só desta pessoa.'}
            </p>
          </div>

          <DayCards
            days={activeDays}
            clinicDays={editingClinic ? undefined : ready.businessHours}
            template={pause}
            showHome={showHome}
            forPerson={!editingClinic}
            holiday={activeHoliday}
            clinicHoliday={editingClinic ? undefined : clinicHoliday}
            onChange={saveSchedule}
            onHolidayChange={saveHoliday}
          />
        </Card.Content>
      </Card>
      <StepEnd error={error} footer={footer} />
    </div>
  )
}
