import type { ReactNode } from 'react'

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
  const isLoading = !alert && !action

  return (
    <main
      className={`app-status${compact ? ' compact' : ''}${alert ? ' alert' : ''}`}
      role={alert ? 'alert' : 'status'}
    >
      {isLoading ? (
        <div className="luminix-loading-stage" aria-live="polite">
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
          <p className="sr-only">{children}</p>
        </div>
      ) : (
        <p>{children}</p>
      )}
      {action}
    </main>
  )
}
