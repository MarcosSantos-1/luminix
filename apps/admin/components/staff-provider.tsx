'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  browserSessionPersistence,
  onIdTokenChanged,
  setPersistence,
  signOut,
  type User,
} from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'

export type StaffClinic = { id: string; name: string; status: 'draft' | 'active'; role: string }
type StaffState = {
  user: User | null
  loading: boolean
  error: string
  clinics: StaffClinic[]
  nextCursor: string | null
  revision: number
  refresh: () => void
}
const StaffContext = createContext<StaffState | null>(null)
export function StaffProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clinics, setClinics] = useState<StaffClinic[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [retry, setRetry] = useState(0)
  const refresh = useCallback(() => setRetry((value) => value + 1), [])
  useEffect(() => {
    let active = true
    let generation = 0
    let abort: AbortController | undefined
    let unsubscribe: (() => void) | undefined
    const sync = async (currentUser: User | null) => {
      const current = ++generation
      abort?.abort()
      abort = new AbortController()
      const signal = abort.signal
      setLoading(true)
      setUser(currentUser)
      setClinics([])
      setNextCursor(null)
      setError('')
      try {
        if (currentUser) {
          const response = await fetch('/api/auth/clinics', {
            headers: { authorization: `Bearer ${await currentUser.getIdToken()}` },
            cache: 'no-store',
            signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
          })
          if (!response.ok) {
            if ([401, 403].includes(response.status)) await signOut(getFirebaseAuth())
            throw new Error('Session unavailable')
          }
          const data = await response.json()
          if (active && current === generation) {
            setClinics(data.clinics)
            setNextCursor(data.nextCursor)
          }
        }
      } catch {
        if (active && current === generation)
          setError('Não foi possível validar seus acessos. Tente novamente.')
      } finally {
        if (active && current === generation) {
          setLoading(false)
          setRevision((value) => value + 1)
        }
      }
    }
    void (async () => {
      try {
        const auth = getFirebaseAuth()
        await setPersistence(auth, browserSessionPersistence)
        if (active)
          unsubscribe = onIdTokenChanged(auth, (next) => {
            void sync(next)
          })
      } catch {
        if (active) {
          setError('Autenticação indisponível.')
          setLoading(false)
        }
      }
    })()
    const focus = () => {
      try {
        if (document.visibilityState === 'visible' && getFirebaseAuth().currentUser) refresh()
      } catch {
        /* Incomplete config is surfaced by sync. */
      }
    }
    window.addEventListener('focus', focus)
    return () => {
      active = false
      generation++
      abort?.abort()
      unsubscribe?.()
      window.removeEventListener('focus', focus)
    }
  }, [retry, refresh])
  return (
    <StaffContext.Provider value={{ user, loading, error, clinics, nextCursor, revision, refresh }}>
      {children}
    </StaffContext.Provider>
  )
}
export function useStaff() {
  const staff = useContext(StaffContext)
  if (!staff) throw new Error('StaffProvider required')
  return staff
}
