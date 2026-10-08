import { describe, expect, it, vi } from 'vitest'
import { legacyOnboardingDraft, saveOnboardingDraft } from '../src/modules/clinics/onboarding-persist.js'

describe('onboarding draft persistence', () => {
  it('maps new steps to legacy draft markers', () => {
    expect(legacyOnboardingDraft('hours', {})).toEqual({
      step: 'schedule',
      payload: { uiFocus: 'hours' },
    })
    expect(legacyOnboardingDraft('payments', { name: 'A' })).toEqual({
      step: 'preferences',
      payload: { name: 'A', uiFocus: 'payments' },
    })
  })

  it('retries with legacy mapping when the database rejects a new step', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('Invalid draft'), { code: '22023' }))
      .mockResolvedValueOnce({ rows: [{ draft_version: 2, draft_step: 'schedule', draft_payload: {} }] })
    const row = await saveOnboardingDraft({ query }, '00000000-0000-4000-8000-000000000001', 1, 'hours', {})
    expect(row).toEqual({ draft_version: 2, draft_step: 'schedule', draft_payload: {} })
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[1][1][2]).toBe('schedule')
  })
})
