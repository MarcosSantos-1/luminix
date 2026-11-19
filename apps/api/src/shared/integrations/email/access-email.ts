import { escapeHtml, firstName, renderEmail } from './layout.js'
import type { OutgoingEmail } from './mailer.js'

const roleNames: Record<string, string> = {
  manager: 'Gerente',
  team: 'Equipe',
  owner: 'Proprietária',
}

/** Staff invitation: the button signs in once and opens the first access (password, photo). */
export function staffInviteEmail(input: {
  to: string
  name: string
  clinicName: string
  role: string
  link: string
}): OutgoingEmail {
  const first = firstName(input.name)
  const clinic = escapeHtml(input.clinicName)
  const role = roleNames[input.role] ?? 'Equipe'
  return {
    to: input.to,
    tag: 'staff_invite',
    subject: `Seu acesso ao ${input.clinicName} no Luminix`,
    ...renderEmail({
      preheader: `Você recebeu acesso como ${role}. Entre com um clique.`,
      eyebrow: `Acesso · ${escapeHtml(role)}`,
      title: `${escapeHtml(first)}, seu acesso ao ${clinic} está pronto`,
      blocks: [
        {
          kind: 'paragraphs',
          html: [
            `O <strong>${clinic}</strong> liberou para você o painel do Luminix com o nível <strong>${escapeHtml(role)}</strong>.`,
            'Toque no botão abaixo para entrar. No primeiro acesso você cria a sua senha e coloca a sua foto; depois é só entrar com e-mail e senha.',
          ],
        },
      ],
      button: { label: 'Entrar no painel', href: input.link },
      linkFallback: true,
      footnote:
        'O link vale por pouco tempo e só funciona uma vez. Se expirar, peça um novo convite à responsável pelo espaço. Se você não esperava este convite, ignore este e-mail.',
    }),
    text: [
      `${first}, seu acesso ao ${input.clinicName} está pronto.`,
      '',
      `Você recebeu acesso ao painel do Luminix com o nível ${role}.`,
      'Entre pelo link abaixo e crie a sua senha no primeiro acesso:',
      input.link,
      '',
      'O link vale por pouco tempo e só funciona uma vez. Se você não esperava este convite, ignore este e-mail.',
    ].join('\n'),
  }
}
