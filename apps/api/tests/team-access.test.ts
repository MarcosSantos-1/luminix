import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'
import type { StaffDirectory } from '../src/shared/integrations/firebase/staff-directory.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
const clinics = new Map<
  string,
  { id: string; service: string; sensitive: string; professional: string }
>()
const accounts = new Map<string, string>()
const directory: StaffDirectory = {
  async ensureAccount(email) {
    const existing = accounts.get(email)
    if (existing) return { uid: existing, created: false }
    const uid = `staff-${accounts.size + 1}`
    accounts.set(email, uid)
    return { uid, created: true }
  },
  async describe(uids) {
    return new Map(uids.map((uid) => [uid, { lastSignInAt: null, disabled: false }]))
  },
}

beforeAll(async () => {
  db = new PGlite()
  connection = {
    async query(sql, values) {
      if (values) return db.query(sql, values)
      const result = await db.exec(sql)
      return { rows: result.at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(connection)
  for (const label of ['a', 'b']) {
    const identity = (
      await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [`owner-${label}`])
    ).rows[0].identity_id
    const id = String(
      (
        await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
          identity,
          `Espaço ${label}`,
        ])
      ).rows[0].clinic_id,
    )
    await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [id])
    await connection.query(
      `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone)
       VALUES ($1, 'Dona', 'dona@example.com', '+5511999999999')`,
      [id],
    )
    for (const weekday of [0, 1, 2, 3, 4, 5, 6])
      await connection.query(
        `INSERT INTO luminix.weekly_availability (clinic_id, weekday, is_available, periods)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [id, weekday, weekday > 0, weekday > 0 ? '[{"start":"08:00","end":"18:00"}]' : '[]'],
      )
    const service = (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, category, price_cents, duration_minutes)
         VALUES ($1, 'Corte', 'Cabelo', 8000, 60) RETURNING id`,
        [id],
      )
    ).rows[0].id
    const sensitive = (
      await connection.query(
        `INSERT INTO luminix.services (clinic_id, name, category, price_cents, duration_minutes, is_sensitive)
         VALUES ($1, 'Depilação íntima', 'Depilação', 9000, 40, true) RETURNING id`,
        [id],
      )
    ).rows[0].id
    const professional = (
      await connection.query(
        `INSERT INTO luminix.professionals (clinic_id, display_name) VALUES ($1, 'Primeira') RETURNING id`,
        [id],
      )
    ).rows[0].id
    await connection.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
    clinics.set(label, {
      id,
      service: String(service),
      sensitive: String(sensitive),
      professional: String(professional),
    })
  }
  await db.exec('SET ROLE luminix_api')
  app = await buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release() {} }) },
      verifyToken: async (uid) => ({ uid }),
      staffDirectory: directory,
    },
  )
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})

const as = (uid: string) => ({ authorization: `Bearer ${uid}` })
const clinic = (label: string) => clinics.get(label)!
const week = (enabled: (weekday: number) => boolean, start = '09:00', end = '17:00') =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    enabled: enabled(weekday),
    start,
    end,
    breaks: enabled(weekday) ? [{ start: '12:00', end: '13:00' }] : [],
  }))
const professional = (overrides: Record<string, unknown> = {}) => ({
  name: 'Joana',
  role: 'Cabeleireira',
  gender: 'female',
  audience: 'all',
  serviceIds: [clinic('a').service],
  days: week((day) => day >= 1 && day <= 5),
  ...overrides,
})
const put = (uid: string, label: string, id: string, body: unknown) =>
  app.inject({
    method: 'PUT',
    url: `/clinics/${clinic(label).id}/team/${id}`,
    headers: as(uid),
    payload: body as Record<string, unknown>,
  })
const invite = (uid: string, label: string, body: Record<string, string>) =>
  app.inject({
    method: 'POST',
    url: `/clinics/${clinic(label).id}/staff`,
    headers: as(uid),
    payload: body,
  })
