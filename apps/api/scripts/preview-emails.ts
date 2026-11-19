/**
 * Writes every e-mail template as HTML (inline images as data URIs) to look at in a browser:
 *   pnpm --filter @luminix/api email:preview        → apps/api/email-preview/index.html
 * Sample data only; nothing is sent.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { staffInviteEmail } from '../src/shared/integrations/email/access-email.js'
import {
  appointmentConfirmedEmail,
  appointmentReminderEmail,
  clientBirthdayEmail,
  clientWelcomeEmail,
} from '../src/shared/integrations/email/client-emails.js'
import { clinicWelcomeEmail } from '../src/shared/integrations/email/clinic-emails.js'
import type { OutgoingEmail } from '../src/shared/integrations/email/mailer.js'

const out = resolve(process.argv[2] ?? 'email-preview')
const contact = {
  clinicName: 'Studio Lumière',
  siteUrl: 'https://luminix.beauty/c/studio-lumiere',
  appCode: 'LUMI42',
  whatsapp: '+5511987654321',
  address: 'Rua das Flores, 120 · São Paulo - SP',
  replyTo: 'contato@studiolumiere.com',
}
const appointment = {
  to: 'ana@example.com',
  clientName: 'Ana Paula',
  serviceName: 'Corte feminino',
  professionalName: 'Joana Lima',
  dateLabel: 'sexta, 27 de novembro',
  timeLabel: '14:30',
  priceLabel: 'R$ 120,00',
  ...contact,
}
const emails: [string, string, OutgoingEmail][] = [
  [
    'convite-equipe',
    'Convite da equipe',
    staffInviteEmail({
      to: 'carla@example.com',
      name: 'Carla Souza',
      clinicName: contact.clinicName,
      role: 'team',
      link: 'https://app.luminix.beauty/login?acesso=link',
    }),
  ],
  [
    'boas-vindas-espaco',
    'Boas-vindas ao espaço (fim do onboarding)',
    clinicWelcomeEmail({
      to: 'maria@example.com',
      ownerName: 'Maria Aparecida',
      clinicName: contact.clinicName,
      siteUrl: contact.siteUrl,
      appCode: contact.appCode,
      panelUrl: 'https://app.luminix.beauty/c/LUMI42',
    }),
  ],
  [
    'boas-vindas-cliente',
    'Boas-vindas ao cliente',
    clientWelcomeEmail({ to: 'ana@example.com', clientName: 'Ana Paula', ...contact }),
  ],
  ['horario-confirmado', 'Horário confirmado', appointmentConfirmedEmail(appointment)],
  ['lembrete', 'Lembrete do dia seguinte', appointmentReminderEmail(appointment)],
  [
    'aniversario',
    'Aniversário do cliente',
    clientBirthdayEmail({
      to: 'ana@example.com',
      clientName: 'Ana Paula',
      offer: '15% em qualquer serviço este mês',
      ...contact,
    }),
  ],
]

mkdirSync(out, { recursive: true })
for (const [file, , email] of emails) {
  let html = email.html
  for (const image of email.inline ?? [])
    html = html.replaceAll(`cid:${image.contentId}`, `data:image/png;base64,${image.base64}`)
  writeFileSync(resolve(out, `${file}.html`), html)
}
writeFileSync(
  resolve(out, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>E-mails Luminix</title>
<body style="font-family:system-ui;margin:24px;background:#f5eef1">
<h1>E-mails Luminix (prévia)</h1>
${emails
  .map(
    ([file, label, email]) =>
      `<h2 style="margin:32px 0 4px">${label}</h2><p style="margin:0 0 8px;color:#806c77">${email.fromName ? `De: ${email.fromName} · ` : ''}Assunto: ${email.subject}</p>
<iframe src="${file}.html" style="width:640px;height:900px;border:1px solid #ddd;border-radius:12px;background:#fff"></iframe>`,
  )
  .join('\n')}
</body>`,
)
console.log(`Prévia em ${resolve(out, 'index.html')}`)
