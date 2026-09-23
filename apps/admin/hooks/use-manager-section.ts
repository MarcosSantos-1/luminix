'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

const SECTION_QUERY = 'secao'
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

function readSection() {
  return new URLSearchParams(window.location.search).get(SECTION_QUERY) ?? 'inicio'
}

function notify() {
  listeners.forEach((listener) => listener())
}

function writeSection(id: string, mode: 'push' | 'replace') {
  const url = new URL(window.location.href)
  if (id === 'inicio') url.searchParams.delete(SECTION_QUERY)
  else url.searchParams.set(SECTION_QUERY, id)
  const next = `${url.pathname}${url.search}${url.hash}`
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next !== current) {
    if (mode === 'push') window.history.pushState(null, '', next)
    else window.history.replaceState(null, '', next)
  }
  notify()
}

/** Seção visual do shell. Não representa autorização nem clínica ativa. */
export function useManagerSection(allowedIds: readonly string[], initialSection: string) {
  const serverSnapshot = allowedIds.includes(initialSection) ? initialSection : 'inicio'
  const getServerSnapshot = useCallback(() => serverSnapshot, [serverSnapshot])
  const raw = useSyncExternalStore(subscribe, readSection, getServerSnapshot)
  const section = allowedIds.includes(raw) ? raw : 'inicio'

  useEffect(() => {
    if (raw === 'inicio' || allowedIds.includes(raw)) return
    writeSection('inicio', 'replace')
  }, [allowedIds, raw])

  const select = useCallback(
    (id: string) => {
      if (!allowedIds.includes(id)) return
      writeSection(id, 'push')
      window.scrollTo({ top: 0, behavior: 'instant' })
    },
    [allowedIds],
  )

  return { section, select }
}
