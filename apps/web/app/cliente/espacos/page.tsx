'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, ExternalLink, MapPin, Plus, Search, Trash2 } from 'lucide-react'
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
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ query: string; spaces: SpaceSummary[] } | null>(null)
  const [preview, setPreview] = useState<SpaceSummary | null>(null)
  const [share, setShare] = useState(true)
  const [removing, setRemoving] = useState<SpaceSummary | null>(null)
  const [entering, setEntering] = useState<SpaceSummary | null>(null)
  const hasRecord = Boolean(account?.anamnesis)

  useEffect(() => {
    if (!ready) return
    if (!account) router.replace('/cliente/entrar')
    else if (!hasRecord) router.replace('/cliente/anamnese')
  }, [ready, account, hasRecord, router])

  // Arrived from a clinic site: open that space for confirmation instead of linking silently.
  useEffect(() => {
    if (!ready || !hasRecord) return
    const slug = takePendingSpace()
    if (slug)
      void fetchSpace(slug).then((found) => {
        if (found) setPreview(found.summary)
      })
  }, [ready, hasRecord])

  const term = query.trim()
  useEffect(() => {
    if (term.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchSpaces(term, controller.signal)
        .then((spaces) => setResults({ query: term, spaces }))
        .catch(() => {})
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [term])

  const goHome = useCallback(() => router.replace('/cliente'), [router])

  if (!ready || !account || !account.anamnesis) return <Splash />
  if (entering) return <Preparing space={entering} onDone={goHome} />

  const spaces = account.spaces
  const linked = Object.values(spaces)
  const showAdd = adding || linked.length === 0
  const current = results && results.query === term ? results.spaces : null
  const alreadyLinked = preview ? Boolean(spaces[preview.slug]) : false

  function enter(space: SpaceSummary) {
    const known = spaces[space.slug]
    if (known) setActiveSpace(space.slug)
    else linkSpace(space, share)
    setPreview(null)
    // Without permission to reuse the account record, the space asks for its own first.
    const needsOwnRecord = known ? !known.shareAnamnesis && !known.anamnesis : !share
    if (needsOwnRecord) router.push('/cliente/anamnese')
    else setEntering(space)
  }

  return (
    <div className="ca ca-flow" data-theme="luminix">
      <div className="ca-flow-card">
        <header className="ca-flow-top">
          {linked.length > 0 && account.activeSlug ? (
            <Link className="ca-icon-button" href="/cliente" aria-label="Voltar">
              <ArrowLeft size={18} aria-hidden />
            </Link>
          ) : (
            <span className="ca-wordmark">Luminix</span>
          )}
          <button type="button" className="ca-link" onClick={signOut}>
            Sair
          </button>
        </header>

        <h1>
          {linked.length ? 'Seus espaços' : `${firstName(account.name)}, qual é o seu espaço?`}
        </h1>
        <p className="ca-lead">
          {linked.length
            ? 'Toque para entrar. Horários e histórico são separados por espaço.'
            : 'Digite o nome do salão, clínica ou estúdio, ou o código que ele passou para você.'}
        </p>

        {linked.length > 0 && (
          <ul className="ca-space-list">
            {linked.map(({ summary }) => (
              <li key={summary.slug}>
                <button type="button" className="ca-space" onClick={() => enter(summary)}>
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
        )}

        {showAdd ? (
          <section className="ca-space-add">
            {linked.length > 0 && <h2>Adicionar espaço</h2>}
            <label className="ca-search">
              <Search size={18} aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nome ou código (ex.: KW-4374)"
                aria-label="Buscar espaço por nome ou código"
              />
            </label>
            {term.length >= 2 && !current && (
              <p className="ca-muted" role="status">
                Buscando…
              </p>
            )}
            {term.length >= 2 && current && current.length === 0 && (
              <Empty title="Nenhum espaço encontrado">
                <p>
                  Escreva pelo menos três letras do nome, como aparece no site do espaço, ou confira
                  o código com a equipe.
                </p>
              </Empty>
            )}
            {term.length >= 2 && current && current.length > 0 && (
              <ul className="ca-space-list">
                {current.map((space) => (
                  <li key={space.slug}>
                    <button type="button" className="ca-space" onClick={() => setPreview(space)}>
                      <SpaceRow space={space} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {term.length < 2 && (
              <button type="button" className="ca-link" onClick={() => setQuery('demo')}>
                Só quero conhecer: ver espaços de demonstração
              </button>
            )}
          </section>
        ) : (
          <button type="button" className="ca-button ghost" onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden /> Adicionar espaço
          </button>
        )}
      </div>

      {preview && (
        <Sheet title="É este o espaço?" onClose={() => setPreview(null)}>
          <div className="ca-space-preview" data-theme={preview.theme}>
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
              <p className="ca-note">Espaço de demonstração, com dados e endereço de exemplo.</p>
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
          {!alreadyLinked && (
            <label className="ca-check ca-permission">
              <input
                type="checkbox"
                checked={share}
                onChange={(event) => setShare(event.target.checked)}
              />
              <span>
                <strong>Permitir que {preview.name} use minha ficha de anamnese</strong>
                {share
                  ? 'A equipe verá a ficha e a foto que você já preencheu na sua conta.'
                  : 'Sem a permissão, você preenche uma ficha só para este espaço antes de entrar.'}
              </span>
            </label>
          )}
          <button type="button" className="ca-button" onClick={() => enter(preview)}>
            {alreadyLinked || share ? 'Entrar neste espaço' : 'Preencher ficha e entrar'}
          </button>
        </Sheet>
      )}

      {removing && (
        <Sheet title="Remover espaço" onClose={() => setRemoving(null)}>
          <p className="ca-lead">
            Remover <strong>{removing.name}</strong> apaga deste aparelho seus horários e histórico
            nesse espaço. Sua conta Luminix, sua ficha e os outros espaços continuam.
          </p>
          <button
            type="button"
            className="ca-button danger"
            onClick={() => {
              unlinkSpace(removing.slug)
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
