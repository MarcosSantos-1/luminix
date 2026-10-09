'use client'

import { ListBox, Select } from '@heroui/react'

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))

function parts(value: string) {
  const [hour = '09', minute = '00'] = value.split(':')
  return {
    hour: hours.includes(hour) ? hour : '09',
    minute,
  }
}

export function TimePicker({
  label,
  value,
  onChange,
  isDisabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  isDisabled?: boolean
}) {
  const { hour, minute } = parts(value || '09:00')
  const commit = (nextHour: string, nextMinute: string) => {
    const next = `${nextHour}:${nextMinute}`
    if (next !== value) onChange(next)
  }
  return (
    <div className="ob2-time">
      <span className="ob2-time-label">{label}</span>
      <div className="ob2-time-row">
        <Select
          aria-label={`${label}, hora`}
          className="ob2-time-select"
          isDisabled={isDisabled}
          selectedKey={hour}
          onSelectionChange={(key) => {
            if (key != null) commit(String(key), minute)
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover className="ob2-popover ob2-time-popover">
            <ListBox>
              {hours.map((item) => (
                <ListBox.Item key={item} id={item} textValue={item}>
                  {item}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <span className="ob2-time-colon" aria-hidden>
          :
        </span>
        <Select
          aria-label={`${label}, minuto`}
          className="ob2-time-select"
          isDisabled={isDisabled}
          selectedKey={minutes.includes(minute) ? minute : '00'}
          onSelectionChange={(key) => {
            if (key != null) commit(hour, String(key))
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover className="ob2-popover ob2-time-popover">
            <ListBox>
              {minutes.map((item) => (
                <ListBox.Item key={item} id={item} textValue={item}>
                  {item}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
    </div>
  )
}

export function defaultBreak(start: string, end: string) {
  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
  }
  const fromMinutes = (total: number) => {
    const hour = Math.floor(total / 60)
    const minute = total % 60
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
  const open = toMinutes(start)
  const close = toMinutes(end)
  if (13 * 60 >= open && 14 * 60 <= close) return { start: '13:00', end: '14:00' }
  const span = close - open
  if (span <= 60) {
    const split = open + Math.max(15, Math.floor(span / 2))
    return { start, end: fromMinutes(Math.min(split, close)) }
  }
  const snapped = Math.min(
    close - 60,
    Math.max(open, Math.round((open + (span - 60) / 2) / 15) * 15),
  )
  return { start: fromMinutes(snapped), end: fromMinutes(snapped + 60) }
}
