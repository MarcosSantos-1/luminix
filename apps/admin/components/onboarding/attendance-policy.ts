import type { Payload } from './model'

/**
 * What happens to the deposit after a late cancellation or a no-show. Percentages apply to
 * the amount paid in advance, so 100 means the deposit itself and never more than it.
 */
export type SinalOutcome = 'refund' | 'no_show' | 'late_or_no_show'

const outcomeValues: Record<SinalOutcome, { late: number; noShow: number }> = {
  refund: { late: 0, noShow: 0 },
  no_show: { late: 0, noShow: 100 },
  late_or_no_show: { late: 100, noShow: 100 },
}

export const sinalOutcomeOptions: { id: SinalOutcome; title: string; detail: string }[] = [
  {
    id: 'refund',
    title: 'Devolver sempre',
    detail: 'O sinal volta para a cliente em qualquer caso',
  },
  {
    id: 'no_show',
    title: 'Ficar com o sinal só se faltar sem avisar',
    detail: 'Avisou, mesmo em cima da hora: o sinal é devolvido',
  },
  {
    id: 'late_or_no_show',
    title: 'Ficar com o sinal se cancelar depois do prazo ou faltar',
    detail: 'Avisou dentro do prazo: o sinal é devolvido',
  },
]

/** Returns `custom` for older drafts with percentages or per-service exceptions. */
export function sinalOutcome(payload: Payload): SinalOutcome | 'custom' {
  const late = payload.preferences.lateChangeRetentionPercent ?? 0
  const noShow = payload.preferences.noShowRetentionPercent ?? 0
  const overridden = payload.services.some(
    (service) =>
      (service.lateChangeRetentionPercent ?? late) !== late ||
      (service.noShowRetentionPercent ?? noShow) !== noShow,
  )
  if (overridden) return 'custom'
  const match = (Object.keys(outcomeValues) as SinalOutcome[]).find(
    (id) => outcomeValues[id].late === late && outcomeValues[id].noShow === noShow,
  )
  return match ?? 'custom'
}

export function withSinalOutcome(payload: Payload, outcome: SinalOutcome): Payload {
  const values = outcomeValues[outcome]
  return {
    ...payload,
    preferences: {
      ...payload.preferences,
      lateChangeRetentionPercent: values.late,
      noShowRetentionPercent: values.noShow,
    },
    services: payload.services.map((service) =>
      service.lateChangeRetentionPercent == null && service.noShowRetentionPercent == null
        ? service
        : { ...service, lateChangeRetentionPercent: null, noShowRetentionPercent: null },
    ),
  }
}

export function sinalOutcomeLabel(payload: Payload) {
  const outcome = sinalOutcome(payload)
  if (outcome === 'custom') return 'Regra personalizada salva anteriormente'
  return sinalOutcomeOptions.find((option) => option.id === outcome)?.title ?? ''
}
