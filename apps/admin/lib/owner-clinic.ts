import type { User } from 'firebase/auth'
import { DRAFT_CLINIC_NAME } from '@/lib/staff-destination'

/** Creates her first (draft) space; 409 means it already exists, which is fine. */
export async function bootstrapOwnerClinic(user: User): Promise<void> {
  const response = await fetch('/api/auth/owner-clinic', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: DRAFT_CLINIC_NAME }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok && response.status !== 409) throw new Error('Unavailable')
}
