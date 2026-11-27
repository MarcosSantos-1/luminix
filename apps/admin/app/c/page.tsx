'use client'
import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { signOut } from 'firebase/auth'
import { ArrowRight, LogOut, UserRound } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { AppStatus } from '@/components/app-status'
import { useStaff, type StaffClinic } from '@/components/staff-provider'
import { roleLabel } from '@/lib/access'
import { getFirebaseAuth } from '@/lib/firebase'
import { publicSiteOrigin } from '@/lib/public-site'
import './access.css'

const stages: Record<string, string> = {
  contact: 'Início',
  clinic: 'Espaço',
  catalog: 'Serviços',
  services: 'Detalhes',
  structure: 'Equipe',
  schedule: 'Endereço',
  hours: 'Horários',
  payments: 'Pagamentos',
  rules: 'Regras',
  review: 'Finalizar',
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'L'
}

function stageOf(clinic: StaffClinic) {
  if (clinic.status !== 'draft') return 'Ativa'
  const name = clinic.step ? stages[clinic.step] : null
  return name ? `Em configuração · ${name}` : 'Em configuração'
}

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
  const firstName = staff.user?.displayName?.trim().split(/\s+/)[0]
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
        router.push(`/c/${data.clinic.code || data.clinic.id}`)
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
    <main className="access-hub">
      <div className="access-wrap">
        <header className="access-top">
          <div>
            <p className="access-kicker">Luminix</p>
            <h1>{firstName ? `Olá, ${firstName}` : 'Seu acesso'}</h1>
            <p>
              {clinics.length > 1
                ? 'Escolha o espaço que você vai gerenciar. A mesma conta também entra como cliente.'
                : 'Abra o espaço vinculado a esta conta, ou entre como cliente de outro espaço.'}
            </p>
          </div>
          <button
            type="button"
            className="access-signout"
            onClick={() => {
              void signOut(getFirebaseAuth()).catch(() =>
                setError('Não foi possível sair. Tente novamente.'),
              )
            }}
          >
            <LogOut size={16} aria-hidden /> Sair
          </button>
        </header>

        {clinics.length > 0 ? (
          <ul className="access-cards" data-count={Math.min(clinics.length, 3)}>
            {clinics.map((clinic) => {
              const ref = clinic.code || clinic.id
              const draft = clinic.status === 'draft'
              const stage = stageOf(clinic)
              return (
                <li key={clinic.id}>
                  <Link
                    className="access-card"
                    data-theme={clinic.theme || 'rosa'}
                    href={draft ? `/c/${ref}/onboarding` : `/c/${ref}`}
                  >
                    <span className="access-logo">
                      {clinic.logoUrl ? <img src={clinic.logoUrl} alt="" /> : initials(clinic.name)}
                    </span>
                    <strong>{clinic.name}</strong>
                    <span className="access-meta">
                      <span className="access-pill">{roleLabel(clinic.role)}</span>
                      <span className={`access-pill${draft ? '' : ' is-live'}`}>{stage}</span>
                    </span>
                    <span className="access-go">
                      {draft ? 'Continuar' : 'Abrir'} <ArrowRight size={16} aria-hidden />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="access-empty">
            Você ainda não gerencia um espaço. Crie o primeiro ou aguarde um convite da equipe. Se
            você é cliente de um espaço, entre por aqui embaixo.
          </p>
        )}

        <a className="access-client" href={`${publicSiteOrigin()}/cliente/espacos`}>
          <span className="access-client-mark" aria-hidden>
            <UserRound size={22} />
          </span>
          <span>
            <strong>Entrar como cliente</strong>
            <small>Ver os espaços em que você agenda, com esta mesma conta.</small>
          </span>
          <span className="access-client-go">Abrir espaços</span>
        </a>

        <div className="access-actions">
          {cursor ? (
            <button
              type="button"
              className="access-text-button"
              disabled={busy}
              onClick={() => void loadMore()}
            >
              Carregar mais
            </button>
          ) : null}
          <button
            type="button"
            className="access-text-button"
            disabled={busy}
            onClick={staff.refresh}
          >
            Atualizar acessos
          </button>
        </div>

        {!clinics.some((clinic) => clinic.role === 'owner') && (
          <form onSubmit={create} className="access-create">
            <h2>Criar minha primeira clínica</h2>
            <p>Ela nasce em rascunho. Você configura o espaço antes de abrir a agenda.</p>
            <label>
              Nome da clínica
              <input
                required
                maxLength={160}
                placeholder="Ex.: Studio Luna"
                value={name}
                readOnly={submitted !== null}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || !name.trim()}>
              {busy
                ? 'Aguarde…'
                : submitted
                  ? 'Confirmar criação novamente'
                  : 'Criar clínica em rascunho'}
            </button>
          </form>
        )}
        {error ? (
          <p className="access-alert" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  )
}
