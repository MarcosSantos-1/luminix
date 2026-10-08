import {
  Button,
  Drawer,
  Modal,
  InputGroup,
  Label,
  ListBox,
  ScrollShadow,
  Select,
  Separator,
  TextField,
  useOverlayState,
  type UseOverlayStateReturn,
} from '@heroui/react'
import type { ReactNode } from 'react'

export function GlassField({
  label,
  icon,
  value,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  autoComplete,
  maxLength,
  isDisabled,
  suffix,
  className,
}: {
  label: string
  icon?: ReactNode
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'email' | 'tel' | 'time'
  inputMode?: 'text' | 'tel' | 'email' | 'numeric' | 'decimal'
  autoComplete?: string
  maxLength?: number
  isDisabled?: boolean
  suffix?: ReactNode
  className?: string
}) {
  return (
    <TextField
      className={['ob2-field', className].filter(Boolean).join(' ')}
      fullWidth
      type={type}
      value={value}
      onChange={onChange}
      isDisabled={isDisabled}
    >
      <Label>{label}</Label>
      <InputGroup fullWidth>
        {icon ? <InputGroup.Prefix>{icon}</InputGroup.Prefix> : null}
        <InputGroup.Input
          placeholder={placeholder}
          inputMode={inputMode}
          autoComplete={autoComplete}
          maxLength={maxLength}
        />
        {suffix ? <InputGroup.Suffix>{suffix}</InputGroup.Suffix> : null}
      </InputGroup>
    </TextField>
  )
}

export function GlassSelect({
  label,
  value,
  onChange,
  options,
  isDisabled,
  menu = 'glass',
}: {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  options: { id: string; label: string }[]
  isDisabled?: boolean
  menu?: 'glass' | 'ice'
}) {
  return (
    <Select
      className="ob2-field"
      fullWidth
      selectedKey={value}
      isDisabled={isDisabled}
      onSelectionChange={(key) => {
        if (key != null) onChange(String(key))
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover className={menu === 'ice' ? 'ob2-popover ob2-popover-ice' : 'ob2-popover'}>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
              {option.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function ChoiceCard({
  title,
  detail,
  icon,
  selected,
  className,
  isDisabled,
  onPress,
}: {
  title: string
  detail?: string
  icon: ReactNode
  selected?: boolean
  className?: string
  isDisabled?: boolean
  onPress: () => void
}) {
  return (
    <Button
      className={['ob2-choice', selected ? 'is-selected' : '', isDisabled ? 'is-disabled' : '', className]
        .filter(Boolean)
        .join(' ')}
      variant="ghost"
      isDisabled={isDisabled}
      onPress={onPress}
    >
      <span className="ob2-choice-icon" aria-hidden>
        {icon}
      </span>
      <span className="ob2-choice-copy">
        <strong>{title}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </Button>
  )
}

export function BlurDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <Modal.Backdrop className="ob2-dialog-backdrop" isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container className="ob2-dialog-container" size="full">
        <Modal.Dialog className="ob2-dialog">
          <Modal.CloseTrigger aria-label="Fechar" />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
            {description ? <p className="ob2-dialog-lead">{description}</p> : null}
          </Modal.Header>
          <Modal.Body className="ob2-form ob2-dialog-form">{children}</Modal.Body>
          {footer ? <Modal.Footer className="ob2-dialog-footer">{footer}</Modal.Footer> : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

export function BlurDrawer({
  state,
  title,
  children,
  footer,
  placement = 'right',
}: {
  state: UseOverlayStateReturn
  title: string
  children: ReactNode
  footer?: ReactNode
  placement?: 'right' | 'bottom'
}) {
  return (
    <Drawer state={state}>
      <Drawer.Backdrop variant="blur" className="ob2-drawer">
        <Drawer.Content placement={placement}>
          <Drawer.Dialog className="ob2-drawer-dialog">
            <Drawer.Header>
              <Drawer.Heading>{title}</Drawer.Heading>
              <Drawer.CloseTrigger />
            </Drawer.Header>
            <Drawer.Body className="ob2-form">{children}</Drawer.Body>
            {footer ? <Drawer.Footer>{footer}</Drawer.Footer> : null}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  )
}

export function StepScroll({ children }: { children: ReactNode }) {
  return (
    <ScrollShadow className="ob2-scroll" orientation="vertical" hideScrollBar>
      <div className="ob2-stack">{children}</div>
    </ScrollShadow>
  )
}

export function StepEnd({ error, footer }: { error: string; footer: ReactNode }) {
  return (
    <>
      {error ? (
        <p className="ob2-error" role="alert">
          {error}
        </p>
      ) : null}
      {footer}
    </>
  )
}

export function QuietButton({
  children,
  onPress,
  isDisabled,
}: {
  children: ReactNode
  onPress: () => void
  isDisabled?: boolean
}) {
  return (
    <Button className="ob2-quiet" variant="ghost" fullWidth onPress={onPress} isDisabled={isDisabled}>
      {children}
    </Button>
  )
}

export { Separator, useOverlayState }