const agenda = (uid: string, label: string) =>
  app.inject({
    url: `/clinics/${clinic(label).id}/agenda?from=2026-11-01T00:00:00.000Z&to=2026-11-08T00:00:00.000Z`,
    headers: as(uid),
  })

describe('role presets', () => {
  it('creates the four access levels and gives the owner the agenda grants', async () => {
    await db.exec('RESET ROLE')
    const roles = await connection.query(
      `SELECT r.name, array_agg(p.permission_code ORDER BY p.permission_code) AS grants
         FROM luminix.roles r JOIN luminix.role_permissions p ON p.clinic_id = r.clinic_id AND p.role_id = r.id
        WHERE r.clinic_id = $1 GROUP BY r.name ORDER BY r.name`,
      [clinic('a').id],
    )
    await db.exec('SET ROLE luminix_api')
    expect(roles.rows.map((row) => row.name)).toEqual([
      'manager',
      'owner',
      'professional',
      'reception',
    ])
    const grants = Object.fromEntries(roles.rows.map((row) => [row.name, row.grants as string[]]))
    expect(grants.owner).toContain('agenda:manage')
    expect(grants.reception).toEqual([
      'agenda:manage',
      'agenda:read',
      'client:manage',
      'client:read',
      'inventory:manage',
      'media:read',
    ])
    expect(grants.professional).not.toContain('client:manage')
  })
})

describe('team', () => {
  const joana = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
  it('adds and edits a professional with services, sensitive audience and hours', async () => {
    const created = await put('owner-a', 'a', joana, {
      ...professional(),
      serviceIds: [clinic('a').service, clinic('a').sensitive],
      serviceAudiences: { [clinic('a').sensitive]: 'women' },
    })
    expect(created.statusCode).toBe(200)
    const team = (
      await app.inject({ url: `/clinics/${clinic('a').id}/team`, headers: as('owner-a') })
    ).json()
    const saved = team.professionals.find((item: { id: string }) => item.id === joana)
    expect(saved).toMatchObject({ name: 'Joana', role: 'Cabeleireira', membershipId: null })
    expect(saved.serviceAudiences).toEqual({ [clinic('a').sensitive]: 'women' })
    expect(saved.days[1]).toMatchObject({
      enabled: true,
      start: '09:00',
      breaks: [{ start: '12:00', end: '13:00' }],
    })
    expect(team.clinicHours[0].enabled).toBe(false)

    expect(
      (await put('owner-a', 'a', joana, { ...professional(), name: 'Joana Lima' })).statusCode,
    ).toBe(200)
  })

  it('rejects hours outside the clinic, foreign services and other tenants', async () => {
    const id = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
    expect(
      (await put('owner-a', 'a', id, professional({ days: week(() => true) }))).statusCode,
    ).toBe(400)
    expect(
      (
        await put(
          'owner-a',
          'a',
          id,
          professional({ days: week((day) => day === 1, '07:00', '12:00') }),
        )
      ).statusCode,
    ).toBe(400)
    expect(
      (await put('owner-a', 'a', id, professional({ serviceIds: [clinic('b').service] })))
        .statusCode,
    ).toBe(400)
    expect((await put('owner-b', 'a', id, professional())).statusCode).toBe(403)
    // An id that belongs to another clinic is never overwritten.
    expect((await put('owner-a', 'a', clinic('b').professional, professional())).statusCode).toBe(
      400,
    )
  })

  it('links the owner as a professional and keeps at least one active professional', async () => {
    const team = (
      await app.inject({ url: `/clinics/${clinic('b').id}/team`, headers: as('owner-b') })
    ).json()
    const self = '9b2e3f5a-6c7d-4e8f-9a0b-1c2d3e4f5a6b'
    const body = professional({
      name: 'Dona B',
      serviceIds: [clinic('b').service],
      membershipId: team.selfMembershipId,
    })
    expect((await put('owner-b', 'b', self, body)).statusCode).toBe(200)
    const archive = (id: string) =>
      app.inject({
        method: 'POST',
        url: `/clinics/${clinic('b').id}/team/${id}/archive`,
        headers: as('owner-b'),
        payload: {},
      })
    expect((await archive(clinic('b').professional)).statusCode).toBe(200)
    expect((await archive(self)).statusCode).toBe(400)
    const after = (
      await app.inject({ url: `/clinics/${clinic('b').id}/team`, headers: as('owner-b') })
    ).json()
    expect(after.professionals).toHaveLength(1)
    expect(after.professionals[0].membershipId).toBe(team.selfMembershipId)
  })
})

