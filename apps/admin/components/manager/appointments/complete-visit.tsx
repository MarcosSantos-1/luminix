'use client'

import { Button, Spinner } from '@heroui/react'
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoneyField } from '@/components/ui/fields'
import { amount, unitShort } from '@/lib/stock'
import { dateBr, money, moneyInput, parseMoney } from '../business/format'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import {
  isFree,
  isQuote,
  needsAgreedPrice,
  packagePlanLabel,
  serviceTitle,
  type AppointmentAccess,
  type AppointmentView,
} from './model'
import './complete-visit.css'

type Supply = {
  itemId: string
  name: string
  unit: string
  quantity: number
  stock: number
  consumed: number | null
}

export const methods = [
  { id: 'pix', label: 'Pix', emoji: '⚡' },
  { id: 'cash', label: 'Dinheiro', emoji: '💵' },
  { id: 'credit', label: 'Crédito', emoji: '💳' },
  { id: 'debit', label: 'Débito', emoji: '💳' },
  { id: 'transfer', label: 'Transferência', emoji: '🏦' },
  { id: 'other', label: 'Outro', emoji: '✨' },
]

/**
 * What the visit owes. A package session is booked at price 0 and the debt lives in the
 * package: "a cada sessão" charges the installment, "paga depois" the whole open balance.
 */
export function payment(item: AppointmentView) {
  const pk = item.package
  if (pk) {
    if (pk.remainingCents == null)
      return { tone: 'info', label: 'Pacote', remaining: 0, headline: 'Pacote' }
    if (pk.remainingCents === 0)
      return { tone: 'on', label: 'Pacote pago', remaining: 0, headline: 'Pacote' }
    const due = pk.dueNowCents ?? 0
    if (pk.plan === 'per_visit')
      return due > 0
        ? { tone: 'pending', label: 'Parcela a receber', remaining: due, headline: money(due) }
        : {
            tone: 'on',
            label: 'Parcela paga',
            remaining: 0,
            headline: money(pk.installmentCents ?? 0),
          }
    return {
      tone: 'pending',
      label: `Pacote · falta ${money(pk.remainingCents)}`,
      remaining: pk.remainingCents,
      headline: money(pk.remainingCents),
    }
  }
  const price = item.priceCents ?? 0
  const paid = item.paidCents ?? (item.paid ? price : 0)
  if (needsAgreedPrice(item))
    return {
      tone: 'pending',
      label: 'Valor definido no atendimento',
      remaining: 0,
      headline: item.priceType === 'from' ? `A partir de ${money(price)}` : 'A combinar',
    }
  const headline = isQuote(item) ? 'A combinar' : isFree(item) ? 'Gratuito' : money(price)
  if (isFree(item)) return { tone: 'on', label: 'Sem cobrança', remaining: 0, headline }
  if (item.paid) return { tone: 'on', label: 'Pago', remaining: 0, headline }
  if (paid > 0 && price > paid)
    return {
      tone: 'part',
      label: `Parcial · faltam ${money(price - paid)}`,
      remaining: price - paid,
      headline,
    }
  return { tone: 'pending', label: 'A receber', remaining: price, headline }
}

type PhotoKind = 'normal' | 'before' | 'after' | 'other'
type Photo = {
  key: string
  kind: PhotoKind
  /** Missing on a photo restored from the draft (already uploaded). */
  file?: File
  preview: string
  status: 'uploading' | 'ready' | 'failed'
  assetId?: string
  /** Signed URL of the uploaded copy (kept in the draft). */
  remoteUrl?: string
}

/** What was filled in "Concluir atendimento", kept in this browser until it is completed. */
type Draft = {
  savedAt: number
  step: Step
  seen: Step[]
  mode: 'full' | 'part' | 'later'
  cash: string
  method: string
  agreed: string
  used: Record<string, number>
  photoKind: 'normal' | 'before_after' | 'other'
  photos: { key: string; kind: PhotoKind; assetId: string; url: string }[]
}
const draftKey = (id: string) => `luminix:visit-draft:${id}`
function readDraft(id: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id))
    const draft = raw ? (JSON.parse(raw) as Draft) : null
    // A week-old draft is stale (prices and stock moved on).
    return draft && Date.now() - draft.savedAt < 7 * 86_400_000 ? draft : null
  } catch {
    return null
  }
}
function clearDraft(id: string) {
  try {
    window.localStorage.removeItem(draftKey(id))
  } catch {
    // No storage: nothing to clear.
  }
}
const photoLabel: Record<PhotoKind, string> = {
  normal: 'Resultado',
  before: 'Antes',
  after: 'Depois',
  other: 'Outras',
}
const maxPhotos = 30

