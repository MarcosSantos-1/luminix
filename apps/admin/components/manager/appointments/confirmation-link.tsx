'use client'

import { Button } from '@heroui/react'
import { CalendarClock, Check, Copy, Link2, Mail, MessageCircle, UserX } from 'lucide-react'
import { useState } from 'react'
import { whatsapp } from '../business/format'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { reminderText, type AppointmentView } from './model'

type Issued = { url: string; emailed: boolean; hasEmail: boolean }

/** What happened with the link so far, for the team (ADR-038). */
function linkState(item: AppointmentView) {
  const answer = item.link?.answer
  if (answer === 'confirmed')
    return { tone: 'ok', icon: Check, title: 'Confirmou pelo link', hint: null }
  if (answer === 'reschedule')
    return {
      tone: 'wait',
      icon: CalendarClock,
      title: 'Pediu para remarcar pelo link',
      hint: 'Chame a cliente para combinar outro horário.',
    }
  if (answer === 'not_me')
    return {
      tone: 'bad',
      icon: UserX,
      title: 'Quem recebeu o link disse que não é a cliente',
      hint: 'Confira o celular e o e-mail do cadastro antes de mandar de novo.',
    }
  if (item.link?.openedAt)
    return { tone: 'wait', icon: Link2, title: 'Link aberto, sem resposta ainda', hint: null }
  return null
}

/**
 * Confirmation link of an upcoming visit: generate it (optionally e-mailing it right away), then
 * copy it or open WhatsApp with it in the text. Generating again replaces the previous link, so
 * e-mail is chosen before generating, never after (it would kill the link already shared).
 */
export function ConfirmationLink({
  item,
  api,
  today,
  canSend,
  hasEmail,
}: {
  item: AppointmentView
  api: ClinicApi
  today: string
  canSend: boolean
  /** The client has an e-mail on the record (known once the record loads). */
  hasEmail: boolean
}) {
  const [issued, setIssued] = useState<Issued | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)
  const state = linkState(item)
  // Read once when the sheet opens (no clock reads during render).
  const [upcoming] = useState(() => Date.parse(item.startsAt) > Date.now())
  if (!state && (!canSend || !upcoming)) return null

  async function issue(sendEmail: boolean) {
    setBusy(true)
    setNote('')
    try {
      const result = await api.post<Issued>(`appointments/${item.id}/confirmation-link`, {
        sendEmail,
      })
      setIssued(result)
      if (sendEmail)
        setNote(
          result.emailed
            ? 'E-mail enviado com o link.'
            : result.hasEmail
              ? 'Link criado, mas o envio de e-mail não está configurado.'
              : 'Esta cliente não tem e-mail no cadastro.',
        )
    } catch (caught) {
      const body = caught instanceof ClinicApiError ? (caught.body as { error?: string }) : null
      setNote(
        body?.error === 'Appointment closed'
          ? 'Este horário já passou ou foi encerrado.'
          : 'Não foi possível criar o link agora.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNote('Não deu para copiar: selecione o link e copie.')
    }
  }

  const message = issued
    ? `${reminderText(item, today)} Confirme ou remarque por aqui: ${issued.url}`
    : ''
  const wa = issued ? whatsapp(item.phone, message) : null
  const Icon = state?.icon ?? Link2

  return (
    <section className={`sh-link is-${state?.tone ?? 'idle'}`} aria-label="Link de confirmação">
      <span className="sh-link-icon" aria-hidden>
        <Icon size={19} />
      </span>
      <div>
        <strong>{state?.title ?? 'Link de confirmação'}</strong>
        <small>
          {state?.hint ??
            (issued
              ? 'Mande pelo WhatsApp ou copie. Gerar de novo troca o link anterior.'
              : 'A cliente confirma, pede para remarcar ou avisa que não é ela, sem login.')}
        </small>
        {issued ? (
          <code className="sh-link-url" title={issued.url}>
            {issued.url}
          </code>
        ) : null}
        {note ? <small role="status">{note}</small> : null}
      </div>
      {canSend && upcoming ? (
        <div className="sh-link-actions">
          {issued ? (
            <>
              <Button size="sm" variant="secondary" onPress={() => void copy(issued.url)}>
                {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
              {wa ? (
                <a className="sh-link-wa" href={wa} target="_blank" rel="noopener noreferrer">
                  <MessageCircle size={15} aria-hidden /> WhatsApp
                </a>
              ) : null}
            </>
          ) : (
            <>
              <Button size="sm" isDisabled={busy} onPress={() => void issue(false)}>
                <Link2 size={15} aria-hidden /> {state ? 'Gerar novo link' : 'Gerar link'}
              </Button>
              {hasEmail ? (
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={busy}
                  onPress={() => void issue(true)}
                >
                  <Mail size={15} aria-hidden /> Gerar e mandar por e-mail
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  )
}
