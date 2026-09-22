'use client'
import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { AppStatus } from '@/components/app-status'
import { useStaff, type StaffClinic } from '@/components/staff-provider'
import { getFirebaseAuth } from '@/lib/firebase'

export default function ClinicsPage() {
  const staff = useStaff()
  const router = useRouter()
  useEffect(() => {
    if (!staff.loading && !staff.user) router.replace('/login')
  }, [staff.loading, staff.user, router])
  const [name, setName] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [more, setMore] = useState<{
    uid: string
    revision: number
    clinics: StaffClinic[]
    cursor: string | null
  } | null>(null)
  const validMore = more?.uid === staff.user?.uid && more?.revision === staff.revision ? more : null
  const clinics = [...staff.clinics, ...(validMore?.clinics ?? [])]
  const cursor = validMore ? validMore.cursor : staff.nextCursor
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const user = staff.user
    if (!user) return
    setBusy(true)
    setError('')
    const requestName = submitted ?? name.trim()
    setSubmitted(requestName)
    try {
      const response = await fetch('/api/auth/owner-clinic', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: requestName }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        if (response.status === 409) {
          setError(
            'Sua primeira clínica já foi criada. Atualize a lista e abra seu vínculo existente.',
          )
          return
        }
        if ([401, 403].includes(response.status)) {
          staff.refresh()
          setError('Seu acesso mudou. Atualize seus vínculos.')
          return
        }
        throw new Error('Unavailable')
      }
      const data = await response.json()
      if (getFirebaseAuth().currentUser?.uid === user.uid) {
        staff.refresh()
        router.push(`/clinics/${data.clinic.id}`)
      }
    } catch {
      setError('Não foi possível confirmar a criação. Tente novamente com o mesmo nome.')
    } finally {
      setBusy(false)
    }
  }
  async function loadMore() {
    const user = staff.user
    if (!user || !cursor) return
    setBusy(true)
    setError('')
    const revision = staff.revision
    try {
      const response = await fetch(`/api/auth/clinics?after=${encodeURIComponent(cursor)}`, {
        headers: { authorization: `Bearer ${await user.getIdToken()}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error('Unavailable')
      const data = await response.json()
      if (getFirebaseAuth().currentUser?.uid === user.uid)
        setMore({
          uid: user.uid,
          revision,
          clinics: [...(validMore?.clinics ?? []), ...data.clinics],
          cursor: data.nextCursor,
        })
    } catch {
      setError('Não foi possível carregar os próximos acessos.')
    } finally {
      setBusy(false)
    }
  }
  if (staff.loading) return <AppStatus />
  if (!staff.user) return <AppStatus />
  if (staff.error)
    return (
      <AppStatus alert action={<button onClick={staff.refresh}>Tentar novamente</button>}>
        {staff.error}
      </AppStatus>
    )
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Suas clínicas</h1>
        <button
          onClick={() => {
            void signOut(getFirebaseAuth()).catch(() =>
              setError('Não foi possível sair. Tente novamente.'),
            )
          }}
        >
          Sair
        </button>
      </header>
      <p>Escolha a clínica que deseja acessar. A troca mantém sua sessão.</p>
      <ul className="space-y-3">
        {clinics.map((clinic) => (
          <li key={clinic.id}>
            <Link
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5"
              href={`/clinics/${clinic.id}`}
            >
              <span>
                <b>{clinic.name}</b>
                <span className="block text-sm text-muted-foreground">
                  {clinic.role === 'owner' ? 'Proprietário' : clinic.role} ·{' '}
                  {clinic.status === 'draft' ? 'Em configuração' : 'Ativa'}
                </span>
              </span>
              <span>Abrir →</span>
            </Link>
          </li>
        ))}
      </ul>
      {!clinics.length && (
        <p>
          Você ainda não tem vínculos ativos. Crie sua primeira clínica ou aguarde um convite da
          equipe.
        </p>
      )}
      {cursor && (
        <button disabled={busy} onClick={() => void loadMore()}>
          Carregar mais clínicas
        </button>
      )}
      <button disabled={busy} onClick={staff.refresh}>
        Atualizar acessos
      </button>
      {!clinics.some((clinic) => clinic.role === 'owner') && (
        <form onSubmit={create} className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-bold">Criar minha primeira clínica</h2>
          <label className="flex flex-col gap-1">
            Nome da clínica
            <input
              className="rounded-xl border border-border bg-background p-3"
              required
              maxLength={160}
              placeholder="Ex.: Studio Luna"
              value={name}
              readOnly={submitted !== null}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            disabled={busy || !name.trim()}
            className="rounded-xl bg-primary p-3 text-white disabled:opacity-50"
          >
            {busy
              ? 'Aguarde…'
              : submitted
                ? 'Confirmar criação novamente'
                : 'Criar clínica em rascunho'}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
