'use client'

import { Button, Card, Popover, Skeleton, Spinner, Switch, Label, Tooltip } from '@heroui/react'
import { CircleAlert, CircleCheck, CircleHelp, RotateCcw, Save } from 'lucide-react'
import type { ReactNode } from 'react'
import './settings.css'

/** Click-to-open help: easier than hover for touch screens and less familiar users. */
export function HelpTip({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Popover>
      <Button
        className="settings-help"
        variant="ghost"
        size="sm"
        isIconOnly
        aria-label={`Ajuda: ${title}`}
      >
        <CircleHelp size={18} aria-hidden />
      </Button>
      <Popover.Content className="settings-help-popover" placement="top">
        <Popover.Dialog>
          <Popover.Heading className="settings-help-title">{title}</Popover.Heading>
          <div className="settings-help-body">{children}</div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

/** Short hint on hover/focus for icon-only actions. */
export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip delay={250}>
      {children}
      <Tooltip.Content className="settings-tooltip">{label}</Tooltip.Content>
    </Tooltip>
  )
}

export function SettingsCard({
  icon,
  title,
  description,
  help,
  badge,
  children,
  className,
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  help?: { title: string; text: ReactNode }
  badge?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={['manager-panel settings-card', className].filter(Boolean).join(' ')}>
      <header className="settings-card-head">
        <span className="settings-card-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <h3>
            {title}
            {help ? <HelpTip title={help.title}>{help.text}</HelpTip> : null}
          </h3>
          {description ? <p>{description}</p> : null}
        </div>
        {badge ? <div className="settings-card-badge">{badge}</div> : null}
      </header>
      <div className="settings-card-body">{children}</div>
    </Card>
  )
}

export function TextInput({
  label,
  icon,
  value,
  onChange,
  placeholder,
  hint,
  error,
  help,
  type = 'text',
  inputMode,
  autoComplete,
  maxLength,
  disabled,
  required,
  suffix,
  wide,
}: {
  label: string
  icon?: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: ReactNode
  error?: string
  help?: { title: string; text: ReactNode }
  type?: 'text' | 'email' | 'tel' | 'url'
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'url'
  autoComplete?: string
  maxLength?: number
  disabled?: boolean
  required?: boolean
  suffix?: ReactNode
  wide?: boolean
}) {
  return (
    <div className={`settings-field${wide ? ' is-wide' : ''}${error ? ' is-invalid' : ''}`}>
      <span className="settings-field-label">
        <label>
          {label}
          {required ? (
            <span className="settings-required" aria-label="obrigatório">
              *
            </span>
          ) : null}
        </label>
        {help ? <HelpTip title={help.title}>{help.text}</HelpTip> : null}
      </span>
      <span className="settings-input">
        {icon ? (
          <span className="settings-input-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <input
          aria-label={label}
          type={type}
          value={value}
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="settings-input-suffix">{suffix}</span> : null}
      </span>
      {error ? (
        <span className="settings-field-error" role="alert">
          <CircleAlert size={14} aria-hidden /> {error}
        </span>
      ) : hint ? (
        <span className="settings-field-hint">{hint}</span>
      ) : null}
    </div>
  )
}

export function ToggleRow({
  icon,
  title,
  description,
  isSelected,
  onChange,
  disabled,
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  isSelected: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="settings-toggle">
      {icon ? (
        <span className="settings-toggle-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <div className="settings-toggle-copy">
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      <Switch isSelected={isSelected} onChange={onChange} isDisabled={disabled} aria-label={title}>
        <Switch.Content>
          <Label className="sr-only">{title}</Label>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Content>
      </Switch>
    </div>
  )
}

export type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; message?: string }

/** Sticky bar: appears with pending changes and confirms the result in plain words. */
export function SaveBar({
  dirty,
  state,
  onSave,
  onDiscard,
  label = 'Salvar alterações',
}: {
  dirty: boolean
  state: SaveState
  onSave: () => void
  onDiscard: () => void
  label?: string
}) {
  if (!dirty && state.status === 'idle') return null
  return (
    <div
      className={`settings-savebar is-${state.status}${dirty ? ' is-dirty' : ''}`}
      role="region"
      aria-label="Salvar alterações"
    >
      <p role="status" aria-live="polite">
        {state.status === 'saving' ? (
          <>
            <Spinner size="sm" aria-hidden /> Salvando…
          </>
        ) : state.status === 'saved' && !dirty ? (
          <>
            <CircleCheck size={18} aria-hidden /> {state.message ?? 'Tudo salvo!'}
          </>
        ) : state.status === 'error' ? (
          <>
            <CircleAlert size={18} aria-hidden />{' '}
            {state.message ?? 'Não foi possível salvar. Tente de novo.'}
          </>
        ) : (
          'Você tem alterações que ainda não foram salvas.'
        )}
      </p>
      {dirty ? (
        <div className="settings-savebar-actions">
          <Button variant="ghost" onPress={onDiscard} isDisabled={state.status === 'saving'}>
            <RotateCcw size={16} aria-hidden /> Desfazer
          </Button>
          <Button onPress={onSave} isDisabled={state.status === 'saving'}>
            <Save size={16} aria-hidden /> {label}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function SettingsSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="settings-stack" role="status" aria-label="Carregando informações">
      {Array.from({ length: cards }, (_, index) => (
        <Card key={index} className="manager-panel settings-card">
          <div className="settings-card-head">
            <Skeleton className="settings-skeleton-icon" />
            <div className="settings-skeleton-lines">
              <Skeleton className="settings-skeleton-line is-title" />
              <Skeleton className="settings-skeleton-line" />
            </div>
          </div>
          <div className="settings-grid">
            {Array.from({ length: 4 }, (_, field) => (
              <div key={field} className="settings-skeleton-field">
                <Skeleton className="settings-skeleton-line is-label" />
                <Skeleton className="settings-skeleton-input" />
              </div>
            ))}
          </div>
        </Card>
      ))}
      <span className="sr-only">Carregando…</span>
    </div>
  )
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="manager-panel settings-card settings-load-error">
      <CircleAlert size={28} aria-hidden />
      <p role="alert">{message}</p>
      <Button onPress={onRetry}>
        <RotateCcw size={16} aria-hidden /> Tentar novamente
      </Button>
    </Card>
  )
}

/** Shown when a value was never filled in, instead of a blank field. */
export function Empty({ children }: { children: ReactNode }) {
  return <span className="settings-empty">{children}</span>
}

/** High-contrast status pill for the glass panels (HeroUI chips fade on dark themes). */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'on' | 'off' | 'info'
  children: ReactNode
}) {
  return <span className={`settings-pill is-${tone}`}>{children}</span>
}
