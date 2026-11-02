import type { Payload, Service } from './model.ts'

export function isSpecialService(service: Pick<Service, 'bookingMode'>) {
  return service.bookingMode === 'manual_release'
}

export function serviceNeedsDeposit(service: Service, preferences: Payload['preferences']) {
  switch (preferences.depositScope ?? 'none') {
    case 'all':
      return true
    case 'special':
      return isSpecialService(service)
    case 'selected':
      return service.depositRequired === true
    case 'threshold':
      // A quote/from price is not a final agreed price. Resolve at checkout, not here.
      return (
        service.priceType === 'fixed' &&
        service.priceCents > (preferences.depositThresholdCents ?? 30000)
      )
    default:
      return false
  }
}

/**
 * The onboarding only offers an explicit selection. Older scopes become the same services
 * marked one by one. Returns the same object when nothing changes.
 */
export function normalizeLegacyDepositScope(payload: Payload): Payload {
  const preferences = payload.preferences
  const scope = preferences.depositScope ?? 'none'
  if (scope === 'none' || scope === 'selected') return payload
  return {
    ...payload,
    preferences: { ...preferences, depositScope: 'selected' },
    services: payload.services.map((service) => {
      const required = serviceNeedsDeposit(service, preferences)
      return service.depositRequired === required
        ? service
        : { ...service, depositRequired: required }
    }),
  }
}

/** Turning the deposit on for the first time pre-marks special treatments, as recommended. */
export function withDepositEnabled(payload: Payload, enabled: boolean): Payload {
  const preferences = {
    ...payload.preferences,
    depositScope: enabled ? ('selected' as const) : ('none' as const),
  }
  if (!enabled) return { ...payload, preferences }
  const next = normalizeLegacyDepositScope({ ...payload, preferences })
  if (next.services.some((service) => service.depositRequired)) return next
  return {
    ...next,
    services: next.services.map((service) =>
      isSpecialService(service) ? { ...service, depositRequired: true } : service,
    ),
  }
}

export function setServicesDeposit(payload: Payload, ids: string[], required: boolean): Payload {
  const selected = new Set(ids)
  return {
    ...payload,
    services: payload.services.map((service) =>
      selected.has(service.id) && (service.depositRequired === true) !== required
        ? { ...service, depositRequired: required }
        : service,
    ),
  }
}

/** Blocks continuing with a deposit turned on but not fully configured. */
export function depositProblem(payload: Payload): { field: string; message: string } | null {
  const preferences = payload.preferences
  if ((preferences.depositScope ?? 'none') === 'none') return null
  if (preferences.depositPercent == null)
    return { field: 'depositPercent', message: 'Escolha quanto do preço será pago como sinal.' }
  if (!payload.services.some((service) => serviceNeedsDeposit(service, preferences)))
    return {
      field: 'depositServices',
      message: 'Escolha ao menos um serviço com sinal, ou marque “Não, por enquanto”.',
    }
  return null
}

export function depositSummary(payload: Payload) {
  const preferences = payload.preferences
  if ((preferences.depositScope ?? 'none') === 'none')
    return 'Sem sinal. Todas as reservas gratuitas.'
  const withDeposit = payload.services.filter((service) =>
    serviceNeedsDeposit(service, preferences),
  )
  const special = withDeposit.filter(isSpecialService).length
  const free = payload.services.length - withDeposit.length
  const count = `${withDeposit.length} ${withDeposit.length === 1 ? 'serviço' : 'serviços'}`
  const specialNote =
    special > 0 && special === withDeposit.length
      ? special === 1
        ? ' especial'
        : ' especiais'
      : special
        ? ` (${special} ${special === 1 ? 'especial' : 'especiais'})`
        : ''
  const rest = free ? ` Os demais: reserva gratuita.` : ''
  const percent =
    preferences.depositPercent == null ? 'Percentual a definir' : `${preferences.depositPercent}%`
  return `${percent} de sinal em ${count}${specialNote}, abatido do total.${rest} Cobrança ainda não ativada.`
}
