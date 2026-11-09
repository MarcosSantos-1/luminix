'use client'

import { Chip } from '@heroui/react'
import { Check, Clock3, Coins, Languages, Palette } from 'lucide-react'
import { useState } from 'react'
import { ThemePicker, useSpaceTheme } from '@/components/space-theme'
import { useStaff } from '@/components/staff-provider'
import type { SpaceTheme } from '@/lib/space-theme'
import { useClinicApi } from './clinic-api'
import { SettingsCard } from './settings-kit'

/** Simple inline flags: emoji flags do not render on Windows. */
function Flag({ code }: { code: 'br' | 'us' | 'es' }) {
  if (code === 'br')
    return (
      <svg viewBox="0 0 28 20" aria-hidden className="settings-flag">
        <rect width="28" height="20" rx="3" fill="#229e45" />
        <path d="M14 3 25 10 14 17 3 10Z" fill="#f8e509" />
        <circle cx="14" cy="10" r="4.2" fill="#2b49a3" />
        <path d="M10 9.4c2.6-.6 5.6-.2 8 1.2" stroke="#fff" strokeWidth=".8" fill="none" />
      </svg>
    )
  if (code === 'us')
    return (
      <svg viewBox="0 0 28 20" aria-hidden className="settings-flag">
        <rect width="28" height="20" rx="3" fill="#fff" />
        {[0, 2, 4, 6, 8, 10, 12].map((row) => (
          <rect key={row} y={(row * 20) / 13} width="28" height={20 / 13} fill="#b22234" />
        ))}
        <rect width="12" height="10.8" fill="#3c3b6e" />
      </svg>
    )
  return (
    <svg viewBox="0 0 28 20" aria-hidden className="settings-flag">
      <rect width="28" height="20" rx="3" fill="#c60b1e" />
      <rect y="5" width="28" height="10" fill="#ffc400" />
    </svg>
  )
}

const languages = [
  { id: 'pt-BR', flag: 'br', label: 'Português (Brasil)', ready: true },
  { id: 'en-US', flag: 'us', label: 'English', ready: false },
  { id: 'es-ES', flag: 'es', label: 'Español', ready: false },
] as const

export function PersonalizationSettings({ clinicId }: { clinicId: string }) {
  const api = useClinicApi(clinicId)
  const staff = useStaff()
  const { theme, setTheme } = useSpaceTheme()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function changeTheme(next: SpaceTheme) {
    if (saving) return
    setSaving(true)
    setMessage('')
    const previous = theme
    setTheme(next)
    try {
      await api.put('theme', { theme: next })
      setMessage('Tema salvo! As cores do painel já mudaram.')
      staff.refresh()
    } catch {
      setTheme(previous)
      setMessage('Não foi possível salvar o tema. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-stack">
      <SettingsCard
        icon={<Palette size={20} />}
        title="Cores do painel"
        description="Escolha as cores que você vê aqui no painel de gestão."
        help={{
          title: 'Muda as cores do meu site também?',
          text: 'Não. Este tema é só do painel. As cores do site são escolhidas em Vitrine e site → Editar site público.',
        }}
      >
        <ThemePicker value={theme} disabled={saving} onChange={(next) => void changeTheme(next)} />
        <p className="settings-muted" role="status">
          {saving ? 'Salvando tema…' : message}
        </p>
      </SettingsCard>

      <SettingsCard
        icon={<Languages size={20} />}
        title="Idioma"
        description="Idioma do painel e das mensagens para as clientes."
        help={{
          title: 'Quando terei outros idiomas?',
          text: 'Inglês e espanhol estão em preparação. Quando ficarem prontos, aparecem aqui para você escolher.',
        }}
      >
        <div className="settings-languages" role="radiogroup" aria-label="Idioma">
          {languages.map((language) => (
            <button
              key={language.id}
              type="button"
              role="radio"
              aria-checked={language.ready}
              disabled={!language.ready}
              className={`settings-language${language.ready ? ' is-selected' : ''}`}
            >
              <Flag code={language.flag} />
              <span>{language.label}</span>
              {language.ready ? (
                <Check size={16} aria-label="Em uso" />
              ) : (
                <Chip size="sm" variant="soft">
                  Em breve
                </Chip>
              )}
            </button>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        icon={<Clock3 size={20} />}
        title="Região"
        description="Usados para mostrar horários e preços corretamente."
      >
        <dl className="settings-facts">
          <div>
            <dt>
              <Clock3 size={15} aria-hidden /> Fuso horário
            </dt>
            <dd>Horário de Brasília</dd>
          </div>
          <div>
            <dt>
              <Coins size={15} aria-hidden /> Moeda
            </dt>
            <dd>Real (R$)</dd>
          </div>
        </dl>
      </SettingsCard>
    </div>
  )
}
