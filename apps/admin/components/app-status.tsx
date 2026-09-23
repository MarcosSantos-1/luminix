'use client'

import type { ReactNode } from 'react'
import { useState } from 'react'

const loadingWords = ['seu espaço', 'a agenda', 'os clientes', 'os serviços', 'a experiência']

export function AppStatus({
  children = 'Carregando',
  action,
  alert = false,
  compact = false,
}: {
  children?: ReactNode
  action?: ReactNode
  alert?: boolean
  compact?: boolean
}) {
  const [loadingVariant, setLoadingVariant] = useState<'squares' | 'words'>('squares')
  const isLoading = !alert && !action

  return (
    <main
      className={`app-status${compact ? ' compact' : ''}${alert ? ' alert' : ''}`}
      role={alert ? 'alert' : 'status'}
    >
      {isLoading ? (
        <div className="luminix-loading-stage" aria-live="polite">
          {loadingVariant === 'squares' ? (
            <div className="luminix-squares-loading" aria-hidden="true">
              {Array.from({ length: 9 }, (_, index) => (
                <span key={index} />
              ))}
            </div>
          ) : (
            <div className="luminix-words-loading" aria-hidden="true">
              <div className="luminix-ring" />
              <div className="luminix-loading-sentence">
                <span>Preparando</span>
                <span className="luminix-word-window">
                  <span className="luminix-word-track">
                    {loadingWords.map((word) => (
                      <span key={word}>{word}</span>
                    ))}
                  </span>
                </span>
              </div>
            </div>
          )}
          <p className="sr-only">{children}</p>
          <div className="luminix-loader-picker" aria-label="Testar animação de carregamento">
            <button
              type="button"
              aria-pressed={loadingVariant === 'squares'}
              onClick={() => setLoadingVariant('squares')}
            >
              Movimento
            </button>
            <button
              type="button"
              aria-pressed={loadingVariant === 'words'}
              onClick={() => setLoadingVariant('words')}
            >
              Etapas
            </button>
          </div>
        </div>
      ) : (
        <p>{children}</p>
      )}
      {action}
    </main>
  )
}
