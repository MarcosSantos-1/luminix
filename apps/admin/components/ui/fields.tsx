'use client'

/**
 * Form fields for the manager panel, all built on HeroUI (no native selects, date pickers or
 * raw inputs). Values stay simple strings so screens do not deal with date libraries:
 * dates are 'YYYY-MM-DD' and times 'HH:MM'.
 */
import {
  Calendar,
  Checkbox,
  ComboBox,
  DateField,
  Input,
  DatePicker,
  I18nProvider,
  InputGroup,
  Label,
  ListBox,
  SearchField,
  Select,
  TextArea,
  TextField,
  TimeField,
} from '@heroui/react'
import { parseDate, parseTime, type CalendarDate, type Time } from '@internationalized/date'
import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import './fields.css'

type Common = {
  label?: ReactNode
  /** Accessible name when the label is not shown. */
  ariaLabel?: string
  description?: ReactNode
  error?: string
  help?: ReactNode
  isDisabled?: boolean
  isRequired?: boolean
  className?: string
}

function Hint({ description, error }: Pick<Common, 'description' | 'error'>) {
  if (error)
    return (
      <span className="lx-field-error" role="alert">
        <CircleAlert size={14} aria-hidden /> {error}
      </span>
    )
  return description ? <span className="lx-field-hint">{description}</span> : null
}

function FieldLabel({ label, help, isRequired }: Pick<Common, 'label' | 'help' | 'isRequired'>) {
  if (!label) return null
  return (
    <span className="lx-field-label">
      <Label>
        {label}
        {isRequired ? (
          <span className="lx-required" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {help}
    </span>
  )
}

export function TextInputField({
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
  autoComplete,
  maxLength,
  prefix,
  suffix,
  onEnter,
  autoFocus,
  ...common
}: Common & {
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'tel' | 'url' | 'password'
  placeholder?: string
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal' | 'url'
  autoComplete?: string
  maxLength?: number
  prefix?: ReactNode
  suffix?: ReactNode
  onEnter?: () => void
  autoFocus?: boolean
}) {
  return (
    <div
      className={['lx-field', common.error ? 'is-invalid' : '', common.className]
        .filter(Boolean)
        .join(' ')}
    >
      <TextField
        fullWidth
        type={type}
        value={value}
        onChange={onChange}
        isDisabled={common.isDisabled}
        isRequired={common.isRequired}
        isInvalid={Boolean(common.error)}
        aria-label={
          common.ariaLabel ?? (typeof common.label === 'string' ? common.label : undefined)
        }
      >
        <FieldLabel label={common.label} help={common.help} isRequired={common.isRequired} />
        <InputGroup fullWidth>
          {prefix ? <InputGroup.Prefix>{prefix}</InputGroup.Prefix> : null}
          <InputGroup.Input
            placeholder={placeholder}
            inputMode={inputMode}
            autoComplete={autoComplete}
            maxLength={maxLength}
            autoFocus={autoFocus}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && onEnter) {
                event.preventDefault()
                onEnter()
              }
            }}
          />
          {suffix ? <InputGroup.Suffix>{suffix}</InputGroup.Suffix> : null}
        </InputGroup>
      </TextField>
      <Hint description={common.description} error={common.error} />
    </div>
  )
}

export function TextAreaField({
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 3,
  ...common
}: Common & {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  rows?: number
}) {
  return (
    <div
      className={['lx-field', common.error ? 'is-invalid' : '', common.className]
        .filter(Boolean)
        .join(' ')}
    >
      <TextField
        fullWidth
        value={value}
        onChange={onChange}
        isDisabled={common.isDisabled}
        isInvalid={Boolean(common.error)}
        aria-label={
          common.ariaLabel ?? (typeof common.label === 'string' ? common.label : undefined)
        }
      >
        <FieldLabel label={common.label} help={common.help} isRequired={common.isRequired} />
        <TextArea fullWidth placeholder={placeholder} maxLength={maxLength} rows={rows} />
      </TextField>
      <Hint
        description={common.description ?? (maxLength ? `${value.length}/${maxLength}` : undefined)}
        error={common.error}
      />
    </div>
  )
}

export type SelectOption = { id: string; label: string; description?: string }

