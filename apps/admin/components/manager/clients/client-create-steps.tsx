'use client'

import { Check, ChevronDown, Pencil } from 'lucide-react'
import { useState } from 'react'
import { DateWheelPicker } from '@/components/ui/date-wheel-picker'
import { CheckboxField, TextAreaField, TextInputField } from '@/components/ui/fields'

export type CreateStep = 'who' | 'about' | 'contact' | 'care' | 'anamnesis' | 'review'
export type ClientDraft = {
  name: string
  phone: string
  email: string
  taxId: string
  sex: 'female' | 'male' | ''
  birthDate: string
  marketingOptIn: boolean
  notes: string
}

export const createSteps: { id: CreateStep; label: string; emoji: string; optional: boolean }[] = [
  { id: 'who', label: 'Quem é', emoji: '👤', optional: false },
  { id: 'about', label: 'Sobre ela', emoji: '🎂', optional: true },
  { id: 'contact', label: 'Contato', emoji: '💌', optional: true },
  { id: 'care', label: 'Cuidados', emoji: '🩺', optional: true },
  { id: 'anamnesis', label: 'Anamnese', emoji: '📋', optional: true },
  { id: 'review', label: 'Revisar', emoji: '✅', optional: false },
]

/** Editing reuses the same steps; the anamnesis has its own place in the client's record. */
export function stepsFor(editing: boolean) {
  return editing ? createSteps.filter((item) => item.id !== 'anamnesis') : createSteps
}

/** WhatsApp is required: Brazilian number with area code, or + and a country code. */
export function phoneOk(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return phone.trim().startsWith('+') ? digits.length >= 8 : digits.length >= 10
}

