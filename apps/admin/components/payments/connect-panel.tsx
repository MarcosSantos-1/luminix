'use client'

import { Button, Card, Link, Spinner, Tooltip, toast } from '@heroui/react'
import {
  BadgePercent,
  Banknote,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Landmark,
  QrCode,
  RefreshCw,
  ShieldCheck,
  SquarePen,
  TriangleAlert,
} from 'lucide-react'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
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
import { ConnectHub, ConnectNextSteps, type PackageMode } from './connect-next-steps'
import './connect-panel.css'

type Purpose = 'onboarding' | 'management' | 'payments' | 'payouts'
export type ConnectPhase = 'loading' | 'ready' | 'reviewing' | 'blocked'
type Status = {
  state: 'not_started' | 'pending' | 'active' | 'restricted' | 'reviewing'
  chargesEnabled: boolean
  payoutsEnabled: boolean
  requirementsDue: number
  testMode: boolean
}
/** Where the account stands for the owner (ADR-041); the API saves it, the panel shows it. */
type Notice = 'filling' | 'reviewing' | 'approved' | 'needs_info' | 'restricted'
/** Same rule as the API, for the first paint or when the API could not save it. */
function noticeOf(status: Status, ready: boolean): Notice {
  if (ready) return 'approved'
  if (status.requirementsDue > 0 || status.state === 'not_started') return 'filling'
  if (status.state === 'restricted') return 'restricted'
  return 'reviewing'
}
const headlines: Record<Notice, string> = {
  filling: 'Falta completar o cadastro',
  reviewing: 'Cadastro enviado: a Stripe está analisando',
  approved: 'Tudo certo: você já pode receber pelo app',
  needs_info: 'A Stripe pediu mais uma informação',
  restricted: 'A Stripe não aprovou o cadastro',
}
const leads: Record<Notice, string> = {
  filling:
    'Abra o formulário seguro da Stripe e preencha os dados do espaço, da pessoa responsável e da conta bancária.',
  reviewing:
    'Não falta nada seu. A análise costuma levar de minutos a alguns dias úteis. Enquanto isso, você segue usando o Luminix normalmente e recebendo no espaço. Avisamos por e-mail e aqui no painel quando sair.',
  approved:
    'A Stripe aprovou a conta. Agora é só ligar o pagamento pelo app e suas clientes podem pagar por Pix ou cartão ao agendar.',
  needs_info:
    'Depois de analisar, a Stripe precisa de mais um dado ou documento. Toque em "Completar cadastro": ela mostra exatamente o que falta.',
  restricted:
    'Por enquanto o espaço continua recebendo no local, como sempre. Abra o cadastro para ver o que a Stripe informou ou fale com o nosso suporte.',
}

type PanelProps = {
  dashboard?: boolean
  onReadyChange?: (ready: boolean) => void
  onSettledChange?: (settled: boolean) => void
  onPhaseChange?: (phase: ConnectPhase) => void
  onChooseOutside?: () => void
}

