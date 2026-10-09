import type { Payload, ProfessionalSchedule } from './model'

export function defaultWeekSchedule(): Payload['businessHours'] {
  return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
    weekday,
    enabled: weekday > 0 && weekday < 6,
    start: '09:00',
    end: weekday === 6 ? '13:00' : '18:00',
    breaks: [],
  }))
}

export function cloneWeekSchedule(source: Payload['businessHours']): Payload['businessHours'] {
  return source.map((day) => ({
    ...day,
    breaks: (day.breaks ?? []).map((item) => ({ ...item })),
  }))
}

export function syncProfessionalSchedules(payload: Payload): Payload {
  const roster = payload.professionals

  const existing = new Map(
    (payload.professionalSchedules ?? []).map((entry) => [entry.professionalId, entry]),
  )
  const clinicTemplate = cloneWeekSchedule(payload.businessHours)
  const professionalSchedules: ProfessionalSchedule[] = roster.map((person) => {
    const prior = existing.get(person.id)
    return {
      professionalId: person.id,
      name: person.name.trim(),
      days: prior ? cloneWeekSchedule(prior.days) : cloneWeekSchedule(clinicTemplate),
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
    if (item.start < day.start || item.end > day.end || item.start < cursor)
      return `${enabledLabel}: cada intervalo precisa caber no horário, sem sobrepor outro.`
    cursor = item.end
  }
  return ''
}

export function validateProfessionalDay(
  proDay: Payload['businessHours'][number],
  clinicDay: Payload['businessHours'][number],
  personName: string,
): string {
  const dayLabel = `${personName}`
  const base = validateDaySchedule(proDay, dayLabel)
  if (base) return base
  if (!proDay.enabled) return ''
  if (!clinicDay.enabled)
    return `${personName} não pode atender quando a clínica está fechada neste dia.`
  if (proDay.start < clinicDay.start || proDay.end > clinicDay.end)
    return `${personName}: o atendimento precisa ficar dentro do horário da clínica (${clinicDay.start}–${clinicDay.end}).`
  return ''
}

export function validateClinicAndProfessionalHours(payload: Payload): string {
  for (const day of payload.businessHours) {
    const problem = validateDaySchedule(day, 'Clínica')
    if (problem) return problem
  }
  const synced = syncProfessionalSchedules(payload)
  const clinicByWeekday = new Map(synced.businessHours.map((day) => [day.weekday, day]))
  for (const person of synced.professionalSchedules) {
    for (const day of person.days) {
      const clinicDay = clinicByWeekday.get(day.weekday)
      if (!clinicDay) continue
      const problem = validateProfessionalDay(day, clinicDay, person.name)
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
