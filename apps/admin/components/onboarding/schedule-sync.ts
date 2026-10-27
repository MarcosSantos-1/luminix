import type { DaySchedule, HolidayHours, Payload, ProfessionalSchedule } from './model'
import { defaultBreak } from './time-picker'

export function defaultWeekSchedule(): Payload['businessHours'] {
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
    const enabled = weekday > 0 && weekday < 6
    const start = '09:00'
    const end = weekday === 6 ? '13:00' : '18:00'
    return {
      weekday,
      enabled,
      start,
      end,
      breaks: enabled ? [defaultBreak(start, end)] : [],
    }
  })
}

export function cloneWeekSchedule(source: Payload['businessHours']): Payload['businessHours'] {
  return source.map((day) => ({
    ...day,
    breaks: (day.breaks ?? []).map((item) => ({ ...item })),
  }))
}

function sameBreaks(
  left: { start: string; end: string }[] | undefined,
  right: { start: string; end: string }[] | undefined,
) {
  const first = left ?? []
  const second = right ?? []
  if (first.length !== second.length) return false
  return first.every(
    (item, index) => item.start === second[index]?.start && item.end === second[index]?.end,
  )
}

function dayMatchesClinic(day: DaySchedule, clinic: DaySchedule) {
  return (
    !day.customBreak &&
    day.enabled === clinic.enabled &&
    day.start === clinic.start &&
    day.end === clinic.end &&
    sameBreaks(day.breaks, clinic.breaks)
  )
}

function holidayMatches(person: HolidayHours | undefined, clinic: HolidayHours | undefined) {
  if (!person || !clinic) return !person?.customBreak
  return (
    !person.customBreak &&
    person.enabled === clinic.enabled &&
    person.start === clinic.start &&
    person.end === clinic.end &&
    sameBreaks(person.breaks, clinic.breaks)
  )
}

function withDefaultInterval(day: DaySchedule): DaySchedule {
  if (!day.enabled || day.customBreak || (day.breaks ?? []).length > 0) return day
  return { ...day, breaks: [defaultBreak(day.start, day.end)] }
}

export function copyClinicDays(clinicDays: DaySchedule[], prior?: DaySchedule[]) {
  return cloneWeekSchedule(clinicDays).map((day) => {
    const previous = prior?.find((item) => item.weekday === day.weekday)
    const next = previous?.homeVisit == null ? day : { ...day, homeVisit: previous.homeVisit }
    return withDefaultInterval(next)
  })
}

function withDefaultHolidayInterval(holiday: HolidayHours | undefined) {
  if (!holiday?.enabled || holiday.customBreak || holiday.breaks.length > 0) return holiday
  return { ...holiday, breaks: [defaultBreak(holiday.start, holiday.end)] }
}

export function copyClinicHoliday(clinic: HolidayHours | undefined, prior?: HolidayHours) {
  if (!clinic) return prior
  return {
    enabled: clinic.enabled,
    start: clinic.start,
    end: clinic.end,
    breaks: clinic.breaks.map((item) => ({ ...item })),
    homeVisit: prior?.homeVisit,
  }
}

function decidedFollows(
  prior: ProfessionalSchedule | undefined,
  clinicDays: DaySchedule[],
  clinicHoliday: HolidayHours | undefined,
) {
  if (!prior) return true
  if (typeof prior.followsClinicHours === 'boolean') return prior.followsClinicHours
  const daysMatch = prior.days.every((day) => {
    const clinic = clinicDays.find((item) => item.weekday === day.weekday)
    return clinic ? dayMatchesClinic(day, clinic) : true
  })
  return daysMatch && holidayMatches(prior.holidayHours, clinicHoliday)
}

export function syncProfessionalSchedules(payload: Payload): Payload {
  const roster = payload.professionals

  const existing = new Map(
    (payload.professionalSchedules ?? []).map((entry) => [entry.professionalId, entry]),
  )
  const clinicTemplate = cloneWeekSchedule(payload.businessHours)
  const clinicHoliday = payload.clinic.holidayHours
  const professionalSchedules: ProfessionalSchedule[] = roster.map((person) => {
    const prior = existing.get(person.id)
    const follows = decidedFollows(prior, clinicTemplate, clinicHoliday)
    return {
      professionalId: person.id,
      name: person.name.trim(),
      followsClinicHours: follows,
      days: (!prior || follows
        ? copyClinicDays(clinicTemplate, prior?.days)
        : cloneWeekSchedule(prior.days)
      ).map(withDefaultInterval),
      holidayHours: withDefaultHolidayInterval(
        follows
          ? clinicHoliday
            ? copyClinicHoliday(clinicHoliday, prior?.holidayHours)
            : undefined
          : prior?.holidayHours,
      ),
    }
  })
  return { ...payload, professionalSchedules }
}

export function validateDaySchedule(
  day: Payload['businessHours'][number],
  enabledLabel: string,
): string {
  const breaks = day.breaks ?? []
  if (!day.enabled) return ''
  if (day.start >= day.end) return `${enabledLabel}: o encerramento deve ser depois da abertura.`
  let cursor = day.start
  for (const item of [...breaks].sort((left, right) => left.start.localeCompare(right.start))) {
    if (item.start >= item.end)
      return `${enabledLabel}: o fim do intervalo deve ser depois do início.`
    if (item.start < cursor) return `${enabledLabel}: os intervalos não podem se sobrepor.`
    cursor = item.end
  }
  return ''
}

export function validateProfessionalDay(
  proDay: Payload['businessHours'][number],
  personName: string,
): string {
  return validateDaySchedule(proDay, personName)
}

export function validateClinicAndProfessionalHours(payload: Payload): string {
  for (const day of payload.businessHours) {
    const problem = validateDaySchedule(day, 'Clínica')
    if (problem) return problem
  }
  const synced = syncProfessionalSchedules(payload)
  for (const person of synced.professionalSchedules) {
    for (const day of person.days) {
      const problem = validateProfessionalDay(day, person.name)
      if (problem) return problem
    }
  }
  return ''
}

export function enforcePaymentPreferences(payload: Payload): Payload {
  if (payload.preferences.acceptInApp) return payload
  if (payload.preferences.packagePaymentMode === 'clinic_only') return payload
  return {
    ...payload,
    preferences: { ...payload.preferences, packagePaymentMode: 'clinic_only' },
  }
}
