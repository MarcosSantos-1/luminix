export function isPublicClinicSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)
}

export function publicClinicTag(slug: string) {
  return `public-clinic:${slug}`
}