const careChips = [
  '🤧 Alergia',
  '🤰 Gestante',
  '🌸 Pele sensível',
  '💊 Usa medicamento',
  '🩸 Diabetes',
  '❤️ Pressão alta',
  '🧴 Usa ácidos',
  '🕐 Prefere manhã',
]

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
const ageOf = (iso: string) => {
  const birth = new Date(`${iso}T12:00:00`)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  )
    age -= 1
  return age
}
const isoOf = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Birth date with an iOS-like wheel: no keyboard popping up on the phone. */
function BirthWheel({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(!value)
  const max = new Date().getFullYear()
  return (
    <div className="cc-birth">
      <span className="cc-label">Data de nascimento</span>
      <button
        type="button"
        className={`cc-birth-value${value ? ' is-set' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden>🎂</span>
        <span>
          {value ? (
            <>
              <strong>{longDate(value)}</strong>
              <small>{ageOf(value)} anos · lembramos o aniversário no Marketing</small>
            </>
          ) : (
            <>
              <strong>Escolher a data</strong>
              <small>Gire as rodinhas, como no celular</small>
            </>
          )}
        </span>
        <ChevronDown size={18} aria-hidden className="cc-birth-chevron" />
      </button>
      {open ? (
        <div className="cc-wheel">
          <DateWheelPicker
            value={value ? new Date(`${value}T12:00:00`) : new Date(1990, 5, 15)}
            onChange={(date) => onChange(isoOf(date))}
            minYear={max - 100}
            maxYear={max}
          />
          <div className="cc-wheel-foot">
            {value ? (
              <button type="button" onClick={() => onChange('')}>
                Limpar
              </button>
            ) : (
              <span />
            )}
            <button type="button" className="is-primary" onClick={() => setOpen(false)}>
              <Check size={15} aria-hidden /> Pronto
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * "Adicionar cliente" in steps, one subject per screen (easy on the phone). Only the name is
 * required; every other step can be skipped and completed later in the client's record.
 */
export function ClientCreateSteps({
  step,
  form,
  setForm,
  taxIdError,
  emailError,
  anamnesisLabel,
  anamnesisSteps,
  onGoTo,
  onStartAnamnesis,
  onSkipAnamnesis,
  formatPhone,
  formatTaxId,
  editing = false,
}: {
  step: CreateStep
  form: ClientDraft
  setForm: (form: ClientDraft) => void
  taxIdError?: string
  emailError?: string
  anamnesisLabel: string
  anamnesisSteps: number
  onGoTo: (step: CreateStep) => void
  onStartAnamnesis: () => void
  onSkipAnamnesis: () => void
  formatPhone: (value: string) => string
  formatTaxId: (value: string) => string
  /** "Editar cliente": same screens, without the anamnesis step. */
  editing?: boolean
}) {
  const steps = stepsFor(editing)
  const position = steps.findIndex((item) => item.id === step)
  const ready = Boolean(form.name.trim()) && phoneOk(form.phone)
  const first = form.name.trim().split(/\s+/)[0] || 'a cliente'
  const care = form.notes
  const summary = [
    {
      step: 'who' as const,
      emoji: '👤',
      text: form.name.trim() || 'Sem nome',
      detail: form.phone || 'Sem WhatsApp',
      done: ready,
    },
    {
      step: 'about' as const,
      emoji: '🎂',
      text: form.birthDate ? longDate(form.birthDate) : 'Nascimento',
      detail:
        [
          form.birthDate ? `${ageOf(form.birthDate)} anos` : '',
          form.sex === 'female' ? 'Feminino' : form.sex === 'male' ? 'Masculino' : '',
          form.taxId ? `CPF ${form.taxId}` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'Pode completar depois',
      done: Boolean(form.birthDate || form.sex || form.taxId),
    },
    {
      step: 'contact' as const,
      emoji: '💌',
      text: form.email || 'E-mail',
      detail: form.marketingOptIn ? 'Aceita receber mensagens' : 'Sem aceite de mensagens',
      done: Boolean(form.email || form.marketingOptIn),
    },
    {
      step: 'care' as const,
      emoji: '🩺',
      text: form.notes ? 'Cuidados anotados' : 'Cuidados e observações',
      detail: form.notes ? form.notes.slice(0, 60) : 'Pode completar depois',
      done: Boolean(form.notes.trim()),
    },
  ]

  return (
    <div className="cc">
      <ol className="cc-steps" aria-label="Etapas">
        {steps.map((item, index) => (
          <li
            key={item.id}
            data-state={index < position ? 'done' : index === position ? 'now' : 'next'}
          >
            <button
              type="button"
              disabled={!ready && index > 0}
              onClick={() => onGoTo(item.id)}
              aria-current={index === position ? 'step' : undefined}
            >
              <span aria-hidden>{index < position ? '✓' : item.emoji}</span>
              <small>{item.label}</small>
            </button>
          </li>
        ))}
      </ol>

      {step === 'who' ? (
        <section className="cc-step">
          <h3>{editing ? `Quem é ${first}` : 'Quem é a cliente?'}</h3>
          <p className="cc-hint">
            Nome e WhatsApp são obrigatórios. O resto dá para completar depois.
          </p>
          <TextInputField
            label="Nome"
            isRequired
            autoFocus
            maxLength={160}
            placeholder="Ex.: Maria da Silva"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
          />
          <TextInputField
            label="WhatsApp"
            isRequired
            type="tel"
            inputMode="tel"
            placeholder="(11) 98765-4321"
            value={form.phone}
            description="Com DDD. Confirmações e lembretes saem por aqui."
            onChange={(phone) =>
              setForm({ ...form, phone: phone.startsWith('+') ? phone : formatPhone(phone) })
            }
          />
        </section>
      ) : null}

      {step === 'about' ? (
        <section className="cc-step">
          <h3>Sobre {first}</h3>
          <p className="cc-hint">
            Tudo opcional. Ajuda a lembrar o aniversário e evita cadastro repetido.
          </p>
          <BirthWheel
            value={form.birthDate}
            onChange={(birthDate) => setForm({ ...form, birthDate })}
          />
          <span className="cc-label">Sexo biológico</span>
          <div className="cc-choice" role="radiogroup" aria-label="Sexo biológico">
            {(
              [
                ['female', '👩 Feminino'],
                ['male', '👨 Masculino'],
                ['', '🤐 Não informar'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={form.sex === id}
                onClick={() => setForm({ ...form, sex: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <TextInputField
            label="CPF"
            inputMode="numeric"
            placeholder="000.000.000-00"
            maxLength={14}
            value={form.taxId}
            error={taxIdError}
            description="Opcional. Evita cadastro repetido."
            onChange={(taxId) => setForm({ ...form, taxId: formatTaxId(taxId) })}
          />
        </section>
      ) : null}

      {step === 'contact' ? (
        <section className="cc-step">
          <h3>Como falar com {first}</h3>
          <TextInputField
            label="E-mail"
            type="email"
            inputMode="email"
            maxLength={254}
            placeholder="nome@email.com"
            value={form.email}
            error={emailError}
            onChange={(email) => setForm({ ...form, email })}
          />
          <div className="cc-consent">
            <CheckboxField
              isSelected={form.marketingOptIn}
              onChange={(marketingOptIn) => setForm({ ...form, marketingOptIn })}
              label="💬 Aceita receber mensagens do espaço"
              description="Promoções e novidades. Marque só se ela concordou; a data do aceite fica registrada."
            />
          </div>
        </section>
      ) : null}

      {step === 'care' ? (
        <section className="cc-step">
          <h3>Algum cuidado especial?</h3>
          <p className="cc-hint">
            Toque no que se aplica. Aparece em destaque na ficha e no atendimento.
          </p>
          <div className="cc-chips">
            {careChips.map((chip) => {
              const on = care.includes(chip)
              return (
                <button
                  key={chip}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setForm({
                      ...form,
                      notes: on
                        ? care
                            .split('\n')
                            .filter((line) => line.trim() !== chip)
                            .join('\n')
                            .trim()
                        : [care.trim(), chip].filter(Boolean).join('\n'),
                    })
                  }
                >
                  {chip}
                </button>
              )
            })}
          </div>
          <TextAreaField
            label="Observações"
            rows={4}
            maxLength={4000}
            placeholder="Ex.: alergia a látex, prefere a Ana, chega sempre 10 min antes…"
            value={form.notes}
            onChange={(notes) => setForm({ ...form, notes })}
          />
        </section>
      ) : null}

      {step === 'anamnesis' ? (
        <section className="cc-step">
          <h3>Anamnese</h3>
          <p className="cc-hint">
            {anamnesisLabel} · {anamnesisSteps} etapas rápidas. Pode ficar para depois: ela também
            pode preencher pelo app.
          </p>
          <div className="cc-options">
            <button type="button" onClick={onStartAnamnesis}>
              <span aria-hidden>📋</span>
              <strong>Preencher agora</strong>
              <small>Com a cliente aqui, uma pergunta por vez</small>
            </button>
            <button type="button" onClick={onSkipAnamnesis}>
              <span aria-hidden>⏭️</span>
              <strong>Depois, pela ficha</strong>
              <small>O cadastro fica pronto e a anamnese pendente</small>
            </button>
          </div>
        </section>
      ) : null}

      {step === 'review' ? (
        <section className="cc-step">
          <h3>{editing ? 'Confira e salve ✨' : 'Tudo certo? ✨'}</h3>
          <p className="cc-hint">
            Toque em uma parte para mudar. O que ficou vazio pode ser completado na ficha.
          </p>
          <ul className="cc-review">
            {summary.map((item) => (
              <li key={item.step}>
                <button type="button" onClick={() => onGoTo(item.step)}>
                  <span aria-hidden>{item.emoji}</span>
                  <span>
                    <strong>{item.text}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <i data-done={item.done || undefined}>{item.done ? '✓' : 'depois'}</i>
                  <Pencil size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
