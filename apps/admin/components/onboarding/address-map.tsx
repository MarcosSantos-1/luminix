'use client'

import { useEffect, useRef, useState } from 'react'
import { useStaff } from '@/components/staff-provider'

type Point = { lat: number; lng: number }
type Status = 'idle' | 'loading' | 'ready' | 'missing' | 'unavailable'

type OverlayViewBase = {
  setMap: (map: object | null) => void
  getPanes: () => { overlayMouseTarget: HTMLElement } | null
  getProjection: () => {
    fromLatLngToDivPixel: (position: object) => { x: number; y: number } | null
  } | null
  onAdd: () => void
  draw: () => void
  onRemove: () => void
}

type MapsApi = {
  maps: {
    Map: new (
      element: HTMLElement,
      options: object,
    ) => { panTo: (position: object) => void; setZoom: (zoom: number) => void }
    LatLng: new (lat: number, lng: number) => object
    OverlayView: new () => OverlayViewBase
  }
}

const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''
let mapsPromise: Promise<void> | null = null

function loadGoogleMaps(key: string) {
  const current = (window as Window & { google?: MapsApi }).google
  if (current?.maps) return Promise.resolve()
  if (!mapsPromise) {
    mapsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=pt-BR&region=BR`
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        mapsPromise = null
        reject(new Error('Maps script failed'))
      }
      document.head.appendChild(script)
    })
  }
  return mapsPromise
}

function createPin(maps: MapsApi, position: object, logoUrl: string | null, mark: string) {
  const pin = new maps.maps.OverlayView()
  let node: HTMLElement | null = null
  pin.onAdd = () => {
    const head = document.createElement('div')
    head.className = 'ob2-map-pin-head'
    if (logoUrl) {
      const image = document.createElement('img')
      image.alt = ''
      image.src = logoUrl
      image.addEventListener('error', () => {
        image.remove()
        head.classList.add('is-letter')
        head.textContent = mark
      })
      head.appendChild(image)
    } else {
      head.classList.add('is-letter')
      head.textContent = mark
    }
    const tip = document.createElement('div')
    tip.className = 'ob2-map-pin-tip'
    node = document.createElement('div')
    node.className = 'ob2-map-pin'
    node.append(head, tip)
    pin.getPanes()?.overlayMouseTarget.appendChild(node)
  }
  pin.draw = () => {
    const point = pin.getProjection()?.fromLatLngToDivPixel(position)
    if (!node || !point) return
    node.style.left = `${point.x}px`
    node.style.top = `${point.y}px`
  }
  pin.onRemove = () => {
    node?.remove()
    node = null
  }
  return pin
}

export function AddressMap({
  line,
  number,
  district,
  city,
  state,
  postalCode,
  logoUrl,
  clinicName,
}: {
  line: string
  number: string
  district: string
  city: string
  state: string
  postalCode: string
  logoUrl: string | null
  clinicName: string
}) {
  const staff = useStaff()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [point, setPoint] = useState<Point | null>(null)
  const addressKey = [line, number, district, city, state, postalCode].join('|')

  useEffect(() => {
    const street = line.trim()
    const cityName = city.trim()
    const cep = postalCode.replace(/\D/g, '')
    if (street.length < 3 || (cityName.length < 2 && cep.length !== 8)) {
      setPoint(null)
      setStatus('idle')
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        setStatus('loading')
        try {
          const token = staff.user ? await staff.user.getIdToken() : ''
          if (!token || controller.signal.aborted) return
          const params = new URLSearchParams({ line: street })
          if (number.trim()) params.set('number', number.trim())
          if (district.trim()) params.set('district', district.trim())
          if (cityName) params.set('city', cityName)
          if (state.trim()) params.set('state', state.trim())
          if (cep.length === 8) params.set('postalCode', cep)
          const response = await fetch(`/api/address/geocode?${params}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: 'no-store',
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
          })
          if (controller.signal.aborted) return
          if (response.status === 404) {
            setPoint(null)
            setStatus('missing')
            return
          }
          if (!response.ok) throw new Error('Geocode failed')
          const data = (await response.json()) as { location?: Point }
          if (typeof data.location?.lat !== 'number' || typeof data.location.lng !== 'number')
            throw new Error('Geocode failed')
          setPoint(data.location)
          setStatus('ready')
        } catch (error) {
          if (controller.signal.aborted) return
          if (error instanceof DOMException && error.name === 'AbortError') return
          setPoint(null)
          setStatus('unavailable')
        }
      })()
    }, 500)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [addressKey, city, district, line, number, postalCode, staff.user, state])

  useEffect(() => {
    if (status !== 'ready' || !point || !canvasRef.current) return
    if (!mapsKey) {
      setStatus('unavailable')
      return
    }
    let cancelled = false
    let pin: OverlayViewBase | null = null
    const position = point
    const mark = (clinicName.trim()[0] || 'L').toUpperCase()
    const canvas = canvasRef.current
    void loadGoogleMaps(mapsKey)
      .then(() => {
        if (cancelled) return
        const maps = (window as Window & { google?: MapsApi }).google
        if (!maps?.maps) throw new Error('Maps missing')
        canvas.replaceChildren()
        const latLng = new maps.maps.LatLng(position.lat, position.lng)
        const map = new maps.maps.Map(canvas, {
          center: latLng,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'cooperative',
          clickableIcons: false,
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'off' }] },
            { elementType: 'geometry', stylers: [{ color: '#f8eef3' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#6d4458' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#d5e6f2' }] },
            { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f3e4eb' }] },
          ],
        })
        pin = createPin(maps, latLng, logoUrl, mark)
        pin.setMap(map)
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable')
      })
    return () => {
      cancelled = true
      pin?.setMap(null)
    }
  }, [clinicName, logoUrl, point, status])

  if (status === 'idle' && line.trim().length < 3) return null
  if (status === 'idle') {
    return <p className="ob2-map-note">Informe a cidade ou o CEP para mostrar o local no mapa.</p>
  }
  if (status === 'missing') {
    return (
      <div className="ob2-address-map">
        <p className="ob2-map-note" role="status">
          Não encontramos esse local. Confira rua, número e cidade.
        </p>
      </div>
    )
  }
  if (status === 'unavailable') {
    return (
      <div className="ob2-address-map">
        <p className="ob2-map-note" role="status">
          Não foi possível carregar o mapa agora.
        </p>
      </div>
    )
  }

  return (
    <div className="ob2-address-map">
      {status === 'loading' ? (
        <p className="ob2-map-note" role="status">
          Buscando o local…
        </p>
      ) : (
        <div ref={canvasRef} className="ob2-address-map-canvas" />
      )}
    </div>
  )
}
