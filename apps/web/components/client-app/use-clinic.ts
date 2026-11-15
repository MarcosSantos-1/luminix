'use client'

import { useEffect, useState } from 'react'
import type { PublicClinic } from '../../lib/public-clinic'
import type { SpaceSummary } from '../../lib/client-app/types'

type Loaded = { clinic: PublicClinic; summary: SpaceSummary }
const cache = new Map<string, Promise<Loaded | null>>()

export function fetchSpace(slug: string) {
  let pending = cache.get(slug)
  if (!pending) {
    pending = fetch(`/api/espacos/${encodeURIComponent(slug)}`)
      .then((response) => (response.ok ? (response.json() as Promise<Loaded>) : null))
      .catch(() => null)
    cache.set(slug, pending)
    // A failed lookup is not remembered, so a retry can succeed.
    void pending.then((value) => {
      if (!value) cache.delete(slug)
    })
  }
  return pending
}

export async function searchSpaces(query: string, signal: AbortSignal): Promise<SpaceSummary[]> {
  const response = await fetch(`/api/espacos?q=${encodeURIComponent(query)}`, { signal })
  if (!response.ok) return []
  return ((await response.json()) as { spaces: SpaceSummary[] }).spaces
}

export function useClinic(slug: string | null) {
  const [result, setResult] = useState<{ slug: string; data: Loaded | null } | null>(null)
  useEffect(() => {
    if (!slug) return
    let active = true
    void fetchSpace(slug).then((data) => {
      if (active) setResult({ slug, data })
    })
    return () => {
      active = false
    }
  }, [slug])
  const current = result && result.slug === slug ? result : null
  return {
    clinic: current?.data?.clinic ?? null,
    status: !current
      ? ('loading' as const)
      : current.data
        ? ('ready' as const)
        : ('error' as const),
  }
}
