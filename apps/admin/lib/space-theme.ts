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

const loadingBackgrounds: Record<SpaceTheme, string> = {
  rosa: 'radial-gradient(circle at 88% 5%, #ff6c9e 0, transparent 34%), linear-gradient(135deg, #530025 0%, #bd004a 46%, #f22970 100%)',
  grafite:
    'radial-gradient(circle at 88% 5%, rgb(109 119 133 / 45%) 0, transparent 36%), linear-gradient(135deg, #080a0d 0%, #1a1f26 52%, #2c3440 100%)',
  violeta:
    'radial-gradient(circle at 88% 5%, rgb(119 72 193 / 45%) 0, transparent 36%), linear-gradient(135deg, #210a45 0%, #32145f 52%, #4a2378 100%)',
  dourado:
    'radial-gradient(circle at 88% 5%, rgb(136 101 31 / 42%) 0, transparent 36%), linear-gradient(135deg, #30200b 0%, #4a3314 52%, #5c4218 100%)',
  esmeralda:
    'radial-gradient(circle at 88% 5%, rgb(24 116 94 / 45%) 0, transparent 36%), linear-gradient(135deg, #042c26 0%, #0d4036 52%, #145246 100%)',
  azul: 'radial-gradient(circle at 88% 5%, rgb(41 103 170 / 45%) 0, transparent 36%), linear-gradient(135deg, #071e3b 0%, #0f3258 52%, #184472 100%)',
}

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

/** Runs in the document head, before the first paint, and paints the saved theme inline. */
export const spaceThemeBootScript = `(function(){try{var ok=${JSON.stringify(spaceThemes.map((theme) => theme.id))};var dark=${JSON.stringify(Object.fromEntries(spaceThemes.map((theme) => [theme.id, theme.dark])))};var backgrounds=${JSON.stringify(loadingBackgrounds)};function allow(value){return ok.indexOf(value)>=0}var map={};try{map=JSON.parse(localStorage.getItem('${themeMapStorageKey}')||'{}')}catch(e){}var parts=location.pathname.split('/');var id=parts[1]==='c'?decodeURIComponent(parts[2]||''):'';var theme=id&&map[id];if(!allow(theme))theme=localStorage.getItem('${themeStorageKey}');if(!allow(theme))return;var bg=backgrounds[theme];var color=dark[theme];var root=document.documentElement;root.dataset.spaceTheme=theme;root.style.setProperty('--loading-bg',bg);root.style.backgroundColor=color;root.style.backgroundImage=bg;var meta=document.querySelector('meta[name="theme-color"]');if(meta&&color)meta.setAttribute('content',color);var node=document.createElement('style');node.id='luminix-loading-bg';node.textContent='html,body,.app-status.is-loading{background-color:'+color+'!important;background-image:'+bg+'!important;background-repeat:no-repeat!important;background-size:cover!important}';document.head.appendChild(node)}catch(e){}})()`
