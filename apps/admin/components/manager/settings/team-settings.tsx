'use client'

import { Button, Spinner, Switch, Label } from '@heroui/react'
import {
  CalendarClock,
  Coffee,
  Copy,
  Crown,
  Mail,
  ImagePlus,
  KeyRound,
  Palmtree,
  Plus,
  Scissors,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { TimePicker } from '@/components/onboarding/time-picker'
import { professionalAvatarSrc } from '@/components/onboarding/model'
import { CheckboxField, ComboField, SelectField } from '@/components/ui/fields'
import '@/app/c/[clinicId]/onboarding/onboarding.css'
import { CommissionField } from '@/components/ui/commission-field'
import { TeamAccessLevels, type StaffMember } from './access-settings'
import { canceledNote, confirmFlag, useCancellationGuard } from '../appointments/cancellation-guard'
import { ClosuresEditor } from '../appointments/closures-editor'
import { QuickModal } from '../quick-modal'
import '../appointments/appointments.css'
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
  ToggleRow,
  type SaveState,
} from './settings-kit'
import { ToastNotice } from '@/components/ui/toast-notice'

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
  staffKind?: StaffKind
  attends?: boolean
  commissionBps?: number | null
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
  return person.photoUrl ?? professionalAvatarSrc[person.gender]
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

const staffKinds = [
  { id: 'team', label: 'Equipe' },
  { id: 'manager', label: 'Gerente' },
  { id: 'reception', label: 'Recepção' },
  { id: 'other', label: 'Outros' },
] as const
type StaffKind = (typeof staffKinds)[number]['id']

