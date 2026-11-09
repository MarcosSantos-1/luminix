'use client'

import { Button, Spinner, Switch, Label } from '@heroui/react'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Coffee,
  Copy,
  HandHeart,
  ImagePlus,
  KeyRound,
  Plus,
  Scissors,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import Image from 'next/image'
import { useMemo, useRef, useState } from 'react'
import { TimePicker } from '@/components/onboarding/time-picker'
import { CheckboxField, ComboField, SelectField } from '@/components/ui/fields'
import '@/app/c/[clinicId]/onboarding/onboarding.css'
import { roleLabel } from '@/lib/access'
import { ClinicApiError, useClinicApi, useClinicResource, type ClinicApi } from './clinic-api'
import {
  Empty,
  HelpTip,
  LoadError,
  SaveBar,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
  TextInput,
  type SaveState,
} from './settings-kit'

type Period = { start: string; end: string }
type Day = { weekday: number; enabled: boolean; start: string; end: string; breaks: Period[] }
type Audience = 'all' | 'women' | 'men'
export type Professional = {
  id: string
  name: string
  role: string
  gender: 'female' | 'male'
  audience: Audience
  membershipId: string | null
  photoAssetId: string
  photoUrl: string | null
  serviceIds: string[]
  serviceAudiences: Record<string, Audience>
  days: Day[]
}
type TeamResponse = {
  selfMembershipId: string
  clinicHours: Day[]
  services: { id: string; name: string; category: string; sensitive: boolean; audience: Audience }[]
  professionals: Professional[]
}
type Member = { id: string; name: string; email: string; role: string; status: string }

const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const shortDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const roleSuggestions = [
  'Cabeleireira',
  'Manicure',
  'Esteticista',
  'Maquiadora',
  'Designer de sobrancelhas',
  'Lash designer',
  'Massoterapeuta',
  'Barbeiro',
  'Depiladora',
  'Tatuadora',
]
const audienceOptions: { id: Audience; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'women', label: 'Só mulheres' },
  { id: 'men', label: 'Só homens' },
]

function avatar(person: Pick<Professional, 'photoUrl' | 'gender'>) {
  return person.photoUrl ?? `/brand/onboarding/avatar${person.gender === 'male' ? 'M' : 'F'}.png`
}

/** "Seg a Sex · 09:00–18:00" style summary for the cards. */
function weekSummary(days: Day[]) {
  const open = days.filter((day) => day.enabled)
  if (!open.length) return 'Sem dias de atendimento'
  const sameHours = open.every((day) => day.start === open[0].start && day.end === open[0].end)
  const names = open.map((day) => shortDays[day.weekday])
  const consecutive =
    open.length > 2 &&
    open.every((day, index) => !index || day.weekday === open[index - 1].weekday + 1)
  const label = consecutive ? `${names[0]} a ${names.at(-1)}` : names.join(', ')
  return sameHours ? `${label} · ${open[0].start}–${open[0].end}` : label
}

function clinicRange(day: Day | undefined) {
  return day?.enabled ? `${day.start}–${day.end}` : null
}

function dayProblem(day: Day, clinic: Day | undefined) {
  if (!day.enabled) return ''
  if (!clinic?.enabled) return 'O espaço está fechado neste dia.'
  if (day.start >= day.end) return 'O fim precisa ser depois do início.'
  if (day.start < clinic.start || day.end > clinic.end)
    return `Precisa ficar dentro do horário do espaço (${clinic.start}–${clinic.end}).`
  let cursor = day.start
  for (const pause of [...day.breaks].sort((a, b) => a.start.localeCompare(b.start))) {
    if (pause.start < cursor || pause.end <= pause.start || pause.end > day.end)
      return 'A pausa precisa ficar dentro do horário de atendimento.'
    cursor = pause.end
  }
  return ''
}

