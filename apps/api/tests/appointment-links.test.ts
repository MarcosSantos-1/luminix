import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { hashLinkToken } from '../src/modules/client/appointment-links.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

// ADR-038: confirmation link of one visit. The team issues it; whoever has the link sees the
// essentials (no login) and answers. Only the hash is stored; "não sou eu" closes the link.
let db: PGlite
let connection: SqlConnection
let clinic: string
let other: string
let client: string
let service: string

async function call(
  user: string | null,
  method: 'GET' | 'POST',
  url: string,
  payload?: object,
  ip = '10.0.0.1',
) {
  const app = await buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release: () => {} }) },
      verifyToken: async (token) => ({ uid: token }),
    },
  )
  try {
    return await app.inject({
      method,
      url,
      remoteAddress: ip,
      headers: user ? { authorization: `Bearer ${user}` } : {},
      ...(payload ? { payload } : {}),
    })
  } finally {
    await app.close()
  }
}

const sql = async (text: string, values: unknown[] = []) =>
  (await db.query<Record<string, unknown>>(text, values)).rows

async function ownerClinic(uid: string, name: string) {
  const identity = (
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [uid])
  ).rows[0].identity_id
  const id = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
        identity,
        name,
      ])
    ).rows[0].clinic_id,
  )
  await connection.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
  return id
}

/** Setup rows go in as the owner; the routes run as luminix_api like in production. */
async function asOwner<T>(work: () => Promise<T>) {
  await db.exec('RESET ROLE')
  try {
    return await work()
  } finally {
    await db.exec('SET ROLE luminix_api')
  }
}

async function visit(status: 'scheduled' | 'confirmed', hoursAhead = 48) {
  const starts = new Date(Date.now() + hoursAhead * 3_600_000)
  return asOwner(async () =>
    String(
      (
        await sql(
          `INSERT INTO luminix.appointments (clinic_id, clinic_client_id, service_id, starts_at, ends_at,
           status, booking_source)
         VALUES ($1, $2, $3, $4, $5, $6, 'manager') RETURNING id`,
          [clinic, client, service, starts, new Date(starts.getTime() + 3_600_000), status],
        )
      )[0].id,
    ),
  )
}

async function issue(appointment: string, user = 'dona-link') {
  return call(user, 'POST', `/clinics/${clinic}/appointments/${appointment}/confirmation-link`, {})
}

const tokenOf = (url: string) => url.split('/confirmar/')[1]

