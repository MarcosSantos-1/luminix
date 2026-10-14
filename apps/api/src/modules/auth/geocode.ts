export type GeocodeAddress = {
  line: string
  number?: string
  district?: string
  city?: string
  state?: string
  postalCode?: string
}

export function formatClinicGeocodeAddress(address: GeocodeAddress) {
  const street = [address.line.trim(), address.number?.trim() ?? ''].filter(Boolean).join(', ')
  const cityLine = [address.city?.trim() ?? '', address.state?.trim().toUpperCase() ?? '']
    .filter(Boolean)
    .join(' - ')
  const place = [address.district?.trim() ?? '', cityLine].filter(Boolean).join(', ')
  const postalCode = (address.postalCode ?? '').replace(/\D/g, '')
  return [street, place, postalCode.length === 8 ? postalCode : '', 'Brasil'].filter(Boolean).join(', ')
}

type GeocodePayload = {
  status?: string
  results?: Array<{
    geometry?: {
      location?: { lat?: unknown; lng?: unknown }
      location_type?: string
    }
  }>
}

export function pickGeocodedPoint(payload: GeocodePayload) {
  if (payload.status !== 'OK') return null
  for (const result of payload.results ?? []) {
    if (result.geometry?.location_type === 'APPROXIMATE') continue
    const lat = result.geometry?.location?.lat
    const lng = result.geometry?.location?.lng
    if (typeof lat !== 'number' || typeof lng !== 'number') continue
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    return { lat, lng }
  }
  return null
}
