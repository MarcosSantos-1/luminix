import { emailIcons, type EmailIcon } from './icons.js'
import { emailLogo } from './logo.js'
import type { OutgoingEmail } from './mailer.js'

/**
 * Shared look of every Luminix e-mail. Table layout and inline styles because e-mail clients
 * ignore most CSS; images (logo, icons) travel inline (Content-ID) so they show even when remote
 * images are blocked. Texts are passed already escaped where they contain markup.
 */
export const brand = {
  ink: '#371a29',
  muted: '#806c77',
  pink: '#ed1765',
  blush: '#ffe5ef',
  paper: '#fff7fa',
  line: '#efdce5',
  green: '#25d366',
}

/** Luminix support shown in e-mails to spaces. Fictitious until the real channel exists. */
export const support = {
  whatsappLabel: '(11) 99999-0000',
  whatsappLink:
    'https://wa.me/5511999990000?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20o%20Luminix',
  email: 'suporte@luminix.beauty',
  hours: 'Segunda a sábado, das 9h às 19h',
}

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  )
}

export function firstName(name: string, fallback = 'Olá') {
  return name.trim().split(/\s+/)[0] || fallback
}

/** +5511987654321 → (11) 98765-4321; other formats untouched. */
export function brazilPhone(phone: string) {
  const digits = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(phone)
  return digits ? `(${digits[1]}) ${digits[2]}-${digits[3]}` : phone
}

