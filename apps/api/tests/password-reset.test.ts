import Fastify from 'fastify'
import { describe, expect, it, vi } from 'vitest'

import { passwordResetRoutes, passwordResetUrl } from '../src/modules/auth/password-reset.js'
import type { OutgoingEmail } from '../src/shared/integrations/email/mailer.js'
import type { StaffDirectory } from '../src/shared/integrations/firebase/staff-directory.js'

function directory(accounts: Record<string, string>): StaffDirectory {
  return {
    ensureAccount: vi.fn(),
    describe: vi.fn(),
    signInLink: vi.fn(),
    passwordReset: async (email: string) =>
      email in accounts ? { code: `code-${email}`, name: accounts[email] } : null,
  } as unknown as StaffDirectory
}

async function setup(withMailer = true) {
  const sent: OutgoingEmail[] = []
  const app = Fastify()
  await passwordResetRoutes(app, {
    mailer: withMailer ? { send: async (email) => void sent.push(email) } : undefined,
    staffDirectory: directory({ 'ana@example.com': 'Ana Paula' }),
    adminOrigin: 'https://app.luminix.beauty',
  })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10))
  return { app, sent, settle }
}

describe('password reset', () => {
  it('mails our own link for an existing account', async () => {
    const { app, sent, settle } = await setup()
    const response = await app.inject({
      method: 'POST',
      url: '/client/password-reset',
      payload: { email: 'Ana@Example.com', area: 'gestao' },
    })
    expect(response.statusCode).toBe(202)
    await settle()
    expect(sent).toHaveLength(1)
    expect(sent[0].to).toBe('ana@example.com')
    expect(sent[0].tag).toBe('password_reset')
    expect(sent[0].html).toContain(
      'https://app.luminix.beauty/nova-senha?oobCode=code-ana%40example.com',
    )
    expect(sent[0].inline?.some((image) => image.contentId === 'luminix-logo')).toBe(true)
  })

  it('answers the same for an unknown e-mail and sends nothing', async () => {
    const { app, sent, settle } = await setup()
    const response = await app.inject({
      method: 'POST',
      url: '/client/password-reset',
      payload: { email: 'nobody@example.com', area: 'cliente' },
    })
    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ sent: true })
    await settle()
    expect(sent).toHaveLength(0)
  })

  it('reports 503 without our e-mail so the caller falls back to Firebase', async () => {
    const { app } = await setup(false)
    const response = await app.inject({
      method: 'POST',
      url: '/client/password-reset',
      payload: { email: 'ana@example.com', area: 'cliente' },
    })
    expect(response.statusCode).toBe(503)
  })

  it('limits repeated requests for the same address', async () => {
    const { app } = await setup()
    const codes: number[] = []
    for (let index = 0; index < 4; index++) {
      const response = await app.inject({
        method: 'POST',
        url: '/client/password-reset',
        payload: { email: 'ana@example.com', area: 'cliente' },
      })
      codes.push(response.statusCode)
    }
    expect(codes).toEqual([202, 202, 202, 429])
  })

  it('rejects malformed input', async () => {
    const { app } = await setup()
    const response = await app.inject({
      method: 'POST',
      url: '/client/password-reset',
      payload: { email: 'not-an-email', area: 'gestao', extra: 1 },
    })
    expect(response.statusCode).toBe(400)
  })

  it('points clients to the site page', () => {
    const previous = process.env.PUBLIC_CLINIC_WEB_ORIGIN
    process.env.PUBLIC_CLINIC_WEB_ORIGIN = 'https://luminix.beauty'
    try {
      expect(passwordResetUrl('cliente', 'x y', undefined)).toBe(
        'https://luminix.beauty/cliente/nova-senha?oobCode=x%20y',
      )
    } finally {
      process.env.PUBLIC_CLINIC_WEB_ORIGIN = previous
    }
  })
})
