'use client'
import { useEffect, useState } from 'react'
import { Button } from '@heroui/react'
import {
  CatalogStep,
  ClinicStep,
  ServicesStep,
  TeamStep,
  ScheduleStep,
  PaymentsStep,
} from '@/components/onboarding/steps'
import { OnboardingShell } from '@/components/onboarding/shell'
import { HoursStep } from '@/components/onboarding/hours-editor'
import { ClinicVisualFixture } from '@/components/clinic-workspace'
import { SpaceThemeProvider } from '@/components/space-theme'
import { SpecialTreatments } from '@/components/onboarding/special-treatments'
import { RulesStep, ReviewStep } from '@/components/onboarding/rules-review'
import {
  categories,
  serviceFromCatalog,
  servicesInCategory,
  type Payload,
} from '@/components/onboarding/model'
import '../c/[clinicId]/onboarding/onboarding.css'
const initial = {
  name: 'Espaço de teste',
  ownerName: 'Gestora de teste',
  email: 'teste@example.com',
  phone: '',
  teamMode: 'solo',
  professionals: [],
  businessHours: Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    enabled: weekday > 0 && weekday < 6,
    start: '09:00',
    end: '18:00',
    breaks: [],
  })),
  professionalSchedules: [],
  clinic: {
    defaultAudience: 'all',
    city: 'São Paulo',
    state: 'SP',
    foundedYear: '',
    whatsapp: '',
    instagram: '',
    facebook: '',
    website: '',
    taxId: '',
    addressLine: '',
    addressNumber: '',
    addressDistrict: '',
    addressNote: '',
    postalCode: '',
  },
  occupations: [...categories],
  services: categories
    .flatMap(servicesInCategory)
    .filter((item) =>
      /microfocado|CO2|laser|ozônio|Carbox|plasma|Pump|Microagulhamento/.test(item.nome),
    )
    .map((item) => ({
      ...serviceFromCatalog(item, 'all'),
      ...(item.nome.includes('laser')
        ? { bookingMode: 'manual_release' as const, resourceName: 'Laser alugado' }
        : {}),
    })),
  preferences: {
    specialTreatmentsDismissed: false,
    cancellationHours: 4,
    specialCancellationHours: 24,
    bookingNoticeHours: 1,
    bookingWindowDays: 30,
    reschedulingHours: null,
    acceptInApp: false,
    packagePaymentMode: 'clinic_only',
  },
} satisfies Payload
const views = [
  'space',
  'catalog',
  'services',
  'team',
  'schedule',
  'hours',
  'payments',
  'rules',
  'review',
  'equipment',
  'manager',
] as const
type View = (typeof views)[number]
const labels = [
  'Espaço',
  'Catálogo',
  'Tratamentos',
  'Equipe',
  'Endereço',
  'Horários',
  'Pagamentos',
  'Regras',
  'Revisão',
  'Aparelhos',
  'Painel',
]
function LayoutProbe() {
  const [report, setReport] = useState('Medindo layout…')
  useEffect(() => {
    const measure = () => {
      const root = document.documentElement
      const main = document.querySelector('main.ob2')
      if (!main) return
      const overflow = [...main.querySelectorAll<HTMLElement>('*')].filter((element) => {
        const rect = element.getBoundingClientRect()
        return (
          rect.width > 1 && rect.height > 1 && (rect.right > root.clientWidth + 1 || rect.left < -1)
        )
      })
      const bg = getComputedStyle(main, '::before')
      setReport(
        `${root.clientWidth}px / página ${root.scrollWidth}px / fora: ${overflow.length}${
          overflow.length
            ? ' (' +
              overflow
                .slice(0, 3)
                .map((element) => element.className)
                .join(', ') +
              ')'
            : ''
        } / fundo: ${bg.position} ${bg.top} / overscroll: ${getComputedStyle(root).overscrollBehaviorY}`,
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)
    const main = document.querySelector('main.ob2')
    if (main) observer.observe(main)
    window.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', measure)
    }
  }, [])
  return (
    <output
      style={{ display: 'block', background: '#241020', color: 'white', padding: 8, fontSize: 11 }}
    >
      {report}
    </output>
  )
}

export default function QA({
  embedded = false,
  initialView,
}: {
  embedded?: boolean
  initialView?: string
}) {
  const [payload, setPayload] = useState<Payload>(initial)
  const [view, setView] = useState<View>(views.find((value) => value === initialView) ?? 'space')
  const [width, setWidth] = useState(390)
  if (!embedded)
    return (
      <main style={{ padding: 16, background: '#241020', color: 'white', minHeight: '100vh' }}>
        <p>Prévia local com dados sintéticos. Não enviar imagens ou informações reais.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBlock: 12 }}>
          {views.map((value, index) => (
            <Button key={value} onPress={() => setView(value)} aria-pressed={view === value}>
              {labels[index]}
            </Button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          {[320, 360, 390, 430, 768, 1280].map((value) => (
            <Button key={value} onPress={() => setWidth(value)} aria-pressed={width === value}>
              {value}px
            </Button>
          ))}
        </div>
        <iframe
          key={view}
          title="Prévia responsiva"
          src={view === 'manager' ? '/dashboard' : `/qa-machines-local?embedded=1&view=${view}`}
          style={{
            display: 'block',
            width,
            maxWidth: '100%',
            height: 820,
            marginInline: 'auto',
            border: '1px solid #ffffff55',
            borderRadius: 12,
          }}
        />
      </main>
    )
  const step = Math.min(9, Math.max(1, views.indexOf(view) + 1))
  const props = {
    payload,
    setPayload,
    error: '',
    footer: (
      <Button
        className="ob2-cta"
        fullWidth
        onPress={() => setView(views[Math.min(8, views.indexOf(view) + 1)])}
      >
        Continuar na prévia
      </Button>
    ),
  }
  return (
    <ClinicVisualFixture>
      <SpaceThemeProvider key={payload.clinic.theme} initialTheme={payload.clinic.theme}>
        <OnboardingShell
          step={step}
          availableThrough={9}
          busy={false}
          onBack={() => setView(views[Math.max(0, views.indexOf(view) - 1)])}
          onSelectStep={(value) => setView(views[Math.max(0, value - 1)])}
        >
          {view === 'space' ? (
            <ClinicStep {...props} />
          ) : view === 'catalog' ? (
            <CatalogStep {...props} />
          ) : view === 'services' ? (
            <ServicesStep {...props} />
          ) : view === 'team' ? (
            <TeamStep {...props} />
          ) : view === 'schedule' ? (
            <ScheduleStep {...props} />
          ) : view === 'hours' ? (
            <HoursStep {...props} />
          ) : view === 'payments' ? (
            <PaymentsStep
              {...props}
              clinicId="visual-fixture"
              onReadyChange={() => {}}
              onSettledChange={() => {}}
            />
          ) : view === 'rules' ? (
            <RulesStep {...props} />
          ) : view === 'review' ? (
            <ReviewStep {...props} onEdit={(value) => setView(views[value - 1])} />
          ) : (
            <SpecialTreatments {...props} />
          )}
        </OnboardingShell>
        <LayoutProbe />
      </SpaceThemeProvider>
    </ClinicVisualFixture>
  )
}
