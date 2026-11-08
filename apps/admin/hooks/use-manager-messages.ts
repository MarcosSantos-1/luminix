'use client'

import { useState, useSyncExternalStore } from 'react'
import { managerUpdates } from '@/components/manager/manager-updates'

const announcement = managerUpdates.find((update) => update.autoOpen)
const serverSnapshot = () => undefined

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener)
  return () => window.removeEventListener('storage', listener)
}

export function useManagerMessages(initialWelcome: boolean, scope?: string) {
  const [manualView, setManualView] = useState<'welcome' | 'updates' | null>(
    initialWelcome ? 'welcome' : null,
  )
  const [dismissed, setDismissed] = useState(false)
  const storageKey =
    scope && announcement ? `luminix.manager-update/${scope}/${announcement.id}` : null
  const seen = useSyncExternalStore(
    subscribe,
    () => {
      if (!storageKey) return undefined
      try {
        return window.localStorage.getItem(storageKey) === 'seen'
      } catch {
        return false
      }
    },
    serverSnapshot,
  )
  const shouldAnnounce = announcement && !initialWelcome && !dismissed && seen === false
  const view = manualView ?? (shouldAnnounce ? 'updates' : null)

  function close() {
    if (view === 'welcome') {
      const url = new URL(window.location.href)
      url.searchParams.delete('boas-vindas')
      window.history.replaceState(null, '', url)
    } else if (view === 'updates' && storageKey && announcement) {
      setDismissed(true)
      try {
        window.localStorage.setItem(storageKey, 'seen')
      } catch {
        // The dialog can still be dismissed for this visit.
      }
    }
    setManualView(null)
  }

  return {
    view,
    close,
    openUpdates: () => setManualView('updates'),
  }
}
