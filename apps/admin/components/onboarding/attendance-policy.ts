import type { Payload, Service } from './model'

export function attendancePercent(
  preferences: Payload['preferences'],
  service: Service | undefined,
  event: 'lateChangeRetentionPercent' | 'noShowRetentionPercent',
) {
  return service?.[event] ?? preferences[event] ?? 0
}

export function retentionLabel(percent: number) {
  return percent === 0 ? 'Sem retenção' : `Reter ${percent}% do valor pago pelo atendimento avulso`
}

export function serviceRetentionSummary(service: Service, preferences: Payload['preferences']) {
  return `${service.name}: alteração tardia — ${retentionLabel(attendancePercent(preferences, service, 'lateChangeRetentionPercent'))}; falta — ${retentionLabel(attendancePercent(preferences, service, 'noShowRetentionPercent'))}.`
}
