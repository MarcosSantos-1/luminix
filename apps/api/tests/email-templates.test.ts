import { describe, expect, it } from 'vitest'
import {
  passwordResetEmail,
  staffInviteEmail,
} from '../src/shared/integrations/email/access-email.js'
import {
  appointmentConfirmedEmail,
  appointmentReminderEmail,
  clientBirthdayEmail,
  clientWelcomeEmail,
} from '../src/shared/integrations/email/client-emails.js'
import { clinicWelcomeEmail } from '../src/shared/integrations/email/clinic-emails.js'
import type { OutgoingEmail } from '../src/shared/integrations/email/mailer.js'
import { senderWithName } from '../src/shared/integrations/email/mailer.js'

const contact = {
  clinicName: 'Studio <Lumière>',
  siteUrl: 'https://luminix.beauty/c/studio-lumiere',
  appCode: 'LUMI42',
  whatsapp: '+5511987654321',
  address: 'Rua das Flores, 120 · São Paulo - SP',
  replyTo: 'contato@studio.com',
}
const appointment = {
  to: 'ana@example.com',
  clientName: 'Ana Paula',
  serviceName: 'Corte feminino',
  professionalName: 'Joana',
  dateLabel: 'sexta, 27 de novembro',
  timeLabel: '14:30',
  priceLabel: 'R$ 120,00',
  ...contact,
}

const all: [string, OutgoingEmail][] = [
  [
    'invite',
    staffInviteEmail({
      to: 'carla@example.com',
      name: 'Carla',
      clinicName: contact.clinicName,
      role: 'team',
      link: 'https://example.com/link',
    }),
  ],
  [
    'clinic welcome',
    clinicWelcomeEmail({
      to: 'dona@example.com',
      ownerName: 'Maria Aparecida',
      clinicName: contact.clinicName,
      siteUrl: contact.siteUrl,
      appCode: contact.appCode,
      panelUrl: 'https://app.luminix.beauty/c/LUMI42',
    }),
  ],
  ['client welcome', clientWelcomeEmail({ to: 'ana@example.com', clientName: 'Ana', ...contact })],
  ['confirmed', appointmentConfirmedEmail(appointment)],
  ['reminder', appointmentReminderEmail(appointment)],
  [
    'birthday',
    clientBirthdayEmail({ to: 'ana@example.com', clientName: 'Ana', offer: '15% off', ...contact }),
  ],
  [
    'password reset',
    passwordResetEmail({
      to: 'carla@example.com',
      name: 'Carla <Lumière>',
      link: 'https://app.luminix.beauty/nova-senha?oobCode=abc',
      area: 'gestao',
    }),
  ],
]

describe('e-mail templates', () => {
  it.each(all)(
    '%s: every inline image it references is attached, names are escaped',
    (_, email) => {
      const referenced = [...email.html.matchAll(/src="cid:([^"]+)"/g)].map((match) => match[1])
      const attached = (email.inline ?? []).map((image) => image.contentId)
      expect(referenced.length).toBeGreaterThan(0)
      for (const id of referenced) expect(attached).toContain(id)
      expect(new Set(attached).size).toBe(attached.length)
      expect(email.html).not.toContain('<Lumière>')
      expect(email.text.length).toBeGreaterThan(20)
    },
  )

  it('sends client e-mails in the name of the space, with replies to it', () => {
    const email = clientWelcomeEmail({ to: 'ana@example.com', clientName: 'Ana', ...contact })
    expect(email).toMatchObject({ fromName: contact.clinicName, replyTo: 'contato@studio.com' })
    expect(email.html).toContain('LUMI42')
    expect(email.html).toContain('https://wa.me/5511987654321')
    expect(email.html).toContain(contact.siteUrl)
  })

  it('tells the space where to change the site and how to reach support', () => {
    const [, email] = all[1]
    expect(email.html).toContain('Configurações → Vitrine e site')
    expect(email.html).toContain('https://wa.me/')
    expect(email.html).toContain(contact.siteUrl)
  })

  it('keeps the sender address and a safe display name', () => {
    const from = 'Luminix <acesso@luminix.beauty>'
    expect(senderWithName(from, 'Studio "X" <evil@x.com>\r\nBcc: y')).toBe(
      '"Studio X evil@x.comBcc: y" <acesso@luminix.beauty>',
    )
    expect(senderWithName(from, undefined)).toBe(from)
  })
})
