import {
  brazilPhone,
  escapeHtml,
  firstName,
  renderEmail,
  whatsappLink,
  type EmailBlock,
  type EmailItem,
} from './layout.js'
import type { OutgoingEmail } from './mailer.js'

/**
 * E-mails a space sends to its clients. They go out with the space's name as sender and replies
 * reach the space's contact e-mail; Luminix only signs the footer.
 */
export type ClinicContact = {
  clinicName: string
  /** Public page, or null when the site is off. */
  siteUrl: string | null
  /** Code typed in the Luminix app. */
  appCode: string | null
  /** E.164 (+55…). */
  whatsapp: string | null
  /** One line, only when the space publishes its address. */
  address: string | null
  /** Replies go here. */
  replyTo: string | null
}

const footer = 'Enviado pelo Luminix em nome do espaço.'

function fromClinic(contact: ClinicContact) {
  return { fromName: contact.clinicName, ...(contact.replyTo ? { replyTo: contact.replyTo } : {}) }
}

function contactItems(contact: ClinicContact, whatsappText: string): EmailItem[] {
  return [
    ...(contact.siteUrl
      ? [
          {
            icon: 'calendar' as const,
            title: 'Agende pelo site',
            text: 'Escolha o serviço, o profissional e o horário que ficar melhor para você.',
            link: { label: 'Abrir o site', href: contact.siteUrl },
          },
        ]
      : []),
    ...(contact.appCode
      ? [
          {
            icon: 'app' as const,
            title: `No app Luminix, use o código ${contact.appCode}`,
            text: 'Acompanhe seus horários, remarque e receba lembretes no celular.',
          },
        ]
      : []),
    ...(contact.whatsapp
      ? [
          {
            icon: 'chat' as const,
            title: `WhatsApp ${brazilPhone(contact.whatsapp)}`,
            text: 'Dúvidas, remarcações ou um recado rápido.',
            link: { label: 'Chamar', href: whatsappLink(contact.whatsapp, whatsappText) },
          },
        ]
      : []),
    ...(contact.address
      ? [{ icon: 'place' as const, title: 'Onde estamos', text: escapeHtml(contact.address) }]
      : []),
  ]
}

function contactText(contact: ClinicContact) {
  return [
    ...(contact.siteUrl ? [`Site: ${contact.siteUrl}`] : []),
    ...(contact.appCode ? [`Código no app Luminix: ${contact.appCode}`] : []),
    ...(contact.whatsapp ? [`WhatsApp: ${brazilPhone(contact.whatsapp)}`] : []),
    ...(contact.address ? [`Endereço: ${contact.address}`] : []),
  ]
}

/** Sent when the space registers a client with an e-mail. */
export function clientWelcomeEmail(input: { to: string; clientName: string } & ClinicContact) {
  const first = firstName(input.clientName)
  const clinic = escapeHtml(input.clinicName)
  const items = contactItems(input, `Olá! Sou ${first}, cliente do ${input.clinicName}.`)
  const blocks: EmailBlock[] = [
    {
      kind: 'paragraphs',
      html: [
        `Que bom ter você com a gente! Seu cadastro no <strong>${clinic}</strong> está feito, e daqui pra frente fica mais fácil agendar e acompanhar seus cuidados.`,
      ],
    },
    ...(items.length
      ? [{ kind: 'items' as const, heading: 'Por onde falar com a gente', items }]
      : []),
  ]
  return {
    to: input.to,
    tag: 'client_welcome',
    subject: `Boas-vindas ao ${input.clinicName}, ${first}!`,
    ...fromClinic(input),
    ...renderEmail({
      preheader: `Seu cadastro no ${input.clinicName} está feito. Veja como agendar.`,
      eyebrow: escapeHtml(input.clinicName),
      title: `Boas-vindas, ${escapeHtml(first)}!`,
      blocks,
      ...(input.siteUrl ? { button: { label: 'Agendar um horário', href: input.siteUrl } } : {}),
      footnote: `Você recebeu este e-mail porque foi cadastrada como cliente do ${clinic}. Se não reconhece este cadastro, responda este e-mail.`,
      signature: footer,
    }),
    text: [
      `Boas-vindas, ${first}!`,
      '',
      `Seu cadastro no ${input.clinicName} está feito.`,
      ...contactText(input),
    ].join('\n'),
  } satisfies OutgoingEmail
}