export function whatsappLink(phone: string, text?: string) {
  const number = phone.replace(/\D/g, '')
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

const font = "font-family:Inter,'Helvetica Neue',Arial,sans-serif;"

export type EmailItem = {
  icon: EmailIcon
  /** Plain text (escaped here). */
  title: string
  /** Trusted HTML (escape user data before). */
  text: string
  link?: { label: string; href: string }
}

export type EmailBlock =
  | { kind: 'paragraphs'; html: string[] }
  | { kind: 'items'; heading?: string; items: EmailItem[] }
  | { kind: 'steps'; heading: string; steps: { title: string; text: string }[] }
  | {
      kind: 'highlight'
      icon: EmailIcon
      label: string
      value: string
      href?: string
      note?: string
    }
  | { kind: 'details'; rows: { label: string; value: string }[] }
  | { kind: 'whatsapp'; label: string; href: string; note?: string }
  | { kind: 'support' }

export type EmailContent = {
  preheader: string
  eyebrow: string
  title: string
  blocks: EmailBlock[]
  button?: { label: string; href: string }
  /** Show the "copy this address" fallback under the button (access links). */
  linkFallback?: boolean
  footnote: string
  /** Last line; defaults to Luminix's. */
  signature?: string
}

function icon(name: EmailIcon, size = 40) {
  return `<img src="cid:icon-${name}" width="${size}" height="${size}" alt="" style="display:block;border:0;width:${size}px;height:${size}px;">`
}

function renderBlock(block: EmailBlock): string {
  switch (block.kind) {
    case 'paragraphs':
      return block.html
        .map(
          (text) =>
            `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${brand.ink};">${text}</p>`,
        )
        .join('')
    case 'items':
      return `${block.heading ? `<p style="margin:8px 0 12px;font-size:13px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;color:${brand.muted};">${escapeHtml(block.heading)}</p>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
${block.items
  .map(
    (item) => `<tr>
  <td width="52" valign="top" style="padding:0 12px 16px 0;">${icon(item.icon)}</td>
  <td valign="top" style="padding:0 0 16px;">
    <p style="margin:0 0 2px;font-size:15px;line-height:22px;font-weight:700;color:${brand.ink};">${escapeHtml(item.title)}</p>
    <p style="margin:0;font-size:14px;line-height:21px;color:${brand.muted};">${item.text}${item.link ? ` <a href="${escapeHtml(item.link.href)}" style="color:${brand.pink};font-weight:700;text-decoration:none;">${escapeHtml(item.link.label)}&nbsp;→</a>` : ''}</p>
  </td>
</tr>`,
  )
  .join('')}
</table>`
    case 'steps':
      return `<p style="margin:8px 0 12px;font-size:13px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;color:${brand.muted};">${escapeHtml(block.heading)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
${block.steps
  .map(
    (step, index) => `<tr>
  <td width="40" valign="top" style="padding:0 12px 14px 0;">
    <div style="width:28px;height:28px;border-radius:14px;background:${brand.pink};color:#ffffff;font-size:14px;line-height:28px;font-weight:800;text-align:center;">${index + 1}</div>
  </td>
  <td valign="top" style="padding:3px 0 14px;">
    <p style="margin:0 0 2px;font-size:15px;line-height:22px;font-weight:700;color:${brand.ink};">${escapeHtml(step.title)}</p>
    <p style="margin:0;font-size:14px;line-height:21px;color:${brand.muted};">${step.text}</p>
  </td>
</tr>`,
  )
  .join('')}
</table>`
    case 'highlight':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:${brand.paper};border:1px solid ${brand.line};border-radius:16px;">
<tr>
  <td width="56" valign="top" style="padding:16px 0 16px 14px;">${icon(block.icon)}</td>
  <td valign="top" style="padding:16px 14px;">
    <p style="margin:0 0 2px;font-size:12px;letter-spacing:1.2px;text-transform:uppercase;font-weight:700;color:${brand.muted};">${escapeHtml(block.label)}</p>
    <p style="margin:0;font-size:16px;line-height:23px;font-weight:800;overflow-wrap:anywhere;word-break:break-word;">${block.href ? `<a href="${escapeHtml(block.href)}" style="color:${brand.pink};text-decoration:none;">${escapeHtml(block.value)}</a>` : `<span style="color:${brand.ink};">${escapeHtml(block.value)}</span>`}</p>
    ${block.note ? `<p style="margin:6px 0 0;font-size:13px;line-height:19px;color:${brand.muted};">${block.note}</p>` : ''}
  </td>
</tr>
</table>`
    case 'details':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border:1px solid ${brand.line};border-radius:16px;">
${block.rows
  .map(
    (row, index) => `<tr>
  <td style="padding:12px 16px;${index ? `border-top:1px solid ${brand.line};` : ''}font-size:13px;color:${brand.muted};width:38%;">${escapeHtml(row.label)}</td>
  <td style="padding:12px 16px;${index ? `border-top:1px solid ${brand.line};` : ''}font-size:15px;font-weight:700;color:${brand.ink};">${escapeHtml(row.value)}</td>
</tr>`,
  )
  .join('')}
</table>`
    case 'whatsapp':
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr>
  <td style="border-radius:12px;background:${brand.green};">
    <a href="${escapeHtml(block.href)}" style="display:inline-block;padding:12px 20px 12px 14px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">
      <img src="cid:icon-whatsapp" width="24" height="24" alt="" style="display:inline-block;vertical-align:middle;border:0;width:24px;height:24px;border-radius:6px;margin-right:8px;">${escapeHtml(block.label)}
    </a>
  </td>
</tr></table>${block.note ? `<p style="margin:-8px 0 20px;font-size:13px;line-height:19px;color:${brand.muted};">${block.note}</p>` : ''}`
    case 'support':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;background:${brand.blush};border-radius:16px;">
<tr><td style="padding:18px 18px 4px;">
  <p style="margin:0 0 4px;font-size:15px;font-weight:800;color:${brand.ink};">Precisa de ajuda? A gente responde.</p>
  <p style="margin:0 0 14px;font-size:13px;line-height:19px;color:${brand.muted};">${escapeHtml(support.hours)} · <a href="mailto:${support.email}" style="color:${brand.pink};text-decoration:none;">${support.email}</a></p>
</td></tr>
<tr><td style="padding:0 18px 18px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="border-radius:12px;background:${brand.green};">
      <a href="${support.whatsappLink}" style="display:inline-block;padding:10px 18px 10px 12px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">
        <img src="cid:icon-whatsapp" width="22" height="22" alt="" style="display:inline-block;vertical-align:middle;border:0;width:22px;height:22px;border-radius:6px;margin-right:8px;">WhatsApp ${escapeHtml(support.whatsappLabel)}
      </a>
    </td>
  </tr></table>
</td></tr>
</table>`
  }
}

function usedIcons(blocks: EmailBlock[]) {
  const names = new Set<EmailIcon>()
  for (const block of blocks) {
    if (block.kind === 'items') block.items.forEach((item) => names.add(item.icon))
    if (block.kind === 'highlight') names.add(block.icon)
    if (block.kind === 'whatsapp' || block.kind === 'support') names.add('whatsapp')
  }
  return [...names]
}

/** HTML plus the inline images it references (logo and the icons actually used). */
export function renderEmail(content: EmailContent): Pick<OutgoingEmail, 'html' | 'inline'> {
  const button = content.button
  const link = button ? escapeHtml(button.href) : ''
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(content.title.replace(/<[^>]+>/g, ''))}</title>
</head>
<body style="margin:0;padding:0;background:${brand.paper};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.paper};">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 0 20px;">
      <img src="cid:${emailLogo.contentId}" width="${emailLogo.width}" height="${emailLogo.height}" alt="Luminix" style="display:block;border:0;width:${emailLogo.width}px;height:${emailLogo.height}px;">
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
        <tr><td style="padding:28px 24px 8px;${font}">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;font-weight:700;color:${brand.pink};">${content.eyebrow}</p>
          <h1 style="margin:0 0 20px;font-size:28px;line-height:34px;font-weight:800;letter-spacing:-0.5px;color:${brand.ink};">${content.title}</h1>
          ${content.blocks.map(renderBlock).join('\n')}
        </td></tr>
        ${
          button
            ? `<tr><td style="padding:8px 24px ${content.linkFallback ? '28px' : '32px'};${font}">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:12px;background:${brand.ink};">
              <a href="${link}" style="display:inline-block;padding:15px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(button.label)}</a>
            </td>
          </tr></table>
        </td></tr>`
            : '<tr><td style="padding:0 0 16px;"></td></tr>'
        }
        ${
          button && content.linkFallback
            ? `<tr><td style="padding:0 24px 32px;${font}">
          <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${brand.muted};">Se o botão não abrir, copie este endereço no navegador:</p>
          <p style="margin:0;font-size:12px;line-height:18px;word-break:break-all;"><a href="${link}" style="color:${brand.pink};">${link}</a></p>
        </td></tr>`
            : ''
        }
      </table>
    </td></tr>
    <tr><td style="padding:20px 8px 0;${font}">
      <p style="margin:0 0 6px;font-size:12px;line-height:18px;color:${brand.muted};">${content.footnote}</p>
      <p style="margin:0;font-size:12px;line-height:18px;color:${brand.muted};">${content.signature ?? 'Luminix · gestão para espaços de beleza e bem-estar'}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`
  return {
    html,
    inline: [
      { contentId: emailLogo.contentId, filename: emailLogo.filename, base64: emailLogo.base64 },
      ...usedIcons(content.blocks).map((name) => ({
        contentId: `icon-${name}`,
        filename: `${name}.png`,
        base64: emailIcons[name],
      })),
    ],
  }
}
