export function adminUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://app.luminix.beauty').replace(
    /\/$/,
    '',
  )
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}
