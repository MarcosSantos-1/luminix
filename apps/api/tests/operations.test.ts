import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let app: Awaited<ReturnType<typeof buildApp>>
let clinicA: string
let clinicB: string
let serviceA: string
let serviceB: string
let clientA: string

beforeAll(async () => {
  db = new PGlite()
  connection = {
    async query(sql, values) {
      if (values) return db.query(sql, values)
      const results = await db.exec(sql)
      return { rows: results.at(-1)?.rows ?? [] }
    },
  }
  await applyMigrations(connection)
  const identityA = String(
    (await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['agenda-a']))
      .rows[0].identity_id,
  )
  const identityB = String(
    (await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', ['agenda-b']))
      .rows[0].identity_id,
  )
  clinicA = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        identityA,
        'Agenda A',
      ])
    ).rows[0].clinic_id,
  )
  clinicB = String(
    (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1, $2)', [
        identityB,
        'Agenda B',
      ])
    ).rows[0].clinic_id,
  )
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicA])
  serviceA = String(
    (
      await connection.query(
        "INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes) VALUES ($1, 'Serviço A', 5000, 60) RETURNING id",
        [clinicA],
      )
    ).rows[0].id,
  )
  await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicB])
  serviceB = String(
    (
      await connection.query(
        "INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes) VALUES ($1, 'Serviço B', 5000, 60) RETURNING id",
        [clinicB],
      )
    ).rows[0].id,
  )
  await db.exec('SET ROLE luminix_api')
  app = await makeApp()
})

// The staff authenticator keeps a per-instance request counter (30/min per IP), so suites with
// many calls build a fresh app per test instead of weakening the production limit.
function makeApp() {
  return buildApp(
    {},
    {
      database: connection,
      tenantPool: { connect: async () => ({ ...connection, release: () => {} }) },
      verifyToken: async (token) => ({ uid: token }),
    },
  )
}

afterAll(async () => {
  await app?.close()
  await db?.close()
})

function call(
  uid: string,
  method: 'GET' | 'POST' | 'PUT',
  clinic: string,
  resource: string,
  payload?: object,
) {
  return app.inject({
    method,
    url: `/clinics/${clinic}/${resource}`,
    headers: payload
      ? { authorization: `Bearer ${uid}`, 'content-type': 'application/json' }
      : { authorization: `Bearer ${uid}` },
    payload: payload ? JSON.stringify(payload) : undefined,
  })
}

const weekly = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  isAvailable: weekday === 1,
  periods: weekday === 1 ? [{ start: '09:00', end: '18:00' }] : [],
}))

