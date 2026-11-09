import type { Auth } from 'firebase-admin/auth'
import { getFirebaseAdminAuth } from './admin.js'

/** Staff accounts live in Firebase Auth; the database only stores the Firebase UID. */
export type StaffDirectory = {
  /** Finds the account for an e-mail or creates one without a password. */
  ensureAccount(email: string, displayName: string): Promise<{ uid: string; created: boolean }>
  /** Last sign-in and disabled flag; unknown UIDs are omitted. */
  describe(uids: string[]): Promise<Map<string, { lastSignInAt: string | null; disabled: boolean }>>
}

export function createFirebaseStaffDirectory(
  getAuth: () => Auth = getFirebaseAdminAuth,
): StaffDirectory {
  return {
    async ensureAccount(email, displayName) {
      const auth = getAuth()
      try {
        const user = await auth.getUserByEmail(email)
        return { uid: user.uid, created: false }
      } catch (error) {
        if ((error as { code?: string }).code !== 'auth/user-not-found') throw error
      }
      // No password: the person sets one through the e-mail sent by the admin panel.
      const user = await auth.createUser({ email, displayName, emailVerified: false })
      return { uid: user.uid, created: true }
    },
    async describe(uids) {
      const result = new Map<string, { lastSignInAt: string | null; disabled: boolean }>()
      const auth = getAuth()
      for (let index = 0; index < uids.length; index += 100) {
        const { users } = await auth.getUsers(
          uids.slice(index, index + 100).map((uid) => ({ uid })),
        )
        for (const user of users)
          result.set(user.uid, {
            lastSignInAt: user.metadata.lastSignInTime
              ? new Date(user.metadata.lastSignInTime).toISOString()
              : null,
            disabled: user.disabled,
          })
      }
      return result
    },
  }
}
