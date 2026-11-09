'use client'

import { useEffect, useRef, useState } from 'react'
import { ClinicSiteView } from '../[clinica]/clinic-site-view'
import { editorOrigins } from '../../../lib/editor-origins'
import type { PublicClinic } from '../../../lib/public-clinic'

const sections = ['cover', 'services', 'info', 'gallery'] as const

function safeImage(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
      ? url.href
      : null
  } catch {
    return null
  }
}

/** Accepts only the public projection shape; anything unexpected is dropped, not rendered. */
function sanitize(value: unknown): PublicClinic | null {
  if (!value || typeof value !== 'object') return null
  const clinic = value as PublicClinic
  if (
    typeof clinic.name !== 'string' ||
    typeof clinic.slug !== 'string' ||
    !Array.isArray(clinic.services) ||
    !Array.isArray(clinic.hours)
  )
    return null
  return {
    ...clinic,
    logoUrl: safeImage(clinic.logoUrl),
    gallery: (clinic.gallery ?? []).map(safeImage).filter((url): url is string => Boolean(url)),
    featured: (clinic.featured ?? []).map((item) => ({
      ...item,
      photoUrl: safeImage(item.photoUrl),
    })),
    servicePhotos: (clinic.servicePhotos ?? []).flatMap((item) => {
      const photoUrl = safeImage(item.photoUrl)
      return photoUrl ? [{ serviceId: item.serviceId, photoUrl }] : []
    }),
  }
}

export function ClinicEditorPreview() {
  const [clinic, setClinic] = useState<PublicClinic | null>(null)
  const parentOrigin = useRef<string | null>(null)

  useEffect(() => {
    const allowed = editorOrigins()
    const onMessage = (event: MessageEvent) => {
      if (!allowed.includes(event.origin) || event.source !== window.parent) return
      parentOrigin.current = event.origin
      const data = event.data as { type?: string; clinic?: unknown; section?: string }
      if (data?.type === 'luminix:preview') {
        const next = sanitize(data.clinic)
        if (next) setClinic(next)
      } else if (data?.type === 'luminix:scroll' && sections.includes(data.section as never)) {
        document
          .querySelector(`[data-edit="${data.section}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
    // Clicking a block asks the editor to open the matching panel; links do not navigate away.
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const link = target?.closest('a')
      if (link && !link.getAttribute('href')?.startsWith('#')) event.preventDefault()
      const block = target?.closest<HTMLElement>('[data-edit]')
      if (block && parentOrigin.current)
        window.parent.postMessage(
          { type: 'luminix:focus', section: block.dataset.edit },
          parentOrigin.current,
        )
    }
    window.addEventListener('message', onMessage)
    document.addEventListener('click', onClick, true)
    for (const origin of allowed)
      window.parent.postMessage({ type: 'luminix:preview-ready' }, origin)
    return () => {
      window.removeEventListener('message', onMessage)
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  if (!clinic)
    return (
      <div className="clinic-preview-loading" role="status">
        <span className="clinic-preview-spinner" aria-hidden />
        Preparando a prévia do seu site…
      </div>
    )
  return (
    <div className="clinic-editing">
      <ClinicSiteView clinic={clinic} editing />
    </div>
  )
}
