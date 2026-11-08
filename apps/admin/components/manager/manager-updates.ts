export type ManagerMessageMedia = {
  src: `/${string}`
  still: `/${string}`
  alt: string
}

export const welcomeMedia: ManagerMessageMedia | undefined = undefined

export type ManagerUpdate = {
  id: string
  kind: 'release' | 'notice'
  title: string
  summary: string
  items?: readonly string[]
  autoOpen?: boolean
  media?: ManagerMessageMedia
}

/** Newest first. Use a new stable ID when an update should be announced again. */
export const managerUpdates: readonly ManagerUpdate[] = [
  {
    id: '2026-11-vitrine',
    kind: 'release',
    title: 'Sua vitrine já faz parte do painel',
    summary:
      'Ao concluir o cadastro, você pode publicar a página do seu espaço e compartilhar o link.',
    items: [
      'Personalize a capa, as cores e os textos em Configurações.',
      'Adicione fotos aos serviços ou monte uma galeria quando quiser.',
    ],
  },
]
