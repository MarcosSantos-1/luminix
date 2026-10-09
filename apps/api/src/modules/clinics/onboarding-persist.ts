type OnboardingPayload = {
  uiFocus?: 'address' | 'hours' | 'payments' | 'rules'
  [key: string]: unknown
}

export type OnboardingDraftRow = {
  draft_version: number | string
  draft_step: string
  draft_payload: unknown
}

export function legacyOnboardingDraft(
  step: string,
  payload: OnboardingPayload,
): { step: string; payload: OnboardingPayload } | null {
  if (step === 'hours') {
    return { step: 'schedule', payload: { ...payload, uiFocus: 'hours' } }
  }
  if (step === 'payments') {
    return { step: 'preferences', payload: { ...payload, uiFocus: 'payments' } }
  }
  if (step === 'rules') {
    return { step: 'preferences', payload: { ...payload, uiFocus: 'rules' } }
  }
  return null
}

export async function saveOnboardingDraft(
  connection: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }> },
  clinicId: string,
  version: number,
  step: string,
  payload: OnboardingPayload,
): Promise<OnboardingDraftRow> {
  const persist = (draftStep: string, draftPayload: OnboardingPayload) =>
    connection.query(
      'SELECT * FROM luminix.save_onboarding_draft($1::uuid, $2::integer, $3::text, $4::jsonb)',
      [clinicId, version, draftStep, JSON.stringify(draftPayload)],
    )

  try {
    return (await persist(step, payload)).rows[0] as OnboardingDraftRow
  } catch (error) {
    if ((error as { code?: string })?.code !== '22023') throw error
    const legacy = legacyOnboardingDraft(step, payload)
    if (!legacy) throw error
    return (await persist(legacy.step, legacy.payload)).rows[0] as OnboardingDraftRow
  }
}
