export const spaceThemes = [
  { id: 'rosa', label: 'Padrão', dark: '#780033', light: '#ed85ad' },
  { id: 'grafite', label: 'Grafite', dark: '#080a0d', light: '#6d7785' },
  { id: 'violeta', label: 'Violeta', dark: '#210a45', light: '#a58be4' },
  { id: 'dourado', label: 'Dourado', dark: '#30200b', light: '#cda858' },
  { id: 'esmeralda', label: 'Esmeralda', dark: '#042c26', light: '#57ac96' },
  { id: 'azul', label: 'Azul', dark: '#071e3b', light: '#6ba2df' },
] as const
export type SpaceTheme = (typeof spaceThemes)[number]['id']
export function spaceTheme(value: unknown): SpaceTheme {
  return spaceThemes.find((theme) => theme.id === value)?.id ?? 'rosa'
}
