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
import {
  cloneWeekSchedule,
  copyClinicDays,
  copyClinicHoliday,
  syncProfessionalSchedules,
} from './schedule-sync'
import { defaultBreak, TimePicker } from './time-picker'
import { StepEnd, type FieldErrors } from './ui'

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

function patchDay(days: DaySchedule[], weekday: number, patch: Partial<DaySchedule>) {
  return days.map((day) => {
    if (day.weekday !== weekday) return day
    const next = { ...day, ...patch }
    if (patch.enabled === false) return { ...next, enabled: false, breaks: [] }
    if (patch.enabled === true && (next.breaks ?? []).length === 0) {
      return { ...next, enabled: true, breaks: [defaultBreak(next.start, next.end)] }
    }
    return next
  })
}

function setDayInterval(
  days: DaySchedule[],
  weekday: number,
  enabled: boolean,
  ownSchedule: boolean,
) {
  return days.map((day) => {
    if (day.weekday !== weekday) return day
    if (!enabled) return { ...day, customBreak: ownSchedule ? true : day.customBreak, breaks: [] }
    return {
      ...day,
      customBreak: false,
      breaks: [day.breaks?.[0] ?? defaultBreak(day.start, day.end)],
    }
  })
}

function setDayBreakTimes(days: DaySchedule[], weekday: number, start: string, end: string) {
  return days.map((day) => (day.weekday === weekday ? { ...day, breaks: [{ start, end }] } : day))
}

