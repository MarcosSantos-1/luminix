import type { Payload, Service } from './model'

export type RetentionScope = 'none' | 'services' | 'all'
export type ServicePolicyPatch = Partial<
  Pick<Service, 'cancellationHours' | 'lateChangeRetentionPercent' | 'noShowRetentionPercent'>
>

export function applyServicePolicies(
  payload: Payload,
  ids: string[],
  patch: ServicePolicyPatch,
): Payload {
  const selected = new Set(ids)
  return {
    ...payload,
    services: payload.services.map((service) =>
      selected.has(service.id) ? { ...service, ...patch } : service,
    ),
  }
}

export function filterPolicyServices(
  services: Service[],
  query: string,
  filter: 'all' | 'special' | 'overrides',
) {
  const fold = (value: string) =>
    value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
  const needle = fold(query.trim())
  return services.filter(
    (service) =>
      (filter !== 'special' || service.bookingMode === 'manual_release') &&
      (filter !== 'overrides' ||
        service.cancellationHours != null ||
        service.lateChangeRetentionPercent != null ||
        service.noShowRetentionPercent != null) &&
      fold(`${service.name} ${service.category} ${service.resourceName}`).includes(needle),
  )
}

export function retentionOptions(current = 0) {
  return [...new Set([0, 10, 20, 25, 30, 50, current])]
    .sort((a, b) => a - b)
    .map((percent) => ({ id: String(percent), label: retentionLabel(percent) }))
}

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
