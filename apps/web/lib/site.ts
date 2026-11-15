/**
 * Constantes do site institucional. Ajuste aqui, não nos componentes.
 */

/** Dias de teste gratuito anunciados nos botões e textos. */
export const TRIAL_DAYS = 12

/**
 * URL de incorporação do vídeo de apresentação (ex.: https://www.youtube-nocookie.com/embed/ID).
 * Vazio = o modal mostra um aviso de "vídeo em produção".
 */
export const DEMO_VIDEO_EMBED_URL: string = ''

/** PENDENTE: trocar pelo número real de atendimento (formato wa.me/55DDDNUMERO). */
export const SUPPORT_WHATSAPP_URL =
  'https://wa.me/5500000000000?text=' + encodeURIComponent('Oi! Tenho uma dúvida sobre o Luminix.')

/** PENDENTE: confirmar o e-mail de atendimento. */
export const SUPPORT_EMAIL = 'contato@luminix.beauty'

/** Planos anunciados no site. Valores em reais. */
export const PLAN_MONTHLY_PRICE = 99.9
export const PLAN_YEARLY_PRICE = 900

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
