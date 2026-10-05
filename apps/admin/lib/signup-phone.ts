import { isCompletePhone } from '@/lib/phone'

const storageKey = (uid: string) => `luminix.signup.phone:${uid}`

export function storeSignupPhone(uid: string, e164: string) {
  if (!uid || !isCompletePhone(e164)) return
  try {
    sessionStorage.setItem(storageKey(uid), e164)
  } catch {
    /* private mode / blocked storage */
  }
}

/** Reads and removes the phone saved at signup for this uid. */
export function takeSignupPhone(uid: string): string | null {
  if (!uid) return null
  try {
    const value = sessionStorage.getItem(storageKey(uid))
    if (!value) return null
    sessionStorage.removeItem(storageKey(uid))
    return isCompletePhone(value) ? value : null
  } catch {
    return null
  }
}

export function peekSignupPhone(uid: string): string | null {
  if (!uid) return null
  try {
    const value = sessionStorage.getItem(storageKey(uid))
    return value && isCompletePhone(value) ? value : null
  } catch {
    return null
  }
}

export function clearSignupPhone(uid: string) {
  if (!uid) return
  try {
    sessionStorage.removeItem(storageKey(uid))
  } catch {
    /* ignore */
  }
}
