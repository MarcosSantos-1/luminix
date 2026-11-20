/**
 * Suporte do painel. Por enquanto abre uma conversa no WhatsApp da Luminix; depois dará lugar
 * a um assistente interno (IA) com o WhatsApp como canal de atendimento humano.
 */
const supportNumber = '5511993005062'
const supportGreeting = 'Olá! Preciso de ajuda com o painel da Luminix.'

export const supportWhatsAppUrl = `https://wa.me/${supportNumber}?text=${encodeURIComponent(supportGreeting)}`
