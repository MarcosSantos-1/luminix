/**
 * Transactional e-mail through Resend's HTTP API (no SDK: one POST). Configured by
 * RESEND_API_KEY + EMAIL_FROM; without them the API reports e-mail as unavailable and the
 * admin falls back to Firebase's own e-mail.
 */
export type EmailTag =
  | 'staff_invite'
  | 'clinic_welcome'
  | 'client_welcome'
  | 'appointment_confirmed'
  | 'appointment_reminder'
  | 'client_birthday'

export type OutgoingEmail = {
  to: string
  subject: string
  html: string
  text: string
  /** Groups the message in Resend's dashboard (letters, digits, _ and - only). */
  tag: EmailTag
  /** Images referenced as `cid:<contentId>` in the HTML, sent with the message. */
  inline?: { contentId: string; filename: string; base64: string }[]
  /** Display name instead of EMAIL_FROM's (e.g. the clinic); the address never changes. */
  fromName?: string
  /** Where answers go (e.g. the clinic's contact e-mail). */
  replyTo?: string
}

export type Mailer = { send(email: OutgoingEmail): Promise<void> }

/** "Name <addr>" with a display name that cannot break the header. */
export function senderWithName(from: string, name: string | undefined) {
  const clean = name
    ?.replace(/[<>"\\\r\n]/g, '')
    .trim()
    .slice(0, 80)
  if (!clean) return from
  const address = /<([^>]+)>\s*$/.exec(from)?.[1] ?? from
  return `"${clean}" <${address}>`
}

export function createResendMailer(
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Mailer | undefined {
  const apiKey = environment.RESEND_API_KEY?.trim()
  const from = environment.EMAIL_FROM?.trim()
  if (!apiKey || !from) return undefined
  const defaultReplyTo = environment.EMAIL_REPLY_TO?.trim()
  return {
    async send(email) {
      const replyTo = email.replyTo ?? defaultReplyTo
      const response = await request('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: senderWithName(from, email.fromName),
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(replyTo ? { reply_to: replyTo } : {}),
          tags: [{ name: 'kind', value: email.tag }],
          ...(email.inline?.length
            ? {
                attachments: email.inline.map((image) => ({
                  filename: image.filename,
                  content: image.base64,
                  content_id: image.contentId,
                })),
              }
            : {}),
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      })
      // Provider details stay out of the response and logs (they may echo the address).
      if (!response.ok) throw new Error(`Email provider rejected (${response.status})`)
    },
  }
}