type Appointment = {
  to: string
  clientName: string
  serviceName: string
  professionalName: string | null
  /** Already formatted for the reader, e.g. "sexta, 27 de novembro". */
  dateLabel: string
  /** "14:30". */
  timeLabel: string
  /** Shown as given ("R$ 120,00"), or null to hide. */
  priceLabel: string | null
} & ClinicContact

function appointmentRows(input: Appointment) {
  return [
    { label: 'Serviço', value: input.serviceName },
    { label: 'Quando', value: `${input.dateLabel}, às ${input.timeLabel}` },
    ...(input.professionalName ? [{ label: 'Com', value: input.professionalName }] : []),
    ...(input.priceLabel ? [{ label: 'Valor', value: input.priceLabel }] : []),
    ...(input.address ? [{ label: 'Onde', value: input.address }] : []),
  ]
}

/** After booking (by the space or by the client). Ready to wire to the booking routes. */
export function appointmentConfirmedEmail(input: Appointment) {
  const first = firstName(input.clientName)
  const clinic = escapeHtml(input.clinicName)
  return {
    to: input.to,
    tag: 'appointment_confirmed',
    subject: `Horário confirmado: ${input.serviceName}, ${input.dateLabel} às ${input.timeLabel}`,
    ...fromClinic(input),
    ...renderEmail({
      preheader: `${input.serviceName} no ${input.clinicName}, ${input.dateLabel} às ${input.timeLabel}.`,
      eyebrow: 'Horário confirmado',
      title: `Te esperamos, ${escapeHtml(first)}!`,
      blocks: [
        {
          kind: 'paragraphs',
          html: [`Seu horário no <strong>${clinic}</strong> está reservado.`],
        },
        { kind: 'details', rows: appointmentRows(input) },
        ...(input.whatsapp
          ? [
              {
                kind: 'whatsapp' as const,
                label: 'Precisa remarcar? Chame no WhatsApp',
                href: whatsappLink(
                  input.whatsapp,
                  `Olá! Preciso falar sobre o meu horário de ${input.dateLabel} às ${input.timeLabel}.`,
                ),
                note: 'Avise com antecedência: assim o horário fica livre para outra cliente.',
              },
            ]
          : []),
      ],
      ...(input.siteUrl ? { button: { label: 'Ver no site', href: input.siteUrl } } : {}),
      footnote: `Você recebeu este e-mail porque tem um horário marcado no ${clinic}.`,
      signature: footer,
    }),
    text: [
      `Te esperamos, ${first}!`,
      '',
      ...appointmentRows(input).map((row) => `${row.label}: ${row.value}`),
      '',
      ...contactText(input),
    ].join('\n'),
  } satisfies OutgoingEmail
}

/** The team asks the client to confirm (ADR-038): one button to the link page, no login. */
export function appointmentLinkEmail(input: Appointment & { linkUrl: string }) {
  const first = firstName(input.clientName)
  const clinic = escapeHtml(input.clinicName)
  return {
    to: input.to,
    tag: 'appointment_link',
    subject: `Confirme seu horário: ${input.serviceName}, ${input.dateLabel} às ${input.timeLabel}`,
    ...fromClinic(input),
    ...renderEmail({
      preheader: `Um toque para confirmar seu horário no ${input.clinicName}.`,
      eyebrow: 'Confirme seu horário',
      title: `Oi, ${escapeHtml(first)}! Tudo certo para o seu horário?`,
      blocks: [
        {
          kind: 'paragraphs',
          html: [
            `O <strong>${clinic}</strong> reservou este horário para você. Confirme ou avise se precisar mudar.`,
          ],
        },
        { kind: 'details', rows: appointmentRows(input) },
      ],
      button: { label: 'Confirmar ou remarcar', href: input.linkUrl },
      footnote: `Não marcou nada no ${clinic}? Abra o link e toque em "Não sou eu".`,
      signature: footer,
    }),
    text: [
      `Oi, ${first}! Tudo certo para o seu horário?`,
      '',
      ...appointmentRows(input).map((row) => `${row.label}: ${row.value}`),
      '',
      `Confirme ou remarque: ${input.linkUrl}`,
      '',
      ...contactText(input),
    ].join('\n'),
  } satisfies OutgoingEmail
}

