import { describe, expect, it } from 'vitest'
import { formatClinicGeocodeAddress, pickGeocodedPoint } from '../src/modules/auth/geocode.js'

describe('clinic geocoding', () => {
  it('builds a Brazilian address with street, number, district and city', () => {
    expect(
      formatClinicGeocodeAddress({
        line: 'Rua Augusta',
        number: '100',
        district: 'Consolação',
        city: 'São Paulo',
        state: 'sp',
        postalCode: '01305-000',
      }),
    ).toBe('Rua Augusta, 100, Consolação, São Paulo - SP, 01305000, Brasil')
  })

  it('keeps a precise point and ignores an approximate city match', () => {
    expect(
      pickGeocodedPoint({
        status: 'OK',
        results: [
          {
            geometry: {
              location_type: 'APPROXIMATE',
              location: { lat: 1, lng: 2 },
            },
          },
          {
            geometry: {
              location_type: 'ROOFTOP',
              location: { lat: -23.55, lng: -46.66 },
            },
          },
        ],
      }),
    ).toEqual({ lat: -23.55, lng: -46.66 })
  })

  it('reports the place as missing when Google has no precise result', () => {
    expect(pickGeocodedPoint({ status: 'ZERO_RESULTS', results: [] })).toBeNull()
    expect(
      pickGeocodedPoint({
        status: 'OK',
        results: [
          { geometry: { location_type: 'APPROXIMATE', location: { lat: -23.5, lng: -46.6 } } },
        ],
      }),
    ).toBeNull()
  })
})
