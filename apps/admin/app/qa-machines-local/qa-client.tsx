'use client'
import { useState } from 'react'
import { Button } from '@heroui/react'
import { CatalogStep } from '@/components/onboarding/steps'
import { SpecialTreatments } from '@/components/onboarding/special-treatments'
import {
  categories,
  serviceFromCatalog,
  servicesInCategory,
  type Payload,
} from '@/components/onboarding/model'
import '../c/[clinicId]/onboarding/onboarding.css'
const initial = {
  clinic: { defaultAudience: 'all' },
  occupations: [...categories],
  services: categories
    .flatMap(servicesInCategory)
    .filter((item) =>
      /microfocado|CO2|laser|ozônio|Carbox|plasma|Pump|Microagulhamento/.test(item.nome),
    )
    .map((item) => serviceFromCatalog(item, 'all')),
  preferences: { specialTreatmentsDismissed: false },
} as Payload
export default function QA() {
  const [payload, setPayload] = useState(initial)
  const [catalog, setCatalog] = useState(false)
  return (
    <main
      className="ob2"
      style={{ padding: 24, minHeight: '100vh', height: 'auto', overflow: 'auto' }}
    >
      <div style={{ maxWidth: 1200, margin: 'auto', display: 'grid', gap: 24 }}>
        <Button onPress={() => setCatalog(!catalog)}>Alternar catálogo</Button>
        {catalog ? (
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
