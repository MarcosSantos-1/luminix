import { Button, Drawer, Separator } from '@heroui/react'
import Image from 'next/image'
import { ArrowLeft, Check, Headphones } from 'lucide-react'
import type { ReactNode } from 'react'
import { stepInfo } from './model'

export function OnboardingShell({
  step,
  busy,
  onBack,
  onSelectStep,
  children,
}: {
  step: number
  busy: boolean
  onBack: () => void
  onSelectStep: (index: number) => void
  children: ReactNode
}) {
  const current = stepInfo[step]
  const progress = Math.round(((step + 1) / stepInfo.length) * 100)
  return (
    <main className="ob2" data-surface="glass">
      <div className="ob2-top">
        <div className="ob2-brand-row">
          <Image
            className="ob2-logo"
            src="/brand/logo-letter-white.png"
            alt="Luminix"
            width={190}
            height={34}
          />
          <div className="ob2-brand-actions">
            <Button
              className="ob2-icon ob2-back-desktop"
              isIconOnly
              variant="ghost"
              aria-label="Voltar"
              isDisabled={step === 0 || busy}
              onPress={onBack}
            >
              <ArrowLeft />
            </Button>
            <Button className="ob2-exit" variant="ghost" isDisabled>
              Pular
            </Button>
          </div>
        </div>
        <header className="ob2-bar">
          <Button
            className="ob2-icon ob2-back-mobile"
            isIconOnly
            variant="ghost"
            aria-label="Voltar"
            isDisabled={step === 0 || busy}
            onPress={onBack}
          >
            <ArrowLeft />
          </Button>
          <Drawer>
            <Drawer.Trigger className="ob2-steps-trigger" aria-label="Ver etapas">
              <span className="ob2-steps" aria-hidden>
                {stepInfo.map((item, index) => (
                  <i key={item.key} className={index <= step ? 'on' : ''} />
                ))}
              </span>
            </Drawer.Trigger>
            <Drawer.Backdrop variant="blur" className="ob2-drawer">
              <Drawer.Content placement="right">
                <Drawer.Dialog className="ob2-drawer-dialog">
                  <Drawer.Header>
                    <Drawer.Heading>Etapas do cadastro</Drawer.Heading>
                    <Drawer.CloseTrigger />
                  </Drawer.Header>
                  <Drawer.Body className="ob2-form">
                    <p className="ob2-copy">
                      Você está na etapa {step + 1} de {stepInfo.length}. Cada vez que continua, o
                      que já preencheu fica salvo para retomar depois.
                    </p>
                    <Separator />
                    <ol className="ob2-step-list">
                      {stepInfo.map((item, index) => (
                        <li
                          key={item.key}
                          className={index === step ? 'current' : index < step ? 'done' : ''}
                        >
                          <span>{index < step ? <Check size={16} /> : index + 1}</span>
                          <div>
                            <strong>{item.label}</strong>
                            <small>{item.title}</small>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </Drawer.Body>
                </Drawer.Dialog>
              </Drawer.Content>
            </Drawer.Backdrop>
          </Drawer>
        </header>
        <div className="ob2-heading">
          <h1>{current.title}</h1>
          <p>{current.text}</p>
        </div>
      </div>
      <div className="ob2-board">
        <aside className="ob2-rail">
          <div className="ob2-rail-meter">
            <span>Progresso</span>
            <strong>{progress}%</strong>
          </div>
          <i className="ob2-rail-track" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </i>
          <ol>
            {stepInfo.map((item, index) => (
              <li key={item.key}>
                <Button
                  className={
                    index === step
                      ? 'ob2-rail-item is-current'
                      : index < step
                        ? 'ob2-rail-item is-done'
                        : 'ob2-rail-item'
                  }
                  variant="ghost"
                  isDisabled={busy || index > step}
                  onPress={() => {
                    if (index < step) onSelectStep(index)
                  }}
                >
                  <span>{index < step ? <Check size={15} /> : index + 1}</span>
                  {item.label}
                </Button>
              </li>
            ))}
          </ol>
        </aside>
        <div className="ob2-column">{children}</div>
      </div>
      <Button className="ob2-icon ob2-support" isIconOnly variant="ghost" aria-label="Suporte">
        <Headphones />
      </Button>
    </main>
  )
}
