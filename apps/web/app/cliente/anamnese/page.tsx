'use client'

/* eslint-disable @next/next/no-img-element -- local data URL preview */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, Camera, Check } from 'lucide-react'
import { saveAnamnesis, useClient } from '../../../lib/client-app/store'
import type { Sex, SpaceLink } from '../../../lib/client-app/types'
import { Splash } from '../../../components/client-app/shell'
import { SpaceLogo } from '../../../components/client-app/ui'

/** Square, small JPEG: enough for the record and light enough to keep on the device. */
async function toPortrait(file: File) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 360
  canvas
    .getContext('2d')!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      360,
      360,
    )
  return canvas.toDataURL('image/jpeg', 0.82)
}

const steps = ['Foto', 'Sobre você', 'Saúde'] as const

export default function AnamnesisPage() {
  const router = useRouter()
  const { ready, account, space } = useClient()
  useEffect(() => {
    if (!ready) return
    if (!account) router.replace('/cliente/entrar')
    else if (!space) router.replace('/cliente/espacos')
  }, [ready, account, space, router])
  if (!ready || !account || !space) return <Splash />
  // Mounted only with the stored record available, so a review starts prefilled.
  return <AnamnesisForm key={space.summary.slug} space={space} />
}

function AnamnesisForm({ space }: { space: SpaceLink }) {
  const router = useRouter()
  const previous = space.anamnesis
  const [step, setStep] = useState(0)
  const [photo, setPhoto] = useState(previous?.photo ?? '')
  const [sex, setSex] = useState<Sex | ''>(previous?.sex ?? '')
  const [birthDate, setBirthDate] = useState(previous?.birthDate ?? '')
  const [allergies, setAllergies] = useState(previous?.allergies ?? '')
  const [healthNotes, setHealthNotes] = useState(previous?.healthNotes ?? '')
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setPhoto(await toPortrait(file))
      setError('')
    } catch {
      setError('Não foi possível ler essa imagem. Tente outra foto.')
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  function next() {
    const problem =
      step === 0
        ? !photo && 'Adicione uma foto do rosto para continuar.'
        : step === 1
          ? !sex
            ? 'Selecione o sexo biológico.'
            : (!birthDate || birthDate >= today || birthDate < '1900-01-01') &&
              'Informe uma data de nascimento válida.'
          : !consent && 'Confirme o uso das informações pelo espaço.'
    if (problem) return setError(problem)
    setError('')
    if (step < 2) return setStep(step + 1)
    saveAnamnesis(space.summary.slug, {
      level: 1,
      photo,
      sex: sex as Sex,
      birthDate,
      allergies: allergies.trim(),
      healthNotes: healthNotes.trim(),
      consent: true,
      answeredAt: new Date().toISOString(),
    })
    router.replace(previous ? '/cliente/perfil' : '/cliente')
  }

  return (
    <div className="ca ca-flow" data-theme={space.summary.theme}>
      <div className="ca-flow-card">
        <header className="ca-flow-top">
          {step > 0 ? (
            <button
              type="button"
              className="ca-icon-button"
              aria-label="Voltar"
              onClick={() => setStep(step - 1)}
            >
              <ArrowLeft size={18} aria-hidden />
            </button>
          ) : previous ? (
            <Link className="ca-icon-button" href="/cliente/perfil" aria-label="Voltar ao perfil">
              <ArrowLeft size={18} aria-hidden />
            </Link>
          ) : (
            <Link className="ca-link" href="/cliente/espacos">
              Trocar espaço
            </Link>
          )}
          <span className="ca-flow-space">
            <SpaceLogo space={space.summary} size={28} /> {space.summary.name}
          </span>
        </header>

        <ol className="ca-steps" aria-label="Etapas da ficha">
          {steps.map((label, index) => (
            <li
              key={label}
              data-state={index < step ? 'done' : index === step ? 'current' : 'next'}
            >
              <span>{index < step ? <Check size={13} aria-hidden /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="ca-form">
            <h1>Uma foto para o espaço reconhecer você</h1>
            <p className="ca-lead">
              Rosto visível, sem filtro. Ela aparece na sua ficha e para a equipe na recepção.
            </p>
            <label className="ca-photo">
              {photo ? <img src={photo} alt="Sua foto" /> : <Camera size={34} aria-hidden />}
              <span>{photo ? 'Trocar foto' : 'Tirar ou escolher foto'}</span>
              <input type="file" accept="image/*" capture="user" onChange={pickPhoto} />
            </label>
          </section>
        )}

        {step === 1 && (
          <section className="ca-form">
            <h1>Sobre você</h1>
            <p className="ca-lead">
              Informações básicas que o espaço usa para indicar os cuidados certos.
            </p>
            <fieldset>
              <legend>Sexo biológico</legend>
              <div className="ca-choices">
                {(
                  [
                    ['female', 'Feminino'],
                    ['male', 'Masculino'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={sex === value}
                    onClick={() => setSex(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <small>Usado em procedimentos como depilação e tratamentos corporais.</small>
            </fieldset>
            <label>
              Data de nascimento
              <input
                type="date"
                value={birthDate}
                max={today}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>
          </section>
        )}

        {step === 2 && (
          <section className="ca-form">
            <h1>Algo que o espaço precisa saber?</h1>
            <p className="ca-lead">Opcional. Você pode atualizar depois, no seu perfil.</p>
            <label>
              Alergias ou sensibilidades
              <input
                value={allergies}
                onChange={(event) => setAllergies(event.target.value)}
                placeholder="Ex.: látex, esmalte, algum ativo"
                maxLength={200}
              />
            </label>
            <label>
              Observações de saúde
              <textarea
                value={healthNotes}
                onChange={(event) => setHealthNotes(event.target.value)}
                placeholder="Ex.: gestante, uso de medicação, cirurgia recente"
                rows={3}
                maxLength={500}
              />
            </label>
            <label className="ca-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                Autorizo {space.summary.name} a usar estas informações para o meu atendimento. Os
                dados valem só para este espaço.
              </span>
            </label>
          </section>
        )}

        <p className="ca-error" role="alert">
          {error}
        </p>
        <button type="button" className="ca-button" onClick={next}>
          {step < 2 ? 'Continuar' : 'Concluir ficha'} <ArrowRight size={18} aria-hidden />
        </button>
      </div>
    </div>
  )
}
