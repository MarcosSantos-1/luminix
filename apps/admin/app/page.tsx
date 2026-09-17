'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Brand } from '@/components/brand'
import { StaffAuthPanel } from '@/components/staff-auth-panel'
import { useStaff } from '@/components/staff-provider'
import { DRAFT_CLINIC_NAME, staffHomePath } from '@/lib/staff-destination'

export default function Page() {
  const staff = useStaff()
  const router = useRouter()
  const [started, setStarted] = useState(false)
  const [error, setError] = useState('')
  const bootstrapping = useRef(false)

  useEffect(() => {
    if (staff.loading || staff.error || !staff.user) return
    const next = staffHomePath(staff.clinics)
    if (next) {
      router.replace(next)
      return
    }
    if (bootstrapping.current || error) return
    bootstrapping.current = true
    const user = staff.user
    const refresh = staff.refresh
    void (async () => {
      try {
        const response = await fetch('/api/auth/owner-clinic', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${await user.getIdToken()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: DRAFT_CLINIC_NAME }),
          cache: 'no-store',
          signal: AbortSignal.timeout(20_000),
        })
        if (!response.ok && response.status !== 409) throw new Error('Unavailable')
        refresh()
      } catch {
        bootstrapping.current = false
        setError('Não foi possível abrir seu rascunho. Tente novamente.')
      }
    })()
  }, [staff.loading, staff.error, staff.user, staff.clinics, staff.refresh, error, router])

  if (staff.loading || (staff.user && !staff.error && !error))
    return (
      <main className="landing">
        <p className="boot-status" role="status">
          Preparando seu espaço…
        </p>
      </main>
    )

  return (
    <main className="landing">
      <div className="landing-glow" />
      <header className="landing-header">
        <Brand dark />
        {!started && (
          <button className="login-link" onClick={() => setStarted(true)}>
            Já tenho uma conta <ArrowRight size={15} />
          </button>
        )}
      </header>
      <div className={`landing-body ${started ? 'landing-body-auth' : ''}`}>
        <div className="landing-copy">
          <span className="eyebrow">
            <Sparkles size={14} /> Para gestoras de estética e beleza
          </span>
          <h1>
            Faça o seu cadastro
            <br />
            <em>e tenha o app das clientes em minutos.</em>
          </h1>
          <p>
            Você cria a conta, conta um pouco da clínica e já sai com agenda, cadastro e um espaço
            para suas clientes. Se precisar pausar, o rascunho fica salvo — inclusive WhatsApp e
            e-mail para retomarmos juntas.
          </p>
          <ul className="pitch-points">
            <li>
              <Check size={16} /> Conta da gestora em menos de um minuto
            </li>
            <li>
              <Check size={16} /> Clínica configurada no seu ritmo, com rascunho no servidor
            </li>
            <li>
              <Check size={16} /> App das clientes pronto para compartilhar depois
            </li>
          </ul>
          {!started && (
            <div className="landing-actions">
              <button className="button button-primary" onClick={() => setStarted(true)}>
                Começar agora <ArrowRight size={18} />
              </button>
              <button className="play-link" onClick={() => setStarted(true)}>
                Já tenho conta
              </button>
            </div>
          )}
        </div>
        {started ? (
          <StaffAuthPanel heading="Crie seu acesso" />
        ) : (
          <div className="hero-preview">
            <div className="preview-window">
              <div className="preview-top">
                <span className="dot pink" />
                <span className="dot" />
                <span className="dot" />
                <span className="preview-title">O que você passa a ter</span>
              </div>
              <div className="preview-welcome">
                <div>
                  <small>Depois do cadastro</small>
                  <h3>Sua clínica, no ar.</h3>
                </div>
              </div>
              <div className="preview-agenda">
                <span>Enquanto isso, o rascunho guarda</span>
                <div className="agenda-item">
                  <b>01</b>
                  <span>
                    Seus dados<small>Nome, e-mail e WhatsApp</small>
                  </span>
                </div>
                <div className="agenda-item">
                  <b>02</b>
                  <span>
                    A clínica<small>Serviços e profissionais, quando você quiser</small>
                  </span>
                </div>
                <div className="agenda-item">
                  <b>03</b>
                  <span>
                    O app das clientes<small>Compartilhado só depois que você concluir</small>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {(error || staff.error) && (
        <p className="landing-error" role="alert">
          {error || staff.error}
          <button onClick={() => (error ? window.location.reload() : staff.refresh())}>
            Tentar novamente
          </button>
        </p>
      )}
      <footer className="landing-footer">
        <span>
          <Check size={15} /> Sem cartão para começar
        </span>
        <span>
          <Check size={15} /> Rascunho salvo a cada etapa
        </span>
        <span>
          <Check size={15} /> Você pode sair e continuar depois
        </span>
      </footer>
    </main>
  )
}
