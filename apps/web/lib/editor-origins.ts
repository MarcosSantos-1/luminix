/** Admin origins allowed to drive the live editor preview (postMessage and framing). */
export function editorOrigins(): string[] {
  const origins = new Set(['https://app.luminix.beauty', 'https://admin-xi-snowy.vercel.app'])
  const configured = process.env.NEXT_PUBLIC_ADMIN_URL
  if (configured) {
    try {
      origins.add(new URL(configured).origin)
    } catch {
      // Ignore malformed configuration; the defaults stay in place.
    }
  }
  if (process.env.NODE_ENV !== 'production') origins.add('http://localhost:3000')
  return [...origins]
}
