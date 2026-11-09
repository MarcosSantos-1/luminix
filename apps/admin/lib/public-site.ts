/** Origin of the public website (apps/web). Local development points to `pnpm dev:web`. */
export function publicSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_WEB_URL
  if (configured) return configured.replace(/\/$/, '')
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : 'https://luminix.beauty'
}

export function publicSiteUrl(slug: string) {
  return `${publicSiteOrigin()}/c/${slug ? encodeURIComponent(slug) : ''}`
}