function FlowDisclosure({
  id,
  title,
  hint,
  icon: Icon,
  open,
  onToggle,
  helpLabel,
  helpText,
  children,
}: {
  id: string
  title: string
  hint: string
  icon: typeof ShieldCheck
  open: boolean
  onToggle: () => void
  helpLabel?: string
  helpText?: string
  children: ReactNode
}) {
  return (
    <section aria-label={title} className={open ? 'connect-prep' : 'connect-prep is-collapsed'}>
      <div className="connect-prep-head">
        <h3 className="connect-prep-heading">
          <button
            type="button"
            className="connect-prep-toggle"
            aria-expanded={open}
            aria-controls={id}
            onClick={onToggle}
          >
            <span className="connect-step-icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <span className="connect-prep-toggle-copy">
              <span className="connect-prep-title">{title}</span>
              {!open && <span className="connect-prep-hint">{hint}</span>}
            </span>
            <ChevronDown
              aria-hidden="true"
              size={20}
              className={open ? 'connect-prep-chevron is-open' : 'connect-prep-chevron'}
            />
          </button>
        </h3>
        {helpLabel && helpText ? (
          <Tooltip>
            <Button className="connect-help" variant="ghost" isIconOnly aria-label={helpLabel}>
              <CircleHelp size={18} />
            </Button>
            <Tooltip.Content className="max-w-xs">{helpText}</Tooltip.Content>
          </Tooltip>
        ) : null}
      </div>
      {open ? (
        <div id={id} className="connect-prep-body">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function StripeAccessGuide({ testMode }: { testMode: boolean }) {
  return (
    <>
      <ol className="connect-prep-list">
        <li>
          <span className="connect-prep-num" aria-hidden="true">
            1
          </span>
          <div className="connect-prep-copy">
            <h4>Entre ou crie seu acesso Stripe</h4>
            <p>
              Seu acesso ao Luminix e seu acesso à Stripe são separados. Mesmo usando o mesmo
              e-mail, a senha pode ser diferente. A janela da Stripe vai orientar você a entrar ou
              criar seu acesso.
            </p>
            <p>
              Se nenhuma janela abrir, permita os pop-ups da Stripe no seu navegador e tente
              novamente.
            </p>
          </div>
        </li>
        <li>
          <span className="connect-prep-num" aria-hidden="true">
            2
          </span>
          <div className="connect-prep-copy">
            <h4>Confirme que é você</h4>
            <p className="connect-must">
              <strong>Tem que instalar esse aplicativo no celular.</strong> A Stripe pede um código
              dele para confirmar que é você. Sem esse aplicativo, o cadastro não termina. Use o
              Google Authenticator ou o Microsoft Authenticator, baixado na loja oficial do celular.
            </p>
            <div className="connect-callout">
              <ul className="connect-substeps">
                <li>
                  Se ainda não tiver um desses aplicativos, instale pela loja oficial do seu
                  celular.
                </li>
                <li>
                  Na configuração da Stripe, abra o aplicativo e adicione uma conta lendo o QR code
                  exibido.
                </li>
                <li>
                  Digite na Stripe os seis números que aparecerem no aplicativo, antes de o código
                  mudar.
                </li>
                <li>Guarde o código de recuperação que a Stripe fornecer em um lugar seguro.</li>
              </ul>
              <p>
                Se você já configurou isso antes, abra a conta Stripe no seu aplicativo para obter o
                código. Se perdeu o acesso, siga a recuperação oferecida pela Stripe.
              </p>
              <Link
                className="ob2-areas-link connect-doc-link"
                href="https://support.stripe.com/questions/enable-two-step-authentication-via-mobile-app"
                target="_blank"
                rel="noreferrer"
              >
                Ver instruções da Stripe para o autenticador
                <Link.Icon />
              </Link>
            </div>
          </div>
        </li>
        <li>
          <span className="connect-prep-num" aria-hidden="true">
            3
          </span>
          <div className="connect-prep-copy">
            <h4>Complete os dados solicitados</h4>
            <p>
              A Stripe informa no próprio formulário os dados da clínica, da pessoa responsável e da
              conta bancária que forem necessários. Senhas, documentos e dados bancários são
              preenchidos diretamente na Stripe.
            </p>
            {testMode ? (
              <>
                <p>
                  Este ambiente é de teste. Use os dados de teste indicados pela Stripe nos campos
                  de documentos e banco; números aleatórios podem ser recusados.
                </p>
                <Link
                  className="ob2-areas-link connect-doc-link"
                  href="https://docs.stripe.com/connect/testing"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir guia de dados de teste da Stripe
                  <Link.Icon />
                </Link>
              </>
            ) : null}
          </div>
        </li>
      </ol>
      <p className="connect-prep-foot">
        Não conseguiu finalizar? Escolha “Receber fora do app” para continuar o cadastro da clínica.
        Você poderá configurar a Stripe depois, no Financeiro.
      </p>
    </>
  )
}

export function ConnectPanel({
  dashboard = false,
  onReadyChange,
  onSettledChange,
  onPhaseChange,
  onChooseOutside,
}: PanelProps) {
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
      onSettledChange={onSettledChange}
      onPhaseChange={onPhaseChange}
      onChooseOutside={onChooseOutside}
    />
  )
}

function ConnectContent({
  clinicId,
  dashboard,
  onReadyChange,
  onSettledChange,
  onPhaseChange,
  onChooseOutside,
}: PanelProps & { clinicId: string }) {
  const { user } = useStaff()
  const [status, setStatus] = useState<Status | null>(null)
  const [canContinue, setCanContinue] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [inApp, setInApp] = useState<{
    enabled: boolean
    guideDone: boolean
    packageMode?: PackageMode
  } | null>(null)
  // Test-only guidance disappears once the platform runs with real (live) keys.
  const testMode = status?.testMode !== false
  // Coming from the "Prosseguir" notice: the next steps render after the status loads.
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || notice !== 'approved' || !inApp || !dashboard) return
    if (window.location.hash !== '#proximos-passos') return
    scrolled.current = true
    requestAnimationFrame(() =>
      document.getElementById('proximos-passos')?.scrollIntoView({ behavior: 'smooth' }),
    )
  }, [notice, inApp, dashboard])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [embedded, setEmbedded] = useState<{
    instance: StripeConnectInstance
    purpose: Purpose
  } | null>(null)
  const [componentLoading, setComponentLoading] = useState(false)
  const ready = canContinue
  const prepSettled =
    !!status &&
    (status.state === 'active' || status.state === 'reviewing') &&
    status.requirementsDue === 0
  const [stripeOpen, setStripeOpen] = useState(true)
  const [prepOpen, setPrepOpen] = useState(Boolean(dashboard))
  const [timingOpen, setTimingOpen] = useState(false)
  const [feesOpen, setFeesOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const openedKey = `luminix-stripe-form:${clinicId}`
  const [openedInVisit, setOpenedInVisit] = useState(false)
  const storedFormOpened = useSyncExternalStore(
    subscribeFormOpened,
    () => readFormOpened(openedKey),
    () => false,
  )
  const formOpened = openedInVisit || storedFormOpened
  const prepCollapsed = useRef(false)
  function rememberFormOpened() {
    setOpenedInVisit(true)
    try {
      sessionStorage.setItem(openedKey, '1')
      window.dispatchEvent(new Event('luminix-stripe-form-opened'))
    } catch {
      /* Storage is optional; provider status remains the source of truth. */
    }
  }
  useEffect(() => {
    if (!prepSettled || prepCollapsed.current) return
    prepCollapsed.current = true
    setStripeOpen(false)
    setPrepOpen(false)
  }, [prepSettled])
  const phase: ConnectPhase =
    loading && !status
      ? 'loading'
      : !status
        ? 'blocked'
        : canContinue && status.state === 'active'
          ? 'ready'
          : canContinue || prepSettled
            ? 'reviewing'
            : 'blocked'
  useEffect(() => {
    onPhaseChange?.(phase)
  }, [phase, onPhaseChange])
  useEffect(() => {
    onReadyChange?.(ready && !loading && !opening && !embedded && !error)
  }, [ready, loading, opening, embedded, error, onReadyChange])
  useEffect(() => {
    if (!loading) onSettledChange?.(prepSettled)
  }, [loading, prepSettled, onSettledChange])
  /** The setup goes on once the form was sent with nothing pending (ADR-041). */
  function apply(body: {
    status: Status
    ready?: boolean
    submitted?: boolean
    notice?: Notice | null
    inApp?: { enabled: boolean; guideDone: boolean; packageMode?: PackageMode }
  }) {
    setStatus(body.status)
    setCanContinue(body.submitted ?? body.ready === true)
    setNotice(body.notice ?? noticeOf(body.status, body.ready === true))
    setInApp(body.inApp ?? null)
  }
  async function saveInApp(enabled: boolean) {
    try {
      const response = await fetch(`/api/clinics/${clinicId}/payments/in-app`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await user!.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      })
      if (!response.ok) throw new Error('save failed')
      setInApp((current) => ({ guideDone: current?.guideDone ?? false, enabled }))
      return true
    } catch {
      toast.danger('Não foi possível salvar agora. Tente de novo.')
      return false
    }
  }
  async function savePackageMode(mode: PackageMode) {
    try {
      const response = await fetch(`/api/clinics/${clinicId}/payments/package-mode`, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await user!.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
      })
      if (!response.ok) throw new Error('save failed')
      setInApp((current) => (current ? { ...current, packageMode: mode } : current))
      return true
    } catch {
      toast.danger('Não foi possível salvar agora. Tente de novo.')
      return false
    }
  }
  async function finishGuide() {
    try {
      const response = await fetch(`/api/clinics/${clinicId}/payments/guide-done`, {
        method: 'POST',
        // The proxy sends JSON; the API refuses an empty JSON body with 400.
        headers: {
          authorization: `Bearer ${await user!.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
      if (!response.ok) throw new Error('save failed')
      setInApp((current) => ({ enabled: current?.enabled ?? false, guideDone: true }))
      toast.success('Tudo pronto! Qualquer dúvida, o suporte está aqui.')
    } catch {
      toast.danger('Não foi possível salvar agora. Tente de novo.')
    }
  }
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
        apply(body)
        const next: Notice = body.notice ?? noticeOf(body.status, body.ready === true)
        if (next === 'approved')
          toast.success('Cadastro aprovado. Você já pode receber pelo app.', { timeout: 5000 })
        else if (next === 'reviewing')
          toast.success('Cadastro enviado. A Stripe está analisando; você já pode continuar.', {
            timeout: 6000,
          })
        else toast.info('Situação atualizada. Confira abaixo o que falta.', { timeout: 5000 })
      }
    } catch (cause) {
      if (!lifetime.current?.signal.aborted && sequence === refreshSequence.current) {
        setStatus(null)
        setCanContinue(false)
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
        if (!controller.signal.aborted) apply(body)
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
      rememberFormOpened()
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
  const showRefresh = Boolean(
    status &&
    status.state !== 'not_started' &&
    (dashboard || formOpened || status.state === 'active' || status.state === 'reviewing'),
  )
  const awaitingForm =
    status?.state === 'not_started' || status?.state === 'pending' || status?.state === 'restricted'

  const flow = !dashboard
  // Approved on the Financeiro page: the guide first, then a hub to check things day to day.
  const hub = dashboard && notice === 'approved' && !!inApp
  const hubLead = inApp?.guideDone
    ? 'Ligue ou desligue o pagamento pelo app e consulte pagamentos, reembolsos, repasses e a conta bancária.'
    : leads.approved
  return (
    <Card
      className={
        flow ? 'connect-panel connect-panel--flow w-full min-w-0' : 'connect-panel w-full min-w-0'
      }
      aria-busy={loading || opening}
    >
      {!embedded && flow && !status && (
        <Card.Content className="connect-body">
          {error ? (
            <>
              <p role="alert" className="connect-plain">
                {error}
              </p>
              <div className="connect-actions">
                <Button
                  variant="secondary"
                  className="connect-secondary connect-refresh"
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
            </>
          ) : (
            <div role="status" className="connect-loading">
              <Spinner size="sm" />
              Consultando a situação da sua conta…
            </div>
          )}
        </Card.Content>
      )}
      {!embedded && (!flow || status) && (
        <>
          <Card.Header>
            <div className="connect-title-block">
              <Card.Title className="connect-title">
                {flow && awaitingForm ? (
                  <span className="connect-pulse" aria-hidden="true" />
                ) : null}
                {status && notice ? headlines[notice] : 'Recebimentos da clínica'}
              </Card.Title>
              {flow && status ? (
                <p className="connect-lead">{notice ? leads[notice] : null}</p>
              ) : hub ? (
                <p className="connect-lead">{hubLead}</p>
              ) : null}
            </div>
          </Card.Header>
          <Card.Content className="connect-body">
            {flow ? <div className="connect-rule" aria-hidden="true" /> : null}
            {!flow && !loading && !prepSettled && (
              <div className="connect-steps">
                {[
                  {
                    icon: CreditCard,
                    title: 'Cadastre a clínica',
                    text: 'A Stripe Connect vincula a conta de recebimentos da clínica ao Luminix.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'Confirme seus dados',
                    text: 'Documentos, dados bancários e autenticação são tratados diretamente pela Stripe.',
                  },
                  {
                    icon: Banknote,
                    title: 'Acompanhe os repasses',
                    text: 'O dinheiro não cai na hora. Cartão costuma levar cerca de 30 dias. Pix e boleto, cerca de 2 dias úteis.',
                  },
                ].map(({ icon: Icon, title, text }) => (
                  <article key={title} className="connect-step">
                    <span className="connect-step-icon" aria-hidden="true">
                      <Icon size={20} />
                    </span>
                    <div className="connect-step-copy">
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {flow && (
              <>
                <FlowDisclosure
                  id="connect-what-stripe"
                  title="O que é a Stripe?"
                  hint="Quem recebe o pagamento e deposita na conta da clínica."
                  icon={CreditCard}
                  open={stripeOpen}
                  onToggle={() => setStripeOpen((open) => !open)}
                >
                  <p>
                    A Stripe é a empresa que recebe o pagamento da cliente e deposita na conta da
                    clínica. O Luminix não guarda esse dinheiro. O acesso da Stripe é separado do
                    acesso do Luminix: mesmo usando o mesmo e-mail, a senha pode ser outra.
                  </p>
                </FlowDisclosure>
                <FlowDisclosure
                  id="connect-stripe-access"
                  title="Antes de começar: acesso seguro à Stripe"
                  hint="Toque para ver como instalar o aplicativo e entrar na Stripe."
                  icon={ShieldCheck}
                  open={prepOpen}
                  onToggle={() => setPrepOpen((open) => !open)}
                  helpLabel="Por que a Stripe pede uma confirmação?"
                  helpText="Essa confirmação protege o acesso aos seus dados bancários. Ela é feita diretamente pela Stripe."
                >
                  <StripeAccessGuide testMode={testMode} />
                </FlowDisclosure>
                <FlowDisclosure
                  id="connect-when-money"
                  title="Quando o dinheiro chega na conta?"
                  hint="Cartão nacional leva cerca de 30 dias. Pix e boleto, cerca de 2 dias úteis."
                  icon={Landmark}
                  open={timingOpen}
                  onToggle={() => setTimingOpen((open) => !open)}
                  helpLabel="Por que o dinheiro não cai na hora?"
                  helpText="O Luminix não fica com esse dinheiro. A Stripe é quem deposita na conta da clínica, no prazo de cada forma de pagamento."
                >
                  <ul className="connect-faq-list">
                    <li>
                      <strong>Conferir a conta · 1 a 2 dias</strong>
                      <span>
                        Prazo para a Stripe analisar os dados. Se faltar documento, ela avisa.
                      </span>
                    </li>
                    <li>
                      <strong>Cartão nacional · cerca de 30 dias</strong>
                      <span>
                        No Brasil, a Stripe só libera esse valor depois desse prazo, por causa de
                        contestação e parcelamento. Não é o Luminix que segura o dinheiro.
                      </span>
                    </li>
                    <li>
                      <strong>Cartão internacional · cerca de 5 dias</strong>
                      <span>O prazo é menor do que o do cartão emitido no Brasil.</span>
                    </li>
                    <li>
                      <strong>Pix e boleto · cerca de 2 dias úteis</strong>
                      <span>
                        Chegam antes do cartão, quando essa forma estiver disponível na conta.
                      </span>
                    </li>
                    <li>
                      <strong>Depósito · em dia útil</strong>
                      <span>
                        Quando o valor libera, a Stripe envia sozinha para a conta bancária
                        cadastrada. Não há depósito no fim de semana.
                      </span>
                    </li>
                    <li>
                      <strong>Antecipar · só se a Stripe oferecer</strong>
                      <span>A taxa dessa pressa é da Stripe. O Luminix não antecipa.</span>
                    </li>
                  </ul>
                </FlowDisclosure>
                <FlowDisclosure
                  id="connect-fees"
                  title="Taxas e como a cliente paga"
                  hint="A taxa é da Stripe. O Luminix não cobra por cima nesta fase."
                  icon={BadgePercent}
                  open={feesOpen}
                  onToggle={() => setFeesOpen((open) => !open)}
                >
                  <p>
                    Quando o recebimento no app estiver ativo, a cliente paga por ali. A Stripe
                    recebe o valor, desconta a taxa dela e deposita o restante na conta da clínica,
                    no prazo de cada forma de pagamento. Nesta fase, o Luminix não cobra uma taxa
                    por cima. Se houver reembolso ou contestação, o valor sai do saldo da clínica na
                    Stripe.
                  </p>
                  {testMode ? (
                    <p>
                      Nada disso é cobrado de verdade neste cadastro. Estamos só preparando a conta,
                      em modo de teste.
                    </p>
                  ) : null}
                  <ul className="connect-faq-list">
                    <li>
                      <strong>Cartão nacional</strong>
                      <span>3,99% + R$ 0,39 por pagamento aprovado.</span>
                    </li>
                    <li>
                      <strong>Pix</strong>
                      <span>1,19%. A Stripe ainda libera o Pix por convite.</span>
                    </li>
                    <li>
                      <strong>Boleto</strong>
                      <span>R$ 3,45 por boleto pago.</span>
                    </li>
                  </ul>
                  <p>
                    Cartão internacional e conversão de moeda têm uma taxa extra da Stripe. Os
                    valores são os preços públicos de hoje e podem mudar.
                  </p>
                  <Link
                    className="ob2-areas-link connect-doc-link"
                    href="https://stripe.com/br/pricing"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver preços da Stripe
                    <Link.Icon />
                  </Link>
                </FlowDisclosure>
              </>
            )}
            {!flow && !hub && (
              <>
                <section className="connect-timing" aria-label="Quando o dinheiro chega na conta">
                  <div className="connect-timing-head">
                    <h3>Quando o dinheiro chega na conta</h3>
                    <p>O Luminix não guarda esse dinheiro. Quem envia para o banco é a Stripe.</p>
                  </div>
                  <div className="connect-timing-grid">
                    {[
                      {
                        icon: ClipboardCheck,
                        time: '1 a 2 dias',
                        title: 'Conferir a conta',
                        text: 'Prazo para a Stripe analisar os dados. Se faltar documento, ela avisa.',
                      },
                      {
                        icon: CreditCard,
                        time: '30 dias',
                        title: 'Cartão',
                        text: 'Tempo comum até uma venda no crédito cair na conta.',
                      },
                      {
                        icon: QrCode,
                        time: '2 dias úteis',
                        title: 'Pix e boleto',
                        text: 'Chega antes do cartão.',
                      },
                      {
                        icon: Landmark,
                        time: 'Todo dia',
                        title: 'Depósito',
                        text: 'A Stripe envia sozinha quando o valor libera.',
                      },
                      {
                        icon: BadgePercent,
                        time: 'Com taxa',
                        title: 'Antecipar',
                        text: 'Só se a Stripe oferecer. O Luminix não antecipa.',
                      },
                    ].map(({ icon: Icon, time, title, text }) => (
                      <article key={title} className="connect-when">
                        <span className="connect-step-icon" aria-hidden="true">
                          <Icon size={20} />
                        </span>
                        <p className="connect-when-time">{time}</p>
                        <h4>{title}</h4>
                        <p>{text}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section
                  aria-label="Ajuda para acessar a Stripe"
                  className={prepOpen ? 'connect-prep' : 'connect-prep is-collapsed'}
                >
                  <div className="connect-prep-head">
                    <h3 className="connect-prep-heading">
                      <button
                        type="button"
                        className="connect-prep-toggle"
                        aria-expanded={prepOpen}
                        aria-controls="connect-stripe-access"
                        onClick={() => setPrepOpen((open) => !open)}
                      >
                        <span className="connect-step-icon" aria-hidden="true">
                          <ShieldCheck size={20} />
                        </span>
                        <span className="connect-prep-toggle-copy">
                          <span className="connect-prep-title">
                            Antes de começar: acesso seguro à Stripe
                          </span>
                          {!prepOpen && (
                            <span className="connect-prep-hint">
                              Toque para ver como instalar o aplicativo e entrar na Stripe.
                            </span>
                          )}
                        </span>
                        <ChevronDown
                          aria-hidden="true"
                          size={20}
                          className={
                            prepOpen ? 'connect-prep-chevron is-open' : 'connect-prep-chevron'
                          }
                        />
                      </button>
                    </h3>
                    <Tooltip>
                      <Button
                        className="connect-help"
                        variant="ghost"
                        isIconOnly
                        aria-label="Por que a Stripe pede uma confirmação?"
                      >
                        <CircleHelp size={18} />
                      </Button>
                      <Tooltip.Content className="max-w-xs">
                        Essa confirmação protege o acesso aos seus dados bancários. Ela é feita
                        diretamente pela Stripe.
                      </Tooltip.Content>
                    </Tooltip>
                  </div>
                  {prepOpen && (
                    <div id="connect-stripe-access">
                      <ol className="connect-prep-list">
                        <li>
                          <span className="connect-prep-num" aria-hidden="true">
                            1
                          </span>
                          <div className="connect-prep-copy">
                            <h4>Entre ou crie seu acesso Stripe</h4>
                            <p>
                              Seu acesso ao Luminix e seu acesso à Stripe são separados. Mesmo
                              usando o mesmo e-mail, a senha pode ser diferente. A janela da Stripe
                              vai orientar você a entrar ou criar seu acesso.
                            </p>
                            <p>
                              Se nenhuma janela abrir, permita os pop-ups da Stripe no seu navegador
                              e tente novamente.
                            </p>
                          </div>
                        </li>
                        <li>
                          <span className="connect-prep-num" aria-hidden="true">
                            2
                          </span>
                          <div className="connect-prep-copy">
                            <h4>Confirme que é você</h4>
                            <p className="connect-must">
                              <strong>Tem que instalar esse aplicativo no celular.</strong>A Stripe
                              pede um código dele para confirmar que é você. Sem esse aplicativo, o
                              cadastro não termina. Use o Google Authenticator ou o Microsoft
                              Authenticator, baixado na loja oficial do celular.
                            </p>
                            <div className="connect-callout">
                              <ul className="connect-substeps">
                                <li>
                                  Se ainda não tiver um desses aplicativos, instale pela loja
                                  oficial do seu celular.
                                </li>
                                <li>
                                  Na configuração da Stripe, abra o aplicativo e adicione uma conta
                                  lendo o QR code exibido.
                                </li>
                                <li>
                                  Digite na Stripe os seis números que aparecerem no aplicativo,
                                  antes de o código mudar.
                                </li>
                                <li>
                                  Guarde o código de recuperação que a Stripe fornecer em um lugar
                                  seguro.
                                </li>
                              </ul>
                              <p>
                                Se você já configurou isso antes, abra a conta Stripe no seu
                                aplicativo para obter o código. Se perdeu o acesso, siga a
                                recuperação oferecida pela Stripe.
                              </p>
                              <Link
                                className="ob2-areas-link connect-doc-link"
                                href="https://support.stripe.com/questions/enable-two-step-authentication-via-mobile-app"
                                target="_blank"
                                rel="noreferrer"
                              >
                                Ver instruções da Stripe para o autenticador
                                <Link.Icon />
                              </Link>
                            </div>
                          </div>
                        </li>
                        <li>
                          <span className="connect-prep-num" aria-hidden="true">
                            3
                          </span>
                          <div className="connect-prep-copy">
                            <h4>Complete os dados solicitados</h4>
                            <p>
                              A Stripe informa no próprio formulário os dados da clínica, da pessoa
                              responsável e da conta bancária que forem necessários. Senhas,
                              documentos e dados bancários são preenchidos diretamente na Stripe.
                            </p>
                            {testMode ? (
                              <>
                                <p>
                                  Este ambiente é de teste. Use os dados de teste indicados pela
                                  Stripe nos campos de documentos e banco; números aleatórios podem
                                  ser recusados.
                                </p>
                                <Link
                                  className="ob2-areas-link connect-doc-link"
                                  href="https://docs.stripe.com/connect/testing"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Abrir guia de dados de teste da Stripe
                                  <Link.Icon />
                                </Link>
                              </>
                            ) : null}
                          </div>
                        </li>
                      </ol>
                      <p className="connect-prep-foot">
                        Não conseguiu finalizar? Escolha “Receber fora do app” para continuar o
                        cadastro da clínica. Você poderá configurar a Stripe depois, no Financeiro.
                      </p>
                    </div>
                  )}
                </section>
              </>
            )}
            {loading && !flow && (
              <div role="status" className="connect-note is-info">
                <Spinner size="sm" />
                Consultando a situação da sua conta…
              </div>
            )}
            {status && notice && !hub && status.state !== 'not_started' && (!loading || flow) && (
              <div aria-live="polite" className={`connect-state is-${notice}`}>
                <span className="connect-state-icon" aria-hidden="true">
                  {notice === 'approved' ? (
                    <CheckCircle2 size={22} />
                  ) : notice === 'reviewing' ? (
                    <Clock3 size={22} />
                  ) : (
                    <TriangleAlert size={22} />
                  )}
                </span>
                <div>
                  <p className="connect-state-title">
                    {headlines[notice]}
                    {status.testMode ? (
                      <span className="connect-state-tag">Ambiente de testes</span>
                    ) : null}
                  </p>
                  <p>{leads[notice]}</p>
                  {notice === 'approved' && !dashboard ? (
                    <p className="connect-state-more">
                      Depois de concluir o cadastro do espaço, em Financeiro → Receber pelo app você
                      liga o pagamento e vê os próximos passos.
                    </p>
                  ) : null}
                  {notice === 'needs_info' || notice === 'filling' || notice === 'restricted' ? (
                    <button
                      type="button"
                      className="ob2-areas-link connect-text-action"
                      disabled={opening || loading}
                      onClick={() => void open('onboarding')}
                    >
                      {notice === 'restricted'
                        ? 'Ver o que a Stripe informou'
                        : 'Completar cadastro'}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
            {hub && inApp?.guideDone ? (
              <ConnectHub
                enabled={inApp.enabled}
                onToggle={saveInApp}
                onOpen={(purpose) => void open(purpose)}
                disabled={opening}
                packageMode={inApp.packageMode ?? 'clinic_only'}
                onPackageMode={savePackageMode}
              />
            ) : null}
            {hub && inApp && (!inApp.guideDone || guideOpen) ? (
              <ConnectNextSteps
                clinicRef={clinicId}
                enabled={inApp.enabled}
                guideDone={inApp.guideDone}
                onToggle={saveInApp}
                onDone={finishGuide}
                onClose={() => setGuideOpen(false)}
                onOpenPayouts={() => void open('payouts')}
              />
            ) : null}
            {hub && inApp?.guideDone ? (
              <FlowDisclosure
                id="connect-hub-help"
                title="Dúvidas: prazos e taxas"
                hint="Quando o dinheiro chega na conta e quanto a Stripe cobra."
                icon={CircleHelp}
                open={timingOpen}
                onToggle={() => setTimingOpen((value) => !value)}
              >
                <ul className="connect-faq-list">
                  <li>
                    <strong>Pix e boleto · cerca de 2 dias úteis</strong>
                    <span>Taxa da Stripe: Pix 1,19%; boleto R$ 3,45 por boleto pago.</span>
                  </li>
                  <li>
                    <strong>Cartão nacional · cerca de 30 dias</strong>
                    <span>
                      Taxa da Stripe: 3,99% + R$ 0,39. O prazo é da Stripe no Brasil, por causa de
                      contestação e parcelamento; o Luminix não segura o dinheiro.
                    </span>
                  </li>
                  <li>
                    <strong>Depósito · em dia útil</strong>
                    <span>
                      Quando o valor libera, a Stripe envia sozinha para a conta cadastrada.
                    </span>
                  </li>
                  <li>
                    <strong>Reembolso ou contestação</strong>
                    <span>O valor sai do saldo do espaço na Stripe.</span>
                  </li>
                </ul>
                {guideOpen ? null : (
                  <button
                    type="button"
                    className="connect-next-link"
                    onClick={() => setGuideOpen(true)}
                  >
                    Rever o guia &quot;E agora?&quot; →
                  </button>
                )}
              </FlowDisclosure>
            ) : null}
            {error && (
              <p role="alert" className="connect-note is-warn">
                {error}
              </p>
            )}
            {hub ? null : (
              <div className="connect-actions">
                <Button
                  variant={flow ? 'primary' : undefined}
                  className={flow ? 'connect-primary' : undefined}
                  isDisabled={opening || loading}
                  onPress={() => void open('onboarding')}
                >
                  {opening ? (
                    <Spinner size="sm" />
                  ) : (
                    flow && <SquarePen aria-hidden="true" size={18} />
                  )}
                  {opening
                    ? 'Abrindo…'
                    : status?.state === 'active'
                      ? 'Revisar cadastro Stripe'
                      : 'Abrir cadastro Stripe'}
                </Button>
                {showRefresh && (
                  <Button
                    variant={flow ? 'secondary' : 'primary'}
                    className={
                      flow
                        ? 'connect-secondary connect-refresh'
                        : '!bg-blue-600 !text-white hover:!bg-blue-700'
                    }
                    isDisabled={opening || loading}
                    onPress={() => void refresh()}
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={`size-4 ${loading ? 'motion-safe:animate-spin' : ''}`}
                    />
                    Atualizar situação
                  </Button>
                )}
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

function readFormOpened(key: string) {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}
function subscribeFormOpened(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener('luminix-stripe-form-opened', onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener('luminix-stripe-form-opened', onChange)
  }
}
