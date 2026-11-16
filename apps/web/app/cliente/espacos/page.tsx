'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCheck,
  ExternalLink,
  FilePlus2,
  Hash,
  MapPin,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { levelNames, missingSteps, recordState } from '@luminix/contracts/anamnesis'
import {
  linkSpace,
  setActiveSpace,
  signOut,
  takePendingSpace,
  unlinkSpace,
  useClient,
} from '../../../lib/client-app/store'
import { firstName } from '../../../lib/client-app/format'
import type { SpaceSummary } from '../../../lib/client-app/types'
import { fetchSpace, searchSpaces } from '../../../components/client-app/use-clinic'
import { Splash } from '../../../components/client-app/shell'
import { Empty, Preparing, Sheet, SpaceLogo, SpaceMap } from '../../../components/client-app/ui'

/** One window at a time: list → how to find → search → confirm → record permission. */
type View = 'list' | 'how' | 'search' | 'confirm' | 'share'
type How = 'code' | 'name'

function maskCode(input: string) {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const letters = clean.slice(0, 2).replace(/[^A-Z]/g, '')
  const digits = letters.length === 2 ? clean.slice(2).replace(/\D/g, '').slice(0, 4) : ''
  return digits ? `${letters}-${digits}` : letters
}

function SpaceRow({ space, children }: { space: SpaceSummary; children?: React.ReactNode }) {
  return (
    <>
      <SpaceLogo space={space} size={52} />
      <span className="ca-space-text">
        <strong>{space.name}</strong>
        <small>
          {[space.category, space.city].filter(Boolean).join(' · ') || 'Espaço Luminix'}
        </small>
      </span>
      {children}
    </>
  )
}

