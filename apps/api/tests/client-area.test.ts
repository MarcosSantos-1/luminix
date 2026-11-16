import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { applyMigrations, type SqlConnection } from '../src/shared/database/migrations.js'

let db: PGlite
let connection: SqlConnection
let clinicA: string
let slugA: string
let slugB: string
let solo: string
let pair: string
let ana: string
let bia: string

// Tiny valid JPEG data URL, enough for the record photo.
const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=='
const anamnesis = { sex: 'female', birthDate: '1992-04-10', photo, consent: true }

/** Next weekday (Mon–Fri) at least two days ahead, as YYYY-MM-DD in São Paulo. */
function nextWeekday() {
  const date = new Date(Date.now() + 2 * 86_400_000)
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

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

async function call(
  user: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown,
) {
  const app = await makeApp()
  try {
    return await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${user}` },
      ...(payload ? { payload: payload as object } : {}),
    })
  } finally {
    await app.close()
  }
}

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
  for (const label of ['a', 'b']) {
    const identity = (
      await connection.query('SELECT * FROM luminix.resolve_staff_identity($1)', [`owner-${label}`])
    ).rows[0].identity_id
    const clinic = (
      await connection.query('SELECT * FROM luminix.bootstrap_owner_clinic($1::uuid, $2)', [
        identity,
        `Espaço ${label}`,
      ])
    ).rows[0]
    const id = String(clinic.clinic_id)
    // Activation gives the clinic its friendly address: read the slug after it.
    const activated = (
      await connection.query(
        "UPDATE luminix.clinics SET status = 'active' WHERE id = $1 RETURNING slug",
        [id],
      )
    ).rows[0]
    await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [id])
    await connection.query(
      `INSERT INTO luminix.clinic_profiles (clinic_id, owner_name, contact_email, contact_phone, public_enabled)
       VALUES ($1, 'Dona', 'dona@example.com', '+5511999999999', $2)`,
      [id, true],
    )
    for (let weekday = 1; weekday <= 5; weekday++)
      await connection.query(
        `INSERT INTO luminix.weekly_availability (clinic_id, weekday, is_available, periods)
         VALUES ($1, $2, true, '[{"start":"09:00","end":"12:00"}]')`,
        [id, weekday],
      )
    if (label === 'a') {
      clinicA = id
      slugA = String(activated.slug)
      solo = String(
        (
          await connection.query(
            `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes, booking_mode)
             VALUES ($1, 'Escova', 8000, 60, 'instant') RETURNING id`,
            [id],
          )
        ).rows[0].id,
      )
      pair = String(
        (
          await connection.query(
            `INSERT INTO luminix.services (clinic_id, name, price_cents, duration_minutes, booking_mode)
             VALUES ($1, 'Coloração', 20000, 120, 'request') RETURNING id`,
            [id],
          )
        ).rows[0].id,
      )
      ana = String(
        (
          await connection.query(
            "INSERT INTO luminix.professionals (clinic_id, display_name) VALUES ($1, 'Ana') RETURNING id",
            [id],
          )
        ).rows[0].id,
      )
      bia = String(
        (
          await connection.query(
            "INSERT INTO luminix.professionals (clinic_id, display_name) VALUES ($1, 'Bia') RETURNING id",
            [id],
          )
        ).rows[0].id,
      )
      // Escova: only Ana. Coloração: both.
      await connection.query(
        `INSERT INTO luminix.professional_services (clinic_id, professional_id, service_id)
         VALUES ($1, $2, $3), ($1, $2, $4), ($1, $5, $4)`,
        [id, ana, solo, pair, bia],
      )
    } else slugB = String(activated.slug)
  }
  await db.exec('SET ROLE luminix_api')
})

afterAll(async () => {
  await db.close()
})

describe('área do cliente', () => {
  it('cria perfil e ficha da conta, e só então vincula um espaço publicado', async () => {
    expect((await call('cliente-1', 'GET', '/client/me')).json()).toEqual({
      profile: null,
      spaces: [],
    })
    const early = await call('cliente-1', 'POST', '/client/spaces', {
      slug: slugA,
      shareAnamnesis: true,
    })
    expect(early.statusCode).toBe(400)
    expect(
      (
        await call('cliente-1', 'PUT', '/client/me', {
          name: 'Cliente Um',
          email: 'um@example.com',
          phone: '(11) 98888-7777',
        })
      ).statusCode,
    ).toBe(200)
    expect((await call('cliente-1', 'PUT', '/client/me/anamnesis', anamnesis)).statusCode).toBe(200)
    const joined = await call('cliente-1', 'POST', '/client/spaces', {
      slug: slugA,
      shareAnamnesis: true,
    })
    expect(joined.statusCode).toBe(201)
    const me = (await call('cliente-1', 'GET', '/client/me')).json()
    expect(me.profile).toMatchObject({ name: 'Cliente Um', phone: '+5511988887777' })
    expect(me.profile.anamnesis).toMatchObject({ sex: 'female', birthDate: '1992-04-10' })
    expect(me.spaces).toEqual([
      expect.objectContaining({ slug: slugA, shareAnamnesis: true, ownAnamnesis: null }),
    ])
  })

  it('cria a ficha local da clínica, de origem app, com o que a cliente permitiu', async () => {
    await db.exec('RESET ROLE')
    const row = (
      await connection.query(
        'SELECT display_name, contact_phone, source, sex, anamnesis_shared FROM luminix.clinic_clients WHERE clinic_id = $1',
        [clinicA],
      )
    ).rows[0]
    await db.exec('SET ROLE luminix_api')
    expect(row).toMatchObject({
      display_name: 'Cliente Um',
      contact_phone: '+5511988887777',
      source: 'client_app',
      sex: 'female',
      anamnesis_shared: true,
    })
  })

  it('recusa espaço não vinculado e espaço não publicado', async () => {
    const date = nextWeekday()
    const other = await call(
      'cliente-1',
      'GET',
      `/client/spaces/${slugB}/availability?serviceId=${solo}&date=${date}`,
    )
    expect(other.statusCode).toBe(404)
    await db.exec('RESET ROLE')
    await connection.query(
      'UPDATE luminix.clinic_profiles SET public_enabled = false WHERE clinic_id <> $1',
      [clinicA],
    )
    await db.exec('SET ROLE luminix_api')
    const hidden = await call('cliente-1', 'POST', '/client/spaces', {
      slug: slugB,
      shareAnamnesis: false,
    })
    expect(hidden.statusCode).toBe(400)
  })

  it('serviço de uma só profissional não pede escolha; com duas, pede', async () => {
    const date = nextWeekday()
    const single = (
      await call(
        'cliente-1',
        'GET',
        `/client/spaces/${slugA}/availability?serviceId=${solo}&date=${date}`,
      )
    ).json()
    expect(single.choose).toBe(false)
    expect(single.professionals.map((item: { name: string }) => item.name)).toEqual(['Ana'])
    expect(single.slots[ana]).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00'])
    const both = (
      await call(
        'cliente-1',
        'GET',
        `/client/spaces/${slugA}/availability?serviceId=${pair}&date=${date}`,
      )
    ).json()
    expect(both.choose).toBe(true)
    expect(both.professionals).toHaveLength(2)
    expect(both.slots[bia]).toEqual(['09:00', '09:30', '10:00'])
  })

  it('agenda na clínica, bloqueia o mesmo horário e lista só os da própria cliente', async () => {
    const date = nextWeekday()
    const booked = await call('cliente-1', 'POST', `/client/spaces/${slugA}/appointments`, {
      serviceId: solo,
      localStartsAt: `${date}T09:00`,
      paymentMethod: 'pix',
    })
    expect(booked.statusCode).toBe(201)
    expect(booked.json().status).toBe('confirmed')

    // Another client sees the slot gone and cannot take it.
    await call('cliente-2', 'PUT', '/client/me', {
      name: 'Cliente Dois',
      email: 'dois@example.com',
    })
    await call('cliente-2', 'PUT', '/client/me/anamnesis', anamnesis)
    await call('cliente-2', 'POST', '/client/spaces', { slug: slugA, shareAnamnesis: false })
    const after = (
      await call(
        'cliente-2',
        'GET',
        `/client/spaces/${slugA}/availability?serviceId=${solo}&date=${date}`,
      )
    ).json()
    expect(after.slots[ana]).not.toContain('09:00')
    expect(after.slots[ana]).not.toContain('09:30')
    const clash = await call('cliente-2', 'POST', `/client/spaces/${slugA}/appointments`, {
      serviceId: solo,
      localStartsAt: `${date}T09:30`,
      paymentMethod: 'local',
    })
    expect(clash.statusCode).toBe(409)
    // Coloração has Bia free at 09:00: "no preference" lands on her.
    const anyone = await call('cliente-2', 'POST', `/client/spaces/${slugA}/appointments`, {
      serviceId: pair,
      localStartsAt: `${date}T09:00`,
      paymentMethod: 'local',
    })
    expect(anyone.statusCode).toBe(201)
    expect(anyone.json().status).toBe('scheduled')

    const mine = (await call('cliente-1', 'GET', `/client/spaces/${slugA}/appointments`)).json()
    expect(mine.appointments).toHaveLength(1)
    expect(mine.appointments[0]).toMatchObject({
      status: 'confirmed',
      source: 'client',
      paymentMethod: 'pix',
      priceCents: 8000,
      professional: { name: 'Ana' },
    })
    const theirs = (await call('cliente-2', 'GET', `/client/spaces/${slugA}/appointments`)).json()
    expect(theirs.appointments[0].professional.name).toBe('Bia')

    // The clinic agenda (manager view) holds both bookings.
    await db.exec('RESET ROLE')
    const agenda = (
      await connection.query(
        "SELECT count(*)::int AS total FROM luminix.appointments WHERE clinic_id = $1 AND booking_source = 'client'",
        [clinicA],
      )
    ).rows[0]
    await db.exec('SET ROLE luminix_api')
    expect(agenda.total).toBe(2)
  })

  it('remarca e cancela só o que é seu', async () => {
    const date = nextWeekday()
    const mine = (await call('cliente-1', 'GET', `/client/spaces/${slugA}/appointments`)).json()
    const id = mine.appointments[0].id
    const stolen = await call(
      'cliente-2',
      'POST',
      `/client/spaces/${slugA}/appointments/${id}/cancel`,
    )
    expect(stolen.statusCode).toBe(400)
    const moved = await call(
      'cliente-1',
      'POST',
      `/client/spaces/${slugA}/appointments/${id}/reschedule`,
      { localStartsAt: `${date}T11:00` },
    )
    expect(moved.statusCode).toBe(200)
    const canceled = await call(
      'cliente-1',
      'POST',
      `/client/spaces/${slugA}/appointments/${id}/cancel`,
    )
    expect(canceled.statusCode).toBe(200)
    const list = (await call('cliente-1', 'GET', `/client/spaces/${slugA}/appointments`)).json()
    expect(list.appointments[0]).toMatchObject({ status: 'canceled' })
    expect(list.appointments[0].previousStartsAt).toBeTruthy()
  })

  it('ficha própria do espaço deixa de usar a ficha da conta', async () => {
    const saved = await call('cliente-2', 'PUT', `/client/spaces/${slugA}/anamnesis`, {
      ...anamnesis,
      sex: 'male',
    })
    expect(saved.statusCode).toBe(200)
    const me = (await call('cliente-2', 'GET', '/client/me')).json()
    expect(me.spaces[0]).toMatchObject({ shareAnamnesis: false })
    expect(me.spaces[0].ownAnamnesis).toMatchObject({ sex: 'male' })
    expect(me.profile.anamnesis).toMatchObject({ sex: 'female' })
  })

  it('remover o espaço tira da lista sem apagar a ficha da clínica', async () => {
    expect((await call('cliente-1', 'DELETE', `/client/spaces/${slugA}`)).statusCode).toBe(200)
    expect((await call('cliente-1', 'GET', '/client/me')).json().spaces).toEqual([])
    const blocked = await call('cliente-1', 'GET', `/client/spaces/${slugA}/appointments`)
    expect(blocked.statusCode).toBe(404)
    await db.exec('RESET ROLE')
    const kept = (
      await connection.query(
        "SELECT count(*)::int AS total FROM luminix.clinic_clients WHERE clinic_id = $1 AND display_name = 'Cliente Um'",
        [clinicA],
      )
    ).rows[0]
    await db.exec('SET ROLE luminix_api')
    expect(kept.total).toBe(1)
    expect(slugB).toBeTruthy()
  })

  it('responde CORS só para as origens da área do cliente', async () => {
    const app = await makeApp()
    try {
      const allowed = await app.inject({
        method: 'OPTIONS',
        url: '/client/me',
        headers: { origin: 'https://luminix.beauty', 'access-control-request-method': 'GET' },
      })
      expect(allowed.statusCode).toBe(204)
      expect(allowed.headers['access-control-allow-origin']).toBe('https://luminix.beauty')
      const denied = await app.inject({
        method: 'OPTIONS',
        url: '/client/me',
        headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
      })
      expect(denied.headers['access-control-allow-origin']).toBeUndefined()
    } finally {
      await app.close()
    }
  })
})
