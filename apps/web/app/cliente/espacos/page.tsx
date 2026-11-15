'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeft, Check, ExternalLink, MapPin, Plus, Search, Trash2 } from 'lucide-react'
import {
  linkSpace,
  setActiveSpace,
  signOut,
  unlinkSpace,
  useClient,
} from '../../../lib/client-app/store'
import type { SpaceSummary } from '../../../lib/client-app/types'
import { searchSpaces } from '../../../components/client-app/use-clinic'
import { Splash } from '../../../components/client-app/shell'
import { Empty, Sheet, SpaceLogo } from '../../../components/client-app/ui'

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
  const [removing, setRemoving] = useState<SpaceSummary | null>(null)

  useEffect(() => {
    if (ready && !account) router.replace('/cliente/entrar')
  }, [ready, account, router])

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

  if (!ready || !account) return <Splash />
  const linked = Object.values(account.spaces)
  const showAdd = adding || linked.length === 0
  const current = results && results.query === term ? results.spaces : null

  function open(slug: string) {
    setActiveSpace(slug)
    router.push('/cliente')
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

        <h1>{linked.length ? 'Seus espaços' : 'Encontre seu espaço'}</h1>
        <p className="ca-lead">
          {linked.length
            ? 'Toque para entrar. Cadastro, anamnese e histórico são separados por espaço.'
            : 'Busque pelo nome ou digite o código que o espaço passou para você.'}
        </p>

        {linked.length > 0 && (
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
        )}

        {showAdd ? (
          <section className="ca-space-add">
            {linked.length > 0 && <h2>Adicionar espaço</h2>}
            <label className="ca-search">
              <Search size={18} aria-hidden />
              <input
                autoFocus={linked.length > 0}
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
                  Confira o código com o espaço. A busca por nome ainda cobre só os espaços de
                  demonstração; experimente &ldquo;demo&rdquo;.
                </p>
              </Empty>
            )}
            {term.length >= 2 && current && current.length > 0 && (
              <ul className="ca-space-list">
                {current.map((space) => (
                  <li key={space.slug}>
                    <button type="button" className="ca-space" onClick={() => setPreview(space)}>
                      <SpaceRow space={space}>{space.code && <code>{space.code}</code>}</SpaceRow>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {term.length < 2 && (
              <button type="button" className="ca-link" onClick={() => setQuery('demo')}>
                Ver espaços de demonstração
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
        <Sheet title="Vincular espaço" onClose={() => setPreview(null)}>
          <div className="ca-space-preview" data-theme={preview.theme}>
            <SpaceLogo space={preview} size={72} />
            <strong>{preview.name}</strong>
            {preview.category && <span>{preview.category}</span>}
            <dl>
              {(preview.address || preview.city) && (
                <div>
                  <dt>
                    <MapPin size={15} aria-hidden /> Localização
                  </dt>
                  <dd>{[preview.address, preview.city].filter(Boolean).join(' · ')}</dd>
                </div>
              )}
              {preview.code && (
                <div>
                  <dt>Código</dt>
                  <dd>
                    <code>{preview.code}</code>
                  </dd>
                </div>
              )}
            </dl>
            {preview.demo && (
              <p className="ca-note">Espaço de demonstração, com dados de exemplo.</p>
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
            onClick={() => {
              linkSpace(preview)
              router.push('/cliente')
            }}
          >
            Entrar neste espaço
          </button>
        </Sheet>
      )}

      {removing && (
        <Sheet title="Remover espaço" onClose={() => setRemoving(null)}>
          <p className="ca-lead">
            Remover <strong>{removing.name}</strong> apaga deste aparelho sua anamnese, horários e
            histórico nesse espaço. Sua conta Luminix e os outros espaços continuam.
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
