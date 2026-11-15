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
    demo,
  }
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Demo spaces matching a name, category or code. Real spaces resolve only by code/address. */
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

/** "KW-4374" or a pasted site address → candidate slug, or null. */
export function slugFromQuery(query: string) {
  const text = query
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/[^/]+\/c\//, '')
    .replace(/[/?#].*$/, '')
  const demo = demoOptions.find(({ slug }) => demoSpaceCode(slug).toLowerCase() === text)
  if (demo) return demo.slug
  return text.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(text) ? text : null
}
