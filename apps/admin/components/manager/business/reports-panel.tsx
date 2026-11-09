'use client'

import { Button } from '@heroui/react'
import { BarChart3, Download, Scissors, UsersRound } from 'lucide-react'
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
              <small>{status.completed?.count ?? 0} concluídos</small>
            </div>
            <div>
              <span>Ticket médio</span>
              <strong>{money(data.appointments.averageTicketCents)}</strong>
              <small>Por atendimento concluído</small>
            </div>
            <div>
              <span>Faltas</span>
              <strong>{percent(data.appointments.noShowRate)}</strong>
              <small>Cancelados: {percent(data.appointments.cancelRate)}</small>
            </div>
            <div>
              <span>Clientes novas</span>
              <strong>{data.newClients}</strong>
              <small>Cadastradas no período</small>
            </div>
            <div>
              <span>Entradas</span>
              <strong className="is-positive">{money(data.finance.incomeCents)}</strong>
              <small>Lançadas no financeiro</small>
            </div>
            <div>
              <span>Saldo</span>
              <strong>{money(data.finance.balanceCents)}</strong>
              <small>Saídas: {money(data.finance.expenseCents)}</small>
            </div>
          </div>

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