describe('clinic clients and manager scheduling', () => {
  it('creates clinic-local clients without leaking them across tenants', async () => {
    const created = await call('agenda-a', 'POST', clinicA, 'clients', {
      name: 'Cliente A',
      phone: '+5511999990001',
      email: 'CLIENTE.A@EXAMPLE.COM',
    })
    expect(created.statusCode).toBe(201)
    clientA = created.json().client.id
    expect(created.json().client.contact_email).toBe('cliente.a@example.com')
    expect((await call('agenda-b', 'GET', clinicA, 'clients')).statusCode).toBe(403)
    expect((await call('agenda-b', 'GET', clinicB, 'clients')).json().clients).toEqual([])
    expect(
      (await call('agenda-a', 'GET', clinicA, 'clients?q=99990001')).json().clients,
    ).toHaveLength(1)
  })

  it('keeps client booking rules strict and requires explicit manager warning confirmation', async () => {
    expect(
      (await call('agenda-a', 'PUT', clinicA, 'availability', { mode: 'weekly', days: weekly }))
        .statusCode,
    ).toBe(200)
    const ordinary = await call('agenda-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: serviceA,
      localStartsAt: '2030-01-07T10:00',
    })
    expect(ordinary.statusCode).toBe(201)
    expect(ordinary.json().warnings).toEqual([])

    const outside = await call('agenda-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: serviceA,
      localStartsAt: '2030-01-07T07:00',
    })
    expect(outside.statusCode).toBe(409)
    expect(outside.json().warnings.map((warning: { code: string }) => warning.code)).toEqual([
      'outside_availability',
    ])
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'appointments', {
          clientId: clientA,
          serviceId: serviceA,
          localStartsAt: '2030-01-07T07:00',
          confirmedWarnings: ['outside_availability'],
        })
      ).statusCode,
    ).toBe(201)

    const overlap = await call('agenda-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: serviceA,
      localStartsAt: '2030-01-07T10:30',
    })
    expect(overlap.statusCode).toBe(409)
    expect(
      overlap.json().warnings.some((warning: { code: string }) => warning.code === 'overlap'),
    ).toBe(true)
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'appointments', {
          clientId: clientA,
          serviceId: serviceA,
          localStartsAt: '2030-01-07T10:30',
          confirmedWarnings: ['overlap'],
        })
      ).statusCode,
    ).toBe(201)
  })

  it('rejects cross-clinic resources and returns only the selected clinic agenda', async () => {
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'appointments', {
          clientId: clientA,
          serviceId: serviceB,
          localStartsAt: '2030-01-07T12:00',
        })
      ).statusCode,
    ).toBe(400)
    const agenda = await call(
      'agenda-a',
      'GET',
      clinicA,
      'agenda?from=2030-01-07T00:00:00.000Z&to=2030-01-08T23:59:59.999Z',
    )
    expect(agenda.statusCode).toBe(200)
    expect(agenda.json().appointments).toHaveLength(3)
    expect(
      agenda
        .json()
        .appointments.every((item: { service_id: string }) => item.service_id === serviceA),
    ).toBe(true)
  })
})

