'use client'

import { Button } from '@heroui/react'
import { CalendarHeart, Clock3, Coffee, DoorClosed, DoorOpen, Palmtree, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { TextInputField, TimeInputField } from '@/components/ui/fields'
import { holidayScopeLabel, type Holiday } from '@/lib/holidays'
import type { ClinicApi } from '../settings/clinic-api'
import { QuickModal } from '../quick-modal'
import { canceledNote, confirmFlag, useCancellationGuard } from './cancellation-guard'
import type { OverrideRow, WeeklyRow } from './schedule-modal'

type Period = { start: string; end: string }
type Choice = 'closed' | 'normal' | 'special'

const range = (periods: Period[]) =>
  periods.length
    ? `${periods[0].start} às ${periods[periods.length - 1].end}${
        periods.length > 1
          ? ` · intervalo ${periods
              .slice(1)
              .map((period, index) => `${periods[index].end}–${period.start}`)
              .join(', ')}`
          : ''
      }`
    : ''

/** What a day looks like in the agenda: its rule (padrão, especial, fechado) in a few words. */
export function describeDay(
  override: OverrideRow | undefined,
  weekly: WeeklyRow | undefined,
): { open: boolean; label: string; special: boolean } {
  if (override)
    return {
      open: override.is_available,
      special: true,
      label: override.is_available ? `Personalizado ${range(override.periods)}` : 'Fechado',
    }
  return {
    open: weekly?.is_available === true,
    special: false,
    label: weekly?.is_available ? range(weekly.periods) : 'Fechado',
  }
}

/**
 * "Configurar dia": opens, closes or gives a day its own hours. Covers feriados (the answer
 * becomes the day's rule), a Sunday the space decides to open (clients see it) and "tal dia não
 * vamos atender". Saved as a special date of the space; "Voltar ao padrão" removes it.
 */
export function DayConfigModal({
  api,
  date,
  onClose,
  weekly,
  override,
  holiday,
  closures,
  canManage,
  onSaved,
  onOpenClosures,
}: {
  api: ClinicApi
  date: string | null
  onClose: () => void
  weekly: WeeklyRow[]
  override?: OverrideRow
  holiday?: Holiday
  /** "Espaço fechado · Férias coletivas", "Ana · Férias" on this day. */
  closures: string[]
  canManage: boolean
  onSaved: (message: string) => void
  onOpenClosures?: () => void
}) {
  const value = date ? new Date(`${date}T12:00:00`) : null
  const base = value ? weekly.find((row) => Number(row.weekday) === value.getDay()) : undefined
  const basePeriods = base?.is_available ? base.periods : []
  const [choice, setChoice] = useState<Choice>('normal')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [pause, setPause] = useState<Period | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { guard, dialog } = useCancellationGuard()

  useEffect(() => {
    if (!date) return
    const periods = override?.is_available ? override.periods : basePeriods
    const sameAsBase =
      override?.is_available && JSON.stringify(override.periods) === JSON.stringify(basePeriods)
    /* eslint-disable react-hooks/set-state-in-effect -- starts from the saved rule each time it opens */
    setChoice(
      override
        ? override.is_available
          ? sameAsBase
            ? 'normal'
            : 'special'
          : 'closed'
        : 'normal',
    )
    setStart(periods[0]?.start ?? '09:00')
    setEnd(periods[periods.length - 1]?.end ?? '18:00')
    setPause(periods.length > 1 ? { start: periods[0].end, end: periods[1].start } : null)
    setReason(override?.reason ?? holiday?.name ?? '')
    setError('')
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when another day opens
  }, [date])

  if (!date || !value) return null
  const past = date < new Date().toLocaleDateString('en-CA')
  const title = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(value)
  const normallyOpen = basePeriods.length > 0
  const opensExtra = !normallyOpen && choice !== 'closed'

  async function save(kind: Choice | 'default') {
    if (!date) return
    const periods: Period[] =
      kind === 'normal'
        ? basePeriods
        : kind === 'special'
          ? pause
            ? [
                { start, end: pause.start },
                { start: pause.end, end },
              ]
            : [{ start, end }]
          : []
    if (kind === 'special' && periods.some((period) => !(period.start < period.end)))
      return setError(
        pause
          ? 'Confira o intervalo: ele precisa caber dentro do horário.'
          : 'O fechamento precisa ser depois da abertura.',
      )
    setSaving(true)
    setError('')
    try {
      const saved = await guard((confirm) =>
        api.put('availability', {
          mode: 'override',
          date,
          ...(kind === 'default'
            ? { useDefault: true }
            : {
                isAvailable: kind !== 'closed',
                periods,
                reason: reason.trim() || undefined,
              }),
          ...confirmFlag(confirm),
        }),
      )
      // Went back from the list of affected clients: nothing was saved.
      if (saved === null) return
      onSaved(
        (kind === 'default'
          ? `${title}: voltou ao horário padrão.`
          : kind === 'closed'
            ? `${title}: fechado, ninguém consegue agendar.`
            : `${title}: aberto ${range(periods)}.`) + canceledNote(saved),
      )
      onClose()
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {dialog}
      <QuickModal
        isOpen
        onOpenChange={(open) => !open && onClose()}
        size="lg"
        className="dc"
        title={title.charAt(0).toUpperCase() + title.slice(1)}
        subtitle={
          normallyOpen
            ? `Padrão deste dia da semana: ${range(basePeriods)}.`
            : 'Normalmente o espaço não abre neste dia da semana.'
        }
        footer={
          canManage && !past ? (
            <>
              {override ? (
                <Button
                  variant="ghost"
                  className="qm-foot-start"
                  isDisabled={saving}
                  onPress={() => void save('default')}
                >
                  <Undo2 size={15} aria-hidden /> Voltar ao padrão
                </Button>
              ) : null}
              <Button variant="secondary" onPress={onClose}>
                Cancelar
              </Button>
              <Button
                isDisabled={saving || (choice === 'normal' && !normallyOpen)}
                onPress={() => void save(choice)}
              >
                {saving ? 'Salvando…' : 'Salvar este dia'}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onPress={onClose}>
              Fechar
            </Button>
          )
        }
      >
        {holiday || closures.length || override ? (
          <div className="dc-facts">
            {holiday ? (
              <span className="dc-fact is-holiday">
                <CalendarHeart size={15} aria-hidden /> {holiday.name} ·{' '}
                {holidayScopeLabel[holiday.scope]}
                {override ? '' : ' · ainda sem resposta'}
              </span>
            ) : null}
            {override ? (
              <span className="dc-fact is-special">
                <Clock3 size={15} aria-hidden />{' '}
                {override.is_available
                  ? `Configurado: ${range(override.periods)}`
                  : 'Configurado: fechado'}
              </span>
            ) : null}
            {closures.map((text) => (
              <button
                key={text}
                type="button"
                className="dc-fact is-away"
                disabled={!onOpenClosures}
                onClick={onOpenClosures}
              >
                <Palmtree size={15} aria-hidden /> {text}
              </button>
            ))}
          </div>
        ) : null}

        <div className="dc-choice" role="radiogroup" aria-label="Neste dia o espaço">
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'closed'}
            disabled={!canManage}
            onClick={() => setChoice('closed')}
          >
            <DoorClosed size={22} strokeWidth={1.75} aria-hidden />
            <strong>Não vamos atender</strong>
            <small>Fechado · ninguém agenda</small>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'normal'}
            disabled={!canManage || !normallyOpen}
            onClick={() => setChoice('normal')}
          >
            <DoorOpen size={22} strokeWidth={1.75} aria-hidden />
            <strong>Horário de sempre</strong>
            <small>{normallyOpen ? range(basePeriods) : 'Dia normalmente fechado'}</small>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={choice === 'special'}
            disabled={!canManage}
            onClick={() => setChoice('special')}
          >
            <Clock3 size={22} strokeWidth={1.75} aria-hidden />
            <strong>Horário personalizado</strong>
            <small>Só neste dia</small>
          </button>
        </div>

        {choice === 'special' ? (
          <div className="dc-hours">
            <div className="sch-range">
              <TimeInputField ariaLabel="Abre às" value={start} onChange={setStart} />
              <span>até</span>
              <TimeInputField ariaLabel="Fecha às" value={end} onChange={setEnd} />
            </div>
            {pause ? (
              <div className="sch-range is-break">
                <Coffee size={16} aria-hidden />
                <TimeInputField
                  ariaLabel="Intervalo começa às"
                  value={pause.start}
                  onChange={(value) => setPause({ ...pause, start: value })}
                />
                <span>até</span>
                <TimeInputField
                  ariaLabel="Intervalo termina às"
                  value={pause.end}
                  onChange={(value) => setPause({ ...pause, end: value })}
                />
                <Button size="sm" variant="ghost" onPress={() => setPause(null)}>
                  Sem intervalo
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="dc-add-break"
                onPress={() => setPause({ start: '12:00', end: '13:00' })}
              >
                <Coffee size={14} aria-hidden /> Adicionar intervalo
              </Button>
            )}
          </div>
        ) : null}

        {opensExtra ? (
          <p className="dc-note">
            Este dia vai aparecer para as clientes no site e no app, dentro do horário escolhido.
          </p>
        ) : null}

        <TextInputField
          label="Motivo (só a equipe vê)"
          maxLength={240}
          placeholder="Ex.: feriado, inventário, plantão de sábado"
          value={reason}
          isDisabled={!canManage}
          onChange={setReason}
        />
        {canManage ? null : (
          <p className="sch-note">Só quem gerencia o espaço pode configurar os dias.</p>
        )}
        {error ? (
          <p className="apt-error" role="alert">
            {error}
          </p>
        ) : null}
      </QuickModal>
    </>
  )
}

export type SpecialDay = {
  date: string
  kind: 'holiday' | 'closed' | 'special' | 'open' | 'away'
  title: string
  detail: string
}

/** The days with something different in the period shown, under the calendar. */
export function SpecialDays({
  days,
  onOpen,
}: {
  days: SpecialDay[]
  onOpen: (date: string) => void
}) {
  if (!days.length) return null
  return (
    <section className="dc-list" aria-label="Dias com horário personalizado">
      <h3>Dias especiais neste período</h3>
      <ul>
        {days.map((day) => {
          const value = new Date(`${day.date}T12:00:00`)
          return (
            <li key={`${day.date}-${day.kind}`} data-kind={day.kind}>
              <button type="button" onClick={() => onOpen(day.date)}>
                <time dateTime={day.date}>
                  <small>
                    {new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
                      .format(value)
                      .replace('.', '')}
                  </small>
                  <strong>{value.getDate()}</strong>
                  <small>
                    {new Intl.DateTimeFormat('pt-BR', { month: 'short' })
                      .format(value)
                      .replace('.', '')}
                  </small>
                </time>
                <span>
                  <strong>{day.title}</strong>
                  <small>{day.detail}</small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
