'use client'

import { Button, Spinner } from '@heroui/react'
import { ArrowLeft, Check, Pencil, Plus, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DateInputField, TextInputField } from '@/components/ui/fields'
import { professionalAvatar } from '@/components/onboarding/model'
import { dateBr } from '../business/format'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { closureKinds, type BookingProfessional, type ClosureRow } from './booking-modal'
import { canceledNote, confirmFlag, useCancellationGuard } from './cancellation-guard'
import { localDate } from './model'

export const closureEmoji: Record<string, string> = {
  vacation: '🌴',
  collective_vacation: '✈️',
  bereavement: '🕊️',
  maintenance: '🔧',
  renovation: '🔨',
  sick_leave: '🩺',
  training: '📚',
  event: '🎉',
  other: '📌',
}
const spaceKinds = [
  'collective_vacation',
  'maintenance',
  'renovation',
  'event',
  'bereavement',
  'other',
]
const personKinds = ['vacation', 'sick_leave', 'training', 'bereavement', 'other']
/** People away: needs vacation:manage (mirrors luminix.closure_permission). */
const vacationKinds = new Set(['vacation', 'collective_vacation', 'sick_leave', 'bereavement'])

type Step = 'who' | 'kind' | 'when' | 'note'
type Form = {
  id: string
  who: string
  kind: string
  startsOn: string
  endsOn: string
  note: string
}

function count(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
}
function shift(date: string, amount: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + amount)
  return value.toISOString().slice(0, 10)
}
const period = (from: string, to: string) =>
  from === to ? dateBr(from) : `${dateBr(from)} a ${dateBr(to)}`

/**
 * Férias e fechamentos por período: o espaço inteiro (férias coletivas, luto, manutenção…) ou
 * uma profissional (férias, licença, curso). Uma visão do que está planejado e, para registrar,
 * uma pergunta por vez (quem, motivo, quando, observação) com as respostas em destaque.
 * Clientes não conseguem agendar no período; quem já estava marcado continua na agenda.
 */
