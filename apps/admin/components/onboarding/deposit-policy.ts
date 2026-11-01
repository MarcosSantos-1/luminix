import type { Payload, Service } from './model.ts'

export function serviceNeedsDeposit(service: Service, preferences: Payload['preferences']) {
  switch (preferences.depositScope ?? 'none') {
    case 'all':
      return true
    case 'special':
      return service.bookingMode === 'manual_release'
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

export function depositSummary(payload: Payload) {
  const scope = payload.preferences.depositScope ?? 'none'
  if (scope === 'none') return 'Sem sinal'
  const labels = {
    all: 'todos os tratamentos avulsos',
    special: 'tratamentos especiais com locação',
    selected:
      payload.services
        .filter((service) => service.depositRequired)
        .map((service) => service.name)
        .join(', ') || 'nenhum tratamento selecionado',
    threshold: `avulsos acima de ${((payload.preferences.depositThresholdCents ?? 30000) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
  }
  return `${payload.preferences.depositPercent ?? 20}% de sinal para ${labels[scope]}. Abatido do total; cobrança ainda não ativada.`
}
