import { describe, expect, it } from 'vitest'
import { spannedVisitEnd } from '../src/modules/client/routes.js'

const day = [
  { start: '08:00', end: '13:00' },
  { start: '14:00', end: '18:00' },
]
const at = (value: string) => {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

describe('combo visit over the break', () => {
  it('pauses at lunch and ends after it', () => {
    // 5h30 from 08:00: 5h until 13:00, then 30 min after lunch.
    expect(spannedVisitEnd(day, at('08:00'), 330)).toBe(at('14:30'))
    expect(spannedVisitEnd(day, at('11:30'), 330)).toBe(at('18:00'))
  })

  it('ends inside the first period when it fits', () => {
    expect(spannedVisitEnd(day, at('08:00'), 120)).toBe(at('10:00'))
  })

  it('has no end when the day runs out of work time', () => {
    expect(spannedVisitEnd(day, at('12:00'), 330)).toBeNull()
    expect(
      spannedVisitEnd(
        [
          { start: '09:00', end: '10:30' },
          { start: '11:30', end: '13:00' },
        ],
        at('09:00'),
        330,
      ),
    ).toBeNull()
  })

  it('ignores the order the periods come in', () => {
    expect(spannedVisitEnd([...day].reverse(), at('08:00'), 330)).toBe(at('14:30'))
  })
})