describe('rescheduling, canceling and the agenda read model', () => {
  const range = 'agenda?from=2030-01-07T00:00:00.000Z&to=2030-01-15T23:59:59.999Z'
  type Row = {
    id: string
    status: string
    starts_at: string
    previous_starts_at: string | null
    paid: boolean
  }
  const rows = async () =>
    (await call('agenda-a', 'GET', clinicA, range)).json().appointments as Row[]

  it('moves an appointment after the same warnings as a new booking and remembers the old time', async () => {
    const target = (await rows()).find((row) => row.starts_at.includes('T13:00'))!
    const blocked = await call('agenda-a', 'PUT', clinicA, `appointments/${target.id}/reschedule`, {
      localStartsAt: '2030-01-08T10:00',
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().warnings.map((warning: { code: string }) => warning.code)).toEqual([
      'outside_availability',
    ])
    // Its own slot is not a conflict: moving 30 minutes inside the open day needs no warning.
    const moved = await call('agenda-a', 'PUT', clinicA, `appointments/${target.id}/reschedule`, {
      localStartsAt: '2030-01-14T15:00',
    })
    expect(moved.statusCode).toBe(200)
    const after = (await rows()).find((row) => row.id === target.id)!
    expect(after.starts_at).toContain('2030-01-14T18:00')
    expect(after.previous_starts_at).toContain('2030-01-07T13:00')
    expect(after.paid).toBe(false)
  })

  it('keeps canceled appointments in the agenda and refuses to move them', async () => {
    const target = (await rows()).find((row) => row.starts_at.includes('2030-01-14T18:00'))!
    expect(
      (
        await call('agenda-a', 'PUT', clinicA, `appointments/${target.id}/status`, {
          status: 'canceled',
        })
      ).statusCode,
    ).toBe(200)
    expect((await rows()).find((row) => row.id === target.id)?.status).toBe('canceled')
    expect(
      (
        await call('agenda-a', 'PUT', clinicA, `appointments/${target.id}/reschedule`, {
          localStartsAt: '2030-01-14T16:00',
        })
      ).statusCode,
    ).toBe(409)
  })

  it('does not let another clinic move an appointment', async () => {
    const target = (await rows())[0]
    expect(
      (
        await call('agenda-b', 'PUT', clinicA, `appointments/${target.id}/reschedule`, {
          localStartsAt: '2030-01-14T11:00',
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await call('agenda-b', 'PUT', clinicB, `appointments/${target.id}/reschedule`, {
          localStartsAt: '2030-01-14T11:00',
        })
      ).statusCode,
    ).toBe(404)
  })
})

describe('client registry: CPF, consent, duplicates, edit and archive', () => {
  const cpf = '529.982.247-25'
  let registryClient: string

  beforeEach(async () => {
    await app.close()
    app = await makeApp()
  })

  it('stores CPF digits, sex and a dated message consent', async () => {
    const created = await call('agenda-a', 'POST', clinicA, 'clients', {
      name: 'Maria Registro',
      phone: '+5511988880001',
      taxId: cpf,
      sex: 'female',
      marketingOptIn: true,
    })
    expect(created.statusCode).toBe(201)
    const client = created.json().client
    registryClient = client.id
    expect(client.tax_id).toBe('52998224725')
    expect(client.sex).toBe('female')
    expect(client.source).toBe('manager')
    expect(client.linked).toBe(false)
    expect(client.marketing_opt_in).toBe(true)
    expect(client.marketing_opt_in_at).not.toBeNull()
  })

  it('rejects invalid CPF, bad sex, future birth date and unknown fields', async () => {
    const base = { name: 'Inválida', phone: '+5511988880002' }
    for (const extra of [
      { taxId: '111.111.111-11' },
      { taxId: '529.982.247-24' },
      { birthDate: '2999-01-01' },
    ])
      expect(
        (await call('agenda-a', 'POST', clinicA, 'clients', { ...base, ...extra })).statusCode,
      ).toBe(400)
    // Biological sex only: gender-identity values are not part of the domain.
    for (const sex of ['x', 'other', 'undisclosed'])
      expect(
        (await call('agenda-a', 'POST', clinicA, 'clients', { ...base, sex })).statusCode,
      ).toBe(400)
    expect(
      (await call('agenda-a', 'POST', clinicA, 'clients', { ...base, sex: 'male' })).statusCode,
    ).toBe(201)
    expect(
      (await call('agenda-a', 'POST', clinicA, 'clients', { ...base, clinic_id: clinicB }))
        .statusCode,
    ).toBe(400)
  })

  it('refuses a repeated CPF in the same clinic but allows it in another clinic', async () => {
    const repeated = await call('agenda-a', 'POST', clinicA, 'clients', {
      name: 'Outra Maria',
      taxId: cpf,
    })
    expect(repeated.statusCode).toBe(409)
    expect(repeated.json().error).toBe('Tax id already registered')
    expect(repeated.json().client.id).toBe(registryClient)
    expect(
      (await call('agenda-b', 'POST', clinicB, 'clients', { name: 'Maria em B', taxId: cpf }))
        .statusCode,
    ).toBe(201)
  })

  it('asks for confirmation on a shared phone instead of blocking it', async () => {
    const payload = { name: 'Filha da Maria', phone: '+5511988880001' }
    const asked = await call('agenda-a', 'POST', clinicA, 'clients', payload)
    expect(asked.statusCode).toBe(409)
    expect(asked.json().error).toBe('Client requires confirmation')
    expect(asked.json().duplicates.map((item: { id: string }) => item.id)).toEqual([registryClient])
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'clients', {
          ...payload,
          confirmDuplicatePhone: true,
        })
      ).statusCode,
    ).toBe(201)
  })

  it('lists a masked CPF and finds clients by CPF digits', async () => {
    const found = await call('agenda-a', 'GET', clinicA, 'clients?q=529.982')
    expect(found.statusCode).toBe(200)
    const [client] = found.json().clients
    expect(client.id).toBe(registryClient)
    expect(client.tax_id_masked).toBe('***.***.***-25')
    expect(client).not.toHaveProperty('tax_id')
  })

  it('serves the full record only through the detail route', async () => {
    const detail = await call('agenda-a', 'GET', clinicA, `clients/${registryClient}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json().client.tax_id).toBe('52998224725')
    expect(Array.isArray(detail.json().history)).toBe(true)
  })

  it('edits a client, keeping the consent date while opted in and clearing it on opt-out', async () => {
    const first = (await call('agenda-a', 'GET', clinicA, `clients/${registryClient}`)).json()
      .client
    const kept = await call('agenda-a', 'PUT', clinicA, `clients/${registryClient}`, {
      name: 'Maria Editada',
      phone: '+5511988880001',
      taxId: cpf,
      marketingOptIn: true,
      confirmDuplicatePhone: true,
    })
    expect(kept.statusCode).toBe(200)
    expect(kept.json().client.display_name).toBe('Maria Editada')
    expect(kept.json().client.sex).toBeNull()
    expect(kept.json().client.marketing_opt_in_at).toBe(first.marketing_opt_in_at)
    const cleared = await call('agenda-a', 'PUT', clinicA, `clients/${registryClient}`, {
      name: 'Maria Editada',
      phone: '+5511988880001',
      taxId: cpf,
      marketingOptIn: false,
      confirmDuplicatePhone: true,
    })
    expect(cleared.json().client.marketing_opt_in).toBe(false)
    expect(cleared.json().client.marketing_opt_in_at).toBeNull()
  })

  it('does not let a clinic read, edit or archive another clinic client', async () => {
    expect((await call('agenda-b', 'GET', clinicA, `clients/${registryClient}`)).statusCode).toBe(
      403,
    )
    // Using clinic B's own scope with clinic A's client id must look like "not found".
    expect((await call('agenda-b', 'GET', clinicB, `clients/${registryClient}`)).statusCode).toBe(
      404,
    )
    expect(
      (await call('agenda-b', 'PUT', clinicB, `clients/${registryClient}`, { name: 'Invasão' }))
        .statusCode,
    ).toBe(404)
    expect(
      (
        await call('agenda-b', 'PUT', clinicB, `clients/${registryClient}/status`, {
          status: 'archived',
        })
      ).statusCode,
    ).toBe(404)
    const stillThere = await call('agenda-a', 'GET', clinicA, `clients/${registryClient}`)
    expect(stillThere.json().client.display_name).toBe('Maria Editada')
    expect(stillThere.json().client.status).toBe('active')
  })

  it('archives and reactivates; archived clients leave the default list and cannot be booked', async () => {
    expect(
      (
        await call('agenda-a', 'PUT', clinicA, `clients/${registryClient}/status`, {
          status: 'archived',
        })
      ).statusCode,
    ).toBe(200)
    const active = (await call('agenda-a', 'GET', clinicA, 'clients?q=529.982')).json().clients
    expect(active).toEqual([])
    const all = (await call('agenda-a', 'GET', clinicA, 'clients?q=529.982&status=all')).json()
      .clients
    expect(all[0].status).toBe('archived')
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'appointments', {
          clientId: registryClient,
          serviceId: serviceA,
          localStartsAt: '2030-01-14T10:00',
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await call('agenda-a', 'PUT', clinicA, `clients/${registryClient}/status`, {
          status: 'active',
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'appointments', {
          clientId: registryClient,
          serviceId: serviceA,
          localStartsAt: '2030-01-14T10:00',
          confirmedWarnings: ['outside_availability'],
        })
      ).statusCode,
    ).toBe(201)
  })
})

describe('closures (férias, fechamento por período)', () => {
  it('warns the manager inside a closure, scopes it per clinic and removes it', async () => {
    await app.close()
    app = await makeApp()
    const created = await call('agenda-a', 'POST', clinicA, 'closures', {
      startsOn: '2030-01-21',
      endsOn: '2030-01-22',
      kind: 'collective_vacation',
      note: 'Recesso',
    })
    expect(created.statusCode).toBe(201)
    const closure = created.json().closure
    expect(closure).toMatchObject({
      starts_on: '2030-01-21',
      ends_on: '2030-01-22',
      kind: 'collective_vacation',
      professional_id: null,
    })
    expect(
      (
        await call('agenda-a', 'POST', clinicA, 'closures', {
          startsOn: '2030-01-23',
          endsOn: '2030-01-21',
          kind: 'other',
        })
      ).statusCode,
    ).toBe(400)
    expect(
      (
        await call('agenda-b', 'POST', clinicA, 'closures', {
          startsOn: '2030-01-21',
          endsOn: '2030-01-21',
          kind: 'other',
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (await call('agenda-b', 'POST', clinicB, `closures/${closure.id}/remove`)).statusCode,
    ).toBe(404)

    const inside = await call('agenda-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: serviceA,
      localStartsAt: '2030-01-21T10:00',
    })
    expect(inside.statusCode).toBe(409)
    expect(inside.json().warnings.map((warning: { code: string }) => warning.code)).toContain(
      'closure',
    )
    const confirmed = await call('agenda-a', 'POST', clinicA, 'appointments', {
      clientId: clientA,
      serviceId: serviceA,
      localStartsAt: '2030-01-21T10:00',
      confirmedWarnings: ['closure'],
    })
    expect(confirmed.statusCode).toBe(201)
    expect(confirmed.json().appointment.override_reasons).toEqual(['closure'])

    const agenda = (
      await call(
        'agenda-a',
        'GET',
        clinicA,
        'agenda?from=2030-01-20T00:00:00.000Z&to=2030-01-26T23:59:59.999Z',
      )
    ).json()
    expect(agenda.closures).toHaveLength(1)
    expect(agenda.location).toEqual({ city: null, state: null })
    expect((await call('agenda-b', 'GET', clinicB, 'closures')).json().closures).toEqual([])
    // One professional's history only lists that professional's periods.
    expect(
      (
        await call(
          'agenda-a',
          'GET',
          clinicA,
          `closures?professionalId=${crypto.randomUUID()}&history=1`,
        )
      ).json().closures,
    ).toEqual([])
    expect(
      (await call('agenda-a', 'GET', clinicA, 'closures?history=1')).json().closures,
    ).toHaveLength(1)
    expect((await call('agenda-a', 'GET', clinicA, 'closures?history=yes')).statusCode).toBe(400)

    const edited = await call('agenda-a', 'PUT', clinicA, `closures/${closure.id}`, {
      startsOn: '2030-01-21',
      endsOn: '2030-01-25',
      kind: 'maintenance',
    })
    expect(edited.statusCode).toBe(200)
    expect(edited.json().closure.ends_on).toBe('2030-01-25')
    // Booked inside the closure on purpose (confirmed warning): never canceled by it (ADR-035).
    expect(edited.json().canceledAppointments).toBe(0)
    expect(
      (await call('agenda-a', 'POST', clinicA, `closures/${closure.id}/remove`)).statusCode,
    ).toBe(200)
    expect((await call('agenda-a', 'GET', clinicA, 'closures')).json().closures).toEqual([])
  })
})

it('allows 4 hours after closing and rejects times beyond the manager window', async () => {
  const base = {
    clientId: clientA,
    serviceId: serviceA,
    confirmedWarnings: ['outside_availability'],
  }
  const request = (hour: string) =>
    call('agenda-a', 'POST', clinicA, 'appointments', {
      ...base,
      localStartsAt: `2030-02-04T${hour}`,
    })
  expect((await request('21:00')).statusCode).toBe(201)
  for (const hour of ['06:59', '21:01']) {
    const refused = await request(hour)
    expect(refused.statusCode).toBe(409)
    expect(refused.json().error).toBe('Outside manager booking window')
  }
})
