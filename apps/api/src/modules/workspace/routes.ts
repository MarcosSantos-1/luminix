import type { FastifyInstance } from 'fastify'
import { packagesDue, packagesDueQuery } from '../catalog/package-money.js'
import {
  clinicRefParams,
  createAuthorizedRoute,
  type Authenticate,
} from '../../shared/tenant/authorized-route.js'
import type { TenantPool } from '../../shared/tenant/clinic-transaction.js'
import {
  isoDate,
  rolePermissions,
  toNumber,
  uuidSchema,
} from '../../shared/tenant/route-helpers.js'

const activityEntities = [
  'appointments',
  'clinic_clients',
  'services',
  'finance_entries',
  'inventory_movements',
  'media_items',
  'promotions',
  'professionals',
  'clinic_memberships',
] as const

type Notice = {
  id: string
  tone: 'info' | 'warning' | 'success'
  title: string
  text: string
  action?: { label: string; target: string; tab?: string; equipmentId?: string; overdue?: boolean }
}

/** Panel-wide features: activity inbox, notices (avisos) and the indexed search. */
export async function workspaceRoutes(
  app: FastifyInstance,
  authenticate: Authenticate,
  pool: TenantPool | undefined,
) {
  const authorized = createAuthorizedRoute(authenticate, pool)

  // "Minha conta": the signed-in person's own name and photo in this clinic (any active member).
  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/account',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, null, async (connection, tenant) => {
        const row = (
          await connection.query('SELECT * FROM luminix.own_account($1::uuid)', [tenant.clinicId])
        ).rows[0]
        if (!row) return reply.code(404).send({ error: 'Account not found' })
        return {
          name: row.display_name ? String(row.display_name) : '',
          email: row.contact_email ? String(row.contact_email) : '',
          role: String(row.role_name),
          photo: row.photo_data ? String(row.photo_data) : null,
        }
      }),
  )
  app.put<{ Params: { clinicId: string }; Body: { name: string; photo: string | null } }>(
    '/clinics/:clinicId/account',
    {
      bodyLimit: 260_000,
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'photo'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            photo: {
              anyOf: [
                { type: 'string', maxLength: 200000, pattern: '^data:image/jpeg;base64,' },
                { type: 'null' },
              ],
            },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, null, async (connection, tenant) => {
        await connection.query('SELECT luminix.save_own_account($1::uuid, $2::text, $3::text)', [
          tenant.clinicId,
          request.body.name,
          request.body.photo,
        ])
        return { saved: true }
      }),
  )

  app.get<{
    Params: { clinicId: string }
    Querystring: { view?: 'inbox' | 'archived'; entity?: string; before?: string }
  }>(
    '/clinics/:clinicId/activity',
    {
      schema: {
        params: clinicRefParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            view: { type: 'string', enum: ['inbox', 'archived'] },
            entity: { type: 'string', enum: [...activityEntities] },
            before: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'audit:read', async (connection, tenant) => {
        const [rows, unread] = await Promise.all([
          connection.query(
            'SELECT * FROM luminix.list_activity($1::uuid, $2::text, $3::text, $4::timestamptz, 40)',
            [
              tenant.clinicId,
              request.query.view ?? 'inbox',
              request.query.entity ?? null,
              request.query.before ?? null,
            ],
          ),
          connection.query('SELECT luminix.unread_activity_count($1::uuid) AS total', [
            tenant.clinicId,
          ]),
        ])
        const items = rows.rows.map((row) => ({
          id: String(row.id),
          entity: String(row.entity),
          action: String(row.action),
          label: row.label ? String(row.label) : null,
          detail: row.detail ? String(row.detail) : null,
          actor: row.actor ? String(row.actor) : null,
          state: row.state ? String(row.state) : 'unread',
          createdAt: new Date(String(row.created_at)).toISOString(),
        }))
        return {
          items,
          unread: toNumber(unread.rows[0]?.total),
          nextBefore: items.length === 40 ? items.at(-1)!.createdAt : null,
        }
      }),
  )

  app.post<{
    Params: { clinicId: string }
    Body: { ids?: string[]; all?: boolean; state: 'read' | 'archived' | 'hidden' | 'unread' }
  }>(
    '/clinics/:clinicId/activity/state',
    {
      schema: {
        params: clinicRefParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['state'],
          properties: {
            ids: {
              type: 'array',
              minItems: 1,
              maxItems: 200,
              uniqueItems: true,
              items: uuidSchema,
            },
            all: { type: 'boolean' },
            state: { type: 'string', enum: ['read', 'archived', 'hidden', 'unread'] },
          },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, 'audit:read', async (connection, tenant) => {
        const all = request.body.all === true
        if (!all && !request.body.ids?.length)
          throw Object.assign(new Error('Nothing selected'), { statusCode: 400 })
        if (all && request.body.state === 'unread')
          throw Object.assign(new Error('Invalid change'), { statusCode: 400 })
        const changed = (
          await connection.query(
            'SELECT luminix.set_activity_state($1::uuid, $2::uuid[], $3::text, $4::boolean) AS changed',
            [
              tenant.clinicId,
              request.body.ids ?? null,
              request.body.state === 'unread' ? null : request.body.state,
              all,
            ],
          )
        ).rows[0]?.changed
        return { changed: toNumber(changed) }
      }),
  )

  app.get<{ Params: { clinicId: string } }>(
    '/clinics/:clinicId/notices',
    { schema: { params: clinicRefParams } },
    async (request, reply) =>
      authorized(request, reply, null, async (connection, tenant) => {
        const can = await rolePermissions(connection, tenant)
        const today = isoDate(
          (await connection.query('SELECT luminix.clinic_today() AS d')).rows[0]?.d,
        )!
        const notices: Notice[] = []
        const status = (
          await connection.query('SELECT status FROM luminix.clinics WHERE id = $1', [
            tenant.clinicId,
          ])
        ).rows[0]?.status
        if (status !== 'active') return { notices }
        if (can.has('service:manage')) {
          const missing = await connection.query(
            `SELECT id,name FROM luminix.resources r WHERE clinic_id=$1 AND type='equipment'
              AND availability_mode='manual_release' AND status='active' AND NOT EXISTS (
                SELECT FROM luminix.equipment_windows($1,r.id,$2::date,
                  (date_trunc('month',$2::date) + interval '1 month - 1 day')::date))
              ORDER BY lower(name),id`,
            [tenant.clinicId, today],
          )
          const month = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(
            new Date(today + 'T12:00:00Z'),
          )
          for (const row of missing.rows)
            notices.push({
              id: `rental-${today.slice(0, 7)}-${row.id}`,
              tone: 'info',
              title: `Quando o ${row.name} estará disponível em ${month}?`,
              text: 'Escolha a data e o horário da locação para liberar os tratamentos na agenda.',
              action: {
                label: 'Ir',
                target: 'servicos',
                tab: 'equipment',
                equipmentId: String(row.id),
              },
            })
        }
        if (can.has('settings:manage')) {
          // Stripe receiving account (ADR-041): where the analysis stands and what to do next.
          const connect = (
            await connection.query(
              `SELECT a.notice_state, coalesce(p.accept_in_app, false) AS in_app,
                      p.guide_done_at IS NOT NULL AS guide_done
                 FROM luminix.stripe_connect_accounts a
                 LEFT JOIN luminix.payment_preferences p ON p.clinic_id = a.clinic_id
                WHERE a.clinic_id = $1 AND a.account_id IS NOT NULL
                ORDER BY a.connected_at DESC NULLS LAST LIMIT 1`,
              [tenant.clinicId],
            )
          ).rows[0]
          const state = connect?.notice_state as string | undefined
          const go = { target: 'recebimentos' }
          if (state === 'approved' && !(connect?.in_app && connect?.guide_done))
            notices.push({
              id: 'connect-approved',
              tone: 'success',
              title: 'Seu cadastro na Stripe foi aprovado!',
              text: 'Falta um passo: ligar o pagamento pelo app. A gente te mostra o caminho.',
              action: { label: 'Prosseguir', ...go },
            })
          else if (state === 'needs_info')
            notices.push({
              id: 'connect-needs-info',
              tone: 'warning',
              title: 'A Stripe pediu mais uma informação',
              text: 'Abra o cadastro de recebimentos para ver o que falta.',
              action: { label: 'Completar', ...go },
            })
          else if (state === 'restricted')
            notices.push({
              id: 'connect-restricted',
              tone: 'warning',
              title: 'A Stripe não aprovou o cadastro',
              text: 'O espaço continua recebendo no local. Veja o que a Stripe informou.',
              action: { label: 'Ver', ...go },
            })
          else if (state === 'reviewing')
            notices.push({
              id: 'connect-reviewing',
              tone: 'info',
              title: 'Cadastro na Stripe em análise',
              text: 'Costuma levar de minutos a alguns dias úteis. Avisamos por e-mail quando sair.',
              action: { label: 'Acompanhar', ...go },
            })
          const site = (
            await connection.query(
              'SELECT coalesce(public_enabled, false) AS published FROM luminix.clinic_profiles WHERE clinic_id = $1',
              [tenant.clinicId],
            )
          ).rows[0]
          if (site && site.published !== true)
            notices.push({
              id: 'site-offline',
              tone: 'warning',
              title: 'Seu site está fora do ar',
              text: 'Coloque no ar para as clientes verem serviços, preços e horários.',
              action: { label: 'Colocar no ar', target: 'configuracoes', tab: 'vitrine' },
            })
        }
        if (can.has('agenda:manage')) {
          const open = toNumber(
            (
              await connection.query(
                `SELECT count(*) AS total FROM luminix.appointments
                  WHERE clinic_id = $1 AND status IN ('scheduled', 'confirmed') AND ends_at < now()`,
                [tenant.clinicId],
              )
            ).rows[0]?.total,
          )
          if (open)
            notices.push({
              id: `open-appointments-${today}`,
              tone: 'info',
              title: `${open} ${open === 1 ? 'atendimento já passou' : 'atendimentos já passaram'} sem conclusão`,
              text: 'Marque como concluído ou falta para manter a agenda e o financeiro certinhos.',
              action: { label: 'Ver', target: 'inicio', overdue: true },
            })
        }
        if (can.has('finance:manage')) {
          const pending = toNumber(
            (
              await connection.query(
                `SELECT count(*) AS total FROM luminix.appointments a
                   JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
                  WHERE a.clinic_id = $1 AND a.client_package_id IS NULL AND a.status = 'completed' AND a.starts_at > now() - interval '60 days'
                    AND (coalesce(a.price_cents, 0) > 0 OR s.price_type = 'quote')
                    AND luminix.appointment_paid_cents(a.clinic_id, a.id)
                      < greatest(coalesce(a.price_cents, 0), 1)`,
                [tenant.clinicId],
              )
            ).rows[0]?.total,
          )
          const owed = packagesDue(
            (await connection.query(packagesDueQuery, [tenant.clinicId])).rows,
          )
          if (owed.length)
            notices.push({
              id: `packages-due-${today}`,
              tone: 'warning',
              title: `${owed.length} ${owed.length === 1 ? 'pacote com parcela' : 'pacotes com parcelas'} a receber`,
              text: `${owed
                .slice(0, 3)
                .map((item) => item.client.split(' ')[0])
                .join(
                  ', ',
                )}${owed.length > 3 ? '…' : ''}: registre o que entrou para o caixa fechar.`,
              action: { label: 'Abrir Financeiro', target: 'financeiro' },
            })
          if (pending)
            notices.push({
              id: `finance-pending-${today}`,
              tone: 'info',
              title: `${pending} ${pending === 1 ? 'atendimento' : 'atendimentos'} a lançar no financeiro`,
              text: 'Um clique registra o valor recebido.',
              action: { label: 'Abrir Financeiro', target: 'financeiro' },
            })
          // Bills of this month still open: overdue, or due within three days.
          const due = (
            await connection.query(
              `SELECT b.name, b.due_day FROM luminix.finance_bills b
                WHERE b.clinic_id = $1 AND b.status = 'active' AND b.due_day IS NOT NULL
                  AND b.due_day <= extract(day FROM $2::date)::integer + 3
                  AND NOT EXISTS (SELECT 1 FROM luminix.finance_entries e WHERE e.clinic_id = b.clinic_id
                    AND e.bill_id = b.id AND e.status = 'active'
                    AND e.bill_month = date_trunc('month', $2::date)::date)
                ORDER BY b.due_day LIMIT 6`,
              [tenant.clinicId, today],
            )
          ).rows
          if (due.length) {
            const day = Number(today.slice(8, 10))
            const late = due.filter((row) => Number(row.due_day) < day).length
            notices.push({
              id: `finance-bills-${today}`,
              tone: late ? 'warning' : 'info',
              title: late
                ? `${late} ${late === 1 ? 'conta atrasada' : 'contas atrasadas'} neste mês`
                : `${due.length} ${due.length === 1 ? 'conta vence' : 'contas vencem'} nos próximos dias`,
              text: due.map((row) => `${String(row.name)} (dia ${Number(row.due_day)})`).join(', '),
              action: { label: 'Abrir Financeiro', target: 'financeiro' },
            })
          }
        }
        if (can.has('inventory:manage')) {
          const low = (
            await connection.query(
              `SELECT name FROM luminix.inventory_items WHERE clinic_id = $1 AND status = 'active'
                AND quantity <= min_quantity ORDER BY quantity LIMIT 3`,
              [tenant.clinicId],
            )
          ).rows.map((row) => String(row.name))
          if (low.length)
            notices.push({
              id: `low-stock-${today}`,
              tone: 'warning',
              title:
                low.length === 1 ? `${low[0]} está acabando` : `${low.length} produtos acabando`,
              text: low.length === 1 ? 'Hora de repor o estoque.' : low.join(', '),
              action: { label: 'Ver estoque', target: 'estoque' },
            })
          const expiring = (
            await connection.query(
              `SELECT name, expires_on - $2::date AS days FROM luminix.inventory_items
                WHERE clinic_id = $1 AND status = 'active' AND tracks_expiry AND quantity > 0
                  AND expires_on <= $2::date + 30
                ORDER BY expires_on LIMIT 3`,
              [tenant.clinicId, today],
            )
          ).rows.map((row) => ({ name: String(row.name), days: Number(row.days) }))
          if (expiring.length) {
            const expired = expiring.filter((item) => item.days < 0).length
            const first = expiring[0]
            notices.push({
              id: `expiring-stock-${today}`,
              tone: 'warning',
              title:
                expiring.length === 1
                  ? first.days < 0
                    ? `${first.name} está vencido`
                    : first.days === 0
                      ? `${first.name} vence hoje`
                      : `${first.name} vence em ${first.days} ${first.days === 1 ? 'dia' : 'dias'}`
                  : expired
                    ? `${expired} ${expired === 1 ? 'produto vencido' : 'produtos vencidos'} no estoque`
                    : `${expiring.length} produtos vencem em até 30 dias`,
              text:
                expiring.length === 1
                  ? first.days < 0
                    ? 'Separe e descarte antes de usar em um atendimento.'
                    : 'Use primeiro ou planeje a troca.'
                  : expiring.map((item) => item.name).join(', '),
              action: { label: 'Ver estoque', target: 'estoque' },
            })
          }
        }
        if (can.has('service:manage')) {
          const [withoutTeam, ending] = await Promise.all([
            connection.query(
              `SELECT count(*) AS total FROM luminix.services s WHERE s.clinic_id = $1 AND s.status = 'active'
                AND NOT EXISTS (SELECT 1 FROM luminix.professional_services ps
                  JOIN luminix.professionals p ON p.clinic_id = ps.clinic_id AND p.id = ps.professional_id AND p.status = 'active'
                  WHERE ps.clinic_id = s.clinic_id AND ps.service_id = s.id)`,
              [tenant.clinicId],
            ),
            connection.query(
              `SELECT name, ends_on FROM luminix.promotions WHERE clinic_id = $1 AND status = 'active'
                AND ends_on BETWEEN $2::date AND $2::date + 3 ORDER BY ends_on LIMIT 1`,
              [tenant.clinicId, today],
            ),
          ])
          const count = toNumber(withoutTeam.rows[0]?.total)
          if (count)
            notices.push({
              id: `services-without-team-${count}`,
              tone: 'warning',
              title: `${count} ${count === 1 ? 'serviço sem' : 'serviços sem'} profissional`,
              text: 'Escolha quem da equipe faz cada serviço para que apareçam na agenda.',
              action: { label: 'Abrir Equipe', target: 'configuracoes', tab: 'equipe' },
            })
          const promo = ending.rows[0]
          if (promo)
            notices.push({
              id: `promo-ending-${isoDate(promo.ends_on)}`,
              tone: 'info',
              title: `A promoção “${String(promo.name)}” termina em breve`,
              text: `Último dia: ${isoDate(promo.ends_on)!.split('-').reverse().join('/')}. Quer estender ou divulgar?`,
              action: { label: 'Ver promoções', target: 'servicos' },
            })
        }
        if (can.has('client:read')) {
          const birthdays = (
            await connection.query(
              `SELECT display_name FROM luminix.clinic_clients WHERE clinic_id = $1 AND status = 'active'
                AND birth_date IS NOT NULL AND to_char(birth_date, 'MM-DD') = to_char($2::date, 'MM-DD') LIMIT 5`,
              [tenant.clinicId, today],
            )
          ).rows.map((row) => String(row.display_name))
          if (birthdays.length)
            notices.push({
              id: `birthdays-${today}`,
              tone: 'success',
              title: `Hoje é aniversário de ${birthdays.join(', ')}`,
              text: 'Mande um carinho pelo WhatsApp.',
              action: { label: 'Abrir Marketing', target: 'marketing' },
            })
        }
        return { notices }
      }),
  )

  app.get<{ Params: { clinicId: string }; Querystring: { q: string } }>(
    '/clinics/:clinicId/search',
    {
      schema: {
        params: clinicRefParams,
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['q'],
          properties: { q: { type: 'string', minLength: 2, maxLength: 80 } },
        },
      },
    },
    async (request, reply) =>
      authorized(request, reply, null, async (connection, tenant) => {
        const can = await rolePermissions(connection, tenant)
        const term = request.query.q.trim()
        const digits = term.replace(/\D/g, '')
        const like = (column: string) =>
          `luminix.fold(${column}) LIKE '%' || luminix.fold($2) || '%'`
        const params = [tenant.clinicId, term]
        const groups: Record<string, { id: string; title: string; detail: string }[]> = {}
        const run = async (key: string, sql: string, extra: unknown[] = []) => {
          const { rows } = await connection.query(sql, [...params, ...extra])
          groups[key] = rows.map((row) => ({
            id: String(row.id),
            title: String(row.title),
            detail: row.detail ? String(row.detail) : '',
          }))
        }
        const tasks: Promise<void>[] = []
        if (can.has('client:read'))
          tasks.push(
            run(
              'clients',
              `SELECT id, display_name AS title, concat_ws(' · ', contact_phone, contact_email) AS detail
                 FROM luminix.clinic_clients WHERE clinic_id = $1 AND status = 'active'
                  AND (${like('display_name')} OR ${like('contact_email')}
                    OR ($3 <> '' AND regexp_replace(coalesce(contact_phone, ''), '\\D', '', 'g') LIKE '%' || $3 || '%'))
                ORDER BY lower(display_name) LIMIT 6`,
              [digits.length >= 4 ? digits : ''],
            ),
          )
        if (can.has('agenda:read')) {
          tasks.push(
            run(
              'services',
              `SELECT id, name AS title, concat_ws(' · ', category, CASE WHEN status = 'archived' THEN 'pausado' END) AS detail
                 FROM luminix.services WHERE clinic_id = $1 AND (${like('name')} OR ${like('category')})
                ORDER BY status, lower(name) LIMIT 6`,
            ),
          )
          tasks.push(
            run(
              'appointments',
              `SELECT a.id, c.display_name AS title,
                      s.name || ' · ' || to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS detail
                 FROM luminix.appointments a
                 JOIN luminix.clinic_clients c ON c.clinic_id = a.clinic_id AND c.id = a.clinic_client_id
                 JOIN luminix.services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
                WHERE a.clinic_id = $1 AND a.starts_at > now() - interval '1 day' AND a.status IN ('scheduled', 'confirmed')
                  AND (${like('c.display_name')} OR ${like('s.name')})
                ORDER BY a.starts_at LIMIT 5`,
            ),
          )
          tasks.push(
            run(
              'professionals',
              `SELECT id, display_name AS title, role_name AS detail FROM luminix.professionals
                WHERE clinic_id = $1 AND status = 'active' AND (${like('display_name')} OR ${like('role_name')})
                ORDER BY lower(display_name) LIMIT 5`,
            ),
          )
        }
        if (can.has('service:manage'))
          tasks.push(
            run(
              'promotions',
              `SELECT id, name AS title, percent || '% · ' || CASE status WHEN 'active' THEN 'ativa' WHEN 'paused' THEN 'pausada' ELSE 'encerrada' END AS detail
                 FROM luminix.promotions WHERE clinic_id = $1 AND ${like('name')} ORDER BY created_at DESC LIMIT 5`,
            ),
          )
        if (can.has('inventory:manage'))
          tasks.push(
            run(
              'inventory',
              `SELECT id, name AS title, trim(to_char(quantity, 'FM99999990D##')) || ' ' || unit AS detail
                 FROM luminix.inventory_items WHERE clinic_id = $1 AND status = 'active'
                  AND (${like('name')} OR ${like('category')}) ORDER BY lower(name) LIMIT 5`,
            ),
          )
        if (can.has('finance:manage'))
          tasks.push(
            run(
              'finance',
              `SELECT id, description AS title,
                      to_char(occurred_on, 'DD/MM/YYYY') || ' · ' || CASE kind WHEN 'income' THEN '+' ELSE '−' END
                        || ' R$ ' || to_char(amount_cents / 100.0, 'FM999G999G990D00') AS detail
                 FROM luminix.finance_entries WHERE clinic_id = $1 AND status = 'active'
                  AND (${like('description')} OR ${like('category')}) ORDER BY occurred_on DESC LIMIT 5`,
            ),
          )
        if (can.has('media:read'))
          tasks.push(
            run(
              'media',
              `SELECT i.id, coalesce(nullif(i.title, ''), 'Foto sem nome') AS title, f.name AS detail
                 FROM luminix.media_items i JOIN luminix.media_folders f ON f.clinic_id = i.clinic_id AND f.id = i.folder_id
                WHERE i.clinic_id = $1 AND i.status = 'active' AND (${like('i.title')} OR ${like('f.name')})
                ORDER BY i.created_at DESC LIMIT 5`,
            ),
          )
        await Promise.all(tasks)
        return { q: term, groups }
      }),
  )
}
