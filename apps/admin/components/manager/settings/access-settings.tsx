'use client'

import { Button, Spinner } from '@heroui/react'
import {
  Check,
  CircleAlert,
  Mail,
  MailCheck,
  RotateCcw,
  Send,
  SlidersHorizontal,
  UserPlus,
  UserRound,
  UserX,
} from 'lucide-react'
import { useState } from 'react'
import { SelectField } from '@/components/ui/fields'
import { accessOptions, accessRoles, roleLabel, type AccessRole } from '@/lib/access'
import { ClinicApiError, useClinicApi, useClinicResource } from './clinic-api'
import {
  HelpTip,
  LoadError,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
  TextInput,
  ToggleRow,
} from './settings-kit'

export type StaffMember = {
  id: string
  name: string
  email: string
  role: string
  status: 'active' | 'revoked'
  isSelf: boolean
  professionalId: string | null
  invitedAt: string | null
  lastSignInAt: string | null
}
type Notice = { kind: 'ok' | 'error'; text: string; at?: 'form' | 'levels' } | null
type LevelOption = {
  role: 'team'
  permission: string
  enabled: boolean
  enabledByDefault: boolean
}

function lastAccess(member: StaffMember) {
  if (!member.lastSignInAt) return 'Ainda não entrou'
  const date = new Date(member.lastSignInAt)
  return `Último acesso em ${date.toLocaleDateString('pt-BR')}`
}

