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

const themeStorageKey = 'luminix.spaceTheme'
const themeMapStorageKey = 'luminix.spaceThemes'

export function rememberSpaceTheme(theme: SpaceTheme, ...clinicKeys: Array<string | null | undefined>) {
  try {
    localStorage.setItem(themeStorageKey, theme)
    const raw = localStorage.getItem(themeMapStorageKey)
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    for (const key of clinicKeys) {
      if (key) map[key] = theme
    }
    localStorage.setItem(themeMapStorageKey, JSON.stringify(map))
  } catch {
    /* Storage can be unavailable in private mode. The theme still applies for this visit. */
  }
}

/** Runs before paint so a reload uses the saved theme instead of the default pink screen. */
export const spaceThemeBootScript = `(function(){try{var ok=${JSON.stringify(spaceThemes.map((theme) => theme.id))};var dark=${JSON.stringify(Object.fromEntries(spaceThemes.map((theme) => [theme.id, theme.dark])))};function allow(value){return ok.indexOf(value)>=0}var map={};try{map=JSON.parse(localStorage.getItem('${themeMapStorageKey}')||'{}')}catch(e){}var parts=location.pathname.split('/');var id=parts[1]==='c'?decodeURIComponent(parts[2]||''):'';var theme=id&&map[id];if(!allow(theme))theme=localStorage.getItem('${themeStorageKey}');if(!allow(theme))return;document.documentElement.dataset.spaceTheme=theme;var meta=document.querySelector('meta[name="theme-color"]');if(meta&&dark[theme])meta.setAttribute('content',dark[theme])}catch(e){}})()`
