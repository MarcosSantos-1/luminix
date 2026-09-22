import type { ReactNode } from 'react'

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
  return (
    <main className={`app-status${compact ? ' compact' : ''}${alert ? ' alert' : ''}`} role={alert ? 'alert' : 'status'}>
      <p>{children}</p>
      {action}
    </main>
  )
}
