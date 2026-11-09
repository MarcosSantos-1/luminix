'use client'

import { useMemo } from 'react'
import { ManagerHome } from '@/components/manager/manager-home'
import { ClinicSettings } from '@/components/manager/sections/clinic-settings'
import { MediaLibrary } from '@/components/manager/media/media-library'
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
  team: {
    selfMembershipId: 'm-owner',
    clinicHours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      enabled: weekday > 0,
      start: '08:00',
      end: weekday === 6 ? '14:00' : '19:00',
      breaks: [],
    })),
    services: services.map(([id, name, category]) => ({
      id,
      name,
      category,
      sensitive: false,
      audience: 'all',
    })),
    professionals: [
      {
        id: 'b1b2c3d4-0000-4000-8000-000000000001',
        name: 'Joana Lima',
        role: 'Cabeleireira',
        gender: 'female',
        audience: 'all',
        membershipId: 'm-joana',
        photoAssetId: '',
        photoUrl: null,
        serviceIds: [services[0][0], services[1][0]],
        serviceAudiences: {},
        days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          enabled: weekday >= 2 && weekday <= 6,
          start: '09:00',
          end: weekday === 6 ? '14:00' : '18:00',
          breaks: weekday === 6 ? [] : [{ start: '12:00', end: '13:00' }],
        })),
      },
    ],
  },
  staff: {
    members: [
      {
        id: 'm-owner',
        name: 'Maria Aparecida',
        email: 'maria@example.com',
        role: 'owner',
        status: 'active',
        isSelf: true,
        professionalId: null,
        invitedAt: null,
        lastSignInAt: '2026-11-08T12:00:00.000Z',
      },
      {
        id: 'm-joana',
        name: 'Joana Lima',
        email: 'joana@example.com',
        role: 'professional',
        status: 'active',
        isSelf: false,
        professionalId: 'b1b2c3d4-0000-4000-8000-000000000001',
        invitedAt: '2026-11-01T12:00:00.000Z',
        lastSignInAt: '2026-11-07T12:00:00.000Z',
      },
      {
        id: 'm-ana',
        name: 'Ana Recepção',
        email: 'ana@example.com',
        role: 'reception',
        status: 'active',
        isSelf: false,
        professionalId: null,
        invitedAt: '2026-11-08T12:00:00.000Z',
        lastSignInAt: null,
      },
      {
        id: 'm-bia',
        name: 'Bia',
        email: 'bia@example.com',
        role: 'reception',
        status: 'revoked',
        isSelf: false,
        professionalId: null,
        invitedAt: '2026-10-01T12:00:00.000Z',
        lastSignInAt: '2026-10-05T12:00:00.000Z',
      },
    ],
  },
  library: {
    storageReady: true,
    canManage: true,
    usage: { libraryBytes: 48_500_000, otherBytes: 1_200_000, items: 3, trashed: 0 },
    folders: [
      { id: 'f-clients', name: 'Clientes', systemKey: 'clients', count: 0 },
      { id: 'f-ba', name: 'Antes e depois', systemKey: 'before_after', count: 0 },
      { id: 'f-mkt', name: 'Marketing', systemKey: 'marketing', count: 3 },
      { id: 'f-space', name: 'Espaço', systemKey: 'space', count: 0 },
      { id: 'f-team', name: 'Equipe', systemKey: 'team', count: 0 },
      { id: 'f-brides', name: 'Noivas 2026', systemKey: null, count: 0 },
    ],
  },
  'library/items?folder=f-mkt': {
    items: ['demo-hair', 'demo-studio', 'demo-portrait'].map((name, index) => ({
      id: `i-${index}`,
      folderId: 'f-mkt',
      title: ['Coloração cobre', 'Recepção nova', 'Ensaio de penteado'][index],
      createdAt: '2026-11-08T12:00:00.000Z',
      bytes: 420_000,
      thumbUrl: `${web}/clinic/${name}.webp`,
      fullUrl: `${web}/clinic/${name}.webp`,
    })),
  },
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
        if (path.startsWith('library/items') && !fixtures[path]) return { items: [] } as T
        return structuredClone(fixtures[path]) as T
      },
      async put<T>() {
        await wait(600)
        return { saved: true } as T
      },
      async post<T>(path: string) {
        await wait(600)
        return (
          path === 'staff' ? { accountCreated: true, member: { id: 'x' } } : { archived: true }
        ) as T
      },
      async sendAccessEmail() {
        await wait(400)
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
            media={<MediaLibrary clinicId={clinic.id} />}
            shareCode="KW-4374"
            settings={(current, open) => (
              <ClinicSettings
                tab={current}
                onOpen={open}
                clinic={clinic}
                shareCode="KW-4374"
                canContinueOnboarding
                permissions={[
                  'settings:manage',
                  'team:manage',
                  'professional:manage',
                  'clinic:manage',
                ]}
                ownName="Maria Aparecida"
              />
            )}
          />
        )}
      </SpaceThemeProvider>
    </ClinicApiProvider>
  )
}
