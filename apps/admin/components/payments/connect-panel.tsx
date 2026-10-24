'use client'

import { Button, Card, Link, Spinner, Tooltip, toast } from '@heroui/react'
import {
  Banknote,
  CheckCircle2,
  CircleHelp,
  Clock3,
  CreditCard,
  ExternalLink,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
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
import './connect-panel.css'

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

type PanelProps = {
  dashboard?: boolean
  onReadyChange?: (ready: boolean) => void
  onChooseOutside?: () => void
}

export function ConnectPanel({ dashboard = false, onReadyChange, onChooseOutside }: PanelProps) {
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
      onReadyChange={onReadyChange}
      onChooseOutside={onChooseOutside}
    />
  )
}

function ConnectContent({
  clinicId,
  dashboard,
  onReadyChange,
  onChooseOutside,
}: PanelProps & { clinicId: string }) {
  const { user } = useStaff()
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [embedded, setEmbedded] = useState<{
    instance: StripeConnectInstance
    purpose: Purpose
  } | null>(null)
  const [componentLoading, setComponentLoading] = useState(false)
  const ready =
    status?.state === 'active' &&
    status.chargesEnabled &&
    status.payoutsEnabled &&
    status.requirementsDue === 0
  useEffect(() => {
    onReadyChange?.(ready && !loading && !opening && !embedded && !error)
  }, [ready, loading, opening, embedded, error, onReadyChange])
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
      if (!lifetime.current?.signal.aborted && sequence === refreshSequence.current) {
        setStatus(body.status)
        if (
          body.status.state === 'active' &&
          body.status.chargesEnabled &&
          body.status.payoutsEnabled &&
          body.status.requirementsDue === 0
        )
          toast.success('Cadastro Stripe pronto. Você já pode continuar.', { timeout: 5000 })
        else
          toast.info('Situação atualizada. Confira abaixo o que falta para continuar.', {
            timeout: 5000,
          })
      }
    } catch (cause) {
      if (!lifetime.current?.signal.aborted && sequence === refreshSequence.current) {
        setStatus(null)
        const message =
          cause instanceof Error ? cause.message : 'Não foi possível atualizar a conta.'
        setError(message)
        toast.danger(message)
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
    setComponentLoading(true)
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
      toast.info('Cadastro aberto. A Stripe pode abrir uma janela para confirmar seu acesso.', {
        timeout: 6000,
      })
    } catch (cause) {
      if (!lifetime.current?.signal.aborted) {
        const message =
          cause instanceof Error ? cause.message : 'Não foi possível abrir o cadastro.'
        setError(message)
        toast.danger(message)
      }
    } finally {
      if (!lifetime.current?.signal.aborted) setOpening(false)
    }
  }
  function close() {
    setEmbedded(null)
    void refresh()
  }
  const loadError = () => {
    setComponentLoading(false)
    const message =
      'Não foi possível carregar a Stripe. Verifique sua conexão e permita a janela de autenticação. Você pode tentar novamente ou escolher receber fora do app.'
    setError(message)
    toast.danger(message, { timeout: 7000 })
  }
  const loaderStart = () => setComponentLoading(false)

  return (
    <Card className="connect-panel w-full min-w-0 p-5" aria-busy={loading || opening}>
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
            {loading && (
              <div
                role="status"
                className="flex items-center gap-3 rounded-xl bg-blue-50 p-4 text-blue-950"
              >
                <Spinner size="sm" />
                Consultando a situação da sua conta…
              </div>
            )}
            {status && status.state !== 'not_started' && !loading && (
              <div aria-live="polite" className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    title: 'Pagamentos dos clientes',
                    enabled: status.chargesEnabled,
                    icon: CreditCard,
                    text: 'A Stripe precisa liberar a conta para aceitar os pagamentos dos seus clientes.',
                  },
                  {
                    title: 'Depósitos na sua conta',
                    enabled: status.payoutsEnabled,
                    icon: Banknote,
                    text: 'A Stripe precisa liberar os repasses para enviar o saldo à conta bancária cadastrada.',
                  },
                ].map(({ title, enabled, icon: Icon, text }) => (
                  <div
                    key={title}
                    className={
                      enabled
                        ? 'rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950'
                        : 'rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950'
                    }
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Icon aria-hidden="true" className="size-5" />
                      <h3 className="font-semibold">{title}</h3>
                    </div>
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      {enabled ? (
                        <CheckCircle2 aria-hidden="true" className="size-4" />
                      ) : (
                        <Clock3 aria-hidden="true" className="size-4" />
                      )}
                      {enabled ? 'Liberado em teste' : 'Ainda não liberado'}
                    </p>
                    <p className="text-sm leading-relaxed">
                      {enabled
                        ? 'Esta parte da conta está habilitada no ambiente de teste, sem movimentar dinheiro real.'
                        : text}
                    </p>
                  </div>
                ))}
                {status.requirementsDue > 0 && (
                  <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 sm:col-span-2">
                    <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
                    <div>
                      <p className="font-semibold">Há informações para completar ou corrigir</p>
                      <p className="mt-1 text-sm leading-relaxed">
                        Clique em “Continuar cadastro Stripe”. O formulário mostrará quais dados ou
                        documentos faltam. Depois de enviar, feche o formulário para conferir a
                        atualização.
                      </p>
                    </div>
                  </div>
                )}
                {!ready && status.requirementsDue === 0 && (
                  <p className="rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-950 sm:col-span-2">
                    A conta ainda não está pronta. Abra o cadastro para verificar se é necessário
                    enviar algum dado ou aguardar uma análise da Stripe. Se você já enviou tudo, use
                    “Atualizar situação” para consultar novamente.
                  </p>
                )}
              </div>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button isDisabled={opening || loading} onPress={() => void open('onboarding')}>
                {opening && <Spinner size="sm" />}
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
                <RefreshCw
                  aria-hidden="true"
                  className={`size-4 ${loading ? 'motion-safe:animate-spin' : ''}`}
                />
                Atualizar situação
              </Button>
            </div>
            {!dashboard && (
              <div
                aria-live="polite"
                className={
                  ready && !loading && !error
                    ? 'rounded-xl bg-emerald-50 p-4 text-emerald-950'
                    : 'rounded-xl bg-amber-50 p-4 text-amber-950'
                }
              >
                <p className="flex items-center gap-2 font-semibold">
                  {ready && !loading && !error ? (
                    <CheckCircle2 aria-hidden="true" className="size-5" />
                  ) : (
                    <TriangleAlert aria-hidden="true" className="size-5" />
                  )}
                  {ready && !loading && !error
                    ? 'Tudo pronto para continuar'
                    : 'Conclua a configuração para continuar'}
                </p>
                <p className="mt-2 text-sm leading-relaxed">
                  {ready && !loading && !error
                    ? 'A Stripe confirmou a liberação de pagamentos e repasses em teste. Você pode ir para a próxima etapa.'
                    : 'Com “Pagamentos no app”, só é possível continuar quando a Stripe liberar pagamentos e repasses e não houver informações pendentes. Se não conseguir concluir agora, escolha “Receber fora do app”.'}
                </p>
                {onChooseOutside && !ready && (
                  <Button className="mt-3" variant="secondary" onPress={onChooseOutside}>
                    Receber fora do app
                  </Button>
                )}
              </div>
            )}
            <section
              aria-label="Ajuda para acessar a Stripe"
              className="space-y-5 rounded-xl border border-current/10 p-5"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="size-5" />
                <h3 className="font-semibold">Antes de começar: acesso seguro à Stripe</h3>
                <Tooltip>
                  <Button
                    variant="ghost"
                    isIconOnly
                    aria-label="Por que a Stripe pede uma confirmação?"
                  >
                    <CircleHelp className="size-4" />
                  </Button>
                  <Tooltip.Content className="max-w-xs">
                    Essa confirmação protege o acesso aos seus dados bancários. Ela é feita
                    diretamente pela Stripe.
                  </Tooltip.Content>
                </Tooltip>
              </div>
              <div className="space-y-2 text-sm leading-relaxed">
                <h4 className="font-semibold">1. Entre ou crie seu acesso Stripe</h4>
                <p>
                  Seu acesso ao Luminix e seu acesso à Stripe são separados. Mesmo usando o mesmo
                  e-mail, a senha pode ser diferente. A janela da Stripe vai orientar você a entrar
                  ou criar seu acesso.
                </p>
                <p>
                  Se nenhuma janela abrir, permita os pop-ups da Stripe no seu navegador e tente
                  novamente.
                </p>
              </div>
              <div className="space-y-3 rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-950">
                <h4 className="font-semibold">2. Confirme que é você</h4>
                <p>
                  A Stripe pode pedir uma segunda confirmação para proteger sua conta. Use o método
                  que ela mostrar na tela; nem sempre será um aplicativo.
                </p>
                <p>
                  <strong>Se pedir um aplicativo autenticador:</strong> ele gera um código
                  temporário no seu celular. Você pode usar o Google Authenticator ou o Microsoft
                  Authenticator.
                </p>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    Se ainda não tiver um desses aplicativos, instale pela loja oficial do seu
                    celular.
                  </li>
                  <li>
                    Na configuração da Stripe, abra o aplicativo e adicione uma conta lendo o QR
                    code exibido.
                  </li>
                  <li>
                    Digite na Stripe os seis números que aparecerem no aplicativo, antes de o código
                    mudar.
                  </li>
                  <li>Guarde o código de recuperação que a Stripe fornecer em um lugar seguro.</li>
                </ol>
                <p>
                  Se você já configurou isso antes, abra a conta Stripe no seu aplicativo para obter
                  o código. Se perdeu o acesso, siga a recuperação oferecida pela Stripe.
                </p>
                <Link
                  className="inline-flex min-h-11 items-center gap-2 font-semibold underline"
                  href="https://support.stripe.com/questions/enable-two-step-authentication-via-mobile-app"
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver instruções da Stripe para o autenticador{' '}
                  <ExternalLink aria-hidden="true" className="size-4" />
                </Link>
              </div>
              <div className="space-y-2 text-sm leading-relaxed">
                <h4 className="font-semibold">3. Complete os dados solicitados</h4>
                <p>
                  A Stripe informa no próprio formulário os dados da clínica, da pessoa responsável
                  e da conta bancária que forem necessários. Senhas, documentos e dados bancários
                  são preenchidos diretamente na Stripe.
                </p>
                <p>
                  Este ambiente é de teste. Use os dados de teste indicados pela Stripe nos campos
                  de documentos e banco; números aleatórios podem ser recusados.
                </p>
                <Link
                  className="inline-flex min-h-11 items-center gap-2 font-semibold underline"
                  href="https://docs.stripe.com/connect/testing"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir guia de dados de teste da Stripe{' '}
                  <ExternalLink aria-hidden="true" className="size-4" />
                </Link>
              </div>
              <p className="text-sm leading-relaxed">
                Não conseguiu finalizar? Escolha “Receber fora do app” para continuar o cadastro da
                clínica. Você poderá configurar a Stripe depois, no Financeiro.
              </p>
            </section>
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
          <p className="mb-4 text-sm leading-relaxed">
            Se a Stripe abrir outra janela, confirme seu acesso nela. Caso peça um código de
            aplicativo autenticador, use o código gerado no seu celular. Ao terminar, feche este
            formulário para conferir a situação da conta.
          </p>
          {onChooseOutside && (
            <Button className="mb-4" variant="secondary" onPress={onChooseOutside}>
              Não consigo concluir agora: receber fora do app
            </Button>
          )}
          {error && (
            <p role="alert" className="mb-4 text-sm text-red-700">
              {error}
            </p>
          )}
          {componentLoading && (
            <div
              role="status"
              className="mb-4 flex items-center gap-3 rounded-xl bg-blue-50 p-4 text-blue-950"
            >
              <Spinner size="sm" />
              Carregando o formulário seguro da Stripe…
            </div>
          )}
          <ConnectComponentsProvider connectInstance={embedded.instance}>
            {embedded.purpose === 'onboarding' && (
              <ConnectAccountOnboarding
                onExit={close}
                onLoadError={loadError}
                onLoaderStart={loaderStart}
              />
            )}
            {embedded.purpose === 'management' && (
              <ConnectAccountManagement onLoadError={loadError} onLoaderStart={loaderStart} />
            )}
            {embedded.purpose === 'payments' && (
              <ConnectPayments onLoadError={loadError} onLoaderStart={loaderStart} />
            )}
            {embedded.purpose === 'payouts' && (
              <ConnectPayouts onLoadError={loadError} onLoaderStart={loaderStart} />
            )}
          </ConnectComponentsProvider>
        </section>
      )}
    </Card>
  )
}
