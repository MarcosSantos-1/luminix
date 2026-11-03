'use client'

import { Checkbox, Label } from '@heroui/react'
import type { ReactNode } from 'react'

export function AuthCheckbox({
  children,
  name,
  required,
}: {
  children: ReactNode
  name: string
  required?: boolean
}) {
  return (
    <Checkbox name={name} isRequired={required} className="auth-checkbox">
      <Checkbox.Content className="auth-checkbox-content">
        <Checkbox.Control className="auth-checkbox-control">
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label>{children}</Label>
      </Checkbox.Content>
    </Checkbox>
  )
}
