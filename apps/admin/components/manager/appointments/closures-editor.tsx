'use client'

import { Button, Spinner } from '@heroui/react'
import {
  BookOpen,
  Flower2,
  HeartPulse,
  Hammer,
  Palmtree,
  PartyPopper,
  Pencil,
  Plane,
  Store,
  Trash2,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { DateInputField, TextInputField } from '@/components/ui/fields'
import { dateBr, initials } from '../business/format'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { closureKinds, type BookingProfessional, type ClosureRow } from './booking-modal'
import { localDate } from './model'

const kindIcon: Record<string, LucideIcon> = {
  vacation: Palmtree,
  collective_vacation: Plane,
  bereavement: Flower2,
  maintenance: Wrench,
  renovation: Hammer,
  sick_leave: HeartPulse,
  training: BookOpen,
  event: PartyPopper,
  other: Store,
}
const spaceKinds = [
  'collective_vacation',
  'bereavement',
  'maintenance',
  'renovation',
  'event',
  'other',
]
const personKinds = ['vacation', 'sick_leave', 'training', 'bereavement', 'other']

const blank = (today: string) => ({
  id: '',
  who: 'clinic',
  kind: 'collective_vacation',
  startsOn: today,
  endsOn: today,
  note: '',
})

function days(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
}

/**
 * Férias e fechamentos por período: o espaço inteiro (férias coletivas, luto, manutenção…) ou
 * uma profissional (férias, licença, curso). Clientes não conseguem agendar no período; quem já
 * estava marcado continua na agenda para a gestora remarcar.
 */
export function ClosuresEditor({
  api,
  professionals,
  photos,
  canManageSpace,
  canManageTeam,
  onSaved,
}: {
  api: ClinicApi
  professionals: BookingProfessional[]
  /** Team photos already loaded by "Horários" (fallback for the agenda's own). */
  photos: Record<string, string | null | undefined>
  canManageSpace: boolean
  canManageTeam: boolean
  onSaved: (message: string) => void
}) {
  const today = localDate(new Date())
  const [rows, setRows] = useState<ClosureRow[] | null>(null)
  const [form, setForm] = useState(() => blank(today))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    void api
      .get<{ closures: ClosureRow[] }>('closures')
      .then((body) => active && setRows(body.closures))
      .catch(() => active && setError('Não foi possível carregar os fechamentos.'))
    return () => {
      active = false
    }
  }, [api, reload])

  const person = professionals.find((item) => item.id === form.who)
  const kinds = form.who === 'clinic' ? spaceKinds : personKinds
  const allowed = form.who === 'clinic' ? canManageSpace : canManageTeam
  const name = (id: string | null) =>
    id ? (professionals.find((item) => item.id === id)?.display_name ?? 'Profissional') : 'Espaço'

  function choose(who: string) {
    const nextKinds = who === 'clinic' ? spaceKinds : personKinds
    setForm((current) => ({
      ...current,
      who,
      kind: nextKinds.includes(current.kind) ? current.kind : nextKinds[0],
    }))
    setError('')
  }

  async function save() {
    if (!form.startsOn || !form.endsOn) return setError('Escolha o início e o fim.')
    if (form.endsOn < form.startsOn) return setError('O fim precisa ser no mesmo dia ou depois.')
    if (days(form.startsOn, form.endsOn) > 367) return setError('O período pode ter até um ano.')
    setSaving(true)
    setError('')
    setDone('')
    try {
      const body = {
        professionalId: form.who === 'clinic' ? null : form.who,
        startsOn: form.startsOn,
        endsOn: form.endsOn,
        kind: form.kind,
        note: form.note.trim() || undefined,
      }
      const result = await (form.id
        ? api.put<{ affectedAppointments: number }>(`closures/${form.id}`, body)
        : api.post<{ affectedAppointments: number }>('closures', body))
      const who =
        form.who === 'clinic'
          ? 'Espaço fechado'
          : `${person?.display_name ?? 'Profissional'} ausente`
      const affected = result.affectedAppointments
      const message = `${who} de ${dateBr(form.startsOn)} a ${dateBr(form.endsOn)}.${
        affected
          ? ` ${affected} ${affected === 1 ? 'atendimento já marcado continua' : 'atendimentos já marcados continuam'} na agenda — remarque se precisar.`
          : ''
      }`
      setDone(message)
      onSaved(message)
      setForm(blank(today))
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
      onSaved(message)
      if (form.id === row.id) setForm(blank(today))
      setReload((value) => value + 1)
    } catch {
      setError('Não foi possível remover.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sch-dates cl">
      <section className="sch-special">
        {professionals.length ? (
          <div className="sch-people" role="group" aria-label="Quem fica sem atender">
            <button
              type="button"
              aria-pressed={form.who === 'clinic'}
              onClick={() => choose('clinic')}
            >
              <span className="sch-face">
                <Store size={16} aria-hidden />
              </span>
              Espaço inteiro
            </button>
            {professionals.map((item) => {
              const photo = item.photo_url ?? photos[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={form.who === item.id}
                  onClick={() => choose(item.id)}
                >
                  <span className="sch-face">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- public team photo
                      <img src={photo} alt="" />
                    ) : (
                      initials(item.display_name)
                    )}
                  </span>
                  {item.display_name.split(' ')[0]}
                </button>
              )
            })}
          </div>
        ) : null}
        <div className="cl-kinds" role="radiogroup" aria-label="Motivo">
          {kinds.map((kind) => {
            const Icon = kindIcon[kind] ?? Store
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={form.kind === kind}
                onClick={() => setForm({ ...form, kind })}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden />
                {kind === 'other' ? 'Outro' : closureKinds[kind]}
              </button>
            )
          })}
        </div>
        <div className="cl-range">
          <DateInputField
            label="De"
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
            label="Até (inclusive)"
            value={form.endsOn}
            min={form.startsOn}
            onChange={(endsOn) => setForm({ ...form, endsOn })}
          />
        </div>
        <TextInputField
          label="Observação (só a equipe vê)"
          maxLength={240}
          placeholder={form.who === 'clinic' ? 'Ex.: reforma da recepção' : 'Ex.: volta dia 20'}
          value={form.note}
          onChange={(note) => setForm({ ...form, note })}
        />
        {allowed ? (
          <div className="sch-special-foot">
            {form.id ? (
              <Button variant="ghost" isDisabled={saving} onPress={() => setForm(blank(today))}>
                Cancelar edição
              </Button>
            ) : null}
            <Button isDisabled={saving} onPress={() => void save()}>
              {saving
                ? 'Salvando…'
                : `${form.id ? 'Salvar' : 'Marcar'} ${
                    form.startsOn && form.endsOn >= form.startsOn
                      ? `${days(form.startsOn, form.endsOn)} ${days(form.startsOn, form.endsOn) === 1 ? 'dia' : 'dias'}`
                      : 'período'
                  }`}
            </Button>
          </div>
        ) : (
          <p className="sch-note">
            {form.who === 'clinic'
              ? 'Só quem gerencia o espaço pode fechar por período.'
              : 'Só quem gerencia a equipe pode marcar férias da equipe.'}
          </p>
        )}
      </section>
      <section className="sch-list" aria-label="Períodos marcados">
        <h3>Períodos marcados</h3>
        {!rows ? (
          error ? null : (
            <div className="ws-loading" role="status">
              <Spinner size="sm" aria-hidden /> Carregando…
            </div>
          )
        ) : rows.length ? (
          <ul>
            {rows.map((row) => {
              const Icon = kindIcon[row.kind] ?? Store
              const past = row.ends_on < today
              const canEdit = row.professional_id ? canManageTeam : canManageSpace
              return (
                <li key={row.id} className={past ? 'is-past' : 'is-closed'}>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() =>
                      setForm({
                        id: row.id,
                        who: row.professional_id ?? 'clinic',
                        kind: row.kind,
                        startsOn: row.starts_on,
                        endsOn: row.ends_on,
                        note: row.note ?? '',
                      })
                    }
                  >
                    <strong>
                      <Icon size={15} aria-hidden /> {name(row.professional_id)} ·{' '}
                      {closureKinds[row.kind] ?? 'Fechado'}
                    </strong>
                    <span>
                      {row.starts_on === row.ends_on
                        ? dateBr(row.starts_on)
                        : `${dateBr(row.starts_on)} a ${dateBr(row.ends_on)}`}
                      {row.note ? ` · ${row.note}` : ''}
                      {past ? ' · encerrado' : ''}
                    </span>
                  </button>
                  {canEdit ? (
                    <span className="cl-row-tools">
                      <Pencil size={14} aria-hidden />
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
            })}
          </ul>
        ) : (
          <p className="sch-note">
            Nenhum período marcado. Férias da equipe, recesso, luto ou manutenção aparecem aqui e
            bloqueiam o agendamento das clientes.
          </p>
        )}
      </section>
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="apt-done" role="status">
          {done}
        </p>
      ) : null}
    </div>
  )
}
