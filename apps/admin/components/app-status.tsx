import type { ReactNode } from 'react'

const scenes = {
  workspace: {
    label: 'Carregando',
    words: ['seu espaço', 'a agenda', 'os clientes', 'os serviços', 'a experiência'],
  },
  onboarding: {
    label: 'Preparando o onboarding',
    words: ['o onboarding', 'seu cadastro', 'as etapas', 'seu espaço', 'a configuração'],
  },
  entry: {
    label: 'Preparando seu acesso',
    words: ['seu acesso', 'sua conta', 'sua sessão', 'sua entrada', 'o próximo passo'],
  },
} as const

export type LoadingScene = keyof typeof scenes

export function AppStatus({
  children,
  action,
  alert = false,
  compact = false,
  scene = 'workspace',
}: {
  children?: ReactNode
  action?: ReactNode
  alert?: boolean
  compact?: boolean
  scene?: LoadingScene
}) {
  const isLoading = !alert && !action
  const copy = scenes[scene]
  const label = children ?? copy.label

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
                  {copy.words.map((word) => (
                    <span key={word}>{word}</span>
                  ))}
                </span>
              </span>
            </div>
          </div>
          <p className="sr-only">{label}</p>
        </div>
      ) : (
        <p>{label}</p>
      )}
      {action}
    </main>
  )
}