beforeAll(async () => {
  db = new PGlite()
  connection = {
    async query(text, values) {
      if (values) return db.query(text, values)
      const results = await db.exec(text)
      return { rows: results.at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(connection)
  clinic = await ownerClinic('dona-link', 'Studio Link')
  other = await ownerClinic('dona-outra', 'Outro Studio')
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinic])
  await connection.query(
    `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone,
       public_enabled, whatsapp_phone, public_contacts)
     VALUES ($1, 'Dona', 'dona@example.com', '+5511999999999', true, '+5511999999999', true)`,
    [clinic],
  )
  service = String(
    (
      await sql(
        `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes, booking_mode)
         VALUES ($1, 'Limpeza de pele', 18000, 60, 'instant') RETURNING id`,
        [clinic],
      )
    )[0].id,
  )
  client = String(
    (
      await sql(
        `INSERT INTO luminix.clinic_clients (clinic_id, display_name, contact_phone, source)
         VALUES ($1, 'Edson Arantes do Nascimento', '+5511912345678', 'manager') RETURNING id`,
        [clinic],
      )
    )[0].id,
  )
  await db.exec('SET ROLE luminix_api')
})

afterAll(async () => {
  await db.close()
})

describe('link de confirmação', () => {
  it('confirms a visit "a confirmar" and stores only the hash of the token', async () => {
    const appointment = await visit('scheduled')
    const issued = await issue(appointment)
    expect(issued.statusCode).toBe(200)
    const { url } = issued.json()
    expect(url).toMatch(/^http:\/\/localhost:3001\/confirmar\/[A-Za-z0-9_-]{43}$/)
    const token = tokenOf(url)

    const [stored] = await sql(
      'SELECT token_hash FROM luminix.appointment_links WHERE clinic_id = $1 AND appointment_id = $2',
      [clinic, appointment],
    )
    expect(Buffer.from(stored.token_hash as Uint8Array)).toEqual(hashLinkToken(token))

    const read = await call(null, 'GET', `/client/appointment-links/${token}`)
    expect(read.statusCode).toBe(200)
    const body = read.json()
    expect(body.appointment).toMatchObject({
      firstName: 'Edson',
      service: 'Limpeza de pele',
      status: 'scheduled',
    })
    expect(body.clinic).toMatchObject({ name: 'Studio Link', whatsapp: '+5511999999999' })
    // Only the first name and the essentials: no phone, no full name, no notes.
    expect(JSON.stringify(body)).not.toContain('Arantes')
    expect(JSON.stringify(body)).not.toContain('912345678')

    const answer = await call(null, 'POST', `/client/appointment-links/${token}`, {
      answer: 'confirmed',
    })
    expect(answer.statusCode).toBe(200)
    const [row] = await sql(
      `SELECT a.status, l.answer, l.opened_at IS NOT NULL AS opened
         FROM luminix.appointments a JOIN luminix.appointment_links l
           ON l.clinic_id = a.clinic_id AND l.appointment_id = a.id
        WHERE a.clinic_id = $1 AND a.id = $2`,
      [clinic, appointment],
    )
    expect(row).toEqual({ status: 'confirmed', answer: 'confirmed', opened: true })
  })

  it('"remarcar" only tells the team; issuing again replaces the old link', async () => {
    const appointment = await visit('confirmed')
    const first = tokenOf((await issue(appointment)).json().url)
    const second = tokenOf((await issue(appointment)).json().url)
    expect(second).not.toBe(first)
    expect((await call(null, 'GET', `/client/appointment-links/${first}`)).statusCode).toBe(404)

    const answer = await call(null, 'POST', `/client/appointment-links/${second}`, {
      answer: 'reschedule',
    })
    expect(answer.statusCode).toBe(200)
    const agenda = await call(
      'dona-link',
      'GET',
      `/clinics/${clinic}/agenda?from=${new Date(Date.now() - 86_400_000).toISOString()}&to=${new Date(Date.now() + 7 * 86_400_000).toISOString()}`,
    )
    expect(agenda.statusCode).toBe(200)
    const item = agenda
      .json()
      .appointments.find((entry: { id: string }) => entry.id === appointment)
    expect(item).toMatchObject({ status: 'confirmed', link_answer: 'reschedule' })
  })

  it('"não sou eu" closes the link and hides the details', async () => {
    const appointment = await visit('scheduled')
    const token = tokenOf((await issue(appointment)).json().url)
    expect(
      (await call(null, 'POST', `/client/appointment-links/${token}`, { answer: 'not_me' }))
        .statusCode,
    ).toBe(200)
    expect((await call(null, 'GET', `/client/appointment-links/${token}`)).statusCode).toBe(404)
    expect(
      (await call(null, 'POST', `/client/appointment-links/${token}`, { answer: 'confirmed' }))
        .statusCode,
    ).toBe(404)
    const [row] = await sql('SELECT status FROM luminix.appointments WHERE id = $1', [appointment])
    expect(row.status).toBe('scheduled')
  })

  it('cancels within the space rules and refuses when the space does not allow it', async () => {
    const appointment = await visit('confirmed')
    const token = tokenOf((await issue(appointment)).json().url)
    const read = (await call(null, 'GET', `/client/appointment-links/${token}`)).json()
    expect(read.appointment.cancelUntil).toBeTruthy()
    expect(read.clinic).toHaveProperty('logoUrl', null)
    expect(read.clinic).not.toHaveProperty('logoKey')

    const canceled = await call(null, 'POST', `/client/appointment-links/${token}`, {
      answer: 'canceled',
    })
    expect(canceled.statusCode).toBe(200)
    const [row] = await sql(
      'SELECT status, status_note FROM luminix.appointments WHERE clinic_id = $1 AND id = $2',
      [clinic, appointment],
    )
    expect(row.status).toBe('canceled')
    // Canceled is final: no confirming afterwards through the same link.
    expect(
      (await call(null, 'POST', `/client/appointment-links/${token}`, { answer: 'confirmed' }))
        .statusCode,
    ).toBe(404)

    await asOwner(() =>
      sql(
        `INSERT INTO luminix.booking_policies (clinic_id, allow_client_cancellation)
         VALUES ($1, false)`,
        [clinic],
      ),
    )
    const locked = await visit('confirmed')
    const lockedToken = tokenOf((await issue(locked)).json().url)
    expect(
      (await call(null, 'GET', `/client/appointment-links/${lockedToken}`)).json().appointment
        .cancelUntil,
    ).toBeNull()
    const refused = await call(null, 'POST', `/client/appointment-links/${lockedToken}`, {
      answer: 'canceled',
    })
    expect(refused.statusCode).toBe(409)
    expect(refused.json().error).toBe('Cancellation closed')
  })

  it('refuses past visits, other clinics and malformed tokens', async () => {
    const past = await visit('scheduled', -3)
    expect((await issue(past)).statusCode).toBe(409)

    const appointment = await visit('scheduled')
    const foreign = await call(
      'dona-outra',
      'POST',
      `/clinics/${other}/appointments/${appointment}/confirmation-link`,
      {},
    )
    expect(foreign.statusCode).toBe(404)

    expect((await call(null, 'GET', '/client/appointment-links/curto')).statusCode).toBe(400)
    expect(
      (await call(null, 'GET', `/client/appointment-links/${'A'.repeat(43)}`)).statusCode,
    ).toBe(404)
    expect(
      (
        await call(null, 'POST', `/client/appointment-links/${'A'.repeat(43)}`, {
          answer: 'maybe',
        })
      ).statusCode,
    ).toBe(400)
  })

  it('limits guesses per IP', async () => {
    const app = await buildApp(
      {},
      {
        database: connection,
        tenantPool: { connect: async () => ({ ...connection, release: () => {} }) },
        verifyToken: async (token) => ({ uid: token }),
      },
    )
    try {
      const codes: number[] = []
      for (let attempt = 0; attempt < 31; attempt++)
        codes.push(
          (
            await app.inject({
              method: 'GET',
              url: `/client/appointment-links/${'B'.repeat(43)}`,
              remoteAddress: '10.9.9.9',
            })
          ).statusCode,
        )
      expect(codes.slice(0, 30).every((code) => code === 404)).toBe(true)
      expect(codes[30]).toBe(429)
    } finally {
      await app.close()
    }
  })
})
