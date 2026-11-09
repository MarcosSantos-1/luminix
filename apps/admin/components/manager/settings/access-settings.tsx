'use client'

import { Button, Spinner } from '@heroui/react'
import {
  Check,
  CircleAlert,
  KeyRound,
  Mail,
  MailCheck,
  RotateCcw,
  Send,
  ShieldCheck,
  UserPlus,
  UserRound,
  UserX,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { SelectField } from '@/components/ui/fields'
import { accessRoles, roleLabel, type AccessRole } from '@/lib/access'
import { ClinicApiError, useClinicApi, useClinicResource } from './clinic-api'
import {
  HelpTip,
  LoadError,
  SettingsCard,
  SettingsSkeleton,
  StatusPill,
  TextInput,
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
type Notice = { kind: 'ok' | 'error'; text: string; at?: 'form' } | null

function lastAccess(member: StaffMember) {
  if (!member.lastSignInAt) return 'Ainda não entrou'
  const date = new Date(member.lastSignInAt)
  return `Último acesso em ${date.toLocaleDateString('pt-BR')}`
}

export function AccessSettings({ clinicId }: { clinicId: string }) {
  const api = useClinicApi(clinicId)
  const staff = useClinicResource<{ members: StaffMember[] }>(api, 'staff')
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'reception' as Exclude<AccessRole, 'owner'>,
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
      const result = await api.post<{ accountCreated: boolean }>('staff', {
        name: form.name.trim(),
        email,
        role: form.role,
      })
      if (result.accountCreated)
        await sendEmail(
          email,
          `Pronto! Enviamos para ${email} um link para criar a senha. Peça para olhar também a caixa de spam.`,
          'form',
        )
      else {
        setNotice({
          kind: 'ok',
          text: `Acesso liberado! ${email} já tem conta na Luminix e pode entrar com a senha que já usa.`,
          at: 'form',
        })
        setExisting(email)
      }
      setForm({ name: '', email: '', role: 'reception' })
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
            void sendEmail(email, `Enviamos para ${email} um link para redefinir a senha.`)
          }}
        >
          <Mail size={14} aria-hidden /> Enviar link de senha mesmo assim
        </Button>
      ) : null}
    </p>
  ) : null

  return (
    <div className="settings-stack">
      <SettingsCard
        icon={<ShieldCheck size={20} />}
        title="Como funciona o acesso da equipe"
        description="Cada pessoa entra com o próprio e-mail e senha. Você decide o que ela pode ver."
      >
        <ol className="access-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Você cadastra o e-mail</strong>
              <small>e escolhe o nível de acesso.</small>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>A pessoa recebe um e-mail</strong>
              <small>com um link para criar a senha. O link vale por pouco tempo.</small>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Ela entra em app.luminix.beauty</strong>
              <small>
                com o e-mail e a senha que criou. Você pode tirar o acesso quando quiser.
              </small>
            </div>
          </li>
        </ol>
      </SettingsCard>

      <SettingsCard
        icon={<KeyRound size={20} />}
        title="Níveis de acesso"
        description="Escolha o nível certo para cada pessoa. Dá para mudar depois."
      >
        <div className="access-roles">
          {accessRoles.map((role) => (
            <article key={role.id} className="access-role">
              <strong>{role.label}</strong>
              <p>{role.summary}</p>
              <ul>
                {role.can.map((item) => (
                  <li key={item}>
                    <Check size={14} aria-label="Pode" /> {item}
                  </li>
                ))}
                {role.cannot.map((item) => (
                  <li key={item} className="is-blocked">
                    <X size={14} aria-label="Não pode" /> {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </SettingsCard>

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
                          void sendEmail(
                            member.email,
                            pending
                              ? `Reenviamos o convite para ${member.email}.`
                              : `Enviamos para ${member.email} um link para criar uma senha nova.`,
                          )
                        }
                      >
                        {pending ? (
                          <Send size={14} aria-hidden />
                        ) : (
                          <RotateCcw size={14} aria-hidden />
                        )}
                        {pending ? 'Reenviar convite' : 'Redefinir senha'}
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
        description="A pessoa recebe um e-mail para criar a própria senha. Você nunca precisa saber a senha dela."
        help={{
          title: 'E se o e-mail não chegar?',
          text: 'Peça para olhar a caixa de spam e as abas “Promoções” ou “Atualizações”. Depois, use “Reenviar convite” na lista acima. O link vale por pouco tempo, então é melhor abrir logo.',
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
            Um e-mail da Luminix com o assunto sobre senha. Ao clicar no link, ela cria a senha e já
            pode entrar no painel com o e-mail dela.
          </HelpTip>
        </div>
        {notice?.at === 'form' ? noticeView : null}
      </SettingsCard>
    </div>
  )
}
