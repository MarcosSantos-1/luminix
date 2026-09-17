'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { useStaff } from '@/components/staff-provider'
import { getFirebaseAuth } from '@/lib/firebase'

type ClinicContext = {
  clinic: { id: string; name: string; slug: string; status: string }
  permissions: string[]
}
const Context = createContext<ClinicContext | null>(null)
export function ClinicWorkspace({ children }: { children: ReactNode }) {
  const { clinicId } = useParams<{ clinicId: string }>()
  const pathname = usePathname()
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
          if (active)
            setState({
              key,
              denied: [401, 403, 404].includes(response.status),
              error: 'Não foi possível acessar esta clínica.',
            })
          return
        }
        const data = await response.json()
        if (active && data.clinic.id === clinicId) setState({ key, data })
      } catch {
        if (active) setState({ key, error: 'Não foi possível carregar. Tente novamente.' })
      }
    })()
    return () => {
      active = false
      abort.abort()
    }
  }, [staff.user, staff.loading, staff.error, clinicId, key])
  if (!staff.loading && !staff.user)
    return (
      <main className="p-6">
        <Link href="/login">Entrar para continuar</Link>
      </main>
    )
  if (staff.error)
    return (
      <main className="p-6" role="alert">
        <p>{staff.error}</p>
        <button onClick={staff.refresh}>Tentar novamente</button>
      </main>
    )
  if (staff.loading || state?.key !== key)
    return (
      <main className="p-6" role="status">
        Carregando clínica…
      </main>
    )
  if (!state.data)
    return (
      <main className="space-y-3 p-6" role="alert">
        <p>
          {state.denied
            ? 'Seu vínculo não permite acessar esta clínica. Escolha outro acesso.'
            : state.error}
        </p>
        <Link href="/clinics">Voltar às minhas clínicas</Link>
        <button onClick={staff.refresh}>Tentar novamente</button>
      </main>
    )
  if (onboarding) return <Context.Provider value={state.data}>{children}</Context.Provider>
  return (
    <Context.Provider value={state.data}>
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
          <div>
            <h1 className="text-2xl font-bold">{state.data.clinic.name}</h1>
            <p className="text-sm text-muted-foreground">
              {state.data.clinic.status === 'draft' ? 'Clínica em configuração' : 'Clínica ativa'}
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
          {state.data.permissions.includes('settings:manage') && (
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