function describeDay(day: DaySchedule, locked: boolean, forPerson: boolean) {
  if (!day.enabled) {
    if (locked) return 'A clínica não abre neste dia.'
    return forPerson
      ? 'Não trabalha neste dia. Ligue o botão se entra na escala.'
      : 'Fechado. Ligue o botão se abre neste dia.'
  }
  const pause = day.breaks?.[0]
  const interval = pause ? ` Intervalo das ${pause.start} às ${pause.end}.` : ''
  const verb = locked ? 'A clínica abre' : forPerson ? 'Trabalha' : 'Aberto'
  return `${verb} das ${day.start} às ${day.end}.${interval}`
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
            <span
              className={
                holidayOpen ? 'ob2-hours-dot is-on is-holiday' : 'ob2-hours-dot is-holiday'
              }
            >
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
  locked,
  forPerson,
  showHome,
  holiday,
  onChange,
  onHolidayChange,
}: {
  days: DaySchedule[]
  locked: boolean
  forPerson: boolean
  showHome: boolean
  holiday: HolidayHours
  onChange: (days: DaySchedule[]) => void
  onHolidayChange: (holiday: HolidayHours) => void
}) {
  return (
    <div className="ob2-hours-daylist">
      {orderedDays(days).map((day) => {
        const open = day.enabled
        const pause = day.breaks?.[0]
        return (
          <article
            className={open ? 'ob2-hours-daycard is-open' : 'ob2-hours-daycard'}
            key={day.weekday}
          >
            {open ? (
              <span className="ob2-hours-daycheck" aria-hidden>
                <Check size={14} strokeWidth={3} />
              </span>
            ) : null}
            <div className="ob2-hours-daycopy">
              <strong>{dayNames[day.weekday]}</strong>
              <p>{describeDay(day, locked, forPerson)}</p>
            </div>
            <div className="ob2-hours-toggles">
              {locked ? null : (
                <Switch
                  className="ob2-switch"
                  isSelected={day.enabled}
                  aria-label={`${dayNames[day.weekday]} ${
                    forPerson
                      ? day.enabled
                        ? 'trabalha'
                        : 'não trabalha'
                      : day.enabled
                        ? 'abre'
                        : 'está fechado'
                  }`}
                  onChange={(enabled) => onChange(patchDay(days, day.weekday, { enabled }))}
                >
                  <Switch.Content>
                    <Label>
                      {forPerson
                        ? day.enabled
                          ? 'Trabalha neste dia'
                          : 'Não trabalha neste dia'
                        : day.enabled
                          ? 'Abre neste dia'
                          : 'Não abre neste dia'}
                    </Label>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              )}
              {open && !locked ? (
                <Switch
                  className="ob2-switch"
                  isSelected={Boolean(pause)}
                  aria-label={`${forPerson ? 'Intervalo' : 'Intervalo fixo'} de ${dayNames[day.weekday]}`}
                  onChange={(enabled) =>
                    onChange(setDayInterval(days, day.weekday, enabled, forPerson))
                  }
                >
                  <Switch.Content>
                    <Label>{forPerson ? 'Intervalo' : 'Intervalo fixo'}</Label>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              ) : null}
              {showHome ? (
                <Switch
                  className="ob2-switch"
                  isSelected={day.homeVisit === true}
                  aria-label={`Atende na casa da cliente em ${dayNames[day.weekday]}`}
                  onChange={(enabled) =>
                    onChange(patchDay(days, day.weekday, { homeVisit: enabled }))
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
            {open && !locked ? (
              <div className="ob2-hours is-compact">
                <TimePicker
                  label="Que horas abre"
                  value={day.start}
                  onChange={(start) => onChange(patchDay(days, day.weekday, { start }))}
                />
                <TimePicker
                  label="Que horas fecha"
                  value={day.end}
                  onChange={(end) => onChange(patchDay(days, day.weekday, { end }))}
                />
              </div>
            ) : null}
            {open && !locked && pause ? (
              <div className="ob2-hours is-compact">
                <TimePicker
                  label="Intervalo começa"
                  value={pause.start}
                  onChange={(start) =>
                    onChange(setDayBreakTimes(days, day.weekday, start, pause.end))
                  }
                />
                <TimePicker
                  label="Intervalo termina"
                  value={pause.end}
                  onChange={(end) =>
                    onChange(setDayBreakTimes(days, day.weekday, pause.start, end))
                  }
                />
              </div>
            ) : null}
          </article>
        )
      })}
      <HolidayCard
        holiday={holiday}
        locked={locked}
        forPerson={forPerson}
        showHome={showHome}
        onChange={onHolidayChange}
      />
    </div>
  )
}

function HolidayCard({
  holiday,
  locked,
  forPerson,
  showHome,
  onChange,
}: {
  holiday: HolidayHours
  locked: boolean
  forPerson: boolean
  showHome: boolean
  onChange: (holiday: HolidayHours) => void
}) {
  const open = holiday.enabled
  const pause = holiday.breaks?.[0]
  const turnOn = (enabled: boolean) => {
    if (!enabled) {
      onChange({
        ...holiday,
        enabled: false,
        breaks: [],
        customBreak: forPerson ? true : holiday.customBreak,
      })
      return
    }
    onChange({
      ...holiday,
      enabled: true,
      customBreak: false,
      breaks:
        holiday.breaks.length > 0 ? holiday.breaks : [defaultBreak(holiday.start, holiday.end)],
    })
  }
  return (
    <article
      className={open ? 'ob2-hours-daycard is-open is-holiday' : 'ob2-hours-daycard is-holiday'}
    >
      <span className="ob2-hours-holiday-star" aria-hidden>
        <Star size={20} fill="#ffe14a" />
      </span>
      {open ? (
        <span className="ob2-hours-daycheck" aria-hidden>
          <Check size={14} strokeWidth={3} />
        </span>
      ) : null}
      <div className="ob2-hours-daycopy">
        <strong>Feriados</strong>
        <p>
          {open
            ? `${locked ? 'A clínica abre' : forPerson ? 'Trabalha' : 'Aberto'} das ${holiday.start} às ${holiday.end}.${
                pause ? ` Intervalo das ${pause.start} às ${pause.end}.` : ''
              }`
            : locked
              ? 'A clínica não abre em feriados.'
              : forPerson
                ? 'Não trabalha em feriados. Ligue o botão se atende nesses dias.'
                : 'Fechado. Ligue o botão se a clínica abre em feriados.'}
        </p>
      </div>
      <div className="ob2-hours-toggles">
        {locked ? null : (
          <Switch
            className="ob2-switch"
            isSelected={holiday.enabled}
            aria-label={forPerson ? 'Trabalha em feriados' : 'Feriados abrem'}
            onChange={turnOn}
          >
            <Switch.Content>
              <Label>
                {forPerson
                  ? holiday.enabled
                    ? 'Trabalha neste feriado'
                    : 'Não trabalha neste feriado'
                  : holiday.enabled
                    ? 'Abre neste dia'
                    : 'Não abre neste dia'}
              </Label>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        )}
        {open && !locked ? (
          <Switch
            className="ob2-switch"
            isSelected={Boolean(pause)}
            aria-label={forPerson ? 'Intervalo em feriados' : 'Intervalo fixo em feriados'}
            onChange={(enabled) =>
              onChange({
                ...holiday,
                customBreak: enabled ? false : forPerson ? true : holiday.customBreak,
                breaks: enabled ? [pause ?? defaultBreak(holiday.start, holiday.end)] : [],
              })
            }
          >
            <Switch.Content>
              <Label>{forPerson ? 'Intervalo' : 'Intervalo fixo'}</Label>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
            </Switch.Content>
          </Switch>
        ) : null}
        {showHome ? (
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
      {open && !locked ? (
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
      {open && !locked && pause ? (
        <div className="ob2-hours is-compact">
          <TimePicker
            label="Intervalo começa"
            value={pause.start}
            onChange={(start) => onChange({ ...holiday, breaks: [{ start, end: pause.end }] })}
          />
          <TimePicker
            label="Intervalo termina"
            value={pause.end}
            onChange={(end) => onChange({ ...holiday, breaks: [{ start: pause.start, end }] })}
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
  fieldErrors = {},
  footer,
}: {
  payload: Payload
  setPayload: (value: Payload) => void
  error: string
  fieldErrors?: FieldErrors
  footer: ReactNode
}) {
  const ready = syncProfessionalSchedules(payload)
  const solo = ready.teamMode === 'solo'
  const people = ready.professionalSchedules
  const you = solo ? people[0] : undefined
  const [picked, setPicked] = useState<string>('clinic')
  const known = picked === 'clinic' || people.some((person) => person.professionalId === picked)
  const selected = known ? picked : 'clinic'
  const editingClinic = selected === 'clinic'
  const activePerson = people.find((person) => person.professionalId === selected)
  const follows = !editingClinic && activePerson?.followsClinicHours !== false
  const activeDays = editingClinic
    ? ready.businessHours
    : (activePerson?.days ?? ready.businessHours)
  const showHome = ready.clinic.homeService === true
  const clinicHoliday = ready.clinic.holidayHours ?? emptyHoliday()
  const activeHoliday = editingClinic
    ? clinicHoliday
    : (activePerson?.holidayHours ?? emptyHoliday())

  function saveSchedule(days: DaySchedule[]) {
    const nextDays = cloneWeekSchedule(days)
    if (editingClinic) {
      setPayload(syncProfessionalSchedules({ ...ready, businessHours: nextDays }))
      return
    }
    setPayload({
      ...ready,
      professionalSchedules: ready.professionalSchedules.map((person) =>
        person.professionalId === selected ? { ...person, days: nextDays } : person,
      ),
    })
  }

  function saveHoliday(holiday: HolidayHours) {
    if (editingClinic) {
      setPayload(
        syncProfessionalSchedules({
          ...ready,
          clinic: { ...ready.clinic, holidayHours: holiday },
        }),
      )
      return
    }
    setPayload({
      ...ready,
      professionalSchedules: ready.professionalSchedules.map((person) =>
        person.professionalId === selected ? { ...person, holidayHours: holiday } : person,
      ),
    })
  }

  function setFollows(enabled: boolean) {
    if (!activePerson) return
    setPayload({
      ...ready,
      professionalSchedules: ready.professionalSchedules.map((person) => {
        if (person.professionalId !== activePerson.professionalId) return person
        return {
          ...person,
          followsClinicHours: enabled,
          days: copyClinicDays(ready.businessHours, person.days),
          holidayHours: copyClinicHoliday(
            ready.clinic.holidayHours ?? emptyHoliday(),
            person.holidayHours,
          ),
        }
      }),
    })
  }

  const personName = solo ? 'Você' : activePerson?.name
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
        <span
          className={
            ready.clinic.logoUrl ? 'ob2-hours-person-mark has-logo' : 'ob2-hours-person-mark'
          }
          aria-hidden
        >
          {ready.clinic.logoUrl ? (
            <Image
              className="ob2-hours-clinic-logo"
              src={ready.clinic.logoUrl}
              alt=""
              fill
              sizes="72px"
            />
          ) : (
            <Building2 size={26} />
          )}
        </span>
        <span className="ob2-hours-person-copy">
          <small className="ob2-hours-person-kicker">Comece por aqui</small>
          <strong>Clínica</strong>
          <small>{scheduleSummary(ready.businessHours)}</small>
        </span>
        <span className="ob2-choice-mark is-single" aria-hidden />
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
            <span className="ob2-choice-mark is-single" aria-hidden />
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
              Comece pela clínica: ligue os dias, o horário e o intervalo de cada dia. Depois toque
              em Você. O atendimento segue a clínica até você desligar “Seguir horário da clínica”.
            </p>
          </Card.Content>
        </Card>
      ) : (
        <p className="ob2-hours-lead">
          Comece pelo card da clínica. Cada dia tem o próprio horário e intervalo. A profissional
          segue esse horário até você desligar “Seguir horário da clínica”.
        </p>
      )}
      {cards}
      <Card className="ob2-panel ob2-hours-card">
        <Card.Content className="ob2-hours-editor">
          <div className="ob2-hours-head" data-field="hours">
            <div className="ob2-hours-block">
              <h2 className="ob2-hours-editor-title">
                {editingClinic
                  ? 'Dias em que a clínica abre'
                  : solo
                    ? 'Dias em que você trabalha'
                    : `Dias em que ${personName ?? 'esta pessoa'} trabalha`}
              </h2>
              <p className="ob2-hours-hint">
                {editingClinic
                  ? 'Cada cartão é um dia. Ligue “Abre neste dia”, escolha o horário e o intervalo daquele dia. O visto no canto mostra que o dia está aberto. Feriados ficam no cartão com a estrela.'
                  : follows
                    ? 'Estes horários acompanham a clínica. Desligue “Seguir horário da clínica” para alterar só esta pessoa. O atendimento em domicílio continua em cada dia.'
                    : 'Estes horários são só desta pessoa. Cada dia tem o próprio intervalo. Ligue “Seguir horário da clínica” para voltar a acompanhar a clínica.'}
              </p>
              {editingClinic ? null : (
                <Switch
                  className="ob2-switch"
                  isSelected={follows}
                  aria-label="Seguir horário da clínica"
                  onChange={setFollows}
                >
                  <Switch.Content>
                    <Label>
                      {follows ? 'Seguir horário da clínica' : 'Horário próprio desta pessoa'}
                    </Label>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                  </Switch.Content>
                </Switch>
              )}
              {fieldErrors.hours ? (
                <p className="ob2-field-error" role="alert">
                  {fieldErrors.hours}
                </p>
              ) : null}
            </div>
            <DayDots days={activeDays} holidayOpen={activeHoliday.enabled} />
          </div>
          <DayCards
            days={activeDays}
            locked={follows}
            forPerson={!editingClinic}
            showHome={showHome && !editingClinic}
            holiday={activeHoliday}
            onChange={saveSchedule}
            onHolidayChange={saveHoliday}
          />
        </Card.Content>
      </Card>
      <StepEnd error={error} footer={footer} />
    </div>
  )
}
