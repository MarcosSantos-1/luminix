'use client'

/* eslint-disable @next/next/no-img-element -- local data URL preview */

import { useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, Camera, Check, ClipboardCheck, RefreshCw } from 'lucide-react'
import {
  levelNames,
  minutesFor,
  missingSteps,
  questionVisible,
  stepComplete,
  stepsFor,
  type AnamnesisRecord,
  type Answers,
  type AnswerValue,
  type Level,
  type Question,
} from '@luminix/contracts/anamnesis'
import type { SpaceSummary } from '../../lib/client-app/types'
import { SpaceLogo } from './ui'

export type WizardMode = 'new' | 'upgrade' | 'renew' | 'edit'

/** Square, small JPEG: enough for the record and light enough for the API. */
async function toPortrait(file: File) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 360
  canvas
    .getContext('2d')!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      360,
      360,
    )
  return canvas.toDataURL('image/jpeg', 0.82)
}

function QuestionField({
  question,
  answers,
  set,
}: {
  question: Question
  answers: Answers
  set: (key: string, value: AnswerValue | undefined) => void
}) {
  if (!questionVisible(question, answers)) return null
  switch (question.kind) {
    case 'choice':
      return (
        <fieldset className="aw-field">
          {question.label && <legend>{question.label}</legend>}
          <div className="aw-options" data-count={question.options.length}>
            {question.options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={answers[question.key] === option.value}
                onClick={() => set(question.key, option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      )
    case 'yesno':
      return (
        <fieldset className="aw-field">
          <legend>{question.label}</legend>
          <div className="aw-options" data-count="2">
            {(
              [
                ['no', 'Não'],
                ['yes', 'Sim'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={answers[question.key] === value}
                onClick={() => set(question.key, value)}
              >
                {label}
              </button>
            ))}
          </div>
          {question.details && answers[question.key] === 'yes' && (
            <input
              className="aw-reveal"
              autoFocus
              value={String(answers[question.details.key] ?? '')}
              placeholder={question.details.placeholder}
              maxLength={300}
              onChange={(event) => set(question.details!.key, event.target.value)}
            />
          )}
        </fieldset>
      )
    case 'multi': {
      const selected = (answers[question.key] as string[] | undefined) ?? []
      return (
        <fieldset className="aw-field">
          {question.label && <legend>{question.label}</legend>}
          <div className="aw-chips">
            {question.options.map((option) => {
              const on = selected.includes(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set(
                      question.key,
                      on
                        ? selected.filter((value) => value !== option.value)
                        : [...selected, option.value],
                    )
                  }
                >
                  {on && <Check size={14} aria-hidden />} {option.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      )
    }
    case 'toggles':
      return (
        <fieldset className="aw-field">
          {question.label && <legend>{question.label}</legend>}
          <div className="aw-toggles">
            {question.items.map((item) => {
              const on = answers[item.key] === true
              return (
                <div key={item.key}>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => set(item.key, !on)}
                  >
                    <span>{item.label}</span>
                    <i aria-hidden />
                  </button>
                  {item.details && on && (
                    <input
                      className="aw-reveal"
                      value={String(answers[item.details.key] ?? '')}
                      placeholder={item.details.placeholder}
                      maxLength={300}
                      onChange={(event) => set(item.details!.key, event.target.value)}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <small>Nada se aplica? É só continuar.</small>
        </fieldset>
      )
    case 'date':
      return (
        <label className="aw-field">
          <span className="aw-legend">{question.label}</span>
          <input
            type="date"
            value={String(answers[question.key] ?? '')}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => set(question.key, event.target.value)}
          />
        </label>
      )
    case 'counter': {
      const value = Number(answers[question.key] ?? 3)
      return (
        <div className="aw-field">
          <span className="aw-legend">{question.label}</span>
          <div className="aw-counter">
            <button
              type="button"
              aria-label="Menos"
              onClick={() => set(question.key, Math.max(question.min, value - 1))}
            >
              −
            </button>
            <output>
              {value}
              {question.unit}
            </output>
            <button
              type="button"
              aria-label="Mais"
              onClick={() => set(question.key, Math.min(question.max, value + 1))}
            >
              +
            </button>
          </div>
        </div>
      )
    }
    default:
      return null
  }
}

export function AnamnesisWizard({
  mode,
  level,
  initial,
  space,
  saving,
  error,
  onSave,
  onCancel,
}: {
  mode: WizardMode
  level: Level
  initial: AnamnesisRecord | null
  /** Space that asked for it; null for the account record. */
  space: SpaceSummary | null
  saving: boolean
  error: string
  onSave: (record: { level: Level; answers: Answers; photo: string }) => void
  onCancel?: () => void
}) {
  const [answers, setAnswers] = useState<Answers>(
    mode === 'new' ? {} : { ...(initial?.answers ?? {}) },
  )
  const [photo, setPhoto] = useState(mode === 'new' ? '' : (initial?.photo ?? ''))
  // Upgrades ask only what is missing; renewals and edits go through everything, prefilled.
  const [plan] = useState(() =>
    mode === 'upgrade'
      ? missingSteps(level, initial?.answers ?? {}, initial?.photo).map((step) => step.id)
      : null,
  )
  const [index, setIndex] = useState(-1)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [consent, setConsent] = useState(false)
  const [problem, setProblem] = useState('')

  const visible = stepsFor(level, answers).filter((step) => !plan || plan.includes(step.id))
  const total = visible.length
  const step = index >= 0 && index < total ? visible[index] : null
  const atConsent = index >= total

  function set(key: string, value: AnswerValue | undefined) {
    setProblem('')
    setAnswers((current) => {
      const next = { ...current }
      if (value === undefined || value === '') delete next[key]
      else next[key] = value
      return next
    })
  }

  function go(to: number) {
    setDirection(to > index ? 1 : -1)
    setProblem('')
    setIndex(to)
  }

  function next() {
    if (step && !stepComplete(step, answers, photo)) return setProblem('Responda para continuar.')
    go(index + 1)
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setPhoto(await toPortrait(file))
      setProblem('')
    } catch {
      setProblem('Não foi possível ler essa imagem. Tente outra foto.')
    }
  }

  const who = space?.name ?? 'os espaços que você permitir'
  const intro = {
    new: {
      title: space ? `${space.name} pede uma ficha` : 'Sua ficha Luminix',
      body: `${total} etapas rápidas, cerca de ${minutesFor(total)} min. Você responde uma vez e reaproveita nos espaços que quiser.`,
    },
    upgrade: {
      title: 'Faltam só algumas perguntas',
      body: `${space?.name ?? 'Este espaço'} pede a ${levelNames[level].toLowerCase()}. Seus dados básicos já estão aqui: são ${total} etapas, cerca de ${minutesFor(total)} min.`,
    },
    renew: {
      title: 'Hora de atualizar sua ficha',
      body: 'Fichas de saúde valem um ano. Suas respostas já estão preenchidas: confira, ajuste o que mudou e confirme.',
    },
    edit: {
      title: 'Revisar sua ficha',
      body: 'Suas respostas estão preenchidas. Mude o que quiser.',
    },
  }[mode]

  return (
    <div className="aw">
      <header className="aw-top">
        {index >= 0 ? (
          <button
            type="button"
            className="ca-icon-button"
            aria-label="Voltar"
            onClick={() => go(index - 1)}
          >
            <ArrowLeft size={18} aria-hidden />
          </button>
        ) : onCancel ? (
          <button type="button" className="ca-icon-button" aria-label="Fechar" onClick={onCancel}>
            <ArrowLeft size={18} aria-hidden />
          </button>
        ) : (
          <span className="ca-wordmark">Luminix</span>
        )}
        {space ? (
          <span className="ca-flow-space">
            <SpaceLogo space={space} size={28} /> {space.name}
          </span>
        ) : (
          <span className="ca-flow-space">{levelNames[level]}</span>
        )}
      </header>

      {index >= 0 && (
        <div
          className="aw-progress"
          aria-label={`Etapa ${Math.min(index + 1, total + 1)} de ${total + 1}`}
        >
          <span style={{ transform: `scaleX(${Math.min(index + 1, total + 1) / (total + 1)})` }} />
        </div>
      )}

      <section key={index} className="aw-stage" data-direction={direction} aria-live="polite">
        {index < 0 && (
          <div className="aw-intro">
            <span className="aw-intro-icon">
              {mode === 'renew' ? (
                <RefreshCw size={30} aria-hidden />
              ) : (
                <ClipboardCheck size={30} aria-hidden />
              )}
            </span>
            <p className="aw-kicker">{levelNames[level]}</p>
            <h1>{intro.title}</h1>
            <p className="ca-lead">{intro.body}</p>
            <ul className="aw-promises">
              <li>Uma pergunta por vez, sem textos longos.</li>
              <li>Só {who} verá as respostas.</li>
              {level > 1 && <li>Fichas de saúde são confirmadas uma vez por ano.</li>}
            </ul>
          </div>
        )}

        {step && (
          <div className="aw-step">
            <h1>{step.title}</h1>
            <p className="ca-lead">{step.subtitle}</p>
            {step.questions.map((question, position) =>
              question.kind === 'photo' ? (
                <label key="photo" className="ca-photo aw-photo">
                  {photo ? <img src={photo} alt="Sua foto" /> : <Camera size={34} aria-hidden />}
                  <span>{photo ? 'Trocar foto' : 'Tirar ou escolher foto'}</span>
                  <input type="file" accept="image/*" capture="user" onChange={pickPhoto} />
                </label>
              ) : (
                <QuestionField key={position} question={question} answers={answers} set={set} />
              ),
            )}
          </div>
        )}

        {atConsent && (
          <div className="aw-step">
            <h1>Último passo</h1>
            <p className="ca-lead">Confirme para salvar sua ficha.</p>
            <label className="ca-check ca-permission">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                <strong>As informações são verdadeiras</strong>
                Autorizo {who} a usar estas respostas no meu atendimento e vou atualizá-las se algo
                mudar.
              </span>
            </label>
          </div>
        )}
      </section>

      <footer className="aw-actions">
        <p className="ca-error" role="alert">
          {problem || error}
        </p>
        {index < 0 ? (
          <>
            <button type="button" className="ca-button" onClick={() => go(0)}>
              {mode === 'renew' ? 'Revisar respostas' : 'Começar'}{' '}
              <ArrowRight size={18} aria-hidden />
            </button>
            {mode === 'renew' && (
              <button type="button" className="ca-button ghost" onClick={() => go(total)}>
                Nada mudou, confirmar
              </button>
            )}
          </>
        ) : atConsent ? (
          <button
            type="button"
            className="ca-button"
            disabled={!consent || saving}
            onClick={() => onSave({ level, answers, photo })}
          >
            {saving ? 'Salvando…' : 'Salvar ficha'} <Check size={18} aria-hidden />
          </button>
        ) : (
          <button type="button" className="ca-button" onClick={next}>
            Continuar <ArrowRight size={18} aria-hidden />
          </button>
        )}
      </footer>
    </div>
  )
}
