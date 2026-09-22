'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Mail,
  Phone,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Brand } from '@/components/brand'
import { AppStatus } from '@/components/app-status'
import { useClinic } from '@/components/clinic-workspace'
import { useStaff } from '@/components/staff-provider'
import { formatBrPhone, isCompletePhone, toE164Phone } from '@/lib/phone'
import { untitledClinicName } from '@/lib/staff-destination'

type Payload = {
  name: string
  ownerName: string
  email: string
  phone: string
  occupations: string[]
  services: { name: string; priceCents: number; durationMinutes: number }[]
  professionals: string[]
}
type Draft = {
  version: number
  formatVersion: number
  step: string
  status: string
  payload: Payload
}

type DraftView = { draft: Draft; payload: Payload; step: number; phoneText: string }
const draftViews = new Map<string, DraftView>()
const draftListeners = new Set<() => void>()

function subscribeDrafts(listener: () => void) {
  draftListeners.add(listener)
  return () => draftListeners.delete(listener)
}

function rememberDraft(id: string, view: DraftView) {
  const current = draftViews.get(id)
  if (
    current?.payload === view.payload &&
    current.step === view.step &&
    current.phoneText === view.phoneText
  )
    return
  draftViews.set(id, view)
  draftListeners.forEach((listener) => listener())
}

const steps = [
  {
    key: 'contact',
    label: 'Você',
    title: 'Por onde te encontramos',
    description:
      'Se você sair no meio, guardamos este contato para te chamar no WhatsApp ou e-mail e retomar o cadastro.',
  },
  {
    key: 'clinic',
    label: 'Clínica',
    title: 'Como se chama o seu espaço?',
    description: 'Pode ser o nome na fachada ou o que suas clientes já usam para te encontrar.',
  },
  {
    key: 'occupations',
    label: 'Atuação',
    title: 'O que vocês fazem?',
    description: 'Toque nas sugestões ou escreva as áreas. Nada vem marcado de antemão.',
  },
  {
    key: 'services',
    label: 'Serviços',
    title: 'Quais serviços entram agora?',
    description: 'Preço e duração reais. Você pode concluir sem nenhum e cadastrar depois.',
  },
  {
    key: 'professionals',
    label: 'Equipe',
    title: 'Quem atende com você?',
    description: 'Só o nome por enquanto. Convite e permissão ficam para depois.',
  },
  {
    key: 'review',
    label: 'Revisão',
    title: 'Confira antes de abrir',
    description: 'Ao concluir, a clínica fica ativa e ganhamos um código para o app das clientes.',
  },
] as const

const occupationIdeas = ['Estética', 'Cabelo', 'Unhas', 'Massagem', 'Depilação', 'Sobrancelhas']
const emptyPayload = (name: string, email: string, ownerName: string): Payload => ({
  name,
  ownerName,
  email,
  phone: '',
  occupations: [],
  services: [],
  professionals: [],
})