function kindLabel(kind: StaffKind | undefined) {
  return staffKinds.find((item) => item.id === kind)?.label ?? 'Equipe'
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
  const staffApi = useMemo(
    () => (canManageAccess ? api : { ...api, ready: false }),
    [api, canManageAccess],
  )
  const staff = useClinicResource<{ members: StaffMember[] }>(staffApi, 'staff')
  const [editing, setEditing] = useState<Professional | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!canManageAccess) return
    window.addEventListener('luminix:account-saved', staff.reload)
    window.addEventListener('focus', staff.reload)
    return () => {
      window.removeEventListener('luminix:account-saved', staff.reload)
      window.removeEventListener('focus', staff.reload)
    }
  }, [canManageAccess, staff.reload])

  if (team.error && !team.data) return <LoadError message={team.error} onRetry={team.reload} />
  if (canManageAccess && staff.error && !staff.data)
    return <LoadError message={staff.error} onRetry={staff.reload} />
  if (!team.data || (canManageAccess && !staff.data)) return <SettingsSkeleton cards={2} />
  const data = team.data
  const members = staff.data?.members ?? []
  const byId = new Map(members.map((member) => [member.id, member]))
  const isOwner = members.some((member) => member.isSelf && member.role === 'owner')
  const blank = (member?: StaffMember): Professional => ({
    id: member?.id ?? crypto.randomUUID(),
    name: member?.name || (member?.isSelf ? ownName : '') || member?.email.split('@')[0] || '',
    role: '',
    gender: 'female',
    audience: 'all',
    membershipId: member?.id ?? null,
    staffKind: member?.role === 'manager' ? 'manager' : 'team',
    attends: false,
    commissionBps: null,
    photoAssetId: '',
    photoUrl: null,
    serviceIds: [],
    serviceAudiences: {},
    days: data.clinicHours.map((day) => ({ ...day, breaks: [...day.breaks] })),
  })
  const profileMembers = new Set(data.professionals.map((person) => person.membershipId))
  const roster = [
    ...data.professionals.map((person) => ({
      ...person,
      attends: person.attends ?? true,
      staffKind:
        byId.get(person.membershipId ?? '')?.role === 'manager'
          ? ('manager' as const)
          : (person.staffKind ?? 'team'),
    })),
    ...members.filter((member) => !profileMembers.has(member.id)).map(blank),
  ].sort(
    (left, right) =>
      Number(byId.get(right.membershipId ?? '')?.role === 'owner') -
        Number(byId.get(left.membershipId ?? '')?.role === 'owner') ||
      left.name.localeCompare(right.name, 'pt-BR'),
  )

  return (
    <div className="settings-stack">
      <SettingsCard
        icon={<UsersRound size={20} />}
        title="Pessoas da equipe"
        description="Gerencie quem atende, quem entra no painel e o que cada pessoa faz."
        badge={<StatusPill tone="info">{roster.length}</StatusPill>}
      >
        <ToastNotice message={notice} onShown={() => setNotice('')} />
        <ul className="team-grid">
          {roster.map((person) => {
            const member = byId.get(person.membershipId ?? '')
            return (
              <li key={person.id}>
                <button type="button" className="team-card" onClick={() => setEditing(person)}>
                  <Image
                    src={member?.photo || avatar(person)}
                    alt=""
                    width={48}
                    height={48}
                    unoptimized
                  />
                  <span className="team-card-copy">
                    <strong>{person.name || 'Pessoa da equipe'}</strong>
                    {person.role ? <span>{person.role}</span> : null}
                    <span className="team-member-type">
                      {member?.role === 'owner' ? (
                        <>
                          <Crown size={14} aria-hidden /> Proprietário(a)
                        </>
                      ) : (
                        kindLabel(person.staffKind)
                      )}
                      {member?.isSelf ? ' · Você' : ''}
                    </span>
                    {person.attends ? (
                      <small>
                        <CalendarClock size={13} aria-hidden /> {weekSummary(person.days)} ·{' '}
                        {person.serviceIds.length} serviços
                      </small>
                    ) : null}
                    <small>
                      {member?.status === 'revoked'
                        ? 'Acesso inativo'
                        : member?.email
                          ? member.email
                          : member
                            ? 'Tem acesso'
                            : 'Sem acesso'}
                    </small>
                  </span>
                  <span className="team-card-edit">Editar</span>
                </button>
              </li>
            )
          })}
          <li>
            <button type="button" className="team-card is-add" onClick={() => setEditing(blank())}>
              <span className="team-add-icon" aria-hidden>
                <Plus size={24} />
              </span>
              <strong>Adicionar funcionário</strong>
            </button>
          </li>
        </ul>
      </SettingsCard>
      {canManageAccess ? <TeamAccessLevels api={api} /> : null}
      {editing ? (
        <ProfessionalEditor
          key={editing.id}
          api={api}
          data={data}
          members={members}
          isOwner={isOwner}
          initial={editing}
          isNew={!data.professionals.some((person) => person.id === editing.id)}
          canManageAccess={canManageAccess}
          onClose={(message) => {
            setEditing(null)
            if (message) {
              setNotice(message)
              team.reload()
              if (canManageAccess) staff.reload()
            }
          }}
        />
      ) : null}
    </div>
  )
}
function ProfessionalEditor({
  api,
  data,
  members,
  isOwner,
  initial,
  isNew,
  canManageAccess,
  onClose,
}: {
  api: ClinicApi
  data: TeamResponse
  members: StaffMember[]
  isOwner: boolean
  initial: Professional
  isNew: boolean
  canManageAccess: boolean
  onClose: (message?: string) => void
}) {
  const [person, setPerson] = useState(initial)
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const { guard, dialog } = useCancellationGuard()
  const [uploading, setUploading] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [invite, setInvite] = useState(false)
  const [loginMessage, setLoginMessage] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [status, setStatus] = useState<StaffMember['status']>()
  const savedProfile = useRef(false)
  const linked = members.find((member) => member.id === person.membershipId)
  const isSelf = person.membershipId === data.selfMembershipId && person.membershipId !== null
  const protectedAccess =
    isSelf || linked?.role === 'owner' || (linked?.role === 'manager' && !isOwner)
  const attends = person.staffKind !== 'reception' && (person.attends ?? true)
  const emailError =
    invite && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Informe um e-mail válido.' : ''
  const linkOptions = members.filter((item) => !item.professionalId && item.status === 'active')
  const close = () => onClose(savedProfile.current ? 'Cadastro atualizado.' : undefined)

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
  const nameError = !person.name.trim() ? 'Escreva o nome da pessoa.' : ''
  const dirty = invite || JSON.stringify(person) !== JSON.stringify(initial)

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
    if (state.status === 'saving' || uploading) return
    if (
      nameError ||
      emailError ||
      (attends && (problems.some(Boolean) || person.commissionBps === 0))
    ) {
      setShowErrors(true)
      setState({ status: 'error', message: 'Confira os campos marcados antes de salvar.' })
      return
    }
    setState({ status: 'saving' })
    try {
      const accessRole = person.staffKind === 'manager' ? 'manager' : 'team'
      const name = person.name.trim()
      const saved = await guard((confirm) =>
        api.put(`team/${person.id}`, {
          ...confirmFlag(confirm),
          name,
          staffKind: person.staffKind ?? 'team',
          attends,
          ...(attends ? { commissionBps: person.commissionBps ?? null } : {}),
          ...(linked &&
          initial.membershipId === linked.id &&
          !protectedAccess &&
          canManageAccess &&
          accessRole !== linked.role
            ? { accessRole }
            : {}),
          role: person.role.trim(),
          gender: person.gender,
          audience: person.audience,
          photoAssetId: person.photoAssetId,
          membershipId: person.membershipId,
          serviceIds: person.serviceIds,
          serviceAudiences: Object.fromEntries(
            Object.entries(person.serviceAudiences).filter(([id]) =>
              person.serviceIds.includes(id),
            ),
          ),
          days: person.days.map((day) => ({
            ...day,
            breaks: day.enabled ? day.breaks : [],
          })),
        }),
      )
      // Went back from the list of clients her new hours would cancel.
      if (saved === null) return setState({ status: 'idle' })
      savedProfile.current = true
      if (invite && !linked && canManageAccess) {
        const address = email.trim().toLowerCase()
        const result = await api.post<{ member: { id: string }; emailSent?: boolean }>('staff', {
          name,
          email: address,
          role: accessRole,
          professionalId: person.id,
        })
        let sent = result.emailSent === true
        if (!sent)
          sent = await api
            .sendAccessLink(result.member.id, address)
            .then(() => true)
            .catch(() => false)
        onClose(
          sent
            ? 'Cadastro salvo e convite enviado.'
            : 'Cadastro salvo. Abra o login da pessoa para reenviar o convite.',
        )
        return
      }
      onClose(
        (isNew ? `${person.name.trim()} entrou na equipe!` : 'Alterações salvas!') +
          canceledNote(saved),
      )
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof ClinicApiError && error.status === 409
            ? savedProfile.current
              ? 'Cadastro salvo. Esse e-mail já tem acesso. Vincule o login existente.'
              : 'Esse login já está ligado a outra pessoa.'
            : savedProfile.current
              ? 'Cadastro salvo. Tente enviar o convite novamente.'
              : 'Não foi possível salvar. Confira os dados e tente de novo.',
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

  async function manageLogin(action: 'invite' | 'reset' | 'status') {
    if (!linked || loginBusy) return
    setLoginBusy(true)
    setLoginMessage('')
    try {
      if (action === 'status') {
        const next = (status ?? linked.status) === 'active' ? 'revoked' : 'active'
        await api.put('staff/' + linked.id, { status: next })
        setStatus(next)
        savedProfile.current = true
        setLoginMessage(next === 'active' ? 'Acesso reativado.' : 'Acesso inativado.')
      } else {
        if (action === 'reset') await api.sendAccessEmail(linked.email)
        else await api.sendAccessLink(linked.id, linked.email)
        setLoginMessage(action === 'reset' ? 'Link de recuperação enviado.' : 'Convite enviado.')
      }
    } catch {
      setLoginMessage('Não foi possível concluir. Tente novamente.')
    } finally {
      setLoginBusy(false)
    }
  }

  const pending = state.status === 'saving' || uploading || loginBusy
  return (
    <QuickModal
      isOpen
      size="xl"
      className="team-editor-modal"
      onOpenChange={(open) => {
        if (!open && !pending) close()
      }}
      title={isNew && !linked ? 'Adicionar funcionário' : 'Editar ' + initial.name}
      footer={
        dirty || (isNew && !linked) || state.status !== 'idle' ? (
          <SaveBar
            dirty={dirty || (isNew && !linked)}
            state={state}
            onSave={() => void save()}
            onDiscard={close}
            label={isNew && !linked ? 'Adicionar à equipe' : 'Salvar alterações'}
          />
        ) : undefined
      }
    >
      {dialog}
      <div className="settings-stack">
        <SettingsCard icon={<UserRound size={20} />} title="Quem é">
          <div className="settings-identity">
            <div className="settings-logo">
              <button
                type="button"
                className="settings-logo-frame is-round"
                onClick={() => file.current?.click()}
                disabled={uploading || Boolean(linked?.photo)}
                aria-label={person.photoUrl ? 'Trocar foto' : 'Enviar foto'}
              >
                {uploading ? (
                  <Spinner aria-label="Enviando foto" />
                ) : (
                  <Image
                    src={linked?.photo || avatar(person)}
                    alt=""
                    width={120}
                    height={120}
                    unoptimized
                  />
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
                {linked?.photo ? (
                  <small>Foto do perfil Luminix</small>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
            <div className="settings-grid">
              <TextInput
                label="Nome"
                value={person.name}
                required
                maxLength={160}
                error={showErrors ? nameError : undefined}
                hint={attends ? 'Como aparece na agenda.' : undefined}
                onChange={(name) => set({ name })}
              />
              {linked?.role === 'owner' ? (
                <StatusPill tone="info">
                  <Crown size={14} aria-hidden /> Proprietário(a)
                </StatusPill>
              ) : (
                <SelectField
                  label="Tipo de funcionário"
                  value={person.staffKind ?? 'team'}
                  isDisabled={Boolean(linked && protectedAccess)}
                  options={staffKinds
                    .filter(
                      (kind) => kind.id !== 'manager' || isOwner || person.staffKind === 'manager',
                    )
                    .map((kind) => ({ ...kind }))}
                  onChange={(staffKind) =>
                    set({
                      staffKind: staffKind as StaffKind,
                      ...(staffKind === 'reception' ? { attends: false } : {}),
                    })
                  }
                />
              )}
              <ComboField
                label="Cargo ou especialidade"
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
                      <Image src={professionalAvatarSrc[gender]} alt="" width={28} height={28} />
                      {gender === 'male' ? 'Masculina' : 'Feminina'}
                    </button>
                  ))}
                </div>
              </div>
              {attends ? (
                <div className="settings-field">
                  <span className="settings-field-label">
                    <span>Público atendido</span>
                    <HelpTip title="Para que serve?">
                      Ajuda a mostrar a profissional certa para cada cliente. Use “Todos” se ela
                      atende qualquer pessoa.
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
              ) : null}
            </div>
          </div>
          <ToggleRow
            title="Atende clientes?"
            description={
              person.staffKind === 'reception'
                ? 'A recepção organiza os agendamentos da equipe.'
                : 'Define se a pessoa pode receber agendamentos.'
            }
            isSelected={attends}
            disabled={person.staffKind === 'reception'}
            onChange={(enabled) => set({ attends: enabled })}
          />
          {attends ? (
            <CommissionField
              value={person.commissionBps ?? null}
              showError={showErrors}
              onChange={(commissionBps) => set({ commissionBps })}
            />
          ) : null}
        </SettingsCard>

        {canManageAccess ? (
          <SettingsCard icon={<KeyRound size={20} />} title="Login no sistema">
            {linked ? (
              <>
                {linked.email ? (
                  <TextInput
                    label="E-mail de acesso"
                    disabled
                    value={linked.email}
                    onChange={() => undefined}
                  />
                ) : null}
                <p className="settings-muted">
                  {(status ?? linked.status) === 'revoked'
                    ? 'Acesso inativo'
                    : linked.isSelf
                      ? 'Seu acesso'
                      : linked.lastSignInAt
                        ? 'Acesso ativo'
                        : 'Aguardando primeiro acesso'}
                </p>
                <div className="team-login-actions">
                  {linked.email && (status ?? linked.status) === 'active' ? (
                    <>
                      {!linked.lastSignInAt && !linked.isSelf ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          isDisabled={loginBusy}
                          onPress={() => void manageLogin('invite')}
                        >
                          Reenviar convite
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={loginBusy}
                        onPress={() => void manageLogin('reset')}
                      >
                        <Mail size={15} aria-hidden /> Enviar link de recuperação
                      </Button>
                    </>
                  ) : null}
                  {!protectedAccess ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      isDisabled={loginBusy}
                      onPress={() => void manageLogin('status')}
                    >
                      {(status ?? linked.status) === 'active'
                        ? 'Inativar acesso'
                        : 'Reativar acesso'}
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <ToggleRow
                  title="Convidar para o sistema"
                  isSelected={invite}
                  onChange={setInvite}
                />
                {invite ? (
                  <TextInput
                    label="E-mail do convite"
                    type="email"
                    inputMode="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={setEmail}
                    error={showErrors ? emailError : undefined}
                  />
                ) : null}
                {!invite && linkOptions.length ? (
                  <SelectField
                    label="Vincular acesso existente"
                    value="none"
                    onChange={(id) => {
                      const member = linkOptions.find((item) => item.id === id)
                      if (member)
                        set({
                          membershipId: member.id,
                          staffKind: member.role === 'manager' ? 'manager' : person.staffKind,
                        })
                    }}
                    options={[
                      { id: 'none', label: 'Sem acesso vinculado' },
                      ...linkOptions.map((item) => ({
                        id: item.id,
                        label: item.name || item.email,
                      })),
                    ]}
                  />
                ) : null}
              </>
            )}
            {loginMessage ? <p role="status">{loginMessage}</p> : null}
          </SettingsCard>
        ) : null}
        {attends ? (
          <>
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
                                  ? person.serviceIds.filter(
                                      (id) => !services.some((s) => s.id === id),
                                    )
                                  : [
                                      ...new Set([
                                        ...person.serviceIds,
                                        ...services.map((s) => s.id),
                                      ]),
                                    ],
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
                  set({
                    days: data.clinicHours.map((day) => ({ ...day, breaks: [...day.breaks] })),
                  })
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
                          {clinicRange(clinic)
                            ? `Espaço: ${clinicRange(clinic)}`
                            : 'Espaço fechado'}
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

            {!isNew ? (
              <SettingsCard
                icon={<Palmtree size={20} />}
                title="Férias e afastamentos"
                description={`Nesses dias ninguém agenda com ${initial.name.split(' ')[0]}. Fica tudo registrado aqui, e dá para desfazer.`}
              >
                <ClosuresEditor
                  api={api}
                  professionals={[
                    {
                      id: initial.id,
                      display_name: initial.name,
                      photo_url: initial.photoUrl,
                      gender: initial.gender,
                    },
                  ]}
                  photos={{}}
                  canManageSchedule
                  canManageVacations
                  professionalId={initial.id}
                  onSaved={() => undefined}
                />
              </SettingsCard>
            ) : null}
          </>
        ) : null}

        {!isNew && !linked ? (
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
      </div>
    </QuickModal>
  )
}
