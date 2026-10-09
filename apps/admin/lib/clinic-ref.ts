const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const code = /^[A-Za-z]{2}-[0-9]{4}$/

export function isClinicRef(value: string) {
  return uuid.test(value) || code.test(value)
}
