'use client'

import { useState } from 'react'
import { Copy, MapPin } from 'lucide-react'

export function ClinicMiniMap({ address }: { address: string }) {
  const [loaded, setLoaded] = useState(false)

  return loaded ? (
    <iframe
      className="clinic-map-frame"
      title="Minimapa da localização no Google Maps"
      src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
      referrerPolicy="no-referrer"
    />
  ) : (
    <button className="clinic-map-preview" type="button" onClick={() => setLoaded(true)}>
      <MapPin size={25} aria-hidden />
      <span>Carregar minimapa</span>
    </button>
  )
}

export function ClinicSpaceCode({ code }: { code: string }) {
  const [message, setMessage] = useState('')
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setMessage('Código copiado.')
    } catch {
      setMessage('Selecione e copie o código acima.')
    }
  }
  return (
    <div className="clinic-app-code">
      <span>Código do espaço</span>
      <div>
        <code>{code}</code>
        <button type="button" aria-label="Copiar código do espaço" onClick={() => void copyCode()}>
          <Copy size={16} aria-hidden />
        </button>
      </div>
      <small role="status">{message}</small>
    </div>
  )
}
