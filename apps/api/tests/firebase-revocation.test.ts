import { expect, it, vi } from 'vitest'

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }))
vi.mock('firebase-admin/app', () => ({
  getApps: () => [{ name: 'luminix-api' }],
  applicationDefault: vi.fn(),
  cert: vi.fn(),
  initializeApp: vi.fn(),
}))
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }))

import { verifyFirebaseIdToken } from '../src/shared/integrations/firebase/admin.js'

it('always asks Firebase to check revocation, including disabled users', async () => {
  verifyIdToken.mockResolvedValueOnce({ uid: 'verified-uid' })
  expect(await verifyFirebaseIdToken('id-token')).toEqual({ uid: 'verified-uid' })
  expect(verifyIdToken).toHaveBeenCalledWith('id-token', true)
  verifyIdToken.mockRejectedValueOnce(new Error('auth/id-token-revoked'))
  await expect(verifyFirebaseIdToken('old-token')).rejects.toThrow('auth/id-token-revoked')
})
