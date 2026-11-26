'use client'

import { ExternalLink, Flower2, Settings2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DaySchedule, Payload } from '@/components/onboarding/model'
import { publicSiteOrigin } from '@/lib/public-site'

/** Open periods of a day: the opening hours minus its breaks. */
function periods(day: DaySchedule) {
  if (!day.enabled) return []
  const breaks = [...day.breaks].sort((left, right) => left.start.localeCompare(right.start))
  const result: { start: string; end: string }[] = []
  let cursor = day.start
  for (const pause of breaks) {
    if (pause.start > cursor) result.push({ start: cursor, end: pause.start })
    if (pause.end > cursor) cursor = pause.end
  }
  if (day.end > cursor) result.push({ start: cursor, end: day.end })
  return result
}

/**
 * What the public site will show once the onboarding is completed, in the same shape the site
 * receives from the API (`PublicClinic`), built from the draft so it works before publishing.
 */
export function showcaseFromPayload(
  payload: Payload,
  code: string,
  publication: { address: boolean; contacts: boolean },
) {
  const clinic = payload.clinic
  const year = Number(clinic.foundedYear)
  return {
    slug: code,
    code,
    name: payload.name.trim() || 'Seu espaço',
    theme: clinic.theme || 'rosa',
    foundedYear: Number.isInteger(year) && year > 1900 ? year : null,
    logoUrl: clinic.logoUrl ?? null,
    whatsapp: publication.contacts ? clinic.whatsapp || null : null,
    instagram: publication.contacts ? clinic.instagram || null : null,
    facebook: publication.contacts ? clinic.facebook || null : null,
    website: publication.contacts ? clinic.website || null : null,
    location: publication.address
      ? {
          line: clinic.addressLine || null,
          number: clinic.addressNumber || null,
          district: clinic.addressDistrict || null,
          city: clinic.city || null,
          state: clinic.state || null,
          postalCode: clinic.postalCode || null,
        }
      : null,
    hours: payload.businessHours.map((day) => ({
      weekday: day.weekday,
      available: day.enabled,
      periods: periods(day),
    })),
    services: payload.services.map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category,
      description: service.description || null,
      priceCents: service.priceCents,
      priceType: service.priceType,
      durationMinutes: service.durationMinutes,
      bookingMode: service.bookingMode,
    })),
    featured: [],
    gallery: [],
    servicePhotos: [],
    hidden: [],
  }
}

/** The address only goes public for a space with a real storefront address. */
export function defaultPublication(payload: Payload) {
  const clinic = payload.clinic
  return {
    address: !clinic.homeService && Boolean(clinic.addressLine?.trim()),
    contacts: true,
  }
}

/**
 * Last step: the showcase is already built from the previous steps and goes live on completion.
 * A small live preview (the site's own /c/previa page, fed by postMessage); a click opens the
 * same preview in a new tab. Fine-tuning lives in Configurações → Vitrine e site.
 */
export function ShowcaseReady({
  payload,
  code,
  preview = false,
}: {
  payload: Payload
  code: string
  preview?: boolean
}) {
  const origin = publicSiteOrigin()
  const frame = useRef<HTMLIFrameElement>(null)
  const [frameReady, setFrameReady] = useState(false)
  const clinic = useMemo(
    () => showcaseFromPayload(payload, code, defaultPublication(payload)),
    [payload, code],
  )
  const opened = useRef<Window | null>(null)
  const screen = useRef<HTMLSpanElement>(null)

  // The site renders at 1280px wide and is scaled to the card, like a screenshot of the page.
  useEffect(() => {
    const element = screen.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      element.style.setProperty('--ob2-showcase-scale', String(entry.contentRect.width / 1280))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const sendTo = useCallback(
    (target: Window | null | undefined) =>
      target?.postMessage({ type: 'luminix:preview', clinic }, origin),
    [clinic, origin],
  )

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return
      if ((event.data as { type?: string })?.type !== 'luminix:preview-ready') return
      if (event.source === frame.current?.contentWindow) setFrameReady(true)
      else if (event.source && event.source === opened.current) sendTo(opened.current)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [origin, sendTo])

  useEffect(() => {
    if (frameReady) sendTo(frame.current?.contentWindow)
  }, [frameReady, sendTo])

  function openInNewTab() {
    // Not `noopener`: the new tab announces itself and receives the preview from this page.
    opened.current = window.open(`${origin}/c/previa`, '_blank')
  }

  return (
    <section className="ob2-showcase" aria-labelledby="ob2-showcase-title">
      <div className="ob2-showcase-copy">
        <span className="ob2-showcase-eyebrow">
          <Flower2 size={14} aria-hidden /> Vitrine do seu espaço
        </span>
        <h3 id="ob2-showcase-title">Sua vitrine já está pronta</h3>
        <p>
          Montamos o site com o que você preencheu: nome, logo, cores, serviços com preços e
          horários.{' '}
          {preview
            ? 'A vitrine aparece aqui como prévia.'
            : 'Ele entra no ar assim que você concluir, com um link para mandar às clientes.'}
        </p>
        <p className="ob2-showcase-note">
          <Settings2 size={15} aria-hidden />
          <span>
            Quer trocar capa, fotos ou o que aparece? Depois é só ir em{' '}
            <strong>Configurações → Vitrine e site</strong>.
          </span>
        </p>
      </div>
      <button
        type="button"
        className="ob2-showcase-preview"
        onClick={openInNewTab}
        aria-label="Abrir a prévia da vitrine em outra aba"
      >
        <span className="ob2-showcase-screen" aria-hidden ref={screen}>
          <iframe ref={frame} src={`${origin}/c/previa`} title="" tabIndex={-1} />
          {!frameReady ? <span className="ob2-showcase-loading">Montando a prévia…</span> : null}
        </span>
        <span className="ob2-showcase-open">
          <ExternalLink size={15} aria-hidden /> Ver a vitrine em outra aba
        </span>
      </button>
    </section>
  )
}