export function SelectField({
  value,
  onChange,
  options,
  placeholder = 'Escolha',
  icon,
  ...common
}: Common & {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  icon?: ReactNode
}) {
  return (
    <div
      className={['lx-field', common.error ? 'is-invalid' : '', common.className]
        .filter(Boolean)
        .join(' ')}
    >
      <Select
        fullWidth
        selectedKey={value || null}
        placeholder={placeholder}
        isDisabled={common.isDisabled}
        isRequired={common.isRequired}
        isInvalid={Boolean(common.error)}
        aria-label={
          common.ariaLabel ?? (typeof common.label === 'string' ? common.label : undefined)
        }
        onSelectionChange={(key) => {
          if (key != null) onChange(String(key))
        }}
      >
        <FieldLabel label={common.label} help={common.help} isRequired={common.isRequired} />
        <Select.Trigger className={icon ? 'has-icon' : undefined}>
          {icon ? (
            <span className="lx-select-icon" aria-hidden>
              {icon}
            </span>
          ) : null}
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover className="lx-popover">
          <ListBox>
            {options.map((option) => (
              <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
                {option.description ? (
                  <span className="lx-option">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                ) : (
                  option.label
                )}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Hint description={common.description} error={common.error} />
    </div>
  )
}

function toDate(value: string | null | undefined): CalendarDate | null {
  if (!value) return null
  try {
    return parseDate(value.slice(0, 10))
  } catch {
    return null
  }
}

/** Date with typing (dd/mm/aaaa) and a calendar popover. Empty value is allowed. */
export function DateInputField({
  value,
  onChange,
  min,
  max,
  ...common
}: Common & {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
}) {
  return (
    <div
      className={['lx-field', common.error ? 'is-invalid' : '', common.className]
        .filter(Boolean)
        .join(' ')}
    >
      <I18nProvider locale="pt-BR">
        <DatePicker
          value={toDate(value)}
          minValue={toDate(min) ?? undefined}
          maxValue={toDate(max) ?? undefined}
          isDisabled={common.isDisabled}
          isRequired={common.isRequired}
          isInvalid={Boolean(common.error)}
          aria-label={
            common.ariaLabel ?? (typeof common.label === 'string' ? common.label : undefined)
          }
          onChange={(next) => onChange(next ? next.toString() : '')}
        >
          <FieldLabel label={common.label} help={common.help} isRequired={common.isRequired} />
          <DateField.Group fullWidth>
            <DateField.Input>
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
            <DateField.Suffix>
              <DatePicker.Trigger aria-label="Abrir calendário">
                <DatePicker.TriggerIndicator />
              </DatePicker.Trigger>
            </DateField.Suffix>
          </DateField.Group>
          <DatePicker.Popover className="lx-popover">
            <Calendar aria-label="Calendário">
              <Calendar.Header>
                <Calendar.NavButton slot="previous" />
                <Calendar.Heading />
                <Calendar.NavButton slot="next" />
              </Calendar.Header>
              <Calendar.Grid>
                <Calendar.GridHeader>
                  {(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}
                </Calendar.GridHeader>
                <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
              </Calendar.Grid>
            </Calendar>
          </DatePicker.Popover>
        </DatePicker>
      </I18nProvider>
      <Hint description={common.description} error={common.error} />
    </div>
  )
}

function toTime(value: string | null | undefined): Time | null {
  if (!value) return null
  try {
    return parseTime(value.slice(0, 5))
  } catch {
    return null
  }
}

/** 24h time field ("HH:MM"), typed by segments. */
export function TimeInputField({
  value,
  onChange,
  ...common
}: Common & { value: string; onChange: (value: string) => void }) {
  return (
    <div
      className={['lx-field', common.error ? 'is-invalid' : '', common.className]
        .filter(Boolean)
        .join(' ')}
    >
      <I18nProvider locale="pt-BR">
        <TimeField
          value={toTime(value)}
          hourCycle={24}
          isDisabled={common.isDisabled}
          isInvalid={Boolean(common.error)}
          aria-label={
            common.ariaLabel ?? (typeof common.label === 'string' ? common.label : undefined)
          }
          onChange={(next) => onChange(next ? next.toString().slice(0, 5) : '')}
        >
          <FieldLabel label={common.label} help={common.help} isRequired={common.isRequired} />
          <TimeField.Group fullWidth>
            <TimeField.Input>
              {(segment) => <TimeField.Segment segment={segment} />}
            </TimeField.Input>
          </TimeField.Group>
        </TimeField>
      </I18nProvider>
      <Hint description={common.description} error={common.error} />
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar',
  ariaLabel,
  className,
  autoFocus,
  onEnter,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel: string
  className?: string
  autoFocus?: boolean
  onEnter?: () => void
}) {
  return (
    <SearchField
      className={['lx-search', className].filter(Boolean).join(' ')}
      fullWidth
      value={value}
      onChange={onChange}
      onSubmit={onEnter}
      aria-label={ariaLabel}
    >
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={placeholder} autoFocus={autoFocus} />
        <SearchField.ClearButton aria-label="Limpar busca" />
      </SearchField.Group>
    </SearchField>
  )
}

export function CheckboxField({
  isSelected,
  onChange,
  label,
  description,
  isDisabled,
  className,
}: {
  isSelected: boolean
  onChange: (value: boolean) => void
  label: ReactNode
  description?: ReactNode
  isDisabled?: boolean
  className?: string
}) {
  return (
    <Checkbox
      className={['lx-checkbox', className].filter(Boolean).join(' ')}
      isSelected={isSelected}
      isDisabled={isDisabled}
      onChange={onChange}
    >
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <span className="lx-checkbox-copy">
          <Label>{label}</Label>
          {description ? <small>{description}</small> : null}
        </span>
      </Checkbox.Content>
    </Checkbox>
  )
}

/** Free text with suggestions (e.g. category, role): type anything or pick from the list. */
export function ComboField({
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength,
  ...common
}: Common & {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  maxLength?: number
}) {
  const options = [...new Set(suggestions.filter(Boolean))]
  return (
    <div
      className={['lx-field', common.error ? 'is-invalid' : '', common.className]
        .filter(Boolean)
        .join(' ')}
    >
      <ComboBox
        fullWidth
        allowsCustomValue
        allowsEmptyCollection
        menuTrigger="focus"
        inputValue={value}
        onInputChange={onChange}
        onSelectionChange={(key) => {
          if (key != null) onChange(String(key))
        }}
        isDisabled={common.isDisabled}
        isInvalid={Boolean(common.error)}
        aria-label={
          common.ariaLabel ?? (typeof common.label === 'string' ? common.label : undefined)
        }
      >
        <FieldLabel label={common.label} help={common.help} isRequired={common.isRequired} />
        <ComboBox.InputGroup>
          <Input placeholder={placeholder} maxLength={maxLength} />
          <ComboBox.Trigger aria-label="Ver sugestões" />
        </ComboBox.InputGroup>
        <ComboBox.Popover className="lx-popover">
          <ListBox>
            {options
              .filter(
                (option) =>
                  !value ||
                  option.toLocaleLowerCase('pt-BR').includes(value.toLocaleLowerCase('pt-BR')),
              )
              .map((option) => (
                <ListBox.Item key={option} id={option} textValue={option}>
                  {option}
                </ListBox.Item>
              ))}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>
      <Hint description={common.description} error={common.error} />
    </div>
  )
}

/** Select with typing to filter, for long lists (clients, services). */
export function SearchSelectField({
  value,
  onChange,
  options,
  placeholder = 'Digite para buscar',
  emptyText = 'Nada encontrado',
  ...common
}: Common & {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  emptyText?: string
}) {
  return (
    <div
      className={['lx-field', common.error ? 'is-invalid' : '', common.className]
        .filter(Boolean)
        .join(' ')}
    >
      <ComboBox
        fullWidth
        menuTrigger="focus"
        selectedKey={value || null}
        defaultItems={options}
        onSelectionChange={(key) => onChange(key == null ? '' : String(key))}
        isDisabled={common.isDisabled}
        isRequired={common.isRequired}
        isInvalid={Boolean(common.error)}
        aria-label={
          common.ariaLabel ?? (typeof common.label === 'string' ? common.label : undefined)
        }
      >
        <FieldLabel label={common.label} help={common.help} isRequired={common.isRequired} />
        <ComboBox.InputGroup>
          <Input placeholder={placeholder} />
          <ComboBox.Trigger aria-label="Ver opções" />
        </ComboBox.InputGroup>
        <ComboBox.Popover className="lx-popover">
          <ListBox renderEmptyState={() => <span className="lx-empty">{emptyText}</span>}>
            {(option: SelectOption) => (
              <ListBox.Item id={option.id} textValue={option.label}>
                {option.description ? (
                  <span className="lx-option">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                ) : (
                  option.label
                )}
              </ListBox.Item>
            )}
          </ListBox>
        </ComboBox.Popover>
      </ComboBox>
      <Hint description={common.description} error={common.error} />
    </div>
  )
}
