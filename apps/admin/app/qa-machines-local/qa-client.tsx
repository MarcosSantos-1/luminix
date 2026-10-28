'use client'
import { useState } from 'react'
import { Button } from '@heroui/react'
import { CatalogStep } from '@/components/onboarding/steps'
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
  businessHours: [],
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
    .map((item) => serviceFromCatalog(item, 'all')),
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
export default function QA() {
  const [payload, setPayload] = useState<Payload>(initial)
  const [catalog, setCatalog] = useState(false)
  const [view, setView] = useState<'equipment' | 'rules' | 'review'>('equipment')
  return (
    <main
      className="ob2"
      style={{ padding: 24, minHeight: '100vh', height: 'auto', overflow: 'auto' }}
    >
      <div style={{ maxWidth: 1200, margin: 'auto', display: 'grid', gap: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Button
            onPress={() => {
              setView('equipment')
              setCatalog(!catalog)
            }}
          >
            Alternar catálogo
          </Button>
          <Button onPress={() => setView('rules')}>Conferir regras</Button>
          <Button onPress={() => setView('review')}>Conferir revisão</Button>
        </div>
        {view === 'rules' ? (
          <RulesStep payload={payload} setPayload={setPayload} error="" footer={null} />
        ) : view === 'review' ? (
          <ReviewStep payload={payload} error="" footer={null} onEdit={() => setView('rules')} />
        ) : catalog ? (
          <CatalogStep payload={payload} setPayload={setPayload} error="" footer={null} />
        ) : (
          <SpecialTreatments payload={payload} setPayload={setPayload} />
        )}
        <p>
          {payload.services.filter((s) => s.bookingMode === 'manual_release').length} serviços com
          aparelho
        </p>
        {payload.services
          .filter((s) => s.name.startsWith('Avaliação'))
          .map((s) => (
            <p key={s.id}>
              {s.name}: {s.priceCents} / {s.priceType}
            </p>
          ))}
      </div>
    </main>
  )
}
