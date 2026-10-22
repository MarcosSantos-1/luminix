'use client'

import { Button, Card } from '@heroui/react'
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
      <Card.Header>
        <Card.Title>{status ? labels[status.state] : 'Recebimentos da clínica'}</Card.Title>
      </Card.Header>
      <Card.Content className="flex min-w-0 flex-col gap-4">
        <p>
          Seus clientes pagam à clínica e a Stripe faz os repasses para a conta bancária cadastrada.
          Sem comissão do Luminix nesta fase; as tarifas da Stripe se aplicam.
        </p>
        <p className="text-sm">
          Ambiente de teste: este cadastro não recebe dinheiro real. O checkout de tratamentos,
          pacotes e assinaturas dos clientes será conectado em uma próxima entrega.
        </p>
        {loading && <p role="status">Consultando a Stripe…</p>}
        {status && status.state !== 'not_started' && !loading && (
          <div aria-live="polite" className="flex flex-col gap-1 text-sm">
            <p>
              Pagamentos: {status.chargesEnabled ? 'habilitados em teste' : 'aguardando liberação'}
            </p>
            <p>
              Repasses: {status.payoutsEnabled ? 'habilitados em teste' : 'aguardando liberação'}
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
            variant="secondary"
            isDisabled={opening || loading}
            onPress={() => void refresh()}
          >
            Atualizar situação
          </Button>
        </div>
        <p className="text-sm">
          O formulário abre aqui. A Stripe pode solicitar autenticação em uma janela própria. Você
          pode continuar o onboarding e retomar este cadastro no Financeiro.
        </p>
        {dashboard && status && status.state !== 'not_started' && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              isDisabled={opening}
              onPress={() => void open('management')}
            >
              Dados e conta bancária
            </Button>
            <Button variant="secondary" isDisabled={opening} onPress={() => void open('payments')}>
              Pagamentos, reembolsos e disputas
            </Button>
            <Button variant="secondary" isDisabled={opening} onPress={() => void open('payouts')}>
              Repasses
            </Button>
          </div>
        )}
        {embedded && (
          <section
            aria-label="Configuração Stripe"
            className="min-w-0 rounded-xl bg-white p-4 text-slate-900"
          >
            <div className="mb-4 flex justify-end">
              <Button variant="secondary" onPress={close}>
                Fechar e atualizar situação
              </Button>
            </div>
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
      </Card.Content>
    </Card>
  )
}