type Step = 'pay' | 'supplies' | 'photos' | 'review'
const stepMeta: Record<Step, { emoji: string; label: string }> = {
  pay: { emoji: '💰', label: 'Pagamento' },
  supplies: { emoji: '🧴', label: 'Produtos' },
  photos: { emoji: '📸', label: 'Fotos' },
  review: { emoji: '✅', label: 'Concluir' },
}

/** Step of a stepper: grams and millilitres move by 5, everything else by 1. */
const stepOf = (unit: string) => (unit === 'g' || unit === 'ml' ? 5 : 1)

/**
 * "Concluir atendimento" in steps: payment (no cash gap: what is not received stays open in the
 * Financeiro and in the notices), products used (estimated by the service recipe, adjustable)
 * and photos for the client's album (uploaded while the rest is filled in).
 */
export function CompleteVisit({
  api,
  item,
  access,
  today,
  back,
  onDone,
}: {
  api: ClinicApi
  item: AppointmentView
  access: AppointmentAccess
  today: string
  back: ReactNode
  onDone: (message: string) => void
}) {
  const due = payment(item)
  const pk = item.package ?? null
  const [draft] = useState(() => readDraft(item.id))
  const [restored, setRestored] = useState(
    Boolean(draft && (draft.seen.length > 1 || draft.photos.length)),
  )
  // "A combinar"/"a partir de" without an amount yet: the clinic sets it here.
  const variable = access.charge && needsAgreedPrice(item)
  const [agreed, setAgreed] = useState(
    draft?.agreed ??
      (variable && item.priceType === 'from' ? moneyInput(item.priceCents ?? 0) : ''),
  )
  const agreedCents = variable ? parseMoney(agreed) : null
  const quote = isQuote(item) && !item.paid && !variable
  const target = pk
    ? (pk.dueNowCents ?? 0)
    : variable
      ? Math.max(0, (agreedCents ?? 0) - (item.paidCents ?? 0))
      : due.remaining
  // The most that can enter now: a package accepts up to its open balance.
  const ceiling = pk ? (pk.remainingCents ?? 0) : quote ? Infinity : target
  const charge = access.charge && (quote || variable || ceiling > 0)

  const [mode, setMode] = useState<'full' | 'part' | 'later'>(
    draft?.mode ?? (charge && (target > 0 || quote || variable) ? 'full' : 'later'),
  )
  const [cash, setCash] = useState(draft?.cash ?? (quote || !target ? '' : moneyInput(target)))
  const [method, setMethod] = useState(draft?.method ?? 'pix')
  const [supplies, setSupplies] = useState<Supply[] | null>(null)
  const [used, setUsed] = useState<Record<string, number>>({})
  const [folder, setFolder] = useState<string | null>(null)
  const [beforeAfter, setBeforeAfter] = useState<string | null>(null)
  const [photos, setPhotos] = useState<Photo[]>(() =>
    (draft?.photos ?? []).map((photo) => ({
      key: photo.key,
      kind: photo.kind,
      preview: photo.url,
      remoteUrl: photo.url,
      assetId: photo.assetId,
      status: 'ready' as const,
    })),
  )
  const [photoKind, setPhotoKind] = useState<'normal' | 'before_after' | 'other'>(
    draft?.photoKind ?? 'normal',
  )
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const uploads = useRef(new Map<string, Promise<void>>())
  const latest = useRef<Photo[]>([])
  useEffect(() => {
    latest.current = photos
  }, [photos])
  const queue = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    let active = true
    void api
      .get<{ supplies: Supply[] }>(`appointments/${item.id}/supplies`)
      .then((data) => {
        if (!active) return
        setSupplies(data.supplies)
        setUsed({
          ...Object.fromEntries(
            data.supplies.map((supply) => [supply.itemId, supply.consumed ?? supply.quantity]),
          ),
          ...Object.fromEntries(
            Object.entries(draft?.used ?? {}).filter(([id]) =>
              data.supplies.some((supply) => supply.itemId === id && supply.consumed == null),
            ),
          ),
        })
      })
      .catch(() => active && setSupplies([]))
    // Photos go to the client's album inside "Clientes", when the person may add there.
    void api
      .get<{ folders: { id: string; systemKey: string | null }[] }>('library')
      .then((data) => {
        if (!active) return
        setFolder(data.folders.find((entry) => entry.systemKey === 'clients')?.id ?? null)
        setBeforeAfter(data.folders.find((entry) => entry.systemKey === 'before_after')?.id ?? null)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
    // The draft is read once, when the step opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, item.id])

  // Preview URLs live only while the step is open.
  const previews = useRef<string[]>([])
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url)
    },
    [],
  )

  const steps: Step[] = [
    ...(charge ? (['pay'] as const) : []),
    'supplies',
    ...(folder ? (['photos'] as const) : []),
    'review',
  ]
  const [step, setStep] = useState<Step>(draft?.step ?? (charge ? 'pay' : 'supplies'))
  const [seen, setSeen] = useState<Step[]>(draft?.seen ?? [step])
  const position = Math.max(0, steps.indexOf(step))

  // Everything filled in (and the photos already uploaded) survives closing the sheet.
  const finished = useRef(false)
  useEffect(() => {
    if (finished.current) return
    const draftValue: Draft = {
      savedAt: Date.now(),
      step,
      seen,
      mode,
      cash,
      method,
      agreed,
      used,
      photoKind,
      photos: photos
        .filter((photo) => photo.status === 'ready' && photo.assetId && photo.remoteUrl)
        .map((photo) => ({
          key: photo.key,
          kind: photo.kind,
          assetId: photo.assetId!,
          url: photo.remoteUrl!,
        })),
    }
    try {
      window.localStorage.setItem(draftKey(item.id), JSON.stringify(draftValue))
    } catch {
      // No storage (private mode): the visit is still completed normally.
    }
  }, [item.id, step, seen, mode, cash, method, agreed, used, photoKind, photos])

  function discardDraft() {
    clearDraft(item.id)
    finished.current = true
    setRestored(false)
    setMode(charge && (target > 0 || quote || variable) ? 'full' : 'later')
    setCash(quote || !target ? '' : moneyInput(target))
    setMethod('pix')
    setAgreed(variable && item.priceType === 'from' ? moneyInput(item.priceCents ?? 0) : '')
    setPhotos([])
    setUsed(
      Object.fromEntries(
        (supplies ?? []).map((supply) => [supply.itemId, supply.consumed ?? supply.quantity]),
      ),
    )
    setStep(charge ? 'pay' : 'supplies')
    setSeen([charge ? 'pay' : 'supplies'])
    // Saving starts again with the fresh values.
    requestAnimationFrame(() => {
      finished.current = false
    })
  }

  const cents = mode === 'later' ? 0 : (parseMoney(cash) ?? 0)
  const owedAfter = quote ? 0 : Math.max(0, target - cents)
  const payError =
    variable && (agreedCents == null || !agreed.trim())
      ? 'Informe o valor combinado do atendimento.'
      : !charge || mode === 'later'
        ? ''
        : !cents
          ? 'Informe quanto foi pago, ou escolha “Vai pagar depois”.'
          : cents > ceiling
            ? `O valor passa do que falta receber (${money(ceiling)}).`
            : ''

  function go(next: Step) {
    setError('')
    setStep(next)
    setSeen((current) => (current.includes(next) ? current : [...current, next]))
  }
  function forward() {
    if (step === 'pay' && payError) {
      setError(payError)
      return
    }
    go(steps[position + 1])
  }

  function addPhotos(files: File[], kind: PhotoKind) {
    const room = maxPhotos - photos.length
    const picked = files
      .filter((file) => /^image\/(png|jpe?g|webp)$/.test(file.type))
      .slice(0, Math.max(0, room))
    if (files.length && !picked.length)
      setError(room ? 'Use fotos JPG, PNG ou WebP.' : `Até ${maxPhotos} fotos por atendimento.`)
    const added = picked.map((file) => {
      const preview = URL.createObjectURL(file)
      previews.current.push(preview)
      return {
        key: crypto.randomUUID(),
        kind,
        file,
        preview,
        status: 'uploading' as const,
      }
    })
    setPhotos((current) => [...current, ...added])
    for (const photo of added) startUpload(photo)
  }

  // One upload at a time: a phone on 4G stays responsive while the rest is filled in.
  function startUpload(photo: Photo) {
    const work = queue.current.then(async () => {
      try {
        if (!photo.file) return
        const asset = await api.upload('library_photo', photo.file, folder ?? undefined)
        setPhotos((current) =>
          current.map((entry) =>
            entry.key === photo.key
              ? { ...entry, status: 'ready', assetId: asset.id, remoteUrl: asset.url }
              : entry,
          ),
        )
      } catch {
        setPhotos((current) =>
          current.map((entry) =>
            entry.key === photo.key ? { ...entry, status: 'failed' } : entry,
          ),
        )
      }
    })
    queue.current = work
    uploads.current.set(photo.key, work)
  }

  function removePhoto(key: string) {
    setPhotos((current) => current.filter((entry) => entry.key !== key))
    uploads.current.delete(key)
  }

  async function finish() {
    if (payError) {
      go('pay')
      setError(payError)
      return
    }
    setError('')
    try {
      if (photos.some((photo) => photo.status === 'uploading')) {
        setBusy('Terminando de enviar as fotos…')
        await Promise.all(uploads.current.values())
      }
      setBusy('Concluindo…')
      await api.put(`appointments/${item.id}/complete`, {
        supplies: (supplies ?? [])
          .filter((supply) => supply.consumed == null)
          .map((supply) => ({
            itemId: supply.itemId,
            quantity: Math.round(Math.max(used[supply.itemId] ?? 0, 0) * 100) / 100,
          })),
        payment:
          charge && mode !== 'later' && cents
            ? {
                amountCents: cents,
                method,
                description: (pk
                  ? `Parcela ${pk.name} (${pk.session}/${pk.total}) · ${item.client}`
                  : `${item.service} · ${item.client}`
                ).slice(0, 160),
              }
            : null,
        ...(variable && agreedCents != null ? { agreedPriceCents: agreedCents } : {}),
      })
      finished.current = true
      clearDraft(item.id)
      // Latest state: a photo may have finished while the payment was saved.
      const ready = latest.current
      const toSave = ready.filter((photo) => photo.status === 'ready' && photo.assetId)
      let failed = ready.length - toSave.length
      if (folder && toSave.length) {
        setBusy('Guardando as fotos no álbum…')
        // Each client gets her own album inside "Clientes", created on the first photos.
        const album = await api
          .post<{ id: string }>('library/client-folder', { clientId: item.clientId })
          .then((body) => body.id)
          .catch(() => folder)
        for (const photo of toSave) {
          try {
            const saved = await api.post<{ id: string }>('library/items', {
              folderId: album,
              assetId: photo.assetId,
              title: `${photoLabel[photo.kind]} · ${item.service} · ${dateBr(today)}`.slice(0, 120),
            })
            if ((photo.kind === 'before' || photo.kind === 'after') && beforeAfter)
              await api
                .put(`library/items/${saved.id}/links`, { folderIds: [beforeAfter] })
                .catch(() => undefined)
          } catch {
            failed += 1
          }
        }
      }
      const owed = charge && !quote ? owedAfter : 0
      onDone(
        [
          `${item.client}: atendimento concluído`,
          owed ? `${money(owed)} ficou a receber` : '',
          failed
            ? `${failed} ${failed === 1 ? 'foto não foi enviada' : 'fotos não foram enviadas'}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ') + '.',
      )
    } catch (caught) {
      setBusy('')
      setError(
        caught instanceof ClinicApiError && caught.status === 400 && pk
          ? 'O pagamento passa do saldo do pacote. Confira o valor.'
          : 'Não foi possível concluir. Tente de novo.',
      )
    }
  }

  const uploading = photos.filter((photo) => photo.status === 'uploading').length
  const counted = (kind: PhotoKind) => photos.filter((photo) => photo.kind === kind).length
  const changedSupplies = (supplies ?? []).filter((supply) => supply.consumed == null)

  return (
    <div className="apt-sheet-body sh-body">
      <section className="apt-step cv" aria-label="Concluir atendimento">
        {step === steps[0] ? back : null}
        <header className="cv-head">
          <h3>Concluir atendimento</h3>
          <p>{serviceTitle(item)}</p>
        </header>
        <ol className="cv-steps" aria-label="Etapas">
          {steps.map((id, index) => (
            <li key={id}>
              <button
                type="button"
                aria-current={id === step ? 'step' : undefined}
                data-done={index < position || undefined}
                disabled={!seen.includes(id) || Boolean(busy)}
                onClick={() => go(id)}
              >
                <i aria-hidden>
                  {index < position ? <Check size={14} strokeWidth={3} /> : stepMeta[id].emoji}
                </i>
                <span>{stepMeta[id].label}</span>
              </button>
            </li>
          ))}
        </ol>

        {restored ? (
          <p className="cv-draft">
            <span>📝 Continuando de onde você parou.</span>
            <button type="button" onClick={discardDraft}>
              Começar de novo
            </button>
          </p>
        ) : null}

        {step === 'pay' ? (
          <div className="cv-pane">
            {variable ? (
              <div className="cv-agreed">
                <MoneyField
                  label={
                    item.priceType === 'from'
                      ? `💬 Valor final (a partir de ${money(item.priceCents ?? 0)})`
                      : '💬 Valor combinado'
                  }
                  autoFocus={!agreed}
                  description="Definido pelo espaço no atendimento. Pago só aqui, nunca pelo app."
                  value={agreed}
                  onChange={(value) => {
                    setAgreed(value)
                    setError('')
                    const next = Math.max(0, (parseMoney(value) ?? 0) - (item.paidCents ?? 0))
                    if (mode === 'full') setCash(next ? moneyInput(next) : '')
                  }}
                />
              </div>
            ) : null}
            <div className="cv-due">
              <span className="cv-due-label">
                {pk
                  ? pk.plan === 'per_visit'
                    ? 'Parcela desta sessão'
                    : 'Saldo do pacote'
                  : quote
                    ? 'Serviço a combinar'
                    : variable
                      ? (item.paidCents ?? 0) > 0
                        ? 'Falta receber (já entrou ' + money(item.paidCents ?? 0) + ')'
                        : 'A receber'
                      : due.tone === 'part'
                        ? 'Falta receber'
                        : 'Valor do atendimento'}
              </span>
              <strong>{quote ? 'Digite o valor' : money(target)}</strong>
              {pk ? (
                <ul className="cv-due-facts">
                  <li>
                    🎁 {pk.name} · sessão {Math.min(pk.session, pk.total)}/{pk.total}
                  </li>
                  <li>🧾 {packagePlanLabel[pk.plan]}</li>
                  <li>
                    💰 Pago {money(pk.paidCents ?? 0)} de {money(pk.priceCents ?? 0)}
                  </li>
                  {pk.plan === 'per_visit' && (pk.remainingCents ?? 0) > target ? (
                    <li>📌 Saldo total: {money(pk.remainingCents ?? 0)}</li>
                  ) : null}
                </ul>
              ) : null}
            </div>

            <div className="cv-choice" role="radiogroup" aria-label="Como foi o pagamento">
              {(
                [
                  [
                    'full',
                    '✅',
                    quote
                      ? 'Pagou'
                      : pk && pk.plan !== 'per_visit'
                        ? 'Quitou o pacote'
                        : 'Pagou tudo',
                    quote ? 'Valor acertado' : money(target),
                  ],
                  ['part', '🌗', 'Pagou uma parte', 'O resto fica a receber'],
                  ['later', '⏳', 'Vai pagar depois', 'Fica em aberto'],
                ] as const
              )
                .filter(([id]) => id !== 'full' || target > 0 || quote || variable)
                .map(([id, emoji, title, hint]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={mode === id}
                    data-tone={id}
                    onClick={() => {
                      setMode(id)
                      setError('')
                      if (id === 'part') setCash('')
                      if (id === 'full' && !quote) setCash(target ? moneyInput(target) : '')
                    }}
                  >
                    <span aria-hidden>{emoji}</span>
                    <strong>{title}</strong>
                    <small>{hint}</small>
                  </button>
                ))}
            </div>

            {mode !== 'later' ? (
              <>
                <MoneyField
                  label={mode === 'part' ? 'Quanto pagou' : 'Valor recebido'}
                  autoFocus={quote || mode === 'part'}
                  description={
                    pk && ceiling > target
                      ? `Pode receber até ${money(ceiling)} (saldo do pacote).`
                      : undefined
                  }
                  value={cash}
                  onChange={(value) => {
                    setCash(value)
                    setError('')
                  }}
                />
                <div className="cv-methods" role="radiogroup" aria-label="Forma de pagamento">
                  {methods.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      role="radio"
                      aria-checked={method === entry.id}
                      onClick={() => setMethod(entry.id)}
                    >
                      <span aria-hidden>{entry.emoji}</span> {entry.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {!quote ? (
              <div className="cv-balance" aria-live="polite">
                <div>
                  <small>Entra agora</small>
                  <strong className="is-in">{money(cents)}</strong>
                </div>
                <div>
                  <small>Fica a receber</small>
                  <strong className={owedAfter ? 'is-owed' : 'is-zero'}>{money(owedAfter)}</strong>
                </div>
              </div>
            ) : null}
            {owedAfter > 0 && !quote ? (
              <p className="cv-alert" role="note">
                <AlertTriangle size={17} aria-hidden />
                <span>
                  <strong>{money(owedAfter)} fica em aberto.</strong> Aparece em Financeiro →{' '}
                  {pk ? 'Pacotes a receber' : 'Atendimentos a receber'} e nos avisos até ser
                  registrado.
                </span>
              </p>
            ) : null}
          </div>
        ) : null}

        {step === 'supplies' ? (
          <div className="cv-pane">
            {!supplies ? (
              <div className="cv-loading">
                <Spinner size="sm" aria-label="Carregando" /> Carregando produtos…
              </div>
            ) : supplies.length ? (
              <>
                <p className="cv-lead">
                  Já vem com o gasto de costume. Ajuste se hoje foi diferente — o estoque desconta
                  sozinho ao concluir.
                </p>
                <ul className="cv-supplies">
                  {supplies.map((supply) => {
                    const value = used[supply.itemId] ?? 0
                    const step = stepOf(supply.unit)
                    const done = supply.consumed != null
                    const unit = unitShort(supply.unit)
                    const after = supply.stock - (done ? 0 : value)
                    const tone = done
                      ? 'done'
                      : after < 0
                        ? 'short'
                        : after <= supply.quantity * 2
                          ? 'low'
                          : 'ok'
                    const fill =
                      supply.stock > 0 ? Math.min(100, (value / supply.stock) * 100) : 100
                    return (
                      <li key={supply.itemId} data-tone={tone}>
                        <div className="cv-supply-top">
                          <span className="cv-supply-icon" aria-hidden>
                            🧴
                          </span>
                          <span className="cv-supply-copy">
                            <strong>{supply.name}</strong>
                            <small>
                              {done
                                ? '✔️ Já descontado do estoque'
                                : `Padrão: ${amount(supply.quantity)} ${unit}`}
                            </small>
                          </span>
                          {!done && value !== supply.quantity ? (
                            <Button
                              isIconOnly
                              size="sm"
                              variant="ghost"
                              aria-label="Voltar ao padrão"
                              onPress={() => setUsed({ ...used, [supply.itemId]: supply.quantity })}
                            >
                              <RotateCcw size={15} />
                            </Button>
                          ) : null}
                        </div>
                        <div className="cv-stepper" aria-label={`Quanto usou de ${supply.name}`}>
                          <button
                            type="button"
                            aria-label="Menos"
                            disabled={done || value <= 0}
                            onClick={() =>
                              setUsed({ ...used, [supply.itemId]: Math.max(0, value - step) })
                            }
                          >
                            <Minus size={18} />
                          </button>
                          <output>
                            {amount(value)} <small>{unit}</small>
                          </output>
                          <button
                            type="button"
                            aria-label="Mais"
                            disabled={done}
                            onClick={() => setUsed({ ...used, [supply.itemId]: value + step })}
                          >
                            <Plus size={18} />
                          </button>
                          <button
                            type="button"
                            className="cv-none"
                            disabled={done || value === 0}
                            onClick={() => setUsed({ ...used, [supply.itemId]: 0 })}
                          >
                            Não usei
                          </button>
                        </div>
                        {!done ? (
                          <div className="cv-stock">
                            <span className="cv-stock-bar" aria-hidden>
                              <i style={{ width: `${fill}%` }} />
                            </span>
                            <small>
                              {tone === 'short'
                                ? `⚠️ Faltam ${amount(-after)} ${unit} no estoque`
                                : tone === 'low'
                                  ? `🟠 Sobram ${amount(after)} ${unit} — repor logo`
                                  : `🟢 Sobram ${amount(after)} ${unit} de ${amount(supply.stock)}`}
                            </small>
                          </div>
                        ) : null}
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : (
              <div className="cv-empty">
                <span aria-hidden>🧴</span>
                <strong>Nenhum produto ligado a este serviço</strong>
                <small>
                  Ligue em Serviços → Editar → Produtos para o estoque descontar sozinho.
                </small>
              </div>
            )}
          </div>
        ) : null}

        {step === 'photos' ? (
          <div className="cv-pane">
            <div className="cv-kinds" role="radiogroup" aria-label="Tipo de foto">
              {(
                [
                  ['normal', '📷', 'Resultado'],
                  ['before_after', '🌗', 'Antes e depois'],
                  ['other', '🗂️', 'Outras'],
                ] as const
              ).map(([id, emoji, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={photoKind === id}
                  onClick={() => setPhotoKind(id)}
                >
                  <span aria-hidden>{emoji}</span>
                  {label}
                </button>
              ))}
            </div>

            {photoKind === 'before_after' ? (
              <div className="cv-ba">
                {(['before', 'after'] as const).map((kind) => (
                  <PhotoColumn
                    key={kind}
                    title={kind === 'before' ? '⬅️ Antes' : '➡️ Depois'}
                    photos={photos.filter((photo) => photo.kind === kind)}
                    full={photos.length >= maxPhotos}
                    onAdd={(files) => addPhotos(files, kind)}
                    onRemove={removePhoto}
                    onRetry={(photo) => {
                      setPhotos((current) =>
                        current.map((entry) =>
                          entry.key === photo.key ? { ...entry, status: 'uploading' } : entry,
                        ),
                      )
                      startUpload(photo)
                    }}
                  />
                ))}
              </div>
            ) : (
              <PhotoColumn
                title={photoKind === 'normal' ? '📷 Fotos do resultado' : '🗂️ Outras fotos'}
                photos={photos.filter((photo) => photo.kind === photoKind)}
                full={photos.length >= maxPhotos}
                onAdd={(files) => addPhotos(files, photoKind)}
                onRemove={removePhoto}
                onRetry={(photo) => {
                  setPhotos((current) =>
                    current.map((entry) =>
                      entry.key === photo.key ? { ...entry, status: 'uploading' } : entry,
                    ),
                  )
                  startUpload(photo)
                }}
              />
            )}
            <p className="cv-lead">
              🔒 Em alta qualidade no álbum de {item.client.split(' ')[0]} (Mídia → Clientes), só
              para a equipe.
              {beforeAfter ? ' Antes e depois também aparecem na pasta Antes e depois.' : ''}
              {photos.length ? ` ${photos.length} de ${maxPhotos}.` : ''}
            </p>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="cv-pane">
            <ul className="cv-review">
              {charge ? (
                <li data-tone={owedAfter && !quote ? 'warn' : 'ok'}>
                  <span aria-hidden>💰</span>
                  <span>
                    <strong>
                      {cents
                        ? `Recebe ${money(cents)} · ${methods.find((entry) => entry.id === method)?.label}`
                        : 'Nada recebido agora'}
                    </strong>
                    <small>
                      {owedAfter && !quote
                        ? `${money(owedAfter)} fica a receber no Financeiro`
                        : pk
                          ? `${pk.name}: sessão ${Math.min(pk.session, pk.total)}/${pk.total}`
                          : 'Caixa fechado para este atendimento'}
                    </small>
                  </span>
                  <button type="button" onClick={() => go('pay')}>
                    Editar
                  </button>
                </li>
              ) : due.remaining === 0 ? (
                <li data-tone="ok">
                  <span aria-hidden>💰</span>
                  <span>
                    <strong>{due.label}</strong>
                    <small>Nada a cobrar neste atendimento</small>
                  </span>
                </li>
              ) : null}
              <li data-tone="ok">
                <span aria-hidden>🧴</span>
                <span>
                  <strong>
                    {changedSupplies.length
                      ? `Desconta ${changedSupplies.filter((supply) => (used[supply.itemId] ?? 0) > 0).length} ${changedSupplies.length === 1 ? 'produto' : 'produtos'} do estoque`
                      : 'Sem produtos para descontar'}
                  </strong>
                  <small>
                    {changedSupplies
                      .filter((supply) => (used[supply.itemId] ?? 0) > 0)
                      .map(
                        (supply) =>
                          `${supply.name} ${amount(used[supply.itemId] ?? 0)} ${unitShort(supply.unit)}`,
                      )
                      .join(' · ') || 'Nada usado do estoque'}
                  </small>
                </span>
                <button type="button" onClick={() => go('supplies')}>
                  Editar
                </button>
              </li>
              {folder ? (
                <li data-tone={photos.some((photo) => photo.status === 'failed') ? 'warn' : 'ok'}>
                  <span aria-hidden>📸</span>
                  <span>
                    <strong>
                      {photos.length
                        ? `${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'} no álbum`
                        : 'Sem fotos'}
                    </strong>
                    <small>
                      {photos.length
                        ? (['normal', 'before', 'after', 'other'] as const)
                            .filter((kind) => counted(kind))
                            .map((kind) => `${counted(kind)} ${photoLabel[kind].toLowerCase()}`)
                            .join(' · ') + (uploading ? ` · enviando ${uploading}…` : '')
                        : 'Pode adicionar depois na Mídia'}
                    </small>
                  </span>
                  <button type="button" onClick={() => go('photos')}>
                    Editar
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {error ? (
          <p className="apt-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="cv-foot">
          {position > 0 ? (
            <Button
              variant="ghost"
              isDisabled={Boolean(busy)}
              onPress={() => go(steps[position - 1])}
            >
              <ChevronLeft size={17} aria-hidden /> Voltar
            </Button>
          ) : (
            <span />
          )}
          {step === 'review' ? (
            <Button
              className="sh-primary cv-finish"
              isDisabled={Boolean(busy)}
              onPress={() => void finish()}
            >
              {busy ? (
                <>
                  <Spinner size="sm" aria-hidden /> {busy}
                </>
              ) : (
                <>
                  <Check size={19} aria-hidden /> Concluir atendimento
                </>
              )}
            </Button>
          ) : (
            <Button className="cv-next" onPress={forward}>
              {step === 'photos' && !photos.length ? 'Pular fotos' : 'Continuar'}
              <ChevronRight size={17} aria-hidden />
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

/** A set of photos with "take photo" and "gallery", optimistic thumbnails and remove. */
function PhotoColumn({
  title,
  photos,
  full,
  onAdd,
  onRemove,
  onRetry,
}: {
  title: string
  photos: Photo[]
  full: boolean
  onAdd: (files: File[]) => void
  onRemove: (key: string) => void
  onRetry: (photo: Photo) => void
}) {
  const pick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    onAdd(files)
  }
  return (
    <div className="cv-photos">
      <strong className="cv-photos-title">{title}</strong>
      <div className="cv-photo-actions">
        <label className={`cv-pick is-camera${full ? ' is-off' : ''}`}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={full}
            onChange={pick}
          />
          <Camera size={19} aria-hidden /> Tirar foto
        </label>
        <label className={`cv-pick${full ? ' is-off' : ''}`}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={full}
            onChange={pick}
          />
          <ImagePlus size={19} aria-hidden /> Galeria
        </label>
      </div>
      {photos.length ? (
        <ul className="cv-thumbs">
          {photos.map((photo) => (
            <li key={photo.key} data-status={photo.status}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) */}
              <img
                src={photo.preview}
                alt=""
                // A restored photo's signed link may have expired: the photo is still saved.
                onError={(event) => {
                  event.currentTarget.style.visibility = 'hidden'
                }}
              />
              {photo.status === 'uploading' ? (
                <span className="cv-thumb-state">
                  <Spinner size="sm" aria-label="Enviando" />
                </span>
              ) : photo.status === 'failed' ? (
                <button
                  type="button"
                  className="cv-thumb-state is-failed"
                  onClick={() => onRetry(photo)}
                >
                  <RotateCcw size={16} aria-hidden /> Tentar de novo
                </button>
              ) : (
                <span className="cv-thumb-ok" aria-label="Enviada">
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
              <button
                type="button"
                className="cv-thumb-remove"
                aria-label="Remover foto"
                onClick={() => onRemove(photo.key)}
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
