import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
const clinics = new Map<string, string>()

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
       VALUES ($1, 'Dona ${label}', 'dona@example.com', '+5511999999999')`,
      [id],
    )
    await connection.query("UPDATE luminix.clinics SET status = 'active' WHERE id = $1", [id])
    clinics.set(label, id)
  }
  const a = clinics.get('a')!
  for (const uid of ['manager-a', 'reception-a']) {
    const identity = (
      await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [uid])
    ).rows[0].identity_id
    await connection.query(
      `INSERT INTO luminix.clinic_memberships (clinic_id, identity_id, role_id, display_name)
       SELECT $1, $2, id, $4 FROM luminix.roles WHERE clinic_id = $1 AND name = $3`,
      [a, identity, uid.split('-')[0], uid === 'manager-a' ? 'Bia Gerente' : 'Ana Recepção'],
    )
  }
  // Data created "by the owner" so that it shows up as activity for the manager.
  const owner = (
    await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['owner-a'])
  ).rows[0].identity_id
  await connection.query("SELECT set_config('luminix.identity_id', $1, false)", [owner])
  await connection.query(
    `INSERT INTO luminix.services (clinic_id, name, category, price_cents, duration_minutes)
     VALUES ($1, 'Coloração Lumière', 'Cabelo', 20000, 90)`,
    [a],
  )
  await connection.query(
    `INSERT INTO luminix.clinic_clients (clinic_id, display_name, contact_phone)
     VALUES ($1, 'Cecília Araújo', '+5511987650000')`,
    [a],
  )
  await connection.query(
    `INSERT INTO luminix.finance_entries (clinic_id, kind, amount_cents, occurred_on, description)
     VALUES ($1, 'expense', 5000, luminix.clinic_today(), 'Tintura Lumière')`,
    [a],
  )
  await connection.query("SELECT set_config('luminix.identity_id', '', false)")
  await db.exec('SET ROLE luminix_api')
  app = await buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release() {} }) },
      verifyToken: async (uid) => ({ uid }),
    },
  )
})
afterAll(async () => {
  await app?.close()
  await db?.close()
})

let ip = 0
const call = (uid: string, method: 'GET' | 'POST', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${uid}` },
    remoteAddress: `10.1.0.${++ip % 250}`,
    ...(payload ? { payload } : {}),
  })
const a = () => clinics.get('a')!

describe('activity inbox', () => {
  it('lists activity with names and actor, and keeps read/archive/hide per person', async () => {
    const inbox = (await call('manager-a', 'GET', `/clinics/${a()}/activity`)).json()
    const service = inbox.items.find((item: { entity: string }) => item.entity === 'services')
    expect(service).toMatchObject({ label: 'Coloração Lumière', actor: 'Dona a', state: 'unread' })
    expect(inbox.unread).toBeGreaterThanOrEqual(3)

    const state = (ids: string[], value: string, uid = 'manager-a') =>
      call(uid, 'POST', `/clinics/${a()}/activity/state`, { ids, state: value })
    expect((await state([service.id], 'archived')).json().changed).toBe(1)
    const after = (await call('manager-a', 'GET', `/clinics/${a()}/activity`)).json()
    expect(after.items.some((item: { id: string }) => item.id === service.id)).toBe(false)
    const archived = (
      await call('manager-a', 'GET', `/clinics/${a()}/activity?view=archived`)
    ).json()
    expect(archived.items.map((item: { id: string }) => item.id)).toEqual([service.id])

    // The owner's own inbox is untouched by the manager's choices.
    const ownerInbox = (await call('owner-a', 'GET', `/clinics/${a()}/activity`)).json()
    expect(ownerInbox.items.some((item: { id: string }) => item.id === service.id)).toBe(true)

    expect((await state([service.id], 'hidden')).statusCode).toBe(200)
    expect(
      (await call('manager-a', 'GET', `/clinics/${a()}/activity?view=archived`)).json().items,
    ).toHaveLength(0)
    expect((await state([service.id], 'unread')).statusCode).toBe(200)
    expect(
      (await call('manager-a', 'GET', `/clinics/${a()}/activity`))
        .json()
        .items.some((item: { id: string }) => item.id === service.id),
    ).toBe(true)

    const all = await call('manager-a', 'POST', `/clinics/${a()}/activity/state`, {
      all: true,
      state: 'read',
    })
    expect(all.statusCode).toBe(200)
    expect((await call('manager-a', 'GET', `/clinics/${a()}/activity`)).json().unread).toBe(0)

    expect((await call('reception-a', 'GET', `/clinics/${a()}/activity`)).statusCode).toBe(403)
    expect((await call('owner-b', 'GET', `/clinics/${a()}/activity`)).statusCode).toBe(403)
    expect(
      (
        await call('owner-b', 'POST', `/clinics/${clinics.get('b')}/activity/state`, {
          ids: [service.id],
          state: 'hidden',
        })
      ).json().changed,
    ).toBe(0)
  })
})

describe('notices', () => {
  it('shows what needs attention according to the access level', async () => {
    const owner = (await call('owner-a', 'GET', `/clinics/${a()}/notices`)).json().notices
    const ids = owner.map((notice: { id: string }) => notice.id)
    expect(ids).toContain('site-offline')
    expect(ids.some((id: string) => id.startsWith('services-without-team'))).toBe(true)
    const reception = (await call('reception-a', 'GET', `/clinics/${a()}/notices`)).json().notices
    expect(reception.map((notice: { id: string }) => notice.id)).not.toContain('site-offline')
  })
})

describe('search', () => {
  it('finds across the clinic ignoring accents and respects permissions', async () => {
    const owner = (await call('owner-a', 'GET', `/clinics/${a()}/search?q=lumiere`)).json().groups
    expect(owner.services[0].title).toBe('Coloração Lumière')
    expect(owner.finance[0].title).toBe('Tintura Lumière')
    const byPhone = (await call('owner-a', 'GET', `/clinics/${a()}/search?q=8765`)).json().groups
    expect(byPhone.clients[0].title).toBe('Cecília Araújo')
    const byName = (await call('owner-a', 'GET', `/clinics/${a()}/search?q=cecilia`)).json().groups
    expect(byName.clients).toHaveLength(1)

    const reception = (await call('reception-a', 'GET', `/clinics/${a()}/search?q=lumiere`)).json()
      .groups
    expect(reception.services).toHaveLength(1)
    expect(reception.finance).toBeUndefined()
    const other = (
      await call('owner-b', 'GET', `/clinics/${clinics.get('b')}/search?q=lumiere`)
    ).json().groups
    expect(other.services).toHaveLength(0)
    expect((await call('owner-a', 'GET', `/clinics/${a()}/search?q=x`)).statusCode).toBe(400)
  })
})
