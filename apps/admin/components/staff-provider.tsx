'use client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
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

function sameClinics(left: StaffClinic[], right: StaffClinic[]) {
  if (left.length !== right.length) return false
  return left.every(
    (clinic, index) =>
      clinic.id === right[index]?.id &&
      clinic.name === right[index]?.name &&
      clinic.status === right[index]?.status &&
      clinic.role === right[index]?.role,
  )
}

export function StaffProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clinics, setClinics] = useState<StaffClinic[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [retry, setRetry] = useState(0)
  const userRef = useRef<User | null>(null)
  const clinicsRef = useRef<StaffClinic[]>([])
  const explicitRefresh = useRef(false)
  const refresh = useCallback(() => {
    explicitRefresh.current = true
    setRetry((value) => value + 1)
  }, [])
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
      const sameUser = Boolean(currentUser && userRef.current?.uid === currentUser.uid)
      if (!sameUser) {
        setLoading(true)
        setClinics([])
        clinicsRef.current = []
        setNextCursor(null)
      }
      setUser(currentUser)
      userRef.current = currentUser
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
          if (!active || current !== generation) return
          const nextClinics = data.clinics as StaffClinic[]
          const changed = !sameClinics(clinicsRef.current, nextClinics)
          clinicsRef.current = nextClinics
          setClinics(nextClinics)
          setNextCursor(data.nextCursor)
          if (changed || explicitRefresh.current) setRevision((value) => value + 1)
        }
      } catch {
        if (active && current === generation && !sameUser)
          setError('Não foi possível validar seus acessos. Tente novamente.')
      } finally {
        explicitRefresh.current = false
        if (active && current === generation) setLoading(false)
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
    return () => {
      active = false
      generation++
      abort?.abort()
      unsubscribe?.()
    }
  }, [retry])
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