/** The day before. Needs a scheduled job to send it; the template is ready. */
export function appointmentReminderEmail(input: Appointment) {
  const first = firstName(input.clientName)
  const clinic = escapeHtml(input.clinicName)
  return {
    to: input.to,
    tag: 'appointment_reminder',
    subject: `Lembrete: amanhã às ${input.timeLabel} no ${input.clinicName}`,
    ...fromClinic(input),
    ...renderEmail({
      preheader: `${input.serviceName} amanhã às ${input.timeLabel}.`,
      eyebrow: 'Lembrete',
      title: `${escapeHtml(first)}, até amanhã!`,
      blocks: [
        {
          kind: 'paragraphs',
          html: [`Passando para lembrar do seu horário no <strong>${clinic}</strong>.`],
        },
        { kind: 'details', rows: appointmentRows(input) },
        {
          kind: 'items',
          items: [
            {
              icon: 'clock',
              title: 'Chegue uns minutinhos antes',
              text: 'Assim dá tempo de se acomodar e o atendimento começa no horário.',
            },
          ],
        },
        ...(input.whatsapp
          ? [
              {
                kind: 'whatsapp' as const,
                label: 'Não vai conseguir? Avise no WhatsApp',
                href: whatsappLink(
                  input.whatsapp,
                  `Olá! Não vou conseguir ir amanhã às ${input.timeLabel}.`,
                ),
              },
            ]
          : []),
      ],
      footnote: `Você recebeu este lembrete porque tem um horário marcado no ${clinic}.`,
      signature: footer,
    }),
    text: [
      `${first}, até amanhã!`,
      '',
      ...appointmentRows(input).map((row) => `${row.label}: ${row.value}`),
    ].join('\n'),
  } satisfies OutgoingEmail
}

/** Birthday greeting for clients who accepted messages. Needs a daily job; template ready. */
export function clientBirthdayEmail(
  input: { to: string; clientName: string; offer: string | null } & ClinicContact,
) {
  const first = firstName(input.clientName)
  const clinic = escapeHtml(input.clinicName)
  return {
    to: input.to,
    tag: 'client_birthday',
    subject: `Feliz aniversário, ${first}! 🎉`,
    ...fromClinic(input),
    ...renderEmail({
      preheader: `O ${input.clinicName} preparou um carinho para o seu dia.`,
      eyebrow: escapeHtml(input.clinicName),
      title: `Feliz aniversário, ${escapeHtml(first)}!`,
      blocks: [
        {
          kind: 'paragraphs',
          html: [
            `Hoje o dia é seu, e todo mundo aqui no <strong>${clinic}</strong> deseja um ano cheio de saúde, alegria e autocuidado.`,
          ],
        },
        ...(input.offer
          ? [
              {
                kind: 'highlight' as const,
                icon: 'sparkles' as const,
                label: 'Presente de aniversário',
                value: input.offer,
                note: 'Mostre este e-mail no atendimento ou mencione ao agendar.',
              },
            ]
          : []),
      ],
      ...(input.siteUrl ? { button: { label: 'Agendar meu momento', href: input.siteUrl } } : {}),
      footnote: `Você recebeu este e-mail porque aceitou receber novidades do ${clinic}.`,
      signature: footer,
    }),
    text: [
      `Feliz aniversário, ${first}!`,
      '',
      `Todo mundo aqui no ${input.clinicName} deseja um ano cheio de saúde e autocuidado.`,
      ...(input.offer ? [`Presente: ${input.offer}`] : []),
      ...(input.siteUrl ? [`Agende: ${input.siteUrl}`] : []),
    ].join('\n'),
  } satisfies OutgoingEmail
}