describe('access', () => {
  it('invites reception with agenda access but no settings or team management', async () => {
    const response = await invite('owner-a', 'a', {
      name: 'Recepção Ana',
      email: 'Ana@Example.com',
      role: 'reception',
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      accountCreated: true,
      member: { email: 'ana@example.com' },
    })
    const uid = accounts.get('ana@example.com')!
    expect((await agenda(uid, 'a')).statusCode).toBe(200)
    expect(
      (await app.inject({ url: `/clinics/${clinic('a').id}/settings`, headers: as(uid) }))
        .statusCode,
    ).toBe(403)
    expect(
      (await app.inject({ url: `/clinics/${clinic('a').id}/staff`, headers: as(uid) })).statusCode,
    ).toBe(403)
    expect(
      (await invite(uid, 'a', { name: 'X', email: 'x@example.com', role: 'reception' })).statusCode,
    ).toBe(403)
    // Unauthorized callers never create Firebase accounts.
    expect(accounts.has('x@example.com')).toBe(false)
    expect(
      (await invite('owner-a', 'a', { name: 'Ana', email: 'ana@example.com', role: 'reception' }))
        .statusCode,
    ).toBe(409)
  })

  it('lists members, protects the owner and the manager level, and revokes immediately', async () => {
    expect(
      (
        await invite('owner-a', 'a', {
          name: 'Gerente Bia',
          email: 'bia@example.com',
          role: 'manager',
        })
      ).statusCode,
    ).toBe(200)
    const manager = accounts.get('bia@example.com')!
    const list = (
      await app.inject({ url: `/clinics/${clinic('a').id}/staff`, headers: as(manager) })
    ).json()
    const owner = list.members.find((member: { role: string }) => member.role === 'owner')
    const ana = list.members.find((member: { email: string }) => member.email === 'ana@example.com')
    expect(list.members.find((member: { isSelf: boolean }) => member.isSelf).email).toBe(
      'bia@example.com',
    )
    expect(JSON.stringify(list)).not.toContain('staff-')

    const change = (uid: string, id: string, body: Record<string, string>) =>
      app.inject({
        method: 'PUT',
        url: `/clinics/${clinic('a').id}/staff/${id}`,
        headers: as(uid),
        payload: body,
      })
    expect((await change(manager, owner.id, { status: 'revoked' })).statusCode).toBe(403)
    expect(
      (await invite(manager, 'a', { name: 'Outra', email: 'o@example.com', role: 'manager' }))
        .statusCode,
    ).toBe(403)
    expect((await change(manager, ana.id, { role: 'manager' })).statusCode).toBe(403)

    const anaUid = accounts.get('ana@example.com')!
    expect((await change(manager, ana.id, { status: 'revoked' })).statusCode).toBe(200)
    expect((await agenda(anaUid, 'a')).statusCode).toBe(403)
    expect(
      (await change(manager, ana.id, { status: 'active', role: 'professional' })).statusCode,
    ).toBe(200)
    const back = await agenda(anaUid, 'a')
    expect(back.statusCode).toBe(200)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/clinics/${clinic('a').id}/clients`,
          headers: as(anaUid),
          payload: { name: 'C' },
        })
      ).statusCode,
    ).toBe(403)
  })

  it('keeps clinics isolated', async () => {
    expect(
      (await app.inject({ url: `/clinics/${clinic('a').id}/staff`, headers: as('owner-b') }))
        .statusCode,
    ).toBe(403)
  })
})
