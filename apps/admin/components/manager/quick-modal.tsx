'use client'

import { Modal } from '@heroui/react'
import type { ReactNode } from 'react'
import './appointments/appointments.css'

/**
 * The panel's standard pop-up: blurred backdrop, roomy on desktop, full-height sheet on phones.
 * Quick actions (novo agendamento, agenda, cliente, horários, ficha do atendimento) open here
 * instead of leaving the page.
 */
export function QuickModal({
  isOpen,
  onOpenChange,
  title,
  subtitle,
  size = 'md',
  footer,
  className,
  children,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  subtitle?: ReactNode
  /** md ≈ 560px, lg ≈ 780px, xl ≈ 1040px, wide fills the screen (agenda). */
  size?: 'md' | 'lg' | 'xl' | 'wide'
  footer?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} variant="blur" className="qm-back">
      <Modal.Container size="lg" scroll="inside" className="qm-container">
        <Modal.Dialog
          className={['manager-dialog', 'qm', `qm-${size}`, className].filter(Boolean).join(' ')}
        >
          <Modal.CloseTrigger aria-label="Fechar" />
          <Modal.Header className="qm-head">
            <Modal.Heading>{title}</Modal.Heading>
            {subtitle ? <p className="qm-sub">{subtitle}</p> : null}
          </Modal.Header>
          <Modal.Body className="qm-body lx-scroll">{children}</Modal.Body>
          {footer ? <Modal.Footer className="qm-foot">{footer}</Modal.Footer> : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
