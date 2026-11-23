'use client'

import { Check, Clock3, Copy, QrCode } from 'lucide-react'
import { useState } from 'react'
import { reportDeposit } from '../../lib/client-app/store'
import type { Deposit } from '../../lib/client-app/types'

const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const keyLabels: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  phone: 'Celular',
  random: 'Chave aleatória',
}

function dueLabel(iso: string) {
  const due = new Date(iso)
  const today = new Date().toDateString() === due.toDateString()
  const clock = due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return today
    ? `hoje até ${clock}`
    : `até ${due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${clock}`
}

/**
 * Sinal por Pix do espaço (ADR-037): the code to paste in the bank app, the deadline and
 * "Já paguei". The space confirms after checking its statement; Luminix never holds the money.
 */
export function DepositPix({
  slug,
  appointmentId,
  deposit,
}: {
  slug: string
  appointmentId: string
  deposit: Deposit
}) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  if (deposit.status === 'confirmed')
    return (
      <div className="ca-deposit is-confirmed">
        <p className="ca-deposit-title">
          <Check size={18} aria-hidden /> Sinal de {money(deposit.cents)} confirmado
        </p>
        <small>O valor já foi abatido do total do atendimento.</small>
      </div>
    )
  if (deposit.status === 'expired')
    return (
      <div className="ca-deposit is-expired">
        <p className="ca-deposit-title">O prazo do sinal acabou e o horário foi liberado.</p>
        <small>Se você pagou, fale com o espaço com o comprovante.</small>
      </div>
    )

  const reported = deposit.status === 'reported'
  return (
    <div className={`ca-deposit${reported ? ' is-reported' : ''}`}>
      <p className="ca-deposit-title">
        <QrCode size={18} aria-hidden /> Sinal de {money(deposit.cents)} por Pix
      </p>
      {reported ? (
        <p className="ca-deposit-note">
          <Clock3 size={15} aria-hidden /> Avisamos o espaço. O horário fica guardado até ele
          conferir o pagamento.
        </p>
      ) : (
        <p className="ca-deposit-note">
          <Clock3 size={15} aria-hidden /> Pague {dueLabel(deposit.dueAt)} para garantir o horário.
          O restante você paga no dia.
        </p>
      )}
      {deposit.pix ? (
        <>
          <code className="ca-deposit-code">{deposit.pix.code}</code>
          <button
            type="button"
            className="ca-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(deposit.pix!.code)
                setCopied(true)
                setTimeout(() => setCopied(false), 2500)
              } catch {
                setProblem('Não deu para copiar. Selecione o código e copie manualmente.')
              }
            }}
          >
            <Copy size={17} aria-hidden /> {copied ? 'Código copiado!' : 'Copiar Pix copia e cola'}
          </button>
          <small className="ca-deposit-key">
            {keyLabels[deposit.pix.keyType] ?? 'Chave'}: {deposit.pix.key} · {deposit.pix.holder}
          </small>
        </>
      ) : null}
      {reported ? null : (
        <button
          type="button"
          className="ca-button ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const failure = await reportDeposit(slug, appointmentId)
            setBusy(false)
            setProblem(failure ?? '')
          }}
        >
          {busy ? 'Enviando…' : 'Já paguei'}
        </button>
      )}
      {problem ? (
        <p className="ca-error" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