export default function OnboardingPage() {
  const { clinic, permissions } = useClinic()
  const staff = useStaff()
  const router = useRouter()
  const key = `${staff.user?.uid}/${clinic.id}/${staff.revision}`
  const viewId = `${staff.user?.uid ?? ''}/${clinic.id}`
  const remembered = useSyncExternalStore(
    subscribeDrafts,
    () => draftViews.get(viewId) ?? null,
    () => null,
  )
  const [state, setState] = useState<{ key: string; draft?: Draft; error?: string } | null>(null)
  const [editedPayload, setPayload] = useState<Payload | null>(null)
  const [editedStep, setStep] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [editedPhone, setPhoneText] = useState<string | null>(null)
  const payload = editedPayload ?? remembered?.payload ?? null
  const step = editedStep ?? remembered?.step ?? 0
  const phoneText = editedPhone ?? remembered?.phoneText ?? ''
  const draft = state?.draft ?? remembered?.draft
  const payloadRef = useRef<Payload | null>(null)
  useEffect(() => {
    payloadRef.current = payload
  })

  useEffect(() => {
    const user = staff.user
    if (!user || !permissions.includes('onboarding:manage')) return
    let active = true
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(`/api/clinics/${clinic.id}/onboarding`, {
          headers: { authorization: `Bearer ${await user.getIdToken()}` },
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]),
        })
        if (!response.ok) throw new Error()
        const data: { draft: Draft } = await response.json()
        if (!active) return
        if (data.draft.formatVersion !== 1) {
          setState({ key, error: 'Esta versão do rascunho precisa de atualização.' })
          return
        }
        if (payloadRef.current) {
          setState({ key, draft: { ...data.draft, payload: payloadRef.current } })
          return
        }
        const next = {
          ...emptyPayload(
            untitledClinicName(String(data.draft.payload.name || clinic.name))
              ? ''
              : String(data.draft.payload.name || clinic.name),
            data.draft.payload.email || user.email || '',
            data.draft.payload.ownerName || user.displayName || '',
          ),
          ...data.draft.payload,
        }
        if (untitledClinicName(next.name)) next.name = ''
        if (!next.email && user.email) next.email = user.email
        if (!next.ownerName && user.displayName) next.ownerName = user.displayName
        setPayload(next)
        setPhoneText(next.phone ? formatBrPhone(next.phone) : '')
        setState({ key, draft: { ...data.draft, payload: next } })
        const missingContact = !next.ownerName.trim() || !next.email.trim() || !next.phone
        const index = steps.findIndex((item) => item.key === data.draft.step)
        setStep(missingContact ? 0 : Math.max(0, index))
        rememberDraft(`${user.uid}/${clinic.id}`, {
          draft: { ...data.draft, payload: next },
          payload: next,
          step: missingContact ? 0 : Math.max(0, index),
          phoneText: next.phone ? formatBrPhone(next.phone) : '',
        })
      } catch {
        if (active && !payloadRef.current)
          setState({ key, error: 'Não foi possível carregar o rascunho.' })
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [staff.user, clinic.id, clinic.name, staff.revision, permissions, key, retry])

  useEffect(() => {
    const uid = staff.user?.uid
    const stored = state?.draft ?? remembered?.draft
    if (!uid || !payload || !stored) return
    rememberDraft(`${uid}/${clinic.id}`, {
      draft: { ...stored, payload },
      payload,
      step,
      phoneText,
    })
  }, [staff.user, clinic.id, payload, state, remembered, step, phoneText])

  async function save(nextStep: number, exit = false): Promise<void> {
    const user = staff.user
    if (!user || !payload || !draft || busy) return
    setBusy(true)
    setError('')
    try {
      if (
        step === 0 &&
        (!payload.ownerName.trim() || !payload.email.trim() || !isCompletePhone(payload.phone))
      ) {
        setError('Preencha nome, e-mail e WhatsApp com DDD para salvarmos seu rascunho.')
        return
      }
      if (step === 1 && !payload.name.trim()) {
        setError('Informe o nome da clínica.')
        return
      }
      if (
        payload.services.some(
          (service) =>
            !service.name.trim() ||
            !Number.isInteger(service.priceCents) ||
            service.priceCents < 0 ||
            !Number.isInteger(service.durationMinutes) ||
            service.durationMinutes < 1 ||
            service.durationMinutes > 1440,
        )
      ) {
        setError('Confira nome, preço e duração de cada serviço.')
        return
      }
      const response = await fetch(`/api/clinics/${clinic.id}/onboarding`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: draft.version,
          step: steps[nextStep].key,
          payload: {
            name: payload.name.trim() || clinic.name,
            ownerName: payload.ownerName,
            email: payload.email.trim().toLowerCase(),
            phone: payload.phone,
            occupations: payload.occupations,
            services: payload.services,
            professionals: payload.professionals,
          },
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'O rascunho mudou em outra aba. Recarregue antes de continuar.'
            : response.status === 400
              ? 'Revise os campos desta etapa.'
              : 'Não foi possível salvar. Tente novamente.',
        )
        return
      }
      const data: { draft: Draft } = await response.json()
      if (user.uid !== staff.user?.uid) return
      setState({ key, draft: data.draft })
      setStep(nextStep)
      if (exit) router.push(`/clinics/${clinic.id}`)
    } catch {
      setError('Não foi possível salvar. Tente novamente.')
    } finally {
      setBusy(false)
    }
  }

  async function complete() {
    const user = staff.user
    if (!user || !state?.draft || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/clinics/${clinic.id}/onboarding/complete`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version: state.draft.version }),
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) {
        setError(
          response.status === 409
            ? 'O rascunho mudou. Recarregue e revise novamente.'
            : 'Não foi possível concluir. Confira contato e nome da clínica.',
        )
        return
      }
      staff.refresh()
      router.push(`/clinics/${clinic.id}`)
    } catch {
      setError(
        'A resposta não chegou. Tente concluir novamente; a operação é segura para repetição.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (!permissions.includes('onboarding:manage'))
    return <AppStatus alert>Você não tem acesso ao onboarding.</AppStatus>
  if (clinic.status === 'active')
    return (
      <AppStatus
        action={
          <button
            className="button button-primary"
            onClick={() => router.push(`/clinics/${clinic.id}`)}
          >
            Ir para a clínica
          </button>
        }
      >
        Onboarding concluído.
      </AppStatus>
    )
  if (!payload || !draft)
    return state?.error ? (
      <AppStatus
        alert
        action={
          <button className="button button-primary" onClick={() => setRetry((value) => value + 1)}>
            Tentar novamente
          </button>
        }
      >
        {state.error}
      </AppStatus>
    ) : (
      <AppStatus />
    )

  const current = steps[step]
  const progress = Math.round((step / (steps.length - 1)) * 100)

  return (
    <main className="onboarding">
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />
      <header className="onboarding-header">
        <Brand dark />
        <div className="header-right">
          <span className="save-status">
            <Check size={14} /> Rascunho no servidor · pode sair e voltar
          </span>
          <button className="exit-button" disabled={busy} onClick={() => void save(step, true)}>
            Salvar e sair
          </button>
        </div>
      </header>
      <div className="onboarding-layout">
        <aside className="progress-sidebar">
          <div className="progress-intro">
            <span className="eyebrow">
              <Sparkles size={13} /> Sua clínica, no seu ritmo
            </span>
            <h1>
              Vamos deixar
              <br />
              <em>tudo pronto.</em>
            </h1>
            <p>
              Cada etapa grava o rascunho. Com nome e WhatsApp, conseguimos te chamar se o cadastro
              ficar pela metade.
            </p>
          </div>
          <div className="progress-card">
            <div className="progress-title">
              <b>Seu progresso</b>
              <strong>{Math.max(8, progress)}% salvo</strong>
            </div>
            <div className="progress-track">
              <i style={{ width: `${Math.max(8, progress)}%` }} />
            </div>
            <ol>
              {steps.map((item, index) => (
                <li
                  className={index === step ? 'current' : index < step ? 'done' : ''}
                  key={item.key}
                >
                  <span>{index < step ? <Check size={13} /> : index + 1}</span>
                  <b>{item.label}</b>
                </li>
              ))}
            </ol>
          </div>
        </aside>
        <div className="mobile-progress">
          <div>
            <span>
              Etapa {step + 1} de {steps.length}
            </span>
            <b>{current.label}</b>
          </div>
          <div className="mobile-track">
            <i style={{ width: `${Math.max(8, progress)}%` }} />
          </div>
        </div>
        <div className="steps-area">
          <section className="step-card" key={current.key}>
            <div className="step-heading">
              <div className="step-icon">
                {[UserRound, Building2, Sparkles, Sparkles, Users, Check][step] &&
                  (() => {
                    const Icon = [UserRound, Building2, Sparkles, Sparkles, Users, Check][step]
                    return <Icon size={24} />
                  })()}
              </div>
              <div>
                <div className="step-kicker">
                  <b>{step + 1}</b>
                  <span>
                    Etapa {step + 1} de {steps.length}
                  </span>
                </div>
                <h2>{current.title}</h2>
                <p>{current.description}</p>
              </div>
            </div>
            <div className="step-content">
              {step === 0 && (
                <>
                  <label className="field">
                    <span>Seu nome</span>
                    <div className="field-control">
                      <UserRound size={17} />
                      <input
                        maxLength={120}
                        placeholder="Ex.: Marina Alves"
                        value={payload.ownerName}
                        aria-invalid={!payload.ownerName.trim()}
                        onChange={(event) =>
                          setPayload({ ...payload, ownerName: event.target.value })
                        }
                      />
                    </div>
                  </label>
                  <label className="field">
                    <span>E-mail</span>
                    <div className="field-control">
                      <Mail size={17} />
                      <input
                        type="email"
                        maxLength={254}
                        placeholder="ex.: marina@sua-clinica.com"
                        value={payload.email}
                        aria-invalid={!payload.email.trim()}
                        onChange={(event) => setPayload({ ...payload, email: event.target.value })}
                      />
                    </div>
                  </label>
                  <label className="field">
                    <span>WhatsApp com DDD</span>
                    <div className="field-control">
                      <Phone size={17} />
                      <input
                        inputMode="tel"
                        placeholder="Ex.: (11) 99999-0000"
                        value={phoneText}
                        aria-invalid={!isCompletePhone(payload.phone)}
                        onChange={(event) => {
                          const next = event.target.value
                          setPhoneText(formatBrPhone(next) || next)
                          setPayload({ ...payload, phone: toE164Phone(next) })
                        }}
                      />
                    </div>
                  </label>
                </>
              )}
              {step === 1 && (
                <label className="field">
                  <span>Nome da clínica</span>
                  <div className="field-control">
                    <Building2 size={17} />
                    <input
                      maxLength={160}
                      placeholder="Ex.: Studio Luna"
                      value={payload.name}
                      aria-invalid={!payload.name.trim()}
                      onChange={(event) => setPayload({ ...payload, name: event.target.value })}
                    />
                  </div>
                </label>
              )}
              {step === 2 && (
                <>
                  <p className="input-label">Sugestões — toque para incluir</p>
                  <div className="choice-grid compact">
                    {occupationIdeas.map((item) => (
                      <button
                        className={`choice ${payload.occupations.includes(item) ? 'selected' : ''}`}
                        key={item}
                        type="button"
                        onClick={() =>
                          setPayload({
                            ...payload,
                            occupations: payload.occupations.includes(item)
                              ? payload.occupations.filter((value) => value !== item)
                              : [...payload.occupations, item],
                          })
                        }
                      >
                        <span>{item}</span>
                      </button>
                    ))}
                  </div>
                  {payload.occupations.map((name, index) =>
                    occupationIdeas.includes(name) ? null : (
                      <label className="field" key={`custom-${index}`}>
                        <span>Outra área</span>
                        <div className="field-control">
                          <input
                            maxLength={120}
                            placeholder="Ex.: Podologia"
                            value={name}
                            onChange={(event) =>
                              setPayload({
                                ...payload,
                                occupations: payload.occupations.map((value, position) =>
                                  position === index ? event.target.value : value,
                                ),
                              })
                            }
                          />
                        </div>
                      </label>
                    ),
                  )}
                  <button
                    type="button"
                    className="text-link"
                    disabled={payload.occupations.length >= 20}
                    onClick={() =>
                      setPayload({ ...payload, occupations: [...payload.occupations, ''] })
                    }
                  >
                    + Escrever outra área
                  </button>
                </>
              )}
              {step === 3 && (
                <>
                  {payload.services.map((service, index) => (
                    <div className="service-grid" key={index}>
                      <label className="field">
                        <span>Serviço</span>
                        <div className="field-control">
                          <input
                            maxLength={160}
                            placeholder="Ex.: Limpeza de pele"
                            value={service.name}
                            onChange={(event) =>
                              setPayload({
                                ...payload,
                                services: payload.services.map((value, position) =>
                                  position === index
                                    ? { ...value, name: event.target.value }
                                    : value,
                                ),
                              })
                            }
                          />
                        </div>
                      </label>
                      <label className="field">
                        <span>Preço (R$)</span>
                        <PriceInput
                          key={`${draft.version}:${index}`}
                          cents={service.priceCents}
                          onChange={(cents) =>
                            setPayload({
                              ...payload,
                              services: payload.services.map((value, position) =>
                                position === index ? { ...value, priceCents: cents } : value,
                              ),
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Minutos</span>
                        <div className="field-control">
                          <input
                            type="number"
                            min="1"
                            max="1440"
                            placeholder="60"
                            value={service.durationMinutes || ''}
                            onChange={(event) =>
                              setPayload({
                                ...payload,
                                services: payload.services.map((value, position) =>
                                  position === index
                                    ? {
                                        ...value,
                                        durationMinutes: Number(event.target.value) || 0,
                                      }
                                    : value,
                                ),
                              })
                            }
                          />
                        </div>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setPayload({
                            ...payload,
                            services: payload.services.filter((_, position) => position !== index),
                          })
                        }
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-link"
                    disabled={payload.services.length >= 30}
                    onClick={() =>
                      setPayload({
                        ...payload,
                        services: [
                          ...payload.services,
                          { name: '', priceCents: 0, durationMinutes: 60 },
                        ],
                      })
                    }
                  >
                    + Adicionar serviço
                  </button>
                </>
              )}
              {step === 4 && (
                <>
                  {payload.professionals.map((name, index) => (
                    <label className="field" key={index}>
                      <span>Profissional {index + 1}</span>
                      <div className="field-control">
                        <input
                          maxLength={160}
                          placeholder="Ex.: Camila"
                          value={name}
                          onChange={(event) =>
                            setPayload({
                              ...payload,
                              professionals: payload.professionals.map((value, position) =>
                                position === index ? event.target.value : value,
                              ),
                            })
                          }
                        />
                      </div>
                    </label>
                  ))}
                  <button
                    type="button"
                    className="text-link"
                    disabled={payload.professionals.length >= 20}
                    onClick={() =>
                      setPayload({
                        ...payload,
                        professionals: [...payload.professionals, ''],
                      })
                    }
                  >
                    + Adicionar profissional
                  </button>
                </>
              )}
              {step === 5 && (
                <dl className="review-list">
                  <div>
                    <dt>Responsável</dt>
                    <dd>{payload.ownerName}</dd>
                  </div>
                  <div>
                    <dt>Contato</dt>
                    <dd>
                      {payload.email} · {formatBrPhone(payload.phone) || payload.phone}
                    </dd>
                  </div>
                  <div>
                    <dt>Clínica</dt>
                    <dd>{payload.name}</dd>
                  </div>
                  <div>
                    <dt>Áreas</dt>
                    <dd>{payload.occupations.filter(Boolean).join(', ') || 'Nenhuma ainda'}</dd>
                  </div>
                  <div>
                    <dt>Serviços</dt>
                    <dd>{payload.services.length || 'Nenhum ainda'}</dd>
                  </div>
                  <div>
                    <dt>Profissionais</dt>
                    <dd>{payload.professionals.filter(Boolean).join(', ') || 'Nenhum ainda'}</dd>
                  </div>
                </dl>
              )}
            </div>
            {error && (
              <p role="alert" className="step-error">
                {error}
              </p>
            )}
            <div className="card-actions">
              {step > 0 && (
                <button
                  className="button button-ghost"
                  disabled={busy}
                  onClick={() => void save(step - 1)}
                >
                  <ArrowLeft size={16} /> Voltar
                </button>
              )}
              {step < steps.length - 1 ? (
                <button
                  className="button button-primary continue"
                  disabled={busy}
                  onClick={() => void save(step + 1)}
                >
                  {busy ? 'Salvando…' : 'Salvar e continuar'} <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className="button button-primary continue"
                  disabled={busy}
                  onClick={() => void complete()}
                >
                  {busy ? 'Concluindo…' : 'Concluir clínica'} <ArrowRight size={17} />
                </button>
              )}
              {(error.includes('outra aba') || error.includes('mudou')) && (
                <button onClick={() => setRetry((value) => value + 1)}>Recarregar rascunho</button>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

function PriceInput({ cents, onChange }: { cents: number; onChange: (cents: number) => void }) {
  const [text, setText] = useState(cents ? (cents / 100).toFixed(2).replace('.', ',') : '')
  return (
    <div className="field-control">
      <input
        inputMode="decimal"
        placeholder="0,00"
        value={text}
        aria-invalid={text !== '' && !/^\d+(?:[.,]\d{0,2})?$/.test(text)}
        onChange={(event) => {
          const value = event.target.value
          setText(value)
          if (!value) {
            onChange(0)
            return
          }
          onChange(
            /^\d+(?:[.,]\d{0,2})?$/.test(value)
              ? Math.round(Number(value.replace(',', '.')) * 100)
              : -1,
          )
        }}
      />
    </div>
  )
}