export function AccessSettings({ clinicId }: { clinicId: string }) {
  const api = useClinicApi(clinicId)
  const staff = useClinicResource<{ members: StaffMember[] }>(api, 'staff')
  const levels = useClinicResource<{ options: LevelOption[] }>(api, 'access-levels')
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'team' as Exclude<AccessRole, 'owner'>,
  })
  const [busy, setBusy] = useState<string>('')
  const [notice, setNotice] = useState<Notice>(null)
  const [existing, setExisting] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  if (staff.error && !staff.data) return <LoadError message={staff.error} onRetry={staff.reload} />
  if (!staff.data) return <SettingsSkeleton cards={3} />
  const members = staff.data.members
  const self = members.find((member) => member.isSelf)
  const isOwner = self?.role === 'owner'
  const emailError = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ? 'Confira o e-mail. Exemplo: ana@gmail.com'
    : ''
  const nameError = !form.name.trim() ? 'Escreva o nome da pessoa.' : ''

  async function sendEmail(email: string, text: string, at?: 'form') {
    try {
      await api.sendAccessEmail(email)
      setNotice({ kind: 'ok', text, at })
    } catch {
      setNotice({
        kind: 'error',
        text: 'Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.',
        at,
      })
    }
  }

  async function sendLink(member: StaffMember, text: string) {
    setBusy(member.id)
    try {
      await api.sendAccessLink(member.id, member.email)
      setNotice({ kind: 'ok', text })
    } catch {
      setNotice({
        kind: 'error',
        text: 'Não foi possível enviar o link agora. Tente de novo em alguns minutos.',
      })
    } finally {
      setBusy('')
    }
  }

  async function setOption(option: LevelOption, enabled: boolean) {
    const key = `${option.role}|${option.permission}`
    setBusy(key)
    setNotice(null)
    try {
      await api.put('access-levels', { role: option.role, permission: option.permission, enabled })
      levels.reload()
    } catch {
      setNotice({
        kind: 'error',
        text: 'Não foi possível salvar essa permissão. Tente de novo.',
        at: 'levels',
      })
    } finally {
      setBusy('')
    }
  }

  async function invite() {
    if (emailError || nameError) {
      setShowErrors(true)
      return
    }
    const email = form.email.trim().toLowerCase()
    setBusy('invite')
    setNotice(null)
    setExisting(null)
    try {
      const result = await api.post<{
        accountCreated: boolean
        emailSent?: boolean
        member: { id: string }
      }>('staff', {
        name: form.name.trim(),
        email,
        role: form.role,
      })
      let sent = result.emailSent === true
      if (!sent) {
        // No e-mail provider on the API: Firebase's own e-mail link does the same job.
        try {
          await api.sendAccessLink(result.member.id, email)
          sent = true
        } catch {
          sent = false
        }
      }
      setNotice({
        kind: sent ? 'ok' : 'error',
        text: sent
          ? `Acesso liberado! Enviamos para ${email} o convite com o botão “Entrar no painel”. Peça para olhar também o spam.`
          : `Acesso liberado, mas o e-mail não saiu agora. Use “Enviar link de acesso” na lista em alguns minutos.`,
        at: 'form',
      })
      if (!result.accountCreated) setExisting(email)
      setForm({ name: '', email: '', role: 'team' })
      setShowErrors(false)
      staff.reload()
    } catch (error) {
      const status = error instanceof ClinicApiError ? error.status : 0
      setNotice({
        kind: 'error',
        text:
          status === 409
            ? 'Essa pessoa já tem acesso a este espaço.'
            : status === 403
              ? 'Só a proprietária pode dar acesso de gerente.'
              : 'Não foi possível dar o acesso. Confira os dados e tente de novo.',
        at: 'form',
      })
    } finally {
      setBusy('')
    }
  }

  async function change(member: StaffMember, body: { role?: string; status?: string }) {
    setBusy(member.id)
    setNotice(null)
    try {
      await api.put(`staff/${member.id}`, body)
      setConfirm(null)
      setNotice({
        kind: 'ok',
        text:
          body.status === 'revoked'
            ? `${member.name || member.email} não consegue mais entrar neste espaço.`
            : body.status === 'active'
              ? `${member.name || member.email} voltou a ter acesso.`
              : `Nível de ${member.name || member.email} alterado para ${roleLabel(body.role ?? '')}.`,
      })
      staff.reload()
    } catch (error) {
      setNotice({
        kind: 'error',
        text:
          error instanceof ClinicApiError && error.status === 403
            ? 'Só a proprietária pode mudar acessos de gerente.'
            : 'Não foi possível alterar. Tente de novo.',
      })
    } finally {
      setBusy('')
    }
  }

  const noticeView = notice ? (
    <p className={`access-notice is-${notice.kind}`} role="status">
      {notice.kind === 'ok' ? (
        <Check size={16} aria-hidden />
      ) : (
        <CircleAlert size={16} aria-hidden />
      )}
      {notice.text}
      {existing ? (
        <Button
          size="sm"
          variant="secondary"
          onPress={() => {
            const email = existing
            setExisting(null)
            void sendEmail(email, `Enviamos para ${email} um link para criar uma senha nova.`)
          }}
        >
          <Mail size={14} aria-hidden /> Ela prefere senha? Enviar link de senha
        </Button>
      ) : null}
    </p>
  ) : null

  return (
    <div className="settings-stack">
      <SettingsCard
        icon={<UserRound size={20} />}
        title="Pessoas com acesso"
        badge={
          <StatusPill tone="info">
            {members.filter((m) => m.status === 'active').length} ativas
          </StatusPill>
        }
      >
        {notice && !notice.at ? noticeView : null}
        <ul className="access-list">
          {members.map((member) => {
            const locked = member.role === 'owner' || member.isSelf
            const managerLocked = !isOwner && member.role === 'manager'
            const pending = !member.lastSignInAt
            return (
              <li
                key={member.id}
                className={member.status === 'revoked' ? 'is-revoked' : undefined}
              >
                <span className="access-avatar" aria-hidden>
                  {(member.name || member.email || '?').slice(0, 1).toUpperCase()}
                </span>
                <div className="access-person">
                  <strong>
                    {member.name || 'Sem nome'}
                    {member.isSelf ? ' (você)' : ''}
                  </strong>
                  <span>{member.email || 'E-mail do cadastro inicial'}</span>
                  <small>{lastAccess(member)}</small>
                </div>
                <div className="access-meta">
                  {locked || managerLocked || member.status === 'revoked' ? (
                    <StatusPill tone="info">{roleLabel(member.role)}</StatusPill>
                  ) : (
                    <SelectField
                      className="access-role-select"
                      ariaLabel={`Nível de acesso de ${member.name || member.email}`}
                      value={member.role}
                      isDisabled={busy === member.id}
                      onChange={(role) => void change(member, { role })}
                      options={accessRoles
                        .filter((role) => role.id !== 'owner' && (isOwner || role.id !== 'manager'))
                        .map((role) => ({ id: role.id, label: role.label }))}
                    />
                  )}
                  <StatusPill tone={member.status === 'revoked' ? 'off' : pending ? 'info' : 'on'}>
                    {member.status === 'revoked'
                      ? 'Inativo'
                      : pending
                        ? 'Aguardando 1º acesso'
                        : 'Ativo'}
                  </StatusPill>
                </div>
                {!locked && !managerLocked ? (
                  <div className="access-actions">
                    {busy === member.id ? <Spinner size="sm" aria-label="Salvando" /> : null}
                    {member.status === 'active' && member.email ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={busy !== ''}
                        onPress={() =>
                          void sendLink(
                            member,
                            pending
                              ? `Reenviamos o convite para ${member.email}.`
                              : `Enviamos para ${member.email} um link de acesso.`,
                          )
                        }
                      >
                        <Send size={14} aria-hidden />
                        {pending ? 'Reenviar convite' : 'Enviar link de acesso'}
                      </Button>
                    ) : null}
                    {member.status === 'active' ? (
                      confirm === member.id ? (
                        <>
                          <Button size="sm" variant="ghost" onPress={() => setConfirm(null)}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="team-danger-confirm"
                            isDisabled={busy !== ''}
                            onPress={() => void change(member, { status: 'revoked' })}
                          >
                            <UserX size={14} aria-hidden /> Confirmar
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          isDisabled={busy !== ''}
                          onPress={() => setConfirm(member.id)}
                        >
                          <UserX size={14} aria-hidden /> Inativar
                        </Button>
                      )
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        isDisabled={busy !== ''}
                        onPress={() => void change(member, { status: 'active' })}
                      >
                        <RotateCcw size={14} aria-hidden /> Reativar
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </SettingsCard>

      <SettingsCard
        icon={<UserPlus size={20} />}
        title="Dar acesso a alguém"
        description="A pessoa recebe um e-mail com o botão “Entrar no painel”. Sem senha para combinar: nas próximas vezes ela pede um link no e-mail ou cria uma senha, se preferir."
        help={{
          title: 'E se o e-mail não chegar?',
          text: 'Peça para olhar a caixa de spam e as abas “Promoções” ou “Atualizações”. Depois, use “Reenviar convite” na lista acima. O link vale por pouco tempo e só funciona uma vez.',
        }}
      >
        <div className="settings-grid">
          <TextInput
            label="Nome"
            icon={<UserRound size={17} />}
            value={form.name}
            maxLength={120}
            required
            error={showErrors ? nameError : undefined}
            onChange={(name) => setForm({ ...form, name })}
          />
          <TextInput
            label="E-mail"
            icon={<Mail size={17} />}
            type="email"
            inputMode="email"
            value={form.email}
            maxLength={254}
            required
            placeholder="ana@gmail.com"
            error={showErrors ? emailError : undefined}
            onChange={(email) => setForm({ ...form, email })}
          />
        </div>
        <div className="access-pick" role="radiogroup" aria-label="Nível de acesso">
          {accessRoles
            .filter((role) => role.id !== 'owner')
            .map((role) => {
              const disabled = role.id === 'manager' && !isOwner
              return (
                <button
                  key={role.id}
                  type="button"
                  role="radio"
                  aria-checked={form.role === role.id}
                  disabled={disabled}
                  onClick={() => setForm({ ...form, role: role.id as typeof form.role })}
                >
                  <strong>{role.label}</strong>
                  <small>{disabled ? 'Só a proprietária pode dar' : role.summary}</small>
                </button>
              )
            })}
        </div>
        <div className="access-submit">
          <Button onPress={() => void invite()} isDisabled={busy !== ''}>
            {busy === 'invite' ? (
              <Spinner size="sm" aria-hidden />
            ) : (
              <MailCheck size={16} aria-hidden />
            )}
            Dar acesso e enviar e-mail
          </Button>
          <HelpTip title="O que a pessoa recebe?">
            Um e-mail da Luminix com o nome do seu espaço e o botão “Entrar no painel”. Ao tocar,
            ela entra direto. Depois pode criar uma senha, se quiser.
          </HelpTip>
        </div>
        {notice?.at === 'form' ? noticeView : null}
      </SettingsCard>

      {Array.isArray(levels.data?.options) ? (
        <SettingsCard
          icon={<SlidersHorizontal size={20} />}
          title="O que a Equipe pode fazer"
          description="Vale para todas as pessoas da Equipe. Ver a agenda, os clientes e as fotos sempre pode. Financeiro, relatórios, configurações e acessos ficam só com a proprietária e gerentes."
        >
          <div className="settings-stack">
            {accessOptions.map((item) => {
              const option = levels.data!.options.find((o) => o.permission === item.permission)
              if (!option) return null
              return (
                <ToggleRow
                  key={item.permission}
                  title={item.title}
                  description={
                    option.enabled === option.enabledByDefault
                      ? item.description
                      : `${item.description} (padrão: ${option.enabledByDefault ? 'liberado' : 'bloqueado'})`
                  }
                  isSelected={option.enabled}
                  disabled={busy !== ''}
                  onChange={(enabled) => void setOption(option, enabled)}
                />
              )
            })}
          </div>
          {notice?.at === 'levels' ? noticeView : null}
        </SettingsCard>
      ) : null}
    </div>
  )
}
