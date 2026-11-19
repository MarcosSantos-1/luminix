import type { OutgoingEmail } from './mailer.js'

/**
 * Staff access e-mails (invitation and sign-in link). Table layout and inline styles because
 * e-mail clients ignore most CSS; one button, a plain-text twin and the raw link as fallback.
 */
const brand = {
  ink: '#371a29',
  muted: '#806c77',
  pink: '#ed1765',
  blush: '#ffe5ef',
  paper: '#fff7fa',
  line: '#efdce5',
}

const roleNames: Record<string, string> = {
  manager: 'Gerente',
  reception: 'Recepção',
  professional: 'Profissional',
  owner: 'Proprietária',
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  )
}

function layout(input: {
  preheader: string
  eyebrow: string
  title: string
  paragraphs: string[]
  button: string
  link: string
  footnote: string
  logoUrl: string
}) {
  const link = escapeHtml(input.link)
  const paragraphs = input.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${brand.ink};">${text}</p>`,
    )
    .join('')
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${brand.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.paper};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td style="padding:0 0 20px;">
      <img src="${escapeHtml(input.logoUrl)}" width="150" alt="Luminix" style="display:block;border:0;height:auto;">
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${brand.line};border-radius:20px;overflow:hidden;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="68%" style="height:8px;background:${brand.pink};font-size:0;line-height:0;">&nbsp;</td>
          <td width="12%" style="height:8px;background:${brand.ink};font-size:0;line-height:0;">&nbsp;</td>
          <td width="20%" style="height:8px;background:${brand.blush};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:32px 32px 8px;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;color:${brand.pink};">${input.eyebrow}</p>
          <h1 style="margin:0 0 20px;font-size:28px;line-height:34px;font-weight:800;letter-spacing:-0.5px;color:${brand.ink};">${input.title}</h1>
          ${paragraphs}
        </td></tr>
        <tr><td style="padding:8px 32px 28px;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:12px;background:${brand.ink};">
              <a href="${link}" style="display:inline-block;padding:15px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${input.button}</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:0 32px 32px;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
          <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${brand.muted};">Se o botão não abrir, copie este endereço no navegador:</p>
          <p style="margin:0;font-size:12px;line-height:18px;word-break:break-all;"><a href="${link}" style="color:${brand.pink};">${link}</a></p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:20px 8px 0;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
      <p style="margin:0 0 6px;font-size:12px;line-height:18px;color:${brand.muted};">${input.footnote}</p>
      <p style="margin:0;font-size:12px;line-height:18px;color:${brand.muted};">Luminix · gestão para espaços de beleza e bem-estar</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
}

export function staffInviteEmail(input: {
  to: string
  name: string
  clinicName: string
  role: string
  link: string
  logoUrl: string
}): OutgoingEmail {
  const first = input.name.trim().split(/\s+/)[0] || 'Olá'
  const clinic = escapeHtml(input.clinicName)
  const role = roleNames[input.role] ?? 'Equipe'
  return {
    to: input.to,
    tag: 'staff_invite',
    subject: `Seu acesso ao ${input.clinicName} no Luminix`,
    html: layout({
      preheader: `Você recebeu acesso como ${role}. Entre com um clique.`,
      eyebrow: `Acesso · ${escapeHtml(role)}`,
      title: `${escapeHtml(first)}, seu acesso ao ${clinic} está pronto`,
      paragraphs: [
        `O <strong>${clinic}</strong> liberou para você o painel do Luminix com o nível <strong>${escapeHtml(role)}</strong>.`,
        'Não precisa criar senha agora: o botão abaixo já faz o seu login. Se preferir senha, use “Esqueci a senha” na tela de login quando quiser.',
      ],
      button: 'Entrar no painel',
      link: input.link,
      footnote:
        'O link vale por pouco tempo e só funciona uma vez. Se expirar, peça um novo à responsável pelo espaço ou use “Entrar sem senha” na tela de login. Se você não esperava este convite, ignore este e-mail.',
      logoUrl: input.logoUrl,
    }),
    text: [
      `${first}, seu acesso ao ${input.clinicName} está pronto.`,
      '',
      `Você recebeu acesso ao painel do Luminix com o nível ${role}.`,
      'Entre com um clique (sem senha):',
      input.link,
      '',
      'O link vale por pouco tempo e só funciona uma vez. Se você não esperava este convite, ignore este e-mail.',
    ].join('\n'),
  }
}

export function staffSignInEmail(input: {
  to: string
  link: string
  logoUrl: string
}): OutgoingEmail {
  return {
    to: input.to,
    tag: 'staff_sign_in',
    subject: 'Seu link de acesso ao Luminix',
    html: layout({
      preheader: 'Entre no painel com um clique.',
      eyebrow: 'Link de acesso',
      title: 'Entre no seu painel',
      paragraphs: [
        'Recebemos um pedido para entrar no Luminix com este e-mail. Toque no botão para continuar.',
      ],
      button: 'Entrar no painel',
      link: input.link,
      footnote:
        'O link vale por pouco tempo e só funciona uma vez. Se não foi você, ignore este e-mail: ninguém entra sem ele.',
      logoUrl: input.logoUrl,
    }),
    text: [
      'Entre no seu painel do Luminix com um clique:',
      input.link,
      '',
      'O link vale por pouco tempo e só funciona uma vez. Se não foi você, ignore este e-mail.',
    ].join('\n'),
  }
}
