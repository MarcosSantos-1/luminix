import { Button, Drawer, Separator } from '@heroui/react'
import { ArrowLeft, Check, MoonStar, Sun } from 'lucide-react'
import type { ReactNode } from 'react'
import { Brand } from '@/components/brand'
import { stepInfo } from './model'

export function OnboardingShell({
  glass,
  onToggleGlass,
  step,
  busy,
  onBack,
  onExit,
  children,
}: {
  glass: boolean
  onToggleGlass: () => void
  step: number
  busy: boolean
  onBack: () => void
  onExit: () => void
  children: ReactNode
}) {
  const current = stepInfo[step]
  return (
    <main className="ob2" data-surface={glass ? 'glass' : 'solid'}>
      <div className="ob2-column">
        <Brand />
        <header className="ob2-bar">
          <Button
            className="ob2-icon"
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
          <Button
            className="ob2-icon"
            isIconOnly
            variant="ghost"
            aria-pressed={glass}
            aria-label={glass ? 'Usar superfície clara' : 'Usar vidro'}
            onPress={onToggleGlass}
          >
            {glass ? <MoonStar /> : <Sun />}
          </Button>
          <Button className="ob2-exit" variant="ghost" isDisabled={busy} onPress={onExit}>
            Salvar e sair
          </Button>
        </header>
        <div className="ob2-heading">
          <h1>{current.title}</h1>
          <p>{current.text}</p>
        </div>
        {children}
      </div>
    </main>
  )
}
