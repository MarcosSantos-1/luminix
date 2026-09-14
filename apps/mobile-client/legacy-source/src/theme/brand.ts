/** Brand tokens aligned with assets/onboarding-template */
export const cardFaceColors = {
  primary: ['#ec4998', '#d63d86', '#b7276e'] as const,
  secondary: [
    ['#c9a24b', '#b8923f', '#8a6d28'],
    ['#0f766e', '#0d9488', '#115e59'],
    ['#4338ca', '#4f46e5', '#312e81'],
    ['#475569', '#334155', '#1e293b'],
    ['#b45309', '#c2410c', '#713f12'],
  ] as const,
} as const;

export function cardFaceGradient(card: { isDefault?: boolean }, index: number): readonly [string, string, string] {
  if (card.isDefault) return cardFaceColors.primary;
  return cardFaceColors.secondary[index % cardFaceColors.secondary.length];
}

export const brand = {
  rose: '#ec4998',
  roseDeep: '#b7276e',
  blush: '#fbe4ee',
  champagne: '#f7e9dd',
  champagneDeep: '#ecd3ba',
  gold: '#c9a24b',
  goldSoft: '#e6c98a',
  ink: '#2b1721',
  background: '#fdf7f4',
  muted: '#8a7078',
  border: 'rgba(43, 23, 33, 0.12)',
  white: '#ffffff',
} as const;