export function TeamSettings({
  clinicId,
  ownName,
  canManageAccess,
}: {
  clinicId: string
  ownName: string
  canManageAccess: boolean
}) {
  const api = useClinicApi(clinicId)
  const team = useClinicResource<TeamResponse>(api, 'team')
  const [editing, setEditing] = useState<Professional | null>(null)
  const [notice, setNotice] = useState('')

  if (team.error && !team.data) return <LoadError message={team.error} onRetry={team.reload} />
  if (!team.data) return <SettingsSkeleton cards={2} />
  const data = team.data
  const selfLinked = data.professionals.some(
    (person) => person.membershipId === data.selfMembershipId,
  )
  const blank = (name = '', membershipId: string | null = null): Professional => ({
    id: crypto.randomUUID(),
    name,
    role: '',
    gender: 'female',
    audience: 'all',
    membershipId,
    photoAssetId: '',
    photoUrl: null,
    serviceIds: [],
    serviceAudiences: {},
    days: data.clinicHours.map((day) => ({ ...day, breaks: [...day.breaks] })),
  })

  if (editing)
    return (
      <ProfessionalEditor
        key={editing.id}
        api={api}
        data={data}
        initial={editing}
        isNew={!data.professionals.some((person) => person.id === editing.id)}
        canManageAccess={canManageAccess}
        onClose={(message) => {
          setEditing(null)
          if (message) {
            setNotice(message)
            team.reload()
          }
        }}
      />
    )

  return (
    <div className="settings-stack">
      {!selfLinked ? (
        <SettingsCard
          className="team-self-card"
          icon={<HandHeart size={20} />}
          title="Você também atende?"
          description="Se você também faz atendimentos, entre na equipe. Assim seus horários aparecem na agenda e as clientes podem marcar com você."
        >
          <div className="team-self-actions">
            <Button onPress={() => setEditing(blank(ownName, data.selfMembershipId))}>
              <HandHeart size={16} aria-hidden /> Sim, eu também atendo
            </Button>
            <span className="settings-field-hint">Foto é opcional. Dá para mudar depois.</span>
          </div>
        </SettingsCard>
      ) : null}

      <SettingsCard
        icon={<UsersRound size={20} />}
        title="Profissionais"
        description="Quem atende no espaço, o que faz e em quais dias e horários."
        help={{
          title: 'Equipe é o mesmo que acesso ao sistema?',
          text: 'Não. Aqui ficam as pessoas que atendem clientes. Quem entra no painel (como a recepção) é cadastrado em Acessos e logins. Uma profissional pode ter as duas coisas.',
        }}
        badge={<StatusPill tone="info">{data.professionals.length}</StatusPill>}
      >
        {notice ? (
          <p className="team-notice" role="status">
            <Check size={16} aria-hidden /> {notice}
          </p>
        ) : null}
        <ul className="team-grid">
          {data.professionals.map((person) => (
            <li key={person.id}>
              <button type="button" className="team-card" onClick={() => setEditing(person)}>
                <Image src={avatar(person)} alt="" width={56} height={56} unoptimized />
                <span className="team-card-copy">
                  <strong>{person.name}</strong>
                  <span>{person.role || 'Função não informada'}</span>
                  <small>
                    <CalendarClock size={13} aria-hidden /> {weekSummary(person.days)}
                  </small>
                  <small>
                    <Scissors size={13} aria-hidden /> {person.serviceIds.length}{' '}
                    {person.serviceIds.length === 1 ? 'serviço' : 'serviços'}
                  </small>
                </span>
                <span className="team-card-tags">
                  {person.membershipId === data.selfMembershipId ? (
                    <StatusPill tone="on">Você</StatusPill>
                  ) : person.membershipId ? (
                    <StatusPill tone="info">
                      <KeyRound size={12} aria-hidden /> Tem login
                    </StatusPill>
                  ) : null}
                  <span className="team-card-edit">Editar</span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="team-card is-add" onClick={() => setEditing(blank())}>
              <span className="team-add-icon" aria-hidden>
                <Plus size={26} />
              </span>
              <strong>Adicionar profissional</strong>
              <small>Nome, serviços e horários</small>
            </button>
          </li>
        </ul>
      </SettingsCard>
    </div>
  )
}

function ProfessionalEditor({
  api,
  data,
  initial,
  isNew,
  canManageAccess,
  onClose,
}: {
  api: ClinicApi
  data: TeamResponse
  initial: Professional
  isNew: boolean
  canManageAccess: boolean
  onClose: (message?: string) => void
}) {
  const [person, setPerson] = useState(initial)
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const [uploading, setUploading] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const staffApi = useMemo(
    () => (canManageAccess ? api : { ...api, ready: false }),
    [api, canManageAccess],
  )
  const members = useClinicResource<{ members: Member[] }>(staffApi, 'staff')
  const isSelf = person.membershipId === data.selfMembershipId && person.membershipId !== null
  const set = (patch: Partial<Professional>) => {
    setPerson((current) => ({ ...current, ...patch }))
    if (state.status !== 'saving') setState({ status: 'idle' })
  }
  const setDay = (weekday: number, patch: Partial<Day>) =>
    set({ days: person.days.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)) })
  const categories = useMemo(() => {
    const groups = new Map<string, TeamResponse['services']>()
    for (const service of data.services)
      groups.set(service.category, [...(groups.get(service.category) ?? []), service])
    return [...groups]
  }, [data.services])
  const problems = person.days.map((day) => dayProblem(day, data.clinicHours[day.weekday]))
  const nameError = !person.name.trim() ? 'Escreva o nome da profissional.' : ''
  const dirty = JSON.stringify(person) !== JSON.stringify(initial)

  async function upload(selected: File) {
    setUploading(true)
    try {
      const asset = await api.upload('professional_photo', selected, person.id)
      set({ photoAssetId: asset.id, photoUrl: asset.url })
    } catch (cause) {
      setState({
        status: 'error',
        message: cause instanceof Error ? cause.message : 'Não foi possível enviar a foto.',
      })
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (nameError || problems.some(Boolean)) {
      setShowErrors(true)
      setState({ status: 'error', message: 'Confira os campos marcados antes de salvar.' })
      return
    }
    setState({ status: 'saving' })
    try {
      await api.put(`team/${person.id}`, {
        name: person.name.trim(),
        role: person.role.trim(),
        gender: person.gender,
        audience: person.audience,
        photoAssetId: person.photoAssetId,
        membershipId: person.membershipId,
        serviceIds: person.serviceIds,
        serviceAudiences: Object.fromEntries(
          Object.entries(person.serviceAudiences).filter(([id]) => person.serviceIds.includes(id)),
        ),
        days: person.days.map((day) => ({
          ...day,
          breaks: day.enabled ? day.breaks : [],
        })),
      })
      onClose(isNew ? `${person.name.trim()} entrou na equipe!` : 'Alterações salvas!')
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof ClinicApiError && error.status === 409
            ? 'Esse login já está ligado a outra profissional.'
            : 'Não foi possível salvar. Confira os horários e tente de novo.',
      })
    }
  }

  async function archive() {
    setState({ status: 'saving' })
    try {
      await api.post(`team/${person.id}/archive`, {})
      onClose(`${person.name} saiu da equipe. Os atendimentos antigos continuam no histórico.`)
    } catch {
      setConfirmArchive(false)
      setState({
        status: 'error',
        message: 'Não foi possível remover. O espaço precisa ter pelo menos uma profissional.',
      })
    }
  }

  const linkOptions = (members.data?.members ?? []).filter((member) => member.status === 'active')

  return (
    <div className="settings-stack">
      <div className="team-editor-head">
        <Button variant="secondary" onPress={() => onClose()}>
          <ArrowLeft size={16} aria-hidden /> Voltar para a equipe
        </Button>
        <h3>
          {isNew ? (isSelf ? 'Você na equipe' : 'Nova profissional') : `Editar ${initial.name}`}
        </h3>
      </div>

      <SettingsCard icon={<UserRound size={20} />} title="Quem é">
        <div className="settings-identity">
          <div className="settings-logo">
            <button
              type="button"
              className="settings-logo-frame is-round"
              onClick={() => file.current?.click()}
              disabled={uploading}
              aria-label={person.photoUrl ? 'Trocar foto' : 'Enviar foto'}
            >
              {uploading ? (
                <Spinner aria-label="Enviando foto" />
              ) : (
                <Image src={avatar(person)} alt="" width={120} height={120} unoptimized />
              )}
            </button>
            <input
              ref={file}
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const selected = event.target.files?.[0]
                event.target.value = ''
                if (selected) void upload(selected)
              }}
            />
            <div className="settings-logo-actions">
              <Button size="sm" variant="secondary" onPress={() => file.current?.click()}>
                <ImagePlus size={15} aria-hidden />{' '}
                {person.photoUrl ? 'Trocar foto' : 'Foto (opcional)'}
              </Button>
              {person.photoUrl ? (
                <Button
                  size="sm"
                  variant="ghost"
                  isIconOnly
                  aria-label="Tirar foto"
                  onPress={() => set({ photoAssetId: '', photoUrl: null })}
                >
                  <Trash2 size={15} aria-hidden />
                </Button>
              ) : null}
            </div>
          </div>
          <div className="settings-grid">
            <TextInput
              label="Nome"
              value={person.name}
              required
              maxLength={160}
              error={showErrors ? nameError : undefined}
              hint="Como as clientes vão ver na agenda."
              onChange={(name) => set({ name })}
            />
            <ComboField
              label="Função"
              value={person.role}
              maxLength={120}
              placeholder="Ex.: Cabeleireira"
              suggestions={roleSuggestions}
              onChange={(role) => set({ role })}
            />
            <div className="settings-field">
              <span className="settings-field-label">
                <label>Imagem padrão (sem foto)</label>
              </span>
              <div className="team-choice" role="radiogroup" aria-label="Imagem padrão">
                {(['female', 'male'] as const).map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    role="radio"
                    aria-checked={person.gender === gender}
                    onClick={() => set({ gender })}
                  >
                    <Image
                      src={`/brand/onboarding/avatar${gender === 'male' ? 'M' : 'F'}.png`}
                      alt=""
                      width={28}
                      height={28}
                    />
                    {gender === 'male' ? 'Masculina' : 'Feminina'}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-field">
              <span className="settings-field-label">
                <label>Atende</label>
                <HelpTip title="Para que serve?">
                  Ajuda a mostrar a profissional certa para cada cliente. Use “Todos” se ela atende
                  qualquer pessoa.
                </HelpTip>
              </span>
              <div className="team-choice" role="radiogroup" aria-label="Público atendido">
                {audienceOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={person.audience === option.id}
                    onClick={() => set({ audience: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        icon={<Scissors size={20} />}
        title="Serviços que faz"
        description="Marque o que essa pessoa atende. Só esses serviços aparecem na agenda dela."
        badge={<StatusPill tone="info">{person.serviceIds.length} marcados</StatusPill>}
      >
        {categories.length ? (
          <div className="team-services">
            {categories.map(([category, services]) => {
              const all = services.every((service) => person.serviceIds.includes(service.id))
              return (
                <fieldset key={category}>
                  <legend>
                    {category}
                    <button
                      type="button"
                      className="team-link"
                      onClick={() =>
                        set({
                          serviceIds: all
                            ? person.serviceIds.filter((id) => !services.some((s) => s.id === id))
                            : [...new Set([...person.serviceIds, ...services.map((s) => s.id)])],
                        })
                      }
                    >
                      {all ? 'Desmarcar todos' : 'Marcar todos'}
                    </button>
                  </legend>
                  {services.map((service) => {
                    const checked = person.serviceIds.includes(service.id)
                    return (
                      <div key={service.id} className="team-service">
                        <CheckboxField
                          label={service.name}
                          isSelected={checked}
                          onChange={() =>
                            set({
                              serviceIds: checked
                                ? person.serviceIds.filter((id) => id !== service.id)
                                : [...person.serviceIds, service.id],
                            })
                          }
                        />
                        {checked && service.sensitive ? (
                          <SelectField
                            className="team-audience"
                            ariaLabel={`Público de ${service.name}`}
                            value={person.serviceAudiences[service.id] ?? service.audience}
                            options={audienceOptions.map((option) => ({
                              id: option.id,
                              label: option.label,
                            }))}
                            onChange={(audience) =>
                              set({
                                serviceAudiences: {
                                  ...person.serviceAudiences,
                                  [service.id]: audience as Audience,
                                },
                              })
                            }
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </fieldset>
              )
            })}
          </div>
        ) : (
          <Empty>O espaço ainda não tem serviços.</Empty>
        )}
      </SettingsCard>

      <SettingsCard
        icon={<CalendarClock size={20} />}
        title="Dias e horários"
        description="Quando essa pessoa atende. Precisa ficar dentro do horário do espaço."
        help={{
          title: 'E folgas ou férias?',
          text: 'Aqui fica a semana normal. Folgas de um dia específico ficam na Agenda, em Horários. Em breve será possível marcar férias por profissional.',
        }}
      >
        <Button
          size="sm"
          variant="secondary"
          onPress={() =>
            set({ days: data.clinicHours.map((day) => ({ ...day, breaks: [...day.breaks] })) })
          }
        >
          <Copy size={14} aria-hidden /> Usar o mesmo horário do espaço
        </Button>
        <div className="ob2 manager-ob2 team-week">
          {person.days.map((day) => {
            const clinic = data.clinicHours[day.weekday]
            const problem = showErrors || day.enabled ? problems[day.weekday] : ''
            const pause = day.breaks[0]
            return (
              <div key={day.weekday} className={`team-day${day.enabled ? ' is-open' : ''}`}>
                <div className="team-day-head">
                  <Switch
                    isSelected={day.enabled}
                    isDisabled={!clinic?.enabled}
                    onChange={(enabled) => setDay(day.weekday, { enabled })}
                    aria-label={`Atende ${dayNames[day.weekday]}`}
                  >
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      <Label>{dayNames[day.weekday]}</Label>
                    </Switch.Content>
                  </Switch>
                  <small>
                    {clinicRange(clinic) ? `Espaço: ${clinicRange(clinic)}` : 'Espaço fechado'}
                  </small>
                </div>
                {day.enabled ? (
                  <div className="team-day-times">
                    <TimePicker
                      label="Começa"
                      value={day.start}
                      onChange={(start) => setDay(day.weekday, { start })}
                    />
                    <TimePicker
                      label="Termina"
                      value={day.end}
                      onChange={(end) => setDay(day.weekday, { end })}
                    />
                    {pause ? (
                      <div className="team-pause">
                        <TimePicker
                          label="Pausa de"
                          value={pause.start}
                          onChange={(start) =>
                            setDay(day.weekday, {
                              breaks: [{ ...pause, start }, ...day.breaks.slice(1)],
                            })
                          }
                        />
                        <TimePicker
                          label="até"
                          value={pause.end}
                          onChange={(end) =>
                            setDay(day.weekday, {
                              breaks: [{ ...pause, end }, ...day.breaks.slice(1)],
                            })
                          }
                        />
                        <button
                          type="button"
                          className="team-link"
                          onClick={() => setDay(day.weekday, { breaks: [] })}
                        >
                          Sem pausa
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="team-link"
                        onClick={() =>
                          setDay(day.weekday, { breaks: [{ start: '12:00', end: '13:00' }] })
                        }
                      >
                        <Coffee size={14} aria-hidden /> Adicionar pausa (almoço)
                      </button>
                    )}
                  </div>
                ) : null}
                {problem ? (
                  <p className="settings-field-error" role="alert">
                    {problem}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </SettingsCard>

      {canManageAccess ? (
        <SettingsCard
          icon={<KeyRound size={20} />}
          title="Login no sistema"
          description="Ligue esta profissional a um login para ela entrar no painel."
          help={{
            title: 'Como crio um login?',
            text: 'Em Configurações → Acessos e logins, cadastre o e-mail da pessoa. Ela recebe um link para criar a senha. Depois, volte aqui e escolha o login dela.',
          }}
        >
          {isSelf ? (
            <p className="settings-muted">Este é o seu próprio login.</p>
          ) : members.loading && !members.data ? (
            <Spinner size="sm" aria-label="Carregando logins" />
          ) : (
            <SelectField
              ariaLabel="Login ligado"
              value={person.membershipId ?? 'none'}
              onChange={(value) => set({ membershipId: value === 'none' ? null : value })}
              options={[
                { id: 'none', label: 'Sem login' },
                ...linkOptions.map((member) => ({
                  id: member.id,
                  label: `${member.name || member.email} · ${roleLabel(member.role)}`,
                })),
              ]}
            />
          )}
        </SettingsCard>
      ) : null}

      {!isNew ? (
        <div className="team-danger">
          {confirmArchive ? (
            <>
              <span>
                Tirar {initial.name} da equipe? Os atendimentos antigos continuam no histórico.
              </span>
              <Button variant="ghost" onPress={() => setConfirmArchive(false)}>
                Cancelar
              </Button>
              <Button className="team-danger-confirm" onPress={() => void archive()}>
                <Trash2 size={15} aria-hidden /> Sim, tirar da equipe
              </Button>
            </>
          ) : (
            <Button variant="ghost" onPress={() => setConfirmArchive(true)}>
              <Trash2 size={15} aria-hidden /> Tirar da equipe
            </Button>
          )}
        </div>
      ) : null}

      <SaveBar
        dirty={dirty || isNew}
        state={state}
        onSave={() => void save()}
        onDiscard={() => onClose()}
        label={isNew ? 'Adicionar à equipe' : 'Salvar alterações'}
      />
    </div>
  )
}
