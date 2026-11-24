'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft, Copy, MapPin, Map as MapIcon, Navigation } from 'lucide-react'
import { useClient } from '../../../../lib/client-app/store'
import { Empty, SpaceLogo } from '../../../../components/client-app/ui'
import { toast } from '../../../../components/client-app/toast'

/** Where the space is: a large pinned map, the written address and ways to get there. */
export default function LocationPage() {
  const { space } = useClient()
  const [loaded, setLoaded] = useState(false)
  if (!space) return null
  const { summary } = space
  const address = [summary.address, summary.city].filter(Boolean).join(' · ')
  const query = summary.mapQuery ?? (address ? `${summary.name} ${address}` : null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(address || summary.name)
      toast.success('Endereço copiado')
    } catch {
      toast.error('Não deu para copiar', 'Selecione o endereço e copie manualmente.')
    }
  }

  return (
    <div className="ca-page ca-location">
      <Link href="/cliente" className="ca-back-link">
        <ArrowLeft size={16} aria-hidden /> Voltar
      </Link>
      {!query ? (
        <Empty title="Este espaço ainda não publicou o endereço">
          <p>Fale com a equipe para saber como chegar.</p>
        </Empty>
      ) : (
        <>
          <div className="ca-location-map" data-loaded={loaded || undefined}>
            <iframe
              title={`Mapa da localização de ${summary.name}`}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
            />
            {!loaded && (
              <div className="ca-map-loading" role="status">
                <span className="ca-map-pin">
                  <MapPin size={22} aria-hidden />
                </span>
                Localizando {summary.name}…
              </div>
            )}
          </div>
          <section className="ca-location-card">
            <header>
              <SpaceLogo space={summary} size={52} />
              <span>
                <small>Onde fica</small>
                <strong>{summary.name}</strong>
              </span>
            </header>
            {address ? (
              <p className="ca-location-address">
                <MapPin size={18} aria-hidden />
                <span>{address}</span>
              </p>
            ) : null}
            <div className="ca-location-actions">
              <button type="button" className="ca-button ghost" onClick={() => void copy()}>
                <Copy size={18} aria-hidden /> Copiar endereço
              </button>
              <a
                className="ca-button"
                data-brand="google"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapIcon size={18} aria-hidden /> Google Maps
              </a>
              <a
                className="ca-button"
                data-brand="waze"
                href={`https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation size={18} aria-hidden /> Waze
              </a>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
