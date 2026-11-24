import { escapeHtml, firstName, renderEmail, support } from './layout.js'
import type { OutgoingEmail } from './mailer.js'

/**
 * Sent to the owner when onboarding is completed: the space is live. Points to the public site
 * (when published), where to change it, the first steps in the panel and Luminix support.
 */
export function clinicWelcomeEmail(input: {
  to: string
  ownerName: string
  clinicName: string
  /** Public page, or null when the owner kept the site off. */
  siteUrl: string | null
  /** Code clients type in the app. */
  appCode: string | null
  /** Panel of this space (https://app.luminix.beauty/c/<code>). */
  panelUrl: string
}): OutgoingEmail {
  const first = firstName(input.ownerName)
  const clinic = escapeHtml(input.clinicName)
  const settings = 'Configurações → Vitrine e site'
  return {
    to: input.to,
    tag: 'clinic_welcome',
    subject: `Boas-vindas ao Luminix, ${first}! O ${input.clinicName} está no ar`,
    ...renderEmail({
      preheader: input.siteUrl
        ? `Seu site já está no ar: ${input.siteUrl.replace(/^https?:\/\//, '')}`
        : 'Seu espaço está pronto. Veja os próximos passos.',
      eyebrow: 'Boas-vindas ao Luminix',
      title: `${escapeHtml(first)}, o ${clinic} está pronto!`,
      blocks: [
        {
          kind: 'paragraphs',
          html: [
            'Que alegria ter você com a gente. O cadastro terminou e o seu espaço já pode receber agendamentos, organizar a agenda e acompanhar o financeiro em um lugar só.',
          ],
        },
        input.siteUrl
          ? {
              kind: 'highlight',
              icon: 'globe',
              label: 'Seu site',
              value: input.siteUrl.replace(/^https?:\/\//, ''),
              href: input.siteUrl,
              note: `Suas clientes veem serviços, preços e horários e agendam por ele. Para mudar fotos, textos, cores ou o endereço do site, vá em <strong>${settings}</strong>.`,
            }
          : {
              kind: 'highlight',
              icon: 'globe',
              label: 'Seu site',
              value: 'Ainda não publicado',
              note: `Quando quiser, publique em <strong>${settings}</strong>: suas clientes veem serviços e horários e agendam sozinhas.`,
            },
        {
          kind: 'steps',
          heading: 'Primeiros passos',
          steps: [
            {
              title: 'Confira serviços e horários',
              text: 'Preços, duração e quem atende cada serviço. É isso que aparece para a cliente na hora de agendar.',
            },
            {
              title: 'Chame a sua equipe',
              text: 'Em Configurações → Acessos, cada pessoa recebe um convite e entra com o próprio e-mail. Você decide o que ela pode fazer.',
            },
            {
              title: 'Divulgue o seu link',
              text: 'Coloque o site na bio do Instagram e mande no WhatsApp das clientes.',
            },
          ],
        },
        {
          kind: 'items',
          heading: 'Também vale saber',
          items: [
            ...(input.appCode
              ? [
                  {
                    icon: 'app' as const,
                    title: `Código do app: ${input.appCode}`,
                    text: 'No app Luminix, a cliente digita este código para encontrar o seu espaço, agendar e acompanhar os horários.',
                  },
                ]
              : []),
            {
              icon: 'calendar',
              title: 'Agenda e lembretes',
              text: 'Marque, remarque e confirme atendimentos; a cliente vê tudo pelo site e pelo app.',
            },
            {
              icon: 'settings',
              title: 'Tudo ajustável',
              text: 'Horário de funcionamento, regras de cancelamento, formas de pagamento e a cara do site ficam em Configurações.',
            },
          ],
        },
        { kind: 'support' },
      ],
      button: { label: 'Abrir o painel', href: input.panelUrl },
      footnote: `Você recebeu este e-mail porque concluiu o cadastro do ${clinic} no Luminix.`,
    }),
    text: [
      `${first}, o ${input.clinicName} está pronto!`,
      '',
      input.siteUrl
        ? `Seu site: ${input.siteUrl} (para mudar, vá em ${settings}).`
        : `Seu site ainda não foi publicado. Publique em ${settings}.`,
      ...(input.appCode ? [`Código do app para as clientes: ${input.appCode}`] : []),
      '',
      'Primeiros passos:',
      '1. Confira serviços e horários.',
      '2. Chame a sua equipe em Configurações → Acessos.',
      '3. Divulgue o seu link no Instagram e no WhatsApp.',
      '',
      `Painel: ${input.panelUrl}`,
      `Ajuda: WhatsApp ${support.whatsappLabel} (${support.whatsappLink}) ou ${support.email}.`,
    ].join('\n'),
  }
}

/**
 * Stripe answered about the space's receiving account (ADR-041): approved, needs more data or
 * not approved. Sent once per answer; the button opens "Receber pelo app" in the panel.
 */
export function connectStatusEmail(input: {
  to: string
  ownerName: string
  clinicName: string
  kind: 'approved' | 'needs_info' | 'restricted'
  /** https://app.luminix.beauty/c/<code>/recebimentos */
  pageUrl: string
}): OutgoingEmail {
  const first = firstName(input.ownerName || 'tudo bem')
  const clinic = escapeHtml(input.clinicName)
  const copy = {
    approved: {
      subject: `Pronto! O ${input.clinicName} já pode receber pelo app`,
      eyebrow: 'Cadastro aprovado',
      title: `${escapeHtml(first)}, a Stripe aprovou o cadastro do ${clinic}!`,
      text: 'Agora suas clientes podem pagar por Pix ou cartão na hora de agendar, e o dinheiro cai na conta do espaço. Falta só um passo: entrar no painel e ligar o pagamento pelo app. Leva um minuto, e a gente te mostra o caminho.',
      button: 'Ver próximos passos',
    },
    needs_info: {
      subject: `A Stripe pediu mais uma informação do ${input.clinicName}`,
      eyebrow: 'Falta uma informação',
      title: `${escapeHtml(first)}, falta só um detalhe no cadastro`,
      text: 'A Stripe analisou o cadastro de recebimentos e pediu mais um dado ou documento. Abra o painel e toque em "Completar cadastro": ela mostra exatamente o que falta.',
      button: 'Completar cadastro',
    },
    restricted: {
      subject: `A Stripe não aprovou o cadastro do ${input.clinicName}`,
      eyebrow: 'Cadastro não aprovado',
      title: `${escapeHtml(first)}, a Stripe não aprovou o cadastro por enquanto`,
      text: 'Por enquanto o espaço continua recebendo do jeito de sempre, no próprio espaço. Abra o painel para ver o que a Stripe informou, ou fale com o nosso suporte que a gente te ajuda.',
      button: 'Ver o que aconteceu',
    },
  }[input.kind]
  return {
    to: input.to,
    tag: 'connect_status',
    subject: copy.subject,
    ...renderEmail({
      preheader: copy.text.slice(0, 110),
      eyebrow: copy.eyebrow,
      title: copy.title,
      blocks: [
        { kind: 'paragraphs', html: [copy.text] },
        {
          kind: 'items',
          heading: 'Precisa de ajuda?',
          items: [
            {
              icon: 'chat',
              title: `WhatsApp ${support.whatsappLabel}`,
              text: 'Fale com a equipe do Luminix.',
              link: { label: 'Chamar', href: support.whatsappLink },
            },
          ],
        },
      ],
      button: { label: copy.button, href: input.pageUrl },
      footnote: `Você recebeu este e-mail porque cadastrou o ${clinic} para receber pelo app.`,
    }),
    text: [
      copy.title.replace(/<[^>]+>/g, ''),
      '',
      copy.text,
      '',
      `${copy.button}: ${input.pageUrl}`,
    ].join('\n'),
  }
}
