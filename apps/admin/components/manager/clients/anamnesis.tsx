'use client'

import {
  Check,
  ClipboardCheck,
  OctagonAlert,
  ShieldCheck,
  Target,
  TriangleAlert,
} from 'lucide-react'
import {
  anamnesisAlerts,
  anamnesisGoals,
  expiresAt,
  levelNames,
  questionVisible,
  steps as allSteps,
  stepsFor,
  type Answers,
  type AnswerValue,
  type Level,
  type Question,
  type Step,
} from '@luminix/contracts/anamnesis'
import { dateBr } from '../business/format'
import './clients.css'

export type StaffAnamnesis = {
  version?: number
  level: Level
  answeredAt: string
  answers: Answers
}
export type AnamnesisSummary = { level: Level; answeredAt: string; by: 'client' | 'staff' } | null

const answered = (value: AnswerValue | undefined) =>
  value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)

/** The shared script without the photo: the team already has the client's photo on the record. */
export function staffSteps(level: Level, answers: Answers): Step[] {
  return stepsFor(level, answers).filter((step) => step.id !== 'photo')
}

export function staffStepComplete(step: Step, answers: Answers) {
  return step.required.every((key) => key === 'photo' || answered(answers[key]))
}

/** Valid (and not expired) for the level the space asks. */
export function anamnesisState(summary: AnamnesisSummary, required: Level) {
  if (!summary) return 'missing' as const
  if (summary.level < required) return 'incomplete' as const
  const end = expiresAt({ level: summary.level, answeredAt: summary.answeredAt })
  if (end && end.getTime() < Date.now()) return 'expired' as const
  return 'ok' as const
}

