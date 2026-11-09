'use client'

import { useMemo } from 'react'
import { ManagerHome } from '@/components/manager/manager-home'
import { ClinicSettings } from '@/components/manager/sections/clinic-settings'
import { ClinicApiProvider, type ClinicApi } from '@/components/manager/settings/clinic-api'
import { SiteEditor } from '@/components/site-editor/site-editor'
import { SpaceThemeProvider } from '@/components/space-theme'
import '@/app/dashboard/manager.css'

const web = 'http://localhost:3001'
const services = [
  ['a1b2c3d4-0000-4000-8000-000000000001', 'Corte feminino', 'Cabelo', 12000, 'instant'],
  ['a1b2c3d4-0000-4000-8000-000000000002', 'Coloração', 'Cabelo', 25000, 'instant'],
  ['a1b2c3d4-0000-4000-8000-000000000003', 'Limpeza de pele', 'Estética facial', 18000, 'instant'],
  [
    'a1b2c3d4-0000-4000-8000-000000000004',
    'Design de sobrancelhas',
    'Sobrancelhas',
    6000,
    'instant',
  ],
  [
    'a1b2c3d4-0000-4000-8000-000000000005',
    'Laser CO2',
    'Estética avançada',
    90000,
    'manual_release',
  ],
] as const
const fixtures: Record<string, unknown> = {
  profile: {
    clinic: {
      name: 'Studio Lumière',
      slug: 'studio-lumiere',
      status: 'active',
      shareCode: 'KW-4374',
    },
    region: { locale: 'pt-BR', timezone: 'America/Sao_Paulo', currency: 'BRL' },
    profile: {
      name: 'Studio Lumière',
      ownerName: 'Maria Aparecida',
      email: 'maria@example.com',
      phone: '+5511987654321',
      whatsapp: '+5511987654321',
      foundedYear: '2012',
      instagram: '@studiolumiere',
      facebook: '',
      website: '',
      logoAssetId: '',
      logoUrl: null,
      taxId: '•••0001',
      taxIdKind: 'cnpj',
      addressLine: 'Rua Augusta',
      addressNumber: '1500',
      addressDistrict: 'Consolação',
      addressNote: '',
      city: 'São Paulo',
      state: 'SP',
      postalCode: '01304001',
    },
  },
  'booking-rules': {
    acceptInApp: false,
    rules: {
      bookingNoticeHours: 1,
      bookingWindowDays: 30,
      cancellationHours: 4,
      specialCancellationHours: 24,
      reschedulingHours: null,
      clientInstructions: '',
      lateChangeRetentionPercent: 0,
      noShowRetentionPercent: 0,
      depositScope: 'none',
      depositPercent: 20,
      depositThresholdCents: 30000,
    },
    services: services.map(([id, name, category, priceCents, bookingMode]) => ({
      id,
      name,
      category,
      description: '',
      priceCents,
      durationMinutes: 60,
      priceType: 'fixed',
      bookingMode,
      audience: 'all',
      sensitive: false,
      resourceName: '',
      cancellationHours: null,
      depositRequired: false,
      lateChangeRetentionPercent: null,
      noShowRetentionPercent: null,
    })),
  },
  publication: {
    publication: {
      slug: 'studio-lumiere',
      status: 'active',
      enabled: true,
      address: true,
      contacts: true,
    },
  },
  slug: { slug: 'studio-lumiere', previous: ['kw-4374'], suggestion: null },
  overview: {
    services: services.map(([, name, , price]) => ({
      name,
      price_cents: price,
      duration_minutes: 60,
    })),
    professionals: [
      { display_name: 'Maria Aparecida', photo_url: null },
      { display_name: 'Joana Lima', photo_url: null },
    ],
  },
  showcase: {
    showcase: {
      style: 'classic',
      subtitle: 'Beleza e cuidado feitos para você',
      featured: [],
      gallery: ['g1', 'g2'],
    },
    initialHero: 'cabelo',
    services: services.map(([id, name, category]) => ({ id, name, category })),
    photos: [
      { id: 'g1', url: `${web}/clinic/demo-hair.webp` },
      { id: 'g2', url: `${web}/clinic/demo-studio.webp` },
    ],
  },
  'showcase/preview': {
    publication: { enabled: true, address: true, contacts: true },
    clinic: {
      slug: 'studio-lumiere',
      code: 'KW-4374',
      name: 'Studio Lumière',
      theme: 'rosa',
      heroCategory: 'cabelo',
      style: 'classic',
      subtitle: null,
      hidden: [],
      foundedYear: 2012,
      logoUrl: null,
      whatsapp: '+5511987654321',
      instagram: '@studiolumiere',
      facebook: null,
      website: null,
      location: {
        line: 'Rua Augusta',
        number: '1500',
        district: 'Consolação',
        city: 'São Paulo',
        state: 'SP',
        postalCode: '01304001',
      },
      hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        available: weekday > 0,
        periods: weekday > 0 ? [{ start: '09:00', end: '18:00' }] : [],
      })),
      services: services.map(([id, name, category, priceCents, bookingMode]) => ({
        id,
        name,
        category,
        description: null,
        priceCents,
        priceType: 'fixed',
        durationMinutes: 60,
        bookingMode,
      })),
      gallery: [],
      featured: [],
      servicePhotos: [],
    },
  },
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function QASettings({ view, tab }: { view: 'settings' | 'editor'; tab?: string }) {
  const api = useMemo<ClinicApi>(
    () => ({
      ready: true,
      async get<T>(path: string, query?: Record<string, string>) {
        await wait(700)
        if (path === 'slug' && query?.check) {
          const taken = ['lumiere', 'studio'].includes(query.check)
          return {
            ...(fixtures.slug as object),
            check: { slug: query.check, available: !taken, problem: taken ? 'taken' : null },
            suggestion: taken ? `${query.check}-sp` : null,
          } as T
        }
        return structuredClone(fixtures[path]) as T
      },
      async put<T>() {
        await wait(600)
        return { saved: true } as T
      },
      async upload(_kind, file) {
        await wait(500)
        return { id: crypto.randomUUID(), url: URL.createObjectURL(file) }
      },
      async postalCode() {
        await wait(400)
        return {
          street: 'Avenida Paulista',
          district: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
        }
      },
    }),
    [],
  )
  const clinic = {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Studio Lumière',
    slug: 'studio-lumiere',
    status: 'active',
  }
  return (
    <ClinicApiProvider value={api}>
      <SpaceThemeProvider initialTheme="rosa">
        {view === 'editor' ? (
          <SiteEditor clinic={{ ...clinic, theme: 'rosa' }} backHref="/qa-settings-local" />
        ) : (
          <ManagerHome
            clinicName={clinic.name}
            userName="Maria"
            canManageSettings
            initialSection="configuracoes"
            initialSettingsTab={tab}
            shareCode="KW-4374"
            settings={(current, open) => (
              <ClinicSettings
                tab={current}
                onOpen={open}
                clinic={clinic}
                shareCode="KW-4374"
                canContinueOnboarding
              />
            )}
          />
        )}
      </SpaceThemeProvider>
    </ClinicApiProvider>
  )
}