export function clientVoucherEmail(
  input: ClinicContact & {
    to: string
    clientName: string
    type: 'fixed' | 'percent' | 'service'
    value: number
    expiresOn: string
    /** "Serviço grátis": the service it pays for. */
    serviceName?: string | null
  },
): OutgoingEmail {
  const date = input.expiresOn.split('-').reverse().join('/')
  if (input.type === 'service') {
    const text = `Olá, ${firstName(input.clientName)}! Você ganhou um voucher de ${input.serviceName ?? 'um serviço'} grátis em ${input.clinicName}. Válido até ${date}. Fale com o espaço para agendar.`
    return {
      to: input.to,
      subject: 'Você ganhou um serviço grátis',
      text,
      html: `<p>${escapeHtml(text)}</p>`,
      tag: 'client_voucher',
      ...fromClinic(input),
    }
  }
  const discount =
    input.type === 'percent'
      ? `${input.value}%`
      : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
          input.value / 100,
        )
  const text = `Olá, ${firstName(input.clientName)}! Você recebeu um voucher de ${discount} de desconto em ${input.clinicName}. Válido para um atendimento até ${date}. Fale com o espaço para usar.`
  return {
    to: input.to,
    subject: 'Você recebeu um voucher',
    text,
    html: `<p>${escapeHtml(text)}</p>`,
    tag: 'client_voucher',
    ...fromClinic(input),
  }
}

/**
 * The space changed its agenda (hours, closed day, exclusive rental day) and the client's
 * time no longer exists. Sent after the manager confirms the list of affected clients.
 */
export function appointmentCanceledBySpaceEmail(input: Appointment & { reason: string | null }) {
  const first = firstName(input.clientName)
  const clinic = escapeHtml(input.clinicName)
  const rows = [
    ...appointmentRows(input).filter((row) => row.label !== 'Valor'),
    ...(input.reason ? [{ label: 'Motivo', value: input.reason }] : []),
  ]
  return {
    to: input.to,
    tag: 'appointment_canceled_by_space',
    subject: `Horário cancelado: ${input.serviceName}, ${input.dateLabel} às ${input.timeLabel}`,
    ...fromClinic(input),
    ...renderEmail({
      preheader: `O ${input.clinicName} precisou cancelar seu horário de ${input.dateLabel}.`,
      eyebrow: 'Horário cancelado',
      title: `${escapeHtml(first)}, precisamos remarcar`,
      blocks: [
        {
          kind: 'paragraphs',
          html: [
            `O <strong>${clinic}</strong> mudou a agenda e precisou cancelar o seu horário. Pedimos desculpas pelo transtorno.`,
            'Escolha um novo horário quando ficar bom para você.',
          ],
        },
        { kind: 'details', rows },
        ...(input.whatsapp
          ? [
              {
                kind: 'whatsapp' as const,
                label: 'Remarcar pelo WhatsApp',
                href: whatsappLink(
                  input.whatsapp,
                  `Olá! Meu horário de ${input.dateLabel} às ${input.timeLabel} foi cancelado. Quero remarcar.`,
                ),
              },
            ]
          : []),
      ],
      ...(input.siteUrl ? { button: { label: 'Escolher novo horário', href: input.siteUrl } } : {}),
      footnote: `Você recebeu este e-mail porque tinha um horário marcado no ${clinic}.`,
      signature: footer,
    }),
    text: [
      `${first}, precisamos remarcar.`,
      '',
      `O ${input.clinicName} mudou a agenda e precisou cancelar o seu horário.`,
      ...rows.map((row) => `${row.label}: ${row.value}`),
      '',
      ...contactText(input),
    ].join('\n'),
  } satisfies OutgoingEmail
}
