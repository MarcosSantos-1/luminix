// Same six clinic palettes as the web client area (apps/web/app/cliente/cliente.css).
// Only the four brand tokens change per space; neutrals, radii and type stay fixed.
export type Palette = { deep: string; accent: string; light: string; muted: string }

export const palettes: Record<string, Palette> = {
  luminix: { deep: '#1c1c22', accent: '#4a4a57', light: '#ececf1', muted: '#6d6d78' },
  rosa: { deep: '#780033', accent: '#b31b58', light: '#fbeaf1', muted: '#745d69' },
  grafite: { deep: '#0d0f13', accent: '#445061', light: '#edf0f3', muted: '#606770' },
  violeta: { deep: '#210a45', accent: '#7144a3', light: '#f0eafa', muted: '#6e627c' },
  dourado: { deep: '#30200b', accent: '#86601e', light: '#f9f0dc', muted: '#786e58' },
  esmeralda: { deep: '#042c26', accent: '#216e58', light: '#e6f3ed', muted: '#536d64' },
  azul: { deep: '#071e3b', accent: '#2c629d', light: '#eaf1fa', muted: '#596e85' },
}

export function paletteFor(theme: string | null | undefined): Palette {
  return palettes[theme ?? 'luminix'] ?? palettes.luminix
}

export const colors = {
  bg: '#f3f3f6',
  card: '#ffffff',
  ink: '#17171c',
  line: 'rgba(23,23,28,0.09)',
  danger: '#b3261e',
  ok: '#14613a',
  okBg: '#dff3e6',
}

export const fonts = {
  display: 'Outfit_700Bold',
  displayMedium: 'Outfit_600SemiBold',
  body: 'Figtree_500Medium',
  bodyBold: 'Figtree_700Bold',
  bodySemi: 'Figtree_600SemiBold',
}

export const radius = { card: 26, field: 16, button: 18, pill: 999 }

export const shadow = {
  shadowColor: '#17171c',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4,
}
