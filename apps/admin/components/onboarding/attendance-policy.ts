import type { Payload, Service } from './model'

export type RetentionScope = 'none' | 'services' | 'all'

export function retentionScope(payload: Payload): RetentionScope {
  if (
    (payload.preferences.lateChangeRetentionPercent ?? 0) > 0 ||
    (payload.preferences.noShowRetentionPercent ?? 0) > 0
  )
    return 'all'
  return payload.services.some(
    (service) =>
      (service.lateChangeRetentionPercent ?? 0) > 0 || (service.noShowRetentionPercent ?? 0) > 0,
  )
    ? 'services'
    : 'none'
}

export function withRetentionScope(payload: Payload, scope: RetentionScope): Payload {
  if (scope === 'all') return payload
  return {
    ...payload,
    preferences: {
      ...payload.preferences,
      lateChangeRetentionPercent: 0,
      noShowRetentionPercent: 0,
    },
    services:
      scope === 'none'
        ? payload.services.map((service) => ({
            ...service,
            lateChangeRetentionPercent: null,
            noShowRetentionPercent: null,
          }))
        : payload.services,
  }
}

export function retentionScopeLabel(payload: Payload) {
  const scope = retentionScope(payload)
  if (scope === 'none') return 'Sem retenção em todos os serviços'
  if (scope === 'services') return 'Retenção somente em serviços específicos'
  return 'Regra geral com exceções por serviço'
}

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
  const deadline =
    service.cancellationHours == null
      ? ''
      : ` Prazo próprio de cancelamento: ${service.cancellationHours}h antes.`
  return `${service.name}: alteração tardia — ${retentionLabel(attendancePercent(preferences, service, 'lateChangeRetentionPercent'))}; falta — ${retentionLabel(attendancePercent(preferences, service, 'noShowRetentionPercent'))}.${deadline}`
}
