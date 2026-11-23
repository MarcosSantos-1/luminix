'use client'

import { Button, Spinner } from '@heroui/react'
import { ArrowLeft, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addDays, dateBr, money } from '../business/format'
import type { CatalogPackage } from '../business/packages-tab'
import { ClinicApiError, type ClinicApi } from '../settings/clinic-api'
import { methods } from './complete-visit'

type Plan = 'paid' | 'per_visit' | 'later'

/**
 * Inside "Novo agendamento": sells a package to the chosen client (which one, when it expires,
 * how she pays) and goes back to "Qual serviço?" with the package ready to book.
 */
export function BookingPackageSale({
  api,
  clientId,
  clientName,
  today,
  onBack,
  onSold,
}: {
  api: ClinicApi
  clientId: string
  clientName: string
  today: string
  onBack: () => void
  onSold: (message: string) => void
}) {
  const [catalog, setCatalog] = useState<{
    packages: CatalogPackage[]
    canFinance: boolean
  } | null>(null)
  const [failed, setFailed] = useState(false)
  const [picked, setPicked] = useState<CatalogPackage | null>(null)
  const [plan, setPlan] = useState<Plan>('later')
  const [method, setMethod] = useState('pix')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void api
      .get<{ packages: CatalogPackage[]; canFinance: boolean }>('catalog/extras')
      .then((data) => {
        if (!active) return
        setCatalog({
          packages: data.packages.filter((item) => item.status === 'active'),
          canFinance: data.canFinance,
        })
      })
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [api])

  function choose(item: CatalogPackage) {
    setPicked(item)
    setError('')
    setPlan(catalog?.canFinance && item.priceCents > 0 ? 'paid' : 'later')
  }

  async function sell() {
    if (!picked || busy) return
    setBusy(true)
    setError('')
    const registerIncome = plan === 'paid' && Boolean(catalog?.canFinance) && picked.priceCents > 0
    try {
      await api.post(`clients/${clientId}/packages`, {
        packageId: picked.id,
        soldOn: today,
        paymentPlan: picked.priceCents > 0 ? plan : 'paid',
        ...(registerIncome ? { registerIncome: true, method } : {}),
      })
      onSold(`${picked.name} ativado para ${clientName.split(' ')[0]}. Agende a primeira sessão.`)
    } catch (caught) {
      setBusy(false)
      setError(
        caught instanceof ClinicApiError && caught.status === 403
          ? 'Seu acesso não permite vender pacotes.'
          : 'Não foi possível ativar o pacote. Tente de novo.',
      )
    }
  }

  const installment = picked ? Math.ceil(picked.priceCents / Math.max(1, picked.sessions)) : 0

  return (
    <div className="bk-step bk-sale">
      <button type="button" className="apt-back" onClick={picked ? () => setPicked(null) : onBack}>
        <ArrowLeft size={16} aria-hidden /> {picked ? 'Outros pacotes' : 'Voltar para os serviços'}
      </button>

      {!picked ? (
        <>
          <p className="bk-sale-lead">
            🎁 Escolha o pacote de <strong>{clientName.split(' ')[0]}</strong>. Depois você volta
            para agendar a primeira sessão.
          </p>
          {failed ? (
            <p className="apt-error" role="alert">
              Não foi possível carregar os pacotes.
            </p>
          ) : !catalog ? (
            <div className="bk-sale-loading">
              <Spinner size="sm" aria-label="Carregando" />
            </div>
          ) : catalog.packages.length ? (
            <ul className="bk-sale-list">
              {catalog.packages.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => choose(item)}>
                    <span className="bk-sale-icon" aria-hidden>
                      {item.kind === 'combo' ? '💝' : '🎁'}
                    </span>
                    <span className="bk-sale-copy">
                      <strong>{item.name}</strong>
                      <small>
                        {item.kind === 'combo'
                          ? `Combo · ${item.items?.length ?? 0} serviços`
                          : `${item.sessions} ${item.sessions === 1 ? 'sessão' : 'sessões'}`}{' '}
                        ·{' '}
                        {item.validityDays
                          ? `vence em ${item.validityDays} dias`
                          : '♾️ sem vencimento'}
                      </small>
                    </span>
                    <span className="bk-sale-price">{money(item.priceCents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="apt-hint">Nenhum pacote à venda. Crie em Serviços → Pacotes.</p>
          )}
        </>
      ) : (
        <>
          <div className="bk-sale-picked">
            <span className="bk-sale-icon" aria-hidden>
              {picked.kind === 'combo' ? '💝' : '🎁'}
            </span>
            <span className="bk-sale-copy">
              <strong>{picked.name}</strong>
              <small>
                {picked.kind === 'combo'
                  ? `Combo · ${picked.items?.length ?? 0} serviços`
                  : `${picked.sessions} sessões`}{' '}
                ·{' '}
                {picked.validityDays
                  ? `vence em ${dateBr(addDays(today, picked.validityDays))}`
                  : '♾️ sem vencimento'}
              </small>
            </span>
            <span className="bk-sale-price">{money(picked.priceCents)}</span>
          </div>

          {picked.priceCents > 0 ? (
            <>
              <strong className="bk-sale-title">💳 Como a cliente vai pagar?</strong>
              <div
                className="pk-plan bk-sale-plan"
                role="radiogroup"
                aria-label="Como a cliente paga"
              >
                {(
                  [
                    [
                      'paid',
                      '✅ Pago agora',
                      `${money(picked.priceCents)} entra hoje no Financeiro`,
                    ],
                    [
                      'per_visit',
                      '🔁 A cada sessão',
                      `${money(installment)} recebido em cada visita`,
                    ],
                    ['later', '⏳ Paga depois', 'Fica em aberto até registrar'],
                  ] as const
                ).map(([id, title, detail]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={plan === id}
                    disabled={busy || (id === 'paid' && !catalog?.canFinance)}
                    onClick={() => setPlan(id)}
                  >
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </button>
                ))}
              </div>
              {plan === 'paid' && catalog?.canFinance ? (
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
              ) : null}
            </>
          ) : null}

          {error ? (
            <p className="apt-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            className="bk-sale-confirm lx-laser"
            isDisabled={busy}
            onPress={() => void sell()}
          >
            {busy ? (
              'Ativando…'
            ) : (
              <>
                <Check size={18} aria-hidden /> Ativar pacote e agendar
              </>
            )}
          </Button>
        </>
      )}
    </div>
  )
}
