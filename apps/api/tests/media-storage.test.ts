import { describe, expect, it } from 'vitest'
import { mediaObjectKey, readWebpDimensions } from '../src/modules/clinics/media-storage.js'

describe('clinic media storage', () => {
  it('uses tenant-first immutable object keys', () => {
    expect(
      mediaObjectKey(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'professional_photo',
        '33333333-3333-4333-8333-333333333333',
        'small',
      ),
    ).toBe(
      '11111111-1111-4111-8111-111111111111/team/33333333-3333-4333-8333-333333333333/22222222-2222-4222-8222-222222222222/small-128.webp',
    )
  })

  it('reads dimensions from a VP8X WebP header', () => {
    const header = Buffer.alloc(30)
    header.write('RIFF', 0, 'ascii')
    header.write('WEBP', 8, 'ascii')
    header.write('VP8X', 12, 'ascii')
    header.writeUIntLE(511, 24, 3)
    header.writeUIntLE(511, 27, 3)
    expect(readWebpDimensions(header)).toEqual({ width: 512, height: 512 })
    header.write('NOPE', 8, 'ascii')
    expect(readWebpDimensions(header)).toBeNull()
  })
})
