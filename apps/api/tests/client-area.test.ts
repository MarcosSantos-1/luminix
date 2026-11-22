import { randomUUID } from 'node:crypto'
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
const basic = { sex: 'female', birthDate: '1992-04-10', allergies: 'no', cosmeticAllergy: 'no' }
const anamnesis = { level: 1, answers: basic, photo, consent: true }
const health = {
  diagnosedDisease: 'no',
  medicalTreatment: 'no',
  continuousMedications: 'no',
  aestheticReaction: 'no',
  pregnant: 'no',
}

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
    expect(me.profile.anamnesis).toMatchObject({ version: 2, level: 1, answers: basic })
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

  it('mantém a ficha compartilhada quando a clínica salva a sua versão', async () => {
    const client = (await call('owner-a', 'GET', `/clinics/${clinicA}/clients`)).json().clients[0]
    const saved = await call(
      'owner-a',
      'PUT',
      `/clinics/${clinicA}/clients/${client.id}/anamnesis`,
      {
        level: 1,
        consent: true,
        answers: { ...basic, birthDate: '1991-04-03' },
      },
    )
    expect(saved.statusCode).toBe(200)
    const detail = (await call('owner-a', 'GET', `/clinics/${clinicA}/clients/${client.id}`)).json()
    expect(detail.anamnesis.record.answers.birthDate).toBe('1991-04-03')
    const me = (await call('cliente-1', 'GET', '/client/me')).json()
    expect(me.profile.anamnesis.answers).toEqual(basic)
    expect(me.spaces[0].ownAnamnesis).toBeNull()
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

  it('semana planejada: horário da profissional no dia, sempre dentro do espaço', async () => {
    const date = new Date(Date.parse(`${nextWeekday()}T12:00:00Z`) + 7 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const slots = async () =>
      (
        await call(
          'cliente-1',
          'GET',
          `/client/spaces/${slugA}/availability?serviceId=${solo}&date=${date}`,
        )
      ).json().slots[ana]
    const plan = (days: unknown[], user = 'owner-a', clinic = clinicA) =>
      call(user, 'PUT', `/clinics/${clinic}/schedule-plan`, { days })
    // Ana starts at 10:00 that day and asks for until 14:00; the space closes at 12:00.
    expect(
      (
        await plan([
          {
            date,
            professionalId: ana,
            isAvailable: true,
            periods: [{ start: '10:00', end: '14:00' }],
          },
        ])
      ).statusCode,
    ).toBe(200)
    expect(await slots()).toEqual(['10:00', '10:30', '11:00'])
    const agenda = (
      await call(
        'owner-a',
        'GET',
        `/clinics/${clinicA}/agenda?from=${date}T00:00:00.000Z&to=${date}T23:59:59.999Z`,
      )
    ).json()
    expect(agenda.professionalOverrides).toMatchObject([
      { professional_id: ana, local_date: date, is_available: true },
    ])
    // The space closes that day: nobody books, whatever the professional's own hours.
    await plan([{ date, professionalId: null, isAvailable: false, periods: [] }])
    expect(await slots()).toEqual([])
    // Back to the routine for both.
    await plan([
      { date, professionalId: null, useDefault: true },
      { date, professionalId: ana, useDefault: true },
    ])
    expect(await slots()).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00'])
    // Invalid entries and other clinics are refused.
    expect(
      (await plan([{ date, professionalId: ana, isAvailable: true, periods: [] }])).statusCode,
    ).toBe(400)
    expect(
      (
        await plan([
          { date, professionalId: ana, useDefault: true },
          { date, professionalId: ana, useDefault: true },
        ])
      ).statusCode,
    ).toBe(400)
    expect(
      (await plan([{ date, professionalId: ana, isAvailable: false, periods: [] }], 'owner-b'))
        .statusCode,
    ).toBe(403)
  })

  it('agenda na clínica, bloqueia o mesmo horário e lista só os da própria cliente', async () => {
    const date = nextWeekday()
    const booked = await call('cliente-1', 'POST', `/client/spaces/${slugA}/appointments`, {
      serviceId: solo,
      localStartsAt: `${date}T09:00`,
      paymentMethod: 'local',
    })
    expect(booked.statusCode).toBe(201)
    expect(booked.json().status).toBe('confirmed')

    // Another client sees the slot gone and cannot take it.
    await call('cliente-2', 'PUT', '/client/me', {
      name: 'Cliente Dois',
      email: 'dois@example.com',
    })
    await call('cliente-2', 'PUT', '/client/me/anamnesis', anamnesis)
    // Without a record the space cannot take bookings: this client shares the account record.
    await call('cliente-2', 'POST', '/client/spaces', { slug: slugA, shareAnamnesis: true })
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
      paymentMethod: 'local',
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

  it('só oferece, agenda e remarca o serviço especial em dias de locação', async () => {
    const date = nextWeekday()
    const availableDate = new Date(Date.parse(date + 'T12:00:00Z') + 14 * 86400000)
      .toISOString()
      .slice(0, 10)
    await db.exec('RESET ROLE')
    const service = (
      await connection.query(
        `INSERT INTO luminix.services
      (clinic_id,name,price_cents,duration_minutes,booking_mode)
      VALUES($1,'Escova com vaporizador',10000,30,'manual_release') RETURNING id`,
        [clinicA],
      )
    ).rows[0].id
    await db.exec('SET ROLE luminix_api')
    const equipment = (
      await call('owner-a', 'POST', `/clinics/${clinicA}/catalog/equipment`, {
        name: 'Laser de locação',
        serviceIds: [service],
      })
    ).json().id
    expect(
      (
        await call(
          'owner-a',
          'POST',
          `/clinics/${clinicA}/catalog/equipment/${equipment}/rentals`,
          {
            startsOn: availableDate,
            endsOn: availableDate,
          },
        )
      ).statusCode,
    ).toBe(201)
    const publication = await call('cliente-1', 'GET', `/public/clinics/${slugA}`)
    expect(
      publication.json().clinic.services.find((item: { id: string }) => item.id === service)
        .rentalDates,
    ).toEqual([availableDate])
    const base = `/client/spaces/${slugA}`
    const slots = async (day: string) =>
      (
        await call('cliente-1', 'GET', base + `/availability?serviceId=${service}&date=${day}`)
      ).json().slots
    expect(Object.values(await slots(date)).flat()).toHaveLength(0)
    expect(Object.values(await slots(availableDate)).flat()).toContain('09:00')
    const book = (day: string) =>
      call('cliente-1', 'POST', base + '/appointments', {
        serviceId: service,
        localStartsAt: day + 'T09:00',
        paymentMethod: 'local',
      })
    expect((await book(date)).statusCode).toBe(409)
    const booked = await book(availableDate)
    expect(booked.statusCode, booked.body).toBe(201)
    expect(
      (
        await call('cliente-1', 'POST', base + `/appointments/${booked.json().id}/reschedule`, {
          localStartsAt: date + 'T09:00',
        })
      ).statusCode,
    ).toBe(409)
  })

  it('ficha própria do espaço deixa de usar a ficha da conta', async () => {
    const saved = await call('cliente-2', 'PUT', `/client/spaces/${slugA}/anamnesis`, {
      ...anamnesis,
      level: 2,
      answers: { ...basic, ...health, sex: 'male' },
    })
    expect(saved.statusCode).toBe(200)
    const me = (await call('cliente-2', 'GET', '/client/me')).json()
    expect(me.spaces[0]).toMatchObject({ shareAnamnesis: false })
    expect(me.spaces[0].ownAnamnesis).toMatchObject({ level: 2, answers: { sex: 'male' } })
    expect(me.profile.anamnesis).toMatchObject({ answers: { sex: 'female' } })
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

  it('recusa ficha sem as respostas obrigatórias do nível', async () => {
    const short = await call('cliente-3', 'PUT', '/client/me', {
      name: 'Três',
      email: 'tres@example.com',
    })
    expect(short.statusCode).toBe(200)
    const missing = await call('cliente-3', 'PUT', '/client/me/anamnesis', {
      ...anamnesis,
      level: 2,
    })
    expect(missing.statusCode).toBe(400)
    const strange = await call('cliente-3', 'PUT', '/client/me/anamnesis', {
      ...anamnesis,
      answers: { ...basic, 'bad key': 'x' },
    })
    expect(strange.statusCode).toBe(400)
  })

  it('espaço de estética exige ficha completa e ficha vencida bloqueia o agendamento', async () => {
    await db.exec('RESET ROLE')
    await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicA])
    const facial = String(
      (
        await connection.query(
          `INSERT INTO luminix.services (clinic_id, name, category, price_cents, duration_minutes)
           VALUES ($1, 'Limpeza de pele', 'Estética facial', 15000, 60) RETURNING id`,
          [clinicA],
        )
      ).rows[0].id,
    )
    await db.exec('SET ROLE luminix_api')
    const me = (await call('cliente-2', 'GET', '/client/me')).json()
    expect(me.spaces[0].requiredLevel).toBe(3)
    const date = nextWeekday()
    const refused = await call('cliente-2', 'POST', `/client/spaces/${slugA}/appointments`, {
      serviceId: facial,
      localStartsAt: `${date}T11:00`,
      paymentMethod: 'local',
    })
    expect(refused.json()).toEqual({ error: 'Record required' })
    const full = {
      ...basic,
      ...health,
      sex: 'male',
      physicalLimitation: 'no',
      smoking: 'never',
      alcohol: 'socially',
      physicalActivity: 'yes',
      activityPerWeek: 3,
      waterIntake: 'medium',
      skinType: 'oily',
      previousAesthetic: 'no',
      goals: ['acne'],
    }
    expect(
      (
        await call('cliente-2', 'PUT', `/client/spaces/${slugA}/anamnesis`, {
          ...anamnesis,
          level: 3,
          answers: full,
        })
      ).statusCode,
    ).toBe(200)
    // A year-old record must be confirmed again before booking.
    await db.exec('RESET ROLE')
    await connection.query(
      `UPDATE luminix.clinic_clients
          SET client_anamnesis = jsonb_set(client_anamnesis, '{answeredAt}', to_jsonb((now() - interval '400 days')::text))
        WHERE clinic_id = $1 AND client_anamnesis IS NOT NULL`,
      [clinicA],
    )
    await db.exec('SET ROLE luminix_api')
    const expired = await call('cliente-2', 'POST', `/client/spaces/${slugA}/appointments`, {
      serviceId: facial,
      localStartsAt: `${date}T11:00`,
      paymentMethod: 'local',
    })
    expect(expired.json()).toEqual({ error: 'Record expired' })
  })

  it('só aceita Pix ou cartão quando o espaço liga pagamento no app', async () => {
    const date = nextWeekday()
    await call('cliente-4', 'PUT', '/client/me', { name: 'Quatro', email: 'quatro@example.com' })
    await call('cliente-4', 'PUT', '/client/me/anamnesis', {
      ...anamnesis,
      level: 3,
      answers: {
        ...basic,
        ...health,
        physicalLimitation: 'no',
        smoking: 'never',
        alcohol: 'never',
        physicalActivity: 'no',
        waterIntake: 'high',
        skinType: 'dry',
        previousAesthetic: 'no',
      },
    })
    await call('cliente-4', 'POST', '/client/spaces', { slug: slugA, shareAnamnesis: true })
    const availability = (
      await call(
        'cliente-4',
        'GET',
        `/client/spaces/${slugA}/availability?serviceId=${solo}&date=${date}`,
      )
    ).json()
    expect(availability.inAppPayments).toBe(false)
    const pix = await call('cliente-4', 'POST', `/client/spaces/${slugA}/appointments`, {
      serviceId: solo,
      localStartsAt: `${date}T10:00`,
      paymentMethod: 'pix',
    })
    expect(pix.json()).toEqual({ error: 'Payment unavailable' })
    await db.exec('RESET ROLE')
    await connection.query("SELECT set_config('luminix.clinic_id', $1, false)", [clinicA])
    await connection.query(
      `INSERT INTO luminix.payment_preferences (clinic_id, accept_in_app) VALUES ($1, true)
       ON CONFLICT (clinic_id) DO UPDATE SET accept_in_app = true`,
      [clinicA],
    )
    await db.exec('SET ROLE luminix_api')
    const paid = await call('cliente-4', 'POST', `/client/spaces/${slugA}/appointments`, {
      serviceId: solo,
      localStartsAt: `${date}T10:00`,
      paymentMethod: 'pix',
    })
    expect(paid.statusCode).toBe(201)
  })

  it('publica voucher apenas na conta vinculada e registra um único resgate', async () => {
    const date = new Date(Date.parse(nextWeekday()) + 21 * 86400000).toISOString().slice(0, 10)
    const base = `/clinics/${clinicA}`
    const recipient = 'cliente-voucher'
    expect(
      (
        await call(recipient, 'PUT', '/client/me', {
          name: 'Cliente Voucher',
          email: 'voucher@example.com',
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (await call(recipient, 'POST', '/client/spaces', { slug: slugA, shareAnamnesis: false }))
        .statusCode,
    ).toBe(201)
    const clients = (await call('owner-a', 'GET', `${base}/clients`)).json().clients
    const clientId = clients.find(
      (client: { display_name: string }) => client.display_name === 'Cliente Voucher',
    ).id
    const other = await call('owner-a', 'POST', `${base}/clients`, { name: 'Outra cliente' })
    expect(other.statusCode).toBe(201)
    const otherId = other.json().client.id
    const voucherId = randomUUID()
    const voucher = { id: voucherId, type: 'percent', value: 25, expiresOn: date }
    const endpoint = `${base}/clients/${clientId}/vouchers`
    expect((await call('owner-b', 'POST', endpoint, voucher)).statusCode).toBe(403)
    expect((await call('owner-a', 'POST', endpoint, { ...voucher, value: 101 })).statusCode).toBe(
      400,
    )
    expect(
      (await call('owner-a', 'POST', endpoint, { ...voucher, expiresOn: '2000-01-01' })).statusCode,
    ).toBe(400)
    const issued = await call('owner-a', 'POST', endpoint, voucher)
    expect(issued.statusCode, issued.body).toBe(201)
    expect(issued.json().destination).toBe('app')
    expect((await call('owner-a', 'POST', endpoint, voucher)).statusCode).toBe(201)
    const customerPath = `/client/spaces/${slugA}/appointments`
    const inbox = () => call(recipient, 'GET', customerPath)
    expect((await call('cliente-2', 'GET', customerPath)).json().voucherNotices).toEqual([])
    expect((await inbox()).json().voucherNotices).toEqual([
      expect.objectContaining({ id: `voucher-${voucherId}` }),
    ])
    const book = {
      clientId,
      serviceId: solo,
      localStartsAt: `${date}T14:00`,
      confirmedWarnings: ['outside_availability'],
      voucherId,
    }
    expect(
      (await call('owner-a', 'POST', `${base}/appointments`, { ...book, clientId: otherId }))
        .statusCode,
    ).toBe(409)
    const created = await call('owner-a', 'POST', `${base}/appointments`, book)
    expect(created.statusCode, created.body).toBe(201)
    expect(
      (
        await call('owner-a', 'POST', `${base}/appointments`, {
          ...book,
          localStartsAt: `${date}T15:00`,
        })
      ).statusCode,
    ).toBe(409)
    const result = (await inbox()).json()
    expect(
      result.appointments.find(
        (entry: { id: string }) => entry.id === created.json().appointment.id,
      ).priceCents,
    ).toBe(6000)
    expect(result.voucherNotices).toEqual([])
    expect((await call('owner-a', 'GET', endpoint)).json().vouchers).toEqual([
      expect.objectContaining({ status: 'used' }),
    ])
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