export default function SpacesPage() {
  const router = useRouter()
  const { ready, account } = useClient()
  const [view, setView] = useState<View | null>(null)
  const [how, setHow] = useState<How>('code')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ query: string; spaces: SpaceSummary[] } | null>(null)
  const [preview, setPreview] = useState<SpaceSummary | null>(null)
  const [removing, setRemoving] = useState<SpaceSummary | null>(null)
  const [entering, setEntering] = useState<SpaceSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const hasRecord = Boolean(account?.anamnesis)
  const hasSpaces = Boolean(account && Object.keys(account.spaces).length)

  useEffect(() => {
    if (!ready) return
    if (!account) router.replace('/cliente/entrar')
    else if (!hasRecord) router.replace('/cliente/anamnese')
  }, [ready, account, hasRecord, router])

  // Arrived from a clinic site: open that space's confirmation instead of linking silently.
  useEffect(() => {
    if (!ready || !hasRecord) return
    const slug = takePendingSpace()
    if (slug)
      void fetchSpace(slug).then((found) => {
        if (!found) return
        setPreview(found.summary)
        setView('confirm')
      })
  }, [ready, hasRecord])

  const term = how === 'code' ? (/^[A-Z]{2}-\d{4}$/.test(query) ? query : '') : query.trim()
  useEffect(() => {
    if (term.length < 3) return
    const controller = new AbortController()
    const timer = setTimeout(
      () => {
        searchSpaces(term, controller.signal)
          .then((spaces) => setResults({ query: term, spaces }))
          .catch(() => {})
      },
      how === 'code' ? 0 : 350,
    )
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [term, how])

  const goHome = useCallback(() => router.replace('/cliente'), [router])

  if (!ready || !account || !account.anamnesis) return <Splash />
  if (entering) return <Preparing space={entering} onDone={goHome} />

  const spaces = account.spaces
  const linked = Object.values(spaces)
  const current: View = view ?? (hasSpaces ? 'list' : 'how')
  const found = results && results.query === term ? results.spaces : null
  const known = preview ? spaces[preview.slug] : undefined
  const accountRecord = account.anamnesis

  function back() {
    setProblem('')
    if (current === 'share') return setView('confirm')
    if (current === 'confirm') return setView(results ? 'search' : hasSpaces ? 'list' : 'how')
    if (current === 'search') return setView('how')
    if (current === 'how' && hasSpaces) return setView('list')
  }

  /** Opens a space already linked: straight in, or through the record it still needs. */
  function open(slug: string) {
    const space = spaces[slug]
    setActiveSpace(slug)
    const record = space.shareAnamnesis ? accountRecord : space.anamnesis
    if (recordState(record, space.requiredLevel) === 'ok') setEntering(space.summary)
    else router.push(`/cliente/anamnese?espaco=${slug}&entrar=1`)
  }

  async function link(share: boolean) {
    if (!preview) return
    setBusy(true)
    const failure = await linkSpace(preview, share)
    setBusy(false)
    if (failure) return setProblem(failure)
    // The record page decides: nothing to fill (straight in), missing steps or a new record.
    router.push(`/cliente/anamnese?espaco=${preview.slug}&entrar=1`)
  }

  const needed = preview?.anamnesisLevel ?? 1
  const toFill = missingSteps(needed, accountRecord.answers, accountRecord.photo).length
  const themed = (current === 'confirm' || current === 'share') && preview

  return (
    <div className="ca ca-flow" data-theme={themed ? preview.theme : 'luminix'}>
      <div className="ca-flow-card">
        <header className="ca-flow-top">
          {current === 'list' || (current === 'how' && !hasSpaces) ? (
            hasSpaces && account.activeSlug ? (
              <button
                type="button"
                className="ca-icon-button"
                aria-label="Voltar ao início"
                onClick={() => router.push('/cliente')}
              >
                <ArrowLeft size={18} aria-hidden />
              </button>
            ) : (
              <span className="ca-wordmark">Luminix</span>
            )
          ) : (
            <button type="button" className="ca-icon-button" aria-label="Voltar" onClick={back}>
              <ArrowLeft size={18} aria-hidden />
            </button>
          )}
          <button type="button" className="ca-link" onClick={signOut}>
            Sair
          </button>
        </header>

        <div key={current} className="ca-window">
          {current === 'list' && (
            <>
              <h1>Seus espaços</h1>
              <p className="ca-lead">
                Toque para entrar. Horários e histórico são separados por espaço.
              </p>
              <ul className="ca-space-list">
                {linked.map(({ summary }) => (
                  <li key={summary.slug}>
                    <button type="button" className="ca-space" onClick={() => open(summary.slug)}>
                      <SpaceRow space={summary}>
                        {summary.slug === account.activeSlug && (
                          <span className="ca-badge" data-status="confirmed">
                            <Check size={13} aria-hidden /> Atual
                          </span>
                        )}
                      </SpaceRow>
                    </button>
                    <button
                      type="button"
                      className="ca-icon-button"
                      aria-label={`Remover ${summary.name}`}
                      onClick={() => setRemoving(summary)}
                    >
                      <Trash2 size={16} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="ca-add-space" onClick={() => setView('how')}>
                <span>
                  <Plus size={20} aria-hidden />
                </span>
                <span className="ca-space-text">
                  <strong>Acessar outro espaço</strong>
                  <small>Pelo código ou pelo nome</small>
                </span>
              </button>
            </>
          )}

          {current === 'how' && (
            <>
              <h1>
                {hasSpaces
                  ? 'Como quer encontrar?'
                  : `${firstName(account.name)}, qual é o seu espaço?`}
              </h1>
              <p className="ca-lead">O espaço passou um código? É o caminho mais rápido.</p>
              <div className="ca-choice-cards">
                <button
                  type="button"
                  onClick={() => {
                    setHow('code')
                    setQuery('')
                    setView('search')
                  }}
                >
                  <Hash size={22} aria-hidden />
                  <strong>Tenho um código</strong>
                  <small>Duas letras e quatro números, como KW-4374</small>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHow('name')
                    setQuery('')
                    setView('search')
                  }}
                >
                  <Search size={22} aria-hidden />
                  <strong>Buscar pelo nome</strong>
                  <small>Do jeito que aparece no site do espaço</small>
                </button>
              </div>
            </>
          )}

          {current === 'search' && (
            <>
              <h1>{how === 'code' ? 'Digite o código' : 'Qual é o nome do espaço?'}</h1>
              <label className={how === 'code' ? 'ca-code-input' : 'ca-search'}>
                {how === 'name' && <Search size={18} aria-hidden />}
                <input
                  autoFocus
                  value={query}
                  onChange={(event) =>
                    setQuery(how === 'code' ? maskCode(event.target.value) : event.target.value)
                  }
                  placeholder={how === 'code' ? 'AA-0000' : 'Ex.: Espaço Vanessa'}
                  aria-label={how === 'code' ? 'Código do espaço' : 'Nome do espaço'}
                  maxLength={how === 'code' ? 7 : 80}
                  autoCapitalize={how === 'code' ? 'characters' : 'words'}
                />
              </label>
              {term.length >= 3 && !found && (
                <p className="ca-muted" role="status">
                  Procurando…
                </p>
              )}
              {found && found.length === 0 && (
                <Empty title="Nenhum espaço encontrado">
                  <p>
                    {how === 'code'
                      ? 'Confira o código com a equipe.'
                      : 'Tente o nome completo, como aparece no site do espaço.'}
                  </p>
                </Empty>
              )}
              {found && found.length > 0 && (
                <ul className="ca-space-list">
                  {found.map((space) => (
                    <li key={space.slug}>
                      <button
                        type="button"
                        className="ca-space"
                        onClick={() => {
                          setPreview(space)
                          setView('confirm')
                          // The full public page brings services (record level) and address.
                          void fetchSpace(space.slug).then((full) => {
                            if (full) setPreview(full.summary)
                          })
                        }}
                      >
                        <SpaceRow space={space}>
                          <ArrowRight size={18} aria-hidden />
                        </SpaceRow>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {how === 'name' && term.length < 3 && (
                <button type="button" className="ca-link" onClick={() => setQuery('demo')}>
                  Só quero conhecer: ver espaços de demonstração
                </button>
              )}
            </>
          )}

          {current === 'confirm' && preview && (
            <>
              <h1>É este o espaço?</h1>
              <div className="ca-space-preview">
                <SpaceMap space={preview} />
                <div className="ca-space-preview-head">
                  <SpaceLogo space={preview} size={60} />
                  <span>
                    <strong>{preview.name}</strong>
                    <small>
                      {[preview.category, preview.code && `Código ${preview.code}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                  </span>
                </div>
                {(preview.address || preview.city) && (
                  <p className="ca-space-address">
                    <MapPin size={16} aria-hidden />
                    {[preview.address, preview.city].filter(Boolean).join(' · ')}
                  </p>
                )}
                {preview.demo && (
                  <p className="ca-note">
                    Espaço de demonstração: serve para conhecer o site, não aceita agendamentos.
                  </p>
                )}
                <a
                  className="ca-link"
                  href={`/c/${encodeURIComponent(preview.slug)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver site do espaço <ExternalLink size={14} aria-hidden />
                </a>
              </div>
              <button
                type="button"
                className="ca-button"
                disabled={preview.demo && !known}
                onClick={() => (known ? open(preview.slug) : setView('share'))}
              >
                {known ? 'Entrar neste espaço' : 'Sim, é este'} <ArrowRight size={18} aria-hidden />
              </button>
            </>
          )}

          {current === 'share' && preview && (
            <>
              <h1>Sua ficha para {preview.name}</h1>
              <p className="ca-lead">
                Este espaço pede a <strong>{levelNames[needed].toLowerCase()}</strong>. Escolha como
                quer responder.
              </p>
              <div className="ca-choice-cards">
                <button type="button" disabled={busy} onClick={() => void link(true)}>
                  <ClipboardCheck size={22} aria-hidden />
                  <strong>Usar a ficha da minha conta</strong>
                  <small>
                    {toFill
                      ? `Foto e dados já preenchidos. Faltam ${toFill} ${toFill === 1 ? 'etapa' : 'etapas'}.`
                      : 'Tudo pronto: nada para preencher.'}
                  </small>
                </button>
                <button type="button" disabled={busy} onClick={() => void link(false)}>
                  <FilePlus2 size={22} aria-hidden />
                  <strong>Preencher uma ficha só para este espaço</strong>
                  <small>Seus dados salvos não são compartilhados com ele.</small>
                </button>
              </div>
              <p className="ca-note">A equipe só vê a ficha do espaço que você escolheu.</p>
            </>
          )}

          <p className="ca-error" role="alert">
            {problem}
          </p>
        </div>
      </div>

      {removing && (
        <Sheet title="Remover espaço" onClose={() => setRemoving(null)}>
          <p className="ca-lead">
            <strong>{removing.name}</strong> sai da sua lista. O espaço mantém seu cadastro e
            histórico, e você pode adicioná-lo de novo quando quiser.
          </p>
          <button
            type="button"
            className="ca-button danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await unlinkSpace(removing.slug)
              setBusy(false)
              setRemoving(null)
            }}
          >
            Remover espaço
          </button>
        </Sheet>
      )}
    </div>
  )
}
