/**
 * Transactional e-mail through Resend's HTTP API (no SDK: one POST). Configured by
 * RESEND_API_KEY + EMAIL_FROM; without them the API reports e-mail as unavailable and the
 * admin falls back to Firebase's own e-mail.
 */
export type OutgoingEmail = {
  to: string
  subject: string
  html: string
  text: string
  /** Groups the message in Resend's dashboard (letters, digits, _ and - only). */
  tag: 'staff_invite'
  /** Images referenced as `cid:<contentId>` in the HTML, sent with the message. */
  inline?: { contentId: string; filename: string; base64: string }[]
}

export type Mailer = { send(email: OutgoingEmail): Promise<void> }

export function createResendMailer(
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch,
): Mailer | undefined {
  const apiKey = environment.RESEND_API_KEY?.trim()
  const from = environment.EMAIL_FROM?.trim()
  if (!apiKey || !from) return undefined
  const replyTo = environment.EMAIL_REPLY_TO?.trim()
  return {
    async send(email) {
      const response = await request('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
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