export function AnamnesisBadge({
  summary,
  required,
}: {
  summary: AnamnesisSummary
  required: Level
}) {
  const state = anamnesisState(summary, required)
  if (state === 'missing') return null
  return (
    <span
      className={`anm-badge is-${state}`}
      title={
        state === 'ok'
          ? `${levelNames[summary!.level]} preenchida em ${dateBr(summary!.answeredAt)}`
          : state === 'expired'
            ? 'Ficha vencida: confirme as respostas'
            : 'Ficha abaixo do nível que o espaço pede'
      }
    >
      {state === 'ok' ? (
        <ShieldCheck size={13} aria-hidden />
      ) : (
        <ClipboardCheck size={13} aria-hidden />
      )}
      {state === 'ok'
        ? 'Anamnese preenchida'
        : state === 'expired'
          ? 'Anamnese vencida'
          : 'Anamnese incompleta'}
    </span>
  )
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
        <fieldset className="anm-field">
          {question.label ? <legend>{question.label}</legend> : null}
          <div className="anm-options">
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
        <fieldset className="anm-field">
          <legend>{question.label}</legend>
          <div className="anm-options">
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
          {question.details && answers[question.key] === 'yes' ? (
            <input
              className="anm-reveal"
              value={String(answers[question.details.key] ?? '')}
              placeholder={question.details.placeholder}
              maxLength={300}
              onChange={(event) => set(question.details!.key, event.target.value)}
            />
          ) : null}
        </fieldset>
      )
    case 'multi': {
      const selected = (answers[question.key] as string[] | undefined) ?? []
      return (
        <fieldset className="anm-field">
          {question.label ? <legend>{question.label}</legend> : null}
          <div className="anm-chips">
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
                  {on ? <Check size={13} aria-hidden /> : null} {option.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      )
    }
    case 'toggles':
      return (
        <fieldset className="anm-field">
          {question.label ? <legend>{question.label}</legend> : null}
          <div className="anm-toggles">
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
                  {item.details && on ? (
                    <input
                      className="anm-reveal"
                      value={String(answers[item.details.key] ?? '')}
                      placeholder={item.details.placeholder}
                      maxLength={300}
                      onChange={(event) => set(item.details!.key, event.target.value)}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
          <small>Nada se aplica? É só continuar.</small>
        </fieldset>
      )
    case 'date':
      return (
        <label className="anm-field">
          <span className="anm-legend">{question.label}</span>
          <input
            type="date"
            className="anm-date"
            value={String(answers[question.key] ?? '')}
            max={new Date().toLocaleDateString('en-CA')}
            onChange={(event) => set(question.key, event.target.value)}
          />
        </label>
      )
    case 'counter': {
      const value = Number(answers[question.key] ?? 3)
      return (
        <div className="anm-field">
          <span className="anm-legend">{question.label}</span>
          <div className="anm-counter">
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

/** One step of the script, controlled by the parent (the modal owns the footer buttons). */
export function AnamnesisStep({
  step,
  answers,
  onChange,
}: {
  step: Step
  answers: Answers
  onChange: (answers: Answers) => void
}) {
  function set(key: string, value: AnswerValue | undefined) {
    const next = { ...answers }
    if (value === undefined || value === '') delete next[key]
    else next[key] = value
    onChange(next)
  }
  return (
    <div className="anm-step">
      <h3>{step.title}</h3>
      <p>{step.subtitle}</p>
      {step.questions.map((question, position) => (
        <QuestionField key={position} question={question} answers={answers} set={set} />
      ))}
    </div>
  )
}

/** Label of an answer value for the read-only view. */
function answerText(question: Question, answers: Answers): { label: string; value: string }[] {
  const yes = (value: AnswerValue | undefined) =>
    value === 'yes' ? 'Sim' : value === 'no' ? 'Não' : value === 'unknown' ? 'Não sei' : ''
  switch (question.kind) {
    case 'choice': {
      const value = answers[question.key]
      const option = question.options.find((item) => item.value === value)
      return option ? [{ label: question.label ?? 'Resposta', value: option.label }] : []
    }
    case 'yesno': {
      const value = yes(answers[question.key])
      if (!value) return []
      const detail = question.details ? answers[question.details.key] : undefined
      return [{ label: question.label, value: detail ? `${value} — ${String(detail)}` : value }]
    }
    case 'multi': {
      const selected = (answers[question.key] as string[] | undefined) ?? []
      const labels = question.options
        .filter((option) => selected.includes(option.value))
        .map((option) => option.label)
      return labels.length ? [{ label: question.label ?? 'Itens', value: labels.join(', ') }] : []
    }
    case 'toggles':
      return question.items
        .filter((item) => answers[item.key] === true)
        .map((item) => ({
          label: item.label,
          value:
            item.details && answers[item.details.key] ? String(answers[item.details.key]) : 'Sim',
        }))
    case 'date':
      return answers[question.key]
        ? [{ label: question.label, value: dateBr(String(answers[question.key])) }]
        : []
    case 'counter':
      return answers[question.key] !== undefined
        ? [{ label: question.label, value: `${answers[question.key]}${question.unit}` }]
        : []
    default:
      return []
  }
}

/**
 * Contraindications and points of care, the strongest first, plus what the client wants.
 * `compact` drops the hints (appointment sheet); returns nothing when there is nothing to flag.
 */
export function AnamnesisAlerts({ answers, compact }: { answers: Answers; compact?: boolean }) {
  const alerts = anamnesisAlerts(answers)
  const { goals, regions } = anamnesisGoals(answers)
  if (!alerts.length && !goals.length) return null
  return (
    <div className={`anm-alerts${compact ? ' is-compact' : ''}`}>
      {alerts.length ? (
        <ul aria-label="Alertas da anamnese">
          {alerts.map((alert) => (
            <li key={alert.key} className={`is-${alert.tone}`} title={alert.hint}>
              {alert.tone === 'stop' ? (
                <OctagonAlert size={15} aria-hidden />
              ) : (
                <TriangleAlert size={15} aria-hidden />
              )}
              <span>
                <strong>{alert.label}</strong>
                {compact ? null : <small>{alert.hint}</small>}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {goals.length ? (
        <p className="anm-goals">
          <Target size={15} aria-hidden />
          <span>
            <strong>Objetivos:</strong> {goals.join(', ')}
            {regions.length ? <small> · {regions.join(', ')}</small> : null}
          </span>
        </p>
      ) : null}
      {alerts.length && !compact ? (
        <p className="anm-alerts-note">
          Apoio para a equipe. A avaliação da profissional e, na dúvida, a liberação médica vêm
          primeiro.
        </p>
      ) : null}
    </div>
  )
}

/** The filled record as a short, scannable summary grouped by step. */
export function AnamnesisView({ record }: { record: StaffAnamnesis }) {
  const groups = allSteps
    .filter((step) => step.level <= record.level && step.id !== 'photo')
    .map((step) => ({
      step,
      rows: step.questions.flatMap((question) => answerText(question, record.answers)),
    }))
    .filter((group) => group.rows.length)
  return (
    <div className="anm-view">
      <AnamnesisAlerts answers={record.answers} />
      {groups.map(({ step, rows }) => (
        <section key={step.id}>
          <h4>{step.title}</h4>
          <dl>
            {rows.map((row, index) => (
              <div key={`${row.label}-${index}`}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

export { levelNames }
