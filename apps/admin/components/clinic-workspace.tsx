'use client'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { AppStatus } from '@/components/app-status'
import { useStaff } from '@/components/staff-provider'
import { getFirebaseAuth } from '@/lib/firebase'

type ClinicContext = {
  clinic: { id: string; name: string; slug: string; status: string }
  permissions: string[]
}
const Context = createContext<ClinicContext | null>(null)
const clinicViews = new Map<string, ClinicContext>()
const clinicListeners = new Set<() => void>()

function subscribeClinics(listener: () => void) {
  clinicListeners.add(listener)
  return () => clinicListeners.delete(listener)
}

function rememberClinic(id: string, data: ClinicContext) {
  if (clinicViews.size >= 50 && !clinicViews.has(id)) {
    const oldest = clinicViews.keys().next().value
    if (oldest) clinicViews.delete(oldest)
  }
  clinicViews.set(id, data)
  clinicListeners.forEach((listener) => listener())
}

export function ClinicWorkspace({ children }: { children: ReactNode }) {
  const { clinicId } = useParams<{ clinicId: string }>()
  const pathname = usePathname()
  const router = useRouter()
  const onboarding = pathname.endsWith('/onboarding')
  const staff = useStaff()
  const key = `${staff.user?.uid}/${clinicId}/${staff.revision}`
  const [state, setState] = useState<{
    key: string
    data?: ClinicContext
    denied?: boolean
    error?: string
  } | null>(null)
  const [logoutError, setLogoutError] = useState('')
  const cached = useSyncExternalStore(
    subscribeClinics,
    () => clinicViews.get(key) ?? null,
    () => null,
  )
  useEffect(() => {
    const user = staff.user
    if (!user || staff.loading || staff.error) return
    const abort = new AbortController()
    let active = true
    void (async () => {
      try {
        const response = await fetch(`/api/clinics/${clinicId}/context`, {
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20_000)]),
        })
        if (!response.ok) {
          if (active) {
            clinicViews.delete(key)
            clinicListeners.forEach((listener) => listener())
            setState({
              key,
              denied: [401, 403, 404].includes(response.status),
              error: 'Não foi possível acessar esta clínica.',
            })
          }
          return
        }
        const data = await response.json()
        if (active && data.clinic.id === clinicId) {
          rememberClinic(key, data)
          setState({ key, data })
        }
      } catch {
        if (active && !clinicViews.get(key))
          setState({ key, error: 'Não foi possível carregar. Tente novamente.' })
      }
    })()
    return () => {
      active = false
      abort.abort()
    }
  }, [staff.user, staff.loading, staff.error, clinicId, key])
  const failed = state?.key === key && !state.data
  const visible =
    staff.loading || staff.error || !staff.user || failed
      ? undefined
      : state?.key === key
        ? state.data
        : cached
  useEffect(() => {
    if (!staff.loading && !staff.user) router.replace('/login')
  }, [staff.loading, staff.user, router])
  if (!staff.loading && !staff.user) return <AppStatus />
  if (!visible) {
    if (staff.error)
      return (
        <AppStatus alert action={<button onClick={staff.refresh}>Tentar novamente</button>}>
          {staff.error}
        </AppStatus>
      )
    if (staff.loading || state?.key !== key) return <AppStatus />
    return (
      <AppStatus
        alert
        action={
          <>
            <Link href="/clinics">Voltar às minhas clínicas</Link>
            <button onClick={staff.refresh}>Tentar novamente</button>
          </>
        }
      >
        {state?.denied
          ? 'Seu vínculo não permite acessar esta clínica. Escolha outro acesso.'
          : state?.error}
      </AppStatus>
    )
  }
  if (onboarding || pathname === `/clinics/${clinicId}`)
    return <Context.Provider value={visible}>{children}</Context.Provider>
  return (
    <Context.Provider value={visible}>
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
          <div>
            <h1 className="text-2xl font-bold">{visible.clinic.name}</h1>
            <p className="text-sm text-muted-foreground">
              {visible.clinic.status === 'draft' ? 'Clínica em configuração' : 'Clínica ativa'}
            </p>
          </div>
          <div className="flex gap-4">
            <Link href="/clinics" aria-label="Trocar clínica">
              ⇄ Trocar clínica
            </Link>
            <button
              onClick={() => {
                void signOut(getFirebaseAuth()).catch(() =>
                  setLogoutError('Não foi possível sair.'),
                )
              }}
            >
              Sair
            </button>
          </div>
        </header>
        <nav className="flex gap-4" aria-label="Navegação da clínica">
          <Link href={`/clinics/${clinicId}`}>Início</Link>
          {visible.permissions.includes('settings:manage') && (
            <Link href={`/clinics/${clinicId}/settings`}>Configurações</Link>
          )}
          <button onClick={staff.refresh}>Atualizar acesso</button>
        </nav>
        {logoutError && <p role="alert">{logoutError}</p>}
        {children}
      </main>
    </Context.Provider>
  )
}
export function useClinic() {
  const context = useContext(Context)
  if (!context) throw new Error('ClinicWorkspace required')
  return context
}
