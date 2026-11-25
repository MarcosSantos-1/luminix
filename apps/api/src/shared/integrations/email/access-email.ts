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

/**
 * "Esqueci a senha": our own e-mail (logo, sender, wording) instead of Firebase's generic one.
 * The button opens Luminix's own page, which sets the new password with the one-time code.
 */
export function passwordResetEmail(input: {
  to: string
  name: string
  link: string
  area: 'gestao' | 'cliente'
}): OutgoingEmail {
  const first = firstName(input.name, '')
  const greeting = first ? `${escapeHtml(first)}, vamos` : 'Vamos'
  const where = input.area === 'gestao' ? 'o painel de gestão do Luminix' : 'a sua conta Luminix'
  return {
    to: input.to,
    tag: 'password_reset',
    subject: 'Crie uma nova senha no Luminix',
    ...renderEmail({
      preheader: 'Recebemos um pedido para trocar a sua senha. O link vale por 1 hora.',
      eyebrow: 'Segurança da conta',
      title: `${greeting} criar uma nova senha`,
      blocks: [
        {
          kind: 'paragraphs',
          html: [
            `Recebemos um pedido para trocar a senha de acesso a ${where} com este e-mail.`,
            'Toque no botão abaixo e escolha a nova senha. Depois é só entrar normalmente.',
          ],
        },
      ],
      button: { label: 'Criar nova senha', href: input.link },
      linkFallback: true,
      footnote:
        'O link vale por 1 hora e só funciona uma vez. Se não foi você que pediu, ignore este e-mail: a sua senha atual continua valendo e ninguém entra na sua conta sem ela.',
    }),
    text: [
      first ? `${first}, vamos criar uma nova senha.` : 'Vamos criar uma nova senha.',
      '',
      `Recebemos um pedido para trocar a senha de acesso a ${where} com este e-mail.`,
      'Crie a nova senha pelo link abaixo:',
      input.link,
      '',
      'O link vale por 1 hora e só funciona uma vez. Se não foi você que pediu, ignore este e-mail.',
    ].join('\n'),
  }
}
