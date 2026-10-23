'use client'

import { Button, Card } from '@heroui/react'
import { Banknote, CreditCard, FlaskConical, RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js/pure'
import {
  ConnectAccountManagement,
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
  ConnectPayments,
  ConnectPayouts,
} from '@stripe/react-connect-js'
import { onAuthStateChanged } from 'firebase/auth'
import { useStaff } from '@/components/staff-provider'
import { useClinic } from '@/components/clinic-workspace'
import { getFirebaseAuth } from '@/lib/firebase'

type Purpose = 'onboarding' | 'management' | 'payments' | 'payouts'
type Status = {
  state: 'not_started' | 'pending' | 'active' | 'restricted'
  chargesEnabled: boolean
  payoutsEnabled: boolean
  requirementsDue: number
  testMode: boolean
}
const labels = {
  not_started: 'Configure seus recebimentos',
  pending: 'Cadastro em andamento ou em análise',
  active: 'Conta habilitada pela Stripe',
  restricted: 'Seu cadastro precisa de atenção',
}

export function ConnectPanel({ dashboard = false }: { dashboard?: boolean }) {
  const { clinic, permissions } = useClinic()
  const staff = useStaff()
  if (!permissions.includes('settings:manage'))
    return (
      <p role="alert">
        Somente quem tem permissão para configurar a clínica pode gerenciar os recebimentos.
      </p>
    )
  if (!staff.user) return null
  return (
    <ConnectContent
      key={`${staff.user.uid}/${clinic.id}/${staff.revision}`}
      clinicId={clinic.id}
      dashboard={dashboard}
    />
  )
}

function ConnectContent({ clinicId, dashboard }: { clinicId: string; dashboard: boolean }) {
  const { user } = useStaff()
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [embedded, setEmbedded] = useState<{
    instance: StripeConnectInstance
    purpose: Purpose
  } | null>(null)
  const lifetime = useRef<AbortController | null>(null)
  const refreshSequence = useRef(0)
  const instances = useRef<StripeConnectInstance[]>([])

  const request = useCallback(
    async (purpose?: Purpose) => {
      if (!user || lifetime.current?.signal.aborted) throw new Error('Sessão encerrada.')
      const response = await fetch(
        `/api/clinics/${clinicId}/payments/connect${purpose ? '/session' : ''}`,
        {
          method: purpose ? 'POST' : 'GET',
          headers: {
            authorization: `Bearer ${await user.getIdToken()}`,
            ...(purpose ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(purpose ? { body: JSON.stringify({ purpose }) } : {}),
          cache: 'no-store',
          signal: AbortSignal.any([lifetime.current!.signal, AbortSignal.timeout(50_000)]),
        },
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? 'Seu acesso aos recebimentos foi removido. Atualize seu acesso à clínica.'
            : body.error || 'Não foi possível acessar os recebimentos.',
        )
      return body
    },
    [clinicId, user],
  )

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current
    setLoading(true)
    setError('')
    try {
      const body = await request()
      if (!lifetime.current?.signal.aborted && sequence === refreshSequence.current)
        setStatus(body.status)
    } catch (cause) {
      if (!lifetime.current?.signal.aborted && sequence === refreshSequence.current) {
        setStatus(null)
        setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a conta.')
      }
    } finally {
      if (!lifetime.current?.signal.aborted && sequence === refreshSequence.current)
        setLoading(false)
    }
  }, [request])

  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    void request()
      .then((body) => {
        if (!controller.signal.aborted) setStatus(body.status)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a conta.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (current) => {
      if (current?.uid !== user?.uid) {
        controller.abort()
        for (const instance of instances.current) void instance.logout()
      }
    })
    return () => {
      controller.abort()
      unsubscribe()
    }
  }, [request, user?.uid])

  async function open(purpose: Purpose) {
    if (opening) return
    setOpening(true)
    setError('')
    setEmbedded(null)
    try {
      const first = await request(purpose)
      if (lifetime.current?.signal.aborted) return
      let initialSecret: string | null = first.clientSecret
      const instance = loadConnectAndInitialize({
        publishableKey: first.publishableKey,
        locale: 'pt-BR',
        appearance: {
          overlays: 'dialog',
          variables: { colorPrimary: '#a73570', borderRadius: '12px' },
        },
        fetchClientSecret: async () => {
          if (lifetime.current?.signal.aborted) throw new Error('Sessão encerrada.')
          if (initialSecret) {
            const value = initialSecret
            initialSecret = null
            return value
          }
          try {
            return (await request(purpose)).clientSecret
          } catch (cause) {
            if (!lifetime.current?.signal.aborted)
              setError(
                'Não foi possível renovar o acesso à Stripe. Feche o formulário e tente novamente.',
              )
            throw cause
          }
        },
      })
      instances.current.push(instance)
      setEmbedded({ instance, purpose })
    } catch (cause) {
      if (!lifetime.current?.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o cadastro.')
    } finally {
      if (!lifetime.current?.signal.aborted) setOpening(false)
    }
  }
  function close() {
    setEmbedded(null)
    void refresh()
  }
  const loadError = () =>
    setError(
      'A Stripe não carregou. Verifique sua conexão e permita a janela de autenticação; depois tente novamente.',
    )

  return (
    <Card className="w-full min-w-0 p-5">
      {!embedded && (
        <>
          <Card.Header>
            <Card.Title>{status ? labels[status.state] : 'Recebimentos da clínica'}</Card.Title>
          </Card.Header>
          <Card.Content className="flex min-w-0 flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  icon: CreditCard,
                  title: '1. Cadastre a clínica',
                  text: 'A Stripe Connect vincula a conta de recebimentos da clínica ao Luminix.',
                },
                {
                  icon: ShieldCheck,
                  title: '2. Confirme seus dados',
                  text: 'Documentos, dados bancários e autenticação são tratados diretamente pela Stripe.',
                },
                {
                  icon: Banknote,
                  title: '3. Acompanhe os repasses',
                  text: 'Quando os pagamentos estiverem disponíveis, a Stripe enviará o saldo à conta cadastrada, conforme seus prazos e tarifas.',
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-current/10 p-4">
                  <Icon aria-hidden="true" className="mb-3 size-5" />
                  <h3 className="mb-1 text-sm font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
              <FlaskConical aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div className="space-y-2 text-sm leading-relaxed">
                <p className="font-semibold">Ambiente de teste · nenhum dinheiro real</p>
                <p>
                  Você pode configurar uma conta Connect de teste. O checkout de tratamentos,
                  pacotes e assinaturas dos clientes ainda não está disponível no Luminix.
                </p>
                <p>
                  Sem comissão do Luminix nesta fase. Em pagamentos reais, as tarifas e os prazos da
                  Stripe se aplicam.
                </p>
              </div>
            </div>
            {loading && <p role="status">Consultando a Stripe…</p>}
            {status && status.state !== 'not_started' && !loading && (
              <div aria-live="polite" className="flex flex-col gap-1 text-sm">
                <p>
                  Pagamentos:{' '}
                  {status.chargesEnabled ? 'habilitados em teste' : 'aguardando liberação'}
                </p>
                <p>
                  Repasses:{' '}
                  {status.payoutsEnabled ? 'habilitados em teste' : 'aguardando liberação'}
                </p>
                {status.requirementsDue > 0 && (
                  <p>Há informações pendentes. Continue o cadastro para revisar.</p>
                )}
              </div>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button isDisabled={opening || loading} onPress={() => void open('onboarding')}>
                {opening
                  ? 'Abrindo…'
                  : status?.state === 'active'
                    ? 'Revisar cadastro Stripe'
                    : status?.state === 'not_started'
                      ? 'Configurar recebimentos'
                      : 'Continuar cadastro Stripe'}
              </Button>
              <Button
                variant="primary"
                className="!bg-blue-600 !text-white hover:!bg-blue-700"
                isDisabled={opening || loading}
                onPress={() => void refresh()}
              >
                <RefreshCw aria-hidden="true" className="size-4" />
                Atualizar situação
              </Button>
            </div>
            <details className="rounded-xl border border-current/10 p-4 text-sm">
              <summary className="cursor-pointer font-semibold">
                Como acessar e testar o cadastro?
              </summary>
              <div className="mt-3 space-y-2 leading-relaxed">
                <p>
                  O login do Luminix e o acesso à Stripe são separados. O e-mail usado no Luminix
                  não cria automaticamente uma senha Stripe.
                </p>
                <p>
                  Permita a janela de autenticação da Stripe. Se você já tem uma conta Stripe, use o
                  acesso correspondente; se estiver criando uma conta, siga o cadastro apresentado
                  pela Stripe.
                </p>
                <p>
                  Para uma conta Connect de teste, a documentação Stripe orienta usar{' '}
                  <strong>000-000</strong> quando solicitar código SMS. Esse código não substitui a
                  autenticação de dois fatores de uma conta Stripe real.
                </p>
                <p>
                  Se a tela estiver pedindo configurar um autenticador ou recuperar uma conta
                  existente, conclua ou recupere o acesso na própria Stripe. Apenas clicar em
                  avançar não conclui essa configuração.
                </p>
                <a
                  className="font-semibold underline"
                  href="https://docs.stripe.com/connect/testing"
                  target="_blank"
                  rel="noreferrer"
                >
                  Consultar o guia de testes da Stripe
                </a>
                <p>Você pode continuar o onboarding e retomar este cadastro no Financeiro.</p>
              </div>
            </details>
            {dashboard && status && status.state !== 'not_started' && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  isDisabled={opening}
                  onPress={() => void open('management')}
                >
                  Dados e conta bancária
                </Button>
                <Button
                  variant="secondary"
                  isDisabled={opening}
                  onPress={() => void open('payments')}
                >
                  Pagamentos, reembolsos e disputas
                </Button>
                <Button
                  variant="secondary"
                  isDisabled={opening}
                  onPress={() => void open('payouts')}
                >
                  Repasses
                </Button>
              </div>
            )}
          </Card.Content>
        </>
      )}
      {embedded && (
        <section
          aria-label="Configuração Stripe"
          className="w-full min-w-0 rounded-xl bg-white p-4 text-slate-900"
        >
          <div className="mb-4 flex justify-end">
            <Button variant="secondary" onPress={close}>
              Fechar e atualizar situação
            </Button>
          </div>
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-700">
              {error}
            </p>
          )}
          <ConnectComponentsProvider connectInstance={embedded.instance}>
            {embedded.purpose === 'onboarding' && (
              <ConnectAccountOnboarding onExit={close} onLoadError={loadError} />
            )}
            {embedded.purpose === 'management' && (
              <ConnectAccountManagement onLoadError={loadError} />
            )}
            {embedded.purpose === 'payments' && <ConnectPayments onLoadError={loadError} />}
            {embedded.purpose === 'payouts' && <ConnectPayouts onLoadError={loadError} />}
          </ConnectComponentsProvider>
        </section>
      )}
    </Card>
  )
}
