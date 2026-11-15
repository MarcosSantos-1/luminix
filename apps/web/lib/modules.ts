/**
 * Módulos do Luminix exibidos como etiquetas na home e nas páginas de anúncio.
 * `soon` marca o que ainda está chegando — atualize conforme os lançamentos.
 */
export const modules: { name: string; soon?: boolean }[] = [
  { name: 'Agenda' },
  { name: 'Clientes' },
  { name: 'Financeiro' },
  { name: 'Estoque' },
  { name: 'Equipe e comissões' },
  { name: 'Relatórios' },
  { name: 'Serviços e pacotes' },
  { name: 'Fotos e mídias' },
  { name: 'Página do seu espaço' },
  { name: 'Campanhas e promoções' },
  { name: 'Calendário de campanhas' },
  { name: 'Dicas de postagem' },
  { name: 'Imagens por IA', soon: true },
  { name: 'WhatsApp com IA', soon: true },
  { name: 'App do cliente', soon: true },
]