export function ClosuresEditor({
  api,
  professionals,
  photos,
  canManageSchedule,
  canManageVacations,
  onSaved,
  professionalId,
}: {
  api: ClinicApi
  professionals: BookingProfessional[]
  /** Team photos already loaded by "Horários" (fallback for the agenda's own). */
  photos: Record<string, string | null | undefined>
  /** Closures that are not people away (maintenance, event, course…): schedule:manage. */
  canManageSchedule: boolean
  /** Vacations and leaves (luminix.closure_permission): vacation:manage. */
  canManageVacations: boolean
  onSaved: (message: string) => void
  /** Only this professional's periods (Configurações → Equipe), with the full history. */
  professionalId?: string
}) {
  const today = localDate(new Date())
  const solo = !professionals.length || Boolean(professionalId)
  const blank = (): Form => ({
    id: '',
    who: professionalId ?? 'clinic',
    kind: professionalId ? 'vacation' : 'collective_vacation',
    startsOn: today,
    endsOn: today,
    note: '',
  })
  const [rows, setRows] = useState<ClosureRow[] | null>(null)
  const [form, setForm] = useState<Form>(blank)
  const [step, setStep] = useState<Step | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [undo, setUndo] = useState<ClosureRow | null>(null)
  const [reload, setReload] = useState(0)
  const [showPast, setShowPast] = useState(false)
  const { guard, dialog } = useCancellationGuard()

  useEffect(() => {
    let active = true
    void api
      .get<{ closures: ClosureRow[] }>(
        'closures',
        professionalId ? { professionalId, history: '1' } : undefined,
      )
      .then((body) => active && setRows(body.closures))
      .catch(() => active && setError('Não foi possível carregar os fechamentos.'))
    return () => {
      active = false
    }
  }, [api, reload, professionalId])

  const person = professionals.find((item) => item.id === form.who)
  const allowed = (kind: string) =>
    vacationKinds.has(kind) ? canManageVacations : canManageSchedule
  const kinds = (form.who === 'clinic' ? spaceKinds : personKinds).filter(allowed)
  const name = (id: string | null) =>
    id ? (professionals.find((item) => item.id === id)?.display_name ?? 'Profissional') : 'Espaço'
  const photo = (id: string) => {
    const item = professionals.find((entry) => entry.id === id)
    return professionalAvatar(item?.photo_url ?? photos[id], item?.gender)
  }
  const steps: Step[] = solo ? ['kind', 'when', 'note'] : ['who', 'kind', 'when', 'note']
  const position = step ? steps.indexOf(step) : -1
  const list = (rows ?? []).filter(
    (row) => !professionalId || row.professional_id === professionalId,
  )
  const now = list.filter((row) => row.starts_on <= today && row.ends_on >= today)
  const next = list.filter((row) => row.starts_on > today)
  const past = list.filter((row) => row.ends_on < today).reverse()

  function start(values?: Form) {
    setForm(values ?? blank())
    setStep(values ? 'when' : steps[0])
    setError('')
    setDone('')
    setUndo(null)
  }
  function advance() {
    setError('')
    if (step === 'when') {
      if (!form.startsOn || !form.endsOn) return setError('Escolha o início e o fim.')
      if (form.endsOn < form.startsOn) return setError('O fim precisa ser no mesmo dia ou depois.')
      if (count(form.startsOn, form.endsOn) > 367) return setError('O período pode ter até um ano.')
    }
    setStep(steps[position + 1] ?? step)
  }

  async function save() {
    if (!allowed(form.kind))
      return setError(
        vacationKinds.has(form.kind)
          ? 'Seu acesso não permite lançar férias ou afastamentos.'
          : 'Seu acesso não permite fechar o espaço ou mudar horários.',
      )
    setSaving(true)
    setError('')
    try {
      const body = {
        professionalId: form.who === 'clinic' ? null : form.who,
        startsOn: form.startsOn,
        endsOn: form.endsOn,
        kind: form.kind,
        note: form.note.trim() || undefined,
      }
      // Clients with a time inside the period are listed first and canceled on confirm.
      const result = await guard((confirm) =>
        form.id
          ? api.put<{ canceledAppointments: number }>(`closures/${form.id}`, {
              ...body,
              ...confirmFlag(confirm),
            })
          : api.post<{ canceledAppointments: number }>('closures', {
              ...body,
              ...confirmFlag(confirm),
            }),
      )
      if (result === null) return
      const who =
        form.who === 'clinic'
          ? 'Espaço fechado'
          : `${person?.display_name ?? 'Profissional'} ausente`
      const message = `${who} de ${period(form.startsOn, form.endsOn)}.${canceledNote(result)}`
      setDone(message)
      onSaved(message)
      setStep(null)
      setForm(blank())
      setReload((value) => value + 1)
    } catch (caught) {
      setError(
        caught instanceof ClinicApiError && caught.status === 403
          ? 'Seu acesso não permite mudar este período.'
          : 'Não foi possível salvar o período.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function remove(row: ClosureRow) {
    setSaving(true)
    setError('')
    try {
      await api.post(`closures/${row.id}/remove`, {})
      const message = `${closureKinds[row.kind] ?? 'Período'} de ${name(row.professional_id)} removido.`
      setDone(message)
      setUndo(row)
      onSaved(message)
      setReload((value) => value + 1)
    } catch {
      setError('Não foi possível remover.')
    } finally {
      setSaving(false)
    }
  }

  /** Puts a removed period back as it was. */
  async function restore(row: ClosureRow) {
    setSaving(true)
    setError('')
    try {
      const result = await guard((confirm) =>
        api.post('closures', {
          professionalId: row.professional_id,
          startsOn: row.starts_on,
          endsOn: row.ends_on,
          kind: row.kind,
          note: row.note ?? undefined,
          ...confirmFlag(confirm),
        }),
      )
      if (result === null) return
      const message = `${closureKinds[row.kind] ?? 'Período'} de ${name(row.professional_id)} voltou.${canceledNote(result)}`
      setDone(message)
      setUndo(null)
      onSaved(message)
      setReload((value) => value + 1)
    } catch {
      setError('Não foi possível desfazer.')
    } finally {
      setSaving(false)
    }
  }

  const renderCard = (row: ClosureRow) => {
    const ended = row.ends_on < today
    const ongoing = !ended && row.starts_on <= today
    const canEdit = allowed(row.kind)
    const total = count(row.starts_on, row.ends_on)
    const left = ongoing ? count(today, row.ends_on) : 0
    return (
      <li key={row.id} className={`cw-item${ended ? ' is-past' : ongoing ? ' is-now' : ''}`}>
        <span className="cw-emoji" aria-hidden>
          {closureEmoji[row.kind] ?? '📌'}
        </span>
        <div className="cw-item-copy">
          <strong>
            {professionalId ? '' : `${name(row.professional_id)} · `}
            {closureKinds[row.kind] ?? 'Fechado'}
          </strong>
          <small>
            {period(row.starts_on, row.ends_on)} · {total} {total === 1 ? 'dia' : 'dias'}
            {ongoing ? ` · ${left === 1 ? 'último dia' : `faltam ${left} dias`}` : ''}
            {row.note ? ` · ${row.note}` : ''}
          </small>
        </div>
        {canEdit && !ended ? (
          <span className="cw-item-tools">
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Editar período"
              isDisabled={saving}
              onPress={() =>
                start({
                  id: row.id,
                  who: row.professional_id ?? 'clinic',
                  kind: row.kind,
                  startsOn: row.starts_on,
                  endsOn: row.ends_on,
                  note: row.note ?? '',
                })
              }
            >
              <Pencil size={15} />
            </Button>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Remover período"
              isDisabled={saving}
              onPress={() => void remove(row)}
            >
              <Trash2 size={15} />
            </Button>
          </span>
        ) : null}
      </li>
    )
  }

  const answers = [
    !solo && position > steps.indexOf('who')
      ? {
          step: 'who' as Step,
          text: form.who === 'clinic' ? '🏠 Espaço inteiro' : `👤 ${person?.display_name ?? ''}`,
        }
      : null,
    position > steps.indexOf('kind')
      ? {
          step: 'kind' as Step,
          text: `${closureEmoji[form.kind]} ${closureKinds[form.kind]}`,
        }
      : null,
    position > steps.indexOf('when')
      ? {
          step: 'when' as Step,
          text: `📅 ${period(form.startsOn, form.endsOn)} · ${count(form.startsOn, form.endsOn)} ${count(form.startsOn, form.endsOn) === 1 ? 'dia' : 'dias'}`,
        }
      : null,
  ].filter((item): item is { step: Step; text: string } => Boolean(item))

  return (
    <div className="cw">
      {dialog}
      {step ? (
        <section className="cw-wizard" aria-label="Registrar período sem atendimento">
          <header className="cw-wizard-head">
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Voltar"
              onPress={() => (position > 0 ? setStep(steps[position - 1]) : setStep(null))}
            >
              <ArrowLeft size={16} />
            </Button>
            <span>
              {form.id ? 'Editando período' : 'Novo período'} · etapa {position + 1} de{' '}
              {steps.length}
            </span>
            <div className="cw-dots" aria-hidden>
              {steps.map((item, index) => (
                <i key={item} data-on={index <= position || undefined} />
              ))}
            </div>
          </header>
          {answers.length ? (
            <div className="cw-answers">
              {answers.map((answer) => (
                <button key={answer.step} type="button" onClick={() => setStep(answer.step)}>
                  {answer.text}
                  <Pencil size={12} aria-hidden />
                </button>
              ))}
            </div>
          ) : null}

          {step === 'who' ? (
            <>
              <h3>Quem vai ficar sem atender?</h3>
              <div className="cw-options is-people">
                <button
                  type="button"
                  aria-pressed={form.who === 'clinic'}
                  onClick={() => {
                    setForm({
                      ...form,
                      who: 'clinic',
                      kind: spaceKinds.includes(form.kind) ? form.kind : spaceKinds[0],
                    })
                    setStep('kind')
                  }}
                >
                  <span className="cw-big">🏠</span>
                  <strong>Espaço inteiro</strong>
                  <small>Ninguém agenda</small>
                </button>
                {professionals.map((item) => {
                  const face = photo(item.id)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={form.who === item.id}
                      onClick={() => {
                        setForm({
                          ...form,
                          who: item.id,
                          kind: personKinds.includes(form.kind) ? form.kind : personKinds[0],
                        })
                        setStep('kind')
                      }}
                    >
                      <span className="sch-face cw-face">
                        {/* eslint-disable-next-line @next/next/no-img-element -- public team photo */}
                        <img src={face} alt="" />
                      </span>
                      <strong>{item.display_name.split(' ')[0]}</strong>
                      <small>Só a própria agenda</small>
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}

          {step === 'kind' ? (
            <>
              <h3>Qual o motivo?</h3>
              <div className="cw-options">
                {kinds.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={form.kind === kind}
                    onClick={() => {
                      setForm({ ...form, kind })
                      setStep('when')
                    }}
                  >
                    <span className="cw-big">{closureEmoji[kind]}</span>
                    <strong>{closureKinds[kind]}</strong>
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {step === 'when' ? (
            <>
              <h3>Quando?</h3>
              <div className="cl-range">
                <DateInputField
                  label="Começa em"
                  min={today}
                  value={form.startsOn}
                  onChange={(startsOn) =>
                    setForm({
                      ...form,
                      startsOn,
                      endsOn: form.endsOn < startsOn ? startsOn : form.endsOn,
                    })
                  }
                />
                <DateInputField
                  label="Último dia sem atender"
                  value={form.endsOn}
                  min={form.startsOn > today ? form.startsOn : today}
                  onChange={(endsOn) => setForm({ ...form, endsOn })}
                />
              </div>
              <div className="biz-chips" role="group" aria-label="Duração rápida">
                {[
                  [1, 'Só 1 dia'],
                  [7, '1 semana'],
                  [15, '15 dias'],
                  [30, '30 dias'],
                ].map(([amount, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={
                      Boolean(form.startsOn) &&
                      form.endsOn === shift(form.startsOn, Number(amount) - 1)
                    }
                    onClick={() =>
                      form.startsOn &&
                      setForm({ ...form, endsOn: shift(form.startsOn, Number(amount) - 1) })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="cw-next">
                <Button onPress={advance}>Continuar</Button>
              </div>
            </>
          ) : null}

          {step === 'note' ? (
            <>
              <h3>Quer deixar um recado para a equipe?</h3>
              <TextInputField
                ariaLabel="Observação (só a equipe vê)"
                maxLength={240}
                placeholder={
                  form.who === 'clinic' ? 'Ex.: reforma da recepção' : 'Ex.: volta dia 20'
                }
                description="Opcional. Só a equipe vê."
                value={form.note}
                onChange={(note) => setForm({ ...form, note })}
              />
              <p className="cw-summary">
                {closureEmoji[form.kind]}{' '}
                <strong>
                  {form.who === 'clinic' ? 'Espaço inteiro' : (person?.display_name ?? '')}
                </strong>{' '}
                sem atender de <strong>{period(form.startsOn, form.endsOn)}</strong>. As clientes
                não conseguem agendar nesses dias; quem já estava marcado continua na agenda.
              </p>
              <div className="cw-next">
                <Button variant="secondary" onPress={() => setStep(null)}>
                  Cancelar
                </Button>
                <Button isDisabled={saving} onPress={() => void save()}>
                  <Check size={16} aria-hidden />{' '}
                  {saving ? 'Salvando…' : form.id ? 'Salvar mudanças' : 'Confirmar'}
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : (
        <>
          {canManageSchedule || canManageVacations ? (
            <button type="button" className="cw-add" onClick={() => start()}>
              <span aria-hidden>
                <Plus size={20} />
              </span>
              <span>
                <strong>
                  {professionalId
                    ? 'Registrar férias ou afastamento'
                    : 'Registrar férias ou fechamento'}
                </strong>
                <small>
                  {professionalId
                    ? 'Férias, licença, curso… a agenda fecha nesses dias.'
                    : 'Férias da equipe, recesso, reforma, luto… uma pergunta por vez.'}
                </small>
              </span>
            </button>
          ) : null}
          {!rows ? (
            error ? null : (
              <div className="ws-loading" role="status">
                <Spinner size="sm" aria-hidden /> Carregando…
              </div>
            )
          ) : now.length || next.length ? (
            <>
              {now.length ? (
                <section className="cw-group">
                  <h3>🔴 Acontecendo agora</h3>
                  <ul>{now.map((row) => renderCard(row))}</ul>
                </section>
              ) : null}
              {next.length ? (
                <section className="cw-group">
                  <h3>🗓️ Planejados</h3>
                  <ul>{next.map((row) => renderCard(row))}</ul>
                </section>
              ) : null}
            </>
          ) : (
            <p className="cw-empty">
              <span aria-hidden>☀️</span>
              {professionalId
                ? 'Nenhuma férias ou afastamento planejado.'
                : 'Nenhum período sem atendimento planejado. Todo mundo trabalhando!'}
            </p>
          )}
          {past.length ? (
            <section className="cw-group is-history">
              <button type="button" onClick={() => setShowPast(!showPast)}>
                📜 Histórico ({past.length}) {showPast ? '— ocultar' : '— ver'}
              </button>
              {showPast ? <ul>{past.map((row) => renderCard(row))}</ul> : null}
            </section>
          ) : null}
        </>
      )}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="apt-done cw-done" role="status">
          {done}
          {undo ? (
            <Button
              size="sm"
              variant="ghost"
              isDisabled={saving}
              onPress={() => void restore(undo)}
            >
              <Undo2 size={14} aria-hidden /> Desfazer
            </Button>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}
