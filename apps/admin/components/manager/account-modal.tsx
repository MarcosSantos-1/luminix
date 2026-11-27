'use client'

import { Button, Spinner } from '@heroui/react'
import { verifyBeforeUpdateEmail } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'
import { Camera, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TextInputField } from '@/components/ui/fields'
import { ClientAvatar } from './client-photo'
import { QuickModal } from './quick-modal'
import type { ClinicApi } from './settings/clinic-api'

export type OwnAccount = { name: string; email: string; role: string; photo: string | null }

const roleLabels: Record<string, string> = {
  owner: 'Responsável pelo espaço',
  manager: 'Gestão',
  team: 'Equipe',
}

/** Square 256px JPEG as a data URI: small enough to live with the membership record. */
export async function squarePhoto(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Use uma imagem PNG, JPG ou WebP.')
  if (file.size > 8_000_000) throw new Error('A imagem deve ter no máximo 8 MB.')
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.')
    const scale = Math.max(size / bitmap.width, size / bitmap.height)
    const width = bitmap.width * scale
    const height = bitmap.height * scale
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
    const photo = canvas.toDataURL('image/jpeg', 0.82)
    if (photo.length > 120_000)
      throw new Error('Não foi possível reduzir esta imagem. Tente outra.')
    return photo
  } finally {
    bitmap.close()
  }
}

/** "Minha conta": the signed-in person's own name and photo in this space. */
export function AccountModal({
  api,
  isOpen,
  onOpenChange,
  onSaved,
  fallbackName = '',
  fallbackEmail = '',
}: {
  api: ClinicApi
  /**
   * Sign-in name and e-mail. The owner's membership starts without them (only the sign-in
   * profile has them), so the form starts from these instead of empty fields.
   */
  fallbackName?: string
  fallbackEmail?: string
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (account: OwnAccount) => void | Promise<void>
}) {
  const [account, setAccount] = useState<OwnAccount | null>(null)
  const [name, setName] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [emailMessage, setEmailMessage] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    let active = true
    void api
      .get<OwnAccount>('account')
      .then((data) => {
        if (!active) return
        const filled = {
          ...data,
          name: data.name || fallbackName.trim(),
          email: fallbackEmail || data.email,
        }
        setAccount(filled)
        setName(filled.name)
        setPhoto(data.photo)
        setError('')
      })
      .catch(() => active && setError('Não foi possível carregar a sua conta.'))
    return () => {
      active = false
    }
  }, [isOpen, api, fallbackName, fallbackEmail])

  async function save() {
    if (!account || saving) return
    if (!name.trim()) {
      setError('Escreva o seu nome.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.put('account', { name: name.trim(), photo })
      await onSaved({ ...account, name: name.trim(), photo })
      window.dispatchEvent(new Event('luminix:account-saved'))
      onOpenChange(false)
    } catch {
      setError('Não foi possível salvar. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  async function changeEmail() {
    const email = newEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailMessage('Informe um novo e-mail válido.')
      return
    }
    setSendingEmail(true)
    setEmailMessage('')
    try {
      const user = getFirebaseAuth().currentUser
      if (!user || email === user.email?.toLowerCase()) {
        setEmailMessage('Informe um endereço diferente do e-mail atual.')
        return
      }
      await verifyBeforeUpdateEmail(user, email)
      setNewEmail('')
      setEmailMessage(
        'Enviamos um link ao novo e-mail. Após confirmar, use o novo endereço para entrar.',
      )
    } catch (cause) {
      setEmailMessage(
        (cause as { code?: string })?.code === 'auth/requires-recent-login'
          ? 'Entre novamente no Luminix antes de trocar o e-mail.'
          : 'Não foi possível enviar a confirmação. Confira o endereço e tente novamente.',
      )
    } finally {
      setSendingEmail(false)
    }
  }

  return (
    <QuickModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Minha conta"
      subtitle="Como você aparece para a equipe neste espaço."
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button isDisabled={!account || saving} onPress={() => void save()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      {!account && !error ? (
        <div className="ws-loading" role="status">
          <Spinner size="sm" aria-hidden /> Carregando…
        </div>
      ) : null}
      {account ? (
        <>
          <div className="account-photo">
            <ClientAvatar
              name={name || account.name || 'Você'}
              photoUrl={photo}
              size="lg"
              viewable
            />
            <div className="account-photo-actions">
              <Button variant="secondary" size="sm" onPress={() => input.current?.click()}>
                <Camera size={16} aria-hidden /> {photo ? 'Trocar foto' : 'Adicionar foto'}
              </Button>
              {photo ? (
                <Button variant="ghost" size="sm" onPress={() => setPhoto(null)}>
                  <Trash2 size={16} aria-hidden /> Remover
                </Button>
              ) : null}
            </div>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (!file) return
                setError('')
                void squarePhoto(file)
                  .then(setPhoto)
                  .catch((caught: unknown) =>
                    setError(
                      caught instanceof Error ? caught.message : 'Não foi possível usar a imagem.',
                    ),
                  )
              }}
            />
          </div>
          <div className="manager-form-grid">
            <TextInputField
              className="manager-field-wide"
              label="Nome"
              isRequired
              maxLength={120}
              value={name}
              onChange={setName}
            />
            <TextInputField
              label="E-mail de acesso"
              isDisabled
              value={account.email}
              description="Usado para entrar na sua conta Luminix."
              onChange={() => undefined}
            />
            <TextInputField
              label="Nível de acesso"
              isDisabled
              value={roleLabels[account.role] ?? account.role}
              onChange={() => undefined}
            />
          </div>
          <details className="account-change-email">
            <summary>Alterar e-mail de acesso</summary>
            <TextInputField
              label="Novo e-mail"
              type="email"
              inputMode="email"
              value={newEmail}
              onChange={setNewEmail}
            />
            <Button
              size="sm"
              variant="secondary"
              isDisabled={!newEmail.trim() || sendingEmail}
              onPress={() => void changeEmail()}
            >
              Enviar confirmação
            </Button>
            {emailMessage ? <p role="status">{emailMessage}</p> : null}
          </details>
        </>
      ) : null}
      {error ? (
        <p className="apt-error" role="alert">
          {error}
        </p>
      ) : null}
    </QuickModal>
  )
}
