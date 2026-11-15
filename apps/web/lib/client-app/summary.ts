import { clinicCategories, dominantClinicCategory } from '../clinic-categories.ts'
import { clinicTheme, type PublicClinic } from '../public-clinic.ts'
import { demoOptions, getPreviewClinic } from '../preview-clinic.ts'
import type { SpaceSummary } from './types.ts'

export function demoSpaceCode(slug: string) {
  return slug === 'demonstracao' ? 'DEMO' : slug.replace('demonstracao-', 'DEMO-').toUpperCase()
}

/** The only fields the space picker needs; nothing private is projected. */
export function summarizeSpace(clinic: PublicClinic): SpaceSummary {
  const demo = Boolean(getPreviewClinic(clinic.slug))
  const category = dominantClinicCategory(clinic.services)
  const location = clinic.location
  const street = [location?.line, location?.number].filter(Boolean).join(', ')
  const city = [location?.city, location?.state].filter(Boolean).join(' · ')
  return {
    slug: clinic.slug,
    code: demo
      ? demoSpaceCode(clinic.slug)
      : (clinic.code ??
        (/^[a-z]{2}-[0-9]{4}$/.test(clinic.slug) ? clinic.slug.toUpperCase() : null)),
    name: clinic.name,
    theme: clinicTheme(clinic.theme),
    logoUrl: clinic.logoUrl,
    city: city || (demo ? 'São Paulo · SP' : null),
    address: [street, location?.district].filter(Boolean).join(' · ') || null,
    category: category ? clinicCategories[category].label : null,
    mapQuery: demo
      ? 'Praça da Sé, São Paulo, SP'
      : street || location?.district
        ? [street, location?.district, location?.city, location?.state].filter(Boolean).join(', ')
        : null,
    demo,
  }
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/**
 * Term sent to the public name search: folded like the API does, or null when it is a pasted
 * address or has fewer than 3 useful characters.
 */
export function searchTerm(query: string) {
  if (/^https?:\/\//i.test(query.trim())) return null
  const term = fold(query)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return term.length >= 3 && term.length <= 120 ? term : null
}

/** One item of `GET /public/clinic-search` → picker summary; null when it is not a valid space. */
export function summarizeSearchResult(item: unknown): SpaceSummary | null {
  if (typeof item !== 'object' || item === null) return null
  const text = (key: string) => {
    const value = (item as Record<string, unknown>)[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  const slug = text('slug')
  const name = text('name')
  if (!slug || !name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null
  if (getPreviewClinic(slug)) return null
  const category = text('category')
  const [street, district, city, state] = ['address', 'district', 'city', 'state'].map(text)
  return {
    slug,
    code: text('code'),
    name,
    theme: clinicTheme(text('theme') ?? ''),
    logoUrl: text('logoUrl'),
    city: [city, state].filter(Boolean).join(' · ') || null,
    address: [street, district].filter(Boolean).join(' · ') || null,
    category:
      category && Object.hasOwn(clinicCategories, category)
        ? clinicCategories[category as keyof typeof clinicCategories].label
        : null,
    mapQuery:
      street || district ? [street, district, city, state].filter(Boolean).join(', ') : null,
    demo: false,
  }
}

/** Demo spaces matching a name, category or code. Published spaces come from the API search. */
export function searchDemoSpaces(query: string): SpaceSummary[] {
  const term = fold(query)
  if (term.length < 2) return []
  return demoOptions
    .map(({ slug }) => summarizeSpace(getPreviewClinic(slug)!))
    .filter((space) =>
      [space.name, space.category ?? '', space.code ?? '', space.slug].some((value) =>
        fold(value).includes(term),
      ),
    )
}

/**
 * "KW-4374", a pasted site address or the full name → candidate slug, or null. Addresses are
 * generated from the space name, so "Espaço Vanessa" resolves to "espaco-vanessa". Partial names
 * and spaces with a custom address are found by the public name search instead (`searchTerm`).
 */
export function slugFromQuery(query: string) {
  const pasted = /^https?:\/\//i.test(query.trim())
  const text = query
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\/c\//, '')
    .replace(/[/?#].*$/, '')
  const demo = demoOptions.find(({ slug }) => demoSpaceCode(slug).toLowerCase() === text)
  if (demo) return demo.slug
  const slug = pasted
    ? text
    : fold(text)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
  return slug.length >= 3 && slug.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
    ? slug
    : null
}
