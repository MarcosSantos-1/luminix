'use client'

import { Button } from '@heroui/react'
import {
  BarChart3,
  CalendarCheck,
  CalendarRange,
  Download,
  HeartHandshake,
  ReceiptText,
  Scissors,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { DateInputField } from '@/components/ui/fields'
import { useClinicApi, useClinicResource } from '../settings/clinic-api'
import { HelpTip, LoadError, SettingsCard, SettingsSkeleton } from '../settings/settings-kit'
import { addDays, money, percent, shortDateBr, todayIso } from './format'
import './business.css'

type Report = {
  from: string
  to: string
  appointments: {
    total: number
    byStatus: Record<string, { count: number; cents: number }>
    averageTicketCents: number
    noShowRate: number
    cancelRate: number
  }
  finance: { incomeCents: number; expenseCents: number; balanceCents: number }
  newClients: number
  topServices: { name: string; count: number; cents: number }[]
  professionals: { name: string; count: number; cents: number }[]
  daily: { day: string; appointments: number; incomeCents: number }[]
  // Newer fields: optional so an older API answer still renders.
  previous?: {
    from: string
    to: string
    appointments: number
    averageTicketCents: number
    incomeCents: number
    expenseCents: number
    newClients: number
  }
  weekdays?: number[]
  hours?: { hour: number; count: number }[]
  expenseCategories?: { name: string; cents: number; count: number }[]
  incomeMethods?: { method: string; cents: number; count: number }[]
  clientsServed?: { total: number; returning: number }
}

const weekdayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const methodNames: Record<string, string> = {
  pix: '⚡ Pix',
  cash: '💵 Dinheiro',
  credit: '💳 Crédito',
  debit: '💳 Débito',
  transfer: '🏦 Transferência',
  card: '💳 Cartão',
  app: '📱 Pelo app',
  other: '✨ Outro',
}
const statusNames: { id: string; label: string; tone: string }[] = [
  { id: 'completed', label: 'Concluídos', tone: 'is-done' },
  { id: 'confirmed', label: 'Confirmados', tone: 'is-confirmed' },
  { id: 'scheduled', label: 'Marcados', tone: 'is-scheduled' },
  { id: 'canceled', label: 'Cancelados', tone: 'is-canceled' },
  { id: 'no_show', label: 'Faltas', tone: 'is-missed' },
]

/** "▲ 12%" against the period right before; nothing when there is no base to compare. */
function Delta({
  now,
  before,
  inverse = false,
}: {
  now: number
  before?: number
  inverse?: boolean
}) {
  if (before == null || (!before && !now)) return null
  if (!before) return <em className="report-delta is-up">novo</em>
  const change = (now - before) / Math.abs(before)
  if (Math.abs(change) < 0.005) return <em className="report-delta">= anterior</em>
  const good = inverse ? change < 0 : change > 0
  return (
    <em className={`report-delta ${good ? 'is-up' : 'is-down'}`}>
      {change > 0 ? '▲' : '▼'} {Math.round(Math.abs(change) * 100)}%
    </em>
  )
}

function presets(today: string) {
  const firstThisMonth = `${today.slice(0, 7)}-01`
  const lastMonthEnd = addDays(firstThisMonth, -1)
  return [
    { id: 'month', label: 'Este mês', from: firstThisMonth, to: today },
    {
      id: 'last-month',
      label: 'Mês passado',
      from: `${lastMonthEnd.slice(0, 7)}-01`,
      to: lastMonthEnd,
    },
    { id: '7', label: 'Últimos 7 dias', from: addDays(today, -6), to: today },
    { id: '30', label: 'Últimos 30 dias', from: addDays(today, -29), to: today },
  ]
}

function Bars({
  rows,
  metric,
}: {
  rows: { label: string; value: number; text: string }[]
  metric: string
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <ul className="report-bars" aria-label={metric}>
      {rows.map((row) => (
        <li key={row.label}>
          <span className="report-bar-label">{row.label}</span>
          <span className="report-bar-track" aria-hidden>
            <span style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <strong>{row.text}</strong>
        </li>
      ))}
    </ul>
  )
}

export function ReportsPanel({ clinicId }: { clinicId: string }) {
  const api = useClinicApi(clinicId)
  const today = todayIso()
  const options = presets(today)
  const [range, setRange] = useState({ from: options[0].from, to: options[0].to })
  const report = useClinicResource<Report>(api, `reports?from=${range.from}&to=${range.to}`)
  const [chart, setChart] = useState<'appointments' | 'income'>('appointments')

  const data = report.data
  if (report.error && !data) return <LoadError message={report.error} onRetry={report.reload} />

  function exportCsv() {
    if (!data) return
    const lines = [
      'dia;atendimentos;entradas',
      ...data.daily.map(
        (row) =>
          `${row.day};${row.appointments};${(row.incomeCents / 100).toFixed(2).replace('.', ',')}`,
      ),
    ]
    const blob = new Blob([String.fromCharCode(0xfeff) + lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `relatorio-${data.from}-a-${data.to}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const status = data?.appointments.byStatus ?? {}
  const maxDaily = Math.max(
    1,
    ...(data?.daily ?? []).map((row) =>
      chart === 'appointments' ? row.appointments : row.incomeCents,
    ),
  )

  return (
    <div className="biz-stack">
      <div className="biz-toolbar">
        <div className="biz-chips" role="group" aria-label="Período">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={range.from === option.from && range.to === option.to}
              onClick={() => setRange({ from: option.from, to: option.to })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <DateInputField
          className="biz-date"
          ariaLabel="De"
          value={range.from}
          max={range.to}
          onChange={(from) => from && setRange({ ...range, from })}
        />
        <DateInputField
          className="biz-date"
          ariaLabel="Até"
          value={range.to}
          min={range.from}
          max={today}
          onChange={(to) => to && setRange({ ...range, to })}
        />
        <Button size="sm" variant="secondary" isDisabled={!data} onPress={exportCsv}>
          <Download size={15} aria-hidden /> Baixar planilha
        </Button>
      </div>
      {!data ? (
        <SettingsSkeleton cards={2} />
      ) : (
        <>
          <div className="biz-stats">
            <div>
              <span>Atendimentos</span>
              <strong>{data.appointments.total}</strong>
              <small>
                {status.completed?.count ?? 0} concluídos{' '}
                <Delta
                  now={
                    (status.completed?.count ?? 0) +
                    (status.confirmed?.count ?? 0) +
                    (status.scheduled?.count ?? 0)
                  }
                  before={data.previous?.appointments}
                />
              </small>
            </div>
            <div>
              <span>Ticket médio</span>
              <strong>{money(data.appointments.averageTicketCents)}</strong>
              <small>
                Por atendimento concluído{' '}
                <Delta
                  now={data.appointments.averageTicketCents}
                  before={data.previous?.averageTicketCents}
                />
              </small>
            </div>
            <div>
              <span>Faltas</span>
              <strong>{percent(data.appointments.noShowRate)}</strong>
              <small>Cancelados: {percent(data.appointments.cancelRate)}</small>
            </div>
            <div>
              <span>Clientes novas</span>
              <strong>{data.newClients}</strong>
              <small>
                Cadastradas no período{' '}
                <Delta now={data.newClients} before={data.previous?.newClients} />
              </small>
            </div>
            <div>
              <span>Entradas</span>
              <strong className="is-positive">{money(data.finance.incomeCents)}</strong>
              <small>
                Lançadas no financeiro{' '}
                <Delta now={data.finance.incomeCents} before={data.previous?.incomeCents} />
              </small>
            </div>
            <div>
              <span>Saldo</span>
              <strong>{money(data.finance.balanceCents)}</strong>
              <small>
                Saídas: {money(data.finance.expenseCents)}{' '}
                <Delta
                  inverse
                  now={data.finance.expenseCents}
                  before={data.previous?.expenseCents}
                />
              </small>
            </div>
          </div>
          {data.previous ? (
            <p className="report-compare">
              Setas comparam com {shortDateBr(data.previous.from)} a {shortDateBr(data.previous.to)}
              , o mesmo número de dias logo antes.
            </p>
          ) : null}

          <SettingsCard
            icon={<BarChart3 size={20} />}
            title="Dia a dia"
            help={{
              title: 'De onde vêm esses números?',
              text: 'Atendimentos contam os marcados, confirmados e concluídos. Entradas são os valores lançados no Financeiro, inclusive os lançados a partir dos atendimentos.',
            }}
            badge={
              <div className="biz-chips" role="group" aria-label="Mostrar">
                <button
                  type="button"
                  aria-pressed={chart === 'appointments'}
                  onClick={() => setChart('appointments')}
                >
                  Atendimentos
                </button>
                <button
                  type="button"
                  aria-pressed={chart === 'income'}
                  onClick={() => setChart('income')}
                >
                  Entradas
                </button>
              </div>
            }
          >
            <div
              className="report-chart"
              role="img"
              aria-label={`Gráfico de ${chart === 'appointments' ? 'atendimentos' : 'entradas'} por dia`}
            >
              {data.daily.map((row) => {
                const value = chart === 'appointments' ? row.appointments : row.incomeCents
                return (
                  <div
                    key={row.day}
                    className="report-column"
                    title={`${shortDateBr(row.day)}: ${chart === 'appointments' ? `${row.appointments} atendimentos` : money(row.incomeCents)}`}
                  >
                    <span
                      style={{ height: `${Math.max(value ? 4 : 0, (value / maxDaily) * 100)}%` }}
                    />
                    {data.daily.length <= 31 ? <small>{row.day.slice(8, 10)}</small> : null}
                  </div>
                )
              })}
            </div>
          </SettingsCard>

          <div className="report-columns">
            {data.weekdays ? (
              <WeekRhythm weekdays={data.weekdays} hours={data.hours ?? []} />
            ) : null}
            <SettingsCard icon={<CalendarCheck size={20} />} title="Como ficaram os horários">
              <StatusSplit byStatus={status} />
            </SettingsCard>
            {data.clientsServed ? (
              <SettingsCard icon={<HeartHandshake size={20} />} title="Clientes atendidas">
                <Loyalty served={data.clientsServed} />
              </SettingsCard>
            ) : null}
            {data.incomeMethods ? (
              <SettingsCard icon={<Wallet size={20} />} title="Como as clientes pagaram">
                {data.incomeMethods.length ? (
                  <Bars
                    metric="Formas de pagamento"
                    rows={data.incomeMethods.map((item) => ({
                      label: methodNames[item.method] ?? item.method,
                      value: item.cents,
                      text: money(item.cents),
                    }))}
                  />
                ) : (
                  <p className="settings-muted">Nenhuma entrada no período.</p>
                )}
              </SettingsCard>
            ) : null}
            {data.expenseCategories ? (
              <SettingsCard icon={<ReceiptText size={20} />} title="Para onde foi o dinheiro">
                {data.expenseCategories.length ? (
                  <Bars
                    metric="Despesas por categoria"
                    rows={data.expenseCategories.map((item) => ({
                      label: item.name,
                      value: item.cents,
                      text: money(item.cents),
                    }))}
                  />
                ) : (
                  <p className="settings-muted">Nenhuma saída no período. 🎉</p>
                )}
              </SettingsCard>
            ) : null}
            <SettingsCard icon={<Scissors size={20} />} title="Serviços mais procurados">
              {data.topServices.length ? (
                <Bars
                  metric="Serviços"
                  rows={data.topServices.map((item) => ({
                    label: item.name,
                    value: item.count,
                    text: `${item.count} · ${money(item.cents)}`,
                  }))}
                />
              ) : (
                <p className="settings-muted">Sem atendimentos no período.</p>
              )}
            </SettingsCard>
            <SettingsCard icon={<UsersRound size={20} />} title="Por profissional">
              {data.professionals.length ? (
                <Bars
                  metric="Profissionais"
                  rows={data.professionals.map((item) => ({
                    label: item.name,
                    value: item.count,
                    text: `${item.count} · ${money(item.cents)}`,
                  }))}
                />
              ) : (
                <p className="settings-muted">Sem atendimentos no período.</p>
              )}
            </SettingsCard>
          </div>
          <p className="settings-footnote">
            Valores dos atendimentos usam o preço guardado no agendamento (com promoção).
            <HelpTip title="E os pagamentos pelo app?">
              Quando o pagamento online estiver ativo, as cobranças entram aqui automaticamente.
            </HelpTip>
          </p>
        </>
      )}
    </div>
  )
}

/** Busiest weekdays (bars) and the hours that fill up most (chips), with a one-line takeaway. */
function WeekRhythm({
  weekdays,
  hours,
}: {
  weekdays: number[]
  hours: { hour: number; count: number }[]
}) {
  const max = Math.max(1, ...weekdays)
  const total = weekdays.reduce((sum, value) => sum + value, 0)
  const best = weekdays.indexOf(Math.max(...weekdays))
  const peaks = [...hours].sort((a, b) => b.count - a.count).slice(0, 3)
  return (
    <SettingsCard icon={<CalendarRange size={20} />} title="Ritmo da semana">
      {total ? (
        <>
          <p className="report-takeaway">
            📈 <strong>{weekdayNames[best]}</strong> é o dia mais cheio
            {peaks[0] ? (
              <>
                {' '}
                e o horário preferido é <strong>{String(peaks[0].hour).padStart(2, '0')}h</strong>
              </>
            ) : null}
            .
          </p>
          <ul className="report-week" aria-label="Atendimentos por dia da semana">
            {weekdays.map((value, index) => (
              <li key={weekdayNames[index]} className={index === best ? 'is-best' : undefined}>
                <span className="report-week-track" aria-hidden>
                  <span style={{ height: `${Math.max(value ? 6 : 0, (value / max) * 100)}%` }} />
                </span>
                <strong>{value}</strong>
                <small>{weekdayNames[index].slice(0, 3)}</small>
              </li>
            ))}
          </ul>
          {peaks.length ? (
            <div className="report-hours">
              <span>Horários mais cheios</span>
              {peaks.map((peak) => (
                <em key={peak.hour}>
                  🕐 {String(peak.hour).padStart(2, '0')}h · {peak.count}
                </em>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <p className="settings-muted">Sem atendimentos no período.</p>
      )}
    </SettingsCard>
  )
}

/** One bar split by appointment outcome, with the legend below. */
function StatusSplit({ byStatus }: { byStatus: Record<string, { count: number; cents: number }> }) {
  const rows = statusNames
    .map((entry) => ({ ...entry, count: byStatus[entry.id]?.count ?? 0 }))
    .filter((entry) => entry.count)
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  if (!total) return <p className="settings-muted">Sem agendamentos no período.</p>
  return (
    <>
      <div className="report-split" role="img" aria-label="Agendamentos por situação">
        {rows.map((row) => (
          <span key={row.id} className={row.tone} style={{ flexGrow: row.count }} />
        ))}
      </div>
      <ul className="report-legend">
        {rows.map((row) => (
          <li key={row.id}>
            <i className={row.tone} aria-hidden />
            <span>{row.label}</span>
            <strong>
              {row.count} <small>({percent(row.count / total)})</small>
            </strong>
          </li>
        ))}
      </ul>
    </>
  )
}

/** First visit vs. coming back, as a ring. */
function Loyalty({ served }: { served: { total: number; returning: number } }) {
  if (!served.total) return <p className="settings-muted">Nenhuma cliente atendida no período.</p>
  const share = served.returning / served.total
  return (
    <div className="report-loyalty">
      <div
        className="report-ring"
        style={{ ['--share' as string]: `${Math.round(share * 100)}%` }}
        role="img"
        aria-label={`${percent(share)} voltaram`}
      >
        <strong>{percent(share)}</strong>
        <small>voltaram</small>
      </div>
      <ul className="report-legend">
        <li>
          <i className="is-done" aria-hidden />
          <span>Voltaram</span>
          <strong>{served.returning}</strong>
        </li>
        <li>
          <i className="is-scheduled" aria-hidden />
          <span>Primeira vez</span>
          <strong>{served.total - served.returning}</strong>
        </li>
        <li>
          <span>Total atendidas</span>
          <strong>{served.total}</strong>
        </li>
      </ul>
    </div>
  )
}
