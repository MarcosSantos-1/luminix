'use client'

import { Label, Switch } from '@heroui/react'
import { useState } from 'react'
import { TextInputField } from './fields'

const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

export function CommissionField({
  value,
  onChange,
  showError = false,
}: {
  value: number | null
  onChange: (value: number | null) => void
  showError?: boolean
}) {
  const [text, setText] = useState(() => (value ? percent.format(value / 100) : ''))

  return (
    <div className="lx-commission-field">
      <Switch
        aria-label="Recebe comissão por atendimentos?"
        isSelected={value !== null}
        onChange={(selected) => {
          setText('')
          onChange(selected ? 0 : null)
        }}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label>Recebe comissão por atendimentos?</Label>
        </Switch.Content>
      </Switch>
      {value !== null ? (
        <TextInputField
          label="Percentual da comissão"
          inputMode="decimal"
          suffix="%"
          placeholder="Ex.: 15,50"
          value={text}
          isRequired
          error={showError && !value ? 'Informe um percentual maior que zero.' : undefined}
          onBlur={() => setText(value ? percent.format(value / 100) : '')}
          onChange={(input) => {
            const clean = input.replace(/[^\d,.]/g, '').replaceAll('.', ',')
            const [integer = '', ...decimal] = clean.split(',')
            const masked =
              integer.slice(0, 3) + (decimal.length ? ',' + decimal.join('').slice(0, 2) : '')
            const amount = Math.min(100, Math.round(Number(masked.replace(',', '.')) * 100) / 100)
            setText(Number(masked.replace(',', '.')) > 100 ? '100' : masked)
            onChange(Number.isFinite(amount) ? Math.round(amount * 100) : 0)
          }}
        />
      ) : null}
    </div>
  )
}
