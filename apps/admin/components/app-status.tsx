import type { ReactNode } from 'react'

export function AppStatus({
  children = 'Abrindo…',
  action,
  alert = false,
  busy = !alert,
  compact = false,
}: {
  children?: ReactNode
  action?: ReactNode
  alert?: boolean
  busy?: boolean
  compact?: boolean
}) {
  return (
    <main
      className={`app-status${compact ? ' compact' : ''}${alert ? ' alert' : ''}${busy ? ' busy' : ''}`}
      role={alert ? 'alert' : 'status'}
    >
      <span className="brand-mark" aria-hidden="true">
        L
      </span>
      <p>{children}</p>
      {action}
    </main>
  )
}
