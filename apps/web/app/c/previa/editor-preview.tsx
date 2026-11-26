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
  // Framed by the site editor, or opened in its own tab by the admin (onboarding "ver a vitrine").
  // Recorded when the content arrives, so the first render matches the server's.
  const [standalone, setStandalone] = useState(false)
  const parentOrigin = useRef<string | null>(null)
  // Opened without the admin behind it (typed URL, reload, browser without opener): say so
  // instead of loading forever.
  const [orphan, setOrphan] = useState(false)

  useEffect(() => {
    if (clinic) return
    const hasHost = window.parent !== window || Boolean(window.opener)
    const timer = window.setTimeout(() => setOrphan(true), hasHost ? 8000 : 0)
    return () => window.clearTimeout(timer)
  }, [clinic])

  useEffect(() => {
    const allowed = editorOrigins()
    const framed = window.parent !== window
    const host: Window | null = framed ? window.parent : window.opener
    const onMessage = (event: MessageEvent) => {
      if (!host || !allowed.includes(event.origin) || event.source !== host) return
      if (framed) parentOrigin.current = event.origin
      const data = event.data as { type?: string; clinic?: unknown; section?: string }
      if (data?.type === 'luminix:preview') {
        const next = sanitize(data.clinic)
        if (next) {
          window.clearInterval(announcing)
          setStandalone(!framed)
          setClinic(next)
        }
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
    // Announced until the content arrives: the host may start listening after this page loads.
    const announce = () => {
      if (host)
        for (const origin of allowed) host.postMessage({ type: 'luminix:preview-ready' }, origin)
    }
    announce()
    let attempts = 0
    const announcing = window.setInterval(() => {
      if (++attempts >= 15) window.clearInterval(announcing)
      announce()
    }, 1000)
    return () => {
      window.clearInterval(announcing)
      window.removeEventListener('message', onMessage)
      document.removeEventListener('click', onClick, true)
    }
  }, [])

  if (!clinic && orphan)
    return (
      <div className="clinic-preview-loading" role="status">
        Esta prévia abre a partir do painel do Luminix. Volte à aba do cadastro e toque em “Ver a
        vitrine em outra aba”.
      </div>
    )
  if (!clinic)
    return (
      <div className="clinic-preview-loading" role="status">
        <span className="clinic-preview-spinner" aria-hidden />
        Preparando a prévia do seu site…
      </div>
    )
  // In its own tab it is what clients will see; framed by the editor, blocks are clickable.
  if (standalone) return <ClinicSiteView clinic={clinic} />
  return (
    <div className="clinic-editing">
      <ClinicSiteView clinic={clinic} editing />
    </div>
  )
}
