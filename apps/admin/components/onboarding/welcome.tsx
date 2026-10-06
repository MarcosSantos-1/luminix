'use client'

import { Button } from '@heroui/react'
import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'firebase/auth'
import { getFirebaseAuth } from '@/lib/firebase'

const preview = [
  {
    title: 'Seu negócio',
    text: 'Nome, endereço e informações do espaço.',
    icon: '/brand/onboarding/studio-1.png',
  },
  {
    title: 'Serviços e equipe',
    text: 'O que você oferece, valores e quem atende.',
    icon: '/brand/onboarding/team2.png',
  },
  {
    title: 'Sua agenda',
    text: 'Horários e preferências de agendamento.',
    icon: '/brand/onboarding/calendar-3.png',
  },
] as const

export function WelcomeStep({ busy, onStart }: { busy: boolean; onStart: () => void }) {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')

  async function leave() {
    setLeaving(true)
    setLeaveError('')
    try {
      await signOut(getFirebaseAuth())
      router.replace('/login')
    } catch {
      setLeaveError('Não foi possível sair. Tente novamente.')
      setLeaving(false)
    }
  }

  return (
    <main className="ob2 ob2-is-welcome" data-surface="glass">
      <div className="ob2-welcome-frame">
        <header className="ob2-welcome-head">
          <Image
            className="ob2-logo"
            src="/brand/logo-letter-white.png"
            alt="Luminix"
            width={190}
            height={34}
            priority
          />
          <Button
            className="ob2-exit"
            variant="ghost"
            isDisabled={busy || leaving}
            onPress={() => void leave()}
          >
            {leaving ? 'Saindo…' : 'Sair'}
          </Button>
        </header>
        <section className="ob2-welcome-card">
          <div className="ob2-welcome-body">
            <div className="ob2-welcome-copy">
            <h1>
              Vamos preparar
              <br />
              seu espaço?
            </h1>
            <p className="ob2-welcome-lead">
              Vamos organizar as informações do seu negócio para deixar sua agenda pronta para
              receber clientes.
            </p>
            <ol className="ob2-welcome-steps">
              {preview.map((item) => (
                <li key={item.title}>
                  <Image
                    className="ob2-welcome-step-icon"
                    src={item.icon}
                    alt=""
                    width={1254}
                    height={1254}
                  />
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.text}</small>
                  </div>
                </li>
              ))}
            </ol>
            <p className="ob2-welcome-pace">
              <strong>Pode fazer no seu ritmo.</strong> Seu progresso é salvo automaticamente. Se
              sair, você continua de onde parou.
            </p>
            {leaveError ? (
              <p className="ob2-welcome-error" role="alert">
                {leaveError}
              </p>
            ) : null}
            <div className="ob2-welcome-actions">
              <Button
                className="ob2-cta"
                fullWidth
                isDisabled={busy || leaving}
                onPress={onStart}
              >
                {busy ? 'Salvando…' : 'Começar configuração'}
              </Button>
              <p className="ob2-welcome-later">Você poderá ajustar essas informações depois.</p>
            </div>
          </div>
          <figure className="ob2-welcome-figure">
            <Image
              className="ob2-welcome-art"
              src="/brand/onboarding/ministudio-illustration.png"
              alt="Ilustração de um miniestúdio de atendimento, com maca, espelho e plantas."
              width={1312}
              height={1199}
              priority
            />
          </figure>
        </div>
        </section>
      </div>
    </main>
  )
}
